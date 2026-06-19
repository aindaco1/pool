import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { hashCheckoutContribution, hashCheckoutBundle, buildCheckoutHashInput, buildCheckoutBundleHashInput } from '../../worker/src/checkout-intent.js';
import { CheckoutIntentNonceCoordinator } from '../../worker/src/checkout-intent-do.js';
import { __resetCampaignRuntimeStateForTests } from '../../worker/src/campaigns.js';
import { TierInventoryCoordinator } from '../../worker/src/tier-inventory-do.js';

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
  paymentIntents: {
    create: vi.fn(),
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
const mockSendLaunchReminderEmail = vi.fn(async () => ({ sent: true }));
const mockSendAbandonedCartEmail = vi.fn(async () => ({ sent: true }));

vi.mock('../../worker/src/stripe.js', () => ({
  verifyStripeSignature: mockVerifyStripeSignature,
  createStripeClient: vi.fn(() => mockStripeClient)
}));

vi.mock('../../worker/src/token.js', () => ({
  generateToken: vi.fn(async () => 'token'),
  verifyToken: mockVerifyToken
}));

vi.mock('../../worker/src/email.js', () => ({
  RESEND_RATE_LIMIT_DELAY_MS: 0,
  sendSupporterEmail: mockSendSupporterEmail,
  sendPaymentFailedEmail: mockSendPaymentFailedEmail,
  sendPledgeModifiedEmail: mockSendPledgeModifiedEmail,
  sendPledgeCancelledEmail: mockSendPledgeCancelledEmail,
  sendDiaryUpdateEmail: mockSendDiaryUpdateEmail,
  sendMilestoneEmail: mockSendMilestoneEmail,
  sendChargeSuccessEmail: mockSendChargeSuccessEmail,
  sendAnnouncementEmail: mockSendAnnouncementEmail,
  sendLaunchReminderEmail: mockSendLaunchReminderEmail,
  sendAbandonedCartEmail: mockSendAbandonedCartEmail
}));

vi.mock('../../worker/src/github.js', () => ({
  triggerSiteRebuild: vi.fn(async () => {}),
  triggerMediaOptimization: vi.fn(async () => ({ triggered: true })),
  deleteGitHubFile: vi.fn(async () => ({ ok: true, deleted: true }))
}));

class MockKVNamespace {
  store = new Map<string, string>();
  listCalls: Array<{ prefix: string; cursor?: string }> = [];
  putCalls: Array<{ key: string; value: string }> = [];

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
    this.putCalls.push({ key, value });
  }

  async delete(key: string) {
    this.store.delete(key);
  }

  async list({ prefix = '', cursor }: { prefix?: string; cursor?: string } = {}) {
    this.listCalls.push({ prefix, cursor });
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

class StatefulCheckoutIntentNamespace {
  instances = new Map<string, CheckoutIntentNonceCoordinator>();
  calls: Array<{ url: string; body: Record<string, unknown> }> = [];

  idFromName(name: string) {
    return { name };
  }

  get(id: { name: string }) {
    if (!this.instances.has(id.name)) {
      this.instances.set(
        id.name,
        new CheckoutIntentNonceCoordinator(new MockDurableObjectState() as never, {} as never)
      );
    }
    const coordinator = this.instances.get(id.name)!;
    return {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        this.calls.push({ url, body });
        return coordinator.fetch(new Request(url, {
          method: init?.method || 'POST',
          headers: init?.headers,
          body: init?.body
        }));
      }
    };
  }
}

class MockTierInventoryNamespace {
  calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  responders = new Map<string, (body: Record<string, unknown>) => unknown>();

  idFromName(name: string) {
    return { name };
  }

  get(_id: { name: string }) {
    return {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        this.calls.push({ url, body });
        const pathname = new URL(url).pathname;
        const responder = this.responders.get(pathname);
        const payload = responder ? await responder(body) : { success: true };
        return jsonResponse(payload);
      }
    };
  }
}

class MockDurableObjectStorage {
  store = new Map<string, unknown>();

  async get(key: string) {
    return this.store.get(key);
  }

  async put(key: string, value: unknown) {
    this.store.set(key, value);
  }

  async transaction<T>(callback: (storage: MockDurableObjectStorage) => Promise<T>) {
    return callback(this);
  }
}

class MockDurableObjectState {
  storage = new MockDurableObjectStorage();
}

class StatefulTierInventoryNamespace {
  instances = new Map<string, TierInventoryCoordinator>();
  calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  kv: MockKVNamespace;

  constructor(kv: MockKVNamespace) {
    this.kv = kv;
  }

  idFromName(name: string) {
    return { name };
  }

  get(id: { name: string }) {
    if (!this.instances.has(id.name)) {
      this.instances.set(
        id.name,
        new TierInventoryCoordinator(new MockDurableObjectState() as never, { PLEDGES: this.kv } as never)
      );
    }
    const coordinator = this.instances.get(id.name)!;
    return {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        this.calls.push({ url, body });
        return coordinator.fetch(new Request(url, {
          method: init?.method || 'POST',
          headers: init?.headers,
          body: init?.body
        }));
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
      category: 'physical',
      shipping_preset: 'bluray',
      shipping: {
        weight_oz: 4,
        length_in: 7,
        width_in: 5.5,
        height_in: 0.75
      }
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
  shipping_fallback_flat_rate: 12,
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
  support_items: [
    {
      id: 'festival-fund',
      label: 'Festival Fund',
      need: 'submission fees',
      target: 100,
      current: 0,
      category: 'digital',
      late_support: true
    },
    {
      id: 'signed-script',
      label: 'Signed Script',
      need: 'physical add-on smoke test',
      target: 25,
      current: 0,
      category: 'physical',
      shipping_preset: 'signed_script',
      shipping: {
        weight_oz: 7,
        length_in: 11,
        width_in: 8.5,
        height_in: 0.5
      },
      late_support: true
    }
  ],
  has_decisions: false,
  instagram: null,
  diary: []
};

const metadataFallbackCampaignFixture = {
  slug: 'tecolote',
  title: 'TECOLOTE',
  state: 'live',
  goal_amount: 8000,
  pledged_amount: 0,
  goal_deadline: '2026-12-31',
  start_date: '2026-01-01',
  charged: false,
  single_tier_only: false,
  custom_late_support: true,
  tiers: [
    {
      id: 'owl-sticker',
      name: 'Owl Sticker',
      price: 10,
      limit_total: null,
      remaining: 999,
      sold_out: false,
      stackable: true,
      category: 'physical'
    }
  ],
  support_items: [],
  has_decisions: false,
  instagram: null,
  diary: []
};

const addOnCatalogFixture = {
  enabled: true,
  low_stock_threshold: 5,
  products: [
    {
      id: 'dust-wave-sticker',
      name: 'DUST WAVE Sticker',
      description: 'Sticker',
      image_url: 'https://shop.dustwave.xyz/assets/images/sticker-glove.png',
      price: 3,
      category: 'physical',
      inventory: 50,
      shipping_preset: 'sticker',
      shipping: {
        weight_oz: 1,
        length_in: 4,
        width_in: 4,
        height_in: 0.125
      },
      variants: []
    },
    {
      id: 'dust-wave-tshirt',
      name: 'DUST WAVE T-Shirt',
      description: 'T-shirt',
      image_url: 'https://shop.dustwave.xyz/assets/images/dustwave-tshirt.png',
      price: 25,
      category: 'physical',
      shipping_preset: 'tshirt',
      shipping: {
        weight_oz: 8,
        length_in: 10,
        width_in: 8,
        height_in: 1
      },
      variant_option_name: 'Size',
      variants: [
        { id: 'm', label: 'M', inventory: 4 },
        { id: 'l', label: 'L', inventory: 4 }
      ]
    },
    {
      id: 'smoke-editable__first-time-sexpot-condom-pack',
      name: 'First Time Sexpot Condom Pack',
      description: 'Condom pack',
      image_url: 'https://shop.dustwave.xyz/assets/images/sexpot-condom-pack.png',
      price: 6,
      category: 'physical',
      inventory: 25,
      shipping_preset: 'sticker',
      shipping: {
        weight_oz: 1,
        length_in: 4,
        width_in: 4,
        height_in: 0.125
      },
      scope: 'campaign',
      campaign_slug: 'smoke-editable',
      campaign_title: 'SMOKE EDITABLE',
      variants: []
    }
  ]
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
    STRIPE_PUBLISHABLE_KEY_TEST: 'pk_test_pool_default',
    STRIPE_WEBHOOK_SECRET_TEST: 'whsec_test_123',
    MAGIC_LINK_SECRET: 'secret',
    PLEDGES: new MockKVNamespace(),
    RATELIMIT: new MockKVNamespace(),
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
  __resetCampaignRuntimeStateForTests();
  mockStripeClient.checkout.sessions.create.mockResolvedValue({
    id: 'cs_test_default_123',
    client_secret: 'cs_test_default_secret_123',
    url: 'https://stripe.test/checkout'
  });
  mockStripeClient.setupIntents.retrieve.mockResolvedValue({ payment_method: 'pm_123', customer: 'cus_123' });
  mockStripeClient.paymentIntents.create.mockResolvedValue({ id: 'pi_test_default_123', status: 'succeeded' });
  mockStripeClient.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_test_default_123', status: 'succeeded' });
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url === 'https://pool.test/api/campaigns.json') {
      return jsonResponse({ campaigns: [campaignFixture, singleTierCampaignFixture, smokeEditableCampaignFixture, metadataFallbackCampaignFixture] });
    }
    if (url === 'https://pool.test/api/add-ons.json') {
      return jsonResponse(addOnCatalogFixture);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
});

describe('Worker business logic hardening', () => {
  it('fails closed when RATELIMIT is not configured', async () => {
    const env = createEnv({
      RATELIMIT: undefined
    });

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
    await expect(response.json()).resolves.toEqual({
      error: 'Rate limit storage not configured'
    });
  });

  it('stores launch reminder signups for upcoming campaigns with normalized dedupe', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as MockKVNamespace;
    const upcomingCampaign = {
      ...campaignFixture,
      slug: 'future-campaign',
      title: 'Future Campaign',
      state: 'upcoming',
      start_date: '2099-01-01',
      url: '/campaigns/future-campaign/'
    };
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({ campaigns: [upcomingCampaign] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const firstResponse = await worker.fetch(
      new Request('https://pool.test/launch-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'future-campaign',
          email: 'Fan@Example.COM ',
          preferredLang: 'es',
          consent: true
        })
      }),
      env,
      { waitUntil: () => {} }
    );
    const secondResponse = await worker.fetch(
      new Request('https://pool.test/launch-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'future-campaign',
          email: 'fan@example.com',
          preferredLang: 'en',
          consent: true
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    const signupKeys = Array.from(kv.store.keys()).filter(key => key.startsWith('launch-reminder:future-campaign:'));
    expect(signupKeys).toHaveLength(1);
    const record = JSON.parse(kv.store.get(signupKeys[0]) as string);
    expect(record).toMatchObject({
      campaignSlug: 'future-campaign',
      campaignTitle: 'Future Campaign',
      email: 'fan@example.com',
      preferredLang: 'en',
      status: 'active'
    });
  });

  it('rejects launch reminder signups once a campaign is live', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as MockKVNamespace;

    const response = await worker.fetch(
      new Request('https://pool.test/launch-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          email: 'fan@example.com',
          consent: true
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(409);
    expect(Array.from(kv.store.keys()).some(key => key.startsWith('launch-reminder:hand-relations:'))).toBe(false);
  });

  it('suppresses a launch reminder from a scoped unsubscribe token', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as MockKVNamespace;
    await kv.put('launch-reminder:future-campaign:abc123', JSON.stringify({
      campaignSlug: 'future-campaign',
      campaignTitle: 'Future Campaign',
      email: 'fan@example.com',
      emailHash: 'abc123',
      preferredLang: 'en',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }));
    mockVerifyToken.mockResolvedValueOnce({
      scope: 'launch-reminder-unsubscribe',
      campaignSlug: 'future-campaign',
      emailHash: 'abc123',
      email: 'fan@example.com'
    });

    const response = await worker.fetch(
      new Request('https://pool.test/launch-reminders/unsubscribe?t=unsubscribe-token'),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    const updated = JSON.parse(kv.store.get('launch-reminder:future-campaign:abc123') as string);
    expect(updated.status).toBe('unsubscribed');
    expect(kv.store.has('launch-reminder-suppressed:future-campaign:abc123')).toBe(true);
  });

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
    const tierInventory = new MockTierInventoryNamespace();
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      CHECKOUT_INTENT_SECRET: 'checkout_secret_123',
      CHECKOUT_INTENTS: checkoutIntents,
      TIER_INVENTORY_COORDINATOR: tierInventory
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
    expect(tierInventory.calls).toContainEqual(expect.objectContaining({
      url: 'https://tier-inventory-coordinator/reserve-selection',
      body: expect.objectContaining({
        campaignSlug: 'hand-relations',
        reservationId: expect.stringMatching(/^pool-intent-/),
        nextCounts: { 'frame-slot': 1 }
      })
    }));

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

  it('queues abandoned checkout reminders only after an opted-in first-party checkout starts', async () => {
    const checkoutIntents = new MockCheckoutIntentNamespace();
    const tierInventory = new MockTierInventoryNamespace();
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      CHECKOUT_INTENT_SECRET: 'checkout_secret_123',
      CHECKOUT_INTENTS: checkoutIntents,
      TIER_INVENTORY_COORDINATOR: tierInventory,
      ABANDONED_CART_DELAY_MS: '0'
    });

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          items: [{ id: 'hand-relations__frame-slot', quantity: 1 }],
          email: 'Buyer@Example.COM',
          tipPercent: 5,
          abandonedCartConsent: true
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    const sessionPayload = mockStripeClient.checkout.sessions.create.mock.calls.at(-1)?.[0];
    const orderId = sessionPayload.metadata.orderId;
    const kv = env.PLEDGES as MockKVNamespace;
    const manifest = await kv.get(`pending-checkout:${orderId}`, { type: 'json' });
    expect(manifest.abandonedCart).toMatchObject({
      consent: true,
      email: 'buyer@example.com',
      preferredLang: 'en'
    });
    await expect(kv.get(`abandoned-cart:${orderId}`, { type: 'json' })).resolves.toMatchObject({
      orderId,
      email: 'buyer@example.com',
      campaignSlugs: ['hand-relations'],
      campaignTitle: 'Hand Relations',
      status: 'pending'
    });
    await expect(kv.get('abandoned-cart-queue:v1', { type: 'json' })).resolves.toMatchObject({
      hasPending: true
    });
  });

  it('sends due abandoned checkout reminders from the scheduler and marks the audience sent', async () => {
    const checkoutIntents = new MockCheckoutIntentNamespace();
    const tierInventory = new MockTierInventoryNamespace();
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      CHECKOUT_INTENT_SECRET: 'checkout_secret_123',
      CHECKOUT_INTENTS: checkoutIntents,
      TIER_INVENTORY_COORDINATOR: tierInventory,
      ABANDONED_CART_DELAY_MS: '0'
    });

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          items: [{ id: 'hand-relations__frame-slot', quantity: 1 }],
          email: 'buyer@example.com',
          tipPercent: 5,
          abandonedCartConsent: true
        })
      }),
      env,
      { waitUntil: () => {} }
    );
    expect(response.status).toBe(200);

    const scheduledWorker = worker as unknown as {
      scheduled: (event: { cron: string }, env: Record<string, unknown>, ctx: { waitUntil: (promise: Promise<unknown>) => void }) => Promise<void>
    };
    await scheduledWorker.scheduled(
      { cron: '* * * * *' },
      env,
      { waitUntil: () => {} }
    );

    const sessionPayload = mockStripeClient.checkout.sessions.create.mock.calls.at(-1)?.[0];
    const orderId = sessionPayload.metadata.orderId;
    const kv = env.PLEDGES as MockKVNamespace;
    expect(mockSendAbandonedCartEmail).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      campaignTitle: 'Hand Relations',
      resumeUrl: expect.stringContaining('checkoutResume=token'),
      unsubscribeUrl: expect.stringContaining('/abandoned-cart/unsubscribe?t=token')
    }));
    await expect(kv.get(`abandoned-cart:${orderId}`, { type: 'json' })).resolves.toBeNull();
    expect(Array.from(kv.store.keys()).some(key => key.startsWith('abandoned-cart-sent:'))).toBe(true);
    const resumeKey = Array.from(kv.store.keys()).find(key => key.startsWith('abandoned-cart-resume:'));
    expect(resumeKey).toBe(`abandoned-cart-resume:${orderId}`);
    const resumeRecord = await kv.get(String(resumeKey), { type: 'json' });
    expect(resumeRecord).toMatchObject({
      orderId,
      email: 'buyer@example.com',
      campaignSlugs: ['hand-relations'],
      resumeSnapshot: {
        cart: {
          items: [expect.objectContaining({
            id: 'hand-relations__frame-slot',
            name: 'Buy 1 Frame'
          })]
        }
      }
    });
    mockVerifyToken.mockResolvedValueOnce({
      scope: 'abandoned-cart-resume',
      orderId,
      emailHash: resumeRecord.emailHash,
      campaignSetHash: resumeRecord.campaignSetHash
    });
    const resumeResponse = await worker.fetch(
      new Request('https://pool.test/abandoned-cart/resume?t=resume-token'),
      env,
      { waitUntil: () => {} }
    );
    expect(resumeResponse.status).toBe(200);
    await expect(resumeResponse.json()).resolves.toMatchObject({
      success: true,
      orderId,
      snapshot: {
        cart: {
          items: [expect.objectContaining({ id: 'hand-relations__frame-slot' })]
        }
      },
      draft: {
        email: 'buyer@example.com',
        abandonedCartConsent: true
      }
    });
    await expect(kv.get('abandoned-cart-queue:v1', { type: 'json' })).resolves.toMatchObject({
      hasPending: false
    });
  });

  it('skips abandoned checkout reminders when the email already completed a campaign pledge', async () => {
    const env = createEnv({ ABANDONED_CART_DELAY_MS: '0' });
    const kv = env.PLEDGES as MockKVNamespace;
    const campaignSetHash = await hashCheckoutBundle(buildCheckoutBundleHashInput({
      bundleAddOns: [],
      bundleAddOnAnchorCampaignSlug: '',
      contributions: []
    }));
    await kv.put('abandoned-cart:pool-intent-stale', JSON.stringify({
      version: 1,
      status: 'pending',
      orderId: 'pool-intent-stale',
      email: 'buyer@example.com',
      emailHash: 'buyer-hash',
      preferredLang: 'en',
      campaignSlugs: ['hand-relations'],
      campaignSetHash,
      campaignTitle: 'HAND RELATIONS',
      campaignTitles: ['HAND RELATIONS'],
      campaignUrl: 'https://pool.test/campaigns/hand-relations/',
      amountCents: 2500,
      createdAt: '2026-01-01T00:00:00.000Z',
      sendAfter: '2026-01-01T00:00:00.000Z',
      attempts: 0
    }));
    await kv.put('abandoned-cart-queue:v1', JSON.stringify({ version: 1, hasPending: true, nextDueAt: '2026-01-01T00:00:00.000Z' }));
    await kv.put('campaign-pledges:hand-relations', JSON.stringify(['new-order']));
    await kv.put('pledge:new-order', JSON.stringify({
      orderId: 'new-order',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      pledgeStatus: 'active'
    }));

    const scheduledWorker = worker as unknown as {
      scheduled: (event: { cron: string }, env: Record<string, unknown>, ctx: { waitUntil: (promise: Promise<unknown>) => void }) => Promise<void>
    };
    await scheduledWorker.scheduled(
      { cron: '* * * * *' },
      env,
      { waitUntil: () => {} }
    );

    expect(mockSendAbandonedCartEmail).not.toHaveBeenCalled();
    await expect(kv.get('abandoned-cart:pool-intent-stale', { type: 'json' })).resolves.toBeNull();
  });

  it('skips abandoned checkout reminders for campaign-scoped admin suppression', async () => {
    const env = createEnv({ ABANDONED_CART_DELAY_MS: '0' });
    const kv = env.PLEDGES as MockKVNamespace;
    await kv.put('abandoned-cart:pool-intent-suppressed', JSON.stringify({
      version: 1,
      status: 'pending',
      orderId: 'pool-intent-suppressed',
      email: 'buyer@example.com',
      emailHash: 'buyer-hash',
      preferredLang: 'en',
      campaignSlugs: ['hand-relations'],
      campaignSetHash: 'campaign-hash',
      campaignTitle: 'Hand Relations',
      campaignTitles: ['Hand Relations'],
      campaignUrl: 'https://pool.test/campaigns/hand-relations/',
      amountCents: 2500,
      createdAt: '2026-01-01T00:00:00.000Z',
      sendAfter: '2026-01-01T00:00:00.000Z',
      attempts: 0
    }));
    await kv.put('abandoned-cart-queue:v1', JSON.stringify({ version: 1, hasPending: true, nextDueAt: '2026-01-01T00:00:00.000Z' }));
    await kv.put('abandoned-cart-suppressed-campaign:hand-relations:buyer-hash', JSON.stringify({
      campaignSlug: 'hand-relations',
      emailHash: 'buyer-hash',
      source: 'admin'
    }));

    const scheduledWorker = worker as unknown as {
      scheduled: (event: { cron: string }, env: Record<string, unknown>, ctx: { waitUntil: (promise: Promise<unknown>) => void }) => Promise<void>
    };
    await scheduledWorker.scheduled(
      { cron: '* * * * *' },
      env,
      { waitUntil: () => {} }
    );

    expect(mockSendAbandonedCartEmail).not.toHaveBeenCalled();
    await expect(kv.get('abandoned-cart:pool-intent-suppressed', { type: 'json' })).resolves.toBeNull();
    await expect(kv.get('abandoned-cart-health:v1', { type: 'json' })).resolves.toMatchObject({
      totals: expect.objectContaining({ suppressed: 1, pending: 0 }),
      campaigns: {
        'hand-relations': expect.objectContaining({
          totals: expect.objectContaining({ suppressed: 1, pending: 0 })
        })
      }
    });
  });

  it('suppresses abandoned checkout reminders from a signed unsubscribe token', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as MockKVNamespace;
    await kv.put('abandoned-cart:pool-intent-unsub', JSON.stringify({
      orderId: 'pool-intent-unsub',
      email: 'buyer@example.com',
      emailHash: 'buyer-hash',
      campaignSetHash: 'campaign-hash',
      campaignSlugs: ['hand-relations']
    }));
    mockVerifyToken.mockResolvedValueOnce({
      scope: 'abandoned-cart-unsubscribe',
      orderId: 'pool-intent-unsub',
      emailHash: 'buyer-hash',
      email: 'buyer@example.com'
    });

    const response = await worker.fetch(
      new Request('https://pool.test/abandoned-cart/unsubscribe?t=unsubscribe-token'),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    expect(kv.store.has('abandoned-cart-suppressed:buyer-hash')).toBe(true);
    await expect(kv.get('abandoned-cart:pool-intent-unsub', { type: 'json' })).resolves.toBeNull();
  });

  it('stores bundle-level add-ons and an anchor campaign for multi-campaign checkout', async () => {
    const checkoutIntents = new MockCheckoutIntentNamespace();
    const tierInventory = new MockTierInventoryNamespace();
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      CHECKOUT_INTENT_SECRET: 'checkout_secret_123',
      CHECKOUT_INTENTS: checkoutIntents,
      TIER_INVENTORY_COORDINATOR: tierInventory
    });

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { id: 'hand-relations__frame-slot', quantity: 1 },
            { id: 'sunder__poster', quantity: 1 },
            { id: 'addon__dust-wave-tshirt__variant__m', quantity: 2 },
            { id: 'addon__dust-wave-sticker', quantity: 1 }
          ],
          email: 'buyer@example.com',
          tipPercent: 5,
          bundleAddOnAnchorCampaignSlug: 'sunder'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);

    const sessionPayload = mockStripeClient.checkout.sessions.create.mock.calls.at(-1)?.[0];
    expect(sessionPayload.metadata.checkoutBundleMode).toBe('true');
    expect(sessionPayload.metadata.checkoutBundleHasAddOns).toBe('true');
    expect(sessionPayload.metadata.bundleAddOnAnchorCampaignSlug).toBe('sunder');

    const kv = env.PLEDGES as MockKVNamespace;
    const manifest = await kv.get(sessionPayload.metadata.orderId ? `pending-checkout:${sessionPayload.metadata.orderId}` : '', { type: 'json' });
    expect(manifest).toMatchObject({
      campaignCount: 2,
      bundleAddOnAnchorCampaignSlug: 'sunder',
      bundleAddOnTotals: {
        count: 2,
        quantity: 3,
        subtotal: 5300
      },
      bundleAddOns: [
        expect.objectContaining({
          productId: 'dust-wave-sticker',
          quantity: 1,
          unitPrice: 300
        }),
        expect.objectContaining({
          productId: 'dust-wave-tshirt',
          variantId: 'm',
          variantLabel: 'M',
          quantity: 2,
          unitPrice: 2500
        })
      ]
    });
  });

  it('returns remaining add-on inventory without counting merch toward campaign funding', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as MockKVNamespace;
    await kv.put('pledge:bundle-order-1-sunder:buyer@example.com', JSON.stringify({
      orderId: 'bundle-order-1-sunder',
      campaignSlug: 'sunder',
      pledgeStatus: 'active',
      bundleAddOns: [
        {
          productId: 'dust-wave-sticker',
          quantity: 3
        },
        {
          productId: 'dust-wave-tshirt',
          variantId: 'm',
          quantity: 2
        }
      ]
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/add-ons/inventory'),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      lowStockThreshold: 5,
      products: {
        'dust-wave-sticker': expect.objectContaining({
          inventory: 50,
          sold: 3,
          remaining: 47
        }),
        'dust-wave-tshirt': expect.objectContaining({
          inventory: 8,
          sold: 2,
          remaining: 6,
          variants: {
            m: expect.objectContaining({
              inventory: 4,
              sold: 2,
              remaining: 2,
              soldOut: false
            }),
            l: expect.objectContaining({
              inventory: 4,
              sold: 0,
              remaining: 4
            })
          }
        })
      }
    });
  });

  it('counts campaign add-ons toward goal-tracking subtotal without mixing in platform add-ons', async () => {
    mockVerifyToken.mockResolvedValue({
      email: 'buyer@example.com',
      campaignSlug: 'smoke-editable',
      orderId: 'pool-intent-campaign-add-on-123'
    });

    const env = createEnv();
    const kv = env.PLEDGES as MockKVNamespace;
    await kv.put('pledge:pool-intent-campaign-add-on-123', JSON.stringify({
      orderId: 'pool-intent-campaign-add-on-123',
      email: 'buyer@example.com',
      campaignSlug: 'smoke-editable',
      pledgeStatus: 'active',
      charged: false,
      tierId: 'standard-pass',
      tierName: 'Standard Pass',
      tierQty: 1,
      additionalTiers: [],
      supportItems: [],
      customAmount: 0,
      subtotal: 1000,
      goalTrackingSubtotal: 1000,
      tax: 79,
      shipping: 0,
      tipPercent: 5,
      tipAmount: 50,
      amount: 1129,
      shippingOption: 'standard',
      preferredLang: 'en',
      shippingAddress: {
        postalCode: '80205',
        country: 'US'
      },
      bundleAddOns: []
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/pledge/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'magic-token',
          orderId: 'pool-intent-campaign-add-on-123',
          preferredLang: 'en',
          bundleAddOns: [
            {
              productId: 'smoke-editable__first-time-sexpot-condom-pack',
              quantity: 1
            },
            {
              productId: 'dust-wave-sticker',
              quantity: 1
            }
          ]
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    await expect(kv.get('pledge:pool-intent-campaign-add-on-123', { type: 'json' })).resolves.toMatchObject({
      subtotal: 1900,
      goalTrackingSubtotal: 1600,
      bundleAddOnSubtotal: 900,
      bundleAddOns: expect.arrayContaining([
        expect.objectContaining({
          productId: 'smoke-editable__first-time-sexpot-condom-pack',
          scope: 'campaign',
          campaignSlug: 'smoke-editable'
        }),
        expect.objectContaining({
          productId: 'dust-wave-sticker',
          scope: 'platform'
        })
      ])
    });
  });

  it('sends a modification email when add-on contents change without changing totals', async () => {
    mockVerifyToken.mockResolvedValue({
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      orderId: 'pool-intent-same-price-123'
    });

    const env = createEnv();
    const kv = env.PLEDGES as MockKVNamespace;
    await kv.put('pledge:pool-intent-same-price-123', JSON.stringify({
      orderId: 'pool-intent-same-price-123',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      pledgeStatus: 'active',
      charged: false,
      tierId: 'frame-slot',
      tierName: 'Buy 1 Frame',
      tierQty: 1,
      additionalTiers: [],
      supportItems: [],
      customAmount: 0,
      subtotal: 3500,
      goalTrackingSubtotal: 1000,
      tax: 276,
      shipping: 300,
      tipPercent: 7,
      tipAmount: 245,
      amount: 4321,
      shippingOption: 'standard',
      preferredLang: 'en',
      shippingAddress: {
        postalCode: '80205',
        country: 'US'
      },
      bundleAddOns: [
        {
          productId: 'dust-wave-tshirt',
          name: 'DUST WAVE T-Shirt',
          variantId: 'm',
          variantLabel: 'M',
          quantity: 1,
          unitPrice: 2500,
          category: 'physical',
          shipping_preset: 'tshirt'
        }
      ]
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/pledge/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'magic-token',
          orderId: 'pool-intent-same-price-123',
          preferredLang: 'en',
          bundleAddOns: [
            {
              productId: 'dust-wave-tshirt',
              variantId: 'l',
              quantity: 1
            }
          ]
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    expect(mockSendPledgeModifiedEmail).toHaveBeenCalledTimes(1);
    expect(mockSendPledgeModifiedEmail).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        email: 'buyer@example.com',
        pledgeItems: expect.objectContaining({
          shippingOption: 'standard',
          addOns: [
            expect.objectContaining({
              productId: 'dust-wave-tshirt',
              variantId: 'l',
              variantLabel: 'L'
            })
          ]
        })
      })
    );
  });

  it('includes the updated delivery option in the modification email payload', async () => {
    mockVerifyToken.mockResolvedValue({
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      orderId: 'pool-intent-shipping-option-123'
    });

    const env = createEnv();
    const kv = env.PLEDGES as MockKVNamespace;
    await kv.put('pledge:pool-intent-shipping-option-123', JSON.stringify({
      orderId: 'pool-intent-shipping-option-123',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      pledgeStatus: 'active',
      charged: false,
      tierId: 'frame-slot',
      tierName: 'Buy 1 Frame',
      tierQty: 1,
      additionalTiers: [],
      supportItems: [],
      customAmount: 0,
      subtotal: 1000,
      goalTrackingSubtotal: 1000,
      tax: 79,
      shipping: 730,
      tipPercent: 5,
      tipAmount: 50,
      amount: 1859,
      shippingOption: 'standard',
      preferredLang: 'en',
      shippingAddress: {
        postalCode: '87048',
        country: 'US'
      },
      hasPhysical: true,
      bundleAddOns: []
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/pledge/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'magic-token',
          orderId: 'pool-intent-shipping-option-123',
          preferredLang: 'en',
          shippingOption: 'signature_required'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    expect(mockSendPledgeModifiedEmail).toHaveBeenCalledTimes(1);
    expect(mockSendPledgeModifiedEmail).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        email: 'buyer@example.com',
        pledgeItems: expect.objectContaining({
          shippingOption: 'signature_required'
        })
      })
    );
  });

  it('persists updated shipping pricing for platform physical add-ons when the delivery option changes', async () => {
    mockVerifyToken.mockResolvedValue({
      email: 'buyer@example.com',
      campaignSlug: 'smoke-editable',
      orderId: 'pool-intent-platform-shipping-option-123'
    });

    const env = createEnv({
      USPS_API_BASE: 'https://apis-modify.usps.test',
      USPS_CLIENT_ID: 'usps_test_client',
      USPS_CLIENT_SECRET: 'usps_test_secret'
    });
    const kv = env.PLEDGES as MockKVNamespace;
    await kv.put('pledge:pool-intent-platform-shipping-option-123', JSON.stringify({
      orderId: 'pool-intent-platform-shipping-option-123',
      email: 'buyer@example.com',
      campaignSlug: 'smoke-editable',
      pledgeStatus: 'active',
      charged: false,
      tierId: 'standard-pass',
      tierName: 'Standard Pass',
      tierQty: 1,
      additionalTiers: [],
      supportItems: [],
      customAmount: 0,
      subtotal: 3500,
      goalTrackingSubtotal: 1000,
      tax: 276,
      shipping: 885,
      tipPercent: 5,
      tipAmount: 175,
      amount: 4836,
      shippingOption: 'standard',
      preferredLang: 'en',
      shippingAddress: {
        postalCode: '87048',
        country: 'US'
      },
      hasPhysical: true,
      bundleAddOns: [
        {
          productId: 'dust-wave-tshirt',
          name: 'DUST WAVE T-Shirt',
          variantId: 'm',
          variantLabel: 'M',
          quantity: 1,
          unitPrice: 2500,
          category: 'physical',
          shipping_preset: 'tshirt',
          shipping: {
            weight_oz: 6.5,
            packaging_weight_oz: 1,
            length_in: 12,
            width_in: 10,
            height_in: 1.5,
            stack_height_in: 0.5
          },
          scope: 'platform'
        }
      ]
    }));

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({ campaigns: [campaignFixture, singleTierCampaignFixture, smokeEditableCampaignFixture, metadataFallbackCampaignFixture] });
      }
      if (url === 'https://pool.test/api/add-ons.json') {
        return jsonResponse(addOnCatalogFixture);
      }
      if (url === 'https://apis-modify.usps.test/oauth2/v3/token') {
        return jsonResponse({ access_token: 'token_modify', expires_in: 3600 });
      }
      if (url === 'https://apis-modify.usps.test/prices/v3/base-rates/search') {
        return jsonResponse({
          totalBasePrice: 8.85,
          rates: [
            {
              mailClass: 'USPS_GROUND_ADVANTAGE',
              description: 'USPS Ground Advantage'
            }
          ]
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const response = await worker.fetch(
      new Request('https://pool.test/pledge/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'magic-token',
          orderId: 'pool-intent-platform-shipping-option-123',
          preferredLang: 'en',
          shippingOption: 'signature_required'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    await expect(kv.get('pledge:pool-intent-platform-shipping-option-123', { type: 'json' })).resolves.toMatchObject({
      shipping: 1280,
      amount: 5231,
      shippingOption: 'signature_required'
    });
    expect(mockSendPledgeModifiedEmail).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        pledgeItems: expect.objectContaining({
          shippingOption: 'signature_required'
        })
      })
    );
  });

  it('uses the provided shipping destination when starting a physical first-party checkout', async () => {
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
          campaignSlug: 'sunder',
          items: [{ id: 'sunder__blu-ray', quantity: 1 }],
          email: 'buyer@example.com',
          shippingAddress: {
            country: 'US',
            postalCode: '80205'
          }
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);

    const sessionPayload = mockStripeClient.checkout.sessions.create.mock.calls.at(-1)?.[0];
    expect(sessionPayload.customer_email).toBe('buyer@example.com');
    expect(sessionPayload.shipping_address_collection).toMatchObject({
      allowed_countries: expect.arrayContaining(['US'])
    });

    const kv = env.PLEDGES as MockKVNamespace;
    const bundleManifest = await kv.get(
      sessionPayload.metadata.orderId ? `pending-checkout:${sessionPayload.metadata.orderId}` : '',
      { type: 'json' }
    );
    expect(bundleManifest?.totals).toMatchObject({
      subtotal: 3500,
      shipping: 300,
      tax: 276,
      tipAmount: 175,
      amount: 4251
    });
    expect(bundleManifest?.campaigns?.[0]).toMatchObject({
      campaignSlug: 'sunder',
      hasPhysical: true
    });
    expect(bundleManifest?.campaigns?.[0]?.totals).toMatchObject({
      subtotal: 3500,
      shipping: 300,
      tax: 276,
      tipAmount: 175,
      amount: 4251
    });
  });

  it('marks physical support-item checkouts as shippable when starting first-party checkout', async () => {
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
          campaignSlug: 'smoke-editable',
          items: [{ id: 'smoke-editable__support__signed-script', amount: 25 }],
          email: 'buyer@example.com',
          shippingAddress: {
            country: 'CA',
            postalCode: 'M5V 2T6'
          }
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);

    const sessionPayload = mockStripeClient.checkout.sessions.create.mock.calls.at(-1)?.[0];
    expect(sessionPayload.customer_email).toBe('buyer@example.com');
    expect(sessionPayload.metadata.hasPhysical).toBe('true');

    const kv = env.PLEDGES as MockKVNamespace;
    const bundleManifest = await kv.get(
      sessionPayload.metadata.orderId ? `pending-checkout:${sessionPayload.metadata.orderId}` : '',
      { type: 'json' }
    );
    expect(bundleManifest?.campaigns?.[0]).toMatchObject({
      campaignSlug: 'smoke-editable',
      hasPhysical: true,
      supportItems: [{ id: 'signed-script', amount: 25 }]
    });
    expect(bundleManifest?.campaigns?.[0]?.totals).toMatchObject({
      subtotal: 2500,
      shipping: 1200,
      tax: 197,
      tipAmount: 125,
      amount: 4022
    });
  });

  it('returns a shipping quote with shipment data for physical tiers', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'sunder',
          items: [{ id: 'sunder__blu-ray', quantity: 1 }],
          shippingAddress: {
            country: 'US',
            postalCode: '80205'
          }
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      quotes: [
        {
          campaignSlug: 'sunder',
          shippingCents: 300,
          source: 'fallback_flat_rate',
          carrier: 'fallback',
          service: 'domestic_ground_fallback',
          domestic: true,
          availableOptions: [
            { id: 'standard', label: 'Standard', domesticOnly: false, priceDeltaCents: 0, shippingCents: 300 }
          ],
          defaultOption: 'standard',
          selectedOption: 'standard',
          shipment: {
            hasPhysical: true,
            physicalTierCount: 1,
            physicalSupportItemCount: 0,
            physicalAddOnCount: 0,
            physicalUnitCount: 1,
            weightOz: 4,
            lengthIn: 7,
            widthIn: 5.5,
            heightIn: 0.75,
            tierIds: ['blu-ray'],
            supportItemIds: [],
            addOnIds: []
          }
        }
      ],
      totalShippingCents: 300,
      shippingAddress: {
        country: 'US',
        postalCode: '80205'
      }
    });
  });

  it('returns a tax quote for preview requests with a billing destination', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/tax/quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://pool.test'
        },
        body: JSON.stringify({
          subtotalCents: 1000,
          shippingCents: 300,
          billingAddress: {
            country: 'US',
            postalCode: '80205',
            state: 'CO'
          }
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      subtotalCents: 1000,
      shippingCents: 300,
      taxCents: 79,
      taxDetails: {
        destination: {
          country: 'US',
          postalCode: '80205',
          state: 'CO'
        }
      }
    });
  });

  it('rejects tax quote requests without a usable destination', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/tax/quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://pool.test'
        },
        body: JSON.stringify({
          subtotalCents: 1000
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Billing or shipping address is required to calculate tax'
    });
  });

  it('returns a shipping quote with shipment data for physical support items', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'smoke-editable',
          items: [{ id: 'smoke-editable__support__signed-script', amount: 25 }],
          shippingAddress: {
            country: 'CA',
            postalCode: 'M5V 2T6'
          }
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      quotes: [
        {
          campaignSlug: 'smoke-editable',
          shippingCents: 1200,
          source: 'fallback_flat_rate',
          carrier: 'fallback',
          service: 'international_ground_fallback',
          domestic: false,
          availableOptions: [
            { id: 'standard', label: 'Standard', domesticOnly: false, priceDeltaCents: 0, shippingCents: 1200 }
          ],
          defaultOption: 'standard',
          selectedOption: 'standard',
          shipment: {
            hasPhysical: true,
            physicalTierCount: 0,
            physicalSupportItemCount: 1,
            physicalAddOnCount: 0,
            physicalUnitCount: 1,
            weightOz: 7,
            lengthIn: 11,
            widthIn: 8.5,
            heightIn: 0.5,
            tierIds: [],
            supportItemIds: ['signed-script'],
            addOnIds: []
          }
        }
      ],
      totalShippingCents: 1200,
      shippingAddress: {
        country: 'CA',
        postalCode: 'M5V 2T6'
      }
    });
  });

  it('returns fallback shipping instead of 400 when physical tiers lack shipping metadata', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'tecolote',
          items: [{ id: 'tecolote__owl-sticker', quantity: 1 }],
          shippingAddress: {
            country: 'US',
            postalCode: '80205'
          }
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      quotes: [
        {
          campaignSlug: 'tecolote',
          shippingCents: 300,
          source: 'fallback_missing_metadata',
          carrier: 'fallback',
          service: 'domestic_metadata_fallback',
          domestic: true,
          availableOptions: [
            { id: 'standard', label: 'Standard', domesticOnly: false, priceDeltaCents: 0, shippingCents: 300 }
          ],
          defaultOption: 'standard',
          selectedOption: 'standard',
          shipment: {
            hasPhysical: true,
            physicalTierCount: 1,
            physicalSupportItemCount: 0,
            physicalAddOnCount: 0,
            physicalUnitCount: 1,
            weightOz: 0,
            lengthIn: 0,
            widthIn: 0,
            heightIn: 0,
            tierIds: ['owl-sticker'],
            supportItemIds: [],
            addOnIds: [],
            metadataIncomplete: true
          }
        }
      ],
      totalShippingCents: 300,
      shippingAddress: {
        country: 'US',
        postalCode: '80205'
      }
    });
  });

  it('returns zero shipping for carts without physical tiers', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          items: [{ id: 'hand-relations__frame-slot', quantity: 1 }],
          shippingAddress: {
            country: 'US',
            postalCode: '80205'
          }
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      quotes: [
        {
          campaignSlug: 'hand-relations',
          shippingCents: 0,
          source: 'none',
          carrier: null,
          service: null,
          domestic: true,
          availableOptions: [],
          defaultOption: 'standard',
          selectedOption: 'standard',
          shipment: {
            hasPhysical: false,
            physicalTierCount: 0,
            physicalSupportItemCount: 0,
            physicalAddOnCount: 0,
            physicalUnitCount: 0,
            weightOz: 0,
            lengthIn: 0,
            widthIn: 0,
            heightIn: 0,
            tierIds: [],
            supportItemIds: [],
            addOnIds: []
          }
        }
      ],
      totalShippingCents: 0,
      shippingAddress: {
        country: 'US',
        postalCode: '80205'
      }
    });
  });

  it('treats physical bundle add-ons as shippable in shipping quotes', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          items: [
            { id: 'hand-relations__frame-slot', quantity: 1 },
            { id: 'addon__dust-wave-sticker', quantity: 1 }
          ],
          shippingAddress: {
            country: 'US',
            postalCode: '80205'
          },
          bundleAddOnAnchorCampaignSlug: 'hand-relations'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      quotes: [
        {
          campaignSlug: 'hand-relations',
          shippingCents: 0,
          source: 'none',
          carrier: null,
          service: null,
          domestic: true,
          availableOptions: [],
          defaultOption: 'standard',
          selectedOption: 'standard',
          shipment: {
            hasPhysical: false,
            physicalTierCount: 0,
            physicalSupportItemCount: 0,
            physicalAddOnCount: 0,
            physicalUnitCount: 0,
            weightOz: 0,
            lengthIn: 0,
            widthIn: 0,
            heightIn: 0,
            tierIds: [],
            supportItemIds: [],
            addOnIds: []
          }
        },
        {
          campaignSlug: '',
          shippingCents: 300,
          source: 'fallback_flat_rate',
          carrier: 'fallback',
          service: 'domestic_ground_fallback',
          domestic: true,
          availableOptions: [
            { id: 'standard', label: 'Standard', domesticOnly: false, priceDeltaCents: 0, shippingCents: 300 }
          ],
          defaultOption: 'standard',
          selectedOption: 'standard',
          shipment: {
            hasPhysical: true,
            physicalTierCount: 0,
            physicalSupportItemCount: 0,
            physicalAddOnCount: 1,
            physicalUnitCount: 1,
            weightOz: 1,
            lengthIn: 4,
            widthIn: 4,
            heightIn: 0.125,
            tierIds: [],
            supportItemIds: [],
            addOnIds: ['dust-wave-sticker']
          }
        }
      ],
      totalShippingCents: 300,
      shippingAddress: {
        country: 'US',
        postalCode: '80205'
      }
    });
  });

  it('adds one separate platform shipping charge on top of campaign shipping for physical global add-ons', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { id: 'smoke-editable__support__signed-script', amount: 25 },
            { id: 'addon__dust-wave-sticker', quantity: 1 }
          ],
          shippingAddress: {
            country: 'US',
            postalCode: '80205'
          },
          bundleAddOnAnchorCampaignSlug: 'smoke-editable'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.totalShippingCents).toBe(1500);
    expect(data.quotes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        campaignSlug: 'smoke-editable',
        shippingCents: 1200,
        source: 'fallback_flat_rate'
      }),
      expect.objectContaining({
        campaignSlug: '',
        shippingCents: 300,
        source: 'fallback_flat_rate'
      })
    ]));
  });

  it('applies the campaign shipping override to physical campaign add-ons', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { id: 'smoke-editable__standard-pass', quantity: 1 },
            { id: 'addon__smoke-editable__first-time-sexpot-condom-pack', quantity: 1 }
          ],
          shippingAddress: {
            country: 'US',
            postalCode: '80205'
          }
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      quotes: [
        {
          campaignSlug: 'smoke-editable',
          shippingCents: 1200,
          source: 'fallback_flat_rate',
          carrier: 'fallback',
          service: 'domestic_ground_fallback',
          domestic: true,
          availableOptions: [
            { id: 'standard', label: 'Standard', domesticOnly: false, priceDeltaCents: 0, shippingCents: 1200 }
          ],
          defaultOption: 'standard',
          selectedOption: 'standard',
          shipment: {
            hasPhysical: true,
            physicalTierCount: 0,
            physicalSupportItemCount: 0,
            physicalAddOnCount: 1,
            physicalUnitCount: 1,
            weightOz: 1,
            lengthIn: 4,
            widthIn: 4,
            heightIn: 0.125,
            tierIds: [],
            supportItemIds: [],
            addOnIds: ['smoke-editable__first-time-sexpot-condom-pack']
          }
        }
      ],
      totalShippingCents: 1200,
      shippingAddress: {
        country: 'US',
        postalCode: '80205'
      }
    });
  });

  it('returns summed shipping for mixed-campaign carts with digital and physical tiers', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { id: 'hand-relations__frame-slot', quantity: 1 },
            { id: 'smoke-editable__support__signed-script', amount: 25 }
          ],
          shippingAddress: {
            country: 'US',
            postalCode: '80205'
          }
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.totalShippingCents).toBe(1200);
    expect(data.quotes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        campaignSlug: 'hand-relations',
        shippingCents: 0,
        source: 'none'
      }),
      expect.objectContaining({
        campaignSlug: 'smoke-editable',
        shippingCents: 1200,
        source: 'fallback_flat_rate'
      })
    ]));
  });

  it('applies campaign shipping overrides to campaign add-ons in mixed-campaign carts', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { id: 'hand-relations__frame-slot', quantity: 1 },
            { id: 'smoke-editable__standard-pass', quantity: 1 },
            { id: 'addon__smoke-editable__first-time-sexpot-condom-pack', quantity: 1 }
          ],
          shippingAddress: {
            country: 'US',
            postalCode: '80205'
          }
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.totalShippingCents).toBe(1200);
    expect(data.quotes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        campaignSlug: 'hand-relations',
        shippingCents: 0,
        source: 'none'
      }),
      expect.objectContaining({
        campaignSlug: 'smoke-editable',
        shippingCents: 1200,
        source: 'fallback_flat_rate'
      })
    ]));
  });

  it('returns custom checkout bootstrap data when custom UI mode is enabled', async () => {
    mockStripeClient.checkout.sessions.create.mockResolvedValueOnce({
      id: 'cs_test_custom_123',
      client_secret: 'cs_test_secret_123'
    });

    const checkoutIntents = new MockCheckoutIntentNamespace();
    const tierInventory = new MockTierInventoryNamespace();
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      CHECKOUT_UI_MODE: 'custom',
      STRIPE_PUBLISHABLE_KEY_TEST: 'pk_test_pool_123',
      CHECKOUT_INTENT_SECRET: 'checkout_secret_123',
      CHECKOUT_INTENTS: checkoutIntents,
      TIER_INVENTORY_COORDINATOR: tierInventory
    });

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          items: [
            { id: 'hand-relations__frame-slot', quantity: 1 }
          ],
          email: 'buyer@example.com',
          tipPercent: 5
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
    await expect(response.json()).resolves.toMatchObject({
      checkoutUiMode: 'custom',
      sessionId: 'cs_test_custom_123',
      clientSecret: 'cs_test_secret_123',
      publishableKey: 'pk_test_pool_123',
      orderId: expect.stringMatching(/^pool-intent-/)
    });

    const sessionPayload = mockStripeClient.checkout.sessions.create.mock.calls.at(-1)?.[0];
    const requestOptions = mockStripeClient.checkout.sessions.create.mock.calls.at(-1)?.[1];
    expect(sessionPayload.ui_mode).toBe('custom');
    expect(sessionPayload.payment_method_types).toEqual(['card', 'link']);
    expect(sessionPayload.consent_collection).toEqual({
      payment_method_reuse_agreement: {
        position: 'hidden'
      }
    });
    expect(sessionPayload.return_url).toMatch(/^https:\/\/pool\.test\/pledge-success\/\?orderId=pool-intent-/);
    expect(sessionPayload.success_url).toBeUndefined();
    expect(sessionPayload.cancel_url).toBeUndefined();
    expect(requestOptions).toEqual({ stripeVersion: '2026-02-25.clover' });
  });

  it('rejects cross-site first-party checkout start requests', async () => {
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      CHECKOUT_UI_MODE: 'custom',
      STRIPE_PUBLISHABLE_KEY_TEST: 'pk_test_pool_123',
      CHECKOUT_INTENT_SECRET: 'checkout_secret_123',
      CHECKOUT_INTENTS: new MockCheckoutIntentNamespace(),
      TIER_INVENTORY_COORDINATOR: new MockTierInventoryNamespace()
    });

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.test',
          'Sec-Fetch-Site': 'cross-site'
        },
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

    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
    await expect(response.json()).resolves.toEqual({ error: 'Origin not allowed' });
    expect(mockStripeClient.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('falls back to hosted checkout when custom checkout publishable key is missing', async () => {
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      CHECKOUT_UI_MODE: 'custom',
      STRIPE_PUBLISHABLE_KEY_TEST: '',
      CHECKOUT_INTENT_SECRET: 'checkout_secret_123',
      CHECKOUT_INTENTS: new MockCheckoutIntentNamespace(),
      TIER_INVENTORY_COORDINATOR: new MockTierInventoryNamespace()
    });

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          items: [
            { id: 'hand-relations__frame-slot', quantity: 1 }
          ],
          email: 'buyer@example.com',
          tipPercent: 5
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      checkoutUiMode: 'hosted',
      url: 'https://stripe.test/checkout'
    });

    const sessionPayload = mockStripeClient.checkout.sessions.create.mock.calls.at(-1)?.[0];
    const requestOptions = mockStripeClient.checkout.sessions.create.mock.calls.at(-1)?.[1];
    expect(sessionPayload.ui_mode).toBeUndefined();
    expect(sessionPayload.success_url).toMatch(/^https:\/\/pool\.test\/pledge-success\/\?orderId=pool-intent-/);
    expect(sessionPayload.cancel_url).toBe('https://pool.test/pledge-cancelled/');
    expect(requestOptions).toBeUndefined();
  });

  it('creates a bundled first-party checkout session for mixed-campaign carts', async () => {
    const tierInventory = new MockTierInventoryNamespace();
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      CHECKOUT_INTENT_SECRET: 'checkout_secret_123',
      CHECKOUT_INTENTS: new MockCheckoutIntentNamespace(),
      TIER_INVENTORY_COORDINATOR: tierInventory
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
    expect(tierInventory.calls.filter((call) => call.url.endsWith('/reserve-selection'))).toHaveLength(0);
  });

  it('persists limited-tier reservations before redirecting into Stripe', async () => {
    const tierInventory = new MockTierInventoryNamespace();
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      CHECKOUT_INTENT_SECRET: 'checkout_secret_123',
      CHECKOUT_INTENTS: new MockCheckoutIntentNamespace(),
      TIER_INVENTORY_COORDINATOR: tierInventory
    });
    const kv = env.PLEDGES as MockKVNamespace;

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          items: [{ id: 'hand-relations__vip-pass', quantity: 1 }],
          email: 'buyer@example.com',
          tipPercent: 5
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);

    const sessionPayload = mockStripeClient.checkout.sessions.create.mock.calls.at(-1)?.[0];
    const reservationOrderId = sessionPayload.metadata.orderId;
    expect(await kv.get(`tier-reservation:hand-relations:${reservationOrderId}`)).toBeNull();
    expect(await kv.get('tier-reservation-counts:hand-relations')).toBeNull();
    expect(tierInventory.calls).toContainEqual(expect.objectContaining({
      url: 'https://tier-inventory-coordinator/reserve-selection',
      body: expect.objectContaining({
        campaignSlug: 'hand-relations',
        reservationId: reservationOrderId,
        nextCounts: { 'vip-pass': 1 }
      })
    }));
  });

  it('releases limited-tier reservations if Stripe session creation fails', async () => {
    const tierInventory = new MockTierInventoryNamespace();
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      CHECKOUT_INTENT_SECRET: 'checkout_secret_123',
      CHECKOUT_INTENTS: new MockCheckoutIntentNamespace(),
      TIER_INVENTORY_COORDINATOR: tierInventory
    });
    const kv = env.PLEDGES as MockKVNamespace;
    mockStripeClient.checkout.sessions.create.mockRejectedValueOnce(new Error('stripe unavailable'));

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          items: [{ id: 'hand-relations__vip-pass', quantity: 1 }],
          email: 'buyer@example.com',
          tipPercent: 5
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(500);
    expect(await kv.list({ prefix: 'tier-reservation:hand-relations:' })).toMatchObject({
      keys: []
    });
    expect(await kv.get('tier-reservation-counts:hand-relations')).toBeNull();
    expect(tierInventory.calls.some((call) => call.url.endsWith('/release-reservation'))).toBe(true);
  });

  it('abandons a pending checkout intent and releases scarce reservations', async () => {
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      CHECKOUT_INTENT_SECRET: 'checkout_secret_123',
      CHECKOUT_INTENTS: new MockCheckoutIntentNamespace()
    });
    const kv = env.PLEDGES as MockKVNamespace;
    const tierInventory = new StatefulTierInventoryNamespace(kv);
    (env as Record<string, unknown>).TIER_INVENTORY_COORDINATOR = tierInventory;

    const startResponse = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          items: [{ id: 'hand-relations__vip-pass', quantity: 1 }],
          email: 'buyer@example.com',
          tipPercent: 5
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(startResponse.status).toBe(200);
    const sessionPayload = mockStripeClient.checkout.sessions.create.mock.calls.at(-1)?.[0];
    const startedOrderId = sessionPayload?.metadata?.orderId;
    expect(startedOrderId).toMatch(/^pool-intent-/);

    const abandonResponse = await worker.fetch(
      new Request('https://pool.test/checkout-intent/abandon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: startedOrderId })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(abandonResponse.status).toBe(200);
    expect(await abandonResponse.json()).toMatchObject({
      success: true,
      released: 1
    });
    expect(await kv.get(`pending-checkout:${startedOrderId}`)).toBeNull();

    const secondStart = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          items: [{ id: 'hand-relations__vip-pass', quantity: 1 }],
          email: 'retry@example.com',
          tipPercent: 5
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(secondStart.status).toBe(200);
  });

  it('allows only one last-unit scarce checkout start across repeated requests', async () => {
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      CHECKOUT_INTENT_SECRET: 'checkout_secret_123',
      CHECKOUT_INTENTS: new MockCheckoutIntentNamespace()
    });
    const kv = env.PLEDGES as MockKVNamespace;
    const tierInventory = new StatefulTierInventoryNamespace(kv);
    (env as Record<string, unknown>).TIER_INVENTORY_COORDINATOR = tierInventory;

    const firstResponse = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          items: [{ id: 'hand-relations__vip-pass', quantity: 1 }],
          email: 'buyer@example.com',
          tipPercent: 5
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    const secondResponse = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          items: [{ id: 'hand-relations__vip-pass', quantity: 1 }],
          email: 'second@example.com',
          tipPercent: 5
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(400);
    expect(await secondResponse.json()).toMatchObject({
      error: 'Tier "vip-pass" is sold out',
      remaining: 0
    });
  });

  it('fails closed for scarce-tier checkout start when no coordinator is available', async () => {
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      CHECKOUT_INTENT_SECRET: 'checkout_secret_123',
      CHECKOUT_INTENTS: new MockCheckoutIntentNamespace()
    });
    const kv = env.PLEDGES as MockKVNamespace;

    await kv.put('tier-reservation-counts:hand-relations', JSON.stringify({ 'vip-pass': 1 }));

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          items: [{ id: 'hand-relations__vip-pass', quantity: 1 }],
          email: 'buyer@example.com',
          tipPercent: 5
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: 'Limited tier reservation unavailable'
    });
  });

  it('prefers coordinator reservation counts over KV reservation scans during checkout validation', async () => {
    const tierInventory = new MockTierInventoryNamespace();
    tierInventory.responders.set('/reserved-counts', async () => ({
      success: true,
      reservedCounts: { 'vip-pass': 1 }
    }));
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      CHECKOUT_INTENT_SECRET: 'checkout_secret_123',
      CHECKOUT_INTENTS: new MockCheckoutIntentNamespace(),
      TIER_INVENTORY_COORDINATOR: tierInventory
    });
    const kv = env.PLEDGES as MockKVNamespace;

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          items: [{ id: 'hand-relations__vip-pass', quantity: 1 }],
          email: 'buyer@example.com',
          tipPercent: 5
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: 'Tier "vip-pass" is sold out',
      remaining: 0
    });
    expect(kv.listCalls.some((call) => call.prefix === 'tier-reservation:hand-relations:')).toBe(false);
    expect(tierInventory.calls).toContainEqual(expect.objectContaining({
      url: 'https://tier-inventory-coordinator/reserved-counts',
      body: expect.objectContaining({
        campaignSlug: 'hand-relations'
      })
    }));
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
      persisted: true,
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
      persisted: false,
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

  it('treats a confirmed checkout bundle summary as persisted once recovery completes', async () => {
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party'
    });
    const kv = env.PLEDGES as MockKVNamespace;

    await kv.put('pending-checkout:pool-intent-bundle-confirmed-1', JSON.stringify({
      orderId: 'pool-intent-bundle-confirmed-1',
      campaignCount: 2,
      confirmedAt: '2026-04-09T18:34:56.000Z',
      totals: {
        subtotal: 3000,
        tax: 236,
        shipping: 300,
        tipAmount: 150,
        amount: 3686
      },
      campaigns: [
        {
          orderId: 'pool-intent-bundle-confirmed-1-smoke-editable',
          campaignSlug: 'smoke-editable',
          hasPhysical: false
        },
        {
          orderId: 'pool-intent-bundle-confirmed-1-hand-relations',
          campaignSlug: 'hand-relations',
          hasPhysical: true
        }
      ]
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/summary?orderId=pool-intent-bundle-confirmed-1', {
        method: 'GET'
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      orderId: 'pool-intent-bundle-confirmed-1',
      persisted: true
    }));
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

  it('recalculates physical-pledge shipping from the stored address during modify', async () => {
    const env = createEnv({
      USPS_CLIENT_ID: 'client',
      USPS_CLIENT_SECRET: 'secret',
      USPS_API_BASE: 'https://apis-modify.usps.test'
    });
    const kv = env.PLEDGES as MockKVNamespace;

    await kv.put('pledge:order-modify-physical-1', JSON.stringify({
      orderId: 'order-modify-physical-1',
      email: 'buyer@example.com',
      campaignSlug: 'sunder',
      tierId: 'blu-ray',
      tierName: 'Blu-ray',
      tierQty: 1,
      subtotal: 3500,
      tax: 276,
      shipping: 300,
      tipPercent: 0,
      tipAmount: 0,
      amount: 4076,
      shippingAddress: {
        name: 'Supporter Example',
        address1: '123 Main Street',
        city: 'Denver',
        state: 'CO',
        postalCode: '80205',
        country: 'US'
      },
      pledgeStatus: 'active',
      charged: false,
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:00:00.000Z',
      history: []
    }));
    await kv.put('stats:sunder', JSON.stringify({
      campaignSlug: 'sunder',
      pledgedAmount: 3500,
      pledgeCount: 1,
      tierCounts: { 'blu-ray': 1 },
      supportItems: {},
      updatedAt: '2026-03-30T00:00:00.000Z'
    }));

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({ campaigns: [campaignFixture, singleTierCampaignFixture, smokeEditableCampaignFixture, metadataFallbackCampaignFixture] });
      }
      if (url === 'https://apis-modify.usps.test/oauth2/v3/token') {
        return jsonResponse({ access_token: 'token_modify', expires_in: 3600 });
      }
      if (url === 'https://apis-modify.usps.test/prices/v3/base-rates/search') {
        return jsonResponse({
          totalBasePrice: 6.75,
          rates: [
            {
              mailClass: 'USPS_GROUND_ADVANTAGE',
              description: 'USPS Ground Advantage'
            }
          ]
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    mockVerifyToken.mockResolvedValue({
      orderId: 'order-modify-physical-1',
      email: 'buyer@example.com',
      campaignSlug: 'sunder'
    });

    const response = await worker.fetch(
      new Request('https://pool.test/pledge/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'valid-token',
          tipPercent: 5
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);

    const updatedPledge = await kv.get('pledge:order-modify-physical-1', { type: 'json' });
    expect(updatedPledge.shipping).toBe(675);
    expect(updatedPledge.tipPercent).toBe(5);
    expect(updatedPledge.tipAmount).toBe(175);
    expect(updatedPledge.amount).toBe(4626);
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

    const waitUntilPromises: Promise<unknown>[] = [];

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

  it('returns normalized tax details and billing address on pledge reads', async () => {
    const env = createEnv();
    const kv = env.PLEDGES as MockKVNamespace;
    const billingAddress = {
      country: 'US',
      state: 'CO',
      postalCode: '80205'
    };

    await kv.put('pledge:order-tax-read-1', JSON.stringify({
      orderId: 'order-tax-read-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      tierId: 'frame-slot',
      tierName: 'Buy 1 Frame',
      tierQty: 1,
      billingAddress,
      subtotal: 500,
      tax: 39,
      shipping: 0,
      tipPercent: 0,
      tipAmount: 0,
      amount: 539,
      pledgeStatus: 'active',
      charged: false
    }));

    mockVerifyToken.mockResolvedValue({
      orderId: 'order-tax-read-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations'
    });

    const response = await worker.fetch(
      new Request('https://pool.test/pledge?token=valid-token'),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.billingAddress).toEqual(billingAddress);
    expect(payload.taxDetails).toMatchObject({
      destination: billingAddress,
      taxableSubtotalCents: 500,
      taxableShippingCents: 0,
      shippingTaxed: false,
      shippingCents: 0
    });
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

  it('preserves the stored billing tax destination when modifying a pledge', async () => {
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      SALES_TAX_RATE: '0.05'
    });
    const kv = env.PLEDGES as MockKVNamespace;
    const billingAddress = {
      country: 'US',
      state: 'CO',
      postalCode: '80205'
    };

    await kv.put('pledge:order-first-party-modify-tax-1', JSON.stringify({
      orderId: 'order-first-party-modify-tax-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      stripeCustomerId: 'cus_existing',
      billingAddress,
      tierId: 'frame-slot',
      tierName: 'Buy 1 Frame',
      tierQty: 1,
      subtotal: 500,
      tax: 25,
      shipping: 0,
      tipPercent: 0,
      tipAmount: 0,
      amount: 525,
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
      orderId: 'order-first-party-modify-tax-1',
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
    const payload = await response.json();
    expect(payload.taxDetails).toMatchObject({
      destination: billingAddress
    });

    const storedPledge = await kv.get('pledge:order-first-party-modify-tax-1', { type: 'json' });
    expect(storedPledge.taxDetails).toMatchObject({
      destination: billingAddress
    });
    expect(storedPledge.history.at(-1)?.taxDetails).toMatchObject({
      destination: billingAddress
    });
  });

  it('returns custom checkout bootstrap data for payment-method updates when custom UI mode is enabled', async () => {
    mockVerifyToken.mockResolvedValue({
      orderId: 'order-update-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations'
    });
    mockStripeClient.checkout.sessions.create.mockResolvedValueOnce({
      id: 'cs_test_update_123',
      client_secret: 'cs_test_update_secret_123'
    });

    const env = createEnv({
      CHECKOUT_UI_MODE: 'custom',
      STRIPE_PUBLISHABLE_KEY_TEST: 'pk_test_pool_123'
    });
    const kv = env.PLEDGES as MockKVNamespace;
    await kv.put('pledge:order-update-1', JSON.stringify({
      orderId: 'order-update-1',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      stripeCustomerId: 'cus_existing'
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/pledge/payment-method/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'valid-token' })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
    await expect(response.json()).resolves.toEqual({
      checkoutUiMode: 'custom',
      sessionId: 'cs_test_update_123',
      clientSecret: 'cs_test_update_secret_123',
      publishableKey: 'pk_test_pool_123'
    });

    const sessionPayload = mockStripeClient.checkout.sessions.create.mock.calls.at(-1)?.[0];
    const requestOptions = mockStripeClient.checkout.sessions.create.mock.calls.at(-1)?.[1];
    expect(sessionPayload.ui_mode).toBe('custom');
    expect(sessionPayload.payment_method_types).toEqual(['card', 'link']);
    expect(sessionPayload.consent_collection).toEqual({
      payment_method_reuse_agreement: {
        position: 'hidden'
      }
    });
    expect(sessionPayload.return_url).toBe('https://pool.test/manage/?t=valid-token');
    expect(sessionPayload.success_url).toBeUndefined();
    expect(sessionPayload.cancel_url).toBeUndefined();
    expect(requestOptions).toEqual({ stripeVersion: '2026-02-25.clover' });
  });

  it('does not return raw Stripe errors from payment-method update starts', async () => {
    mockVerifyToken.mockResolvedValue({
      orderId: 'order-update-redacted',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations'
    });
    mockStripeClient.checkout.sessions.create.mockRejectedValueOnce(
      new Error('stripe leaked session secret cs_secret_should_not_leave_logs')
    );

    const env = createEnv({
      CHECKOUT_UI_MODE: 'custom',
      STRIPE_PUBLISHABLE_KEY_TEST: 'pk_test_pool_123'
    });
    const kv = env.PLEDGES as MockKVNamespace;
    await kv.put('pledge:order-update-redacted', JSON.stringify({
      orderId: 'order-update-redacted',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations',
      stripeCustomerId: 'cus_existing'
    }));

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await worker.fetch(
        new Request('https://pool.test/pledge/payment-method/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: 'valid-token' })
        }),
        env,
        { waitUntil: () => {} }
      );

      expect(response.status).toBe(500);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
      await expect(response.json()).resolves.toEqual({
        error: 'Failed to create payment update session'
      });
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('cs_secret_should_not_leave_logs');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('rejects cross-site payment method update starts', async () => {
    const env = createEnv({
      CHECKOUT_UI_MODE: 'custom',
      STRIPE_PUBLISHABLE_KEY_TEST: 'pk_test_pool_123'
    });

    const response = await worker.fetch(
      new Request('https://pool.test/pledge/payment-method/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.test',
          'Sec-Fetch-Site': 'cross-site'
        },
        body: JSON.stringify({ token: 'valid-token' })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
    await expect(response.json()).resolves.toEqual({ error: 'Origin not allowed' });
  });

  it('localizes payment-method update return URLs when preferredLang is provided', async () => {
    const env = createEnv({
      CHECKOUT_UI_MODE: 'custom',
      STRIPE_PUBLISHABLE_KEY_TEST: 'pk_test_pool_123'
    });

    const response = await worker.fetch(
      new Request('https://pool.test/pledge/payment-method/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'valid-token', preferredLang: 'es' })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    const sessionPayload = mockStripeClient.checkout.sessions.create.mock.calls.at(-1)?.[0];
    expect(sessionPayload.return_url).toBe('https://pool.test/es/manage/?t=valid-token');
  });

  it('localizes first-party checkout result URLs when preferredLang is provided', async () => {
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      CHECKOUT_UI_MODE: 'custom',
      STRIPE_PUBLISHABLE_KEY_TEST: 'pk_test_pool_123',
      CHECKOUT_INTENT_SECRET: 'checkout_secret_123',
      CHECKOUT_INTENTS: new MockCheckoutIntentNamespace(),
      TIER_INVENTORY_COORDINATOR: new MockTierInventoryNamespace()
    });

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          items: [{ id: 'hand-relations__frame-slot', quantity: 1 }],
          email: 'buyer@example.com',
          tipPercent: 5,
          preferredLang: 'es'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    const sessionPayload = mockStripeClient.checkout.sessions.create.mock.calls.at(-1)?.[0];
    expect(sessionPayload.return_url).toMatch(/^https:\/\/pool\.test\/es\/pledge-success\/\?orderId=pool-intent-/);
    expect(sessionPayload.metadata.preferredLang).toBe('es');
  });

  it('blocks modify requests that would move into a scarce tier reserved by another in-flight checkout', async () => {
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      CHECKOUT_INTENT_SECRET: 'checkout_secret_123',
      CHECKOUT_INTENTS: new MockCheckoutIntentNamespace()
    });
    const kv = env.PLEDGES as MockKVNamespace;
    const tierInventory = new StatefulTierInventoryNamespace(kv);
    (env as Record<string, unknown>).TIER_INVENTORY_COORDINATOR = tierInventory;

    await kv.put('pledge:order-first-party-modify-2', JSON.stringify({
      orderId: 'order-first-party-modify-2',
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

    const reserveResponse = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          items: [{ id: 'hand-relations__vip-pass', quantity: 1 }],
          email: 'other@example.com',
          tipPercent: 5
        })
      }),
      env,
      { waitUntil: () => {} }
    );
    expect(reserveResponse.status).toBe(200);

    mockVerifyToken.mockResolvedValue({
      orderId: 'order-first-party-modify-2',
      email: 'buyer@example.com',
      campaignSlug: 'hand-relations'
    });

    const response = await worker.fetch(
      new Request('https://pool.test/pledge/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'valid-token',
          newTierId: 'vip-pass',
          newTierQty: 1
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: 'Tier "vip-pass" is sold out',
      remaining: 0
    });
    expect(await kv.get('pledge:order-first-party-modify-2', { type: 'json' })).toMatchObject({
      tierId: 'frame-slot'
    });
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

  it('keeps scarce inventory stable across duplicate webhook delivery after reservation confirmation', async () => {
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      CHECKOUT_INTENT_SECRET: 'checkout_secret_123',
      CHECKOUT_INTENTS: new MockCheckoutIntentNamespace()
    });
    const kv = env.PLEDGES as MockKVNamespace;
    const tierInventory = new StatefulTierInventoryNamespace(kv);
    (env as Record<string, unknown>).TIER_INVENTORY_COORDINATOR = tierInventory;

    const startResponse = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          items: [{ id: 'hand-relations__vip-pass', quantity: 1 }],
          email: 'buyer@example.com',
          tipPercent: 5
        })
      }),
      env,
      { waitUntil: () => {} }
    );
    expect(startResponse.status).toBe(200);

    const sessionPayload = mockStripeClient.checkout.sessions.create.mock.calls.at(-1)?.[0];
    const orderId = sessionPayload.metadata.orderId;

    const webhookEvent = {
      id: 'evt_duplicate_after_confirm',
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          mode: 'setup',
          customer_email: 'buyer@example.com',
          customer: 'cus_123',
          setup_intent: 'seti_123',
          metadata: {
            orderId,
            campaignSlug: 'hand-relations',
            amountCents: '10000',
            tierId: 'vip-pass',
            tierName: 'VIP Pass',
            tierQty: '1',
            tipPercent: '5',
            hasAdditionalTiers: '',
            hasExtras: '',
            hasPhysical: '',
            isPaymentUpdate: '',
            checkoutProvider: 'first_party',
            checkoutNonce: sessionPayload.metadata.checkoutNonce,
            checkoutCartHash: sessionPayload.metadata.checkoutCartHash,
            checkoutSnapshotVersion: sessionPayload.metadata.checkoutSnapshotVersion
          }
        }
      }
    };

    const firstWebhook = await worker.fetch(
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
    const secondWebhook = await worker.fetch(
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

    expect(firstWebhook.status).toBe(200);
    expect(secondWebhook.status).toBe(200);
    expect(await kv.get('tier-reservation:hand-relations:' + orderId)).toBeNull();
    expect(await kv.get('tier-inventory:hand-relations', { type: 'json' })).toMatchObject({
      'vip-pass': { limit: 1, claimed: 1 }
    });

    const followupStart = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          items: [{ id: 'hand-relations__vip-pass', quantity: 1 }],
          email: 'another@example.com',
          tipPercent: 5
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(followupStart.status).toBe(400);
    expect(await followupStart.json()).toMatchObject({
      error: 'Tier "vip-pass" is sold out',
      remaining: 0
    });
  });

  it('persists first-party checkout sessions only when webhook cart integrity matches', async () => {
    const env = createEnv({
      TIER_INVENTORY_COORDINATOR: undefined
    });
    const kv = env.PLEDGES as MockKVNamespace;
    const tierInventory = new StatefulTierInventoryNamespace(kv);
    (env as Record<string, unknown>).TIER_INVENTORY_COORDINATOR = tierInventory;

    await kv.put('pending-tiers:order-first-party-good-1', JSON.stringify([{ id: 'vip-pass', qty: 1 }]));
    await kv.put('pending-extras:order-first-party-good-1', JSON.stringify({
      supportItems: [{ id: 'location-scouting', amount: 10 }],
      customAmount: 5
    }));
    await tierInventory.get(tierInventory.idFromName('hand-relations')).fetch(
      'https://tier-inventory-coordinator/reserve-selection',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          reservationId: 'order-first-party-good-1',
          nextCounts: { 'vip-pass': 1 },
          inventory: {
            'vip-pass': { limit: 1, claimed: 0 },
            'frame-slot': { limit: 1000, claimed: 0 },
            'creature-cameo': { limit: 1, claimed: 0 }
          }
        })
      }
    );

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
          taxDetails: {
            provider: 'flat',
            source: 'flat_rate',
            effectiveRate: 0.07875,
            destination: null,
            jurisdiction: null,
            taxableSubtotalCents: 12000,
            taxableShippingCents: 0,
            shippingTaxed: false,
            shippingCents: 0,
            breakdown: [{
              label: 'sales_tax',
              rate: 0.07875,
              taxableSubtotalCents: 12000,
              taxableShippingCents: 0,
              taxCents: 945
            }]
          },
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

    const waitUntilPromises: Promise<unknown>[] = [];

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
      { waitUntil: (promise) => { waitUntilPromises.push(promise); } }
    );

    expect(response.status).toBe(200);
    expect(await kv.get('pledge:order-first-party-good-1', { type: 'json' })).toMatchObject({
      orderId: 'order-first-party-good-1',
      tierId: 'frame-slot',
      additionalTiers: [{ id: 'vip-pass', qty: 1 }],
      supportItems: [{ id: 'location-scouting', amount: 10 }],
      customAmount: 5
    });
    expect(await kv.get('tier-reservation:hand-relations:order-first-party-good-1')).toBeNull();
    expect(tierInventory.calls).toContainEqual(expect.objectContaining({
      url: 'https://tier-inventory-coordinator/confirm-reservation',
      body: expect.objectContaining({
        campaignSlug: 'hand-relations',
        reservationId: 'order-first-party-good-1'
      })
    }));
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

    const waitUntilPromises: Promise<unknown>[] = [];

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
      { waitUntil: (promise) => { waitUntilPromises.push(promise); } }
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
    await Promise.allSettled(waitUntilPromises);
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

  it('does not rewrite rate-limit counters for repeated blocked requests inside the same window', async () => {
    const env = createEnv({
      RATELIMIT: new MockKVNamespace()
    });
    const rateLimitKv = env.RATELIMIT as MockKVNamespace;
    const now = Math.floor(Date.now() / 1000);

    await rateLimitKv.put('rl:votes:203.0.113.7', JSON.stringify({
      count: 45,
      reset: now + 60
    }));
    const putsBeforeBlockedRequests = rateLimitKv.putCalls.length;

    const firstResponse = await worker.fetch(
      new Request('https://pool.test/votes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.7'
        },
        body: JSON.stringify({
          token: 'fake-token',
          decisionId: 'poster',
          option: 'A'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    const secondResponse = await worker.fetch(
      new Request('https://pool.test/votes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.7'
        },
        body: JSON.stringify({
          token: 'fake-token',
          decisionId: 'poster',
          option: 'A'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(firstResponse.status).toBe(429);
    expect(secondResponse.status).toBe(429);
    expect(rateLimitKv.putCalls).toHaveLength(putsBeforeBlockedRequests);
    expect(await firstResponse.json()).toMatchObject({ error: 'Too many requests' });
    expect(await secondResponse.json()).toMatchObject({ error: 'Too many requests' });
  });

  it('adds test setup pledges to the campaign index used by stats and inventory rebuilds', async () => {
    const env = createEnv({
      ADMIN_SECRET: 'admin-secret',
      TAX_PROVIDER: 'nm_grt'
    });
    const kv = env.PLEDGES as MockKVNamespace;

    const setupResponse = await worker.fetch(
      new Request('https://pool.test/test/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'smoke-local@example.com',
          campaignSlug: 'smoke-editable'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(setupResponse.status).toBe(200);
    expect(await kv.get('campaign-pledges:smoke-editable', { type: 'json' })).toContain(
      'test-order-smoke-editable-smoke-local-example-com'
    );
    const storedPledge = await kv.get('pledge:test-order-smoke-editable-smoke-local-example-com', { type: 'json' });
    expect(storedPledge).toMatchObject({
      billingAddress: {
        country: 'US',
        state: 'NM',
        city: 'Corrales',
        postalCode: '87048',
        line1: '1228 W La Entrada'
      }
    });
  });

  it('seeds both configured admin test campaigns when no campaign is specified', async () => {
    const env = createEnv({
      ADMIN_SECRET: 'admin-secret',
      ADMIN_TEST_CAMPAIGNS: 'hand-relations,smoke-editable',
      TAX_PROVIDER: 'nm_grt'
    });
    const kv = env.PLEDGES as MockKVNamespace;

    const setupResponse = await worker.fetch(
      new Request('https://pool.test/test/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin-smoke@example.com'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(setupResponse.status).toBe(200);
    const body = await setupResponse.json();
    expect(body.pledges.map((pledge: { campaignSlug: string }) => pledge.campaignSlug)).toEqual([
      'hand-relations',
      'smoke-editable'
    ]);
    expect(body.manageLinks.map((link: { campaignSlug: string }) => link.campaignSlug)).toEqual([
      'hand-relations',
      'smoke-editable'
    ]);
    expect(await kv.get('campaign-pledges:hand-relations', { type: 'json' })).toContain(
      'test-order-hand-relations-admin-smoke-example-com'
    );
    expect(await kv.get('campaign-pledges:smoke-editable', { type: 'json' })).toContain(
      'test-order-smoke-editable-admin-smoke-example-com'
    );
  });

  it('repairs stale campaign indexes when recalculating stats', async () => {
    const env = createEnv({
      ADMIN_SECRET: 'admin-secret'
    });
    const kv = env.PLEDGES as MockKVNamespace;

    await kv.put('campaign-pledges:smoke-editable', JSON.stringify(['order-smoke-1']));
    await kv.put('pledge:order-smoke-1', JSON.stringify({
      orderId: 'order-smoke-1',
      email: 'supporter@example.com',
      campaignSlug: 'smoke-editable',
      tierId: 'standard-pass',
      tierQty: 1,
      subtotal: 1000,
      amount: 1139,
      pledgeStatus: 'active',
      charged: false
    }));
    await kv.put('pledge:order-smoke-2', JSON.stringify({
      orderId: 'order-smoke-2',
      email: 'supporter@example.com',
      campaignSlug: 'smoke-editable',
      tierId: 'standard-pass',
      tierQty: 2,
      subtotal: 2000,
      amount: 2278,
      pledgeStatus: 'active',
      charged: false
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/stats/smoke-editable/recalculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': 'admin-secret'
        }
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.stats).toMatchObject({
      campaignSlug: 'smoke-editable',
      pledgedAmount: 3000,
      pledgeCount: 2,
      tierCounts: {
        'standard-pass': 3
      }
    });
    expect(await kv.get('campaign-pledges:smoke-editable', { type: 'json' })).toEqual([
      'order-smoke-1',
      'order-smoke-2'
    ]);
  });

  it('recalculates inventory through the coordinator write path on the admin endpoint', async () => {
    const tierInventory = new MockTierInventoryNamespace();
    const env = createEnv({
      ADMIN_SECRET: 'admin-secret',
      TIER_INVENTORY_COORDINATOR: tierInventory
    });
    const kv = env.PLEDGES as MockKVNamespace;

    await kv.put('campaign-pledges:hand-relations', JSON.stringify(['order-1']));
    await kv.put('pledge:order-1', JSON.stringify({
      orderId: 'order-1',
      campaignSlug: 'hand-relations',
      tierId: 'vip-pass',
      tierQty: 1,
      pledgeStatus: 'active',
      charged: false
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/inventory/hand-relations/recalculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': 'admin-secret'
        }
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    expect(tierInventory.calls).toContainEqual(expect.objectContaining({
      url: 'https://tier-inventory-coordinator/replace',
      body: expect.objectContaining({
        campaignSlug: 'hand-relations',
        inventory: expect.objectContaining({
          'vip-pass': { limit: 1, claimed: 1 }
        })
      })
    }));
  });

  it('checks projection drift for a single campaign without mutating projection state', async () => {
    const env = createEnv({
      ADMIN_SECRET: 'admin-secret'
    });
    const kv = env.PLEDGES as MockKVNamespace;

    await kv.put('campaign-pledges:hand-relations', JSON.stringify(['order-hand-1']));
    await kv.put('stats:hand-relations', JSON.stringify({
      campaignSlug: 'hand-relations',
      pledgedAmount: 1000,
      pledgeCount: 1,
      tierCounts: { 'frame-slot': 1 },
      supportItems: {}
    }));
    await kv.put('tier-inventory:hand-relations', JSON.stringify({
      'vip-pass': { limit: 1, claimed: 0 }
    }));
    await kv.put('pledge:order-hand-1', JSON.stringify({
      orderId: 'order-hand-1',
      email: 'supporter@example.com',
      campaignSlug: 'hand-relations',
      tierId: 'frame-slot',
      tierQty: 1,
      subtotal: 1000,
      amount: 1139,
      pledgeStatus: 'active',
      charged: false
    }));
    await kv.put('pledge:order-hand-2', JSON.stringify({
      orderId: 'order-hand-2',
      email: 'supporter@example.com',
      campaignSlug: 'hand-relations',
      tierId: 'vip-pass',
      tierQty: 1,
      subtotal: 2500,
      amount: 2848,
      pledgeStatus: 'active',
      charged: false,
      supportItems: [{ id: 'location-scouting', amount: 5 }]
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/stats/hand-relations/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': 'admin-secret'
        }
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.inSync).toBe(false);
    expect(body.drift.checks.campaignIndex.missingOrderIds).toEqual(['order-hand-2']);
    expect(body.drift.checks.stats.differences.pledgedAmount).toEqual({ stored: 1000, expected: 3500 });
    expect(body.drift.checks.stats.differences.supportItems['location-scouting']).toEqual({ stored: 0, expected: 500 });
    expect(body.drift.checks.inventory.differences['vip-pass']).toEqual({
      stored: { limit: 1, claimed: 0 },
      expected: { limit: 1, claimed: 1 }
    });
    expect(await kv.get('campaign-pledges:hand-relations', { type: 'json' })).toEqual(['order-hand-1']);
  });

  it('checks projection drift across all campaigns and reports drifted slugs', async () => {
    const env = createEnv({
      ADMIN_SECRET: 'admin-secret'
    });
    const kv = env.PLEDGES as MockKVNamespace;

    await kv.put('campaign-pledges:smoke-editable', JSON.stringify(['order-smoke-1']));
    await kv.put('stats:smoke-editable', JSON.stringify({
      campaignSlug: 'smoke-editable',
      pledgedAmount: 1000,
      pledgeCount: 1,
      tierCounts: { 'standard-pass': 1 },
      supportItems: {}
    }));
    await kv.put('pledge:order-smoke-1', JSON.stringify({
      orderId: 'order-smoke-1',
      campaignSlug: 'smoke-editable',
      tierId: 'standard-pass',
      tierQty: 1,
      subtotal: 1000,
      pledgeStatus: 'active',
      charged: false
    }));
    await kv.put('pledge:order-smoke-2', JSON.stringify({
      orderId: 'order-smoke-2',
      campaignSlug: 'smoke-editable',
      tierId: 'limited-poster',
      tierQty: 1,
      subtotal: 2500,
      pledgeStatus: 'active',
      charged: false
    }));
    await kv.put('campaign-pledges:hand-relations', JSON.stringify([]));
    await kv.put('stats:hand-relations', JSON.stringify({
      campaignSlug: 'hand-relations',
      pledgedAmount: 0,
      pledgeCount: 0,
      tierCounts: {},
      supportItems: {}
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/admin/projections/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': 'admin-secret'
        }
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.inSync).toBe(false);
    expect(body.driftedCampaigns).toContain('smoke-editable');
    expect(body.results.find((entry) => entry.campaignSlug === 'smoke-editable')?.inSync).toBe(false);
  });

  it('recovers a missed checkout by confirming the existing reservation', async () => {
    const env = createEnv({
      ADMIN_SECRET: 'admin-secret',
      TIER_INVENTORY_COORDINATOR: undefined
    });
    const kv = env.PLEDGES as MockKVNamespace;
    const tierInventory = new StatefulTierInventoryNamespace(kv);
    (env as Record<string, unknown>).TIER_INVENTORY_COORDINATOR = tierInventory;

    await kv.put('pending-tiers:order-recover-1', JSON.stringify([{ id: 'vip-pass', qty: 1 }]));
    await kv.put('pending-extras:order-recover-1', JSON.stringify({
      supportItems: [{ id: 'location-scouting', amount: 10 }],
      customAmount: 5
    }));
    await tierInventory.get(tierInventory.idFromName('hand-relations')).fetch(
      'https://tier-inventory-coordinator/reserve-selection',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          reservationId: 'order-recover-1',
          nextCounts: { 'vip-pass': 1 },
          inventory: {
            'vip-pass': { limit: 1, claimed: 0 },
            'frame-slot': { limit: 1000, claimed: 0 },
            'creature-cameo': { limit: 1, claimed: 0 }
          }
        })
      }
    );

    mockStripeClient.checkout.sessions.retrieve.mockResolvedValueOnce({
      id: 'cs_recover_1',
      status: 'complete',
      mode: 'setup',
      customer_email: 'buyer@example.com',
      customer: 'cus_123',
      created: 1775000000,
      setup_intent: 'seti_123',
      metadata: {
        orderId: 'order-recover-1',
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
    });

    const response = await worker.fetch(
      new Request('https://pool.test/admin/recover-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': 'admin-secret'
        },
        body: JSON.stringify({
          sessionId: 'cs_recover_1',
          sendEmail: false
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    expect(await kv.get('pledge:order-recover-1', { type: 'json' })).toMatchObject({
      orderId: 'order-recover-1',
      campaignSlug: 'hand-relations',
      additionalTiers: [{ id: 'vip-pass', qty: 1 }]
    });
    expect(await kv.get('tier-reservation:hand-relations:order-recover-1')).toBeNull();
    expect(tierInventory.calls).toContainEqual(expect.objectContaining({
      url: 'https://tier-inventory-coordinator/confirm-reservation',
      body: expect.objectContaining({
        campaignSlug: 'hand-relations',
        reservationId: 'order-recover-1'
      })
    }));
  });

  it('self-completes a first-party checkout session when webhook persistence is still pending', async () => {
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      TIER_INVENTORY_COORDINATOR: undefined
    });
    const kv = env.PLEDGES as MockKVNamespace;
    const tierInventory = new StatefulTierInventoryNamespace(kv);
    (env as Record<string, unknown>).TIER_INVENTORY_COORDINATOR = tierInventory;

    const orderId = 'pool-intent-recover-1';
    const checkoutCartHash = await hashCheckoutBundle(buildCheckoutBundleHashInput({
      contributions: [{
        campaignSlug: 'hand-relations',
        canonicalContribution: {
          tierId: 'frame-slot',
          tierName: 'Buy 1 Frame',
          tierQty: 1,
          selectedTiers: [{ id: 'frame-slot', qty: 1 }],
          additionalTiers: [],
          supportItems: [],
          customAmount: 0,
          hasPhysical: false,
          totals: {
            subtotal: 500,
            tax: 39,
            taxDetails: {
              provider: 'flat',
              source: 'flat_rate',
              effectiveRate: 0.07875,
            destination: null,
            jurisdiction: null,
            taxableSubtotalCents: 500,
            taxableShippingCents: 0,
            shippingTaxed: false,
            shippingCents: 0,
            breakdown: [{
              label: 'sales_tax',
              rate: 0.07875,
              taxableSubtotalCents: 500,
              taxableShippingCents: 0,
              taxCents: 39
            }]
          },
          shipping: 0,
          tipPercent: 5,
            tipAmount: 25,
            amount: 564
          }
        },
        tipPercent: 5
      }]
    }));

    await kv.put('pending-checkout:pool-intent-recover-1', JSON.stringify({
      orderId,
      checkoutProvider: 'first_party',
      campaignCount: 1,
      tipPercent: 5,
      totals: {
        subtotal: 500,
        tax: 39,
        taxDetails: {
          provider: 'flat',
          source: 'flat_rate',
          effectiveRate: 0.07875,
          destination: null,
          jurisdiction: null,
          taxableSubtotalCents: 500,
          taxableShippingCents: 0,
          shippingTaxed: false,
          shippingCents: 0,
          breakdown: [{
            label: 'sales_tax',
            rate: 0.07875,
            taxableSubtotalCents: 500,
            taxableShippingCents: 0,
            taxCents: 39
          }]
        },
        shipping: 0,
        tipAmount: 25,
        amount: 564
      },
      campaigns: [{
        orderId,
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
          taxDetails: {
            provider: 'flat',
            source: 'flat_rate',
            effectiveRate: 0.07875,
            destination: null,
            jurisdiction: null,
            taxableSubtotalCents: 500,
            taxableShippingCents: 0,
            shippingTaxed: false,
            shippingCents: 0,
            breakdown: [{
              label: 'sales_tax',
              rate: 0.07875,
              taxableSubtotalCents: 500,
              taxableShippingCents: 0,
              taxCents: 39
            }]
          },
          shipping: 0,
          tipAmount: 25,
          amount: 564
        }
      }]
    }));

    mockStripeClient.checkout.sessions.retrieve.mockResolvedValueOnce({
      id: 'cs_complete_1',
      status: 'complete',
      mode: 'setup',
      customer_email: 'buyer@example.com',
      customer: 'cus_123',
      created: 1775000000,
      setup_intent: 'seti_123',
      metadata: {
        orderId,
        campaignSlug: 'hand-relations',
        amountCents: '500',
        tierId: 'frame-slot',
        tierName: 'Buy 1 Frame',
        tierQty: '1',
        tipPercent: '5',
        hasAdditionalTiers: '',
        hasExtras: '',
        hasPhysical: '',
        isPaymentUpdate: '',
        checkoutProvider: 'first_party',
        checkoutNonce: 'nonce_email_dedupe_1',
        checkoutCartHash,
        checkoutSnapshotVersion: '1'
      }
    });

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          sessionId: 'cs_complete_1'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
    await expect(response.json()).resolves.toEqual({
      success: true,
      recovered: true,
      persisted: true,
      orderId
    });
    expect(await kv.get(`pledge:${orderId}`, { type: 'json' })).toMatchObject({
      orderId,
      campaignSlug: 'hand-relations'
    });
  });

  it('does not block first-party checkout completion on supporter email delivery', async () => {
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      TIER_INVENTORY_COORDINATOR: undefined
    });
    const kv = env.PLEDGES as MockKVNamespace;
    const tierInventory = new StatefulTierInventoryNamespace(kv);
    (env as Record<string, unknown>).TIER_INVENTORY_COORDINATOR = tierInventory;

    const orderId = 'pool-intent-email-nonblocking-1';
    const checkoutCartHash = await hashCheckoutBundle(buildCheckoutBundleHashInput({
      contributions: [{
        campaignSlug: 'hand-relations',
        canonicalContribution: {
          tierId: 'frame-slot',
          tierName: 'Buy 1 Frame',
          tierQty: 1,
          selectedTiers: [{ id: 'frame-slot', qty: 1 }],
          additionalTiers: [],
          supportItems: [],
          customAmount: 0,
          hasPhysical: false,
          totals: {
            subtotal: 500,
            tax: 39,
            taxDetails: {
              provider: 'flat',
              source: 'flat_rate',
              effectiveRate: 0.07875,
              destination: null,
              jurisdiction: null,
              taxableSubtotalCents: 500,
              taxableShippingCents: 0,
              shippingTaxed: false,
              shippingCents: 0,
              breakdown: [{
                label: 'sales_tax',
                rate: 0.07875,
                taxableSubtotalCents: 500,
                taxableShippingCents: 0,
                taxCents: 39
              }]
            },
            shipping: 0,
            tipPercent: 5,
            tipAmount: 25,
            amount: 564
          }
        },
        tipPercent: 5
      }]
    }));

    await kv.put(`pending-checkout:${orderId}`, JSON.stringify({
      orderId,
      checkoutProvider: 'first_party',
      campaignCount: 1,
      tipPercent: 5,
      totals: {
        subtotal: 500,
        tax: 39,
        taxDetails: {
          provider: 'flat',
          source: 'flat_rate',
          effectiveRate: 0.07875,
          destination: null,
          jurisdiction: null,
          taxableSubtotalCents: 500,
          taxableShippingCents: 0,
          shippingTaxed: false,
          shippingCents: 0,
          breakdown: [{
            label: 'sales_tax',
            rate: 0.07875,
            taxableSubtotalCents: 500,
            taxableShippingCents: 0,
            taxCents: 39
          }]
        },
        shipping: 0,
        tipAmount: 25,
        amount: 564
      },
      campaigns: [{
        orderId,
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
          taxDetails: {
            provider: 'flat',
            source: 'flat_rate',
            effectiveRate: 0.07875,
            destination: null,
            jurisdiction: null,
            taxableSubtotalCents: 500,
            taxableShippingCents: 0,
            shippingTaxed: false,
            shippingCents: 0,
            breakdown: [{
              label: 'sales_tax',
              rate: 0.07875,
              taxableSubtotalCents: 500,
              taxableShippingCents: 0,
              taxCents: 39
            }]
          },
          shipping: 0,
          tipAmount: 25,
          amount: 564
        }
      }]
    }));

    mockStripeClient.checkout.sessions.retrieve.mockResolvedValueOnce({
      id: 'cs_complete_email_fail_1',
      status: 'complete',
      mode: 'setup',
      customer_email: 'buyer@example.com',
      customer: 'cus_123',
      created: 1775000000,
      setup_intent: 'seti_123',
      metadata: {
        orderId,
        campaignSlug: 'hand-relations',
        amountCents: '500',
        tierId: 'frame-slot',
        tierName: 'Buy 1 Frame',
        tierQty: '1',
        tipPercent: '5',
        hasAdditionalTiers: '',
        hasExtras: '',
        hasPhysical: '',
        isPaymentUpdate: '',
        checkoutProvider: 'first_party',
        checkoutNonce: 'nonce_email_nonblocking_1',
        checkoutCartHash,
        checkoutSnapshotVersion: '1'
      }
    });

    mockSendSupporterEmail.mockRejectedValueOnce(new Error('resend unavailable'));
    const waitUntilPromises: Promise<unknown>[] = [];

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          sessionId: 'cs_complete_email_fail_1'
        })
      }),
      env,
      { waitUntil: (promise) => { waitUntilPromises.push(promise); } }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      recovered: true,
      persisted: true,
      orderId
    });
    expect(await kv.get(`pledge:${orderId}`, { type: 'json' })).toMatchObject({
      orderId,
      campaignSlug: 'hand-relations'
    });
    await expect(kv.get(`pending-checkout:${orderId}`, { type: 'json' })).resolves.toMatchObject({
      confirmedAt: expect.any(String)
    });

    await Promise.allSettled(waitUntilPromises);
    expect(mockSendSupporterEmail).toHaveBeenCalledTimes(1);
    await expect(kv.get(`supporter-email-retry:${orderId}`, { type: 'json' })).resolves.toMatchObject({
      orderId,
      attempts: 1,
      lastError: 'resend unavailable'
    });
  });

  it('sends the initial supporter email only once even if recovery and webhook both process the same order', async () => {
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      CHECKOUT_INTENTS: new StatefulCheckoutIntentNamespace(),
      TIER_INVENTORY_COORDINATOR: undefined
    });
    const kv = env.PLEDGES as MockKVNamespace;
    const tierInventory = new StatefulTierInventoryNamespace(kv);
    (env as Record<string, unknown>).TIER_INVENTORY_COORDINATOR = tierInventory;

    const orderId = 'pool-intent-email-dedupe-1';
    const checkoutCartHash = await hashCheckoutBundle(buildCheckoutBundleHashInput({
      contributions: [{
        campaignSlug: 'hand-relations',
        canonicalContribution: {
          tierId: 'frame-slot',
          tierName: 'Buy 1 Frame',
          tierQty: 1,
          selectedTiers: [{ id: 'frame-slot', qty: 1 }],
          additionalTiers: [],
          supportItems: [],
          customAmount: 0,
          hasPhysical: false,
          totals: {
            subtotal: 500,
            tax: 39,
            taxDetails: {
              provider: 'flat',
              source: 'flat_rate',
              effectiveRate: 0.07875,
              destination: null,
              jurisdiction: null,
              taxableSubtotalCents: 500,
              taxableShippingCents: 0,
              shippingTaxed: false,
              shippingCents: 0,
              breakdown: [{
                label: 'sales_tax',
                rate: 0.07875,
                taxableSubtotalCents: 500,
                taxableShippingCents: 0,
                taxCents: 39
              }]
            },
            shipping: 0,
            tipPercent: 5,
            tipAmount: 25,
            amount: 564
          }
        },
        tipPercent: 5
      }]
    }));

    await kv.put(`pending-checkout:${orderId}`, JSON.stringify({
      orderId,
      checkoutProvider: 'first_party',
      campaignCount: 1,
      tipPercent: 5,
      totals: {
        subtotal: 500,
        tax: 39,
        taxDetails: {
          provider: 'flat',
          source: 'flat_rate',
          effectiveRate: 0.07875,
          destination: null,
          jurisdiction: null,
          taxableSubtotalCents: 500,
          taxableShippingCents: 0,
          shippingTaxed: false,
          shippingCents: 0,
          breakdown: [{
            label: 'sales_tax',
            rate: 0.07875,
            taxableSubtotalCents: 500,
            taxableShippingCents: 0,
            taxCents: 39
          }]
        },
        shipping: 0,
        tipAmount: 25,
        amount: 564
      },
      campaigns: [{
        orderId,
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
          taxDetails: {
            provider: 'flat',
            source: 'flat_rate',
            effectiveRate: 0.07875,
            destination: null,
            jurisdiction: null,
            taxableSubtotalCents: 500,
            taxableShippingCents: 0,
            shippingTaxed: false,
            shippingCents: 0,
            breakdown: [{
              label: 'sales_tax',
              rate: 0.07875,
              taxableSubtotalCents: 500,
              taxableShippingCents: 0,
              taxCents: 39
            }]
          },
          shipping: 0,
          tipAmount: 25,
          amount: 564
        }
      }]
    }));

    mockStripeClient.checkout.sessions.retrieve.mockResolvedValue({
      id: 'cs_email_dedupe_1',
      status: 'complete',
      mode: 'setup',
      customer_email: 'buyer@example.com',
      customer: 'cus_123',
      created: 1775000000,
      setup_intent: 'seti_123',
      metadata: {
        orderId,
        campaignSlug: 'hand-relations',
        amountCents: '500',
        tierId: 'frame-slot',
        tierName: 'Buy 1 Frame',
        tierQty: '1',
        tipPercent: '5',
        hasAdditionalTiers: '',
        hasExtras: '',
        hasPhysical: '',
        isPaymentUpdate: '',
        checkoutProvider: 'first_party',
        checkoutNonce: 'nonce_email_dedupe_1',
        checkoutCartHash,
        checkoutSnapshotVersion: '1'
      }
    });

    const recoveryResponse = await worker.fetch(
      new Request('https://pool.test/checkout-intent/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://pool.test'
        },
        body: JSON.stringify({
          orderId,
          sessionId: 'cs_email_dedupe_1'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(recoveryResponse.status).toBe(200);
    expect(mockSendSupporterEmail).toHaveBeenCalledTimes(1);

    await kv.delete(`pledge:${orderId}`);

    const webhookResponse = await worker.fetch(
      new Request('https://pool.test/webhooks/stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 'sig_test'
        },
        body: JSON.stringify({
          id: 'evt_email_dedupe_1',
          type: 'checkout.session.completed',
          livemode: false,
          data: {
            object: {
              id: 'cs_email_dedupe_1',
              mode: 'setup',
              customer_email: 'buyer@example.com',
              customer: 'cus_123',
              created: 1775000000,
              setup_intent: 'seti_123',
              metadata: {
                orderId,
                campaignSlug: 'hand-relations',
                amountCents: '500',
                tierId: 'frame-slot',
                tierName: 'Buy 1 Frame',
                tierQty: '1',
                tipPercent: '5',
                hasAdditionalTiers: '',
                hasExtras: '',
                hasPhysical: '',
                isPaymentUpdate: '',
                checkoutProvider: 'first_party',
                checkoutNonce: 'nonce_email_dedupe_1',
                checkoutCartHash,
                checkoutSnapshotVersion: '1'
              }
            }
          }
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(webhookResponse.status).toBe(200);
    expect(mockSendSupporterEmail).toHaveBeenCalledTimes(1);
  });

  it('rejects cross-site checkout completion recovery requests', async () => {
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party'
    });

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.test',
          'Sec-Fetch-Site': 'cross-site'
        },
        body: JSON.stringify({
          orderId: 'pool-intent-cross-site-1',
          sessionId: 'cs_complete_1'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
    await expect(response.json()).resolves.toEqual({ error: 'Origin not allowed' });
  });

  it('rate limits repeated checkout completion recovery attempts', async () => {
    const env = createEnv({
      CHECKOUT_PROVIDER: 'first_party',
      RATELIMIT: new MockKVNamespace()
    });
    const rateLimitKv = env.RATELIMIT as MockKVNamespace;
    await rateLimitKv.put('rl:complete:pool-intent-rate-limit-1', JSON.stringify({
      count: 12,
      reset: Math.floor(Date.now() / 1000) + 60
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://pool.test'
        },
        body: JSON.stringify({
          orderId: 'pool-intent-rate-limit-1',
          sessionId: 'cs_complete_1'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Too many requests'
    });
  });

  it('rate limits repeated checkout-intent abandon attempts per order before releasing reservations', async () => {
    const env = createEnv({
      RATELIMIT: new MockKVNamespace()
    });
    const rateLimitKv = env.RATELIMIT as MockKVNamespace;
    await rateLimitKv.put('rl:abandon:pool-intent-abandon-limit-1', JSON.stringify({
      count: 12,
      reset: Math.floor(Date.now() / 1000) + 60
    }));

    const pledgesKv = env.PLEDGES as MockKVNamespace;
    await pledgesKv.put('pending-checkout:pool-intent-abandon-limit-1', JSON.stringify({
      campaigns: [{ orderId: 'pool-intent-abandon-limit-1', campaignSlug: 'hand-relations' }]
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/abandon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orderId: 'pool-intent-abandon-limit-1'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(429);
    expect(await pledgesKv.get('pending-checkout:pool-intent-abandon-limit-1')).not.toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      error: 'Too many requests'
    });
  });

  it('rate limits repeated pledge reads without touching token verification', async () => {
    const env = createEnv({
      RATELIMIT: new MockKVNamespace()
    });
    const rateLimitKv = env.RATELIMIT as MockKVNamespace;
    await rateLimitKv.put('rl:pledge-read:203.0.113.8', JSON.stringify({
      count: 120,
      reset: Math.floor(Date.now() / 1000) + 60
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/pledges?token=fake-token', {
        headers: {
          'CF-Connecting-IP': '203.0.113.8'
        }
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(429);
    expect(mockVerifyToken).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: 'Too many requests'
    });
  });

  it('records webhook observability for invalid signatures and exposes it via admin status', async () => {
    const env = createEnv({
      ADMIN_SECRET: 'admin-secret'
    });
    mockVerifyStripeSignature.mockResolvedValueOnce({ valid: false, error: 'bad signature' });

    const webhookResponse = await worker.fetch(
      new Request('https://pool.test/webhooks/stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=1,v1=bad'
        },
        body: JSON.stringify({
          id: 'evt_invalid_sig_observability_1',
          type: 'checkout.session.completed',
          livemode: false,
          data: { object: {} }
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(webhookResponse.status).toBe(401);
    await Promise.resolve();
    await Promise.resolve();

    const summaryResponse = await worker.fetch(
      new Request('https://pool.test/admin/observability/webhooks?days=1', {
        headers: {
          'Authorization': 'Bearer admin-secret'
        }
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(summaryResponse.status).toBe(200);
    const summaryPayload = await summaryResponse.json();
    expect(summaryPayload.summaries[0]).toMatchObject({
      received: 1,
      outcomes: {
        invalid_signature: 1
      }
    });
    expect(summaryPayload.recent[0]).toMatchObject({
      eventId: '',
      outcome: 'invalid_signature',
      status: 401
    });
  });

  it('records sampled performance observations and exposes them via admin status', async () => {
    const env = createEnv({
      ADMIN_SECRET: 'admin-secret',
      OBSERVABILITY_SAMPLE_RATE: '1'
    });

    const abandonResponse = await worker.fetch(
      new Request('https://pool.test/checkout-intent/abandon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orderId: 'pool-intent-observe-1'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(abandonResponse.status).toBe(200);
    await Promise.resolve();
    await Promise.resolve();

    const summaryResponse = await worker.fetch(
      new Request('https://pool.test/admin/observability/performance?days=1', {
        headers: {
          'Authorization': 'Bearer admin-secret'
        }
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(summaryResponse.status).toBe(200);
    const summaryPayload = await summaryResponse.json();
    expect(summaryPayload).toMatchObject({
      sampleRate: 1
    });
    expect(summaryPayload.summaries[0].operations.checkout_intent_abandon).toMatchObject({
      count: 1
    });
  });

  it('rate limits repeated pledge mutations before token validation', async () => {
    const env = createEnv({
      RATELIMIT: new MockKVNamespace()
    });
    const rateLimitKv = env.RATELIMIT as MockKVNamespace;
    await rateLimitKv.put('rl:pledge-write:203.0.113.9', JSON.stringify({
      count: 30,
      reset: Math.floor(Date.now() / 1000) + 60
    }));

    const response = await worker.fetch(
      new Request('https://pool.test/pledge/modify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.9'
        },
        body: JSON.stringify({
          token: 'fake-token',
          orderId: 'pool-intent-limit-test'
        })
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(429);
    expect(mockVerifyToken).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: 'Too many requests'
    });
  });

  it('rejects oversized checkout-start payloads before parsing', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String((64 * 1024) + 1)
        },
        body: '{}'
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(413);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
    await expect(response.json()).resolves.toEqual({
      error: 'Request body too large'
    });
  });

  it('rejects oversized webhook payloads before signature verification', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/webhooks/stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String((256 * 1024) + 1),
          'stripe-signature': 't=1,v1=fake'
        },
        body: '{}'
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(413);
    expect(mockVerifyStripeSignature).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: 'Request body too large'
    });
  });

  it('rejects malformed admin recover-checkout JSON before Stripe lookup', async () => {
    const env = createEnv({
      ADMIN_SECRET: 'admin-secret'
    });

    const response = await worker.fetch(
      new Request('https://pool.test/admin/recover-checkout', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer admin-secret',
          'Content-Type': 'application/json'
        },
        body: '{'
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(400);
    expect(mockStripeClient.checkout.sessions.retrieve).not.toHaveBeenCalled();
    expect(mockStripeClient.checkout.sessions.list).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid JSON'
    });
  });

  it('allows empty admin diary-check posts without a JSON content type', async () => {
    const env = createEnv({
      ADMIN_SECRET: 'admin-secret'
    });

    const response = await worker.fetch(
      new Request('https://pool.test/admin/diary/check', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer admin-secret'
        }
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      dryRun: false,
      checked: 4
    });
  });

  it('does not rebroadcast diary updates when a legacy sent date only differs by seconds', async () => {
    __resetCampaignRuntimeStateForTests();
    const env = createEnv({
      ADMIN_SECRET: 'admin-secret'
    });
    const kv = env.PLEDGES as MockKVNamespace;
    await kv.put('campaign-pledges:hand-relations', JSON.stringify(['order-diary-1']));
    await kv.put('pledge:order-diary-1', JSON.stringify({
      orderId: 'order-diary-1',
      campaignSlug: 'hand-relations',
      email: 'supporter@example.com',
      pledgeStatus: 'active'
    }));
    await kv.put('diary-sent:hand-relations', JSON.stringify(['2026-05-27T13:42:00-06:00']));
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({
          campaigns: [{
            ...campaignFixture,
            diary: [{
              title: 'THANK YOU!!!!',
              date: '2026-05-27T13:42-06:00',
              phase: 'fundraising',
              content: [{ type: 'text', body: 'Same update body.' }]
            }]
          }]
        });
      }
      if (url === 'https://pool.test/api/add-ons.json') {
        return jsonResponse(addOnCatalogFixture);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const response = await worker.fetch(
      new Request('https://pool.test/admin/diary/check', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer admin-secret'
        }
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      newEntries: [],
      sent: 0,
      failed: 0
    });
    expect(mockSendDiaryUpdateEmail).not.toHaveBeenCalled();
    const markers = JSON.parse(kv.store.get('diary-sent:hand-relations') || '[]');
    expect(markers).toContain('2026-05-27T13:42:00-06:00');
    expect(markers).toContain('date:2026-05-27T13:42-06:00');
  });

  it('tracks diary broadcasts by stable entry id so title and date edits do not resend', async () => {
    __resetCampaignRuntimeStateForTests();
    const env = createEnv({
      ADMIN_SECRET: 'admin-secret'
    });
    const kv = env.PLEDGES as MockKVNamespace;
    await kv.put('campaign-pledges:hand-relations', JSON.stringify(['order-diary-2']));
    await kv.put('pledge:order-diary-2', JSON.stringify({
      orderId: 'order-diary-2',
      campaignSlug: 'hand-relations',
      email: 'supporter@example.com',
      pledgeStatus: 'active'
    }));
    await kv.put('diary-sent:hand-relations', JSON.stringify(['id:thank-you']));
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({
          campaigns: [{
            ...campaignFixture,
            diary: [{
              id: 'thank-you',
              title: 'THANK YOU!!!!',
              date: '2026-05-28T09:15-06:00',
              phase: 'fundraising',
              content: [{ type: 'text', body: 'Updated copy for the same diary entry.' }]
            }]
          }]
        });
      }
      if (url === 'https://pool.test/api/add-ons.json') {
        return jsonResponse(addOnCatalogFixture);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const response = await worker.fetch(
      new Request('https://pool.test/admin/diary/check', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer admin-secret'
        }
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      newEntries: [],
      sent: 0,
      failed: 0
    });
    expect(mockSendDiaryUpdateEmail).not.toHaveBeenCalled();
  });

  it('broadcasts and marks only genuinely new diary entry ids', async () => {
    __resetCampaignRuntimeStateForTests();
    const env = createEnv({
      ADMIN_SECRET: 'admin-secret'
    });
    const kv = env.PLEDGES as MockKVNamespace;
    await kv.put('campaign-pledges:hand-relations', JSON.stringify(['order-diary-3']));
    await kv.put('pledge:order-diary-3', JSON.stringify({
      orderId: 'order-diary-3',
      campaignSlug: 'hand-relations',
      email: 'supporter@example.com',
      pledgeStatus: 'active'
    }));
    await kv.put('diary-sent:hand-relations', JSON.stringify(['id:older-update']));
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({
          campaigns: [{
            ...campaignFixture,
            diary: [{
              id: 'new-update',
              title: 'New update',
              date: '2026-05-29T08:00-06:00',
              phase: 'fundraising',
              content: [{ type: 'text', body: 'This is new.' }]
            }]
          }]
        });
      }
      if (url === 'https://pool.test/api/add-ons.json') {
        return jsonResponse(addOnCatalogFixture);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const response = await worker.fetch(
      new Request('https://pool.test/admin/diary/check', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer admin-secret'
        }
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      newEntries: [expect.objectContaining({ id: 'new-update', title: 'New update' })],
      sent: 1,
      failed: 0
    });
    expect(mockSendDiaryUpdateEmail).toHaveBeenCalledTimes(1);
    const markers = JSON.parse(kv.store.get('diary-sent:hand-relations') || '[]');
    expect(markers).toContain('id:new-update');
  });

  it('rejects checkout-intent abandon requests without application/json bodies', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request('https://pool.test/checkout-intent/abandon', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: '{"orderId":"pool-intent-abandon-1"}'
      }),
      env,
      { waitUntil: () => {} }
    );

    expect(response.status).toBe(415);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
    await expect(response.json()).resolves.toEqual({
      error: 'Expected application/json request body'
    });
  });
});
