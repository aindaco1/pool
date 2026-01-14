(function() {
'use strict';

const WORKER_BASE = window.POOL_CONFIG?.workerBase || 'https://pledge.dustwave.xyz';

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
      phone
      // billingAddress removed - Stripe Checkout collects real billing info
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

// Hide billing step and change payment step number to "1"
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
    
    // Find payment step and change its number to 1
    const stepNumbers = snipcartRoot.querySelectorAll('[class*="checkout-step"] [class*="__number"], .snipcart__box--badge');
    stepNumbers.forEach(numEl => {
      if (numEl.textContent.trim() === '2' && !numEl.dataset.poolRenumbered) {
        // Check if this is in a payment context
        const parent = numEl.closest('[class*="checkout-step"]') || numEl.closest('[class*="snipcart__box"]');
        const parentText = parent?.textContent || '';
        if (parentText.includes('Payment') || parentText.includes('Pledge')) {
          numEl.textContent = '1';
          numEl.dataset.poolRenumbered = 'true';
          console.log('Pool: Renumbered payment step to 1');
        }
      }
    });
    
    // Debug: check if disabled-checkout-step is showing
    const disabledStep = snipcartRoot.querySelector('[class*="disabled-checkout-step"]');
    if (disabledStep && !disabledStep.dataset.poolLogged) {
      disabledStep.dataset.poolLogged = 'true';
      console.log('Pool: Found disabled checkout step:', disabledStep.textContent?.substring(0, 100));
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
}

function initSnipcart() {
  console.log('Snipcart ready - Pool pledge mode');
  
  // Hide billing step and renumber payment to 1
  setupBillingHider();
  
  // Auto-fill dummy billing on cart events
  // This ensures Snipcart has valid billing before payment step
  Snipcart.events.on('cart.created', autofillBilling);
  Snipcart.events.on('item.added', autofillBilling);
  
  // Also try to fill if cart already exists
  setTimeout(autofillBilling, 500);
  
  // Auto-navigate past billing step - always skip to payment
  Snipcart.events.on('page.changed', async (routesChange) => {
    // Skip billing step entirely
    if (routesChange.to === '/checkout/billing' || routesChange.to === '/checkout') {
      console.log('Pool: Detected billing/checkout page, auto-filling and skipping to payment...');
      
      // Fill billing and wait for it to be accepted
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
      
      // Wait a bit for Snipcart to process, then navigate
      setTimeout(() => {
        console.log('Pool: Navigating to payment...');
        Snipcart.api.theme.cart.navigate('/checkout/payment');
      }, 200);
    }
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
  
  // Inject pledge notice into side cart using MutationObserver
  const observer = new MutationObserver((mutations) => {
    const snipcartRoot = document.querySelector('#snipcart');
    if (!snipcartRoot) return;
    
    // Look for the cart being open (but not checkout)
    const cartOpen = snipcartRoot.querySelector('[class*="snipcart-cart"]');
    const isCheckout = snipcartRoot.querySelector('[class*="snipcart-checkout"], [class*="snipcart-payment"], .snipcart-billing-completed');
    if (!cartOpen || isCheckout) return;
    
    // Find a place to inject - try various selectors
    const targets = [
      '.snipcart-item-list',
      '[class*="item-list"]',
      '[class*="cart-content"]',
      '[class*="snipcart-cart"] > div'
    ];
    
    for (const selector of targets) {
      const target = snipcartRoot.querySelector(selector);
      if (target && !snipcartRoot.querySelector('.pledge-notice-cart')) {
        const notice = document.createElement('div');
        notice.className = 'pledge-notice-cart';
        notice.style.cssText = 'margin: 16px; padding: 12px 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; font-size: 13px; line-height: 1.5; color: #166534;';
        notice.innerHTML = '<strong style="color: #15803d;">🤔 How pledging works:</strong> <br>Your card will be stored securely but not charged now. You\'ll only be charged if the campaign reaches its goal.';
        target.parentNode.insertBefore(notice, target.nextSibling);
        break;
      }
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
  
  // Inject pledge notice into checkout/payment step
  const checkoutObserver = new MutationObserver(() => {
    const snipcartRoot = document.querySelector('#snipcart');
    if (!snipcartRoot) return;
    
    // Look for payment step
    const paymentSection = snipcartRoot.querySelector('.snipcart-payment, [class*="snipcart-payment"]');
    if (!paymentSection) return;
    
    // Don't inject if already there
    if (snipcartRoot.querySelector('.pledge-notice-checkout')) return;
    
    // Find the payment form or header to inject before
    const paymentForm = paymentSection.querySelector('.snipcart-payment-form, [class*="payment-form"], form');
    const header = paymentSection.querySelector('.snipcart__box--header, header');
    const insertTarget = paymentForm || header?.nextElementSibling || paymentSection.firstChild;
    
    if (insertTarget) {
      const notice = document.createElement('div');
      notice.className = 'pledge-notice-checkout';
      notice.style.cssText = 'margin: 16px; padding: 12px 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; font-size: 13px; line-height: 1.5; color: #166534;';
      notice.innerHTML = '<strong style="color: #15803d; display: inline;">🤔 How pledging works:</strong><br style="display: block;">' +
        '<span style="display: inline;">Your card will be stored securely but </span><b style="display: inline;">not charged now</b><span style="display: inline;">.</span><br style="display: block;">' +
        '<span style="display: inline;">You\'ll only be charged if the campaign reaches its goal.</span>';
      insertTarget.parentNode.insertBefore(notice, insertTarget);
    }
  });
  
  checkoutObserver.observe(document.body, { childList: true, subtree: true });
  
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
        shippable: this.getAttribute('data-item-shippable') === 'true'
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
