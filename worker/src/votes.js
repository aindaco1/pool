/**
 * Vote Storage using Cloudflare KV
 * 
 * KV Binding: VOTES (configure in wrangler.toml)
 * 
 * Keys:
 *   vote:{campaignSlug}:{decisionId}:{email} → selected option string
 *   results:{campaignSlug}:{decisionId}      → JSON { optionA: count, optionB: count, ... }
 * 
 * Note: Votes are keyed by email (not orderId) to prevent multiple votes from
 * the same person who has multiple pledges.
 */

/**
 * Check if user has voted and get current results
 */
function sanitizeVoteResults(resultsJson, allowedOptions = []) {
  const parsedResults = resultsJson ? JSON.parse(resultsJson) : {};
  const allowed = new Set(Array.isArray(allowedOptions) ? allowedOptions : []);
  const sanitized = {};

  for (const option of allowed) {
    const count = parsedResults[option];
    if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
      sanitized[option] = count;
    }
  }

  return sanitized;
}

export function getDecisionOptionValues(decision) {
  if (!decision || !Array.isArray(decision.options)) {
    return [];
  }

  const values = decision.options
    .map((option) => {
      if (typeof option === 'string') return option;
      if (option && typeof option.label === 'string') return option.label;
      return null;
    })
    .filter((option) => typeof option === 'string' && option.length > 0);

  return [...new Set(values)];
}

export function getDecisionDefinition(campaign, decisionId) {
  if (!campaign || !Array.isArray(campaign.decisions)) {
    return null;
  }

  return campaign.decisions.find((decision) => decision?.id === decisionId) || null;
}

export async function getVoteStatus(env, { campaignSlug, decisionId, email, allowedOptions = [] }) {
  const voteKey = `vote:${campaignSlug}:${decisionId}:${email}`;
  const resultsKey = `results:${campaignSlug}:${decisionId}`;
  
  const [userVote, resultsJson] = await Promise.all([
    env.VOTES.get(voteKey),
    env.VOTES.get(resultsKey)
  ]);
  
  const allowed = new Set(Array.isArray(allowedOptions) ? allowedOptions : []);
  const results = sanitizeVoteResults(resultsJson, allowedOptions);
  const totalVotes = Object.values(results).reduce((sum, count) => sum + count, 0);
  const sanitizedUserChoice = allowed.has(userVote) ? userVote : null;
  
  return {
    hasVoted: !!sanitizedUserChoice,
    userChoice: sanitizedUserChoice,
    results,
    totalVotes
  };
}

/**
 * Cast a vote
 */
export async function castVote(env, { campaignSlug, decisionId, email, option, allowedOptions = [] }) {
  const voteKey = `vote:${campaignSlug}:${decisionId}:${email}`;
  const resultsKey = `results:${campaignSlug}:${decisionId}`;
  const allowed = new Set(Array.isArray(allowedOptions) ? allowedOptions : []);

  if (!allowed.has(option)) {
    return {
      success: false,
      error: 'Invalid vote option',
      userChoice: null
    };
  }
  
  // Check if already voted
  const existingVote = await env.VOTES.get(voteKey);
  if (existingVote && allowed.has(existingVote)) {
    return {
      success: false,
      error: 'Already voted',
      userChoice: existingVote
    };
  }
  if (existingVote && !allowed.has(existingVote)) {
    await env.VOTES.delete(voteKey);
  }
  
  // Get current results
  const resultsJson = await env.VOTES.get(resultsKey);
  const results = sanitizeVoteResults(resultsJson, allowedOptions);
  
  // Increment vote count
  results[option] = (results[option] || 0) + 1;
  
  // Store vote and updated results
  await Promise.all([
    env.VOTES.put(voteKey, option),
    env.VOTES.put(resultsKey, JSON.stringify(results))
  ]);
  
  const totalVotes = Object.values(results).reduce((sum, count) => sum + count, 0);
  
  return {
    success: true,
    userChoice: option,
    results,
    totalVotes
  };
}

/**
 * Get results for all decisions in a campaign
 */
export async function getCampaignResults(env, { campaignSlug, decisions, email }) {
  const statusPromises = decisions.map(({ id, allowedOptions }) =>
    getVoteStatus(env, { campaignSlug, decisionId: id, email, allowedOptions })
      .then(status => ({ decisionId: id, ...status }))
  );
  
  const statuses = await Promise.all(statusPromises);
  
  return statuses.reduce((acc, status) => {
    acc[status.decisionId] = status;
    return acc;
  }, {});
}
