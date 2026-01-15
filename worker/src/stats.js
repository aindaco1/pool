/**
 * Campaign Stats - Live pledge totals stored in KV
 * 
 * Maintains running totals that update on every pledge action.
 * Key format: stats:{campaignSlug}
 * 
 * Milestone tracking key format: milestones:{campaignSlug}
 */

/**
 * Get current stats for a campaign
 */
export async function getCampaignStats(env, campaignSlug) {
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

/**
 * Update stats when a pledge is created
 */
export async function addPledgeToStats(env, { campaignSlug, amount, tierId, tierQty = 1, additionalTiers = [] }) {
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
export async function removePledgeFromStats(env, { campaignSlug, amount, tierId, tierQty = 1, supportItems = [], customAmount = 0 }) {
  if (!env.PLEDGES) return;

  const stats = await getCampaignStats(env, campaignSlug);
  
  stats.pledgedAmount = Math.max(0, stats.pledgedAmount - amount);
  stats.pledgeCount = Math.max(0, stats.pledgeCount - 1);
  
  if (tierId && stats.tierCounts[tierId]) {
    stats.tierCounts[tierId] = Math.max(0, stats.tierCounts[tierId] - tierQty);
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
 * Update support item totals in stats
 * @param {Object} supportItems - Array of { id, amount, currentAmount } for items that changed
 */
export async function updateSupportItemStats(env, campaignSlug, supportItems) {
  if (!env.PLEDGES || !supportItems || supportItems.length === 0) return;
  
  const stats = await getCampaignStats(env, campaignSlug);
  
  if (!stats.supportItems) {
    stats.supportItems = {};
  }
  
  for (const item of supportItems) {
    const oldAmount = item.currentAmount || 0;
    const newAmount = item.amount || 0;
    const diff = (newAmount - oldAmount) * 100; // Convert to cents
    
    stats.supportItems[item.id] = (stats.supportItems[item.id] || 0) + diff;
    // Ensure non-negative
    if (stats.supportItems[item.id] < 0) {
      stats.supportItems[item.id] = 0;
    }
  }
  
  stats.updatedAt = new Date().toISOString();
  await env.PLEDGES.put(`stats:${campaignSlug}`, JSON.stringify(stats));
}

/**
 * Recalculate stats from all pledges (for data repair)
 */
export async function recalculateStats(env, campaignSlug) {
  if (!env.PLEDGES) return null;

  const stats = {
    campaignSlug,
    pledgedAmount: 0,
    pledgeCount: 0,
    tierCounts: {},
    supportItems: {},
    updatedAt: new Date().toISOString()
  };

  // List all pledge keys and sum active ones
  const list = await env.PLEDGES.list({ prefix: 'pledge:' });
  
  for (const key of list.keys) {
    const pledge = await env.PLEDGES.get(key.name, { type: 'json' });
    if (pledge && 
        pledge.campaignSlug === campaignSlug && 
        pledge.pledgeStatus !== 'cancelled') {
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
  if (!env.PLEDGES) return {};
  
  const inventory = await env.PLEDGES.get(`tier-inventory:${campaignSlug}`, { type: 'json' });
  return inventory || {};
}

/**
 * Initialize tier inventory from campaign data (call once per campaign or on reset)
 */
export async function initializeTierInventory(env, campaignSlug, tiers) {
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
  
  await env.PLEDGES.put(`tier-inventory:${campaignSlug}`, JSON.stringify(inventory));
  return inventory;
}

/**
 * Claim tier inventory when a pledge is created
 * Auto-initializes inventory from campaign data if not present
 * Returns { success: boolean, remaining?: number, error?: string }
 */
export async function claimTierInventory(env, campaignSlug, tierId, qty = 1, campaign = null) {
  if (!env.PLEDGES || !tierId) return { success: true };
  
  let inventory = await getTierInventory(env, campaignSlug);
  
  // Auto-initialize if inventory doesn't exist or is empty
  if (Object.keys(inventory).length === 0 && campaign?.tiers) {
    console.log('📦 Auto-initializing tier inventory for:', campaignSlug);
    inventory = {};
    for (const tier of campaign.tiers) {
      if (tier.limit_total) {
        inventory[tier.id] = {
          limit: tier.limit_total,
          claimed: 0
        };
        console.log('📦 Initialized tier:', tier.id, 'limit:', tier.limit_total);
      }
    }
    await env.PLEDGES.put(`tier-inventory:${campaignSlug}`, JSON.stringify(inventory));
    console.log('📦 Inventory after init:', JSON.stringify(inventory));
  }
  
  // If tier has no limit, always allow
  console.log('📦 Looking up tierId:', tierId, 'in inventory keys:', Object.keys(inventory));
  if (!inventory[tierId]) {
    console.log('📦 Tier not in inventory, treating as unlimited');
    return { success: true };
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
  if (!env.PLEDGES || !tierId) return;
  
  const inventory = await getTierInventory(env, campaignSlug);
  
  if (!inventory[tierId]) return;
  
  inventory[tierId].claimed = Math.max(0, inventory[tierId].claimed - qty);
  await env.PLEDGES.put(`tier-inventory:${campaignSlug}`, JSON.stringify(inventory));
}

/**
 * Adjust tier inventory when pledge is modified (tier or qty change)
 */
export async function adjustTierInventory(env, campaignSlug, oldTierId, oldQty, newTierId, newQty) {
  if (!env.PLEDGES) return { success: true };
  
  // Release old tier inventory
  if (oldTierId) {
    await releaseTierInventory(env, campaignSlug, oldTierId, oldQty);
  }
  
  // Claim new tier inventory
  if (newTierId) {
    return await claimTierInventory(env, campaignSlug, newTierId, newQty);
  }
  
  return { success: true };
}

/**
 * Recalculate tier inventory from all pledges (for data repair)
 */
export async function recalculateTierInventory(env, campaignSlug, tiers) {
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
  
  // Count claimed from active pledges
  const list = await env.PLEDGES.list({ prefix: 'pledge:' });
  
  for (const key of list.keys) {
    const pledge = await env.PLEDGES.get(key.name, { type: 'json' });
    if (pledge && 
        pledge.campaignSlug === campaignSlug && 
        pledge.pledgeStatus === 'active' &&
        !pledge.charged) {
      
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
  }
  
  await env.PLEDGES.put(`tier-inventory:${campaignSlug}`, JSON.stringify(inventory));
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
  if (!env.PLEDGES) return [];
  
  const sent = await env.PLEDGES.get(`diary-sent:${campaignSlug}`, { type: 'json' });
  return sent || [];
}

/**
 * Mark a diary entry as sent (by date)
 */
export async function markDiarySent(env, campaignSlug, diaryDate) {
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
  if (!env.PLEDGES) return [];
  
  const milestones = await env.PLEDGES.get(`milestones:${campaignSlug}`, { type: 'json' });
  return milestones || [];
}

/**
 * Mark a milestone as sent
 */
export async function markMilestoneSent(env, campaignSlug, milestone) {
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
