import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  handleAdminAuthExchange,
  handleAdminAuthStart,
  listAdminSessionReview,
  revokeAdminSessionById
} from '../../worker/src/admin-auth.js';

class MockKVNamespace {
  store = new Map<string, string>();
  metadata = new Map<string, Record<string, unknown>>();

  async get(key: string, options?: { type?: string }) {
    const value = this.store.get(key);
    if (value === undefined) return null;
    return options?.type === 'json' ? JSON.parse(value) : value;
  }

  async put(key: string, value: string, options: { metadata?: Record<string, unknown> } = {}) {
    this.store.set(key, value);
    if (options.metadata) this.metadata.set(key, options.metadata);
  }

  async delete(key: string) {
    this.store.delete(key);
    this.metadata.delete(key);
  }

  async list(options: { prefix?: string; limit?: number } = {}) {
    const keys = Array.from(this.store.keys())
      .filter((key) => key.startsWith(options.prefix || ''))
      .slice(0, options.limit || 1000)
      .map((name) => ({ name, metadata: this.metadata.get(name) }));
    return { keys, list_complete: true };
  }
}

describe('Pool admin session review', () => {
  beforeEach(() => vi.stubGlobal('crypto', webcrypto));
  afterEach(() => vi.unstubAllGlobals());

  it('stores only summarized client metadata and supports explicit revocation', async () => {
    const pledges = new MockKVNamespace();
    const env = {
      SITE_BASE: 'https://pool.test',
      CORS_ALLOWED_ORIGIN: 'https://pool.test',
      APP_MODE: 'test',
      ADMIN_EXPOSE_LOGIN_LINK: 'true',
      ADMIN_BOOTSTRAP_EMAILS: 'admin@example.com',
      ADMIN_SESSION_SECRET: 'pool-admin-session-test-secret',
      PLEDGES: pledges
    } as any;
    const start = await handleAdminAuthStart(
      new Request('https://pool.test/admin/auth/start', { method: 'POST' }),
      env,
      { email: 'admin@example.com', preferredLang: 'en' }
    );
    const loginUrl = String((await start.json()).loginUrl || '');
    const token = new URL(loginUrl).searchParams.get('admin_login') || '';
    const rawUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36';
    const rawIp = '203.0.113.42';
    const exchange = await handleAdminAuthExchange(new Request('https://pool.test/admin/auth/exchange', {
      method: 'POST',
      headers: { 'User-Agent': rawUserAgent, 'CF-Connecting-IP': rawIp }
    }), env, { token });

    expect(exchange.status).toBe(200);
    const review = await listAdminSessionReview(env);
    expect(review.retentionDays).toBe(30);
    expect(review.active).toHaveLength(1);
    expect(review.active[0]).toMatchObject({
      email: 'admin@example.com',
      client: { browser: 'Chrome', operatingSystem: 'macOS', device: 'Desktop' }
    });
    expect(review.active[0].networkId).toMatch(/^[A-Za-z0-9_-]{16}$/);
    const storedValues = Array.from(pledges.store.values()).join('\n');
    expect(storedValues).not.toContain(rawUserAgent);
    expect(storedValues).not.toContain(rawIp);

    const revoked = await revokeAdminSessionById(env, review.active[0].id);
    expect(revoked.ok).toBe(true);
    expect((await listAdminSessionReview(env)).active).toHaveLength(0);
  });

  it('rejects malformed session identifiers', async () => {
    const result = await revokeAdminSessionById({ PLEDGES: new MockKVNamespace() }, '../session');
    expect(result).toMatchObject({ ok: false, status: 400 });
  });
});
