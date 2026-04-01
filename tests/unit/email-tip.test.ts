import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  sendChargeSuccessEmail,
  sendPaymentFailedEmail,
  sendPledgeCancelledEmail,
  sendPledgeModifiedEmail,
  sendSupporterEmail
} from '../../worker/src/email.js';

const env = {
  RESEND_API_KEY: 'test_resend_key',
  SITE_BASE: 'https://pool.test',
  PLATFORM_AUTHOR: 'Dust Wave'
};

const PLATFORM_TIP_LINE = `${env.PLATFORM_AUTHOR} tip (6%): $2.10`;

function mockResend() {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => ({ id: 'email_test_123' }),
    text: async () => '',
    init
  }));

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function getEmailPayload(fetchMock: ReturnType<typeof mockResend>) {
  const [, init] = fetchMock.mock.calls[0];
  return JSON.parse(String(init?.body || '{}'));
}

describe('supporter email tip breakdowns', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('includes the platform tip line in supporter confirmation emails', async () => {
    const fetchMock = mockResend();

    await sendSupporterEmail(env, {
      email: 'supporter@example.com',
      campaignSlug: 'sunder',
      campaignTitle: 'sunder',
      subtotal: 3500,
      tax: 276,
      shipping: 300,
      tipAmount: 210,
      tipPercent: 6,
      token: 'magic-token'
    });

    const payload = getEmailPayload(fetchMock);
    expect(payload.html).toContain(PLATFORM_TIP_LINE);
    expect(payload.html).toContain('Total (if funded): $42.86');
  });

  it('includes the platform tip line in pledge modified emails', async () => {
    const fetchMock = mockResend();

    await sendPledgeModifiedEmail(env, {
      email: 'supporter@example.com',
      campaignSlug: 'sunder',
      campaignTitle: 'sunder',
      previousSubtotal: 3500,
      previousTax: 276,
      previousShipping: 300,
      previousTipAmount: 175,
      newSubtotal: 3500,
      tax: 276,
      shipping: 300,
      tipAmount: 210,
      tipPercent: 6,
      token: 'magic-token'
    });

    const payload = getEmailPayload(fetchMock);
    expect(payload.html).toContain(PLATFORM_TIP_LINE);
    expect(payload.html).toContain('New total (if funded): $42.86');
  });

  it('includes the platform tip line in payment failed emails', async () => {
    const fetchMock = mockResend();

    await sendPaymentFailedEmail(env, {
      email: 'supporter@example.com',
      campaignSlug: 'sunder',
      campaignTitle: 'sunder',
      subtotal: 3500,
      tax: 276,
      shipping: 300,
      tipAmount: 210,
      tipPercent: 6,
      amount: 4286,
      token: 'magic-token'
    });

    const payload = getEmailPayload(fetchMock);
    expect(payload.html).toContain(PLATFORM_TIP_LINE);
    expect(payload.html).toContain('Amount due: $42.86');
  });

  it('includes the platform tip line in charge success emails', async () => {
    const fetchMock = mockResend();

    await sendChargeSuccessEmail(env, {
      email: 'supporter@example.com',
      campaignSlug: 'sunder',
      campaignTitle: 'sunder',
      subtotal: 3500,
      tax: 276,
      shipping: 300,
      tipAmount: 210,
      tipPercent: 6,
      amount: 4286,
      token: 'magic-token'
    });

    const payload = getEmailPayload(fetchMock);
    expect(payload.html).toContain(PLATFORM_TIP_LINE);
    expect(payload.html).toContain('Amount charged: $42.86');
  });

  it('includes the platform tip line in cancellation emails', async () => {
    const fetchMock = mockResend();

    await sendPledgeCancelledEmail(env, {
      email: 'supporter@example.com',
      campaignSlug: 'sunder',
      campaignTitle: 'sunder',
      subtotal: 3500,
      tax: 276,
      shipping: 300,
      tipAmount: 210,
      tipPercent: 6,
      amount: 4286
    });

    const payload = getEmailPayload(fetchMock);
    expect(payload.html).toContain(PLATFORM_TIP_LINE);
    expect(payload.html).toContain('Released total: $42.86');
  });
});
