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
export async function getVoteStatus(env, { campaignSlug, decisionId, email }) {
  const voteKey = `vote:${campaignSlug}:${decisionId}:${email}`;
  const resultsKey = `results:${campaignSlug}:${decisionId}`;
  
  const [userVote, resultsJson] = await Promise.all([
    env.VOTES.get(voteKey),
    env.VOTES.get(resultsKey)
  ]);
  
  const results = resultsJson ? JSON.parse(resultsJson) : {};
  const totalVotes = Object.values(results).reduce((sum, count) => sum + count, 0);
  
  return {
    hasVoted: !!userVote,
    userChoice: userVote || null,
    results,
    totalVotes
  };
}

/**
 * Cast a vote
 */
export async function castVote(env, { campaignSlug, decisionId, email, option }) {
  const voteKey = `vote:${campaignSlug}:${decisionId}:${email}`;
  const resultsKey = `results:${campaignSlug}:${decisionId}`;
  
  // Check if already voted
  const existingVote = await env.VOTES.get(voteKey);
  if (existingVote) {
    return {
      success: false,
      error: 'Already voted',
      userChoice: existingVote
    };
  }
  
  // Get current results
  const resultsJson = await env.VOTES.get(resultsKey);
  const results = resultsJson ? JSON.parse(resultsJson) : {};
  
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
export async function getCampaignResults(env, { campaignSlug, decisionIds, email }) {
  const statusPromises = decisionIds.map(decisionId => 
    getVoteStatus(env, { campaignSlug, decisionId, email })
      .then(status => ({ decisionId, ...status }))
  );
  
  const statuses = await Promise.all(statusPromises);
  
  return statuses.reduce((acc, status) => {
    acc[status.decisionId] = status;
    return acc;
  }, {});
}
