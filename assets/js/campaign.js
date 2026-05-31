(function() {
'use strict';

const WORKER_BASE = window.POOL_CONFIG?.workerBase || 'https://pledge.dustwave.xyz';
const logger = window.PoolLogger?.createLogger('campaign') || {
  debug() {},
  info() {},
  warn() {},
  error() {}
};

function initializeTabs(tabSelector, panelSelector, panelIdPrefix) {
  const tabs = Array.from(document.querySelectorAll(tabSelector));
  const panels = Array.from(document.querySelectorAll(panelSelector));
  if (!tabs.length || !panels.length) return;

  function activateTab(nextTab, shouldFocus = false) {
    if (!(nextTab instanceof HTMLElement)) return;
    const targetId = nextTab.getAttribute('aria-controls') || `${panelIdPrefix}${nextTab.getAttribute('data-tab') || ''}`;

    tabs.forEach((tab) => {
      const isSelected = tab === nextTab;
      tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      tab.setAttribute('tabindex', isSelected ? '0' : '-1');
    });

    panels.forEach((panel) => {
      const isTarget = panel.id === targetId;
      panel.classList.toggle('hidden', !isTarget);
      panel.hidden = !isTarget;
    });

    if (shouldFocus) {
      nextTab.focus();
    }
  }

  function moveTabFocus(currentTab, direction) {
    const currentIndex = tabs.indexOf(currentTab);
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
    activateTab(tabs[nextIndex], true);
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activateTab(tab, false));
    tab.addEventListener('keydown', (event) => {
      switch (event.key) {
        case 'ArrowRight':
        case 'Right':
          event.preventDefault();
          moveTabFocus(tab, 1);
          break;
        case 'ArrowLeft':
        case 'Left':
          event.preventDefault();
          moveTabFocus(tab, -1);
          break;
        case 'Home':
          event.preventDefault();
          activateTab(tabs[0], true);
          break;
        case 'End':
          event.preventDefault();
          activateTab(tabs[tabs.length - 1], true);
          break;
        default:
          break;
      }
    });
  });
}

function getCartProvider() {
  return window.PoolCartProvider || null;
}

async function waitForCartProvider(reason = 'campaign-cart-flow') {
  let provider = getCartProvider();
  if (!provider?.whenReady && window.PoolCartRuntime?.load) {
    try {
      provider = await window.PoolCartRuntime.load(reason);
    } catch (error) {
      logger.error('Cart runtime load failed:', error);
      return null;
    }
  }

  if (!provider?.whenReady) {
    return null;
  }

  await provider.whenReady();
  return provider;
}

// Tab switching for production phases
document.addEventListener('DOMContentLoaded', () => {
  initializeTabs('.phase-tab', '.phase-panel', 'tab-');

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
  
  const tierButton = document.querySelector(`[data-item-id$="__${changeTierId}"].poolcart-add-item`);
  if (!tierButton) {
    logger.error('Tier button not found for:', changeTierId);
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
    
    await waitForCartProvider('tier-change-flow');
    
    tierButton.click();
    
    setTimeout(() => {
      showTierChangeToast('New tier added! Complete checkout to confirm.', 'success');
    }, 1000);
    
  } catch (err) {
    logger.error('Tier change error:', err);
    showTierChangeToast(err.message, 'error');
  }
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
    const cartProvider = await waitForCartProvider('add-tiers-flow');
    
    // Add tier items
    for (const tierItem of tierItems) {
      const tierButton = document.querySelector(`[data-item-id$="__${tierItem.id}"].poolcart-add-item`);
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
      const supportButton = document.querySelector(`[data-item-id$="__${supportItem.id}"].poolcart-add-item`);
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
      cartProvider?.getApi?.()?.api?.theme?.cart?.open?.();
    }, 1000);
    
  } catch (err) {
    logger.error('Add items error:', err);
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
