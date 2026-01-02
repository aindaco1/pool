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

  // Calculate subtotal from cart (pre-tax for stats, Worker will add tax)
  const subtotalCents = Math.round((cart.subtotal || cart.total) * 100);
  
  // Generate a temporary order ID (will be replaced by Snipcart's if we create an order later)
  const tempOrderId = `pledge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Get customer info from Snipcart state
  const billing = state.cart?.billingAddress || {};
  const email = state.customer?.email || 
                state.cart?.email || 
                billing.email ||
                '';
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
      customerName,
      phone,
      billingAddress: billing.address1 ? {
        line1: billing.address1,
        line2: billing.address2 || '',
        city: billing.city,
        state: billing.province,
        postal_code: billing.postalCode,
        country: billing.country
      } : null
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

function initSnipcart() {
  console.log('Snipcart ready - Pool pledge mode');
  
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
        stackable: isStackable
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
