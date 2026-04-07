import { describe, expect, it } from 'vitest';

import { TierInventoryCoordinator } from '../../worker/src/tier-inventory-do.js';

class MockStorage {
  store = new Map<string, unknown>();

  async get(key: string) {
    return this.store.get(key);
  }

  async put(key: string, value: unknown) {
    this.store.set(key, value);
  }

  async transaction<T>(callback: (storage: MockStorage) => Promise<T>) {
    return callback(this);
  }
}

class MockDurableObjectState {
  storage = new MockStorage();
}

class MockKVNamespace {
  store = new Map<string, string>();

  async put(key: string, value: string) {
    this.store.set(key, value);
  }

  async get(key: string, options?: { type?: string }) {
    const value = this.store.get(key);
    if (value == null) return null;
    if (options?.type === 'json') {
      return JSON.parse(value);
    }
    return value;
  }
}

describe('TierInventoryCoordinator', () => {
  it('serializes competing claims against the same limited tier', async () => {
    const env = { PLEDGES: new MockKVNamespace() };
    const coordinator = new TierInventoryCoordinator(new MockDurableObjectState() as never, env as never);

    const first = await coordinator.fetch(new Request('https://tier-inventory/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignSlug: 'hand-relations',
        tierId: 'vip-pass',
        qty: 1,
        inventory: {
          'vip-pass': { limit: 1, claimed: 0 }
        }
      })
    }));

    const second = await coordinator.fetch(new Request('https://tier-inventory/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignSlug: 'hand-relations',
        tierId: 'vip-pass',
        qty: 1,
        inventory: {
          'vip-pass': { limit: 1, claimed: 0 }
        }
      })
    }));

    expect(await first.json()).toMatchObject({ success: true, remaining: 0 });
    expect(await second.json()).toMatchObject({ success: false, remaining: 0 });
    expect(await env.PLEDGES.get('tier-inventory:hand-relations', { type: 'json' })).toEqual({
      'vip-pass': { limit: 1, claimed: 1 }
    });
  });

  it('applies multi-tier selection changes atomically', async () => {
    const env = { PLEDGES: new MockKVNamespace() };
    const coordinator = new TierInventoryCoordinator(new MockDurableObjectState() as never, env as never);

    const response = await coordinator.fetch(new Request('https://tier-inventory/apply-selection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignSlug: 'hand-relations',
        previousCounts: { 'frame-slot': 1 },
        nextCounts: { 'frame-slot': 1, 'vip-pass': 2 },
        inventory: {
          'frame-slot': { limit: 5, claimed: 1 },
          'vip-pass': { limit: 1, claimed: 0 }
        }
      })
    }));

    const payload = await response.json();
    expect(payload).toMatchObject({ success: false, remaining: 1 });
    expect(await env.PLEDGES.get('tier-inventory:hand-relations', { type: 'json' })).toBeNull();
  });
});
