/**
 * Campaign Stats - Live pledge totals stored in KV
 * 
 * Maintains running totals that update on every pledge action.
 * Key format: stats:{campaignSlug}
 * 
 * Milestone tracking key format: milestones:{campaignSlug}
 */

import { getScopedConsole } from './logger.js';

let console = globalThis.console;

function configureStatsLogging(env) {
  console = getScopedConsole(env, 'stats');
}

/**
 * Get current stats for a campaign
 */
export async function getCampaignStats(env, campaignSlug) {
  configureStatsLogging(env);
  if (!env.PLEDGES) {
    return null;
  }

  const stats = await env.PLEDGES.get(`stats:${campaignSlug}`, { type: 'json' });
  return stats || {
    campaignSlug,
    pledgedAmount: 0,
    pledgeCount: 0,
    tierCounts: {},
    supportItems: {},
    updatedAt: null
  };
}

async function listAllKeys(env, prefix) {
  if (!env.PLEDGES) return [];

  const keys = [];
  let cursor = undefined;
  let listComplete = false;

  while (!listComplete) {
    const page = await env.PLEDGES.list({ prefix, cursor });
    keys.push(...(page.keys || []));
    listComplete = page.list_complete !== false;
    cursor = page.cursor;
  }

  return keys;
}

async function getCampaignOrderIds(env, campaignSlug) {
  if (!env.PLEDGES) return null;
  const index = await env.PLEDGES.get(`campaign-pledges:${campaignSlug}`, { type: 'json' });
  return Array.isArray(index) ? index : null;
}

async function collectActiveCampaignPledges(env, campaignSlug, { repairIndex = false } = {}) {
  if (!env.PLEDGES) {
    return { pledges: [], orderIds: [], repaired: false };
  }

  const indexedOrderIds = await getCampaignOrderIds(env, campaignSlug);
  const pledgeMap = new Map();

  if (Array.isArray(indexedOrderIds) && !repairIndex) {
    for (const orderId of indexedOrderIds) {
      const pledge = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
      if (!pledge || pledge.campaignSlug !== campaignSlug || pledge.pledgeStatus === 'cancelled') {
        continue;
      }
      pledgeMap.set(pledge.orderId, pledge);
    }

    return {
      pledges: indexedOrderIds.map((orderId) => pledgeMap.get(orderId)).filter(Boolean),
      orderIds: indexedOrderIds.filter((orderId) => pledgeMap.has(orderId)),
      repaired: false
    };
  }

  const indexedSorted = Array.isArray(indexedOrderIds) ? [...indexedOrderIds].sort() : [];
  const discoveredOrderIds = [];
  let cursor = undefined;
  let listComplete = false;

  while (!listComplete) {
    const page = await env.PLEDGES.list({ prefix: 'pledge:', cursor });
    for (const key of page.keys || []) {
      const pledge = await env.PLEDGES.get(key.name, { type: 'json' });
      if (!pledge || pledge.campaignSlug !== campaignSlug || pledge.pledgeStatus === 'cancelled') {
        continue;
      }
      discoveredOrderIds.push(pledge.orderId);
      pledgeMap.set(pledge.orderId, pledge);
    }
    listComplete = page.list_complete !== false;
    cursor = page.cursor;
  }

  const repairedOrderIds = Array.from(new Set(discoveredOrderIds)).sort();
  const repaired =
    repairedOrderIds.length !== indexedSorted.length ||
    repairedOrderIds.some((orderId, index) => orderId !== indexedSorted[index]);

  if (repaired) {
    console.warn('🧰 Repairing stale campaign pledge index:', {
      campaignSlug,
      indexedCount: indexedSorted.length,
      discoveredCount: repairedOrderIds.length
    });
    await env.PLEDGES.put(`campaign-pledges:${campaignSlug}`, JSON.stringify(repairedOrderIds));
  }

  return {
    pledges: repairedOrderIds.map((orderId) => pledgeMap.get(orderId)).filter(Boolean),
    orderIds: repairedOrderIds,
    repaired
  };
}

function hasTierInventoryCoordinator(env) {
  return !!env?.TIER_INVENTORY_COORDINATOR;
}

function getTierInventoryCoordinatorStub(env, campaignSlug) {
  const id = env.TIER_INVENTORY_COORDINATOR.idFromName(campaignSlug);
  return env.TIER_INVENTORY_COORDINATOR.get(id);
}

async function callTierInventoryCoordinator(env, campaignSlug, path, payload = {}) {
  const response = await getTierInventoryCoordinatorStub(env, campaignSlug).fetch(
    `https://tier-inventory-coordinator${path}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignSlug, ...payload })
    }
  );

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error || 'Tier inventory coordinator request failed');
  }
  return body;
}

function cloneInventory(inventory = {}) {
  return JSON.parse(JSON.stringify(inventory || {}));
}

function getTierSelectionCounts(selectedTiers = []) {
  const counts = {};
  for (const tierItem of selectedTiers) {
    if (!tierItem?.id || !tierItem?.tier?.limit_total) continue;
    counts[tierItem.id] = (counts[tierItem.id] || 0) + (tierItem.qty || 1);
  }
  return counts;
}

async function buildTierInventorySnapshot(env, campaignSlug, campaign = null) {
  let inventory = await getTierInventory(env, campaignSlug);
  if (Object.keys(inventory).length === 0 && campaign?.tiers) {
    console.log('📦 Recalculating missing tier inventory for:', campaignSlug);
    inventory = await recalculateTierInventory(env, campaignSlug, campaign.tiers) || {};
  }
  return cloneInventory(inventory);
}

async function syncTierInventoryCoordinator(env, campaignSlug, inventory) {
  if (!hasTierInventoryCoordinator(env)) return;
  await callTierInventoryCoordinator(env, campaignSlug, '/replace', {
    inventory: cloneInventory(inventory)
  });
}

/**
 * Update stats when a pledge is created
 */
export async function addPledgeToStats(env, { campaignSlug, amount, tierId, tierQty = 1, additionalTiers = [] }) {
  configureStatsLogging(env);
  if (!env.PLEDGES) return;

  const stats = await getCampaignStats(env, campaignSlug);
  
  stats.pledgedAmount += amount;
  stats.pledgeCount += 1;
  
  if (tierId) {
    stats.tierCounts[tierId] = (stats.tierCounts[tierId] || 0) + tierQty;
  }
  
  // Track additional tier counts
  for (const addTier of additionalTiers) {
    const qty = addTier.qty || 1;
    stats.tierCounts[addTier.id] = (stats.tierCounts[addTier.id] || 0) + qty;
  }
  
  stats.updatedAt = new Date().toISOString();
  
  await env.PLEDGES.put(`stats:${campaignSlug}`, JSON.stringify(stats));
}

/**
 * Update stats when a pledge is cancelled
 */
export async function removePledgeFromStats(env, { campaignSlug, amount, tierId, tierQty = 1, additionalTiers = [], supportItems = [], customAmount = 0 }) {
  configureStatsLogging(env);
  if (!env.PLEDGES) return;

  const stats = await getCampaignStats(env, campaignSlug);
  
  stats.pledgedAmount = Math.max(0, stats.pledgedAmount - amount);
  stats.pledgeCount = Math.max(0, stats.pledgeCount - 1);
  
  if (tierId && stats.tierCounts[tierId]) {
    stats.tierCounts[tierId] = Math.max(0, stats.tierCounts[tierId] - tierQty);
  }

  for (const addTier of additionalTiers) {
    if (addTier?.id && stats.tierCounts[addTier.id]) {
      const qty = addTier.qty || 1;
      stats.tierCounts[addTier.id] = Math.max(0, stats.tierCounts[addTier.id] - qty);
    }
  }
  
  // Remove support item amounts
  if (supportItems && supportItems.length > 0 && stats.supportItems) {
    for (const item of supportItems) {
      if (item.id && stats.supportItems[item.id]) {
        const amountCents = (item.amount || 0) * 100;
        stats.supportItems[item.id] = Math.max(0, stats.supportItems[item.id] - amountCents);
      }
    }
  }
  
  // Remove custom amount
  if (customAmount > 0) {
    stats.customAmount = Math.max(0, (stats.customAmount || 0) - customAmount * 100);
  }
  
  stats.updatedAt = new Date().toISOString();
  
  await env.PLEDGES.put(`stats:${campaignSlug}`, JSON.stringify(stats));
}

/**
 * Update stats when a pledge is modified (tier/amount change)
 */
export async function modifyPledgeInStats(env, { 
  campaignSlug, 
  oldAmount, 
  newAmount, 
  oldTierId, 
  newTierId,
  oldTierQty = 1,
  newTierQty = 1
}) {
  configureStatsLogging(env);
  if (!env.PLEDGES) return;

  const stats = await getCampaignStats(env, campaignSlug);
  
  // Update amount
  stats.pledgedAmount = Math.max(0, stats.pledgedAmount - oldAmount + newAmount);
  
  // Update tier counts
  if (oldTierId && stats.tierCounts[oldTierId]) {
    stats.tierCounts[oldTierId] = Math.max(0, stats.tierCounts[oldTierId] - oldTierQty);
  }
  if (newTierId) {
    stats.tierCounts[newTierId] = (stats.tierCounts[newTierId] || 0) + newTierQty;
  }
  
  stats.updatedAt = new Date().toISOString();
  
  await env.PLEDGES.put(`stats:${campaignSlug}`, JSON.stringify(stats));
}

/**
 * Replace support item totals in stats using the previous and next pledge state.
 */
export async function updateSupportItemStats(env, campaignSlug, previousItems = [], nextItems = []) {
  configureStatsLogging(env);
  if (!env.PLEDGES) return;
  
  const stats = await getCampaignStats(env, campaignSlug);
  
  if (!stats.supportItems) {
    stats.supportItems = {};
  }

  const previousMap = new Map();
  const nextMap = new Map();

  for (const item of previousItems || []) {
    if (item?.id) {
      previousMap.set(item.id, item.amount || 0);
    }
  }

  for (const item of nextItems || []) {
    if (item?.id) {
      nextMap.set(item.id, item.amount || 0);
    }
  }

  const itemIds = new Set([...previousMap.keys(), ...nextMap.keys()]);
  for (const itemId of itemIds) {
    const oldAmount = previousMap.get(itemId) || 0;
    const newAmount = nextMap.get(itemId) || 0;
    const diff = (newAmount - oldAmount) * 100;
    if (diff === 0) continue;

    stats.supportItems[itemId] = (stats.supportItems[itemId] || 0) + diff;
    if (stats.supportItems[itemId] < 0) {
      stats.supportItems[itemId] = 0;
    }
  }
  
  stats.updatedAt = new Date().toISOString();
  await env.PLEDGES.put(`stats:${campaignSlug}`, JSON.stringify(stats));
}

/**
 * Recalculate stats from all pledges (for data repair)
 */
export async function recalculateStats(env, campaignSlug, options = {}) {
  configureStatsLogging(env);
  if (!env.PLEDGES) return null;

  const stats = {
    campaignSlug,
    pledgedAmount: 0,
    pledgeCount: 0,
    tierCounts: {},
    supportItems: {},
    updatedAt: new Date().toISOString()
  };

  const { pledges } = await collectActiveCampaignPledges(env, campaignSlug, options);

  for (const pledge of pledges) {
    // Use subtotal (pre-tax) for goal tracking, fall back to amount for older pledges
    stats.pledgedAmount += pledge.subtotal || pledge.amount || 0;
    stats.pledgeCount += 1;

    if (pledge.tierId) {
      const qty = pledge.tierQty || 1;
      stats.tierCounts[pledge.tierId] = (stats.tierCounts[pledge.tierId] || 0) + qty;
    }

    // Count additional tiers
    if (pledge.additionalTiers) {
      for (const addTier of pledge.additionalTiers) {
        const qty = addTier.qty || 1;
        stats.tierCounts[addTier.id] = (stats.tierCounts[addTier.id] || 0) + qty;
      }
    }

    // Sum support item contributions
    if (pledge.supportItems) {
      for (const item of pledge.supportItems) {
        const amountCents = (item.amount || 0) * 100;
        stats.supportItems[item.id] = (stats.supportItems[item.id] || 0) + amountCents;
      }
    }
  }

  await env.PLEDGES.put(`stats:${campaignSlug}`, JSON.stringify(stats));
  return stats;
}

/**
 * Tier Inventory - Track remaining quantities for limited tiers
 * Key format: tier-inventory:{campaignSlug}
 * 
 * Structure: { tierId: { limit: number, claimed: number } }
 */

/**
 * Get tier inventory for a campaign
 */
export async function getTierInventory(env, campaignSlug) {
  configureStatsLogging(env);
  if (!env.PLEDGES) return {};
  
  const inventory = await env.PLEDGES.get(`tier-inventory:${campaignSlug}`, { type: 'json' });
  return inventory || {};
}

/**
 * Initialize tier inventory from campaign data (call once per campaign or on reset)
 */
export async function initializeTierInventory(env, campaignSlug, tiers) {
  configureStatsLogging(env);
  if (!env.PLEDGES) return;
  
  const inventory = {};
  for (const tier of tiers) {
    if (tier.limit_total) {
      inventory[tier.id] = {
        limit: tier.limit_total,
        claimed: 0
      };
    }
  }
  
  if (hasTierInventoryCoordinator(env)) {
    await syncTierInventoryCoordinator(env, campaignSlug, inventory);
  } else {
    await env.PLEDGES.put(`tier-inventory:${campaignSlug}`, JSON.stringify(inventory));
  }
  return inventory;
}

/**
 * Claim tier inventory when a pledge is created
 * Auto-initializes inventory from campaign data if not present
 * Returns { success: boolean, remaining?: number, error?: string }
 */
export async function claimTierInventory(env, campaignSlug, tierId, qty = 1, campaign = null) {
  configureStatsLogging(env);
  if (!env.PLEDGES || !tierId) return { success: true };

  const inventory = await buildTierInventorySnapshot(env, campaignSlug, campaign);
  const campaignTier = campaign?.tiers?.find(t => t.id === tierId) || null;
  
  if (!inventory[tierId]) {
    if (campaignTier?.limit_total) {
      return {
        success: false,
        error: 'Limited tier inventory is unavailable'
      };
    }
    return { success: true };
  }

  if (hasTierInventoryCoordinator(env)) {
    return callTierInventoryCoordinator(env, campaignSlug, '/claim', {
      tierId,
      qty,
      inventory
    });
  }

  const tierInv = inventory[tierId];
  const remaining = tierInv.limit - tierInv.claimed;

  if (qty > remaining) {
    return {
      success: false,
      error: `Only ${remaining} remaining for this tier`,
      remaining
    };
  }

  tierInv.claimed += qty;
  await env.PLEDGES.put(`tier-inventory:${campaignSlug}`, JSON.stringify(inventory));

  return {
    success: true,
    remaining: tierInv.limit - tierInv.claimed
  };
}

/**
 * Release tier inventory when a pledge is cancelled or tier changed
 */
export async function releaseTierInventory(env, campaignSlug, tierId, qty = 1) {
  configureStatsLogging(env);
  if (!env.PLEDGES || !tierId) return;

  const inventory = cloneInventory(await getTierInventory(env, campaignSlug));

  if (!inventory[tierId]) return;

  if (hasTierInventoryCoordinator(env)) {
    await callTierInventoryCoordinator(env, campaignSlug, '/release', {
      tierId,
      qty,
      inventory
    });
    return;
  }

  inventory[tierId].claimed = Math.max(0, inventory[tierId].claimed - qty);
  await env.PLEDGES.put(`tier-inventory:${campaignSlug}`, JSON.stringify(inventory));
}

/**
 * Adjust tier inventory when pledge is modified (tier or qty change)
 */
export async function adjustTierInventory(env, campaignSlug, oldTierId, oldQty, newTierId, newQty, campaign = null) {
  configureStatsLogging(env);
  if (!env.PLEDGES) return { success: true };
  
  // Release old tier inventory
  if (oldTierId) {
    await releaseTierInventory(env, campaignSlug, oldTierId, oldQty);
  }
  
  // Claim new tier inventory
  if (newTierId) {
    return await claimTierInventory(env, campaignSlug, newTierId, newQty, campaign);
  }
  
  return { success: true };
}

export async function claimTierSelectionInventory(env, campaignSlug, selectedTiers = [], campaign = null) {
  configureStatsLogging(env);
  if (!env.PLEDGES) return { success: true, claimedTiers: [] };

  if (hasTierInventoryCoordinator(env)) {
    const inventory = await buildTierInventorySnapshot(env, campaignSlug, campaign);
    const nextCounts = getTierSelectionCounts(selectedTiers);
    const result = await callTierInventoryCoordinator(env, campaignSlug, '/claim-selection', {
      nextCounts,
      inventory
    });
    return {
      success: result.success,
      error: result.error,
      remaining: result.remaining,
      claimedTiers: selectedTiers
        .filter((tierItem) => tierItem?.tier?.limit_total)
        .map((tierItem) => ({ id: tierItem.id, qty: tierItem.qty }))
    };
  }

  const claimedTiers = [];
  try {
    for (const tierItem of selectedTiers) {
      const claimResult = await claimTierInventory(env, campaignSlug, tierItem.id, tierItem.qty, campaign);
      if (!claimResult.success) {
        throw new Error(claimResult.error || `Failed to claim inventory for tier "${tierItem.id}"`);
      }
      claimedTiers.push({ id: tierItem.id, qty: tierItem.qty });
    }
    return { success: true, claimedTiers };
  } catch (err) {
    for (const claimedTier of claimedTiers) {
      await releaseTierInventory(env, campaignSlug, claimedTier.id, claimedTier.qty);
    }
    return { success: false, error: err.message };
  }
}

export async function applyTierInventorySelectionChanges(env, campaignSlug, campaign, previousSelection = [], nextSelection = []) {
  configureStatsLogging(env);
  if (!env.PLEDGES) return { success: true };

  if (hasTierInventoryCoordinator(env)) {
    const inventory = await buildTierInventorySnapshot(env, campaignSlug, campaign);
    return callTierInventoryCoordinator(env, campaignSlug, '/apply-selection', {
      previousCounts: getTierSelectionCounts(previousSelection),
      nextCounts: getTierSelectionCounts(nextSelection),
      inventory
    });
  }

  const previousCounts = getTierSelectionCounts(previousSelection);
  const nextCounts = getTierSelectionCounts(nextSelection);
  const claimedAdditions = [];

  try {
    for (const [tierId, nextQty] of Object.entries(nextCounts)) {
      const previousQty = previousCounts[tierId] || 0;
      if (nextQty > previousQty) {
        const delta = nextQty - previousQty;
        const claimResult = await claimTierInventory(env, campaignSlug, tierId, delta, campaign);
        if (!claimResult.success) {
          throw new Error(claimResult.error || `Failed to claim inventory for tier "${tierId}"`);
        }
        claimedAdditions.push({ id: tierId, qty: delta });
      }
    }

    for (const [tierId, previousQty] of Object.entries(previousCounts)) {
      const nextQty = nextCounts[tierId] || 0;
      if (nextQty < previousQty) {
        await releaseTierInventory(env, campaignSlug, tierId, previousQty - nextQty);
      }
    }

    return { success: true };
  } catch (err) {
    for (const claimedTier of claimedAdditions) {
      await releaseTierInventory(env, campaignSlug, claimedTier.id, claimedTier.qty);
    }
    return { success: false, error: err.message };
  }
}

/**
 * Recalculate tier inventory from all pledges (for data repair)
 */
export async function recalculateTierInventory(env, campaignSlug, tiers, options = {}) {
  configureStatsLogging(env);
  if (!env.PLEDGES) return null;
  
  // Initialize with limits from campaign tiers
  const inventory = {};
  for (const tier of tiers) {
    if (tier.limit_total) {
      inventory[tier.id] = {
        limit: tier.limit_total,
        claimed: 0
      };
    }
  }
  
  const { pledges } = await collectActiveCampaignPledges(env, campaignSlug, options);

  for (const pledge of pledges) {
    if (pledge.pledgeStatus !== 'active' || pledge.charged) {
      continue;
    }

    // Main tier
    if (pledge.tierId && inventory[pledge.tierId]) {
      inventory[pledge.tierId].claimed += pledge.tierQty || 1;
    }

    // Additional tiers (multi-tier mode)
    if (pledge.additionalTiers) {
      for (const addTier of pledge.additionalTiers) {
        if (inventory[addTier.id]) {
          inventory[addTier.id].claimed += addTier.qty || 1;
        }
      }
    }
  }
  
  if (hasTierInventoryCoordinator(env)) {
    await syncTierInventoryCoordinator(env, campaignSlug, inventory);
  } else {
    await env.PLEDGES.put(`tier-inventory:${campaignSlug}`, JSON.stringify(inventory));
  }
  return inventory;
}

/**
 * Diary Tracking - Track which diary entries have been broadcast
 * Key format: diary-sent:{campaignSlug}
 * Value: array of diary dates (YYYY-MM-DD strings)
 */

/**
 * Get list of diary entry dates that have been broadcast for a campaign
 */
export async function getSentDiaryEntries(env, campaignSlug) {
  configureStatsLogging(env);
  if (!env.PLEDGES) return [];
  
  const sent = await env.PLEDGES.get(`diary-sent:${campaignSlug}`, { type: 'json' });
  return sent || [];
}

/**
 * Mark a diary entry as sent (by date)
 */
export async function markDiarySent(env, campaignSlug, diaryDate) {
  configureStatsLogging(env);
  if (!env.PLEDGES) return;
  
  const sent = await getSentDiaryEntries(env, campaignSlug);
  if (!sent.includes(diaryDate)) {
    sent.push(diaryDate);
    await env.PLEDGES.put(`diary-sent:${campaignSlug}`, JSON.stringify(sent));
  }
}

/**
 * Milestone Tracking - Track which milestone emails have been sent
 * Key format: milestones:{campaignSlug}
 */

const MILESTONE_THRESHOLDS = {
  'one-third': 0.33,
  'two-thirds': 0.66,
  'goal': 1.0
};

/**
 * Get stretch goal milestones from campaign data
 * Returns array of { id: 'stretch:threshold', threshold: amountCents, name: title }
 */
export function getStretchGoalMilestones(campaign) {
  if (!campaign?.stretch_goals || !Array.isArray(campaign.stretch_goals)) {
    return [];
  }
  
  return campaign.stretch_goals.map(sg => ({
    id: `stretch:${sg.threshold}`,
    threshold: sg.threshold * 100, // Convert to cents
    name: sg.title
  }));
}

/**
 * Get sent milestones for a campaign
 */
export async function getSentMilestones(env, campaignSlug) {
  configureStatsLogging(env);
  if (!env.PLEDGES) return [];
  
  const milestones = await env.PLEDGES.get(`milestones:${campaignSlug}`, { type: 'json' });
  return milestones || [];
}

/**
 * Mark a milestone as sent
 */
export async function markMilestoneSent(env, campaignSlug, milestone) {
  configureStatsLogging(env);
  if (!env.PLEDGES) return;
  
  const sent = await getSentMilestones(env, campaignSlug);
  if (!sent.includes(milestone)) {
    sent.push(milestone);
    await env.PLEDGES.put(`milestones:${campaignSlug}`, JSON.stringify(sent));
  }
}

/**
 * Check which milestones should be triggered based on current funding
 * Returns milestones that have been crossed but not yet sent
 * 
 * Logic for percentage milestones (one-third, two-thirds):
 * - If multiple crossed at once, only send the highest one (skip intermediates)
 * - Always send 'goal' when crossed
 * - Example: if one-third + two-thirds crossed together, only send two-thirds
 * - Example: if one-third + goal crossed together, only send goal
 * 
 * For stretch goals:
 * - Always send when crossed (never skip)
 * - If stretch_hidden is true, only trigger when previous threshold is met:
 *   - First stretch goal: requires main goal to be met (or sent)
 *   - Subsequent stretch goals: require previous stretch goal to be met (or sent)
 * 
 * For standard milestones: returns milestone name string ('one-third', 'two-thirds', 'goal')
 * For stretch goals: returns object { type: 'stretch', id: 'stretch:threshold', name: 'Goal Title' }
 */
export async function checkMilestones(env, campaignSlug, pledgedAmount, goalAmount, campaign = null) {
  configureStatsLogging(env);
  if (!env.PLEDGES || !goalAmount || goalAmount <= 0) return [];
  
  const progress = pledgedAmount / goalAmount;
  const sent = await getSentMilestones(env, campaignSlug);
  const newMilestones = [];
  
  console.log('🎯 checkMilestones:', { campaignSlug, pledgedAmount, goalAmount, progress: `${(progress * 100).toFixed(1)}%`, sent });
  
  // Check standard percentage milestones
  const pendingPercentageMilestones = [];
  for (const [milestone, threshold] of Object.entries(MILESTONE_THRESHOLDS)) {
    if (progress >= threshold && !sent.includes(milestone)) {
      pendingPercentageMilestones.push(milestone);
    }
  }
  
  // Filter percentage milestones: skip intermediates if higher ones are also pending
  // Always include 'goal', only include the highest of one-third/two-thirds
  if (pendingPercentageMilestones.includes('goal')) {
    // Goal is pending - always add it, skip one-third and two-thirds
    newMilestones.push('goal');
  } else if (pendingPercentageMilestones.includes('two-thirds')) {
    // Two-thirds is highest pending - add it, skip one-third
    newMilestones.push('two-thirds');
  } else if (pendingPercentageMilestones.includes('one-third')) {
    // One-third is the only pending percentage milestone
    newMilestones.push('one-third');
  }
  
  // Check stretch goals if campaign data provided
  if (campaign) {
    const stretchGoals = getStretchGoalMilestones(campaign);
    const stretchHidden = campaign.stretch_hidden !== false; // default true if not specified
    
    console.log('🎯 Stretch goals check:', { stretchGoals, stretchHidden });
    
    // Sort stretch goals by threshold to check unlock order
    const sortedStretchGoals = [...stretchGoals].sort((a, b) => a.threshold - b.threshold);
    
    for (let i = 0; i < sortedStretchGoals.length; i++) {
      const sg = sortedStretchGoals[i];
      
      // Skip if not reached or already sent
      if (pledgedAmount < sg.threshold || sent.includes(sg.id)) {
        console.log('🎯 Stretch goal skipped:', { id: sg.id, threshold: sg.threshold, pledgedAmount, alreadySent: sent.includes(sg.id) });
        continue;
      }
      
      // Check if this stretch goal is "unlocked" (visible to supporters)
      let isUnlocked = true;
      if (stretchHidden) {
        if (i === 0) {
          // First stretch goal: requires main goal to be met or already sent
          isUnlocked = progress >= 1.0 || sent.includes('goal');
        } else {
          // Subsequent stretch goals: require previous stretch goal to be met or sent
          const prevSg = sortedStretchGoals[i - 1];
          isUnlocked = pledgedAmount >= prevSg.threshold || sent.includes(prevSg.id);
        }
      }
      
      if (isUnlocked) {
        newMilestones.push({
          type: 'stretch',
          id: sg.id,
          name: sg.name
        });
      }
    }
  }
  
  return newMilestones;
}
