(function() {
'use strict';

const WORKER_BASE = window.POOL_CONFIG?.workerBase || 'https://pledge.dustwave.xyz';
const PLATFORM_NAME = window.POOL_CONFIG?.platformName || 'The Pool';
const CART_VIEW_ROUTE = '/cart';
const CHECKOUT_ENTRY_ROUTES = new Set(['/checkout', '/checkout/billing']);
const CHECKOUT_PAYMENT_ROUTE = '/checkout/payment';
const CART_EVENT_NAMES = {
  cartCreated: 'cart.created',
  itemAdded: 'item.added',
  itemUpdated: 'item.updated',
  itemRemoved: 'item.removed',
  routeChanged: 'theme.routechanged',
  summaryCheckoutClicked: 'summary.checkout_clicked'
};
const PLACEHOLDER_CART_EMAIL = 'placeholder@pool.local';
const PLACEHOLDER_BILLING_ADDRESS = {
  name: 'Supporter',
  address1: '123 Pool Lane',
  city: 'Denver',
  country: 'US',
  province: 'CO',
  postalCode: '80202'
};
const EMPTY_CART_STATE = {
  cart: {
    items: {
      count: 0,
      items: []
    }
  }
};
let currentCartRoute = null;
let hasInitializedCart = false;

function getCartProvider() {
  return window.PoolCartProvider || null;
}

function getCartRoot() {
  return document.querySelector('[data-pool-cart-root]');
}

function getCartClient() {
  return getCartProvider()?.getApi?.() || null;
}

function getRequestedCartRuntime() {
  return String(window.POOL_CONFIG?.cartRuntime || '').trim().toLowerCase();
}

function getActiveCartRuntime() {
  const providerRuntime = String(getCartProvider()?.activeRuntime || '').trim().toLowerCase();
  if (providerRuntime) return providerRuntime;
  return getRequestedCartRuntime();
}

function isFirstPartyCartRuntime() {
  return getActiveCartRuntime() === 'first_party';
}

function getCurrentPath() {
  return window.location?.pathname || '/';
}

function isPledgeSuccessPath() {
  return /^\/pledge-success\/?$/.test(getCurrentPath());
}

function getCartState() {
  return getCartProvider()?.store?.getState?.() ||
    getCartClient()?.store?.getState?.() ||
    EMPTY_CART_STATE;
}

function getCartItems(state) {
  return state?.cart?.items?.items || [];
}

function subscribeCartStore(handler) {
  if (typeof handler !== 'function') return function() {};
  return getCartProvider()?.store?.subscribe?.(handler) ||
    getCartClient()?.store?.subscribe?.(handler) ||
    function() {};
}

function onCartEvent(eventName, handler) {
  if (typeof handler !== 'function') return;
  const provider = getCartProvider();
  if (provider?.events?.on) {
    return provider.events.on(eventName, handler);
  }

  return getCartClient()?.events?.on?.(eventName, handler);
}

function addCartItem(item) {
  return getCartClient()?.api?.cart?.items?.add?.(item);
}

function removeCartItem(uniqueId) {
  return getCartClient()?.api?.cart?.items?.remove?.(uniqueId);
}

function updateCart(payload) {
  return getCartClient()?.api?.cart?.update?.(payload);
}

function openCart() {
  return getCartClient()?.api?.theme?.cart?.open?.();
}

function navigateCart(route) {
  return getCartClient()?.api?.theme?.cart?.navigate?.(route);
}

function bootCart(handler) {
  const provider = getCartProvider();
  if (!provider?.onReady) return;
  provider.onReady(handler);
}

function debugCartUI(...args) {
  console.log('[Pool cart]', ...args);
}

function isTierItem(itemId) {
  if (!itemId) return false;
  if (itemId.includes('__support__')) return false;
  if (itemId.includes('__custom-support')) return false;
  return itemId.includes('__');
}

function getItemCampaignSlug(itemOrId) {
  const itemId = typeof itemOrId === 'string' ? itemOrId : itemOrId?.id;
  if (typeof itemId === 'string' && itemId.includes('__')) {
    return itemId.split('__')[0] || '';
  }

  const itemUrl = typeof itemOrId === 'object' ? String(itemOrId?.url || '') : '';
  return itemUrl.split('/campaigns/')[1]?.split('/')[0] || '';
}

function getTiersInCart() {
  const state = getCartState();
  const items = getCartItems(state);
  return items.filter(item => isTierItem(item.id));
}

function isSingleTierOnly() {
  const container = document.querySelector('[data-single-tier-only]');
  return container?.dataset.singleTierOnly === 'true';
}

function cartHasPhysicalItems() {
  const state = getCartState();
  const items = state.cart.items.items || [];
  return items.some(item => {
    const fields = item.customFields || [];
    const cat = fields.find(f => f.name === '_category');
    if (cat && cat.value === 'physical') return true;

    // Checkout summary state can be slimmer than cart-edit state; keep a fallback.
    const text = `${item.name || ''} ${item.id || ''} ${item.description || ''}`.toLowerCase();
    return text.includes('physical');
  });
}

function getCartSubtotalCents(state) {
  const subtotal = state?.cart?.subtotal || state?.cart?.total || 0;
  return Math.round(subtotal * 100);
}

function cartHasItems(state) {
  return (state?.cart?.items?.count || 0) > 0;
}

function getCheckoutTokens(state) {
  return {
    publicToken: state?.cart?.paymentSession?.publicToken || null,
    cartToken: state?.cart?.token || null
  };
}

function canAutofillBilling(state) {
  return Boolean(state?.cart?.token);
}

function getCheckoutCustomerDetails(state) {
  const billing = state?.cart?.billingAddress || {};
  let email = state?.customer?.email ||
    state?.cart?.email ||
    billing.email ||
    '';

  if (email === PLACEHOLDER_CART_EMAIL) {
    email = '';
  }

  return {
    email,
    customerName: billing.fullName || billing.name || '',
    phone: billing.phone || ''
  };
}

function isCheckoutEntryRoute(route) {
  return typeof route === 'string' && CHECKOUT_ENTRY_ROUTES.has(route);
}

function getCartRouteChangeTarget(routeChange) {
  return typeof routeChange?.to === 'string' ? routeChange.to : null;
}

function setCurrentCartRoute(route) {
  currentCartRoute = typeof route === 'string' ? route : null;
}

function resetCartRouteToSummary() {
  setCurrentCartRoute(CART_VIEW_ROUTE);
}

function handleCartRouteEvent(routeChange, source, onCheckoutEntry) {
  const nextRoute = getCartRouteChangeTarget(routeChange);
  setCurrentCartRoute(nextRoute);
  debugCartUI(source, routeChange);

  if (isCheckoutEntryRoute(nextRoute) && typeof onCheckoutEntry === 'function') {
    return onCheckoutEntry(nextRoute);
  }

  return Promise.resolve();
}

function formatCents(cents) {
  return '$' + (cents / 100).toFixed(2);
}


function isVisibleElement(element) {
  return !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
}

function findVisible(root, selector) {
  if (!root) return null;
  return Array.from(root.querySelectorAll(selector)).find(isVisibleElement) || null;
}

function findVisibleCartSidebar(root) {
  return findVisible(
    root,
    '.pool-first-party-cart__panel, [class*="cart-summary-side"], [class*="cart-summary--edit"]'
  );
}

function routeLooksLikeCheckout(route) {
  return typeof route === 'string' && route.startsWith('/checkout');
}

function isCheckoutViewActive(cartRoot) {
  if (routeLooksLikeCheckout(currentCartRoute)) return true;
  if (currentCartRoute && !routeLooksLikeCheckout(currentCartRoute)) return false;
  return !!findVisible(
    cartRoot,
    '[data-pool-cart-step="checkout"], .pool-first-party-cart__checkout-preview, [class*="checkout"], [class*="payment"]'
  );
}

function processPendingCartItem() {
  var pendingItem = localStorage.getItem('pendingCartItem');
  if (pendingItem) {
    localStorage.removeItem('pendingCartItem');
    var item = JSON.parse(pendingItem);
    addCartItem(item).then(function() {
      openCart();
    });
  }
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
  return getButtonCustomFieldDefinitions(button).some(field => field.type !== 'hidden');
}

function buildCartItemFromButton(button) {
  const isStackable = button.getAttribute('data-item-stackable') === 'true' ||
    button.getAttribute('data-item-stackable') === 'always';
  const maxQty = button.getAttribute('data-item-max-quantity');
  const item = {
    id: button.getAttribute('data-item-id'),
    name: button.getAttribute('data-item-name'),
    price: parseFloat(button.getAttribute('data-item-price')),
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

async function replaceSingleTierCartItem(button) {
  const state = getCartState();
  const nextItemId = button.getAttribute('data-item-id');
  const nextCampaignSlug = getItemCampaignSlug(nextItemId);
  const tierItems = (state.cart.items.items || []).filter(item => isTierItem(item.id));
  const removals = tierItems
    .filter(item => getItemCampaignSlug(item) === nextCampaignSlug)
    .filter(item => item.id !== nextItemId)
    .map(item => removeCartItem(item.uniqueId));

  if (removals.length > 0) {
    await Promise.allSettled(removals);
  }

  const alreadySelected = (getCartState().cart.items.items || []).some(item => item.id === nextItemId);
  if (!alreadySelected) {
    await addCartItem(buildCartItemFromButton(button));
  }

  openCart();
}

function initCartRuntime() {
  if (hasInitializedCart) return;
  hasInitializedCart = true;
  console.log('Cart runtime ready - Pool pledge mode');
  
  // Clear cart if returning from successful pledge
  const pendingPledge = localStorage.getItem('pool_pending_pledge');
  console.log('Pool: Checking pending pledge flag:', pendingPledge);
  if (pendingPledge === 'true' && isPledgeSuccessPath()) {
    localStorage.removeItem('pool_pending_pledge');
    
    // Subscribe to cart ready event to clear items
    const unsubscribe = subscribeCartStore(() => {
      const state = getCartState();
      const items = state.cart.items.items || [];
      if (items.length > 0) {
        console.log('Pool: Clearing', items.length, 'items from cart');
        unsubscribe(); // Stop listening
        items.forEach(item => {
          removeCartItem(item.uniqueId).catch(err => {
            console.error('Pool: Failed to remove item:', err);
          });
        });
      }
    });
    
    // Also try after delay as fallback
    setTimeout(() => {
      const state = getCartState();
      const items = state.cart.items.items || [];
      if (items.length > 0) {
        console.log('Pool: Clearing', items.length, 'items (delayed)');
        items.forEach(item => {
          removeCartItem(item.uniqueId).catch(() => {});
        });
      }
    }, 2000);
  }
 
  function getCartTotalCents(state) {
    const numericTotal = Number(state?.cart?.total);
    if (Number.isFinite(numericTotal) && numericTotal >= 0) {
      return Math.round(numericTotal * 100);
    }
    return getCartSubtotalCents(state);
  }

  // Update header price immediately on load and on every state change
  function updateHeaderPrice() {
    const state = getCartState();
    const count = state.cart.items.count || 0;
    const totalCents = getCartTotalCents(state);
    
    const headerPrice = document.querySelector('.poolcart-total-price');
    if (headerPrice) {
      headerPrice.textContent = formatCents(totalCents);
    }
    
    // Cache total so cart-icon.html can show it before the cart runtime loads.
    try {
      localStorage.setItem('pool_cart_cache', JSON.stringify({ total: totalCents / 100, count }));
    } catch (e) {}
  }
  updateHeaderPrice();
  subscribeCartStore(() => {
    updateHeaderPrice();
  });
  onCartEvent(CART_EVENT_NAMES.summaryCheckoutClicked, () => {
    resetCartRouteToSummary();
    debugCartUI(CART_EVENT_NAMES.summaryCheckoutClicked);
  });
  
  processPendingCartItem();

  document.querySelectorAll('.poolcart-add-item:not([data-redirect-url])').forEach(function(btn) {
    btn.addEventListener('click', async function(e) {
      if (!isSingleTierOnly()) return;
      if (btn.disabled) return;

      const itemId = btn.getAttribute('data-item-id');
      if (!isTierItem(itemId)) return;
      if (hasInteractiveCustomFields(btn)) return;

      e.preventDefault();
      e.stopPropagation();

      try {
        await replaceSingleTierCartItem(btn);
      } catch (err) {
        console.error('Pool: Failed to replace single-tier cart item:', err);
      }
    });
  });

  document.querySelectorAll('[data-redirect-url].poolcart-add-item').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var redirectUrl = this.getAttribute('data-redirect-url');
      var item = buildCartItemFromButton(this);
      localStorage.setItem('pendingCartItem', JSON.stringify(item));
      window.location.href = redirectUrl;
    });
  });

  // Single tier enforcement
  onCartEvent(CART_EVENT_NAMES.itemAdded, async (addedItem) => {
    if (!isSingleTierOnly()) return;
    
    if (isTierItem(addedItem.id)) {
      const addedCampaignSlug = getItemCampaignSlug(addedItem);
      const tiersInCart = getTiersInCart();
      const otherTiers = tiersInCart.filter((tier) => {
        if (tier.uniqueId === addedItem.uniqueId) return false;
        return getItemCampaignSlug(tier) === addedCampaignSlug;
      });
      
      if (otherTiers.length > 0) {
        console.log('Removing other tiers:', otherTiers.map(t => t.id));
        for (const tier of otherTiers) {
          try {
            await removeCartItem(tier.uniqueId);
          } catch (err) {
            console.error('Failed to remove tier:', tier.id, err);
          }
        }
      }
    }
  });
}

// Initialize the cart runtime through the provider seam when available.
bootCart(initCartRuntime);

})(); // End IIFE
