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
  const CART_VIEW_ROUTE = '/cart';
  const CHECKOUT_VIEW_ROUTE = '/checkout';
  const DEFAULT_WORKER_BASE = 'https://pledge.dustwave.xyz';
  const DEFAULT_CHECKOUT_UI_MODE = 'hosted';
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
  const SHIPPING_COUNTRY_OPTIONS = [
    { value: 'US', label: 'United States' },
    { value: 'CA', label: 'Canada' },
    { value: 'MX', label: 'Mexico' },
    { value: 'AR', label: 'Argentina' },
    { value: 'BR', label: 'Brazil' },
    { value: 'CL', label: 'Chile' },
    { value: 'CO', label: 'Colombia' },
    { value: 'CR', label: 'Costa Rica' },
    { value: 'DO', label: 'Dominican Republic' },
    { value: 'EC', label: 'Ecuador' },
    { value: 'GT', label: 'Guatemala' },
    { value: 'JM', label: 'Jamaica' },
    { value: 'PA', label: 'Panama' },
    { value: 'PE', label: 'Peru' },
    { value: 'PR', label: 'Puerto Rico' },
    { value: 'UY', label: 'Uruguay' },
    { value: 'AT', label: 'Austria' },
    { value: 'BE', label: 'Belgium' },
    { value: 'BG', label: 'Bulgaria' },
    { value: 'CH', label: 'Switzerland' },
    { value: 'CY', label: 'Cyprus' },
    { value: 'CZ', label: 'Czech Republic' },
    { value: 'DE', label: 'Germany' },
    { value: 'DK', label: 'Denmark' },
    { value: 'EE', label: 'Estonia' },
    { value: 'ES', label: 'Spain' },
    { value: 'FI', label: 'Finland' },
    { value: 'FR', label: 'France' },
    { value: 'GB', label: 'United Kingdom' },
    { value: 'GR', label: 'Greece' },
    { value: 'HR', label: 'Croatia' },
    { value: 'HU', label: 'Hungary' },
    { value: 'IE', label: 'Ireland' },
    { value: 'IS', label: 'Iceland' },
    { value: 'IT', label: 'Italy' },
    { value: 'LT', label: 'Lithuania' },
    { value: 'LU', label: 'Luxembourg' },
    { value: 'LV', label: 'Latvia' },
    { value: 'MT', label: 'Malta' },
    { value: 'NL', label: 'Netherlands' },
    { value: 'NO', label: 'Norway' },
    { value: 'PL', label: 'Poland' },
    { value: 'PT', label: 'Portugal' },
    { value: 'RO', label: 'Romania' },
    { value: 'SE', label: 'Sweden' },
    { value: 'SI', label: 'Slovenia' },
    { value: 'SK', label: 'Slovakia' },
    { value: 'AU', label: 'Australia' },
    { value: 'IN', label: 'India' },
    { value: 'JP', label: 'Japan' },
    { value: 'KR', label: 'South Korea' }
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

  function getRequestedRuntime() {
    return window.POOL_CONFIG?.cartRuntime || DEFAULT_RUNTIME;
  }

  function getRequestedCheckoutProvider() {
    return window.POOL_CONFIG?.checkoutProvider || DEFAULT_CHECKOUT_PROVIDER;
  }

  function getWorkerBase() {
    return window.POOL_CONFIG?.workerBase || DEFAULT_WORKER_BASE;
  }

  function getCheckoutUiMode() {
    return String(window.POOL_CONFIG?.checkoutUiMode || DEFAULT_CHECKOUT_UI_MODE).trim().toLowerCase();
  }

  function getPlatformName() {
    return window.POOL_CONFIG?.platformName || DEFAULT_PLATFORM_NAME;
  }

  function getSalesTaxRate() {
    const parsed = Number(window.POOL_CONFIG?.salesTaxRate);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_SALES_TAX_RATE;
  }

  function getFlatShippingFeeCents() {
    const parsed = Number(window.POOL_CONFIG?.flatShippingRate);
    const amount = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_FLAT_SHIPPING_RATE;
    return Math.round(amount * 100);
  }

  function formatTaxRateLabel() {
    return `Sales tax (${(getSalesTaxRate() * 100).toFixed(3).replace(/\.?0+$/, '')}%)`;
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function formatTipSliderValueText(tipPercent, tipAmountCents) {
    const percent = sanitizeTipPercent(tipPercent, DEFAULT_PLATFORM_TIP_PERCENT);
    return `${percent}% tip, ${formatCents(Math.max(0, tipAmountCents || 0))}`;
  }

  function renderShippingCountryOptions(selectedValue) {
    const selected = String(selectedValue || DEFAULT_SHIPPING_COUNTRY).trim().toUpperCase();
    return SHIPPING_COUNTRY_OPTIONS.map((option) => `
      <option value="${escapeHtml(option.value)}" ${selected === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>
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

  function calculateCartTotals(items, tipPercent = DEFAULT_PLATFORM_TIP_PERCENT) {
    const subtotal = items.reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 1)), 0);
    const subtotalCents = Math.round(subtotal * 100);
    const nextTipPercent = sanitizeTipPercent(tipPercent, DEFAULT_PLATFORM_TIP_PERCENT);
    const tipAmountCents = Math.round((subtotalCents * nextTipPercent) / 100);
    const shippingCents = getPhysicalCampaignCount(items) * getFlatShippingFeeCents();
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
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_PLATFORM_TIP_PERCENT) {
      return parsed;
    }
    return fallback;
  }

  function calculateTax(subtotalCents) {
    return Math.round(Math.max(0, Number(subtotalCents) || 0) * getSalesTaxRate());
  }

  function getFirstPartyItemCampaignSlug(item) {
    const idSlug = typeof item?.id === 'string' ? item.id.split('__')[0] : '';
    if (idSlug) return idSlug;

    const url = String(item?.url || '');
    return url.split('/campaigns/')[1]?.split('/')[0] || '';
  }

  function firstPartyItemIsPhysical(item) {
    if (item?.shippable === true) return true;

    const fields = Array.isArray(item?.customFields) ? item.customFields : [];
    return fields.some((field) => field?.name === '_category' && field?.value === 'physical');
  }

  function getPhysicalCampaignCount(items) {
    const slugs = new Set();
    for (const item of Array.isArray(items) ? items : []) {
      if (!firstPartyItemIsPhysical(item)) continue;
      const slug = getFirstPartyItemCampaignSlug(item);
      if (slug) slugs.add(slug);
    }
    return slugs.size;
  }

  function buildFirstPartyPricing(state) {
    const items = state?.cart?.items?.items || [];
    const subtotalCents = Math.round((Number(state?.cart?.subtotal || 0)) * 100);
    const tipPercent = sanitizeTipPercent(state?.cart?.tipPercent, DEFAULT_PLATFORM_TIP_PERCENT);
    const tipAmountCents = Math.round((subtotalCents * tipPercent) / 100);
    const shippingCents = getPhysicalCampaignCount(items) * getFlatShippingFeeCents();
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

  function cartHasPhysicalItems(items) {
    return (items || []).some((item) => {
      if (item?.shippable === true) return true;

      const fields = Array.isArray(item?.customFields) ? item.customFields : [];
      return fields.some((field) => field?.name === '_category' && field?.value === 'physical');
    });
  }

  function buildCheckoutLineItems(items) {
    return (items || []).map((item) => ({
      name: item?.name || item?.id || 'Untitled item',
      quantity: Math.max(1, Number(item?.quantity || 1)),
      showQuantity: item?.stackable === true || Math.max(1, Number(item?.quantity || 1)) > 1,
      amountCents: Math.round((Number(item?.price) || 0) * Math.max(1, Number(item?.quantity || 1)) * 100)
    }));
  }

  function getCurrentPath() {
    return String(window.location?.pathname || '/');
  }

  function isPledgeCancelledPath() {
    return /^\/pledge-cancelled\/?$/.test(getCurrentPath());
  }

  function isPledgeSuccessPath() {
    return /^\/pledge-success\/?$/.test(getCurrentPath());
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

  function buildFirstPartyCheckoutSnapshot(state) {
    const items = state?.cart?.items?.items || [];
    if (items.length === 0) return null;

    return {
      cart: {
        tipPercent: sanitizeTipPercent(state?.cart?.tipPercent, DEFAULT_PLATFORM_TIP_PERCENT),
        items: items.map((item) => ({
          id: item?.id || '',
          name: item?.name || '',
          price: Number(item?.price || 0),
          quantity: Math.max(1, Number(item?.quantity || 1)),
          url: item?.url || '',
          description: item?.description || '',
          stackable: item?.stackable === true,
          shippable: item?.shippable === true,
          maxQuantity: Number.isFinite(Number(item?.maxQuantity)) ? Number(item?.maxQuantity) : undefined,
          customFields: Array.isArray(item?.customFields) ? item.customFields : undefined
        }))
      },
      campaignUrl: String(items[0]?.url || '/'),
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
    const items = Array.isArray(state?.cart?.items?.items) ? state.cart.items.items : [];
    if (items.length === 0) return null;

    return {
      token: String(state?.cart?.token || `${FIRST_PARTY_CART_TOKEN_PREFIX}${Date.now().toString(36)}`),
      tipPercent: sanitizeTipPercent(state?.cart?.tipPercent, DEFAULT_PLATFORM_TIP_PERCENT),
      items: items.map((item) => ({
        id: String(item?.id || ''),
        uniqueId: String(item?.uniqueId || ''),
        name: String(item?.name || ''),
        price: Number(item?.price || 0),
        quantity: Math.max(1, Number(item?.quantity || 1)),
        url: String(item?.url || ''),
        description: String(item?.description || ''),
        stackable: item?.stackable === true,
        shippable: item?.shippable === true,
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

      const items = persisted.items
        .map((item) => normalizeCartItem(item))
        .filter((item) => item.id);

      if (items.length === 0) {
        return null;
      }

      return {
        token: String(persisted?.token || `${FIRST_PARTY_CART_TOKEN_PREFIX}${Date.now().toString(36)}`),
        tipPercent: sanitizeTipPercent(persisted?.tipPercent, DEFAULT_PLATFORM_TIP_PERCENT),
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
    const firstItem = Array.isArray(items) ? items[0] : null;
    return getFirstPartyItemCampaignSlug(firstItem);
  }

  function getFirstPartyCampaignSlugs(items) {
    const slugs = new Set();

    for (const item of Array.isArray(items) ? items : []) {
      const slug = getFirstPartyItemCampaignSlug(item);
      if (slug) slugs.add(slug);
    }

    return Array.from(slugs);
  }

  function invalidateLiveCampaignCaches(campaignSlugs) {
    const slugs = Array.from(new Set((campaignSlugs || []).filter(Boolean)));
    if (slugs.length === 0) return;

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

  function buildFirstPartyCheckoutPayload(state) {
    const items = state?.cart?.items?.items || [];
    if (items.length === 0) {
      return {
        valid: false,
        error: 'Your cart is empty.'
      };
    }

    const campaignSlug = getFirstPartyCampaignSlug(items);
    if (!campaignSlug) {
      return {
        valid: false,
        error: 'Could not determine which campaign this pledge belongs to.'
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
            tipPercent: sanitizeTipPercent(state?.cart?.tipPercent, DEFAULT_PLATFORM_TIP_PERCENT)
          }
        };
  }

  function buildFirstPartyInitialState() {
    const persisted = readPersistedFirstPartyCartState();
    const draft = readFirstPartyCartDraftState();
    const persistedItems = persisted?.items || [];
    const persistedTipPercent = sanitizeTipPercent(persisted?.tipPercent, DEFAULT_PLATFORM_TIP_PERCENT);
    const persistedTotals = calculateCartTotals(persistedItems, persistedTipPercent);
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
    let customCheckoutFlowToken = 0;
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
      const nextTipPercent = sanitizeTipPercent(snapshot?.cart?.tipPercent, DEFAULT_PLATFORM_TIP_PERCENT);
      const totals = calculateCartTotals(nextItems, nextTipPercent);

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
      const pricing = buildFirstPartyPricing(state);
      const hasPhysicalItems = cartHasPhysicalItems(items);
      const checkoutLineItems = buildCheckoutLineItems(items);
      const wantsCustomCheckout = isCheckoutPreview &&
        isFirstPartyCheckoutEnabled &&
        getCheckoutUiMode() === 'custom';
      const isCustomCheckout = wantsCustomCheckout && checkoutUiState.mode === 'custom';
      const customCheckout = checkoutUiState.customCheckout || {};
      const checkoutErrorMarkup = `
        <p class="pool-first-party-cart__error" data-cart-checkout-error role="alert" ${checkoutUiState.error ? '' : 'hidden'}>${escapeHtml(checkoutUiState.error || '')}</p>
      `;
      const customCheckoutMarkup = wantsCustomCheckout ? `
        ${hasPhysicalItems ? `
          <div class="pool-first-party-cart__callout pool-first-party-cart__callout--stripe">
            <p class="pool-first-party-cart__section-label">Shipping address</p>
            <div class="pool-first-party-cart__shipping-fallback pool-first-party-cart__shipping-fallback--plain" data-cart-custom-shipping-fallback>
              <div class="pool-first-party-cart__shipping-grid">
                <div class="pool-first-party-cart__field pool-first-party-cart__field--full">
                  <label class="pool-first-party-cart__field-label" for="pool-custom-shipping-name">Full name <span class="pool-first-party-cart__required-mark" aria-hidden="true">*</span></label>
                  <input id="pool-custom-shipping-name" name="shipping_name" class="pool-first-party-cart__input" type="text" autocomplete="shipping name" aria-describedby="pool-custom-shipping-error" aria-invalid="${customCheckout?.shippingError ? 'true' : 'false'}" value="${escapeHtml(customCheckout?.shippingDraft?.name || '')}" data-cart-custom-shipping-field="name">
                </div>
                <div class="pool-first-party-cart__field pool-first-party-cart__field--full">
                  <label class="pool-first-party-cart__field-label" for="pool-custom-checkout-email-fallback">Email address <span class="pool-first-party-cart__required-mark" aria-hidden="true">*</span></label>
                  <input
                    id="pool-custom-checkout-email-fallback"
                    name="shipping_email"
                    class="pool-first-party-cart__input"
                    type="email"
                    inputmode="email"
                    autocomplete="shipping email"
                    aria-describedby="pool-custom-checkout-email-error"
                    value="${escapeHtml(customCheckout?.emailDraft || '')}"
                    data-cart-custom-checkout-email
                  >
                  <p id="pool-custom-checkout-email-error" class="pool-first-party-cart__field-error" data-cart-custom-checkout-email-error ${customCheckout?.emailError ? '' : 'hidden'}>${escapeHtml(customCheckout?.emailError || '')}</p>
                </div>
                <div class="pool-first-party-cart__field pool-first-party-cart__field--full">
                  <label class="pool-first-party-cart__field-label" for="pool-custom-shipping-line1">Address line 1 <span class="pool-first-party-cart__required-mark" aria-hidden="true">*</span></label>
                  <input id="pool-custom-shipping-line1" name="shipping_address_line1" class="pool-first-party-cart__input" type="text" autocomplete="shipping address-line1" aria-describedby="pool-custom-shipping-error" aria-invalid="${customCheckout?.shippingError ? 'true' : 'false'}" value="${escapeHtml(customCheckout?.shippingDraft?.address?.line1 || '')}" data-cart-custom-shipping-field="line1">
                </div>
                <div class="pool-first-party-cart__field pool-first-party-cart__field--full">
                  <label class="pool-first-party-cart__field-label" for="pool-custom-shipping-line2">Address line 2</label>
                  <input id="pool-custom-shipping-line2" name="shipping_address_line2" class="pool-first-party-cart__input" type="text" autocomplete="shipping address-line2" aria-describedby="pool-custom-shipping-error" aria-invalid="${customCheckout?.shippingError ? 'true' : 'false'}" value="${escapeHtml(customCheckout?.shippingDraft?.address?.line2 || '')}" data-cart-custom-shipping-field="line2">
                </div>
                <div class="pool-first-party-cart__field">
                  <label class="pool-first-party-cart__field-label" for="pool-custom-shipping-city">City <span class="pool-first-party-cart__required-mark" aria-hidden="true">*</span></label>
                  <input id="pool-custom-shipping-city" name="shipping_city" class="pool-first-party-cart__input" type="text" autocomplete="shipping address-level2" aria-describedby="pool-custom-shipping-error" aria-invalid="${customCheckout?.shippingError ? 'true' : 'false'}" value="${escapeHtml(customCheckout?.shippingDraft?.address?.city || '')}" data-cart-custom-shipping-field="city">
                </div>
                <div class="pool-first-party-cart__field">
                  <label class="pool-first-party-cart__field-label" for="pool-custom-shipping-state">State / Province <span class="pool-first-party-cart__required-mark" aria-hidden="true">*</span></label>
                  <input id="pool-custom-shipping-state" name="shipping_state" class="pool-first-party-cart__input" type="text" autocomplete="shipping address-level1" aria-describedby="pool-custom-shipping-error" aria-invalid="${customCheckout?.shippingError ? 'true' : 'false'}" value="${escapeHtml(customCheckout?.shippingDraft?.address?.state || '')}" data-cart-custom-shipping-field="state">
                </div>
                <div class="pool-first-party-cart__field">
                  <label class="pool-first-party-cart__field-label" for="pool-custom-shipping-postal">Postal code <span class="pool-first-party-cart__required-mark" aria-hidden="true">*</span></label>
                  <input id="pool-custom-shipping-postal" name="shipping_postal_code" class="pool-first-party-cart__input" type="text" inputmode="numeric" autocomplete="shipping postal-code" aria-describedby="pool-custom-shipping-error" aria-invalid="${customCheckout?.shippingError ? 'true' : 'false'}" value="${escapeHtml(customCheckout?.shippingDraft?.address?.postal_code || '')}" data-cart-custom-shipping-field="postal_code">
                </div>
                <div class="pool-first-party-cart__field">
                  <label class="pool-first-party-cart__field-label" for="pool-custom-shipping-country">Country <span class="pool-first-party-cart__required-mark" aria-hidden="true">*</span></label>
                  <select id="pool-custom-shipping-country" name="shipping_country" class="pool-first-party-cart__input pool-first-party-cart__input--select" autocomplete="shipping country" aria-describedby="pool-custom-shipping-error" aria-invalid="${customCheckout?.shippingError ? 'true' : 'false'}" data-cart-custom-shipping-field="country">
                    ${renderShippingCountryOptions(customCheckout?.shippingDraft?.address?.country || DEFAULT_SHIPPING_COUNTRY)}
                  </select>
                </div>
              </div>
              <p id="pool-custom-shipping-error" class="pool-first-party-cart__field-error" data-cart-custom-shipping-error role="alert" ${customCheckout?.shippingError ? '' : 'hidden'}>${escapeHtml(customCheckout?.shippingError || '')}</p>
            </div>
          </div>
        ` : `
          <div class="pool-first-party-cart__callout pool-first-party-cart__callout--stripe">
            <p class="pool-first-party-cart__section-label">Contact</p>
            <div class="pool-first-party-cart__stripe-shell">
              <div class="pool-first-party-cart__field pool-first-party-cart__field--compact" data-cart-custom-checkout-email-fallback>
                <label class="pool-first-party-cart__field-label" for="pool-custom-checkout-email">Email address <span class="pool-first-party-cart__required-mark" aria-hidden="true">*</span></label>
                  <input
                    id="pool-custom-checkout-email"
                    class="pool-first-party-cart__input"
                    type="email"
                    inputmode="email"
                    autocomplete="email"
                    aria-describedby="pool-custom-checkout-email-error"
                    value="${escapeHtml(customCheckout?.emailDraft || '')}"
                    data-cart-custom-checkout-email
                  >
                <p id="pool-custom-checkout-email-error" class="pool-first-party-cart__field-error" data-cart-custom-checkout-email-error ${customCheckout?.emailError ? '' : 'hidden'}>${escapeHtml(customCheckout?.emailError || '')}</p>
              </div>
            </div>
          </div>
        `}
        <div class="pool-first-party-cart__callout pool-first-party-cart__callout--stripe">
          <p class="pool-first-party-cart__section-label">Payment method</p>
          <div class="pool-first-party-cart__stripe-shell">
            <div class="pool-first-party-cart__stripe-region pool-first-party-cart__stripe-region--payment" data-cart-custom-checkout-region="payment"></div>
          </div>
          <p class="pool-first-party-cart__note pool-first-party-cart__note--payment-consent">By providing your card information, you allow The Pool to charge your card if the campaign(s) you backed reaches its goal before its end date.</p>
        </div>
      ` : `
        <div class="pool-first-party-cart__callout">
          <p class="pool-first-party-cart__section-label">Next step</p>
          <p class="pool-first-party-cart__note">Continue to Stripe's secure payment platform to enter your payment information and email address -- this finalizes your pledge. You will only be charged if the campaign funds successfully.</p>
        </div>
      `;
      const itemMarkup = items.length > 0 ? items.map((item) => `
        <li class="pool-first-party-cart__item" data-item-id="${item.uniqueId}">
          <div class="pool-first-party-cart__item-main">
            <strong class="pool-first-party-cart__item-name">${escapeHtml(item.name || item.id || 'Untitled item')}</strong>
            ${(item.stackable === true || (item.quantity || 1) > 1)
              ? `<span class="pool-first-party-cart__item-meta">Qty ${item.quantity || 1}</span>`
              : ''}
          </div>
          <div class="pool-first-party-cart__item-actions">
            <span class="pool-first-party-cart__item-price">${formatCurrency((item.price || 0) * (item.quantity || 1))}</span>
            <button type="button" class="pool-first-party-cart__remove" data-remove-item="${item.uniqueId}">Remove</button>
          </div>
        </li>
      `).join('') : `
        <li class="pool-first-party-cart__empty">Your cart is empty.</li>
      `;
      const cartEstimateMarkup = items.length > 0 ? `
        <div class="pool-first-party-cart__tip-box">
          <div class="pool-first-party-cart__tip-header">
            <strong id="pool-cart-tip-label">Tip ${escapeHtml(getPlatformName())} for platform maintenance.</strong>
            <span id="pool-cart-tip-amount" data-cart-tip-amount>${formatCents(pricing.tipAmountCents)}</span>
          </div>
          <p class="pool-first-party-cart__tip-copy" id="pool-cart-tip-copy">${escapeHtml(getPlatformName())} has a 0% platform fee for organizers. Optional tips help keep the platform sustainable for creators.</p>
          <div class="pool-first-party-cart__tip-controls">
            <input
              id="pool-cart-tip-input"
              class="pool-first-party-cart__tip-slider"
              type="range"
              min="0"
              max="${MAX_PLATFORM_TIP_PERCENT}"
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
          <p class="pool-first-party-cart__section-label">Pledge total</p>
          <div class="pool-first-party-cart__checkout-summary">
            <div class="pool-first-party-cart__summary-row">
              <span>Subtotal</span>
              <strong data-cart-summary-subtotal>${formatCents(pricing.subtotalCents)}</strong>
            </div>
            ${pricing.tipAmountCents > 0 ? `
              <div class="pool-first-party-cart__summary-row" data-cart-summary-tip-row>
                <span data-cart-summary-tip-label>${escapeHtml(getPlatformName())} tip (${pricing.tipPercent}%)</span>
                <strong data-cart-summary-tip-amount>${formatCents(pricing.tipAmountCents)}</strong>
              </div>
            ` : ''}
            <div class="pool-first-party-cart__summary-row">
              <span>${formatTaxRateLabel()}</span>
              <strong data-cart-summary-tax>${formatCents(pricing.taxCents)}</strong>
            </div>
            ${pricing.shippingCents > 0 ? `
              <div class="pool-first-party-cart__summary-row" data-cart-summary-shipping-row>
                <span>Shipping</span>
                <strong data-cart-summary-shipping>${formatCents(pricing.shippingCents)}</strong>
              </div>
            ` : ''}
            <div class="pool-first-party-cart__summary-row pool-first-party-cart__summary-row--total">
              <span>Pledge total</span>
              <strong data-cart-summary-total>${formatCents(pricing.totalCents)}</strong>
            </div>
          </div>
        </section>
      ` : '';
      const bodyMarkup = isCheckoutPreview ? `
        <section class="pool-first-party-cart__checkout-preview">
          <div class="pool-first-party-cart__summary-block">
            <div class="pool-first-party-cart__line-items">
              <p class="pool-first-party-cart__section-label">Pledge summary</p>
              <ul class="pool-first-party-cart__line-item-list">
                ${checkoutLineItems.map((item) => `
                  <li class="pool-first-party-cart__line-item">
                    <div>
                      <strong class="pool-first-party-cart__line-item-name">${escapeHtml(item.name)}</strong>
                      ${item.showQuantity ? `<span>Qty ${item.quantity}</span>` : ''}
                    </div>
                    <strong class="pool-first-party-cart__line-item-amount">${formatCents(item.amountCents)}</strong>
                  </li>
                `).join('')}
              </ul>
            </div>
            <div class="pool-first-party-cart__checkout-summary">
              <div class="pool-first-party-cart__summary-row">
                <span>Subtotal</span>
                <strong>${formatCents(pricing.subtotalCents)}</strong>
              </div>
              ${pricing.tipAmountCents > 0 ? `
                <div class="pool-first-party-cart__summary-row">
                  <span>${escapeHtml(getPlatformName())} tip (${pricing.tipPercent}%)</span>
                  <strong>${formatCents(pricing.tipAmountCents)}</strong>
                </div>
              ` : ''}
              <div class="pool-first-party-cart__summary-row">
                  <span>${formatTaxRateLabel()}</span>
                <strong>${formatCents(pricing.taxCents)}</strong>
              </div>
              ${pricing.shippingCents > 0 ? `
                <div class="pool-first-party-cart__summary-row">
                  <span>Shipping</span>
                  <strong>${formatCents(pricing.shippingCents)}</strong>
                </div>
              ` : ''}
              <div class="pool-first-party-cart__summary-row pool-first-party-cart__summary-row--total">
                <span>Pledge total</span>
                <strong>${formatCents(pricing.totalCents)}</strong>
              </div>
            </div>
          </div>
          ${customCheckoutMarkup}
          ${checkoutErrorMarkup}
        </section>
      ` : `
        <ul class="pool-first-party-cart__items">${itemMarkup}</ul>
        ${cartEstimateMarkup}
      `;
      const footerActions = isCheckoutPreview ? `
          <div class="pool-first-party-cart__actions">
            <button type="button" class="pool-first-party-cart__action pool-first-party-cart__action--secondary" data-cart-back>Back to cart</button>
            ${wantsCustomCheckout ? `
              <button
                type="button"
                class="pool-first-party-cart__action${checkoutUiState.status === 'confirming' || checkoutUiState.status === 'redirecting' ? ' is-busy' : ''}"
                data-cart-confirm-custom-checkout
                aria-busy="${checkoutUiState.status === 'confirming' || checkoutUiState.status === 'redirecting' ? 'true' : 'false'}"
                ${checkoutUiState.status === 'confirming' || checkoutUiState.status === 'submitting' || customCheckout?.mountStatus !== 'mounted' ? 'disabled' : ''}
              >${renderBusyButtonLabel(
                checkoutUiState.status === 'confirming'
                  ? 'Saving payment method...'
                  : checkoutUiState.status === 'redirecting'
                    ? 'Finishing pledge...'
                    : 'Save payment method',
                checkoutUiState.status === 'confirming' || checkoutUiState.status === 'redirecting'
              )}</button>
            ` : `
              <button
                type="button"
                class="pool-first-party-cart__action"
                data-cart-start-checkout
                ${!isFirstPartyCheckoutEnabled || checkoutUiState.status === 'submitting' ? 'disabled' : ''}
              >${checkoutUiState.status === 'submitting' ? 'Starting pledge...' : (isFirstPartyCheckoutEnabled ? 'Continue to pledge' : 'Legacy checkout only')}</button>
            `}
        </div>
      ` : `
        <div class="pool-first-party-cart__actions">
          <button type="button" class="pool-first-party-cart__action pool-first-party-cart__action--secondary" data-cart-close>Keep browsing</button>
          <button type="button" class="pool-first-party-cart__action" data-cart-continue ${items.length === 0 ? 'disabled' : ''}>Checkout</button>
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
                ? '<p id="pool-first-party-cart-title" class="pool-first-party-cart__section-label pool-first-party-cart__section-label--header">Checkout</p>'
                : '<p id="pool-first-party-cart-title" class="pool-first-party-cart__section-label pool-first-party-cart__section-label--header">Your cart</p>'}
            </div>
            <button type="button" class="pool-first-party-cart__close" data-cart-close aria-label="Close cart" data-cart-dialog-initial-focus>X</button>
          </header>
          <div class="pool-first-party-cart__body">
            ${bodyMarkup}
          </div>
          <footer class="pool-first-party-cart__footer">
            ${footerActions}
          </footer>
        </div>
      `;
      root.setAttribute('aria-hidden', 'false');
      activateCartDialog(root);
      if (isCustomCheckout && customCheckout?.scriptStatus === 'ready') {
        mountCustomCheckoutIntoDrawer(root);
      }
    }

    function syncFirstPartyCartTipUI() {
      const root = getCartRoot();
      if (!root || !isCartOpen || currentRoute === CHECKOUT_VIEW_ROUTE) return;

      const pricing = buildFirstPartyPricing(store.getState());
      const tipAmount = root.querySelector('[data-cart-tip-amount]');
      const tipPercent = root.querySelector('[data-cart-tip-percent]');
      const tipInput = root.querySelector('[data-cart-tip]');
      const tipRow = root.querySelector('[data-cart-summary-tip-row]');
      const tipLabel = root.querySelector('[data-cart-summary-tip-label]');
      const tipSummaryAmount = root.querySelector('[data-cart-summary-tip-amount]');
      const subtotal = root.querySelector('[data-cart-summary-subtotal]');
      const tax = root.querySelector('[data-cart-summary-tax]');
      const shippingRow = root.querySelector('[data-cart-summary-shipping-row]');
      const shipping = root.querySelector('[data-cart-summary-shipping]');
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
        tipLabel.textContent = `${getPlatformName()} tip (${pricing.tipPercent}%)`;
        tipSummaryAmount.textContent = formatCents(pricing.tipAmountCents);
      }

      if (shippingRow && shipping) {
        shippingRow.hidden = pricing.shippingCents <= 0;
        shipping.textContent = formatCents(pricing.shippingCents);
      }
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
          ? 'Saving payment method...'
          : isRedirecting
            ? 'Finishing pledge...'
            : isSubmitting
              ? 'Loading secure payment...'
              : 'Save payment method',
        isConfirming || isRedirecting
      );
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
        return 'Enter an email address to continue.';
      }
      if (message.includes('valid email')) {
        return 'Enter a valid email address to continue.';
      }
      return rawMessage || 'Enter an email address to continue.';
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

    async function syncCustomCheckoutShippingToStripe(options) {
      const shippingDraft = readCustomCheckoutShippingDraft();
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
        const message = 'Enter a complete shipping address to continue.';
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
      checkoutUiState.customCheckout = {
        ...(checkoutUiState.customCheckout || {}),
        emailDraft: trimmedEmail,
        emailError: ''
      };

      if (!trimmedEmail) {
        const message = 'Enter an email address to continue.';
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
      if (checkoutUiState.customCheckout.mountStatus !== 'idle') return;
      if (!window.PoolStripeCheckoutSidecar || typeof window.PoolStripeCheckoutSidecar.mount !== 'function') return;
      const flowToken = customCheckoutFlowToken;

      const paymentContainer = root.querySelector('[data-cart-custom-checkout-region="payment"]');
      const shippingContainer = root.querySelector('[data-cart-custom-checkout-region="address"]');

      checkoutUiState.customCheckout.mountStatus = 'mounting';
      syncCustomCheckoutConfirmButton();

      try {
        const mountResult = await window.PoolStripeCheckoutSidecar.mount({
          publishableKey: checkoutUiState.customCheckout.publishableKey,
          clientSecret: checkoutUiState.customCheckout.clientSecret,
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
          error: 'Secure checkout is not ready yet.'
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
          setCheckoutUiError('Payment method saved, but pledge confirmation is still processing. Please stay on this page a moment and try again.');
          syncCustomCheckoutConfirmButton();
          return;
        }

        const affectedCampaignSlugs = getFirstPartyCampaignSlugs(store.getState()?.cart?.items?.items);
        markLiveCampaignRefreshNeeded(affectedCampaignSlugs);
        invalidateLiveCampaignCaches(affectedCampaignSlugs);
        writeActiveCustomCheckoutOrderId('');
        redirectWindow(`/pledge-success/?orderId=${encodeURIComponent(orderId)}`);
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
        setCheckoutUiError(error?.message || 'There was an error saving your payment method.');
        syncCustomCheckoutConfirmButton();
      }
    }

    async function bootstrapCustomCheckout(data, stripeReadyPromise) {
      const flowToken = invalidateCustomCheckoutFlow();
      const nextCustomCheckout = {
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
          error: error?.message || 'Stripe.js failed to load.',
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
          error: 'First-party checkout is not enabled for this build.'
        });
        return;
      }

      const payloadResult = buildFirstPartyCheckoutPayload(store.getState());
      if (!payloadResult.valid) {
        setCheckoutUiState({
          status: 'idle',
          error: payloadResult.error
        });
        return;
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
          error: error?.message || 'There was an error starting your pledge.',
          mode: getCheckoutUiMode(),
          customCheckout: null
        });
      }
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

        const shippingField = event.target?.closest?.('[data-cart-custom-shipping-field]');
        if (shippingField) {
          syncCustomCheckoutShippingToStripe().catch((error) => {
            checkoutUiState.status = 'idle';
            setCheckoutUiError(error?.message || 'Shipping validation failed.');
            syncCustomCheckoutConfirmButton();
          });
          return;
        }

        const customCheckoutEmailField = event.target?.closest?.('[data-cart-custom-checkout-email]');
        if (!customCheckoutEmailField) return;

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
              ? sanitizeTipPercent(payload?.tipPercent, currentState.cart?.tipPercent ?? DEFAULT_PLATFORM_TIP_PERCENT)
              : (currentState.cart?.tipPercent ?? DEFAULT_PLATFORM_TIP_PERCENT);
            const nextItems = currentState.cart?.items?.items || [];
            const totals = calculateCartTotals(nextItems, nextTipPercent);

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
                  const nextItems = previousItems.map((currentItem) => currentItem.uniqueId === existingItem.uniqueId ? updatedItem : currentItem);
                  const totals = calculateCartTotals(nextItems, state.cart?.tipPercent);

                  return {
                    ...state,
                    cart: {
                      ...state.cart,
                      ...totals,
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
                const nextItems = previousItems.concat(normalizedItem);
                const totals = calculateCartTotals(nextItems, state.cart?.tipPercent);

                return {
                  ...state,
                  cart: {
                    ...state.cart,
                    ...totals,
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
                const nextItems = currentItems.filter((item) => {
                  const shouldKeep = item.uniqueId !== uniqueId;
                  if (!shouldKeep) removedItem = item;
                  return shouldKeep;
                });
                const totals = calculateCartTotals(nextItems, state.cart?.tipPercent);

                return {
                  ...state,
                  cart: {
                    ...state.cart,
                    ...totals,
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
                const nextItems = currentItems.map((item) => {
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
                });
                const totals = calculateCartTotals(nextItems, state.cart?.tipPercent);

                return {
                  ...state,
                  cart: {
                    ...state.cart,
                    ...totals,
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
              currentRoute = route || null;
              if (previousRoute !== currentRoute) {
                cartShouldFocusAfterRender = true;
              }
              if (currentRoute !== CHECKOUT_VIEW_ROUTE) {
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
              if (
                currentRoute === CHECKOUT_VIEW_ROUTE &&
                getRequestedCheckoutProvider() === FIRST_PARTY_CHECKOUT_PROVIDER &&
                getCheckoutUiMode() === 'custom' &&
                checkoutUiState.status === 'idle' &&
                !checkoutUiState.customCheckout
              ) {
                void startFirstPartyCheckout();
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
      writePersistedFirstPartyCartState(store.getState());
      if (suppressDrawerRerender && isCartOpen && currentRoute !== CHECKOUT_VIEW_ROUTE) {
        syncFirstPartyCartTipUI();
        return;
      }
      renderFirstPartyCart();
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
