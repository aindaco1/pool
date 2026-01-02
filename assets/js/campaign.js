(function() {
'use strict';

const WORKER_BASE = window.POOL_CONFIG?.workerBase || 'https://pledge.dustwave.xyz';

// Tab switching for production phases
document.addEventListener('DOMContentLoaded', () => {
  const phaseTabs = document.querySelectorAll('.phase-tab');
  
  if (phaseTabs.length > 0) {
    phaseTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetId = tab.getAttribute('data-tab');
        
        // Update tab states
        phaseTabs.forEach(t => t.setAttribute('aria-selected', 'false'));
        tab.setAttribute('aria-selected', 'true');
        
        // Show/hide panels
        const panels = document.querySelectorAll('.phase-panel');
        panels.forEach(panel => {
          if (panel.id === `tab-${targetId}`) {
            panel.classList.remove('hidden');
          } else {
            panel.classList.add('hidden');
          }
        });
      });
    });
  }
  
  handleTierChangeFlow();
  handleAddTiersFlow();

  // Toast notifications for actions
  function toast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #141821;
      border: 1px solid #252c3a;
      padding: 12px 16px;
      border-radius: 8px;
      color: #e6e9ef;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 9999;
      font-size: 14px;
    `;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  // Action handlers
  document.querySelectorAll('[data-action="submit-vote"]').forEach(el => {
    el.addEventListener('click', () => toast('Vote submitted. Thanks!'));
  });

  document.querySelectorAll('[data-action="submit-poll"]').forEach(el => {
    el.addEventListener('click', () => toast('Poll recorded. Results after close.'));
  });

  document.querySelectorAll('[data-action="support-ongoing"]').forEach(el => {
    el.addEventListener('click', () => toast('Added to support cart.'));
  });

  document.querySelectorAll('[data-action="fund-registry-item"]').forEach(el => {
    el.addEventListener('click', () => toast('Registry item added to cart.'));
  });
});

async function handleTierChangeFlow() {
  const params = new URLSearchParams(window.location.search);
  const changeTierId = params.get('changeTier');
  const token = params.get('token');
  
  if (!changeTierId || !token) return;
  
  history.replaceState({}, '', window.location.pathname);
  
  const tierButton = document.querySelector(`[data-item-id$="__${changeTierId}"].snipcart-add-item`);
  if (!tierButton) {
    console.error('Tier button not found for:', changeTierId);
    showTierChangeToast('Tier not found. Please select manually.', 'error');
    return;
  }
  
  showTierChangeToast('Cancelling previous pledge...', 'info');
  
  try {
    const cancelRes = await fetch(`${WORKER_BASE}/pledge/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    
    if (!cancelRes.ok) {
      const err = await cancelRes.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to cancel previous pledge');
    }
    
    showTierChangeToast('Adding new tier to cart...', 'info');
    
    await waitForSnipcart();
    
    tierButton.click();
    
    setTimeout(() => {
      showTierChangeToast('New tier added! Complete checkout to confirm.', 'success');
    }, 1000);
    
  } catch (err) {
    console.error('Tier change error:', err);
    showTierChangeToast(err.message, 'error');
  }
}

function waitForSnipcart() {
  return new Promise((resolve) => {
    if (window.Snipcart) {
      resolve(window.Snipcart);
    } else {
      document.addEventListener('snipcart.ready', () => resolve(window.Snipcart));
    }
  });
}

async function handleAddTiersFlow() {
  const params = new URLSearchParams(window.location.search);
  const addTiers = params.get('addTiers');
  const addSupport = params.get('addSupport');
  
  if (!addTiers && !addSupport) return;
  
  history.replaceState({}, '', window.location.pathname);
  
  // Parse tier IDs with quantities (format: "tier-id:qty,tier-id:qty")
  const tierItems = addTiers ? addTiers.split(',').filter(Boolean).map(item => {
    const [id, qty] = item.split(':');
    return { id, qty: parseInt(qty) || 1 };
  }) : [];
  
  // Parse support items with amounts (format: "support-id:amount,support-id:amount")
  const supportItems = addSupport ? addSupport.split(',').filter(Boolean).map(item => {
    const [id, amount] = item.split(':');
    return { id, amount: parseFloat(amount) || 0 };
  }).filter(s => s.amount > 0) : [];
  
  if (tierItems.length === 0 && supportItems.length === 0) return;
  
  showTierChangeToast('Adding items to cart...', 'info');
  
  try {
    await waitForSnipcart();
    
    // Add tier items
    for (const tierItem of tierItems) {
      const tierButton = document.querySelector(`[data-item-id$="__${tierItem.id}"].snipcart-add-item`);
      if (tierButton && !tierButton.disabled) {
        // For stackable items with qty > 1, click multiple times
        for (let i = 0; i < tierItem.qty; i++) {
          tierButton.click();
          await new Promise(r => setTimeout(r, 300));
        }
      }
    }
    
    // Add support items (custom amounts)
    for (const supportItem of supportItems) {
      // Support items use a custom price button with data-item-price attribute
      const supportButton = document.querySelector(`[data-item-id$="__${supportItem.id}"].snipcart-add-item`);
      if (supportButton) {
        // Create a clone with the custom price
        const customButton = supportButton.cloneNode(true);
        customButton.setAttribute('data-item-price', supportItem.amount.toFixed(2));
        customButton.style.display = 'none';
        document.body.appendChild(customButton);
        customButton.click();
        await new Promise(r => setTimeout(r, 300));
        customButton.remove();
      }
    }
    
    const totalItems = tierItems.reduce((sum, t) => sum + t.qty, 0) + supportItems.length;
    
    setTimeout(() => {
      showTierChangeToast(`Added ${totalItems} item${totalItems > 1 ? 's' : ''} to cart!`, 'success');
      Snipcart.api.theme.cart.open();
    }, 1000);
    
  } catch (err) {
    console.error('Add items error:', err);
    showTierChangeToast(err.message, 'error');
  }
}

function showTierChangeToast(message, type = 'info') {
  const existing = document.querySelector('.tier-change-toast');
  if (existing) existing.remove();
  
  const colors = {
    info: { bg: '#2563eb', border: '#3b82f6' },
    success: { bg: '#059669', border: '#10b981' },
    error: { bg: '#dc2626', border: '#ef4444' }
  };
  
  const toast = document.createElement('div');
  toast.className = 'tier-change-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: ${colors[type].bg};
    border: 1px solid ${colors[type].border};
    padding: 12px 24px;
    border-radius: 8px;
    color: white;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 9999;
    font-size: 14px;
    font-weight: 500;
  `;
  document.body.appendChild(toast);
  
  if (type !== 'info') {
    setTimeout(() => toast.remove(), 5000);
  }
}

})(); // End IIFE
