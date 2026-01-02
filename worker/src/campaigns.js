/**
 * Campaign validation utilities
 * 
 * Fetches campaign data from the static site's /api/campaigns.json
 */

let cachedCampaigns = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

/**
 * Fetch campaigns from the site
 */
export async function getCampaigns(env) {
  const now = Date.now();
  
  // Return cached if fresh
  if (cachedCampaigns && (now - cacheTime) < CACHE_TTL) {
    return cachedCampaigns;
  }

  try {
    const res = await fetch(`${env.SITE_BASE}/api/campaigns.json`);
    if (!res.ok) {
      console.error('Failed to fetch campaigns:', res.status);
      return cachedCampaigns || { campaigns: [] };
    }
    
    const data = await res.json();
    cachedCampaigns = data;
    cacheTime = now;
    return data;
  } catch (err) {
    console.error('Error fetching campaigns:', err);
    return cachedCampaigns || { campaigns: [] };
  }
}

/**
 * Get a specific campaign by slug
 */
export async function getCampaign(env, slug) {
  const data = await getCampaigns(env);
  return data.campaigns.find(c => c.slug === slug) || null;
}

/**
 * Get the effective state of a campaign based on dates
 * - If state is 'pre' but start_date has passed, treat as 'live'
 * - If state is 'live' but deadline has passed, treat as 'post'
 */
export function getEffectiveState(campaign) {
  if (!campaign) return null;
  
  const now = new Date();
  let effectiveState = campaign.state;
  
  // Auto-transition pre → live if start_date has passed
  if (campaign.state === 'pre' && campaign.start_date) {
    const startDate = new Date(campaign.start_date + 'T00:00:00');
    if (now >= startDate) {
      effectiveState = 'live';
    }
  }
  
  // Auto-transition live → post if deadline has passed (uses MT via deadline helper)
  // Note: This is a simple check; the actual MT logic is in index.js
  if (effectiveState === 'live' && campaign.goal_deadline) {
    const deadline = new Date(campaign.goal_deadline + 'T23:59:59');
    // Add 7 hours for MST (conservative)
    deadline.setHours(deadline.getHours() + 7);
    if (now > deadline) {
      effectiveState = 'post';
    }
  }
  
  return effectiveState;
}

/**
 * Check if a campaign is accepting pledges
 */
export async function isCampaignLive(env, slug) {
  const campaign = await getCampaign(env, slug);
  
  if (!campaign) {
    return { valid: false, error: 'Campaign not found' };
  }

  const effectiveState = getEffectiveState(campaign);

  if (effectiveState !== 'live') {
    return { valid: false, error: `Campaign is ${effectiveState}` };
  }

  if (campaign.charged) {
    return { valid: false, error: 'Campaign has already been charged' };
  }

  // Check if deadline passed (in MT)
  if (campaign.goal_deadline) {
    const deadline = new Date(campaign.goal_deadline + 'T23:59:59');
    // Add 7 hours for MST
    deadline.setHours(deadline.getHours() + 7);
    if (new Date() > deadline) {
      return { valid: false, error: 'Campaign deadline has passed' };
    }
  }

  return { valid: true, campaign };
}

/**
 * Validate a tier for a campaign
 */
export async function validateTier(env, campaignSlug, tierId, amount) {
  const campaign = await getCampaign(env, campaignSlug);
  
  if (!campaign) {
    return { valid: false, error: 'Campaign not found' };
  }

  const tier = campaign.tiers.find(t => t.id === tierId);
  
  if (!tier) {
    return { valid: false, error: 'Tier not found' };
  }

  if (tier.sold_out) {
    return { valid: false, error: 'Tier is sold out' };
  }

  if (tier.remaining !== undefined && tier.remaining <= 0) {
    return { valid: false, error: 'Tier is sold out' };
  }

  if (tier.price && amount && amount < tier.price) {
    return { valid: false, error: 'Amount is less than tier price' };
  }

  return { valid: true, tier };
}
