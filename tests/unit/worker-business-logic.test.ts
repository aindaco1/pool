import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { hashCheckoutContribution, hashCheckoutBundle, buildCheckoutHashInput, buildCheckoutBundleHashInput } from '../../worker/src/checkout-intent.js';

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
  }
};

const mockVerifyStripeSignature = vi.fn(async () => ({ valid: true }));
const mockVerifyToken = vi.fn(async () => null);
const mockSendSupporterEmail = vi.fn(async () => {});
const mockSendPaymentFailedEmail = vi.fn(async () => {});
const mockSendPledgeModifiedEmail = vi.fn(async () => {});
const mockSendPledgeCancelledEmail = vi.fn(async () => {});
const mockSendDiaryUpdateEmail = vi.fn(async () => {});
const mockSendMilestoneEmail = vi.fn(async () => {});
const mockSendChargeSuccessEmail = vi.fn(async () => {});
const mockSendAnnouncementEmail = vi.fn(async () => {});

vi.mock('../../worker/src/stripe.js', () => ({
  verifyStripeSignature: mockVerifyStripeSignature,
  createStripeClient: vi.fn(() => mockStripeClient)
}));

vi.mock('../../worker/src/token.js', () => ({
  generateToken: vi.fn(async () => 'token'),
  verifyToken: mockVerifyToken
}));

vi.mock('../../worker/src/email.js', () => ({
  sendSupporterEmail: mockSendSupporterEmail,
  sendPaymentFailedEmail: mockSendPaymentFailedEmail,
  sendPledgeModifiedEmail: mockSendPledgeModifiedEmail,
  sendPledgeCancelledEmail: mockSendPledgeCancelledEmail,
  sendDiaryUpdateEmail: mockSendDiaryUpdateEmail,
  sendMilestoneEmail: mockSendMilestoneEmail,
  sendChargeSuccessEmail: mockSendChargeSuccessEmail,
  sendAnnouncementEmail: mockSendAnnouncementEmail
}));

vi.mock('../../worker/src/github.js', () => ({
  triggerSiteRebuild: vi.fn(async () => {})
}));

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

  async delete(key: string) {
    this.store.delete(key);
  }

  async list({ prefix = '', cursor }: { prefix?: string; cursor?: string } = {}) {
    if (cursor) {
      return { keys: [], list_complete: true, cursor: undefined };
    }
    return {
      keys: Array.from(this.store.keys())
        .filter(key => key.startsWith(prefix))
        .map(name => ({ name }))
      ,
      list_complete: true,
      cursor: undefined
    };
  }
}

class MockCheckoutIntentNamespace {
  calls: Array<{ url: string; body: Record<string, unknown> }> = [];

  idFromName(name: string) {
    return { name };
  }

  get(_id: { name: string }) {
    return {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        this.calls.push({ url, body });
        return jsonResponse({ ok: true, status: 'consumed_implicit' });
      }
    };
  }
}

const campaignFixture = {
  slug: 'hand-relations',
  title: 'Hand Relations',
  state: 'live',
  goal_amount: 25000,
  pledged_amount: 0,
  goal_deadline: '2026-12-31',
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
    },
    {
      id: 'vip-pass',
      name: 'VIP Pass',
      price: 100,
      limit_total: 1,
      remaining: 1,
      sold_out: false,
      stackable: false,
      category: 'digital'
    },
    {
      id: 'creature-cameo',
      name: 'Creature Cameo',
      price: 250,
      limit_total: 1,
      remaining: 1,
      sold_out: false,
      stackable: false,
      category: 'digital',
      requires_threshold: 50000
    }
  ],
  support_items: [
    {
      id: 'location-scouting',
      label: 'Location Scouting',
      need: 'travel + permits',
      target: 1000,
      current: 0,
      late_support: true
    }
  ],
  has_decisions: false,
  instagram: null,
  diary: []
};

const singleTierCampaignFixture = {
  slug: 'sunder',
  title: 'Sunder',
  state: 'live',
  goal_amount: 5000,
  pledged_amount: 0,
  goal_deadline: '2026-12-31',
  start_date: '2026-01-01',
  charged: false,
  single_tier_only: true,
  custom_late_support: true,
  tiers: [
    {
      id: 'poster',
      name: 'Poster',
      price: 20,
      limit_total: null,
      remaining: 999,
      sold_out: false,
      stackable: false,
      category: 'digital'
    },
    {
      id: 'blu-ray',
      name: 'Blu-ray',
      price: 35,
      limit_total: null,
      remaining: 999,
      sold_out: false,
      stackable: false,
      category: 'physical'
    }
  ],
  support_items: [],
  has_decisions: false,
  instagram: null,
  diary: []
};

const smokeEditableCampaignFixture = {
  slug: 'smoke-editable',
  title: 'SMOKE EDITABLE',
  state: 'live',
  goal_amount: 10000,
  pledged_amount: 0,
  goal_deadline: '2028-12-31',
  start_date: '2026-01-01',
  charged: false,
  single_tier_only: false,
  custom_late_support: true,
  tiers: [
    {
      id: 'standard-pass',
      name: 'Standard Pass',
      price: 10,
      limit_total: null,
      remaining: 999,
      sold_out: false,
      stackable: true,
      category: 'digital'
    }
  ],
  support_items: [],
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
    APP_MODE: 'test',
    STRIPE_SECRET_KEY_TEST: 'sk_test_123',
    STRIPE_WEBHOOK_SECRET_TEST: 'whsec_test_123',
    MAGIC_LINK_SECRET: 'secret',
    PLEDGES: new MockKVNamespace(),
    ...overrides
  };
}

let worker: { fetch: (request: Request, env: Record<string, unknown>, ctx: { waitUntil: (promise: Promise<unknown>) => void }) => Promise<Response> };

beforeAll(async () => {
  ({ default: worker } = await import('../../worker/src/index.js'));
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', webcrypto);
  mockStripeClient.checkout.sessions.create.mockResolvedValue({ url: 'https://stripe.test/checkout' });
  mockStripeClient.setupIntents.retrieve.mockResolvedValue({ payment_method: 'pm_123', customer: 'cus_123' });
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url === 'https://pool.test/api/campaigns.json') {
      return jsonResponse({ campaigns: [campaignFixture, singleTierCampaignFixture, smokeEditableCampaignFixture] });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
});

describe('Worker business logic hardening', () => {
  it('fails closed on first-party checkout start when the intent secret is missing', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          items: [{ id: 'hand-relations__frame-slot', quantity: 1 }],
          email: 'buyer@example.com',
          tipPercent: 5
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(503);
    expect(mockStripeClient.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('creates a first-party checkout session only when the provider flag is enabled', async () => {
    const checkoutIntents = new MockCheckoutIntentNamespace();
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      CHECKOUT_INTENT_SECRET: 'checkout_secret_123',
      CHECKOUT_INTENTS: checkoutIntents
    });

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          items: [
            { id: 'hand-relations__frame-slot', quantity: 1 },
            { id: 'hand-relations__support__location-scouting', amount: 10 },
            { id: 'hand-relations__custom-support', amount: 5 }
          ],
          customAmount: 0,
          email: 'buyer@example.com',
          tipPercent: 5
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    expect(checkoutIntents.calls).toHaveLength(1);

    const sessionPayload = mockStripeClient.checkout.sessions.create.mock.calls.at(-1)?.[0];
    expect(sessionPayload.customer_email).toBe('buyer@example.com');
    expect(sessionPayload.metadata.checkoutProvider).toBe('first_party');
    expect(sessionPayload.metadata.checkoutNonce).toBeTruthy();
    expect(sessionPayload.metadata.checkoutCartHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sessionPayload.metadata.checkoutSnapshotVersion).toBe('1');
    expect(sessionPayload.metadata.amountCents).toBe('2000');
    expect(sessionPayload.metadata.hasExtras).toBe('true');
    expect(sessionPayload.metadata.orderId).toMatch(/^pool-intent-/);

    const kv = env.PLEDGES as MockKVNamespace;
    expect(await kv.get(sessionPayload.metadata.orderId ? `pending-checkout:${sessionPayload.metadata.orderId}` : '', { type: 'json' })).toMatchObject({
      campaignCount: 1,
      campaigns: [
        expect.objectContaining({
          campaignSlug: 'hand-relations',
          supportItems: [{ id: 'location-scouting', amount: 10 }],
          customAmount: 5
        })
      ]
    });
  });

  it('creates a bundled first-party checkout session for mixed-campaign carts', async () => {
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      CHECKOUT_INTENT_SECRET: 'checkout_secret_123',
      CHECKOUT_INTENTS: new MockCheckoutIntentNamespace()
    });

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'sunder',
          items: [
            { id: 'sunder__poster', quantity: 1 },
            { id: 'smoke-editable__standard-pass', quantity: 1 }
          ],
          tipPercent: 5
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);

    const sessionPayload = mockStripeClient.checkout.sessions.create.mock.calls.at(-1)?.[0];
    expect(sessionPayload.metadata.checkoutBundleMode).toBe('true');
    expect(sessionPayload.metadata.checkoutBundleCount).toBe('2');
    expect(sessionPayload.metadata.orderId).toMatch(/^pool-intent-/);

    const kv = env.PLEDGES as MockKVNamespace;
    expect(await kv.get(sessionPayload.metadata.orderId ? `pending-checkout:${sessionPayload.metadata.orderId}` : '', { type: 'json' })).toMatchObject({
      campaignCount: 2,
      campaigns: [
        expect.objectContaining({ campaignSlug: 'smoke-editable' }),
        expect.objectContaining({ campaignSlug: 'sunder' })
      ]
    });
  });

  it('keeps the first-party checkout summary route dark by default', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/summary?orderId=pool-intent-abc123', {
        method: 'GET'
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(404);
  });

  it('returns a minimal first-party pledge confirmation summary when enabled', async () => {
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party'
    });
    const kv = env.PLEDGES as MockKVNamespace;

    await kv.put('pledge:pool-intent-abc123', JSON.stringify({
      orderId: 'pool-intent-abc123',
      email: 'supporter@example.com',
      campaignSlug: 'hand-relations',
      pledgeStatus: 'active',
      createdAt: '2026-04-01T12:34:56.000Z',
      subtotal: 10000,
      tax: 788,
      shipping: 500,
      tipAmount: 500,
      amount: 11788,
      shippingAddress: {
        name: 'Supporter Name',
        address1: '123 Test St',
        city: 'Albuquerque',
        postalCode: '87101',
        country: 'US'
      }
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/summary?orderId=pool-intent-abc123', {
        method: 'GET'
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      orderId: 'pool-intent-abc123',
      campaignSlug: 'hand-relations',
      campaignTitle: 'Hand Relations',
      pledgeStatus: 'active',
      createdAt: '2026-04-01T12:34:56.000Z',
      shippingCollected: true,
      totals: {
        subtotal: 10000,
        tax: 788,
        shipping: 500,
        tipAmount: 500,
        amount: 11788
      }
    });
  });

  it('returns a bundled first-party pledge confirmation summary when enabled', async () => {
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party'
    });
    const kv = env.PLEDGES as MockKVNamespace;

    await kv.put('pending-checkout:pool-intent-bundle-1', JSON.stringify({
      orderId: 'pool-intent-bundle-1',
      campaignCount: 2,
      totals: {
        subtotal: 3000,
        tax: 236,
        shipping: 300,
        tipAmount: 150,
        amount: 3686
      },
      campaigns: [
        {
          orderId: 'pool-intent-bundle-1-smoke-editable',
          campaignSlug: 'smoke-editable',
          hasPhysical: false
        },
        {
          orderId: 'pool-intent-bundle-1-hand-relations',
          campaignSlug: 'hand-relations',
          hasPhysical: true
        }
      ]
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/summary?orderId=pool-intent-bundle-1', {
        method: 'GET'
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      orderId: 'pool-intent-bundle-1',
      campaignSlug: 'smoke-editable',
      campaignTitle: null,
      campaignTitles: ['SMOKE EDITABLE', 'Hand Relations'],
      pledgeStatus: 'active',
      createdAt: null,
      shippingCollected: true,
      totals: {
        subtotal: 3000,
        tax: 236,
        shipping: 300,
        tipAmount: 150,
        amount: 3686
      }
    });
  });

  it('returns first-party recovery campaign status when enabled', async () => {
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party'
    });

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/recovery?campaignSlug=hand-relations', {
        method: 'GET'
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      campaignSlug: 'hand-relations',
      campaignTitle: 'Hand Relations',
      effectiveState: 'live',
      acceptingPledges: true,
      statusMessage: 'Hand Relations is still accepting pledges.'
    });
  });

  it('derives support-item deltas from stored pledge state during modify', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as MockKVNamespace;

    await kv.put('pledge:order-modify-1', JSON.stringify({
      orderId: 'order-modify-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      tierId: 'frame-slot',
      tierName: 'Buy 1 Frame',
      tierQty: 1,
      subtotal: 3000,
      tax: 236,
      shipping: 0,
      tipPercent: 0,
      tipAmount: 0,
      amount: 3236,
      supportItems: [{ id: 'location-scouting', amount: 25 }],
      pledgeStatus: 'active',
      charged: false,
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:00:00.000Z',
      history: []
    }));
    await kv.put('stats:hand-relations', JSON.stringify({
      campaignSlug: 'hand-relations',
      pledgedAmount: 3000,
      pledgeCount: 1,
      tierCounts: { 'frame-slot': 1 },
      supportItems: { 'location-scouting': 2500 },
      updatedAt: '2026-03-30T00:00:00.000Z'
    }));

    mockVerifyToken.mockResolvedValue({
      orderId: 'order-modify-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations'
    });

    const response = await worker.fetch(
      new Request('https://pool.test/pledge/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'valid-token',
          supportItems: [
            {
              id: 'location-scouting',
              amount: 1,
              currentAmount: 9999
            }
          ]
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);

    const updatedPledge = await kv.get('pledge:order-modify-1', { type: 'json' });
    expect(updatedPledge.subtotal).toBe(600);
    expect(updatedPledge.supportItems).toEqual([{ id: 'location-scouting', amount: 1 }]);

    const updatedStats = await kv.get('stats:hand-relations', { type: 'json' });
    expect(updatedStats.pledgedAmount).toBe(600);
    expect(updatedStats.supportItems['location-scouting']).toBe(100);
  });

  it('reconciles campaign stats after consecutive tip and tier modifications', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as MockKVNamespace;

    await kv.put('pledge:order-modify-sequence-1', JSON.stringify({
      orderId: 'order-modify-sequence-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      tierId: 'frame-slot',
      tierName: 'Buy 1 Frame',
      tierQty: 1,
      subtotal: 500,
      tax: 39,
      shipping: 0,
      tipPercent: 5,
      tipAmount: 25,
      amount: 564,
      pledgeStatus: 'active',
      charged: false,
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:00:00.000Z',
      history: [{
        type: 'created',
        tierId: 'frame-slot',
        tierQty: 1,
        subtotal: 500,
        tax: 39,
        shipping: 0,
        tipPercent: 5,
        tipAmount: 25,
        amount: 564,
        at: '2026-03-30T00:00:00.000Z'
      }]
    }));
    await kv.put('stats:hand-relations', JSON.stringify({
      campaignSlug: 'hand-relations',
      pledgedAmount: 500,
      pledgeCount: 1,
      tierCounts: { 'frame-slot': 1 },
      supportItems: {},
      updatedAt: '2026-03-30T00:00:00.000Z'
    }));

    mockVerifyToken.mockResolvedValue({
      orderId: 'order-modify-sequence-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations'
    });

    const tipResponse = await worker.fetch(
      new Request('https://pool.test/pledge/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'valid-token',
          tipPercent: 9
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(tipResponse.status).toBe(200);
    expect(await kv.get('stats:hand-relations', { type: 'json' })).toMatchObject({
      pledgedAmount: 500,
      pledgeCount: 1,
      tierCounts: { 'frame-slot': 1 }
    });

    const tierResponse = await worker.fetch(
      new Request('https://pool.test/pledge/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'valid-token',
          tipPercent: 9,
          newTierId: 'vip-pass',
          newTierQty: 1
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(tierResponse.status).toBe(200);

    const updatedStats = await kv.get('stats:hand-relations', { type: 'json' });
    expect(updatedStats).toMatchObject({
      pledgedAmount: 10000,
      pledgeCount: 1,
      tierCounts: {
        'vip-pass': 1
      }
    });
  });

  it('refuses to persist oversold limited tiers during webhook processing', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as MockKVNamespace;

    await kv.put('tier-inventory:hand-relations', JSON.stringify({
      'vip-pass': {
        limit: 1,
        claimed: 1
      }
    }));

    const webhookEvent = {
      id: 'evt_checkout_complete',
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          mode: 'setup',
          customer_email: 'buyer@example.com',
          customer: 'cus_123',
          setup_intent: 'seti_123',
          metadata: {
            orderId: 'order-webhook-1',
            campaignSlug: 'hand-relations',
            amountCents: '10000',
            tierId: 'vip-pass',
            tierName: 'VIP Pass',
            tierQty: '1',
            tipPercent: '0',
            hasAdditionalTiers: '',
            hasExtras: '',
            hasPhysical: '',
            isPaymentUpdate: ''
          }
        }
      }
    };

    const response = await worker.fetch(
      new Request('https://pool.test/webhooks/stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': 'sig_test'
        },
        body: JSON.stringify(webhookEvent)
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(409);
    expect(await kv.get('pledge:order-webhook-1', { type: 'json' })).toBeNull();
  });


  it('scopes /pledges to the token order instead of enumerating every pledge for the email', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as MockKVNamespace;

    await kv.put('pledge:order-scope-1', JSON.stringify({
      orderId: 'order-scope-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      tierId: 'frame-slot',
      tierName: 'Buy 1 Frame',
      tierQty: 1,
      subtotal: 500,
      tax: 39,
      shipping: 0,
      tipPercent: 0,
      tipAmount: 0,
      amount: 539,
      pledgeStatus: 'active',
      charged: false
    }));
    await kv.put('pledge:order-scope-2', JSON.stringify({
      orderId: 'order-scope-2',
      email: 'buyer@example.com',
      campaignSlug: 'sunder',
      tierId: 'poster',
      tierName: 'Poster',
      tierQty: 1,
      subtotal: 2000,
      tax: 158,
      shipping: 0,
      tipPercent: 0,
      tipAmount: 0,
      amount: 2158,
      pledgeStatus: 'active',
      charged: false
    }));
    await kv.put('email:buyer@example.com', JSON.stringify(['order-scope-1', 'order-scope-2']));

    mockVerifyToken.mockResolvedValue({
      orderId: 'order-scope-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations'
    });

    const response = await worker.fetch(
      new Request('https://pool.test/pledges?token=valid-token'),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    const pledges = await response.json();
    expect(pledges).toHaveLength(1);
    expect(pledges[0].orderId).toBe('order-scope-1');
  });

  it('returns not found when a valid magic link points to a missing pledge record', async () => {
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party'
    });

    mockVerifyToken.mockResolvedValue({
      orderId: 'order-first-party-fallback-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations'
    });

    const response = await worker.fetch(
      new Request('https://pool.test/pledge?token=valid-token'),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(404);

    const payload = await response.json();
    expect(payload).toEqual({ error: 'Pledge not found' });
  });

  it('rejects cross-order modify attempts with a token from another pledge', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as MockKVNamespace;

    await kv.put('pledge:order-token-1', JSON.stringify({
      orderId: 'order-token-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      tierId: 'frame-slot',
      tierName: 'Buy 1 Frame',
      tierQty: 1,
      subtotal: 500,
      tax: 39,
      shipping: 0,
      tipPercent: 0,
      tipAmount: 0,
      amount: 539,
      pledgeStatus: 'active',
      charged: false
    }));
    await kv.put('pledge:order-token-2', JSON.stringify({
      orderId: 'order-token-2',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      tierId: 'vip-pass',
      tierName: 'VIP Pass',
      tierQty: 1,
      subtotal: 10000,
      tax: 788,
      shipping: 0,
      tipPercent: 0,
      tipAmount: 0,
      amount: 10788,
      pledgeStatus: 'active',
      charged: false
    }));

    mockVerifyToken.mockResolvedValue({
      orderId: 'order-token-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations'
    });

    const response = await worker.fetch(
      new Request('https://pool.test/pledge/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'valid-token',
          orderId: 'order-token-2',
          newTierId: 'frame-slot',
          newTierQty: 1
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(403);
  });

  it('modifies pledges without any legacy order sync dependency', async () => {
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party'
    });
    const kv = env.PLEDGES as MockKVNamespace;

    await kv.put('pledge:order-first-party-modify-1', JSON.stringify({
      orderId: 'order-first-party-modify-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      stripeCustomerId: 'cus_existing',
      tierId: 'frame-slot',
      tierName: 'Buy 1 Frame',
      tierQty: 1,
      subtotal: 500,
      tax: 39,
      shipping: 0,
      tipPercent: 0,
      tipAmount: 0,
      amount: 539,
      pledgeStatus: 'active',
      charged: false,
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:00:00.000Z',
      history: []
    }));
    await kv.put('stats:hand-relations', JSON.stringify({
      campaignSlug: 'hand-relations',
      pledgedAmount: 500,
      pledgeCount: 1,
      tierCounts: { 'frame-slot': 1 },
      supportItems: {},
      updatedAt: '2026-03-30T00:00:00.000Z'
    }));

    mockVerifyToken.mockResolvedValue({
      orderId: 'order-first-party-modify-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations'
    });

    const response = await worker.fetch(
      new Request('https://pool.test/pledge/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'valid-token',
          supportItems: [
            {
              id: 'location-scouting',
              amount: 1
            }
          ]
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
  });

  it('does not mark webhook events processed before a failed pledge persistence can retry', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as MockKVNamespace;
    const originalPut = kv.put.bind(kv);
    let shouldFailPledgeWrite = true;

    kv.put = vi.fn(async (key: string, value: string) => {
      if (key === 'pledge:order-webhook-retry-1' && shouldFailPledgeWrite) {
        shouldFailPledgeWrite = false;
        throw new Error('transient kv failure');
      }
      return originalPut(key, value);
    }) as typeof kv.put;

    await kv.put('pending-tiers:order-webhook-retry-1', JSON.stringify([{ id: 'vip-pass', qty: 1 }]));
    await kv.put('pending-extras:order-webhook-retry-1', JSON.stringify({
      supportItems: [{ id: 'location-scouting', amount: 10 }],
      customAmount: 5
    }));
    await kv.put('tier-reservation:hand-relations:order-webhook-retry-1', JSON.stringify([{ id: 'vip-pass', qty: 1 }]));

    const webhookEvent = {
      id: 'evt_retryable_checkout',
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          mode: 'setup',
          customer_email: 'buyer@example.com',
          customer: 'cus_123',
          setup_intent: 'seti_123',
          metadata: {
            orderId: 'order-webhook-retry-1',
            campaignSlug: 'hand-relations',
            amountCents: '12000',
            tierId: 'frame-slot',
            tierName: 'Buy 1 Frame',
            tierQty: '1',
            tipPercent: '5',
            hasAdditionalTiers: 'true',
            hasExtras: 'true',
            hasPhysical: '',
            isPaymentUpdate: ''
          }
        }
      }
    };

    const firstResponse = await worker.fetch(
      new Request('https://pool.test/webhooks/stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': 'sig_test'
        },
        body: JSON.stringify(webhookEvent)
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(firstResponse.status).toBe(409);
    expect(await kv.get('stripe-event:evt_retryable_checkout')).toBeNull();
    expect(await kv.get('pending-tiers:order-webhook-retry-1', { type: 'json' })).toEqual([{ id: 'vip-pass', qty: 1 }]);
    expect(await kv.get('pending-extras:order-webhook-retry-1', { type: 'json' })).toEqual({
      supportItems: [{ id: 'location-scouting', amount: 10 }],
      customAmount: 5
    });

    const secondResponse = await worker.fetch(
      new Request('https://pool.test/webhooks/stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': 'sig_test'
        },
        body: JSON.stringify(webhookEvent)
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(secondResponse.status).toBe(200);
    expect(await kv.get('stripe-event:evt_retryable_checkout')).toBe('processed');
    expect(await kv.get('pledge:order-webhook-retry-1', { type: 'json' })).toMatchObject({
      orderId: 'order-webhook-retry-1',
      tierId: 'frame-slot',
      additionalTiers: [{ id: 'vip-pass', qty: 1 }],
      supportItems: [{ id: 'location-scouting', amount: 10 }],
      customAmount: 5
    });
    expect(await kv.get('pending-tiers:order-webhook-retry-1')).toBeNull();
    expect(await kv.get('pending-extras:order-webhook-retry-1')).toBeNull();
  });

  it('skips duplicate webhook deliveries after successful persistence without duplicating side effects', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as MockKVNamespace;

    await kv.put('pending-tiers:order-webhook-duplicate-1', JSON.stringify([{ id: 'vip-pass', qty: 1 }]));
    await kv.put('pending-extras:order-webhook-duplicate-1', JSON.stringify({
      supportItems: [{ id: 'location-scouting', amount: 10 }],
      customAmount: 5
    }));
    await kv.put('tier-reservation:hand-relations:order-webhook-duplicate-1', JSON.stringify([{ id: 'vip-pass', qty: 1 }]));

    const webhookEvent = {
      id: 'evt_duplicate_checkout_success',
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          mode: 'setup',
          customer_email: 'buyer@example.com',
          customer: 'cus_123',
          setup_intent: 'seti_123',
          metadata: {
            orderId: 'order-webhook-duplicate-1',
            campaignSlug: 'hand-relations',
            amountCents: '12000',
            tierId: 'frame-slot',
            tierName: 'Buy 1 Frame',
            tierQty: '1',
            tipPercent: '5',
            hasAdditionalTiers: 'true',
            hasExtras: 'true',
            hasPhysical: '',
            isPaymentUpdate: ''
          }
        }
      }
    };

    const firstResponse = await worker.fetch(
      new Request('https://pool.test/webhooks/stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': 'sig_test'
        },
        body: JSON.stringify(webhookEvent)
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(firstResponse.status).toBe(200);
    expect(await kv.get('stripe-event:evt_duplicate_checkout_success')).toBe('processed');
    expect(mockSendSupporterEmail).toHaveBeenCalledTimes(1);

    const firstStoredStats = await kv.get('stats:hand-relations', { type: 'json' });
    expect(firstStoredStats).toMatchObject({
      pledgeCount: 1,
      pledgedAmount: 12000
    });

    const secondResponse = await worker.fetch(
      new Request('https://pool.test/webhooks/stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': 'sig_test'
        },
        body: JSON.stringify(webhookEvent)
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(secondResponse.status).toBe(200);
    expect(mockSendSupporterEmail).toHaveBeenCalledTimes(1);
    expect(await kv.get('pending-tiers:order-webhook-duplicate-1')).toBeNull();
    expect(await kv.get('pending-extras:order-webhook-duplicate-1')).toBeNull();

    const secondStoredStats = await kv.get('stats:hand-relations', { type: 'json' });
    expect(secondStoredStats).toEqual(firstStoredStats);
    expect(await kv.get('pledge:order-webhook-duplicate-1', { type: 'json' })).toMatchObject({
      orderId: 'order-webhook-duplicate-1',
      tierId: 'frame-slot',
      additionalTiers: [{ id: 'vip-pass', qty: 1 }],
      supportItems: [{ id: 'location-scouting', amount: 10 }],
      customAmount: 5
    });
  });

  it('persists first-party checkout sessions only when webhook cart integrity matches', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as MockKVNamespace;

    await kv.put('pending-tiers:order-first-party-good-1', JSON.stringify([{ id: 'vip-pass', qty: 1 }]));
    await kv.put('pending-extras:order-first-party-good-1', JSON.stringify({
      supportItems: [{ id: 'location-scouting', amount: 10 }],
      customAmount: 5
    }));
    await kv.put('tier-reservation:hand-relations:order-first-party-good-1', JSON.stringify([{ id: 'vip-pass', qty: 1 }]));

    const checkoutCartHash = await hashCheckoutContribution(buildCheckoutHashInput({
      campaignSlug: 'hand-relations',
      canonicalContribution: {
        selectedTiers: [
          { id: 'frame-slot', qty: 1 },
          { id: 'vip-pass', qty: 1 }
        ],
        supportItems: [{ id: 'location-scouting', amount: 10 }],
        customAmount: 5,
        hasPhysical: false,
        totals: {
          subtotal: 12000,
          shipping: 0,
          tax: 945,
          amount: 13545
        }
      },
      tipPercent: 5
    }));

    const webhookEvent = {
      id: 'evt_first_party_checkout_success',
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          mode: 'setup',
          customer_email: 'buyer@example.com',
          customer: 'cus_123',
          setup_intent: 'seti_123',
          metadata: {
            orderId: 'order-first-party-good-1',
            campaignSlug: 'hand-relations',
            amountCents: '12000',
            tierId: 'frame-slot',
            tierName: 'Buy 1 Frame',
            tierQty: '1',
            tipPercent: '5',
            hasAdditionalTiers: 'true',
            hasExtras: 'true',
            hasPhysical: '',
            isPaymentUpdate: '',
            checkoutProvider: 'first_party',
            checkoutNonce: 'nonce-first-party-good',
            checkoutCartHash,
            checkoutSnapshotVersion: '1'
          }
        }
      }
    };

    const response = await worker.fetch(
      new Request('https://pool.test/webhooks/stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': 'sig_test'
        },
        body: JSON.stringify(webhookEvent)
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    expect(await kv.get('pledge:order-first-party-good-1', { type: 'json' })).toMatchObject({
      orderId: 'order-first-party-good-1',
      tierId: 'frame-slot',
      additionalTiers: [{ id: 'vip-pass', qty: 1 }],
      supportItems: [{ id: 'location-scouting', amount: 10 }],
      customAmount: 5
    });
  });

  it('fans out bundled first-party checkout sessions into one pledge per campaign', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as MockKVNamespace;

    await kv.put('pending-checkout:pool-intent-bundle-good-1', JSON.stringify({
      orderId: 'pool-intent-bundle-good-1',
      campaignCount: 2,
      totals: {
        subtotal: 1500,
        tax: 118,
        shipping: 0,
        tipAmount: 75,
        amount: 1693
      },
      campaigns: [
        {
          orderId: 'pool-intent-bundle-good-1-smoke-editable',
          campaignSlug: 'smoke-editable',
          tierId: 'standard-pass',
          tierName: 'Standard Pass',
          tierQty: 1,
          additionalTiers: [],
          supportItems: [],
          customAmount: 0,
          hasPhysical: false,
          totals: {
            subtotal: 1000,
            tax: 79,
            shipping: 0,
            tipAmount: 50,
            amount: 1129
          }
        },
        {
          orderId: 'pool-intent-bundle-good-1-hand-relations',
          campaignSlug: 'hand-relations',
          tierId: 'frame-slot',
          tierName: 'Buy 1 Frame',
          tierQty: 1,
          additionalTiers: [],
          supportItems: [],
          customAmount: 0,
          hasPhysical: false,
          totals: {
            subtotal: 500,
            tax: 39,
            shipping: 0,
            tipAmount: 25,
            amount: 564
          }
        }
      ]
    }));

    const checkoutCartHash = await hashCheckoutBundle(buildCheckoutBundleHashInput({
      contributions: [
        {
          campaignSlug: 'smoke-editable',
          canonicalContribution: {
            selectedTiers: [{ id: 'standard-pass', qty: 1 }],
            supportItems: [],
            customAmount: 0,
            hasPhysical: false,
            totals: {
              subtotal: 1000,
              shipping: 0,
              tax: 79,
              amount: 1129
            }
          },
          tipPercent: 5
        },
        {
          campaignSlug: 'hand-relations',
          canonicalContribution: {
            selectedTiers: [{ id: 'frame-slot', qty: 1 }],
            supportItems: [],
            customAmount: 0,
            hasPhysical: false,
            totals: {
              subtotal: 500,
              shipping: 0,
              tax: 39,
              amount: 564
            }
          },
          tipPercent: 5
        }
      ]
    }));

    const webhookEvent = {
      id: 'evt_first_party_bundle_success',
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          mode: 'setup',
          customer_email: 'buyer@example.com',
          customer: 'cus_123',
          setup_intent: 'seti_123',
          metadata: {
            orderId: 'pool-intent-bundle-good-1',
            campaignSlug: 'smoke-editable',
            amountCents: '3000',
            tierId: '',
            tierName: '',
            tierQty: '0',
            tipPercent: '5',
            hasAdditionalTiers: '',
            hasExtras: '',
            hasPhysical: '',
            isPaymentUpdate: '',
            checkoutProvider: 'first_party',
            checkoutBundleMode: 'true',
            checkoutBundleCount: '2',
            checkoutNonce: 'nonce-bundle-good',
            checkoutCartHash,
            checkoutSnapshotVersion: '1'
          }
        }
      }
    };

    const response = await worker.fetch(
      new Request('https://pool.test/webhooks/stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': 'sig_test'
        },
        body: JSON.stringify(webhookEvent)
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    expect(await kv.get('pledge:pool-intent-bundle-good-1-smoke-editable', { type: 'json' })).toMatchObject({
      orderId: 'pool-intent-bundle-good-1-smoke-editable',
      campaignSlug: 'smoke-editable',
      tierId: 'standard-pass'
    });
    expect(await kv.get('pledge:pool-intent-bundle-good-1-hand-relations', { type: 'json' })).toMatchObject({
      orderId: 'pool-intent-bundle-good-1-hand-relations',
      campaignSlug: 'hand-relations',
      tierId: 'frame-slot'
    });
    expect(mockSendSupporterEmail).toHaveBeenCalledTimes(2);
    expect(mockSendSupporterEmail.mock.calls.map(([, payload]) => payload)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        email: 'buyer@example.com',
        campaignSlug: 'smoke-editable',
        campaignTitle: 'SMOKE EDITABLE',
        subtotal: 1000,
        tax: 79,
        shipping: 0,
        tipAmount: 50,
        tipPercent: 5
      }),
      expect.objectContaining({
        email: 'buyer@example.com',
        campaignSlug: 'hand-relations',
        campaignTitle: 'Hand Relations',
        subtotal: 500,
        tax: 39,
        shipping: 0,
        tipAmount: 25,
        tipPercent: 5
      })
    ]));
    expect(await kv.get('pending-checkout:pool-intent-bundle-good-1', { type: 'json' })).toMatchObject({
      confirmedCampaigns: [
        expect.objectContaining({ orderId: 'pool-intent-bundle-good-1-smoke-editable', campaignSlug: 'smoke-editable' }),
        expect.objectContaining({ orderId: 'pool-intent-bundle-good-1-hand-relations', campaignSlug: 'hand-relations' })
      ]
    });
  });

  it('rejects first-party webhook persistence when the cart hash does not match', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as MockKVNamespace;

    await kv.put('pending-tiers:order-first-party-bad-1', JSON.stringify([{ id: 'vip-pass', qty: 1 }]));
    await kv.put('pending-extras:order-first-party-bad-1', JSON.stringify({
      supportItems: [{ id: 'location-scouting', amount: 10 }],
      customAmount: 5
    }));
    await kv.put('tier-reservation:hand-relations:order-first-party-bad-1', JSON.stringify([{ id: 'vip-pass', qty: 1 }]));

    const webhookEvent = {
      id: 'evt_first_party_checkout_bad_hash',
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          mode: 'setup',
          customer_email: 'buyer@example.com',
          customer: 'cus_123',
          setup_intent: 'seti_123',
          metadata: {
            orderId: 'order-first-party-bad-1',
            campaignSlug: 'hand-relations',
            amountCents: '12000',
            tierId: 'frame-slot',
            tierName: 'Buy 1 Frame',
            tierQty: '1',
            tipPercent: '5',
            hasAdditionalTiers: 'true',
            hasExtras: 'true',
            hasPhysical: '',
            isPaymentUpdate: '',
            checkoutProvider: 'first_party',
            checkoutNonce: 'nonce-first-party-bad',
            checkoutCartHash: 'deadbeef',
            checkoutSnapshotVersion: '1'
          }
        }
      }
    };

    const response = await worker.fetch(
      new Request('https://pool.test/webhooks/stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': 'sig_test'
        },
        body: JSON.stringify(webhookEvent)
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(409);
    expect(await kv.get('pledge:order-first-party-bad-1')).toBeNull();
    expect(await kv.get('stripe-event:evt_first_party_checkout_bad_hash')).toBeNull();
    expect(await kv.get('pending-tiers:order-first-party-bad-1', { type: 'json' })).toEqual([{ id: 'vip-pass', qty: 1 }]);
    expect(await kv.get('pending-extras:order-first-party-bad-1', { type: 'json' })).toEqual({
      supportItems: [{ id: 'location-scouting', amount: 10 }],
      customAmount: 5
    });
  });

  it('disables the legacy /checkout flow', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/checkout?publicToken=public_123'),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(404);
  });
});
