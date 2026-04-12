/**
 * Live Stats - Fetches and displays real-time pledge totals
 * 
 * Works on any page with progress bars that have [data-live-stats] and [data-campaign-slug]
 * 
 * Stats are cached in localStorage to reduce API calls.
 * Cache is invalidated when user makes a pledge (via invalidateStatsCache).
 */

const DEFAULT_STATS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_INVENTORY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const WIDTH_PERCENT_CLASS_PREFIX = 'u-width-pct-';
const LEFT_PERCENT_CLASS_PREFIX = 'u-left-pct-';
const statsRequestCache = new Map();
const inventoryRequestCache = new Map();
const liveSnapshotRequestCache = new Map();
const DOM_READY_HANDLER_KEY = '__POOL_LIVE_STATS_DOM_READY_HANDLER';
const PAGESHOW_HANDLER_KEY = '__POOL_LIVE_STATS_PAGESHOW_HANDLER';
const VISIBILITY_HANDLER_KEY = '__POOL_LIVE_STATS_VISIBILITY_HANDLER';
const STORAGE_HANDLER_KEY = '__POOL_LIVE_STATS_STORAGE_HANDLER';
const INVALIDATION_HANDLER_KEY = '__POOL_LIVE_STATS_INVALIDATION_HANDLER';
const LIVE_REFRESH_MARKER_KEY = 'pool_live_refresh_needed';
const LIVE_REFRESH_MARKER_TTL_MS = 10 * 60 * 1000;
const logger = window.PoolLogger?.createLogger('live-stats') || {
  debug() {},
  info() {},
  warn() {},
  error() {}
};

function getRuntimeMessages() {
  return window.POOL_CONFIG?.i18n?.messages || {};
}

function getRuntimeMessage(path, fallback) {
  const parts = String(path || '').split('.');
  let value = getRuntimeMessages();
  for (let index = 0; index < parts.length; index += 1) {
    if (!value || typeof value !== 'object') return fallback;
    value = value[parts[index]];
  }
  return typeof value === 'string' && value ? value : fallback;
}

function formatRuntimeMessage(path, fallback, replacements) {
  const template = getRuntimeMessage(path, fallback);
  if (!replacements || typeof template !== 'string') return template;
  return template.replace(/%\{(.*?)\}/g, (_match, key) => {
    if (Object.prototype.hasOwnProperty.call(replacements, key)) {
      return String(replacements[key]);
    }
    return '';
  });
}

function getWorkerBase() {
  return window.POOL_CONFIG?.platform?.workerUrl || window.POOL_CONFIG?.workerBase || 'https://pledge.dustwave.xyz';
}

function getCacheTtlMs(configKey, fallbackMs) {
  const nestedKey = configKey === 'liveStatsCacheTtlSeconds'
    ? window.POOL_CONFIG?.cache?.liveStatsTtlSeconds
    : window.POOL_CONFIG?.cache?.liveInventoryTtlSeconds;
  const parsedSeconds = Number(nestedKey ?? window.POOL_CONFIG?.[configKey]);
  if (!Number.isFinite(parsedSeconds) || parsedSeconds <= 0) {
    return fallbackMs;
  }
  return parsedSeconds * 1000;
}

function getStatsCacheTtlMs() {
  return getCacheTtlMs('liveStatsCacheTtlSeconds', DEFAULT_STATS_CACHE_TTL_MS);
}

function getInventoryCacheTtlMs() {
  return getCacheTtlMs('liveInventoryCacheTtlSeconds', DEFAULT_INVENTORY_CACHE_TTL_MS);
}

function isPageVisible() {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

function getStatsCache(slug) {
  try {
    const cached = localStorage.getItem(`pool_stats_${slug}`);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > getStatsCacheTtlMs()) {
      localStorage.removeItem(`pool_stats_${slug}`);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setStatsCache(slug, data) {
  try {
    localStorage.setItem(`pool_stats_${slug}`, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch {
    // localStorage may be full or disabled
  }
}

function setInventoryMemoryAndCache(slug, data) {
  if (!data) return;
  if (data.tiers) {
    window.POOL_INVENTORY_CACHE[slug] = data;
  }
  setInventoryCache(slug, data);
}

function clearLiveRequestCaches(slug) {
  if (slug) {
    statsRequestCache.delete(slug);
    inventoryRequestCache.delete(slug);
    liveSnapshotRequestCache.delete(slug);
    if (window.POOL_INVENTORY_CACHE) {
      delete window.POOL_INVENTORY_CACHE[slug];
    }
    return;
  }

  statsRequestCache.clear();
  inventoryRequestCache.clear();
  liveSnapshotRequestCache.clear();
  window.POOL_INVENTORY_CACHE = {};
}

function consumePendingLiveRefreshMarker() {
  try {
    const raw = localStorage.getItem(LIVE_REFRESH_MARKER_KEY);
    if (!raw) return false;
    const marker = JSON.parse(raw);
    const timestamp = Number(marker?.timestamp || 0);
    if (!Number.isFinite(timestamp) || Date.now() - timestamp > LIVE_REFRESH_MARKER_TTL_MS) {
      localStorage.removeItem(LIVE_REFRESH_MARKER_KEY);
      return false;
    }
    localStorage.removeItem(LIVE_REFRESH_MARKER_KEY);
    return true;
  } catch {
    try {
      localStorage.removeItem(LIVE_REFRESH_MARKER_KEY);
    } catch {}
    return false;
  }
}

async function fetchLiveCampaignSnapshot(slug, options = {}) {
  const force = options.force === true;

  if (!force) {
    const cachedStats = getStatsCache(slug);
    const cachedInventory = getInventoryCache(slug);
    if (cachedStats && cachedInventory) {
      window.POOL_INVENTORY_CACHE[slug] = cachedInventory;
      return {
        stats: cachedStats,
        inventory: cachedInventory
      };
    }
  }

  if (liveSnapshotRequestCache.has(slug)) {
    return liveSnapshotRequestCache.get(slug);
  }

  const request = fetch(`${getWorkerBase()}/live/${slug}`)
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to fetch live snapshot for ${slug}`);
      }
      return res.json();
    })
    .then((data) => {
      if (data?.stats) {
        setStatsCache(slug, data.stats);
      }
      if (data?.inventory) {
        setInventoryMemoryAndCache(slug, data.inventory);
      }
      return data;
    })
    .finally(() => {
      liveSnapshotRequestCache.delete(slug);
    });

  liveSnapshotRequestCache.set(slug, request);
  return request;
}

async function fetchStatsForSlug(slug, options = {}) {
  const force = options.force === true;
  if (!force) {
    const cached = getStatsCache(slug);
    if (cached) return cached;
  }

  if (statsRequestCache.has(slug)) {
    return statsRequestCache.get(slug);
  }

  if (!force) {
    const snapshotPromise = fetchLiveCampaignSnapshot(slug, options)
      .then((snapshot) => snapshot?.stats || null)
      .catch(() => null);
    statsRequestCache.set(slug, snapshotPromise);
    const snapshotStats = await snapshotPromise;
    statsRequestCache.delete(slug);
    if (snapshotStats) return snapshotStats;
  }

  const request = fetch(`${getWorkerBase()}/stats/${slug}`)
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to fetch stats for ${slug}`);
      }
      return res.json();
    })
    .then((data) => {
      setStatsCache(slug, data);
      return data;
    })
    .finally(() => {
      statsRequestCache.delete(slug);
    });

  statsRequestCache.set(slug, request);
  return request;
}

function applyPercentClass(node, prefix, percent) {
  if (!node) return;
  const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
  Array.from(node.classList).forEach((className) => {
    if (className.indexOf(prefix) === 0) {
      node.classList.remove(className);
    }
  });
  node.classList.add(prefix + clampedPercent);
}

/**
 * Invalidate stats cache (call after pledge changes)
 */
window.invalidateStatsCache = function(campaignSlug) {
  try {
    if (campaignSlug) {
      localStorage.removeItem(`pool_stats_${campaignSlug}`);
      clearLiveRequestCaches(campaignSlug);
    } else {
      // Clear all stats caches
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('pool_stats_')) {
          localStorage.removeItem(key);
        }
      });
      clearLiveRequestCaches();
    }
  } catch {
    // localStorage may be disabled
  }

  document.dispatchEvent(new CustomEvent('pool:live-cache-invalidated', {
    detail: {
      campaignSlug: campaignSlug || null,
      kind: 'stats'
    }
  }));
};

function applyDeclarativeStyles(root = document) {
  root.querySelectorAll('[data-progress-width]').forEach((node) => {
    const width = node.getAttribute('data-progress-width');
    if (!width) return;
    applyPercentClass(node, WIDTH_PERCENT_CLASS_PREFIX, parseFloat(width));
  });

  root.querySelectorAll('[data-progress-left]').forEach((node) => {
    const left = node.getAttribute('data-progress-left');
    if (!left) return;
    applyPercentClass(node, LEFT_PERCENT_CLASS_PREFIX, parseFloat(left));
  });
}

async function fetchAllLiveStats(options = {}) {
  const progressBars = document.querySelectorAll('[data-live-stats][data-campaign-slug]');
  if (progressBars.length === 0) return;
  const force = options.force === true;

  // Get unique campaign slugs
  const slugs = [...new Set([...progressBars].map(el => el.dataset.campaignSlug))];
  
  // Check cache first, fetch only uncached slugs
  const statsMap = {};
  const uncachedSlugs = [];
  
  for (const slug of slugs) {
    const cached = force ? null : getStatsCache(slug);
    if (cached) {
      statsMap[slug] = cached;
    } else {
      uncachedSlugs.push(slug);
    }
  }
  
  // Fetch uncached stats in parallel
  if (uncachedSlugs.length > 0) {
    const results = await Promise.allSettled(
      uncachedSlugs.map((slug) => fetchStatsForSlug(slug, { force }))
    );

    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value) {
        const slug = uncachedSlugs[i];
        statsMap[slug] = result.value;
      }
    });
  }

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
  
  // Update countdown message if goal is now met (build-time data may be stale)
  if (pledgedDollars >= goal && goal > 0) {
    var countdown = document.getElementById('campaign-countdown');
    if (countdown) {
      countdown.setAttribute('data-goal-met', 'true');
      var msg = countdown.querySelector('.campaign-countdown__message');
      if (msg && msg.classList.contains('campaign-countdown__message--not-funded')) {
        msg.textContent = '';
        var heading = document.createElement('h2');
        heading.textContent = getRuntimeMessage('liveStats.projectFunded', 'Project Funded');
        msg.appendChild(heading);
        msg.classList.remove('campaign-countdown__message--not-funded');
        msg.classList.add('campaign-countdown__message--funded');
      }
    }
  }

  // Update the progress bar fill
  const bar = wrap.querySelector('.progress-bar span');
  if (bar && maxThreshold > 0) {
    const pct = Math.min(100, Math.round((pledgedDollars / maxThreshold) * 100));
    applyPercentClass(bar, WIDTH_PERCENT_CLASS_PREFIX, pct);
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
          applyPercentClass(progressBar, WIDTH_PERCENT_CLASS_PREFIX, pct);
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
              btn.textContent = getRuntimeMessage('liveStats.funded', 'Funded');
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
 * Cached in localStorage.
 */
function getInventoryCache(slug) {
  try {
    const cached = localStorage.getItem(`pool_inventory_${slug}`);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > getInventoryCacheTtlMs()) {
      localStorage.removeItem(`pool_inventory_${slug}`);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setInventoryCache(slug, data) {
  try {
    localStorage.setItem(`pool_inventory_${slug}`, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch {
    // localStorage may be full or disabled
  }
}

async function fetchInventoryForSlug(slug, options = {}) {
  const force = options.force === true;

  if (!force) {
    const cached = getInventoryCache(slug);
    if (cached) {
      window.POOL_INVENTORY_CACHE[slug] = cached;
      return cached;
    }
  }

  if (inventoryRequestCache.has(slug)) {
    return inventoryRequestCache.get(slug);
  }

  if (!force) {
    const snapshotPromise = fetchLiveCampaignSnapshot(slug, options)
      .then((snapshot) => snapshot?.inventory || null)
      .catch(() => null);
    inventoryRequestCache.set(slug, snapshotPromise);
    const snapshotInventory = await snapshotPromise;
    inventoryRequestCache.delete(slug);
    if (snapshotInventory) return snapshotInventory;
  }

  const request = fetch(`${getWorkerBase()}/inventory/${slug}`)
    .then((res) => {
      if (!res.ok) return null;
      return res.json();
    })
    .then((data) => {
      if (data) {
        setInventoryMemoryAndCache(slug, data);
      }
      return data;
    })
    .finally(() => {
      inventoryRequestCache.delete(slug);
    });

  inventoryRequestCache.set(slug, request);
  return request;
}

/**
 * Invalidate inventory cache (call after pledge changes)
 */
window.invalidateInventoryCache = function(campaignSlug) {
  try {
    if (campaignSlug) {
      localStorage.removeItem(`pool_inventory_${campaignSlug}`);
      clearLiveRequestCaches(campaignSlug);
    } else {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('pool_inventory_')) {
          localStorage.removeItem(key);
        }
      });
      clearLiveRequestCaches();
    }
  } catch {}

  document.dispatchEvent(new CustomEvent('pool:live-cache-invalidated', {
    detail: {
      campaignSlug: campaignSlug || null,
      kind: 'inventory'
    }
  }));
};

async function fetchLiveInventory(options = {}) {
  const tierCards = document.querySelectorAll('[data-tier-id][data-campaign-slug]');
  if (tierCards.length === 0) return;
  const force = options.force === true;

  // Get unique campaign slugs
  const slugs = [...new Set([...tierCards].map(el => el.dataset.campaignSlug))];
  
  // Check cache first
  const inventoryMap = {};
  const uncachedSlugs = [];
  
  for (const slug of slugs) {
    const cached = force ? null : getInventoryCache(slug);
    if (cached) {
      inventoryMap[slug] = cached;
    } else {
      uncachedSlugs.push(slug);
    }
  }
  
  // Fetch uncached inventory in parallel
  if (uncachedSlugs.length > 0) {
    const results = await Promise.allSettled(
      uncachedSlugs.map((slug) => fetchInventoryForSlug(slug, { force }))
    );

    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value) {
        const slug = uncachedSlugs[i];
        inventoryMap[slug] = result.value;
        window.POOL_INVENTORY_CACHE[slug] = result.value;
      }
    });
  }

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
    const btn = card.querySelector('.poolcart-add-item');
    if (btn) {
      btn.disabled = true;
      btn.textContent = getRuntimeMessage('liveStats.soldOut', 'Sold Out');
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
  
  const btn = card.querySelector('.poolcart-add-item');
  if (btn) {
    btn.disabled = false;
    btn.removeAttribute('aria-disabled');
    const price = btn.dataset.itemPrice;
    const formattedPrice = formatMoney(parseFloat(price));
    btn.textContent = formatRuntimeMessage('liveStats.pledgeAmount', 'Pledge %{amount}', { amount: formattedPrice });
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
      btn.textContent = formatRuntimeMessage('liveStats.pledgeAmount', 'Pledge %{amount}', {
        amount: formatMoney(parseFloat(price))
      });
    } else if (type === 'support' || type === 'custom') {
      btn.textContent = getRuntimeMessage('liveStats.support', 'Support');
    }
  }
  
  if (input) {
    input.disabled = false;
    input.removeAttribute('aria-disabled');
  }
}

/**
 * Apply cached stats immediately to avoid $0 flash
 * Called before fetch to show last known values instantly
 */
function applyCachedStats() {
  const progressBars = document.querySelectorAll('[data-live-stats][data-campaign-slug]');
  if (progressBars.length === 0) return;

  progressBars.forEach(wrap => {
    const slug = wrap.dataset.campaignSlug;
    const cached = getStatsCache(slug);
    if (cached) {
      updateProgressBar(wrap, cached);
    }
  });
}

/**
 * Apply cached inventory immediately to avoid flash
 */
function applyCachedInventory() {
  const tierCards = document.querySelectorAll('[data-tier-id][data-campaign-slug]');
  if (tierCards.length === 0) return;

  const slugs = [...new Set([...tierCards].map(el => el.dataset.campaignSlug))];
  
  for (const slug of slugs) {
    const cached = getInventoryCache(slug);
    if (cached) {
      tierCards.forEach(card => {
        if (card.dataset.campaignSlug === slug) {
          const tierId = card.dataset.tierId;
          if (cached.tiers?.[tierId]) {
            updateTierInventory(card, cached.tiers[tierId]);
          }
        }
      });
    }
  }
}

// Fetch on page load - apply cached first, then fetch fresh
const previousDomReadyHandler = window[DOM_READY_HANDLER_KEY];
if (typeof previousDomReadyHandler === 'function') {
  document.removeEventListener('DOMContentLoaded', previousDomReadyHandler);
}

const domReadyHandler = () => {
  applyDeclarativeStyles();
  applyCachedStats();
  applyCachedInventory();
  const shouldForceRefresh = consumePendingLiveRefreshMarker();
  if (isPageVisible()) {
    fetchAllLiveStats({ force: shouldForceRefresh });
    fetchLiveInventory({ force: shouldForceRefresh });
  }
};
window[DOM_READY_HANDLER_KEY] = domReadyHandler;
document.addEventListener('DOMContentLoaded', domReadyHandler);

// Refetch when navigating back (bfcache restore)
const previousPageshowHandler = window[PAGESHOW_HANDLER_KEY];
if (typeof previousPageshowHandler === 'function') {
  window.removeEventListener('pageshow', previousPageshowHandler);
}

const pageshowHandler = (event) => {
  const shouldForceRefresh = consumePendingLiveRefreshMarker();
  if (event.persisted && isPageVisible()) {
    fetchAllLiveStats({ force: shouldForceRefresh || event.persisted });
    fetchLiveInventory({ force: shouldForceRefresh || event.persisted });
  }
};
window[PAGESHOW_HANDLER_KEY] = pageshowHandler;
window.addEventListener('pageshow', pageshowHandler);

const previousVisibilityHandler = window[VISIBILITY_HANDLER_KEY];
if (typeof previousVisibilityHandler === 'function') {
  document.removeEventListener('visibilitychange', previousVisibilityHandler);
}

const visibilityHandler = () => {
  if (!isPageVisible()) return;
  const shouldForceRefresh = consumePendingLiveRefreshMarker();
  fetchAllLiveStats({ force: shouldForceRefresh });
  fetchLiveInventory({ force: shouldForceRefresh });
};
window[VISIBILITY_HANDLER_KEY] = visibilityHandler;
document.addEventListener('visibilitychange', visibilityHandler);

const previousStorageHandler = window[STORAGE_HANDLER_KEY];
if (typeof previousStorageHandler === 'function') {
  window.removeEventListener('storage', previousStorageHandler);
}

const storageHandler = (event) => {
  if (!isPageVisible()) return;
  const key = String(event?.key || '');
  if (key === LIVE_REFRESH_MARKER_KEY) {
    clearLiveRequestCaches();
    fetchAllLiveStats({ force: true });
    fetchLiveInventory({ force: true });
    return;
  }
  if (!key.startsWith('pool_stats_') && !key.startsWith('pool_inventory_')) return;
  const slug = key.replace(/^pool_(stats|inventory)_/, '');
  clearLiveRequestCaches(slug);
  fetchAllLiveStats({ force: true });
  fetchLiveInventory({ force: true });
};
window[STORAGE_HANDLER_KEY] = storageHandler;
window.addEventListener('storage', storageHandler);

const previousInvalidationHandler = window[INVALIDATION_HANDLER_KEY];
if (typeof previousInvalidationHandler === 'function') {
  document.removeEventListener('pool:live-cache-invalidated', previousInvalidationHandler);
}

const invalidationHandler = () => {
  if (!isPageVisible()) return;
  fetchAllLiveStats({ force: true });
  fetchLiveInventory({ force: true });
};
window[INVALIDATION_HANDLER_KEY] = invalidationHandler;
document.addEventListener('pool:live-cache-invalidated', invalidationHandler);

// Export for manual refresh and inventory lookup
window.refreshLiveStats = fetchAllLiveStats;
window.refreshLiveInventory = fetchLiveInventory;
window.applyDeclarativeStyles = applyDeclarativeStyles;

// Cache for inventory data (used by cart validation)
window.POOL_INVENTORY_CACHE = {};

/**
 * Get cached inventory for a campaign, or fetch if not cached
 */
window.getTierInventory = async function(campaignSlug, tierId) {
  if (!window.POOL_INVENTORY_CACHE[campaignSlug]) {
    const cached = getInventoryCache(campaignSlug);
    if (cached) {
      window.POOL_INVENTORY_CACHE[campaignSlug] = cached;
    }
  }

  if (!window.POOL_INVENTORY_CACHE[campaignSlug]) {
    try {
      const data = await fetchInventoryForSlug(campaignSlug);
      if (!data) {
        return null;
      }
    } catch (e) {
      logger.error('Failed to fetch inventory:', e);
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
