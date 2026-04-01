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
  }
};

const mockSnipcartClient = {
  orders: {
    get: vi.fn()
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

vi.mock('../../worker/src/snipcart.js', () => ({
  createSnipcartClient: vi.fn(() => mockSnipcartClient),
  extractPledgeFromOrder: vi.fn(order => order?.pledge || null),
  extractCartFromSnipcartItems: vi.fn(items => {
    const tierSelections = [];
    const supportItems = [];
    let customAmount = 0;

    for (const item of items || []) {
      const itemId = typeof item?.id === 'string' ? item.id : '';
      const quantity = Number(item?.quantity || 1);

      if (itemId.includes('__support__')) {
        supportItems.push({
          id: itemId.split('__support__')[1],
          amount: Math.round(Number(item?.price || 0) * quantity)
        });
        continue;
      }

      if (itemId.includes('__custom-support')) {
        customAmount += Math.round(Number(item?.price || 0) * quantity);
        continue;
      }

      if (!itemId.includes('__')) continue;

      const tierId = itemId.split('__')[1];
      const existing = tierSelections.find(entry => entry.id === tierId);
      if (existing) {
        existing.qty += quantity;
      } else {
        tierSelections.push({ id: tierId, qty: quantity });
      }
    }

    return { tierSelections, supportItems, customAmount };
  }),
  canCancelOrder: vi.fn(() => ({ allowed: true })),
  canModifyOrder: vi.fn(() => ({ allowed: true }))
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

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function buildPaymentSession(items: Array<Record<string, unknown>>, overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id || 'session_default',
    invoice: {
      amount: overrides.amount || 0,
      email: overrides.email || 'placeholder@pool.local',
      items
    }
  };
}

function createEnv(overrides: Record<string, unknown> = {}) {
  return {
    SITE_BASE: 'https://pool.test',
    SNIPCART_MODE: 'test',
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
  mockStripeClient.checkout.sessions.create.mockResolvedValue({ url: 'https://stripe.test/checkout' });
  mockStripeClient.setupIntents.retrieve.mockResolvedValue({ payment_method: 'pm_123', customer: 'cus_123' });
  mockSnipcartClient.orders.get.mockResolvedValue({
    pledge: { campaignSlug: 'hand-relations' }
  });
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url === 'https://pool.test/api/campaigns.json') {
      return jsonResponse({ campaigns: [campaignFixture, singleTierCampaignFixture] });
    }
    if (url.startsWith('https://payment.snipcart.com/api/public/custom-payment-gateway/payment-session?publicToken=')) {
      const token = new URL(url).searchParams.get('publicToken');
      if (token === 'token-vip' || token === 'token-vip-2') {
        return jsonResponse(buildPaymentSession([
          {
            id: 'hand-relations__vip-pass',
            name: 'Hand Relations — VIP Pass',
            price: 100,
            quantity: 1,
            type: 'Digital',
            url: 'https://pool.test/campaigns/hand-relations/'
          }
        ], { id: `session_${token}`, amount: 100 }));
      }
      if (token === 'token-single-tier') {
        return jsonResponse(buildPaymentSession([
          {
            id: 'sunder__poster',
            name: 'Sunder — Poster',
            price: 20,
            quantity: 1,
            type: 'Digital',
            url: 'https://pool.test/campaigns/sunder/'
          },
          {
            id: 'sunder__blu-ray',
            name: 'Sunder — Blu-ray',
            price: 35,
            quantity: 1,
            type: 'Physical',
            url: 'https://pool.test/campaigns/sunder/'
          }
        ], { id: 'session_single_tier', amount: 55 }));
      }
      if (token === 'token-threshold') {
        return jsonResponse(buildPaymentSession([
          {
            id: 'hand-relations__creature-cameo',
            name: 'Hand Relations — Creature Cameo',
            price: 250,
            quantity: 1,
            type: 'Digital',
            url: 'https://pool.test/campaigns/hand-relations/'
          }
        ], { id: 'session_threshold', amount: 250 }));
      }
      if (token === 'token-frame-support') {
        return jsonResponse(buildPaymentSession([
          {
            id: 'hand-relations__frame-slot',
            name: 'Hand Relations — Buy 1 Frame',
            price: 5,
            quantity: 1,
            type: 'Digital',
            url: 'https://pool.test/campaigns/hand-relations/'
          },
          {
            id: 'hand-relations__support__location-scouting',
            name: 'Location Scouting',
            price: 10,
            quantity: 1,
            type: 'Custom',
            url: 'https://pool.test/campaigns/hand-relations/'
          },
          {
            id: 'hand-relations__custom-support',
            name: 'Additional Support',
            price: 5,
            quantity: 1,
            type: 'Custom',
            url: 'https://pool.test/campaigns/hand-relations/'
          }
        ], { id: 'session_frame_support', amount: 20 }));
      }
      if (token === 'token-frame-only') {
        return jsonResponse(buildPaymentSession([
          {
            id: 'hand-relations__frame-slot',
            name: 'Hand Relations — Buy 1 Frame',
            price: 5,
            quantity: 1,
            type: 'Digital',
            url: 'https://pool.test/campaigns/hand-relations/'
          }
        ], { id: 'session_frame_only', amount: 5 }));
      }
      return new Response('not found', { status: 404 });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
});

describe('Worker business logic hardening', () => {
  it('rebuilds checkout pricing on /start instead of trusting amountCents', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicToken: 'token-vip',
          campaignSlug: 'hand-relations',
          email: 'buyer@example.com',
          tierId: 'vip-pass'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    expect(mockStripeClient.checkout.sessions.create).toHaveBeenCalledTimes(1);

    const sessionPayload = mockStripeClient.checkout.sessions.create.mock.calls[0][0];
    expect(sessionPayload.metadata.amountCents).toBe('10000');
    expect(sessionPayload.metadata.tierId).toBe('vip-pass');
    expect(sessionPayload.metadata.tierName).toBe('VIP Pass');
    expect(sessionPayload.metadata.orderId).toBe('pool-session_token-vip');
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

  it('rejects additional tiers for single-tier-only campaigns', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicToken: 'token-single-tier',
          campaignSlug: 'sunder',
          email: 'buyer@example.com',
          tierId: 'poster'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(400);
    expect(mockStripeClient.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('does not create limited-tier reservations during /start checkout setup', async () => {
    const env = createEnv();
    const firstResponse = await worker.fetch(
      new Request('https://pool.test/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicToken: 'token-vip',
          campaignSlug: 'hand-relations',
          email: 'buyer1@example.com'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(firstResponse.status).toBe(200);

    const secondResponse = await worker.fetch(
      new Request('https://pool.test/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicToken: 'token-vip-2',
          campaignSlug: 'hand-relations',
          email: 'buyer2@example.com'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(secondResponse.status).toBe(200);
    expect(await (env.PLEDGES as MockKVNamespace).get('tier-reservation:hand-relations:pool-session_token-vip', { type: 'json' }))
      .toBeNull();
    expect(await (env.PLEDGES as MockKVNamespace).get('tier-reservation:hand-relations:pool-session_token-vip-2', { type: 'json' }))
      .toBeNull();
  });

  it('fails closed on /start payment-session verification errors without saving a reservation', async () => {
    const env = createEnv();
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({ campaigns: [campaignFixture, singleTierCampaignFixture] });
      }
      if (url.startsWith('https://payment.snipcart.com/api/public/custom-payment-gateway/payment-session?publicToken=')) {
        throw new Error('Snipcart down');
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const response = await worker.fetch(
      new Request('https://pool.test/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicToken: 'token-broken',
          campaignSlug: 'hand-relations',
          email: 'buyer@example.com'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(502);
    expect(mockStripeClient.checkout.sessions.create).not.toHaveBeenCalled();
    expect(await (env.PLEDGES as MockKVNamespace).get('tier-reservation:hand-relations:pool-session_broken', { type: 'json' }))
      .toBeNull();
  });

  it('rejects threshold-gated tiers before the campaign unlocks them', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicToken: 'token-threshold',
          campaignSlug: 'hand-relations',
          email: 'buyer@example.com'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(400);
    expect(mockStripeClient.checkout.sessions.create).not.toHaveBeenCalled();
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

  it('rejects invalid Snipcart webhook tokens when the webhook secret is configured', async () => {
    const env = createEnv({
      SNIPCART_WEBHOOK_SECRET: 'snipcart_test_secret'
    });

    const missingTokenResponse = await worker.fetch(
      new Request('https://pool.test/webhooks/snipcart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventName: 'order.completed', content: { token: 'order-1' } })
      }),
      env,
      { waitUntil: () => {} }
    );

    const invalidTokenResponse = await worker.fetch(
      new Request('https://pool.test/webhooks/snipcart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-snipcart-requesttoken': 'wrong-secret'
        },
        body: JSON.stringify({ eventName: 'order.completed', content: { token: 'order-1' } })
      }),
      env,
      { waitUntil: () => {} }
    );

    const validTokenResponse = await worker.fetch(
      new Request('https://pool.test/webhooks/snipcart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-snipcart-requesttoken': 'snipcart_test_secret'
        },
        body: JSON.stringify({ eventName: 'order.completed', content: { token: 'order-1' } })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(missingTokenResponse.status).toBe(401);
    expect(invalidTokenResponse.status).toBe(401);
    expect(validTokenResponse.status).toBe(200);
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

  it('disables the legacy /checkout flow', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/checkout?publicToken=public_123'),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(410);
  });

  it('rebuilds /start from the verified checkout token instead of trusting client pledge shape', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicToken: 'token-frame-only',
          campaignSlug: 'hand-relations',
          email: 'buyer@example.com',
          tierId: 'vip-pass',
          tierQty: 1,
          additionalTiers: [{ id: 'vip-pass', qty: 1 }],
          supportItems: [{ id: 'location-scouting', amount: 999 }],
          customAmount: 999
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    const sessionPayload = mockStripeClient.checkout.sessions.create.mock.calls.at(-1)?.[0];
    expect(sessionPayload.metadata.tierId).toBe('frame-slot');
    expect(sessionPayload.metadata.hasAdditionalTiers).toBe('');
    expect(sessionPayload.metadata.hasExtras).toBe('');
    expect(sessionPayload.metadata.amountCents).toBe('500');
  });
});
