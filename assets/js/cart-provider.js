(function() {
'use strict';

  const DEFAULT_RUNTIME = 'first_party';
  const DEFAULT_CHECKOUT_PROVIDER = 'first_party';
  const FIRST_PARTY_RUNTIME = 'first_party';
  const FIRST_PARTY_CHECKOUT_PROVIDER = 'first_party';
  const FIRST_PARTY_CART_TOKEN_PREFIX = 'poolcart_';
  const FIRST_PARTY_ITEM_ID_PREFIX = 'poolitem_';
  const FIRST_PARTY_CHECKOUT_SNAPSHOT_KEY = 'pool_first_party_checkout_snapshot';
  const FIRST_PARTY_CART_STATE_KEY = 'pool_first_party_cart_state';
  const CART_VIEW_ROUTE = '/cart';
  const CHECKOUT_VIEW_ROUTE = '/checkout';
  const DEFAULT_WORKER_BASE = 'https://pledge.dustwave.xyz';
  const DEFAULT_PLATFORM_TIP_PERCENT = 5;
  const MAX_PLATFORM_TIP_PERCENT = 15;
  const DEFAULT_PLATFORM_NAME = 'The Pool';
  const DEFAULT_FLAT_SHIPPING_RATE = 3;
  const DEFAULT_SALES_TAX_RATE = 0.07875;

  function getRequestedRuntime() {
    return window.POOL_CONFIG?.cartRuntime || DEFAULT_RUNTIME;
  }

  function getRequestedCheckoutProvider() {
    return window.POOL_CONFIG?.checkoutProvider || DEFAULT_CHECKOUT_PROVIDER;
  }

  function getWorkerBase() {
    return window.POOL_CONFIG?.workerBase || DEFAULT_WORKER_BASE;
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

  function getCartRoot() {
    return document.querySelector('[data-pool-cart-root]');
  }

  function dispatchProviderReady(detail) {
    document.dispatchEvent(new CustomEvent('poolcart.provider.ready', { detail: detail || {} }));
  }

  function dispatchCartReady(detail) {
    document.dispatchEvent(new CustomEvent('poolcart.ready', { detail: detail || {} }));
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
        email: String(state?.cart?.email || ''),
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
    try {
      const raw = localStorage.getItem(FIRST_PARTY_CHECKOUT_SNAPSHOT_KEY);
      if (!raw) return null;

      const snapshot = JSON.parse(raw);
      if (!Array.isArray(snapshot?.cart?.items) || snapshot.cart.items.length === 0) {
        return null;
      }

      return snapshot;
    } catch (_error) {
      return null;
    }
  }

  function clearFirstPartyCheckoutSnapshot() {
    try {
      localStorage.removeItem(FIRST_PARTY_CHECKOUT_SNAPSHOT_KEY);
    } catch (_error) {}
  }

  function buildPersistedFirstPartyCartState(state) {
    const items = Array.isArray(state?.cart?.items?.items) ? state.cart.items.items : [];
    if (items.length === 0) return null;

    return {
      token: String(state?.cart?.token || `${FIRST_PARTY_CART_TOKEN_PREFIX}${Date.now().toString(36)}`),
      email: String(state?.cart?.email || ''),
      tipPercent: sanitizeTipPercent(state?.cart?.tipPercent, DEFAULT_PLATFORM_TIP_PERCENT),
      billingAddress: state?.cart?.billingAddress && typeof state.cart.billingAddress === 'object'
        ? { ...state.cart.billingAddress }
        : {},
      customer: state?.customer && typeof state.customer === 'object'
        ? { ...state.customer }
        : {},
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
        localStorage.removeItem(FIRST_PARTY_CART_STATE_KEY);
        return;
      }

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
        email: String(persisted?.email || ''),
        tipPercent: sanitizeTipPercent(persisted?.tipPercent, DEFAULT_PLATFORM_TIP_PERCENT),
        billingAddress: persisted?.billingAddress && typeof persisted.billingAddress === 'object'
          ? { ...persisted.billingAddress }
          : {},
        customer: persisted?.customer && typeof persisted.customer === 'object'
          ? { ...persisted.customer }
          : {},
        items
      };
    } catch (_error) {
      return null;
    }
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
    const persistedItems = persisted?.items || [];
    const persistedTipPercent = sanitizeTipPercent(persisted?.tipPercent, DEFAULT_PLATFORM_TIP_PERCENT);
    const persistedTotals = calculateCartTotals(persistedItems, persistedTipPercent);

    return {
      cart: {
        token: persisted?.token || `${FIRST_PARTY_CART_TOKEN_PREFIX}${Date.now().toString(36)}`,
        paymentSession: {
          publicToken: null
        },
        subtotal: persistedTotals.subtotal || 0,
        total: persistedTotals.total || 0,
        email: persisted?.email || '',
        tipPercent: persistedTipPercent,
        billingAddress: persisted?.billingAddress || {},
        items: {
          count: persistedItems.length,
          items: persistedItems
        }
      },
      customer: persisted?.customer || {}
    };
  }

  function buildFirstPartyProvider() {
    const eventBus = createEventBus();
    const store = createStore(buildFirstPartyInitialState());
    let currentRoute = null;
    let isCartOpen = false;
    let suppressDrawerRerender = false;
    let checkoutUiState = {
      status: 'idle',
      error: ''
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

    function restoreCheckoutFromSnapshot(snapshot) {
      if (!snapshot?.cart?.items?.length) return false;

      const nextItems = snapshot.cart.items.map((item) => normalizeCartItem(item));
      const nextEmail = String(snapshot?.cart?.email || '');
      const nextTipPercent = sanitizeTipPercent(snapshot?.cart?.tipPercent, DEFAULT_PLATFORM_TIP_PERCENT);
      const totals = calculateCartTotals(nextItems, nextTipPercent);

      store.setState({
        ...store.getState(),
        customer: {
          ...store.getState().customer,
          email: nextEmail
        },
        cart: {
          ...store.getState().cart,
          ...totals,
          email: nextEmail,
          tipPercent: nextTipPercent,
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
          `${getWorkerBase()}/checkout-intent/summary?orderId=${encodeURIComponent(orderId)}`
        );
        if (!response.ok) return null;

        const payload = await response.json();
        if (!payload || payload.orderId !== orderId) return null;
        return payload;
      } catch (_error) {
        return null;
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
        root.innerHTML = '';
        root.setAttribute('aria-hidden', 'true');
        return;
      }

      const state = store.getState();
      const items = state.cart.items.items || [];
      const total = Number(state.cart.total || 0);
      const isCheckoutPreview = currentRoute === CHECKOUT_VIEW_ROUTE;
      const isFirstPartyCheckoutEnabled = getRequestedCheckoutProvider() === FIRST_PARTY_CHECKOUT_PROVIDER;
      const pricing = buildFirstPartyPricing(state);
      const hasPhysicalItems = cartHasPhysicalItems(items);
      const checkoutLineItems = buildCheckoutLineItems(items);
      const checkoutErrorMarkup = checkoutUiState.error ? `
        <p class="pool-first-party-cart__error" role="alert">${checkoutUiState.error}</p>
      ` : '';
      const itemMarkup = items.length > 0 ? items.map((item) => `
        <li class="pool-first-party-cart__item" data-item-id="${item.uniqueId}">
          <div class="pool-first-party-cart__item-main">
            <strong class="pool-first-party-cart__item-name">${item.name || item.id || 'Untitled item'}</strong>
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
            <strong>Tip ${getPlatformName()} for platform maintenance.</strong>
            <span data-cart-tip-amount>${formatCents(pricing.tipAmountCents)}</span>
          </div>
          <p class="pool-first-party-cart__tip-copy">${getPlatformName()} has a 0% platform fee for organizers. Optional tips help keep the platform sustainable for creators.</p>
          <div class="pool-first-party-cart__tip-controls">
            <input
              class="pool-first-party-cart__tip-slider"
              type="range"
              min="0"
              max="${MAX_PLATFORM_TIP_PERCENT}"
              step="1"
              value="${pricing.tipPercent}"
              aria-label="Platform tip percentage"
              data-cart-tip
            >
            <span class="pool-first-party-cart__tip-percent" data-cart-tip-percent>${pricing.tipPercent}%</span>
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
                <span data-cart-summary-tip-label>${getPlatformName()} tip (${pricing.tipPercent}%)</span>
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
                      <strong class="pool-first-party-cart__line-item-name">${item.name}</strong>
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
                  <span>${getPlatformName()} tip (${pricing.tipPercent}%)</span>
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
          <div class="pool-first-party-cart__callout">
            <p class="pool-first-party-cart__section-label">Next step</p>
            <p class="pool-first-party-cart__note">Continue to Stripe's secure payment platform to enter your payment information and email address -- this finalizes your pledge. You will only be charged if the campaign funds successfully.</p>
          </div>
          ${checkoutErrorMarkup}
        </section>
      ` : `
        <ul class="pool-first-party-cart__items">${itemMarkup}</ul>
        ${cartEstimateMarkup}
      `;
      const footerActions = isCheckoutPreview ? `
          <div class="pool-first-party-cart__actions">
            <button type="button" class="pool-first-party-cart__action pool-first-party-cart__action--secondary" data-cart-back>Back to cart</button>
            <button
              type="button"
            class="pool-first-party-cart__action"
            data-cart-start-checkout
            ${!isFirstPartyCheckoutEnabled || checkoutUiState.status === 'submitting' ? 'disabled' : ''}
          >${checkoutUiState.status === 'submitting' ? 'Starting pledge...' : (isFirstPartyCheckoutEnabled ? 'Continue to pledge' : 'Legacy checkout only')}</button>
        </div>
      ` : `
        <div class="pool-first-party-cart__actions">
          <button type="button" class="pool-first-party-cart__action pool-first-party-cart__action--secondary" data-cart-close>Keep browsing</button>
          <button type="button" class="pool-first-party-cart__action" data-cart-continue ${items.length === 0 ? 'disabled' : ''}>Review pledge</button>
        </div>
      `;

      root.innerHTML = `
        <div class="pool-first-party-cart__backdrop" data-cart-close></div>
        <aside class="pool-first-party-cart__panel" aria-label="Cart drawer">
          <header class="pool-first-party-cart__header">
            <div>
              ${isCheckoutPreview
                ? '<p class="pool-first-party-cart__section-label pool-first-party-cart__section-label--header">Checkout</p>'
                : '<p class="pool-first-party-cart__section-label pool-first-party-cart__section-label--header">Your cart</p>'}
            </div>
            <button type="button" class="pool-first-party-cart__close" data-cart-close aria-label="Close cart">X</button>
          </header>
          <div class="pool-first-party-cart__body">
            ${bodyMarkup}
          </div>
          <footer class="pool-first-party-cart__footer">
            ${footerActions}
          </footer>
        </aside>
      `;
      root.setAttribute('aria-hidden', 'false');
    }

    function syncFirstPartyCartTipUI() {
      const root = getCartRoot();
      if (!root || !isCartOpen || currentRoute === CHECKOUT_VIEW_ROUTE) return;

      const pricing = buildFirstPartyPricing(store.getState());
      const tipAmount = root.querySelector('[data-cart-tip-amount]');
      const tipPercent = root.querySelector('[data-cart-tip-percent]');
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

    function openFirstPartyCart() {
      currentRoute = currentRoute || CART_VIEW_ROUTE;
      isCartOpen = true;
      renderFirstPartyCart();
    }

    function closeFirstPartyCart() {
      if (!isCartOpen) return;
      isCartOpen = false;
      renderFirstPartyCart();
    }

    function setCheckoutUiState(nextState) {
      checkoutUiState = {
        ...checkoutUiState,
        ...(nextState || {})
      };
      renderFirstPartyCart();
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
        const response = await fetch(`${getWorkerBase()}/checkout-intent/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payloadResult.payload)
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || `Worker returned ${response.status}`);
        }

        if (!data?.url) {
          throw new Error('No checkout URL returned');
        }

        writeFirstPartyCheckoutSnapshot(store.getState());
        localStorage.setItem('pool_pending_pledge', 'true');
        checkoutUiState = {
          status: 'redirecting',
          error: ''
        };
        redirectWindow(data.url);
      } catch (error) {
        setCheckoutUiState({
          status: 'idle',
          error: error?.message || 'There was an error starting your pledge.'
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
          closeFirstPartyCart();
          return;
        }

        const continueTrigger = event.target?.closest?.('[data-cart-continue]');
        if (continueTrigger) {
          event.preventDefault();
          eventBus.emit('summary.checkout_clicked');
          apiRoot.api.theme.cart.navigate(CHECKOUT_VIEW_ROUTE);
          return;
        }

        const backTrigger = event.target?.closest?.('[data-cart-back]');
        if (backTrigger) {
          event.preventDefault();
          setCheckoutUiState({
            status: 'idle',
            error: ''
          });
          apiRoot.api.theme.cart.navigate(CART_VIEW_ROUTE);
          return;
        }

        const startCheckoutTrigger = event.target?.closest?.('[data-cart-start-checkout]');
        if (startCheckoutTrigger) {
          event.preventDefault();
          startFirstPartyCheckout();
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
          renderFirstPartyCart();
          return;
        }

        const emailField = event.target?.closest?.('[data-cart-email]');
        if (!emailField) return;

        apiRoot.api.cart.update({
          email: emailField.value
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
              openFirstPartyCart();
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
              if (currentRoute !== CHECKOUT_VIEW_ROUTE) {
                checkoutUiState = {
                  status: 'idle',
                  error: ''
                };
              }
              const payload = {
                from: previousRoute,
                to: currentRoute
              };
              renderFirstPartyCart();
              eventBus.emit('theme.routechanged', payload);
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
      renderSuccessSummaryCard();
      clearFirstPartyCheckoutSnapshot();
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
