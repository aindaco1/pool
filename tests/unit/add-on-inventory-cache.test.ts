import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAddOnInventorySnapshot, invalidateAddOnInventorySnapshot } from '../../worker/src/add-ons.js';

class MockKVNamespace {
  store = new Map<string, string>();

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

  async list({ prefix = '', cursor }: { prefix?: string; cursor?: string } = {}) {
    if (cursor) {
      return { keys: [], list_complete: true, cursor: undefined };
    }
    return {
      keys: Array.from(this.store.keys())
        .filter((key) => key.startsWith(prefix))
        .map((name) => ({ name })),
      list_complete: true,
      cursor: undefined
    };
  }
}

describe('add-on inventory snapshot cache', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rebuilds add-on inventory after invalidation when saved pledges change', async () => {
    const env = {
      SITE_BASE: 'https://pool.test',
      PLEDGES: new MockKVNamespace()
    } as any;

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      enabled: true,
      low_stock_threshold: 5,
      products: [
        {
          id: 'dust-wave-sticker',
          name: 'DUST WAVE Sticker',
          price: 3,
          category: 'physical',
          inventory: 50,
          variants: []
        }
      ]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })) as any);

    const firstSnapshot = await getAddOnInventorySnapshot(env);
    expect(firstSnapshot.products['dust-wave-sticker']).toMatchObject({
      sold: 0,
      remaining: 50
    });

    await env.PLEDGES.put('pledge:order-1', JSON.stringify({
      orderId: 'order-1',
      campaignSlug: 'demo',
      pledgeStatus: 'active',
      bundleAddOns: [
        { productId: 'dust-wave-sticker', quantity: 2 }
      ]
    }));

    const staleSnapshot = await getAddOnInventorySnapshot(env);
    expect(staleSnapshot.products['dust-wave-sticker']).toMatchObject({
      sold: 0,
      remaining: 50
    });

    invalidateAddOnInventorySnapshot(env);

    const refreshedSnapshot = await getAddOnInventorySnapshot(env);
    expect(refreshedSnapshot.products['dust-wave-sticker']).toMatchObject({
      sold: 2,
      remaining: 48
    });
  });
});
