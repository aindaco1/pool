import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  sendChargeSuccessEmail,
  sendAbandonedCartEmail,
  sendLaunchReminderEmail,
  sendPaymentFailedEmail,
  sendPledgeCancelledEmail,
  sendPledgeModifiedEmail,
  sendSupporterEmail
} from '../../worker/src/email.js';

const env = {
  RESEND_API_KEY: 'test_resend_key',
  SITE_BASE: 'https://pool.test',
  PLATFORM_NAME: 'The Pool',
  PLATFORM_COMPANY_NAME: 'Dust Wave',
  SUPPORT_EMAIL: 'info@pool.test',
  PLEDGES_EMAIL_FROM: 'The Pool <pledges@pool.test>',
  UPDATES_EMAIL_FROM: 'The Pool <updates@pool.test>',
  I18N_CATALOG_JSON: JSON.stringify({ en: { email: {} } })
};

const PLATFORM_TIP_LINE = `${env.PLATFORM_COMPANY_NAME} tip (6%): $2.10`;

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
  const [, init] = fetchMock.mock.calls.at(-1) || [];
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
    expect(payload.from).toBe('The Pool <pledges@pool.test>');
    expect(payload.reply_to).toBe('info@pool.test');
    expect(payload.text).toContain('Total (if funded): $42.86');
  });

  it('uses a consistent subject format across transactional pledge emails', async () => {
    let fetchMock = mockResend();

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

    expect(getEmailPayload(fetchMock).subject).toBe('Pledge confirmed | sunder');

    fetchMock = mockResend();

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

    expect(getEmailPayload(fetchMock).subject).toBe('Pledge updated | sunder');

    fetchMock = mockResend();

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

    expect(getEmailPayload(fetchMock).subject).toBe('Update payment method | sunder');

    fetchMock = mockResend();

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

    expect(getEmailPayload(fetchMock).subject).toBe('Payment confirmed | sunder');

    fetchMock = mockResend();

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

    expect(getEmailPayload(fetchMock).subject).toBe('Pledge cancelled | sunder');
  });

  it('sends launch reminders through the shared updates email path', async () => {
    const fetchMock = mockResend();

    await sendLaunchReminderEmail(env, {
      email: 'fan@example.com',
      campaignSlug: 'sunder',
      campaignTitle: 'Sunder',
      campaignUrl: 'https://pool.test/campaigns/sunder/',
      unsubscribeUrl: 'https://pledge.pool.test/launch-reminders/unsubscribe?t=token',
      preferredLang: 'en'
    });

    const payload = getEmailPayload(fetchMock);
    expect(payload.from).toBe('The Pool <updates@pool.test>');
    expect(payload.to).toBe('fan@example.com');
    expect(payload.subject).toBe('Now live | Sunder');
    expect(payload.html).toContain('Sunder is live');
    expect(payload.html).toContain('https://pool.test/campaigns/sunder/');
    expect(payload.html).toContain('https://pledge.pool.test/launch-reminders/unsubscribe?t=token');
    expect(payload.headers).toMatchObject({
      'List-Unsubscribe': '<https://pledge.pool.test/launch-reminders/unsubscribe?t=token>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    });
    expect(payload.reply_to).toBe('info@pool.test');
  });

  it('adds one-click unsubscribe headers to abandoned checkout reminders', async () => {
    const fetchMock = mockResend();

    await sendAbandonedCartEmail(env, {
      email: 'fan@example.com',
      campaignSlug: 'sunder',
      campaignTitle: 'Sunder',
      campaignUrl: 'https://pool.test/campaigns/sunder/',
      unsubscribeUrl: 'https://pledge.pool.test/abandoned-cart/unsubscribe?t=token',
      preferredLang: 'en'
    });

    const payload = getEmailPayload(fetchMock);
    expect(payload.from).toBe('The Pool <updates@pool.test>');
    expect(payload.to).toBe('fan@example.com');
    expect(payload.headers).toMatchObject({
      'List-Unsubscribe': '<https://pledge.pool.test/abandoned-cart/unsubscribe?t=token>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    });
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
    expect(payload.html).toContain('Dust Wave tip changed:');
    expect(payload.html).toContain('$1.75 → $2.10 (+$0.35, 6%)');
    expect(payload.html).toContain('New total (if funded): $42.86');
    expect(payload.from).toBe('The Pool <pledges@pool.test>');
    expect(payload.reply_to).toBe('info@pool.test');
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
    expect(payload.from).toBe('The Pool <pledges@pool.test>');
    expect(payload.reply_to).toBe('info@pool.test');
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
    expect(payload.from).toBe('The Pool <pledges@pool.test>');
    expect(payload.reply_to).toBe('info@pool.test');
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
    expect(payload.from).toBe('The Pool <pledges@pool.test>');
    expect(payload.reply_to).toBe('info@pool.test');
  });

  it('uses stored tax details for the email tax label', async () => {
    const fetchMock = mockResend();

    await sendSupporterEmail(env, {
      email: 'supporter@example.com',
      campaignSlug: 'sunder',
      campaignTitle: 'sunder',
      subtotal: 3500,
      tax: 311,
      taxDetails: {
        effectiveRate: 0.08875,
        destination: {
          country: 'US',
          postalCode: '80205'
        }
      },
      shipping: 300,
      tipAmount: 210,
      tipPercent: 6,
      token: 'magic-token'
    });

    const payload = getEmailPayload(fetchMock);
    expect(payload.html).toContain('Sales tax (8.875%)');
    expect(payload.html).not.toContain('Sales tax (7.875%)');
  });

  it('uses Spanish email copy when preferredLang is es', async () => {
    const fetchMock = mockResend();

    await sendSupporterEmail(
      {
        ...env,
        I18N_CATALOG_JSON: JSON.stringify({
          en: { email: {} },
          es: {
            email: {
              subjects: { pledge_confirmed: 'Aporte confirmado' },
              supporter: { thanks_heading: '¡Gracias por apoyar %{campaign}!' },
              common: {
                total_if_funded: 'Total (si se financia)',
                manage_your_pledge: 'Gestiona tu aporte'
              }
            }
          }
        })
      },
      {
        email: 'supporter@example.com',
        campaignSlug: 'sunder',
        campaignTitle: 'sunder',
        subtotal: 3500,
        tax: 276,
        shipping: 300,
        tipAmount: 210,
        tipPercent: 6,
        token: 'magic-token',
        preferredLang: 'es'
      }
    );

    const payload = getEmailPayload(fetchMock);
    expect(payload.subject).toBe('Aporte confirmado | sunder');
    expect(payload.html).toContain('¡Gracias por apoyar sunder!');
    expect(payload.html).toContain('Gestiona tu aporte');
    expect(payload.html).toContain('Total (si se financia): $42.86');
  });
});
