import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CAMPAIGN_EMAIL_SUPPRESSION_PREFIX,
  EMAIL_DELIVERY_PREFIX,
  EMAIL_OUTBOX_PREFIX,
  EMAIL_OUTBOX_QUEUE_STATE_KEY,
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

function retryWindowReceipt() {
  return {
    kind: 'supporter', dedupeKey: 'window', payload: {
      email: 'supporter@example.com', campaignSlug: 'hand-relations', campaignTitle: 'Hand Relations',
      subtotal: 1000, amount: 1000, token: 'test-token'
    }
  };
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

  it('delivers a Pool receipt without reading or changing another product shared-KV queue', async () => {
    const kv = new MemoryKV();
    const env = baseEnv(kv);
    const otherJobKey = `email-outbox:v1:${'b'.repeat(64)}`;
    const otherJob = JSON.stringify({
      version: 1, jobId: 'b'.repeat(64), kind: 'store_order', status: 'pending',
      payload: { email: 'store-customer@example.com' }, nextAttemptAt: '2026-10-22T06:00:00Z'
    });
    // A different product can mark its own queue idle or defer its work.
    const otherQueue = JSON.stringify({ version: 1, hasPending: false, nextDueAt: '2028-01-01T00:00:00Z' });
    await kv.put(otherJobKey, otherJob);
    await kv.put('email-outbox-queue:v1', otherQueue);
    const queued = await enqueueEmailOutbox(env, {
      kind: 'charge_success', dedupeKey: 'receipt-order', campaignSlug: 'campaign', payload: {
        email: 'supporter@example.com', campaignSlug: 'campaign', campaignTitle: 'Campaign',
        subtotal: 2500, tax: 150, shipping: 356, tipAmount: 125, tipPercent: 5,
        amount: 3131, token: 'test-token', hasDecisions: false, preferredLang: 'en',
        pledgeItems: { tierName: 'Supporter', tierQty: 1, additionalTiers: [], supportItems: [], customAmount: 0 }
      }
    });
    expect(EMAIL_OUTBOX_PREFIX).toBe('pool:email-outbox:v1:');
    expect(EMAIL_OUTBOX_QUEUE_STATE_KEY).toBe('pool:email-outbox-queue:v1');
    expect(await kv.get(`email-outbox:v1:${queued.jobId}`)).toBeNull();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'receipt_123' }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await processEmailOutbox(env, { now: new Date('2027-07-12T12:00:00Z') });
    expect(result).toMatchObject({ checked: 1, sent: 1, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe(`pool/${queued.jobId}`);
    const receipt = JSON.parse(String(init.body));
    expect(receipt.to).toBe('supporter@example.com');
    expect(receipt.html).toContain('$31.31');
    expect(receipt.text).toContain('$31.31');
    expect(await kv.get(otherJobKey)).toBe(otherJob);
    expect(await kv.get('email-outbox-queue:v1')).toBe(otherQueue);
    expect(await kv.get(`${EMAIL_DELIVERY_PREFIX}${queued.jobId}`, { type: 'json' })).toMatchObject({
      status: 'accepted', providerId: 'receipt_123'
    });
    await processEmailOutbox(env, { now: new Date('2027-07-12T12:01:00Z') });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: 'one millisecond inside', elapsed: 23 * 3_600_000 - 1, allowed: true },
    { label: 'at the cutoff', elapsed: 23 * 3_600_000, allowed: false },
    { label: 'after a 25-hour outage', elapsed: 25 * 3_600_000, allowed: false }
  ])('protects an unacknowledged provider send $label', async ({ elapsed, allowed }) => {
    const kv = new MemoryKV();
    const env = baseEnv(kv);
    const request = retryWindowReceipt();
    const { jobId } = await enqueueEmailOutbox(env, request);
    const start = new Date();
    const send = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ id: 'accepted_once' }))
      .mockRejectedValueOnce(new TypeError('Connection lost after provider acceptance'));
    vi.stubGlobal('fetch', send);
    expect(await processEmailOutbox(env, { now: start })).toMatchObject({ retried: 1, sent: 0 });
    const key = EMAIL_OUTBOX_PREFIX + jobId;
    const receiptKey = EMAIL_DELIVERY_PREFIX + jobId;
    expect(await kv.get(key, { type: 'json' })).toMatchObject({ status: 'retry', attempts: 1 });
    const result = await processEmailOutbox(env, { now: new Date(start.getTime() + elapsed) });
    const headers = send.mock.calls.map(([, init]) => new Headers(init.headers).get('Idempotency-Key'));
    const expectedKey = `pool/${jobId}`;
    if (allowed) {
      expect(headers).toEqual([expectedKey, expectedKey]);
      expect(send.mock.calls[1][1].body).toBe(send.mock.calls[0][1].body);
      expect(result).toMatchObject({ sent: 1, failed: 0 });
      expect(await kv.get(receiptKey, { type: 'json' })).toMatchObject({ status: 'accepted', providerId: 'accepted_once' });
    } else {
      expect(headers).toEqual([expectedKey]);
      expect(result).toMatchObject({ sent: 0, failed: 1 });
      expect(await kv.get(receiptKey, { type: 'json' })).toMatchObject({ status: 'ambiguous', attempts: 1 });
      expect(await enqueueEmailOutbox(env, request)).toMatchObject({ sent: false, queued: false, jobId });
      await processEmailOutbox(env, { now: new Date(start.getTime() + elapsed + 60_000) });
      expect(send).toHaveBeenCalledTimes(1);
    }
    expect(await kv.get(key)).toBeNull();
  });

  it('rechecks the live clock after checkpointing an old processing lease', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const kv = new MemoryKV();
      const env = baseEnv(kv);
      const { jobId } = await enqueueEmailOutbox(env, retryWindowReceipt());
      const send = vi.fn().mockRejectedValue(new TypeError('Provider response lost'));
      vi.stubGlobal('fetch', send);
      expect(await processEmailOutbox(env)).toMatchObject({ retried: 1 });
      const key = EMAIL_OUTBOX_PREFIX + jobId;
      const job = await kv.get(key, { type: 'json' });
      // Simulate a pre-upgrade worker that stopped after persisting its send intent.
      delete job.firstProviderAttemptAt;
      delete job.lastError;
      await kv.put(key, JSON.stringify({ ...job, status: 'processing' }));
      const cutoff = Date.parse(job.firstAttemptAt) + 23 * 3_600_000;
      vi.setSystemTime(cutoff - 1);
      const put = kv.put.bind(kv);
      vi.spyOn(kv, 'put').mockImplementation(async (keyToWrite, value) => {
        await put(keyToWrite, value);
        if (keyToWrite === key && JSON.parse(value).status === 'processing') vi.setSystemTime(cutoff);
      });
      expect(await processEmailOutbox(env)).toMatchObject({ sent: 0, failed: 1 });
      expect(send).toHaveBeenCalledTimes(1);
      expect(await kv.get(EMAIL_DELIVERY_PREFIX + jobId, { type: 'json' })).toMatchObject({
        status: 'ambiguous', firstProviderAttemptAt: job.firstAttemptAt, attempts: 1
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('honors provider delivery evidence when recovering an overdue job', async () => {
    const kv = new MemoryKV();
    const env = baseEnv(kv);
    const { jobId } = await enqueueEmailOutbox(env, retryWindowReceipt());
    const start = new Date();
    const send = vi.fn().mockRejectedValue(new TypeError('Response lost'));
    vi.stubGlobal('fetch', send);
    expect(await processEmailOutbox(env, { now: start })).toMatchObject({ retried: 1 });
    const evidence = { status: 'delivered', providerId: 'receipt_from_webhook' };
    const key = EMAIL_DELIVERY_PREFIX + jobId;
    await kv.put(key, JSON.stringify(evidence));
    await processEmailOutbox(env, { now: new Date(start.getTime() + 25 * 3_600_000) });
    expect(send).toHaveBeenCalledTimes(1);
    expect(await kv.get(key, { type: 'json' })).toEqual(evidence);
    expect(await kv.get(EMAIL_OUTBOX_PREFIX + jobId)).toBeNull();
    expect(await enqueueEmailOutbox(env, retryWindowReceipt())).toMatchObject({ deduped: true, queued: false, providerId: evidence.providerId });
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
