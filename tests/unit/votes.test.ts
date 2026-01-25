/**
 * Unit tests for voting functionality
 * 
 * Tests cover:
 * - Vote storage and retrieval (keyed by email, not orderId)
 * - Duplicate vote prevention per email
 * - Vote result aggregation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock KV store
function createMockKV(initialData: Record<string, any> = {}) {
  const store = new Map(Object.entries(initialData));
  return {
    get: vi.fn(async (key: string, options?: { type: string }) => {
      const value = store.get(key);
      if (options?.type === 'json' && value) {
        return typeof value === 'string' ? JSON.parse(value) : value;
      }
      return value;
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(async (options?: { prefix: string }) => {
      const keys = [...store.keys()]
        .filter(k => !options?.prefix || k.startsWith(options.prefix))
        .map(name => ({ name }));
      return { keys };
    }),
    _store: store,
  };
}

// Inline implementation of vote helpers (mirrors worker/src/votes.js)
async function getVoteStatus(
  env: { VOTES: ReturnType<typeof createMockKV> },
  { campaignSlug, decisionId, email }: { campaignSlug: string; decisionId: string; email: string }
) {
  const voteKey = `vote:${campaignSlug}:${decisionId}:${email}`;
  const resultsKey = `results:${campaignSlug}:${decisionId}`;
  
  const [userVote, resultsJson] = await Promise.all([
    env.VOTES.get(voteKey),
    env.VOTES.get(resultsKey)
  ]);
  
  const results = resultsJson ? JSON.parse(resultsJson as string) : {};
  const totalVotes = Object.values(results).reduce((sum: number, count) => sum + (count as number), 0);
  
  return {
    hasVoted: !!userVote,
    userChoice: userVote || null,
    results,
    totalVotes
  };
}

async function castVote(
  env: { VOTES: ReturnType<typeof createMockKV> },
  { campaignSlug, decisionId, email, option }: { campaignSlug: string; decisionId: string; email: string; option: string }
) {
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
  const results = resultsJson ? JSON.parse(resultsJson as string) : {};
  
  // Increment vote count
  results[option] = (results[option] || 0) + 1;
  
  // Store vote and updated results
  await Promise.all([
    env.VOTES.put(voteKey, option),
    env.VOTES.put(resultsKey, JSON.stringify(results))
  ]);
  
  const totalVotes = Object.values(results).reduce((sum: number, count) => sum + (count as number), 0);
  
  return {
    success: true,
    userChoice: option,
    results,
    totalVotes
  };
}

async function getCampaignResults(
  env: { VOTES: ReturnType<typeof createMockKV> },
  { campaignSlug, decisionIds, email }: { campaignSlug: string; decisionIds: string[]; email: string }
) {
  const statusPromises = decisionIds.map(decisionId => 
    getVoteStatus(env, { campaignSlug, decisionId, email })
      .then(status => ({ decisionId, ...status }))
  );
  
  const statuses = await Promise.all(statusPromises);
  
  return statuses.reduce((acc: Record<string, any>, status) => {
    acc[status.decisionId] = status;
    return acc;
  }, {});
}

// =============================================================================
// Vote Storage (Email-based deduplication)
// =============================================================================

describe('Vote storage', () => {
  it('stores votes keyed by email (not orderId)', async () => {
    const kv = createMockKV();
    const env = { VOTES: kv };
    
    await castVote(env, {
      campaignSlug: 'test-campaign',
      decisionId: 'villain-name',
      email: 'voter@example.com',
      option: 'Susan'
    });
    
    // Vote should be stored with email as the key
    expect(kv.put).toHaveBeenCalledWith(
      'vote:test-campaign:villain-name:voter@example.com',
      'Susan'
    );
  });

  it('prevents duplicate votes from same email', async () => {
    const kv = createMockKV({
      'vote:test-campaign:villain-name:voter@example.com': 'Susan'
    });
    const env = { VOTES: kv };
    
    const result = await castVote(env, {
      campaignSlug: 'test-campaign',
      decisionId: 'villain-name',
      email: 'voter@example.com',
      option: 'Dr. Badguy'
    });
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('Already voted');
    expect(result.userChoice).toBe('Susan');
  });

  it('allows different emails to vote on same decision', async () => {
    const kv = createMockKV({
      'vote:test-campaign:villain-name:voter1@example.com': 'Susan',
      'results:test-campaign:villain-name': JSON.stringify({ Susan: 1 })
    });
    const env = { VOTES: kv };
    
    const result = await castVote(env, {
      campaignSlug: 'test-campaign',
      decisionId: 'villain-name',
      email: 'voter2@example.com',
      option: 'Susan'
    });
    
    expect(result.success).toBe(true);
    expect(result.totalVotes).toBe(2);
    expect(result.results.Susan).toBe(2);
  });

  it('same email with multiple pledges (different orderIds) still gets one vote', async () => {
    const kv = createMockKV();
    const env = { VOTES: kv };
    
    // First vote succeeds
    const result1 = await castVote(env, {
      campaignSlug: 'test-campaign',
      decisionId: 'villain-name',
      email: 'multi-pledger@example.com',
      option: 'Susan'
    });
    expect(result1.success).toBe(true);
    
    // Second vote from same email (different pledge/orderId) should fail
    const result2 = await castVote(env, {
      campaignSlug: 'test-campaign',
      decisionId: 'villain-name',
      email: 'multi-pledger@example.com',
      option: 'Dr. Badguy'
    });
    expect(result2.success).toBe(false);
    expect(result2.error).toBe('Already voted');
  });
});

// =============================================================================
// Vote Status Retrieval
// =============================================================================

describe('getVoteStatus', () => {
  it('returns hasVoted=false when user has not voted', async () => {
    const kv = createMockKV();
    const env = { VOTES: kv };
    
    const status = await getVoteStatus(env, {
      campaignSlug: 'test-campaign',
      decisionId: 'villain-name',
      email: 'new-voter@example.com'
    });
    
    expect(status.hasVoted).toBe(false);
    expect(status.userChoice).toBeNull();
  });

  it('returns hasVoted=true with userChoice when user has voted', async () => {
    const kv = createMockKV({
      'vote:test-campaign:villain-name:voter@example.com': 'Susan'
    });
    const env = { VOTES: kv };
    
    const status = await getVoteStatus(env, {
      campaignSlug: 'test-campaign',
      decisionId: 'villain-name',
      email: 'voter@example.com'
    });
    
    expect(status.hasVoted).toBe(true);
    expect(status.userChoice).toBe('Susan');
  });

  it('returns aggregate results', async () => {
    const kv = createMockKV({
      'results:test-campaign:villain-name': JSON.stringify({ 
        Susan: 5, 
        'Dr. Badguy': 3 
      })
    });
    const env = { VOTES: kv };
    
    const status = await getVoteStatus(env, {
      campaignSlug: 'test-campaign',
      decisionId: 'villain-name',
      email: 'anyone@example.com'
    });
    
    expect(status.results).toEqual({ Susan: 5, 'Dr. Badguy': 3 });
    expect(status.totalVotes).toBe(8);
  });
});

// =============================================================================
// Campaign Results (Multiple Decisions)
// =============================================================================

describe('getCampaignResults', () => {
  it('returns status for multiple decisions', async () => {
    const kv = createMockKV({
      'vote:test-campaign:villain-name:voter@example.com': 'Susan',
      'results:test-campaign:villain-name': JSON.stringify({ Susan: 3 }),
      'results:test-campaign:accent:': JSON.stringify({ British: 2 })
    });
    const env = { VOTES: kv };
    
    const results = await getCampaignResults(env, {
      campaignSlug: 'test-campaign',
      decisionIds: ['villain-name', 'accent'],
      email: 'voter@example.com'
    });
    
    expect(results['villain-name'].hasVoted).toBe(true);
    expect(results['villain-name'].userChoice).toBe('Susan');
    expect(results['accent'].hasVoted).toBe(false);
  });
});

// =============================================================================
// Result Aggregation
// =============================================================================

describe('Vote result aggregation', () => {
  it('increments vote count for existing option', async () => {
    const kv = createMockKV({
      'results:test-campaign:villain-name': JSON.stringify({ Susan: 2 })
    });
    const env = { VOTES: kv };
    
    const result = await castVote(env, {
      campaignSlug: 'test-campaign',
      decisionId: 'villain-name',
      email: 'new-voter@example.com',
      option: 'Susan'
    });
    
    expect(result.results.Susan).toBe(3);
    expect(result.totalVotes).toBe(3);
  });

  it('adds new option to results', async () => {
    const kv = createMockKV({
      'results:test-campaign:villain-name': JSON.stringify({ Susan: 2 })
    });
    const env = { VOTES: kv };
    
    const result = await castVote(env, {
      campaignSlug: 'test-campaign',
      decisionId: 'villain-name',
      email: 'new-voter@example.com',
      option: 'Dr. Badguy'
    });
    
    expect(result.results.Susan).toBe(2);
    expect(result.results['Dr. Badguy']).toBe(1);
    expect(result.totalVotes).toBe(3);
  });

  it('initializes results when first vote is cast', async () => {
    const kv = createMockKV();
    const env = { VOTES: kv };
    
    const result = await castVote(env, {
      campaignSlug: 'test-campaign',
      decisionId: 'new-decision',
      email: 'first-voter@example.com',
      option: 'Option A'
    });
    
    expect(result.results).toEqual({ 'Option A': 1 });
    expect(result.totalVotes).toBe(1);
  });
});
