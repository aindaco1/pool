/**
 * Vote API Routes
 * 
 * GET  /votes?token=...&decisions=id1,id2,id3
 * POST /votes
 */

import { verifyToken } from '../token.js';
import { getVoteStatus, castVote, getCampaignResults } from '../votes.js';
import { isValidVoteOption, isValidDecisionId, isValidSlug, jsonResponse } from '../validation.js';

/**
 * GET /votes - Get voting status for decisions
 * 
 * Query params:
 *   token: magic link token
 *   decisions: comma-separated decision IDs
 */
export async function handleGetVotes(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const decisionsParam = url.searchParams.get('decisions');
  
  if (!token) {
    return jsonResponse({ error: 'Missing token' }, 400, env);
  }
  
  // Dev mode bypass for local testing (SEC-001: Only allow in test mode)
  let orderId, campaignSlug, email;
  if (token.startsWith('dev-token-')) {
    if (env.SNIPCART_MODE !== 'test') {
      return jsonResponse({ error: 'Invalid or expired token' }, 401, env);
    }
    campaignSlug = token.replace('dev-token-', '');
    orderId = 'dev-order-1'; // Fixed ID for consistent dev user
    email = 'dev@test.com';
  } else {
    const payload = await verifyToken(env.MAGIC_LINK_SECRET, token);
    if (!payload) {
      return jsonResponse({ error: 'Invalid or expired token' }, 401, env);
    }
    orderId = payload.orderId;
    campaignSlug = payload.campaignSlug;
    email = payload.email;
    
    // Check if pledge is still active (not cancelled)
    if (env.PLEDGES) {
      const pledge = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
      if (pledge && pledge.pledgeStatus === 'cancelled') {
        return jsonResponse({ error: 'Pledge has been cancelled' }, 403, env);
      }
    }
  }
  
  if (!decisionsParam) {
    return jsonResponse({ error: 'Missing decisions parameter' }, 400, env);
  }
  
  // SEC-009: Validate decision IDs
  const decisionIds = decisionsParam.split(',').map(id => id.trim()).filter(id => id.length > 0);
  
  if (decisionIds.length === 0) {
    return jsonResponse({ error: 'No valid decision IDs provided' }, 400, env);
  }
  
  if (decisionIds.length > 20) {
    return jsonResponse({ error: 'Too many decision IDs (max 20)' }, 400, env);
  }
  
  for (const decisionId of decisionIds) {
    if (!isValidDecisionId(decisionId)) {
      return jsonResponse({ error: `Invalid decision ID format: ${decisionId.slice(0, 20)}` }, 400, env);
    }
  }
  
  const results = await getCampaignResults(env, {
    campaignSlug,
    decisionIds,
    email
  });
  
  return jsonResponse({
    campaignSlug,
    decisions: results
  }, 200, env);
}

/**
 * POST /votes - Cast a vote
 * 
 * Body:
 *   token: magic link token
 *   decisionId: decision to vote on
 *   option: selected option
 */
export async function handlePostVote(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400, env);
  }
  
  const { token, decisionId, option } = body;
  
  if (!token || !decisionId || !option) {
    return jsonResponse({ error: 'Missing required fields' }, 400, env);
  }
  
  // SEC-009: Validate inputs
  if (!isValidDecisionId(decisionId)) {
    return jsonResponse({ error: 'Invalid decision ID format' }, 400, env);
  }
  
  if (!isValidVoteOption(option)) {
    return jsonResponse({ error: 'Invalid vote option format' }, 400, env);
  }
  
  // Dev mode bypass for local testing (SEC-001: Only allow in test mode)
  let orderId, campaignSlug, email;
  if (token.startsWith('dev-token-')) {
    if (env.SNIPCART_MODE !== 'test') {
      return jsonResponse({ error: 'Invalid or expired token' }, 401, env);
    }
    campaignSlug = token.replace('dev-token-', '');
    orderId = 'dev-order-1'; // Fixed ID for consistent dev user
    email = 'dev@test.com';
  } else {
    const payload = await verifyToken(env.MAGIC_LINK_SECRET, token);
    if (!payload) {
      return jsonResponse({ error: 'Invalid or expired token' }, 401, env);
    }
    orderId = payload.orderId;
    campaignSlug = payload.campaignSlug;
    email = payload.email;
    
    // Check if pledge is still active (not cancelled)
    if (env.PLEDGES) {
      const pledge = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
      if (pledge && pledge.pledgeStatus === 'cancelled') {
        return jsonResponse({ error: 'Pledge has been cancelled' }, 403, env);
      }
    }
  }
  
  // Cast vote
  const result = await castVote(env, {
    campaignSlug,
    decisionId,
    email,
    option
  });
  
  if (!result.success) {
    return jsonResponse({ error: result.error, userChoice: result.userChoice }, 409, env);
  }
  
  return jsonResponse({
    success: true,
    decisionId,
    userChoice: result.userChoice,
    results: result.results,
    totalVotes: result.totalVotes
  }, 200, env);
}
