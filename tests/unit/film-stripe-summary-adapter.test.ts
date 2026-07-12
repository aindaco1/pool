import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import worker from '../../worker/src/index.js';
import { __resetCampaignRuntimeStateForTests } from '../../worker/src/campaigns.js';

class MockKVNamespace {
  store = new Map<string, string>();

  async get(key: string, options?: { type?: string }) {
    if (!this.store.has(key)) return null;
    const value = this.store.get(key) as string;
    if (options?.type === 'json') return JSON.parse(value);
    return value;
  }

  async put(key: string, value: string) {
    this.store.set(key, value);
  }
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function buildEnv(pledges = new MockKVNamespace()) {
  return {
    SITE_BASE: 'https://pool.test',
    CORS_ALLOWED_ORIGIN: 'https://film.test',
    APP_MODE: 'test',
    FILM_STRIPE_SUMMARY_ADAPTER_SECRET: 'film-adapter-secret',
    PLEDGES: pledges,
    RATELIMIT: new MockKVNamespace()
  } as any;
}

async function fetchPoolSummary(env: any, token = 'film-adapter-secret') {
  return worker.fetch(new Request('https://pool.test/film/stripe-summary', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '127.0.0.1'
    },
    body: JSON.stringify({
      workspaceId: 'workspace_acme',
      projectId: 'proj_echoes',
      source: 'pool',
      mappedRefs: ['campaign-echoes'],
      dataBoundary: 'summary_only',
      requestedFields: [
        'grossAmountCents',
        'feeAmountCents',
        'netAmountCents',
        'pledgedAmountCents',
        'chargedAmountCents',
        'paymentFailedAmountCents',
        'paymentCount',
        'paymentFailedCount'
      ]
    })
  }), env, { waitUntil: () => {} });
}

describe('Film Stripe summary adapter for Pool', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto);
    __resetCampaignRuntimeStateForTests();
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({
          campaigns: [{
            slug: 'campaign-echoes',
            title: 'Echoes',
            state: 'live',
            goal_amount: 100000,
            url: '/campaigns/campaign-echoes/'
          }]
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns only summary-only aggregate money and count fields', async () => {
    const pledges = new MockKVNamespace();
    await pledges.put('campaign-pledges:campaign-echoes', JSON.stringify(['order_charged', 'order_active', 'order_failed']));
    await pledges.put('pledge:order_charged', JSON.stringify({
      orderId: 'order_charged',
      campaignSlug: 'campaign-echoes',
      email: 'supporter@example.com',
      pledgeStatus: 'charged',
      charged: true,
      amount: 120000,
      subtotal: 120000,
      stripePaymentIntentId: 'pi_should_not_return',
      stripeFinancials: {
        source: 'actual',
        paymentIntentId: 'pi_should_not_return',
        balanceTransactionId: 'txn_should_not_return',
        grossAmount: 120000,
        feeAmount: 4000,
        netAmount: 116000
      }
    }));
    await pledges.put('pledge:order_active', JSON.stringify({
      orderId: 'order_active',
      campaignSlug: 'campaign-echoes',
      pledgeStatus: 'active',
      amount: 30000,
      subtotal: 30000
    }));
    await pledges.put('pledge:order_failed', JSON.stringify({
      orderId: 'order_failed',
      campaignSlug: 'campaign-echoes',
      pledgeStatus: 'payment_failed',
      amount: 10000,
      subtotal: 10000,
      lastPaymentError: 'card_declined'
    }));

    const response = await fetchPoolSummary(buildEnv(pledges));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      source: 'pool',
      status: 'available',
      currency: 'USD',
      dataBoundary: 'summary_only',
      mappedRefCount: 1,
      matchedRefCount: 1,
      missingRefCount: 0,
      totals: {
        grossAmountCents: 120000,
        feeAmountCents: 4000,
        netAmountCents: 116000,
        pledgedAmountCents: 160000,
        chargedAmountCents: 120000,
        paymentFailedAmountCents: 10000
      },
      counts: {
        paymentCount: 1,
        paymentFailedCount: 1
      }
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('pi_should_not_return');
    expect(serialized).not.toContain('txn_should_not_return');
    expect(serialized).not.toContain('supporter@example.com');
    expect(Array.from(pledges.store.keys()).some((key) => key.includes('film_stripe_summary_adapter:read'))).toBe(true);
  });

  it('rejects requests without the adapter bearer token', async () => {
    const response = await fetchPoolSummary(buildEnv(), 'wrong-token');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'Unauthorized' });
  });

  it('fails closed when the adapter secret is not configured', async () => {
    const env = buildEnv();
    delete env.FILM_STRIPE_SUMMARY_ADAPTER_SECRET;

    const response = await fetchPoolSummary(env);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Film Stripe summary adapter is not configured'
    });
  });
});
