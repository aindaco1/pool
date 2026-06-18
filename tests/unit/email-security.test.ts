import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  sendAnnouncementEmail,
  sendCampaignAssignmentEmail,
  sendCampaignPreviewEmail,
  sendCampaignRunnerReportEmail,
  sendDiaryUpdateEmail,
  sendMilestoneEmail,
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

  it('includes sanitized provider details when Resend rejects an email', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({}),
      text: async () => JSON.stringify({
        message: 'The sender domain is not verified.',
        name: 'validation_error'
      })
    })));

    await expect(sendSupporterEmail(env, {
      email: 'supporter@example.com',
      campaignSlug: 'sunder',
      campaignTitle: 'sunder',
      subtotal: 3500,
      tax: 276,
      shipping: 300,
      tipAmount: 210,
      tipPercent: 6,
      token: 'magic-token'
    })).rejects.toThrow('Failed to send email: 403 (The sender domain is not verified. validation_error)');
  });

  it('keeps supporter Instagram CTAs lightweight in local dev', async () => {
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
    expect(payload.html).toContain('Share this campaign on Instagram');
    expect(payload.html).not.toContain('/assets/images/instagram-white.png');
    expect(payload.reply_to).toBe('info@pool.test');
  });

  it('sends campaign assignment emails with escaped campaign and assignee details', async () => {
    const fetchMock = mockResend();

    await sendCampaignAssignmentEmail(env, {
      email: 'creator@example.com',
      name: '<Creator>',
      campaignTitle: '<New Film>',
      campaignSlug: 'new-film',
      assignedBy: 'admin@example.com',
      lang: 'en'
    });

    const payload = getEmailPayload(fetchMock);
    expect(payload).toMatchObject({
      to: 'creator@example.com',
      subject: 'Campaign assigned | The Pool'
    });
    expect(payload.html).toContain('&lt;Creator&gt;');
    expect(payload.html).toContain('&lt;New Film&gt;');
    expect(payload.html).toContain('Open admin dashboard');
    expect(payload.html).toContain('https://pool.test/admin/');
    expect(payload.html).toContain('Assigned by admin@example.com');
  });

  it('sends private campaign preview emails with 24-hour expiry copy', async () => {
    const fetchMock = mockResend();

    await sendCampaignPreviewEmail(env, {
      email: 'reviewer@example.com',
      campaignTitle: '<Private Film>',
      previewUrl: 'https://pool.test/campaigns/private-film/preview/?t=secret-token',
      expiresHours: 24,
      invitedBy: 'admin@example.com',
      lang: 'en'
    });

    const payload = getEmailPayload(fetchMock);
    expect(payload).toMatchObject({
      to: 'reviewer@example.com',
      subject: 'Private campaign preview | The Pool'
    });
    expect(payload.html).toContain('&lt;Private Film&gt;');
    expect(payload.html).toContain('expires in 24 hours');
    expect(payload.html).toContain('Do not forward this link');
    expect(payload.html).toContain('https://pool.test/campaigns/private-film/preview/?t=secret-token');
  });

  it('uses a public https asset base for prominent instagram email icons even in local dev', async () => {
    const fetchMock = mockResend();

    await sendDiaryUpdateEmail(
      {
        ...env,
        SITE_BASE: 'http://127.0.0.1:4000'
      },
      {
        email: 'supporter@example.com',
        campaignSlug: 'sunder',
        campaignTitle: 'sunder',
        diaryTitle: 'A real update',
        diaryExcerpt: 'line 1',
        diaryPhase: 'edit',
        token: 'magic-token',
        instagramUrl: 'https://www.instagram.com/dustwave.xyz/'
      }
    );

    const payload = getEmailPayload(fetchMock);
    expect(payload.html).toContain('https://pool.dustwave.xyz/assets/images/instagram-white.png');
    expect(payload.html).not.toContain('http://127.0.0.1:4000/assets/images/instagram-white.png');
  });

  it('uses env-driven platform naming and sender identities in email payloads', async () => {
    const fetchMock = mockResend();

    await sendSupporterEmail(
      {
        ...env,
        PLATFORM_NAME: 'Fork Pool',
        PLATFORM_COMPANY_NAME: 'Fork Studio',
        PLEDGES_EMAIL_FROM: 'Fork Pool <pledges@fork.test>'
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
        token: 'magic-token'
      }
    );

  const payload = getEmailPayload(fetchMock);
  expect(payload.from).toBe('Fork Pool <pledges@fork.test>');
  expect(payload.reply_to).toBe('info@pool.test');
  expect(payload.html).toContain('Fork Studio tip (6%): $2.10');
  expect(payload.html).toContain('visit <a href="https://pool.test/" style="color: #000000;">Fork Pool</a>');
  });

  it('applies mirrored email theme settings for logo, fonts, and buttons', async () => {
    const fetchMock = mockResend();

    await sendSupporterEmail(
      {
        ...env,
        PLATFORM_NAME: 'Fork Pool',
        EMAIL_LOGO_PATH: '/assets/images/brand/logo.png',
        EMAIL_FONT_FAMILY: '"Source Sans 3", sans-serif',
        EMAIL_HEADING_FONT_FAMILY: '"Space Grotesk", sans-serif',
        EMAIL_COLOR_TEXT: '#223344',
        EMAIL_COLOR_MUTED: '#667788',
        EMAIL_COLOR_SURFACE: '#f4efe7',
        EMAIL_COLOR_BORDER: '#cbbda8',
        EMAIL_COLOR_PRIMARY: '#d9f4ff',
        EMAIL_BUTTON_RADIUS: '14px'
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
        token: 'magic-token'
      }
    );

    const payload = getEmailPayload(fetchMock);
    expect(payload.html).toContain('https://pool.test/assets/images/brand/logo.png');
    expect(payload.html).toContain('font-family: &quot;Source Sans 3&quot;, sans-serif;');
    expect(payload.html).toContain('font-family: &quot;Space Grotesk&quot;, sans-serif;');
    expect(payload.html).toContain('background: #f4efe7;');
    expect(payload.html).toContain('color: #223344;');
    expect(payload.html).toContain('color: #667788;');
    expect(payload.html).toContain('background: #d9f4ff; color: #111111;');
    expect(payload.html).toContain('border-radius: 14px;');
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
    expect(payload.from).toBe('The Pool <updates@pool.test>');
    expect(payload.reply_to).toBe('info@pool.test');
  });

  it('sanitizes announcement body and omits unsafe CTA urls', async () => {
    const fetchMock = mockResend();

    await sendAnnouncementEmail(env, {
      email: 'supporter@example.com',
      campaignSlug: 'sunder',
      campaignTitle: 'sunder',
      subject: 'Important update',
      heading: '<svg onload=alert(1)>',
      body: '## Heads up\n\nA **bold** update with [details](https://pool.test/campaigns/sunder/).\n\n<script>alert(2)</script>',
      ctaLabel: '<b>Click me</b>',
      ctaUrl: 'javascript:alert(3)',
      token: 'magic-token'
    });

    const payload = getEmailPayload(fetchMock);
    expect(payload.html).toContain('&lt;svg onload=alert(1)&gt;');
    expect(payload.html).toContain('>Heads up</h2>');
    expect(payload.html).toContain('<strong>bold</strong>');
    expect(payload.html).toContain('href="https://pool.test/campaigns/sunder/"');
    expect(payload.html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
    expect(payload.html).not.toContain('javascript:alert(3)');
    expect(payload.html).not.toContain('&lt;b&gt;Click me&lt;/b&gt;');
    expect(payload.from).toBe('The Pool <updates@pool.test>');
    expect(payload.reply_to).toBe('info@pool.test');
  });

  it('renders announcement image and video blocks through safe email markup', async () => {
    const fetchMock = mockResend();

    await sendAnnouncementEmail(env, {
      email: 'supporter@example.com',
      campaignSlug: 'sunder',
      campaignTitle: 'sunder',
      subject: 'Media update',
      body: 'Fallback body',
      contentBlocks: [
        { type: 'text', body: '## Watch this\n\nA **media** update.' },
        { type: 'image', src: '/assets/images/campaigns/sunder/blast.jpg', alt: '<Poster>', caption: 'New still' },
        { type: 'video', provider: 'youtube', video_id: 'abcDEF123', caption: 'Trailer' },
        { type: 'image', src: 'https://cdn.example.com/tracker.png', alt: 'remote' },
        { type: 'image', src: 'javascript:alert(1)', alt: 'unsafe' }
      ],
      token: 'magic-token'
    });

    const payload = getEmailPayload(fetchMock);
    expect(payload.html).toContain('>Watch this</h2>');
    expect(payload.html).toContain('<strong>media</strong>');
    expect(payload.html).toContain('src="https://pool.test/assets/images/campaigns/sunder/blast.jpg"');
    expect(payload.html).toContain('alt="&lt;Poster&gt;"');
    expect(payload.html).toContain('href="https://www.youtube.com/watch?v=abcDEF123"');
    expect(payload.html).toContain('Watch on YouTube');
    expect(payload.html).not.toContain('cdn.example.com');
    expect(payload.html).not.toContain('javascript:alert(1)');
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

  it('sends campaign runner reports with attachment payloads and customizable subject prefixes', async () => {
    const fetchMock = mockResend();

    await sendCampaignRunnerReportEmail(
      {
        ...env,
        CAMPAIGN_RUNNER_EMAIL_SUBJECT_PREFIX: '[Fork Pool]'
      },
      {
        email: 'runner@example.com',
        campaignSlug: 'sunder',
        campaignTitle: 'sunder',
        reportKind: 'Daily pledge report',
        reportDateLabel: 'April 21, 2026 7:00 AM MT',
        statsSummary: [
          'Total pledges: 8',
          'New pledges in the previous 24 hours: 0',
          'Pledged total: $1,203.00',
          'Goal progress: $25,000.00 goal (4.8% funded)',
          'Deadline passed 79 days, 15 hours ago'
        ],
        encouragement: {
          title: 'Momentum note',
          intro: 'Most campaigns naturally spike at launch and close.',
          tips: ['Make updates worth clicking.'],
          closing: 'Fresh stories keep people listening.'
        },
        csvFilename: 'sunder-pledge-report-2026-04-21.csv',
        csvContent: 'email,campaign\nrunner@example.com,sunder',
        includeCsvAttachment: true
      }
    );

    const payload = getEmailPayload(fetchMock);
    expect(payload.subject).toBe('[Fork Pool] Daily pledge report | sunder');
    expect(payload.attachments).toEqual([
      expect.objectContaining({
        filename: 'sunder-pledge-report-2026-04-21.csv',
        content: Buffer.from('email,campaign\nrunner@example.com,sunder', 'utf8').toString('base64')
      })
    ]);
    expect(payload.html).toContain('sunder daily pledge report');
    expect(payload.html).toContain('Total pledges: <strong>8</strong>');
    expect(payload.html).toContain('New pledges in the previous 24 hours: <strong>0</strong>');
    expect(payload.html).toContain('Pledged total: <strong>$1,203.00</strong>');
    expect(payload.html).toContain('Goal progress: $25,000.00 goal <strong>(4.8% funded)</strong>');
    expect(payload.html).toContain('Deadline passed <strong>79 days, 15 hours ago</strong>');
    expect(payload.html).toContain('Momentum note');
    expect(payload.html).toContain('Most campaigns naturally spike at launch and close.');
    expect(payload.html).toContain('Make updates worth clicking.');
    expect(payload.html).not.toContain('Campaign: <strong>sunder</strong>');
    expect(payload.html).not.toContain('Report type:');
    expect(payload.html).not.toContain('This report is for');
    expect(payload.html).not.toContain('📊');
    expect(payload.from).toBe('The Pool <updates@pool.test>');
    expect(payload.reply_to).toBe('info@pool.test');
  });

  it('uses a consistent subject format across supporter update emails', async () => {
    let fetchMock = mockResend();

    await sendDiaryUpdateEmail(env, {
      email: 'supporter@example.com',
      campaignSlug: 'sunder',
      campaignTitle: 'sunder',
      diaryTitle: 'Production is underway',
      diaryExcerpt: 'A quick note',
      token: 'magic-token'
    });

    expect(getEmailPayload(fetchMock).subject).toBe('Production is underway | sunder');

    fetchMock = mockResend();

    await sendMilestoneEmail(env, {
      email: 'supporter@example.com',
      campaignSlug: 'sunder',
      campaignTitle: 'sunder',
      milestone: 'goal',
      pledgedAmount: 250000,
      goalAmount: 250000,
      token: 'magic-token'
    });

    expect(getEmailPayload(fetchMock).subject).toBe('Goal reached | sunder');

    fetchMock = mockResend();

    await sendAnnouncementEmail(env, {
      email: 'supporter@example.com',
      campaignSlug: 'sunder',
      campaignTitle: 'sunder',
      subject: 'Premiere this Thursday',
      heading: 'Premiere this Thursday',
      body: 'Join us for the premiere.',
      token: 'magic-token'
    });

    expect(getEmailPayload(fetchMock).subject).toBe('Premiere this Thursday | sunder');
  });

  it('renders fulfillment summary values with the same emphasis treatment', async () => {
    const fetchMock = mockResend();

    await sendCampaignRunnerReportEmail(env, {
      email: 'runner@example.com',
      campaignSlug: 'sunder',
      campaignTitle: 'sunder',
      reportKind: 'Fulfillment report',
      reportDateLabel: 'April 21, 2026 7:00 AM MT',
      statsSummary: [
        'Supporters to fulfill: 8',
        'Items to fulfill: 12',
        'Total raised: $1,203.00'
      ],
      encouragement: {
        title: 'Fulfillment note',
        intro: '**Communication above everything.**',
        tips: ['Be *specific and honest*.']
      },
      csvFilename: 'sunder-fulfillment-report-2026-04-21.csv',
      csvContent: 'email,campaign\nrunner@example.com,sunder',
      includeCsvAttachment: true
    });

    const payload = getEmailPayload(fetchMock);
    expect(payload.html).toContain('Supporters to fulfill: <strong>8</strong>');
    expect(payload.html).toContain('Items to fulfill: <strong>12</strong>');
    expect(payload.html).toContain('Total raised: <strong>$1,203.00</strong>');
    expect(payload.html).not.toContain('Audience:');
    expect(payload.html).not.toContain('Fulfillment rows:');
    expect(payload.html).not.toContain('Fulfiller:');
    expect(payload.html).not.toContain('Deadline passed');
    expect(payload.html).toContain('<strong>Communication above everything.</strong>');
    expect(payload.html).toContain('Be <em>specific and honest</em>.');
  });
});
