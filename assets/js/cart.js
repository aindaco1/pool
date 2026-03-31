(function() {
'use strict';

const WORKER_BASE = window.POOL_CONFIG?.workerBase || 'https://pledge.dustwave.xyz';
const DEFAULT_PLATFORM_TIP_PERCENT = 5;
const MAX_PLATFORM_TIP_PERCENT = 15;
const FLAT_SHIPPING_FEE = 300; // $3 flat rate, must match worker
const ABQ_TAX_RATE = 0.07875; // must match worker
const tipSelections = new Map();
let currentSnipcartRoute = null;

function debugCartUI(...args) {
  console.log('[Pool cart]', ...args);
}

function isTierItem(itemId) {
  if (!itemId) return false;
  if (itemId.includes('__support__')) return false;
  if (itemId.includes('__custom-support')) return false;
  return itemId.includes('__');
}

function getTiersInCart() {
  const state = Snipcart.store.getState();
  const items = state.cart.items.items || [];
  return items.filter(item => isTierItem(item.id));
}

function isSingleTierOnly() {
  const container = document.querySelector('[data-single-tier-only]');
  return container?.dataset.singleTierOnly === 'true';
}

function cartHasPhysicalItems() {
  const state = Snipcart.store.getState();
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

function sanitizeTipPercent(value, fallback) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_PLATFORM_TIP_PERCENT) {
    return parsed;
  }
  return fallback;
}

function getCartCampaignSlug(state) {
  const items = state?.cart?.items?.items || [];
  const firstItem = items[0];
  return firstItem?.url?.split('/campaigns/')[1]?.split('/')[0] || 'default';
}

function calculateTax(subtotalCents) {
  return Math.round((Math.max(0, subtotalCents || 0)) * ABQ_TAX_RATE);
}

function getStoredTipPercent(state) {
  const campaignSlug = getCartCampaignSlug(state || Snipcart.store.getState());
  if (!tipSelections.has(campaignSlug)) {
    tipSelections.set(campaignSlug, DEFAULT_PLATFORM_TIP_PERCENT);
  }
  return tipSelections.get(campaignSlug);
}

function setStoredTipPercent(percent, state) {
  const resolvedState = state || Snipcart.store.getState();
  const campaignSlug = getCartCampaignSlug(resolvedState);
  tipSelections.set(campaignSlug, sanitizeTipPercent(percent, DEFAULT_PLATFORM_TIP_PERCENT));
}

function getCartSubtotalCents(state) {
  const subtotal = state?.cart?.subtotal || state?.cart?.total || 0;
  return Math.round(subtotal * 100);
}

function cartHasItems(state) {
  return (state?.cart?.items?.count || 0) > 0;
}

function calculatePlatformTip(subtotalCents, tipPercent) {
  return Math.round((Math.max(0, subtotalCents) * sanitizeTipPercent(tipPercent, 0)) / 100);
}

function getCartTipAmountCents(state) {
  return calculatePlatformTip(getCartSubtotalCents(state), getStoredTipPercent(state));
}

function formatCents(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function buildCartPricing(state) {
  const subtotalCents = getCartSubtotalCents(state);
  const tipPercent = getStoredTipPercent(state);
  const tipAmountCents = calculatePlatformTip(subtotalCents, tipPercent);
  const taxCents = calculateTax(subtotalCents);
  const shippingCents = cartHasPhysicalItems() ? FLAT_SHIPPING_FEE : 0;

  return {
    subtotalCents,
    tipPercent,
    tipAmountCents,
    taxCents,
    shippingCents,
    totalCents: subtotalCents + tipAmountCents + taxCents + shippingCents
  };
}

function getCartInsertionTarget(cartOpen) {
  const header = cartOpen.querySelector(
    '.snipcart-cart-header, .snipcart-cart__header, [class*="cart-header"], [class*="secondary-header"]'
  );

  if (header && header.parentNode) {
    return {
      parent: header.parentNode,
      beforeNode: header.nextSibling || null
    };
  }

  return {
    parent: cartOpen,
    beforeNode: cartOpen.firstChild || null
  };
}

function getCartFooterInsertionTarget(cartOpen) {
  const footer = cartOpen.querySelector(
    '.snipcart-cart__footer, .snipcart-cart-footer, [class*="cart__footer"], [class*="cart-footer"]'
  );

  if (footer && footer.parentNode) {
    return {
      parent: footer.parentNode,
      beforeNode: footer
    };
  }

  return getCartInsertionTarget(cartOpen);
}

let _injectingFees = false;
let _feeDebounce = null;

function scheduleFeeInjection() {
  if (_feeDebounce) clearTimeout(_feeDebounce);
  _feeDebounce = setTimeout(injectSummaryFees, 100);
}

function injectSummaryFees() {
  if (_injectingFees) return;
  _injectingFees = true;
  
  try {
    const snipcartRoot = document.querySelector('#snipcart');
    if (!snipcartRoot) return;
    
    const state = Snipcart.store.getState();
    const pricing = buildCartPricing(state);
    
    // Update cart icon price with the same breakdown the Worker will use.
    const headerPrice = document.querySelector('.snipcart-total-price');
    if (headerPrice) {
      headerPrice.textContent = formatCents(pricing.totalCents);
    }
  } finally {
    _injectingFees = false;
  }
}

function syncFeeSummaryBoxes() {
  document.querySelectorAll('.pool-fee-summary').forEach(updateFeeSummaryBox);
}

function hideLegacyFeeSummaries() {
  const snipcartRoot = document.querySelector('#snipcart');
  if (!snipcartRoot) return;

  const cartOpen = findVisibleCartSidebar(snipcartRoot);
  const paymentSection = findVisible(snipcartRoot, '.snipcart-payment, [class*="snipcart-payment"]');
  const state = Snipcart.store.getState();
  debugCartUI('hideLegacyFeeSummaries', {
    route: currentSnipcartRoute,
    hasVisibleCart: !!cartOpen,
    hasVisiblePayment: !!paymentSection,
    hasItems: cartHasItems(state)
  });
  if (!cartOpen || paymentSection || !cartHasItems(state)) return;

  cartOpen.querySelectorAll(
    '.snipcart-summary-fees, .snipcart-cart-summary-fees, [class*="summary-fees"]'
  ).forEach(section => {
    if (section.closest('.pool-fee-summary')) return;
    if (section.dataset.poolCheckoutSummary === 'true') return;
    section.dataset.poolLegacyFeesHidden = 'true';
    section.style.display = 'none';
  });
}

function syncTipControls() {
  const state = Snipcart.store.getState();
  const subtotalCents = getCartSubtotalCents(state);
  const tipPercent = getStoredTipPercent(state);
  const tipAmountCents = calculatePlatformTip(subtotalCents, tipPercent);

  document.querySelectorAll('.pool-tip-box').forEach(box => {
    const range = box.querySelector('.pool-tip-box__slider');
    const percent = box.querySelector('.pool-tip-box__percent');
    const amount = box.querySelector('.pool-tip-box__amount');
    if (range) range.value = String(tipPercent);
    if (percent) percent.textContent = tipPercent + '%';
    if (amount) amount.textContent = formatCents(tipAmountCents);
  });
}

function bindTipControl(box) {
  const slider = box.querySelector('.pool-tip-box__slider');
  if (!slider || slider.dataset.poolBound) return;
  slider.dataset.poolBound = 'true';
  slider.addEventListener('input', (event) => {
    setStoredTipPercent(event.target.value);
    syncTipControls();
    syncFeeSummaryBoxes();
    scheduleFeeInjection();
  });
}

function createTipBox(contextClass) {
  const state = Snipcart.store.getState();
  const tipPercent = getStoredTipPercent(state);
  const tipAmountCents = getCartTipAmountCents(state);
  const box = document.createElement('div');
  box.className = `pool-tip-box ${contextClass}`;
  box.innerHTML = `
    <div class="pool-tip-box__header">
      <strong>Tip Dust Wave for platform maintenance</strong>
      <span class="pool-tip-box__amount">${formatCents(tipAmountCents)}</span>
    </div>
    <p class="pool-tip-box__copy">Adjust your optional tip from 0% to 15%. This helps cover platform upkeep without changing your checkout flow.</p>
    <div class="pool-tip-box__controls">
      <input class="pool-tip-box__slider" type="range" min="0" max="${MAX_PLATFORM_TIP_PERCENT}" step="1" value="${tipPercent}" aria-label="Platform tip percentage">
      <span class="pool-tip-box__percent">${tipPercent}%</span>
    </div>
  `;
  bindTipControl(box);
  return box;
}

function createFeeSummaryBox(contextClass) {
  const box = document.createElement('div');
  box.className = `pool-fee-summary ${contextClass}`;
  return box;
}

function getFeeSummaryMarkup(pricing) {
  return `
    <div class="pool-fee-summary__row">
      <span>Subtotal</span>
      <span>${formatCents(pricing.subtotalCents)}</span>
    </div>
    ${pricing.tipAmountCents > 0 ? `<div class="pool-fee-summary__row"><span>Dust Wave tip (${pricing.tipPercent}%)</span><span>${formatCents(pricing.tipAmountCents)}</span></div>` : ''}
    <div class="pool-fee-summary__row"><span>ABQ tax (7.875%)</span><span>${formatCents(pricing.taxCents)}</span></div>
    ${pricing.shippingCents > 0 ? `<div class="pool-fee-summary__row"><span>Shipping</span><span>${formatCents(pricing.shippingCents)}</span></div>` : ''}
    <div class="pool-fee-summary__row pool-fee-summary__row--total">
      <span>Cart total</span>
      <span>${formatCents(pricing.totalCents)}</span>
    </div>
  `;
}

function updateFeeSummaryBox(box) {
  const state = Snipcart.store.getState();
  const pricing = buildCartPricing(state);
  box.innerHTML = getFeeSummaryMarkup(pricing);
}

function removeCartTipUI(snipcartRoot) {
  if (!snipcartRoot) return;
  snipcartRoot.querySelectorAll('.pledge-notice-cart, .pool-tip-box--cart, .pool-fee-summary--cart').forEach(node => {
    node.remove();
  });
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
    '.snipcart-cart-summary-side, .snipcart-modal__container.snipcart-cart-summary--edit'
  );
}

function routeLooksLikeCheckout(route) {
  return typeof route === 'string' && route.startsWith('/checkout');
}

function isCheckoutViewActive(snipcartRoot) {
  if (routeLooksLikeCheckout(currentSnipcartRoute)) return true;
  if (currentSnipcartRoute && !routeLooksLikeCheckout(currentSnipcartRoute)) return false;
  return !!findVisible(
    snipcartRoot,
    '[class*="snipcart-checkout"], [class*="snipcart-payment"], .snipcart-billing-completed'
  );
}

function restoreCheckoutSummaryUI(snipcartRoot) {
  if (!snipcartRoot) return;
  snipcartRoot.querySelectorAll('.snipcart-summary-fees[data-pool-checkout-summary="true"]').forEach(section => {
    const original = section.dataset.poolOriginalHtml;
    if (original) {
      section.innerHTML = original;
    }
    delete section.dataset.poolCheckoutSummary;
    delete section.dataset.poolOriginalHtml;
  });
}

function ensureCartTipUI() {
  const snipcartRoot = document.querySelector('#snipcart');
  if (!snipcartRoot) return;

  const cartOpen = findVisibleCartSidebar(snipcartRoot);
  const isCheckout = isCheckoutViewActive(snipcartRoot);
  const state = Snipcart.store.getState();
  debugCartUI('ensureCartTipUI', {
    route: currentSnipcartRoute,
    hasVisibleCart: !!cartOpen,
    isCheckout,
    hasItems: cartHasItems(state),
    cartClasses: cartOpen?.className || null
  });
  if (!cartOpen || isCheckout || !cartHasItems(state)) {
    removeCartTipUI(snipcartRoot);
    return;
  }

  const { parent: headerTarget, beforeNode: headerBeforeNode } = getCartInsertionTarget(cartOpen);
  const { parent: footerTarget, beforeNode: footerBeforeNode } = getCartFooterInsertionTarget(cartOpen);

  if (!snipcartRoot.querySelector('.pledge-notice-cart') && headerTarget) {
    const notice = document.createElement('div');
    notice.className = 'pledge-notice-cart';
    notice.style.cssText = 'margin: 16px; padding: 12px 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; font-size: 13px; line-height: 1.5; color: #166534;';
    notice.innerHTML = '<strong style="color: #15803d;">🤔 How pledging works:</strong> <br>Your card will be stored securely but not charged now. You\'ll only be charged if the campaign reaches its goal.';
    headerTarget.insertBefore(notice, headerBeforeNode);
  }

  if (!snipcartRoot.querySelector('.pool-tip-box--cart') && footerTarget) {
    const tipBox = createTipBox('pool-tip-box--cart');
    tipBox.dataset.poolInjected = 'true';
    footerTarget.insertBefore(tipBox, footerBeforeNode);
  }

  let feeSummary = snipcartRoot.querySelector('.pool-fee-summary--cart');
  if (!feeSummary && footerTarget) {
    feeSummary = createFeeSummaryBox('pool-fee-summary--cart');
    feeSummary.dataset.poolInjected = 'true';
    const tipBox = snipcartRoot.querySelector('.pool-tip-box--cart');
    footerTarget.insertBefore(feeSummary, tipBox ? tipBox.nextSibling : footerBeforeNode);
  }
  if (feeSummary) updateFeeSummaryBox(feeSummary);
}

function ensureCheckoutTipUI() {
  const snipcartRoot = document.querySelector('#snipcart');
  if (!snipcartRoot) return;

  const state = Snipcart.store.getState();
  debugCartUI('ensureCheckoutTipUI:precheck', {
    route: currentSnipcartRoute,
    isCheckout: isCheckoutViewActive(snipcartRoot),
    hasItems: cartHasItems(state)
  });
  if (!isCheckoutViewActive(snipcartRoot) || !cartHasItems(state)) {
    restoreCheckoutSummaryUI(snipcartRoot);
    return;
  }

  const paymentSection = findVisible(snipcartRoot, '.snipcart-payment, [class*="snipcart-payment"]');
  debugCartUI('ensureCheckoutTipUI:payment', {
    hasVisiblePayment: !!paymentSection,
    paymentClasses: paymentSection?.className || null
  });
  if (!paymentSection) return;

  const pricing = buildCartPricing(state);
  const visibleSummary = Array.from(snipcartRoot.querySelectorAll('.snipcart-cart-summary, [class*="cart-summary"]'))
    .find(isVisibleElement);
  const feeSection = visibleSummary?.querySelector('.snipcart-summary-fees');
  debugCartUI('ensureCheckoutTipUI:summary', {
    hasVisibleSummary: !!visibleSummary,
    summaryClasses: visibleSummary?.className || null,
    hasFeeSection: !!feeSection,
    pricing
  });
  if (!feeSection) return;

  if (!feeSection.dataset.poolOriginalHtml) {
    feeSection.dataset.poolOriginalHtml = feeSection.innerHTML;
  }
  feeSection.dataset.poolCheckoutSummary = 'true';
  feeSection.innerHTML = `
    <div class="snipcart-summary-fees__item snipcart__font--slim">
      <span class="snipcart-summary-fees__title">Subtotal</span>
      <span class="snipcart-summary-fees__amount">${formatCents(pricing.subtotalCents)}</span>
    </div>
    ${pricing.tipAmountCents > 0 ? `
      <div class="snipcart-summary-fees__item snipcart__font--slim">
        <span class="snipcart-summary-fees__title">Dust Wave tip (${pricing.tipPercent}%)</span>
        <span class="snipcart-summary-fees__amount">${formatCents(pricing.tipAmountCents)}</span>
      </div>
    ` : ''}
    ${pricing.shippingCents > 0 ? `
      <div class="snipcart-summary-fees__item snipcart__font--slim">
        <span class="snipcart-summary-fees__title">Shipping</span>
        <span class="snipcart-summary-fees__amount">${formatCents(pricing.shippingCents)}</span>
      </div>
    ` : ''}
    <div class="snipcart-summary-fees__item snipcart__font--slim">
      <span class="snipcart-summary-fees__title">Taxes</span>
      <span class="snipcart-summary-fees__amount">${formatCents(pricing.taxCents)}</span>
    </div>
    <div class="snipcart-summary-fees__item snipcart-summary-fees__total snipcart__font--bold snipcart__font--secondary">
      <span class="snipcart-summary-fees__title snipcart-summary-fees__title--highlight snipcart__font--large">Cart total</span>
      <span class="snipcart-summary-fees__amount snipcart-summary-fees__amount--highlight snipcart__font--large">${formatCents(pricing.totalCents)}</span>
    </div>
  `;
}

function renderTipUI() {
  debugCartUI('renderTipUI:start', {
    route: currentSnipcartRoute,
    itemCount: Snipcart.store.getState()?.cart?.items?.count || 0
  });
  ensureCartTipUI();
  ensureCheckoutTipUI();
  syncTipControls();
  syncFeeSummaryBoxes();
  hideLegacyFeeSummaries();
  scheduleFeeInjection();
}

function processPendingCartItem() {
  var pendingItem = localStorage.getItem('pendingCartItem');
  if (pendingItem) {
    localStorage.removeItem('pendingCartItem');
    var item = JSON.parse(pendingItem);
    Snipcart.api.cart.items.add(item).then(function() {
      Snipcart.api.theme.cart.open();
    });
  }
}

/**
 * Redirect to our Stripe SetupIntent flow instead of Snipcart's payment
 */
async function startPledgeFlow() {
  const state = Snipcart.store.getState();
  const cart = state.cart;
  const items = cart.items.items || [];
  
  if (items.length === 0) {
    console.error('No items in cart');
    return false;
  }

  const firstItem = items[0];
  const campaignSlug = firstItem.url?.split('/campaigns/')[1]?.split('/')[0];
  
  if (!campaignSlug) {
    console.error('Could not extract campaign slug from:', firstItem.url);
    return false;
  }

  // Get tier info from all tier items in cart
  const tierItems = items.filter(item => isTierItem(item.id));
  const tierItem = tierItems[0];
  const tierId = tierItem?.id?.split('__')[1] || null;
  const tierName = tierItem?.name?.split(' — ')[1] || tierItem?.name || null;
  const tierQty = tierItem?.quantity || 1;
  
  // Additional tiers (multi-tier mode)
  const additionalTiers = tierItems.slice(1).map(item => ({
    id: item.id?.split('__')[1] || item.id,
    qty: item.quantity || 1
  }));
  
  // Extract support items from cart (IDs like "{slug}__support__{itemId}")
  const supportItems = items
    .filter(item => item.id?.includes('__support__'))
    .map(item => ({
      id: item.id.split('__support__')[1],
      amount: Math.round(item.price * (item.quantity || 1))
    }));
  
  // Extract custom amount from cart (ID like "{slug}__custom-support")
  const customItem = items.find(item => item.id?.includes('__custom-support'));
  const customAmount = customItem ? Math.round(customItem.price * (customItem.quantity || 1)) : 0;

  // Calculate subtotal from cart (pre-tax for stats, Worker will add tax)
  const subtotalCents = Math.round((cart.subtotal || cart.total) * 100);
  const selectedTipPercent = getStoredTipPercent(state);
  
  // Generate a temporary order ID (will be replaced by Snipcart's if we create an order later)
  const tempOrderId = `pledge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Get customer info from Snipcart state
  // Note: billing address is dummy data (for Snipcart internal use only)
  // Real billing/email is collected by Stripe Checkout
  const billing = state.cart?.billingAddress || {};
  let email = state.customer?.email || 
              state.cart?.email || 
              billing.email ||
              '';
  // Don't send placeholder email to Stripe - let user enter real email there
  if (email === 'placeholder@pool.local') {
    email = '';
  }
  const customerName = billing.fullName || billing.name || '';
  const phone = billing.phone || '';
  


  try {
    const payload = {
      orderId: tempOrderId,
      campaignSlug,
      amountCents: subtotalCents,
      email,
      tierId,
      tierName,
      tierQty,
      additionalTiers: additionalTiers.length > 0 ? additionalTiers : undefined,
      supportItems: supportItems.length > 0 ? supportItems : undefined,
      customAmount: customAmount > 0 ? customAmount : undefined,
      customerName,
      phone,
      hasPhysical: cartHasPhysicalItems(),
      tipPercent: selectedTipPercent
    };
    console.log('Starting pledge flow...', payload);
    
    const response = await fetch(`${WORKER_BASE}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Worker returned ${response.status}`);
    }

    const data = await response.json();
    if (data.url) {
      console.log('Redirecting to Stripe checkout...');
      // Store flag to clear cart on return
      localStorage.setItem('pool_pending_pledge', 'true');
      window.location.href = data.url;
      return true;
    } else {
      throw new Error('No checkout URL returned');
    }
  } catch (error) {
    console.error('Pledge flow error:', error);
    alert('There was an error starting your pledge: ' + error.message);
    return false;
  }
}

async function autofillBilling() {
  try {
    // Wait for cart to be ready
    const state = Snipcart.store.getState();
    if (!state.cart || !state.cart.token) {
      console.log('Pool: Cart not ready, skipping billing auto-fill');
      return;
    }
    
    await Snipcart.api.cart.update({
      email: 'placeholder@pool.local',
      billingAddress: {
        name: 'Supporter',
        address1: '123 Pool Lane',
        city: 'Denver',
        country: 'US',
        province: 'CO',
        postalCode: '80202'
      }
    });
    console.log('Pool: Auto-filled billing (hidden step)');
  } catch (err) {
    console.log('Pool: Could not auto-fill billing:', err?.message || err);
  }
}

// Hide billing step, hide step number circles, and clear shipping pre-fill
function setupBillingHider() {
  const observer = new MutationObserver(() => {
    const snipcartRoot = document.querySelector('#snipcart');
    if (!snipcartRoot) return;
    
    // Find and hide billing step (look for step with "Billing" text or billing-related classes)
    const allSteps = snipcartRoot.querySelectorAll('[class*="checkout-step"], [class*="snipcart-form"]');
    allSteps.forEach(step => {
      // Check if this is the billing step by looking for billing-related content
      const text = step.textContent || '';
      const classes = step.className || '';
      if ((text.includes('Billing') || classes.includes('billing')) && 
          !classes.includes('billing-completed') && 
          !step.dataset.poolHidden) {
        step.style.display = 'none';
        step.dataset.poolHidden = 'true';
        console.log('Pool: Hidden billing step');
      }
    });
    
    // Hide all step number circles/badges
    const stepNumbers = snipcartRoot.querySelectorAll('[class*="checkout-step"] [class*="__number"], .snipcart__box--badge');
    stepNumbers.forEach(numEl => {
      if (!numEl.dataset.poolHidden) {
        numEl.style.display = 'none';
        numEl.dataset.poolHidden = 'true';
        console.log('Pool: Hidden step number', numEl.textContent.trim());
      }
    });

  });
  
  observer.observe(document.body, { childList: true, subtree: true });
}

function initSnipcart() {
  console.log('Snipcart ready - Pool pledge mode');
  
  // Hide billing step, step numbers, and clear shipping pre-fill
  setupBillingHider();
  
  // Auto-fill dummy billing on cart events
  // This ensures Snipcart has valid billing before payment step
  Snipcart.events.on('cart.created', autofillBilling);
  Snipcart.events.on('item.added', autofillBilling);
  
  // Also try to fill if cart already exists
  setTimeout(autofillBilling, 500);

  const snipcartRoot = document.getElementById('snipcart');
  if (snipcartRoot) {
    let checkoutSummaryDebounce = null;
    const checkoutSummaryObserver = new MutationObserver(() => {
      if (checkoutSummaryDebounce) clearTimeout(checkoutSummaryDebounce);
      checkoutSummaryDebounce = setTimeout(renderTipUI, 50);
    });
    checkoutSummaryObserver.observe(snipcartRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
  }
  
  async function handleSnipcartRouteChange(routesChange, source) {
    currentSnipcartRoute = routesChange?.to || null;
    debugCartUI(source, routesChange);

    if (routesChange?.to === '/checkout/billing' || routesChange?.to === '/checkout') {
      console.log('Pool: Detected billing/checkout page, auto-filling and skipping...');
      
      try {
        const state = Snipcart.store.getState();
        if (state.cart && state.cart.token) {
          await Snipcart.api.cart.update({
            email: 'placeholder@pool.local',
            billingAddress: {
              name: 'Supporter',
              address1: '123 Pool Lane',
              city: 'Denver',
              country: 'US',
              province: 'CO',
              postalCode: '80202'
            }
          });
          console.log('Pool: Billing filled before navigation');
        }
      } catch (e) {
        console.log('Pool: Billing fill error:', e?.message || e);
      }
      
      setTimeout(() => {
        console.log('Pool: Navigating to /checkout/payment');
        Snipcart.api.theme.cart.navigate('/checkout/payment');
      }, 200);
    }

    setTimeout(renderTipUI, 0);
  }

  // Auto-navigate past billing step straight to payment
  // (Snipcart shipping is bypassed — Stripe Checkout collects shipping address)
  Snipcart.events.on('theme.routechanged', (routesChange) => {
    handleSnipcartRouteChange(routesChange, 'theme.routechanged');
  });
  
  // Clear cart if returning from successful pledge
  const pendingPledge = localStorage.getItem('pool_pending_pledge');
  console.log('Pool: Checking pending pledge flag:', pendingPledge);
  if (pendingPledge === 'true') {
    localStorage.removeItem('pool_pending_pledge');
    
    // Subscribe to cart ready event to clear items
    const unsubscribe = Snipcart.store.subscribe(() => {
      const state = Snipcart.store.getState();
      const items = state.cart.items.items || [];
      if (items.length > 0) {
        console.log('Pool: Clearing', items.length, 'items from cart');
        unsubscribe(); // Stop listening
        items.forEach(item => {
          Snipcart.api.cart.items.remove(item.uniqueId).catch(err => {
            console.error('Pool: Failed to remove item:', err);
          });
        });
      }
    });
    
    // Also try after delay as fallback
    setTimeout(() => {
      const state = Snipcart.store.getState();
      const items = state.cart.items.items || [];
      if (items.length > 0) {
        console.log('Pool: Clearing', items.length, 'items (delayed)');
        items.forEach(item => {
          Snipcart.api.cart.items.remove(item.uniqueId).catch(() => {});
        });
      }
    }, 2000);
  }
  
function refreshTipPresentation() {
    setTimeout(renderTipUI, 0);
    setTimeout(renderTipUI, 120);
    setTimeout(renderTipUI, 300);
    setTimeout(renderTipUI, 600);
  }

  // Refresh fee summary when cart items change
  Snipcart.events.on('item.added', refreshTipPresentation);
  Snipcart.events.on('item.updated', refreshTipPresentation);
  Snipcart.events.on('item.removed', refreshTipPresentation);
  
  // Update header price immediately on load and on every state change
  function updateHeaderPrice() {
    const state = Snipcart.store.getState();
    const count = state.cart.items.count || 0;
    const pricing = buildCartPricing(state);
    
    const headerPrice = document.querySelector('.snipcart-total-price');
    if (headerPrice) {
      headerPrice.textContent = formatCents(pricing.totalCents);
    }
    
    // Cache adjusted total so cart-icon.html can show it before Snipcart loads
    try {
      localStorage.setItem('pool_cart_cache', JSON.stringify({ total: pricing.totalCents / 100, count }));
    } catch (e) {}
  }
  updateHeaderPrice();
  let storeRenderDebounce = null;
  Snipcart.store.subscribe(() => {
    updateHeaderPrice();
    if (storeRenderDebounce) clearTimeout(storeRenderDebounce);
    storeRenderDebounce = setTimeout(renderTipUI, 50);
  });
  setTimeout(renderTipUI, 250);
  Snipcart.events.on('summary.checkout_clicked', () => {
    currentSnipcartRoute = '/cart';
    debugCartUI('summary.checkout_clicked');
    refreshTipPresentation();
  });
  
  processPendingCartItem();

  document.querySelectorAll('[data-redirect-url].snipcart-add-item').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var redirectUrl = this.getAttribute('data-redirect-url');
      var isStackable = this.getAttribute('data-item-stackable') === 'true';
      var maxQty = this.getAttribute('data-item-max-quantity');
      var item = {
        id: this.getAttribute('data-item-id'),
        name: this.getAttribute('data-item-name'),
        price: parseFloat(this.getAttribute('data-item-price')),
        url: this.getAttribute('data-item-url'),
        description: this.getAttribute('data-item-description'),
        stackable: isStackable,
        shippable: false
      };
      if (maxQty) {
        item.maxQuantity = parseInt(maxQty);
      } else if (!isStackable) {
        item.maxQuantity = 1;
      }
      localStorage.setItem('pendingCartItem', JSON.stringify(item));
      window.location.href = redirectUrl;
    });
  });

  // Single tier enforcement
  Snipcart.events.on('item.added', async (addedItem) => {
    if (!isSingleTierOnly()) return;
    
    if (isTierItem(addedItem.id)) {
      const tiersInCart = getTiersInCart();
      const otherTiers = tiersInCart.filter(t => t.uniqueId !== addedItem.uniqueId);
      
      if (otherTiers.length > 0) {
        console.log('Removing other tiers:', otherTiers.map(t => t.id));
        for (const tier of otherTiers) {
          try {
            await Snipcart.api.cart.items.remove(tier.uniqueId);
          } catch (err) {
            console.error('Failed to remove tier:', tier.id, err);
          }
        }
      }
    }
  });

  // Disable quantity + buttons when at inventory limit
  async function updateQuantityButtonStates() {
    const snipcartRoot = document.querySelector('#snipcart');
    if (!snipcartRoot) return;
    
    const state = Snipcart.store.getState();
    const items = state.cart.items.items || [];
    
    for (const item of items) {
      if (!isTierItem(item.id)) continue;
      
      const parts = item.id.split('__');
      if (parts.length < 2) continue;
      
      const campaignSlug = parts[0];
      const tierId = parts[1];
      
      if (typeof window.getTierInventory === 'function') {
        const tierInv = await window.getTierInventory(campaignSlug, tierId);
        if (tierInv) {
          // Find item rows and match by item name
          const itemRows = snipcartRoot.querySelectorAll('[class*="ItemLine"], [class*="item-line"]');
          for (const row of itemRows) {
            const nameEl = row.querySelector('[class*="title"], [class*="name"]');
            if (nameEl && nameEl.textContent.includes(item.name.split(' — ')[0])) {
              // Find the quantity wrapper, then get the + button (last button in qty wrapper)
              const qtyWrapper = row.querySelector('[class*="quantity"], [class*="Quantity"]');
              if (qtyWrapper) {
                const buttons = qtyWrapper.querySelectorAll('button');
                const plusBtn = buttons[buttons.length - 1]; // + is typically last
                if (plusBtn && item.quantity >= tierInv.remaining) {
                  plusBtn.disabled = true;
                  plusBtn.style.opacity = '0.3';
                  plusBtn.style.cursor = 'not-allowed';
                  plusBtn.title = `Only ${tierInv.remaining} available`;
                } else if (plusBtn && item.quantity < tierInv.remaining) {
                  // Re-enable if under limit
                  plusBtn.disabled = false;
                  plusBtn.style.opacity = '';
                  plusBtn.style.cursor = '';
                  plusBtn.title = '';
                }
              }
            }
          }
        }
      }
    }
  }
  
  // Watch for Snipcart UI changes and update button states
  const qtyObserver = new MutationObserver(() => {
    updateQuantityButtonStates();
  });
  qtyObserver.observe(document.body, { childList: true, subtree: true });
  
  // Also update on item changes
  Snipcart.events.on('item.updated', updateQuantityButtonStates);
  Snipcart.events.on('item.added', updateQuantityButtonStates);

  // Watch for our custom pledge button in the overridden payment template
  const pledgeButtonObserver = new MutationObserver(() => {
    const pledgeBtn = document.getElementById('pool-pledge-button');
    if (pledgeBtn && !pledgeBtn.dataset.poolBound) {
      pledgeBtn.dataset.poolBound = 'true';
      console.log('Pool: Binding pledge button handler');
      
      pledgeBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        
        // Check if terms checkbox is checked
        const termsCheckbox = document.querySelector('input[name="agree-terms"]');
        if (termsCheckbox && !termsCheckbox.checked) {
          alert('Please agree to the Terms & Creative Guidelines to continue.');
          return;
        }
        
        pledgeBtn.disabled = true;
        pledgeBtn.textContent = 'Redirecting to secure checkout...';
        
        await startPledgeFlow();
      });
    }
  });
  
  pledgeButtonObserver.observe(document.body, { childList: true, subtree: true });
  console.log('Pool: Template override mode - watching for pledge button');
}

// Initialize Snipcart - handle both cases: already ready or waiting for event
if (typeof Snipcart !== 'undefined' && Snipcart.ready) {
  initSnipcart();
} else {
  document.addEventListener('snipcart.ready', initSnipcart);
}

})(); // End IIFE
