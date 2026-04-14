(function() {
'use strict';

  const DEFAULT_RUNTIME = 'first_party';
  const DEFAULT_CHECKOUT_PROVIDER = 'first_party';
  const FIRST_PARTY_RUNTIME = 'first_party';
  const FIRST_PARTY_CHECKOUT_PROVIDER = 'first_party';
  const FIRST_PARTY_CART_TOKEN_PREFIX = 'poolcart_';
  const FIRST_PARTY_ITEM_ID_PREFIX = 'poolitem_';
  const FIRST_PARTY_CHECKOUT_SNAPSHOT_KEY = 'pool_first_party_checkout_snapshot';
  const ACTIVE_CUSTOM_CHECKOUT_ORDER_ID_KEY = 'pool_active_custom_checkout_order_id';
  const FIRST_PARTY_CART_STATE_KEY = 'pool_first_party_cart_state';
  const FIRST_PARTY_CART_DRAFT_KEY = 'pool_first_party_cart_draft';
  const PENDING_PLEDGE_KEY = 'pool_pending_pledge';
  const LIVE_REFRESH_MARKER_KEY = 'pool_live_refresh_needed';
  const ADD_ON_ITEM_PREFIX = 'addon__';
  const CART_VIEW_ROUTE = '/cart';
  const CHECKOUT_VIEW_ROUTE = '/checkout';
  const DEFAULT_WORKER_BASE = 'https://pledge.dustwave.xyz';
  const DEFAULT_CHECKOUT_UI_MODE = 'custom';
  const DEFAULT_PLATFORM_TIP_PERCENT = 5;
  const MAX_PLATFORM_TIP_PERCENT = 15;
  const FIRST_PARTY_CHECKOUT_SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;
  const ACTIVE_CUSTOM_CHECKOUT_ORDER_ID_TTL_MS = 30 * 60 * 1000;
  const PENDING_PLEDGE_TTL_MS = 30 * 60 * 1000;
  const FIRST_PARTY_CART_DRAFT_TTL_MS = 12 * 60 * 60 * 1000;
  const LIVE_REFRESH_MARKER_TTL_MS = 10 * 60 * 1000;
  const DEFAULT_PLATFORM_NAME = 'The Pool';
  const DEFAULT_FLAT_SHIPPING_RATE = 3;
  const DEFAULT_SALES_TAX_RATE = 0.07875;
  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'iframe',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ');
  const DEFAULT_SHIPPING_COUNTRY = 'US';
  // USPS-derived checkout destinations, excluding countries on the current USPS temporary suspension notice.
  const SHIPPING_COUNTRY_OPTIONS = [
    { value: 'US', label: 'United States' },
    { value: 'AD', label: 'Andorra' },
    { value: 'AE', label: 'United Arab Emirates' },
    { value: 'AR', label: 'Argentina' },
    { value: 'AT', label: 'Austria' },
    { value: 'CA', label: 'Canada' },
    { value: 'AU', label: 'Australia' },
    { value: 'BD', label: 'Bangladesh' },
    { value: 'BE', label: 'Belgium' },
    { value: 'BH', label: 'Bahrain' },
    { value: 'BO', label: 'Bolivia' },
    { value: 'BR', label: 'Brazil' },
    { value: 'BS', label: 'Bahamas' },
    { value: 'BW', label: 'Botswana' },
    { value: 'BZ', label: 'Belize' },
    { value: 'CH', label: 'Switzerland' },
    { value: 'CL', label: 'Chile' },
    { value: 'CN', label: 'China' },
    { value: 'CO', label: 'Colombia' },
    { value: 'CY', label: 'Cyprus' },
    { value: 'CZ', label: 'Czech Republic' },
    { value: 'DE', label: 'Germany' },
    { value: 'DK', label: 'Denmark' },
    { value: 'DO', label: 'Dominican Republic' },
    { value: 'DZ', label: 'Algeria' },
    { value: 'EC', label: 'Ecuador' },
    { value: 'EE', label: 'Estonia' },
    { value: 'EG', label: 'Egypt' },
    { value: 'ES', label: 'Spain' },
    { value: 'FI', label: 'Finland' },
    { value: 'FR', label: 'France' },
    { value: 'GB', label: 'United Kingdom' },
    { value: 'GH', label: 'Ghana' },
    { value: 'GI', label: 'Gibraltar' },
    { value: 'GR', label: 'Greece' },
    { value: 'HK', label: 'Hong Kong' },
    { value: 'HR', label: 'Croatia' },
    { value: 'HU', label: 'Hungary' },
    { value: 'ID', label: 'Indonesia' },
    { value: 'IE', label: 'Ireland' },
    { value: 'IL', label: 'Israel' },
    { value: 'IN', label: 'India' },
    { value: 'IS', label: 'Iceland' },
    { value: 'IT', label: 'Italy' },
    { value: 'JM', label: 'Jamaica' },
    { value: 'JP', label: 'Japan' },
    { value: 'JO', label: 'Jordan' },
    { value: 'KE', label: 'Kenya' },
    { value: 'KR', label: 'South Korea' },
    { value: 'KW', label: 'Kuwait' },
    { value: 'KZ', label: 'Kazakhstan' },
    { value: 'LB', label: 'Lebanon' },
    { value: 'LI', label: 'Liechtenstein' },
    { value: 'LK', label: 'Sri Lanka' },
    { value: 'LT', label: 'Lithuania' },
    { value: 'LU', label: 'Luxembourg' },
    { value: 'LV', label: 'Latvia' },
    { value: 'MA', label: 'Morocco' },
    { value: 'MC', label: 'Monaco' },
    { value: 'MD', label: 'Moldova' },
    { value: 'ME', label: 'Montenegro' },
    { value: 'MK', label: 'North Macedonia' },
    { value: 'MT', label: 'Malta' },
    { value: 'MU', label: 'Mauritius' },
    { value: 'MX', label: 'Mexico' },
    { value: 'MY', label: 'Malaysia' },
    { value: 'NA', label: 'Namibia' },
    { value: 'NG', label: 'Nigeria' },
    { value: 'NL', label: 'Netherlands' },
    { value: 'NO', label: 'Norway' },
    { value: 'NZ', label: 'New Zealand' },
    { value: 'OM', label: 'Oman' },
    { value: 'PA', label: 'Panama' },
    { value: 'PE', label: 'Peru' },
    { value: 'PH', label: 'Philippines' },
    { value: 'PK', label: 'Pakistan' },
    { value: 'PL', label: 'Poland' },
    { value: 'PT', label: 'Portugal' },
    { value: 'QA', label: 'Qatar' },
    { value: 'RO', label: 'Romania' },
    { value: 'RS', label: 'Serbia' },
    { value: 'RU', label: 'Russia' },
    { value: 'SA', label: 'Saudi Arabia' },
    { value: 'SE', label: 'Sweden' },
    { value: 'SG', label: 'Singapore' },
    { value: 'SI', label: 'Slovenia' },
    { value: 'SK', label: 'Slovakia' },
    { value: 'SV', label: 'El Salvador' },
    { value: 'TH', label: 'Thailand' },
    { value: 'TN', label: 'Tunisia' },
    { value: 'TR', label: 'Turkey' },
    { value: 'TW', label: 'Taiwan' },
    { value: 'UA', label: 'Ukraine' },
    { value: 'VN', label: 'Vietnam' },
    { value: 'ZA', label: 'South Africa' }
  ];
  const US_STATE_OPTIONS = [
    ['AL', 'Alabama'],
    ['AK', 'Alaska'],
    ['AZ', 'Arizona'],
    ['AR', 'Arkansas'],
    ['CA', 'California'],
    ['CO', 'Colorado'],
    ['CT', 'Connecticut'],
    ['DE', 'Delaware'],
    ['FL', 'Florida'],
    ['GA', 'Georgia'],
    ['HI', 'Hawaii'],
    ['ID', 'Idaho'],
    ['IL', 'Illinois'],
    ['IN', 'Indiana'],
    ['IA', 'Iowa'],
    ['KS', 'Kansas'],
    ['KY', 'Kentucky'],
    ['LA', 'Louisiana'],
    ['ME', 'Maine'],
    ['MD', 'Maryland'],
    ['MA', 'Massachusetts'],
    ['MI', 'Michigan'],
    ['MN', 'Minnesota'],
    ['MS', 'Mississippi'],
    ['MO', 'Missouri'],
    ['MT', 'Montana'],
    ['NE', 'Nebraska'],
    ['NV', 'Nevada'],
    ['NH', 'New Hampshire'],
    ['NJ', 'New Jersey'],
    ['NM', 'New Mexico'],
    ['NY', 'New York'],
    ['NC', 'North Carolina'],
    ['ND', 'North Dakota'],
    ['OH', 'Ohio'],
    ['OK', 'Oklahoma'],
    ['OR', 'Oregon'],
    ['PA', 'Pennsylvania'],
    ['RI', 'Rhode Island'],
    ['SC', 'South Carolina'],
    ['SD', 'South Dakota'],
    ['TN', 'Tennessee'],
    ['TX', 'Texas'],
    ['UT', 'Utah'],
    ['VT', 'Vermont'],
    ['VA', 'Virginia'],
    ['WA', 'Washington'],
    ['WV', 'West Virginia'],
    ['WI', 'Wisconsin'],
    ['WY', 'Wyoming'],
    ['DC', 'District of Columbia']
  ];
  const shippingOptionUtils = window.PoolShippingOptionUtils || {
    normalizeSelection: function(availableOptions, selectedOption, defaultOption) {
      const options = Array.isArray(availableOptions) ? availableOptions : [];
      const requested = String(selectedOption || '').trim().toLowerCase();
      if (requested && options.some((option) => option?.id === requested)) {
        return requested;
      }

      const normalizedDefault = String(defaultOption || 'standard').trim().toLowerCase() || 'standard';
      if (options.some((option) => option?.id === normalizedDefault)) {
        return normalizedDefault;
      }

      return options[0]?.id || 'standard';
    },
    getSelectedDetails: function(availableOptions, selectedOption, defaultOption) {
      const options = Array.isArray(availableOptions) ? availableOptions : [];
      const resolvedOption = this.normalizeSelection(options, selectedOption, defaultOption);
      return options.find((option) => option?.id === resolvedOption) || null;
    },
    getPrimaryQuote: function(quotes) {
      const normalizedQuotes = Array.isArray(quotes) ? quotes : [];
      const shippableQuotes = normalizedQuotes.filter((quote) => (
        Number(quote?.shippingCents || 0) > 0 || quote?.shipment?.hasPhysical === true
      ));
      return shippableQuotes[0] || normalizedQuotes[0] || null;
    },
    resolveQuote: function(payload, selectedOption, fallbackShippingCents) {
      const quotes = Array.isArray(payload?.quotes) ? payload.quotes : [];
      const primaryQuote = this.getPrimaryQuote(quotes);
      const shippableQuotes = quotes.filter((quote) => (
        Number(quote?.shippingCents || 0) > 0 || quote?.shipment?.hasPhysical === true
      ));
      const optionSourceQuote = shippableQuotes.length === 1 ? shippableQuotes[0] : primaryQuote;
      const availableOptions = shippableQuotes.length === 1 && Array.isArray(optionSourceQuote?.availableOptions)
        ? optionSourceQuote.availableOptions
        : [];
      const defaultOption = String(optionSourceQuote?.defaultOption || 'standard').trim().toLowerCase() || 'standard';
      const resolvedOption = this.normalizeSelection(
        availableOptions,
        selectedOption || optionSourceQuote?.selectedOption,
        defaultOption
      );
      const selectedDetails = this.getSelectedDetails(availableOptions, resolvedOption, defaultOption);
      const shippingCents = selectedDetails
        ? Math.max(0, Number(selectedDetails.shippingCents || 0))
        : Math.max(0, Number(payload?.totalShippingCents || fallbackShippingCents || 0));

      return {
        shippingCents,
        source: String(primaryQuote?.source || ''),
        availableOptions,
        defaultOption,
        selectedOption: resolvedOption
      };
    },
    shouldShowOptions: function(quote) {
      const source = String(quote?.source || '').trim().toLowerCase();
      const availableOptions = Array.isArray(quote?.availableOptions) ? quote.availableOptions : [];
      const shippingCents = Math.max(0, Number(quote?.shippingCents ?? quote?.amountCents ?? 0));
      return source === 'usps_live' && shippingCents > 0 && availableOptions.length > 1;
    },
    formatChoice: function(option, labelResolver, moneyFormatter) {
      if (!option) return '';
      const label = typeof labelResolver === 'function' ? labelResolver(option.id) : String(option?.label || option?.id || '');
      const delta = Math.max(0, Number(option?.priceDeltaCents || 0));
      if (delta <= 0) return label;
      const formattedDelta = typeof moneyFormatter === 'function' ? moneyFormatter(delta) : String(delta);
      return `${label} (+${formattedDelta})`;
    }
  };
  const addOnUtils = window.PoolAddOnUtils || {
    invalidateCachedInventory: function() {
      try {
        localStorage.removeItem('pool_add_on_inventory');
      } catch (_error) {}
    },
    getCatalog: function(config) {
      return {
        enabled: config?.enabled === true,
        products: Array.isArray(config?.products) ? config.products : []
      };
    },
    findProduct: function(catalog, productId) {
      return this.getCatalog(catalog).products.find((product) => String(product?.id || '') === String(productId || '')) || null;
    },
    findVariant: function(product, variantId) {
      const variants = Array.isArray(product?.variants) ? product.variants : [];
      return variants.find((variant) => String(variant?.id || '') === String(variantId || '')) || null;
    },
    getSelectionKey: function(selection) {
      return `${String(selection?.productId || '').trim()}::${String(selection?.variantId || '').trim()}`;
    },
    getOptionLabel: function(option) {
      return option?.variantLabel ? `${option.name} (${option.variantLabel})` : String(option?.name || '');
    },
    normalizeSelection: function(selection, catalog) {
      const product = this.findProduct(catalog, selection?.productId);
      if (!product) return null;

      const quantity = Math.max(0, Number(selection?.quantity || 0));
      if (!Number.isFinite(quantity) || quantity <= 0) return null;

      const variants = Array.isArray(product?.variants) ? product.variants : [];
      let variantId = String(selection?.variantId || '').trim();
      let variantLabel = String(selection?.variantLabel || '').trim();
      if (variants.length > 0) {
        const variant = this.findVariant(product, variantId);
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
        scope: String(product.scope || 'platform'),
        campaignSlug: String(product.campaign_slug || ''),
        campaignTitle: String(product.campaign_title || ''),
        quantity,
        unitPrice: Math.round(Number(product.price || 0) * 100),
        category: String(product.category || 'digital'),
        shipping_preset: product.shipping_preset || null,
        shipping: product.shipping || null,
        variantOptionName: String(product.variant_option_name || ''),
        variantId,
        variantLabel
      };
    },
    normalizeSelections: function(selections, catalog) {
      return (Array.isArray(selections) ? selections : [])
        .map((selection) => this.normalizeSelection(selection, catalog))
        .filter(Boolean)
        .sort((a, b) => (
          a.productId.localeCompare(b.productId) ||
          a.variantId.localeCompare(b.variantId)
        ));
    },
    flattenCatalogOptions: function(catalog) {
      return this.getCatalog(catalog).products.flatMap((product) => {
        const variants = Array.isArray(product?.variants) ? product.variants : [];
        if (variants.length === 0) {
          return [{
            productId: String(product?.id || ''),
            variantId: '',
            variantLabel: '',
            key: this.getSelectionKey({ productId: product?.id, variantId: '' }),
            name: String(product?.name || ''),
            description: String(product?.description || ''),
            imageUrl: String(product?.image_url || ''),
            unitPrice: Math.round(Number(product?.price || 0) * 100),
            category: String(product?.category || 'digital'),
            sourceUrl: String(product?.source_url || ''),
            scope: String(product?.scope || 'platform'),
            campaignSlug: String(product?.campaign_slug || ''),
            campaignTitle: String(product?.campaign_title || '')
          }];
        }

        return variants.map((variant) => ({
          productId: String(product?.id || ''),
          variantId: String(variant?.id || ''),
          variantLabel: String(variant?.label || variant?.id || ''),
          key: this.getSelectionKey({ productId: product?.id, variantId: variant?.id }),
          name: String(product?.name || ''),
          description: String(product?.description || ''),
          imageUrl: String(product?.image_url || ''),
          unitPrice: Math.round(Number(product?.price || 0) * 100),
          category: String(product?.category || 'digital'),
          sourceUrl: String(product?.source_url || ''),
          scope: String(product?.scope || 'platform'),
          campaignSlug: String(product?.campaign_slug || ''),
          campaignTitle: String(product?.campaign_title || '')
        }));
      });
    },
    getSelectionQuantityMap: function(selections, catalog) {
      const map = new Map();
      this.normalizeSelections(selections, catalog).forEach((selection) => {
        map.set(this.getSelectionKey(selection), selection.quantity);
      });
      return map;
    },
    buildSelectionEntries: function(selections, catalog) {
      return this.normalizeSelections(selections, catalog).map((selection) => ({
        productId: selection.productId,
        variantId: selection.variantId,
        variantLabel: selection.variantLabel,
        quantity: Math.max(1, Number(selection.quantity || 1)),
        category: selection.category || 'digital',
        name: selection.name,
        description: selection.description,
        imageUrl: selection.imageUrl,
        sourceUrl: selection.sourceUrl,
        scope: selection.scope || 'platform',
        campaignSlug: selection.campaignSlug || '',
        campaignTitle: selection.campaignTitle || '',
        unitPrice: selection.unitPrice,
        shipping: selection.shipping || null,
        shipping_preset: selection.shipping_preset || null
      }));
    },
    selectionFromCartItem: function(item, catalog) {
      const rawId = String(item?.id || '').trim();
      if (!rawId.startsWith('addon__')) return null;
      const match = rawId.match(/^addon__(.+?)(?:__variant__(.+))?$/);
      if (!match) return null;
      return this.normalizeSelection({
        productId: String(match[1] || ''),
        variantId: String(match[2] || ''),
        quantity: Math.max(1, Number(item?.quantity || 1))
      }, catalog);
    },
    selectionsFromCartItems: function(items, catalog) {
      return (Array.isArray(items) ? items : [])
        .map((item) => this.selectionFromCartItem(item, catalog))
        .filter(Boolean)
        .sort((a, b) => (
          a.productId.localeCompare(b.productId) ||
          a.variantId.localeCompare(b.variantId)
        ));
    },
    buildCartItem: function(selection, catalog) {
      const normalized = this.normalizeSelection(selection, catalog);
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
      if (normalized.scope) {
        customFields.push({ name: '_addon_scope', value: normalized.scope });
      }
      if (normalized.campaignSlug) {
        customFields.push({ name: '_addon_campaign_slug', value: normalized.campaignSlug });
      }
      if (normalized.campaignTitle) {
        customFields.push({ name: '_addon_campaign_title', value: normalized.campaignTitle });
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
  };
  if (typeof addOnUtils.getLowStockThreshold !== 'function') {
    addOnUtils.getLowStockThreshold = function(config) {
      return Math.max(0, Number(config?.low_stock_threshold ?? config?.lowStockThreshold ?? 5) || 5);
    };
  }
  if (typeof addOnUtils.buildProductStateEntries !== 'function') {
    addOnUtils.buildProductStateEntries = function(catalog, selections, inventorySnapshot) {
      const resolvedCatalog = this.getCatalog(catalog);
      const threshold = this.getLowStockThreshold(resolvedCatalog);
      const selectedEntries = this.buildSelectionEntries(selections, resolvedCatalog);
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
          const configuredInventory = Number.isFinite(Number(variant?.inventory)) && Number(variant.inventory) >= 0 ? Math.round(Number(variant.inventory)) : null;
          const remaining = variantSnapshot?.remaining === null || variantSnapshot?.remaining === undefined
            ? configuredInventory
            : (Number.isFinite(Number(variantSnapshot.remaining)) ? Math.max(0, Number(variantSnapshot.remaining)) : configuredInventory);
          const selectedQuantity = selected?.variantId === variantId ? Math.max(1, Number(selected.quantity || 1)) : 0;
          const maxQuantity = remaining;
          const editableMaxQuantity = remaining === null ? null : remaining + selectedQuantity;
          const available = maxQuantity === null ? true : maxQuantity > 0;
          return {
            id: variantId,
            label: String(variant?.label || variantId),
            inventory: configuredInventory,
            sold: Math.max(0, Number(variantSnapshot?.sold || 0)),
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
        const configuredInventory = Number.isFinite(Number(product?.inventory)) && Number(product.inventory) >= 0 ? Math.round(Number(product.inventory)) : null;
        const remaining = snapshot?.remaining === null || snapshot?.remaining === undefined
          ? configuredInventory
          : (Number.isFinite(Number(snapshot.remaining)) ? Math.max(0, Number(snapshot.remaining)) : configuredInventory);
        const selectedQuantity = !hasVariants && selected ? Math.max(1, Number(selected.quantity || 1)) : 0;
        const maxQuantity = hasVariants ? (defaultVariant?.maxQuantity ?? null) : remaining;
        const editableMaxQuantity = hasVariants ? (defaultVariant?.editableMaxQuantity ?? null) : (remaining === null ? null : remaining + selectedQuantity);
        const available = hasVariants ? variantStates.length > 0 : (maxQuantity === null ? true : maxQuantity > 0);

        return {
          productId: String(product?.id || ''),
          name: String(product?.name || ''),
          description: String(product?.description || ''),
          imageUrl: String(product?.image_url || ''),
          sourceUrl: String(product?.source_url || ''),
          scope: String(product?.scope || 'platform'),
          campaignSlug: String(product?.campaign_slug || ''),
          campaignTitle: String(product?.campaign_title || ''),
          priceCents: Math.round(Number(product?.price || 0) * 100),
          category: String(product?.category || 'digital'),
          variantOptionName: String(product?.variant_option_name || 'Option'),
          inventory: configuredInventory,
          sold: Math.max(0, Number(snapshot?.sold || 0)),
          remaining,
          maxQuantity,
          editableMaxQuantity,
          available,
          lowStock: !hasVariants && available && maxQuantity !== null && maxQuantity <= threshold,
          selectedQuantity: Math.max(1, Number(selected?.quantity || 1)),
          selectedVariantId: hasVariants ? String(selected?.variantId || defaultVariant?.id || '') : '',
          selectedVariantLabel: hasVariants ? String(selected?.variantLabel || defaultVariant?.label || '') : '',
          inCart: !!selected,
          variants: variantStates
        };
      }).filter((product) => product.available || product.inCart);
    };
  }
  const ADD_ON_CATALOG = addOnUtils.getCatalog(window.POOL_CONFIG?.addOns);
  const ADD_ON_OPTIONS = addOnUtils.flattenCatalogOptions(ADD_ON_CATALOG);
  const ADD_ON_INVENTORY_CACHE_KEY = 'pool_add_on_inventory';
  let addOnInventorySnapshot = null;
  let addOnInventoryRequest = null;
  let requestCartAddOnInventoryRerender = null;
  const cartAddOnDrafts = new Map();

  function getPlatformAuthorName() {
    return String(
      window.POOL_CONFIG?.platform?.author ||
      window.POOL_CONFIG?.platformAuthor ||
      window.POOL_CONFIG?.platform?.companyName ||
      window.POOL_CONFIG?.platformCompanyName ||
      getPlatformName()
    ).trim() || getPlatformName();
  }

  function getAddOnInventoryTtlMs() {
    const parsed = Number(
      window.POOL_CONFIG?.cache?.liveInventoryTtlSeconds ??
      window.POOL_CONFIG?.liveInventoryCacheTtlSeconds ??
      300
    );
    return (Number.isFinite(parsed) && parsed >= 0 ? parsed : 300) * 1000;
  }

  function readCachedAddOnInventory() {
    try {
      const raw = localStorage.getItem(ADD_ON_INVENTORY_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const ttlMs = getAddOnInventoryTtlMs();
      const savedAt = Number(parsed.savedAt || 0);
      if (ttlMs > 0 && savedAt > 0 && (Date.now() - savedAt) > ttlMs) {
        return null;
      }
      return parsed.data || null;
    } catch (_error) {
      return null;
    }
  }

  function writeCachedAddOnInventory(data) {
    try {
      localStorage.setItem(ADD_ON_INVENTORY_CACHE_KEY, JSON.stringify({
        savedAt: Date.now(),
        data
      }));
    } catch (_error) {}
  }

  async function fetchCartAddOnInventorySnapshot(options) {
    const force = options?.force === true;
    if (!force && addOnInventorySnapshot) {
      return addOnInventorySnapshot;
    }

    if (!force) {
      const cached = readCachedAddOnInventory();
      if (cached) {
        addOnInventorySnapshot = cached;
        return cached;
      }
    }

    try {
      const response = await fetch(`${getWorkerBase()}/add-ons/inventory`);
      if (!response.ok) {
        throw new Error(`Failed to load add-on inventory (${response.status})`);
      }
      const data = await response.json();
      addOnInventorySnapshot = data;
      writeCachedAddOnInventory(data);
      return data;
    } catch (_error) {
      return addOnInventorySnapshot || {
        lowStockThreshold: addOnUtils.getLowStockThreshold(ADD_ON_CATALOG),
        products: {}
      };
    }
  }

  function ensureCartAddOnInventorySnapshot() {
    if (addOnInventoryRequest) return addOnInventoryRequest;
    addOnInventoryRequest = fetchCartAddOnInventorySnapshot().then((data) => {
      addOnInventorySnapshot = data;
      if (typeof requestCartAddOnInventoryRerender === 'function') {
        requestCartAddOnInventoryRerender();
      } else if (typeof renderFirstPartyCart === 'function') {
        renderFirstPartyCart();
      }
      return data;
    }).finally(() => {
      addOnInventoryRequest = null;
    });
    return addOnInventoryRequest;
  }

  function getRuntimeMessages() {
    return window.POOL_CONFIG?.i18n?.messages || {};
  }

  function getRuntimeLocale() {
    const htmlLang = String(document.documentElement?.lang || '').trim();
    if (htmlLang) return htmlLang;
    return String(window.POOL_CONFIG?.i18n?.lang || 'en').trim() || 'en';
  }

  function getRuntimeMessage(path, fallback) {
    const parts = String(path || '').split('.');
    let value = getRuntimeMessages();
    for (const part of parts) {
      if (!value || typeof value !== 'object') return fallback;
      value = value[part];
    }
    return typeof value === 'string' && value ? value : fallback;
  }

  function humanizeIdentifier(value) {
    return String(value || '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  }

  function getRequestedRuntime() {
    return window.POOL_CONFIG?.checkout?.cartRuntime ||
      window.POOL_CONFIG?.cartRuntime ||
      DEFAULT_RUNTIME;
  }

  function getRequestedCheckoutProvider() {
    return window.POOL_CONFIG?.checkout?.provider ||
      window.POOL_CONFIG?.checkoutProvider ||
      DEFAULT_CHECKOUT_PROVIDER;
  }

  function getWorkerBase() {
    return window.POOL_CONFIG?.platform?.workerUrl ||
      window.POOL_CONFIG?.workerBase ||
      DEFAULT_WORKER_BASE;
  }

  function getCheckoutUiMode() {
    return String(
      window.POOL_CONFIG?.checkout?.uiMode ||
      window.POOL_CONFIG?.checkoutUiMode ||
      DEFAULT_CHECKOUT_UI_MODE
    ).trim().toLowerCase();
  }

  function getPlatformName() {
    return window.POOL_CONFIG?.platform?.name ||
      window.POOL_CONFIG?.platformName ||
      DEFAULT_PLATFORM_NAME;
  }

  function getSalesTaxRate() {
    const parsed = Number(
      window.POOL_CONFIG?.pricing?.salesTaxRate ??
      window.POOL_CONFIG?.salesTaxRate
    );
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_SALES_TAX_RATE;
  }

  function getFlatShippingFeeCents() {
    const parsed = Number(
      window.POOL_CONFIG?.pricing?.flatShippingRate ??
      window.POOL_CONFIG?.flatShippingRate
    );
    const amount = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_FLAT_SHIPPING_RATE;
    return Math.round(amount * 100);
  }

  function getShippingFallbackFeeCents() {
    const parsed = Number(
      window.POOL_CONFIG?.shipping?.fallbackFlatRate ??
      window.POOL_CONFIG?.shippingFallbackFlatRate
    );
    const amount = Number.isFinite(parsed) && parsed >= 0 ? parsed : 3;
    return Math.round(amount * 100);
  }

  function isGlobalFreeShippingDefaultEnabled() {
    const value =
      window.POOL_CONFIG?.shipping?.freeShippingDefault ??
      window.POOL_CONFIG?.shippingFreeShippingDefault;
    if (value === true || value === false) return value;
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'true';
  }

  function getDefaultPlatformTipPercent() {
    const parsed = Number(
      window.POOL_CONFIG?.pricing?.defaultTipPercent ??
      window.POOL_CONFIG?.defaultTipPercent
    );
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_PLATFORM_TIP_PERCENT;
  }

  function getMaxPlatformTipPercent() {
    const parsed = Number(
      window.POOL_CONFIG?.pricing?.maxTipPercent ??
      window.POOL_CONFIG?.maxTipPercent
    );
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : MAX_PLATFORM_TIP_PERCENT;
  }

  function formatTaxRateLabel() {
    return getRuntimeMessage('cart.salesTaxLabel', 'Sales tax (%{rate}%)')
      .replace('%{rate}', (getSalesTaxRate() * 100).toFixed(3).replace(/\.?0+$/, ''));
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function formatTipSliderValueText(tipPercent, tipAmountCents) {
    const percent = sanitizeTipPercent(tipPercent, getDefaultPlatformTipPercent());
    return `${percent}% tip, ${formatCents(Math.max(0, tipAmountCents || 0))}`;
  }

  function renderShippingCountryOptions(selectedValue) {
    const selected = String(selectedValue || DEFAULT_SHIPPING_COUNTRY).trim().toUpperCase();
    const displayNames = typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
      ? new Intl.DisplayNames([getRuntimeLocale()], { type: 'region' })
      : null;
    return SHIPPING_COUNTRY_OPTIONS.map((option) => `
      <option value="${escapeHtml(option.value)}" ${selected === option.value ? 'selected' : ''}>${escapeHtml(displayNames?.of(option.value) || option.label)}</option>
    `).join('');
  }

  function renderUsStateOptions(selectedValue) {
    const selected = String(selectedValue || '').trim().toUpperCase();
    return `
      <option value="">Select state</option>
      ${US_STATE_OPTIONS.map(([value, label]) => `
        <option value="${escapeHtml(value)}" ${selected === value ? 'selected' : ''}>${escapeHtml(label)}</option>
      `).join('')}
    `;
  }

  function getCartRoot() {
    return document.querySelector('[data-pool-cart-root]');
  }

  function getSessionStorageSafe() {
    try {
      return window.sessionStorage;
    } catch (_error) {
      return null;
    }
  }

  function getLocalStorageSafe() {
    try {
      return window.localStorage;
    } catch (_error) {
      return null;
    }
  }

  function writeTimedStorageValue(storage, key, value) {
    if (!storage) return;
    if (!value) {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, JSON.stringify({
      value: String(value),
      savedAt: Date.now()
    }));
  }

  function readTimedStorageValue(storage, key, ttlMs) {
    if (!storage) return '';
    const raw = storage.getItem(key);
    if (!raw) return '';

    try {
      const parsed = JSON.parse(raw);
      const value = String(parsed?.value || '').trim();
      const savedAt = Number(parsed?.savedAt || 0);
      if (!value) {
        storage.removeItem(key);
        return '';
      }
      if (Number.isFinite(savedAt) && savedAt > 0 && Date.now() - savedAt > ttlMs) {
        storage.removeItem(key);
        return '';
      }
      return value;
    } catch (_error) {
      const legacyValue = String(raw || '').trim();
      if (!legacyValue) {
        storage.removeItem(key);
        return '';
      }
      return legacyValue;
    }
  }

  function dispatchProviderReady(detail) {
    document.dispatchEvent(new CustomEvent('poolcart.provider.ready', { detail: detail || {} }));
  }

  function dispatchCartReady(detail) {
    document.dispatchEvent(new CustomEvent('poolcart.ready', { detail: detail || {} }));
  }

  function loadStripeJs() {
    if (window.PoolStripeCheckoutSidecar && typeof window.PoolStripeCheckoutSidecar.ensureStripeJs === 'function') {
      return window.PoolStripeCheckoutSidecar.ensureStripeJs();
    }
    return Promise.reject(new Error('Stripe checkout helper is unavailable.'));
  }

  let stripeJsPrewarmPromise = null;
  let stripeJsPrewarmScheduled = false;

  function canUseCustomCheckoutUi() {
    return getRequestedCheckoutProvider() === FIRST_PARTY_CHECKOUT_PROVIDER && getCheckoutUiMode() === 'custom';
  }

  function prewarmStripeJs() {
    if (!canUseCustomCheckoutUi()) return null;
    if (!window.PoolStripeCheckoutSidecar || typeof window.PoolStripeCheckoutSidecar.ensureStripeJs !== 'function') {
      return null;
    }
    if (stripeJsPrewarmPromise) return stripeJsPrewarmPromise;

    stripeJsPrewarmPromise = loadStripeJs().catch((error) => {
      stripeJsPrewarmPromise = null;
      throw error;
    });

    return stripeJsPrewarmPromise;
  }

  function scheduleStripeJsPrewarm() {
    if (!canUseCustomCheckoutUi() || stripeJsPrewarmScheduled || stripeJsPrewarmPromise) return;
    stripeJsPrewarmScheduled = true;

    const start = function() {
      stripeJsPrewarmScheduled = false;
      const prewarm = prewarmStripeJs();
      if (prewarm && typeof prewarm.catch === 'function') {
        void prewarm.catch(() => {});
      }
    };

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(start, { timeout: 1200 });
      return;
    }

    window.setTimeout(start, 120);
  }

  function createEventBus() {
    const listeners = new Map();

    return {
      on: function(eventName, handler) {
        if (typeof handler !== 'function') return function() {};
        const handlers = listeners.get(eventName) || [];
        handlers.push(handler);
        listeners.set(eventName, handlers);

        return function unsubscribe() {
          const currentHandlers = listeners.get(eventName) || [];
          listeners.set(eventName, currentHandlers.filter((currentHandler) => currentHandler !== handler));
        };
      },
      emit: function(eventName, payload) {
        const handlers = listeners.get(eventName) || [];
        handlers.forEach((handler) => handler(payload));
      }
    };
  }

  function createStore(initialState) {
    let state = initialState;
    const subscribers = new Set();

    return {
      getState: function() {
        return state;
      },
      setState: function(nextState) {
        state = nextState;
        subscribers.forEach((subscriber) => subscriber(state));
      },
      subscribe: function(handler) {
        if (typeof handler !== 'function') return function() {};
        subscribers.add(handler);
        return function unsubscribe() {
          subscribers.delete(handler);
        };
      }
    };
  }

  function normalizeCartItem(item) {
    const quantity = Math.max(1, Number(item?.quantity || 1));
    const price = Number(item?.price || 0);
    const maxQuantity = Number(item?.maxQuantity);

    return {
      ...item,
      quantity,
      price,
      maxQuantity: Number.isFinite(maxQuantity) && maxQuantity > 0 ? maxQuantity : undefined,
      uniqueId: item?.uniqueId || `${FIRST_PARTY_ITEM_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    };
  }

  function getItemQuantityCap(item) {
    return Number.isFinite(item?.maxQuantity) && item.maxQuantity > 0 ? item.maxQuantity : Infinity;
  }

  function shouldMergeCartItem(existingItem, nextItem) {
    if (!existingItem || !nextItem) return false;
    if (existingItem.id !== nextItem.id) return false;
    if (nextItem.stackable) return true;
    return getItemQuantityCap(nextItem) !== Infinity;
  }

  function getButtonCustomFieldDefinitions(button) {
    const definitions = [];
    for (let index = 1; index <= 10; index++) {
      const name = button.getAttribute(`data-item-custom${index}-name`);
      if (!name) continue;

      definitions.push({
        name,
        type: button.getAttribute(`data-item-custom${index}-type`) || 'text',
        value: button.getAttribute(`data-item-custom${index}-value`) || '',
        placeholder: button.getAttribute(`data-item-custom${index}-placeholder`) || '',
        required: button.getAttribute(`data-item-custom${index}-required`) === 'true'
      });
    }

    return definitions;
  }

  function hasInteractiveCustomFields(button) {
    return getButtonCustomFieldDefinitions(button).some((field) => field.type !== 'hidden');
  }

  function buildCartItemFromButton(button) {
    const isStackable = button.getAttribute('data-item-stackable') === 'true' ||
      button.getAttribute('data-item-stackable') === 'always';
    const maxQty = button.getAttribute('data-item-max-quantity');
    const item = {
      id: button.getAttribute('data-item-id'),
      name: button.getAttribute('data-item-name'),
      price: parseFloat(button.getAttribute('data-item-price') || '0'),
      url: button.getAttribute('data-item-url'),
      description: button.getAttribute('data-item-description'),
      stackable: isStackable,
      shippable: button.getAttribute('data-item-shippable') === 'true'
    };
    const shippingFallbackCentsRaw = button.getAttribute('data-item-shipping-fallback-cents');
    const shippingFallbackCents = shippingFallbackCentsRaw === null
      ? NaN
      : Number(shippingFallbackCentsRaw);
    if (Number.isFinite(shippingFallbackCents) && shippingFallbackCents >= 0) {
      item.campaignShippingFallbackCents = Math.round(shippingFallbackCents);
    }
    const campaignFreeShipping = button.getAttribute('data-item-campaign-free-shipping');
    if (campaignFreeShipping === 'true') {
      item.campaignFreeShipping = true;
    } else if (campaignFreeShipping === 'false') {
      item.campaignFreeShipping = false;
    }

    if (maxQty) {
      item.maxQuantity = parseInt(maxQty, 10);
    } else if (!isStackable) {
      item.maxQuantity = 1;
    }

    const customFields = getButtonCustomFieldDefinitions(button);
    if (customFields.length > 0) {
      item.customFields = customFields;
    }

    return item;
  }

  function buildPendingCartItemFromButton(button) {
    const isStackable = button.getAttribute('data-item-stackable') === 'true' ||
      button.getAttribute('data-item-stackable') === 'always';
    const maxQty = button.getAttribute('data-item-max-quantity');
    const item = {
      id: button.getAttribute('data-item-id'),
      name: button.getAttribute('data-item-name'),
      price: parseFloat(button.getAttribute('data-item-price') || '0'),
      url: button.getAttribute('data-item-url'),
      description: button.getAttribute('data-item-description'),
      stackable: isStackable,
      shippable: button.getAttribute('data-item-shippable') === 'true'
    };
    const shippingFallbackCentsRaw = button.getAttribute('data-item-shipping-fallback-cents');
    const shippingFallbackCents = shippingFallbackCentsRaw === null
      ? NaN
      : Number(shippingFallbackCentsRaw);
    if (Number.isFinite(shippingFallbackCents) && shippingFallbackCents >= 0) {
      item.campaignShippingFallbackCents = Math.round(shippingFallbackCents);
    }
    const campaignFreeShipping = button.getAttribute('data-item-campaign-free-shipping');
    if (campaignFreeShipping === 'true') {
      item.campaignFreeShipping = true;
    } else if (campaignFreeShipping === 'false') {
      item.campaignFreeShipping = false;
    }

    if (maxQty) {
      item.maxQuantity = parseInt(maxQty, 10);
    } else if (!isStackable) {
      item.maxQuantity = 1;
    }

    const customFields = getButtonCustomFieldDefinitions(button);
    if (customFields.length > 0) {
      item.customFields = customFields;
    }

    return item;
  }

  function redirectWindow(url) {
    if (!url) return;

    if (typeof window.location?.assign === 'function') {
      window.location.assign(url);
      return;
    }

    window.location.href = url;
  }

  function calculateCartTotals(items, tipPercent = DEFAULT_PLATFORM_TIP_PERCENT, selectedAnchorSlug = '') {
    const subtotal = items.reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 1)), 0);
    const subtotalCents = Math.round(subtotal * 100);
    const nextTipPercent = sanitizeTipPercent(tipPercent, getDefaultPlatformTipPercent());
    const tipAmountCents = Math.round((subtotalCents * nextTipPercent) / 100);
    const shippingCents = getCampaignFallbackShippingCents(
      items,
      selectedAnchorSlug
    );
    const taxCents = calculateTax(subtotalCents);

    return {
      subtotal,
      total: (subtotalCents + tipAmountCents + taxCents + shippingCents) / 100
    };
  }

  function formatCurrency(amount) {
    return '$' + (Number(amount || 0)).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatCents(cents) {
    return '$' + (Math.round(Number(cents || 0)) / 100).toFixed(2);
  }

  function renderBusyButtonLabel(label, isBusy) {
    const safeLabel = escapeHtml(String(label || ''));
    if (!isBusy) return safeLabel;
    return `${safeLabel}<span class="pool-button-spinner" aria-hidden="true"></span>`;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeInternalHref(value) {
    const href = String(value || '/').trim();
    if (!href) return '/';
    if (href.startsWith('/')) return href;

    try {
      const parsed = new URL(href, window.location.origin);
      if (parsed.origin === window.location.origin || /^https?:$/.test(parsed.protocol)) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch (_error) {}

    return '/';
  }

  function isFirstPartyOrderId(orderId) {
    return /^pool-intent-[a-z0-9_-]+$/i.test(String(orderId || ''));
  }

  function sanitizeTipPercent(value, fallback) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= getMaxPlatformTipPercent()) {
      return parsed;
    }
    const fallbackParsed = Number(fallback);
    if (Number.isInteger(fallbackParsed) && fallbackParsed >= 0 && fallbackParsed <= getMaxPlatformTipPercent()) {
      return fallbackParsed;
    }
    return getDefaultPlatformTipPercent();
  }

  function calculateTax(subtotalCents) {
    return Math.round(Math.max(0, Number(subtotalCents) || 0) * getSalesTaxRate());
  }

  function isAddOnCartItem(item) {
    return String(item?.id || '').trim().startsWith(ADD_ON_ITEM_PREFIX);
  }

  function getCartBundleAddOnSelections(items) {
    if (!ADD_ON_CATALOG.enabled) return [];
    return addOnUtils.selectionsFromCartItems
      ? addOnUtils.selectionsFromCartItems(items, ADD_ON_CATALOG)
      : [];
  }

  function getCartBundleAddOnSelectionKey(selection) {
    return addOnUtils.getSelectionKey
      ? addOnUtils.getSelectionKey(selection)
      : `${String(selection?.productId || '').trim()}::${String(selection?.variantId || '').trim()}`;
  }

  function getCartAddOnOptionLabel(option) {
    return addOnUtils.getOptionLabel
      ? addOnUtils.getOptionLabel(option)
      : String(option?.name || '');
  }

  function getFirstPartyItemCampaignSlug(item) {
    if (isAddOnCartItem(item)) return '';
    const idSlug = typeof item?.id === 'string' ? item.id.split('__')[0] : '';
    if (idSlug) return idSlug;

    const url = String(item?.url || '');
    return url.split('/campaigns/')[1]?.split('/')[0] || '';
  }

  function getCartCampaignDisplayName(items, slug) {
    const matchingItem = (Array.isArray(items) ? items : []).find((item) => {
      return !isAddOnCartItem(item) && getFirstPartyItemCampaignSlug(item) === slug;
    });

    const explicitLabel = String(matchingItem?.campaignTitle || '').trim();
    if (explicitLabel) return explicitLabel;

    const itemName = String(matchingItem?.name || '').trim();
    if (itemName.includes(' — ')) {
      return itemName.split(' — ')[0].trim();
    }

    return humanizeIdentifier(slug);
  }

  function getCartBundleAddOnAnchorOptions(items) {
    return getFirstPartyCampaignSlugs(items).map((slug) => ({
      value: slug,
      label: getCartCampaignDisplayName(items, slug)
    }));
  }

  function resolveCartBundleAddOnAnchorCampaignSlug(items, preferredSlug) {
    const options = getCartBundleAddOnAnchorOptions(items);
    if (options.length === 0) return '';

    const requested = String(preferredSlug || '').trim();
    if (requested && options.some((option) => option.value === requested)) {
      return requested;
    }

    return String(options[0]?.value || '');
  }

  function firstPartyItemIsPhysical(item) {
    if (item?.shippable === true) return true;

    const fields = Array.isArray(item?.customFields) ? item.customFields : [];
    return fields.some((field) => field?.name === '_category' && field?.value === 'physical');
  }

  function getCartAddOnScope(selection) {
    return String(selection?.scope || 'platform').trim().toLowerCase() || 'platform';
  }

  function getPhysicalCampaignCount(items) {
    const slugs = new Set();
    for (const item of Array.isArray(items) ? items : []) {
      if (isAddOnCartItem(item)) continue;
      if (!firstPartyItemIsPhysical(item)) continue;
      const slug = getFirstPartyItemCampaignSlug(item);
      if (slug) slugs.add(slug);
    }
    return slugs.size;
  }

  function getFallbackShippingCentsForCampaignSlug(items, campaignSlug) {
    const normalizedSlug = String(campaignSlug || '').trim();
    const campaignItem = (Array.isArray(items) ? items : []).find((item) => (
      !isAddOnCartItem(item) &&
      getFirstPartyItemCampaignSlug(item) === normalizedSlug
    ));
    const parsed = Number(campaignItem?.campaignShippingFallbackCents);
    const campaignFreeShipping = campaignItem?.campaignFreeShipping;
    const resolvedFreeShipping = campaignFreeShipping === true
      ? true
      : campaignFreeShipping === false
        ? false
        : isGlobalFreeShippingDefaultEnabled();

    if (resolvedFreeShipping) {
      return 0;
    }

    return Number.isFinite(parsed) && parsed > 0
      ? Math.round(parsed)
      : getShippingFallbackFeeCents();
  }

  function getCampaignFallbackShippingCents(items, selectedAnchorSlug) {
    const fallbackByCampaign = new Map();
    const normalizedItems = Array.isArray(items) ? items : [];
    const addOnSelections = getCartBundleAddOnSelections(normalizedItems);
    const physicalCampaignSlugs = new Set();
    for (const item of normalizedItems) {
      if (isAddOnCartItem(item)) continue;
      if (!firstPartyItemIsPhysical(item)) continue;
      const slug = getFirstPartyItemCampaignSlug(item);
      if (!slug) continue;
      physicalCampaignSlugs.add(slug);
      const resolvedAmount = getFallbackShippingCentsForCampaignSlug(normalizedItems, slug);

      if (!fallbackByCampaign.has(slug) || resolvedAmount === 0) {
        fallbackByCampaign.set(slug, resolvedAmount);
      }
    }

    let hasPhysicalPlatformAddOns = false;
    for (const selection of addOnSelections) {
      if (String(selection?.category || '').trim().toLowerCase() !== 'physical') continue;
      if (getCartAddOnScope(selection) === 'campaign') {
        const campaignSlug = String(selection?.campaignSlug || '').trim();
        if (campaignSlug && !fallbackByCampaign.has(campaignSlug)) {
          fallbackByCampaign.set(campaignSlug, getFallbackShippingCentsForCampaignSlug(normalizedItems, campaignSlug));
        }
      } else {
        hasPhysicalPlatformAddOns = true;
      }
    }

    if (hasPhysicalPlatformAddOns) {
      fallbackByCampaign.set('__platform__', getShippingFallbackFeeCents());
    }

    return Array.from(fallbackByCampaign.values()).reduce((sum, amount) => sum + amount, 0);
  }

  function buildFirstPartyPricing(state) {
    const items = state?.cart?.items?.items || [];
    const subtotalCents = Math.round((Number(state?.cart?.subtotal || 0)) * 100);
    const tipPercent = sanitizeTipPercent(state?.cart?.tipPercent, getDefaultPlatformTipPercent());
    const tipAmountCents = Math.round((subtotalCents * tipPercent) / 100);
    const shippingCents = getCampaignFallbackShippingCents(
      items,
      state?.cart?.bundleAddOnAnchorCampaignSlug
    );
    const taxCents = calculateTax(subtotalCents);

    return {
      subtotalCents,
      tipPercent,
      tipAmountCents,
      taxCents,
      shippingCents,
      totalCents: subtotalCents + tipAmountCents + taxCents + shippingCents
    };
  }

  function isCustomCheckoutEstimateActive(state, options) {
    if (options?.currentRoute !== CHECKOUT_VIEW_ROUTE) return false;
    if (options?.checkoutMode !== 'custom') return false;
    const items = state?.cart?.items?.items || [];
    return cartHasPhysicalItems(items);
  }

  function getDisplayedFirstPartyPricing(state, options) {
    const pricing = buildFirstPartyPricing(state);
    if (!isCustomCheckoutEstimateActive(state, options)) {
      return {
        ...pricing,
        shippingLabel: getRuntimeMessage('cart.shipping', 'Shipping'),
        totalLabel: getRuntimeMessage('cart.pledgeTotal', 'Pledge total'),
        isShippingEstimate: false
      };
    }

    const shippingQuote = options?.shippingQuote || null;
    const hasPhysicalItems = cartHasPhysicalItems(state?.cart?.items?.items || []);
    const fallbackShippingCents = getCampaignFallbackShippingCents(
      state?.cart?.items?.items || [],
      state?.cart?.bundleAddOnAnchorCampaignSlug
    );
    const quoteStatus = String(shippingQuote?.status || 'idle').trim().toLowerCase();
    const isCalculatingQuote = quoteStatus === 'loading';
    const source = String(shippingQuote?.source || '').trim().toLowerCase();
    const quotedAmountCents = Number.isFinite(Number(shippingQuote?.amountCents))
      ? Math.max(0, Number(shippingQuote.amountCents))
      : null;
    const shouldFallbackToPhysicalShipping = hasPhysicalItems &&
      (quotedAmountCents === null || (quotedAmountCents === 0 && (source === '' || source === 'none')));
    const shippingCents = shouldFallbackToPhysicalShipping
      ? fallbackShippingCents
      : (quotedAmountCents ?? fallbackShippingCents);
    const isEstimate = shouldRenderShippingAsEstimate(shippingQuote);
    const shippingLabel = isCalculatingQuote
      ? getRuntimeMessage('cart.shippingCalculating', 'Calculating shipping...')
      : isEstimate
        ? getRuntimeMessage('cart.shippingEstimate', 'Estimated shipping')
        : getRuntimeMessage('cart.shipping', 'Shipping');

    return {
      ...pricing,
      shippingCents,
      totalCents: pricing.subtotalCents + pricing.tipAmountCents + pricing.taxCents + shippingCents,
      shippingLabel,
      totalLabel: isCalculatingQuote || isEstimate
        ? getRuntimeMessage('cart.estimatedTotal', 'Estimated total')
        : getRuntimeMessage('cart.pledgeTotal', 'Pledge total'),
      isShippingEstimate: isCalculatingQuote || isEstimate,
      shippingSource: source
    };
  }

  function getCartShippingOptionMessageKey(optionId) {
    switch (String(optionId || '').trim().toLowerCase()) {
      case 'signature_required':
        return 'cart.shippingOptionSignatureRequired';
      case 'adult_signature_required':
        return 'cart.shippingOptionAdultSignatureRequired';
      case 'standard':
      default:
        return 'cart.shippingOptionStandard';
    }
  }

  function getCartShippingOptionLabel(optionId) {
    switch (String(optionId || '').trim().toLowerCase()) {
      case 'signature_required':
        return getRuntimeMessage('cart.shippingOptionSignatureRequired', 'Signature required');
      case 'adult_signature_required':
        return getRuntimeMessage('cart.shippingOptionAdultSignatureRequired', 'Adult signature required');
      case 'standard':
      default:
        return getRuntimeMessage('cart.shippingOptionStandard', 'Standard');
    }
  }

  function getCartSelectedShippingOptionDetails(shippingQuote) {
    const availableOptions = Array.isArray(shippingQuote?.availableOptions) ? shippingQuote.availableOptions : [];
    const selectedOption = shippingOptionUtils.normalizeSelection(
      availableOptions,
      shippingQuote?.selectedOption,
      shippingQuote?.defaultOption
    );
    return availableOptions.find((option) => option?.id === selectedOption) || null;
  }

  function shouldShowCartShippingOptions(shippingQuote) {
    return shippingOptionUtils.shouldShowOptions({
      ...shippingQuote,
      shippingCents: Number(shippingQuote?.amountCents || 0)
    });
  }

  function shouldRenderShippingAsEstimate(shippingQuote) {
    const source = String(shippingQuote?.source || '').trim().toLowerCase();
    const status = String(shippingQuote?.status || '').trim().toLowerCase();
    return source === 'usps_live' || status === 'loading';
  }

  function formatCartShippingOptionChoice(option) {
    return shippingOptionUtils.formatChoice(option, getCartShippingOptionLabel, formatCents);
  }

  function renderCartShippingOptionChoices(shippingQuote) {
    const availableOptions = Array.isArray(shippingQuote?.availableOptions) ? shippingQuote.availableOptions : [];
    const selectedOption = shippingOptionUtils.normalizeSelection(
      availableOptions,
      shippingQuote?.selectedOption,
      shippingQuote?.defaultOption
    );
    return availableOptions.map((option) => `
      <option value="${escapeAttribute(option.id)}"${option.id === selectedOption ? ' selected' : ''}>${escapeHtml(formatCartShippingOptionChoice(option))}</option>
    `).join('');
  }

  function buildCartShippingQuoteState(data, fallbackShippingCents, currentQuote) {
    const resolvedQuote = shippingOptionUtils.resolveQuote(
      data,
      currentQuote?.selectedOption,
      fallbackShippingCents
    );

    return {
      status: 'ready',
      amountCents: resolvedQuote.shippingCents,
      source: resolvedQuote.source,
      availableOptions: resolvedQuote.availableOptions,
      defaultOption: resolvedQuote.defaultOption,
      selectedOption: resolvedQuote.selectedOption
    };
  }

  function renderCartShippingSummaryValue(shippingQuote, shippingCents) {
    if (!shouldShowCartShippingOptions(shippingQuote)) {
      return `<strong data-cart-checkout-summary-shipping>${formatCents(shippingCents)}</strong>`;
    }

    return `
      <div class="pool-first-party-cart__summary-value pool-first-party-cart__summary-value--shipping-option">
        <select id="pool-custom-shipping-option" class="pool-first-party-cart__input pool-first-party-cart__input--select pool-first-party-cart__input--summary-select" data-cart-custom-shipping-option aria-label="${escapeAttribute(getRuntimeMessage('cart.shippingOption', 'Delivery option'))}">
          ${renderCartShippingOptionChoices(shippingQuote)}
        </select>
      </div>
    `;
  }

  function cartHasPhysicalItems(items) {
    return (items || []).some((item) => {
      if (item?.shippable === true) return true;

      const fields = Array.isArray(item?.customFields) ? item.customFields : [];
      return fields.some((field) => field?.name === '_category' && field?.value === 'physical');
    });
  }

  function shouldDeferPhysicalCustomCheckoutStart(state, options) {
    return false;
  }

  function buildCheckoutLineItems(items) {
    return (items || []).map((item) => ({
      name: getCartItemFieldValue(item, '_variant_label')
        ? `${item?.name || item?.id || 'Untitled item'} (${getCartItemFieldValue(item, '_variant_label')})`
        : (item?.name || item?.id || 'Untitled item'),
      quantity: Math.max(1, Number(item?.quantity || 1)),
      showQuantity: item?.stackable === true || Math.max(1, Number(item?.quantity || 1)) > 1,
      amountCents: Math.round((Number(item?.price) || 0) * Math.max(1, Number(item?.quantity || 1)) * 100)
    }));
  }

  function renderCartBundleAddOnAnchorOptions(items, selectedSlug) {
    return getCartBundleAddOnAnchorOptions(items).map((option) => `
      <option value="${escapeAttribute(option.value)}"${option.value === selectedSlug ? ' selected' : ''}>${escapeHtml(option.label)}</option>
    `).join('');
  }

  function getCartBundleAddOnSelectionsByProduct(items) {
    const selections = getCartBundleAddOnSelections(items);
    const map = new Map();
    selections.forEach((selection) => {
      if (!map.has(selection.productId)) {
        map.set(selection.productId, selection);
      }
    });
    return map;
  }

  function isCampaignScopedAddOn(entry) {
    return String(entry?.scope || '').trim().toLowerCase() === 'campaign';
  }

  function isPlatformScopedAddOn(entry) {
    return !isCampaignScopedAddOn(entry);
  }

  function getAddOnCampaignSlug(entry) {
    return String(entry?.campaignSlug || entry?.campaign_slug || '').trim();
  }

  function getAddOnCampaignTitle(entry) {
    return String(entry?.campaignTitle || entry?.campaign_title || '').trim();
  }

  function getCartAddOnProductCards(items, filterFn) {
    const productCards = addOnUtils.buildProductStateEntries
      ? addOnUtils.buildProductStateEntries(ADD_ON_CATALOG, getCartBundleAddOnSelections(items), addOnInventorySnapshot)
      : [];

    return productCards.filter((product) => {
      if (product.inCart) return false;
      return typeof filterFn === 'function' ? filterFn(product) : true;
    });
  }

  function getCartCampaignAddOnProductGroups(items) {
    const campaignSlugs = new Set(getFirstPartyCampaignSlugs(items));
    const groups = new Map();

    getCartAddOnProductCards(items, (product) => (
      isCampaignScopedAddOn(product) &&
      campaignSlugs.has(getAddOnCampaignSlug(product))
    )).forEach((product) => {
      const campaignSlug = getAddOnCampaignSlug(product);
      if (!campaignSlug) return;
      if (!groups.has(campaignSlug)) {
        groups.set(campaignSlug, {
          slug: campaignSlug,
          title: getAddOnCampaignTitle(product) || getCartCampaignDisplayName(items, campaignSlug),
          products: []
        });
      }
      groups.get(campaignSlug).products.push(product);
    });

    return Array.from(groups.values());
  }

  function getCartAddOnDraft(product) {
    const existing = cartAddOnDrafts.get(product.productId);
    if (existing) {
      return {
        variantId: String(existing.variantId || product.selectedVariantId || ''),
        quantity: Math.max(1, Number(existing.quantity || 1))
      };
    }

    return {
      variantId: String(product.selectedVariantId || product.variants?.[0]?.id || ''),
      quantity: Math.max(1, Number(product.selectedQuantity || 1))
    };
  }

  function setCartAddOnDraft(productId, draft) {
    cartAddOnDrafts.set(String(productId || ''), {
      variantId: String(draft?.variantId || ''),
      quantity: Math.max(1, Number(draft?.quantity || 1))
    });
  }

  function getCartAddOnSelectedVariant(product, draft) {
    if (product.variants?.length) {
      return product.variants.find((variant) => variant.id === String(draft?.variantId || '')) || product.variants[0] || null;
    }
    return null;
  }

  function renderCartAddOnVariantOptions(product, selectedVariantId) {
    return (product.variants || []).map((variant) => `
      <option
        value="${escapeAttribute(variant.id)}"
        data-max-quantity="${escapeAttribute(String(Math.max(1, Number(variant.maxQuantity ?? 1))))}"
        data-remaining="${escapeAttribute(String(Number.isFinite(Number(variant.remaining)) ? Number(variant.remaining) : ''))}"
        data-low-stock="${variant.lowStock ? 'true' : 'false'}"
        ${variant.id === selectedVariantId ? ' selected' : ''}
      >
        ${escapeHtml(variant.label)}
      </option>
    `).join('');
  }

  function getCartAddOnStockCopy(product, variant) {
    const count = variant ? variant.maxQuantity : product.maxQuantity;
    if (!Number.isFinite(Number(count)) || Number(count) <= 0) return '';
    const isLowStock = variant?.lowStock || product?.lowStock;
    return getRuntimeMessage(
      isLowStock ? 'cart.addOnLowStock' : 'cart.addOnStock',
      isLowStock ? 'Only %{count} left' : '%{count} left'
    ).replace('%{count}', String(count));
  }

  function syncCartAddOnCardVariantState(card) {
    if (!(card instanceof HTMLElement)) return;
    const variantField = card.querySelector('[data-cart-addon-variant]');
    const quantityField = card.querySelector('[data-cart-addon-product-quantity]');
    const statusField = card.querySelector('[data-cart-addon-status]');
    if (!(quantityField instanceof HTMLInputElement)) return;
    if (!(variantField instanceof HTMLSelectElement)) {
      const fallbackMax = Math.max(1, parseInt(quantityField.getAttribute('max') || '1', 10) || 1);
      const currentQuantity = Math.max(1, parseInt(quantityField.value || '1', 10) || 1);
      quantityField.max = String(fallbackMax);
      quantityField.value = String(Math.min(fallbackMax, currentQuantity));
      return;
    }

    const selectedOption = Array.from(variantField.options || []).find((option) => option.value === variantField.value)
      || variantField.selectedOptions?.[0]
      || variantField.options?.[variantField.selectedIndex]
      || null;
    const maxQuantity = Math.max(1, parseInt(selectedOption?.getAttribute('data-max-quantity') || '1', 10) || 1);
    const remaining = parseInt(selectedOption?.getAttribute('data-remaining') || '', 10);
    const isLowStock = selectedOption?.getAttribute('data-low-stock') === 'true';
    const currentQuantity = Math.max(1, parseInt(quantityField.value || '1', 10) || 1);
    quantityField.max = String(maxQuantity);
    quantityField.value = String(Math.min(maxQuantity, currentQuantity));

    if (!(statusField instanceof HTMLElement)) return;
    if (Number.isFinite(remaining) && remaining > 0) {
      statusField.hidden = false;
      statusField.textContent = getRuntimeMessage(
        isLowStock ? 'cart.addOnLowStock' : 'cart.addOnStock',
        isLowStock ? 'Only %{count} left' : '%{count} left'
      ).replace('%{count}', String(remaining));
      statusField.classList.toggle('addon-product-card__status--low-stock', isLowStock);
    } else {
      statusField.hidden = true;
      statusField.textContent = '';
      statusField.classList.remove('addon-product-card__status--low-stock');
    }
  }

  function buildCartAddOnSelectionsFromProductState(items, productId, variantId, quantity) {
    const nextSelections = getCartBundleAddOnSelections(items).filter((selection) => selection.productId !== productId);
    if (quantity > 0) {
      nextSelections.push({ productId, variantId, quantity });
    }
    return nextSelections;
  }

  function renderCartAddOnProductGrid(products) {
    return `
      <div class="addon-product-grid">
        ${products.map((product) => {
          const draft = getCartAddOnDraft(product);
          const selectedVariant = getCartAddOnSelectedVariant(product, draft);
          const maxQuantity = Math.max(1, Number(selectedVariant?.maxQuantity ?? product.maxQuantity ?? 1));
          const stockCopy = getCartAddOnStockCopy(product, selectedVariant);
          const stockClass = (selectedVariant?.lowStock || product.lowStock)
            ? 'addon-product-card__status addon-product-card__status--block addon-product-card__status--low-stock'
            : 'addon-product-card__status addon-product-card__status--block';
          const controlClasses = [
            'addon-product-card__controls',
            product.variants?.length ? 'addon-product-card__controls--with-variant' : ''
          ].filter(Boolean).join(' ');
          return `
            <article class="addon-product-card" data-cart-addon-product="${escapeAttribute(product.productId)}" data-cart-addon-active="false">
              ${product.imageUrl ? `
                <div class="addon-product-card__media">
                  <img class="addon-product-card__image" src="${escapeAttribute(product.imageUrl)}" alt="" loading="lazy" decoding="async">
                </div>
              ` : ''}
              <div class="addon-product-card__main">
                <div class="addon-product-card__header">
                  <strong class="addon-product-card__name">${escapeHtml(product.name)}</strong>
                  <span class="addon-product-card__price">${formatCents(product.priceCents || 0)}</span>
                </div>
                ${product.description ? `<p class="addon-product-card__description">${escapeHtml(product.description)}</p>` : ''}
              </div>
              <p class="${stockClass}" data-cart-addon-status aria-live="polite" ${stockCopy ? '' : 'hidden'}>${escapeHtml(stockCopy)}</p>
              <div class="${controlClasses}">
                ${product.variants?.length ? `
                  <div class="addon-product-card__field addon-product-card__field--variant">
                    <select
                      id="pool-cart-addon-variant-${escapeAttribute(product.productId)}"
                      class="pool-first-party-cart__input pool-first-party-cart__input--select"
                      aria-label="${escapeAttribute(product.variantOptionName || getRuntimeMessage('cart.addOnVariant', 'Variation'))}"
                      data-cart-addon-variant
                      data-addon-product-id="${escapeAttribute(product.productId)}"
                    >
                      ${renderCartAddOnVariantOptions(product, selectedVariant?.id || '')}
                    </select>
                  </div>
                ` : ''}
                <div class="addon-product-card__field addon-product-card__field--qty">
                  <input
                    id="pool-cart-addon-qty-${escapeAttribute(product.productId)}"
                    class="pool-first-party-cart__input pool-first-party-cart__input--addon-qty"
                    type="number"
                    min="1"
                    max="${escapeAttribute(String(maxQuantity))}"
                    step="1"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    aria-label="${escapeAttribute(getRuntimeMessage('cart.quantity', 'Quantity'))}"
                    value="${escapeAttribute(String(Math.min(maxQuantity, Math.max(1, Number(draft.quantity || 1)))))}"
                    data-cart-addon-product-quantity
                    data-addon-product-id="${escapeAttribute(product.productId)}"
                  >
                </div>
              </div>
              <div class="addon-product-card__footer">
                <button
                  type="button"
                  class="btn btn--secondary addon-product-card__button"
                  data-cart-addon-add
                  data-addon-product-id="${escapeAttribute(product.productId)}"
                >${escapeHtml(getRuntimeMessage('cart.addToCart', 'Add to cart'))}</button>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderCartAddOnSection(items, selectedAnchorSlug) {
    if (!ADD_ON_CATALOG.enabled || !ADD_ON_CATALOG.products?.length || !cartHasPledgeItems(items)) {
      return '';
    }
    void ensureCartAddOnInventorySnapshot();
    const anchorOptions = getCartBundleAddOnAnchorOptions(items);
    const resolvedAnchorSlug = resolveCartBundleAddOnAnchorCampaignSlug(items, selectedAnchorSlug);
    const platformProductCards = getCartAddOnProductCards(items, isPlatformScopedAddOn);
    const campaignProductGroups = getCartCampaignAddOnProductGroups(items);
    const supportNote = getRuntimeMessage(
      'cart.platformAddOnsNote',
      'These add-ons support %{author} and do not count toward the campaign total.'
    ).replace('%{author}', getPlatformAuthorName());

    if (platformProductCards.length === 0 && campaignProductGroups.length === 0) {
      return '';
    }

    const sections = [];

    if (platformProductCards.length > 0) {
      sections.push(`
        <section class="pool-first-party-cart__callout pool-first-party-cart__callout--addons">
          <p class="pool-first-party-cart__section-label">${escapeHtml(
            getRuntimeMessage('cart.platformAddOns', 'Add-ons').replace('%{platform}', getPlatformName())
          )}</p>
          <p class="pool-first-party-cart__note">${escapeHtml(supportNote)}</p>
          ${anchorOptions.length > 1 ? `
            <div class="pool-first-party-cart__field pool-first-party-cart__field--summary">
              <label class="pool-first-party-cart__field-label" for="pool-cart-addon-anchor">${escapeHtml(getRuntimeMessage('cart.addOnAnchorCampaign', 'Attach add-ons to'))}</label>
              <select id="pool-cart-addon-anchor" class="pool-first-party-cart__input pool-first-party-cart__input--select" data-cart-addon-anchor>
                ${renderCartBundleAddOnAnchorOptions(items, resolvedAnchorSlug)}
              </select>
            </div>
          ` : ''}
          ${renderCartAddOnProductGrid(platformProductCards)}
        </section>
      `);
    }

    if (campaignProductGroups.length > 0) {
      const showGroupTitles = campaignProductGroups.length > 1;
      sections.push(`
        <section class="pool-first-party-cart__callout pool-first-party-cart__callout--addons">
          <p class="pool-first-party-cart__section-label">${escapeHtml(getRuntimeMessage('cart.campaignAddOns', 'Campaign Add-ons'))}</p>
          ${campaignProductGroups.map((group) => `
            <div class="pool-first-party-cart__field pool-first-party-cart__field--summary">
              ${showGroupTitles ? `<p class="pool-first-party-cart__field-label">${escapeHtml(group.title)}</p>` : ''}
              ${renderCartAddOnProductGrid(group.products)}
            </div>
          `).join('')}
        </section>
      `);
    }

    return sections.join('');
  }

  function getCurrentPath() {
    return String(window.location?.pathname || '/');
  }

  function isPledgeCancelledPath() {
    return /^\/(?:[a-z]{2,3}(?:-[a-z0-9]{2,8})?\/)?pledge-cancelled\/?$/.test(getCurrentPath());
  }

  function isPledgeSuccessPath() {
    return /^\/(?:[a-z]{2,3}(?:-[a-z0-9]{2,8})?\/)?pledge-success\/?$/.test(getCurrentPath());
  }

  function getPledgeSuccessOrderId() {
    if (!isPledgeSuccessPath()) return '';

    try {
      const params = new URLSearchParams(window.location?.search || '');
      return String(params.get('orderId') || '');
    } catch (_error) {
      return '';
    }
  }

  function formatConfirmationDate(value) {
    if (!value) return '';

    try {
      return new Date(value).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (_error) {
      return '';
    }
  }

  function getSnapshotCampaignSlug(snapshot) {
    if (!snapshot) return '';

    const itemSlug = getFirstPartyCampaignSlug(snapshot?.cart?.items);
    if (itemSlug) return itemSlug;

    const campaignHref = normalizeInternalHref(snapshot?.campaignUrl);
    return campaignHref.split('/campaigns/')[1]?.split('/')[0] || '';
  }

  function getCartItemFieldValue(item, fieldName) {
    const fields = Array.isArray(item?.customFields) ? item.customFields : [];
    const match = fields.find((field) => field?.name === fieldName);
    return match ? String(match.value || '') : '';
  }

  function getCartItemMetaLines(item) {
    const lines = [];
    const variantLabel = getCartItemFieldValue(item, '_variant_label');
    if (variantLabel) {
      lines.push(variantLabel);
    }
    if (item.stackable === true || (item.quantity || 1) > 1) {
      lines.push(getRuntimeMessage('cart.quantity', 'Qty %{count}').replace('%{count}', String(item.quantity || 1)));
    }
    return lines;
  }

  function buildFirstPartyCheckoutSnapshot(state) {
    const items = state?.cart?.items?.items || [];
    if (items.length === 0) return null;
    const firstCampaignItem = items.find((item) => !isAddOnCartItem(item)) || items[0];

    return {
      cart: {
        tipPercent: sanitizeTipPercent(state?.cart?.tipPercent, getDefaultPlatformTipPercent()),
        bundleAddOnAnchorCampaignSlug: resolveCartBundleAddOnAnchorCampaignSlug(
          items,
          state?.cart?.bundleAddOnAnchorCampaignSlug
        ),
        items: items.map((item) => ({
          id: item?.id || '',
          name: item?.name || '',
          price: Number(item?.price || 0),
          quantity: Math.max(1, Number(item?.quantity || 1)),
          url: item?.url || '',
          description: item?.description || '',
          imageUrl: item?.imageUrl || '',
          stackable: item?.stackable === true,
          shippable: item?.shippable === true,
          maxQuantity: Number.isFinite(Number(item?.maxQuantity)) ? Number(item?.maxQuantity) : undefined,
          customFields: Array.isArray(item?.customFields) ? item.customFields : undefined
        }))
      },
      campaignUrl: String(firstCampaignItem?.url || '/'),
      savedAt: Date.now()
    };
  }

  function writeFirstPartyCheckoutSnapshot(state) {
    const snapshot = buildFirstPartyCheckoutSnapshot(state);
    if (!snapshot) return;

    try {
      localStorage.setItem(FIRST_PARTY_CHECKOUT_SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch (_error) {}
  }

  function readFirstPartyCheckoutSnapshot() {
    const storage = getLocalStorageSafe();
    if (!storage) return null;

    try {
      const raw = storage.getItem(FIRST_PARTY_CHECKOUT_SNAPSHOT_KEY);
      if (!raw) return null;

      const snapshot = JSON.parse(raw);
      if (!Array.isArray(snapshot?.cart?.items) || snapshot.cart.items.length === 0) {
        storage.removeItem(FIRST_PARTY_CHECKOUT_SNAPSHOT_KEY);
        return null;
      }

      const savedAt = Number(snapshot?.savedAt || 0);
      if (Number.isFinite(savedAt) && savedAt > 0 && Date.now() - savedAt > FIRST_PARTY_CHECKOUT_SNAPSHOT_TTL_MS) {
        storage.removeItem(FIRST_PARTY_CHECKOUT_SNAPSHOT_KEY);
        return null;
      }

      return snapshot;
    } catch (_error) {
      return null;
    }
  }

  function buildFirstPartyCartDraftState(state) {
    const email = String(state?.cart?.email || '').trim();
    const billingAddress = state?.cart?.billingAddress && typeof state.cart.billingAddress === 'object'
      ? { ...state.cart.billingAddress }
      : {};
    const customer = state?.customer && typeof state.customer === 'object'
      ? { ...state.customer }
      : {};

    const hasBillingAddress = Object.values(billingAddress).some((value) => String(value || '').trim());
    const hasCustomer = Object.values(customer).some((value) => String(value || '').trim());

    if (!email && !hasBillingAddress && !hasCustomer) {
      return null;
    }

    return {
      email,
      billingAddress,
      customer,
      savedAt: Date.now()
    };
  }

  function writeFirstPartyCartDraftState(state) {
    const storage = getSessionStorageSafe();
    if (!storage) return;

    try {
      const payload = buildFirstPartyCartDraftState(state);
      if (!payload) {
        storage.removeItem(FIRST_PARTY_CART_DRAFT_KEY);
        return;
      }
      storage.setItem(FIRST_PARTY_CART_DRAFT_KEY, JSON.stringify(payload));
    } catch (_error) {}
  }

  function readFirstPartyCartDraftState() {
    const storage = getSessionStorageSafe();
    if (!storage) return null;

    try {
      const raw = storage.getItem(FIRST_PARTY_CART_DRAFT_KEY);
      if (!raw) return null;
      const draft = JSON.parse(raw);
      const savedAt = Number(draft?.savedAt || 0);
      if (Number.isFinite(savedAt) && savedAt > 0 && Date.now() - savedAt > FIRST_PARTY_CART_DRAFT_TTL_MS) {
        storage.removeItem(FIRST_PARTY_CART_DRAFT_KEY);
        return null;
      }

      return {
        email: String(draft?.email || ''),
        billingAddress: draft?.billingAddress && typeof draft.billingAddress === 'object'
          ? { ...draft.billingAddress }
          : {},
        customer: draft?.customer && typeof draft.customer === 'object'
          ? { ...draft.customer }
          : {}
      };
    } catch (_error) {
      return null;
    }
  }

  function clearFirstPartyCheckoutSnapshot() {
    try {
      getLocalStorageSafe()?.removeItem(FIRST_PARTY_CHECKOUT_SNAPSHOT_KEY);
    } catch (_error) {}
  }

  function writeActiveCustomCheckoutOrderId(orderId) {
    const nextOrderId = String(orderId || '').trim();
    try {
      const sessionStorage = getSessionStorageSafe();
      const localStorage = getLocalStorageSafe();
      writeTimedStorageValue(sessionStorage, ACTIVE_CUSTOM_CHECKOUT_ORDER_ID_KEY, nextOrderId);
      if (localStorage) {
        localStorage.removeItem(ACTIVE_CUSTOM_CHECKOUT_ORDER_ID_KEY);
      }
    } catch (_error) {}
  }

  function readActiveCustomCheckoutOrderId() {
    try {
      const sessionStorage = getSessionStorageSafe();
      const localStorage = getLocalStorageSafe();
      const sessionValue = readTimedStorageValue(
        sessionStorage,
        ACTIVE_CUSTOM_CHECKOUT_ORDER_ID_KEY,
        ACTIVE_CUSTOM_CHECKOUT_ORDER_ID_TTL_MS
      );
      if (sessionValue) return sessionValue;

      const migrated = readTimedStorageValue(
        localStorage,
        ACTIVE_CUSTOM_CHECKOUT_ORDER_ID_KEY,
        ACTIVE_CUSTOM_CHECKOUT_ORDER_ID_TTL_MS
      );
      if (migrated) {
        writeTimedStorageValue(sessionStorage, ACTIVE_CUSTOM_CHECKOUT_ORDER_ID_KEY, migrated);
        localStorage?.removeItem(ACTIVE_CUSTOM_CHECKOUT_ORDER_ID_KEY);
      }
      return migrated;
    } catch (_error) {
      return '';
    }
  }

  function setPendingPledgeFlag() {
    try {
      writeTimedStorageValue(getSessionStorageSafe(), PENDING_PLEDGE_KEY, 'true');
      getLocalStorageSafe()?.removeItem(PENDING_PLEDGE_KEY);
    } catch (_error) {}
  }

  function clearPendingPledgeFlag() {
    try {
      getSessionStorageSafe()?.removeItem(PENDING_PLEDGE_KEY);
      getLocalStorageSafe()?.removeItem(PENDING_PLEDGE_KEY);
    } catch (_error) {}
  }

  function buildPersistedFirstPartyCartState(state) {
    const items = coerceBundleAddOnCartItems(
      Array.isArray(state?.cart?.items?.items) ? state.cart.items.items : []
    );
    if (items.length === 0) return null;

    return {
      token: String(state?.cart?.token || `${FIRST_PARTY_CART_TOKEN_PREFIX}${Date.now().toString(36)}`),
      tipPercent: sanitizeTipPercent(state?.cart?.tipPercent, getDefaultPlatformTipPercent()),
      bundleAddOnAnchorCampaignSlug: resolveCartBundleAddOnAnchorCampaignSlug(
        items,
        state?.cart?.bundleAddOnAnchorCampaignSlug
      ),
      items: items.map((item) => ({
        id: String(item?.id || ''),
        uniqueId: String(item?.uniqueId || ''),
        name: String(item?.name || ''),
        price: Number(item?.price || 0),
        quantity: Math.max(1, Number(item?.quantity || 1)),
        url: String(item?.url || ''),
        description: String(item?.description || ''),
        imageUrl: String(item?.imageUrl || ''),
        stackable: item?.stackable === true,
        shippable: item?.shippable === true,
        campaignShippingFallbackCents: Number.isFinite(Number(item?.campaignShippingFallbackCents))
          ? Math.round(Number(item.campaignShippingFallbackCents))
          : undefined,
        campaignFreeShipping: item?.campaignFreeShipping === true
          ? true
          : item?.campaignFreeShipping === false
            ? false
            : undefined,
        maxQuantity: Number.isFinite(Number(item?.maxQuantity)) ? Number(item?.maxQuantity) : undefined,
        customFields: Array.isArray(item?.customFields) ? item.customFields : undefined
      }))
    };
  }

  function writePersistedFirstPartyCartState(state) {
    try {
      const payload = buildPersistedFirstPartyCartState(state);
      if (!payload) {
        getSessionStorageSafe()?.removeItem(FIRST_PARTY_CART_DRAFT_KEY);
        localStorage.removeItem(FIRST_PARTY_CART_STATE_KEY);
        return;
      }

      writeFirstPartyCartDraftState(state);
      localStorage.setItem(FIRST_PARTY_CART_STATE_KEY, JSON.stringify(payload));
    } catch (_error) {}
  }

  function readPersistedFirstPartyCartState() {
    try {
      const raw = localStorage.getItem(FIRST_PARTY_CART_STATE_KEY);
      if (!raw) return null;

      const persisted = JSON.parse(raw);
      if (!Array.isArray(persisted?.items) || persisted.items.length === 0) {
        return null;
      }

      const items = coerceBundleAddOnCartItems(persisted.items
        .map((item) => normalizeCartItem(item))
        .filter((item) => item.id));

      if (items.length === 0) {
        return null;
      }

      return {
        token: String(persisted?.token || `${FIRST_PARTY_CART_TOKEN_PREFIX}${Date.now().toString(36)}`),
        tipPercent: sanitizeTipPercent(persisted?.tipPercent, getDefaultPlatformTipPercent()),
        bundleAddOnAnchorCampaignSlug: resolveCartBundleAddOnAnchorCampaignSlug(
          items,
          persisted?.bundleAddOnAnchorCampaignSlug
        ),
        items
      };
    } catch (_error) {
      return null;
    }
  }

  function clearPersistedFirstPartyCartState() {
    try {
      getLocalStorageSafe()?.removeItem(FIRST_PARTY_CART_STATE_KEY);
      getSessionStorageSafe()?.removeItem(FIRST_PARTY_CART_DRAFT_KEY);
    } catch (_error) {}
  }

  function getFirstPartyCampaignSlug(items) {
    const firstCampaignItem = Array.isArray(items)
      ? items.find((item) => !isAddOnCartItem(item))
      : null;
    return getFirstPartyItemCampaignSlug(firstCampaignItem);
  }

  function getFirstPartyCampaignSlugs(items) {
    const slugs = new Set();

    for (const item of Array.isArray(items) ? items : []) {
      if (isAddOnCartItem(item)) continue;
      const slug = getFirstPartyItemCampaignSlug(item);
      if (slug) slugs.add(slug);
    }

    return Array.from(slugs);
  }

  function invalidateLiveCampaignCaches(campaignSlugs) {
    const slugs = Array.from(new Set((campaignSlugs || []).filter(Boolean)));
    if (slugs.length === 0) return;

    addOnInventorySnapshot = null;
    addOnInventoryRequest = null;
    addOnUtils.invalidateCachedInventory();

    slugs.forEach((slug) => {
      try {
        localStorage.removeItem(`pool_stats_${slug}`);
        localStorage.removeItem(`pool_inventory_${slug}`);
      } catch (_error) {}
    });

    if (typeof window.invalidateStatsCache === 'function') {
      slugs.forEach((slug) => window.invalidateStatsCache(slug));
    }

    if (typeof window.invalidateInventoryCache === 'function') {
      slugs.forEach((slug) => window.invalidateInventoryCache(slug));
    }
  }

  function markLiveCampaignRefreshNeeded(campaignSlugs) {
    const slugs = Array.from(new Set((campaignSlugs || []).filter(Boolean)));
    if (slugs.length === 0) return;

    try {
      getLocalStorageSafe()?.setItem(LIVE_REFRESH_MARKER_KEY, JSON.stringify({
        campaignSlugs: slugs,
        timestamp: Date.now()
      }));
    } catch (_error) {}
  }

  function getCurrentLang() {
    return window.POOL_CONFIG?.i18n?.currentLang || document.documentElement.lang || 'en';
  }

  function cartHasPledgeItems(items) {
    return Array.isArray(items) && items.some((item) => !isAddOnCartItem(item));
  }

  function coerceBundleAddOnCartItems(items) {
    const nextItems = Array.isArray(items) ? items : [];
    if (!cartHasPledgeItems(nextItems)) {
      return nextItems.filter((item) => !isAddOnCartItem(item));
    }

    const campaignSlugs = new Set(getFirstPartyCampaignSlugs(nextItems));
    return nextItems.filter((item) => {
      if (!isAddOnCartItem(item)) return true;
      const selection = addOnUtils.selectionFromCartItem
        ? addOnUtils.selectionFromCartItem(item, ADD_ON_CATALOG)
        : null;
      if (!selection) return true;
      if (!isCampaignScopedAddOn(selection)) return true;
      const campaignSlug = getAddOnCampaignSlug(selection);
      return Boolean(campaignSlug) && campaignSlugs.has(campaignSlug);
    });
  }

  function buildFirstPartyCheckoutPayload(state) {
    const items = state?.cart?.items?.items || [];
    if (items.length === 0) {
      return {
        valid: false,
        error: 'Your cart is empty.'
      };
    }

    const resolvedAnchorCampaignSlug = resolveCartBundleAddOnAnchorCampaignSlug(
      items,
      state?.cart?.bundleAddOnAnchorCampaignSlug
    );
    const hasBundleAddOns = getCartBundleAddOnSelections(items).length > 0;
    const campaignSlug = hasBundleAddOns && resolvedAnchorCampaignSlug
      ? resolvedAnchorCampaignSlug
      : getFirstPartyCampaignSlug(items);
    if (!campaignSlug) {
      return {
        valid: false,
        error: cartHasPledgeItems(items)
          ? 'Could not determine which campaign this pledge belongs to.'
          : 'Add-on products require at least one pledge in the cart.'
      };
    }

    let customAmount = 0;
    const checkoutItems = [];

    for (const item of items) {
      const itemId = String(item?.id || '');
      if (!itemId || !itemId.includes('__')) {
        return {
          valid: false,
          error: 'This cart contains an unsupported item.'
        };
      }

      if (itemId.includes('__registry__') || itemId.includes('__ongoing__')) {
        return {
          valid: false,
          error: 'This pledge still uses the legacy checkout path.'
        };
      }

      if (itemId.includes('__custom-support')) {
        checkoutItems.push({
          id: itemId,
          amount: Math.round((Number(item?.price) || 0) * (Number(item?.quantity) || 1))
        });
        continue;
      }

      if (itemId.includes('__support__')) {
        checkoutItems.push({
          id: itemId,
          amount: Math.round((Number(item?.price) || 0) * (Number(item?.quantity) || 1))
        });
        continue;
      }

      checkoutItems.push({
        id: itemId,
        quantity: Math.max(1, Number(item?.quantity || 1))
      });
    }

        return {
          valid: true,
          payload: {
            campaignSlug,
            items: checkoutItems,
            customAmount,
            tipPercent: sanitizeTipPercent(state?.cart?.tipPercent, getDefaultPlatformTipPercent()),
            preferredLang: getCurrentLang(),
            bundleAddOnAnchorCampaignSlug: hasBundleAddOns ? resolvedAnchorCampaignSlug : ''
          }
        };
  }

  function buildFirstPartyInitialState() {
    const persisted = readPersistedFirstPartyCartState();
    const draft = readFirstPartyCartDraftState();
    const persistedItems = persisted?.items || [];
    const persistedTipPercent = sanitizeTipPercent(persisted?.tipPercent, getDefaultPlatformTipPercent());
    const persistedTotals = calculateCartTotals(
      persistedItems,
      persistedTipPercent,
      resolveCartBundleAddOnAnchorCampaignSlug(persistedItems, persisted?.bundleAddOnAnchorCampaignSlug)
    );
    const draftEmail = String(draft?.email || '');

    return {
      cart: {
        token: persisted?.token || `${FIRST_PARTY_CART_TOKEN_PREFIX}${Date.now().toString(36)}`,
        paymentSession: {
          publicToken: null
        },
        subtotal: persistedTotals.subtotal || 0,
        total: persistedTotals.total || 0,
        email: draftEmail,
        tipPercent: persistedTipPercent,
        bundleAddOnAnchorCampaignSlug: resolveCartBundleAddOnAnchorCampaignSlug(
          persistedItems,
          persisted?.bundleAddOnAnchorCampaignSlug
        ),
        billingAddress: draft?.billingAddress || {},
        items: {
          count: persistedItems.length,
          items: persistedItems
        }
      },
      customer: draft?.customer || (draftEmail ? { email: draftEmail } : {})
    };
  }

  function buildFirstPartyProvider() {
    const eventBus = createEventBus();
    const store = createStore(buildFirstPartyInitialState());
    let currentRoute = null;
    let isCartOpen = false;
    let suppressDrawerRerender = false;
    let activeCustomCheckoutMount = null;
    let customCheckoutShippingQuoteToken = 0;
    let customCheckoutFlowToken = 0;
    let lastCustomCheckoutShippingSignature = '';
    let persistedCustomCheckoutEmailDraft = '';
    let persistedCustomCheckoutShippingDraft = null;
    let cartDialogCleanup = null;
    let cartBackgroundUnlock = null;
    let cartReturnFocusTarget = null;
    let cartShouldFocusAfterRender = false;
    let checkoutUiState = {
      status: 'idle',
      error: '',
      mode: getCheckoutUiMode(),
      customCheckout: null
    };

    function emitStateChanged() {
      const state = store.getState();
      store.setState(state);
    }

    function updateCartState(updater) {
      const currentState = store.getState();
      const nextState = updater(currentState);
      store.setState(nextState);
      writePersistedFirstPartyCartState(nextState);
      return nextState;
    }

    function applyCartBundleAddOnSelections(selections) {
      const normalizedSelections = addOnUtils.normalizeSelections
        ? addOnUtils.normalizeSelections(selections, ADD_ON_CATALOG)
        : [];

      const nextState = updateCartState((state) => {
        const currentItems = Array.isArray(state?.cart?.items?.items) ? state.cart.items.items : [];
        const nonAddOnItems = currentItems.filter((item) => !isAddOnCartItem(item));
        const existingAddOnItems = currentItems.filter((item) => isAddOnCartItem(item));
        const existingById = new Map(existingAddOnItems.map((item) => [String(item.id || ''), item]));
        const nextAddOnItems = normalizedSelections
          .map((selection) => addOnUtils.buildCartItem(selection, ADD_ON_CATALOG))
          .filter(Boolean)
          .map((item) => {
            const existingItem = existingById.get(String(item.id || ''));
            return normalizeCartItem({
              ...item,
              uniqueId: existingItem?.uniqueId || item.uniqueId
            });
          });
        const nextItems = coerceBundleAddOnCartItems(nonAddOnItems.concat(nextAddOnItems));
        const totals = calculateCartTotals(
          nextItems,
          state.cart?.tipPercent,
          resolveCartBundleAddOnAnchorCampaignSlug(nextItems, state.cart?.bundleAddOnAnchorCampaignSlug)
        );

        return {
          ...state,
          cart: {
            ...state.cart,
            ...totals,
            bundleAddOnAnchorCampaignSlug: resolveCartBundleAddOnAnchorCampaignSlug(
              nextItems,
              state.cart?.bundleAddOnAnchorCampaignSlug
            ),
            items: {
              count: nextItems.length,
              items: nextItems
            }
          }
        };
      });

      if (currentRoute === CHECKOUT_VIEW_ROUTE && checkoutUiState.mode === 'custom') {
        void refreshCustomCheckoutShippingEstimate();
        syncCheckoutPreviewSummaryUI();
      }

      return nextState;
    }

    function updateCartBundleAddOnAnchorCampaignSlug(nextSlug) {
      updateCartState((state) => {
        const currentItems = Array.isArray(state?.cart?.items?.items) ? state.cart.items.items : [];
        return {
          ...state,
          cart: {
            ...state.cart,
            bundleAddOnAnchorCampaignSlug: resolveCartBundleAddOnAnchorCampaignSlug(
              currentItems,
              nextSlug
            )
          }
        };
      });
    }

    function ensureFirstPartyCartRoot() {
      const root = getCartRoot();
      if (!root) return null;

      root.hidden = false;
      root.classList.add('pool-first-party-cart-root');
      return root;
    }

    function isFocusableNode(node) {
      return node instanceof HTMLElement &&
        !node.hidden &&
        node.getAttribute('aria-hidden') !== 'true' &&
        !node.closest('[hidden],[aria-hidden="true"]');
    }

    function getFocusableNodes(container) {
      if (!(container instanceof HTMLElement)) return [];

      return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((node) => {
        if (!isFocusableNode(node)) return false;
        if ('disabled' in node && node.disabled) return false;
        return true;
      });
    }

    function rememberCartReturnFocus(node) {
      const target = node instanceof HTMLElement ? node : document.activeElement;
      if (!(target instanceof HTMLElement)) return;
      if (getCartRoot()?.contains(target)) return;
      cartReturnFocusTarget = target;
    }

    function restoreCartReturnFocus() {
      const target = cartReturnFocusTarget;
      if (!(target instanceof HTMLElement)) return;
      if (!target.isConnected) return;
      window.setTimeout(() => {
        if (!(target instanceof HTMLElement) || !target.isConnected) return;
        try {
          target.focus();
        } catch (_error) {}
      }, 0);
    }

    function lockCartBackground(root) {
      Array.from(document.body.children).forEach((child) => {
        if (!(child instanceof HTMLElement) || child === root) return;
        child.setAttribute('data-pool-cart-lock', 'true');
        child.setAttribute('data-pool-cart-prev-aria-hidden', child.getAttribute('aria-hidden') ?? '__none__');
        child.setAttribute('data-pool-cart-prev-inert', child.inert ? 'true' : 'false');
        child.setAttribute('aria-hidden', 'true');
        child.inert = true;
      });

      return function unlockCartBackground() {
        document.querySelectorAll('[data-pool-cart-lock="true"]').forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          const ariaHidden = node.getAttribute('data-pool-cart-prev-aria-hidden');
          const inert = node.getAttribute('data-pool-cart-prev-inert');
          if (ariaHidden === '__none__' || ariaHidden === null) {
            node.removeAttribute('aria-hidden');
          } else {
            node.setAttribute('aria-hidden', ariaHidden);
          }
          node.inert = inert === 'true';
          node.removeAttribute('data-pool-cart-lock');
          node.removeAttribute('data-pool-cart-prev-aria-hidden');
          node.removeAttribute('data-pool-cart-prev-inert');
        });
      };
    }

    function teardownCartDialog() {
      if (typeof cartDialogCleanup === 'function') {
        cartDialogCleanup();
      }
      cartDialogCleanup = null;
      if (typeof cartBackgroundUnlock === 'function') {
        cartBackgroundUnlock();
      }
      cartBackgroundUnlock = null;
    }

    function focusCartDialog(panel) {
      const preferred =
        panel.querySelector('[data-cart-dialog-initial-focus]') ||
        panel.querySelector('[data-cart-close]') ||
        getFocusableNodes(panel)[0] ||
        panel;

      if (!(preferred instanceof HTMLElement)) return;
      try {
        preferred.focus();
      } catch (_error) {}
    }

    function activateCartDialog(root) {
      const panel = root.querySelector('.pool-first-party-cart__panel');
      if (!(panel instanceof HTMLElement)) return;

      cartBackgroundUnlock = lockCartBackground(root);
      const handleKeydown = function(event) {
        if (!isCartOpen) return;
        if (!root.contains(panel)) return;

        if (event.key === 'Escape') {
          event.preventDefault();
          requestCloseFirstPartyCart();
          return;
        }

        if (event.key !== 'Tab') return;

        const focusable = getFocusableNodes(panel);
        if (!focusable.length) {
          event.preventDefault();
          panel.focus();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      };

      document.addEventListener('keydown', handleKeydown, true);
      cartDialogCleanup = function() {
        document.removeEventListener('keydown', handleKeydown, true);
      };

      if (cartShouldFocusAfterRender) {
        focusCartDialog(panel);
        cartShouldFocusAfterRender = false;
      }
    }

    function restoreCheckoutFromSnapshot(snapshot) {
      if (!snapshot?.cart?.items?.length) return false;

      const nextItems = snapshot.cart.items.map((item) => normalizeCartItem(item));
      const draft = readFirstPartyCartDraftState();
      const nextEmail = String(draft?.email || snapshot?.cart?.email || '');
      const nextTipPercent = sanitizeTipPercent(snapshot?.cart?.tipPercent, getDefaultPlatformTipPercent());
      const totals = calculateCartTotals(
        nextItems,
        nextTipPercent,
        resolveCartBundleAddOnAnchorCampaignSlug(
          nextItems,
          snapshot?.cart?.bundleAddOnAnchorCampaignSlug || ''
        )
      );

      store.setState({
        ...store.getState(),
        customer: {
          ...store.getState().customer,
          ...(draft?.customer || {}),
          email: nextEmail
        },
        cart: {
          ...store.getState().cart,
          ...totals,
          email: nextEmail,
          tipPercent: nextTipPercent,
          billingAddress: draft?.billingAddress || store.getState().cart?.billingAddress || {},
          items: {
            count: nextItems.length,
            items: nextItems
          }
        }
      });
      writePersistedFirstPartyCartState(store.getState());

      return true;
    }

    function restoreSavedCheckoutIntoCartState() {
      const snapshot = readFirstPartyCheckoutSnapshot();
      if (!snapshot) return false;

      const currentItems = store.getState()?.cart?.items?.items || [];
      if (currentItems.length > 0) return true;

      return restoreCheckoutFromSnapshot(snapshot);
    }

    function renderCancelledRecoveryCard() {
      if (!isPledgeCancelledPath()) return;

      const snapshot = readFirstPartyCheckoutSnapshot();
      const resultRoot = document.querySelector('.pledge-result');
      if (!snapshot || !resultRoot) return;
      if (resultRoot.querySelector('[data-first-party-recovery]')) return;

      const campaignHref = normalizeInternalHref(snapshot.campaignUrl);
      const card = document.createElement('section');
      card.className = 'pledge-result__recovery';
      card.setAttribute('data-first-party-recovery', 'true');
      card.innerHTML = `
        <p class="pledge-result__note"><strong>Your saved pledge is still here.</strong> You can reopen the pledge review or head back to the campaign without rebuilding your cart.</p>
        <p class="pledge-result__meta" data-first-party-recovery-title hidden></p>
        <p class="pledge-result__meta" data-first-party-recovery-status hidden></p>
        <div class="pledge-result__recovery-actions">
          <button type="button" class="btn" data-resume-first-party-pledge>Review Saved Pledge</button>
          <a href="${campaignHref}" class="btn btn--secondary">Return to Campaign</a>
        </div>
      `;

      const primaryButton = resultRoot.querySelector('.btn');
      if (primaryButton?.parentNode) {
        primaryButton.parentNode.insertBefore(card, primaryButton);
      } else {
        resultRoot.appendChild(card);
      }
    }

    async function fetchFirstPartyRecoverySummary(campaignSlug) {
      if (!campaignSlug) return null;

      try {
        const response = await fetch(
          `${getWorkerBase()}/checkout-intent/recovery?campaignSlug=${encodeURIComponent(campaignSlug)}`
        );
        if (!response.ok) return null;

        const payload = await response.json();
        if (!payload || payload.campaignSlug !== campaignSlug) return null;
        return payload;
      } catch (_error) {
        return null;
      }
    }

    function renderSuccessSummaryCard() {
      return;
    }

    async function fetchFirstPartySuccessSummary(orderId) {
      if (!isFirstPartyOrderId(orderId)) return null;

      try {
        const response = await fetch(
          `${getWorkerBase()}/checkout-intent/summary?orderId=${encodeURIComponent(orderId)}`,
          { cache: 'no-store' }
        );
        if (!response.ok) return null;

        const payload = await response.json();
        if (!payload || payload.orderId !== orderId) return null;
        return payload;
      } catch (_error) {
        return null;
      }
    }

    async function waitForPersistedFirstPartyCheckout(orderId, options) {
      if (!isFirstPartyOrderId(orderId)) {
        return { ok: false, summary: null };
      }

      const timeoutMs = Math.max(1000, Number(options?.timeoutMs || 15000));
      const pollIntervalMs = Math.max(250, Number(options?.pollIntervalMs || 750));
      const deadline = Date.now() + timeoutMs;
      let lastSummary = null;

      while (Date.now() <= deadline) {
        const summary = await fetchFirstPartySuccessSummary(orderId);
        if (summary) {
          lastSummary = summary;
          if (summary.persisted === true || Boolean(summary.createdAt)) {
            return { ok: true, summary };
          }
        }

        if (Date.now() >= deadline) break;

        await new Promise((resolve) => {
          window.setTimeout(resolve, pollIntervalMs);
        });
      }

      return {
        ok: false,
        summary: lastSummary
      };
    }

    async function recoverCompletedFirstPartyCheckout(orderId, sessionId) {
      if (!isFirstPartyOrderId(orderId) || !sessionId) {
        return { ok: false };
      }

      try {
        const response = await fetch(`${getWorkerBase()}/checkout-intent/complete`, {
          method: 'POST',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            orderId,
            sessionId
          })
        });

        const payload = await response.json().catch(() => ({}));
        return {
          ok: response.ok && payload?.persisted === true,
          payload
        };
      } catch (_error) {
        return { ok: false };
      }
    }

    async function hydrateSuccessSummaryCardFromBackend() {
      return;
    }

    async function hydrateRecoveryCardFromBackend() {
      const snapshot = readFirstPartyCheckoutSnapshot();
      if (!snapshot) return;

      const campaignSlug = getSnapshotCampaignSlug(snapshot);
      if (!campaignSlug) return;

      const recovery = await fetchFirstPartyRecoverySummary(campaignSlug);
      if (!recovery) return;

      const recoveryCard = document.querySelector('[data-first-party-recovery]');
      if (!recoveryCard) return;

      const title = recoveryCard.querySelector('[data-first-party-recovery-title]');
      const status = recoveryCard.querySelector('[data-first-party-recovery-status]');

      if (title && recovery?.campaignTitle) {
        title.hidden = false;
        title.textContent = `Campaign: ${recovery.campaignTitle}`;
      }

      if (status && recovery?.statusMessage) {
        status.hidden = false;
        status.textContent = recovery.acceptingPledges
          ? recovery.statusMessage
          : `${recovery.statusMessage}. We’ll recheck everything before payment.`;
      }
    }

    function renderFirstPartyCart() {
      const root = ensureFirstPartyCartRoot();
      document.documentElement.classList.toggle('pool-cart-open', Boolean(root) && isCartOpen);
      document.body.classList.toggle('pool-cart-open', Boolean(root) && isCartOpen);
      if (!root) return;

      if (!isCartOpen) {
        teardownCartDialog();
        teardownActiveCustomCheckoutMount();
        root.innerHTML = '';
        root.setAttribute('aria-hidden', 'true');
        return;
      }

      teardownCartDialog();

      const state = store.getState();
      const items = state.cart.items.items || [];
      const total = Number(state.cart.total || 0);
      const isCheckoutPreview = currentRoute === CHECKOUT_VIEW_ROUTE;
      const isFirstPartyCheckoutEnabled = getRequestedCheckoutProvider() === FIRST_PARTY_CHECKOUT_PROVIDER;
      const pricing = getDisplayedFirstPartyPricing(state, {
        currentRoute,
        checkoutMode: checkoutUiState.mode,
        shippingQuote: checkoutUiState.customCheckout?.shippingQuote
      });
      const resolvedBundleAddOnAnchorCampaignSlug = resolveCartBundleAddOnAnchorCampaignSlug(
        items,
        state?.cart?.bundleAddOnAnchorCampaignSlug
      );
      const hasPhysicalItems = cartHasPhysicalItems(items);
      const checkoutLineItems = buildCheckoutLineItems(items);
      const wantsCustomCheckout = isCheckoutPreview &&
        isFirstPartyCheckoutEnabled &&
        getCheckoutUiMode() === 'custom';
      const isCustomCheckout = wantsCustomCheckout && checkoutUiState.mode === 'custom';
      const customCheckout = checkoutUiState.customCheckout || {};
      const isDeferredCustomCheckoutStart = shouldDeferPhysicalCustomCheckoutStart(state, {
        currentRoute,
        checkoutMode: checkoutUiState.mode,
        hasCustomCheckoutSession: Boolean(checkoutUiState.customCheckout?.sessionId || checkoutUiState.customCheckout?.clientSecret)
      });
      const checkoutErrorMarkup = `
        <p class="pool-first-party-cart__error" data-cart-checkout-error role="alert" ${checkoutUiState.error ? '' : 'hidden'}>${escapeHtml(checkoutUiState.error || '')}</p>
      `;
      const customCheckoutMarkup = wantsCustomCheckout ? `
        ${hasPhysicalItems ? `
          <div class="pool-first-party-cart__callout pool-first-party-cart__callout--stripe">
            <p class="pool-first-party-cart__section-label">${escapeHtml(getRuntimeMessage('cart.shippingAddress', 'Contact & Shipping address'))}</p>
            <div class="pool-first-party-cart__shipping-fallback pool-first-party-cart__shipping-fallback--plain" data-cart-custom-shipping-fallback>
              <div class="pool-first-party-cart__shipping-grid">
                <div class="pool-first-party-cart__field pool-first-party-cart__field--full">
                  <label class="pool-first-party-cart__field-label" for="pool-custom-shipping-name">${escapeHtml(getRuntimeMessage('cart.fullName', 'Full name'))} <span class="pool-first-party-cart__required-mark" aria-hidden="true">*</span></label>
                  <input id="pool-custom-shipping-name" name="name" class="pool-first-party-cart__input" type="text" autocomplete="name" autocapitalize="words" aria-describedby="pool-custom-shipping-error" aria-invalid="${customCheckout?.shippingError ? 'true' : 'false'}" value="${escapeHtml(getPersistedCustomCheckoutShippingDraft()?.name || '')}" data-cart-custom-shipping-field="name">
                </div>
                <div class="pool-first-party-cart__field pool-first-party-cart__field--full">
                  <label class="pool-first-party-cart__field-label" for="pool-custom-checkout-email-fallback">${escapeHtml(getRuntimeMessage('cart.emailAddress', 'Email address'))} <span class="pool-first-party-cart__required-mark" aria-hidden="true">*</span></label>
                  <input
                    id="pool-custom-checkout-email-fallback"
                    name="email"
                    class="pool-first-party-cart__input"
                    type="email"
                    inputmode="email"
                    autocomplete="email"
                    autocapitalize="off"
                    spellcheck="false"
                    aria-describedby="pool-custom-checkout-email-error"
                    value="${escapeHtml(getPersistedCustomCheckoutEmailDraft())}"
                    data-cart-custom-checkout-email
                  >
                  <p id="pool-custom-checkout-email-error" class="pool-first-party-cart__field-error" data-cart-custom-checkout-email-error ${customCheckout?.emailError ? '' : 'hidden'}>${escapeHtml(customCheckout?.emailError || '')}</p>
                </div>
                <div class="pool-first-party-cart__field pool-first-party-cart__field--full">
                  <label class="pool-first-party-cart__field-label" for="pool-custom-shipping-line1">${escapeHtml(getRuntimeMessage('cart.addressLine1', 'Address line 1'))} <span class="pool-first-party-cart__required-mark" aria-hidden="true">*</span></label>
                  <input id="pool-custom-shipping-line1" name="address-line1" class="pool-first-party-cart__input" type="text" autocomplete="shipping address-line1" autocapitalize="words" aria-describedby="pool-custom-shipping-error" aria-invalid="${customCheckout?.shippingError ? 'true' : 'false'}" value="${escapeHtml(getPersistedCustomCheckoutShippingDraft()?.address?.line1 || '')}" data-cart-custom-shipping-field="line1">
                </div>
                <div class="pool-first-party-cart__field pool-first-party-cart__field--full">
                  <label class="pool-first-party-cart__field-label" for="pool-custom-shipping-line2">${escapeHtml(getRuntimeMessage('cart.addressLine2', 'Address line 2'))}</label>
                  <input id="pool-custom-shipping-line2" name="address-line2" class="pool-first-party-cart__input" type="text" autocomplete="shipping address-line2" autocapitalize="words" aria-describedby="pool-custom-shipping-error" aria-invalid="${customCheckout?.shippingError ? 'true' : 'false'}" value="${escapeHtml(getPersistedCustomCheckoutShippingDraft()?.address?.line2 || '')}" data-cart-custom-shipping-field="line2">
                </div>
                <div class="pool-first-party-cart__field">
                  <label class="pool-first-party-cart__field-label" for="pool-custom-shipping-city">${escapeHtml(getRuntimeMessage('cart.city', 'City'))} <span class="pool-first-party-cart__required-mark" aria-hidden="true">*</span></label>
                  <input id="pool-custom-shipping-city" name="address-level2" class="pool-first-party-cart__input" type="text" autocomplete="shipping address-level2" autocapitalize="words" aria-describedby="pool-custom-shipping-error" aria-invalid="${customCheckout?.shippingError ? 'true' : 'false'}" value="${escapeHtml(getPersistedCustomCheckoutShippingDraft()?.address?.city || '')}" data-cart-custom-shipping-field="city">
                </div>
                <div class="pool-first-party-cart__field">
                  <label class="pool-first-party-cart__field-label" for="pool-custom-shipping-state">${escapeHtml(getRuntimeMessage('cart.stateProvince', 'State / Province'))} <span class="pool-first-party-cart__required-mark" aria-hidden="true">*</span></label>
                  <input id="pool-custom-shipping-state" name="address-level1" class="pool-first-party-cart__input" type="text" autocomplete="shipping address-level1" autocapitalize="characters" aria-describedby="pool-custom-shipping-error" aria-invalid="${customCheckout?.shippingError ? 'true' : 'false'}" value="${escapeHtml(getPersistedCustomCheckoutShippingDraft()?.address?.state || '')}" data-cart-custom-shipping-field="state">
                </div>
                <div class="pool-first-party-cart__field">
                  <label class="pool-first-party-cart__field-label" for="pool-custom-shipping-postal">${escapeHtml(getRuntimeMessage('cart.postalCode', 'Postal code'))} <span class="pool-first-party-cart__required-mark" aria-hidden="true">*</span></label>
                  <input id="pool-custom-shipping-postal" name="postal-code" class="pool-first-party-cart__input" type="text" inputmode="numeric" autocomplete="shipping postal-code" aria-describedby="pool-custom-shipping-error" aria-invalid="${customCheckout?.shippingError ? 'true' : 'false'}" value="${escapeHtml(getPersistedCustomCheckoutShippingDraft()?.address?.postal_code || '')}" data-cart-custom-shipping-field="postal_code">
                </div>
                <div class="pool-first-party-cart__field">
                  <label class="pool-first-party-cart__field-label" for="pool-custom-shipping-country">${escapeHtml(getRuntimeMessage('cart.country', 'Country'))} <span class="pool-first-party-cart__required-mark" aria-hidden="true">*</span></label>
                  <select id="pool-custom-shipping-country" name="country" class="pool-first-party-cart__input pool-first-party-cart__input--select" autocomplete="shipping country" aria-describedby="pool-custom-shipping-error" aria-invalid="${customCheckout?.shippingError ? 'true' : 'false'}" data-cart-custom-shipping-field="country">
                    ${renderShippingCountryOptions(getPersistedCustomCheckoutShippingDraft()?.address?.country || DEFAULT_SHIPPING_COUNTRY)}
                  </select>
                </div>
              </div>
              <p id="pool-custom-shipping-error" class="pool-first-party-cart__field-error" data-cart-custom-shipping-error role="alert" ${customCheckout?.shippingError ? '' : 'hidden'}>${escapeHtml(customCheckout?.shippingError || '')}</p>
            </div>
          </div>
        ` : `
          <div class="pool-first-party-cart__callout pool-first-party-cart__callout--stripe">
            <p class="pool-first-party-cart__section-label">${escapeHtml(getRuntimeMessage('cart.contact', 'Contact'))}</p>
            <div class="pool-first-party-cart__stripe-shell">
              <div class="pool-first-party-cart__field pool-first-party-cart__field--compact" data-cart-custom-checkout-email-fallback>
                <label class="pool-first-party-cart__field-label" for="pool-custom-checkout-email">${escapeHtml(getRuntimeMessage('cart.emailAddress', 'Email address'))} <span class="pool-first-party-cart__required-mark" aria-hidden="true">*</span></label>
                  <input
                    id="pool-custom-checkout-email"
                    class="pool-first-party-cart__input"
                    type="email"
                    inputmode="email"
                    autocomplete="email"
                    aria-describedby="pool-custom-checkout-email-error"
                    value="${escapeHtml(getPersistedCustomCheckoutEmailDraft())}"
                    data-cart-custom-checkout-email
                  >
                <p id="pool-custom-checkout-email-error" class="pool-first-party-cart__field-error" data-cart-custom-checkout-email-error ${customCheckout?.emailError ? '' : 'hidden'}>${escapeHtml(customCheckout?.emailError || '')}</p>
              </div>
            </div>
          </div>
        `}
        <div class="pool-first-party-cart__callout pool-first-party-cart__callout--stripe">
          <p class="pool-first-party-cart__section-label">${escapeHtml(getRuntimeMessage('cart.paymentMethod', 'Payment method'))}</p>
          <div class="pool-first-party-cart__stripe-shell">
            <div class="pool-first-party-cart__stripe-region pool-first-party-cart__stripe-region--payment" data-cart-custom-checkout-region="payment"></div>
          </div>
          <p class="pool-first-party-cart__note pool-first-party-cart__note--payment-consent">${escapeHtml(getRuntimeMessage('cart.paymentConsent', 'By providing your card information, you allow %{platform} to charge your card if the campaign(s) you backed reaches its goal before its end date.').replace('%{platform}', getPlatformName()))}</p>
        </div>
      ` : `
        <div class="pool-first-party-cart__callout">
          <p class="pool-first-party-cart__section-label">${escapeHtml(getRuntimeMessage('cart.nextStep', 'Next step'))}</p>
          <p class="pool-first-party-cart__note">${escapeHtml(getRuntimeMessage('cart.hostedCheckoutNote', "Continue to Stripe's secure payment platform to enter your payment information and email address -- this finalizes your pledge. You will only be charged if the campaign funds successfully."))}</p>
        </div>
      `;
      const itemMarkup = items.length > 0 ? items.map((item) => {
        const metaLines = getCartItemMetaLines(item);
        return `
        <li class="pool-first-party-cart__item" data-item-id="${item.uniqueId}">
          ${item.imageUrl ? `
            <div class="pool-first-party-cart__item-media">
              <img class="pool-first-party-cart__item-image" src="${escapeAttribute(item.imageUrl)}" alt="" loading="lazy" decoding="async">
            </div>
          ` : ''}
          <div class="pool-first-party-cart__item-main">
            <strong class="pool-first-party-cart__item-name">${escapeHtml(item.name || item.id || getRuntimeMessage('cart.untitledItem', 'Untitled item'))}</strong>
            ${item.description ? `<p class="pool-first-party-cart__item-description">${escapeHtml(item.description)}</p>` : ''}
            ${metaLines.map((line) => `<span class="pool-first-party-cart__item-meta">${escapeHtml(line)}</span>`).join('')}
          </div>
          <div class="pool-first-party-cart__item-actions">
            <span class="pool-first-party-cart__item-price">${formatCurrency((item.price || 0) * (item.quantity || 1))}</span>
            <button type="button" class="pool-first-party-cart__remove" data-remove-item="${item.uniqueId}">${escapeHtml(getRuntimeMessage('cart.remove', 'Remove'))}</button>
          </div>
        </li>
      `;
      }).join('') : `
        <li class="pool-first-party-cart__empty">${escapeHtml(getRuntimeMessage('cart.empty', 'Your cart is empty.'))}</li>
      `;
      const cartEstimateMarkup = items.length > 0 ? `
        <div class="pool-first-party-cart__tip-box">
          <div class="pool-first-party-cart__tip-header">
            <strong id="pool-cart-tip-label">${escapeHtml(getRuntimeMessage('cart.tipLabel', `Tip ${getPlatformName()} for platform maintenance.`))}</strong>
            <span id="pool-cart-tip-amount" data-cart-tip-amount>${formatCents(pricing.tipAmountCents)}</span>
          </div>
          <p class="pool-first-party-cart__tip-copy" id="pool-cart-tip-copy">${escapeHtml(getRuntimeMessage('cart.tipCopy', `${getPlatformName()} has a 0% platform fee for organizers. Optional tips help keep the platform sustainable for creators.`))}</p>
          <div class="pool-first-party-cart__tip-controls">
            <input
              id="pool-cart-tip-input"
              class="pool-first-party-cart__tip-slider"
              type="range"
              min="0"
              max="${getMaxPlatformTipPercent()}"
              step="1"
              value="${pricing.tipPercent}"
              aria-labelledby="pool-cart-tip-label"
              aria-describedby="pool-cart-tip-copy pool-cart-tip-percent"
              aria-valuetext="${escapeAttribute(formatTipSliderValueText(pricing.tipPercent, pricing.tipAmountCents))}"
              data-cart-tip
            >
            <span class="pool-first-party-cart__tip-percent" id="pool-cart-tip-percent" data-cart-tip-percent>${pricing.tipPercent}%</span>
          </div>
        </div>
        <section class="pool-first-party-cart__callout">
          <p class="pool-first-party-cart__section-label">${escapeHtml(getRuntimeMessage('cart.pledgeTotal', 'Pledge total'))}</p>
          <div class="pool-first-party-cart__checkout-summary">
            <div class="pool-first-party-cart__summary-row">
              <span>${escapeHtml(getRuntimeMessage('cart.subtotal', 'Subtotal'))}</span>
              <strong data-cart-summary-subtotal>${formatCents(pricing.subtotalCents)}</strong>
            </div>
            ${pricing.tipAmountCents > 0 ? `
              <div class="pool-first-party-cart__summary-row" data-cart-summary-tip-row>
                <span data-cart-summary-tip-label>${escapeHtml(getRuntimeMessage('cart.tipWithPercent', '%{platform} tip (%{percent}%)').replace('%{platform}', getPlatformName()).replace('%{percent}', String(pricing.tipPercent)))}</span>
                <strong data-cart-summary-tip-amount>${formatCents(pricing.tipAmountCents)}</strong>
              </div>
            ` : ''}
            <div class="pool-first-party-cart__summary-row">
              <span>${formatTaxRateLabel()}</span>
              <strong data-cart-summary-tax>${formatCents(pricing.taxCents)}</strong>
            </div>
            ${pricing.shippingCents > 0 ? `
              <div class="pool-first-party-cart__summary-row" data-cart-summary-shipping-row>
                <span data-cart-summary-shipping-label>${escapeHtml(pricing.shippingLabel || getRuntimeMessage('cart.shipping', 'Shipping'))}</span>
                <strong data-cart-summary-shipping>${formatCents(pricing.shippingCents)}</strong>
              </div>
            ` : ''}
            <div class="pool-first-party-cart__summary-row pool-first-party-cart__summary-row--total">
              <span data-cart-summary-total-label>${escapeHtml(pricing.totalLabel || getRuntimeMessage('cart.pledgeTotal', 'Pledge total'))}</span>
              <strong data-cart-summary-total>${formatCents(pricing.totalCents)}</strong>
            </div>
          </div>
        </section>
      ` : '';
      const cartAddOnMarkup = renderCartAddOnSection(items, resolvedBundleAddOnAnchorCampaignSlug);
      const bodyMarkup = isCheckoutPreview ? `
        <section class="pool-first-party-cart__checkout-preview">
          <div class="pool-first-party-cart__summary-block">
            <div class="pool-first-party-cart__line-items">
              <p class="pool-first-party-cart__section-label">${escapeHtml(getRuntimeMessage('cart.pledgeSummary', 'Pledge summary'))}</p>
              <ul class="pool-first-party-cart__line-item-list">
                ${checkoutLineItems.map((item) => `
                  <li class="pool-first-party-cart__line-item">
                    <div>
                      <strong class="pool-first-party-cart__line-item-name">${escapeHtml(item.name)}</strong>
                      ${item.showQuantity ? `<span>${escapeHtml(getRuntimeMessage('cart.quantity', 'Qty %{count}').replace('%{count}', String(item.quantity)))}</span>` : ''}
                    </div>
                    <strong class="pool-first-party-cart__line-item-amount">${formatCents(item.amountCents)}</strong>
                  </li>
                `).join('')}
              </ul>
            </div>
            <div class="pool-first-party-cart__checkout-summary">
              <div class="pool-first-party-cart__summary-row">
                <span>${escapeHtml(getRuntimeMessage('cart.subtotal', 'Subtotal'))}</span>
                <strong data-cart-checkout-summary-subtotal>${formatCents(pricing.subtotalCents)}</strong>
              </div>
              ${pricing.tipAmountCents > 0 ? `
                <div class="pool-first-party-cart__summary-row" data-cart-checkout-summary-tip-row>
                  <span data-cart-checkout-summary-tip-label>${escapeHtml(getRuntimeMessage('cart.tipWithPercent', '%{platform} tip (%{percent}%)').replace('%{platform}', getPlatformName()).replace('%{percent}', String(pricing.tipPercent)))}</span>
                  <strong data-cart-checkout-summary-tip-amount>${formatCents(pricing.tipAmountCents)}</strong>
                </div>
              ` : ''}
              <div class="pool-first-party-cart__summary-row">
                  <span>${formatTaxRateLabel()}</span>
                <strong data-cart-checkout-summary-tax>${formatCents(pricing.taxCents)}</strong>
              </div>
              ${pricing.shippingCents > 0 ? `
                <div class="pool-first-party-cart__summary-row">
                  <span data-cart-checkout-summary-shipping-label>${escapeHtml(pricing.shippingLabel || getRuntimeMessage('cart.shipping', 'Shipping'))}</span>
                  <div data-cart-checkout-summary-shipping-value>
                    ${renderCartShippingSummaryValue(customCheckout?.shippingQuote, pricing.shippingCents)}
                  </div>
                </div>
              ` : ''}
              <div class="pool-first-party-cart__summary-row pool-first-party-cart__summary-row--total">
                <span data-cart-checkout-summary-total-label>${escapeHtml(pricing.totalLabel || getRuntimeMessage('cart.pledgeTotal', 'Pledge total'))}</span>
                <strong data-cart-checkout-summary-total>${formatCents(pricing.totalCents)}</strong>
              </div>
            </div>
          </div>
          ${customCheckoutMarkup}
          ${checkoutErrorMarkup}
        </section>
      ` : `
        <ul class="pool-first-party-cart__items">${itemMarkup}</ul>
        ${cartAddOnMarkup}
        ${cartEstimateMarkup}
      `;
      const footerActions = isCheckoutPreview ? `
          <div class="pool-first-party-cart__actions">
            <button type="button" class="pool-first-party-cart__action pool-first-party-cart__action--secondary" data-cart-back>${escapeHtml(getRuntimeMessage('cart.backToCart', 'Back to cart'))}</button>
            ${wantsCustomCheckout && !isDeferredCustomCheckoutStart ? `
              <button
                type="button"
                class="pool-first-party-cart__action${checkoutUiState.status === 'confirming' || checkoutUiState.status === 'redirecting' ? ' is-busy' : ''}"
                data-cart-confirm-custom-checkout
                aria-busy="${checkoutUiState.status === 'confirming' || checkoutUiState.status === 'redirecting' ? 'true' : 'false'}"
                ${checkoutUiState.status === 'confirming' || checkoutUiState.status === 'submitting' || customCheckout?.mountStatus !== 'mounted' ? 'disabled' : ''}
              >${renderBusyButtonLabel(
                checkoutUiState.status === 'confirming'
                  ? getRuntimeMessage('cart.savingPaymentMethod', 'Saving payment method...')
                  : checkoutUiState.status === 'redirecting'
                    ? getRuntimeMessage('cart.finishingPledge', 'Finishing pledge...')
                    : getRuntimeMessage('cart.savePaymentMethod', 'Save payment method'),
                checkoutUiState.status === 'confirming' || checkoutUiState.status === 'redirecting'
              )}</button>
            ` : `
              <button
                type="button"
                class="pool-first-party-cart__action"
                data-cart-start-checkout
                ${!isFirstPartyCheckoutEnabled || checkoutUiState.status === 'submitting' || (isDeferredCustomCheckoutStart && !isCustomCheckoutShippingDraftComplete(customCheckout?.shippingDraft)) ? 'disabled' : ''}
              >${checkoutUiState.status === 'submitting'
                ? escapeHtml(getRuntimeMessage('cart.loadingSecurePayment', 'Loading secure payment...'))
                : (isFirstPartyCheckoutEnabled ? escapeHtml(getRuntimeMessage('cart.continueToPledge', 'Continue to pledge')) : 'Legacy checkout only')}</button>
            `}
        </div>
      ` : `
        <div class="pool-first-party-cart__actions">
          <button type="button" class="pool-first-party-cart__action pool-first-party-cart__action--secondary" data-cart-close>${escapeHtml(getRuntimeMessage('cart.keepBrowsing', 'Keep browsing'))}</button>
          <button type="button" class="pool-first-party-cart__action" data-cart-continue ${items.length === 0 ? 'disabled' : ''}>${escapeHtml(getRuntimeMessage('cart.checkout', 'Checkout'))}</button>
        </div>
      `;

      if (activeCustomCheckoutMount) {
        if (isCustomCheckout && checkoutUiState.customCheckout) {
          checkoutUiState.customCheckout = {
            ...checkoutUiState.customCheckout,
            mountStatus: 'idle'
          };
        }
        teardownActiveCustomCheckoutMount();
      }

      root.innerHTML = `
        <div class="pool-first-party-cart__backdrop" data-cart-close></div>
        <div
          class="pool-first-party-cart__panel${isCheckoutPreview ? ' pool-first-party-cart__panel--checkout' : ''}"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pool-first-party-cart-title"
          tabindex="-1"
        >
          <header class="pool-first-party-cart__header">
            <div>
              ${isCheckoutPreview
                ? `<p id="pool-first-party-cart-title" class="pool-first-party-cart__section-label pool-first-party-cart__section-label--header">${escapeHtml(getRuntimeMessage('cart.checkoutTitle', 'Checkout'))}</p>`
                : `<p id="pool-first-party-cart-title" class="pool-first-party-cart__section-label pool-first-party-cart__section-label--header">${escapeHtml(getRuntimeMessage('cart.yourCart', 'Your cart'))}</p>`}
            </div>
            <button type="button" class="pool-first-party-cart__close" data-cart-close aria-label="${escapeAttribute(getRuntimeMessage('cart.closeCart', 'Close cart'))}" data-cart-dialog-initial-focus>X</button>
          </header>
          <div class="pool-first-party-cart__body">
            ${bodyMarkup}
          </div>
          <footer class="pool-first-party-cart__footer${isCheckoutPreview ? ' pool-first-party-cart__footer--checkout' : ''}">
            ${footerActions}
          </footer>
        </div>
      `;
      root.setAttribute('aria-hidden', 'false');
      activateCartDialog(root);
      if (isCustomCheckout && customCheckout?.scriptStatus === 'ready') {
        mountCustomCheckoutIntoDrawer(root);
        ensureCustomCheckoutMounted(root);
      }
    }

    requestCartAddOnInventoryRerender = renderFirstPartyCart;

    function syncFirstPartyCartTipUI() {
      const root = getCartRoot();
      if (!root || !isCartOpen || currentRoute === CHECKOUT_VIEW_ROUTE) return;

      const pricing = getDisplayedFirstPartyPricing(store.getState(), {
        currentRoute,
        checkoutMode: checkoutUiState.mode,
        shippingQuote: checkoutUiState.customCheckout?.shippingQuote
      });
      const tipAmount = root.querySelector('[data-cart-tip-amount]');
      const tipPercent = root.querySelector('[data-cart-tip-percent]');
      const tipInput = root.querySelector('[data-cart-tip]');
      const tipRow = root.querySelector('[data-cart-summary-tip-row]');
      const tipLabel = root.querySelector('[data-cart-summary-tip-label]');
      const tipSummaryAmount = root.querySelector('[data-cart-summary-tip-amount]');
      const subtotal = root.querySelector('[data-cart-summary-subtotal]');
      const tax = root.querySelector('[data-cart-summary-tax]');
      const shippingRow = root.querySelector('[data-cart-summary-shipping-row]');
      const shippingLabel = root.querySelector('[data-cart-summary-shipping-label]');
      const shipping = root.querySelector('[data-cart-summary-shipping]');
      const totalLabel = root.querySelector('[data-cart-summary-total-label]');
      const total = root.querySelector('[data-cart-summary-total]');

      if (tipAmount) tipAmount.textContent = formatCents(pricing.tipAmountCents);
      if (tipPercent) tipPercent.textContent = `${pricing.tipPercent}%`;
      if (tipInput) {
        tipInput.setAttribute('aria-valuetext', formatTipSliderValueText(pricing.tipPercent, pricing.tipAmountCents));
      }
      if (subtotal) subtotal.textContent = formatCents(pricing.subtotalCents);
      if (tax) tax.textContent = formatCents(pricing.taxCents);
      if (total) total.textContent = formatCents(pricing.totalCents);

      if (tipRow && tipLabel && tipSummaryAmount) {
        tipRow.hidden = pricing.tipAmountCents <= 0;
        tipLabel.textContent = getRuntimeMessage('cart.tipWithPercent', '%{platform} tip (%{percent}%)')
          .replace('%{platform}', getPlatformName())
          .replace('%{percent}', String(pricing.tipPercent));
        tipSummaryAmount.textContent = formatCents(pricing.tipAmountCents);
      }

      if (shippingRow && shipping) {
        shippingRow.hidden = pricing.shippingCents <= 0;
        if (shippingLabel) {
          shippingLabel.textContent = pricing.shippingLabel || getRuntimeMessage('cart.shipping', 'Shipping');
        }
        shipping.textContent = formatCents(pricing.shippingCents);
      }
      if (totalLabel) {
        totalLabel.textContent = pricing.totalLabel || getRuntimeMessage('cart.pledgeTotal', 'Pledge total');
      }
    }

    function syncCheckoutPreviewSummaryUI() {
      const root = getCartRoot();
      if (!root || !isCartOpen || currentRoute !== CHECKOUT_VIEW_ROUTE) return;

      const state = store.getState();
      const pricing = getDisplayedFirstPartyPricing(store.getState(), {
        currentRoute,
        checkoutMode: checkoutUiState.mode,
        shippingQuote: checkoutUiState.customCheckout?.shippingQuote
      });
      const subtotal = root.querySelector('[data-cart-checkout-summary-subtotal]');
      const tipRow = root.querySelector('[data-cart-checkout-summary-tip-row]');
      const tipLabel = root.querySelector('[data-cart-checkout-summary-tip-label]');
      const tipAmount = root.querySelector('[data-cart-checkout-summary-tip-amount]');
      const tax = root.querySelector('[data-cart-checkout-summary-tax]');
      const shippingLabel = root.querySelector('[data-cart-checkout-summary-shipping-label]');
      const shippingAmount = root.querySelector('[data-cart-checkout-summary-shipping]');
      const totalLabel = root.querySelector('[data-cart-checkout-summary-total-label]');
      const total = root.querySelector('[data-cart-checkout-summary-total]');
      if (subtotal) {
        subtotal.textContent = formatCents(pricing.subtotalCents);
      }
      if (tipRow && tipLabel && tipAmount) {
        tipRow.hidden = pricing.tipAmountCents <= 0;
        tipLabel.textContent = getRuntimeMessage('cart.tipWithPercent', '%{platform} tip (%{percent}%)')
          .replace('%{platform}', getPlatformName())
          .replace('%{percent}', String(pricing.tipPercent));
        tipAmount.textContent = formatCents(pricing.tipAmountCents);
      }
      if (tax) {
        tax.textContent = formatCents(pricing.taxCents);
      }
      if (shippingLabel) {
        shippingLabel.textContent = pricing.shippingLabel || getRuntimeMessage('cart.shipping', 'Shipping');
      }
      if (shippingAmount) {
        shippingAmount.textContent = formatCents(pricing.shippingCents);
      }
      if (totalLabel) {
        totalLabel.textContent = pricing.totalLabel || getRuntimeMessage('cart.pledgeTotal', 'Pledge total');
      }
      if (total) {
        total.textContent = formatCents(pricing.totalCents);
      }
      syncCustomCheckoutShippingOptionUI(root);
    }

    function syncCustomCheckoutShippingOptionUI(root) {
      const shippingValueContainer = root?.querySelector('[data-cart-checkout-summary-shipping-value]');
      const shippingOptionSelect = root?.querySelector('[data-cart-custom-shipping-option]');
      const shippingQuote = checkoutUiState.customCheckout?.shippingQuote || null;
      const shippingAmount = root?.querySelector('[data-cart-checkout-summary-shipping]');

      if (shippingValueContainer) {
        const currentShippingCents = Number.isFinite(Number(shippingQuote?.amountCents))
          ? Math.max(0, Number(shippingQuote.amountCents))
          : getCampaignFallbackShippingCents(
              store.getState()?.cart?.items?.items || [],
              store.getState()?.cart?.bundleAddOnAnchorCampaignSlug
            );
        shippingValueContainer.innerHTML = renderCartShippingSummaryValue(shippingQuote, currentShippingCents);
      }

      const availableOptions = Array.isArray(shippingQuote?.availableOptions) ? shippingQuote.availableOptions : [];
      const selectedOption = shippingOptionUtils.normalizeSelection(
        availableOptions,
        shippingQuote?.selectedOption,
        shippingQuote?.defaultOption
      );

      const refreshedShippingOptionSelect = root?.querySelector('[data-cart-custom-shipping-option]');
      if (!refreshedShippingOptionSelect) {
        if (shippingAmount && !shouldShowCartShippingOptions(shippingQuote)) {
          shippingAmount.textContent = formatCents(
            Number.isFinite(Number(shippingQuote?.amountCents))
              ? Math.max(0, Number(shippingQuote.amountCents))
              : getCampaignFallbackShippingCents(
                  store.getState()?.cart?.items?.items || [],
                  store.getState()?.cart?.bundleAddOnAnchorCampaignSlug
                )
          );
        }
        return;
      }

      if (!shouldShowCartShippingOptions(shippingQuote)) {
        return;
      }

      refreshedShippingOptionSelect.innerHTML = renderCartShippingOptionChoices({
        availableOptions,
        selectedOption,
        defaultOption: shippingQuote?.defaultOption || 'standard'
      });
      refreshedShippingOptionSelect.value = selectedOption;
    }

    function openFirstPartyCart(focusTarget) {
      currentRoute = currentRoute || CART_VIEW_ROUTE;
      isCartOpen = true;
      rememberCartReturnFocus(focusTarget);
      cartShouldFocusAfterRender = true;
      scheduleStripeJsPrewarm();
      renderFirstPartyCart();
    }

    function closeFirstPartyCart() {
      if (!isCartOpen) return;
      isCartOpen = false;
      renderFirstPartyCart();
      restoreCartReturnFocus();
    }

    function setCheckoutUiState(nextState) {
      checkoutUiState = {
        ...checkoutUiState,
        ...(nextState || {})
      };
      renderFirstPartyCart();
    }

  function teardownActiveCustomCheckoutMount() {
      if (!activeCustomCheckoutMount || typeof activeCustomCheckoutMount.unmount !== 'function') {
        activeCustomCheckoutMount = null;
        return;
      }

      try {
        activeCustomCheckoutMount.unmount();
      } catch (_error) {}
      activeCustomCheckoutMount = null;
    }

    function invalidateCustomCheckoutFlow() {
      customCheckoutFlowToken += 1;
      return customCheckoutFlowToken;
    }

    function isActiveCustomCheckoutFlow(flowToken) {
      return flowToken === customCheckoutFlowToken &&
        currentRoute === CHECKOUT_VIEW_ROUTE &&
        checkoutUiState.mode === 'custom' &&
        Boolean(checkoutUiState.customCheckout);
    }

    function getActiveCustomCheckoutOrderId() {
      return String(checkoutUiState?.customCheckout?.orderId || readActiveCustomCheckoutOrderId() || '').trim();
    }

    async function abandonActiveCustomCheckoutIntent(orderId = getActiveCustomCheckoutOrderId()) {
      const nextOrderId = String(orderId || '').trim();
      if (!nextOrderId) return;

      try {
        await fetch(`${getWorkerBase()}/checkout-intent/abandon`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ orderId: nextOrderId })
        });
      } catch (_error) {
      } finally {
        writeActiveCustomCheckoutOrderId('');
        clearFirstPartyCheckoutSnapshot();
        clearPendingPledgeFlag();
      }
    }

    function updateCustomCheckoutStatus(statusText, footerLabel) {
      const root = getCartRoot();
      if (!root) return;

      const button = root.querySelector('[data-cart-confirm-custom-checkout], [data-cart-start-checkout]');
      if (button && footerLabel) {
        button.textContent = footerLabel;
      }
    }

    function isCustomCheckoutBusy() {
      return checkoutUiState.status === 'confirming' || checkoutUiState.status === 'redirecting';
    }

    function syncCustomCheckoutConfirmButton() {
      const root = getCartRoot();
      const button = root?.querySelector('[data-cart-confirm-custom-checkout]');
      if (!button) return;

      const isConfirming = checkoutUiState.status === 'confirming';
      const isRedirecting = checkoutUiState.status === 'redirecting';
      const isSubmitting = checkoutUiState.status === 'submitting';
      const isMounted = checkoutUiState.customCheckout?.mountStatus === 'mounted';
      button.disabled = isConfirming || isRedirecting || isSubmitting || !isMounted;
      button.classList.toggle('is-busy', isConfirming || isRedirecting);
      button.setAttribute('aria-busy', isConfirming || isRedirecting ? 'true' : 'false');
      button.innerHTML = renderBusyButtonLabel(
        isConfirming
          ? getRuntimeMessage('cart.savingPaymentMethod', 'Saving payment method...')
          : isRedirecting
            ? getRuntimeMessage('cart.finishingPledge', 'Finishing pledge...')
            : isSubmitting
              ? getRuntimeMessage('cart.loadingSecurePayment', 'Loading secure payment...')
              : getRuntimeMessage('cart.savePaymentMethod', 'Save payment method'),
        isConfirming || isRedirecting
      );
    }

    function syncCheckoutStartButton() {
      const root = getCartRoot();
      const button = root?.querySelector('[data-cart-start-checkout]');
      if (!button) return;

      const shouldDeferCustomCheckout = shouldDeferPhysicalCustomCheckoutStart(store.getState(), {
        currentRoute,
        checkoutMode: checkoutUiState.mode,
        hasCustomCheckoutSession: Boolean(checkoutUiState.customCheckout?.sessionId || checkoutUiState.customCheckout?.clientSecret)
      });
      const shippingDraft = shouldDeferCustomCheckout
        ? readCustomCheckoutShippingDraft()
        : checkoutUiState.customCheckout?.shippingDraft || null;

      button.disabled = checkoutUiState.status === 'submitting' ||
        getRequestedCheckoutProvider() !== FIRST_PARTY_CHECKOUT_PROVIDER ||
        (shouldDeferCustomCheckout && !isCustomCheckoutShippingDraftComplete(shippingDraft));
      button.textContent = checkoutUiState.status === 'submitting'
        ? getRuntimeMessage('cart.loadingSecurePayment', 'Loading secure payment...')
        : getRuntimeMessage('cart.continueToPledge', 'Continue to pledge');
    }

    function requestCloseFirstPartyCart() {
      if (isCustomCheckoutBusy()) return;
      const activeOrderId = getActiveCustomCheckoutOrderId();
      if (currentRoute === CHECKOUT_VIEW_ROUTE && activeOrderId) {
        void abandonActiveCustomCheckoutIntent(activeOrderId).finally(() => {
          closeFirstPartyCart();
        });
        return;
      }
      closeFirstPartyCart();
    }

    function requestBackToCart() {
      if (isCustomCheckoutBusy()) return;
      const goBackToCart = function() {
        setCheckoutUiState({
          status: 'idle',
          error: ''
        });
        cartShouldFocusAfterRender = true;
        apiRoot.api.theme.cart.navigate(CART_VIEW_ROUTE);
      };

      const activeOrderId = getActiveCustomCheckoutOrderId();
      if (activeOrderId) {
        void abandonActiveCustomCheckoutIntent(activeOrderId).finally(goBackToCart);
        return;
      }

      goBackToCart();
    }

    function getPersistedCustomCheckoutEmailDraft() {
      return String(checkoutUiState.customCheckout?.emailDraft || persistedCustomCheckoutEmailDraft || '');
    }

    function getPersistedCustomCheckoutShippingDraft() {
      return checkoutUiState.customCheckout?.shippingDraft || persistedCustomCheckoutShippingDraft || null;
    }

    function persistCustomCheckoutDraftState(emailDraft, shippingDraft) {
      if (emailDraft !== undefined) {
        persistedCustomCheckoutEmailDraft = String(emailDraft || '').trim();
      }
      if (shippingDraft !== undefined) {
        persistedCustomCheckoutShippingDraft = shippingDraft || null;
      }
    }

    function getCustomCheckoutShippingSignature(state) {
      if (currentRoute !== CHECKOUT_VIEW_ROUTE || checkoutUiState.mode !== 'custom') {
        return '';
      }

      const items = Array.isArray(state?.cart?.items?.items) ? state.cart.items.items : [];
      const normalizedItems = items
        .map((item) => `${String(item?.id || '')}:${Math.max(1, Number(item?.quantity || 1))}`)
        .sort()
        .join('|');

      return [
        normalizedItems,
        String(state?.cart?.bundleAddOnAnchorCampaignSlug || ''),
        cartHasPhysicalItems(items) ? 'physical' : 'digital'
      ].join('::');
    }

    function focusCustomCheckoutEmailField() {
      const input = getCartRoot()?.querySelector('[data-cart-custom-checkout-email]');
      if (!(input instanceof HTMLInputElement)) return;
      input.focus();
      if (typeof input.select === 'function' && input.value) {
        input.select();
      }
      if (typeof input.scrollIntoView === 'function') {
        input.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }

    function getCustomCheckoutEmailFieldMessage(errorLike) {
      const rawMessage = String(errorLike?.error?.message || errorLike?.message || '').trim();
      const message = rawMessage.toLowerCase();
      if (!message || !message.includes('email')) {
        return '';
      }
      if (message.includes('required') || message.includes('updateemail') || message.includes('provide an email address')) {
        return getRuntimeMessage('cart.emailRequired', 'Enter an email address to continue.');
      }
      if (message.includes('valid email')) {
        return getRuntimeMessage('cart.emailInvalid', 'Enter a valid email address to continue.');
      }
      return rawMessage || getRuntimeMessage('cart.emailRequired', 'Enter an email address to continue.');
    }

    function setCustomCheckoutEmailError(message) {
      const root = getCartRoot();
      const errorNode = root?.querySelector('[data-cart-custom-checkout-email-error]');
      const input = root?.querySelector('[data-cart-custom-checkout-email]');
      if (!errorNode) return;

      const nextMessage = String(message || '');
      errorNode.textContent = nextMessage;
      errorNode.hidden = !nextMessage;
      if (input instanceof HTMLInputElement) {
        input.setAttribute('aria-invalid', nextMessage ? 'true' : 'false');
      }
    }

    function setCheckoutUiError(message) {
      const root = getCartRoot();
      const errorNode = root?.querySelector('[data-cart-checkout-error]');
      const nextMessage = String(message || '');
      checkoutUiState.error = nextMessage;
      if (!errorNode) return;
      errorNode.textContent = nextMessage;
      errorNode.hidden = !nextMessage;
    }

    function isCustomCheckoutShippingDraftComplete(shippingDraft) {
      const draft = shippingDraft || readCustomCheckoutShippingDraft();
      return Boolean(
        draft?.name &&
        draft?.address?.line1 &&
        draft?.address?.city &&
        draft?.address?.state &&
        draft?.address?.postal_code &&
        draft?.address?.country
      );
    }

    function shouldShowCheckoutLevelStripeError(errorLike) {
      const type = String(errorLike?.type || errorLike?.error?.type || '').trim().toLowerCase();
      const code = String(errorLike?.code || errorLike?.error?.code || '').trim().toLowerCase();
      const message = String(errorLike?.message || errorLike?.error?.message || '').trim();

      if (type === 'validation_error') return false;
      if (code === 'incomplete_number' || code === 'incomplete_cvc' || code === 'incomplete_expiry') return false;
      if (/(incomplete|invalid|required|empty)/i.test(message)) return false;
      return true;
    }

    function setCustomCheckoutShippingError(message) {
      const root = getCartRoot();
      const errorNode = root?.querySelector('[data-cart-custom-shipping-error]');
      const fields = root ? Array.from(root.querySelectorAll('[data-cart-custom-shipping-field]')) : [];
      if (!errorNode) return;

      const nextMessage = String(message || '');
      errorNode.textContent = nextMessage;
      errorNode.hidden = !nextMessage;
      fields.forEach((field) => {
        if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
          field.setAttribute('aria-invalid', nextMessage ? 'true' : 'false');
        }
      });
    }

    function readCustomCheckoutShippingDraft() {
      const root = getCartRoot();
      const fields = root ? Array.from(root.querySelectorAll('[data-cart-custom-shipping-field]')) : [];
      const read = function(name) {
        const field = fields.find((node) => node.getAttribute('data-cart-custom-shipping-field') === name);
        if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
          return String(field.value || '').trim();
        }
        return '';
      };

      return {
        name: read('name'),
        address: {
          line1: read('line1'),
          line2: read('line2'),
          city: read('city'),
          state: read('state'),
          postal_code: read('postal_code'),
          country: (read('country') || 'US').toUpperCase()
        }
      };
    }

    function readCustomCheckoutEmailDraft() {
      const field = getCartRoot()?.querySelector('[data-cart-custom-checkout-email]');
      if (field instanceof HTMLInputElement) {
        return String(field.value || '').trim();
      }
      return String(checkoutUiState.customCheckout?.emailDraft || persistedCustomCheckoutEmailDraft || '').trim();
    }

    async function refreshCustomCheckoutShippingEstimate() {
      if (currentRoute !== CHECKOUT_VIEW_ROUTE || checkoutUiState.mode !== 'custom') return;
      const state = store.getState();
      if (!cartHasPhysicalItems(state?.cart?.items?.items || [])) {
        customCheckoutShippingQuoteToken += 1;
        checkoutUiState.customCheckout = {
          ...(checkoutUiState.customCheckout || {}),
          shippingQuote: {
            status: 'idle',
            amountCents: 0,
            source: 'none',
            availableOptions: [],
            defaultOption: 'standard',
            selectedOption: 'standard'
          }
        };
        syncFirstPartyCartTipUI();
        syncCheckoutPreviewSummaryUI();
        return;
      }

      const shippingDraft = readCustomCheckoutShippingDraft();
      persistCustomCheckoutDraftState(undefined, shippingDraft);
      checkoutUiState.customCheckout = {
        ...(checkoutUiState.customCheckout || {}),
        shippingDraft
      };

      if (!isCustomCheckoutShippingDraftComplete(shippingDraft)) {
        customCheckoutShippingQuoteToken += 1;
        checkoutUiState.customCheckout = {
          ...(checkoutUiState.customCheckout || {}),
          shippingQuote: {
            status: 'idle',
            amountCents: getCampaignFallbackShippingCents(
              state?.cart?.items?.items || [],
              state?.cart?.bundleAddOnAnchorCampaignSlug
            ),
            source: 'fallback_flat_rate',
            availableOptions: [],
            defaultOption: 'standard',
            selectedOption: 'standard'
          }
        };
        syncFirstPartyCartTipUI();
        syncCheckoutPreviewSummaryUI();
        return;
      }

      checkoutUiState.customCheckout = {
        ...(checkoutUiState.customCheckout || {}),
          shippingQuote: {
            status: 'loading',
            amountCents: Number(checkoutUiState.customCheckout?.shippingQuote?.amountCents) || getCampaignFallbackShippingCents(
              state?.cart?.items?.items || [],
              state?.cart?.bundleAddOnAnchorCampaignSlug
            ),
            source: checkoutUiState.customCheckout?.shippingQuote?.source || 'fallback_flat_rate',
            availableOptions: Array.isArray(checkoutUiState.customCheckout?.shippingQuote?.availableOptions)
              ? checkoutUiState.customCheckout.shippingQuote.availableOptions
              : [],
            defaultOption: checkoutUiState.customCheckout?.shippingQuote?.defaultOption || 'standard',
            selectedOption: checkoutUiState.customCheckout?.shippingQuote?.selectedOption || 'standard'
          }
      };
      const quoteToken = customCheckoutShippingQuoteToken + 1;
      customCheckoutShippingQuoteToken = quoteToken;
      syncFirstPartyCartTipUI();
      syncCheckoutPreviewSummaryUI();

      const payloadResult = buildFirstPartyCheckoutPayload(store.getState());
      if (!payloadResult.valid) {
        if (quoteToken === customCheckoutShippingQuoteToken) {
          checkoutUiState.customCheckout = {
            ...(checkoutUiState.customCheckout || {}),
            shippingQuote: {
              status: 'error',
              amountCents: getCampaignFallbackShippingCents(
                store.getState()?.cart?.items?.items || [],
                store.getState()?.cart?.bundleAddOnAnchorCampaignSlug
              ),
              source: 'fallback_flat_rate',
              availableOptions: [],
              defaultOption: 'standard',
              selectedOption: 'standard'
            }
          };
          syncFirstPartyCartTipUI();
          syncCheckoutPreviewSummaryUI();
        }
        return;
      }

      try {
        const response = await fetch(`${getWorkerBase()}/shipping/quote`, {
          method: 'POST',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ...payloadResult.payload,
            shippingAddress: {
              country: shippingDraft.address.country,
              postalCode: shippingDraft.address.postal_code
            },
            shippingOption: checkoutUiState.customCheckout?.shippingQuote?.selectedOption || 'standard'
          })
        });

        const data = await response.json().catch(() => ({}));
        if (quoteToken !== customCheckoutShippingQuoteToken) return;

        checkoutUiState.customCheckout = {
          ...(checkoutUiState.customCheckout || {}),
          shippingQuote: response.ok
            ? buildCartShippingQuoteState(
                data,
                getCampaignFallbackShippingCents(
                  store.getState()?.cart?.items?.items || [],
                  store.getState()?.cart?.bundleAddOnAnchorCampaignSlug
                ),
                checkoutUiState.customCheckout?.shippingQuote
              )
            : {
                status: 'error',
                amountCents: getCampaignFallbackShippingCents(
                  store.getState()?.cart?.items?.items || [],
                  store.getState()?.cart?.bundleAddOnAnchorCampaignSlug
                ),
                source: 'fallback_flat_rate',
                availableOptions: [],
                defaultOption: 'standard',
                selectedOption: 'standard'
              }
        };
      } catch (_error) {
        if (quoteToken !== customCheckoutShippingQuoteToken) return;
        checkoutUiState.customCheckout = {
          ...(checkoutUiState.customCheckout || {}),
          shippingQuote: {
            status: 'error',
            amountCents: getCampaignFallbackShippingCents(
              store.getState()?.cart?.items?.items || [],
              store.getState()?.cart?.bundleAddOnAnchorCampaignSlug
            ),
            source: 'fallback_flat_rate',
            availableOptions: [],
            defaultOption: 'standard',
            selectedOption: 'standard'
          }
        };
      }

      syncFirstPartyCartTipUI();
      syncCheckoutPreviewSummaryUI();
    }

    async function syncCustomCheckoutShippingToStripe(options) {
      const shippingDraft = readCustomCheckoutShippingDraft();
      persistCustomCheckoutDraftState(undefined, shippingDraft);
      checkoutUiState.customCheckout = {
        ...(checkoutUiState.customCheckout || {}),
        shippingDraft,
        shippingError: ''
      };

      const missingRequiredField = !shippingDraft.name ||
        !shippingDraft.address.line1 ||
        !shippingDraft.address.city ||
        !shippingDraft.address.state ||
        !shippingDraft.address.postal_code ||
        !shippingDraft.address.country;

      if (missingRequiredField) {
        const message = getRuntimeMessage('cart.shippingAddressRequired', 'Enter a complete shipping address to continue.');
        checkoutUiState.customCheckout.shippingError = message;
        setCustomCheckoutShippingError(message);
        return {
          ok: false,
          message
        };
      }

      if (!activeCustomCheckoutMount || typeof activeCustomCheckoutMount.updateShippingAddress !== 'function') {
        setCustomCheckoutShippingError('');
        return { ok: true };
      }

      const result = await activeCustomCheckoutMount.updateShippingAddress(shippingDraft);
      const message = result?.error?.message || '';
      checkoutUiState.customCheckout.shippingError = message;
      setCustomCheckoutShippingError(message);

      if (message && options?.raise) {
        throw new Error(message);
      }

      return {
        ok: !message,
        message
      };
    }

    async function syncCustomCheckoutEmailToStripe(email, options) {
      const trimmedEmail = String(email || '').trim();
      persistCustomCheckoutDraftState(trimmedEmail, undefined);
      checkoutUiState.customCheckout = {
        ...(checkoutUiState.customCheckout || {}),
        emailDraft: trimmedEmail,
        emailError: ''
      };

      if (!trimmedEmail) {
        const message = getRuntimeMessage('cart.emailRequired', 'Enter an email address to continue.');
        checkoutUiState.customCheckout.emailError = message;
        setCustomCheckoutEmailError(message);
        return {
          ok: false,
          message
        };
      }

      if (!activeCustomCheckoutMount || typeof activeCustomCheckoutMount.updateEmail !== 'function') {
        setCustomCheckoutEmailError('');
        return { ok: true };
      }

      const result = await activeCustomCheckoutMount.updateEmail(trimmedEmail);
      const message = result?.error?.message || '';
      checkoutUiState.customCheckout.emailError = message;
      setCustomCheckoutEmailError(message);

      if (message && options?.raise) {
        throw new Error(message);
      }

      return {
        ok: !message,
        message
      };
    }

    async function mountCustomCheckoutIntoDrawer(root) {
      if (!root || currentRoute !== CHECKOUT_VIEW_ROUTE || checkoutUiState.mode !== 'custom') return;
      if (!checkoutUiState.customCheckout || checkoutUiState.customCheckout.scriptStatus !== 'ready') return;
      const paymentContainer = root.querySelector('[data-cart-custom-checkout-region="payment"]');
      const shippingContainer = root.querySelector('[data-cart-custom-checkout-region="address"]');
      const mountStatus = checkoutUiState.customCheckout.mountStatus || 'idle';
      const livePaymentUiMissing = !paymentContainer || paymentContainer.childElementCount === 0;

      if (mountStatus !== 'idle') {
        if ((mountStatus === 'mounting' || mountStatus === 'mounted') && livePaymentUiMissing) {
          invalidateCustomCheckoutFlow();
          teardownActiveCustomCheckoutMount();
          checkoutUiState.customCheckout = {
            ...(checkoutUiState.customCheckout || {}),
            mountStatus: 'idle'
          };
        } else {
          return;
        }
      }

      if (!window.PoolStripeCheckoutSidecar || typeof window.PoolStripeCheckoutSidecar.mount !== 'function') return;
      const flowToken = customCheckoutFlowToken;

      checkoutUiState.customCheckout.mountStatus = 'mounting';
      syncCustomCheckoutConfirmButton();

      try {
        const mountResult = await window.PoolStripeCheckoutSidecar.mount({
          publishableKey: checkoutUiState.customCheckout.publishableKey,
          clientSecret: checkoutUiState.customCheckout.clientSecret,
          locale: getCurrentLang(),
          paymentContainer,
          shippingContainer,
          useShippingAddressElement: Boolean(shippingContainer),
          allowedCountries: SHIPPING_COUNTRY_OPTIONS.map((option) => option.value),
          defaultCountry: DEFAULT_SHIPPING_COUNTRY,
          onChange: function(event) {
            if (!isActiveCustomCheckoutFlow(flowToken)) return;
            checkoutUiState.customCheckout = {
              ...(checkoutUiState.customCheckout || {}),
              canConfirm: Boolean(event?.session?.canConfirm)
            };
            syncCustomCheckoutConfirmButton();
          }
        });

        if (!isActiveCustomCheckoutFlow(flowToken)) {
          try {
            mountResult?.unmount?.();
          } catch (_error) {}
          return;
        }

        activeCustomCheckoutMount = mountResult;
        checkoutUiState.customCheckout.mountStatus = 'mounted';
        if (shippingContainer && !mountResult?.supportsShippingAddressElement) {
          shippingContainer.hidden = true;
          const fallbackShipping = root.querySelector('[data-cart-custom-shipping-fallback]');
          if (fallbackShipping) {
            fallbackShipping.hidden = false;
          }
        }
        syncCustomCheckoutConfirmButton();
      } catch (error) {
        if (!isActiveCustomCheckoutFlow(flowToken)) return;
        activeCustomCheckoutMount = null;
        await abandonActiveCustomCheckoutIntent(getActiveCustomCheckoutOrderId());
        setCheckoutUiState({
          status: 'idle',
          mode: 'custom',
          error: error?.message || 'Secure checkout could not be mounted.',
          customCheckout: {
            ...(checkoutUiState.customCheckout || {}),
            mountStatus: 'error'
          }
        });
      }
    }

    async function confirmCustomCheckout() {
      if (isCustomCheckoutBusy()) return;
      if (!activeCustomCheckoutMount || typeof activeCustomCheckoutMount.confirm !== 'function') {
        setCheckoutUiState({
          ...checkoutUiState,
          status: 'idle',
          error: getRuntimeMessage('cart.secureCheckoutNotReady', 'Secure checkout is not ready yet.')
        });
        return;
      }

      const root = getCartRoot();
      const emailInput = root?.querySelector('[data-cart-custom-checkout-email]');
      const emailFallbackVisible = Boolean(root?.querySelector('[data-cart-custom-checkout-email-fallback]:not([hidden])'));
      const emailValue = emailInput instanceof HTMLInputElement ? emailInput.value : '';
      const mount = activeCustomCheckoutMount;
      const flowToken = customCheckoutFlowToken;
      const orderId = String(checkoutUiState.customCheckout?.orderId || '');

      try {
        checkoutUiState.status = 'confirming';
        setCheckoutUiError('');
        checkoutUiState.customCheckout = {
          ...(checkoutUiState.customCheckout || {}),
          emailDraft: String(emailValue || '').trim(),
          emailError: ''
        };
        syncCustomCheckoutConfirmButton();
        setCustomCheckoutEmailError('');

        if (emailFallbackVisible) {
          const emailResult = await syncCustomCheckoutEmailToStripe(emailValue, { raise: true });
          if (!emailResult.ok) {
            checkoutUiState.status = 'idle';
            checkoutUiState.customCheckout = {
              ...(checkoutUiState.customCheckout || {}),
              emailDraft: String(emailValue || '').trim(),
              emailError: emailResult.message || ''
            };
            focusCustomCheckoutEmailField();
            syncCustomCheckoutConfirmButton();
            return;
          }
        }

        if (getCartRoot()?.querySelector('[data-cart-custom-shipping-fallback]:not([hidden])')) {
          const shippingResult = await syncCustomCheckoutShippingToStripe({ raise: true });
          if (!shippingResult.ok) {
            checkoutUiState.status = 'idle';
            syncCustomCheckoutConfirmButton();
            return;
          }
        }

        const result = await mount.confirm();
        if (result?.type === 'error' || result?.error) {
          checkoutUiState.status = 'idle';
          const emailFieldMessage = getCustomCheckoutEmailFieldMessage(result);
          if (emailFieldMessage) {
            checkoutUiState.customCheckout = {
              ...(checkoutUiState.customCheckout || {}),
              emailError: emailFieldMessage
            };
            setCustomCheckoutEmailError(emailFieldMessage);
            setCheckoutUiError('');
            focusCustomCheckoutEmailField();
            syncCustomCheckoutConfirmButton();
            return;
          }
          if (shouldShowCheckoutLevelStripeError(result)) {
            setCheckoutUiError(result?.error?.message || 'Stripe could not confirm the setup.');
          } else {
            setCheckoutUiError('');
          }
          syncCustomCheckoutConfirmButton();
          return;
        }

        if (!isActiveCustomCheckoutFlow(flowToken)) {
          return;
        }

        checkoutUiState.status = 'redirecting';
        syncCustomCheckoutConfirmButton();

        let completion = await waitForPersistedFirstPartyCheckout(orderId, {
          timeoutMs: 2500,
          pollIntervalMs: 400
        });
        if (!isActiveCustomCheckoutFlow(flowToken)) {
          return;
        }

        if (!completion.ok) {
          const recovery = await recoverCompletedFirstPartyCheckout(
            orderId,
            String(checkoutUiState.customCheckout?.sessionId || '')
          );
          if (!isActiveCustomCheckoutFlow(flowToken)) {
            return;
          }

          if (recovery.ok) {
            completion = await waitForPersistedFirstPartyCheckout(orderId, {
              timeoutMs: 3500,
              pollIntervalMs: 350
            });
          }
        }

        if (!completion.ok) {
          checkoutUiState.status = 'idle';
          setCheckoutUiError(getRuntimeMessage('cart.paymentProcessingStill', 'Payment method saved, but pledge confirmation is still processing. Please stay on this page a moment and try again.'));
          syncCustomCheckoutConfirmButton();
          return;
        }

        const affectedCampaignSlugs = getFirstPartyCampaignSlugs(store.getState()?.cart?.items?.items);
        markLiveCampaignRefreshNeeded(affectedCampaignSlugs);
        invalidateLiveCampaignCaches(affectedCampaignSlugs);
        writeActiveCustomCheckoutOrderId('');
        const successPath = getCurrentLang() === 'en'
          ? `/pledge-success/?orderId=${encodeURIComponent(orderId)}`
          : `/${encodeURIComponent(getCurrentLang())}/pledge-success/?orderId=${encodeURIComponent(orderId)}`;
        redirectWindow(successPath);
      } catch (error) {
        checkoutUiState.status = 'idle';
        const emailFieldMessage = getCustomCheckoutEmailFieldMessage(error);
        if (emailFieldMessage) {
          checkoutUiState.customCheckout = {
            ...(checkoutUiState.customCheckout || {}),
            emailError: emailFieldMessage
          };
          setCustomCheckoutEmailError(emailFieldMessage);
          setCheckoutUiError('');
          focusCustomCheckoutEmailField();
          syncCustomCheckoutConfirmButton();
          return;
        }
        setCheckoutUiError(error?.message || getRuntimeMessage('cart.savePaymentError', 'There was an error saving your payment method.'));
        syncCustomCheckoutConfirmButton();
      }
    }

    async function bootstrapCustomCheckout(data, stripeReadyPromise) {
      const flowToken = invalidateCustomCheckoutFlow();
      const existingCustomCheckout = checkoutUiState.customCheckout || {};
      const nextCustomCheckout = {
        ...existingCustomCheckout,
        sessionId: String(data?.sessionId || ''),
        clientSecret: String(data?.clientSecret || ''),
        publishableKey: String(data?.publishableKey || ''),
        orderId: String(data?.orderId || ''),
        scriptStatus: 'loading',
        mountStatus: 'idle'
      };

      setCheckoutUiState({
        status: 'idle',
        error: '',
        mode: 'custom',
        customCheckout: nextCustomCheckout
      });
      writeActiveCustomCheckoutOrderId(nextCustomCheckout.orderId);

      try {
        if (stripeReadyPromise) {
          await stripeReadyPromise.catch(() => loadStripeJs());
        } else {
          await loadStripeJs();
        }
        if (!isActiveCustomCheckoutFlow(flowToken)) return;
        setCheckoutUiState({
          status: 'idle',
          error: '',
          mode: 'custom',
          customCheckout: {
            ...nextCustomCheckout,
            scriptStatus: 'ready',
            mountStatus: 'idle'
          }
        });
      } catch (error) {
        if (!isActiveCustomCheckoutFlow(flowToken)) return;
        await abandonActiveCustomCheckoutIntent(nextCustomCheckout.orderId);
        setCheckoutUiState({
          status: 'idle',
          mode: 'custom',
          error: error?.message || getRuntimeMessage('cart.secureCheckoutMountError', 'Secure checkout could not be mounted.'),
          customCheckout: {
            ...nextCustomCheckout,
            scriptStatus: 'error',
            mountStatus: 'error'
          }
        });
      }
    }

    async function startFirstPartyCheckout() {
      if (checkoutUiState.status === 'submitting') return;

      if (getRequestedCheckoutProvider() !== FIRST_PARTY_CHECKOUT_PROVIDER) {
        setCheckoutUiState({
          status: 'idle',
          error: getRuntimeMessage('cart.firstPartyDisabled', 'First-party checkout is not enabled for this build.')
        });
        return;
      }

      const state = store.getState();
      const shouldDeferCustomCheckout = shouldDeferPhysicalCustomCheckoutStart(state, {
        currentRoute,
        checkoutMode: checkoutUiState.mode,
        hasCustomCheckoutSession: Boolean(checkoutUiState.customCheckout?.sessionId || checkoutUiState.customCheckout?.clientSecret)
      });
      const shippingDraft = shouldDeferCustomCheckout ? readCustomCheckoutShippingDraft() : null;

      if (shouldDeferCustomCheckout && !isCustomCheckoutShippingDraftComplete(shippingDraft)) {
        const message = getRuntimeMessage('cart.shippingAddressRequired', 'Enter a complete shipping address to continue.');
        checkoutUiState.customCheckout = {
          ...(checkoutUiState.customCheckout || {}),
          shippingDraft,
          shippingError: message
        };
        setCustomCheckoutShippingError(message);
        syncCheckoutPreviewSummaryUI();
        return;
      }

      const payloadResult = buildFirstPartyCheckoutPayload(state);
      if (!payloadResult.valid) {
        setCheckoutUiState({
          status: 'idle',
          error: payloadResult.error
        });
        return;
      }

      if (shouldDeferCustomCheckout && shippingDraft) {
        payloadResult.payload.shippingAddress = {
          country: shippingDraft.address.country,
          postalCode: shippingDraft.address.postal_code
        };
      }

      payloadResult.payload.shippingOption = checkoutUiState.customCheckout?.shippingQuote?.selectedOption || 'standard';

      const emailField = getCartRoot()?.querySelector('[data-cart-custom-checkout-email]');
      const emailValue = emailField instanceof HTMLInputElement
        ? String(emailField.value || '').trim()
        : '';
      if (emailValue) {
        payloadResult.payload.email = emailValue;
      }

      setCheckoutUiState({
        status: 'submitting',
        error: ''
      });

      try {
        const stripeReadyPromise = canUseCustomCheckoutUi() ? prewarmStripeJs() : null;
        const existingOrderId = getActiveCustomCheckoutOrderId();
        if (existingOrderId) {
          await abandonActiveCustomCheckoutIntent(existingOrderId);
        }

        const response = await fetch(`${getWorkerBase()}/checkout-intent/start`, {
          method: 'POST',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payloadResult.payload)
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || `Worker returned ${response.status}`);
        }

        writeFirstPartyCheckoutSnapshot(store.getState());
        setPendingPledgeFlag();

        if (data?.checkoutUiMode === 'custom') {
          if (!data?.clientSecret || !data?.publishableKey || !data?.sessionId) {
            throw new Error('Custom checkout bootstrap was incomplete.');
          }

          await bootstrapCustomCheckout(data, stripeReadyPromise);
          return;
        }

        if (!data?.url) {
          throw new Error('No checkout URL returned');
        }

        checkoutUiState = {
          status: 'redirecting',
          error: '',
          mode: 'hosted',
          customCheckout: null
        };
        invalidateCustomCheckoutFlow();
        redirectWindow(data.url);
      } catch (error) {
        invalidateCustomCheckoutFlow();
        setCheckoutUiState({
          status: 'idle',
          error: error?.message || getRuntimeMessage('cart.startPledgeError', 'There was an error starting your pledge.'),
          mode: getCheckoutUiMode(),
          customCheckout: null
        });
      }
    }

    function shouldBootstrapCustomCheckoutSession() {
      return (
        currentRoute === CHECKOUT_VIEW_ROUTE &&
        getRequestedCheckoutProvider() === FIRST_PARTY_CHECKOUT_PROVIDER &&
        getCheckoutUiMode() === 'custom' &&
        checkoutUiState.status === 'idle' &&
        !checkoutUiState.customCheckout?.sessionId &&
        !checkoutUiState.customCheckout?.clientSecret
      );
    }

    function ensureCustomCheckoutBootstrapped() {
      if (!shouldBootstrapCustomCheckoutSession()) return;
      void startFirstPartyCheckout();
    }

    function ensureCustomCheckoutMounted(root) {
      if (!root || currentRoute !== CHECKOUT_VIEW_ROUTE || checkoutUiState.mode !== 'custom') return;
      if (!checkoutUiState.customCheckout?.sessionId || !checkoutUiState.customCheckout?.clientSecret) return;
      if (checkoutUiState.customCheckout?.scriptStatus !== 'ready') return;
      if (checkoutUiState.customCheckout?.mountStatus !== 'mounted') return;

      const paymentContainer = root.querySelector('[data-cart-custom-checkout-region="payment"]');
      const paymentUiMissing = !paymentContainer || paymentContainer.childElementCount === 0;
      if (!paymentUiMissing) return;

      checkoutUiState.customCheckout = {
        ...(checkoutUiState.customCheckout || {}),
        mountStatus: 'idle'
      };
      mountCustomCheckoutIntoDrawer(root);
    }

    function bindFirstPartyCartChrome() {
      if (document._poolFirstPartyCartChromeHandler) {
        document.removeEventListener('click', document._poolFirstPartyCartChromeHandler);
      }

      document._poolFirstPartyCartChromeHandler = function handleFirstPartyCartChrome(event) {
        const closeTrigger = event.target?.closest?.('[data-cart-close]');
        if (closeTrigger) {
          event.preventDefault();
          requestCloseFirstPartyCart();
          return;
        }

        const continueTrigger = event.target?.closest?.('[data-cart-continue]');
        if (continueTrigger) {
          event.preventDefault();
          eventBus.emit('summary.checkout_clicked');
          const prewarm = prewarmStripeJs();
          if (prewarm && typeof prewarm.catch === 'function') {
            void prewarm.catch(() => {});
          }
          cartShouldFocusAfterRender = true;
          apiRoot.api.theme.cart.navigate(CHECKOUT_VIEW_ROUTE);
          return;
        }

        const backTrigger = event.target?.closest?.('[data-cart-back]');
        if (backTrigger) {
          event.preventDefault();
          requestBackToCart();
          return;
        }

        const startCheckoutTrigger = event.target?.closest?.('[data-cart-start-checkout]');
        if (startCheckoutTrigger) {
          event.preventDefault();
          startFirstPartyCheckout();
          return;
        }

        const confirmCustomCheckoutTrigger = event.target?.closest?.('[data-cart-confirm-custom-checkout]');
        if (confirmCustomCheckoutTrigger) {
          event.preventDefault();
          confirmCustomCheckout();
          return;
        }

        const addOnAddTrigger = event.target?.closest?.('[data-cart-addon-add]');
        if (addOnAddTrigger) {
          event.preventDefault();
          const productId = String(addOnAddTrigger.getAttribute('data-addon-product-id') || '');
          const card = addOnAddTrigger.closest('[data-cart-addon-product]');
          const variantField = card?.querySelector('[data-cart-addon-variant]');
          const quantityField = card?.querySelector('[data-cart-addon-product-quantity]');
          const variantId = variantField instanceof HTMLSelectElement ? String(variantField.value || '') : '';
          const quantity = quantityField instanceof HTMLInputElement
            ? Math.min(
                Math.max(1, parseInt(quantityField.max, 10) || 1),
                Math.max(1, parseInt(quantityField.value, 10) || 1)
              )
            : 1;
          if (quantityField instanceof HTMLInputElement) {
            quantityField.value = String(quantity);
          }
          setCartAddOnDraft(productId, { variantId, quantity });
          applyCartBundleAddOnSelections(
            buildCartAddOnSelectionsFromProductState(
              store.getState()?.cart?.items?.items || [],
              productId,
              variantId,
              quantity
            )
          );
          return;
        }

        const addOnRemoveTrigger = event.target?.closest?.('[data-cart-addon-remove]');
        if (addOnRemoveTrigger) {
          event.preventDefault();
          const productId = String(addOnRemoveTrigger.getAttribute('data-addon-product-id') || '');
          const card = addOnRemoveTrigger.closest('[data-cart-addon-product]');
          const variantField = card?.querySelector('[data-cart-addon-variant]');
          setCartAddOnDraft(productId, {
            variantId: variantField instanceof HTMLSelectElement ? String(variantField.value || '') : '',
            quantity: 1
          });
          applyCartBundleAddOnSelections(
            buildCartAddOnSelectionsFromProductState(
              store.getState()?.cart?.items?.items || [],
              productId,
              '',
              0
            )
          );
          return;
        }

        const removeTrigger = event.target?.closest?.('[data-remove-item]');
        if (!removeTrigger) return;

        event.preventDefault();
        const uniqueId = removeTrigger.getAttribute('data-remove-item');
        if (!uniqueId) return;

        apiRoot.api.cart.items.remove(uniqueId);
      };

      document.addEventListener('click', document._poolFirstPartyCartChromeHandler);
    }

    function bindFirstPartyCartInputs() {
      if (document._poolFirstPartyCartInputHandler) {
        document.removeEventListener('input', document._poolFirstPartyCartInputHandler);
      }
      if (document._poolFirstPartyCartChangeHandler) {
        document.removeEventListener('change', document._poolFirstPartyCartChangeHandler);
      }

      document._poolFirstPartyCartInputHandler = function handleFirstPartyCartInput(event) {
        const tipField = event.target?.closest?.('[data-cart-tip]');
        if (tipField) {
          suppressDrawerRerender = true;
          apiRoot.api.cart.update({
            tipPercent: tipField.value
          });
          syncFirstPartyCartTipUI();
          return;
        }

        const addOnQuantityField = event.target?.closest?.('[data-cart-addon-product-quantity]');
        if (addOnQuantityField instanceof HTMLInputElement) {
          const quantity = Math.max(1, parseInt(addOnQuantityField.value, 10) || 1);
          const maxQuantity = Math.max(1, parseInt(addOnQuantityField.max, 10) || quantity);
          const clampedQuantity = Math.min(maxQuantity, quantity);
          if (String(clampedQuantity) !== String(addOnQuantityField.value || '')) {
            addOnQuantityField.value = String(clampedQuantity);
          }
          const productId = String(addOnQuantityField.getAttribute('data-addon-product-id') || '');
          const card = addOnQuantityField.closest('[data-cart-addon-product]');
          const variantField = card?.querySelector('[data-cart-addon-variant]');
          const variantId = variantField instanceof HTMLSelectElement ? String(variantField.value || '') : '';
          setCartAddOnDraft(productId, { variantId, quantity: clampedQuantity });
          if (card?.getAttribute('data-cart-addon-active') === 'true') {
            applyCartBundleAddOnSelections(
              buildCartAddOnSelectionsFromProductState(
                store.getState()?.cart?.items?.items || [],
                productId,
                variantId,
                clampedQuantity
              )
            );
          }
          return;
        }

        const emailField = event.target?.closest?.('[data-cart-email]');
        if (!emailField) return;

        apiRoot.api.cart.update({
          email: emailField.value
        });
      };

      document._poolFirstPartyCartChangeHandler = function handleFirstPartyCartChange(event) {
        const tipField = event.target?.closest?.('[data-cart-tip]');
        if (tipField) {
          suppressDrawerRerender = false;
          syncFirstPartyCartTipUI();
          return;
        }

        const emailField = event.target?.closest?.('[data-cart-email]');
        if (emailField) {
          apiRoot.api.cart.update({
            email: emailField.value
          });
          return;
        }

        const addOnAnchorField = event.target?.closest?.('[data-cart-addon-anchor]');
        if (addOnAnchorField instanceof HTMLSelectElement) {
          updateCartBundleAddOnAnchorCampaignSlug(addOnAnchorField.value);
          return;
        }

        const addOnVariantField = event.target?.closest?.('[data-cart-addon-variant]');
        if (addOnVariantField instanceof HTMLSelectElement) {
          const productId = String(addOnVariantField.getAttribute('data-addon-product-id') || '');
          const card = addOnVariantField.closest('[data-cart-addon-product]');
          const quantityField = card?.querySelector('[data-cart-addon-product-quantity]');
          syncCartAddOnCardVariantState(card);
          const quantity = quantityField instanceof HTMLInputElement
            ? Math.min(
                Math.max(1, parseInt(quantityField.max, 10) || 1),
                Math.max(1, parseInt(quantityField.value, 10) || 1)
              )
            : 1;
          if (quantityField instanceof HTMLInputElement) {
            quantityField.value = String(quantity);
          }
          setCartAddOnDraft(productId, { variantId: addOnVariantField.value, quantity });
          if (card?.getAttribute('data-cart-addon-active') === 'true') {
            applyCartBundleAddOnSelections(
              buildCartAddOnSelectionsFromProductState(
                store.getState()?.cart?.items?.items || [],
                productId,
                addOnVariantField.value,
                quantity
              )
            );
          }
          return;
        }

        const shippingField = event.target?.closest?.('[data-cart-custom-shipping-field]');
        if (shippingField) {
          syncCheckoutStartButton();
          void refreshCustomCheckoutShippingEstimate();
          ensureCustomCheckoutBootstrapped();
          syncCustomCheckoutShippingToStripe().catch((error) => {
            checkoutUiState.status = 'idle';
            setCheckoutUiError(error?.message || 'Shipping validation failed.');
            syncCustomCheckoutConfirmButton();
          });
          return;
        }

        const shippingOptionField = event.target?.closest?.('[data-cart-custom-shipping-option]');
        if (shippingOptionField instanceof HTMLSelectElement) {
          const currentQuote = checkoutUiState.customCheckout?.shippingQuote || {};
          const availableOptions = Array.isArray(currentQuote.availableOptions) ? currentQuote.availableOptions : [];
          const selectedOption = shippingOptionUtils.normalizeSelection(
            availableOptions,
            shippingOptionField.value,
            currentQuote.defaultOption
          );
          const selectedDetails = availableOptions.find((option) => option?.id === selectedOption) || null;
          checkoutUiState.customCheckout = {
            ...(checkoutUiState.customCheckout || {}),
            shippingQuote: {
              ...currentQuote,
              selectedOption,
              amountCents: Math.max(
                0,
                Number(
                  selectedDetails?.shippingCents ??
                  currentQuote.amountCents ??
                  getCampaignFallbackShippingCents(
                    store.getState()?.cart?.items?.items || [],
                    store.getState()?.cart?.bundleAddOnAnchorCampaignSlug
                  )
                ) || 0
              )
            }
          };
          syncCheckoutPreviewSummaryUI();
          return;
        }

        const customCheckoutEmailField = event.target?.closest?.('[data-cart-custom-checkout-email]');
        if (!customCheckoutEmailField) return;

        syncCheckoutStartButton();
        syncCustomCheckoutEmailToStripe(customCheckoutEmailField.value).catch((error) => {
          checkoutUiState.status = 'idle';
          setCheckoutUiError(error?.message || 'Email validation failed.');
          syncCustomCheckoutConfirmButton();
        });
      };

      document.addEventListener('input', document._poolFirstPartyCartInputHandler);
      document.addEventListener('change', document._poolFirstPartyCartChangeHandler);
    }

    function bindFirstPartyRecoveryActions() {
      if (document._poolFirstPartyRecoveryHandler) {
        document.removeEventListener('click', document._poolFirstPartyRecoveryHandler);
      }

      document._poolFirstPartyRecoveryHandler = function handleFirstPartyRecovery(event) {
        const resumeTrigger = event.target?.closest?.('[data-resume-first-party-pledge]');
        if (!resumeTrigger) return;

        event.preventDefault();
        const snapshot = readFirstPartyCheckoutSnapshot();
        if (!snapshot) return;
        if (!restoreCheckoutFromSnapshot(snapshot)) return;

        setCheckoutUiState({
          status: 'idle',
          error: ''
        });

        apiRoot.api.theme.cart.open().then(() => {
          apiRoot.api.theme.cart.navigate(CHECKOUT_VIEW_ROUTE);
        });
      };

      document.addEventListener('click', document._poolFirstPartyRecoveryHandler);
    }

    const apiRoot = {
      version: 'poolcart-first-party-scaffold',
      store: {
        getState: function() {
          return store.getState();
        },
        subscribe: function(handler) {
          return store.subscribe(handler);
        }
      },
      events: {
        on: function(eventName, handler) {
          return eventBus.on(eventName, handler);
        }
      },
      api: {
        cart: {
          update: function(payload) {
            const currentState = store.getState();
            const nextEmail = Object.prototype.hasOwnProperty.call(payload || {}, 'email')
              ? String(payload?.email || '')
              : String(currentState.cart?.email || '');
            const nextTipPercent = Object.prototype.hasOwnProperty.call(payload || {}, 'tipPercent')
              ? sanitizeTipPercent(payload?.tipPercent, currentState.cart?.tipPercent ?? getDefaultPlatformTipPercent())
              : (currentState.cart?.tipPercent ?? getDefaultPlatformTipPercent());
            const nextItems = currentState.cart?.items?.items || [];
            const totals = calculateCartTotals(
              nextItems,
              nextTipPercent,
              resolveCartBundleAddOnAnchorCampaignSlug(
                nextItems,
                Object.prototype.hasOwnProperty.call(payload || {}, 'bundleAddOnAnchorCampaignSlug')
                  ? payload?.bundleAddOnAnchorCampaignSlug
                  : currentState.cart?.bundleAddOnAnchorCampaignSlug
              )
            );

            updateCartState((state) => ({
              ...state,
              customer: {
                ...state.customer,
                email: nextEmail
              },
              cart: {
                ...state.cart,
                ...totals,
                ...payload,
                email: nextEmail,
                tipPercent: nextTipPercent,
                bundleAddOnAnchorCampaignSlug: resolveCartBundleAddOnAnchorCampaignSlug(
                  nextItems,
                  Object.prototype.hasOwnProperty.call(payload || {}, 'bundleAddOnAnchorCampaignSlug')
                    ? payload?.bundleAddOnAnchorCampaignSlug
                    : state.cart?.bundleAddOnAnchorCampaignSlug
                ),
                billingAddress: {
                  ...(state.cart?.billingAddress || {}),
                  ...(payload?.billingAddress || {})
                }
              }
            }));
            return Promise.resolve(store.getState().cart);
          },
          items: {
            add: function(item) {
              const normalizedItem = normalizeCartItem(item);
              const previousItems = store.getState().cart.items.items || [];
              const hadItems = previousItems.length > 0;
              const existingItem = previousItems.find((currentItem) => shouldMergeCartItem(currentItem, normalizedItem));

              if (existingItem) {
                const nextQuantity = Math.min(
                  existingItem.quantity + normalizedItem.quantity,
                  getItemQuantityCap(normalizedItem)
                );
                const updatedItem = {
                  ...existingItem,
                  ...normalizedItem,
                  uniqueId: existingItem.uniqueId,
                  quantity: nextQuantity
                };

                updateCartState((state) => {
                  const nextItems = coerceBundleAddOnCartItems(
                    previousItems.map((currentItem) => currentItem.uniqueId === existingItem.uniqueId ? updatedItem : currentItem)
                  );
                  const totals = calculateCartTotals(
                    nextItems,
                    state.cart?.tipPercent,
                    resolveCartBundleAddOnAnchorCampaignSlug(nextItems, state.cart?.bundleAddOnAnchorCampaignSlug)
                  );

                  return {
                    ...state,
                    cart: {
                      ...state.cart,
                      ...totals,
                      bundleAddOnAnchorCampaignSlug: resolveCartBundleAddOnAnchorCampaignSlug(
                        nextItems,
                        state.cart?.bundleAddOnAnchorCampaignSlug
                      ),
                      items: {
                        count: nextItems.length,
                        items: nextItems
                      }
                    }
                  };
                });

                if (updatedItem.quantity !== existingItem.quantity) {
                  eventBus.emit('item.updated', updatedItem);
                }

                return Promise.resolve(updatedItem);
              }

              updateCartState((state) => {
                const nextItems = coerceBundleAddOnCartItems(previousItems.concat(normalizedItem));
                const totals = calculateCartTotals(
                  nextItems,
                  state.cart?.tipPercent,
                  resolveCartBundleAddOnAnchorCampaignSlug(nextItems, state.cart?.bundleAddOnAnchorCampaignSlug)
                );

                return {
                  ...state,
                  cart: {
                    ...state.cart,
                    ...totals,
                    bundleAddOnAnchorCampaignSlug: resolveCartBundleAddOnAnchorCampaignSlug(
                      nextItems,
                      state.cart?.bundleAddOnAnchorCampaignSlug
                    ),
                    items: {
                      count: nextItems.length,
                      items: nextItems
                    }
                  }
                };
              });

              if (!hadItems) {
                eventBus.emit('cart.created', normalizedItem);
              }
              eventBus.emit('item.added', normalizedItem);
              return Promise.resolve(normalizedItem);
            },
            remove: function(uniqueId) {
              let removedItem = null;

              updateCartState((state) => {
                const currentItems = state.cart.items.items || [];
                const nextItems = coerceBundleAddOnCartItems(currentItems.filter((item) => {
                  const shouldKeep = item.uniqueId !== uniqueId;
                  if (!shouldKeep) removedItem = item;
                  return shouldKeep;
                }));
                const totals = calculateCartTotals(
                  nextItems,
                  state.cart?.tipPercent,
                  resolveCartBundleAddOnAnchorCampaignSlug(nextItems, state.cart?.bundleAddOnAnchorCampaignSlug)
                );

                return {
                  ...state,
                  cart: {
                    ...state.cart,
                    ...totals,
                    bundleAddOnAnchorCampaignSlug: resolveCartBundleAddOnAnchorCampaignSlug(
                      nextItems,
                      state.cart?.bundleAddOnAnchorCampaignSlug
                    ),
                    items: {
                      count: nextItems.length,
                      items: nextItems
                    }
                  }
                };
              });

              if (removedItem) {
                eventBus.emit('item.removed', removedItem);
              }
              return Promise.resolve(removedItem);
            },
            update: function(uniqueId, updates) {
              let updatedItem = null;

              updateCartState((state) => {
                const currentItems = state.cart.items.items || [];
                const nextItems = coerceBundleAddOnCartItems(currentItems.map((item) => {
                  if (item.uniqueId !== uniqueId) return item;

                  const requestedQuantity = updates?.quantity ?? item.quantity ?? 1;
                  const cappedQuantity = Math.min(
                    Math.max(1, Number(requestedQuantity)),
                    getItemQuantityCap(item)
                  );

                  updatedItem = {
                    ...item,
                    ...updates,
                    quantity: cappedQuantity
                  };

                  return updatedItem;
                }));
                const totals = calculateCartTotals(
                  nextItems,
                  state.cart?.tipPercent,
                  resolveCartBundleAddOnAnchorCampaignSlug(nextItems, state.cart?.bundleAddOnAnchorCampaignSlug)
                );

                return {
                  ...state,
                  cart: {
                    ...state.cart,
                    ...totals,
                    bundleAddOnAnchorCampaignSlug: resolveCartBundleAddOnAnchorCampaignSlug(
                      nextItems,
                      state.cart?.bundleAddOnAnchorCampaignSlug
                    ),
                    items: {
                      count: nextItems.length,
                      items: nextItems
                    }
                  }
                };
              });

              if (updatedItem) {
                eventBus.emit('item.updated', updatedItem);
              }

              return Promise.resolve(updatedItem);
            }
          }
        },
        theme: {
          cart: {
            open: function() {
              const focusTarget = arguments.length > 0 ? arguments[0] : undefined;
              openFirstPartyCart(focusTarget);
              eventBus.emit('cart.opened');
              return Promise.resolve();
            },
            close: function() {
              closeFirstPartyCart();
              eventBus.emit('cart.closed');
              return Promise.resolve();
            },
            navigate: function(route) {
              const previousRoute = currentRoute;
              if (currentRoute === CHECKOUT_VIEW_ROUTE && checkoutUiState.mode === 'custom') {
                persistCustomCheckoutDraftState(
                  readCustomCheckoutEmailDraft(),
                  readCustomCheckoutShippingDraft()
                );
              }
              currentRoute = route || null;
              if (previousRoute !== currentRoute) {
                cartShouldFocusAfterRender = true;
              }
              if (currentRoute !== CHECKOUT_VIEW_ROUTE) {
                lastCustomCheckoutShippingSignature = '';
                invalidateCustomCheckoutFlow();
                teardownActiveCustomCheckoutMount();
                checkoutUiState = {
                  status: 'idle',
                  error: '',
                  mode: getCheckoutUiMode(),
                  customCheckout: null
                };
              }
              const payload = {
                from: previousRoute,
                to: currentRoute
              };
              renderFirstPartyCart();
              eventBus.emit('theme.routechanged', payload);
              ensureCustomCheckoutBootstrapped();
              if (currentRoute === CHECKOUT_VIEW_ROUTE && checkoutUiState.mode === 'custom') {
                void refreshCustomCheckoutShippingEstimate();
              }
              return Promise.resolve(payload);
            }
          }
        }
      }
    };

    function bindFirstPartyButtons() {
      if (document._poolFirstPartyAddButtonHandler) {
        document.removeEventListener('click', document._poolFirstPartyAddButtonHandler);
      }

      document._poolFirstPartyAddButtonHandler = function handleFirstPartyAddButton(event) {
        const button = event.target?.closest?.('.poolcart-add-item');
        if (!button) return;
        if (button.disabled) return;

        event.preventDefault();
        event.stopPropagation();

        if (button.hasAttribute('data-redirect-url')) {
          const redirectUrl = button.getAttribute('data-redirect-url');
          const pendingItem = buildPendingCartItemFromButton(button);
          localStorage.setItem('pendingCartItem', JSON.stringify(pendingItem));
          redirectWindow(redirectUrl);
          return;
        }

        if (hasInteractiveCustomFields(button)) return;

        apiRoot.api.cart.items.add(buildCartItemFromButton(button)).then(() => {
          apiRoot.api.theme.cart.open();
        });
      };

      document.addEventListener('click', document._poolFirstPartyAddButtonHandler);
    }

    bindFirstPartyCartChrome();
    bindFirstPartyCartInputs();
    bindFirstPartyRecoveryActions();
    bindFirstPartyButtons();
    store.subscribe(() => {
      const state = store.getState();
      const nextShippingSignature = getCustomCheckoutShippingSignature(state);
      const shouldRefreshCustomCheckoutShipping =
        Boolean(nextShippingSignature) &&
        nextShippingSignature !== lastCustomCheckoutShippingSignature;

      lastCustomCheckoutShippingSignature = nextShippingSignature;
      writePersistedFirstPartyCartState(state);
      if (suppressDrawerRerender && isCartOpen && currentRoute !== CHECKOUT_VIEW_ROUTE) {
        syncFirstPartyCartTipUI();
        return;
      }
      renderFirstPartyCart();

      if (shouldRefreshCustomCheckoutShipping) {
        void refreshCustomCheckoutShippingEstimate();
      }
    });

    if (!isPledgeSuccessPath()) {
      restoreSavedCheckoutIntoCartState();
    }

    if (isPledgeSuccessPath()) {
      const successSnapshot = readFirstPartyCheckoutSnapshot();
      invalidateLiveCampaignCaches(getFirstPartyCampaignSlugs(successSnapshot?.cart?.items));
      renderSuccessSummaryCard();
      clearPersistedFirstPartyCartState();
      clearFirstPartyCheckoutSnapshot();
      clearPendingPledgeFlag();
      writeActiveCustomCheckoutOrderId('');
      hydrateSuccessSummaryCardFromBackend();
    } else if (isPledgeCancelledPath()) {
      renderCancelledRecoveryCard();
      hydrateRecoveryCardFromBackend();
    }

    const readyPromise = Promise.resolve(apiRoot);

    return {
      requestedRuntime: FIRST_PARTY_RUNTIME,
      activeRuntime: FIRST_PARTY_RUNTIME,
      getLegacyGlobal: function() {
        return null;
      },
      getApi: function() {
        return apiRoot;
      },
      onReady: function(handler) {
        if (typeof handler !== 'function') return;
        return readyPromise.then(handler);
      },
      whenReady: function() {
        return readyPromise;
      },
      store: {
        getState: function() {
          return store.getState();
        },
        subscribe: function(handler) {
          return store.subscribe(handler);
        }
      },
      events: {
        on: function(eventName, handler) {
          return eventBus.on(eventName, handler);
        }
      }
    };
  }

  const provider = buildFirstPartyProvider();
  window.PoolCartProvider = provider;

  dispatchProviderReady({
    requestedRuntime: provider.requestedRuntime,
    activeRuntime: provider.activeRuntime
  });
  dispatchCartReady({ activeRuntime: provider.activeRuntime });
})();
