import { describe, expect, it } from 'vitest';

import { claimTierInventory, recalculateStats, recalculateTierInventory } from '../../worker/src/stats.js';

class PaginatedKVNamespace {
  store = new Map<string, string>();
  pageSize: number;

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
});
