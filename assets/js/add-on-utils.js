(function () {
  'use strict';

  const ADD_ON_INVENTORY_CACHE_KEY = 'pool_add_on_inventory';

  function getCatalog(config) {
    const source = config || window.POOL_CONFIG?.addOns || {};
    return {
      enabled: source?.enabled === true,
      lowStockThreshold: Math.max(0, Number(source?.low_stock_threshold ?? source?.lowStockThreshold ?? 5) || 5),
      products: Array.isArray(source?.products) ? source.products : []
    };
  }

  function getLowStockThreshold(config) {
    return getCatalog(config).lowStockThreshold;
  }

  function getShippingPresets() {
    const presets = window.POOL_CONFIG?.shipping?.presets;
    return presets && typeof presets === 'object' ? presets : {};
  }

  function resolveProductShipping(product) {
    if (product?.shipping && typeof product.shipping === 'object') {
      return product.shipping;
    }

    const presetName = String(product?.shipping_preset || '').trim();
    if (!presetName) return null;

    const presets = getShippingPresets();
    const preset = presets?.[presetName];
    return preset && typeof preset === 'object' ? preset : null;
  }

  function getSelectionKey(selection) {
    const productId = String(selection?.productId || '').trim();
    const variantId = String(selection?.variantId || '').trim();
    return `${productId}::${variantId}`;
  }

  function findProduct(catalog, productId) {
    return getCatalog(catalog).products.find((product) => String(product?.id || '') === String(productId || '')) || null;
  }

  function findVariant(product, variantId) {
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    return variants.find((variant) => String(variant?.id || '') === String(variantId || '')) || null;
  }

  function getConfiguredInventory(entry) {
    const parsed = Number(entry?.inventory);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
  }

  function normalizeSelection(selection, catalog) {
    const product = findProduct(catalog, selection?.productId);
    if (!product) return null;

    const quantity = Math.max(0, Number(selection?.quantity || 0));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return null;
    }

    const variants = Array.isArray(product.variants) ? product.variants : [];
    let variantId = String(selection?.variantId || '').trim();
    let variantLabel = String(selection?.variantLabel || '').trim();
    if (variants.length > 0) {
      const variant = findVariant(product, variantId);
      if (!variant) return null;
      variantId = String(variant.id || '');
      variantLabel = String(variant.label || variantId);
    } else {
      variantId = '';
      variantLabel = '';
    }

    return {
      productId: String(product.id || ''),
      name: String(product.name || ''),
      description: String(product.description || ''),
      imageUrl: String(product.image_url || ''),
      sourceUrl: String(product.source_url || ''),
      quantity,
      unitPrice: Math.round(Number(product.price || 0) * 100),
      category: String(product.category || 'digital'),
      shipping_preset: product.shipping_preset || null,
      shipping: resolveProductShipping(product),
      variantOptionName: String(product.variant_option_name || ''),
      variantId,
      variantLabel
    };
  }

  function normalizeSelections(selections, catalog) {
    const normalized = (Array.isArray(selections) ? selections : [])
      .map((selection) => normalizeSelection(selection, catalog))
      .filter(Boolean);

    normalized.sort((a, b) => (
      a.productId.localeCompare(b.productId) ||
      a.variantId.localeCompare(b.variantId)
    ));

    return normalized;
  }

  function flattenCatalogOptions(catalog) {
    return getCatalog(catalog).products.flatMap((product) => {
      const variants = Array.isArray(product?.variants) ? product.variants : [];
      if (variants.length === 0) {
        return [{
          productId: String(product.id || ''),
          variantId: '',
          variantLabel: '',
          key: getSelectionKey({ productId: product.id, variantId: '' }),
          name: String(product.name || ''),
          description: String(product.description || ''),
          imageUrl: String(product.image_url || ''),
          unitPrice: Math.round(Number(product.price || 0) * 100),
          category: String(product.category || 'digital'),
          sourceUrl: String(product.source_url || '')
        }];
      }

      return variants.map((variant) => ({
        productId: String(product.id || ''),
        variantId: String(variant?.id || ''),
        variantLabel: String(variant?.label || variant?.id || ''),
        key: getSelectionKey({ productId: product.id, variantId: variant?.id }),
        name: String(product.name || ''),
        description: String(product.description || ''),
        imageUrl: String(product.image_url || ''),
        unitPrice: Math.round(Number(product.price || 0) * 100),
        category: String(product.category || 'digital'),
        sourceUrl: String(product.source_url || '')
      }));
    });
  }

  function getSelectionQuantityMap(selections, catalog) {
    const map = new Map();
    normalizeSelections(selections, catalog).forEach((selection) => {
      map.set(getSelectionKey(selection), selection.quantity);
    });
    return map;
  }

  function getOptionLabel(option) {
    if (!option) return '';
    return option.variantLabel ? `${option.name} (${option.variantLabel})` : String(option.name || '');
  }

  function buildSelectionEntries(selections, catalog) {
    return normalizeSelections(selections, catalog).map((selection) => ({
      productId: selection.productId,
      variantId: selection.variantId,
      variantLabel: selection.variantLabel,
      quantity: Math.max(1, Number(selection.quantity || 1)),
      category: selection.category || 'digital',
      name: selection.name,
      description: selection.description,
      imageUrl: selection.imageUrl,
      sourceUrl: selection.sourceUrl,
      unitPrice: selection.unitPrice,
      shipping: selection.shipping || null,
      shipping_preset: selection.shipping_preset || null
    }));
  }

  function buildProductStateEntries(catalog, selections, inventorySnapshot) {
    const resolvedCatalog = getCatalog(catalog);
    const threshold = getLowStockThreshold(resolvedCatalog);
    const selectedEntries = buildSelectionEntries(selections, resolvedCatalog);
    const selectedByProduct = new Map();
    selectedEntries.forEach((entry) => {
      if (!selectedByProduct.has(entry.productId)) {
        selectedByProduct.set(entry.productId, entry);
      }
    });

    return resolvedCatalog.products.map((product) => {
      const selected = selectedByProduct.get(String(product?.id || '')) || null;
      const snapshot = inventorySnapshot?.products?.[product?.id] || {};
      const variants = Array.isArray(product?.variants) ? product.variants : [];
      const hasVariants = variants.length > 0;

      const variantStates = variants.map((variant) => {
        const variantId = String(variant?.id || '');
        const variantSnapshot = snapshot?.variants?.[variantId] || {};
        const configuredInventory = getConfiguredInventory(variant);
        const sold = Math.max(0, Number(variantSnapshot?.sold || 0));
        const remaining = variantSnapshot?.remaining === null || variantSnapshot?.remaining === undefined
          ? configuredInventory
          : (Number.isFinite(Number(variantSnapshot.remaining))
            ? Math.max(0, Number(variantSnapshot.remaining))
            : configuredInventory);
        const selectedQuantity = selected?.variantId === variantId ? Math.max(1, Number(selected.quantity || 1)) : 0;
        const maxQuantity = remaining;
        const editableMaxQuantity = remaining === null ? null : remaining + selectedQuantity;
        const available = maxQuantity === null ? true : maxQuantity > 0;
        return {
          id: variantId,
          label: String(variant?.label || variantId),
          inventory: configuredInventory,
          sold,
          remaining,
          maxQuantity,
          editableMaxQuantity,
          selected: selected?.variantId === variantId,
          available,
          lowStock: available && maxQuantity !== null && maxQuantity <= threshold
        };
      }).filter((variant) => variant.available || variant.selected);

      const defaultVariant = hasVariants
        ? (variantStates.find((variant) => variant.selected) || variantStates[0] || null)
        : null;

      const configuredInventory = getConfiguredInventory(product);
      const sold = Math.max(0, Number(snapshot?.sold || 0));
      const remaining = snapshot?.remaining === null || snapshot?.remaining === undefined
        ? configuredInventory
        : (Number.isFinite(Number(snapshot.remaining))
          ? Math.max(0, Number(snapshot.remaining))
          : configuredInventory);
      const selectedQuantity = !hasVariants && selected ? Math.max(1, Number(selected.quantity || 1)) : 0;
      const maxQuantity = hasVariants
        ? (defaultVariant?.maxQuantity ?? null)
        : remaining;
      const editableMaxQuantity = hasVariants
        ? (defaultVariant?.editableMaxQuantity ?? null)
        : (remaining === null ? null : remaining + selectedQuantity);
      const available = hasVariants
        ? variantStates.length > 0
        : (maxQuantity === null ? true : maxQuantity > 0);

      return {
        productId: String(product?.id || ''),
        name: String(product?.name || ''),
        description: String(product?.description || ''),
        imageUrl: String(product?.image_url || ''),
        sourceUrl: String(product?.source_url || ''),
        priceCents: Math.round(Number(product?.price || 0) * 100),
        category: String(product?.category || 'digital'),
        variantOptionName: String(product?.variant_option_name || 'Option'),
        inventory: configuredInventory,
        sold,
        remaining,
        maxQuantity,
        editableMaxQuantity,
        available,
        lowStock: !hasVariants && available && maxQuantity !== null && maxQuantity <= threshold,
        selectedQuantity: Math.max(1, Number(selected?.quantity || 1)),
        selectedVariantId: hasVariants ? String(selected?.variantId || defaultVariant?.id || '') : '',
        selectedVariantLabel: hasVariants ? String(selected?.variantLabel || defaultVariant?.label || '') : '',
        shipping_preset: product?.shipping_preset || null,
        shipping: resolveProductShipping(product),
        inCart: !!selected,
        variants: variantStates
      };
    }).filter((product) => product.available || product.inCart);
  }

  function getSubtotal(selections, catalog) {
    return buildSelectionEntries(selections, catalog).reduce((sum, selection) => (
      sum + (Math.max(1, Number(selection.quantity || 1)) * Math.max(0, Number(selection.unitPrice || 0)))
    ), 0);
  }

  function haveSelectionsChanged(originalSelections, nextSelections, catalog) {
    const original = buildSelectionEntries(originalSelections, catalog);
    const next = buildSelectionEntries(nextSelections, catalog);
    if (original.length !== next.length) return true;
    return original.some((selection, index) => {
      const other = next[index];
      return !other ||
        selection.productId !== other.productId ||
        selection.variantId !== other.variantId ||
        selection.quantity !== other.quantity;
    });
  }

  function selectionFromCartItem(item, catalog) {
    const rawId = String(item?.id || '').trim();
    if (!rawId.startsWith('addon__')) return null;

    const match = rawId.match(/^addon__(.+?)(?:__variant__(.+))?$/);
    if (!match) return null;

    return normalizeSelection({
      productId: String(match[1] || ''),
      variantId: String(match[2] || ''),
      quantity: Math.max(1, Number(item?.quantity || 1))
    }, catalog);
  }

  function selectionsFromCartItems(items, catalog) {
    return (Array.isArray(items) ? items : [])
      .map((item) => selectionFromCartItem(item, catalog))
      .filter(Boolean)
      .sort((a, b) => (
        a.productId.localeCompare(b.productId) ||
        a.variantId.localeCompare(b.variantId)
      ));
  }

  function buildCartItem(selection, catalog) {
    const normalized = normalizeSelection(selection, catalog);
    if (!normalized) return null;

    const itemId = normalized.variantId
      ? `addon__${normalized.productId}__variant__${normalized.variantId}`
      : `addon__${normalized.productId}`;

    const customFields = [];
    if (normalized.variantId) {
      customFields.push({ name: '_variant_id', value: normalized.variantId });
    }
    if (normalized.variantLabel) {
      customFields.push({ name: '_variant_label', value: normalized.variantLabel });
    }
    if (normalized.category) {
      customFields.push({ name: '_category', value: normalized.category });
    }

    return {
      id: itemId,
      uniqueId: itemId,
      name: normalized.name,
      description: normalized.description,
      imageUrl: normalized.imageUrl,
      url: normalized.sourceUrl || '/',
      price: normalized.unitPrice / 100,
      quantity: normalized.quantity,
      stackable: true,
      shippable: normalized.category === 'physical',
      customFields
    };
  }

  function invalidateCachedInventory() {
    try {
      localStorage.removeItem(ADD_ON_INVENTORY_CACHE_KEY);
    } catch (_error) {}

    document.dispatchEvent(new CustomEvent('pool:add-on-inventory-invalidated'));
  }

  window.PoolAddOnUtils = {
    ADD_ON_INVENTORY_CACHE_KEY,
    getCatalog,
    getLowStockThreshold,
    findProduct,
    findVariant,
    getSelectionKey,
    getOptionLabel,
    normalizeSelection,
    normalizeSelections,
    flattenCatalogOptions,
    getSelectionQuantityMap,
    buildSelectionEntries,
    buildProductStateEntries,
    getSubtotal,
    haveSelectionsChanged,
    selectionFromCartItem,
    selectionsFromCartItems,
    buildCartItem,
    resolveProductShipping,
    invalidateCachedInventory
  };
})();
