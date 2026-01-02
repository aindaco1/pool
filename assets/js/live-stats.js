/**
 * Live Stats - Fetches and displays real-time pledge totals
 * 
 * Works on any page with progress bars that have [data-live-stats] and [data-campaign-slug]
 */

const WORKER_BASE = window.POOL_CONFIG?.workerBase || 'https://pledge.dustwave.xyz';

async function fetchAllLiveStats() {
  const progressBars = document.querySelectorAll('[data-live-stats][data-campaign-slug]');
  if (progressBars.length === 0) return;

  // Get unique campaign slugs
  const slugs = [...new Set([...progressBars].map(el => el.dataset.campaignSlug))];
  
  // Fetch stats for each campaign in parallel
  const results = await Promise.allSettled(
    slugs.map(async slug => {
      const res = await fetch(`${WORKER_BASE}/stats/${slug}`);
      if (!res.ok) throw new Error(`Failed to fetch stats for ${slug}`);
      return res.json();
    })
  );

  // Create a map of slug -> stats
  const statsMap = {};
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      statsMap[slugs[i]] = result.value;
    }
  });

  // Update each progress bar
  progressBars.forEach(wrap => {
    const slug = wrap.dataset.campaignSlug;
    if (statsMap[slug]) {
      updateProgressBar(wrap, statsMap[slug]);
    }
  });
}

function updateProgressBar(wrap, stats) {
  const goal = parseInt(wrap.dataset.goal) || 0;
  const maxThreshold = parseInt(wrap.dataset.maxThreshold) || goal;
  const pledged = stats.pledgedAmount || 0;
  const pledgedDollars = pledged / 100;
  
  checkTierUnlocks(wrap.dataset.campaignSlug, pledgedDollars);
  checkLateSupport(wrap.dataset.campaignSlug, pledgedDollars, goal);

  // Update the progress bar fill
  const bar = wrap.querySelector('.progress-bar span');
  if (bar && maxThreshold > 0) {
    const pct = Math.min(100, Math.round((pledgedDollars / maxThreshold) * 100));
    bar.style.width = `${pct}%`;
  }

  // Update the pledged amount text
  const pledgedEl = wrap.querySelector('[data-live-pledged]');
  if (pledgedEl) {
    pledgedEl.textContent = formatMoney(pledgedDollars);
  }

  // Update milestone markers
  const oneThird = goal / 3;
  const twoThirds = (goal * 2) / 3;

  updateMarkerState(wrap, '.progress-marker--milestone:nth-of-type(1)', pledgedDollars >= oneThird);
  updateMarkerState(wrap, '.progress-marker--milestone:nth-of-type(2)', pledgedDollars >= twoThirds);
  updateMarkerState(wrap, '.progress-marker--goal', pledgedDollars >= goal);

  // Update stretch goal markers
  wrap.querySelectorAll('.progress-marker--stretch').forEach(marker => {
    const threshold = parseInt(marker.dataset.threshold) || 0;
    if (pledgedDollars >= threshold) {
      marker.classList.add('progress-marker--achieved');
    }
  });

  // Update support items if present
  if (stats.supportItems) {
    updateSupportItems(stats.supportItems);
  }
}

function updateSupportItems(supportItems) {
  document.querySelectorAll('.support-item[id^="support-"]').forEach(item => {
    const itemId = item.id.replace('support-', '');
    const currentCents = supportItems[itemId] || 0;
    const currentDollars = currentCents / 100;
    
    // Update the amount display
    const amountEl = item.querySelector('.support-item__amount');
    if (amountEl) {
      const targetMatch = amountEl.textContent.match(/\/\s*\$?([\d,]+)/);
      if (targetMatch) {
        const target = parseFloat(targetMatch[1].replace(/,/g, ''));
        amountEl.textContent = `$${currentDollars.toLocaleString()} / $${target.toLocaleString()}`;
        
        // Update progress bar
        const progressBar = item.querySelector('.support-item__progress span');
        if (progressBar && target > 0) {
          const pct = Math.min(100, Math.round((currentDollars / target) * 100));
          progressBar.style.width = `${pct}%`;
        }
        
        // Update remaining in input max and placeholder
        const input = item.querySelector('.support-item__input');
        if (input) {
          const remaining = Math.max(0, target - currentDollars);
          input.max = remaining;
          input.placeholder = remaining > 0 ? remaining : '0';
          
          // Disable if fully funded
          if (remaining <= 0) {
            input.disabled = true;
            const btn = item.querySelector('.support-item__btn');
            if (btn) {
              btn.disabled = true;
              btn.textContent = 'Funded';
            }
          }
        }
      }
    }
  });
}

function updateMarkerState(container, selector, achieved) {
  const marker = container.querySelector(selector);
  if (marker) {
    if (achieved) {
      marker.classList.add('progress-marker--achieved');
    } else {
      marker.classList.remove('progress-marker--achieved');
    }
  }
}

function formatMoney(dollars) {
  if (dollars >= 1000) {
    return `$${(dollars / 1000).toFixed(dollars % 1000 === 0 ? 0 : 1)}k`;
  }
  return `$${dollars.toLocaleString()}`;
}

/**
 * Live Inventory - Fetches and displays real-time tier remaining counts
 */
async function fetchLiveInventory() {
  const tierCards = document.querySelectorAll('[data-tier-id][data-campaign-slug]');
  if (tierCards.length === 0) return;

  // Get unique campaign slugs
  const slugs = [...new Set([...tierCards].map(el => el.dataset.campaignSlug))];
  
  // Fetch inventory for each campaign in parallel
  const results = await Promise.allSettled(
    slugs.map(async slug => {
      const res = await fetch(`${WORKER_BASE}/inventory/${slug}`);
      if (!res.ok) return null;
      return res.json();
    })
  );

  // Create a map of slug -> inventory
  const inventoryMap = {};
  results.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value) {
      inventoryMap[slugs[i]] = result.value;
    }
  });

  // Update each tier card
  tierCards.forEach(card => {
    const slug = card.dataset.campaignSlug;
    const tierId = card.dataset.tierId;
    const inventory = inventoryMap[slug];
    
    if (inventory?.tiers?.[tierId]) {
      const tierInv = inventory.tiers[tierId];
      updateTierInventory(card, tierInv);
    }
  });
}

function updateTierInventory(card, tierInv) {
  // Update remaining count display
  const remainingEl = card.querySelector('[data-live-remaining]');
  if (remainingEl) {
    remainingEl.textContent = tierInv.remaining.toLocaleString();
  }

  // Update limit display if present
  const limitEl = card.querySelector('[data-live-limit]');
  if (limitEl) {
    limitEl.textContent = tierInv.limit.toLocaleString();
  }

  // Disable button if sold out
  if (tierInv.remaining <= 0) {
    const btn = card.querySelector('.snipcart-add-item');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sold Out';
    }
    card.classList.add('tier-card--sold-out');
  }
}

/**
 * Check if any gated tiers should be unlocked based on pledged amount
 */
const unlockedTiers = new Set();

function checkTierUnlocks(campaignSlug, pledgedDollars) {
  const tierCards = document.querySelectorAll(
    `.tier-card[data-campaign-slug="${campaignSlug}"][data-requires-threshold]`
  );
  
  tierCards.forEach(card => {
    const threshold = parseInt(card.dataset.requiresThreshold) || 0;
    const tierId = card.dataset.tierId;
    const unlockKey = `${campaignSlug}__${tierId}`;
    
    if (pledgedDollars >= threshold && !unlockedTiers.has(unlockKey)) {
      unlockTier(card);
      unlockedTiers.add(unlockKey);
    }
  });
}

function unlockTier(card) {
  card.classList.remove('tier-card--locked');
  card.classList.add('tier-card--unlocked');
  
  const btn = card.querySelector('.snipcart-add-item');
  if (btn) {
    btn.disabled = false;
    btn.removeAttribute('aria-disabled');
    const price = btn.dataset.itemPrice;
    const formattedPrice = formatMoney(parseFloat(price));
    btn.textContent = `Pledge ${formattedPrice}`;
  }
}

/**
 * Enable late support elements when campaign is funded
 */
const enabledLateSupport = new Set();

function checkLateSupport(campaignSlug, pledgedDollars, goal) {
  if (pledgedDollars < goal) return;
  if (enabledLateSupport.has(campaignSlug)) return;
  
  enabledLateSupport.add(campaignSlug);
  
  // Enable tier cards with late support
  document.querySelectorAll(`.tier-card[data-campaign-slug="${campaignSlug}"][data-late-support="true"]`).forEach(card => {
    enableLateSupportElement(card, 'tier');
  });
  
  // Enable support items with late support
  document.querySelectorAll(`.support-item[data-late-support="true"]`).forEach(item => {
    const parent = item.closest('.support-items');
    if (parent && parent.dataset.campaignSlug === campaignSlug) {
      enableLateSupportElement(item, 'support');
    }
  });
  
  // Enable custom amount with late support
  const customAmount = document.querySelector(`.custom-amount[data-campaign-slug="${campaignSlug}"][data-late-support="true"]`);
  if (customAmount) {
    enableLateSupportElement(customAmount, 'custom');
  }
  
  // Enable featured tier buttons on campaign cards
  document.querySelectorAll(`.campaign-card[data-campaign-slug="${campaignSlug}"] button[data-late-support="true"]`).forEach(btn => {
    btn.disabled = false;
    btn.classList.remove('campaign-card__featured-tier--disabled');
  });
}

function enableLateSupportElement(element, type) {
  const btn = element.querySelector('button');
  const input = element.querySelector('input');
  
  if (btn) {
    btn.disabled = false;
    btn.removeAttribute('aria-disabled');
    
    if (type === 'tier') {
      const price = btn.dataset.itemPrice;
      btn.textContent = `Pledge ${formatMoney(parseFloat(price))}`;
    } else if (type === 'support' || type === 'custom') {
      btn.textContent = 'Support';
    }
  }
  
  if (input) {
    input.disabled = false;
    input.removeAttribute('aria-disabled');
  }
}

// Fetch on page load
document.addEventListener('DOMContentLoaded', () => {
  fetchAllLiveStats();
  fetchLiveInventory();
});

// Export for manual refresh and inventory lookup
window.refreshLiveStats = fetchAllLiveStats;
window.refreshLiveInventory = fetchLiveInventory;

// Cache for inventory data (used by cart validation)
window.POOL_INVENTORY_CACHE = {};

/**
 * Get cached inventory for a campaign, or fetch if not cached
 */
window.getTierInventory = async function(campaignSlug, tierId) {
  if (!window.POOL_INVENTORY_CACHE[campaignSlug]) {
    try {
      const res = await fetch(`${WORKER_BASE}/inventory/${campaignSlug}`);
      if (res.ok) {
        window.POOL_INVENTORY_CACHE[campaignSlug] = await res.json();
      }
    } catch (e) {
      console.error('Failed to fetch inventory:', e);
      return null;
    }
  }
  
  const inventory = window.POOL_INVENTORY_CACHE[campaignSlug];
  if (inventory?.tiers?.[tierId]) {
    return inventory.tiers[tierId];
  }
  return null;
};

/**
 * Invalidate inventory cache (call after pledge changes)
 */
window.invalidateInventoryCache = function(campaignSlug) {
  if (campaignSlug) {
    delete window.POOL_INVENTORY_CACHE[campaignSlug];
  } else {
    window.POOL_INVENTORY_CACHE = {};
  }
};
