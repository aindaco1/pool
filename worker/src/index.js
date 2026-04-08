/**
 * The Pool - Pledge Worker
 * 
 * Routes:
 *   POST /checkout-intent/start - Create Stripe Checkout from first-party cart state
 *   GET  /checkout-intent/summary - Fetch first-party success summary data
 *   GET  /checkout-intent/recovery - Fetch campaign recovery state for cancelled result flow
 *   POST /webhooks/stripe    - Handle Stripe webhooks
 *   GET  /pledge             - Get single pledge details (legacy)
 *   GET  /pledges            - Get all pledges for user
 *   POST /pledge/cancel      - Cancel a pledge
 *   POST /pledge/modify      - Modify pledge tier/amount
 *   POST /pledge/payment-method/start - Update payment method
 *   GET  /votes              - Get voting status
 *   POST /votes              - Cast a vote
 *   GET  /live/:slug         - Get combined live stats + inventory for a campaign
 *   GET  /stats/:slug        - Get live pledge stats for a campaign
 *   POST /stats/:slug/recalculate - Recalculate stats from KV (admin)
 *   GET  /inventory/:slug    - Get tier inventory (remaining counts) for a campaign
 *   POST /inventory/:slug/recalculate - Recalculate tier inventory from pledges (admin)
 *   POST /admin/inventory/init-all    - Initialize inventory for all campaigns (admin)
 *   POST /admin/rebuild      - Trigger GitHub Pages rebuild (admin)
 *   POST /admin/broadcast/announcement - Send announcement with CTA link to campaign supporters
 *   POST /admin/broadcast/diary     - Send diary update to all campaign supporters
 *   POST /admin/diary/check         - Check all campaigns for new diary entries and broadcast
 *   POST /admin/broadcast/milestone - Send milestone notification to all campaign supporters
 *   POST /admin/milestone-check/:slug - Check and trigger any pending milestones for a campaign
 *   POST /admin/settle/:slug        - Settle campaign: charge pledges if funded + deadline passed
 *   POST /admin/settle-batch        - Settle specific pledges by order ID (batched, max 6)
 *   POST /admin/settle-dispatch/:slug - Dispatch batched settlement (self-chains until complete)
 *   POST /admin/backfill-customers/:slug - Create Stripe customers for pledges missing them
 *   POST /admin/campaign-index/rebuild/:slug - Rebuild campaign pledge index from KV
 *   GET  /admin/cron/status         - Check cron heartbeat status
 *   POST /admin/recover-checkout   - Recover missed Stripe webhook (creates pledge from session)
 *   POST /test/setup         - Create test pledges (test mode only)
 *   POST /test/cleanup       - Remove test pledges (test mode only)
 *   POST /test/email         - Test individual email sends (test mode only)
 */

import { generateToken, verifyToken } from './token.js';
import { sendSupporterEmail, sendPaymentFailedEmail, sendPledgeModifiedEmail, sendPledgeCancelledEmail, sendDiaryUpdateEmail, sendMilestoneEmail, sendChargeSuccessEmail, sendAnnouncementEmail } from './email.js';
import { handleGetVotes, handlePostVote } from './routes/votes.js';
import { verifyStripeSignature, createStripeClient } from './stripe.js';
import { isCampaignLive, getCampaign, getCampaigns, getEffectiveState } from './campaigns.js';
import { getCampaignStats, addPledgeToStats, removePledgeFromStats, recalculateStats, getTierInventory, claimTierInventory, releaseTierInventory, recalculateTierInventory, checkMilestones, markMilestoneSent, getSentMilestones, updateSupportItemStats, getSentDiaryEntries, markDiarySent, claimTierSelectionInventory, applyTierInventorySelectionChanges } from './stats.js';
import { triggerSiteRebuild } from './github.js';
import { isValidSlug, isValidEmail, isValidAmount, SECURITY_HEADERS, getAllowedOrigin } from './validation.js';
import { DEFAULT_PLATFORM_TIP_PERCENT, calculatePlatformTip, derivePlatformTipPercent, sanitizePlatformTipPercent } from './tip.js';
import { hashCheckoutContribution, hashCheckoutBundle, buildCheckoutHashInput, buildCheckoutBundleHashInput, CHECKOUT_INTENT_VERSION, DEFAULT_CHECKOUT_INTENT_TTL_SECONDS } from './checkout-intent.js';
import { getCheckoutProvider, getFlatShippingFeeCents, getSalesTaxRate } from './provider-config.js';
export { CheckoutIntentNonceCoordinator } from './checkout-intent-do.js';
export { TierInventoryCoordinator } from './tier-inventory-do.js';

// Rate limit delay for Resend API (2 req/sec limit)
const RESEND_RATE_LIMIT_DELAY = 600; // ms between emails

// Extract plain text excerpt from diary entry (supports both legacy body and content blocks)
function getDiaryExcerpt(entry, maxLength = 200) {
  // Legacy: plain text body
  if (entry.body && typeof entry.body === 'string') {
    return entry.body.slice(0, maxLength);
  }
  
  // New: content blocks array
  if (entry.content && Array.isArray(entry.content)) {
    const textParts = [];
    for (const block of entry.content) {
      if (block.type === 'text' && block.body) {
        // Strip basic markdown formatting for email excerpt
        const plainText = block.body
          .replace(/\*\*([^*]+)\*\*/g, '$1')  // bold
          .replace(/\*([^*]+)\*/g, '$1')       // italic
          .replace(/_([^_]+)_/g, '$1')         // italic
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // links
          .replace(/^#+\s*/gm, '')              // headers
          .replace(/\n+/g, ' ')                 // newlines to spaces
          .trim();
        textParts.push(plainText);
      } else if (block.type === 'quote' && block.text) {
        textParts.push(`"${block.text}"`);
      }
    }
    const combined = textParts.join(' ').trim();
    if (combined.length > maxLength) {
      return combined.slice(0, maxLength) + '…';
    }
    return combined;
  }
  
  return '';
}

// SEC-006: Timing-safe string comparison to prevent timing attacks
function timingSafeEqual(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
  }

  // Campaign pledge index helpers - maintain per-campaign list of order IDs
  function getCampaignIndexKey(campaignSlug) {
  return `campaign-pledges:${campaignSlug}`;
  }

  async function getCampaignOrderIds(env, campaignSlug) {
  if (!env.PLEDGES) return null;
  const orderIds = await env.PLEDGES.get(getCampaignIndexKey(campaignSlug), { type: 'json' });
  return Array.isArray(orderIds) ? orderIds : null;
  }

  async function addToCampaignIndex(env, campaignSlug, orderId) {
  if (!env.PLEDGES) return;
  const key = getCampaignIndexKey(campaignSlug);
  const index = await getCampaignOrderIds(env, campaignSlug) || [];
  if (!index.includes(orderId)) {
   index.push(orderId);
   await env.PLEDGES.put(key, JSON.stringify(index));
  }
  }

  async function removeFromCampaignIndex(env, campaignSlug, orderId) {
  if (!env.PLEDGES) return;
  const key = getCampaignIndexKey(campaignSlug);
  const index = await getCampaignOrderIds(env, campaignSlug) || [];
  const filtered = index.filter(id => id !== orderId);
  if (filtered.length === index.length) {
    return;
  }
  if (filtered.length === 0) {
    await env.PLEDGES.delete(key);
    return;
  }
  await env.PLEDGES.put(key, JSON.stringify(filtered));
  }

  async function listAllPledgeKeys(env) {
  if (!env.PLEDGES) return [];
  const keys = [];
  let cursor = undefined;
  do {
    const page = await env.PLEDGES.list({ prefix: 'pledge:', cursor });
    keys.push(...(page.keys || []));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return keys;
  }

function getSettlementNeedsAttention(batchResult = {}) {
  const details = Array.isArray(batchResult.details) ? batchResult.details : [];
  const skippedNeedingAttention = details.filter(detail =>
    detail?.status === 'not_found' || detail?.status === 'missing_stripe_ids'
  ).length;
  return {
    skippedNeedingAttention,
    unresolved: (batchResult.failed || 0) + skippedNeedingAttention
  };
  }

function getAppMode(env = {}) {
  return String(env.APP_MODE || env.SNIPCART_MODE || 'live').trim().toLowerCase() === 'test'
    ? 'test'
    : 'live';
}

  async function finalizeSettlementDispatch(env, campaignSlug, jobKey, job) {
  const needsAttention = (job.totalNeedsAttention || 0) > 0;
  job.status = needsAttention ? 'needs_attention' : 'done';
  job.completedAt = Date.now();
  await env.PLEDGES.put(jobKey, JSON.stringify(job), { expirationTtl: 604800 });
  if (!needsAttention) {
    await env.PLEDGES.put(`campaign-charged:${campaignSlug}`, new Date().toISOString());
  }
  return { needsAttention };
  }

  // SEC-005: Rate limiting helper
// Returns { allowed: true } or { allowed: false, response: Response }
async function checkRateLimit(request, env, options = {}) {
  const {
    prefix = 'ratelimit',
    limit = 60,
    windowSeconds = 60,
    keyFn = null
  } = options;
  
  // Skip if RATELIMIT KV not configured
  if (!env.RATELIMIT) {
    return { allowed: true };
  }
  
  const ip = request.headers.get('CF-Connecting-IP') || 
             request.headers.get('X-Forwarded-For')?.split(',')[0] || 
             'unknown';
  const key = keyFn ? `${prefix}:${keyFn(request)}` : `${prefix}:${ip}`;
  
  try {
    const now = Math.floor(Date.now() / 1000);
    const record = await env.RATELIMIT.get(key, { type: 'json' }) || { count: 0, reset: now + windowSeconds };
    
    // Reset window if expired
    if (now > record.reset) {
      record.count = 0;
      record.reset = now + windowSeconds;
    }

    // Once a client is already over limit inside the current window,
    // fail closed without rewriting the same counter on every blocked hit.
    if (record.count >= limit) {
      const retryAfter = Math.max(0, record.reset - now);
      return {
        allowed: false,
        response: new Response(JSON.stringify({
          error: 'Too many requests',
          retryAfter
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(record.reset)
          }
        })
      };
    }
    
    record.count++;
    
    // Store updated count
    await env.RATELIMIT.put(key, JSON.stringify(record), { 
      expirationTtl: windowSeconds + 10 
    });
    
    if (record.count > limit) {
      const retryAfter = record.reset - now;
      return {
        allowed: false,
        response: new Response(JSON.stringify({ 
          error: 'Too many requests',
          retryAfter 
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(record.reset)
          }
        })
      };
    }
    
    return { 
      allowed: true,
      remaining: limit - record.count,
      reset: record.reset
    };
  } catch (err) {
    console.error('Rate limit check failed:', err);
    // Fail open on error (don't block requests if KV fails)
    return { allowed: true };
  }
}

// Rate limit configurations for different endpoint types
const RATE_LIMITS = {
  start: { prefix: 'rl:start', limit: 20, windowSeconds: 60 },      // 20 pledges/min
  votes: { prefix: 'rl:votes', limit: 30, windowSeconds: 60 },      // 30 votes/min
  admin: { prefix: 'rl:admin', limit: 5, windowSeconds: 60 },       // 5 admin calls/min
  pledge: { prefix: 'rl:pledge', limit: 20, windowSeconds: 60 },    // 20 pledge ops/min
  webhook: { prefix: 'rl:webhook', limit: 100, windowSeconds: 60 }  // 100 webhooks/min
};

// SEC-006: Admin authentication helper with timing-safe comparison
function requireAdmin(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const adminKey = request.headers.get('x-admin-key') || '';
  
  if (!env.ADMIN_SECRET) {
    console.error('CRITICAL: ADMIN_SECRET not configured');
    return { ok: false, response: jsonResponse({ error: 'Admin not configured' }, 500) };
  }
  
  // Check Bearer token in Authorization header
  const bearerToken = authHeader.replace('Bearer ', '');
  if (bearerToken && timingSafeEqual(bearerToken, env.ADMIN_SECRET)) {
    return { ok: true };
  }
  
  // Check x-admin-key header
  if (adminKey && timingSafeEqual(adminKey, env.ADMIN_SECRET)) {
    return { ok: true };
  }
  
  return { ok: false, response: jsonResponse({ error: 'Unauthorized' }, 401) };
}

// Mountain Time offset: -7 hours (MST) or -6 hours (MDT)
// Returns deadline as end of day (23:59:59) in Mountain Time, DST-aware
function getMTOffset(dateString) {
  // Use Intl to determine if a date falls in MST (-7) or MDT (-6)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    timeZoneName: 'short'
  });
  // Check the target date at noon to avoid edge cases
  const [year, month, day] = dateString.split('-').map(Number);
  const parts = fmt.formatToParts(new Date(Date.UTC(year, month - 1, day, 19, 0, 0))); // noon MT ≈ 19:00 UTC
  const tzName = parts.find(p => p.type === 'timeZoneName')?.value;
  return tzName === 'MDT' ? 6 : 7;
}

function getDeadlineMT(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const offset = getMTOffset(dateString);
  // End of day in MT = 23:59:59 MT = next day (23+offset):59:59 UTC
  return new Date(Date.UTC(year, month - 1, day, 23 + offset, 59, 59));
}

// Check if we're past the deadline in Mountain Time
function isDeadlinePassed(dateString) {
  const deadline = getDeadlineMT(dateString);
  return new Date() > deadline;
}

function calculateTax(env, subtotalCents) {
  return Math.round(subtotalCents * getSalesTaxRate(env));
}

function calculateTotalWithTax(env, subtotalCents) {
  return subtotalCents + calculateTax(env, subtotalCents);
}

function getStoredTipPercent(pledgeData, fallback = 0) {
  if (!pledgeData) return fallback;
  return sanitizePlatformTipPercent(pledgeData.tipPercent, fallback);
}

function getStoredTipAmount(pledgeData) {
  if (!pledgeData) return 0;
  if (typeof pledgeData.tipAmount === 'number') {
    return pledgeData.tipAmount;
  }
  const subtotal = pledgeData.subtotal ?? pledgeData.amount ?? 0;
  return calculatePlatformTip(subtotal, getStoredTipPercent(pledgeData, 0));
}

function buildPledgeTotals(env, subtotalCents, { shipping = 0, tipPercent = DEFAULT_PLATFORM_TIP_PERCENT } = {}) {
  const normalizedSubtotal = Math.max(0, Number(subtotalCents) || 0);
  const normalizedShipping = Math.max(0, Number(shipping) || 0);
  const normalizedTipPercent = sanitizePlatformTipPercent(tipPercent, DEFAULT_PLATFORM_TIP_PERCENT);
  const tax = calculateTax(env, normalizedSubtotal);
  const tipAmount = calculatePlatformTip(normalizedSubtotal, normalizedTipPercent);
  return {
    subtotal: normalizedSubtotal,
    tax,
    shipping: normalizedShipping,
    tipPercent: normalizedTipPercent,
    tipAmount,
    amount: normalizedSubtotal + tax + normalizedShipping + tipAmount
  };
}

function normalizeTierId(rawTierId) {
  if (typeof rawTierId !== 'string' || rawTierId.length === 0) return null;
  return rawTierId.split('__').pop();
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function buildSupportItemDefinitionMap(campaign) {
  return new Map((campaign?.support_items || []).map(item => [item.id, item]));
}

function getSupportItemsWithLabels(campaign, supportItems = []) {
  const supportItemMap = buildSupportItemDefinitionMap(campaign);
  return supportItems.map(item => ({
    ...item,
    label: supportItemMap.get(item.id)?.label || item.id
  }));
}

function getPledgeTierSelections(pledge, campaign) {
  const selectedTiers = [];
  const allTiers = [];

  if (pledge?.tierId) {
    allTiers.push({ id: pledge.tierId, qty: pledge.tierQty || 1 });
  }

  for (const addTier of pledge?.additionalTiers || []) {
    allTiers.push({ id: addTier.id, qty: addTier.qty || 1 });
  }

  const seen = new Set();
  for (const tierItem of allTiers) {
    const canonicalTierId = normalizeTierId(tierItem.id);
    if (!canonicalTierId || seen.has(canonicalTierId)) continue;

    const tier = campaign?.tiers?.find(entry => entry.id === canonicalTierId);
    if (!tier) {
      return { valid: false, error: `Tier "${canonicalTierId}" not found` };
    }

    const qty = tierItem.qty || 1;
    if (!isPositiveInteger(qty)) {
      return { valid: false, error: `Invalid quantity for tier "${canonicalTierId}"` };
    }

    selectedTiers.push({ id: canonicalTierId, qty, tier });
    seen.add(canonicalTierId);
  }

  return finalizeTierSelection(selectedTiers);
}

function finalizeTierSelection(selectedTiers) {
  const normalizedSelections = selectedTiers.map(entry => ({
    id: normalizeTierId(entry.id),
    qty: entry.qty,
    tier: entry.tier
  }));

  if (normalizedSelections.length === 0) {
    return {
      valid: true,
      selectedTiers: [],
      tierId: null,
      tierName: null,
      tierQty: 0,
      additionalTiers: [],
      hasPhysical: false
    };
  }

  const [primaryTier, ...additionalTierSelections] = normalizedSelections;
  return {
    valid: true,
    selectedTiers: normalizedSelections,
    tierId: primaryTier.id,
    tierName: primaryTier.tier.name,
    tierQty: primaryTier.qty,
    additionalTiers: additionalTierSelections.map(entry => ({ id: entry.id, qty: entry.qty })),
    hasPhysical: normalizedSelections.some(entry => entry.tier?.category === 'physical')
  };
}

function enforceSingleTierSelection(campaign, selectedTiers) {
  if (campaign?.single_tier_only === true && selectedTiers.length > 1) {
    return { valid: false, error: 'This campaign only allows one tier per pledge' };
  }
  return null;
}

function getCampaignPledgedAmountCents(campaign, stats) {
  if (Number.isFinite(stats?.pledgedAmount)) {
    return stats.pledgedAmount;
  }
  const pledgedAmount = Number(campaign?.pledged_amount || 0);
  return Number.isFinite(pledgedAmount) ? pledgedAmount * 100 : 0;
}

function buildTierCountMapFromSelections(selections = []) {
  const counts = {};
  for (const entry of selections || []) {
    if (!entry?.id) continue;
    counts[entry.id] = (counts[entry.id] || 0) + (entry.qty || 1);
  }
  return counts;
}

function buildSupportItemAmountMap(items = []) {
  const amounts = {};
  for (const item of items || []) {
    if (!item?.id) continue;
    amounts[item.id] = (amounts[item.id] || 0) + (item.amount || 0);
  }
  return amounts;
}

function compareCartShapeToContribution(orderCart, canonicalContribution) {
  const requestedTierCounts = buildTierCountMapFromSelections(canonicalContribution.selectedTiers);
  const orderTierCounts = buildTierCountMapFromSelections(orderCart.tierSelections);
  const requestedTierIds = Object.keys(requestedTierCounts).sort();
  const orderTierIds = Object.keys(orderTierCounts).sort();

  if (requestedTierIds.length !== orderTierIds.length) {
    return { valid: false, error: 'Order contents mismatch' };
  }

  for (const tierId of requestedTierIds) {
    if (requestedTierCounts[tierId] !== orderTierCounts[tierId]) {
      return { valid: false, error: 'Order contents mismatch' };
    }
  }

  const requestedSupportItems = buildSupportItemAmountMap(canonicalContribution.supportItems);
  const orderSupportItems = buildSupportItemAmountMap(orderCart.supportItems);
  const requestedSupportIds = Object.keys(requestedSupportItems).sort();
  const orderSupportIds = Object.keys(orderSupportItems).sort();
  if (requestedSupportIds.length !== orderSupportIds.length) {
    return { valid: false, error: 'Order contents mismatch' };
  }

  for (const itemId of requestedSupportIds) {
    if (requestedSupportItems[itemId] !== orderSupportItems[itemId]) {
      return { valid: false, error: 'Order contents mismatch' };
    }
  }

  if ((canonicalContribution.customAmount || 0) !== (orderCart.customAmount || 0)) {
    return { valid: false, error: 'Order contents mismatch' };
  }

  return { valid: true };
}

function extractCampaignCartsFromFirstPartyItems(items = [], customAmount = 0, campaignSlug = null) {
  if (!Array.isArray(items)) {
    return { valid: false, error: 'Invalid cart items' };
  }

  const normalizedCampaignSlug = typeof campaignSlug === 'string' && campaignSlug ? campaignSlug : null;
  const campaignCarts = new Map();

  function getCampaignCart(itemCampaignSlug) {
    if (!campaignCarts.has(itemCampaignSlug)) {
      campaignCarts.set(itemCampaignSlug, {
        campaignSlug: itemCampaignSlug,
        tierCounts: new Map(),
        supportItems: [],
        customAmount: 0
      });
    }
    return campaignCarts.get(itemCampaignSlug);
  }

  for (const item of items) {
    const itemId = typeof item?.id === 'string' ? item.id : '';
    if (!itemId.includes('__')) {
      return { valid: false, error: 'Invalid cart item id' };
    }

    const [itemCampaignSlug] = itemId.split('__');
    if (normalizedCampaignSlug && !campaignCarts.has(itemCampaignSlug) && campaignCarts.size === 0 && itemCampaignSlug !== normalizedCampaignSlug) {
      // Accept item-derived campaign slugs as the source of truth; campaignSlug is only a hint.
    }
    const cart = getCampaignCart(itemCampaignSlug);

    if (itemId.includes('__support__')) {
      const supportItemId = itemId.split('__support__')[1];
      const amount = Number(item?.amount);
      if (!supportItemId || !isNonNegativeInteger(amount)) {
        return { valid: false, error: 'Invalid support item selection' };
      }
      if (amount > 0) {
        cart.supportItems.push({ id: supportItemId, amount });
      }
      continue;
    }

    if (itemId.includes('__custom-support')) {
      const amount = Number(item?.amount ?? item?.price ?? 0);
      if (!isNonNegativeInteger(amount)) {
        return { valid: false, error: 'Invalid custom support amount' };
      }
      cart.customAmount += amount;
      continue;
    }

    const tierId = itemId.split('__')[1];
    const quantity = Number(item?.quantity ?? 1);
    if (!tierId || !isPositiveInteger(quantity)) {
      return { valid: false, error: 'Invalid tier selection' };
    }
    cart.tierCounts.set(tierId, (cart.tierCounts.get(tierId) || 0) + quantity);
  }

  const carts = Array.from(campaignCarts.values())
    .map((cart) => ({
      campaignSlug: cart.campaignSlug,
      tierSelections: Array.from(cart.tierCounts, ([id, qty]) => ({ id, qty })),
      supportItems: cart.supportItems,
      customAmount: Number(cart.customAmount) || 0
    }))
    .filter((cart) => cart.tierSelections.length > 0 || cart.supportItems.length > 0 || cart.customAmount > 0)
    .sort((a, b) => a.campaignSlug.localeCompare(b.campaignSlug));

  return {
    valid: true,
    carts
  };
}

function buildBundleOrderId(baseOrderId, campaignSlug) {
  return `${baseOrderId}-${campaignSlug}`;
}

function getCheckoutBundleStorageKey(orderId) {
  return `pending-checkout:${orderId}`;
}

function validateTierSelection(campaign, rawTierId, rawQty, seenTierIds) {
  const tierId = normalizeTierId(rawTierId);
  if (!tierId) {
    return { valid: false, error: 'Invalid tier selection' };
  }

  if (seenTierIds.has(tierId)) {
    return { valid: false, error: `Duplicate tier "${tierId}" is not allowed` };
  }

  const tier = campaign?.tiers?.find(entry => entry.id === tierId);
  if (!tier) {
    return { valid: false, error: `Tier "${tierId}" not found` };
  }

  if (tier.sold_out || (tier.remaining !== undefined && tier.remaining <= 0)) {
    return { valid: false, error: `Tier "${tierId}" is sold out` };
  }

  const qty = Number(rawQty ?? 1);
  if (!isPositiveInteger(qty)) {
    return { valid: false, error: `Invalid quantity for tier "${tierId}"` };
  }

  if (tier.stackable !== true && qty !== 1) {
    return { valid: false, error: `Tier "${tierId}" does not support multiple quantities` };
  }

  seenTierIds.add(tierId);
  return { valid: true, selection: { id: tierId, qty, tier } };
}

function buildTierSelectionFromStartRequest(campaign, { tierId, tierQty = 1, additionalTiers = [] }) {
  const seenTierIds = new Set();
  const selectedTiers = [];

  if (tierId) {
    const primaryTier = validateTierSelection(campaign, tierId, tierQty, seenTierIds);
    if (!primaryTier.valid) return primaryTier;
    selectedTiers.push(primaryTier.selection);
  }

  if (additionalTiers !== undefined && !Array.isArray(additionalTiers)) {
    return { valid: false, error: 'Invalid additional tier selection' };
  }

  for (const tierItem of additionalTiers || []) {
    const result = validateTierSelection(campaign, tierItem?.id, tierItem?.qty ?? 1, seenTierIds);
    if (!result.valid) return result;
    selectedTiers.push(result.selection);
  }

  const singleTierViolation = enforceSingleTierSelection(campaign, selectedTiers);
  if (singleTierViolation) return singleTierViolation;

  return finalizeTierSelection(selectedTiers);
}

function buildTierSelectionFromModifyRequest(campaign, currentPledge, { newTierId, newTierQty, addTiers }) {
  if (Array.isArray(addTiers)) {
    const seenTierIds = new Set();
    const selectedTiers = [];
    for (const tierItem of addTiers) {
      const result = validateTierSelection(campaign, tierItem?.id, tierItem?.qty ?? 1, seenTierIds);
      if (!result.valid) return result;
      selectedTiers.push(result.selection);
    }
    const singleTierViolation = enforceSingleTierSelection(campaign, selectedTiers);
    if (singleTierViolation) return singleTierViolation;
    return finalizeTierSelection(selectedTiers);
  }

  const currentSelection = getPledgeTierSelections(currentPledge, campaign);
  if (!currentSelection.valid) return currentSelection;

  if (!currentSelection.selectedTiers.length) {
    if (newTierId !== null && newTierId !== undefined) {
      return buildTierSelectionFromStartRequest(campaign, {
        tierId: newTierId,
        tierQty: newTierQty ?? 1,
        additionalTiers: []
      });
    }
    return currentSelection;
  }

  const selectedTiers = [...currentSelection.selectedTiers];
  if (newTierId !== null && newTierId !== undefined) {
    const updatedPrimary = validateTierSelection(campaign, newTierId, newTierQty ?? selectedTiers[0].qty, new Set());
    if (!updatedPrimary.valid) return updatedPrimary;
    selectedTiers[0] = updatedPrimary.selection;
  } else if (newTierQty !== null && newTierQty !== undefined) {
    const currentPrimaryTier = selectedTiers[0];
    const updatedPrimary = validateTierSelection(campaign, currentPrimaryTier.id, newTierQty, new Set());
    if (!updatedPrimary.valid) return updatedPrimary;
    selectedTiers[0] = updatedPrimary.selection;
  }

  return finalizeTierSelection(selectedTiers);
}

function buildDesiredSupportItems(campaign, currentSupportItems = [], requestedSupportItems) {
  const supportItemDefinitions = buildSupportItemDefinitionMap(campaign);
  const mergedSupportItems = new Map();

  for (const item of currentSupportItems || []) {
    if (item?.id && Number.isFinite(item.amount) && item.amount > 0) {
      mergedSupportItems.set(item.id, item.amount);
    }
  }

  if (requestedSupportItems === null || requestedSupportItems === undefined) {
    return {
      valid: true,
      supportItems: Array.from(mergedSupportItems, ([id, amount]) => ({ id, amount }))
    };
  }

  if (!Array.isArray(requestedSupportItems)) {
    return { valid: false, error: 'Invalid support item selection' };
  }

  const seenSupportItemIds = new Set();
  for (const item of requestedSupportItems) {
    const supportItemId = typeof item?.id === 'string' ? item.id : null;
    if (!supportItemId || !supportItemDefinitions.has(supportItemId)) {
      return { valid: false, error: 'Invalid support item selection' };
    }

    if (seenSupportItemIds.has(supportItemId)) {
      return { valid: false, error: `Duplicate support item "${supportItemId}" is not allowed` };
    }
    seenSupportItemIds.add(supportItemId);

    const amount = Number(item.amount);
    if (!isNonNegativeInteger(amount) || !isValidAmount(amount * 100)) {
      return { valid: false, error: `Invalid amount for support item "${supportItemId}"` };
    }

    if (amount === 0) {
      mergedSupportItems.delete(supportItemId);
    } else {
      mergedSupportItems.set(supportItemId, amount);
    }
  }

  return {
    valid: true,
    supportItems: Array.from(mergedSupportItems, ([id, amount]) => ({ id, amount }))
  };
}

function buildCanonicalContribution(env, campaign, { tierSelection, supportItems = [], customAmount = 0, tipPercent = DEFAULT_PLATFORM_TIP_PERCENT }) {
  const normalizedCustomAmount = Number(customAmount);
  if (!isNonNegativeInteger(normalizedCustomAmount) || !isValidAmount(normalizedCustomAmount * 100)) {
    return { valid: false, error: 'Invalid custom support amount' };
  }

  let subtotal = normalizedCustomAmount * 100;
  for (const tierItem of tierSelection.selectedTiers) {
    subtotal += (tierItem.tier.price || 0) * tierItem.qty * 100;
  }

  for (const supportItem of supportItems) {
    subtotal += supportItem.amount * 100;
  }

  if (!isValidAmount(subtotal)) {
    return { valid: false, error: 'Invalid pledge amount' };
  }

  if (subtotal <= 0) {
    return { valid: false, error: 'Pledge must include at least one contribution' };
  }

  return {
    valid: true,
    ...tierSelection,
    supportItems,
    customAmount: normalizedCustomAmount,
    totals: buildPledgeTotals(env, subtotal, {
      shipping: tierSelection.hasPhysical ? getFlatShippingFeeCents(env) : 0,
      tipPercent
    })
  };
}

async function validateTierThresholdSelection(env, campaignSlug, campaign, selectedTiers = [], existingSelectedTiers = []) {
  const thresholdTiers = selectedTiers.filter(tierItem => Number(tierItem.tier?.requires_threshold) > 0);
  if (thresholdTiers.length === 0) {
    return { valid: true };
  }

  const stats = await getCampaignStats(env, campaignSlug);
  const pledgedAmountCents = getCampaignPledgedAmountCents(campaign, stats);
  const existingTierCounts = getTierQuantityMap(existingSelectedTiers);

  for (const tierItem of thresholdTiers) {
    const requiredThresholdCents = Number(tierItem.tier.requires_threshold) * 100;
    const existingQty = existingTierCounts[tierItem.id] || 0;

    if (tierItem.qty <= existingQty) {
      continue;
    }

    if (pledgedAmountCents < requiredThresholdCents) {
      return {
        valid: false,
        error: `Tier "${tierItem.id}" unlocks at $${Number(tierItem.tier.requires_threshold).toLocaleString()}`
      };
    }
  }

  return { valid: true };
}

function getTierQuantityMap(selectedTiers = []) {
  const counts = {};
  for (const tierItem of selectedTiers) {
    counts[tierItem.id] = (counts[tierItem.id] || 0) + (tierItem.qty || 1);
  }
  return counts;
}

async function ensureTierAvailability(env, campaignSlug, campaign, selectedTiers = [], existingTierCounts = {}, excludedReservationOrderId = null) {
  if (!env.PLEDGES) return { valid: true };

  let inventory = await getTierInventory(env, campaignSlug);
  if (Object.keys(inventory).length === 0 && campaign?.tiers?.some(tier => tier.limit_total)) {
    inventory = await recalculateTierInventory(env, campaignSlug, campaign.tiers) || {};
  }

  const reservedCounts = await getReservedTierCounts(env, campaignSlug, excludedReservationOrderId);

  for (const tierItem of selectedTiers) {
    if (!tierItem.tier?.limit_total) continue;

    const tierInventory = inventory[tierItem.id] || {
      limit: tierItem.tier.limit_total,
      claimed: 0
    };
    const available = tierInventory.limit
      - tierInventory.claimed
      - (reservedCounts[tierItem.id] || 0)
      + (existingTierCounts[tierItem.id] || 0);
    if (tierItem.qty > available) {
      return {
        valid: false,
        error: available <= 0
          ? `Tier "${tierItem.id}" is sold out`
          : `Only ${available} remaining for tier "${tierItem.id}"`,
        remaining: Math.max(0, available)
      };
    }
  }

  return { valid: true };
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

async function buildTierInventorySnapshot(env, campaignSlug, campaign = null) {
  let inventory = await getTierInventory(env, campaignSlug);
  if (Object.keys(inventory).length === 0 && campaign?.tiers?.some(tier => tier.limit_total)) {
    inventory = await recalculateTierInventory(env, campaignSlug, campaign.tiers) || {};
  }
  return JSON.parse(JSON.stringify(inventory || {}));
}

function getTierReservationKey(campaignSlug, orderId) {
  return `tier-reservation:${campaignSlug}:${orderId}`;
}

function getTierReservationCountsKey(campaignSlug) {
  return `tier-reservation-counts:${campaignSlug}`;
}

async function getReservedTierCounts(env, campaignSlug, excludedOrderId = null) {
  if (!env.PLEDGES || !hasTierInventoryCoordinator(env)) return {};

  try {
    const result = await callTierInventoryCoordinator(env, campaignSlug, '/reserved-counts', {
      reservationId: excludedOrderId
    });
    if (result?.reservedCounts && typeof result.reservedCounts === 'object') {
      return result.reservedCounts;
    }
  } catch (err) {
    console.error('Failed to fetch reserved tier counts from coordinator:', err.message);
  }
  return {};
}

function resolveAuthorizedOrderId(payload, requestedOrderId = null) {
  if (!payload?.orderId) {
    return { valid: false, error: 'Invalid token scope' };
  }

  if (requestedOrderId && requestedOrderId !== payload.orderId) {
    return { valid: false, error: 'Unauthorized' };
  }

  return { valid: true, orderId: payload.orderId };
}

async function saveTierReservation(env, campaignSlug, orderId, selectedTiers = [], campaign = null) {
  if (!env.PLEDGES || !orderId) return { success: true };
  const limitedTiers = selectedTiers
    .filter(tierItem => tierItem.tier?.limit_total)
    .map(tierItem => ({ id: tierItem.id, qty: tierItem.qty }));

  if (limitedTiers.length === 0) {
    await clearTierReservation(env, campaignSlug, orderId);
    return { success: true };
  }

  try {
    if (!hasTierInventoryCoordinator(env)) {
      return { success: false, error: 'Limited tier reservation unavailable' };
    }

    const inventory = await buildTierInventorySnapshot(env, campaignSlug, campaign);
    const result = await callTierInventoryCoordinator(env, campaignSlug, '/reserve-selection', {
      reservationId: orderId,
      nextCounts: getTierQuantityMap(limitedTiers),
      inventory
    });
    if (!result?.success) {
      return result;
    }

    return { success: true };
  } catch (err) {
    try {
      await callTierInventoryCoordinator(env, campaignSlug, '/release-reservation', {
        reservationId: orderId
      });
    } catch (releaseErr) {
      console.error('Failed to rollback tier reservation in coordinator:', releaseErr.message);
    }
    throw err;
  }
}

async function deleteTierReservationProjection(env, campaignSlug, orderId) {
  if (!env.PLEDGES || !orderId) return;
  const reservationKey = getTierReservationKey(campaignSlug, orderId);
  const countsKey = getTierReservationCountsKey(campaignSlug);
  await Promise.all([
    env.PLEDGES.delete(reservationKey),
    env.PLEDGES.delete(countsKey)
  ]);
}

async function clearTierReservation(env, campaignSlug, orderId) {
  if (!env.PLEDGES || !orderId) return;
  await deleteTierReservationProjection(env, campaignSlug, orderId);
  if (hasTierInventoryCoordinator(env)) {
    try {
      await callTierInventoryCoordinator(env, campaignSlug, '/release-reservation', {
        reservationId: orderId
      });
    } catch (err) {
      console.error('Failed to clear tier reservation in coordinator:', err.message);
    }
  }
}

async function claimSelectedTierInventory(env, campaignSlug, selectedTiers = [], campaign) {
  return claimTierSelectionInventory(env, campaignSlug, selectedTiers, campaign);
}

async function confirmOrClaimSelectedTierInventory(env, campaignSlug, orderId, selectedTiers = [], campaign) {
  const limitedTiers = selectedTiers
    .filter(tierItem => tierItem?.tier?.limit_total)
    .map(tierItem => ({ id: tierItem.id, qty: tierItem.qty || 1 }));

  if (!env.PLEDGES || !orderId || limitedTiers.length === 0) {
    return claimSelectedTierInventory(env, campaignSlug, selectedTiers, campaign);
  }

  if (!hasTierInventoryCoordinator(env)) {
    return claimSelectedTierInventory(env, campaignSlug, selectedTiers, campaign);
  }

  const inventory = await buildTierInventorySnapshot(env, campaignSlug, campaign);
  const result = await callTierInventoryCoordinator(env, campaignSlug, '/confirm-reservation', {
    reservationId: orderId,
    inventory
  });
  if (!result?.success) {
    return result;
  }
  if (!result.confirmed) {
    return claimSelectedTierInventory(env, campaignSlug, selectedTiers, campaign);
  }

  await deleteTierReservationProjection(env, campaignSlug, orderId);
  return {
    success: true,
    claimedTiers: limitedTiers
  };
}

async function applyTierInventoryChanges(env, campaignSlug, campaign, previousSelection = [], nextSelection = []) {
  return applyTierInventorySelectionChanges(env, campaignSlug, campaign, previousSelection, nextSelection);
}

async function persistNewPledge(env, {
  campaign,
  campaignSlug,
  pledgeData,
  supportItems = [],
  selectedTiers = []
}) {
  if (!env.PLEDGES) {
    return { success: false, error: 'PLEDGES KV not configured' };
  }

  const inventoryClaim = await confirmOrClaimSelectedTierInventory(
    env,
    campaignSlug,
    pledgeData.orderId,
    selectedTiers,
    campaign
  );
  if (!inventoryClaim.success) {
    return inventoryClaim;
  }

  let emailIndexed = false;
  let campaignIndexed = false;
  let statsUpdated = false;
  let supportStatsUpdated = false;

  try {
    await env.PLEDGES.put(`pledge:${pledgeData.orderId}`, JSON.stringify(pledgeData));

    const emailKey = `email:${pledgeData.email.toLowerCase()}`;
    const existingOrders = await env.PLEDGES.get(emailKey, { type: 'json' }) || [];
    if (!existingOrders.includes(pledgeData.orderId)) {
      existingOrders.push(pledgeData.orderId);
      await env.PLEDGES.put(emailKey, JSON.stringify(existingOrders));
    }
    emailIndexed = true;

    await addToCampaignIndex(env, campaignSlug, pledgeData.orderId);
    campaignIndexed = true;

    await addPledgeToStats(env, {
      campaignSlug,
      amount: pledgeData.subtotal,
      tierId: pledgeData.tierId,
      tierQty: pledgeData.tierQty,
      additionalTiers: pledgeData.additionalTiers || []
    });
    statsUpdated = true;

    if (supportItems.length > 0) {
      await updateSupportItemStats(env, campaignSlug, [], supportItems);
      supportStatsUpdated = true;
    }

    return { success: true };
  } catch (err) {
    await env.PLEDGES.delete(`pledge:${pledgeData.orderId}`);

    if (emailIndexed) {
      const emailKey = `email:${pledgeData.email.toLowerCase()}`;
      const existingOrders = await env.PLEDGES.get(emailKey, { type: 'json' }) || [];
      const filteredOrders = existingOrders.filter(id => id !== pledgeData.orderId);
      await env.PLEDGES.put(emailKey, JSON.stringify(filteredOrders));
    }

    if (campaignIndexed) {
      await removeFromCampaignIndex(env, campaignSlug, pledgeData.orderId);
    }

    if (supportStatsUpdated) {
      await updateSupportItemStats(env, campaignSlug, supportItems, []);
    }

    if (statsUpdated) {
      await removePledgeFromStats(env, {
        campaignSlug,
        amount: pledgeData.subtotal,
        tierId: pledgeData.tierId,
        tierQty: pledgeData.tierQty,
        additionalTiers: pledgeData.additionalTiers || [],
        supportItems,
        customAmount: pledgeData.customAmount || 0
      });
    }

    for (const claimedTier of inventoryClaim.claimedTiers || []) {
      await releaseTierInventory(env, campaignSlug, claimedTier.id, claimedTier.qty);
    }

    return { success: false, error: err.message };
  }
}

function getStripeKey(env) {
  if (getAppMode(env) === 'test' && env.STRIPE_SECRET_KEY_TEST) {
    return env.STRIPE_SECRET_KEY_TEST;
  }
  if (getAppMode(env) === 'live' && env.STRIPE_SECRET_KEY_LIVE) {
    return env.STRIPE_SECRET_KEY_LIVE;
  }
  return env.STRIPE_SECRET_KEY;
}

function getStripeWebhookSecret(env) {
  if (getAppMode(env) === 'test' && env.STRIPE_WEBHOOK_SECRET_TEST) {
    return env.STRIPE_WEBHOOK_SECRET_TEST;
  }
  if (getAppMode(env) === 'live' && env.STRIPE_WEBHOOK_SECRET_LIVE) {
    return env.STRIPE_WEBHOOK_SECRET_LIVE;
  }
  return env.STRIPE_WEBHOOK_SECRET;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return corsResponse(env);
    }

    try {
      // SEC-003: Block test endpoints in production mode (unless admin-authenticated)
      if (path.startsWith('/test/') && getAppMode(env) !== 'test') {
        const auth = requireAdmin(request, env);
        if (!auth.ok) {
          return jsonResponse({ error: 'Not found' }, 404);
        }
      }

      if (path === '/checkout-intent/start' && method === 'POST') {
        return handleFirstPartyCheckoutStart(request, env);
      }

      if (path === '/checkout-intent/summary' && method === 'GET') {
        return handleFirstPartyCheckoutSummary(request, env);
      }

      if (path === '/checkout-intent/recovery' && method === 'GET') {
        return handleFirstPartyCheckoutRecovery(request, env);
      }

      if (path === '/webhooks/stripe' && method === 'POST') {
        return handleStripeWebhook(request, env, ctx);
      }

      if (path === '/pledge' && method === 'GET') {
        return handleGetPledge(request, env);
      }

      if (path === '/pledges' && method === 'GET') {
        return handleGetPledges(request, env);
      }

      if (path === '/pledge/cancel' && method === 'POST') {
        return handleCancelPledge(request, env);
      }

      if (path === '/pledge/modify' && method === 'POST') {
        return handleModifyPledge(request, env);
      }

      if (path === '/pledge/payment-method/start' && method === 'POST') {
        return handleUpdatePaymentMethod(request, env);
      }

      if (path === '/votes' && method === 'GET') {
        // SEC-005: Rate limit vote reads
        const rl = await checkRateLimit(request, env, RATE_LIMITS.votes);
        if (!rl.allowed) return rl.response;
        return handleGetVotes(request, env);
      }

      if (path === '/votes' && method === 'POST') {
        // SEC-005: Rate limit vote casting
        const rl = await checkRateLimit(request, env, RATE_LIMITS.votes);
        if (!rl.allowed) return rl.response;
        return handlePostVote(request, env);
      }

      if (path === '/test/setup' && method === 'POST') {
        return handleTestSetup(request, env);
      }

      if (path === '/test/cleanup' && method === 'POST') {
        return handleTestCleanup(request, env);
      }

      if (path === '/admin/rebuild' && method === 'POST') {
        // SEC-005: Rate limit admin endpoints aggressively
        const rl = await checkRateLimit(request, env, RATE_LIMITS.admin);
        if (!rl.allowed) return rl.response;
        return handleAdminRebuild(request, env);
      }

      if (path === '/admin/broadcast/announcement' && method === 'POST') {
        const rl = await checkRateLimit(request, env, RATE_LIMITS.admin);
        if (!rl.allowed) return rl.response;
        return handleBroadcastAnnouncement(request, env);
      }

      if (path === '/admin/broadcast/diary' && method === 'POST') {
        const rl = await checkRateLimit(request, env, RATE_LIMITS.admin);
        if (!rl.allowed) return rl.response;
        return handleBroadcastDiary(request, env);
      }

      if (path === '/admin/diary/check' && method === 'POST') {
        const rl = await checkRateLimit(request, env, RATE_LIMITS.admin);
        if (!rl.allowed) return rl.response;
        return handleDiaryCheck(request, env);
      }

      if (path === '/admin/broadcast/milestone' && method === 'POST') {
        const rl = await checkRateLimit(request, env, RATE_LIMITS.admin);
        if (!rl.allowed) return rl.response;
        return handleBroadcastMilestone(request, env);
      }

      if (path.startsWith('/admin/milestone-check/') && method === 'POST') {
        const rl = await checkRateLimit(request, env, RATE_LIMITS.admin);
        if (!rl.allowed) return rl.response;
        const campaignSlug = path.replace('/admin/milestone-check/', '');
        return handleMilestoneCheck(request, campaignSlug, env);
      }

      if (path.startsWith('/admin/settle/') && method === 'POST') {
        const rl = await checkRateLimit(request, env, RATE_LIMITS.admin);
        if (!rl.allowed) return rl.response;
        const campaignSlug = path.replace('/admin/settle/', '');
        return handleSettleCampaign(request, campaignSlug, env);
      }

      if (path === '/test/email' && method === 'POST') {
        return handleTestEmail(request, env);
      }

      if (path === '/test/votes' && method === 'POST') {
        return handleTestVotes(request, env);
      }

      if (path.startsWith('/live/') && method === 'GET') {
        const campaignSlug = path.replace('/live/', '');
        return handleGetLiveCampaign(campaignSlug, env);
      }

      // Stats endpoints for live pledge totals
      if (path.startsWith('/stats/') && method === 'GET') {
        const campaignSlug = path.replace('/stats/', '');
        return handleGetStats(campaignSlug, env);
      }

      if (path.startsWith('/stats/') && method === 'POST') {
        const campaignSlug = path.replace('/stats/', '').replace('/recalculate', '');
        return handleRecalculateStats(request, campaignSlug, env);
      }

      // Tier inventory endpoints
      if (path.startsWith('/inventory/') && method === 'GET') {
        const campaignSlug = path.replace('/inventory/', '');
        return handleGetInventory(campaignSlug, env);
      }

      if (path.startsWith('/inventory/') && path.endsWith('/recalculate') && method === 'POST') {
        const campaignSlug = path.replace('/inventory/', '').replace('/recalculate', '');
        return handleRecalculateInventory(request, campaignSlug, env);
      }

      if (path === '/admin/inventory/init-all' && method === 'POST') {
        return handleInitAllInventory(request, env);
      }

      // Admin: Recover a missed Stripe checkout session (creates pledge from completed session)
      if (path === '/admin/recover-checkout' && method === 'POST') {
        return handleRecoverCheckout(request, env);
      }

      // Admin: Backfill missing Stripe customer IDs on pledges (processes batch per call)
      if (path.startsWith('/admin/campaign-index/rebuild/') && method === 'POST') {
        const campaignSlug = path.replace('/admin/campaign-index/rebuild/', '');
        return handleRebuildCampaignIndex(request, campaignSlug, env);
      }

      if (path.startsWith('/admin/backfill-customers/') && method === 'POST') {
        const campaignSlug = path.replace('/admin/backfill-customers/', '');
        return handleBackfillCustomers(request, campaignSlug, env);
      }

      // Admin: Settle specific pledges by order ID (avoids full KV scan + subrequest limits)
      if (path === '/admin/settle-batch' && method === 'POST') {
        return handleSettleBatch(request, env);
      }

      // Admin: Dispatch batched settlement for a campaign (self-chains until complete)
      if (path.startsWith('/admin/settle-dispatch/') && method === 'POST') {
        const campaignSlug = path.replace('/admin/settle-dispatch/', '');
        return handleSettleDispatch(request, campaignSlug, env);
      }

      // Admin: Check cron heartbeat status
      if (path === '/admin/cron/status' && method === 'GET') {
        return handleCronStatus(request, env);
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse({ error: 'Internal server error' }, 500);
    }
  },

  // Cron trigger: runs daily at 7 AM UTC (midnight MST)
  // 1. Check for campaigns that should transition pre → live (based on start_date)
  // 2. Kick off batched settlement for campaigns past deadline + funded
  async scheduled(event, env, ctx) {
    console.log('⏰ Scheduled task triggered:', new Date().toISOString());
    
    // Heartbeat: record cron execution
    if (env.PLEDGES) {
      await env.PLEDGES.put('cron:lastRun', new Date().toISOString(), { expirationTtl: 172800 });
    }
    
    try {
      const campaigns = await getCampaigns(env);
      const results = { checked: 0, settlementDispatched: 0, transitioned: 0, errors: [] };
      let needsRebuild = false;
      
      for (const campaign of campaigns.campaigns || campaigns) {
        results.checked++;
        
        // Check if campaign state should transition based on dates
        const effectiveState = getEffectiveState(campaign);
        if (effectiveState !== campaign.state) {
          console.log(`⏰ Campaign ${campaign.slug}: state transition detected (${campaign.state} → ${effectiveState})`);
          results.transitioned++;
          needsRebuild = true;
        }
        
        // Skip campaigns without deadline/goal for settlement
        if (!campaign.goal_deadline || !campaign.goal_amount) {
          continue;
        }
        
        // Check if deadline has passed (in Mountain Time)
        if (!isDeadlinePassed(campaign.goal_deadline)) {
          continue;
        }

        // Skip if already fully settled
        if (env.PLEDGES) {
          const settled = await env.PLEDGES.get(`campaign-charged:${campaign.slug}`);
          if (settled) {
            console.log(`⏰ Campaign ${campaign.slug}: already settled`);
            continue;
          }
        }
        
        // Check if funded
        const stats = await getCampaignStats(env, campaign.slug);
        const goalAmountCents = campaign.goal_amount * 100;
        
        if (stats.pledgedAmount < goalAmountCents) {
          console.log(`⏰ Campaign ${campaign.slug}: not funded (${stats.pledgedAmount}/${goalAmountCents})`);
          continue;
        }
        
        // Settle directly to avoid self-invocation 522 timeouts
        console.log(`⏰ Settling campaign: ${campaign.slug}`);
        try {
          const settleResult = await settleCampaign(campaign.slug, env);
          console.log(`✅ Settlement complete for ${campaign.slug}:`, JSON.stringify({
            supportersCharged: settleResult.supportersCharged,
            supportersFailed: settleResult.supportersFailed,
            pledgesCharged: settleResult.pledgesCharged,
            totalCharged: settleResult.totalCharged
          }));
          
          // Only mark campaigns settled when every active pledge was chargeable.
          if (
            settleResult.supportersCharged > 0 &&
            settleResult.supportersFailed === 0 &&
            (settleResult.skippedNoCustomer || 0) === 0
          ) {
            await env.PLEDGES.put(`campaign-charged:${campaign.slug}`, new Date().toISOString());
          }
          
          results.settlementDispatched++;
        } catch (settleErr) {
          results.errors.push({ campaign: campaign.slug, error: settleErr.message });
          console.error(`❌ Settlement failed for ${campaign.slug}:`, settleErr.message);
        }
      }
      
      // Trigger site rebuild if any campaigns transitioned state
      if (needsRebuild && env.GITHUB_TOKEN) {
        console.log('🔄 Triggering site rebuild for state transitions...');
        try {
          await triggerSiteRebuild(env, 'scheduled-state-transition');
          console.log('✅ Site rebuild triggered');
        } catch (rebuildErr) {
          console.error('❌ Failed to trigger rebuild:', rebuildErr.message);
          results.errors.push({ type: 'rebuild', error: rebuildErr.message });
        }
      }
      
      console.log('⏰ Scheduled task complete:', results);
    } catch (err) {
      console.error('⏰ Scheduled task error:', err);
      if (env.PLEDGES) {
        await env.PLEDGES.put('cron:lastError', JSON.stringify({
          at: new Date().toISOString(),
          error: err.message
        }), { expirationTtl: 604800 });
      }
    }
  }
};

function getCheckoutIntentCoordinator(env) {
  const namespace = env.CHECKOUT_INTENTS;
  if (!namespace || typeof namespace.idFromName !== 'function' || typeof namespace.get !== 'function') {
    return null;
  }
  const id = namespace.idFromName('checkout-intent-nonce-coordinator');
  return namespace.get(id);
}

async function consumeCheckoutIntentNonce(env, { nonce, cartHash, exp }) {
  const coordinator = getCheckoutIntentCoordinator(env);
  if (!coordinator) {
    return { ok: false, status: 503, error: 'Checkout intent coordinator unavailable' };
  }

  const response = await coordinator.fetch('https://checkout-intents.internal/consume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce, cartHash, exp })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    return {
      ok: false,
      status: response.status || 503,
      error: payload.error || 'Checkout intent nonce rejected'
    };
  }

  return { ok: true };
}

function createCheckoutNonce() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isFirstPartyOrderId(orderId) {
  return /^pool-intent-[a-z0-9_-]+$/i.test(String(orderId || ''));
}

async function handleFirstPartyCheckoutStart(request, env) {
  if (getCheckoutProvider(env) !== 'first_party') {
    return jsonResponse({ error: 'Not found' }, 404);
  }

  const rateLimit = await checkRateLimit(request, env, RATE_LIMITS.start);
  if (!rateLimit.allowed) return rateLimit.response;

  const body = await request.json();
  const { campaignSlug, items, customAmount = 0, email, tipPercent } = body || {};
  const normalizedTipPercent = sanitizePlatformTipPercent(tipPercent, DEFAULT_PLATFORM_TIP_PERCENT);
  if (campaignSlug && !isValidSlug(campaignSlug)) {
    return jsonResponse({ error: 'Invalid campaign slug format' }, 400);
  }

  if (email && !isValidEmail(email)) {
    return jsonResponse({ error: 'Invalid email format' }, 400);
  }

  const parsedCart = extractCampaignCartsFromFirstPartyItems(items, customAmount, campaignSlug);
  if (!parsedCart.valid) {
    return jsonResponse({ error: parsedCart.error }, 400);
  }

  const orderCarts = parsedCart.carts || [];
  if (orderCarts.length === 0) {
    return jsonResponse({ error: 'Your cart is empty.' }, 400);
  }

  const checkoutGroups = [];
  for (const orderCart of orderCarts) {
    if (!orderCart.campaignSlug) {
      return jsonResponse({ error: 'Could not determine campaign from cart contents' }, 400);
    }

    const { valid, error, campaign } = await isCampaignLive(env, orderCart.campaignSlug);
    if (!valid) {
      return jsonResponse({ error: error || 'Campaign not accepting pledges' }, 400);
    }

    const tierSelection = buildTierSelectionFromStartRequest(campaign, {
      tierId: orderCart.tierSelections[0]?.id || null,
      tierQty: orderCart.tierSelections[0]?.qty || 1,
      additionalTiers: orderCart.tierSelections.slice(1)
    });
    if (!tierSelection.valid) {
      return jsonResponse({ error: tierSelection.error }, 400);
    }

    const desiredSupportItems = buildDesiredSupportItems(campaign, [], orderCart.supportItems);
    if (!desiredSupportItems.valid) {
      return jsonResponse({ error: desiredSupportItems.error }, 400);
    }

    const canonicalContribution = buildCanonicalContribution(env, campaign, {
      tierSelection,
      supportItems: desiredSupportItems.supportItems,
      customAmount: orderCart.customAmount,
      tipPercent: normalizedTipPercent
    });
    if (!canonicalContribution.valid) {
      return jsonResponse({ error: canonicalContribution.error }, 400);
    }

    const sessionShape = compareCartShapeToContribution(orderCart, canonicalContribution);
    if (!sessionShape.valid) {
      return jsonResponse({ error: sessionShape.error }, 400);
    }

    const thresholdValidation = await validateTierThresholdSelection(
      env,
      orderCart.campaignSlug,
      campaign,
      canonicalContribution.selectedTiers
    );
    if (!thresholdValidation.valid) {
      return jsonResponse({ error: thresholdValidation.error }, 400);
    }

    const availability = await ensureTierAvailability(
      env,
      orderCart.campaignSlug,
      campaign,
      canonicalContribution.selectedTiers
    );
    if (!availability.valid) {
      return jsonResponse({ error: availability.error, remaining: availability.remaining }, 400);
    }

    checkoutGroups.push({
      campaign,
      campaignSlug: orderCart.campaignSlug,
      canonicalContribution
    });
  }

  if (!env.CHECKOUT_INTENT_SECRET) {
    return jsonResponse({ error: 'Checkout intent signing unavailable' }, 503);
  }

  const bundleTotals = checkoutGroups.reduce((totals, group) => ({
    subtotal: totals.subtotal + (group.canonicalContribution.totals.subtotal || 0),
    tax: totals.tax + (group.canonicalContribution.totals.tax || 0),
    shipping: totals.shipping + (group.canonicalContribution.totals.shipping || 0),
    tipAmount: totals.tipAmount + (group.canonicalContribution.totals.tipAmount || 0),
    amount: totals.amount + (group.canonicalContribution.totals.amount || 0)
  }), {
    subtotal: 0,
    tax: 0,
    shipping: 0,
    tipAmount: 0,
    amount: 0
  });

  const nonce = createCheckoutNonce();
  const checkoutIntentExp = Math.floor(Date.now() / 1000) + DEFAULT_CHECKOUT_INTENT_TTL_SECONDS;
  const checkoutHashInput = buildCheckoutBundleHashInput({
    contributions: checkoutGroups.map((group) => ({
      campaignSlug: group.campaignSlug,
      canonicalContribution: group.canonicalContribution,
      tipPercent: normalizedTipPercent
    }))
  });
  const checkoutCartHash = await hashCheckoutBundle(checkoutHashInput);

  const nonceResult = await consumeCheckoutIntentNonce(env, {
    nonce,
    cartHash: checkoutCartHash,
    exp: checkoutIntentExp
  });
  if (!nonceResult.ok) {
    return jsonResponse({ error: nonceResult.error }, nonceResult.status);
  }

  const orderId = `pool-intent-${nonce}`;
  const bundleManifest = {
    orderId,
    checkoutProvider: 'first_party',
    campaignCount: checkoutGroups.length,
    tipPercent: normalizedTipPercent,
    totals: bundleTotals,
    campaigns: checkoutGroups.map((group) => ({
      orderId: checkoutGroups.length === 1 ? orderId : buildBundleOrderId(orderId, group.campaignSlug),
      campaignSlug: group.campaignSlug,
      tierId: group.canonicalContribution.tierId || '',
      tierName: group.canonicalContribution.tierName || '',
      tierQty: group.canonicalContribution.tierQty || 1,
      additionalTiers: group.canonicalContribution.additionalTiers || [],
      supportItems: group.canonicalContribution.supportItems || [],
      customAmount: group.canonicalContribution.customAmount || 0,
      hasPhysical: group.canonicalContribution.hasPhysical === true,
      totals: group.canonicalContribution.totals
    }))
  };

  if (env.PLEDGES) {
    await env.PLEDGES.put(
      getCheckoutBundleStorageKey(orderId),
      JSON.stringify(bundleManifest),
      { expirationTtl: 86400 }
    );
  }

  const reservedCheckoutGroups = [];
  try {
    for (const group of checkoutGroups) {
      const checkoutOrderId = checkoutGroups.length === 1
        ? orderId
        : buildBundleOrderId(orderId, group.campaignSlug);
      const reservation = await saveTierReservation(
        env,
        group.campaignSlug,
        checkoutOrderId,
        group.canonicalContribution.selectedTiers,
        group.campaign
      );
      if (!reservation?.success) {
        throw new Error(reservation.error || 'Failed to reserve limited inventory');
      }
      reservedCheckoutGroups.push({ campaignSlug: group.campaignSlug, orderId: checkoutOrderId });
    }
  } catch (reservationErr) {
    if (env.PLEDGES) {
      await env.PLEDGES.delete(getCheckoutBundleStorageKey(orderId));
    }
    for (const reservedGroup of reservedCheckoutGroups) {
      await clearTierReservation(env, reservedGroup.campaignSlug, reservedGroup.orderId);
    }
    return jsonResponse({ error: reservationErr.message }, 409);
  }

  const stripe = createStripeClient(getStripeKey(env));

  try {
    const sessionParams = {
      mode: 'setup',
      payment_method_types: ['card'],
      success_url: `${env.SITE_BASE}/pledge-success/?orderId=${orderId}`,
      cancel_url: `${env.SITE_BASE}/pledge-cancelled/`,
      metadata: {
        orderId,
        campaignSlug: checkoutGroups[0].campaignSlug,
        amountCents: String(bundleTotals.subtotal),
        tierId: checkoutGroups.length === 1 ? (checkoutGroups[0].canonicalContribution.tierId || '') : '',
        tierName: checkoutGroups.length === 1 ? (checkoutGroups[0].canonicalContribution.tierName || '') : '',
        tierQty: String(checkoutGroups.length === 1 ? (checkoutGroups[0].canonicalContribution.tierQty || 1) : 0),
        tipPercent: String(normalizedTipPercent),
        hasAdditionalTiers: checkoutGroups.some((group) => group.canonicalContribution.additionalTiers.length > 0) ? 'true' : '',
        hasExtras: checkoutGroups.some((group) => group.canonicalContribution.supportItems.length > 0 || group.canonicalContribution.customAmount > 0) ? 'true' : '',
        hasPhysical: checkoutGroups.some((group) => group.canonicalContribution.hasPhysical) ? 'true' : '',
        checkoutBundleMode: checkoutGroups.length > 1 ? 'true' : '',
        checkoutBundleCount: String(checkoutGroups.length),
        checkoutProvider: 'first_party',
        checkoutNonce: nonce,
        checkoutCartHash,
        checkoutSnapshotVersion: String(CHECKOUT_INTENT_VERSION)
      }
    };

    if (email) {
      sessionParams.customer_email = email;
    }

    if (checkoutGroups.some((group) => group.canonicalContribution.hasPhysical)) {
      sessionParams.shipping_address_collection = {
        allowed_countries: ['US']
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return jsonResponse({ url: session.url });
  } catch (stripeErr) {
    if (env.PLEDGES) {
      await env.PLEDGES.delete(getCheckoutBundleStorageKey(orderId));
    }
    for (const reservedGroup of reservedCheckoutGroups) {
      await clearTierReservation(env, reservedGroup.campaignSlug, reservedGroup.orderId);
    }
    return jsonResponse({ error: 'Failed to create checkout session: ' + stripeErr.message }, 500);
  }
}

async function handleFirstPartyCheckoutSummary(request, env) {
  if (getCheckoutProvider(env) !== 'first_party') {
    return jsonResponse({ error: 'Not found' }, 404);
  }

  if (!env.PLEDGES) {
    return jsonResponse({ error: 'Pledge storage unavailable' }, 503);
  }

  const url = new URL(request.url);
  const orderId = url.searchParams.get('orderId');

  if (!isFirstPartyOrderId(orderId)) {
    return jsonResponse({ error: 'Invalid orderId' }, 400);
  }

  const pledge = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
  if (!pledge) {
    const bundle = await env.PLEDGES.get(getCheckoutBundleStorageKey(orderId), { type: 'json' });
    if (bundle?.campaigns?.length) {
      const campaignTitles = [];
      for (const entry of bundle.campaigns) {
        const campaign = await getCampaign(env, entry.campaignSlug);
        campaignTitles.push(campaign?.title || entry.campaignSlug);
      }

      const shippingCollected = bundle.campaigns.some((entry) => entry.hasPhysical === true);

      return jsonResponse({
        orderId: bundle.orderId || orderId,
        campaignSlug: bundle.campaigns[0]?.campaignSlug || null,
        campaignTitle: campaignTitles.length === 1 ? campaignTitles[0] : null,
        campaignTitles,
        pledgeStatus: 'active',
        createdAt: null,
        shippingCollected,
        totals: {
          subtotal: Number(bundle?.totals?.subtotal || 0),
          tax: Number(bundle?.totals?.tax || 0),
          shipping: Number(bundle?.totals?.shipping || 0),
          tipAmount: Number(bundle?.totals?.tipAmount || 0),
          amount: Number(bundle?.totals?.amount || 0)
        }
      }, 200, env);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  }

  const campaign = await getCampaign(env, pledge.campaignSlug);

  const shippingCollected = Boolean(
    pledge?.shippingAddress?.name ||
    pledge?.shippingAddress?.address1 ||
    pledge?.shippingAddress?.city ||
    pledge?.shippingAddress?.postalCode ||
    pledge?.shippingAddress?.country
  );

  return jsonResponse({
    orderId: pledge.orderId,
    campaignSlug: pledge.campaignSlug,
    campaignTitle: campaign?.title || null,
    pledgeStatus: pledge.pledgeStatus || 'active',
    createdAt: pledge.createdAt || null,
    shippingCollected,
    totals: {
      subtotal: Number(pledge?.subtotal || 0),
      tax: Number(pledge?.tax || 0),
      shipping: Number(pledge?.shipping || 0),
      tipAmount: Number(pledge?.tipAmount || 0),
      amount: Number(pledge?.amount || 0)
    }
  }, 200, env);
}

async function handleFirstPartyCheckoutRecovery(request, env) {
  if (getCheckoutProvider(env) !== 'first_party') {
    return jsonResponse({ error: 'Not found' }, 404);
  }

  const url = new URL(request.url);
  const campaignSlug = url.searchParams.get('campaignSlug');

  if (!campaignSlug || !isValidSlug(campaignSlug)) {
    return jsonResponse({ error: 'Invalid campaign slug format' }, 400);
  }

  const campaign = await getCampaign(env, campaignSlug);
  if (!campaign) {
    return jsonResponse({ error: 'Campaign not found' }, 404);
  }

  const liveCheck = await isCampaignLive(env, campaignSlug);
  const campaignTitle = campaign.title || campaignSlug;
  const acceptingPledges = liveCheck.valid === true;

  return jsonResponse({
    campaignSlug,
    campaignTitle,
    effectiveState: getEffectiveState(campaign),
    acceptingPledges,
    statusMessage: acceptingPledges
      ? `${campaignTitle} is still accepting pledges.`
      : (liveCheck.error || 'Campaign not accepting pledges')
  }, 200, env);
}

async function loadCheckoutBundleManifest(env, orderId) {
  if (!env.PLEDGES || !orderId) return null;
  return env.PLEDGES.get(getCheckoutBundleStorageKey(orderId), { type: 'json' });
}

async function persistCheckoutBundleManifest(env, orderId, manifest) {
  if (!env.PLEDGES || !orderId || !manifest) return;
  await env.PLEDGES.put(getCheckoutBundleStorageKey(orderId), JSON.stringify(manifest), { expirationTtl: 86400 });
}

async function processFirstPartyCheckoutBundle({
  env,
  ctx,
  stripe,
  session,
  orderId,
  email,
  customerId,
  paymentMethodId,
  setupIntentId,
  shippingAddress,
  normalizedTipPercent,
  checkoutCartHash,
  checkoutSnapshotVersion,
  bundleManifest,
  markStripeEventProcessed
}) {
  if (!bundleManifest?.campaigns?.length) {
    return jsonResponse({ error: 'Missing checkout bundle data' }, 409);
  }

  if (String(checkoutSnapshotVersion || '') !== String(CHECKOUT_INTENT_VERSION)) {
    console.error('📝 Invalid first-party checkout snapshot version:', checkoutSnapshotVersion);
    return jsonResponse({ error: 'Invalid checkout snapshot version' }, 409);
  }

  const bundleHashInput = buildCheckoutBundleHashInput({
    contributions: bundleManifest.campaigns.map((entry) => ({
      campaignSlug: entry.campaignSlug,
      canonicalContribution: {
        selectedTiers: [
          ...(entry.tierId ? [{ id: entry.tierId, qty: entry.tierQty || 1 }] : []),
          ...(entry.additionalTiers || [])
        ],
        supportItems: entry.supportItems || [],
        customAmount: entry.customAmount || 0,
        hasPhysical: entry.hasPhysical === true,
        totals: entry.totals || {}
      },
      tipPercent: normalizedTipPercent
    }))
  });
  const recomputedCheckoutCartHash = await hashCheckoutBundle(bundleHashInput);
  if (recomputedCheckoutCartHash !== checkoutCartHash) {
    console.error('📝 First-party checkout cart hash mismatch:', {
      orderId,
      expectedHashPrefix: String(checkoutCartHash).slice(0, 12),
      actualHashPrefix: recomputedCheckoutCartHash.slice(0, 12)
    });
    return jsonResponse({ error: 'Checkout integrity verification failed' }, 409);
  }

  const processedCampaigns = [];
  const confirmedCampaigns = [];

  for (const entry of bundleManifest.campaigns) {
    const campaignSlug = entry.campaignSlug;
    const campaign = await getCampaign(env, campaignSlug);
    const campaignTitle = campaign?.title || campaignSlug.replace(/-/g, ' ').toUpperCase();
    const pledgeOrderId = entry.orderId || buildBundleOrderId(orderId, campaignSlug);

    const existingPledge = await env.PLEDGES.get(`pledge:${pledgeOrderId}`, { type: 'json' });
    if (existingPledge) {
      processedCampaigns.push({ orderId: pledgeOrderId, campaignSlug });
      confirmedCampaigns.push({ orderId: pledgeOrderId, campaignSlug, campaignTitle });
      continue;
    }

    const tierSelection = buildTierSelectionFromStartRequest(campaign, {
      tierId: entry.tierId || null,
      tierQty: entry.tierQty || 1,
      additionalTiers: entry.additionalTiers || []
    });
    if (!tierSelection.valid) {
      console.error('📝 Invalid tier selection in webhook bundle:', tierSelection.error);
      return jsonResponse({ error: tierSelection.error }, 409);
    }

    const thresholdValidation = await validateTierThresholdSelection(
      env,
      campaignSlug,
      campaign,
      tierSelection.selectedTiers
    );
    if (!thresholdValidation.valid) {
      console.error('📝 Threshold-gated tier rejected during bundle webhook processing:', thresholdValidation.error);
      return jsonResponse({ error: thresholdValidation.error }, 409);
    }

    const desiredSupportItems = buildDesiredSupportItems(campaign, [], entry.supportItems || []);
    if (!desiredSupportItems.valid) {
      console.error('📝 Invalid support items in webhook bundle:', desiredSupportItems.error);
      return jsonResponse({ error: desiredSupportItems.error }, 409);
    }

    const canonicalContribution = buildCanonicalContribution(env, campaign, {
      tierSelection,
      supportItems: desiredSupportItems.supportItems,
      customAmount: entry.customAmount || 0,
      tipPercent: normalizedTipPercent
    });
    if (!canonicalContribution.valid) {
      console.error('📝 Invalid pledge contribution in webhook bundle:', canonicalContribution.error);
      return jsonResponse({ error: canonicalContribution.error }, 409);
    }

    const availability = await ensureTierAvailability(
      env,
      campaignSlug,
      campaign,
      canonicalContribution.selectedTiers,
      {},
      pledgeOrderId
    );
    if (!availability.valid) {
      console.warn('📝 Inventory unavailable during bundle webhook processing:', availability.error);
      return jsonResponse({ error: availability.error }, 409);
    }

    const now = new Date().toISOString();
    const pledgeData = {
      orderId: pledgeOrderId,
      email,
      campaignSlug,
      tierId: canonicalContribution.tierId,
      tierName: canonicalContribution.tierName,
      tierQty: canonicalContribution.tierQty,
      additionalTiers: canonicalContribution.additionalTiers.length > 0 ? canonicalContribution.additionalTiers : undefined,
      supportItems: canonicalContribution.supportItems.length > 0 ? canonicalContribution.supportItems : undefined,
      customAmount: canonicalContribution.customAmount > 0 ? canonicalContribution.customAmount : undefined,
      shippingAddress: canonicalContribution.hasPhysical ? (shippingAddress || undefined) : undefined,
      subtotal: canonicalContribution.totals.subtotal,
      tax: canonicalContribution.totals.tax,
      shipping: canonicalContribution.totals.shipping,
      tipPercent: canonicalContribution.totals.tipPercent,
      tipAmount: canonicalContribution.totals.tipAmount,
      amount: canonicalContribution.totals.amount,
      stripeCustomerId: customerId,
      stripePaymentMethodId: paymentMethodId,
      stripeSetupIntentId: setupIntentId,
      pledgeStatus: 'active',
      charged: false,
      createdAt: now,
      updatedAt: now,
      history: [{
        type: 'created',
        subtotal: canonicalContribution.totals.subtotal,
        tax: canonicalContribution.totals.tax,
        shipping: canonicalContribution.totals.shipping,
        tipPercent: canonicalContribution.totals.tipPercent,
        tipAmount: canonicalContribution.totals.tipAmount,
        amount: canonicalContribution.totals.amount,
        tierId: canonicalContribution.tierId,
        tierQty: canonicalContribution.tierQty,
        additionalTiers: canonicalContribution.additionalTiers.length > 0 ? canonicalContribution.additionalTiers : undefined,
        supportItems: canonicalContribution.supportItems.length > 0 ? canonicalContribution.supportItems : undefined,
        customAmount: canonicalContribution.customAmount > 0 ? canonicalContribution.customAmount : undefined,
        at: now
      }]
    };

    const persisted = await persistNewPledge(env, {
      campaign,
      campaignSlug,
      pledgeData,
      supportItems: canonicalContribution.supportItems,
      selectedTiers: canonicalContribution.selectedTiers
    });
    if (!persisted.success) {
      console.error('📝 Failed to persist bundle pledge after webhook:', persisted.error);
      return jsonResponse({ error: persisted.error }, 409);
    }

    processedCampaigns.push({ orderId: pledgeOrderId, campaignSlug });
    confirmedCampaigns.push({ orderId: pledgeOrderId, campaignSlug, campaignTitle });

    ctx.waitUntil(
      triggerMilestoneEmails(env, campaignSlug).catch(err => {
        console.error('Milestone email trigger failed:', err.message);
      })
    );

    const token = await generateToken(env.MAGIC_LINK_SECRET, {
      orderId: pledgeOrderId,
      email,
      campaignSlug
    });

    const additionalTiersWithNames = canonicalContribution.additionalTiers.map(t => {
      const tierData = campaign?.tiers?.find(ct => ct.id === t.id);
      return { ...t, name: tierData?.name || t.id };
    });
    const supportItemsWithLabels = getSupportItemsWithLabels(campaign, canonicalContribution.supportItems);

    await sendSupporterEmail(env, {
      email,
      campaignSlug,
      campaignTitle,
      subtotal: canonicalContribution.totals.subtotal,
      tax: canonicalContribution.totals.tax,
      shipping: canonicalContribution.totals.shipping,
      tipAmount: canonicalContribution.totals.tipAmount,
      tipPercent: canonicalContribution.totals.tipPercent,
      token,
      instagramUrl: campaign?.instagram,
      hasDecisions: campaign?.has_decisions === true,
      pledgeItems: {
        tierName: canonicalContribution.tierName,
        tierQty: canonicalContribution.tierQty,
        additionalTiers: additionalTiersWithNames,
        supportItems: supportItemsWithLabels,
        customAmount: canonicalContribution.customAmount
      }
    });
  }

  await persistCheckoutBundleManifest(env, orderId, {
    ...bundleManifest,
    confirmedAt: new Date().toISOString(),
    confirmedCampaigns
  });
  await markStripeEventProcessed();
  return jsonResponse({ received: true, bundled: true, pledges: processedCampaigns });
}

async function handleStripeWebhook(request, env, ctx) {
  console.log('📨 Stripe webhook received');
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  // SEC-002: Early mode detection from raw payload to avoid signature mismatch
  // When prod worker (live mode) receives test events, the signature won't verify
  // because test events are signed with a different secret. Parse livemode early
  // and acknowledge if it doesn't match our environment.
  try {
    const parsed = JSON.parse(body);
    const isLiveEvent = parsed.livemode === true;
    const isLiveMode = getAppMode(env) === 'live';
    if (isLiveEvent !== isLiveMode) {
      console.log('📨 Skipping event (mode mismatch, pre-verification):', { 
        eventId: parsed.id, 
        eventType: parsed.type,
        isLiveEvent, 
        isLiveMode 
      });
      return jsonResponse({ received: true, skipped: 'mode mismatch' }, 200);
    }
  } catch (parseErr) {
    console.error('📨 Failed to parse webhook body for mode check:', parseErr.message);
    // Continue to signature verification which will fail properly
  }

  // SEC-002: If webhook secret is not configured, acknowledge receipt but don't process
  // This prevents Stripe from retrying indefinitely (e.g., test mode webhooks hitting prod worker)
  const webhookSecret = getStripeWebhookSecret(env);
  if (!webhookSecret) {
    console.warn('Stripe webhook secret not configured for this mode, acknowledging receipt');
    return jsonResponse({ received: true, skipped: 'webhook secret not configured' }, 200);
  }

  const { valid, error } = await verifyStripeSignature(body, sig, webhookSecret);
  if (!valid) {
    console.error('Webhook signature verification failed:', error);
    return jsonResponse({ error: 'Invalid signature' }, 401);
  }

  const event = JSON.parse(body);
  console.log('📨 Event type:', event.type);

  const eventKey = env.PLEDGES ? `stripe-event:${event.id}` : null;
  const markStripeEventProcessed = async () => {
    if (env.PLEDGES && eventKey) {
      await env.PLEDGES.put(eventKey, 'processed', { expirationTtl: 86400 });
    }
  };

  // Idempotency: skip if we've already processed this event
  if (env.PLEDGES && eventKey) {
    const alreadyProcessed = await env.PLEDGES.get(eventKey);
    if (alreadyProcessed) {
      console.log('📨 Skipping duplicate event:', event.id);
      return jsonResponse({ received: true });
    }
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    if (session.mode === 'setup') {
      const { orderId, campaignSlug, amountCents, tierId, tierName, tierQty, tipPercent, hasAdditionalTiers, hasExtras, hasPhysical, isPaymentUpdate, checkoutProvider, checkoutNonce, checkoutCartHash, checkoutSnapshotVersion } = session.metadata;
      const tierQtyNum = parseInt(tierQty) || 1;
      const normalizedTipPercent = tipPercent === undefined || tipPercent === null || tipPercent === ''
        ? 0
        : sanitizePlatformTipPercent(tipPercent, DEFAULT_PLATFORM_TIP_PERCENT);
      const email = session.customer_email || session.customer_details?.email;
      let customerId = session.customer;
      const setupIntentId = session.setup_intent;

      const bundleManifest = checkoutProvider === 'first_party'
        ? await loadCheckoutBundleManifest(env, orderId)
        : null;

      // Fetch additional tiers from KV if present
      let additionalTiers = [];
      let supportItems = [];
      let customAmount = 0;
      if (checkoutProvider === 'first_party' && bundleManifest?.campaigns?.length === 1) {
        additionalTiers = bundleManifest.campaigns[0].additionalTiers || [];
        supportItems = bundleManifest.campaigns[0].supportItems || [];
        customAmount = bundleManifest.campaigns[0].customAmount || 0;
      } else {
        if (hasAdditionalTiers === 'true' && env.PLEDGES) {
          additionalTiers = await env.PLEDGES.get(`pending-tiers:${orderId}`, { type: 'json' }) || [];
          if (additionalTiers.length > 0) {
            console.log('📨 Found additional tiers for order:', orderId, additionalTiers);
          }
        }

        if (hasExtras === 'true' && env.PLEDGES) {
          const extras = await env.PLEDGES.get(`pending-extras:${orderId}`, { type: 'json' });
          if (extras) {
            supportItems = extras.supportItems || [];
            customAmount = extras.customAmount || 0;
            console.log('📨 Found extras for order:', orderId, { supportItems, customAmount });
          }
        }
      }

      // Extract shipping address from Stripe Checkout session (collected via shipping_address_collection)
      let shippingAddress = null;
      if (hasPhysical === 'true' && session.shipping_details) {
        const sd = session.shipping_details;
        shippingAddress = {
          name: sd.name || '',
          address1: sd.address?.line1 || '',
          address2: sd.address?.line2 || '',
          city: sd.address?.city || '',
          province: sd.address?.state || '',
          postalCode: sd.address?.postal_code || '',
          country: sd.address?.country || ''
        };
        console.log('📨 Captured shipping address from Stripe session:', orderId);
      }

      const stripe = createStripeClient(getStripeKey(env));
      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      const paymentMethodId = setupIntent.payment_method;

      // Resolve customerId from SetupIntent if not on session (happens when /start
      // fell back to customer_email instead of creating a Stripe customer)
      if (!customerId && setupIntent.customer) {
        customerId = setupIntent.customer;
        console.log('📨 Resolved customerId from SetupIntent:', customerId);
      }

      // Last resort: create a customer and attach the payment method
      if (!customerId) {
        try {
          const newCustomer = await stripe.customers.create({ email });
          if (newCustomer.id) {
            await stripe.paymentMethods.attach(paymentMethodId, { customer: newCustomer.id });
            customerId = newCustomer.id;
            console.log('📨 Created fallback customer:', customerId);
          }
        } catch (custErr) {
          console.error('📨 Failed to create fallback customer:', custErr.message);
        }
      }

      if (checkoutProvider === 'first_party' && bundleManifest?.campaigns?.length > 1 && isPaymentUpdate !== 'true') {
        return processFirstPartyCheckoutBundle({
          env,
          ctx,
          stripe,
          session,
          orderId,
          email,
          customerId,
          paymentMethodId,
          setupIntentId,
          shippingAddress,
          normalizedTipPercent,
          checkoutCartHash,
          checkoutSnapshotVersion,
          bundleManifest,
          markStripeEventProcessed
        });
      }

      const campaign = await getCampaign(env, campaignSlug);
      const campaignTitle = campaign?.title || campaignSlug.replace(/-/g, ' ').toUpperCase();

      if (env.PLEDGES) {
        if (isPaymentUpdate === 'true') {
          // Payment method update: just update the payment method on existing pledge
          const existingPledge = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
          if (existingPledge) {
            const wasPaymentFailed = existingPledge.pledgeStatus === 'payment_failed';
            
            existingPledge.stripeCustomerId = customerId;
            existingPledge.stripePaymentMethodId = paymentMethodId;
            existingPledge.stripeSetupIntentId = setupIntentId;
            existingPledge.updatedAt = new Date().toISOString();
            
            // If payment was failed, reset to active
            if (wasPaymentFailed) {
              existingPledge.pledgeStatus = 'active';
              existingPledge.lastPaymentError = null;
            }
            await env.PLEDGES.put(`pledge:${orderId}`, JSON.stringify(existingPledge));
            console.log('📝 Payment method updated for pledge:', orderId);

            // Auto-retry charge if this was a failed payment and campaign is past deadline + funded
            if (wasPaymentFailed && !existingPledge.charged) {
              const pledgeCampaign = await getCampaign(env, existingPledge.campaignSlug);
              if (pledgeCampaign?.goal_deadline && isDeadlinePassed(pledgeCampaign.goal_deadline)) {
                const stats = await getCampaignStats(env, existingPledge.campaignSlug);
                const goalAmountCents = (pledgeCampaign.goal_amount || 0) * 100;
                
                if (stats.pledgedAmount >= goalAmountCents) {
                  console.log('💳 Auto-retrying charge for updated payment method:', orderId);
                  
                  try {
                    const retryStripe = createStripeClient(getStripeKey(env));
                    const paymentIntent = await retryStripe.paymentIntents.create({
                      amount: existingPledge.amount,
                      currency: 'usd',
                      customer: customerId,
                      payment_method: paymentMethodId,
                      off_session: true,
                      confirm: true,
                      metadata: {
                        orderId: existingPledge.orderId,
                        campaignSlug: existingPledge.campaignSlug,
                        email: existingPledge.email
                      }
                    });

                    if (paymentIntent.status === 'succeeded') {
                      existingPledge.charged = true;
                      existingPledge.pledgeStatus = 'charged';
                      existingPledge.chargedAt = new Date().toISOString();
                      existingPledge.stripePaymentIntentId = paymentIntent.id;
                      existingPledge.updatedAt = new Date().toISOString();
                      await env.PLEDGES.put(`pledge:${existingPledge.orderId}`, JSON.stringify(existingPledge));

                      const chargeToken = await generateToken(env.MAGIC_LINK_SECRET, {
                        orderId: existingPledge.orderId,
                        email: existingPledge.email,
                        campaignSlug: existingPledge.campaignSlug
                      });

                      // Build pledge items for email
                      const chargeCampaignTiers = pledgeCampaign?.tiers || [];
                      const chargeAdditionalTiers = (existingPledge.additionalTiers || []).map(t => {
                        const tierData = chargeCampaignTiers.find(ct => ct.id === t.id);
                        return { ...t, name: tierData?.name || t.id };
                      });
                      const chargeSupportItems = (existingPledge.supportItems || []).map(s => {
                        const itemData = pledgeCampaign?.support_items?.find(si => si.id === s.id);
                        return { ...s, label: itemData?.label || s.id };
                      });

                      await sendChargeSuccessEmail(env, {
                        email: existingPledge.email,
                        campaignSlug: existingPledge.campaignSlug,
                        campaignTitle: pledgeCampaign.title || existingPledge.campaignSlug,
                        subtotal: existingPledge.subtotal || existingPledge.amount,
                        tax: existingPledge.tax || 0,
                        shipping: existingPledge.shipping || 0,
                        tipAmount: getStoredTipAmount(existingPledge),
                        tipPercent: getStoredTipPercent(existingPledge, 0),
                        amount: existingPledge.amount,
                        token: chargeToken,
                        hasDecisions: pledgeCampaign?.has_decisions === true,
                        pledgeItems: {
                          tierName: existingPledge.tierName || null,
                          tierQty: existingPledge.tierQty || 1,
                          additionalTiers: chargeAdditionalTiers,
                          supportItems: chargeSupportItems,
                          customAmount: existingPledge.customAmount || 0
                        }
                      });
                      console.log('✅ Auto-retry charge succeeded:', orderId);
                    } else {
                      throw new Error(`Payment requires action: ${paymentIntent.status}`);
                    }
                  } catch (chargeErr) {
                    console.error('❌ Auto-retry charge failed:', chargeErr.message);
                    existingPledge.pledgeStatus = 'payment_failed';
                    existingPledge.lastPaymentError = chargeErr.message;
                    existingPledge.updatedAt = new Date().toISOString();
                    await env.PLEDGES.put(`pledge:${existingPledge.orderId}`, JSON.stringify(existingPledge));
                  }
                }
              }
            }
          }
        } else {
          // New pledge: check if already exists (webhook may be retried by Stripe)
          const existingPledge = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
          if (existingPledge) {
            await clearTierReservation(env, campaignSlug, orderId);
            await env.PLEDGES.delete(`pending-tiers:${orderId}`);
            await env.PLEDGES.delete(`pending-extras:${orderId}`);
            await env.PLEDGES.delete(getCheckoutBundleStorageKey(orderId));
            // Duplicate webhook - pledge already processed
            console.log('📝 Pledge already exists, skipping duplicate webhook:', orderId);
            await markStripeEventProcessed();
            return jsonResponse({ received: true });
          }
          
          const tierSelection = buildTierSelectionFromStartRequest(campaign, {
            tierId,
            tierQty: tierQtyNum,
            additionalTiers
          });
          if (!tierSelection.valid) {
            console.error('📝 Invalid tier selection in webhook metadata:', tierSelection.error);
            return jsonResponse({ error: tierSelection.error }, 409);
          }

          const thresholdValidation = await validateTierThresholdSelection(
            env,
            campaignSlug,
            campaign,
            tierSelection.selectedTiers
          );
          if (!thresholdValidation.valid) {
            console.error('📝 Threshold-gated tier rejected during webhook processing:', thresholdValidation.error);
            return jsonResponse({ error: thresholdValidation.error }, 409);
          }

          const desiredSupportItems = buildDesiredSupportItems(campaign, [], supportItems);
          if (!desiredSupportItems.valid) {
            console.error('📝 Invalid support items in webhook metadata:', desiredSupportItems.error);
            return jsonResponse({ error: desiredSupportItems.error }, 409);
          }

          const canonicalContribution = buildCanonicalContribution(env, campaign, {
            tierSelection,
            supportItems: desiredSupportItems.supportItems,
            customAmount,
            tipPercent: normalizedTipPercent
          });
          if (!canonicalContribution.valid) {
            console.error('📝 Invalid pledge contribution in webhook metadata:', canonicalContribution.error);
            return jsonResponse({ error: canonicalContribution.error }, 409);
          }

          if (checkoutProvider === 'first_party') {
            if (String(checkoutSnapshotVersion || '') !== String(CHECKOUT_INTENT_VERSION)) {
              console.error('📝 Invalid first-party checkout snapshot version:', checkoutSnapshotVersion);
              return jsonResponse({ error: 'Invalid checkout snapshot version' }, 409);
            }

            if (!checkoutNonce || !checkoutCartHash) {
              console.error('📝 Missing first-party checkout integrity metadata');
              return jsonResponse({ error: 'Missing checkout integrity metadata' }, 409);
            }

            const recomputedCheckoutCartHash = bundleManifest?.campaigns?.length === 1
              ? await hashCheckoutBundle(buildCheckoutBundleHashInput({
                  contributions: [{
                    campaignSlug,
                    canonicalContribution,
                    tipPercent: normalizedTipPercent
                  }]
                }))
              : await hashCheckoutContribution(buildCheckoutHashInput({
                  campaignSlug,
                  canonicalContribution,
                  tipPercent: normalizedTipPercent
                }));

            if (recomputedCheckoutCartHash !== checkoutCartHash) {
              console.error('📝 First-party checkout cart hash mismatch:', {
                orderId,
                checkoutNonce,
                expectedHashPrefix: String(checkoutCartHash).slice(0, 12),
                actualHashPrefix: recomputedCheckoutCartHash.slice(0, 12)
              });
              return jsonResponse({ error: 'Checkout integrity verification failed' }, 409);
            }
          }

          const availability = await ensureTierAvailability(
            env,
            campaignSlug,
            campaign,
            canonicalContribution.selectedTiers,
            {},
            orderId
          );
          if (!availability.valid) {
            console.warn('📝 Inventory unavailable during webhook processing:', availability.error);
            return jsonResponse({ error: availability.error }, 409);
          }

          const now = new Date().toISOString();
          const pledgeData = {
            orderId,
            email,
            campaignSlug,
            tierId: canonicalContribution.tierId,
            tierName: canonicalContribution.tierName,
            tierQty: canonicalContribution.tierQty,
            additionalTiers: canonicalContribution.additionalTiers.length > 0 ? canonicalContribution.additionalTiers : undefined,
            supportItems: canonicalContribution.supportItems.length > 0 ? canonicalContribution.supportItems : undefined,
            customAmount: canonicalContribution.customAmount > 0 ? canonicalContribution.customAmount : undefined,
            shippingAddress: shippingAddress || undefined,
            subtotal: canonicalContribution.totals.subtotal,
            tax: canonicalContribution.totals.tax,
            shipping: canonicalContribution.totals.shipping,
            tipPercent: canonicalContribution.totals.tipPercent,
            tipAmount: canonicalContribution.totals.tipAmount,
            amount: canonicalContribution.totals.amount,
            stripeCustomerId: customerId,
            stripePaymentMethodId: paymentMethodId,
            stripeSetupIntentId: setupIntentId,
            pledgeStatus: 'active',
            charged: false,
            createdAt: now,
            updatedAt: now,
            history: [{
              type: 'created',
              subtotal: canonicalContribution.totals.subtotal,
              tax: canonicalContribution.totals.tax,
              shipping: canonicalContribution.totals.shipping,
              tipPercent: canonicalContribution.totals.tipPercent,
              tipAmount: canonicalContribution.totals.tipAmount,
              amount: canonicalContribution.totals.amount,
              tierId: canonicalContribution.tierId,
              tierQty: canonicalContribution.tierQty,
              additionalTiers: canonicalContribution.additionalTiers.length > 0 ? canonicalContribution.additionalTiers : undefined,
              supportItems: canonicalContribution.supportItems.length > 0 ? canonicalContribution.supportItems : undefined,
              customAmount: canonicalContribution.customAmount > 0 ? canonicalContribution.customAmount : undefined,
              at: now
            }]
          };

          const persisted = await persistNewPledge(env, {
            campaign,
            campaignSlug,
            pledgeData,
            supportItems: canonicalContribution.supportItems,
            selectedTiers: canonicalContribution.selectedTiers
          });
          if (!persisted.success) {
            console.error('📝 Failed to persist pledge after webhook:', persisted.error);
            return jsonResponse({ error: persisted.error }, 409);
          }

          await env.PLEDGES.delete(`pending-tiers:${orderId}`);
          await env.PLEDGES.delete(`pending-extras:${orderId}`);
          if (bundleManifest?.campaigns?.length === 1) {
            await persistCheckoutBundleManifest(env, orderId, {
              ...bundleManifest,
              confirmedAt: new Date().toISOString(),
              confirmedCampaigns: [{ orderId, campaignSlug, campaignTitle }]
            });
          }

          // Check for milestone emails (async, don't block response but keep worker alive)
          ctx.waitUntil(
            triggerMilestoneEmails(env, campaignSlug).catch(err => {
              console.error('Milestone email trigger failed:', err.message);
            })
          );

          // Send supporter confirmation email
          const token = await generateToken(env.MAGIC_LINK_SECRET, {
            orderId,
            email,
            campaignSlug
          });

          const additionalTiersWithNames = canonicalContribution.additionalTiers.map(t => {
            const tierData = campaign?.tiers?.find(ct => ct.id === t.id);
            return { ...t, name: tierData?.name || t.id };
          });
          const supportItemsWithLabels = getSupportItemsWithLabels(campaign, canonicalContribution.supportItems);

          await sendSupporterEmail(env, {
            email,
            campaignSlug,
            campaignTitle,
            subtotal: canonicalContribution.totals.subtotal,
            tax: canonicalContribution.totals.tax,
            shipping: canonicalContribution.totals.shipping,
            tipAmount: canonicalContribution.totals.tipAmount,
            tipPercent: canonicalContribution.totals.tipPercent,
            token,
            instagramUrl: campaign?.instagram,
            hasDecisions: campaign?.has_decisions === true,
            pledgeItems: {
              tierName: canonicalContribution.tierName,
              tierQty: canonicalContribution.tierQty,
              additionalTiers: additionalTiersWithNames,
              supportItems: supportItemsWithLabels,
              customAmount: canonicalContribution.customAmount
            }
          });

          console.log('Pledge confirmed:', { orderId, email, campaignSlug });
        }
      }
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const paymentIntent = event.data.object;
    const { orderId, email, campaignSlug } = paymentIntent.metadata || {};
    
    if (orderId && email) {
      const campaign = await getCampaign(env, campaignSlug);
      const campaignTitle = campaign?.title || campaignSlug?.replace(/-/g, ' ').toUpperCase() || 'Unknown Campaign';
      
      // Get pledge data first for email content
      let pledgeData = null;
      if (env.PLEDGES) {
        pledgeData = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
      }
      
      const token = await generateToken(env.MAGIC_LINK_SECRET, {
        orderId,
        email,
        campaignSlug
      });

      // Build pledge items for email
      let pledgeItemsForEmail = null;
      if (pledgeData) {
        const failedCampaignTiers = campaign?.tiers || [];
        const failedAdditionalTiers = (pledgeData.additionalTiers || []).map(t => {
          const tierData = failedCampaignTiers.find(ct => ct.id === t.id);
          return { ...t, name: tierData?.name || t.id };
        });
        const failedSupportItems = (pledgeData.supportItems || []).map(s => {
          const itemData = campaign?.support_items?.find(si => si.id === s.id);
          return { ...s, label: itemData?.label || s.id };
        });
        pledgeItemsForEmail = {
          tierName: pledgeData.tierName || null,
          tierQty: pledgeData.tierQty || 1,
          additionalTiers: failedAdditionalTiers,
          supportItems: failedSupportItems,
          customAmount: pledgeData.customAmount || 0
        };
      }

      await sendPaymentFailedEmail(env, {
        email,
        campaignSlug,
        campaignTitle,
        subtotal: pledgeData?.subtotal || pledgeData?.amount || 0,
        tax: pledgeData?.tax || 0,
        shipping: pledgeData?.shipping || 0,
        tipAmount: getStoredTipAmount(pledgeData),
        tipPercent: getStoredTipPercent(pledgeData, 0),
        amount: pledgeData?.amount || 0,
        token,
        pledgeItems: pledgeItemsForEmail
      });

      if (pledgeData) {
        pledgeData.pledgeStatus = 'payment_failed';
        pledgeData.lastPaymentError = paymentIntent.last_payment_error?.message || 'Unknown error';
        pledgeData.updatedAt = new Date().toISOString();
        await env.PLEDGES.put(`pledge:${orderId}`, JSON.stringify(pledgeData));
      }
    }
  }

  await markStripeEventProcessed();
  return jsonResponse({ received: true });
}

async function handleGetPledge(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return jsonResponse({ error: 'Missing token' }, 400);
  }

  const payload = await verifyToken(env.MAGIC_LINK_SECRET, token);
  if (!payload) {
    return jsonResponse({ error: 'Invalid or expired token' }, 401);
  }

  if (env.PLEDGES) {
    const pledgeData = await env.PLEDGES.get(`pledge:${payload.orderId}`, { type: 'json' });
    if (pledgeData) {
      // Check if campaign deadline has passed
      const campaign = await getCampaign(env, pledgeData.campaignSlug);
      const deadlinePassed = campaign?.goal_deadline && isDeadlinePassed(campaign.goal_deadline);
      const canChange = pledgeData.pledgeStatus === 'active' && !pledgeData.charged && !deadlinePassed;
      
      return jsonResponse({
        orderId: pledgeData.orderId,
        email: pledgeData.email,
        campaignSlug: pledgeData.campaignSlug,
        pledgeStatus: pledgeData.pledgeStatus,
        subtotal: pledgeData.subtotal,
        tax: pledgeData.tax,
        shipping: pledgeData.shipping || 0,
        tipPercent: getStoredTipPercent(pledgeData, 0),
        tipAmount: getStoredTipAmount(pledgeData),
        amount: pledgeData.amount,
        tierId: pledgeData.tierId,
        tierName: pledgeData.tierName,
        canModify: canChange,
        canCancel: canChange,
        canUpdatePaymentMethod: !pledgeData.charged,
        deadlinePassed
      });
    }
  }

  return jsonResponse({ error: 'Pledge not found' }, 404);
}

async function handleGetPledges(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return jsonResponse({ error: 'Missing token' }, 400);
  }

  const payload = await verifyToken(env.MAGIC_LINK_SECRET, token);
  if (!payload) {
    return jsonResponse({ error: 'Invalid or expired token' }, 401);
  }

  const authorizedOrder = resolveAuthorizedOrderId(payload);
  if (!authorizedOrder.valid) {
    return jsonResponse({ error: authorizedOrder.error }, 403);
  }

  const pledges = [];

  if (env.PLEDGES) {
    const pledgeData = await env.PLEDGES.get(`pledge:${authorizedOrder.orderId}`, { type: 'json' });
    if (pledgeData && pledgeData.pledgeStatus !== 'cancelled') {
      const campaign = await getCampaign(env, pledgeData.campaignSlug);
      const deadlinePassed = campaign?.goal_deadline && isDeadlinePassed(campaign.goal_deadline);
      const canChange = pledgeData.pledgeStatus === 'active' && !pledgeData.charged && !deadlinePassed;

      pledges.push({
        orderId: pledgeData.orderId,
        email: pledgeData.email,
        campaignSlug: pledgeData.campaignSlug,
        pledgeStatus: pledgeData.pledgeStatus,
        subtotal: pledgeData.subtotal,
        tax: pledgeData.tax,
        shipping: pledgeData.shipping || 0,
        tipPercent: getStoredTipPercent(pledgeData, 0),
        tipAmount: getStoredTipAmount(pledgeData),
        amount: pledgeData.amount,
        tierId: pledgeData.tierId,
        tierName: pledgeData.tierName,
        tierQty: pledgeData.tierQty || 1,
        additionalTiers: pledgeData.additionalTiers || [],
        supportItems: pledgeData.supportItems || [],
        customAmount: pledgeData.customAmount || 0,
        shippingAddress: pledgeData.shippingAddress || null,
        canModify: canChange,
        canCancel: canChange,
        canUpdatePaymentMethod: !pledgeData.charged,
        deadlinePassed
      });
    }
  }

  return jsonResponse(pledges);
}

async function handleCancelPledge(request, env) {
  const body = await request.json();
  const { token, orderId } = body;

  if (!token) {
    return jsonResponse({ error: 'Missing token' }, 400);
  }

  const payload = await verifyToken(env.MAGIC_LINK_SECRET, token);
  if (!payload) {
    return jsonResponse({ error: 'Invalid or expired token' }, 401);
  }

  const authorizedOrder = resolveAuthorizedOrderId(payload, orderId);
  if (!authorizedOrder.valid) {
    return jsonResponse({ error: authorizedOrder.error }, 403);
  }
  const targetOrderId = authorizedOrder.orderId;

  let cancelledPledgeData = null;
  
  if (env.PLEDGES) {
    const pledgeData = await env.PLEDGES.get(`pledge:${targetOrderId}`, { type: 'json' });
    if (pledgeData) {
      if (pledgeData.email.toLowerCase() !== payload.email.toLowerCase()) {
        return jsonResponse({ error: 'Unauthorized' }, 403);
      }
      
      if (pledgeData.charged) {
        return jsonResponse({ error: 'Cannot cancel - pledge has been charged' }, 400);
      }
      
      // Check if campaign deadline has passed
      const campaign = await getCampaign(env, pledgeData.campaignSlug);
      if (campaign?.goal_deadline && isDeadlinePassed(campaign.goal_deadline)) {
        return jsonResponse({ error: 'Cannot cancel - campaign deadline has passed' }, 400);
      }
      
      // Store for stats update
      cancelledPledgeData = { ...pledgeData };
      
      const now = new Date().toISOString();
      pledgeData.pledgeStatus = 'cancelled';
      pledgeData.cancelledAt = now;
      pledgeData.updatedAt = now;
      
      // Append cancellation to history
      const cancelSubtotal = pledgeData.subtotal || pledgeData.amount || 0;
      const cancelTax = pledgeData.tax || 0;
      const cancelShipping = pledgeData.shipping || 0;
      const cancelTipPercent = getStoredTipPercent(pledgeData, 0);
      const cancelTipAmount = getStoredTipAmount(pledgeData);
      const cancelAmount = pledgeData.amount || 0;
      if (!pledgeData.history) {
        pledgeData.history = [{
          type: 'created',
          subtotal: cancelSubtotal,
          tax: cancelTax,
          shipping: cancelShipping,
          tipPercent: cancelTipPercent,
          tipAmount: cancelTipAmount,
          amount: cancelAmount,
          tierId: pledgeData.tierId,
          tierQty: pledgeData.tierQty || 1,
          additionalTiers: pledgeData.additionalTiers,
          customAmount: pledgeData.customAmount || undefined,
          at: pledgeData.createdAt
        }];
      }
      pledgeData.history.push({
        type: 'cancelled',
        subtotalDelta: -cancelSubtotal,
        taxDelta: -cancelTax,
        shippingDelta: -cancelShipping,
        tipPercent: cancelTipPercent,
        tipAmountDelta: -cancelTipAmount,
        amountDelta: -cancelAmount,
        customAmount: pledgeData.customAmount || undefined,
        at: now
      });
      
      await env.PLEDGES.put(`pledge:${targetOrderId}`, JSON.stringify(pledgeData));

      await removeFromCampaignIndex(env, pledgeData.campaignSlug, targetOrderId);

      // Update live stats (use subtotal for goal tracking)
      await removePledgeFromStats(env, {
        campaignSlug: pledgeData.campaignSlug,
        amount: pledgeData.subtotal || pledgeData.amount || 0,
        tierId: pledgeData.tierId,
        tierQty: pledgeData.tierQty || 1,
        additionalTiers: pledgeData.additionalTiers || [],
        supportItems: pledgeData.supportItems || [],
        customAmount: pledgeData.customAmount || 0
      });

      // Release tier inventory
      if (pledgeData.tierId) {
        await releaseTierInventory(env, pledgeData.campaignSlug, pledgeData.tierId, pledgeData.tierQty || 1);
        console.log('📦 Tier inventory released:', pledgeData.tierId);
      }
      // Also release additional tiers (multi-tier mode)
      if (pledgeData.additionalTiers) {
        for (const addTier of pledgeData.additionalTiers) {
          await releaseTierInventory(env, pledgeData.campaignSlug, addTier.id, addTier.qty || 1);
          console.log('📦 Additional tier inventory released:', addTier.id);
        }
      }
      
      // Update email mapping - check if user has other active pledges
      const emailKey = `email:${pledgeData.email.toLowerCase()}`;
      const existingOrders = await env.PLEDGES.get(emailKey, { type: 'json' }) || [];
      
      // Remove this order from the list
      const updatedOrders = existingOrders.filter(id => id !== targetOrderId);
      
      // Check remaining orders for active pledges
      let hasActivePledges = false;
      for (const otherId of updatedOrders) {
        const otherPledge = await env.PLEDGES.get(`pledge:${otherId}`, { type: 'json' });
        if (otherPledge && otherPledge.pledgeStatus !== 'cancelled') {
          hasActivePledges = true;
          break;
        }
      }
      
      if (hasActivePledges) {
        // Keep the email mapping but with updated order list
        await env.PLEDGES.put(emailKey, JSON.stringify(updatedOrders));
        console.log('📧 Email mapping updated (user has other active pledges):', emailKey);
      } else {
        // Remove email mapping entirely - user loses Community access
        await env.PLEDGES.delete(emailKey);
        console.log('📧 Email mapping removed (no active pledges):', emailKey);
      }
      
      // Send cancellation confirmation email (reuse campaign from deadline check)
      const campaignTitle = campaign?.title || pledgeData.campaignSlug.replace(/-/g, ' ').toUpperCase();
      
      try {
        await sendPledgeCancelledEmail(env, {
          email: pledgeData.email,
          campaignSlug: pledgeData.campaignSlug,
          campaignTitle,
          subtotal: cancelSubtotal,
          tax: cancelTax,
          shipping: cancelShipping,
          tipAmount: cancelTipAmount,
          tipPercent: cancelTipPercent,
          amount: cancelAmount
        });
        console.log('📧 Cancellation email sent to:', pledgeData.email);
      } catch (emailErr) {
        console.error('📧 Failed to send cancellation email:', emailErr.message);
        // Don't fail the cancellation if email fails
      }
      
      // KV pledge found and cancelled - we're done
      return jsonResponse({
        success: true,
        message: 'Pledge cancelled'
      });
    }
  }

  // No KV pledge found - this shouldn't happen for new pledges
  return jsonResponse({ error: 'Pledge not found' }, 404);
}

async function handleModifyPledge(request, env) {
  const body = await request.json();
  const { token, orderId, newTierId, newTierQty, addTiers, supportItems, customAmount, tipPercent } = body;

  if (!token) {
    return jsonResponse({ error: 'Missing token' }, 400);
  }

  // Must have at least one change
  const hasTierChange = newTierId !== null && newTierId !== undefined;
  const hasQtyChange = newTierQty !== null && newTierQty !== undefined;
  const hasAddTiersPayload = Array.isArray(addTiers); // addTiers was passed (even if empty = tier removal)
  const hasSupportChange = Array.isArray(supportItems) && supportItems.length > 0;
  const hasCustomAmountChange = customAmount !== null && customAmount !== undefined;
  const hasTipChange = tipPercent !== null && tipPercent !== undefined;

  if (!hasTierChange && !hasQtyChange && !hasAddTiersPayload && !hasSupportChange && !hasCustomAmountChange && !hasTipChange) {
    return jsonResponse({ error: 'No changes specified' }, 400);
  }

  const payload = await verifyToken(env.MAGIC_LINK_SECRET, token);
  if (!payload) {
    return jsonResponse({ error: 'Invalid or expired token' }, 401);
  }

  const authorizedOrder = resolveAuthorizedOrderId(payload, orderId);
  if (!authorizedOrder.valid) {
    return jsonResponse({ error: authorizedOrder.error }, 403);
  }
  const targetOrderId = authorizedOrder.orderId;
  let currentPledge = null;
  let campaignSlug = payload.campaignSlug;
  let currentTipPercent = 0;

  if (env.PLEDGES) {
    const pledgeData = await env.PLEDGES.get(`pledge:${targetOrderId}`, { type: 'json' });
    if (pledgeData) {
      if (pledgeData.email.toLowerCase() !== payload.email.toLowerCase()) {
        return jsonResponse({ error: 'Unauthorized' }, 403);
      }
      
      if (pledgeData.charged) {
        return jsonResponse({ error: 'Cannot modify - pledge has been charged' }, 400);
      }
      
      currentPledge = pledgeData;
      campaignSlug = pledgeData.campaignSlug || campaignSlug;
      currentTipPercent = getStoredTipPercent(pledgeData, 0);
    }
  }

  const { valid, error, campaign } = await isCampaignLive(env, campaignSlug);
  if (!valid) {
    return jsonResponse({ error: error || 'Campaign no longer accepting pledges' }, 400);
  }

  if (!currentPledge) {
    return jsonResponse({ error: 'Pledge not found' }, 404);
  }

  const normalizedTipPercent = hasTipChange
    ? sanitizePlatformTipPercent(tipPercent, currentTipPercent)
    : currentTipPercent;
  const currentTierSelection = getPledgeTierSelections(currentPledge, campaign);
  if (!currentTierSelection.valid) {
    return jsonResponse({ error: currentTierSelection.error }, 400);
  }

  const desiredTierSelection = buildTierSelectionFromModifyRequest(campaign, currentPledge, {
    newTierId,
    newTierQty,
    addTiers
  });
  if (!desiredTierSelection.valid) {
    return jsonResponse({ error: desiredTierSelection.error }, 400);
  }

  const thresholdValidation = await validateTierThresholdSelection(
    env,
    campaignSlug,
    campaign,
    desiredTierSelection.selectedTiers,
    currentTierSelection.selectedTiers
  );
  if (!thresholdValidation.valid) {
    return jsonResponse({ error: thresholdValidation.error }, 400);
  }

  const desiredSupportItems = buildDesiredSupportItems(
    campaign,
    currentPledge.supportItems || [],
    hasSupportChange ? supportItems : null
  );
  if (!desiredSupportItems.valid) {
    return jsonResponse({ error: desiredSupportItems.error }, 400);
  }

  const canonicalContribution = buildCanonicalContribution(env, campaign, {
    tierSelection: desiredTierSelection,
    supportItems: desiredSupportItems.supportItems,
    customAmount: hasCustomAmountChange ? customAmount : (currentPledge.customAmount || 0),
    tipPercent: normalizedTipPercent
  });
  if (!canonicalContribution.valid) {
    return jsonResponse({ error: canonicalContribution.error }, 400);
  }

  const availability = await ensureTierAvailability(
    env,
    campaignSlug,
    campaign,
    canonicalContribution.selectedTiers,
    getTierQuantityMap(currentTierSelection.selectedTiers)
  );
  if (!availability.valid) {
    return jsonResponse({ error: availability.error, remaining: availability.remaining }, 400);
  }

  // Track updated pledge data for email
  let updatedPledgeData = null;

  // Update in KV
  if (env.PLEDGES) {
    const pledgeData = await env.PLEDGES.get(`pledge:${targetOrderId}`, { type: 'json' });
    if (pledgeData) {
      const originalPledgeData = JSON.parse(JSON.stringify(pledgeData));
      const inventoryUpdate = await applyTierInventoryChanges(
        env,
        campaignSlug,
        campaign,
        currentTierSelection.selectedTiers,
        canonicalContribution.selectedTiers
      );
      if (!inventoryUpdate.success) {
        return jsonResponse({ error: inventoryUpdate.error }, 409);
      }

      const now = new Date().toISOString();
      const nextPledgeData = {
        ...pledgeData,
        previousTierId: hasTierChange ? pledgeData.tierId : pledgeData.previousTierId,
        tierId: canonicalContribution.tierId,
        tierName: canonicalContribution.tierName,
        tierQty: canonicalContribution.tierQty,
        additionalTiers: canonicalContribution.additionalTiers.length > 0 ? canonicalContribution.additionalTiers : [],
        supportItems: canonicalContribution.supportItems.length > 0 ? canonicalContribution.supportItems : [],
        customAmount: canonicalContribution.customAmount > 0 ? canonicalContribution.customAmount : 0,
        subtotal: canonicalContribution.totals.subtotal,
        tax: canonicalContribution.totals.tax,
        shipping: canonicalContribution.totals.shipping,
        tipPercent: canonicalContribution.totals.tipPercent,
        tipAmount: canonicalContribution.totals.tipAmount,
        amount: canonicalContribution.totals.amount,
        modifiedAt: now,
        updatedAt: now
      };

      const previousSubtotal = currentPledge?.subtotal ?? currentPledge?.amount ?? 0;
      const previousTax = currentPledge?.tax ?? 0;
      const previousShipping = currentPledge?.shipping ?? 0;
      const previousTipAmount = getStoredTipAmount(currentPledge);
      const previousAmount = currentPledge?.amount ?? 0;

      if (!nextPledgeData.history) {
        nextPledgeData.history = [{
          type: 'created',
          subtotal: previousSubtotal,
          tax: previousTax,
          shipping: previousShipping,
          tipPercent: currentTipPercent,
          tipAmount: previousTipAmount,
          amount: previousAmount,
          tierId: originalPledgeData.tierId,
          tierQty: originalPledgeData.tierQty || 1,
          additionalTiers: originalPledgeData.additionalTiers?.length > 0 ? originalPledgeData.additionalTiers : undefined,
          customAmount: originalPledgeData.customAmount || undefined,
          at: originalPledgeData.createdAt
        }];
      }

      nextPledgeData.history.push({
        type: 'modified',
        subtotalDelta: canonicalContribution.totals.subtotal - previousSubtotal,
        taxDelta: canonicalContribution.totals.tax - previousTax,
        shippingDelta: canonicalContribution.totals.shipping - previousShipping,
        tipPercent: canonicalContribution.totals.tipPercent,
        tipAmount: canonicalContribution.totals.tipAmount,
        tipAmountDelta: canonicalContribution.totals.tipAmount - previousTipAmount,
        amountDelta: canonicalContribution.totals.amount - previousAmount,
        tierId: nextPledgeData.tierId,
        tierQty: nextPledgeData.tierQty,
        additionalTiers: nextPledgeData.additionalTiers.length > 0 ? nextPledgeData.additionalTiers : undefined,
        customAmount: nextPledgeData.customAmount || undefined,
        at: now
      });

      let pledgeStored = false;
      let statsReconciled = false;

      try {
        await env.PLEDGES.put(`pledge:${targetOrderId}`, JSON.stringify(nextPledgeData));
        pledgeStored = true;

        await recalculateStats(env, campaignSlug);
        statsReconciled = true;

        updatedPledgeData = nextPledgeData;
      } catch (err) {
        console.error('Failed to persist pledge modification:', err.message);

        if (pledgeStored) {
          await env.PLEDGES.put(`pledge:${targetOrderId}`, JSON.stringify(originalPledgeData));
        }

        if (pledgeStored || statsReconciled) {
          await recalculateStats(env, campaignSlug);
        }

        await applyTierInventoryChanges(
          env,
          campaignSlug,
          campaign,
          canonicalContribution.selectedTiers,
          currentTierSelection.selectedTiers
        );

        return jsonResponse({ error: 'Failed to modify pledge' }, 500);
      }
    }
  }

  // Send confirmation email (use subtotals without tax for clarity)
  const previousSubtotal = currentPledge?.subtotal ?? currentPledge?.amount ?? 0;
  const previousTax = currentPledge?.tax ?? 0;
  const previousShipping = currentPledge?.shipping ?? 0;
  const previousTipAmount = getStoredTipAmount(currentPledge);
  if (
    previousSubtotal !== canonicalContribution.totals.subtotal ||
    previousTax !== canonicalContribution.totals.tax ||
    previousShipping !== canonicalContribution.totals.shipping ||
    previousTipAmount !== canonicalContribution.totals.tipAmount
  ) {
    try {
      const campaignTitle = campaign?.title || campaignSlug.replace(/-/g, ' ').toUpperCase();
      const emailToken = await generateToken(env.MAGIC_LINK_SECRET, {
        orderId: targetOrderId,
        email: payload.email,
        campaignSlug
      });

      // Build pledge items for email display
      let pledgeItemsForEmail = null;
      if (updatedPledgeData) {
        const additionalTiersWithNames = (updatedPledgeData.additionalTiers || []).map(t => {
          const tierData = campaign?.tiers?.find(ct => ct.id === t.id);
          return { ...t, name: tierData?.name || t.id };
        });
        const supportItemsWithLabels = getSupportItemsWithLabels(campaign, updatedPledgeData.supportItems || []);
        pledgeItemsForEmail = {
          tierName: updatedPledgeData.tierName || null,
          tierQty: updatedPledgeData.tierQty || 1,
          additionalTiers: additionalTiersWithNames,
          supportItems: supportItemsWithLabels,
          customAmount: updatedPledgeData.customAmount || 0
        };
      }

      await sendPledgeModifiedEmail(env, {
        email: payload.email,
        campaignSlug,
        campaignTitle,
        previousSubtotal,
        previousTax,
        previousShipping,
        previousTipAmount,
        newSubtotal: canonicalContribution.totals.subtotal,
        tax: canonicalContribution.totals.tax,
        shipping: canonicalContribution.totals.shipping,
        tipAmount: canonicalContribution.totals.tipAmount,
        tipPercent: canonicalContribution.totals.tipPercent,
        token: emailToken,
        instagramUrl: campaign?.instagram,
        pledgeItems: pledgeItemsForEmail
      });
    } catch (err) {
      console.error('Failed to send modification email:', err.message);
    }
  }

  return jsonResponse({
    success: true,
    message: 'Pledge modified',
    newTier: canonicalContribution.tierId ? {
      id: canonicalContribution.tierId,
      name: canonicalContribution.tierName,
      price: campaign?.tiers?.find(tier => tier.id === canonicalContribution.tierId)?.price || 0
    } : null,
    tierQty: canonicalContribution.tierQty,
    previousSubtotal: currentPledge?.subtotal || currentPledge?.amount,
    previousAmount: currentPledge?.amount || 0,
    previousTipAmount,
    subtotal: canonicalContribution.totals.subtotal,
    tax: canonicalContribution.totals.tax,
    shipping: canonicalContribution.totals.shipping,
    tipPercent: canonicalContribution.totals.tipPercent,
    tipAmount: canonicalContribution.totals.tipAmount,
    newAmount: canonicalContribution.totals.amount,
    campaignSlug
  });
}

async function handleUpdatePaymentMethod(request, env) {
  const body = await request.json();
  const { token } = body;

  if (!token) {
    return jsonResponse({ error: 'Missing token' }, 400);
  }

  const payload = await verifyToken(env.MAGIC_LINK_SECRET, token);
  if (!payload) {
    return jsonResponse({ error: 'Invalid or expired token' }, 401);
  }

  let existingCustomerId = null;

  if (env.PLEDGES) {
    const pledgeData = await env.PLEDGES.get(`pledge:${payload.orderId}`, { type: 'json' });
    if (pledgeData?.stripeCustomerId) {
      existingCustomerId = pledgeData.stripeCustomerId;
    }
  }

  const stripe = createStripeClient(getStripeKey(env));
  
  const sessionParams = {
    mode: 'setup',
    payment_method_types: ['card'],
    success_url: `${env.SITE_BASE}/manage/?t=${token}`,
    cancel_url: `${env.SITE_BASE}/manage/?t=${token}`,
    metadata: {
      orderId: payload.orderId,
      campaignSlug: payload.campaignSlug,
      email: payload.email,
      isPaymentUpdate: 'true'
    }
  };

  // Try with existing customer, fall back to email if customer doesn't exist
  if (existingCustomerId) {
    try {
      await stripe.customers.retrieve(existingCustomerId);
      sessionParams.customer = existingCustomerId;
    } catch (err) {
      console.log('Customer not found, using email instead:', existingCustomerId);
      sessionParams.customer_email = payload.email;
    }
  } else {
    sessionParams.customer_email = payload.email;
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      console.error('Stripe session has no URL:', JSON.stringify(session, null, 2));
      return jsonResponse({ error: 'Failed to create checkout session' }, 500);
    }

    return jsonResponse({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout session error:', err);
    return jsonResponse({ error: `Stripe error: ${err.message || 'Unknown error'}` }, 500);
  }
}

/**
 * Core settle logic - charge all active pledges for a campaign
 * Aggregates by email so each supporter gets ONE charge for their total
 * Returns results object with supportersCharged, pledgesCharged, etc.
 */
async function settleCampaign(campaignSlug, env, options = {}) {
  const { dryRun = false } = options;
  
  const campaign = await getCampaign(env, campaignSlug);
  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (!env.PLEDGES) {
    throw new Error('PLEDGES KV not configured');
  }

  const stripe = createStripeClient(getStripeKey(env));
  const orderIds = await getCampaignOrderIds(env, campaignSlug);
  if (!orderIds) {
    throw new Error(`Campaign pledge index missing for ${campaignSlug}. Run /admin/rebuild/${campaignSlug} first.`);
  }
  
  // Aggregate pledges by email - one charge per supporter
  const pledgesByEmail = {};
  let skippedNoCustomer = 0;

  for (const orderId of orderIds) {
    const pledge = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
    if (pledge && 
        pledge.campaignSlug === campaignSlug && 
        pledge.pledgeStatus === 'active' &&
        !pledge.charged &&
        pledge.stripePaymentMethodId) {
      
      if (!pledge.stripeCustomerId) {
        console.error(`❌ Skipping pledge ${pledge.orderId}: missing stripeCustomerId (run /admin/backfill-customers/${campaignSlug} first)`);
        skippedNoCustomer++;
        continue;
      }

      const email = pledge.email.toLowerCase();
      if (!pledgesByEmail[email]) {
        pledgesByEmail[email] = {
          pledges: [],
          totalAmount: 0,
          customerId: null,
          paymentMethodId: null,
          latestUpdated: null
        };
      }
      
      pledgesByEmail[email].pledges.push(pledge);
      pledgesByEmail[email].totalAmount += pledge.amount || 0;
      
      // Use the most recently updated payment method for this email
      const pledgeUpdated = new Date(pledge.updatedAt || pledge.createdAt);
      if (!pledgesByEmail[email].latestUpdated || pledgeUpdated > pledgesByEmail[email].latestUpdated) {
        pledgesByEmail[email].latestUpdated = pledgeUpdated;
        pledgesByEmail[email].customerId = pledge.stripeCustomerId;
        pledgesByEmail[email].paymentMethodId = pledge.stripePaymentMethodId;
      }
    }
  }

  const supportersToCharge = Object.entries(pledgesByEmail).map(([email, data]) => ({
    email,
    pledges: data.pledges,
    totalAmount: data.totalAmount,
    customerId: data.customerId,
    paymentMethodId: data.paymentMethodId
  }));

  if (dryRun) {
    return {
      dryRun: true,
      campaignSlug,
      skippedNoCustomer,
      supporterCount: supportersToCharge.length,
      pledgeCount: supportersToCharge.reduce((sum, s) => sum + s.pledges.length, 0),
      totalAmount: supportersToCharge.reduce((sum, s) => sum + s.totalAmount, 0),
      supporters: supportersToCharge.map(s => ({
        email: s.email,
        totalAmount: s.totalAmount,
        pledgeCount: s.pledges.length,
        orderIds: s.pledges.map(p => p.orderId)
      }))
    };
  }

  const campaignTitle = campaign.title || campaignSlug.replace(/-/g, ' ').toUpperCase();
  
  const results = { 
    campaignSlug,
    supportersCharged: 0,
    supportersFailed: 0,
    skippedNoCustomer,
    pledgesCharged: 0, 
    errors: [],
    totalCharged: 0
  };

  for (const supporter of supportersToCharge) {
    try {
      // Create ONE PaymentIntent for all pledges from this supporter
      const paymentIntent = await stripe.paymentIntents.create({
        amount: supporter.totalAmount,
        currency: 'usd',
        customer: supporter.customerId,
        payment_method: supporter.paymentMethodId,
        off_session: true,
        confirm: true,
        metadata: {
          campaignSlug,
          email: supporter.email,
          pledgeCount: supporter.pledges.length.toString(),
          orderIds: supporter.pledges.map(p => p.orderId).join(',')
        }
      });

      if (paymentIntent.status === 'succeeded') {
        const chargedAt = new Date().toISOString();
        
        // Update ALL pledges for this supporter as charged
        for (const pledge of supporter.pledges) {
          pledge.charged = true;
          pledge.pledgeStatus = 'charged';
          pledge.chargedAt = chargedAt;
          pledge.stripePaymentIntentId = paymentIntent.id;
          pledge.updatedAt = chargedAt;
          await env.PLEDGES.put(`pledge:${pledge.orderId}`, JSON.stringify(pledge));
        }

        // Send ONE success email per supporter
        try {
          const token = await generateToken(env.MAGIC_LINK_SECRET, {
            orderId: supporter.pledges[0].orderId,
            email: supporter.email,
            campaignSlug
          });

          // Calculate combined subtotal and tax from all pledges
          let combinedSubtotal = 0;
          let combinedTax = 0;
          let combinedShipping = 0;
          let combinedTipAmount = 0;
          const combinedItems = { tierName: null, tierQty: 0, additionalTiers: [], supportItems: [], customAmount: 0 };
          
          for (const pledge of supporter.pledges) {
            combinedSubtotal += pledge.subtotal || pledge.amount || 0;
            combinedTax += pledge.tax || 0;
            combinedShipping += pledge.shipping || 0;
            combinedTipAmount += getStoredTipAmount(pledge);
            
            // Merge tier items
            if (pledge.tierName) {
              if (!combinedItems.tierName) {
                combinedItems.tierName = pledge.tierName;
                combinedItems.tierQty = pledge.tierQty || 1;
              } else if (combinedItems.tierName === pledge.tierName) {
                combinedItems.tierQty += pledge.tierQty || 1;
              } else {
                // Different main tier - add as additional
                const existingTier = combinedItems.additionalTiers.find(t => t.name === pledge.tierName);
                if (existingTier) {
                  existingTier.qty += pledge.tierQty || 1;
                } else {
                  combinedItems.additionalTiers.push({ name: pledge.tierName, qty: pledge.tierQty || 1 });
                }
              }
            }
            
            // Merge additional tiers
            for (const addTier of (pledge.additionalTiers || [])) {
              const tierData = campaign?.tiers?.find(t => t.id === addTier.id);
              const tierName = tierData?.name || addTier.id;
              const existingTier = combinedItems.additionalTiers.find(t => t.name === tierName);
              if (existingTier) {
                existingTier.qty += addTier.qty || 1;
              } else {
                combinedItems.additionalTiers.push({ name: tierName, qty: addTier.qty || 1 });
              }
            }
            
            // Merge support items
            for (const supportItem of (pledge.supportItems || [])) {
              const itemData = campaign?.support_items?.find(si => si.id === supportItem.id);
              const label = itemData?.label || supportItem.id;
              const existingItem = combinedItems.supportItems.find(s => s.label === label);
              if (existingItem) {
                existingItem.amount += supportItem.amount || 0;
              } else {
                combinedItems.supportItems.push({ label, amount: supportItem.amount || 0 });
              }
            }
            
            // Sum custom amounts
            combinedItems.customAmount += pledge.customAmount || 0;
          }

          await sendChargeSuccessEmail(env, {
            email: supporter.email,
            campaignSlug,
            campaignTitle,
            subtotal: combinedSubtotal,
            tax: combinedTax,
            shipping: combinedShipping,
            tipAmount: combinedTipAmount,
            tipPercent: derivePlatformTipPercent(combinedSubtotal, combinedTipAmount, 0),
            amount: supporter.totalAmount,
            token,
            hasDecisions: campaign?.has_decisions === true,
            pledgeItems: combinedItems
          });
        } catch (emailErr) {
          console.error('Failed to send charge success email:', emailErr.message);
        }

        results.supportersCharged++;
        results.pledgesCharged += supporter.pledges.length;
        results.totalCharged += supporter.totalAmount;
      } else if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_payment_method') {
        throw new Error(`Payment requires action: ${paymentIntent.status}`);
      }
    } catch (err) {
      results.supportersFailed++;
      results.errors.push({ 
        email: supporter.email,
        totalAmount: supporter.totalAmount,
        pledgeCount: supporter.pledges.length,
        orderIds: supporter.pledges.map(p => p.orderId),
        error: err.message 
      });

      // Update ALL pledges for this supporter as failed
      for (const pledge of supporter.pledges) {
        pledge.pledgeStatus = 'payment_failed';
        pledge.lastPaymentError = err.message;
        pledge.updatedAt = new Date().toISOString();
        await env.PLEDGES.put(`pledge:${pledge.orderId}`, JSON.stringify(pledge));
      }

      // Send payment failed email so supporter can update their payment method
      try {
        const token = await generateToken(env.MAGIC_LINK_SECRET, {
          orderId: supporter.pledges[0].orderId,
          email: supporter.email,
          campaignSlug
        });

        // Calculate combined subtotal, tax, and items for failed payment email
        let failedSubtotal = 0;
        let failedTax = 0;
        let failedShipping = 0;
        let failedTipAmount = 0;
        const failedItems = { tierName: null, tierQty: 0, additionalTiers: [], supportItems: [], customAmount: 0 };
        
        for (const pledge of supporter.pledges) {
          failedSubtotal += pledge.subtotal || pledge.amount || 0;
          failedTax += pledge.tax || 0;
          failedShipping += pledge.shipping || 0;
          failedTipAmount += getStoredTipAmount(pledge);
          
          if (pledge.tierName) {
            if (!failedItems.tierName) {
              failedItems.tierName = pledge.tierName;
              failedItems.tierQty = pledge.tierQty || 1;
            } else if (failedItems.tierName === pledge.tierName) {
              failedItems.tierQty += pledge.tierQty || 1;
            } else {
              const existingTier = failedItems.additionalTiers.find(t => t.name === pledge.tierName);
              if (existingTier) {
                existingTier.qty += pledge.tierQty || 1;
              } else {
                failedItems.additionalTiers.push({ name: pledge.tierName, qty: pledge.tierQty || 1 });
              }
            }
          }
          
          for (const addTier of (pledge.additionalTiers || [])) {
            const tierData = campaign?.tiers?.find(t => t.id === addTier.id);
            const tierName = tierData?.name || addTier.id;
            const existingTier = failedItems.additionalTiers.find(t => t.name === tierName);
            if (existingTier) {
              existingTier.qty += addTier.qty || 1;
            } else {
              failedItems.additionalTiers.push({ name: tierName, qty: addTier.qty || 1 });
            }
          }
          
          for (const supportItem of (pledge.supportItems || [])) {
            const itemData = campaign?.support_items?.find(si => si.id === supportItem.id);
            const label = itemData?.label || supportItem.id;
            const existingItem = failedItems.supportItems.find(s => s.label === label);
            if (existingItem) {
              existingItem.amount += supportItem.amount || 0;
            } else {
              failedItems.supportItems.push({ label, amount: supportItem.amount || 0 });
            }
          }
          
          failedItems.customAmount += pledge.customAmount || 0;
        }

        await sendPaymentFailedEmail(env, {
          email: supporter.email,
          campaignSlug,
          campaignTitle,
          subtotal: failedSubtotal,
          tax: failedTax,
          shipping: failedShipping,
          tipAmount: failedTipAmount,
          tipPercent: derivePlatformTipPercent(failedSubtotal, failedTipAmount, 0),
          amount: supporter.totalAmount,
          token,
          pledgeItems: failedItems
        });
        console.log('📧 Sent payment failed email to:', supporter.email);
      } catch (emailErr) {
        console.error('Failed to send payment failed email:', emailErr.message);
      }
    }
  }

  return results;
}

/**
 * Admin: Settle campaign - charge all pledges if funded and deadline passed
 */
async function handleSettleCampaign(request, campaignSlug, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  if (!campaignSlug) {
    return jsonResponse({ error: 'Missing campaign slug' }, 400);
  }

  const campaign = await getCampaign(env, campaignSlug);
  if (!campaign) {
    return jsonResponse({ error: 'Campaign not found' }, 404);
  }

  const stats = await getCampaignStats(env, campaignSlug);
  const goalAmountCents = (campaign.goal_amount || 0) * 100;

  // Check if campaign is funded
  if (stats.pledgedAmount < goalAmountCents) {
    return jsonResponse({ 
      error: 'Campaign not funded',
      pledgedAmount: stats.pledgedAmount,
      goalAmount: goalAmountCents
    }, 400);
  }

  // Check if deadline has passed (Mountain Time)
  if (campaign.goal_deadline) {
    if (!isDeadlinePassed(campaign.goal_deadline)) {
      const deadline = getDeadlineMT(campaign.goal_deadline);
      return jsonResponse({ 
        error: 'Deadline has not passed yet',
        deadline: deadline.toISOString(),
        deadlineMT: campaign.goal_deadline + ' 23:59:59 MT',
        now: new Date().toISOString()
      }, 400);
    }
  }

  const body = await request.json().catch(() => ({}));
  const dryRun = body.dryRun === true;

  try {
    const results = await settleCampaign(campaignSlug, env, { dryRun });
    
    if (dryRun) {
      return jsonResponse(results);
    }
    
    // Only mark settlement complete if every active pledge was chargeable.
    if (
      results.supportersCharged > 0 &&
      results.supportersFailed === 0 &&
      (results.skippedNoCustomer || 0) === 0 &&
      env.PLEDGES
    ) {
      await env.PLEDGES.put(`campaign-charged:${campaignSlug}`, new Date().toISOString());
    }
    
    return jsonResponse({
      success: true,
      ...results
    });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

/**
 * Dispatch batched settlement for a campaign.
 * Reads the campaign pledge index, splits into batches of 6,
 * processes one batch, then self-invokes for the next batch.
 * Each invocation gets its own 50-subrequest budget.
 */
async function handleSettleDispatch(request, campaignSlug, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  if (!campaignSlug || !env.PLEDGES) {
    return jsonResponse({ error: 'Missing campaign slug or PLEDGES not configured' }, 400);
  }

  const BATCH_SIZE = 6;

  // Check if already fully settled
  const settledMarker = await env.PLEDGES.get(`campaign-charged:${campaignSlug}`);
  if (settledMarker) {
    return jsonResponse({ message: 'Campaign already settled', campaignSlug, settledAt: settledMarker });
  }

  // Load or initialize settlement job
  const jobKey = `settlement-job:${campaignSlug}`;
  let job = await env.PLEDGES.get(jobKey, { type: 'json' });

  if (!job || job.status !== 'running') {
    // Initialize: read campaign pledge index
    const orderIds = await getCampaignOrderIds(env, campaignSlug);

    if (!orderIds) {
      return jsonResponse({
        error: `Campaign pledge index missing for ${campaignSlug}. Run /admin/rebuild/${campaignSlug} first.`,
        campaignSlug,
        requiresRebuild: true
      }, 409);
    }

    job = {
      status: 'running',
      cursor: 0,
      total: orderIds.length,
      orderIds,
      startedAt: Date.now(),
      lastBatchAt: null,
      batchesCompleted: 0,
      totalCharged: 0,
      totalFailed: 0,
      totalSkipped: 0,
      totalNeedsAttention: 0
    };
  }

  if (job.cursor >= job.total) {
    const finalized = await finalizeSettlementDispatch(env, campaignSlug, jobKey, job);
    console.log(`${finalized.needsAttention ? '⚠️' : '✅'} Settlement complete for ${campaignSlug}:`, JSON.stringify(job));
    return jsonResponse({
      message: finalized.needsAttention ? 'Settlement completed with unresolved pledges' : 'Settlement complete',
      ...job
    });
  }

  // Process one batch
  const batch = job.orderIds.slice(job.cursor, job.cursor + BATCH_SIZE);
  console.log(`💳 Settling batch ${job.batchesCompleted + 1} for ${campaignSlug}: ${batch.length} pledges (${job.cursor}/${job.total})`);

  try {
    const batchRes = await fetch(`${env.WORKER_BASE}/admin/settle-batch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.ADMIN_SECRET}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ orderIds: batch })
    });
    const batchResult = await batchRes.json();

    job.cursor += batch.length;
    job.lastBatchAt = Date.now();
    job.batchesCompleted++;
    job.totalCharged += batchResult.charged || 0;
    job.totalFailed += batchResult.failed || 0;
    job.totalSkipped += batchResult.skipped || 0;
    const needsAttention = getSettlementNeedsAttention(batchResult);
    job.totalNeedsAttention += needsAttention.unresolved;

    // Save progress
    await env.PLEDGES.put(jobKey, JSON.stringify(job), { expirationTtl: 604800 });

    // Chain: self-invoke for the next batch if more remain
    if (job.cursor < job.total) {
      console.log(`🔗 Chaining next batch for ${campaignSlug} (${job.cursor}/${job.total})`);
      // Use a non-blocking fetch so this response returns immediately
      const nextFetch = fetch(`${env.WORKER_BASE}/admin/settle-dispatch/${campaignSlug}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.ADMIN_SECRET}`,
          'Content-Type': 'application/json'
        }
      }).catch(err => console.error('Chain dispatch failed:', err.message));

      // Can't use ctx.waitUntil here (not in scheduled), so await it
      await nextFetch;
    } else {
      // Final batch done
      const finalized = await finalizeSettlementDispatch(env, campaignSlug, jobKey, job);
      console.log(`${finalized.needsAttention ? '⚠️' : '✅'} Settlement complete for ${campaignSlug}:`, JSON.stringify(job));
    }

    return jsonResponse({
      campaignSlug,
      batchProcessed: batch.length,
      batchResult,
      progress: `${job.cursor}/${job.total}`,
      status: job.status
    });
  } catch (err) {
    console.error(`❌ Batch settlement failed for ${campaignSlug}:`, err.message);
    job.lastError = err.message;
    await env.PLEDGES.put(jobKey, JSON.stringify(job), { expirationTtl: 604800 });
    return jsonResponse({ error: err.message, progress: `${job.cursor}/${job.total}` }, 500);
  }
}

async function handleCronStatus(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const lastRun = await env.PLEDGES?.get('cron:lastRun');
  const lastError = await env.PLEDGES?.get('cron:lastError', { type: 'json' });

  return jsonResponse({
    lastRun,
    lastError,
    now: new Date().toISOString()
  });
}

async function handleSettleBatch(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const { orderIds, dryRun = false } = body;

  if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
    return jsonResponse({ error: 'Missing orderIds array' }, 400);
  }

  if (orderIds.length > 6) {
    return jsonResponse({ error: 'Max 6 orderIds per batch to stay within subrequest limits' }, 400);
  }

  if (!env.PLEDGES) {
    return jsonResponse({ error: 'PLEDGES KV not configured' }, 500);
  }

  const stripe = createStripeClient(getStripeKey(env));
  const results = { charged: 0, skipped: 0, failed: 0, errors: [], details: [] };

  // Read all pledges in this batch
  const pledges = [];
  for (const orderId of orderIds) {
    const pledge = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
    if (!pledge) {
      results.details.push({ orderId, status: 'not_found' });
      results.skipped++;
      continue;
    }
    if (pledge.charged || pledge.pledgeStatus === 'charged') {
      results.details.push({ orderId, status: 'already_charged' });
      results.skipped++;
      continue;
    }
    if (!pledge.stripeCustomerId || !pledge.stripePaymentMethodId) {
      results.details.push({ orderId, status: 'missing_stripe_ids' });
      results.skipped++;
      continue;
    }
    pledges.push(pledge);
  }

  if (pledges.length === 0) {
    return jsonResponse({ ...results, message: 'No chargeable pledges in batch' });
  }

  // Group by email for aggregation
  const byEmail = {};
  for (const pledge of pledges) {
    const email = pledge.email.toLowerCase();
    if (!byEmail[email]) {
      byEmail[email] = { pledges: [], totalAmount: 0 };
    }
    byEmail[email].pledges.push(pledge);
    byEmail[email].totalAmount += pledge.amount || 0;
  }

  if (dryRun) {
    return jsonResponse({
      dryRun: true,
      supporters: Object.entries(byEmail).map(([email, data]) => ({
        email,
        totalAmount: data.totalAmount,
        pledgeCount: data.pledges.length,
        orderIds: data.pledges.map(p => p.orderId)
      }))
    });
  }

  // Fetch campaign data once (for email template)
  const campaignSlug = pledges[0].campaignSlug;
  const campaign = await getCampaign(env, campaignSlug);
  const campaignTitle = campaign?.title || campaignSlug;

  for (const [email, data] of Object.entries(byEmail)) {
    // Use most recently updated payment method
    let customerId, paymentMethodId;
    let latest = null;
    for (const p of data.pledges) {
      const updated = new Date(p.updatedAt || p.createdAt);
      if (!latest || updated > latest) {
        latest = updated;
        customerId = p.stripeCustomerId;
        paymentMethodId = p.stripePaymentMethodId;
      }
    }

    // Reset any payment_failed status before charging
    for (const p of data.pledges) {
      if (p.pledgeStatus === 'payment_failed') {
        p.pledgeStatus = 'active';
        p.lastPaymentError = null;
        await env.PLEDGES.put(`pledge:${p.orderId}`, JSON.stringify(p));
      }
    }

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: data.totalAmount,
        currency: 'usd',
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        metadata: {
          campaignSlug,
          email,
          pledgeCount: data.pledges.length.toString(),
          orderIds: data.pledges.map(p => p.orderId).join(',')
        }
      });

      if (paymentIntent.status === 'succeeded') {
        const chargedAt = new Date().toISOString();
        for (const pledge of data.pledges) {
          pledge.charged = true;
          pledge.pledgeStatus = 'charged';
          pledge.chargedAt = chargedAt;
          pledge.stripePaymentIntentId = paymentIntent.id;
          pledge.updatedAt = chargedAt;
          await env.PLEDGES.put(`pledge:${pledge.orderId}`, JSON.stringify(pledge));
        }

        // Send success email
        try {
          const token = await generateToken(env.MAGIC_LINK_SECRET, {
            orderId: data.pledges[0].orderId,
            email,
            campaignSlug
          });

          let combinedSubtotal = 0;
          let combinedTax = 0;
          let combinedShipping = 0;
          let combinedTipAmount = 0;
          const combinedItems = { tierName: null, tierQty: 0, additionalTiers: [], supportItems: [], customAmount: 0 };
          for (const pledge of data.pledges) {
            combinedSubtotal += pledge.subtotal || pledge.amount || 0;
            combinedTax += pledge.tax || 0;
            combinedShipping += pledge.shipping || 0;
            combinedTipAmount += getStoredTipAmount(pledge);
            if (pledge.tierName) {
              if (!combinedItems.tierName) {
                combinedItems.tierName = pledge.tierName;
                combinedItems.tierQty = pledge.tierQty || 1;
              } else {
                combinedItems.additionalTiers.push({ name: pledge.tierName, qty: pledge.tierQty || 1 });
              }
            }
            for (const at of (pledge.additionalTiers || [])) {
              const tierData = campaign?.tiers?.find(t => t.id === at.id);
              combinedItems.additionalTiers.push({ name: tierData?.name || at.id, qty: at.qty || 1 });
            }
            for (const si of (pledge.supportItems || [])) {
              const itemData = campaign?.support_items?.find(s => s.id === si.id);
              combinedItems.supportItems.push({ label: itemData?.label || si.id, amount: si.amount || 0 });
            }
            combinedItems.customAmount += pledge.customAmount || 0;
          }

          await sendChargeSuccessEmail(env, {
            email, campaignSlug, campaignTitle,
            subtotal: combinedSubtotal, tax: combinedTax, shipping: combinedShipping, tipAmount: combinedTipAmount, tipPercent: derivePlatformTipPercent(combinedSubtotal, combinedTipAmount, 0), amount: data.totalAmount,
            token,
            hasDecisions: campaign?.has_decisions === true,
            pledgeItems: combinedItems
          });
        } catch (emailErr) {
          console.error('Failed to send charge success email:', emailErr.message);
        }

        results.charged += data.pledges.length;
        results.details.push({ email, status: 'charged', amount: data.totalAmount });
      } else {
        throw new Error('Payment status: ' + paymentIntent.status);
      }
    } catch (err) {
      results.failed += data.pledges.length;
      results.errors.push({ email, orderIds: data.pledges.map(p => p.orderId), error: err.message });
      results.details.push({ email, status: 'failed', error: err.message });

      for (const pledge of data.pledges) {
        pledge.pledgeStatus = 'payment_failed';
        pledge.lastPaymentError = err.message;
        pledge.updatedAt = new Date().toISOString();
        await env.PLEDGES.put(`pledge:${pledge.orderId}`, JSON.stringify(pledge));
      }
    }
  }

  return jsonResponse(results);
}

async function handleRebuildCampaignIndex(request, campaignSlug, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  if (!campaignSlug || !env.PLEDGES) {
    return jsonResponse({ error: 'Missing campaign slug or PLEDGES not configured' }, 400);
  }

  // Scan all pledge keys and rebuild index for this campaign
  const orderIds = [];
  let cursor = undefined;
  do {
    const page = await env.PLEDGES.list({ prefix: 'pledge:', cursor });
    for (const key of page.keys) {
      const pledge = await env.PLEDGES.get(key.name, { type: 'json' });
      if (pledge && pledge.campaignSlug === campaignSlug && pledge.pledgeStatus !== 'cancelled') {
        orderIds.push(pledge.orderId);
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  await env.PLEDGES.put(`campaign-pledges:${campaignSlug}`, JSON.stringify(orderIds));

  return jsonResponse({ campaignSlug, orderIds: orderIds.length, rebuilt: true });
}

async function handleBackfillCustomers(request, campaignSlug, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  if (!campaignSlug) {
    return jsonResponse({ error: 'Missing campaign slug' }, 400);
  }

  if (!env.PLEDGES) {
    return jsonResponse({ error: 'PLEDGES KV not configured' }, 500);
  }

  const BATCH_SIZE = 5;
  const stripe = createStripeClient(getStripeKey(env));
  const body = await request.json().catch(() => ({}));
  const dryRun = body.dryRun === true;

  const orderIds = await getCampaignOrderIds(env, campaignSlug);
  if (!orderIds) {
    return jsonResponse({
      error: `Campaign pledge index missing for ${campaignSlug}. Run /admin/rebuild/${campaignSlug} first.`,
      campaignSlug,
      requiresRebuild: true
    }, 409);
  }

  // Find pledges missing stripeCustomerId
  const needsBackfill = [];

  for (const orderId of orderIds) {
    const key = `pledge:${orderId}`;
    const pledge = await env.PLEDGES.get(key, { type: 'json' });
    if (pledge &&
        pledge.campaignSlug === campaignSlug &&
        pledge.pledgeStatus === 'active' &&
        !pledge.charged &&
        !pledge.stripeCustomerId &&
        pledge.stripePaymentMethodId) {
      needsBackfill.push({ key, pledge });
    }
  }

  if (needsBackfill.length === 0) {
    return jsonResponse({ message: 'All pledges have customer IDs', remaining: 0 });
  }

  const batch = needsBackfill.slice(0, BATCH_SIZE);
  const results = { processed: 0, failed: 0, remaining: needsBackfill.length - batch.length, errors: [] };

  if (dryRun) {
    return jsonResponse({
      dryRun: true,
      needsBackfill: needsBackfill.length,
      batchSize: batch.length,
      pledges: needsBackfill.map(p => ({ orderId: p.pledge.orderId, email: p.pledge.email }))
    });
  }

  for (const { key, pledge } of batch) {
    try {
      // Create a Stripe customer for this pledge
      const customer = await stripe.customers.create({
        email: pledge.email,
        metadata: { source: 'backfill', orderId: pledge.orderId, campaignSlug }
      });

      if (!customer.id) {
        throw new Error(customer.error?.message || 'Customer creation failed');
      }

      // Attach the existing payment method to the new customer
      await stripe.paymentMethods.attach(pledge.stripePaymentMethodId, {
        customer: customer.id
      });

      // Update pledge in KV
      pledge.stripeCustomerId = customer.id;
      await env.PLEDGES.put(key, JSON.stringify(pledge));

      console.log(`🔧 Backfilled customer for ${pledge.orderId}: ${customer.id}`);
      results.processed++;
    } catch (err) {
      console.error(`❌ Backfill failed for ${pledge.orderId}:`, err.message);
      results.failed++;
      results.errors.push({ orderId: pledge.orderId, error: err.message });
    }
  }

  return jsonResponse(results);
}

async function handleTestSetup(request, env) {
  if (getAppMode(env) !== 'test') {
    return jsonResponse({ error: 'Test endpoints only available in test mode' }, 403);
  }

  if (!env.PLEDGES) {
    return jsonResponse({ error: 'PLEDGES KV not configured' }, 500);
  }

  const body = await request.json().catch(() => ({}));
  const email = body.email || 'test@example.com';
  const campaignSlug = body.campaignSlug || 'hand-relations';

  // Get campaign data to use real tier IDs
  const campaign = await getCampaign(env, campaignSlug);
  const tiers = campaign?.tiers || [];
  const isSingleTier = campaign?.single_tier_only === true;
  const firstTier = tiers[0];
  const secondTier = tiers[1];
  
  // Calculate amounts with tax
  const firstTierPrice = firstTier?.price || 5;
  const firstTierQty = body.tierQty || 2;
  
  // For single_tier_only campaigns, don't include additional tiers
  let subtotal;
  let additionalTiers = [];
  if (isSingleTier) {
    subtotal = firstTierPrice * firstTierQty * 100;
  } else {
    const secondTierPrice = secondTier?.price || 0;
    const secondTierQty = 1;
    subtotal = (firstTierPrice * firstTierQty + secondTierPrice * secondTierQty) * 100;
    if (secondTier) {
      additionalTiers = [{ id: secondTier.id, qty: secondTierQty }];
    }
  }
  const totals = buildPledgeTotals(env, subtotal, {
    shipping: getFlatShippingFeeCents(env),
    tipPercent: DEFAULT_PLATFORM_TIP_PERCENT
  });

  // Create a real Stripe test customer so payment method updates work
  let stripeCustomerId = null;
  try {
    const stripe = createStripeClient(getStripeKey(env));
    const customer = await stripe.customers.create({ email });
    stripeCustomerId = customer.id;
    console.log('📧 Created test Stripe customer:', stripeCustomerId);
  } catch (err) {
    console.error('Failed to create Stripe customer:', err.message);
  }

  const testPledges = [
    {
      orderId: 'test-order-active-1',
      email,
      campaignSlug,
      tierId: firstTier?.id || 'frame',
      tierName: firstTier?.name || 'Test Tier',
      tierQty: firstTierQty,
      subtotal: totals.subtotal,
      tax: totals.tax,
      shipping: totals.shipping,
      tipPercent: totals.tipPercent,
      tipAmount: totals.tipAmount,
      amount: totals.amount,
      customAmount: 0,
      supportItems: [],
      additionalTiers,
      stripeCustomerId: stripeCustomerId || 'cus_test_123',
      stripePaymentMethodId: null, // No payment method until they add one
      pledgeStatus: 'active',
      charged: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  const orderIds = [];
  for (const pledge of testPledges) {
    await env.PLEDGES.put(`pledge:${pledge.orderId}`, JSON.stringify(pledge));
    await addToCampaignIndex(env, pledge.campaignSlug, pledge.orderId);
    orderIds.push(pledge.orderId);
  }

  const emailKey = `email:${email.toLowerCase()}`;
  await env.PLEDGES.put(emailKey, JSON.stringify(orderIds));

  const token = await generateToken(env.MAGIC_LINK_SECRET, {
    orderId: testPledges[0].orderId,
    email,
    campaignSlug
  });

  const manageUrl = `${env.SITE_BASE}/manage/?t=${token}`;

  return jsonResponse({
    success: true,
    message: 'Test pledges created',
    pledges: testPledges.map(p => ({
      orderId: p.orderId,
      campaignSlug: p.campaignSlug,
      status: p.pledgeStatus,
      tierId: p.tierId,
      tierQty: p.tierQty,
      additionalTiers: p.additionalTiers,
      subtotal: p.subtotal,
      tax: p.tax,
      tipPercent: p.tipPercent,
      tipAmount: p.tipAmount,
      amount: p.amount
    })),
    token,
    manageUrl
  });
}

async function handleTestCleanup(request, env) {
  if (getAppMode(env) !== 'test') {
    return jsonResponse({ error: 'Test endpoints only available in test mode' }, 403);
  }

  if (!env.PLEDGES) {
    return jsonResponse({ error: 'PLEDGES KV not configured' }, 500);
  }

  const body = await request.json().catch(() => ({}));
  const email = body.email || 'test@example.com';

  const testOrderIds = [
    'test-order-active-1'
  ];

  for (const orderId of testOrderIds) {
    const pledge = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
    if (pledge?.campaignSlug) {
      await removeFromCampaignIndex(env, pledge.campaignSlug, orderId);
    }
    await env.PLEDGES.delete(`pledge:${orderId}`);
  }

  await env.PLEDGES.delete(`email:${email.toLowerCase()}`);

  return jsonResponse({
    success: true,
    message: 'Test pledges cleaned up',
    deleted: testOrderIds
  });
}

/**
 * Get all supporters for a campaign from KV
 */
async function getCampaignSupporters(env, campaignSlug) {
  if (!env.PLEDGES) return [];
  
  const supporters = [];
  const seenEmails = new Set();
  const orderIds = await getCampaignOrderIds(env, campaignSlug);

  if (Array.isArray(orderIds)) {
    for (const orderId of orderIds) {
      const pledgeData = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
      if (!pledgeData) continue;
      if (pledgeData.campaignSlug !== campaignSlug) continue;
      if (pledgeData.pledgeStatus === 'cancelled') continue;
      if (!pledgeData.email) continue;

      const emailLower = pledgeData.email.toLowerCase();
      if (seenEmails.has(emailLower)) continue;
      seenEmails.add(emailLower);

      supporters.push({
        email: pledgeData.email,
        orderId: pledgeData.orderId
      });
    }

    return supporters;
  }

  const pledgeKeys = await listAllPledgeKeys(env);

  for (const key of pledgeKeys) {
    const pledgeData = await env.PLEDGES.get(key.name, { type: 'json' });
    if (!pledgeData) continue;
    if (pledgeData.campaignSlug !== campaignSlug) continue;
    if (pledgeData.pledgeStatus === 'cancelled') continue;
    if (!pledgeData.email) continue;
    
    const emailLower = pledgeData.email.toLowerCase();
    if (seenEmails.has(emailLower)) continue;
    seenEmails.add(emailLower);
    
    supporters.push({
      email: pledgeData.email,
      orderId: pledgeData.orderId
    });
  }
  
  return supporters;
}

/**
 * Trigger automatic milestone emails when funding thresholds are crossed
 * Called after stats are updated with a new pledge
 */
async function triggerMilestoneEmails(env, campaignSlug) {
  try {
    const campaign = await getCampaign(env, campaignSlug);
    if (!campaign || !campaign.goal_amount) return;
    
    const stats = await getCampaignStats(env, campaignSlug);
    const goalAmountCents = campaign.goal_amount * 100;
    const progress = stats.pledgedAmount / goalAmountCents;
    
    // Pass campaign to check stretch goals too
    const newMilestones = await checkMilestones(env, campaignSlug, stats.pledgedAmount, goalAmountCents, campaign);
    
    if (newMilestones.length === 0) return;
    
    console.log('🎯 Milestone(s) reached:', newMilestones, 'for campaign:', campaignSlug);
    
    // Mark skipped intermediate milestones as sent (so they don't trigger later)
    // If we're sending 'goal', also mark one-third and two-thirds as sent
    // If we're sending 'two-thirds', also mark one-third as sent
    const sent_milestones = await getSentMilestones(env, campaignSlug);
    if (newMilestones.includes('goal')) {
      if (progress >= 0.33 && !sent_milestones.includes('one-third')) {
        await markMilestoneSent(env, campaignSlug, 'one-third');
        console.log('🎯 Skipped intermediate milestone one-third (goal reached)');
      }
      if (progress >= 0.66 && !sent_milestones.includes('two-thirds')) {
        await markMilestoneSent(env, campaignSlug, 'two-thirds');
        console.log('🎯 Skipped intermediate milestone two-thirds (goal reached)');
      }
    } else if (newMilestones.includes('two-thirds')) {
      if (progress >= 0.33 && !sent_milestones.includes('one-third')) {
        await markMilestoneSent(env, campaignSlug, 'one-third');
        console.log('🎯 Skipped intermediate milestone one-third (two-thirds reached)');
      }
    }
    
    for (const milestoneItem of newMilestones) {
      // Handle both string milestones and stretch goal objects
      const isStretch = typeof milestoneItem === 'object' && milestoneItem.type === 'stretch';
      const milestoneType = isStretch ? 'stretch' : milestoneItem;
      const milestoneId = isStretch ? milestoneItem.id : milestoneItem;
      const stretchGoalName = isStretch ? milestoneItem.name : undefined;
      const latestSentMilestones = await getSentMilestones(env, campaignSlug);

      if (latestSentMilestones.includes(milestoneId)) {
        console.log(`🎯 Skipping already-sent milestone ${milestoneId} for ${campaignSlug}`);
        continue;
      }

      await markMilestoneSent(env, campaignSlug, milestoneId);
      const supporters = await getCampaignSupporters(env, campaignSlug);

      console.log(`🎯 Starting milestone ${milestoneId} email broadcast...`);
      
      let sent = 0;
      let failed = 0;
      
      for (let i = 0; i < supporters.length; i++) {
        const supporter = supporters[i];
        
        // Rate limit: Resend allows 2 req/sec
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, RESEND_RATE_LIMIT_DELAY));
        }
        
        try {
          const token = await generateToken(env.MAGIC_LINK_SECRET, {
            orderId: supporter.orderId,
            email: supporter.email,
            campaignSlug
          });

          await sendMilestoneEmail(env, {
            email: supporter.email,
            campaignSlug,
            campaignTitle: campaign.title,
            milestone: milestoneType,
            pledgedAmount: stats.pledgedAmount,
            goalAmount: goalAmountCents,
            stretchGoalName,
            token,
            instagramUrl: campaign.instagram
          });
          sent++;
        } catch (err) {
          console.error('Failed to send milestone email:', supporter.email, err.message);
          failed++;
        }
      }
      
      console.log(`🎯 Milestone ${milestoneId} emails sent: ${sent}, failed: ${failed}`);
    }
  } catch (err) {
    console.error('Error triggering milestone emails:', err.message);
  }
}

/**
 * Admin: Broadcast announcement with optional CTA link to all campaign supporters
 */
async function handleBroadcastAnnouncement(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { campaignSlug, subject, heading, body: messageBody, ctaLabel, ctaUrl, dryRun } = body;

  if (!campaignSlug || !subject || !messageBody) {
    return jsonResponse({ error: 'Missing campaignSlug, subject, or body' }, 400);
  }

  const campaign = await getCampaign(env, campaignSlug);
  if (!campaign) {
    return jsonResponse({ error: 'Campaign not found' }, 404);
  }

  const supporters = await getCampaignSupporters(env, campaignSlug);
  
  if (dryRun) {
    return jsonResponse({
      dryRun: true,
      campaignSlug,
      subject,
      ctaLabel,
      ctaUrl,
      recipientCount: supporters.length,
      recipients: supporters.map(s => s.email)
    });
  }

  const results = { sent: 0, failed: 0, errors: [] };

  for (let i = 0; i < supporters.length; i++) {
    const supporter = supporters[i];
    
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, RESEND_RATE_LIMIT_DELAY));
    }
    
    try {
      const token = await generateToken(env.MAGIC_LINK_SECRET, {
        orderId: supporter.orderId,
        email: supporter.email,
        campaignSlug
      });

      await sendAnnouncementEmail(env, {
        email: supporter.email,
        campaignSlug,
        campaignTitle: campaign.title,
        subject,
        heading,
        body: messageBody,
        ctaLabel,
        ctaUrl,
        token,
        instagramUrl: campaign.instagram,
        hasDecisions: campaign?.has_decisions === true
      });
      results.sent++;
    } catch (err) {
      results.failed++;
      results.errors.push({ email: supporter.email, error: err.message });
    }
  }

  return jsonResponse({
    success: true,
    campaignSlug,
    subject,
    ...results
  });
}

/**
 * Admin: Broadcast diary update to all campaign supporters
 */
async function handleBroadcastDiary(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { campaignSlug, diaryTitle, diaryExcerpt, dryRun } = body;

  if (!campaignSlug || !diaryTitle) {
    return jsonResponse({ error: 'Missing campaignSlug or diaryTitle' }, 400);
  }

  const campaign = await getCampaign(env, campaignSlug);
  if (!campaign) {
    return jsonResponse({ error: 'Campaign not found' }, 404);
  }

  const supporters = await getCampaignSupporters(env, campaignSlug);
  
  if (dryRun) {
    return jsonResponse({
      dryRun: true,
      campaignSlug,
      diaryTitle,
      recipientCount: supporters.length,
      recipients: supporters.map(s => s.email)
    });
  }

  const results = { sent: 0, failed: 0, errors: [] };

  for (let i = 0; i < supporters.length; i++) {
    const supporter = supporters[i];
    
    // Rate limit: Resend allows 2 req/sec
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, RESEND_RATE_LIMIT_DELAY));
    }
    
    try {
      const token = await generateToken(env.MAGIC_LINK_SECRET, {
        orderId: supporter.orderId,
        email: supporter.email,
        campaignSlug
      });

      await sendDiaryUpdateEmail(env, {
        email: supporter.email,
        campaignSlug,
        campaignTitle: campaign.title,
        diaryTitle,
        diaryExcerpt,
        token,
        hasDecisions: campaign?.has_decisions === true
      });
      results.sent++;
    } catch (err) {
      results.failed++;
      results.errors.push({ email: supporter.email, error: err.message });
    }
  }

  return jsonResponse({
    success: true,
    campaignSlug,
    diaryTitle,
    ...results
  });
}

/**
 * Admin: Check all campaigns for new diary entries and broadcast them
 * Called automatically after deploy via GitHub Action
 */
async function handleDiaryCheck(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const { dryRun } = body;

  const campaignsData = await getCampaigns(env);
  const campaigns = campaignsData.campaigns || campaignsData;
  
  const results = {
    checked: 0,
    newEntries: [],
    sent: 0,
    failed: 0,
    errors: []
  };

  for (const campaign of campaigns) {
    results.checked++;
    
    if (!campaign.diary || !Array.isArray(campaign.diary) || campaign.diary.length === 0) {
      continue;
    }

    const sentDates = await getSentDiaryEntries(env, campaign.slug);
    
    for (const entry of campaign.diary) {
      if (!entry.date || !entry.title) continue;
      
      if (sentDates.includes(entry.date)) continue;
      
      results.newEntries.push({
        campaignSlug: campaign.slug,
        campaignTitle: campaign.title,
        date: entry.date,
        title: entry.title
      });

      if (dryRun) continue;

      const supporters = await getCampaignSupporters(env, campaign.slug);
      
      if (supporters.length === 0) {
        await markDiarySent(env, campaign.slug, entry.date);
        continue;
      }

      console.log(`📝 Broadcasting diary entry "${entry.title}" to ${supporters.length} supporters of ${campaign.slug}`);

      for (let i = 0; i < supporters.length; i++) {
        const supporter = supporters[i];
        
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, RESEND_RATE_LIMIT_DELAY));
        }
        
        try {
          const token = await generateToken(env.MAGIC_LINK_SECRET, {
            orderId: supporter.orderId,
            email: supporter.email,
            campaignSlug: campaign.slug
          });

          await sendDiaryUpdateEmail(env, {
            email: supporter.email,
            campaignSlug: campaign.slug,
            campaignTitle: campaign.title,
            diaryTitle: entry.title,
            diaryExcerpt: getDiaryExcerpt(entry),
            diaryPhase: entry.phase,
            token,
            instagramUrl: campaign.instagram,
            hasDecisions: campaign?.has_decisions === true
          });
          results.sent++;
        } catch (err) {
          results.failed++;
          results.errors.push({ 
            campaignSlug: campaign.slug,
            diaryDate: entry.date,
            email: supporter.email, 
            error: err.message 
          });
        }
      }

      await markDiarySent(env, campaign.slug, entry.date);
    }
  }

  return jsonResponse({
    success: true,
    dryRun: !!dryRun,
    ...results
  });
}

/**
 * Admin: Broadcast milestone notification to all campaign supporters
 */
async function handleBroadcastMilestone(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { campaignSlug, milestone, stretchGoalName, dryRun } = body;

  if (!campaignSlug || !milestone) {
    return jsonResponse({ error: 'Missing campaignSlug or milestone' }, 400);
  }

  const validMilestones = ['one-third', 'two-thirds', 'goal', 'stretch'];
  if (!validMilestones.includes(milestone)) {
    return jsonResponse({ error: `Invalid milestone. Must be one of: ${validMilestones.join(', ')}` }, 400);
  }

  const campaign = await getCampaign(env, campaignSlug);
  if (!campaign) {
    return jsonResponse({ error: 'Campaign not found' }, 404);
  }

  const supporters = await getCampaignSupporters(env, campaignSlug);
  
  // Build milestone ID for tracking (matches format used by checkMilestones)
  // For stretch goals, caller should provide stretchThreshold to form the ID
  const url = new URL(request.url);
  const stretchThreshold = url.searchParams.get('stretchThreshold');
  const milestoneId = milestone === 'stretch' && stretchThreshold 
    ? `stretch:${stretchThreshold}` 
    : milestone;
  
  // Check if already sent (prevent duplicates)
  const sentMilestones = await getSentMilestones(env, campaignSlug);
  const alreadySent = sentMilestones.includes(milestoneId);
  
  if (dryRun) {
    return jsonResponse({
      dryRun: true,
      campaignSlug,
      milestone,
      milestoneId,
      alreadySent,
      recipientCount: supporters.length,
      recipients: supporters.map(s => s.email)
    });
  }
  
  // Warn but don't block if already sent (admin may want to resend intentionally)
  if (alreadySent) {
    console.warn(`⚠️ Milestone ${milestoneId} already sent for ${campaignSlug}, proceeding anyway (manual broadcast)`);
  }

  const results = { sent: 0, failed: 0, errors: [] };

  for (let i = 0; i < supporters.length; i++) {
    const supporter = supporters[i];
    
    // Rate limit: Resend allows 2 req/sec
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, RESEND_RATE_LIMIT_DELAY));
    }
    
    try {
      const token = await generateToken(env.MAGIC_LINK_SECRET, {
        orderId: supporter.orderId,
        email: supporter.email,
        campaignSlug
      });

      await sendMilestoneEmail(env, {
        email: supporter.email,
        campaignSlug,
        campaignTitle: campaign.title,
        milestone,
        pledgedAmount: campaign.pledged_amount || 0,
        goalAmount: campaign.goal_amount || 100000,
        stretchGoalName,
        token,
        instagramUrl: campaign.instagram
      });
      results.sent++;
    } catch (err) {
      results.failed++;
      results.errors.push({ email: supporter.email, error: err.message });
    }
  }
  
  // Mark milestone as sent (prevents auto-trigger from sending again)
  await markMilestoneSent(env, campaignSlug, milestoneId);

  return jsonResponse({
    success: true,
    campaignSlug,
    milestone,
    milestoneId,
    ...results
  });
}

/**
 * Admin: Check and trigger any pending milestone emails for a campaign
 * Use this to catch up on milestones for campaigns that crossed thresholds before auto-trigger was implemented
 */
async function handleMilestoneCheck(request, campaignSlug, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const campaign = await getCampaign(env, campaignSlug);
  if (!campaign) {
    return jsonResponse({ error: 'Campaign not found' }, 404);
  }

  const stats = await getCampaignStats(env, campaignSlug);
  const goalAmountCents = (campaign.goal_amount || 0) * 100;
  
  if (!goalAmountCents) {
    return jsonResponse({ error: 'Campaign has no goal amount set' }, 400);
  }

  const progress = stats.pledgedAmount / goalAmountCents;
  // Pass campaign to check stretch goals too
  const newMilestones = await checkMilestones(env, campaignSlug, stats.pledgedAmount, goalAmountCents, campaign);
  const sentMilestones = await getSentMilestones(env, campaignSlug);

  // Check if dryRun requested
  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === 'true';

  if (dryRun) {
    return jsonResponse({
      dryRun: true,
      campaignSlug,
      pledgedAmount: stats.pledgedAmount,
      goalAmount: goalAmountCents,
      progress: `${(progress * 100).toFixed(1)}%`,
      sentMilestones,
      pendingMilestones: newMilestones,
      stretchGoals: campaign.stretch_goals || []
    });
  }

  if (newMilestones.length === 0) {
    return jsonResponse({
      success: true,
      campaignSlug,
      message: 'No new milestones to trigger',
      progress: `${(progress * 100).toFixed(1)}%`,
      sentMilestones
    });
  }

  // Mark skipped intermediate milestones as sent (so they don't trigger later)
  const skippedMilestones = [];
  if (newMilestones.some(m => m === 'goal' || (typeof m === 'object' && m.type === 'stretch'))) {
    // If goal or stretch is being sent, mark any skipped percentage milestones
    if (newMilestones.includes('goal')) {
      if (progress >= 0.33 && !sentMilestones.includes('one-third')) {
        await markMilestoneSent(env, campaignSlug, 'one-third');
        skippedMilestones.push('one-third');
      }
      if (progress >= 0.66 && !sentMilestones.includes('two-thirds')) {
        await markMilestoneSent(env, campaignSlug, 'two-thirds');
        skippedMilestones.push('two-thirds');
      }
    } else if (newMilestones.includes('two-thirds')) {
      if (progress >= 0.33 && !sentMilestones.includes('one-third')) {
        await markMilestoneSent(env, campaignSlug, 'one-third');
        skippedMilestones.push('one-third');
      }
    }
  }

  const results = { sent: 0, failed: 0, milestones: [], skippedMilestones };

  for (const milestoneItem of newMilestones) {
    // Handle both string milestones and stretch goal objects
    const isStretch = typeof milestoneItem === 'object' && milestoneItem.type === 'stretch';
    const milestoneType = isStretch ? 'stretch' : milestoneItem;
    const milestoneId = isStretch ? milestoneItem.id : milestoneItem;
    const stretchGoalName = isStretch ? milestoneItem.name : undefined;
    const latestSentMilestones = await getSentMilestones(env, campaignSlug);

    if (latestSentMilestones.includes(milestoneId)) {
      results.milestones.push({ milestone: milestoneId, sent: 0, failed: 0, skipped: true });
      continue;
    }

    await markMilestoneSent(env, campaignSlug, milestoneId);
    const supporters = await getCampaignSupporters(env, campaignSlug);

    let mSent = 0;
    let mFailed = 0;

    for (let i = 0; i < supporters.length; i++) {
      const supporter = supporters[i];
      
      // Rate limit: Resend allows 2 req/sec
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, RESEND_RATE_LIMIT_DELAY));
      }
      
      try {
        const token = await generateToken(env.MAGIC_LINK_SECRET, {
          orderId: supporter.orderId,
          email: supporter.email,
          campaignSlug
        });

        await sendMilestoneEmail(env, {
          email: supporter.email,
          campaignSlug,
          campaignTitle: campaign.title,
          milestone: milestoneType,
          pledgedAmount: stats.pledgedAmount,
          goalAmount: goalAmountCents,
          stretchGoalName,
          token,
          instagramUrl: campaign.instagram
        });
        mSent++;
        results.sent++;
      } catch (err) {
        mFailed++;
        results.failed++;
      }
    }

    results.milestones.push({ milestone: milestoneId, sent: mSent, failed: mFailed });
  }

  return jsonResponse({
    success: true,
    campaignSlug,
    progress: `${(progress * 100).toFixed(1)}%`,
    ...results
  });
}

/**
 * Test endpoint: Send individual test emails (test mode only)
 */
async function handleTestEmail(request, env) {
  // Allow in test mode, or in production with admin auth
  if (getAppMode(env) !== 'test') {
    const auth = requireAdmin(request, env);
    if (!auth.ok) {
      return jsonResponse({ error: 'Test endpoints require admin auth in production' }, 403);
    }
  }

  const body = await request.json();
  const { type, email, campaignSlug } = body;

  if (!type || !email) {
    return jsonResponse({ error: 'Missing type or email' }, 400);
  }

  const campaign = await getCampaign(env, campaignSlug || 'hand-relations');
  const campaignTitle = campaign?.title || 'Test Campaign';
  const instagramUrl = campaign?.instagram || 'https://instagram.com/thepool';
  
  // Use the test order ID created by /test/setup so manage links work
  const testOrderId = 'test-order-active-1';

  const token = await generateToken(env.MAGIC_LINK_SECRET, {
    orderId: testOrderId,
    email,
    campaignSlug: campaignSlug || 'hand-relations'
  });

  try {
    switch (type) {
      case 'supporter':
        await sendSupporterEmail(env, {
          email,
          campaignSlug: campaignSlug || 'hand-relations',
          campaignTitle,
          subtotal: 5000,
          tax: 394,
          shipping: 300,
          tipAmount: 250,
          tipPercent: 5,
          token,
          instagramUrl,
          hasDecisions: campaign?.has_decisions === true,
          pledgeItems: {
            tierName: 'Test Tier',
            tierQty: 2,
            additionalTiers: [],
            supportItems: [{ label: 'Location Scouting', amount: 10 }],
            customAmount: 5
          }
        });
        break;

      case 'modified':
        await sendPledgeModifiedEmail(env, {
          email,
          campaignSlug: campaignSlug || 'hand-relations',
          campaignTitle,
          previousSubtotal: 5000,
          previousTax: 394,
          previousShipping: 300,
          previousTipAmount: 250,
          newSubtotal: 10000,
          tax: 788,
          shipping: 300,
          tipAmount: 500,
          tipPercent: 5,
          token,
          instagramUrl,
          pledgeItems: {
            tierName: 'Test Tier',
            tierQty: 3,
            additionalTiers: [{ name: 'Digital Download', qty: 1 }],
            supportItems: [{ label: 'Location Scouting', amount: 15 }],
            customAmount: 10
          }
        });
        break;

      case 'payment-failed':
        await sendPaymentFailedEmail(env, {
          email,
          campaignSlug: campaignSlug || 'hand-relations',
          campaignTitle,
          subtotal: 10000,  // $100.00
          tax: 788,         // $7.88
          shipping: 300,    // $3.00
          tipAmount: 500,   // $5.00
          tipPercent: 5,
          amount: 11588,    // $115.88 total
          token,
          pledgeItems: {
            tierName: 'Test Tier',
            tierQty: 2,
            additionalTiers: [{ name: 'Digital Download', qty: 1 }],
            supportItems: [{ label: 'Location Scouting', amount: 15 }],
            customAmount: 10
          }
        });
        break;

      case 'diary':
        await sendDiaryUpdateEmail(env, {
          email,
          campaignSlug: campaignSlug || 'hand-relations',
          campaignTitle,
          diaryTitle: 'Test Diary Entry',
          diaryExcerpt: 'This is a test diary update to verify the email template is working correctly.',
          token,
          instagramUrl,
          hasDecisions: campaign?.has_decisions === true
        });
        break;

      case 'milestone-one-third':
        await sendMilestoneEmail(env, {
          email,
          campaignSlug: campaignSlug || 'hand-relations',
          campaignTitle,
          milestone: 'one-third',
          pledgedAmount: 3333,
          goalAmount: 10000,
          token,
          instagramUrl
        });
        break;

      case 'milestone-two-thirds':
        await sendMilestoneEmail(env, {
          email,
          campaignSlug: campaignSlug || 'hand-relations',
          campaignTitle,
          milestone: 'two-thirds',
          pledgedAmount: 6666,
          goalAmount: 10000,
          token,
          instagramUrl
        });
        break;

      case 'milestone-goal':
        await sendMilestoneEmail(env, {
          email,
          campaignSlug: campaignSlug || 'hand-relations',
          campaignTitle,
          milestone: 'goal',
          pledgedAmount: 10000,
          goalAmount: 10000,
          token,
          instagramUrl
        });
        break;

      case 'milestone-stretch':
        await sendMilestoneEmail(env, {
          email,
          campaignSlug: campaignSlug || 'hand-relations',
          campaignTitle,
          milestone: 'stretch',
          pledgedAmount: 15000,
          goalAmount: 10000,
          stretchGoalName: 'Director\'s Commentary',
          token,
          instagramUrl
        });
        break;

      case 'charge-success':
        await sendChargeSuccessEmail(env, {
          email,
          campaignSlug: campaignSlug || 'hand-relations',
          campaignTitle,
          subtotal: 10000,  // $100.00
          tax: 788,         // $7.88
          shipping: 300,    // $3.00
          tipAmount: 500,   // $5.00
          tipPercent: 5,
          amount: 11588,    // $115.88 total
          token,
          hasDecisions: campaign?.has_decisions === true,
          pledgeItems: {
            tierName: 'Test Tier',
            tierQty: 2,
            additionalTiers: [{ name: 'Digital Download', qty: 1 }],
            supportItems: [{ label: 'Location Scouting', amount: 15 }],
            customAmount: 10
          }
        });
        break;

      default:
        return jsonResponse({ 
          error: 'Invalid type. Valid types: supporter, modified, payment-failed, diary, milestone-one-third, milestone-two-thirds, milestone-goal, milestone-stretch, charge-success' 
        }, 400);
    }

    return jsonResponse({
      success: true,
      type,
      email,
      message: `Test ${type} email sent`
    });
  } catch (err) {
    return jsonResponse({
      success: false,
      error: err.message
    }, 500);
  }
}

async function handleTestVotes(request, env) {
  if (getAppMode(env) !== 'test') {
    return jsonResponse({ error: 'Test endpoints only available in test mode' }, 403);
  }

  const body = await request.json();
  const { campaignSlug, decisions } = body;

  if (!campaignSlug || !decisions) {
    return jsonResponse({ error: 'Missing campaignSlug or decisions' }, 400);
  }

  const seeded = [];
  for (const [decisionId, votes] of Object.entries(decisions)) {
    const resultsKey = `results:${campaignSlug}:${decisionId}`;
    await env.VOTES.put(resultsKey, JSON.stringify(votes));
    seeded.push({ decisionId, votes });
  }

  return jsonResponse({
    success: true,
    campaignSlug,
    seeded
  });
}

async function handleAdminRebuild(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  let reason = 'admin-triggered';
  try {
    const body = await request.json();
    if (body.reason) reason = body.reason;
  } catch {
    // No body is fine
  }

  const result = await triggerSiteRebuild(env, reason);
  
  if (result.triggered) {
    return jsonResponse({ success: true, message: 'Site rebuild triggered' });
  }
  
  return jsonResponse({ 
    success: false, 
    error: result.reason || 'Failed to trigger rebuild' 
  }, 500);
}

async function handleGetStats(campaignSlug, env) {
  if (!campaignSlug) {
    return jsonResponse({ error: 'Missing campaign slug' }, 400, env, true);
  }

  const stats = await getCampaignStats(env, campaignSlug);
  
  // Also get campaign data for context
  const campaign = await getCampaign(env, campaignSlug);
  
  // SEC-004: Stats are public, use permissive CORS
  return cacheablePublicJsonResponse({
    campaignSlug,
    pledgedAmount: stats.pledgedAmount,
    pledgeCount: stats.pledgeCount,
    tierCounts: stats.tierCounts,
    supportItems: stats.supportItems || {},
    goalAmount: campaign?.goal_amount || 0,
    goalDeadline: campaign?.goal_deadline || null,
    state: campaign?.state || 'unknown',
    percentFunded: campaign?.goal_amount 
      ? Math.round((stats.pledgedAmount / (campaign.goal_amount * 100)) * 100) 
      : 0,
    updatedAt: stats.updatedAt
  }, 200, env);
}

async function handleGetLiveCampaign(campaignSlug, env) {
  if (!campaignSlug) {
    return jsonResponse({ error: 'Missing campaign slug' }, 400, env, true);
  }

  const [stats, inventory, campaign] = await Promise.all([
    getCampaignStats(env, campaignSlug),
    getTierInventory(env, campaignSlug),
    getCampaign(env, campaignSlug)
  ]);

  const tiers = {};
  for (const tier of (campaign?.tiers || [])) {
    if (tier.limit_total) {
      const inv = inventory?.[tier.id] || { limit: tier.limit_total, claimed: 0 };
      tiers[tier.id] = {
        name: tier.name,
        limit: inv.limit,
        claimed: inv.claimed,
        remaining: inv.limit - inv.claimed
      };
    }
  }

  return cacheablePublicJsonResponse({
    campaignSlug,
    stats: {
      campaignSlug,
      pledgedAmount: stats?.pledgedAmount || 0,
      pledgeCount: stats?.pledgeCount || 0,
      tierCounts: stats?.tierCounts || {},
      supportItems: stats?.supportItems || {},
      goalAmount: campaign?.goal_amount || 0,
      goalDeadline: campaign?.goal_deadline || null,
      state: campaign?.state || 'unknown',
      percentFunded: campaign?.goal_amount
        ? Math.round(((stats?.pledgedAmount || 0) / (campaign.goal_amount * 100)) * 100)
        : 0,
      updatedAt: stats?.updatedAt || null
    },
    inventory: {
      campaignSlug,
      tiers,
      raw: inventory || {}
    }
  }, 200, env);
}

async function handleRecalculateStats(request, campaignSlug, env) {
  // Require admin auth for recalculation (SEC-006)
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  if (!campaignSlug) {
    return jsonResponse({ error: 'Missing campaign slug' }, 400);
  }

  const stats = await recalculateStats(env, campaignSlug);
  
  return jsonResponse({
    success: true,
    message: 'Stats recalculated',
    stats
  });
}

async function handleGetInventory(campaignSlug, env) {
  if (!campaignSlug) {
    return jsonResponse({ error: 'Missing campaign slug' }, 400, env, true);
  }

  const inventory = await getTierInventory(env, campaignSlug);
  const campaign = await getCampaign(env, campaignSlug);
  
  // Merge inventory with tier data for complete picture
  const tiers = {};
  for (const tier of (campaign?.tiers || [])) {
    if (tier.limit_total) {
      const inv = inventory[tier.id] || { limit: tier.limit_total, claimed: 0 };
      tiers[tier.id] = {
        name: tier.name,
        limit: inv.limit,
        claimed: inv.claimed,
        remaining: inv.limit - inv.claimed
      };
    }
  }
  
  // SEC-004: Inventory is public, use permissive CORS
  return cacheablePublicJsonResponse({
    campaignSlug,
    tiers,
    raw: inventory
  }, 200, env);
}

async function handleRecalculateInventory(request, campaignSlug, env) {
  // Require admin auth for recalculation (SEC-006)
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  if (!campaignSlug) {
    return jsonResponse({ error: 'Missing campaign slug' }, 400);
  }

  const campaign = await getCampaign(env, campaignSlug);
  if (!campaign) {
    return jsonResponse({ error: 'Campaign not found' }, 404);
  }

  const inventory = await recalculateTierInventory(env, campaignSlug, campaign.tiers || []);
  
  return jsonResponse({
    success: true,
    message: 'Tier inventory recalculated',
    inventory
  });
}

async function handleInitAllInventory(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const { campaigns } = await getCampaigns(env);
  const results = { initialized: [], skipped: [], errors: [] };

  for (const campaign of campaigns) {
    try {
      // Check if inventory already exists
      const existing = await getTierInventory(env, campaign.slug);
      
      if (Object.keys(existing).length > 0) {
        results.skipped.push({ slug: campaign.slug, reason: 'Already initialized' });
        continue;
      }

      // Get tiers with limits
      const tiersWithLimits = (campaign.tiers || []).filter(t => t.limit_total);
      
      if (tiersWithLimits.length === 0) {
        results.skipped.push({ slug: campaign.slug, reason: 'No limited tiers' });
        continue;
      }

      // Recalculate from existing pledges
      const inventory = await recalculateTierInventory(env, campaign.slug, campaign.tiers || []);
      results.initialized.push({ 
        slug: campaign.slug, 
        tiers: Object.keys(inventory).length,
        inventory 
      });
    } catch (err) {
      results.errors.push({ slug: campaign.slug, error: err.message });
    }
  }

  return jsonResponse({
    success: true,
    message: 'Tier inventory initialization complete',
    ...results
  });
}

/**
 * Admin: Recover a missed Stripe checkout session
 * 
 * Use this when a webhook was missed (e.g., local dev Worker wasn't running).
 * Fetches the checkout session from Stripe and creates the pledge if not exists.
 * 
 * POST /admin/recover-checkout
 * Body: { sessionId: "cs_test_..." } or { orderId: "pledge-..." }
 */
async function handleRecoverCheckout(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const { sessionId, orderId } = body;
  
  if (!sessionId && !orderId) {
    return jsonResponse({ error: 'Missing sessionId or orderId' }, 400);
  }

  const stripe = createStripeClient(getStripeKey(env));
  
  try {
    let session;
    
    if (sessionId) {
      // Fetch by session ID
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } else {
      // Search for session by orderId in metadata
      const sessions = await stripe.checkout.sessions.list({ limit: 100 });
      session = sessions.data.find(s => s.metadata?.orderId === orderId);
      if (!session) {
        return jsonResponse({ error: 'No checkout session found with that orderId' }, 404);
      }
    }

    if (session.status !== 'complete') {
      return jsonResponse({ 
        error: 'Checkout session is not complete',
        status: session.status,
        sessionId: session.id
      }, 400);
    }

    if (session.mode !== 'setup') {
      return jsonResponse({ error: 'Session is not a setup mode session' }, 400);
    }

    const metadata = session.metadata || {};
    const pledgeOrderId = metadata.orderId;
    
    if (!pledgeOrderId) {
      return jsonResponse({ error: 'No orderId in session metadata' }, 400);
    }

    // Check if pledge already exists
    if (env.PLEDGES) {
      const existing = await env.PLEDGES.get(`pledge:${pledgeOrderId}`, { type: 'json' });
      if (existing) {
        await clearTierReservation(env, metadata.campaignSlug, pledgeOrderId);
        return jsonResponse({ 
          error: 'Pledge already exists',
          orderId: pledgeOrderId,
          pledge: existing
        }, 409);
      }
    }

    // Get setup intent details
    const setupIntentId = session.setup_intent;
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    const paymentMethodId = setupIntent.payment_method;
    const customerId = session.customer;
    const email = session.customer_email || session.customer_details?.email;

    const campaignSlug = metadata.campaignSlug;
    const amountCents = parseInt(metadata.amountCents) || 0;
    const tierId = metadata.tierId || null;
    const tierName = metadata.tierName || null;
    const tierQty = parseInt(metadata.tierQty) || 1;

    const campaign = await getCampaign(env, campaignSlug);
    const campaignTitle = campaign?.title || campaignSlug;

    const tipPercent = metadata.tipPercent === undefined || metadata.tipPercent === null || metadata.tipPercent === ''
      ? 0
      : sanitizePlatformTipPercent(metadata.tipPercent, DEFAULT_PLATFORM_TIP_PERCENT);

    let additionalTiers = [];
    if (metadata.hasAdditionalTiers === 'true' && env.PLEDGES) {
      additionalTiers = await env.PLEDGES.get(`pending-tiers:${pledgeOrderId}`, { type: 'json' }) || [];
    }

    let supportItems = [];
    let customAmount = 0;
    if (metadata.hasExtras === 'true' && env.PLEDGES) {
      const extras = await env.PLEDGES.get(`pending-extras:${pledgeOrderId}`, { type: 'json' });
      if (extras) {
        supportItems = extras.supportItems || [];
        customAmount = extras.customAmount || 0;
      }
    }

    const tierSelection = buildTierSelectionFromStartRequest(campaign, {
      tierId,
      tierQty,
      additionalTiers
    });
    if (!tierSelection.valid) {
      return jsonResponse({ error: tierSelection.error }, 409);
    }

    const thresholdValidation = await validateTierThresholdSelection(
      env,
      campaignSlug,
      campaign,
      tierSelection.selectedTiers
    );
    if (!thresholdValidation.valid) {
      return jsonResponse({ error: thresholdValidation.error }, 409);
    }

    const desiredSupportItems = buildDesiredSupportItems(campaign, [], supportItems);
    if (!desiredSupportItems.valid) {
      return jsonResponse({ error: desiredSupportItems.error }, 409);
    }

    const canonicalContribution = buildCanonicalContribution(env, campaign, {
      tierSelection,
      supportItems: desiredSupportItems.supportItems,
      customAmount,
      tipPercent
    });
    if (!canonicalContribution.valid) {
      return jsonResponse({ error: canonicalContribution.error }, 409);
    }

    const availability = await ensureTierAvailability(
      env,
      campaignSlug,
      campaign,
      canonicalContribution.selectedTiers,
      {},
      pledgeOrderId
    );
    if (!availability.valid) {
      return jsonResponse({ error: availability.error }, 409);
    }

    const pledge = {
      orderId: pledgeOrderId,
      email,
      campaignSlug,
      tierId: canonicalContribution.tierId,
      tierName: canonicalContribution.tierName,
      tierQty: canonicalContribution.tierQty,
      additionalTiers: canonicalContribution.additionalTiers.length > 0 ? canonicalContribution.additionalTiers : undefined,
      supportItems: canonicalContribution.supportItems.length > 0 ? canonicalContribution.supportItems : undefined,
      customAmount: canonicalContribution.customAmount > 0 ? canonicalContribution.customAmount : undefined,
      subtotal: canonicalContribution.totals.subtotal,
      tax: canonicalContribution.totals.tax,
      shipping: canonicalContribution.totals.shipping,
      tipPercent: canonicalContribution.totals.tipPercent,
      tipAmount: canonicalContribution.totals.tipAmount,
      amount: canonicalContribution.totals.amount,
      stripeCustomerId: customerId,
      stripePaymentMethodId: paymentMethodId,
      stripeSetupIntentId: setupIntentId,
      pledgeStatus: 'active',
      charged: false,
      createdAt: new Date(session.created * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
      recoveredAt: new Date().toISOString()
    };

    if (env.PLEDGES) {
      const persisted = await persistNewPledge(env, {
        campaign,
        campaignSlug,
        pledgeData: pledge,
        supportItems: canonicalContribution.supportItems,
        selectedTiers: canonicalContribution.selectedTiers
      });
      if (!persisted.success) {
        return jsonResponse({ error: persisted.error }, 409);
      }
    }

    // Optionally send confirmation email
    const sendEmail = body.sendEmail !== false;
    if (sendEmail && email) {
      try {
        const token = await generateToken(env.MAGIC_LINK_SECRET, {
          orderId: pledgeOrderId,
          email,
          campaignSlug
        });
        const manageUrl = `${env.SITE_BASE}/manage/?t=${token}`;
        
        await sendSupporterEmail(env, {
          email,
          campaignTitle,
          campaignSlug,
          subtotal: canonicalContribution.totals.subtotal,
          tax: canonicalContribution.totals.tax,
          shipping: canonicalContribution.totals.shipping,
          tipAmount: canonicalContribution.totals.tipAmount,
          tipPercent: canonicalContribution.totals.tipPercent,
          token,
          instagramUrl: campaign?.instagram,
          hasDecisions: campaign?.has_decisions === true,
          pledgeItems: {
            tierName: canonicalContribution.tierName || null,
            tierQty: canonicalContribution.tierQty || 1,
            additionalTiers: canonicalContribution.additionalTiers.map(t => ({
              ...t,
              name: campaign?.tiers?.find(ct => ct.id === t.id)?.name || t.id
            })),
            supportItems: getSupportItemsWithLabels(campaign, canonicalContribution.supportItems),
            customAmount: canonicalContribution.customAmount
          }
        });
        pledge.emailSent = true;
      } catch (emailErr) {
        console.error('Failed to send recovery email:', emailErr.message);
        pledge.emailError = emailErr.message;
      }
    }

    return jsonResponse({
      success: true,
      message: 'Pledge recovered from Stripe checkout session',
      pledge,
      stripeSessionId: session.id
    });

  } catch (err) {
    console.error('Recovery error:', err);
    return jsonResponse({ 
      error: 'Failed to recover checkout session',
      details: err.message 
    }, 500);
  }
}

// SEC-004 & SEC-012: Response helpers use imported getAllowedOrigin and SECURITY_HEADERS from validation.js

const PUBLIC_READ_CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=300';

function jsonResponse(data, status = 200, env = null, isPublic = false, extraHeaders = {}) {
  const origin = getAllowedOrigin(env, isPublic);
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
      ...extraHeaders,
      ...SECURITY_HEADERS
    }
  });
}

function cacheablePublicJsonResponse(data, status = 200, env = null) {
  return jsonResponse(data, status, env, true, {
    'Cache-Control': PUBLIC_READ_CACHE_CONTROL
  });
}

function corsResponse(env = null, isPublic = false) {
  const origin = getAllowedOrigin(env, isPublic);
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
      ...SECURITY_HEADERS
    }
  });
}
