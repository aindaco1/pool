/**
 * Campaign validation utilities
 * 
 * Fetches campaign data from the static site's /api/campaigns.json
 */

import { getScopedConsole } from './logger.js';
import {
  campaignDeadlineDate,
  campaignStartDate,
  isCampaignDeadlinePassed
} from './timezone.js';

let cachedCampaigns = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 1000; // 1 minute
let console = globalThis.console;

function configureCampaignLogging(env) {
  console = getScopedConsole(env, 'campaigns');
}

export function __resetCampaignRuntimeStateForTests() {
  cachedCampaigns = null;
  cacheTime = 0;
}

/**
 * Fetch campaigns from the site
 */
export async function getCampaigns(env) {
  configureCampaignLogging(env);

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
 * Canonical states are 'upcoming', 'live', and 'post'
 * - Legacy 'pre' is normalized to 'upcoming'
 * - If state is 'upcoming' but start_date has passed, treat as 'live'
 * - If state is 'live' but deadline has passed, treat as 'post'
 */
export function getEffectiveState(campaign, env = {}) {
  if (!campaign) return null;
  
  const now = new Date();
  const normalizedState = campaign.state === 'pre' ? 'upcoming' : campaign.state;
  let effectiveState = normalizedState;
  
  // Auto-transition upcoming -> live if start_date has passed in the platform timezone.
  if (effectiveState === 'upcoming' && campaign.start_date) {
    const startDate = campaignStartDate(campaign.start_date, env);
    if (now >= startDate) {
      effectiveState = 'live';
    }
  }
  
  // Auto-transition live -> post if deadline has passed in the platform timezone.
  if (effectiveState === 'live' && campaign.goal_deadline) {
    const deadline = campaignDeadlineDate(campaign.goal_deadline, env);
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

  const effectiveState = getEffectiveState(campaign, env);

  if (effectiveState !== 'live') {
    return { valid: false, error: `Campaign is ${effectiveState}` };
  }

  if (campaign.charged) {
    return { valid: false, error: 'Campaign has already been charged' };
  }

  // Check if deadline passed in the platform timezone.
  if (campaign.goal_deadline) {
    if (isCampaignDeadlinePassed(campaign.goal_deadline, env)) {
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
