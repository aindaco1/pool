import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  sendAnnouncementEmail,
  sendDiaryUpdateEmail,
  sendMilestoneEmail,
  sendSupporterEmail
} from '../../worker/src/email.js';

const env = {
  RESEND_API_KEY: 'test_resend_key',
  SITE_BASE: 'https://pool.test',
  PLATFORM_AUTHOR: 'Dust Wave'
};

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

describe('email HTML security', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('escapes campaign and pledge item content in supporter emails and drops invalid instagram links', async () => {
    const fetchMock = mockResend();

    await sendSupporterEmail(env, {
      email: 'supporter@example.com',
      campaignSlug: 'sunder',
      campaignTitle: '<img src=x onerror=alert(1)>',
      subtotal: 3500,
      tax: 276,
      shipping: 300,
      tipAmount: 210,
      tipPercent: 6,
      token: 'magic-token',
      instagramUrl: 'javascript:alert(1)',
      pledgeItems: {
        tierName: '<svg onload=alert(2)>',
        tierQty: 1,
        supportItems: [{ label: '<b>lab</b>', amount: 12 }]
      }
    });

    const payload = getEmailPayload(fetchMock);
    expect(payload.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(payload.html).toContain('&lt;svg onload=alert(2)&gt;');
    expect(payload.html).toContain('&lt;b&gt;lab&lt;/b&gt;');
    expect(payload.html).not.toContain('javascript:alert(1)');
    expect(payload.html).not.toContain('Share to your Story!');
  });

  it('uses a public https asset base for instagram email icons even in local dev', async () => {
    const fetchMock = mockResend();

    await sendSupporterEmail(
      {
        ...env,
        SITE_BASE: 'http://127.0.0.1:4000'
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
        instagramUrl: 'https://www.instagram.com/dustwave.xyz/'
      }
    );

    const payload = getEmailPayload(fetchMock);
    expect(payload.html).toContain('https://pool.dustwave.xyz/assets/images/instagram-white.png');
    expect(payload.html).not.toContain('http://127.0.0.1:4000/assets/images/instagram-white.png');
  });

  it('escapes diary content in update emails', async () => {
    const fetchMock = mockResend();

    await sendDiaryUpdateEmail(env, {
      email: 'supporter@example.com',
      campaignSlug: 'sunder',
      campaignTitle: 'sunder',
      diaryTitle: '<img src=x onerror=alert(1)>',
      diaryExcerpt: 'line 1\n<script>alert(2)</script>',
      diaryPhase: 'edit',
      token: 'magic-token'
    });

    const payload = getEmailPayload(fetchMock);
    expect(payload.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(payload.html).toContain('line 1<br>&lt;script&gt;alert(2)&lt;/script&gt;');
    expect(payload.html).not.toContain('<script>alert(2)</script>');
  });

  it('sanitizes announcement body and omits unsafe CTA urls', async () => {
    const fetchMock = mockResend();

    await sendAnnouncementEmail(env, {
      email: 'supporter@example.com',
      campaignSlug: 'sunder',
      campaignTitle: 'sunder',
      subject: 'Important update',
      heading: '<svg onload=alert(1)>',
      body: 'Heads up<script>alert(2)</script>',
      ctaLabel: '<b>Click me</b>',
      ctaUrl: 'javascript:alert(3)',
      token: 'magic-token'
    });

    const payload = getEmailPayload(fetchMock);
    expect(payload.html).toContain('&lt;svg onload=alert(1)&gt;');
    expect(payload.html).toContain('Heads up&lt;script&gt;alert(2)&lt;/script&gt;');
    expect(payload.html).not.toContain('javascript:alert(3)');
    expect(payload.html).not.toContain('&lt;b&gt;Click me&lt;/b&gt;');
  });

  it('escapes stretch goal names in milestone emails', async () => {
    const fetchMock = mockResend();

    await sendMilestoneEmail(env, {
      email: 'supporter@example.com',
      campaignSlug: 'sunder',
      campaignTitle: 'sunder',
      milestone: 'stretch',
      pledgedAmount: 500000,
      goalAmount: 250000,
      stretchGoalName: '<img src=x onerror=alert(1)>',
      token: 'magic-token'
    });

    const payload = getEmailPayload(fetchMock);
    expect(payload.html).toContain('Stretch Goal Unlocked: &lt;img src=x onerror=alert(1)&gt;');
    expect(payload.html).not.toContain('<img src=x onerror=alert(1)>');
  });
});
