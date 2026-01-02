/**
 * The Pool - Pledge Worker
 * 
 * Routes:
 *   POST /start              - Create Stripe SetupIntent session
 *   POST /webhooks/stripe    - Handle Stripe webhooks
 *   POST /webhooks/snipcart  - Handle Snipcart webhooks
 *   POST /payment-methods    - Snipcart custom payment gateway: return available methods
 *   GET  /checkout           - Custom payment gateway checkout page
 *   GET  /pledge             - Get single pledge details (legacy)
 *   GET  /pledges            - Get all pledges for user
 *   POST /pledge/cancel      - Cancel a pledge
 *   POST /pledge/modify      - Modify pledge tier/amount
 *   POST /pledge/payment-method/start - Update payment method
 *   GET  /votes              - Get voting status
 *   POST /votes              - Cast a vote
 *   GET  /stats/:slug        - Get live pledge stats for a campaign
 *   POST /stats/:slug/recalculate - Recalculate stats from KV (admin)
 *   GET  /inventory/:slug    - Get tier inventory (remaining counts) for a campaign
 *   POST /inventory/:slug/recalculate - Recalculate tier inventory from pledges (admin)
 *   POST /admin/inventory/init-all    - Initialize inventory for all campaigns (admin)
 *   POST /admin/rebuild      - Trigger GitHub Pages rebuild (admin)
 *   POST /admin/broadcast/diary     - Send diary update to all campaign supporters
 *   POST /admin/broadcast/milestone - Send milestone notification to all campaign supporters
 *   POST /admin/milestone-check/:slug - Check and trigger any pending milestones for a campaign
 *   POST /admin/settle/:slug        - Settle campaign: charge pledges if funded + deadline passed
 *   POST /admin/recover-checkout   - Recover missed Stripe webhook (creates pledge from session)
 *   POST /test/setup         - Create test pledges (test mode only)
 *   POST /test/cleanup       - Remove test pledges (test mode only)
 *   POST /test/email         - Test individual email sends (test mode only)
 */

import { generateToken, verifyToken } from './token.js';
import { sendSupporterEmail, sendPaymentFailedEmail, sendPledgeModifiedEmail, sendDiaryUpdateEmail, sendMilestoneEmail, sendChargeSuccessEmail } from './email.js';
import { handleGetVotes, handlePostVote } from './routes/votes.js';
import { verifyStripeSignature, createStripeClient } from './stripe.js';
import { isCampaignLive, getCampaign, getCampaigns, validateTier, getEffectiveState } from './campaigns.js';
import { createSnipcartClient, extractPledgeFromOrder, canCancelOrder, canModifyOrder } from './snipcart.js';
import { getCampaignStats, addPledgeToStats, removePledgeFromStats, modifyPledgeInStats, recalculateStats, getTierInventory, claimTierInventory, releaseTierInventory, adjustTierInventory, recalculateTierInventory, checkMilestones, markMilestoneSent, getSentMilestones, updateSupportItemStats } from './stats.js';
import { triggerSiteRebuild } from './github.js';
import { isValidSlug, isValidEmail, isValidAmount, SECURITY_HEADERS, getAllowedOrigin } from './validation.js';

const ABQ_TAX_RATE = 0.07875; // 7.875% ABQ tax

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
// Returns deadline as end of day (23:59:59) in Mountain Time
function getDeadlineMT(dateString) {
  // Parse date as YYYY-MM-DD and treat as Mountain Time
  // Add 7 hours to convert MT midnight to UTC (conservative: uses MST year-round)
  const [year, month, day] = dateString.split('-').map(Number);
  // End of day in MT = 23:59:59 MT = next day 06:59:59 UTC (MST) or 05:59:59 UTC (MDT)
  // Using MST (UTC-7) to be conservative - campaigns end at 11:59:59 PM MST
  return new Date(Date.UTC(year, month - 1, day, 23 + 7, 59, 59));
}

// Check if we're past the deadline in Mountain Time
function isDeadlinePassed(dateString) {
  const deadline = getDeadlineMT(dateString);
  return new Date() > deadline;
}

function calculateTax(subtotalCents) {
  return Math.round(subtotalCents * ABQ_TAX_RATE);
}

function calculateTotalWithTax(subtotalCents) {
  return subtotalCents + calculateTax(subtotalCents);
}

function getStripeKey(env) {
  if (env.SNIPCART_MODE === 'test' && env.STRIPE_SECRET_KEY_TEST) {
    return env.STRIPE_SECRET_KEY_TEST;
  }
  if (env.SNIPCART_MODE === 'live' && env.STRIPE_SECRET_KEY_LIVE) {
    return env.STRIPE_SECRET_KEY_LIVE;
  }
  return env.STRIPE_SECRET_KEY;
}

function getStripeWebhookSecret(env) {
  if (env.SNIPCART_MODE === 'test' && env.STRIPE_WEBHOOK_SECRET_TEST) {
    return env.STRIPE_WEBHOOK_SECRET_TEST;
  }
  if (env.SNIPCART_MODE === 'live' && env.STRIPE_WEBHOOK_SECRET_LIVE) {
    return env.STRIPE_WEBHOOK_SECRET_LIVE;
  }
  return env.STRIPE_WEBHOOK_SECRET;
}

function getSnipcartSecret(env) {
  if (env.SNIPCART_MODE === 'test' && env.SNIPCART_SECRET_TEST) {
    return env.SNIPCART_SECRET_TEST;
  }
  if (env.SNIPCART_MODE === 'live' && env.SNIPCART_SECRET_LIVE) {
    return env.SNIPCART_SECRET_LIVE;
  }
  return env.SNIPCART_SECRET;
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
      // SEC-003: Block test endpoints in production mode
      if (path.startsWith('/test/') && env.SNIPCART_MODE !== 'test') {
        return jsonResponse({ error: 'Not found' }, 404);
      }

      if (path === '/start' && method === 'POST') {
        return handleStart(request, env);
      }

      if (path === '/webhooks/stripe' && method === 'POST') {
        return handleStripeWebhook(request, env);
      }

      if (path === '/webhooks/snipcart' && method === 'POST') {
        return handleSnipcartWebhook(request, env, ctx);
      }

      // Snipcart Custom Payment Gateway endpoints
      if (path === '/payment-methods' && method === 'POST') {
        return handlePaymentMethods(request, env);
      }

      if (path === '/checkout' && method === 'GET') {
        return handleCheckout(request, env);
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

      if (path === '/admin/broadcast/diary' && method === 'POST') {
        const rl = await checkRateLimit(request, env, RATE_LIMITS.admin);
        if (!rl.allowed) return rl.response;
        return handleBroadcastDiary(request, env);
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

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse({ error: 'Internal server error' }, 500);
    }
  },

  // Cron trigger: runs daily at 7 AM UTC (midnight MST)
  // 1. Check for campaigns that should transition pre → live (based on start_date)
  // 2. Auto-settle campaigns that have passed deadline and met goal
  async scheduled(event, env, ctx) {
    console.log('⏰ Scheduled task triggered:', new Date().toISOString());
    
    try {
      const campaigns = await getCampaigns(env);
      const results = { checked: 0, settled: 0, transitioned: 0, errors: [] };
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
        
        // Check if already settled (all pledges charged)
        const stats = await getCampaignStats(env, campaign.slug);
        const goalAmountCents = campaign.goal_amount * 100;
        
        if (stats.pledgedAmount < goalAmountCents) {
          console.log(`⏰ Campaign ${campaign.slug}: not funded (${stats.pledgedAmount}/${goalAmountCents})`);
          continue;
        }
        
        // Check if there are any uncharged active pledges
        const list = await env.PLEDGES.list({ prefix: 'pledge:' });
        let hasUnchargedPledges = false;
        
        for (const key of list.keys) {
          const pledge = await env.PLEDGES.get(key.name, { type: 'json' });
          if (pledge && 
              pledge.campaignSlug === campaign.slug && 
              pledge.pledgeStatus === 'active' &&
              !pledge.charged) {
            hasUnchargedPledges = true;
            break;
          }
        }
        
        if (!hasUnchargedPledges) {
          console.log(`⏰ Campaign ${campaign.slug}: no uncharged pledges`);
          continue;
        }
        
        // Settle this campaign
        console.log(`⏰ Auto-settling campaign: ${campaign.slug}`);
        try {
          const settleResult = await settleCampaign(campaign.slug, env);
          results.settled++;
          console.log(`✅ Campaign ${campaign.slug} settled:`, settleResult);
        } catch (settleErr) {
          results.errors.push({ campaign: campaign.slug, error: settleErr.message });
          console.error(`❌ Failed to settle ${campaign.slug}:`, settleErr.message);
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
    }
  }
};

async function handleStart(request, env) {
  // SEC-005: Rate limit pledge creation
  const rateLimit = await checkRateLimit(request, env, RATE_LIMITS.start);
  if (!rateLimit.allowed) return rateLimit.response;

  console.log('📥 /start called');
  const body = await request.json();
  const { orderId, campaignSlug, amountCents, email, tierId, tierName, tierQty = 1, additionalTiers = [], customerName, phone, billingAddress } = body;
  console.log('📥 /start payload:', { orderId, campaignSlug, amountCents, email, tierId, tierName, tierQty, additionalTiers });

  if (!orderId || !campaignSlug) {
    console.log('📥 /start: Missing required fields');
    return jsonResponse({ error: 'Missing required fields' }, 400);
  }

  // SEC-011: Validate inputs before processing
  if (!isValidSlug(campaignSlug)) {
    console.log('📥 /start: Invalid campaign slug format');
    return jsonResponse({ error: 'Invalid campaign slug format' }, 400);
  }

  if (email && !isValidEmail(email)) {
    console.log('📥 /start: Invalid email format');
    return jsonResponse({ error: 'Invalid email format' }, 400);
  }

  if (amountCents !== undefined && !isValidAmount(amountCents)) {
    console.log('📥 /start: Invalid amount');
    return jsonResponse({ error: 'Invalid amount' }, 400);
  }

  const { valid, error, campaign } = await isCampaignLive(env, campaignSlug);
  console.log('📥 /start: Campaign check:', { valid, error });
  if (!valid) {
    return jsonResponse({ error: error || 'Campaign not accepting pledges' }, 400);
  }

  // Check tier inventory before creating Stripe session
  const inventory = await getTierInventory(env, campaignSlug);
  
  // Check main tier
  if (tierId && inventory[tierId]) {
    const remaining = inventory[tierId].limit - inventory[tierId].claimed;
    console.log('📥 /start: Tier inventory check:', { tierId, tierQty, remaining });
    if (tierQty > remaining) {
      return jsonResponse({ 
        error: remaining === 0 
          ? 'This tier is sold out' 
          : `Only ${remaining} remaining for this tier`,
        remaining 
      }, 400);
    }
  }
  
  // Check additional tiers
  for (const addTier of additionalTiers) {
    if (inventory[addTier.id]) {
      const remaining = inventory[addTier.id].limit - inventory[addTier.id].claimed;
      const qty = addTier.qty || 1;
      console.log('📥 /start: Additional tier inventory check:', { tierId: addTier.id, qty, remaining });
      if (qty > remaining) {
        return jsonResponse({ 
          error: remaining === 0 
            ? `Tier "${addTier.id}" is sold out` 
            : `Only ${remaining} remaining for tier "${addTier.id}"`,
          remaining 
        }, 400);
      }
    }
  }

  const snipcartSecret = getSnipcartSecret(env);
  if (snipcartSecret) {
    try {
      const snipcart = createSnipcartClient(snipcartSecret);
      const order = await snipcart.orders.get(orderId);
      
      if (extractPledgeFromOrder(order)?.campaignSlug !== campaignSlug) {
        console.warn('Order campaign mismatch:', { orderId, campaignSlug });
      }
    } catch (err) {
      console.error('Snipcart order verification failed:', err.message);
    }
  }

  // Store additional tiers in KV for webhook to use (Stripe metadata has 500 char limit)
  if (additionalTiers.length > 0 && env.PLEDGES) {
    await env.PLEDGES.put(`pending-tiers:${orderId}`, JSON.stringify(additionalTiers), { expirationTtl: 3600 });
    console.log('📥 /start: Stored additional tiers for order:', orderId, additionalTiers);
  }

  const stripeKey = getStripeKey(env);
  console.log('📥 /start: Using Stripe key:', stripeKey ? 'present' : 'MISSING');
  
  const stripe = createStripeClient(stripeKey);
  
  try {
    const sessionParams = {
      mode: 'setup',
      payment_method_types: ['card'],
      success_url: `${env.SITE_BASE}/pledge-success/?orderId=${orderId}`,
      cancel_url: `${env.SITE_BASE}/pledge-cancelled/`,
      metadata: {
        orderId,
        campaignSlug,
        amountCents: String(amountCents || 0),
        tierId: tierId || '',
        tierName: tierName || '',
        tierQty: String(tierQty || 1),
        hasAdditionalTiers: additionalTiers.length > 0 ? 'true' : ''
      }
    };
    
    // Create or find a Stripe customer with billing info to pre-fill checkout
    console.log('📥 /start: Billing data received:', { customerName, phone, billingAddress });
    if (email) {
      try {
        // Create customer with billing details
        const customerData = {
          email,
          name: customerName || undefined,
          phone: phone || undefined
        };
        
        if (billingAddress) {
          customerData.address = billingAddress;
        }
        
        console.log('📥 /start: Creating customer with:', JSON.stringify(customerData));
        const customer = await stripe.customers.create(customerData);
        console.log('📥 /start: Customer response:', JSON.stringify(customer));
        if (customer.id) {
          sessionParams.customer = customer.id;
          console.log('📥 /start: Created Stripe customer:', customer.id);
        } else if (customer.error) {
          console.error('📥 /start: Customer creation error:', customer.error.message);
          sessionParams.customer_email = email;
        }
      } catch (custErr) {
        console.error('📥 /start: Could not create customer, using email only:', custErr.message);
        sessionParams.customer_email = email;
      }
    }
    
    const session = await stripe.checkout.sessions.create(sessionParams);
    
    console.log('📥 /start: Stripe session created, URL:', session.url ? 'present' : 'missing');
    return jsonResponse({ url: session.url });
  } catch (stripeErr) {
    console.error('📥 /start: Stripe error:', stripeErr.message);
    return jsonResponse({ error: 'Failed to create checkout session: ' + stripeErr.message }, 500);
  }
}

/**
 * Snipcart Custom Payment Gateway: Return available payment methods
 * Returns empty array to disable - we use custom template override with /start instead
 */
async function handlePaymentMethods(request, env) {
  const body = await request.json();
  const { publicToken, mode } = body;

  console.log('📦 Payment methods request (disabled - using template override):', { publicToken: publicToken?.slice(0, 10) + '...', mode });

  // Return empty array - Pool uses custom payment template that calls /start directly
  // This prevents duplicate checkout sessions and emails
  return jsonResponse([]);
}

/**
 * Custom Payment Gateway: Checkout page
 * User lands here after selecting "Pledge" - we redirect to Stripe SetupIntent
 */
async function handleCheckout(request, env) {
  const url = new URL(request.url);
  const publicToken = url.searchParams.get('publicToken');

  if (!publicToken) {
    return new Response('Missing publicToken', { status: 400 });
  }

  // Fetch the payment session from Snipcart
  const sessionRes = await fetch(
    `https://payment.snipcart.com/api/public/custom-payment-gateway/payment-session?publicToken=${publicToken}`
  );

  if (!sessionRes.ok) {
    console.error('Failed to fetch payment session:', sessionRes.status);
    return new Response('Invalid payment session', { status: 400 });
  }

  const session = await sessionRes.json();
  const invoice = session.invoice;
  const paymentSessionId = session.id;

  // Extract campaign info from items
  const items = invoice?.items || [];
  const firstItem = items.find(i => i.type === 'Physical' || i.type === 'Digital');
  
  // Try to extract campaign slug from item URL or name
  let campaignSlug = null;
  for (const item of items) {
    if (item.url) {
      const match = item.url.match(/\/campaigns\/([^\/]+)/);
      if (match) {
        campaignSlug = match[1];
        break;
      }
    }
  }

  if (!campaignSlug) {
    console.error('Could not determine campaign from items:', items);
    return new Response('Could not determine campaign', { status: 400 });
  }

  // Validate campaign is live
  const { valid, error } = await isCampaignLive(env, campaignSlug);
  if (!valid) {
    return new Response(error || 'Campaign not accepting pledges', { status: 400 });
  }

  // Extract tier info
  const tierItem = items.find(item => 
    item.name?.includes('__') || item.id?.includes('__')
  );
  const tierId = tierItem?.id?.split('__')[1] || null;
  const tierName = tierItem?.name?.split(' — ')[1] || tierItem?.name || null;

  // Amount in cents
  const amountCents = Math.round((invoice.amount || 0) * 100);

  // Create Stripe Checkout session in setup mode
  const stripe = createStripeClient(getStripeKey(env));
  
  // Generate a unique order ID that includes the Snipcart payment session
  const orderId = `pool-${paymentSessionId}`;

  const stripeSession = await stripe.checkout.sessions.create({
    mode: 'setup',
    payment_method_types: ['card'],
    customer_email: invoice.email,
    success_url: `${env.SITE_BASE}/pledge-success/?orderId=${orderId}&publicToken=${publicToken}&sessionId=${paymentSessionId}`,
    cancel_url: `${env.SITE_BASE}/pledge-cancelled/`,
    metadata: {
      orderId,
      campaignSlug,
      amountCents: String(amountCents),
      tierId: tierId || '',
      tierName: tierName || '',
      snipcartPaymentSessionId: paymentSessionId,
      snipcartPublicToken: publicToken
    }
  });

  // Redirect to Stripe
  return Response.redirect(stripeSession.url, 302);
}

async function handleStripeWebhook(request, env) {
  console.log('📨 Stripe webhook received');
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  // SEC-002: Fail closed if webhook secret is not configured
  const webhookSecret = getStripeWebhookSecret(env);
  if (!webhookSecret) {
    console.error('CRITICAL: Stripe webhook secret not configured');
    return jsonResponse({ error: 'Webhook not configured' }, 500);
  }

  const { valid, error } = await verifyStripeSignature(body, sig, webhookSecret);
  if (!valid) {
    console.error('Webhook signature verification failed:', error);
    return jsonResponse({ error: 'Invalid signature' }, 401);
  }

  const event = JSON.parse(body);
  console.log('📨 Event type:', event.type);

  // Mode check: only process events that match our environment
  // - Production (SNIPCART_MODE=live) only processes live events
  // - Dev (SNIPCART_MODE=test) only processes test events
  const isLiveEvent = event.livemode === true;
  const isLiveMode = env.SNIPCART_MODE === 'live';
  if (isLiveEvent !== isLiveMode) {
    console.log('📨 Skipping event (mode mismatch):', { eventId: event.id, isLiveEvent, isLiveMode });
    return jsonResponse({ received: true });
  }

  // Idempotency: skip if we've already processed this event
  if (env.PLEDGES) {
    const eventKey = `stripe-event:${event.id}`;
    const alreadyProcessed = await env.PLEDGES.get(eventKey);
    if (alreadyProcessed) {
      console.log('📨 Skipping duplicate event:', event.id);
      return jsonResponse({ received: true });
    }
    // Mark event as processed (expires in 24 hours)
    await env.PLEDGES.put(eventKey, 'processed', { expirationTtl: 86400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    if (session.mode === 'setup') {
      const { orderId, campaignSlug, amountCents, tierId, tierName, tierQty, hasAdditionalTiers, isPaymentUpdate, snipcartPaymentSessionId, snipcartPublicToken } = session.metadata;
      const tierQtyNum = parseInt(tierQty) || 1;
      const email = session.customer_email || session.customer_details?.email;
      const customerId = session.customer;
      const setupIntentId = session.setup_intent;

      // Fetch additional tiers from KV if present
      let additionalTiers = [];
      if (hasAdditionalTiers === 'true' && env.PLEDGES) {
        additionalTiers = await env.PLEDGES.get(`pending-tiers:${orderId}`, { type: 'json' }) || [];
        if (additionalTiers.length > 0) {
          console.log('📨 Found additional tiers for order:', orderId, additionalTiers);
          // Clean up the temporary key
          await env.PLEDGES.delete(`pending-tiers:${orderId}`);
        }
      }

      const stripe = createStripeClient(getStripeKey(env));
      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      const paymentMethodId = setupIntent.payment_method;

      const campaign = await getCampaign(env, campaignSlug);
      const campaignTitle = campaign?.title || campaignSlug.replace(/-/g, ' ').toUpperCase();

      // If this came from Snipcart custom payment gateway, confirm the payment
      if (snipcartPaymentSessionId) {
        console.log('📦 Confirming Snipcart payment session:', snipcartPaymentSessionId);
        const snipcartSecret = getSnipcartSecret(env);
        if (snipcartSecret) {
          try {
            const confirmRes = await fetch('https://payment.snipcart.com/api/private/custom-payment-gateway/payment', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${snipcartSecret}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                paymentSessionId: snipcartPaymentSessionId,
                state: 'processed',
                transactionId: setupIntentId,
                instructions: 'Your card has been saved. You will only be charged if the campaign reaches its funding goal.',
                suppressOrderConfirmationEmail: true
              })
            });
            if (!confirmRes.ok) {
              console.error('Failed to confirm Snipcart payment:', await confirmRes.text());
            } else {
              console.log('📦 Snipcart payment confirmed successfully');
            }
          } catch (err) {
            console.error('Error confirming Snipcart payment:', err);
          }
        }
      }

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

                      await sendChargeSuccessEmail(env, {
                        email: existingPledge.email,
                        campaignSlug: existingPledge.campaignSlug,
                        campaignTitle: pledgeCampaign.title || existingPledge.campaignSlug,
                        amount: existingPledge.amount,
                        token: chargeToken
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
            // Duplicate webhook - pledge already processed
            console.log('📝 Pledge already exists, skipping duplicate webhook:', orderId);
            return jsonResponse({ received: true });
          }
          
          // New pledge - process it
          const subtotal = parseInt(amountCents) || 0;
          const tax = calculateTax(subtotal);
          const now = new Date().toISOString();
          const pledgeData = {
            orderId,
            email,
            campaignSlug,
            tierId: tierId || null,
            tierName: tierName || null,
            tierQty: tierQtyNum,
            additionalTiers: additionalTiers.length > 0 ? additionalTiers : undefined,
            subtotal,
            tax,
            amount: subtotal + tax,
            stripeCustomerId: customerId,
            stripePaymentMethodId: paymentMethodId,
            stripeSetupIntentId: setupIntentId,
            pledgeStatus: 'active',
            charged: false,
            createdAt: now,
            updatedAt: now,
            history: [{
              type: 'created',
              subtotal,
              tax,
              amount: subtotal + tax,
              tierId: tierId || null,
              tierQty: tierQtyNum,
              additionalTiers: additionalTiers.length > 0 ? additionalTiers : undefined,
              at: now
            }]
          };

          await env.PLEDGES.put(`pledge:${orderId}`, JSON.stringify(pledgeData));
          
          const emailKey = `email:${email.toLowerCase()}`;
          const existingOrders = await env.PLEDGES.get(emailKey, { type: 'json' }) || [];
          if (!existingOrders.includes(orderId)) {
            existingOrders.push(orderId);
            await env.PLEDGES.put(emailKey, JSON.stringify(existingOrders));
          }

          // Update live stats (use subtotal for goal progress tracking)
          console.log('📊 Updating stats for campaign:', campaignSlug, 'subtotal:', subtotal);
          await addPledgeToStats(env, {
            campaignSlug,
            amount: subtotal,
            tierId: tierId || null,
            tierQty: tierQtyNum,
            additionalTiers
          });
          console.log('📊 Stats updated successfully');

          // Check for milestone emails (async, don't block)
          triggerMilestoneEmails(env, campaignSlug).catch(err => {
            console.error('Milestone email trigger failed:', err.message);
          });

          // Claim tier inventory for limited tiers (auto-initializes if needed)
          if (tierId) {
            const inventoryClaim = await claimTierInventory(env, campaignSlug, tierId, tierQtyNum, campaign);
            if (inventoryClaim.success) {
              console.log('📦 Tier inventory claimed:', tierId, 'qty:', tierQtyNum, 'remaining:', inventoryClaim.remaining);
            }
          }
          
          // Claim inventory for additional tiers
          for (const addTier of additionalTiers) {
            const qty = addTier.qty || 1;
            const inventoryClaim = await claimTierInventory(env, campaignSlug, addTier.id, qty, campaign);
            if (inventoryClaim.success) {
              console.log('📦 Additional tier inventory claimed:', addTier.id, 'qty:', qty, 'remaining:', inventoryClaim.remaining);
            }
          }

          // Send supporter confirmation email
          const token = await generateToken(env.MAGIC_LINK_SECRET, {
            orderId,
            email,
            campaignSlug
          });

          await sendSupporterEmail(env, {
            email,
            campaignSlug,
            campaignTitle,
            amount: parseInt(amountCents) || 0,
            token
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
      
      const token = await generateToken(env.MAGIC_LINK_SECRET, {
        orderId,
        email,
        campaignSlug
      });

      await sendPaymentFailedEmail(env, {
        email,
        campaignSlug,
        campaignTitle,
        token
      });

      if (env.PLEDGES) {
        const pledgeData = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
        if (pledgeData) {
          pledgeData.pledgeStatus = 'payment_failed';
          pledgeData.lastPaymentError = paymentIntent.last_payment_error?.message || 'Unknown error';
          pledgeData.updatedAt = new Date().toISOString();
          await env.PLEDGES.put(`pledge:${orderId}`, JSON.stringify(pledgeData));
        }
      }
    }
  }

  return jsonResponse({ received: true });
}

async function handleSnipcartWebhook(request, env, ctx) {
  const body = await request.text();
  
  // SEC-007: Fail closed if webhook secret not configured, use timing-safe comparison
  if (!env.SNIPCART_WEBHOOK_SECRET) {
    console.error('CRITICAL: SNIPCART_WEBHOOK_SECRET not configured');
    return jsonResponse({ error: 'Webhook not configured' }, 500);
  }
  
  const requestToken = request.headers.get('x-snipcart-requesttoken') || '';
  if (!timingSafeEqual(requestToken, env.SNIPCART_WEBHOOK_SECRET)) {
    console.error('Invalid Snipcart webhook token');
    return jsonResponse({ error: 'Invalid token' }, 401);
  }

  const event = JSON.parse(body);
  console.log('Snipcart webhook received:', event.eventName);

  // Pool uses custom template override that calls /start directly, bypassing Snipcart payments.
  // The Stripe webhook handles all pledge creation, stats, emails, and milestones.
  // This webhook is kept for potential future use but does not process order.completed events
  // to avoid duplicate pledges, stats, and emails.
  
  if (event.eventName === 'order.completed') {
    const order = event.content;
    console.log('Snipcart order.completed received (ignored - handled by Stripe webhook):', { 
      orderId: order.token, 
      email: order.email 
    });
  }

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
      return jsonResponse({
        orderId: pledgeData.orderId,
        email: pledgeData.email,
        campaignSlug: pledgeData.campaignSlug,
        pledgeStatus: pledgeData.pledgeStatus,
        amount: pledgeData.amount,
        tierId: pledgeData.tierId,
        tierName: pledgeData.tierName,
        canModify: pledgeData.pledgeStatus === 'active' && !pledgeData.charged,
        canCancel: pledgeData.pledgeStatus === 'active' && !pledgeData.charged,
        canUpdatePaymentMethod: !pledgeData.charged
      });
    }
  }

  const snipcartSecret = getSnipcartSecret(env);
  if (snipcartSecret) {
    try {
      const snipcart = createSnipcartClient(snipcartSecret);
      const order = await snipcart.orders.get(payload.orderId);
      const pledge = extractPledgeFromOrder(order);
      const cancelCheck = canCancelOrder(order);
      const modifyCheck = canModifyOrder(order);

      return jsonResponse({
        orderId: order.token,
        email: order.email,
        campaignSlug: pledge?.campaignSlug || payload.campaignSlug,
        pledgeStatus: order.metadata?.pledgeStatus || 'active',
        amount: pledge?.amount || 0,
        tierId: pledge?.tierId || null,
        tierName: pledge?.tierName || null,
        canModify: modifyCheck.allowed,
        canCancel: cancelCheck.allowed,
        canUpdatePaymentMethod: !order.metadata?.charged
      });
    } catch (err) {
      console.error('Failed to fetch Snipcart order:', err.message);
    }
  }

  return jsonResponse({
    orderId: payload.orderId,
    email: payload.email,
    campaignSlug: payload.campaignSlug,
    pledgeStatus: 'active',
    amount: 0,
    tierId: null,
    canModify: true,
    canCancel: true,
    canUpdatePaymentMethod: true
  });
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

  const pledges = [];

  if (env.PLEDGES) {
    const emailKey = `email:${payload.email.toLowerCase()}`;
    const orderIds = await env.PLEDGES.get(emailKey, { type: 'json' }) || [];
    
    for (const orderId of orderIds) {
      const pledgeData = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
      if (pledgeData && pledgeData.pledgeStatus !== 'cancelled') {
        pledges.push({
          orderId: pledgeData.orderId,
          email: pledgeData.email,
          campaignSlug: pledgeData.campaignSlug,
          pledgeStatus: pledgeData.pledgeStatus,
          subtotal: pledgeData.subtotal,
          tax: pledgeData.tax,
          amount: pledgeData.amount,
          tierId: pledgeData.tierId,
          tierName: pledgeData.tierName,
          tierQty: pledgeData.tierQty || 1,
          additionalTiers: pledgeData.additionalTiers || [],
          supportItems: pledgeData.supportItems || [],
          customAmount: pledgeData.customAmount || 0,
          canModify: pledgeData.pledgeStatus === 'active' && !pledgeData.charged,
          canCancel: pledgeData.pledgeStatus === 'active' && !pledgeData.charged,
          canUpdatePaymentMethod: !pledgeData.charged
        });
      }
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

  const targetOrderId = orderId || payload.orderId;

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
      
      // Store for stats update
      cancelledPledgeData = { ...pledgeData };
      
      const now = new Date().toISOString();
      pledgeData.pledgeStatus = 'cancelled';
      pledgeData.cancelledAt = now;
      pledgeData.updatedAt = now;
      
      // Append cancellation to history
      const cancelSubtotal = pledgeData.subtotal || pledgeData.amount || 0;
      const cancelTax = pledgeData.tax || 0;
      const cancelAmount = pledgeData.amount || 0;
      if (!pledgeData.history) {
        pledgeData.history = [{
          type: 'created',
          subtotal: cancelSubtotal,
          tax: cancelTax,
          amount: cancelAmount,
          tierId: pledgeData.tierId,
          tierQty: pledgeData.tierQty || 1,
          additionalTiers: pledgeData.additionalTiers,
          at: pledgeData.createdAt
        }];
      }
      pledgeData.history.push({
        type: 'cancelled',
        subtotalDelta: -cancelSubtotal,
        taxDelta: -cancelTax,
        amountDelta: -cancelAmount,
        at: now
      });
      
      await env.PLEDGES.put(`pledge:${targetOrderId}`, JSON.stringify(pledgeData));

      // Update live stats (use subtotal for goal tracking)
      await removePledgeFromStats(env, {
        campaignSlug: pledgeData.campaignSlug,
        amount: pledgeData.subtotal || pledgeData.amount || 0,
        tierId: pledgeData.tierId,
        tierQty: pledgeData.tierQty || 1
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
  const { token, orderId, newTierId, newTierQty, addTiers, supportItems, customAmount } = body;

  if (!token) {
    return jsonResponse({ error: 'Missing token' }, 400);
  }

  // Must have at least one change
  const hasTierChange = newTierId !== null && newTierId !== undefined;
  const hasQtyChange = newTierQty !== null && newTierQty !== undefined;
  const hasAddTiersPayload = Array.isArray(addTiers); // addTiers was passed (even if empty = tier removal)
  const hasAddTiers = addTiers && addTiers.length > 0;
  const hasSupportChange = supportItems && supportItems.length > 0;
  const hasCustomAmountChange = customAmount !== null && customAmount !== undefined;

  if (!hasTierChange && !hasQtyChange && !hasAddTiersPayload && !hasSupportChange && !hasCustomAmountChange) {
    return jsonResponse({ error: 'No changes specified' }, 400);
  }

  const payload = await verifyToken(env.MAGIC_LINK_SECRET, token);
  if (!payload) {
    return jsonResponse({ error: 'Invalid or expired token' }, 401);
  }

  const targetOrderId = orderId || payload.orderId;
  let currentPledge = null;
  let campaignSlug = payload.campaignSlug;

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
    }
  }

  const { valid, error, campaign } = await isCampaignLive(env, campaignSlug);
  if (!valid) {
    return jsonResponse({ error: error || 'Campaign no longer accepting pledges' }, 400);
  }

  let newTier = null;
  const tierQty = newTierQty || 1;

  // Validate tier change if specified
  if (hasTierChange) {
    const tierValidation = await validateTier(env, campaignSlug, newTierId, 0);
    if (!tierValidation.valid) {
      return jsonResponse({ error: tierValidation.error }, 400);
    }
    newTier = tierValidation.tier;
  }

  // Calculate new subtotal using diffs to preserve other components (custom, support items)
  // Use subtotal (pre-tax) as the base, falling back to amount for older pledges without subtotal
  let newAmount = currentPledge?.subtotal ?? currentPledge?.amount ?? 0;
  
  if (newTier || hasQtyChange) {
    // Calculate tier diff instead of replacing
    const currentTierIdRaw = currentPledge?.tierId?.split('__').pop() || currentPledge?.tierId;
    const currentQty = currentPledge?.tierQty || 1;
    
    let oldTierPrice = 0;
    if (currentTierIdRaw) {
      const oldTierValidation = await validateTier(env, campaignSlug, currentTierIdRaw, 0);
      if (oldTierValidation.valid) {
        oldTierPrice = oldTierValidation.tier.price;
      }
    }
    
    const newTierPrice = newTier ? newTier.price : oldTierPrice;
    const oldTierAmount = oldTierPrice * currentQty * 100;
    const newTierAmount = newTierPrice * tierQty * 100;
    const tierDiff = newTierAmount - oldTierAmount;
    
    newAmount += tierDiff;
  }

  // Add support item changes
  if (hasSupportChange) {
    for (const item of supportItems) {
      const diff = (item.amount - (item.currentAmount || 0)) * 100;
      newAmount += diff;
    }
  }

  // Add custom amount changes
  if (hasCustomAmountChange) {
    const currentCustom = currentPledge?.customAmount || 0;
    const customDiff = (customAmount - currentCustom) * 100;
    newAmount += customDiff;
  }

  // Handle tier changes in multi-tier mode
  if (hasAddTiersPayload) {
    // Calculate diff: new tiers vs current tiers
    const currentTierIds = new Set();
    if (currentPledge?.tierId) currentTierIds.add(currentPledge.tierId);
    if (currentPledge?.additionalTiers) {
      currentPledge.additionalTiers.forEach(t => currentTierIds.add(t.id));
    }
    
    // Subtract all current tier amounts
    for (const tierId of currentTierIds) {
      const tierValidation = await validateTier(env, campaignSlug, tierId, 0);
      if (tierValidation.valid) {
        const qty = tierId === currentPledge?.tierId 
          ? (currentPledge?.tierQty || 1)
          : (currentPledge?.additionalTiers?.find(t => t.id === tierId)?.qty || 1);
        newAmount -= tierValidation.tier.price * qty * 100;
      }
    }
    
    // Add all new tier amounts
    for (const tierItem of addTiers) {
      const tierValidation = await validateTier(env, campaignSlug, tierItem.id, 0);
      if (tierValidation.valid) {
        newAmount += tierValidation.tier.price * (tierItem.qty || 1) * 100;
      }
    }
  }

  // Calculate tax on new subtotal
  const newTax = calculateTax(newAmount);
  const newAmountWithTax = newAmount + newTax;

  // Update in KV
  if (env.PLEDGES) {
    const pledgeData = await env.PLEDGES.get(`pledge:${targetOrderId}`, { type: 'json' });
    if (pledgeData) {
      // Capture old values BEFORE any mutations for stats update
      const oldAmount = pledgeData.amount || 0;
      const oldTierId = pledgeData.tierId;
      const oldTierQty = pledgeData.tierQty || 1;

      if (newTier) {
        pledgeData.previousTierId = pledgeData.tierId;
        pledgeData.tierId = newTierId;
        pledgeData.tierName = newTier.name;
      }
      if (hasQtyChange) {
        pledgeData.tierQty = tierQty;
      }
      if (hasSupportChange) {
        pledgeData.supportItems = supportItems.map(s => ({ id: s.id, amount: s.amount }));
      }
      if (hasAddTiersPayload) {
        // In multi-tier mode, addTiers contains ALL selected tiers
        // First one becomes the main tier, rest become additionalTiers
        if (addTiers.length > 0) {
          pledgeData.tierId = addTiers[0].id;
          pledgeData.tierQty = addTiers[0].qty || 1;
          pledgeData.additionalTiers = addTiers.slice(1).map(t => ({ id: t.id, qty: t.qty || 1 }));
        } else {
          // All tiers removed
          pledgeData.tierId = null;
          pledgeData.tierName = null;
          pledgeData.tierQty = 0;
          pledgeData.additionalTiers = [];
        }
      }
      if (hasCustomAmountChange) {
        pledgeData.customAmount = customAmount;
      }
      
      // Calculate deltas for history
      const oldSubtotalForHistory = currentPledge?.subtotal ?? currentPledge?.amount ?? 0;
      const oldTaxForHistory = currentPledge?.tax ?? 0;
      const oldAmountForHistory = currentPledge?.amount ?? 0;
      const subtotalDelta = newAmount - oldSubtotalForHistory;
      const taxDelta = newTax - oldTaxForHistory;
      const amountDelta = newAmountWithTax - oldAmountForHistory;
      
      const now = new Date().toISOString();
      pledgeData.subtotal = newAmount;
      pledgeData.tax = newTax;
      pledgeData.amount = newAmountWithTax;
      pledgeData.modifiedAt = now;
      pledgeData.updatedAt = now;
      
      // Append to history (initialize if missing for legacy pledges)
      if (!pledgeData.history) {
        pledgeData.history = [{
          type: 'created',
          subtotal: oldSubtotalForHistory,
          tax: oldTaxForHistory,
          amount: oldAmountForHistory,
          tierId: oldTierId,
          tierQty: oldTierQty,
          additionalTiers: currentPledge?.additionalTiers,
          at: pledgeData.createdAt
        }];
      }
      pledgeData.history.push({
        type: 'modified',
        subtotalDelta,
        taxDelta,
        amountDelta,
        tierId: pledgeData.tierId,
        tierQty: pledgeData.tierQty,
        additionalTiers: pledgeData.additionalTiers?.length > 0 ? pledgeData.additionalTiers : undefined,
        at: now
      });
      
      await env.PLEDGES.put(`pledge:${targetOrderId}`, JSON.stringify(pledgeData));

      // Update live stats (use subtotals for goal tracking, not amounts with tax)
      const oldSubtotal = currentPledge?.subtotal ?? oldAmount;
      await modifyPledgeInStats(env, {
        campaignSlug,
        oldAmount: oldSubtotal,
        newAmount: newAmount,
        oldTierId,
        newTierId: pledgeData.tierId,
        oldTierQty,
        newTierQty: pledgeData.tierQty || 1
      });

      // Update support item stats if changed
      if (hasSupportChange && supportItems && supportItems.length > 0) {
        await updateSupportItemStats(env, campaignSlug, supportItems);
        console.log('📊 Support item stats updated:', supportItems.map(s => `${s.id}: ${s.currentAmount || 0} → ${s.amount}`).join(', '));
      }

      // Adjust tier inventory if tier or quantity changed
      if (hasAddTiersPayload) {
        // Multi-tier mode: compare old vs new tier sets and adjust inventory
        const oldTiers = {};
        if (oldTierId) oldTiers[oldTierId] = oldTierQty;
        if (currentPledge?.additionalTiers) {
          currentPledge.additionalTiers.forEach(t => {
            oldTiers[t.id] = t.qty || 1;
          });
        }
        
        const newTiers = {};
        if (pledgeData.tierId) newTiers[pledgeData.tierId] = pledgeData.tierQty || 1;
        if (pledgeData.additionalTiers) {
          pledgeData.additionalTiers.forEach(t => {
            newTiers[t.id] = t.qty || 1;
          });
        }
        
        // Release inventory for tiers that were removed or had qty reduced
        for (const [tierId, oldQty] of Object.entries(oldTiers)) {
          const newQty = newTiers[tierId] || 0;
          if (newQty < oldQty) {
            await releaseTierInventory(env, campaignSlug, tierId, oldQty - newQty);
            console.log('📦 Tier inventory released:', tierId, 'qty:', oldQty - newQty);
          }
        }
        
        // Claim inventory for tiers that were added or had qty increased
        for (const [tierId, newQty] of Object.entries(newTiers)) {
          const oldQty = oldTiers[tierId] || 0;
          if (newQty > oldQty) {
            await claimTierInventory(env, campaignSlug, tierId, newQty - oldQty, campaign);
            console.log('📦 Tier inventory claimed:', tierId, 'qty:', newQty - oldQty);
          }
        }
      } else {
        // Single-tier mode: use simpler adjustTierInventory
        const newTierIdForInventory = pledgeData.tierId;
        const newTierQtyForInventory = pledgeData.tierQty || 1;
        if (oldTierId !== newTierIdForInventory || oldTierQty !== newTierQtyForInventory) {
          await adjustTierInventory(env, campaignSlug, oldTierId, oldTierQty, newTierIdForInventory, newTierQtyForInventory);
          console.log('📦 Tier inventory adjusted:', { oldTierId, oldTierQty, newTierId: newTierIdForInventory, newTierQty: newTierQtyForInventory });
        }
      }
    }
  }

  // Sync with Snipcart
  const snipcartSecret = getSnipcartSecret(env);
  if (snipcartSecret) {
    try {
      const snipcart = createSnipcartClient(snipcartSecret);
      await snipcart.orders.update(targetOrderId, {
        metadata: {
          subtotal: newAmount,
          tax: newTax,
          totalAmount: newAmountWithTax,
          tierId: newTier ? newTierId : undefined,
          tierName: newTier ? newTier.name : undefined,
          tierQty: hasQtyChange ? tierQty : undefined,
          modifiedAt: new Date().toISOString()
        }
      });
    } catch (err) {
      console.error('Failed to sync pledge modification with Snipcart:', err.message);
    }
  }

  // Send confirmation email (use amounts with tax for user-facing totals)
  const previousAmountWithTax = currentPledge?.amount || 0;
  if (previousAmountWithTax !== newAmountWithTax) {
    try {
      const campaignTitle = campaign?.title || campaignSlug.replace(/-/g, ' ').toUpperCase();
      const emailToken = await generateToken(env.MAGIC_LINK_SECRET, {
        orderId: targetOrderId,
        email: payload.email,
        campaignSlug
      });

      await sendPledgeModifiedEmail(env, {
        email: payload.email,
        campaignSlug,
        campaignTitle,
        previousAmount: previousAmountWithTax,
        newAmount: newAmountWithTax,
        token: emailToken
      });
    } catch (err) {
      console.error('Failed to send modification email:', err.message);
    }
  }

  return jsonResponse({
    success: true,
    message: 'Pledge modified',
    newTier: newTier ? {
      id: newTier.id,
      name: newTier.name,
      price: newTier.price
    } : null,
    tierQty,
    previousSubtotal: currentPledge?.subtotal || currentPledge?.amount,
    previousAmount: previousAmountWithTax,
    subtotal: newAmount,
    tax: newTax,
    newAmount: newAmountWithTax,
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

  const list = await env.PLEDGES.list({ prefix: 'pledge:' });
  
  // Aggregate pledges by email - one charge per supporter
  const pledgesByEmail = {};

  for (const key of list.keys) {
    const pledge = await env.PLEDGES.get(key.name, { type: 'json' });
    if (pledge && 
        pledge.campaignSlug === campaignSlug && 
        pledge.pledgeStatus === 'active' &&
        !pledge.charged &&
        pledge.stripeCustomerId &&
        pledge.stripePaymentMethodId) {
      
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

  const stripe = createStripeClient(getStripeKey(env));
  const campaignTitle = campaign.title || campaignSlug.replace(/-/g, ' ').toUpperCase();
  
  const results = { 
    campaignSlug,
    supportersCharged: 0,
    supportersFailed: 0,
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

          await sendChargeSuccessEmail(env, {
            email: supporter.email,
            campaignSlug,
            campaignTitle,
            amount: supporter.totalAmount,
            token
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
    
    return jsonResponse({
      success: true,
      ...results
    });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

async function handleTestSetup(request, env) {
  if (env.SNIPCART_MODE !== 'test') {
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
  const tax = calculateTax(subtotal);

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
      subtotal: subtotal,
      tax: tax,
      amount: subtotal + tax,
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
      amount: p.amount
    })),
    token,
    manageUrl
  });
}

async function handleTestCleanup(request, env) {
  if (env.SNIPCART_MODE !== 'test') {
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
  
  const list = await env.PLEDGES.list({ prefix: 'pledge:' });
  
  for (const key of list.keys) {
    const pledgeData = await env.PLEDGES.get(key.name, { type: 'json' });
    if (!pledgeData) continue;
    if (pledgeData.campaignSlug !== campaignSlug) continue;
    if (pledgeData.pledgeStatus === 'cancelled') continue;
    
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
    
    const supporters = await getCampaignSupporters(env, campaignSlug);
    
    for (const milestoneItem of newMilestones) {
      // Handle both string milestones and stretch goal objects
      const isStretch = typeof milestoneItem === 'object' && milestoneItem.type === 'stretch';
      const milestoneType = isStretch ? 'stretch' : milestoneItem;
      const milestoneId = isStretch ? milestoneItem.id : milestoneItem;
      const stretchGoalName = isStretch ? milestoneItem.name : undefined;
      
      let sent = 0;
      let failed = 0;
      
      for (const supporter of supporters) {
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
            token
          });
          sent++;
        } catch (err) {
          console.error('Failed to send milestone email:', supporter.email, err.message);
          failed++;
        }
      }
      
      await markMilestoneSent(env, campaignSlug, milestoneId);
      console.log(`🎯 Milestone ${milestoneId} emails sent: ${sent}, failed: ${failed}`);
    }
  } catch (err) {
    console.error('Error triggering milestone emails:', err.message);
  }
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

  for (const supporter of supporters) {
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
        token
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
  
  if (dryRun) {
    return jsonResponse({
      dryRun: true,
      campaignSlug,
      milestone,
      recipientCount: supporters.length,
      recipients: supporters.map(s => s.email)
    });
  }

  const results = { sent: 0, failed: 0, errors: [] };

  for (const supporter of supporters) {
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
        token
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
    milestone,
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

  // Trigger the milestones
  const supporters = await getCampaignSupporters(env, campaignSlug);
  const results = { sent: 0, failed: 0, milestones: [], skippedMilestones };

  for (const milestoneItem of newMilestones) {
    // Handle both string milestones and stretch goal objects
    const isStretch = typeof milestoneItem === 'object' && milestoneItem.type === 'stretch';
    const milestoneType = isStretch ? 'stretch' : milestoneItem;
    const milestoneId = isStretch ? milestoneItem.id : milestoneItem;
    const stretchGoalName = isStretch ? milestoneItem.name : undefined;

    let mSent = 0;
    let mFailed = 0;

    for (const supporter of supporters) {
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
          token
        });
        mSent++;
        results.sent++;
      } catch (err) {
        mFailed++;
        results.failed++;
      }
    }

    await markMilestoneSent(env, campaignSlug, milestoneId);
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
  if (env.SNIPCART_MODE !== 'test') {
    return jsonResponse({ error: 'Test endpoints only available in test mode' }, 403);
  }

  const body = await request.json();
  const { type, email, campaignSlug } = body;

  if (!type || !email) {
    return jsonResponse({ error: 'Missing type or email' }, 400);
  }

  const campaign = await getCampaign(env, campaignSlug || 'hand-relations');
  const campaignTitle = campaign?.title || 'Test Campaign';
  
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
          amount: 5000,
          token
        });
        break;

      case 'modified':
        await sendPledgeModifiedEmail(env, {
          email,
          campaignSlug: campaignSlug || 'hand-relations',
          campaignTitle,
          previousAmount: 5000,
          newAmount: 10000,
          token
        });
        break;

      case 'payment-failed':
        await sendPaymentFailedEmail(env, {
          email,
          campaignSlug: campaignSlug || 'hand-relations',
          campaignTitle,
          token
        });
        break;

      case 'diary':
        await sendDiaryUpdateEmail(env, {
          email,
          campaignSlug: campaignSlug || 'hand-relations',
          campaignTitle,
          diaryTitle: 'Test Diary Entry',
          diaryExcerpt: 'This is a test diary update to verify the email template is working correctly.',
          token
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
          token
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
          token
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
          token
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
          token
        });
        break;

      default:
        return jsonResponse({ 
          error: 'Invalid type. Valid types: supporter, modified, payment-failed, diary, milestone-one-third, milestone-two-thirds, milestone-goal, milestone-stretch' 
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
  if (env.SNIPCART_MODE !== 'test') {
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
  return jsonResponse({
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
  }, 200, env, true);
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
  return jsonResponse({
    campaignSlug,
    tiers,
    raw: inventory
  }, 200, env, true);
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

    // Get campaign for title
    const campaign = await getCampaign(env, campaignSlug);
    const campaignTitle = campaign?.title || campaignSlug;

    // Calculate tax
    const subtotal = amountCents;
    const tax = calculateTax(subtotal);
    const amount = subtotal + tax;

    // Fetch additional tiers if any
    let additionalTiers = [];
    if (metadata.hasAdditionalTiers === 'true' && env.PLEDGES) {
      additionalTiers = await env.PLEDGES.get(`pending-tiers:${pledgeOrderId}`, { type: 'json' }) || [];
    }

    // Create pledge
    const pledge = {
      orderId: pledgeOrderId,
      email,
      campaignSlug,
      tierId,
      tierName,
      tierQty,
      additionalTiers: additionalTiers.length > 0 ? additionalTiers : undefined,
      subtotal,
      tax,
      amount,
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
      await env.PLEDGES.put(`pledge:${pledgeOrderId}`, JSON.stringify(pledge));
      
      // Update email index
      const emailKey = `email:${email}`;
      const existingOrders = await env.PLEDGES.get(emailKey, { type: 'json' }) || [];
      if (!existingOrders.includes(pledgeOrderId)) {
        existingOrders.push(pledgeOrderId);
        await env.PLEDGES.put(emailKey, JSON.stringify(existingOrders));
      }
      
      // Update stats
      await addPledgeToStats(env, { 
        campaignSlug, 
        amount: subtotal, 
        tierId, 
        tierQty,
        additionalTiers
      });
      
      // Claim tier inventory
      if (tierId) {
        await claimTierInventory(env, campaignSlug, tierId, tierQty, campaign);
      }
      for (const addTier of additionalTiers) {
        await claimTierInventory(env, campaignSlug, addTier.id, addTier.qty || 1, campaign);
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
          amount: subtotal,
          tierId,
          tierName,
          tierQty,
          manageUrl
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

function jsonResponse(data, status = 200, env = null, isPublic = false) {
  const origin = getAllowedOrigin(env, isPublic);
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
      ...SECURITY_HEADERS
    }
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
