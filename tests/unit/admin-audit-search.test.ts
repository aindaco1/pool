import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../worker/src/index.js';

class MockKVNamespace {
  store = new Map<string, string>();
  metadata = new Map<string, Record<string, unknown>>();

  async get(key: string | string[], options?: { type?: string }) {
    const read = (name: string) => {
      const value = this.store.get(name);
      if (value === undefined) return null;
      return options?.type === 'json' ? JSON.parse(value) : value;
    };
    if (Array.isArray(key)) return new Map(key.map((name) => [name, read(name)]));
    return read(key);
  }

  async put(key: string, value: string, options: { metadata?: Record<string, unknown> } = {}) {
    this.store.set(key, value);
    if (options.metadata) this.metadata.set(key, options.metadata);
  }

  async list(options: { prefix?: string; limit?: number } = {}) {
    const keys = Array.from(this.store.keys())
      .filter((key) => key.startsWith(options.prefix || ''))
      .sort()
      .slice(0, options.limit || 1000)
      .map((name) => ({ name, metadata: this.metadata.get(name) }));
    return { keys, list_complete: true };
  }
}

describe('Pool admin audit search and CSV export', () => {
  beforeEach(() => vi.stubGlobal('crypto', webcrypto));
  afterEach(() => vi.unstubAllGlobals());

  it('filters metadata-backed events and protects spreadsheet cells', async () => {
    const pledges = new MockKVNamespace();
    const rateLimit = new MockKVNamespace();
    const token = 'admin-session-token';
    const sessionId = createHash('sha256').update(token).digest('hex');
    await pledges.put(`admin-session:${sessionId}`, JSON.stringify({
      email: 'owner@example.com',
      role: 'super_admin',
      campaignSlugs: [],
      csrfToken: 'csrf',
      createdAt: '2026-07-12T00:00:00.000Z',
      expiresAt: '2099-07-12T08:00:00.000Z'
    }));
    const event = {
      createdAt: '2026-07-12T01:02:03.000Z',
      action: 'campaign:publish_content',
      adminEmail: 'owner@example.com',
      adminRole: 'super_admin',
      campaignSlug: 'echoes',
      orderId: '=HYPERLINK("https://bad.test")',
      changedFields: ['title']
    };
    const key = 'admin-audit:2026-07-12:campaign:publish_content:one';
    await pledges.put(key, JSON.stringify(event), { metadata: event });
    const env = {
      SITE_BASE: 'https://pool.test',
      CORS_ALLOWED_ORIGIN: 'https://pool.test',
      APP_MODE: 'test',
      ADMIN_BOOTSTRAP_EMAILS: 'owner@example.com',
      ADMIN_SESSION_SECRET: 'audit-test-secret',
      PLEDGES: pledges,
      RATELIMIT: rateLimit
    } as any;
    const headers = { Cookie: `pool_admin_session=${token}` };

    const response = await worker.fetch(new Request(
      'https://pool.test/admin/audit?campaignSlug=echoes&q=publish',
      { headers }
    ), env, { waitUntil() {} } as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rows).toHaveLength(1);
    expect(body.page).toMatchObject({ matched: 1, returned: 1, valueReads: 0 });

    const csvResponse = await worker.fetch(new Request(
      'https://pool.test/admin/audit.csv?date=2026-07-12&campaignSlug=echoes',
      { headers }
    ), env, { waitUntil() {} } as any);
    expect(csvResponse.status).toBe(200);
    expect(csvResponse.headers.get('content-disposition')).toContain('pool-admin-audit-2026-07-12.csv');
    expect(await csvResponse.text()).toContain("'=HYPERLINK");
  });
});
