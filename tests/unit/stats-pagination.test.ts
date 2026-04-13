import { describe, expect, it } from 'vitest';

import { checkCampaignProjectionDrift, claimTierInventory, recalculateStats, recalculateTierInventory } from '../../worker/src/stats.js';

class PaginatedKVNamespace {
  store = new Map<string, string>();
  pageSize: number;
  listCalls: Array<{ prefix: string; cursor?: string }> = [];

  constructor(pageSize = 2) {
    this.pageSize = pageSize;
  }

  async get(key: string, options?: { type?: string }) {
    if (!this.store.has(key)) return null;
    const value = this.store.get(key) as string;
    if (options?.type === 'json') {
      return JSON.parse(value);
    }
    return value;
  }

  async put(key: string, value: string) {
    this.store.set(key, value);
  }

  async delete(key: string) {
    this.store.delete(key);
  }

  async list({ prefix = '', cursor }: { prefix?: string; cursor?: string } = {}) {
    this.listCalls.push({ prefix, cursor });
    const matchingKeys = Array.from(this.store.keys())
      .filter(key => key.startsWith(prefix))
      .sort();
    const startIndex = cursor ? Number(cursor) : 0;
    const page = matchingKeys.slice(startIndex, startIndex + this.pageSize);
    const nextIndex = startIndex + this.pageSize;

    return {
      keys: page.map(name => ({ name })),
      list_complete: nextIndex >= matchingKeys.length,
      cursor: nextIndex >= matchingKeys.length ? undefined : String(nextIndex)
    };
  }
}

function createEnv() {
  return {
    PLEDGES: new PaginatedKVNamespace(2)
  };
}

class MockTierInventoryNamespace {
  calls: Array<{ url: string; body: Record<string, unknown> }> = [];

  idFromName(name: string) {
    return { name };
  }

  get(_id: { name: string }) {
    return {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        this.calls.push({ url, body });
        return new Response(JSON.stringify({
          success: true,
          inventory: body.inventory || {}
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    };
  }
}

describe('stats pagination', () => {
  it('recalculateStats counts pledges across all KV pages', async () => {
    const env = createEnv();
    const kv = env.PLEDGES;

    await kv.put('pledge:1', JSON.stringify({
      orderId: '1',
      campaignSlug: 'hand-relations',
      subtotal: 500,
      tierId: 'frame-slot',
      tierQty: 1,
      pledgeStatus: 'active'
    }));
    await kv.put('pledge:2', JSON.stringify({
      orderId: '2',
      campaignSlug: 'hand-relations',
      subtotal: 1000,
      tierId: 'frame-slot',
      tierQty: 2,
      pledgeStatus: 'active',
      supportItems: [{ id: 'location-scouting', amount: 5 }]
    }));
    await kv.put('pledge:3', JSON.stringify({
      orderId: '3',
      campaignSlug: 'hand-relations',
      subtotal: 2000,
      tierId: 'vip-pass',
      tierQty: 1,
      additionalTiers: [{ id: 'frame-slot', qty: 1 }],
      pledgeStatus: 'active'
    }));

    const stats = await recalculateStats(env, 'hand-relations');
    expect(stats?.pledgedAmount).toBe(3500);
    expect(stats?.pledgeCount).toBe(3);
    expect(stats?.tierCounts['frame-slot']).toBe(4);
    expect(stats?.tierCounts['vip-pass']).toBe(1);
    expect(stats?.supportItems['location-scouting']).toBe(500);
  });

  it('recalculateTierInventory counts claimed tiers across all KV pages', async () => {
    const env = createEnv();
    const kv = env.PLEDGES;

    await kv.put('pledge:1', JSON.stringify({
      orderId: '1',
      campaignSlug: 'hand-relations',
      tierId: 'vip-pass',
      tierQty: 1,
      pledgeStatus: 'active',
      charged: false
    }));
    await kv.put('pledge:2', JSON.stringify({
      orderId: '2',
      campaignSlug: 'hand-relations',
      tierId: 'frame-slot',
      tierQty: 2,
      pledgeStatus: 'active',
      charged: false
    }));
    await kv.put('pledge:3', JSON.stringify({
      orderId: '3',
      campaignSlug: 'hand-relations',
      tierId: 'frame-slot',
      tierQty: 1,
      additionalTiers: [{ id: 'vip-pass', qty: 1 }],
      pledgeStatus: 'active',
      charged: false
    }));

    const inventory = await recalculateTierInventory(env, 'hand-relations', [
      { id: 'vip-pass', limit_total: 2 },
      { id: 'frame-slot', limit_total: 5 }
    ]);

    expect(inventory?.['vip-pass']).toEqual({ limit: 2, claimed: 2 });
    expect(inventory?.['frame-slot']).toEqual({ limit: 5, claimed: 3 });
  });

  it('claimTierInventory fallback uses paginated rebuilds before allowing more limited claims', async () => {
    const env = createEnv();
    const kv = env.PLEDGES;

    await kv.put('pledge:1', JSON.stringify({
      orderId: '1',
      campaignSlug: 'hand-relations',
      tierId: 'vip-pass',
      tierQty: 1,
      pledgeStatus: 'active',
      charged: false
    }));
    await kv.put('pledge:2', JSON.stringify({
      orderId: '2',
      campaignSlug: 'hand-relations',
      tierId: 'vip-pass',
      tierQty: 1,
      pledgeStatus: 'active',
      charged: false
    }));
    await kv.put('pledge:3', JSON.stringify({
      orderId: '3',
      campaignSlug: 'hand-relations',
      tierId: 'vip-pass',
      tierQty: 1,
      pledgeStatus: 'active',
      charged: false
    }));

    const result = await claimTierInventory(env, 'hand-relations', 'vip-pass', 1, {
      tiers: [{ id: 'vip-pass', limit_total: 3 }]
    });

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('recalculateStats uses the campaign pledge index when available', async () => {
    const env = createEnv();
    const kv = env.PLEDGES;

    await kv.put('campaign-pledges:hand-relations', JSON.stringify(['1', '3']));
    await kv.put('pledge:1', JSON.stringify({
      orderId: '1',
      campaignSlug: 'hand-relations',
      subtotal: 500,
      tierId: 'frame-slot',
      tierQty: 1,
      pledgeStatus: 'active'
    }));
    await kv.put('pledge:2', JSON.stringify({
      orderId: '2',
      campaignSlug: 'other-campaign',
      subtotal: 9999,
      tierId: 'vip-pass',
      tierQty: 9,
      pledgeStatus: 'active'
    }));
    await kv.put('pledge:3', JSON.stringify({
      orderId: '3',
      campaignSlug: 'hand-relations',
      subtotal: 1000,
      tierId: 'vip-pass',
      tierQty: 1,
      pledgeStatus: 'active'
    }));

    const stats = await recalculateStats(env, 'hand-relations');

    expect(stats?.pledgedAmount).toBe(1500);
    expect(stats?.pledgeCount).toBe(2);
    expect(kv.listCalls.some((call) => call.prefix === 'pledge:')).toBe(false);
  });

  it('recalculateTierInventory uses the campaign pledge index when available', async () => {
    const env = createEnv();
    const kv = env.PLEDGES;

    await kv.put('campaign-pledges:hand-relations', JSON.stringify(['1', '3']));
    await kv.put('pledge:1', JSON.stringify({
      orderId: '1',
      campaignSlug: 'hand-relations',
      tierId: 'vip-pass',
      tierQty: 1,
      pledgeStatus: 'active',
      charged: false
    }));
    await kv.put('pledge:2', JSON.stringify({
      orderId: '2',
      campaignSlug: 'other-campaign',
      tierId: 'frame-slot',
      tierQty: 20,
      pledgeStatus: 'active',
      charged: false
    }));
    await kv.put('pledge:3', JSON.stringify({
      orderId: '3',
      campaignSlug: 'hand-relations',
      tierId: 'frame-slot',
      tierQty: 1,
      additionalTiers: [{ id: 'vip-pass', qty: 1 }],
      pledgeStatus: 'active',
      charged: false
    }));

    const inventory = await recalculateTierInventory(env, 'hand-relations', [
      { id: 'vip-pass', limit_total: 2 },
      { id: 'frame-slot', limit_total: 5 }
    ]);

    expect(inventory?.['vip-pass']).toEqual({ limit: 2, claimed: 2 });
    expect(inventory?.['frame-slot']).toEqual({ limit: 5, claimed: 1 });
    expect(kv.listCalls.some((call) => call.prefix === 'pledge:')).toBe(false);
  });

  it('recalculateTierInventory uses the coordinator as the write path when available', async () => {
    const env = createEnv();
    const kv = env.PLEDGES;
    const tierInventory = new MockTierInventoryNamespace();
    (env as Record<string, unknown>).TIER_INVENTORY_COORDINATOR = tierInventory;

    await kv.put('campaign-pledges:hand-relations', JSON.stringify(['1']));
    await kv.put('pledge:1', JSON.stringify({
      orderId: '1',
      campaignSlug: 'hand-relations',
      tierId: 'vip-pass',
      tierQty: 1,
      pledgeStatus: 'active',
      charged: false
    }));

    const inventory = await recalculateTierInventory(env, 'hand-relations', [
      { id: 'vip-pass', limit_total: 2 }
    ]);

    expect(inventory?.['vip-pass']).toEqual({ limit: 2, claimed: 1 });
    expect(tierInventory.calls).toContainEqual(expect.objectContaining({
      url: 'https://tier-inventory-coordinator/replace',
      body: expect.objectContaining({
        campaignSlug: 'hand-relations',
        inventory: {
          'vip-pass': { limit: 2, claimed: 1 }
        }
      })
    }));
  });

  it('checkCampaignProjectionDrift reports stale stats, inventory, and campaign indexes without mutating them', async () => {
    const env = createEnv();
    const kv = env.PLEDGES;

    await kv.put('campaign-pledges:hand-relations', JSON.stringify(['1']));
    await kv.put('stats:hand-relations', JSON.stringify({
      campaignSlug: 'hand-relations',
      pledgedAmount: 500,
      pledgeCount: 1,
      tierCounts: { 'frame-slot': 1 },
      supportItems: {}
    }));
    await kv.put('tier-inventory:hand-relations', JSON.stringify({
      'vip-pass': { limit: 2, claimed: 0 },
      'frame-slot': { limit: 5, claimed: 1 }
    }));
    await kv.put('pledge:1', JSON.stringify({
      orderId: '1',
      campaignSlug: 'hand-relations',
      subtotal: 500,
      tierId: 'frame-slot',
      tierQty: 1,
      pledgeStatus: 'active',
      charged: false
    }));
    await kv.put('pledge:2', JSON.stringify({
      orderId: '2',
      campaignSlug: 'hand-relations',
      subtotal: 2000,
      tierId: 'vip-pass',
      tierQty: 1,
      pledgeStatus: 'active',
      charged: false,
      supportItems: [{ id: 'location-scouting', amount: 5 }]
    }));

    const drift = await checkCampaignProjectionDrift(env, 'hand-relations', {
      slug: 'hand-relations',
      tiers: [
        { id: 'vip-pass', limit_total: 2 },
        { id: 'frame-slot', limit_total: 5 }
      ]
    });

    expect(drift?.inSync).toBe(false);
    expect(drift?.checks.campaignIndex).toMatchObject({
      inSync: false,
      storedOrderIds: ['1'],
      expectedOrderIds: ['1', '2'],
      missingOrderIds: ['2'],
      extraOrderIds: []
    });
    expect(drift?.checks.stats.differences.pledgedAmount).toEqual({ stored: 500, expected: 2500 });
    expect(drift?.checks.stats.differences.pledgeCount).toEqual({ stored: 1, expected: 2 });
    expect(drift?.checks.stats.differences.tierCounts['vip-pass']).toEqual({ stored: 0, expected: 1 });
    expect(drift?.checks.stats.differences.supportItems['location-scouting']).toEqual({ stored: 0, expected: 500 });
    expect(drift?.checks.inventory.differences['vip-pass']).toEqual({
      stored: { limit: 2, claimed: 0 },
      expected: { limit: 2, claimed: 1 }
    });
    expect(await kv.get('campaign-pledges:hand-relations', { type: 'json' })).toEqual(['1']);
  });
});
