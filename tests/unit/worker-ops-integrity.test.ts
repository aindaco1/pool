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
const mockSendMilestoneEmail = vi.fn(async () => {});
const mockSendSupporterEmail = vi.fn(async () => {});

vi.mock('../../worker/src/stripe.js', () => ({
  verifyStripeSignature: vi.fn(async () => ({ valid: true })),
  createStripeClient: vi.fn(() => mockStripeClient)
}));

vi.mock('../../worker/src/token.js', () => ({
  generateToken: vi.fn(async () => 'token'),
  verifyToken: vi.fn(async () => null)
}));

vi.mock('../../worker/src/email.js', () => ({
  sendSupporterEmail: mockSendSupporterEmail,
  sendPaymentFailedEmail: vi.fn(async () => {}),
  sendPledgeModifiedEmail: vi.fn(async () => {}),
  sendPledgeCancelledEmail: vi.fn(async () => {}),
  sendDiaryUpdateEmail: vi.fn(async () => {}),
  sendMilestoneEmail: mockSendMilestoneEmail,
  sendChargeSuccessEmail: vi.fn(async () => {}),
  sendAnnouncementEmail: mockSendAnnouncementEmail
}));

vi.mock('../../worker/src/github.js', () => ({
  triggerSiteRebuild: vi.fn(async () => {})
}));

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
    PLEDGES: new PaginatedKVNamespace(2),
    RATELIMIT: new PaginatedKVNamespace(50),
    ...overrides
  };
}

let worker: {
  fetch: (request: Request, env: Record<string, unknown>, ctx: { waitUntil: (promise: Promise<unknown>) => void }) => Promise<Response>;
  scheduled: (controller: unknown, env: Record<string, unknown>, ctx: { waitUntil: (promise: Promise<unknown>) => void }) => Promise<void>;
};

beforeAll(async () => {
  ({ default: worker } = await import('../../worker/src/index.js'));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockStripeClient.customers.create.mockImplementation(async ({ email }: { email: string }) => ({ id: `cus_${email}` }));
  mockStripeClient.paymentMethods.attach.mockResolvedValue({});
  mockStripeClient.paymentIntents.create.mockResolvedValue({ id: 'pi_test', status: 'succeeded' });

  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url === 'https://pool.test/api/campaigns.json') {
      return jsonResponse({ campaigns: [campaignFixture] });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
});

describe('worker operational integrity', () => {
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
    const env = createEnv();
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
          Authorization: 'Bearer admin-secret',
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
    expect(body).toContain('$12,500');
    expect(body).toContain('50% funded');
    expect(body).toContain('https://pool.test');
  });

  it('localizes the campaign share-card footer link for non-default languages', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/share/campaign/hand-relations.svg?lang=es'),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('https://pool.test/es/campaigns/hand-relations/');
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
