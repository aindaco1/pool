import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockKV(initialData: Record<string, string> = {}) {
  const store = new Map(Object.entries(initialData));
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    _store: store
  };
}

const campaignPayload = {
  campaigns: [
    {
      slug: 'demo',
      decisions: [
        {
          id: 'villain-name',
          status: 'open',
          options: ['Susan', 'Dr. Badguy']
        },
        {
          id: 'poster',
          status: 'closed',
          options: [{ label: 'Blue' }, { label: 'Red' }]
        }
      ]
    }
  ]
};

describe('vote routes', () => {
  beforeEach(() => {
    vi.resetModules();
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return new Response(JSON.stringify(campaignPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;
  });

  it('rejects votes for unknown decisions', async () => {
    const { handlePostVote } = await import('../../worker/src/routes/votes.js');
    const env = {
      APP_MODE: 'test',
      SITE_BASE: 'https://pool.test',
      VOTES: createMockKV()
    };

    const response = await handlePostVote(
      new Request('https://pool.test/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'dev-token-demo',
          decisionId: 'totally-fake-id',
          option: 'owned'
        })
      }),
      env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'Unknown decision: totally-fake-id' });
  });

  it('rejects votes for closed decisions', async () => {
    const { handlePostVote } = await import('../../worker/src/routes/votes.js');
    const env = {
      APP_MODE: 'test',
      SITE_BASE: 'https://pool.test',
      VOTES: createMockKV()
    };

    const response = await handlePostVote(
      new Request('https://pool.test/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'dev-token-demo',
          decisionId: 'poster',
          option: 'Blue'
        })
      }),
      env
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: 'Voting is closed for this decision' });
  });

  it('rejects options outside the campaign allowlist', async () => {
    const { handlePostVote } = await import('../../worker/src/routes/votes.js');
    const env = {
      APP_MODE: 'test',
      SITE_BASE: 'https://pool.test',
      VOTES: createMockKV()
    };

    const response = await handlePostVote(
      new Request('https://pool.test/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'dev-token-demo',
          decisionId: 'villain-name',
          option: '<img src=x onerror=alert(1)>'
        })
      }),
      env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid vote option' });
  });

  it('filters rogue stored result keys and lets a user recover from an invalid prior vote', async () => {
    const { handleGetVotes, handlePostVote } = await import('../../worker/src/routes/votes.js');
    const env = {
      APP_MODE: 'test',
      SITE_BASE: 'https://pool.test',
      VOTES: createMockKV({
        'vote:demo:villain-name:dev@test.com': '<img src=x onerror=alert(1)>',
        'results:demo:villain-name': JSON.stringify({
          Susan: 2,
          '<img src=x onerror=alert(1)>': 1
        })
      })
    };

    const readResponse = await handleGetVotes(
      new Request('https://pool.test/votes?token=dev-token-demo&decisions=villain-name'),
      env
    );
    expect(readResponse.status).toBe(200);
    await expect(readResponse.json()).resolves.toMatchObject({
      decisions: {
        'villain-name': {
          hasVoted: false,
          userChoice: null,
          results: { Susan: 2 },
          totalVotes: 2
        }
      }
    });

    const writeResponse = await handlePostVote(
      new Request('https://pool.test/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'dev-token-demo',
          decisionId: 'villain-name',
          option: 'Susan'
        })
      }),
      env
    );

    expect(writeResponse.status).toBe(200);
    await expect(writeResponse.json()).resolves.toMatchObject({
      success: true,
      decisionId: 'villain-name',
      userChoice: 'Susan',
      results: { Susan: 3 },
      totalVotes: 3
    });
  });
});
