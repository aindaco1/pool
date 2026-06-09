import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockStripeClient = {
  checkout: {
    sessions: {
      create: vi.fn(),
      retrieve: vi.fn(),
      list: vi.fn()
    }
  },
  setupIntents: {
    retrieve: vi.fn()
  },
  customers: {
    create: vi.fn()
  },
  paymentMethods: {
    attach: vi.fn()
  },
  paymentIntents: {
    create: vi.fn()
  }
};

const mockSendAnnouncementEmail = vi.fn(async () => {});
const mockSendCampaignRunnerReportEmail = vi.fn(async () => {});
const mockSendMilestoneEmail = vi.fn(async () => {});
const mockSendSupporterEmail = vi.fn(async () => {});
const mockSendLaunchReminderEmail = vi.fn(async () => ({ sent: true }));

vi.mock('../../worker/src/stripe.js', () => ({
  verifyStripeSignature: vi.fn(async () => ({ valid: true })),
  createStripeClient: vi.fn(() => mockStripeClient)
}));

vi.mock('../../worker/src/token.js', () => ({
  generateToken: vi.fn(async () => 'token'),
  verifyToken: vi.fn(async () => null)
}));

vi.mock('../../worker/src/email.js', () => ({
  RESEND_RATE_LIMIT_DELAY_MS: 0,
  sendSupporterEmail: mockSendSupporterEmail,
  sendPaymentFailedEmail: vi.fn(async () => {}),
  sendPledgeModifiedEmail: vi.fn(async () => {}),
  sendPledgeCancelledEmail: vi.fn(async () => {}),
  sendDiaryUpdateEmail: vi.fn(async () => {}),
  sendMilestoneEmail: mockSendMilestoneEmail,
  sendChargeSuccessEmail: vi.fn(async () => {}),
  sendAnnouncementEmail: mockSendAnnouncementEmail,
  sendCampaignRunnerReportEmail: mockSendCampaignRunnerReportEmail,
  sendLaunchReminderEmail: mockSendLaunchReminderEmail
}));

vi.mock('../../worker/src/github.js', () => ({
  triggerSiteRebuild: vi.fn(async () => {}),
  triggerMediaOptimization: vi.fn(async () => ({ triggered: true })),
  deleteGitHubFile: vi.fn(async () => ({ ok: true, deleted: true }))
}));

class PaginatedKVNamespace {
  store = new Map<string, string>();
  pageSize: number;
  listCalls: Array<{ prefix: string; cursor?: string }> = [];
  putCalls: Array<{ key: string; value: string }> = [];

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
    this.putCalls.push({ key, value });
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

class MockTierInventoryNamespace {
  responders = new Map<string, (body: Record<string, unknown>) => unknown>();

  idFromName(name: string) {
    return { name };
  }

  get(_id: { name: string }) {
    return {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const pathname = new URL(url).pathname;
        const responder = this.responders.get(pathname);
        const payload = responder ? await responder(body) : { success: true };
        return jsonResponse(payload);
      }
    };
  }
}

class MockSettlementNamespace {
  locks = new Map<string, { owner: string; expiresAt: number; reason?: string }>();
  calls: Array<{ name: string; pathname: string; body: Record<string, unknown> }> = [];

  idFromName(name: string) {
    return { name };
  }

  forceLock(name: string, owner = 'other-owner') {
    this.locks.set(name, {
      owner,
      expiresAt: Date.now() + 15 * 60 * 1000,
      reason: 'test'
    });
  }

  get(id: { name: string }) {
    return {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const pathname = new URL(url).pathname;
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        this.calls.push({ name: id.name, pathname, body });
        const owner = String(body.owner || '');
        const existing = this.locks.get(id.name);

        if (pathname === '/claim') {
          if (existing && existing.expiresAt > Date.now() && existing.owner !== owner) {
            return jsonResponse({
              ok: false,
              locked: true,
              owner: existing.owner,
              expiresAt: existing.expiresAt
            }, 409);
          }
          const lock = {
            owner,
            reason: String(body.reason || ''),
            expiresAt: Date.now() + Number(body.ttlMs || 15 * 60 * 1000)
          };
          this.locks.set(id.name, lock);
          return jsonResponse({ ok: true, locked: false, ...lock });
        }

        if (pathname === '/release') {
          if (!existing || existing.owner === owner) {
            this.locks.delete(id.name);
            return jsonResponse({ ok: true, released: Boolean(existing) });
          }
          return jsonResponse({ ok: false, owner: existing.owner, expiresAt: existing.expiresAt }, 409);
        }

        return jsonResponse({ ok: true, locked: Boolean(existing), ...existing });
      }
    };
  }
}

const campaignFixture = {
  slug: 'hand-relations',
  url: '/campaigns/hand-relations/',
  title: 'Hand Relations',
  state: 'live',
  creator_name: 'Dust Wave',
  category: 'Feature Film',
  short_blurb: 'Elevated horror where a corporate empathy campaign consumes bureaucracy.',
  short_blurb_html: 'Elevated horror where a corporate empathy campaign consumes bureaucracy.',
  hero_image: '/assets/images/defaults/dust-wave-square.png',
  hero_image_wide: '/assets/images/campaigns/hand-relations/hand-relations-wide.png',
  hero_image_alt: 'Hand Relations',
  hero_video: '/assets/videos/defaults/hand-relations.webm',
  progress_background: '/assets/images/campaigns/hand-relations/progress.png',
  goal_amount: 25000,
  pledged_amount: 0,
  goal_deadline: '2099-12-31',
  start_date: '2026-01-01',
  charged: false,
  single_tier_only: false,
  custom_late_support: true,
  tiers: [
    {
      id: 'frame-slot',
      name: 'Buy 1 Frame',
      price: 5,
      limit_total: 1000,
      remaining: 1000,
      sold_out: false,
      stackable: true,
      category: 'digital'
    }
  ],
  support_items: [
    {
      id: 'location-scouting',
      label: 'Location Scouting',
      target: 1000,
      current: 0
    }
  ],
  has_decisions: false,
  instagram: null,
  diary: []
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function createEnv(overrides: Record<string, unknown> = {}) {
  return {
    SITE_BASE: 'https://pool.test',
    WORKER_BASE: 'https://pool.test',
    APP_MODE: 'test',
    STRIPE_SECRET_KEY_TEST: 'sk_test_123',
    STRIPE_WEBHOOK_SECRET_TEST: 'whsec_test_123',
    MAGIC_LINK_SECRET: 'secret',
    ADMIN_SECRET: 'admin-secret',
    RESEND_API_KEY: 'test_resend_key',
    PLEDGES: new PaginatedKVNamespace(2),
    RATELIMIT: new PaginatedKVNamespace(50),
    SETTLEMENT_COORDINATOR: new MockSettlementNamespace(),
    ...overrides
  };
}

let worker: {
  fetch: (request: Request, env: Record<string, unknown>, ctx: { waitUntil: (promise: Promise<unknown>) => void }) => Promise<Response>;
  scheduled: (controller: unknown, env: Record<string, unknown>, ctx: { waitUntil: (promise: Promise<unknown>) => void }) => Promise<void>;
};

let resetCampaignRuntimeStateForTests: () => void;

beforeAll(async () => {
  ({ default: worker } = await import('../../worker/src/index.js'));
  ({ __resetCampaignRuntimeStateForTests: resetCampaignRuntimeStateForTests } = await import('../../worker/src/campaigns.js'));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockStripeClient.customers.create.mockImplementation(async ({ email }: { email: string }) => ({ id: `cus_${email}` }));
  mockStripeClient.paymentMethods.attach.mockResolvedValue({});
  mockStripeClient.paymentIntents.create.mockResolvedValue({ id: 'pi_test', status: 'succeeded' });
  vi.useRealTimers();
  resetCampaignRuntimeStateForTests();

  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url === 'https://pool.test/api/campaigns.json') {
      return jsonResponse({ campaigns: [campaignFixture] });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
});

describe('worker operational integrity', () => {
  it('throttles the minute-level cron heartbeat to avoid baseline KV write churn', async () => {
    vi.useFakeTimers();
    const env = createEnv();
    const kv = env.PLEDGES as PaginatedKVNamespace;

    vi.setSystemTime(new Date('2026-04-21T13:01:00.000Z'));
    await worker.scheduled({ cron: '* * * * *' }, env, { waitUntil: () => {} });
    expect(kv.putCalls.filter(call => call.key === 'cron:lastRun')).toHaveLength(0);

    vi.setSystemTime(new Date('2026-04-21T14:00:00.000Z'));
    await worker.scheduled({ cron: '* * * * *' }, env, { waitUntil: () => {} });
    expect(kv.putCalls.filter(call => call.key === 'cron:lastRun')).toHaveLength(1);
  });

  it('retries queued supporter confirmation emails on the retry cron', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as PaginatedKVNamespace;

    await kv.put('pledge:pool-intent-retry-1', JSON.stringify({
      orderId: 'pool-intent-retry-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      pledgeStatus: 'active',
      charged: false
    }));
    await kv.put('supporter-email-retry:pool-intent-retry-1', JSON.stringify({
      orderId: 'pool-intent-retry-1',
      payload: {
        email: 'buyer@example.com',
        campaignSlug: 'hand-relations',
        campaignTitle: 'Hand Relations',
        subtotal: 500,
        tax: 39,
        shipping: 0,
        tipAmount: 25,
        tipPercent: 5,
        token: 'token'
      },
      attempts: 1,
      createdAt: '2026-04-14T00:00:00.000Z',
      lastAttemptAt: '2026-04-14T00:05:00.000Z',
      nextAttemptAt: '2026-04-14T00:10:00.000Z',
      lastError: 'resend unavailable'
    }));

    await worker.scheduled({ cron: '*/15 * * * *' }, env, { waitUntil: () => {} });

    expect(mockSendSupporterEmail).toHaveBeenCalledTimes(1);
    await expect(kv.get('supporter-email-retry:pool-intent-retry-1')).resolves.toBeNull();
    await expect(kv.get('pledge:pool-intent-retry-1', { type: 'json' })).resolves.toMatchObject({
      emailSent: true,
      emailError: null
    });
    await expect(kv.get('cron:lastEmailRetryRun')).resolves.toBeTruthy();
  });

  it('skips supporter email retry list scans while the retry queue is idle', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as PaginatedKVNamespace;

    await worker.scheduled({ cron: '*/15 * * * *' }, env, { waitUntil: () => {} });
    expect(kv.listCalls.some(call => call.prefix === 'supporter-email-retry:')).toBe(true);

    kv.listCalls = [];
    await worker.scheduled({ cron: '*/15 * * * *' }, env, { waitUntil: () => {} });
    expect(kv.listCalls.some(call => call.prefix === 'supporter-email-retry:')).toBe(false);
  });

  it('defers supporter email retry list scans until the next queued attempt is due', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T00:00:00.000Z'));

    const env = createEnv();
    const kv = env.PLEDGES as PaginatedKVNamespace;

    await kv.put('pledge:pool-intent-retry-future', JSON.stringify({
      orderId: 'pool-intent-retry-future',
      email: 'future@example.com',
      campaignSlug: 'hand-relations',
      pledgeStatus: 'active',
      charged: false
    }));
    await kv.put('supporter-email-retry:pool-intent-retry-future', JSON.stringify({
      orderId: 'pool-intent-retry-future',
      payload: {
        email: 'future@example.com',
        campaignSlug: 'hand-relations',
        campaignTitle: 'Hand Relations',
        subtotal: 500,
        tax: 39,
        shipping: 0,
        tipAmount: 25,
        tipPercent: 5,
        token: 'token'
      },
      attempts: 1,
      createdAt: '2026-04-14T00:00:00.000Z',
      lastAttemptAt: '2026-04-14T00:00:00.000Z',
      nextAttemptAt: '2026-04-14T01:00:00.000Z',
      lastError: 'resend unavailable'
    }));
    await kv.put('supporter-email-retry-queue:v1', JSON.stringify({
      version: 1,
      hasPending: true,
      nextAttemptAt: '2026-04-14T01:00:00.000Z',
      updatedAt: '2026-04-14T00:00:00.000Z'
    }));

    await worker.scheduled({ cron: '*/15 * * * *' }, env, { waitUntil: () => {} });
    expect(kv.listCalls.some(call => call.prefix === 'supporter-email-retry:')).toBe(false);
    expect(mockSendSupporterEmail).not.toHaveBeenCalled();

    vi.setSystemTime(new Date('2026-04-14T01:00:00.000Z'));
    await worker.scheduled({ cron: '*/15 * * * *' }, env, { waitUntil: () => {} });
    expect(kv.listCalls.some(call => call.prefix === 'supporter-email-retry:')).toBe(true);
    expect(mockSendSupporterEmail).toHaveBeenCalledTimes(1);
  });

  it('sends a daily campaign-runner pledge report at 7am platform time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-21T13:00:00.000Z'));

    const env = createEnv();
    const kv = env.PLEDGES as PaginatedKVNamespace;

    await kv.put('campaign-pledges:hand-relations', JSON.stringify(['order-report-1', 'order-report-2']));
    await kv.put('pledge:order-report-1', JSON.stringify({
      orderId: 'order-report-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      tierId: 'frame-slot',
      tierQty: 1,
      subtotal: 500,
      tipPercent: 5,
      tipAmount: 25,
      tax: 39,
      shipping: 0,
      amount: 564,
      pledgeStatus: 'active',
      charged: false,
      createdAt: '2026-04-20T12:00:00.000Z',
      history: [
        {
          type: 'created',
          tierId: 'frame-slot',
          tierQty: 1,
          subtotal: 500,
          tipPercent: 5,
          tipAmount: 25,
          tax: 39,
          shipping: 0,
          amount: 564,
          at: '2026-04-20T12:00:00.000Z'
        }
      ]
    }));
    await kv.put('pledge:order-report-2', JSON.stringify({
      orderId: 'order-report-2',
      email: 'newbuyer@example.com',
      campaignSlug: 'hand-relations',
      tierId: 'sfx-slot',
      tierQty: 1,
      subtotal: 1000,
      tipPercent: 5,
      tipAmount: 50,
      tax: 79,
      shipping: 0,
      amount: 1129,
      pledgeStatus: 'active',
      charged: false,
      createdAt: '2026-04-21T05:00:00.000Z',
      history: [
        {
          type: 'created',
          tierId: 'sfx-slot',
          tierQty: 1,
          subtotal: 1000,
          tipPercent: 5,
          tipAmount: 50,
          tax: 79,
          shipping: 0,
          amount: 1129,
          at: '2026-04-21T05:00:00.000Z'
        }
      ]
    }));
    await kv.put('stats:hand-relations', JSON.stringify({
      campaignSlug: 'hand-relations',
      pledgedAmount: 1500,
      pledgeCount: 2,
      tierCounts: { 'frame-slot': 1, 'sfx-slot': 1 },
      supportItems: {},
      updatedAt: '2026-04-21T12:59:00.000Z'
    }));

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({
          campaigns: [{
            ...campaignFixture,
            runner_report_emails: ['runner@example.com']
          }]
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    await worker.scheduled({ cron: '0 13 * * *' }, env, { waitUntil: () => {} });

    expect(mockSendCampaignRunnerReportEmail).toHaveBeenCalledTimes(1);
    expect(mockSendCampaignRunnerReportEmail).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      email: 'runner@example.com',
      campaignSlug: 'hand-relations',
      reportKind: 'Daily pledge report',
      csvFilename: 'hand-relations-pledge-report-2026-04-21.csv',
      includeCsvAttachment: true,
      encouragement: expect.objectContaining({
        title: 'Momentum note'
      }),
      statsSummary: expect.arrayContaining([
        'Total pledges: 2',
        'New pledges in the previous 24 hours: 1',
        'Pledged total: $15.00',
        'Goal progress: $25,000.00 goal (0.1% funded)'
      ])
    }));
    await expect(kv.get('campaign-runner-report:pledge:hand-relations:2026-04-21')).resolves.toBeTruthy();
    await expect(kv.get('cron:lastCampaignRunnerReportRun')).resolves.toBeTruthy();
  });

  it('dispatches queued launch reminders once and writes sent markers', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as PaginatedKVNamespace;

    await kv.put('launch-reminder:hand-relations:hash123', JSON.stringify({
      campaignSlug: 'hand-relations',
      campaignTitle: 'Hand Relations',
      email: 'fan@example.com',
      emailHash: 'hash123',
      preferredLang: 'en',
      status: 'active',
      createdAt: '2026-04-21T00:00:00.000Z',
      updatedAt: '2026-04-21T00:00:00.000Z'
    }));
    await kv.put('launch-reminder-dispatch:hand-relations', JSON.stringify({
      version: 1,
      status: 'pending',
      campaignSlug: 'hand-relations',
      campaignTitle: 'Hand Relations',
      queuedAt: '2026-04-21T00:00:00.000Z',
      updatedAt: '2026-04-21T00:00:00.000Z',
      sent: 0,
      skipped: 0,
      failed: 0
    }));

    await worker.scheduled({ cron: '* * * * *' }, env, { waitUntil: () => {} });

    expect(mockSendLaunchReminderEmail).toHaveBeenCalledTimes(1);
    expect(mockSendLaunchReminderEmail).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      email: 'fan@example.com',
      campaignSlug: 'hand-relations',
      campaignTitle: 'Hand Relations',
      campaignUrl: 'https://pool.test/campaigns/hand-relations/',
      unsubscribeUrl: 'https://pool.test/launch-reminders/unsubscribe?t=token'
    }));
    await expect(kv.get('launch-reminder-sent:hand-relations:hash123')).resolves.toBeTruthy();
    await expect(kv.get('launch-reminder-dispatch:hand-relations')).resolves.toBeNull();
    await expect(kv.get('launch-reminder-complete:hand-relations')).resolves.toBeTruthy();

    await worker.scheduled({ cron: '* * * * *' }, env, { waitUntil: () => {} });
    expect(mockSendLaunchReminderEmail).toHaveBeenCalledTimes(1);
  });

  it('skips launch reminder dispatch list scans while the dispatch queue is idle', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as PaginatedKVNamespace;

    await worker.scheduled({ cron: '* * * * *' }, env, { waitUntil: () => {} });
    expect(kv.listCalls.some(call => call.prefix === 'launch-reminder-dispatch:')).toBe(true);

    kv.listCalls = [];
    await worker.scheduled({ cron: '* * * * *' }, env, { waitUntil: () => {} });
    expect(kv.listCalls.some(call => call.prefix === 'launch-reminder-dispatch:')).toBe(false);
  });

  it('dry-runs a campaign-runner report without sending email', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as PaginatedKVNamespace;

    await kv.put('campaign-pledges:hand-relations', JSON.stringify(['order-report-1']));
    await kv.put('pledge:order-report-1', JSON.stringify({
      orderId: 'order-report-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      tierId: 'frame-slot',
      tierQty: 1,
      subtotal: 500,
      tipPercent: 5,
      tipAmount: 25,
      tax: 39,
      shipping: 0,
      amount: 564,
      pledgeStatus: 'active',
      charged: false,
      createdAt: '2026-04-20T12:00:00.000Z',
      history: [
        {
          type: 'created',
          tierId: 'frame-slot',
          tierQty: 1,
          subtotal: 500,
          tipPercent: 5,
          tipAmount: 25,
          tax: 39,
          shipping: 0,
          amount: 564,
          at: '2026-04-20T12:00:00.000Z'
        }
      ]
    }));
    await kv.put('stats:hand-relations', JSON.stringify({
      campaignSlug: 'hand-relations',
      pledgedAmount: 500,
      pledgeCount: 1,
      tierCounts: { 'frame-slot': 1 },
      supportItems: {},
      updatedAt: '2026-04-21T12:59:00.000Z'
    }));

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({
          campaigns: [{
            ...campaignFixture,
            runner_report_emails: ['runner@example.com']
          }]
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const response = await worker.fetch(new Request('https://pool.test/admin/report/campaign-runner', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': 'admin-secret'
      },
      body: JSON.stringify({
        campaignSlug: 'hand-relations',
        reportType: 'pledge',
        dryRun: true
      })
    }), env, { waitUntil: () => {} });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      dryRun: true,
      campaignSlug: 'hand-relations',
      reportType: 'pledge',
      recipientCount: 1,
      recipients: ['runner@example.com'],
      rowCount: 1,
      includeCsvAttachment: true
    });
    expect(mockSendCampaignRunnerReportEmail).not.toHaveBeenCalled();
  });

  it('manually sends and marks a campaign-runner report from the admin endpoint', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-21T13:00:00.000Z'));

    const env = createEnv();
    const kv = env.PLEDGES as PaginatedKVNamespace;

    await kv.put('campaign-pledges:hand-relations', JSON.stringify(['order-report-1']));
    await kv.put('pledge:order-report-1', JSON.stringify({
      orderId: 'order-report-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      tierId: 'frame-slot',
      tierQty: 1,
      subtotal: 500,
      tipPercent: 5,
      tipAmount: 25,
      tax: 39,
      shipping: 0,
      amount: 564,
      pledgeStatus: 'active',
      charged: false,
      createdAt: '2026-04-20T12:00:00.000Z',
      history: [
        {
          type: 'created',
          tierId: 'frame-slot',
          tierQty: 1,
          subtotal: 500,
          tipPercent: 5,
          tipAmount: 25,
          tax: 39,
          shipping: 0,
          amount: 564,
          at: '2026-04-20T12:00:00.000Z'
        }
      ]
    }));
    await kv.put('stats:hand-relations', JSON.stringify({
      campaignSlug: 'hand-relations',
      pledgedAmount: 500,
      pledgeCount: 1,
      tierCounts: { 'frame-slot': 1 },
      supportItems: {},
      updatedAt: '2026-04-21T12:59:00.000Z'
    }));

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({
          campaigns: [{
            ...campaignFixture,
            runner_report_emails: ['runner@example.com']
          }]
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const response = await worker.fetch(new Request('https://pool.test/admin/report/campaign-runner', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': 'admin-secret'
      },
      body: JSON.stringify({
        campaignSlug: 'hand-relations',
        reportType: 'pledge'
      })
    }), env, { waitUntil: () => {} });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      campaignSlug: 'hand-relations',
      reportType: 'pledge',
      sent: 1,
      markedAsSent: true
    });
    expect(mockSendCampaignRunnerReportEmail).toHaveBeenCalledTimes(1);
    await expect(kv.get('campaign-runner-report:pledge:hand-relations:2026-04-21', { type: 'json' })).resolves.toMatchObject({
      source: 'admin_manual',
      sent: 1
    });
  });

  it('splits fulfillment sends between campaign runner and platform support email', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-21T13:00:00.000Z'));

    const env = createEnv({
      SUPPORT_EMAIL: 'support@example.com'
    });
    const kv = env.PLEDGES as PaginatedKVNamespace;

    await kv.put('campaign-pledges:hand-relations', JSON.stringify(['order-fulfillment-1']));
    await kv.put('pledge:order-fulfillment-1', JSON.stringify({
      orderId: 'order-fulfillment-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      tierId: 'frame-slot',
      tierQty: 1,
      subtotal: 1800,
      goalTrackingSubtotal: 1200,
      bundleAddOnSubtotal: 600,
      bundleAddOns: [
        {
          productId: 'campaign-poster',
          name: 'Campaign Poster',
          quantity: 1,
          unitPrice: 400,
          scope: 'campaign',
          campaignSlug: 'hand-relations'
        },
        {
          productId: 'pool-shirt',
          name: 'The Pool Shirt',
          variantLabel: 'L',
          quantity: 1,
          unitPrice: 600,
          scope: 'platform'
        }
      ],
      tipPercent: 5,
      tipAmount: 90,
      tax: 141,
      shipping: 300,
      amount: 2331,
      pledgeStatus: 'active',
      charged: false,
      shippingAddress: {
        name: 'Buyer Example',
        address1: '123 Example St',
        city: 'Denver',
        province: 'CO',
        postalCode: '80205',
        country: 'US'
      },
      createdAt: '2026-04-20T12:00:00.000Z'
    }));

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({
          campaigns: [{
            ...campaignFixture,
            state: 'post',
            runner_report_emails: ['runner@example.com']
          }]
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const responsePromise = worker.fetch(new Request('https://pool.test/admin/report/campaign-runner', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': 'admin-secret'
      },
      body: JSON.stringify({
        campaignSlug: 'hand-relations',
        reportType: 'fulfillment',
        markAsSent: true
      })
    }), env, { waitUntil: () => {} });

    await vi.advanceTimersByTimeAsync(1000);
    const response = await responsePromise;

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      campaignSlug: 'hand-relations',
      reportType: 'fulfillment',
      recipientCount: 1,
      recipients: ['runner@example.com'],
      platformRecipient: 'support@example.com',
      campaignRowCount: 1,
      platformRowCount: 1,
      sent: 2,
      markedAsSent: true
    });

    expect(mockSendCampaignRunnerReportEmail).toHaveBeenCalledTimes(2);
    expect(mockSendCampaignRunnerReportEmail).toHaveBeenNthCalledWith(1, expect.anything(), expect.objectContaining({
      email: 'runner@example.com',
      reportKind: 'Fulfillment report',
      csvFilename: 'hand-relations-fulfillment-report-2026-04-21.csv',
      csvContent: expect.stringContaining('buyer@example.com,hand-relations,hand-relations'),
      encouragement: expect.objectContaining({
        title: 'Fulfillment note'
      }),
      statsSummary: expect.arrayContaining([
        'Supporters to fulfill: 1',
        'Items to fulfill: 2',
        'Total raised: $12.00'
      ])
    }));
    expect(mockSendCampaignRunnerReportEmail).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({
      email: 'support@example.com',
      reportKind: 'Platform fulfillment report',
      csvFilename: 'hand-relations-platform-fulfillment-report-2026-04-21.csv',
      csvContent: expect.stringContaining('buyer@example.com,,Dust Wave'),
      encouragement: expect.objectContaining({
        title: 'Fulfillment note'
      }),
      statsSummary: expect.arrayContaining([
        'Supporters to fulfill: 1',
        'Items to fulfill: 1',
        'Total raised: $6.00'
      ])
    }));

    const runnerCsv = mockSendCampaignRunnerReportEmail.mock.calls[0][1].csvContent as string;
    const platformCsv = mockSendCampaignRunnerReportEmail.mock.calls[1][1].csvContent as string;
    expect(runnerCsv).toContain('Campaign Poster');
    expect(runnerCsv).not.toContain('The Pool Shirt');
    expect(platformCsv).toContain('The Pool Shirt');
    expect(platformCsv).not.toContain('Campaign Poster');

    await expect(kv.get('campaign-runner-report:fulfillment:hand-relations', { type: 'json' })).resolves.toMatchObject({
      source: 'admin_manual',
      sent: 2
    });
  });

  it('does not mark direct settlement complete when active pledges are skipped for missing customers', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as PaginatedKVNamespace;

    await kv.put('campaign-pledges:hand-relations', JSON.stringify(['order-direct-settle-1']));
    await kv.put('pledge:order-direct-settle-1', JSON.stringify({
      orderId: 'order-direct-settle-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      amount: 3000000,
      subtotal: 3000000,
      tax: 0,
      shipping: 0,
      pledgeStatus: 'active',
      charged: false,
      stripePaymentMethodId: 'pm_missing_customer',
      updatedAt: '2026-03-31T00:00:00.000Z'
    }));
    await kv.put('stats:hand-relations', JSON.stringify({
      campaignSlug: 'hand-relations',
      pledgedAmount: 3000000,
      pledgeCount: 1,
      tierCounts: {},
      supportItems: {},
      updatedAt: '2026-03-31T00:00:00.000Z'
    }));

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({
          campaigns: [
            {
              ...campaignFixture,
              goal_deadline: '2020-01-01'
            }
          ]
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const response = await worker.fetch(
      new Request('https://pool.test/admin/settle/hand-relations', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer admin-secret',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.skippedNoCustomer).toBe(1);
    expect(body.supportersCharged).toBe(0);
    expect(await kv.get('campaign-charged:hand-relations')).toBeNull();
  });

  it('rejects direct settlement when another campaign settlement owns the lock', async () => {
    const settlement = new MockSettlementNamespace();
    settlement.forceLock('hand-relations', 'existing-run');
    const env = createEnv({ SETTLEMENT_COORDINATOR: settlement });
    const kv = env.PLEDGES as PaginatedKVNamespace;

    await kv.put('campaign-pledges:hand-relations', JSON.stringify(['order-locked-settle-1']));
    await kv.put('pledge:order-locked-settle-1', JSON.stringify({
      orderId: 'order-locked-settle-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      amount: 3000000,
      subtotal: 3000000,
      tax: 0,
      shipping: 0,
      pledgeStatus: 'active',
      charged: false,
      stripeCustomerId: 'cus_locked',
      stripePaymentMethodId: 'pm_locked',
      updatedAt: '2026-03-31T00:00:00.000Z'
    }));
    await kv.put('stats:hand-relations', JSON.stringify({
      campaignSlug: 'hand-relations',
      pledgedAmount: 3000000,
      pledgeCount: 1,
      tierCounts: {},
      supportItems: {},
      updatedAt: '2026-03-31T00:00:00.000Z'
    }));

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({
          campaigns: [
            {
              ...campaignFixture,
              goal_deadline: '2020-01-01'
            }
          ]
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const response = await worker.fetch(
      new Request('https://pool.test/admin/settle/hand-relations', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer admin-secret',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({ campaignSlug: 'hand-relations', locked: true });
    expect(mockStripeClient.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('uses a deterministic Stripe idempotency key for direct settlement charges', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as PaginatedKVNamespace;

    await kv.put('campaign-pledges:hand-relations', JSON.stringify(['order-idempotent-settle-1']));
    await kv.put('pledge:order-idempotent-settle-1', JSON.stringify({
      orderId: 'order-idempotent-settle-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      amount: 3000000,
      subtotal: 3000000,
      tax: 0,
      shipping: 0,
      pledgeStatus: 'active',
      charged: false,
      stripeCustomerId: 'cus_idempotent',
      stripePaymentMethodId: 'pm_idempotent',
      updatedAt: '2026-03-31T00:00:00.000Z'
    }));
    await kv.put('stats:hand-relations', JSON.stringify({
      campaignSlug: 'hand-relations',
      pledgedAmount: 3000000,
      pledgeCount: 1,
      tierCounts: {},
      supportItems: {},
      updatedAt: '2026-03-31T00:00:00.000Z'
    }));

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({
          campaigns: [
            {
              ...campaignFixture,
              goal_deadline: '2020-01-01'
            }
          ]
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const response = await worker.fetch(
      new Request('https://pool.test/admin/settle/hand-relations', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer admin-secret',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    expect(mockStripeClient.paymentIntents.create).toHaveBeenCalledTimes(1);
    const requestOptions = mockStripeClient.paymentIntents.create.mock.calls[0][1];
    expect(requestOptions.idempotencyKey).toMatch(/^settle:hand-relations:[a-f0-9]{48}$/);
  });

  it('does not mark scheduled settlement complete when active pledges are skipped for missing customers', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as PaginatedKVNamespace;

    await kv.put('campaign-pledges:hand-relations', JSON.stringify(['order-scheduled-settle-1']));
    await kv.put('pledge:order-scheduled-settle-1', JSON.stringify({
      orderId: 'order-scheduled-settle-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      amount: 3000000,
      subtotal: 3000000,
      tax: 0,
      shipping: 0,
      pledgeStatus: 'active',
      charged: false,
      stripePaymentMethodId: 'pm_missing_customer',
      updatedAt: '2026-03-31T00:00:00.000Z'
    }));
    await kv.put('stats:hand-relations', JSON.stringify({
      campaignSlug: 'hand-relations',
      pledgedAmount: 3000000,
      pledgeCount: 1,
      tierCounts: {},
      supportItems: {},
      updatedAt: '2026-03-31T00:00:00.000Z'
    }));

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({
          campaigns: [
            {
              ...campaignFixture,
              goal_deadline: '2020-01-01'
            }
          ]
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    await worker.scheduled({}, env, { waitUntil: () => {} });

    expect(await kv.get('campaign-charged:hand-relations')).toBeNull();
  });

  it('does not mark a campaign settled when dispatch finishes with unresolved pledges', async () => {
    const env = createEnv({ ADMIN_SETTLEMENT_SECRET: 'settlement-secret' });
    const kv = env.PLEDGES as PaginatedKVNamespace;

    await kv.put('campaign-pledges:hand-relations', JSON.stringify(['order-settle-1']));
    await kv.put('pledge:order-settle-1', JSON.stringify({
      orderId: 'order-settle-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      amount: 10000,
      subtotal: 10000,
      tax: 0,
      shipping: 0,
      pledgeStatus: 'active',
      charged: false,
      updatedAt: '2026-03-31T00:00:00.000Z'
    }));

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({ campaigns: [campaignFixture] });
      }
      if (url === 'https://pool.test/admin/settle-batch') {
        return worker.fetch(
          new Request(url, {
            method: init?.method || 'POST',
            headers: init?.headers,
            body: init?.body as BodyInit | null | undefined
          }),
          env,
          { waitUntil: () => {} }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const response = await worker.fetch(
      new Request('https://pool.test/admin/settle-dispatch/hand-relations', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer settlement-secret',
          'Content-Type': 'application/json'
        }
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('needs_attention');
    expect(await kv.get('campaign-charged:hand-relations')).toBeNull();
    const job = await kv.get('settlement-job:hand-relations', { type: 'json' });
    expect(job.totalNeedsAttention).toBeGreaterThan(0);
  });

  it('backfills customers across paginated pledge KV pages', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as PaginatedKVNamespace;

    await kv.put('campaign-pledges:hand-relations', JSON.stringify([
      'order-backfill-1',
      'order-backfill-2',
      'order-backfill-3'
    ]));

    for (let index = 1; index <= 3; index++) {
      await kv.put(`pledge:order-backfill-${index}`, JSON.stringify({
        orderId: `order-backfill-${index}`,
        email: `buyer${index}@example.com`,
        campaignSlug: 'hand-relations',
        pledgeStatus: 'active',
        charged: false,
        stripePaymentMethodId: `pm_${index}`,
        updatedAt: '2026-03-31T00:00:00.000Z'
      }));
    }

    const response = await worker.fetch(
      new Request('https://pool.test/admin/backfill-customers/hand-relations', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer admin-secret',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(3);
    expect(body.failed).toBe(0);

    const finalPledge = await kv.get('pledge:order-backfill-3', { type: 'json' });
    expect(finalPledge.stripeCustomerId).toBe('cus_buyer3@example.com');
  });

  it('fails closed when settlement dispatch is missing a campaign pledge index', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/admin/settle-dispatch/hand-relations', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer admin-secret',
          'Content-Type': 'application/json'
        }
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.requiresRebuild).toBe(true);
  });

  it('requires the scoped settlement secret when it is configured', async () => {
    const env = createEnv({ ADMIN_SETTLEMENT_SECRET: 'settlement-secret' });

    const broadSecretResponse = await worker.fetch(
      new Request('https://pool.test/admin/settle-dispatch/hand-relations', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer admin-secret',
          'Content-Type': 'application/json'
        }
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(broadSecretResponse.status).toBe(401);

    const scopedSecretResponse = await worker.fetch(
      new Request('https://pool.test/admin/settle-dispatch/hand-relations', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer settlement-secret',
          'Content-Type': 'application/json'
        }
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(scopedSecretResponse.status).toBe(409);
    const body = await scopedSecretResponse.json();
    expect(body.requiresRebuild).toBe(true);
  });

  it('requires the scoped broadcast secret when it is configured', async () => {
    const env = createEnv({ ADMIN_BROADCAST_SECRET: 'broadcast-secret' });

    const broadSecretResponse = await worker.fetch(
      new Request('https://pool.test/admin/broadcast/announcement', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer admin-secret',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(broadSecretResponse.status).toBe(401);

    const scopedSecretResponse = await worker.fetch(
      new Request('https://pool.test/admin/broadcast/announcement', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer broadcast-secret',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(scopedSecretResponse.status).toBe(400);
    const body = await scopedSecretResponse.json();
    expect(body.error).toBe('Missing campaignSlug, subject, or body');
  });

  it('fails closed when customer backfill is missing a campaign pledge index', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/admin/backfill-customers/hand-relations', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer admin-secret',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.requiresRebuild).toBe(true);
  });

  it('serves combined live campaign data from one public endpoint', async () => {
    const tierInventory = new MockTierInventoryNamespace();
    tierInventory.responders.set('/snapshot', () => ({
      success: true,
      inventory: {
        'frame-slot': { limit: 1000, claimed: 2 }
      },
      reservedCounts: {
        'frame-slot': 2
      }
    }));
    const env = createEnv({
      TIER_INVENTORY_COORDINATOR: tierInventory
    });
    const kv = env.PLEDGES as PaginatedKVNamespace;

    await kv.put('stats:hand-relations', JSON.stringify({
      campaignSlug: 'hand-relations',
      pledgedAmount: 1200,
      pledgeCount: 1,
      tierCounts: {},
      supportItems: {},
      updatedAt: '2026-03-31T00:00:00.000Z'
    }));
    await kv.put('tier-inventory:hand-relations', JSON.stringify({
      'frame-slot': { limit: 1000, claimed: 2 }
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/live/hand-relations'),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=30, stale-while-revalidate=300');
    const body = await response.json();
    expect(body.campaign).toMatchObject({
      slug: 'hand-relations',
      url: '/campaigns/hand-relations/',
      title: 'Hand Relations',
      creatorName: 'Dust Wave',
      category: 'Feature Film',
      shortBlurb: 'Elevated horror where a corporate empathy campaign consumes bureaucracy.',
      heroImageWide: '/assets/images/campaigns/hand-relations/hand-relations-wide.png',
      heroVideo: '/assets/videos/defaults/hand-relations.webm',
      isFunded: false
    });
    expect(body.stats.pledgedAmount).toBe(1200);
    expect(typeof body.campaign.effectiveState).toBe('string');
    expect(body.stats.effectiveState).toBe(body.campaign.effectiveState);
    expect(body.stats.isFunded).toBe(false);
    expect(body.inventory.tiers['frame-slot'].claimed).toBe(2);
    expect(body.inventory.tiers['frame-slot'].reserved).toBe(2);
    expect(body.inventory.tiers['frame-slot'].remaining).toBe(996);
    expect(body.inventory.raw['frame-slot'].reserved).toBe(2);
  });

  it('enumerates paginated supporters for admin broadcasts', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as PaginatedKVNamespace;

    for (let index = 1; index <= 3; index++) {
      await kv.put(`pledge:order-supporter-${index}`, JSON.stringify({
        orderId: `order-supporter-${index}`,
        email: `supporter${index}@example.com`,
        campaignSlug: 'hand-relations',
        pledgeStatus: 'active',
        charged: false
      }));
    }
    await kv.put('campaign-pledges:hand-relations', JSON.stringify([
      'order-supporter-1',
      'order-supporter-2',
      'order-supporter-3'
    ]));

    const response = await worker.fetch(
      new Request('https://pool.test/admin/broadcast/announcement', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer admin-secret',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          subject: 'Update',
          body: 'Hello supporters',
          dryRun: true
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.recipientCount).toBe(3);
    expect(body.recipients).toContain('supporter3@example.com');
    expect(kv.listCalls.some((call) => call.prefix === 'pledge:')).toBe(false);
  });

  it('serves a campaign share-card SVG that reflects live campaign data', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as PaginatedKVNamespace;

    await kv.put('stats:hand-relations', JSON.stringify({
      campaignSlug: 'hand-relations',
      pledgedAmount: 1250000,
      pledgeCount: 7,
      tierCounts: {},
      supportItems: {},
      updatedAt: '2026-03-31T00:00:00.000Z'
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/share/campaign/hand-relations.svg'),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('image/svg+xml');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
    const body = await response.text();
    expect(body).toContain('<svg');
    expect(body).toContain('Hand Relations');
    expect(body).toContain('Gambado Sans Forte');
    expect(body).toContain('$12,500');
    expect(body).toContain('50% funded');
    expect(body).not.toContain('https://pool.test');
  });

  it('shows the actual overfunded percentage on generated campaign share-card SVGs', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as PaginatedKVNamespace;

    await kv.put('stats:hand-relations', JSON.stringify({
      campaignSlug: 'hand-relations',
      pledgedAmount: 3575000,
      pledgeCount: 22,
      tierCounts: {},
      supportItems: {},
      updatedAt: '2026-03-31T00:00:00.000Z'
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/share/campaign/hand-relations.svg'),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('$35,750');
    expect(body).toContain('143% funded');
    expect(body).not.toContain('100% funded');
    expect(body).toContain('width="456" height="18" rx="9" ry="9" fill="url(#progressFill)"');
  });

  it('keeps generated campaign share-card blurbs to two lines and shrinks long copy', async () => {
    const env = createEnv();
    const longBlurb = 'A deliberately overlong short blurb that should stay readable inside the social image while never taking more than two lines from the campaign share card layout.';

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({
          campaigns: [{
            ...campaignFixture,
            title: 'Long Blurb Test',
            short_blurb: longBlurb,
            short_blurb_html: longBlurb
          }]
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const response = await worker.fetch(
      new Request('https://pool.test/share/campaign/hand-relations.svg'),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    const blurbText = body.match(/<text x="620" y="[^"]+" fill="#3d4552"[^>]*>(.*?)<\/text>/s)?.[1] || '';
    expect(body).toContain('font-size="11" font-style="italic"');
    expect(blurbText).toContain('layout.');
    expect(blurbText).not.toContain('…');
    expect((blurbText.match(/<tspan/g) || []).length).toBeLessThanOrEqual(2);
  });

  it('prefers the square hero image for generated campaign share cards', async () => {
    const env = createEnv();
    const fetchedUrls: string[] = [];

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      fetchedUrls.push(url);
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({ campaigns: [campaignFixture] });
      }
      if (url.startsWith('https://pool.test/assets/images/')) {
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { 'Content-Type': 'image/png' }
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const response = await worker.fetch(
      new Request('https://pool.test/share/campaign/hand-relations.svg'),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    expect(fetchedUrls).toContain('https://pool.test/assets/images/defaults/dust-wave-square.png');
    expect(fetchedUrls).not.toContain('https://pool.test/assets/images/campaigns/hand-relations/hand-relations-wide.png');
  });

  it('serves a crawler-safe campaign share-card PNG that reflects live campaign data', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as PaginatedKVNamespace;

    await kv.put('stats:hand-relations', JSON.stringify({
      campaignSlug: 'hand-relations',
      pledgedAmount: 1250000,
      pledgeCount: 7,
      tierCounts: {},
      supportItems: {},
      updatedAt: '2026-03-31T00:00:00.000Z'
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/share/campaign/hand-relations.png?lang=es'),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('image/png');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(bytes.byteLength).toBeLessThan(500000);
  });

  it('serves campaign share-card metadata for HEAD requests', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as PaginatedKVNamespace;

    await kv.put('stats:hand-relations', JSON.stringify({
      campaignSlug: 'hand-relations',
      pledgedAmount: 1250000,
      pledgeCount: 7,
      tierCounts: {},
      supportItems: {},
      updatedAt: '2026-03-31T00:00:00.000Z'
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/share/campaign/hand-relations.svg', { method: 'HEAD' }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('image/svg+xml');
    expect(await response.text()).toBe('');
  });

  it('serves campaign PNG share-card metadata for HEAD requests', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as PaginatedKVNamespace;

    await kv.put('stats:hand-relations', JSON.stringify({
      campaignSlug: 'hand-relations',
      pledgedAmount: 1250000,
      pledgeCount: 7,
      tierCounts: {},
      supportItems: {},
      updatedAt: '2026-03-31T00:00:00.000Z'
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/share/campaign/hand-relations.png', { method: 'HEAD' }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('image/png');
    expect(await response.text()).toBe('');
  });

  it('localizes campaign share-card copy for non-default languages', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/share/campaign/hand-relations.svg?lang=es'),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain('https://pool.test/es/campaigns/hand-relations/');
    expect(body).toContain('CREADOR');
    expect(body).toContain('financiado');
  });

  it('pre-marks milestone sends so nested milestone checks do not duplicate broadcasts', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as PaginatedKVNamespace;
    let nestedTriggered = false;

    await kv.put('pledge:order-milestone-1', JSON.stringify({
      orderId: 'order-milestone-1',
      email: 'supporter@example.com',
      campaignSlug: 'hand-relations',
      pledgeStatus: 'active',
      charged: false
    }));
    await kv.put('stats:hand-relations', JSON.stringify({
      campaignSlug: 'hand-relations',
      pledgedAmount: 1000000,
      pledgeCount: 1,
      tierCounts: {},
      supportItems: {},
      updatedAt: '2026-03-31T00:00:00.000Z'
    }));

    mockSendMilestoneEmail.mockImplementation(async () => {
      if (nestedTriggered) return;
      nestedTriggered = true;
      const nestedResponse = await worker.fetch(
        new Request('https://pool.test/admin/milestone-check/hand-relations', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer admin-secret'
          }
        }),
        env,
        { waitUntil: () => {} }
      );
      expect(nestedResponse.status).toBe(200);
    });

    const response = await worker.fetch(
      new Request('https://pool.test/admin/milestone-check/hand-relations', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer admin-secret'
        }
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    expect(mockSendMilestoneEmail).toHaveBeenCalledTimes(1);
    const sentMilestones = await kv.get('milestones:hand-relations', { type: 'json' });
    expect(sentMilestones).toContain('one-third');
  });
});
