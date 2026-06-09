import { describe, expect, it } from 'vitest';
import { SettlementCoordinator } from '../../worker/src/settlement-do.js';

class MockDurableObjectStorage {
  store = new Map<string, unknown>();

  async get(key: string) {
    return this.store.get(key);
  }

  async put(key: string, value: unknown) {
    this.store.set(key, value);
  }

  async delete(key: string) {
    this.store.delete(key);
  }

  async transaction<T>(callback: (storage: MockDurableObjectStorage) => Promise<T>) {
    return callback(this);
  }
}

class MockDurableObjectState {
  storage = new MockDurableObjectStorage();
}

async function callCoordinator(coordinator: SettlementCoordinator, path: string, body: Record<string, unknown>) {
  const response = await coordinator.fetch(new Request(`https://settlement.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignSlug: 'hand-relations',
      owner: 'owner-a',
      ...body
    })
  }));
  return {
    status: response.status,
    body: await response.json()
  };
}

describe('SettlementCoordinator', () => {
  it('serializes settlement claims per campaign owner', async () => {
    const coordinator = new SettlementCoordinator(new MockDurableObjectState() as never, {} as never);

    const first = await callCoordinator(coordinator, '/claim', { reason: 'settle-dispatch' });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ok: true, owner: 'owner-a', locked: false });

    const competing = await callCoordinator(coordinator, '/claim', { owner: 'owner-b' });
    expect(competing.status).toBe(409);
    expect(competing.body).toMatchObject({ ok: false, locked: true, owner: 'owner-a' });

    const refresh = await callCoordinator(coordinator, '/claim', { owner: 'owner-a' });
    expect(refresh.status).toBe(200);
    expect(refresh.body).toMatchObject({ ok: true, owner: 'owner-a' });

    const release = await callCoordinator(coordinator, '/release', { owner: 'owner-a' });
    expect(release.status).toBe(200);
    expect(release.body).toMatchObject({ ok: true, released: true });

    const afterRelease = await callCoordinator(coordinator, '/claim', { owner: 'owner-b' });
    expect(afterRelease.status).toBe(200);
    expect(afterRelease.body).toMatchObject({ ok: true, owner: 'owner-b' });
  });
});
