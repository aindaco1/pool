import { getScopedConsole } from './logger.js';

const CACHE_TTL = 60 * 1000;
const ADD_ON_INVENTORY_CACHE_TTL = 60 * 1000;
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

function buildConfiguredInventorySnapshot(catalog = {}) {
  const products = {};

  for (const product of catalog.products || []) {
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    const productState = {
      inventory: getConfiguredInventory(product),
      sold: 0,
      remaining: getConfiguredInventory(product),
      available: true,
      soldOut: false,
      variants: {}
    };

    if (variants.length > 0) {
      let totalInventory = 0;
      let hasTotalInventory = false;
      for (const variant of variants) {
        const inventory = getConfiguredInventory(variant);
        if (inventory !== null) {
          totalInventory += inventory;
          hasTotalInventory = true;
        }
        productState.variants[String(variant?.id || '')] = {
          inventory,
          sold: 0,
          remaining: inventory,
          available: inventory === null ? true : inventory > 0,
          soldOut: inventory === null ? false : inventory <= 0
        };
      }
      productState.inventory = hasTotalInventory ? totalInventory : productState.inventory;
      productState.remaining = productState.inventory;
      productState.available = Object.values(productState.variants).some((variant) => variant.available);
      productState.soldOut = !productState.available;
    } else {
      productState.available = productState.inventory === null ? true : productState.inventory > 0;
      productState.soldOut = productState.inventory === null ? false : productState.inventory <= 0;
    }

    products[String(product?.id || '')] = productState;
  }

  return {
    lowStockThreshold: Math.max(0, Number(catalog?.low_stock_threshold ?? 5) || 5),
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
  const snapshot = buildConfiguredInventorySnapshot(catalog);
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
