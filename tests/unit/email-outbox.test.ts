import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CAMPAIGN_EMAIL_SUPPRESSION_PREFIX,
  EMAIL_DELIVERY_PREFIX,
  EMAIL_OUTBOX_PREFIX,
  enqueueEmailOutbox,
  processEmailOutbox,
  processResendWebhook,
  verifyResendWebhook
} from '../../worker/src/email-outbox.js';

class MemoryKV {
  store = new Map<string, string>();

  async get(key: string, options?: { type?: string }) {
    const value = this.store.get(key);
    if (value === undefined) return null;
    return options?.type === 'json' ? JSON.parse(value) : value;
  }

  async put(key: string, value: string) {
    this.store.set(key, value);
  }

  async delete(key: string) {
    this.store.delete(key);
  }

  async list({ prefix = '', limit = 1000 } = {}) {
    const keys = [...this.store.keys()].filter((key) => key.startsWith(prefix)).sort().slice(0, limit);
    return { keys: keys.map((name) => ({ name })), list_complete: true };
  }
}

const baseEnv = (kv: MemoryKV) => ({
  PLEDGES: kv,
  RESEND_API_KEY: 're_test',
  SITE_BASE: 'https://pool.test',
  WORKER_BASE: 'https://api.pool.test',
  PLATFORM_NAME: 'The Pool',
  PLATFORM_COMPANY_NAME: 'Dust Wave',
  SUPPORT_EMAIL: 'info@pool.test',
  PLEDGES_EMAIL_FROM: 'The Pool <pledges@pool.test>',
  UPDATES_EMAIL_FROM: 'The Pool <updates@pool.test>',
  I18N_CATALOG_JSON: JSON.stringify({ en: { email: {} } })
});

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('durable Resend email outbox', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('deduplicates enqueue operations and sends a frozen payload with a stable provider key', async () => {
    const kv = new MemoryKV();
    const env = baseEnv(kv);
    const request = { kind: 'supporter', dedupeKey: 'order-123', payload: {
      email: 'supporter@example.com', campaignSlug: 'hand-relations', campaignTitle: 'Hand Relations',
      subtotal: 1000, amount: 1000, token: 'token'
    } };
    const first = await enqueueEmailOutbox(env, request);
    const duplicate = await enqueueEmailOutbox(env, request);
    expect(first).toMatchObject({ queued: true, deduped: false });
    expect(duplicate).toMatchObject({ queued: true, deduped: true, jobId: first.jobId });

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify({ id: 'email_123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await processEmailOutbox(env, { now: new Date('2027-07-12T12:00:00Z') });
    expect(result.sent).toBe(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe(`pool/${first.jobId}`);
    const providerPayload = JSON.parse(String(init?.body));
    expect(providerPayload.tags).toEqual(expect.arrayContaining([
      { name: 'pool_job', value: first.jobId },
      { name: 'category', value: 'supporter' }
    ]));
    expect(await kv.get(`${EMAIL_OUTBOX_PREFIX}${first.jobId}`)).toBeNull();
    expect(await kv.get(`${EMAIL_DELIVERY_PREFIX}${first.jobId}`, { type: 'json' })).toMatchObject({
      status: 'accepted', providerId: 'email_123'
    });
  });

  it('defers retryable provider failures without changing the frozen content', async () => {
    const kv = new MemoryKV();
    const env = baseEnv(kv);
    const queued = await enqueueEmailOutbox(env, {
      kind: 'supporter', dedupeKey: 'retry-order', payload: {
        email: 'supporter@example.com', campaignSlug: 'hand-relations', campaignTitle: 'Hand Relations',
        subtotal: 1000, amount: 1000, token: 'token'
      }
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ name: 'rate_limit_exceeded', message: 'Slow down' }), {
      status: 429, headers: { 'Retry-After': '120' }
    })));
    const result = await processEmailOutbox(env, { now: new Date('2027-07-12T12:00:00Z') });
    expect(result.retried).toBe(1);
    const job = await kv.get(`${EMAIL_OUTBOX_PREFIX}${queued.jobId}`, { type: 'json' });
    expect(job).toMatchObject({ status: 'retry', attempts: 1, nextAttemptAt: '2027-07-12T12:02:00.000Z' });
    expect(job.providerPayload.html).toContain('Hand Relations');
    expect(job.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('suppresses campaign marketing immediately before delivery', async () => {
    const kv = new MemoryKV();
    const env = baseEnv(kv);
    const email = 'supporter@example.com';
    await kv.put(`${CAMPAIGN_EMAIL_SUPPRESSION_PREFIX}hand-relations:${await sha256Hex(email)}`, '{}');
    const queued = await enqueueEmailOutbox(env, {
      kind: 'diary', dedupeKey: 'diary-1', campaignSlug: 'hand-relations', payload: {
        email, campaignSlug: 'hand-relations', campaignTitle: 'Hand Relations', diaryTitle: 'Update', token: 'token'
      }
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await processEmailOutbox(env, { now: new Date('2027-07-12T12:00:00Z') });
    expect(result.suppressed).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await kv.get(`${EMAIL_DELIVERY_PREFIX}${queued.jobId}`, { type: 'json' })).toMatchObject({ status: 'suppressed' });
  });

  it('verifies signed Resend events and records delivery and permanent-bounce suppression', async () => {
    const secretBytes = crypto.getRandomValues(new Uint8Array(32));
    const secret = `whsec_${btoa(String.fromCharCode(...secretBytes))}`;
    const id = 'msg_test';
    const now = new Date('2026-07-12T12:00:00Z');
    const timestamp = String(Math.floor(now.getTime() / 1000));
    const jobId = 'a'.repeat(64);
    const rawBody = JSON.stringify({ type: 'email.bounced' });
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`));
    const signature = btoa(String.fromCharCode(...new Uint8Array(digest)));
    await expect(verifyResendWebhook(rawBody, {
      id,
      timestamp,
      signature: `v1,invalid v1,${signature}`
    }, secret, now)).resolves.toMatchObject({ valid: true, id });
    await expect(verifyResendWebhook(rawBody, {
      id,
      timestamp,
      signature: `v1,${signature}`
    }, secret, new Date(now.getTime() + 301_000))).resolves.toMatchObject({
      valid: false,
      error: 'timestamp_outside_tolerance'
    });
    await expect(verifyResendWebhook(rawBody, {
      id,
      timestamp,
      signature: `v1,${signature}`
    }, 'whsec_***', now)).resolves.toMatchObject({
      valid: false,
      error: 'invalid_secret'
    });
    await expect(verifyResendWebhook(`${rawBody} `, {
      id,
      timestamp,
      signature: `v1,${signature}`
    }, secret, now)).resolves.toEqual({ valid: false, id });

    const kv = new MemoryKV();
    const result = await processResendWebhook({ PLEDGES: kv }, {
      type: 'email.bounced', created_at: now.toISOString(), data: {
        email_id: 'email_bounced', to: ['bad@example.com'], bounce: { type: 'permanent' },
        tags: [{ name: 'pool_job', value: jobId }]
      }
    }, id);
    expect(result).toMatchObject({ processed: true, suppressed: true, jobId });
    expect(await kv.get(`${EMAIL_DELIVERY_PREFIX}${jobId}`, { type: 'json' })).toMatchObject({ status: 'bounced' });
  });
});
