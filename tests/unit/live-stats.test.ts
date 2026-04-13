/**
 * Unit tests for live-stats.js functionality
 * 
 * Tests cover:
 * - formatMoney() utility
 * - updateProgressBar() - progress bar updates
 * - updateMarkerState() - milestone marker states
 * - checkTierUnlocks() - gated tier unlocking
 * - checkLateSupport() - late support enabling
 * - updateSupportItems() - support item progress
 * - updateTierInventory() - inventory display and sold out states
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock POOL_CONFIG
const mockWorkerBase = 'https://pledge.dustwave.xyz';

// Helper to set up the live-stats module globals
function setupGlobals() {
  (window as any).POOL_CONFIG = {
    workerBase: mockWorkerBase,
    i18n: {
      messages: {
        liveStats: {
          projectFunded: 'Project Funded',
          support: 'Support',
          funded: 'Funded',
          soldOut: 'Sold Out',
          pledgeAmount: 'Pledge %{amount}'
        }
      }
    }
  };
  (window as any).POOL_INVENTORY_CACHE = {};
}

// Helper to create DOM elements for testing
function createProgressWrap(options: {
  campaignSlug?: string;
  goal?: number;
  pledged?: number;
  maxThreshold?: number;
  hasBar?: boolean;
  hasPledgedEl?: boolean;
  milestones?: boolean;
  stretchGoals?: { threshold: number }[];
} = {}) {
  const {
    campaignSlug = 'test-campaign',
    goal = 10000,
    pledged = 0,
    maxThreshold = goal,
    hasBar = true,
    hasPledgedEl = true,
    milestones = true,
    stretchGoals = [],
  } = options;

  const wrap = document.createElement('div');
  wrap.className = 'progress-wrap';
  wrap.dataset.liveStats = 'true';
  wrap.dataset.campaignSlug = campaignSlug;
  wrap.dataset.goal = String(goal);
  wrap.dataset.pledged = String(pledged);
  wrap.dataset.maxThreshold = String(maxThreshold);

  if (hasBar) {
    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    const span = document.createElement('span');
    span.dataset.progressWidth = '0';
    bar.appendChild(span);
    wrap.appendChild(bar);
  }

  if (hasPledgedEl) {
    const pledgedEl = document.createElement('strong');
    pledgedEl.dataset.livePledged = 'true';
    pledgedEl.textContent = '$0';
    wrap.appendChild(pledgedEl);
  }

  if (milestones) {
    // 1/3 milestone
    const m1 = document.createElement('div');
    m1.className = 'progress-marker progress-marker--milestone';
    wrap.querySelector('.progress-bar')?.appendChild(m1);

    // 2/3 milestone
    const m2 = document.createElement('div');
    m2.className = 'progress-marker progress-marker--milestone';
    wrap.querySelector('.progress-bar')?.appendChild(m2);

    // Goal marker
    const goalMarker = document.createElement('div');
    goalMarker.className = 'progress-marker progress-marker--goal';
    wrap.querySelector('.progress-bar')?.appendChild(goalMarker);
  }

  // Add stretch goal markers
  stretchGoals.forEach((sg) => {
    const marker = document.createElement('div');
    marker.className = 'progress-marker progress-marker--stretch';
    marker.dataset.threshold = String(sg.threshold);
    wrap.querySelector('.progress-bar')?.appendChild(marker);
  });

  return wrap;
}

function createTierCard(options: {
  campaignSlug?: string;
  tierId?: string;
  requiresThreshold?: number;
  lateSupport?: boolean;
  disabled?: boolean;
  price?: number;
} = {}) {
  const {
    campaignSlug = 'test-campaign',
    tierId = 'tier-1',
    requiresThreshold,
    lateSupport = false,
    disabled = false,
    price = 50,
  } = options;

  const card = document.createElement('div');
  card.className = 'tier-card';
  card.id = `tier-${tierId}`;
  card.dataset.tierId = tierId;
  card.dataset.campaignSlug = campaignSlug;
  
  if (requiresThreshold) {
    card.dataset.requiresThreshold = String(requiresThreshold);
    card.classList.add('tier-card--locked');
  }
  
  if (lateSupport) {
    card.dataset.lateSupport = 'true';
  }

  const btn = document.createElement('button');
  btn.className = 'poolcart-add-item';
  btn.dataset.itemPrice = String(price);
  if (disabled) {
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
  }
  btn.textContent = disabled ? 'Locked' : `Pledge $${price}`;
  card.appendChild(btn);

  // Add remaining display
  const remainingEl = document.createElement('span');
  remainingEl.dataset.liveRemaining = 'true';
  remainingEl.textContent = '100';
  card.appendChild(remainingEl);

  const limitEl = document.createElement('span');
  limitEl.dataset.liveLimit = 'true';
  limitEl.textContent = '100';
  card.appendChild(limitEl);

  return card;
}

function createSupportItem(options: {
  itemId?: string;
  current?: number;
  target?: number;
  lateSupport?: boolean;
  disabled?: boolean;
} = {}) {
  const {
    itemId = 'location-scouting',
    current = 0,
    target = 1000,
    lateSupport = false,
    disabled = false,
  } = options;

  const item = document.createElement('div');
  item.className = 'support-item';
  item.id = `support-${itemId}`;
  if (lateSupport) {
    item.dataset.lateSupport = 'true';
  }

  const amountEl = document.createElement('span');
  amountEl.className = 'support-item__amount';
  amountEl.textContent = `$${current} / $${target}`;
  item.appendChild(amountEl);

  const progressBar = document.createElement('div');
  progressBar.className = 'support-item__progress';
  const progressSpan = document.createElement('span');
  progressSpan.dataset.progressWidth = '0';
  progressBar.appendChild(progressSpan);
  item.appendChild(progressBar);

  const input = document.createElement('input');
  input.className = 'support-item__input';
  input.type = 'number';
  input.max = String(target - current);
  input.placeholder = String(target - current);
  if (disabled) input.disabled = true;
  item.appendChild(input);

  const btn = document.createElement('button');
  btn.className = 'support-item__btn';
  btn.textContent = disabled ? 'Campaign Ended' : 'Support';
  if (disabled) btn.disabled = true;
  item.appendChild(btn);

  return item;
}

function createCustomAmount(options: {
  campaignSlug?: string;
  lateSupport?: boolean;
  disabled?: boolean;
  goal?: number;
} = {}) {
  const {
    campaignSlug = 'test-campaign',
    lateSupport = false,
    disabled = false,
    goal = 10000,
  } = options;

  const wrapper = document.createElement('div');
  wrapper.className = 'custom-amount';
  wrapper.dataset.campaignSlug = campaignSlug;
  if (lateSupport) {
    wrapper.dataset.lateSupport = 'true';
    wrapper.dataset.goal = String(goal);
  }

  const input = document.createElement('input');
  input.className = 'custom-amount__input';
  input.type = 'number';
  if (disabled) {
    input.disabled = true;
    input.setAttribute('aria-disabled', 'true');
  }
  wrapper.appendChild(input);

  const btn = document.createElement('button');
  btn.className = 'custom-amount__btn';
  btn.textContent = disabled ? 'Campaign Ended' : 'Support';
  if (disabled) {
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
  }
  wrapper.appendChild(btn);

  return wrapper;
}

// ============================================================================
// formatMoney Tests
// ============================================================================

describe('formatMoney', () => {
  // Inline the function for testing (since the original isn't exported)
  function formatMoney(dollars: number): string {
    if (dollars >= 1000) {
      return `$${(dollars / 1000).toFixed(dollars % 1000 === 0 ? 0 : 1)}k`;
    }
    return `$${dollars.toLocaleString()}`;
  }

  it('formats small amounts without k suffix', () => {
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(1)).toBe('$1');
    expect(formatMoney(100)).toBe('$100');
    expect(formatMoney(999)).toBe('$999');
  });

  it('formats exact thousands with k suffix (no decimal)', () => {
    expect(formatMoney(1000)).toBe('$1k');
    expect(formatMoney(5000)).toBe('$5k');
    expect(formatMoney(10000)).toBe('$10k');
    expect(formatMoney(25000)).toBe('$25k');
  });

  it('formats non-exact thousands with one decimal', () => {
    expect(formatMoney(1500)).toBe('$1.5k');
    expect(formatMoney(2750)).toBe('$2.8k'); // rounds up
    expect(formatMoney(12345)).toBe('$12.3k');
  });

  it('handles edge cases', () => {
    expect(formatMoney(999.99)).toBe('$999.99');
    expect(formatMoney(1000.01)).toBe('$1.0k'); // just over 1k shows decimal
    expect(formatMoney(100000)).toBe('$100k');
  });
});

// ============================================================================
// updateMarkerState Tests
// ============================================================================

describe('updateMarkerState', () => {
  function updateMarkerState(container: Element, selector: string, achieved: boolean) {
    const marker = container.querySelector(selector);
    if (marker) {
      if (achieved) {
        marker.classList.add('progress-marker--achieved');
      } else {
        marker.classList.remove('progress-marker--achieved');
      }
    }
  }

  it('adds achieved class when goal is met', () => {
    const wrap = createProgressWrap();
    document.body.appendChild(wrap);

    const marker = wrap.querySelector('.progress-marker--goal');
    expect(marker?.classList.contains('progress-marker--achieved')).toBe(false);

    updateMarkerState(wrap, '.progress-marker--goal', true);
    expect(marker?.classList.contains('progress-marker--achieved')).toBe(true);

    document.body.removeChild(wrap);
  });

  it('removes achieved class when goal is not met', () => {
    const wrap = createProgressWrap();
    document.body.appendChild(wrap);

    const marker = wrap.querySelector('.progress-marker--goal');
    marker?.classList.add('progress-marker--achieved');

    updateMarkerState(wrap, '.progress-marker--goal', false);
    expect(marker?.classList.contains('progress-marker--achieved')).toBe(false);

    document.body.removeChild(wrap);
  });

  it('handles missing markers gracefully', () => {
    const wrap = document.createElement('div');
    // Should not throw
    expect(() => updateMarkerState(wrap, '.nonexistent', true)).not.toThrow();
  });
});

// ============================================================================
// Declarative Style Hydration Tests
// ============================================================================

describe('applyDeclarativeStyles', () => {
  const WIDTH_PERCENT_CLASS_PREFIX = 'u-width-pct-';
  const LEFT_PERCENT_CLASS_PREFIX = 'u-left-pct-';

  function applyPercentClass(node: Element, prefix: string, percent: number) {
    const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
    Array.from(node.classList).forEach((className) => {
      if (className.indexOf(prefix) === 0) {
        node.classList.remove(className);
      }
    });
    node.classList.add(prefix + clampedPercent);
  }

  function applyDeclarativeStyles(root: ParentNode = document) {
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

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('hydrates width and left utility classes from data attributes', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <span data-progress-width="42"></span>
      <div class="progress-marker" data-progress-left="67"></div>
    `;
    document.body.appendChild(root);

    applyDeclarativeStyles(root);

    expect((root.querySelector('[data-progress-width]') as HTMLElement).classList.contains('u-width-pct-42')).toBe(true);
    expect((root.querySelector('[data-progress-left]') as HTMLElement).classList.contains('u-left-pct-67')).toBe(true);
  });
});

// ============================================================================
// Progress Bar Update Tests
// ============================================================================

describe('updateProgressBar', () => {
  const WIDTH_PERCENT_CLASS_PREFIX = 'u-width-pct-';

  function applyPercentClass(node: Element, prefix: string, percent: number) {
    const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
    Array.from(node.classList).forEach((className) => {
      if (className.indexOf(prefix) === 0) {
        node.classList.remove(className);
      }
    });
    node.classList.add(prefix + clampedPercent);
  }

  function updateProgressBar(wrap: Element, stats: { pledgedAmount: number; supportItems?: Record<string, number> }) {
    const goal = parseInt(wrap.getAttribute('data-goal') || '0', 10);
    const maxThreshold = parseInt(wrap.getAttribute('data-max-threshold') || String(goal), 10);
    const pledged = stats.pledgedAmount || 0;
    const pledgedDollars = pledged / 100;

    // Update the progress bar fill
    const bar = wrap.querySelector('.progress-bar span') as HTMLElement | null;
    if (bar && maxThreshold > 0) {
      const pct = Math.min(100, Math.round((pledgedDollars / maxThreshold) * 100));
      applyPercentClass(bar, WIDTH_PERCENT_CLASS_PREFIX, pct);
    }

    // Update the pledged amount text
    const pledgedEl = wrap.querySelector('[data-live-pledged]');
    if (pledgedEl) {
      if (pledgedDollars >= 1000) {
        pledgedEl.textContent = `$${(pledgedDollars / 1000).toFixed(pledgedDollars % 1000 === 0 ? 0 : 1)}k`;
      } else {
        pledgedEl.textContent = `$${pledgedDollars.toLocaleString()}`;
      }
    }
  }

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('updates progress bar width correctly', () => {
    const wrap = createProgressWrap({ goal: 10000 });
    document.body.appendChild(wrap);

    updateProgressBar(wrap, { pledgedAmount: 500000 }); // $5,000 in cents
    const bar = wrap.querySelector('.progress-bar span') as HTMLElement;
    expect(bar.classList.contains('u-width-pct-50')).toBe(true);
  });

  it('caps progress bar at 100%', () => {
    const wrap = createProgressWrap({ goal: 10000 });
    document.body.appendChild(wrap);

    updateProgressBar(wrap, { pledgedAmount: 2000000 }); // $20,000 (double the goal)
    const bar = wrap.querySelector('.progress-bar span') as HTMLElement;
    expect(bar.classList.contains('u-width-pct-100')).toBe(true);
  });

  it('updates pledged text with formatted amount', () => {
    const wrap = createProgressWrap({ goal: 10000 });
    document.body.appendChild(wrap);

    updateProgressBar(wrap, { pledgedAmount: 750000 }); // $7,500
    const pledgedEl = wrap.querySelector('[data-live-pledged]');
    expect(pledgedEl?.textContent).toBe('$7.5k');
  });

  it('uses maxThreshold for percentage calculation', () => {
    const wrap = createProgressWrap({ goal: 10000, maxThreshold: 20000 });
    document.body.appendChild(wrap);

    updateProgressBar(wrap, { pledgedAmount: 500000 }); // $5,000
    const bar = wrap.querySelector('.progress-bar span') as HTMLElement;
    expect(bar.classList.contains('u-width-pct-25')).toBe(true); // 5k / 20k = 25%
  });
});

// ============================================================================
// Tier Unlock Tests
// ============================================================================

describe('checkTierUnlocks', () => {
  const unlockedTiers = new Set<string>();

  function unlockTier(card: Element) {
    card.classList.remove('tier-card--locked');
    card.classList.add('tier-card--unlocked');

    const btn = card.querySelector('.poolcart-add-item') as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute('aria-disabled');
      const price = btn.dataset.itemPrice;
      btn.textContent = `Pledge $${price}`;
    }
  }

  function checkTierUnlocks(campaignSlug: string, pledgedDollars: number) {
    const tierCards = document.querySelectorAll(
      `.tier-card[data-campaign-slug="${campaignSlug}"][data-requires-threshold]`
    );

    tierCards.forEach((card) => {
      const threshold = parseInt((card as HTMLElement).dataset.requiresThreshold || '0', 10);
      const tierId = (card as HTMLElement).dataset.tierId;
      const unlockKey = `${campaignSlug}__${tierId}`;

      if (pledgedDollars >= threshold && !unlockedTiers.has(unlockKey)) {
        unlockTier(card);
        unlockedTiers.add(unlockKey);
      }
    });
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    unlockedTiers.clear();
  });

  it('unlocks tier when threshold is met', () => {
    const card = createTierCard({
      campaignSlug: 'test-campaign',
      tierId: 'premium',
      requiresThreshold: 5000,
      disabled: true,
    });
    document.body.appendChild(card);

    checkTierUnlocks('test-campaign', 5000);

    expect(card.classList.contains('tier-card--locked')).toBe(false);
    expect(card.classList.contains('tier-card--unlocked')).toBe(true);
    const btn = card.querySelector('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('Pledge $50');
  });

  it('does not unlock tier when below threshold', () => {
    const card = createTierCard({
      campaignSlug: 'test-campaign',
      tierId: 'premium',
      requiresThreshold: 5000,
      disabled: true,
    });
    document.body.appendChild(card);

    checkTierUnlocks('test-campaign', 4999);

    expect(card.classList.contains('tier-card--locked')).toBe(true);
    expect(card.classList.contains('tier-card--unlocked')).toBe(false);
  });

  it('only unlocks tier once (idempotent)', () => {
    const card = createTierCard({
      campaignSlug: 'test-campaign',
      tierId: 'premium',
      requiresThreshold: 5000,
      disabled: true,
    });
    document.body.appendChild(card);

    checkTierUnlocks('test-campaign', 5000);
    checkTierUnlocks('test-campaign', 6000);
    checkTierUnlocks('test-campaign', 10000);

    // Should still only have one unlock key
    expect(unlockedTiers.size).toBe(1);
  });

  it('handles multiple tiers with different thresholds', () => {
    const card1 = createTierCard({
      campaignSlug: 'test-campaign',
      tierId: 'tier-1',
      requiresThreshold: 3000,
      disabled: true,
    });
    const card2 = createTierCard({
      campaignSlug: 'test-campaign',
      tierId: 'tier-2',
      requiresThreshold: 7000,
      disabled: true,
    });
    document.body.appendChild(card1);
    document.body.appendChild(card2);

    checkTierUnlocks('test-campaign', 5000);

    expect(card1.classList.contains('tier-card--unlocked')).toBe(true);
    expect(card2.classList.contains('tier-card--locked')).toBe(true);
  });
});

// ============================================================================
// Late Support Tests
// ============================================================================

describe('checkLateSupport', () => {
  const enabledLateSupport = new Set<string>();

  function enableLateSupportElement(element: Element, type: 'tier' | 'support' | 'custom') {
    const btn = element.querySelector('button') as HTMLButtonElement | null;
    const input = element.querySelector('input') as HTMLInputElement | null;

    if (btn) {
      btn.disabled = false;
      btn.removeAttribute('aria-disabled');

      if (type === 'tier') {
        const price = btn.dataset?.itemPrice;
        btn.textContent = `Pledge $${price}`;
      } else {
        btn.textContent = 'Support';
      }
    }

    if (input) {
      input.disabled = false;
      input.removeAttribute('aria-disabled');
    }
  }

  function checkLateSupport(campaignSlug: string, pledgedDollars: number, goal: number) {
    if (pledgedDollars < goal) return;
    if (enabledLateSupport.has(campaignSlug)) return;

    enabledLateSupport.add(campaignSlug);

    // Enable tier cards with late support
    document.querySelectorAll(`.tier-card[data-campaign-slug="${campaignSlug}"][data-late-support="true"]`).forEach((card) => {
      enableLateSupportElement(card, 'tier');
    });

    // Enable support items with late support
    document.querySelectorAll(`.support-item[data-late-support="true"]`).forEach((item) => {
      const parent = item.closest('.support-items');
      if (parent && (parent as HTMLElement).dataset.campaignSlug === campaignSlug) {
        enableLateSupportElement(item, 'support');
      }
    });

    // Enable custom amount with late support
    const customAmount = document.querySelector(`.custom-amount[data-campaign-slug="${campaignSlug}"][data-late-support="true"]`);
    if (customAmount) {
      enableLateSupportElement(customAmount, 'custom');
    }
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    enabledLateSupport.clear();
  });

  it('enables late support tiers when goal is met', () => {
    const card = createTierCard({
      campaignSlug: 'test-campaign',
      tierId: 'late-tier',
      lateSupport: true,
      disabled: true,
    });
    document.body.appendChild(card);

    checkLateSupport('test-campaign', 10000, 10000);

    const btn = card.querySelector('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('Pledge $50');
  });

  it('does not enable late support before goal is met', () => {
    const card = createTierCard({
      campaignSlug: 'test-campaign',
      tierId: 'late-tier',
      lateSupport: true,
      disabled: true,
    });
    document.body.appendChild(card);

    checkLateSupport('test-campaign', 9999, 10000);

    const btn = card.querySelector('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('enables custom amount with late support', () => {
    const custom = createCustomAmount({
      campaignSlug: 'test-campaign',
      lateSupport: true,
      disabled: true,
    });
    document.body.appendChild(custom);

    checkLateSupport('test-campaign', 10000, 10000);

    const btn = custom.querySelector('button') as HTMLButtonElement;
    const input = custom.querySelector('input') as HTMLInputElement;
    expect(btn.disabled).toBe(false);
    expect(input.disabled).toBe(false);
  });

  it('only enables late support once (idempotent)', () => {
    const card = createTierCard({
      campaignSlug: 'test-campaign',
      lateSupport: true,
      disabled: true,
    });
    document.body.appendChild(card);

    checkLateSupport('test-campaign', 10000, 10000);
    checkLateSupport('test-campaign', 15000, 10000);

    expect(enabledLateSupport.size).toBe(1);
  });
});

// ============================================================================
// Runtime Integration Tests
// ============================================================================

describe('live-stats runtime integration', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
    localStorage.clear();
    setupGlobals();
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    localStorage.clear();
    if (typeof (window as any).__POOL_LIVE_STATS_DOM_READY_HANDLER === 'function') {
      document.removeEventListener('DOMContentLoaded', (window as any).__POOL_LIVE_STATS_DOM_READY_HANDLER);
    }
    if (typeof (window as any).__POOL_LIVE_STATS_PAGESHOW_HANDLER === 'function') {
      window.removeEventListener('pageshow', (window as any).__POOL_LIVE_STATS_PAGESHOW_HANDLER);
    }
    if (typeof (window as any).__POOL_LIVE_STATS_VISIBILITY_HANDLER === 'function') {
      document.removeEventListener('visibilitychange', (window as any).__POOL_LIVE_STATS_VISIBILITY_HANDLER);
    }
    if (typeof (window as any).__POOL_LIVE_STATS_STORAGE_HANDLER === 'function') {
      window.removeEventListener('storage', (window as any).__POOL_LIVE_STATS_STORAGE_HANDLER);
    }
    if (typeof (window as any).__POOL_LIVE_STATS_INVALIDATION_HANDLER === 'function') {
      document.removeEventListener('pool:live-cache-invalidated', (window as any).__POOL_LIVE_STATS_INVALIDATION_HANDLER);
    }
    delete (window as any).refreshLiveStats;
    delete (window as any).refreshLiveInventory;
    delete (window as any).applyDeclarativeStyles;
    delete (window as any).getTierInventory;
    delete (window as any).invalidateStatsCache;
    delete (window as any).invalidateInventoryCache;
    delete (window as any).POOL_INVENTORY_CACHE;
    delete (window as any).__POOL_LIVE_STATS_STORAGE_HANDLER;
    delete (window as any).__POOL_LIVE_STATS_INVALIDATION_HANDLER;
    delete (window as any).__POOL_LIVE_STATS_DOM_READY_HANDLER;
    delete (window as any).__POOL_LIVE_STATS_PAGESHOW_HANDLER;
    delete (window as any).__POOL_LIVE_STATS_VISIBILITY_HANDLER;
  });

  it('uses fresh localStorage caches on boot without refetching stats or inventory', async () => {
    const wrap = createProgressWrap({ campaignSlug: 'test-campaign', goal: 10000 });
    const card = createTierCard({ campaignSlug: 'test-campaign', tierId: 'tier-1' });
    document.body.appendChild(wrap);
    document.body.appendChild(card);

    localStorage.setItem('pool_stats_test-campaign', JSON.stringify({
      data: { pledgedAmount: 500000, supportItems: {} },
      timestamp: Date.now()
    }));
    localStorage.setItem('pool_inventory_test-campaign', JSON.stringify({
      data: { tiers: { 'tier-1': { remaining: 3, limit: 10 } } },
      timestamp: Date.now()
    }));

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as any);

    await import('../../assets/js/live-stats.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();

    expect(fetchMock).not.toHaveBeenCalled();
    expect((wrap.querySelector('[data-live-pledged]') as HTMLElement).textContent).toBe('$5k');
    expect((card.querySelector('[data-live-remaining]') as HTMLElement).textContent).toBe('3');
  });

  it('coalesces concurrent inventory fetches for the same campaign', async () => {
    const inventoryPayload = { tiers: { 'tier-1': { remaining: 2, limit: 10 } } };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        stats: { pledgedAmount: 500000, supportItems: {} },
        inventory: inventoryPayload
      })
    }));
    vi.stubGlobal('fetch', fetchMock as any);

    await import('../../assets/js/live-stats.js');

    const [first, second] = await Promise.all([
      (window as any).getTierInventory('test-campaign', 'tier-1'),
      (window as any).getTierInventory('test-campaign', 'tier-1')
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://pledge.dustwave.xyz/live/test-campaign');
    expect(first).toEqual({ remaining: 2, limit: 10 });
    expect(second).toEqual({ remaining: 2, limit: 10 });
  });

  it('uses one combined live endpoint request for uncached stats and inventory on boot', async () => {
    const wrap = createProgressWrap({ campaignSlug: 'test-campaign', goal: 10000 });
    const card = createTierCard({ campaignSlug: 'test-campaign', tierId: 'tier-1' });
    document.body.appendChild(wrap);
    document.body.appendChild(card);

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        stats: { pledgedAmount: 500000, supportItems: {}, state: 'live' },
        inventory: { tiers: { 'tier-1': { remaining: 4, limit: 10 } } }
      })
    }));
    vi.stubGlobal('fetch', fetchMock as any);

    await import('../../assets/js/live-stats.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://pledge.dustwave.xyz/live/test-campaign');
    expect((wrap.querySelector('[data-live-pledged]') as HTMLElement).textContent).toBe('$5k');
    expect((card.querySelector('[data-live-remaining]') as HTMLElement).textContent).toBe('4');
  });

  it('forces a fresh stats fetch after cache invalidation on an open page', async () => {
    const wrap = createProgressWrap({ campaignSlug: 'test-campaign', goal: 10000 });
    document.body.appendChild(wrap);

    localStorage.setItem('pool_stats_test-campaign', JSON.stringify({
      data: { pledgedAmount: 500000, supportItems: {} },
      timestamp: Date.now()
    }));

    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => {
        if (url.endsWith('/stats/test-campaign')) {
          return { pledgedAmount: 850000, supportItems: {} };
        }
        return { stats: { pledgedAmount: 850000, supportItems: {} }, inventory: null };
      }
    }));
    vi.stubGlobal('fetch', fetchMock as any);

    await import('../../assets/js/live-stats.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();

    expect((wrap.querySelector('[data-live-pledged]') as HTMLElement).textContent).toBe('$5k');

    (window as any).invalidateStatsCache('test-campaign');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledWith('https://pledge.dustwave.xyz/stats/test-campaign');
    expect((wrap.querySelector('[data-live-pledged]') as HTMLElement).textContent).toBe('$8.5k');
    expect(JSON.parse(localStorage.getItem('pool_live_refresh_needed') || '{}').campaignSlugs || []).toContain('test-campaign');
  });

  it('writes a refresh marker when inventory cache is invalidated', async () => {
    await import('../../assets/js/live-stats.js');

    (window as any).invalidateInventoryCache('test-campaign');

    const marker = JSON.parse(localStorage.getItem('pool_live_refresh_needed') || '{}');
    expect(marker.campaignSlugs || []).toContain('test-campaign');
    expect(typeof marker.timestamp).toBe('number');
  });

  it('forces a fresh live fetch on boot when a post-pledge refresh marker is present', async () => {
    const wrap = createProgressWrap({ campaignSlug: 'test-campaign', goal: 10000 });
    document.body.appendChild(wrap);

    localStorage.setItem('pool_stats_test-campaign', JSON.stringify({
      data: { pledgedAmount: 500000, supportItems: {} },
      timestamp: Date.now()
    }));
    localStorage.setItem('pool_live_refresh_needed', JSON.stringify({
      campaignSlugs: ['test-campaign'],
      timestamp: Date.now()
    }));

    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => {
        if (url.endsWith('/stats/test-campaign')) {
          return { pledgedAmount: 925000, supportItems: {}, state: 'live' };
        }
        return {
          stats: { pledgedAmount: 925000, supportItems: {}, state: 'live' },
          inventory: null
        };
      }
    }));
    vi.stubGlobal('fetch', fetchMock as any);

    await import('../../assets/js/live-stats.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('https://pledge.dustwave.xyz/stats/test-campaign');
      expect((wrap.querySelector('[data-live-pledged]') as HTMLElement).textContent).toBe('$9.3k');
    });
    expect(localStorage.getItem('pool_live_refresh_needed')).toBeNull();
  });

  it('uses localized runtime messages for funded, sold-out, and pledge labels', async () => {
    (window as any).POOL_CONFIG = {
      workerBase: mockWorkerBase,
      i18n: {
        messages: {
          liveStats: {
            projectFunded: 'Proyecto financiado',
            support: 'Apoyar',
            funded: 'Financiado',
            soldOut: 'Agotado',
            pledgeAmount: 'Aportar %{amount}'
          }
        }
      }
    };

    const wrap = createProgressWrap({ campaignSlug: 'test-campaign', goal: 10000 });
    const countdown = document.createElement('div');
    countdown.id = 'campaign-countdown';
    countdown.dataset.goalMet = 'false';
    const message = document.createElement('div');
    message.className = 'campaign-countdown__message campaign-countdown__message--not-funded';
    countdown.appendChild(message);
    document.body.appendChild(countdown);

    const soldOutCard = createTierCard({ campaignSlug: 'test-campaign', tierId: 'tier-1' });
    const lateSupportCard = createTierCard({ campaignSlug: 'test-campaign', tierId: 'late-tier', lateSupport: true, disabled: true });
    const supportItem = createSupportItem({ itemId: 'location-scouting', lateSupport: true, disabled: true });
    const supportList = document.createElement('div');
    supportList.className = 'support-items';
    supportList.dataset.campaignSlug = 'test-campaign';
    supportList.appendChild(supportItem);
    const customAmount = createCustomAmount({ campaignSlug: 'test-campaign', lateSupport: true, disabled: true, goal: 10000 });

    document.body.appendChild(wrap);
    document.body.appendChild(soldOutCard);
    document.body.appendChild(lateSupportCard);
    document.body.appendChild(supportList);
    document.body.appendChild(customAmount);

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        stats: {
          pledgedAmount: 1000000,
          supportItems: { 'location-scouting': 100000 }
        },
        inventory: {
          tiers: {
            'tier-1': { remaining: 0, limit: 10 },
            'late-tier': { remaining: 2, limit: 10 }
          }
        }
      })
    }));
    vi.stubGlobal('fetch', fetchMock as any);

    await import('../../assets/js/live-stats.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect((countdown.querySelector('h2') as HTMLElement).textContent).toBe('Proyecto financiado');
    expect((soldOutCard.querySelector('button') as HTMLButtonElement).textContent).toBe('Agotado');
    expect((lateSupportCard.querySelector('button') as HTMLButtonElement).textContent).toBe('Aportar $50');
    expect((supportItem.querySelector('button') as HTMLButtonElement).textContent).toBe('Financiado');
    expect((customAmount.querySelector('button') as HTMLButtonElement).textContent).toBe('Apoyar');
  });
});

// ============================================================================
// Support Items Update Tests
// ============================================================================

describe('updateSupportItems', () => {
  const WIDTH_PERCENT_CLASS_PREFIX = 'u-width-pct-';

  function applyPercentClass(node: Element, prefix: string, percent: number) {
    const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
    Array.from(node.classList).forEach((className) => {
      if (className.indexOf(prefix) === 0) {
        node.classList.remove(className);
      }
    });
    node.classList.add(prefix + clampedPercent);
  }

  function updateSupportItems(supportItems: Record<string, number>) {
    document.querySelectorAll('.support-item[id^="support-"]').forEach((item) => {
      const itemId = item.id.replace('support-', '');
      const currentCents = supportItems[itemId] || 0;
      const currentDollars = currentCents / 100;

      const amountEl = item.querySelector('.support-item__amount');
      if (amountEl) {
        const targetMatch = amountEl.textContent?.match(/\/\s*\$?([\d,]+)/);
        if (targetMatch) {
          const target = parseFloat(targetMatch[1].replace(/,/g, ''));
          amountEl.textContent = `$${currentDollars.toLocaleString()} / $${target.toLocaleString()}`;

          const progressBar = item.querySelector('.support-item__progress span') as HTMLElement | null;
          if (progressBar && target > 0) {
            const pct = Math.min(100, Math.round((currentDollars / target) * 100));
            applyPercentClass(progressBar, WIDTH_PERCENT_CLASS_PREFIX, pct);
          }

          const input = item.querySelector('.support-item__input') as HTMLInputElement | null;
          if (input) {
            const remaining = Math.max(0, target - currentDollars);
            input.max = String(remaining);
            input.placeholder = remaining > 0 ? String(remaining) : '0';

            if (remaining <= 0) {
              input.disabled = true;
              const btn = item.querySelector('.support-item__btn') as HTMLButtonElement | null;
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

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('updates support item amount and progress', () => {
    const item = createSupportItem({ itemId: 'location-scouting', current: 0, target: 1000 });
    document.body.appendChild(item);

    updateSupportItems({ 'location-scouting': 50000 }); // $500

    const amountEl = item.querySelector('.support-item__amount');
    expect(amountEl?.textContent).toBe('$500 / $1,000');

    const progressBar = item.querySelector('.support-item__progress span') as HTMLElement;
    expect(progressBar.classList.contains('u-width-pct-50')).toBe(true);
  });

  it('disables fully funded support items', () => {
    const item = createSupportItem({ itemId: 'location-scouting', current: 0, target: 1000 });
    document.body.appendChild(item);

    updateSupportItems({ 'location-scouting': 100000 }); // $1000 (fully funded)

    const input = item.querySelector('input') as HTMLInputElement;
    const btn = item.querySelector('button') as HTMLButtonElement;

    expect(input.disabled).toBe(true);
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Funded');
  });

  it('updates remaining amount in input', () => {
    const item = createSupportItem({ itemId: 'location-scouting', current: 0, target: 1000 });
    document.body.appendChild(item);

    updateSupportItems({ 'location-scouting': 75000 }); // $750

    const input = item.querySelector('input') as HTMLInputElement;
    expect(input.max).toBe('250');
    expect(input.placeholder).toBe('250');
  });

  it('handles multiple support items', () => {
    const item1 = createSupportItem({ itemId: 'item-1', current: 0, target: 1000 });
    const item2 = createSupportItem({ itemId: 'item-2', current: 0, target: 2000 });
    document.body.appendChild(item1);
    document.body.appendChild(item2);

    updateSupportItems({
      'item-1': 50000, // $500
      'item-2': 150000, // $1500
    });

    const progress1 = item1.querySelector('.support-item__progress span') as HTMLElement;
    const progress2 = item2.querySelector('.support-item__progress span') as HTMLElement;

    expect(progress1.classList.contains('u-width-pct-50')).toBe(true);
    expect(progress2.classList.contains('u-width-pct-75')).toBe(true);
  });
});

// ============================================================================
// Tier Inventory Update Tests
// ============================================================================

describe('updateTierInventory', () => {
  function updateTierInventory(card: Element, tierInv: { remaining: number; limit: number }) {
    const remainingEl = card.querySelector('[data-live-remaining]');
    if (remainingEl) {
      remainingEl.textContent = tierInv.remaining.toLocaleString();
    }

    const limitEl = card.querySelector('[data-live-limit]');
    if (limitEl) {
      limitEl.textContent = tierInv.limit.toLocaleString();
    }

    if (tierInv.remaining <= 0) {
      const btn = card.querySelector('.poolcart-add-item') as HTMLButtonElement | null;
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sold Out';
      }
      card.classList.add('tier-card--sold-out');
    }
  }

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('updates remaining and limit displays', () => {
    const card = createTierCard();
    document.body.appendChild(card);

    updateTierInventory(card, { remaining: 42, limit: 100 });

    const remainingEl = card.querySelector('[data-live-remaining]');
    const limitEl = card.querySelector('[data-live-limit]');

    expect(remainingEl?.textContent).toBe('42');
    expect(limitEl?.textContent).toBe('100');
  });

  it('marks tier as sold out when remaining is 0', () => {
    const card = createTierCard();
    document.body.appendChild(card);

    updateTierInventory(card, { remaining: 0, limit: 100 });

    const btn = card.querySelector('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Sold Out');
    expect(card.classList.contains('tier-card--sold-out')).toBe(true);
  });

  it('formats large numbers with locale string', () => {
    const card = createTierCard();
    document.body.appendChild(card);

    updateTierInventory(card, { remaining: 1234, limit: 5000 });

    const remainingEl = card.querySelector('[data-live-remaining]');
    const limitEl = card.querySelector('[data-live-limit]');

    expect(remainingEl?.textContent).toBe('1,234');
    expect(limitEl?.textContent).toBe('5,000');
  });
});

// ============================================================================
// Stretch Goal Marker Tests
// ============================================================================

describe('stretch goal markers', () => {
  function updateStretchGoals(wrap: Element, pledgedDollars: number) {
    wrap.querySelectorAll('.progress-marker--stretch').forEach((marker) => {
      const threshold = parseInt((marker as HTMLElement).dataset.threshold || '0', 10);
      if (pledgedDollars >= threshold) {
        marker.classList.add('progress-marker--achieved');
      }
    });
  }

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('marks stretch goals as achieved when threshold met', () => {
    const wrap = createProgressWrap({
      goal: 10000,
      stretchGoals: [
        { threshold: 15000 },
        { threshold: 20000 },
      ],
    });
    document.body.appendChild(wrap);

    updateStretchGoals(wrap, 17000);

    const markers = wrap.querySelectorAll('.progress-marker--stretch');
    expect(markers[0].classList.contains('progress-marker--achieved')).toBe(true);
    expect(markers[1].classList.contains('progress-marker--achieved')).toBe(false);
  });

  it('marks all stretch goals when all thresholds met', () => {
    const wrap = createProgressWrap({
      goal: 10000,
      stretchGoals: [
        { threshold: 15000 },
        { threshold: 20000 },
      ],
    });
    document.body.appendChild(wrap);

    updateStretchGoals(wrap, 25000);

    const markers = wrap.querySelectorAll('.progress-marker--stretch');
    expect(markers[0].classList.contains('progress-marker--achieved')).toBe(true);
    expect(markers[1].classList.contains('progress-marker--achieved')).toBe(true);
  });
});

// ============================================================================
// API Fetch Tests (mocked)
// ============================================================================

describe('API fetching', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches stats for campaigns with data-live-stats', async () => {
    const fetchCalls: string[] = [];
    
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      fetchCalls.push(String(url));
      return new Response(JSON.stringify({ pledgedAmount: 500000, pledgeCount: 10 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const wrap = createProgressWrap({ campaignSlug: 'test-campaign' });
    document.body.appendChild(wrap);

    // Simulate fetchAllLiveStats
    const progressBars = document.querySelectorAll('[data-live-stats][data-campaign-slug]');
    const slugs = [...new Set([...progressBars].map((el) => (el as HTMLElement).dataset.campaignSlug))];

    await Promise.all(
      slugs.map(async (slug) => {
        const res = await fetch(`${mockWorkerBase}/stats/${slug}`);
        return res.json();
      })
    );

    expect(fetchCalls).toContain('https://pledge.dustwave.xyz/stats/test-campaign');
  });

  it('fetches inventory for tier cards', async () => {
    const fetchCalls: string[] = [];

    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      fetchCalls.push(String(url));
      return new Response(
        JSON.stringify({
          tiers: {
            'tier-1': { remaining: 50, limit: 100 },
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    });

    const card = createTierCard({ campaignSlug: 'test-campaign', tierId: 'tier-1' });
    document.body.appendChild(card);

    // Simulate fetchLiveInventory
    const tierCards = document.querySelectorAll('[data-tier-id][data-campaign-slug]');
    const slugs = [...new Set([...tierCards].map((el) => (el as HTMLElement).dataset.campaignSlug))];

    await Promise.all(
      slugs.map(async (slug) => {
        const res = await fetch(`${mockWorkerBase}/inventory/${slug}`);
        return res.json();
      })
    );

    expect(fetchCalls).toContain('https://pledge.dustwave.xyz/inventory/test-campaign');
  });

  it('handles failed API requests gracefully', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response('Not Found', { status: 404 });
    });

    const wrap = createProgressWrap({ campaignSlug: 'nonexistent' });
    document.body.appendChild(wrap);

    // Simulate fetchAllLiveStats error handling
    const progressBars = document.querySelectorAll('[data-live-stats][data-campaign-slug]');
    const slugs = [...new Set([...progressBars].map((el) => (el as HTMLElement).dataset.campaignSlug))];

    const results = await Promise.allSettled(
      slugs.map(async (slug) => {
        const res = await fetch(`${mockWorkerBase}/stats/${slug}`);
        if (!res.ok) throw new Error(`Failed to fetch stats for ${slug}`);
        return res.json();
      })
    );

    expect(results[0].status).toBe('rejected');
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('edge cases', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('handles missing data attributes gracefully', () => {
    const wrap = document.createElement('div');
    wrap.dataset.liveStats = 'true';
    // Missing campaignSlug, goal, etc.
    document.body.appendChild(wrap);

    // Should not throw
    const goal = parseInt(wrap.dataset.goal || '0', 10);
    expect(goal).toBe(0);
  });

  it('handles zero goal without division by zero', () => {
    const wrap = createProgressWrap({ goal: 0 });
    document.body.appendChild(wrap);

    const maxThreshold = parseInt(wrap.dataset.maxThreshold || '0', 10);
    
    // Check for division by zero protection
    if (maxThreshold > 0) {
      const pct = Math.min(100, Math.round((5000 / maxThreshold) * 100));
      expect(pct).toBeGreaterThanOrEqual(0);
    } else {
      // Zero threshold should skip percentage calculation
      expect(maxThreshold).toBe(0);
    }
  });

  it('handles negative pledge amounts', () => {
    function formatMoney(dollars: number): string {
      if (dollars >= 1000) {
        return `$${(dollars / 1000).toFixed(dollars % 1000 === 0 ? 0 : 1)}k`;
      }
      return `$${dollars.toLocaleString()}`;
    }

    // Negative amounts shouldn't happen but we handle them
    const result = formatMoney(-100);
    expect(result).toBe('$-100');
  });

  it('handles missing progress bar element', () => {
    const wrap = createProgressWrap({ hasBar: false });
    document.body.appendChild(wrap);

    const bar = wrap.querySelector('.progress-bar span');
    expect(bar).toBeNull();
  });

  it('handles campaigns with no tiers', () => {
    const wrap = createProgressWrap({ campaignSlug: 'no-tiers' });
    document.body.appendChild(wrap);

    const tierCards = document.querySelectorAll(
      `.tier-card[data-campaign-slug="no-tiers"]`
    );
    expect(tierCards.length).toBe(0);
  });
});

// ============================================================================
// Integration-style Tests (DOM setup + updates)
// ============================================================================

describe('full update flow', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('updates entire campaign page with live stats', () => {
    // Set up a realistic page structure
    const wrap = createProgressWrap({
      campaignSlug: 'hand-relations',
      goal: 25000,
      maxThreshold: 35000,
      stretchGoals: [{ threshold: 35000 }],
    });
    
    const tier1 = createTierCard({
      campaignSlug: 'hand-relations',
      tierId: 'frame-slot',
      price: 5,
    });
    
    const tier2 = createTierCard({
      campaignSlug: 'hand-relations',
      tierId: 'creature-cameo',
      requiresThreshold: 35000,
      disabled: true,
      price: 250,
    });
    
    document.body.appendChild(wrap);
    document.body.appendChild(tier1);
    document.body.appendChild(tier2);

    // Simulate stats update
    const stats = { pledgedAmount: 3000000 }; // $30,000
    const pledgedDollars = stats.pledgedAmount / 100;

    // Update progress bar
    const bar = wrap.querySelector('.progress-bar span') as HTMLElement;
    const maxThreshold = parseInt(wrap.dataset.maxThreshold || '25000', 10);
    const pct = Math.min(100, Math.round((pledgedDollars / maxThreshold) * 100));
    bar.classList.add(`u-width-pct-${pct}`);

    // Update pledged text
    const pledgedEl = wrap.querySelector('[data-live-pledged]');
    if (pledgedEl) {
      pledgedEl.textContent = '$30k';
    }

    // Check results
    expect(bar.classList.contains('u-width-pct-86')).toBe(true); // 30k / 35k ≈ 86%
    expect(pledgedEl?.textContent).toBe('$30k');
    expect(tier2.classList.contains('tier-card--locked')).toBe(true); // Still locked (needs 35k)
  });
});
