import { getScopedConsole } from './logger.js';

const CACHE_TTL = 60 * 1000;
const ADD_ON_INVENTORY_CACHE_TTL = 60 * 1000;
const ADD_ON_INVENTORY_OVERRIDES_KEY = 'add-on-inventory-overrides';
let console = globalThis.console;
const addOnCatalogCacheByEnv = new WeakMap();
const addOnInventoryCacheByEnv = new WeakMap();
let fallbackAddOnCatalog = null;

function configureAddOnLogging(env) {
  console = getScopedConsole(env, 'add-ons');
}

export async function getAddOns(env) {
  configureAddOnLogging(env);

  const now = Date.now();
  const cachedEntry = addOnCatalogCacheByEnv.get(env);
  if (cachedEntry && (now - cachedEntry.time) < CACHE_TTL) {
    return cachedEntry.data;
  }

  try {
    const res = await fetch(`${env.SITE_BASE}/api/add-ons.json`);
    if (!res.ok) {
      console.error('Failed to fetch add-ons:', res.status);
      return fallbackAddOnCatalog || { enabled: false, products: [] };
    }

    const data = await res.json();
    addOnCatalogCacheByEnv.set(env, { data, time: now });
    fallbackAddOnCatalog = data;
    return data;
  } catch (err) {
    console.error('Error fetching add-ons:', err);
    return fallbackAddOnCatalog || { enabled: false, products: [] };
  }
}

export async function getAddOnProduct(env, productId) {
  const data = await getAddOns(env);
  return (data.products || []).find((product) => product.id === productId) || null;
}

function getConfiguredInventory(entry) {
  const parsed = Number(entry?.inventory);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function normalizeInventoryOverrides(value) {
  const products = {};
  const sourceProducts = value?.products && typeof value.products === 'object'
    ? value.products
    : {};

  for (const [productId, productOverride] of Object.entries(sourceProducts)) {
    const normalizedProductId = String(productId || '').trim();
    if (!normalizedProductId || !productOverride || typeof productOverride !== 'object') continue;

    const entry = { variants: {} };
    const productInventory = getConfiguredInventory(productOverride);
    if (productInventory !== null) {
      entry.inventory = productInventory;
    }

    const variantOverrides = productOverride.variants && typeof productOverride.variants === 'object'
      ? productOverride.variants
      : {};
    for (const [variantId, variantOverride] of Object.entries(variantOverrides)) {
      const normalizedVariantId = String(variantId || '').trim();
      const variantInventory = getConfiguredInventory(variantOverride);
      if (!normalizedVariantId || variantInventory === null) continue;
      entry.variants[normalizedVariantId] = { inventory: variantInventory };
    }

    if (entry.inventory !== undefined || Object.keys(entry.variants).length > 0) {
      products[normalizedProductId] = entry;
    }
  }

  return {
    products,
    updatedAt: value?.updatedAt || null
  };
}

function hasInventoryOverrides(overrides = {}) {
  return Object.values(overrides.products || {}).some((entry) => (
    entry?.inventory !== undefined ||
    Object.keys(entry?.variants || {}).length > 0
  ));
}

async function getAddOnInventoryOverrides(env) {
  if (!env?.PLEDGES) return normalizeInventoryOverrides({});
  const stored = await env.PLEDGES.get(ADD_ON_INVENTORY_OVERRIDES_KEY, { type: 'json' });
  return normalizeInventoryOverrides(stored || {});
}

async function persistAddOnInventoryOverrides(env, overrides) {
  if (!env?.PLEDGES) {
    throw new Error('PLEDGES KV not configured');
  }

  const normalized = normalizeInventoryOverrides({
    ...overrides,
    updatedAt: new Date().toISOString()
  });

  if (!hasInventoryOverrides(normalized)) {
    await env.PLEDGES.delete(ADD_ON_INVENTORY_OVERRIDES_KEY);
    return { storageWrite: true, overrides: normalizeInventoryOverrides({}) };
  }

  await env.PLEDGES.put(ADD_ON_INVENTORY_OVERRIDES_KEY, JSON.stringify(normalized));
  return { storageWrite: true, overrides: normalized };
}

function getOverrideInventory(entry = {}) {
  return entry && Object.prototype.hasOwnProperty.call(entry, 'inventory')
    ? getConfiguredInventory(entry)
    : null;
}

function buildInventoryState(entry, overrideEntry = {}) {
  const configuredInventory = getConfiguredInventory(entry);
  const overrideInventory = getOverrideInventory(overrideEntry);
  const hasOverride = overrideInventory !== null;
  const inventory = hasOverride ? overrideInventory : configuredInventory;
  return {
    configuredInventory,
    overrideInventory: hasOverride ? overrideInventory : null,
    hasOverride,
    inventory,
    sold: 0,
    remaining: inventory,
    available: inventory === null ? true : inventory > 0,
    soldOut: inventory === null ? false : inventory <= 0
  };
}

function buildConfiguredInventorySnapshot(catalog = {}, overrides = {}) {
  const products = {};
  const overrideProducts = overrides?.products || {};

  for (const product of catalog.products || []) {
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    const productId = String(product?.id || '');
    const productOverride = overrideProducts[productId] || {};
    const productState = {
      ...buildInventoryState(product, productOverride),
      scope: String(product?.scope || 'platform'),
      variants: {}
    };

    if (variants.length > 0) {
      let totalInventory = 0;
      let hasTotalInventory = false;
      let configuredTotalInventory = 0;
      let hasConfiguredTotalInventory = false;
      let hasVariantOverride = false;
      for (const variant of variants) {
        const variantId = String(variant?.id || '');
        const variantState = buildInventoryState(variant, productOverride?.variants?.[variantId] || {});
        const inventory = variantState.inventory;
        const configuredInventory = variantState.configuredInventory;
        if (inventory !== null) {
          totalInventory += inventory;
          hasTotalInventory = true;
        }
        if (configuredInventory !== null) {
          configuredTotalInventory += configuredInventory;
          hasConfiguredTotalInventory = true;
        }
        if (variantState.hasOverride) {
          hasVariantOverride = true;
        }
        productState.variants[variantId] = variantState;
      }
      productState.inventory = hasTotalInventory ? totalInventory : productState.inventory;
      productState.configuredInventory = hasConfiguredTotalInventory ? configuredTotalInventory : productState.configuredInventory;
      productState.hasOverride = productState.hasOverride || hasVariantOverride;
      productState.remaining = productState.inventory;
      productState.available = Object.values(productState.variants).some((variant) => variant.available);
      productState.soldOut = !productState.available;
    } else {
      productState.available = productState.inventory === null ? true : productState.inventory > 0;
      productState.soldOut = productState.inventory === null ? false : productState.inventory <= 0;
    }

    products[productId] = productState;
  }

  return {
    lowStockThreshold: Math.max(0, Number(catalog?.low_stock_threshold ?? 5) || 5),
    overridesUpdatedAt: overrides?.updatedAt || null,
    products
  };
}

async function listAllPledges(env) {
  if (!env?.PLEDGES) return [];
  const pledges = [];
  let cursor;
  let listComplete = false;

  while (!listComplete) {
    const page = await env.PLEDGES.list({ prefix: 'pledge:', cursor });
    for (const key of page.keys || []) {
      const pledge = await env.PLEDGES.get(key.name, { type: 'json' });
      if (pledge) {
        pledges.push(pledge);
      }
    }
    listComplete = page.list_complete !== false;
    cursor = page.cursor;
  }

  return pledges;
}

function applySoldSelections(snapshot, selections = []) {
  for (const selection of selections || []) {
    const productId = String(selection?.productId || '');
    const variantId = String(selection?.variantId || '');
    const quantity = Math.max(0, Number(selection?.quantity || 0));
    if (!productId || quantity <= 0) continue;

    const productState = snapshot.products?.[productId];
    if (!productState) continue;

    productState.sold += quantity;
    if (productState.inventory !== null) {
      productState.remaining = Math.max(0, productState.inventory - productState.sold);
    }

    if (variantId && productState.variants?.[variantId]) {
      const variantState = productState.variants[variantId];
      variantState.sold += quantity;
      if (variantState.inventory !== null) {
        variantState.remaining = Math.max(0, variantState.inventory - variantState.sold);
      }
      variantState.available = variantState.remaining === null ? true : variantState.remaining > 0;
      variantState.soldOut = variantState.remaining === null ? false : variantState.remaining <= 0;
    }
  }
}

function finalizeAvailability(snapshot) {
  for (const productState of Object.values(snapshot.products || {})) {
    const variantStates = Object.values(productState.variants || {});
    if (variantStates.length > 0) {
      productState.available = variantStates.some((variant) => variant.available);
      productState.soldOut = !productState.available;
    } else {
      productState.available = productState.remaining === null ? true : productState.remaining > 0;
      productState.soldOut = productState.remaining === null ? false : productState.remaining <= 0;
    }
  }
  return snapshot;
}

export async function getAddOnInventorySnapshot(env, { force = false } = {}) {
  configureAddOnLogging(env);

  const now = Date.now();
  const cachedEntry = addOnInventoryCacheByEnv.get(env);
  if (!force && cachedEntry && (now - cachedEntry.time) < ADD_ON_INVENTORY_CACHE_TTL) {
    return cachedEntry.data;
  }

  const catalog = await getAddOns(env);
  const overrides = await getAddOnInventoryOverrides(env);
  const snapshot = buildConfiguredInventorySnapshot(catalog, overrides);
  const pledges = await listAllPledges(env);

  for (const pledge of pledges) {
    if (!pledge || pledge.pledgeStatus === 'cancelled') continue;
    applySoldSelections(snapshot, pledge.bundleAddOns || []);
  }

  const data = {
    ...finalizeAvailability(snapshot),
    updatedAt: new Date().toISOString()
  };
  addOnInventoryCacheByEnv.set(env, { data, time: now });
  return data;
}

export function invalidateAddOnInventorySnapshot(env) {
  if (!env) return;
  addOnInventoryCacheByEnv.delete(env);
}

function sanitizeInventoryMutationInteger(value, fieldName, { allowZero = true } = {}) {
  const parsed = Number(value);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isFinite(parsed) || parsed < minimum || Math.floor(parsed) !== parsed) {
    throw new Error(`${fieldName} must be ${allowZero ? 'a non-negative' : 'a positive'} integer`);
  }
  return parsed;
}

function findInventoryTarget(catalog = {}, productId, variantId = '') {
  const product = (catalog.products || []).find((entry) => String(entry?.id || '') === String(productId || ''));
  if (!product) {
    throw new Error('Add-on product not found');
  }

  if (String(product.scope || 'platform') !== 'platform') {
    throw new Error('Only platform add-ons can be managed here');
  }

  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length > 0) {
    const variant = variants.find((entry) => String(entry?.id || '') === String(variantId || ''));
    if (!variant) {
      throw new Error('A valid variant is required for this add-on');
    }
    return {
      product,
      variant,
      productId: String(product.id || ''),
      variantId: String(variant.id || ''),
      label: `${String(product.name || product.id)} (${String(variant.label || variant.id)})`
    };
  }

  return {
    product,
    variant: null,
    productId: String(product.id || ''),
    variantId: '',
    label: String(product.name || product.id)
  };
}

function getSnapshotTarget(snapshot, productId, variantId = '') {
  const productState = snapshot?.products?.[productId] || null;
  if (!productState) return null;
  return variantId ? productState.variants?.[variantId] || null : productState;
}

function setOverrideInventory(overrides, productId, variantId, inventory) {
  const next = normalizeInventoryOverrides(overrides);
  const productOverride = next.products[productId] || { variants: {} };
  productOverride.variants = productOverride.variants || {};

  if (variantId) {
    productOverride.variants[variantId] = { inventory };
  } else {
    productOverride.inventory = inventory;
  }

  next.products[productId] = productOverride;
  return next;
}

function resetOverrideInventory(overrides, productId, variantId) {
  const next = normalizeInventoryOverrides(overrides);
  const productOverride = next.products[productId];
  if (!productOverride) return next;

  if (variantId) {
    delete productOverride.variants?.[variantId];
  } else {
    delete productOverride.inventory;
  }

  if (productOverride.inventory === undefined && Object.keys(productOverride.variants || {}).length === 0) {
    delete next.products[productId];
  } else {
    next.products[productId] = productOverride;
  }

  return next;
}

export async function mutateAddOnInventoryOverride(env, mutation = {}) {
  configureAddOnLogging(env);
  if (!env?.PLEDGES) {
    throw new Error('PLEDGES KV not configured');
  }

  const action = String(mutation.action || '').trim().toLowerCase();
  if (!['set', 'restock', 'reset'].includes(action)) {
    throw new Error('Unsupported inventory action');
  }

  const catalog = await getAddOns(env);
  const target = findInventoryTarget(catalog, mutation.productId, mutation.variantId);
  const beforeSnapshot = await getAddOnInventorySnapshot(env, { force: true });
  const before = getSnapshotTarget(beforeSnapshot, target.productId, target.variantId);
  if (!before) {
    throw new Error('Inventory target not found');
  }

  const currentInventory = before.inventory === null || before.inventory === undefined
    ? null
    : sanitizeInventoryMutationInteger(before.inventory, 'Current inventory');
  const configuredInventory = before.configuredInventory === null || before.configuredInventory === undefined
    ? null
    : sanitizeInventoryMutationInteger(before.configuredInventory, 'Configured inventory');
  let nextInventory = configuredInventory;

  if (action === 'set') {
    nextInventory = sanitizeInventoryMutationInteger(mutation.inventory, 'Inventory');
  } else if (action === 'restock') {
    if (currentInventory === null) {
      throw new Error('Unlimited inventory cannot be restocked');
    }
    nextInventory = currentInventory + sanitizeInventoryMutationInteger(mutation.quantity, 'Restock quantity', { allowZero: false });
  }

  const overrides = await getAddOnInventoryOverrides(env);
  const nextOverrides = action === 'reset' || nextInventory === configuredInventory
    ? resetOverrideInventory(overrides, target.productId, target.variantId)
    : setOverrideInventory(overrides, target.productId, target.variantId, nextInventory);

  const persistResult = await persistAddOnInventoryOverrides(env, nextOverrides);
  invalidateAddOnInventorySnapshot(env);
  const afterSnapshot = await getAddOnInventorySnapshot(env, { force: true });
  const after = getSnapshotTarget(afterSnapshot, target.productId, target.variantId);

  return {
    action,
    productId: target.productId,
    variantId: target.variantId,
    label: target.label,
    before: {
      configuredInventory: before.configuredInventory,
      inventory: before.inventory,
      overrideInventory: before.overrideInventory,
      sold: before.sold,
      remaining: before.remaining,
      hasOverride: Boolean(before.hasOverride)
    },
    after: {
      configuredInventory: after?.configuredInventory ?? null,
      inventory: after?.inventory ?? null,
      overrideInventory: after?.overrideInventory ?? null,
      sold: after?.sold ?? 0,
      remaining: after?.remaining ?? null,
      hasOverride: Boolean(after?.hasOverride)
    },
    storageWrite: persistResult.storageWrite,
    overridesUpdatedAt: afterSnapshot.overridesUpdatedAt || null
  };
}
