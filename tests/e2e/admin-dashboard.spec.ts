import { test, expect } from '@playwright/test';
import path from 'node:path';

const WORKER_BASE = 'http://127.0.0.1:8787';
const SITE_BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4000';
const JSON_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': SITE_BASE,
  'access-control-allow-credentials': 'true'
};
const axePath = path.resolve(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js');

const campaignSummary = {
  slug: 'hand-relations',
  title: 'Hand Relations',
  state: 'live',
  effectiveState: 'live',
  goalAmount: 25000,
  pledgedAmount: 12000,
  pledgeCount: 3,
  percentFunded: 48
};

type AdminRole = 'super_admin' | 'campaign_user';

function withFieldHelp<T extends { label: string; help?: string }>(row: T): T {
  return {
    ...row,
    help: row.help || `Explains the ${row.label} field.`
  };
}

async function runAxe(page: any) {
  await page.route('**/__axe-core.js', async (route: any) => {
    await route.fulfill({
      path: axePath,
      contentType: 'application/javascript'
    });
  });
  await page.addScriptTag({ url: '/__axe-core.js' });
  return page.evaluate(async () => {
    return (window as any).axe.run(document, {
      rules: {
        'color-contrast': { enabled: false }
      }
    });
  });
}

async function expectNoAxeViolations(page: any) {
  const results = await runAxe(page);
  expect(
    results.violations,
    results.violations.map((violation: any) => `${violation.id}: ${violation.help}`).join('\n')
  ).toEqual([]);
}

async function routeAdminWorker(page: any, options: { role?: AdminRole } = {}) {
  const role = options.role || 'super_admin';
  const calls: Record<string, any[]> = {
    authStart: [],
    authExchange: [],
    summary: [],
    supporters: [],
    reportPreview: [],
    reportCsv: [],
    reportSend: [],
    inventoryRead: [],
    inventoryWrite: [],
    analytics: [],
    settings: [],
    settingsPreview: [],
    settingsPublish: [],
    logoUpload: [],
    imageUpload: [],
    marketingReferrals: [],
    contentLoad: [],
    contentPreview: [],
    contentPublish: []
  };
  const user = {
    email: role === 'super_admin' ? 'admin@example.com' : 'creator@example.com',
    role,
    campaignSlugs: role === 'super_admin' ? [] : ['hand-relations']
  };

  await page.route(`${WORKER_BASE}/admin/**`, async (route: any) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const body = request.postData() ? JSON.parse(request.postData() || '{}') : {};
    const fulfillJson = (payload: Record<string, any>, status = 200, extraHeaders: Record<string, string> = {}) => route.fulfill({
      status,
      headers: { ...JSON_HEADERS, ...extraHeaders },
      body: JSON.stringify(payload)
    });

    if (url.pathname === '/admin/session') {
      return fulfillJson({ error: 'Unauthorized' }, 401);
    }
    if (url.pathname === '/admin/auth/start') {
      calls.authStart.push(body);
      return fulfillJson({ success: true, sent: true, loginUrl: 'http://127.0.0.1:4000/admin/?admin_login=test-token' });
    }
    if (url.pathname === '/admin/auth/exchange') {
      calls.authExchange.push(body);
      return fulfillJson({
        success: true,
        user,
        csrfToken: 'csrf-test-token',
        expiresAt: '2026-05-16T23:00:00.000Z'
      }, 200, {
        'set-cookie': 'pool_admin_session=session-test; Path=/admin; HttpOnly; SameSite=Lax'
      });
    }
    if (url.pathname === '/admin/dashboard/summary') {
      calls.summary.push({ method });
      return fulfillJson({
        user,
        totals: {
          campaignCount: 1,
          pledgedAmount: 12000,
          pledgeCount: 3
        },
        campaigns: [campaignSummary],
        writeBudget: { readOnly: true, kvWritesExpected: 0 }
      });
    }
    if (url.pathname === '/admin/settings') {
      calls.settings.push({ method });
      return fulfillJson({
        user,
        scope: role === 'super_admin' ? 'platform' : 'campaign',
        sections: role === 'super_admin'
          ? [{
              title: 'Platform',
              rows: [
                { label: 'Name', value: 'The Pool', rawValue: 'The Pool', editable: true, path: 'platform.name', type: 'string', input: 'text' },
                { label: 'Site author', value: 'Dust Wave', rawValue: 'Dust Wave', editable: true, path: 'author', type: 'string', input: 'text' },
                { label: 'App mode', value: 'test' },
                { label: 'CORS allowed origin', value: SITE_BASE }
              ].map(withFieldHelp)
            }, {
              title: 'Canonical URLs',
              rows: [
                { label: 'Production site URL', value: SITE_BASE, rawValue: SITE_BASE, editable: true, path: 'platform.site_url', type: 'string', input: 'url' },
                { label: 'Production Worker URL', value: WORKER_BASE, rawValue: WORKER_BASE, editable: true, path: 'platform.worker_url', type: 'string', input: 'url' }
              ].map(withFieldHelp)
            }, {
              title: 'Pricing',
              rows: [
                { label: 'Sales Tax Rate', value: '0.07625', rawValue: '0.07625', editable: true, path: 'pricing.sales_tax_rate', type: 'number', input: 'percent', min: 0, max: 1, step: 0.0001, displayMultiplier: 100, submitDivisor: 100 },
                { label: 'Default Platform Tip Percent', value: '5', rawValue: '5', editable: true, path: 'pricing.default_tip_percent', type: 'number', input: 'percent', min: 0, max: 100, step: 1 }
              ].map(withFieldHelp)
            }, {
              title: 'Tax',
              rows: [
                {
                  label: 'Provider',
                  value: 'flat',
                  rawValue: 'flat',
                  editable: true,
                  path: 'tax.provider',
                  type: 'string',
                  input: 'select',
                  options: [
                    { value: 'flat', label: 'Flat rate' },
                    { value: 'offline_rules', label: 'Offline rules' },
                    { value: 'nm_grt', label: 'New Mexico GRT' },
                    { value: 'zip_tax', label: 'ZIP.TAX' }
                  ]
                },
                {
                  label: 'Origin country',
                  value: 'US',
                  rawValue: 'US',
                  editable: true,
                  path: 'tax.origin_country',
                  type: 'string',
                  input: 'select',
                  options: [{ value: 'US', label: 'United States' }, { value: 'CA', label: 'Canada' }]
                },
                {
                  label: 'New Mexico GRT API base',
                  value: 'https://grt.edacnm.org',
                  rawValue: 'https://grt.edacnm.org',
                  help: 'The New Mexico GRT lookup API base URL used when the New Mexico tax provider is active.',
                  visibleWhen: { path: 'tax.provider', value: 'nm_grt' }
                },
                {
                  label: 'ZIP.TAX API base',
                  value: 'https://api.zip-tax.com',
                  rawValue: 'https://api.zip-tax.com',
                  help: 'The ZIP.TAX API base URL used when ZIP-level tax lookup is active.',
                  visibleWhen: { path: 'tax.provider', value: 'zip_tax' }
                }
              ].map(withFieldHelp)
            }, {
              title: 'Shipping',
              rows: [
                { label: 'Origin country', value: 'US', rawValue: 'US', editable: true, path: 'shipping.origin_country', type: 'string', input: 'select', options: [{ value: 'US', label: 'United States' }, { value: 'CA', label: 'Canada' }] },
                { label: 'USPS enabled', value: 'No', rawValue: 'false', editable: true, path: 'shipping.usps.enabled', type: 'boolean', input: 'boolean' },
                { label: 'USPS client ID', value: 'Not configured', rawValue: '', editable: true, path: 'shipping.usps.client_id', type: 'string', input: 'text', visibleWhen: { path: 'shipping.usps.enabled', value: 'true' } },
                { label: 'USPS API base', value: 'Not configured', rawValue: '', editable: true, path: 'shipping.usps.api_base', type: 'string', input: 'url', placeholder: 'Default: https://apis.usps.com', visibleWhen: { path: 'shipping.usps.enabled', value: 'true' }, help: 'Optional override. Leave blank to use the production USPS default: https://apis.usps.com.' }
              ].map(withFieldHelp)
            }, {
              title: 'Platform add-ons',
              rows: [
                { label: 'Enabled', value: 'Yes', rawValue: true, editable: true, path: 'add_ons.enabled', type: 'boolean', input: 'boolean', layoutGroup: 'add-ons-enabled-stock' },
                { label: 'Low stock threshold', value: '5', rawValue: 5, editable: true, path: 'add_ons.low_stock_threshold', type: 'number', input: 'integer', min: 0, step: 1, layoutGroup: 'add-ons-enabled-stock', visibleWhen: { path: 'add_ons.enabled', value: 'true' } },
                {
                  label: 'Products',
                  value: '2 products',
                  rawValue: [
                    {
                      id: 'dust-wave-sticker',
                      name: 'DUST WAVE Sticker',
                      description: 'A vinyl sticker.',
                      image_url: '/assets/images/add-ons/sticker.png',
                      price: 3,
                      category: 'physical',
                      shipping_preset: 'sticker',
                      inventory: 50,
                      source_url: 'https://shop.example.test/sticker',
                      variants: []
                    },
                    {
                      id: 'dust-wave-shirt',
                      name: 'DUST WAVE Shirt',
                      description: 'A soft shirt.',
                      image_url: '/assets/images/add-ons/shirt.png',
                      price: 25,
                      category: 'physical',
                      shipping_preset: 'shirt',
                      variant_option_name: 'Size',
                      variants: [
                        { id: 's', label: 'Small', inventory: 2 },
                        { id: 'm', label: 'Medium', inventory: 4 }
                      ]
                    }
                  ],
                  editable: true,
                  path: 'add_ons.products',
                  type: 'add_on_products',
                  input: 'add-on-products',
                  visibleWhen: { path: 'add_ons.enabled', value: 'true' }
                }
              ].map(withFieldHelp)
            }, {
              title: 'Campaign runner reports',
              rows: [
                {
                  label: 'Enabled',
                  value: 'Yes',
                  rawValue: true,
                  editable: true,
                  path: 'reports.campaign_runner.enabled',
                  type: 'boolean',
                  input: 'boolean',
                  help: 'Whether scheduled campaign-runner reports are enabled for the platform.'
                },
                {
                  label: 'Send time MT',
                  value: '7',
                  rawValue: '7',
                  editable: true,
                  path: 'reports.campaign_runner.send_hour_mt',
                  type: 'number',
                  input: 'time',
                  help: 'The Mountain Time clock time when scheduled campaign-runner reports should be sent.',
                  visibleWhen: { path: 'reports.campaign_runner.enabled', value: 'true' },
                  timeParts: {
                    hourPath: 'reports.campaign_runner.send_hour_mt',
                    minutePath: 'reports.campaign_runner.send_minute_mt',
                    hour: 7,
                    minute: 0
                  }
                }
              ]
            }, {
              title: 'Design',
              rows: [
                { label: 'Logo', value: '/assets/images/defaults/dust-wave-square.png', rawValue: '/assets/images/defaults/dust-wave-square.png', editable: true, path: 'platform.logo_path', type: 'string', input: 'image-upload', layoutGroup: 'brand-logo-footer-logo' },
                { label: 'Body font', value: '"Inter", sans-serif', rawValue: '"Inter", sans-serif', editable: true, path: 'design.font_body', type: 'string', input: 'text', placeholder: '"Inter", sans-serif', layoutGroup: 'design-fonts' },
                { label: 'Heading font', value: '"gambado-sans", sans-serif', rawValue: '"gambado-sans", sans-serif', editable: true, path: 'design.font_display', type: 'string', input: 'text', placeholder: '"gambado-sans", sans-serif', layoutGroup: 'design-fonts' },
                { label: 'Text Color', value: '#252930', rawValue: '#252930', editable: true, path: 'design.color_text', type: 'string', input: 'color', layoutGroup: 'design-colors' },
                { label: 'Muted Color', value: '#5d6573', rawValue: '#5d6573', editable: true, path: 'design.color_text_muted', type: 'string', input: 'color', layoutGroup: 'design-colors' },
                { label: 'Surface Color', value: '#f0f1ed', rawValue: '#f0f1ed', editable: true, path: 'design.color_surface_subtle', type: 'string', input: 'color', layoutGroup: 'design-colors' },
                { label: 'Border Color', value: '#d2d7df', rawValue: '#d2d7df', editable: true, path: 'design.color_border', type: 'string', input: 'color', layoutGroup: 'design-colors' },
                { label: 'Primary Color', value: '#101215', rawValue: '#101215', editable: true, path: 'design.color_primary', type: 'string', input: 'color', layoutGroup: 'design-colors' },
                { label: 'Button Radius', value: '6px', rawValue: '6px', editable: true, path: 'design.radius_lg', type: 'string', input: 'text' }
              ].map(withFieldHelp)
            }, {
              title: 'Advanced performance',
              rows: [
                { label: 'Live stats cache TTL seconds', value: '300', rawValue: '300', editable: true, path: 'cache.live_stats_ttl_seconds', type: 'number', input: 'integer', layoutGroup: 'cache-live-ttl' },
                { label: 'Live inventory cache TTL seconds', value: '300', rawValue: '300', editable: true, path: 'cache.live_inventory_ttl_seconds', type: 'number', input: 'integer', layoutGroup: 'cache-live-ttl' }
              ].map(withFieldHelp)
            }, {
              title: 'Debug',
              rows: [
                { label: 'Console logging enabled', value: 'Yes', rawValue: true, editable: true, path: 'debug.console_logging_enabled', type: 'boolean', input: 'boolean', layoutGroup: 'debug-logging' },
                { label: 'Verbose console logging', value: 'Yes', rawValue: true, editable: true, path: 'debug.verbose_console_logging', type: 'boolean', input: 'boolean', layoutGroup: 'debug-logging' }
              ].map(withFieldHelp)
            }, {
              title: 'Secrets & credentials',
              rows: [
                { label: 'Stripe secret key', value: 'Configured' },
                { label: 'Checkout intent secret', value: 'Configured' },
                { label: 'Magic link secret', value: 'Configured' }
              ].map(withFieldHelp)
            }, {
              title: 'Runtime diagnostics',
              rows: [
                { label: 'Current site base', value: SITE_BASE },
                { label: 'Current Worker base', value: WORKER_BASE },
                { label: 'CORS allowed origin', value: SITE_BASE }
              ].map(withFieldHelp)
            }]
          : [],
        campaigns: [{
          title: 'Hand Relations',
          rows: [
            { label: 'Title', value: 'Hand Relations', rawValue: 'Hand Relations', editable: true, path: 'title', type: 'string', input: 'string', layoutGroup: 'campaign-title-creator', campaignSlug: 'hand-relations' },
            { label: 'Creator name', value: 'Dust Wave', rawValue: 'Dust Wave', editable: true, path: 'creator_name', type: 'string', input: 'string', layoutGroup: 'campaign-title-creator', campaignSlug: 'hand-relations' },
            { label: 'Short blurb', value: 'Existing <em>short</em> blurb.', rawValue: 'Existing <em>short</em> blurb.', editable: true, path: 'short_blurb', type: 'string', input: 'rich-text-inline', campaignSlug: 'hand-relations' },
            { label: 'Slug', value: 'hand-relations', rawValue: 'hand-relations', editable: false, path: 'slug', type: 'string', input: 'slug-derived', layoutGroup: 'campaign-slug-url' },
            { label: 'URL', value: '/campaigns/hand-relations/', rawValue: '/campaigns/hand-relations/', editable: false, path: 'url', type: 'string', input: 'url-derived', layoutGroup: 'campaign-slug-url' },
            { label: 'Hero video', value: '/assets/videos/defaults/hand-relations.webm', rawValue: '/assets/videos/defaults/hand-relations.webm', editable: true, path: 'hero_video', type: 'string', input: 'video-upload', layoutGroup: 'campaign-hero-video-creator-image', campaignSlug: 'hand-relations' },
            { label: 'Creator image', value: '/assets/images/defaults/dust-wave-square.png', rawValue: '/assets/images/defaults/dust-wave-square.png', editable: true, path: 'creator_image', type: 'string', input: 'image-upload', layoutGroup: 'campaign-hero-video-creator-image', campaignSlug: 'hand-relations' },
            { label: 'Category', value: 'Short Film', rawValue: 'Short Film', editable: true, path: 'category', type: 'string', input: 'select', layoutGroup: 'campaign-category-instagram', options: [{ label: 'Short Film', value: 'Short Film' }, { label: 'Feature Film', value: 'Feature Film' }], campaignSlug: 'hand-relations' },
            { label: 'Instagram URL', value: 'https://instagram.com/dustwave', rawValue: 'https://instagram.com/dustwave', editable: true, path: 'instagram', type: 'string', input: 'url', layoutGroup: 'campaign-category-instagram', campaignSlug: 'hand-relations' },
            { label: 'Start date', value: '2026-01-01', rawValue: '2026-01-01', editable: true, path: 'start_date', type: 'string', input: 'date', layoutGroup: 'campaign-dates', campaignSlug: 'hand-relations' },
            { label: 'Goal deadline', value: '2026-02-01', rawValue: '2026-02-01', editable: true, path: 'goal_deadline', type: 'string', input: 'date', layoutGroup: 'campaign-dates', campaignSlug: 'hand-relations' },
            { label: 'Goal amount', value: '25000', rawValue: 25000, editable: true, path: 'goal_amount', type: 'number', input: 'currency', min: 0, step: 1, layoutGroup: 'campaign-goal-charged', campaignSlug: 'hand-relations' },
            { label: 'Charged', value: 'No', layoutGroup: 'campaign-goal-charged' },
            { label: 'Test campaign', value: 'No', rawValue: false, editable: true, path: 'test_only', type: 'boolean', input: 'boolean', layoutGroup: 'campaign-test-state', campaignSlug: 'hand-relations' },
            { label: 'State', value: 'live', layoutGroup: 'campaign-test-state' },
            { label: 'Single tier mode', value: 'No', rawValue: false, editable: true, path: 'single_tier_only', type: 'boolean', input: 'boolean', layoutGroup: 'campaign-tier-ongoing', campaignSlug: 'hand-relations' },
            { label: 'Show ongoing support', value: 'No', rawValue: false, editable: true, path: 'show_ongoing', type: 'boolean', input: 'boolean', layoutGroup: 'campaign-tier-ongoing', campaignSlug: 'hand-relations' },
            { label: 'Hide locked stretch goals', value: 'Yes', rawValue: true, editable: true, path: 'stretch_hidden', type: 'boolean', input: 'boolean', layoutGroup: 'campaign-stretch-late-support', campaignSlug: 'hand-relations' },
            { label: 'Custom late support', value: 'No', rawValue: false, editable: true, path: 'custom_late_support', type: 'boolean', input: 'boolean', layoutGroup: 'campaign-stretch-late-support', campaignSlug: 'hand-relations' },
            { label: 'Shipping fallback flat rate', value: '5', rawValue: 5, editable: true, path: 'shipping_fallback_flat_rate', type: 'number', input: 'currency', min: 0, step: 0.01, layoutGroup: 'campaign-shipping-free', campaignSlug: 'hand-relations' },
            { label: 'Free shipping override', value: 'inherit', rawValue: 'inherit', editable: true, path: 'free_shipping', type: 'string', input: 'select', layoutGroup: 'campaign-shipping-free', options: [{ label: 'Inherit deployment default', value: 'inherit' }, { label: 'Free shipping', value: 'true' }, { label: 'Paid shipping', value: 'false' }], campaignSlug: 'hand-relations' },
            { label: 'Shipping', value: 'Signature required', rawValue: ['signature_required'], editable: true, path: 'shipping_options', type: 'list', input: 'checkbox-list', options: [{ label: 'Signature required', value: 'signature_required' }, { label: 'Adult signature required', value: 'adult_signature_required' }], campaignSlug: 'hand-relations' },
            { label: 'Runner report emails', value: 'runner@example.com', rawValue: ['runner@example.com'], editable: true, path: 'runner_report_emails', type: 'list', input: 'email-list', campaignSlug: 'hand-relations' },
            { label: 'Hero image', value: '/assets/images/campaigns/hand-hero.jpg', rawValue: '/assets/images/campaigns/hand-hero.jpg', editable: true, path: 'hero_image', type: 'string', input: 'image-upload', layoutGroup: 'hero-images', campaignSlug: 'hand-relations' },
            { label: 'Hero image wide', value: '/assets/images/campaigns/hand-hero-wide.jpg', rawValue: '/assets/images/campaigns/hand-hero-wide.jpg', editable: true, path: 'hero_image_wide', type: 'string', input: 'image-upload', layoutGroup: 'hero-images', campaignSlug: 'hand-relations' },
            { label: 'Campaign background', value: '/assets/images/campaigns/bg.jpg', rawValue: '/assets/images/campaigns/bg.jpg', editable: true, path: 'campaign_background', type: 'string', input: 'image-upload', layoutGroup: 'background-images', campaignSlug: 'hand-relations' },
            { label: 'Progress background', value: '/assets/images/campaigns/progress.jpg', rawValue: '/assets/images/campaigns/progress.jpg', editable: true, path: 'progress_background', type: 'string', input: 'image-upload', layoutGroup: 'background-images', campaignSlug: 'hand-relations' },
            { label: 'Content editor', value: '', rawValue: '', editable: true, path: 'content_editor', type: 'content_editor', input: 'content-editor', campaignSlug: 'hand-relations' },
            { label: 'Featured tier', value: 'frame-slot', rawValue: 'frame-slot', editable: true, path: 'featured_tier_id', type: 'string', input: 'select', options: [{ label: 'None', value: '' }, { label: '$5 - Buy 1 Frame (frame-slot)', value: 'frame-slot' }], campaignSlug: 'hand-relations' },
            { label: 'Tiers', value: '1 tier', rawValue: [{ id: 'frame-slot', name: 'Buy 1 Frame', price: 5, image: '/assets/images/defaults/tier-frame.png', description: 'Sponsor a <strong>frame</strong>.', stackable: true, category: 'digital', late_support: false }], editable: true, path: 'tiers', type: 'campaign_collection', input: 'campaign-collection', collection: 'tiers', campaignSlug: 'hand-relations' },
            { label: 'Support items', value: '1 support item', rawValue: [{ id: 'location-scouting', label: 'Location Scouting', need: 'travel + permits', target: 1000, late_support: true }], editable: true, path: 'support_items', type: 'campaign_collection', input: 'campaign-collection', collection: 'support_items', campaignSlug: 'hand-relations' },
            { label: 'Campaign add-ons', value: '1 add-on', rawValue: [{ id: 'poster-pack', name: 'Poster Pack', description: 'Two campaign posters.', image_url: '/assets/images/add-ons/poster.png', price: 15, inventory: 20, category: 'physical', shipping_preset: 'poster', source_url: 'https://shop.example/poster-pack', variant_option_name: 'Finish', variants: [{ id: 'matte', label: 'Matte', inventory: 10 }] }], editable: true, path: 'campaign_add_ons', type: 'add_on_products', input: 'add-on-products', campaignSlug: 'hand-relations' },
            { label: 'Stretch goals', value: '1 stretch goal', rawValue: [{ title: 'Festival cut', threshold: 30000, description: 'Unlock a longer festival cut.', status: 'locked' }], editable: true, path: 'stretch_goals', type: 'campaign_collection', input: 'campaign-collection', collection: 'stretch_goals', campaignSlug: 'hand-relations' },
            { label: 'Ongoing items', value: '1 ongoing item', rawValue: [{ label: 'Post-production', remaining: 5000 }], editable: true, path: 'ongoing_items', type: 'campaign_collection', input: 'campaign-collection', collection: 'ongoing_items', campaignSlug: 'hand-relations' },
            { label: 'Diary entries', value: '2 diary entries', rawValue: [
              { title: 'Older production note', date: '2025-10-01T09:00:00-06:00', phase: 'production', content: [{ type: 'text', body: 'Earlier update.' }] },
              { title: 'Campaign page live!', date: '2025-10-18T12:00:00-06:00', phase: 'fundraising', content: [{ type: 'text', body: '**We launched.**\n\n- **$1** — diary frame\n- **$5** — diary credit' }] }
            ], editable: true, path: 'diary', type: 'campaign_collection', input: 'campaign-collection', collection: 'diary', campaignSlug: 'hand-relations' },
            { label: 'Decisions', value: '1 decision', rawValue: [{ id: 'poster', type: 'vote', title: 'Official Poster', deadline: '2026-01-10', options: [{ label: 'A', image: '/poster-a.jpg' }, { label: 'B', image: '/poster-b.jpg' }], eligible: 'backers', status: 'open' }], editable: true, path: 'decisions', type: 'campaign_collection', input: 'campaign-collection', collection: 'decisions', campaignSlug: 'hand-relations' }
          ].map(withFieldHelp)
        }],
        writeBudget: { readOnly: true, kvWritesExpected: 0 }
      });
    }
    if (url.pathname === '/admin/settings/preview') {
      calls.settingsPreview.push(body);
      return fulfillJson({
        user,
        dryRun: true,
        valid: true,
        changeCount: body.changes?.length || 0,
        changes: body.changes || [],
        errors: [],
        warnings: ['Publishing starts a deploy. Changes may take a few minutes to appear.'],
        writeBudget: { readOnly: true, kvWritesExpected: 0, kvListExpected: 0 }
      });
    }
    if (url.pathname === '/admin/settings/logo-upload') {
      calls.logoUpload.push(body);
      return fulfillJson({
        success: true,
        path: '/assets/images/admin/logo-e2e.png',
        githubPath: 'assets/images/admin/logo-e2e.png',
        commitSha: 'logo-commit',
        writeBudget: { readOnly: false, kvWritesExpected: 0 }
      });
    }
    if (url.pathname === '/admin/settings/image-upload') {
      calls.imageUpload.push(body);
      return fulfillJson({
        success: true,
        path: '/assets/images/admin/add-on-e2e.png',
        githubPath: 'assets/images/admin/add-on-e2e.png',
        commitSha: 'image-commit',
        writeBudget: { readOnly: false, kvWritesExpected: 0 }
      });
    }
    if (url.pathname === '/admin/settings/video-upload') {
      calls.imageUpload.push(body);
      return fulfillJson({
        success: true,
        path: '/assets/videos/admin/hero-e2e.mp4',
        githubPath: 'assets/videos/admin/hero-e2e.mp4',
        commitSha: 'video-commit',
        writeBudget: { readOnly: false, kvWritesExpected: 0 }
      });
    }
    if (url.pathname === '/admin/settings/publish') {
      calls.settingsPublish.push(body);
      return fulfillJson({
        success: true,
        published: true,
        changeCount: body.changes?.length || 0,
        commits: [{ path: '_config.yml', commitSha: 'settings-commit' }],
        rebuild: { triggered: true },
        deployNotice: 'Publishing starts a deploy. Changes may take a few minutes to appear.',
        writeBudget: { readOnly: false, kvWritesExpected: 0 }
      });
    }
    if (url.pathname === '/admin/supporters') {
      calls.supporters.push(Object.fromEntries(url.searchParams.entries()));
      return fulfillJson({
        user,
        supporters: [
          {
            orderId: 'order-e2e-1',
            email: 'supporter@example.com',
            pledgeStatus: 'active',
            amount: 5000,
            hasPhysicalReward: true,
            createdAt: '2026-04-01T12:00:00.000Z'
          }
        ],
        page: {
          nextCursor: null,
          limit: 25,
          cursor: 0,
          returned: 1,
          matched: 1
        },
        writeBudget: { readOnly: true, kvWritesExpected: 0, kvListExpected: 0 }
      });
    }
    if (url.pathname === '/admin/reports/campaign-runner/preview') {
      calls.reportPreview.push(Object.fromEntries(url.searchParams.entries()));
      return fulfillJson({
        dryRun: true,
        campaignSlug: 'hand-relations',
        campaignTitle: 'Hand Relations',
        reportType: url.searchParams.get('reportType') || 'pledge',
        rowCount: 1,
        recipientCount: 1,
        platformRowCount: 0,
        alreadyMarked: false,
        csvFilename: 'hand-relations-pledge-report-2026-05-16.csv',
        header: ['email', 'campaign', 'items'],
        previewRows: [['supporter@example.com', 'hand-relations', 'Digital Pass']],
        writeBudget: { readOnly: true, kvWritesExpected: 0, kvListExpected: 0 }
      });
    }
    if (url.pathname === '/admin/reports/campaign-runner.csv') {
      calls.reportCsv.push(Object.fromEntries(url.searchParams.entries()));
      return route.fulfill({
        status: 200,
        headers: {
          ...JSON_HEADERS,
          'content-type': 'text/csv',
          'content-disposition': 'attachment; filename="hand-relations-pledge-report-2026-05-16.csv"'
        },
        body: 'email,campaign,items\nsupporter@example.com,hand-relations,Digital Pass\n'
      });
    }
    if (url.pathname === '/admin/reports/campaign-runner/send') {
      calls.reportSend.push(body);
      return fulfillJson({
        success: true,
        campaignSlug: 'hand-relations',
        reportType: body.reportType || 'pledge',
        sent: 1,
        markedAsSent: body.markAsSent !== false,
        auditKey: 'admin-audit:e2e',
        writeBudget: { readOnly: false, kvWritesExpected: 2, kvListExpected: 0 }
      });
    }
    if (url.pathname === '/admin/add-ons/inventory' && method === 'GET') {
      calls.inventoryRead.push({ method });
      return fulfillJson({
        rows: [
          {
            productId: 'dust-wave-sticker',
            variantId: '',
            label: 'DUST WAVE Sticker',
            configuredInventory: 50,
            inventory: 50,
            sold: 2,
            remaining: 48,
            hasOverride: false
          }
        ],
        writeBudget: { readOnly: true, kvWritesExpected: 0, kvListExpected: 1 }
      });
    }
    if (url.pathname === '/admin/add-ons/inventory' && method === 'POST') {
      calls.inventoryWrite.push(body);
      return fulfillJson({
        success: true,
        mutation: {
          action: body.action,
          productId: body.productId,
          before: { inventory: 50 },
          after: { inventory: 55 }
        },
        auditKey: 'admin-audit:inventory',
        writeBudget: { readOnly: false, kvWritesExpected: 2, kvListExpected: 2 }
      });
    }
    if (url.pathname === '/admin/analytics') {
      calls.analytics.push(Object.fromEntries(url.searchParams.entries()));
      return fulfillJson({
        scope: url.searchParams.get('campaignSlug') ? 'campaign' : 'portfolio',
        totals: {
          pledgedAmount: 12000,
          chargedAmount: 5000,
          uniqueSupporters: 2,
          pledgeCount: 3,
          campaignRevenue: 11000,
          platformAddOnRevenue: 600,
          platformTipRevenue: 400,
          paymentFailedAmount: 0
        },
        campaigns: [{ ...campaignSummary, totals: { pledgedAmount: 12000, uniqueSupporters: 2, platformAddOnRevenue: 600, paymentFailedAmount: 0 } }],
        statusBreakdown: [{ key: 'active', count: 2, amount: 12000 }],
        referralBreakdown: [{ key: 'newsletter', count: 1, amount: 5000 }],
        languageBreakdown: [{ key: 'en', count: 1, amount: 5000 }],
        utmSourceBreakdown: [{ key: 'email', count: 1, amount: 5000 }],
        writeBudget: { readOnly: true, kvWritesExpected: 0, kvListExpected: 0 }
      });
    }
    if (url.pathname === '/admin/marketing/referrals') {
      calls.marketingReferrals.push({ method, query: Object.fromEntries(url.searchParams.entries()), body });
      return fulfillJson({
        user,
        campaignSlug: url.searchParams.get('campaignSlug') || body.campaignSlug || 'hand-relations',
        referrals: [],
        writeBudget: { readOnly: method === 'GET', kvWritesExpected: method === 'GET' ? 0 : 1, kvListExpected: 0 }
      });
    }
    if (url.pathname === '/admin/content/campaign') {
      calls.contentLoad.push(Object.fromEntries(url.searchParams.entries()));
      return fulfillJson({
        user,
        campaign: {
          slug: 'hand-relations',
          title: 'Hand Relations',
          shortBlurb: 'Existing blurb.',
          longContent: [{ type: 'text', body: 'Existing body with **[Terms](/terms/)**.' }]
        },
        writeBudget: { readOnly: true, kvWritesExpected: 0, kvListExpected: 0 }
      });
    }
    if (url.pathname === '/admin/content/preview') {
      calls.contentPreview.push(body);
      const blocks = body.draft?.longContent || [];
      const hasUnsafe = JSON.stringify(blocks).includes('<script');
      const videoBlock = blocks.find((block: any) => block?.type === 'video');
      const previewBody = videoBlock
        ? `<div class="video-embed video-embed--youtube"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoBlock.video_id || '')}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe></div>`
        : '<p>Preview body.</p>';
      return fulfillJson({
        user,
        campaignSlug: 'hand-relations',
        dryRun: true,
        valid: !hasUnsafe,
        errors: hasUnsafe ? ['block 1 includes raw <script> HTML, which is not allowed.'] : [],
        warnings: [],
        normalizedDraft: body.draft,
        preview: {
          html: `<!doctype html><html><body><main><h1>Hand Relations</h1>${previewBody}</main></body></html>`
        },
        writeBudget: { readOnly: true, kvWritesExpected: 0, kvListExpected: 0 }
      }, hasUnsafe ? 422 : 200);
    }
    if (url.pathname === '/admin/content/publish') {
      calls.contentPublish.push(body);
      return fulfillJson({
        success: true,
        campaignSlug: 'hand-relations',
        rebuild: { triggered: true },
        commitSha: 'commit-e2e',
        auditKey: 'admin-audit:content',
        writeBudget: { readOnly: false, kvWritesExpected: 1, kvListExpected: 0 }
      });
    }

    throw new Error(`Unexpected admin route: ${method} ${url.pathname}`);
  });

  return calls;
}

async function signInWithMagicToken(page: any, role: AdminRole = 'super_admin') {
  const calls = await routeAdminWorker(page, { role });
  await page.goto(role === 'campaign_user' ? '/admin/?admin_login=creator-token' : '/admin/?admin_login=admin-token');
  await expect(page.locator('#admin-app')).toBeVisible();
  await expect(page.locator('#admin-tab-settings')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Campaigns', exact: true })).toBeVisible();
  await expect.poll(() => calls.summary.length).toBeGreaterThan(0);
  await expect.poll(() => calls.settings.length).toBeGreaterThan(0);
  await page.getByRole('tab', { name: 'Campaigns', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Hand Relations', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.locator('#admin-tab-settings').click();
  return calls;
}

async function selectSettingsSection(page: any, name: string) {
  const tab = page.locator('#admin-settings-section-tabs').getByRole('tab', { name, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

async function selectAdminSection(page: any, name: string) {
  const tab = page.locator('[data-admin-tabs] > .admin-tabs__list').getByRole('tab', { name, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

test.describe('Admin Dashboard', () => {
  test('starts magic-link login and supports keyboard refresh with no obvious axe violations', async ({ page }) => {
    const calls = await routeAdminWorker(page);

    await page.goto('/admin/');
    await expect(page.locator('#admin-auth-panel')).toBeVisible();
    await page.locator('#admin-email').fill('admin@example.com');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');

    await expect.poll(() => calls.authStart.length).toBe(1);
    expect(calls.authStart[0]).toMatchObject({ email: 'admin@example.com', preferredLang: 'en' });

    await page.goto('/admin/?admin_login=admin-token');
    await expect(page.locator('#admin-app')).toBeVisible();
    await expect(page.getByText('Signed in as admin@example.com')).toBeVisible();
    await expect(page.getByRole('tab').nth(0)).toHaveText('Settings');
    await expect(page.getByRole('tab').nth(1)).toHaveText('Campaigns');
    await expect(page.getByRole('tab', { name: 'Platform add-ons' })).toBeVisible();
    await expect.poll(() => calls.summary.length).toBeGreaterThan(0);
    await expect.poll(() => calls.settings.length).toBeGreaterThan(0);
    await selectSettingsSection(page, 'Canonical URLs');
    await expect(page.getByRole('button', { name: 'About Production Worker URL' })).toBeVisible();
    await expect(page.locator('[data-settings-path="platform.site_url"]')).toHaveValue('https://pool.dustwave.xyz');
    await expect(page.locator('[data-settings-path="platform.worker_url"]')).toHaveValue('https://pledge.dustwave.xyz');
    await selectSettingsSection(page, 'Runtime diagnostics');
    await expect(page.locator('#admin-settings-results')).toContainText('Current site base');
    await expect(page.locator('#admin-settings-results')).toContainText(SITE_BASE);
    await selectSettingsSection(page, 'Tax');
    await expect(page.locator('[data-settings-path="tax.provider"]')).toHaveValue('flat');
    await expect(page.locator('[data-settings-path="tax.provider"] option')).toHaveText(['Flat rate', 'Offline rules', 'New Mexico GRT', 'ZIP.TAX']);
    await expect(page.locator('[data-settings-row-label="New Mexico GRT API base"]')).toBeHidden();
    await expect(page.locator('[data-settings-row-label="ZIP.TAX API base"]')).toBeHidden();
    await page.locator('[data-settings-path="tax.provider"]').selectOption('nm_grt');
    await expect(page.locator('[data-settings-row-label="New Mexico GRT API base"]')).toBeVisible();
    await expect(page.locator('[data-settings-row-label="ZIP.TAX API base"]')).toBeHidden();
    await page.locator('[data-settings-path="tax.provider"]').selectOption('zip_tax');
    await expect(page.locator('[data-settings-row-label="New Mexico GRT API base"]')).toBeHidden();
    await expect(page.locator('[data-settings-row-label="ZIP.TAX API base"]')).toBeVisible();
    await page.locator('[data-settings-path="tax.provider"]').selectOption('flat');
    await expect(page.locator('[data-settings-row-label="New Mexico GRT API base"]')).toBeHidden();
    await expect(page.locator('[data-settings-row-label="ZIP.TAX API base"]')).toBeHidden();
    await selectSettingsSection(page, 'Pricing');
    await expect(page.locator('[data-settings-path="pricing.sales_tax_rate"]')).toHaveValue('7.625');
    await selectSettingsSection(page, 'Shipping');
    await expect(page.locator('[data-settings-path="shipping.origin_country"]')).toHaveValue('US');
    await expect(page.locator('[data-settings-row-label="USPS client ID"]')).toBeHidden();
    await expect(page.locator('[data-settings-row-label="USPS API base"]')).toBeHidden();
    await page.locator('[data-settings-path="shipping.usps.enabled"]').selectOption('true');
    await expect(page.locator('[data-settings-row-label="USPS client ID"]')).toBeVisible();
    await expect(page.locator('[data-settings-row-label="USPS API base"]')).toBeVisible();
    await expect(page.locator('[data-settings-path="shipping.usps.api_base"]')).toHaveValue('');
    await expect(page.locator('[data-settings-path="shipping.usps.api_base"]')).toHaveAttribute('placeholder', 'Default: https://apis.usps.com');
    await page.locator('[data-settings-path="shipping.usps.enabled"]').selectOption('false');
    await expect(page.locator('[data-settings-row-label="USPS API base"]')).toBeHidden();
    await selectSettingsSection(page, 'Campaign runner reports');
    await expect(page.locator('[data-settings-path="reports.campaign_runner.enabled"]')).toHaveValue('true');
    await expect(page.locator('[data-settings-row-label="Send time MT"]')).toBeVisible();
    await page.locator('[data-settings-path="reports.campaign_runner.enabled"]').selectOption('false');
    await expect(page.locator('[data-settings-row-label="Send time MT"]')).toBeHidden();
    await page.locator('[data-settings-path="reports.campaign_runner.enabled"]').selectOption('true');
    await expect(page.locator('[data-settings-row-label="Send time MT"]')).toBeVisible();
    await expect(page.locator('#admin-settings-results [data-settings-path="add_ons.enabled"]')).toHaveCount(0);
    await expect(page.locator('[data-settings-path="reports.campaign_runner.send_hour_mt"]')).toHaveAttribute('type', 'time');
    await expect(page.locator('[data-settings-path="reports.campaign_runner.send_hour_mt"]')).toHaveValue('07:00');
    await selectAdminSection(page, 'Campaigns');
    await expect(page.locator('#admin-content-publish')).toHaveText('Publish');
    await expect(page.locator('#admin-campaign-tabs')).toHaveCSS('flex-direction', 'column');
    await expect(page.getByRole('tab', { name: 'Hand Relations', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab="settings"]')).toHaveAttribute('aria-selected', 'true');
    await expect.poll(async () => {
      const campaignTab = await page.getByRole('tab', { name: 'Hand Relations', exact: true }).boundingBox();
      const sectionTabs = await page.locator('[data-campaign-settings-panel="hand-relations"] .admin-campaign-section-tabs').boundingBox();
      if (!campaignTab || !sectionTabs) return false;
      return Math.abs(campaignTab.y - sectionTabs.y) < 8;
    }).toBe(true);
    await expect.poll(async () => {
      return page.locator('[data-campaign-settings-panel="hand-relations"] .admin-campaign-section-tabs').evaluate((element: HTMLElement) => element.scrollWidth <= element.clientWidth + 1);
    }).toBe(true);
    await expect(page.getByRole('button', { name: 'About Goal amount' })).toHaveAttribute('aria-describedby', /admin-setting-help-/);
    const titleBox = await page.locator('[data-settings-path="title"]').boundingBox();
    const creatorNameBox = await page.locator('[data-settings-path="creator_name"]').boundingBox();
    expect(Math.abs((titleBox?.y || 0) - (creatorNameBox?.y || 0))).toBeLessThan(4);
    await expect(page.locator('#admin-campaign-settings-results [data-settings-row-label="State"]')).toContainText('live');
    await expect(page.locator('[data-settings-path="state"][data-settings-campaign="hand-relations"]')).toHaveCount(0);
    await expect(page.locator('#admin-campaign-settings-results [data-settings-row-label="Slug"] output')).toContainText('hand-relations');
    await expect(page.locator('#admin-campaign-settings-results [data-settings-row-label="URL"] output')).toContainText('/campaigns/hand-relations/');
    const goalAmountRow = page.locator('#admin-campaign-settings-results [data-settings-row-label="Goal amount"]').first();
    const goalAmountLabelBox = await goalAmountRow.locator('.admin-settings__label').boundingBox();
    const goalAmountInputBox = await goalAmountRow.locator('[data-settings-path="goal_amount"]').boundingBox();
    expect((goalAmountInputBox?.y || 0)).toBeGreaterThan((goalAmountLabelBox?.y || 0));
    await expect(page.locator('[data-settings-path="start_date"]')).toHaveAttribute('type', 'date');
    const startDateBox = await page.locator('[data-settings-path="start_date"]').boundingBox();
    const goalDeadlineBox = await page.locator('[data-settings-path="goal_deadline"]').boundingBox();
    expect(Math.abs((startDateBox?.y || 0) - (goalDeadlineBox?.y || 0))).toBeLessThan(4);
    await expect(page.locator('[data-settings-path="goal_amount"]')).toHaveAttribute('type', 'number');
    await expect(page.locator('[data-settings-path="goal_amount"]').locator('xpath=preceding-sibling::*[contains(@class, "admin-settings__affix")]')).toContainText('$');
    await page.locator('[data-settings-path="goal_amount"]').fill('26000');
    await expect(page.locator('#admin-content-publish')).toHaveText('Publish');
    await expect(page.locator('#admin-content-publish')).toBeEnabled();
    await page.locator('[data-settings-path="goal_amount"]').fill('25000');
    await expect(page.locator('#admin-content-publish')).toHaveText('Publish');
    await expect(page.locator('#admin-content-publish')).toBeDisabled();
    await expect(page.locator('[data-settings-path="slug"][data-settings-campaign="hand-relations"]')).toHaveCount(0);
    await expect(page.locator('[data-settings-path="short_blurb"] em')).toContainText('short');
    const shortBlurbEditor = page.locator('[data-settings-path="short_blurb"]');
    await shortBlurbEditor.locator('.admin-settings__rich-inline-editor em').evaluate((node: HTMLElement) => {
      const textNode = node.firstChild;
      if (!textNode) throw new Error('Expected emphasized short blurb text');
      const range = document.createRange();
      range.selectNodeContents(textNode);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await expect(shortBlurbEditor.getByLabel('Italic')).toHaveClass(/is-active/);
    await expect(page.locator('#admin-content-publish')).toHaveText('Publish');
    await shortBlurbEditor.locator('.admin-settings__rich-inline-editor').click();
    await page.keyboard.type('x');
    await expect(page.locator('#admin-content-publish')).toHaveText('Publish');
    await expect(page.locator('#admin-content-publish')).toBeEnabled();
    await expect(page.locator('#admin-content-save-draft')).toBeEnabled();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z');
    await expect(page.locator('#admin-content-publish')).toHaveText('Publish');
    await expect(page.locator('#admin-content-publish')).toBeDisabled();
    await expect(page.locator('#admin-content-save-draft')).toBeDisabled();
    const shippingChoices = page.locator('[data-settings-path="shipping_options"]');
    await expect(shippingChoices.getByRole('checkbox', { name: 'Standard', exact: true })).toBeChecked();
    await expect(shippingChoices.getByRole('checkbox', { name: 'Standard', exact: true })).toBeDisabled();
    await expect(shippingChoices.getByRole('checkbox', { name: 'Signature required', exact: true })).toBeChecked();
    await shippingChoices.getByRole('checkbox', { name: 'Adult signature required', exact: true }).check();
    await expect(page.locator('#admin-content-publish')).toBeEnabled();
    await shippingChoices.getByRole('checkbox', { name: 'Adult signature required', exact: true }).uncheck();
    await expect(page.locator('#admin-content-publish')).toBeDisabled();
    await page.locator('[data-settings-path="runner_report_emails"] input[type="email"]').fill('second@example.com,');
    await expect(page.locator('[data-settings-path="runner_report_emails"]')).toContainText('second@example.com');
    const heroImageBox = await page.locator('[data-settings-path="hero_image"]').boundingBox();
    const heroWideBox = await page.locator('[data-settings-path="hero_image_wide"]').boundingBox();
    expect(Math.abs((heroImageBox?.y || 0) - (heroWideBox?.y || 0))).toBeLessThan(4);
    const heroImagePreviewBox = await page.locator('[data-settings-path="hero_image"] .admin-settings__image-preview').boundingBox();
    const heroWidePreviewBox = await page.locator('[data-settings-path="hero_image_wide"] .admin-settings__image-preview').boundingBox();
    const heroImageUploadBox = await page.locator('[data-settings-path="hero_image"] .admin-settings__image-upload').boundingBox();
    const heroWideUploadBox = await page.locator('[data-settings-path="hero_image_wide"] .admin-settings__image-upload').boundingBox();
    expect(Math.abs((heroImagePreviewBox?.y || 0) - (heroWidePreviewBox?.y || 0))).toBeLessThan(4);
    expect(Math.abs((heroImageUploadBox?.y || 0) - (heroWideUploadBox?.y || 0))).toBeLessThan(4);
    expect((heroImageUploadBox?.y || 0)).toBeGreaterThan((heroImagePreviewBox?.y || 0) + (heroImagePreviewBox?.height || 0) - 2);
    expect(Math.abs((heroImagePreviewBox?.width || 0) - (heroImageUploadBox?.width || 0))).toBeLessThan(4);
    const campaignBackgroundBox = await page.locator('[data-settings-path="campaign_background"]').boundingBox();
    const progressBackgroundBox = await page.locator('[data-settings-path="progress_background"]').boundingBox();
    expect(Math.abs((campaignBackgroundBox?.y || 0) - (progressBackgroundBox?.y || 0))).toBeLessThan(4);
    await expect(page.locator('[data-settings-path="hero_video"] video')).toBeVisible();
    await expect(page.locator('[data-settings-path="hero_video"] video source')).toHaveAttribute('src', '/assets/videos/defaults/hand-relations.webm');
    const heroVideoPlayback = await page.locator('[data-settings-path="hero_video"] video').evaluate(async (video: HTMLVideoElement) => {
      video.muted = true;
      video.currentTime = 0;
      await video.play();
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      return {
        paused: video.paused,
        currentTime: video.currentTime,
        ended: video.ended,
        readyState: video.readyState
      };
    });
    expect(heroVideoPlayback.paused).toBe(false);
    expect(heroVideoPlayback.ended).toBe(false);
    expect(heroVideoPlayback.currentTime).toBeGreaterThan(0);
    await page.locator('[data-settings-video-upload-input]').setInputFiles({
      name: 'hero.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('video')
    });
    await expect.poll(() => calls.imageUpload.at(-1)?.contentType).toBe('video/mp4');
    await expect(page.locator('[data-settings-path="hero_video"] video source')).toHaveAttribute('src', '/assets/videos/admin/hero-e2e.mp4');
    await page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab="tiers"]').click();
    const featuredTier = page.locator('[data-settings-path="featured_tier_id"]');
    await expect(featuredTier).toBeVisible();
    await expect(featuredTier).toHaveValue('frame-slot');
    await expect(featuredTier.locator('option')).toHaveText(['None', '$5 - Buy 1 Frame (frame-slot)']);
    const tiersFieldLabels = page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab-panel="tiers"] .admin-settings__field-stack > .admin-settings__label');
    await expect(tiersFieldLabels).toHaveCount(1);
    await expect(tiersFieldLabels).toContainText('Featured tier');
    await expect(page.locator('[data-settings-path="tiers"][data-settings-campaign="hand-relations"]')).toBeVisible();
    await expect(page.locator('[data-settings-path="tiers"][data-settings-campaign="hand-relations"] img').first()).toHaveAttribute('src', /tier-frame/);
    const tierEditor = page.locator('[data-settings-path="tiers"][data-settings-campaign="hand-relations"]');
    await expect(tierEditor.locator(':scope > .btn').first()).toHaveText('Add item');
    await expect.poll(async () => {
      const card = await tierEditor.locator('.admin-settings__product-card').first().boundingBox();
      const moveButton = await tierEditor.getByLabel('Move item up').first().boundingBox();
      const name = await tierEditor.locator('[data-collection-field="name"]').first().boundingBox();
      if (!card || !moveButton || !name) return false;
      return moveButton.y < name.y && moveButton.x > card.x + card.width / 2;
    }).toBe(true);
    await expect(tierEditor.getByLabel('Move item up').first()).toBeDisabled();
    await expect(tierEditor.getByLabel('Move item down').first()).toBeDisabled();
    await tierEditor.locator(':scope > .btn').first().click();
    await tierEditor.locator('[data-collection-field="name"]').first().fill('Reorder Test Tier');
    await expect.poll(async () => {
      const value = await tierEditor.evaluate((element: any) => element.value);
      return JSON.parse(value)[0].name;
    }).toBe('Reorder Test Tier');
    await tierEditor.getByLabel('Move item down').first().click();
    await tierEditor.getByRole('button', { name: 'Delete' }).last().click();
    await expect(tierEditor.locator('.admin-settings__product-card')).toHaveCount(1);
    await expect(tierEditor.locator('.admin-settings__help-button')).toHaveCount(10);
    await expect(tierEditor.locator('[data-collection-derived-id]').first()).toContainText('frame-slot');
    await expect(tierEditor.getByRole('textbox', { name: 'ID' })).toHaveCount(0);
    await expect(tierEditor.locator('[data-collection-field="description"]')).toContainText('Sponsor a frame.');
    await expect(tierEditor.getByRole('spinbutton', { name: 'Price (USD)' }).first()).toHaveValue('5');
    await expect(tierEditor.getByRole('button', { name: 'About Quantity limit' })).toHaveAttribute('aria-describedby', /admin-setting-help-/);
    await expect(tierEditor.getByText(/For non-stackable tiers/)).toBeAttached();
    await expect.poll(async () => {
      const card = tierEditor.locator('[data-campaign-collection-card]').first();
      const bounds = await card.evaluate((element) => {
        function rectFor(selector: string) {
          const field = element.querySelector(selector);
          const wrap = field?.closest('.admin-settings__product-field, .admin-settings__product-image');
          if (!(wrap instanceof HTMLElement)) return null;
          const rect = wrap.getBoundingClientRect();
          return { x: rect.x, y: rect.y };
        }
        return {
          name: rectFor('[data-collection-field="name"]'),
          id: rectFor('[data-collection-derived-id]'),
          description: rectFor('[data-collection-field="description"]'),
          image: rectFor('[data-collection-field="image"]'),
          price: rectFor('[data-collection-field="price"]'),
          threshold: rectFor('[data-collection-field="requires_threshold"]'),
          category: rectFor('[data-collection-field="category"]'),
          stackable: rectFor('[data-collection-field="stackable"]'),
          quantityLimit: rectFor('[data-collection-field="limit_total"]'),
          lateSupport: rectFor('[data-collection-field="late_support"]')
        };
      });
      const { name, id, description, image, price, threshold, category, stackable, quantityLimit, lateSupport } = bounds;
      if (!name || !id || !description || !image || !price || !threshold || !category || !stackable || !quantityLimit || !lateSupport) return false;
      return Math.abs(name.y - id.y) < 8
        && Math.abs(description.y - image.y) < 8
        && Math.abs(price.y - threshold.y) < 8
        && Math.abs(category.y - stackable.y) < 8
        && Math.abs(quantityLimit.y - lateSupport.y) < 8
        && description.y > name.y
        && price.y > description.y
        && category.y > price.y
        && quantityLimit.y > category.y;
    }).toBe(true);
    await expect.poll(async () => {
      const card = tierEditor.locator('[data-campaign-collection-card]').first();
      return card.evaluate((element) => {
        const descriptionLabel = element.querySelector('[data-collection-field="description"]')?.closest('.admin-settings__product-field')?.querySelector('.admin-settings__product-label');
        const imageLabel = element.querySelector('[data-collection-field="image"]')?.closest('.admin-settings__product-image')?.querySelector('.admin-settings__product-label');
        const toolbar = element.querySelector('[data-collection-field="description"] .admin-settings__rich-inline-toolbar');
        const editor = element.querySelector('[data-collection-field="description"] .admin-settings__rich-inline-editor');
        if (!(descriptionLabel instanceof HTMLElement) || !(imageLabel instanceof HTMLElement) || !(toolbar instanceof HTMLElement) || !(editor instanceof HTMLElement)) return false;
        const descriptionLabelBox = descriptionLabel.getBoundingClientRect();
        const imageLabelBox = imageLabel.getBoundingClientRect();
        const toolbarBox = toolbar.getBoundingClientRect();
        const editorBox = editor.getBoundingClientRect();
        return Math.abs(descriptionLabelBox.y - imageLabelBox.y) < 8 && toolbarBox.height < 56 && editorBox.height > 180;
      });
    }).toBe(true);
    const tierDescriptionEditor = tierEditor.locator('[data-collection-field="description"]').first();
    await tierDescriptionEditor.locator('.admin-settings__rich-inline-editor strong').evaluate((node: HTMLElement) => {
      const textNode = node.firstChild;
      if (!textNode) throw new Error('Expected bold tier description text');
      const range = document.createRange();
      range.selectNodeContents(textNode);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await expect(tierDescriptionEditor.getByLabel('Bold')).toHaveClass(/is-active/);
    await tierDescriptionEditor.locator('.admin-settings__rich-inline-editor').evaluate((editor: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      editor.focus();
      const data = new DataTransfer();
      data.setData('text/html', '<p><span style="font-weight: 700;">Word bold paste</span></p>');
      editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
    });
    await expect(tierDescriptionEditor.locator('.admin-settings__rich-inline-editor strong')).toContainText('Word bold paste');
    await expect.poll(async () => {
      const value = await tierEditor.evaluate((element: any) => element.value);
      return JSON.parse(value)[0].description;
    }).toContain('**Word bold paste**');
    await expect(tierEditor.getByRole('button', { name: 'About Category' })).toHaveAttribute('aria-describedby', /admin-setting-help-/);
    await expect(tierEditor.getByRole('spinbutton', { name: 'Quantity limit' }).first()).toBeVisible();
    await expect(tierEditor.locator('[data-collection-field="remaining"]')).toHaveCount(0);
    await page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab="support_items"]').click();
    await expect(page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab-panel="support_items"] .admin-settings__field-stack > .admin-settings__label')).toHaveCount(0);
    await expect(page.locator('[data-settings-path="support_items"][data-settings-campaign="hand-relations"]')).toBeVisible();
    const supportItemsEditor = page.locator('[data-settings-path="support_items"][data-settings-campaign="hand-relations"]');
    await expect(supportItemsEditor.locator('.admin-settings__help-button')).toHaveCount(7);
    await expect(supportItemsEditor.getByLabel('Move item up').first()).toBeDisabled();
    await expect(supportItemsEditor.getByLabel('Move item down').first()).toBeDisabled();
    await expect(supportItemsEditor.getByRole('textbox', { name: 'Name' })).toHaveValue('Location Scouting');
    await expect(supportItemsEditor.locator('[data-collection-derived-id]').first()).toContainText('location-scouting');
    await expect(supportItemsEditor.getByRole('textbox', { name: 'ID' })).toHaveCount(0);
    await expect(supportItemsEditor.getByRole('textbox', { name: 'Description' }).first()).toHaveValue('travel + permits');
    await expect.poll(async () => {
      const card = supportItemsEditor.locator('[data-campaign-collection-card]').first();
      const bounds = await card.evaluate((element) => {
        function rectFor(selector: string) {
          const field = element.querySelector(selector);
          const wrap = field?.closest('.admin-settings__product-field');
          if (!(wrap instanceof HTMLElement)) return null;
          const rect = wrap.getBoundingClientRect();
          return { x: rect.x, y: rect.y };
        }
        return {
          name: rectFor('[data-collection-field="label"]'),
          id: rectFor('[data-collection-derived-id]'),
          description: rectFor('[data-collection-field="need"]'),
          target: rectFor('[data-collection-field="target"]'),
          lateSupport: rectFor('[data-collection-field="late_support"]'),
          category: rectFor('[data-collection-field="category"]')
        };
      });
      const { name, id, description, target, lateSupport, category } = bounds;
      if (!name || !id || !description || !target || !lateSupport || !category) return false;
      return Math.abs(name.y - id.y) < 8
        && Math.abs(description.y - target.y) < 8
        && Math.abs(lateSupport.y - category.y) < 8
        && description.y > name.y
        && lateSupport.y > description.y;
    }).toBe(true);
    await expect.poll(async () => {
      const add = await supportItemsEditor.getByRole('button', { name: 'Add item' }).boundingBox();
      const remove = await supportItemsEditor.getByRole('button', { name: 'Delete' }).first().boundingBox();
      if (!add || !remove) return false;
      return Math.abs(add.height - remove.height) < 1;
    }).toBe(true);
    await supportItemsEditor.getByRole('textbox', { name: 'Name' }).fill('Location Scouting Updated');
    await expect(supportItemsEditor.locator('[data-collection-derived-id]').first()).toContainText('location-scouting');
    await expect(supportItemsEditor.getByRole('spinbutton', { name: 'Target (USD)' }).first()).toHaveValue('1000');
    await supportItemsEditor.getByRole('button', { name: 'Add item' }).click();
    await supportItemsEditor.getByRole('textbox', { name: 'Name' }).first().fill('New Support Need');
    await expect(supportItemsEditor.locator('[data-collection-derived-id]').first()).toContainText('new-support-need');
    await expect(supportItemsEditor.locator('select[data-collection-field="shipping_preset"]').first()).toBeVisible();
    await supportItemsEditor.locator('select[data-collection-field="category"]').first().selectOption('digital');
    await expect(supportItemsEditor.locator('select[data-collection-field="shipping_preset"]').first()).toBeHidden();
    await supportItemsEditor.locator('select[data-collection-field="category"]').first().selectOption('physical');
    await expect(supportItemsEditor.locator('select[data-collection-field="shipping_preset"]').first()).toBeVisible();
    await expect(page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab="content"]')).toHaveText('Content');
    await expect(page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab="campaign_add_ons"]')).toHaveText('Add-Ons');
    await expect(page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab="stretch_goals"]')).toHaveText('Stretch Goals');
    await expect(page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab="ongoing_items"]')).toHaveText('Ongoing Items');
    await page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab="campaign_add_ons"]').click();
    await expect(page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab-panel="campaign_add_ons"] .admin-settings__field-stack > .admin-settings__label')).toHaveCount(0);
    const campaignAddOnsEditor = page.locator('[data-settings-path="campaign_add_ons"][data-settings-campaign="hand-relations"]');
    await expect(campaignAddOnsEditor).toBeVisible();
    await expect(campaignAddOnsEditor.locator('[data-add-on-product-field="name"]').first()).toHaveValue('Poster Pack');
    await expect(campaignAddOnsEditor.locator('[data-add-on-product-derived-id]').first()).toContainText('poster-pack');
    await expect(campaignAddOnsEditor.locator('input[type="text"][data-add-on-product-field="id"]')).toHaveCount(0);
    await expect(campaignAddOnsEditor.locator('[data-add-on-variant-field="label"]').first()).toHaveValue('Matte');
    await expect(campaignAddOnsEditor.locator('[data-add-on-variant-derived-id]').first()).toContainText('matte');
    await expect(campaignAddOnsEditor.locator('input[type="text"][data-add-on-variant-field="id"]')).toHaveCount(0);
    await expect(campaignAddOnsEditor.locator('[data-add-on-variant-row]').first().locator(':scope > .admin-settings__variant-field').nth(0)).toContainText('Label');
    await expect(campaignAddOnsEditor.locator('[data-add-on-variant-row]').first().locator(':scope > .admin-settings__variant-field').nth(1)).toContainText('ID');
    await expect.poll(async () => {
      return campaignAddOnsEditor.locator('.admin-settings__variants').first().evaluate((element: Element) => {
        const add = Array.from(element.children).find((child) => child.textContent?.trim() === 'Add variant');
        const rows = element.querySelector('.admin-settings__variant-list');
        return Boolean(add && rows && (add.compareDocumentPosition(rows) & Node.DOCUMENT_POSITION_FOLLOWING));
      });
    }).toBe(true);
    await expect.poll(async () => {
      return campaignAddOnsEditor.locator('[data-add-on-variant-row]').first().evaluate((row: Element) => {
        const cells = Array.from(row.querySelectorAll(':scope > .admin-settings__variant-field'));
        const remove = row.querySelector(':scope > button');
        if (cells.length < 3 || !(remove instanceof HTMLElement)) return false;
        const columns = getComputedStyle(row).gridTemplateColumns.split(' ').filter(Boolean);
        const removeStyle = getComputedStyle(remove);
        const labels = cells.map((cell) => cell.querySelector('.admin-settings__product-label')?.getBoundingClientRect());
        const widths = columns.map((column) => Number.parseFloat(column));
        const derived = row.querySelector('[data-add-on-variant-derived-id]')?.getBoundingClientRect();
        const inventory = row.querySelector('[data-add-on-variant-field="inventory"]')?.getBoundingClientRect();
        if (labels.some((label) => !label)) return false;
        return columns.length === 3
          && widths.every((width) => Math.abs(width - widths[0]) < 2)
          && removeStyle.gridColumnStart === '1'
          && removeStyle.gridColumnEnd === '-1'
          && Math.abs((labels[0]?.y || 0) - (labels[1]?.y || 0)) < 4
          && Math.abs((labels[0]?.y || 0) - (labels[2]?.y || 0)) < 4
          && Boolean(derived && inventory && Math.abs((derived.y + derived.height / 2) - (inventory.y + inventory.height / 2)) < 4)
          && cells.every((cell) => cell.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
    }).toBe(true);
    await expect.poll(async () => {
      const card = campaignAddOnsEditor.locator('[data-add-on-product-card]').first();
      const name = await card.locator('[data-add-on-product-field="name"]').boundingBox();
      const id = await card.locator('[data-add-on-product-derived-id]').boundingBox();
      if (!name || !id) return false;
      return Math.abs(name.y - id.y) < 8 && name.x < id.x;
    }).toBe(true);
    await expect.poll(async () => {
      const card = campaignAddOnsEditor.locator('[data-add-on-product-card]').first();
      const description = await card.locator('[data-add-on-product-field="description"]').evaluate((element: Element) => {
        const rect = element.closest('.admin-settings__product-field')?.getBoundingClientRect();
        return rect ? { x: rect.x, y: rect.y } : null;
      });
      const image = await card.locator('[data-add-on-product-field="image_url"]').evaluate((element: Element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y };
      });
      if (!description || !image) return false;
      return Math.abs(description.y - image.y) < 12 && description.x < image.x;
    }).toBe(true);
    await expect.poll(async () => {
      const card = campaignAddOnsEditor.locator('[data-add-on-product-card]').first();
      const source = await card.locator('[data-add-on-product-field="source_url"]').boundingBox();
      const variantOptionName = await card.locator('[data-add-on-product-field="variant_option_name"]').boundingBox();
      if (!source || !variantOptionName) return false;
      return Math.abs(source.y - variantOptionName.y) < 8 && source.x < variantOptionName.x;
    }).toBe(true);
    for (const label of ['ID', 'Name', 'Description', 'Image', 'Price', 'Category', 'Shipping preset', 'Inventory', 'Source URL', 'Variant option name', 'Variants', 'Label']) {
      await expect(campaignAddOnsEditor.getByRole('button', { name: `About ${label}` }).first()).toHaveAttribute('aria-describedby', /admin-setting-help-/);
    }
    await campaignAddOnsEditor.locator('[data-add-on-variant-field="label"]').first().fill('Matte Updated');
    await expect(campaignAddOnsEditor.locator('[data-add-on-variant-derived-id]').first()).toContainText('matte');
    await campaignAddOnsEditor.locator('[data-add-on-variant-field="label"]').first().fill('Matte');
    await campaignAddOnsEditor.getByRole('button', { name: 'Add variant' }).first().click();
    await campaignAddOnsEditor.locator('[data-add-on-variant-field="label"]').first().fill('Gloss Finish');
    await expect(campaignAddOnsEditor.locator('[data-add-on-variant-derived-id]').first()).toContainText('gloss-finish');
    await campaignAddOnsEditor.getByRole('button', { name: 'Delete variant' }).first().click();
    await campaignAddOnsEditor.locator('[data-add-on-product-field="name"]').first().fill('Poster Pack Updated');
    await expect(campaignAddOnsEditor.locator('[data-add-on-product-derived-id]').first()).toContainText('poster-pack');
    await campaignAddOnsEditor.getByRole('button', { name: 'Add product' }).click();
    await campaignAddOnsEditor.locator('[data-add-on-product-field="name"]').first().fill('Digital Extras');
    await expect(campaignAddOnsEditor.locator('[data-add-on-product-derived-id]').first()).toContainText('digital-extras');
    await campaignAddOnsEditor.getByRole('button', { name: /Delete product/ }).first().click();
    await expect(campaignAddOnsEditor.locator('[data-add-on-product-field="shipping_preset"]').first()).toBeVisible();
    await campaignAddOnsEditor.locator('[data-add-on-product-field="category"]').first().selectOption('digital');
    await expect(campaignAddOnsEditor.locator('[data-add-on-product-field="shipping_preset"]').first()).toBeHidden();
    await campaignAddOnsEditor.locator('[data-add-on-product-field="category"]').first().selectOption('physical');
    await expect(campaignAddOnsEditor.locator('[data-add-on-product-field="shipping_preset"]').first()).toBeVisible();
    await page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab="stretch_goals"]').click();
    await expect(page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab-panel="stretch_goals"] .admin-settings__field-stack > .admin-settings__label')).toHaveCount(0);
    await expect(page.locator('[data-settings-path="stretch_goals"][data-settings-campaign="hand-relations"]')).toBeVisible();
    await expect(page.locator('[data-settings-path="stretch_goals"][data-settings-campaign="hand-relations"] [data-collection-field="title"]').first()).toHaveValue('Festival cut');
    await page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab="ongoing_items"]').click();
    await expect(page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab-panel="ongoing_items"] .admin-settings__field-stack > .admin-settings__label')).toHaveCount(0);
    await expect(page.locator('[data-settings-path="ongoing_items"][data-settings-campaign="hand-relations"]')).toBeVisible();
    await expect(page.locator('[data-settings-path="ongoing_items"][data-settings-campaign="hand-relations"] [data-collection-field="label"]').first()).toHaveValue('Post-production');
    await page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab="decisions"]').click();
    await expect(page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab-panel="decisions"] .admin-settings__field-stack > .admin-settings__label')).toHaveCount(0);
    await expect(page.locator('[data-settings-path="decisions"][data-settings-campaign="hand-relations"]')).toBeVisible();
    const decisionsEditor = page.locator('[data-settings-path="decisions"][data-settings-campaign="hand-relations"]');
    await expect(decisionsEditor.locator('.admin-settings__help-button')).toHaveCount(7);
    await expect(decisionsEditor.locator('[data-collection-derived-id]').first()).toContainText('poster');
    await expect(decisionsEditor.getByRole('textbox', { name: 'ID' })).toHaveCount(0);
    await expect(decisionsEditor.locator('select[data-collection-field="eligible"]').first()).toHaveValue('backers');
    await expect(decisionsEditor.locator('select[data-collection-field="eligible"] option')).toHaveText(['Campaign supporters', 'Charged campaign supporters']);
    await expect(decisionsEditor.locator('select[data-collection-field="status"]')).toHaveCount(0);
    await expect(decisionsEditor.locator('[data-decision-derived-status]').first()).toContainText('Closed');
    await decisionsEditor.locator('[data-collection-field="deadline"]').first().fill('2027-01-10');
    await expect(decisionsEditor.locator('[data-decision-derived-status]').first()).toContainText('Open');
    await expect(decisionsEditor.locator('[data-decision-option-row]')).toHaveCount(2);
    await expect(decisionsEditor.locator('[data-decision-option-field="label"]').first()).toHaveValue('A');
    await expect.poll(async () => {
      return decisionsEditor.locator('[data-decision-option-row]').first().evaluate((row) => {
        const label = row.querySelector('[data-decision-option-field="label"]')?.closest('.admin-settings__variant-field');
        const preview = row.querySelector('.admin-settings__image-preview');
        const upload = row.querySelector('.admin-settings__image-upload');
        const uploadButton = row.querySelector('.admin-settings__image-upload .btn');
        const remove = row.querySelector('.admin-settings__decision-option-delete');
        if (!(label instanceof HTMLElement) || !(preview instanceof HTMLElement) || !(upload instanceof HTMLElement) || !(uploadButton instanceof HTMLElement) || !(remove instanceof HTMLElement)) return false;
        const rowBox = row.getBoundingClientRect();
        const labelBox = label.getBoundingClientRect();
        const previewBox = preview.getBoundingClientRect();
        const uploadBox = upload.getBoundingClientRect();
        const uploadButtonBox = uploadButton.getBoundingClientRect();
        const removeBox = remove.getBoundingClientRect();
        const sameColumn = [labelBox, previewBox, uploadBox, removeBox].every((box) => Math.abs(box.left - rowBox.left) < 4 && Math.abs(box.width - rowBox.width) < 8);
        return sameColumn
          && labelBox.bottom <= previewBox.top
          && previewBox.bottom <= uploadBox.top
          && uploadBox.bottom <= removeBox.top
          && Math.abs(uploadButtonBox.height - removeBox.height) < 1;
      });
    }).toBe(true);
    const decisionOptionPreviewBox = await decisionsEditor.locator('[data-decision-option-row] .admin-settings__image-preview').first().boundingBox();
    expect(Math.abs((decisionOptionPreviewBox?.height || 0) - (heroImagePreviewBox?.height || 0))).toBeLessThan(4);
    await expect(decisionsEditor.locator('[data-decision-option-field="image"] img').first()).toHaveAttribute('src', /poster-a/);
    await decisionsEditor.locator('[data-decision-option-image-upload]').first().setInputFiles({
      name: 'decision-option.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgo=', 'base64')
    });
    await expect.poll(() => calls.imageUpload.some((call: any) => call.kind === 'decision-option')).toBe(true);
    expect(calls.imageUpload.find((call: any) => call.kind === 'decision-option')).toMatchObject({ filename: 'decision-option.png', contentType: 'image/png', kind: 'decision-option' });
    await expect.poll(async () => {
      const value = await decisionsEditor.evaluate((element: any) => element.value);
      return JSON.parse(value)[0].options[0].image;
    }).toBe('/assets/images/admin/add-on-e2e.png');
    await decisionsEditor.getByRole('button', { name: 'Add option' }).click();
    await decisionsEditor.locator('[data-decision-option-field="label"]').last().fill('C');
    await expect.poll(async () => {
      const value = await decisionsEditor.evaluate((element: any) => element.value);
      return JSON.parse(value)[0].options.at(-1).label;
    }).toBe('C');
    await decisionsEditor.getByRole('button', { name: 'Delete option' }).last().click();
    await expect(decisionsEditor.getByLabel('Move item up').first()).toBeDisabled();
    await expect(decisionsEditor.getByLabel('Move item down').first()).toBeDisabled();
    await page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab="diary"]').click();
    await expect(page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab-panel="diary"] .admin-settings__field-stack > .admin-settings__label')).toHaveCount(0);
    await expect(page.locator('[data-settings-path="diary"][data-settings-campaign="hand-relations"]')).toBeVisible();
    const diaryEditor = page.locator('[data-settings-path="diary"][data-settings-campaign="hand-relations"]');
    await expect(diaryEditor.locator('.admin-settings__help-button')).toHaveCount(8);
    await expect(diaryEditor.locator('[data-collection-field="title"]').first()).toHaveValue('Campaign page live!');
    const diaryDateInput = diaryEditor.locator('input[type="datetime-local"]').first();
    await expect(diaryDateInput).toHaveAttribute('type', 'datetime-local');
    await expect(diaryDateInput).toHaveValue('2025-10-18T12:00');
    const diaryPhaseSelect = diaryEditor.locator('select[data-collection-field="phase"]').first();
    await expect(diaryPhaseSelect).toHaveValue('fundraising');
    await diaryPhaseSelect.selectOption('production');
    await expect(diaryPhaseSelect).toHaveValue('production');
    await expect.poll(async () => {
      const value = await diaryEditor.evaluate((element: any) => element.value);
      return JSON.parse(value)[0].phase;
    }).toBe('production');
    await diaryDateInput.fill('2025-10-19T14:30');
    await expect.poll(async () => {
      const value = await diaryEditor.evaluate((element: any) => element.value);
      return JSON.parse(value)[0].date;
    }).toBe('2025-10-19T14:30-06:00');
    const diaryContentEditor = diaryEditor.locator('[data-diary-content-editor]').first();
    await expect.poll(async () => {
      const chrome = diaryContentEditor.locator('.admin-content-block__chrome').first();
      const typeBox = await chrome.locator('.admin-content-block__toolbar-group--type').boundingBox();
      const actionsBox = await chrome.locator('.admin-content-block__toolbar-group--block-actions').boundingBox();
      const formatBox = await chrome.locator('.admin-content-block__actions').boundingBox();
      if (!typeBox || !actionsBox || !formatBox) return false;
      const actionsRight = actionsBox.x + actionsBox.width;
      const formatRight = formatBox.x + formatBox.width;
      return Math.abs(typeBox.y - actionsBox.y) < 4
        && actionsBox.x > typeBox.x
        && formatBox.y > typeBox.y + typeBox.height - 2
        && Math.abs(actionsRight - formatRight) < 4;
    }).toBe(true);
    await expect(diaryContentEditor.locator('[data-content-field="body"]').first()).toContainText('We launched.');
    await expect(diaryContentEditor.locator('[data-content-field="body"]').first()).toHaveCSS('text-transform', 'none');
    await expect(diaryContentEditor.locator('[data-content-field="body"]').first()).not.toHaveCSS('font-weight', '700');
    await expect(diaryContentEditor.locator('[data-content-field="body"] strong').first()).toContainText('We launched.');
    await expect(diaryContentEditor.locator('[data-content-field="body"] ul')).toBeVisible();
    await expect(diaryContentEditor.locator('[data-content-field="body"] li').first()).toContainText('$1');
    await expect(diaryContentEditor.getByLabel('Unordered list').first()).toBeVisible();
    await expect(diaryContentEditor.getByLabel('Numbered list').first()).toBeVisible();
    const diaryTopInsert = diaryContentEditor.locator('.admin-content-insert').first();
    await diaryTopInsert.hover({ position: { x: 8, y: 14 } });
    await diaryTopInsert.getByLabel('Add content block').click();
    await expect(diaryContentEditor.locator('.content-block')).toHaveCount(2);
    const insertedDiaryBody = diaryContentEditor.locator('[data-content-index="0"][data-content-field="body"]');
    await expect(insertedDiaryBody).toBeFocused();
    await expect(insertedDiaryBody.locator('p')).toHaveCount(1);
    const insertedDiaryTypography = await insertedDiaryBody.locator('p').evaluate((element) => {
      const style = window.getComputedStyle(element);
      return { fontSize: style.fontSize, lineHeight: style.lineHeight };
    });
    const existingDiaryTypography = await diaryContentEditor.locator('[data-content-index="1"][data-content-field="body"] p').first().evaluate((element) => {
      const style = window.getComputedStyle(element);
      return { fontSize: style.fontSize, lineHeight: style.lineHeight };
    });
    expect(insertedDiaryTypography).toEqual(existingDiaryTypography);
    await expect.poll(async () => {
      const value = await diaryEditor.evaluate((element: any) => element.value);
      return JSON.parse(value)[0].content.length;
    }).toBe(2);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z');
    await expect(diaryContentEditor.locator('.content-block')).toHaveCount(1);
    await expect(page.locator('#admin-content-preview')).toHaveCount(0);
    await expect(page.locator('#admin-content-publish')).toBeEnabled();
    await expect(diaryEditor.getByRole('button', { name: 'Save draft' }).first()).toBeDisabled();
    await diaryContentEditor.locator('[data-content-field="body"]').first().fill('Diary WYSIWYG update');
    await expect(diaryEditor.getByRole('button', { name: 'Save draft' }).first()).toHaveClass(/is-dirty/);
    await expect(diaryEditor.getByRole('button', { name: 'Save draft' }).first()).toBeEnabled();
    await expect.poll(async () => {
      const value = await diaryEditor.evaluate((element: any) => element.value);
      return JSON.parse(value)[0].content[0].body;
    }).toBe('**Diary WYSIWYG update**');
    await diaryEditor.getByRole('button', { name: 'Save draft' }).first().click();
    await expect(diaryEditor.getByRole('button', { name: 'Save draft' }).first()).toBeDisabled();
    await diaryContentEditor.locator('[data-content-field="body"]').first().evaluate((editor: HTMLElement) => {
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node && !(node.textContent || '').includes('Diary WYSIWYG update')) node = walker.nextNode();
      if (!node) throw new Error('Expected diary text node');
      const range = document.createRange();
      range.setStart(node, 'Diary'.length);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      editor.focus();
    });
    await page.keyboard.type(' ');
    await expect(diaryEditor.getByRole('button', { name: 'Save draft' }).first()).toBeEnabled();
    await page.keyboard.press('Backspace');
    await expect(diaryEditor.getByRole('button', { name: 'Save draft' }).first()).toBeDisabled();
    await page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab="tiers"]').click();
    await expect(tierEditor.locator('select[data-collection-field="shipping_preset"]')).toHaveCount(0);
    await tierEditor.locator('[data-collection-field="category"]').first().selectOption('physical');
    await expect(tierEditor.locator('select[data-collection-field="shipping_preset"]')).toHaveCount(0);
    await expect(tierEditor.getByRole('spinbutton', { name: 'Quantity limit' }).first()).toBeVisible();
    await tierEditor.locator('[data-collection-field="category"]').first().selectOption('digital');
    await expect(tierEditor.locator('select[data-collection-field="shipping_preset"]')).toHaveCount(0);
    await expect(tierEditor.getByRole('spinbutton', { name: 'Quantity limit' }).first()).toBeVisible();
    await page.locator('[data-settings-path="tiers"][data-settings-campaign="hand-relations"] [data-collection-field="name"]').first().fill('Buy One Frame Updated');
    await selectAdminSection(page, 'Settings');
    await selectSettingsSection(page, 'Debug');
    await expect(page.locator('[data-settings-path="debug.console_logging_enabled"]')).toHaveValue('true');
    await page.locator('[data-settings-path="debug.verbose_console_logging"]').selectOption('false');
    await selectSettingsSection(page, 'Design');
    await expect(page.locator('[data-settings-path="platform.logo_path"] img')).toHaveAttribute('src', /dust-wave-square/);
    await expect(page.locator('[data-logo-path-input]')).toHaveCount(0);
    await page.locator('[data-logo-upload-input]').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgo=', 'base64')
    });
    await expect.poll(() => calls.logoUpload.length).toBe(1);
    expect(calls.logoUpload[0]).toMatchObject({ filename: 'logo.png', contentType: 'image/png' });
    await expect(page.locator('[data-settings-path="platform.logo_path"] img')).toHaveAttribute('src', /logo-e2e/);
    await expect(page.locator('[data-settings-path="design.color_text"]')).toHaveAttribute('type', 'color');
    await selectSettingsSection(page, 'Platform');
    await page.locator('[data-settings-path="platform.name"]').fill('The Pool Updated');
    await selectSettingsSection(page, 'Tax');
    await page.locator('[data-settings-path="tax.provider"]').selectOption('offline_rules');
    await selectSettingsSection(page, 'Pricing');
    await page.locator('[data-settings-path="pricing.sales_tax_rate"]').fill('8.125');
    await selectSettingsSection(page, 'Campaign runner reports');
    await page.locator('[data-settings-path="reports.campaign_runner.send_hour_mt"]').fill('09:30');
    await selectAdminSection(page, 'Platform add-ons');
    await expect(page.locator('#admin-addons-results [data-settings-path="add_ons.enabled"]')).toHaveValue('true');
    await expect(page.locator('#admin-addons-results [data-settings-row-label="Low stock threshold"]')).toBeVisible();
    await expect(page.locator('#admin-addons-results [data-settings-row-label="Products"]')).toBeVisible();
    await page.locator('#admin-addons-results [data-settings-path="add_ons.enabled"]').selectOption('false');
    await expect(page.locator('#admin-addons-results [data-settings-row-label="Low stock threshold"]')).toBeHidden();
    await expect(page.locator('#admin-addons-results [data-settings-row-label="Products"]')).toBeHidden();
    await page.locator('#admin-addons-results [data-settings-path="add_ons.enabled"]').selectOption('true');
    await expect(page.locator('#admin-addons-results [data-settings-row-label="Low stock threshold"]')).toBeVisible();
    await expect(page.locator('#admin-addons-results [data-settings-path="add_ons.low_stock_threshold"]')).toHaveValue('5');
    await page.locator('#admin-addons-results [data-settings-path="add_ons.low_stock_threshold"]').fill('4');
    await expect(page.locator('#admin-addons-results [data-add-on-product-field="name"]').first()).toHaveValue('DUST WAVE Sticker');
    await expect(page.locator('#admin-addons-results [data-add-on-product-field="image_url"] img').first()).toHaveAttribute('src', /sticker/);
    await page.locator('#admin-addons-results [data-add-on-product-image-upload]').first().setInputFiles({
      name: 'add-on.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgo=', 'base64')
    });
    await expect.poll(() => calls.imageUpload.some((call: any) => call.kind === 'add-on')).toBe(true);
    expect(calls.imageUpload.find((call: any) => call.kind === 'add-on')).toMatchObject({ filename: 'add-on.png', contentType: 'image/png', kind: 'add-on' });
    await expect(page.locator('#admin-addons-results [data-add-on-product-field="image_url"] img').first()).toHaveAttribute('src', /add-on-e2e/);
    await page.locator('#admin-addons-results [data-add-on-product-field="name"]').first().fill('DUST WAVE Sticker Updated');
    await expect(page.locator('#admin-addons-results [data-add-on-product-field="shipping_preset"]').first()).toHaveValue('sticker');
    await page.locator('#admin-addons-results [data-add-on-product-field="shipping_preset"]').first().selectOption('tshirt');
    await expect(page.locator('#admin-addons-results [data-add-on-variant-field="label"]').first()).toHaveValue('Small');
    await page.getByRole('button', { name: 'Add product' }).click();
    await page.locator('#admin-addons-results [data-add-on-product-field="id"]').last().fill('digital-zine');
    await page.locator('#admin-addons-results [data-add-on-product-field="name"]').last().fill('Digital Zine');
    await page.locator('#admin-addons-results [data-add-on-product-field="description"]').last().fill('Downloadable launch zine.');
    await page.locator('#admin-addons-results [data-add-on-product-field="price"]').last().fill('5');
    await page.locator('#admin-addons-results [data-add-on-product-field="category"]').last().selectOption('digital');
    await expect(page.getByRole('button', { name: 'Validate changes' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Load settings' })).toHaveCount(0);
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('Changes may take a few minutes');
      dialog.accept();
    });
    await expect(page.locator('#admin-addons-publish')).toBeEnabled();
    await page.locator('#admin-addons-publish').click();
    await expect.poll(() => calls.settingsPreview.length).toBe(1);
    await expect(page.locator('#admin-addons-status')).toContainText('Deploy started');
    await expect.poll(() => calls.settingsPublish.length).toBe(1);
    expect(calls.settingsPublish[0].changes[0]).toMatchObject({ path: 'platform.name', value: 'The Pool Updated' });
    expect(calls.settingsPublish[0].changes).toContainEqual(expect.objectContaining({ path: 'pricing.sales_tax_rate', value: '0.08125' }));
    expect(calls.settingsPublish[0].changes).toContainEqual(expect.objectContaining({ path: 'tax.provider', value: 'offline_rules' }));
    expect(calls.settingsPublish[0].changes).toContainEqual(expect.objectContaining({ path: 'reports.campaign_runner.send_hour_mt', value: '9' }));
    expect(calls.settingsPublish[0].changes).toContainEqual(expect.objectContaining({ path: 'reports.campaign_runner.send_minute_mt', value: '30' }));
    expect(calls.settingsPublish[0].changes).toContainEqual(expect.objectContaining({ path: 'platform.logo_path', value: '/assets/images/admin/logo-e2e.png' }));
    expect(calls.settingsPublish[0].changes).toContainEqual(expect.objectContaining({ path: 'debug.verbose_console_logging', value: 'false' }));
    expect(calls.settingsPublish[0].changes).not.toContainEqual(expect.objectContaining({ path: 'slug' }));
    expect(calls.settingsPublish[0].changes).toContainEqual(expect.objectContaining({ path: 'runner_report_emails', campaignSlug: 'hand-relations', value: 'runner@example.com, second@example.com' }));
    const tiersChange = calls.settingsPublish[0].changes.find((change: any) => change.path === 'tiers');
    expect(JSON.parse(tiersChange.value)[0]).toMatchObject({ id: 'frame-slot', name: 'Buy One Frame Updated' });
    expect(calls.settingsPublish[0].changes).toContainEqual(expect.objectContaining({ path: 'add_ons.low_stock_threshold', value: '4' }));
    const addOnProductsChange = calls.settingsPublish[0].changes.find((change: any) => change.path === 'add_ons.products');
    expect(JSON.parse(addOnProductsChange.value)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'dust-wave-sticker', name: 'DUST WAVE Sticker Updated', image_url: '/assets/images/admin/add-on-e2e.png', shipping_preset: 'tshirt' }),
      expect.objectContaining({ id: 'digital-zine', name: 'Digital Zine', category: 'digital', price: 5 })
    ]));
    await page.locator('#admin-tab-settings').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Campaigns', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Platform add-ons' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-admin-tabs] > .admin-tabs__list').getByRole('tab', { name: 'Reports', exact: true })).toHaveAttribute('aria-selected', 'true');

    const summaryCallsBeforeRefresh = calls.summary.length;
    await page.getByRole('button', { name: 'Refresh' }).focus();
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => calls.summary.length).toBeGreaterThan(summaryCallsBeforeRefresh);

    await expectNoAxeViolations(page);
  });

  test('loads the Spanish admin route and keeps campaign users out of platform inventory', async ({ page }) => {
    await routeAdminWorker(page, { role: 'campaign_user' });

    await page.goto('/es/admin/?admin_login=creator-token');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('#admin-app')).toBeVisible();
    await expect(page.locator('#admin-session-summary')).toContainText('creator@example.com');
    await expect(page.getByRole('tab', { name: 'Platform add-ons' })).toHaveCount(0);
    await expect(page.locator('#admin-inventory-section')).toBeHidden();
  });

  test('previews reports and downloads CSVs', async ({ page }) => {
    const calls = await signInWithMagicToken(page);

    await selectAdminSection(page, 'Reports');
    await page.locator('#admin-report-campaign').selectOption('hand-relations');
    await page.locator('#admin-report-preview-form').evaluate((form: HTMLFormElement) => form.requestSubmit());
    await expect.poll(() => calls.reportPreview.length).toBeGreaterThanOrEqual(1);
    await expect(page.locator('#admin-report-preview')).toContainText('supporter@example.com');
    await page.getByRole('button', { name: 'Download CSV' }).click();
    await expect(page.locator('#admin-report-status')).toContainText('CSV download started.');
    await expect.poll(() => calls.reportCsv.length).toBe(1);
    expect(calls.reportCsv[0]).toMatchObject({ campaignSlug: 'hand-relations', reportType: 'pledge' });

  });

  test('keeps marketing local and validates content preview/publish flows', async ({ page }) => {
    const calls = await signInWithMagicToken(page);

    await selectAdminSection(page, 'Marketing tools');
    await page.locator('#admin-marketing-source').fill('newsletter');
    await page.locator('#admin-marketing-medium').fill('email');
    await page.locator('#admin-marketing-ref').fill('launch-list');
    await expect(page.locator('#admin-marketing-url')).toHaveValue(/utm_source=newsletter/);
    await expect(page.locator('#admin-marketing-url')).toHaveValue(/utm_campaign=hand-relations/);
    await expect(page.locator('#admin-marketing-url')).toHaveValue(/ref=launch-list/);

    await selectAdminSection(page, 'Analytics');
    await expect.poll(() => calls.analytics.length).toBe(1);
    await expect(page.locator('#admin-analytics-results')).toContainText('Pledged');

    await selectAdminSection(page, 'Campaigns');
    await page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab="content"]').click();
    await expect(page.locator('[data-campaign-settings-panel="hand-relations"] [data-campaign-settings-subtab-panel="content"] .admin-settings__field-stack > .admin-settings__label')).toHaveCount(0);
    await expect(page.locator('#admin-content-status')).not.toContainText('Campaign content loaded into the local draft.');
    await expect.poll(() => calls.contentPreview.length).toBeGreaterThanOrEqual(1);
    await expect(page.locator('#admin-content-blocks [data-content-field="body"]')).toContainText('Existing body with Terms.');
    await expect(page.locator('#admin-content-blocks .admin-content-block__chrome').first()).toHaveCSS('display', 'grid');
    await expect(page.locator('#admin-content-blocks [data-content-field="body"]')).not.toContainText('[Terms](/terms/)');
    await expect(page.locator('#admin-content-blocks [data-content-field="body"] a[href="/terms/"]')).toContainText('Terms');
    await page.locator('#admin-content-blocks [data-content-field="body"] a[href="/terms/"]').click();
    const activeLinkPanel = page.locator('#admin-content-blocks .admin-content-block__link-panel:not([hidden])');
    await expect(page.locator('#admin-content-blocks').getByLabel('Link').first()).toHaveClass(/is-active/);
    await expect(activeLinkPanel.getByLabel('Link URL')).toHaveValue('/terms/');
    await activeLinkPanel.getByLabel('Link URL').fill('/terms/#creative');
    await activeLinkPanel.getByRole('button', { name: 'Apply' }).click();
    await expect(page.locator('#admin-content-blocks [data-content-field="body"] a[href="/terms/#creative"]')).toContainText('Terms');
    expect(JSON.parse(await page.locator('#admin-content-long-content').inputValue())[0].body).toContain('**[Terms](/terms/#creative)**');
    await page.locator('#admin-content-blocks [data-content-field="body"]').evaluate((editor: HTMLElement) => {
      const textNode = editor.querySelector('p')?.firstChild;
      if (!textNode) throw new Error('Expected leading text node');
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 8);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      editor.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowRight' }));
    });
    await expect(page.locator('#admin-content-blocks .admin-content-block__link-panel:not([hidden])')).toHaveCount(0);
    await expect(page.locator('#admin-content-blocks').getByLabel('Link').first()).not.toHaveClass(/is-active/);
    await page.locator('#admin-content-long-content').evaluate((textarea: HTMLTextAreaElement) => {
      textarea.value = JSON.stringify([{ type: 'text', body: 'The tiers are the story.\n\n- **$1** — one frame\n- **$5** — writer credit', align: 'left' }]);
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('#admin-content-blocks [data-content-field="body"] ul')).toBeVisible();
    await expect(page.locator('#admin-content-blocks [data-content-field="body"] li')).toHaveCount(2);
    await expect(page.locator('#admin-content-blocks [data-content-field="body"] li').first()).toContainText('$1');
    await expect(page.locator('#admin-content-blocks [data-content-field="body"] li strong').first()).toContainText('$1');
    await expect(page.locator('#admin-content-blocks').getByLabel('Unordered list').first()).toBeVisible();
    await expect(page.locator('#admin-content-blocks').getByLabel('Numbered list').first()).toBeVisible();
    expect(JSON.parse(await page.locator('#admin-content-long-content').inputValue())[0].body).toContain('- **$1**');
    await page.locator('#admin-content-long-content').evaluate((textarea: HTMLTextAreaElement) => {
      textarea.value = JSON.stringify([{ type: 'text', body: 'First item\n\nSecond item', align: 'left' }]);
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const listButtonEditor = page.locator('#admin-content-blocks [data-content-field="body"]').first();
    await listButtonEditor.evaluate((editor: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      editor.focus();
      editor.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowRight' }));
    });
    await page.locator('#admin-content-blocks').getByLabel('Numbered list').first().click();
    await expect(listButtonEditor.locator('ol')).toBeVisible();
    await expect(listButtonEditor.locator('ol li')).toHaveCount(2);
    expect(JSON.parse(await page.locator('#admin-content-long-content').inputValue())[0].body).toContain('1. First item');
    await page.locator('#admin-content-long-content').evaluate((textarea: HTMLTextAreaElement) => {
      textarea.value = JSON.stringify([{ type: 'text', body: 'Alpha item\n\nBeta item', align: 'left' }]);
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await listButtonEditor.evaluate((editor: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      editor.focus();
      editor.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowRight' }));
    });
    await page.locator('#admin-content-blocks').getByLabel('Unordered list').first().click();
    await expect(listButtonEditor.locator('ul')).toBeVisible();
    await expect(listButtonEditor.locator('ul li')).toHaveCount(2);
    expect(JSON.parse(await page.locator('#admin-content-long-content').inputValue())[0].body).toContain('- Alpha item');
    await listButtonEditor.evaluate((editor: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      editor.focus();
      const data = new DataTransfer();
      data.setData('text/html', '<p><span style="font-weight: 700;">Docs bold paste</span></p><ul><li><span style="font-style: italic;">Docs list item</span></li></ul>');
      editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
    });
    await expect(listButtonEditor.locator('strong')).toContainText('Docs bold paste');
    await expect(listButtonEditor.locator('ul li em')).toContainText('Docs list item');
    expect(JSON.parse(await page.locator('#admin-content-long-content').inputValue())[0].body).toContain('**Docs bold paste**');
    expect(JSON.parse(await page.locator('#admin-content-long-content').inputValue())[0].body).toContain('- *Docs list item*');
    await page.locator('#admin-content-long-content').evaluate((textarea: HTMLTextAreaElement) => {
      textarea.value = JSON.stringify([{ type: 'image', src: '', alt: '', caption: '', align: 'left' }]);
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('#admin-content-publish')).toHaveText('Publish');
    await expect(page.locator('#admin-content-publish')).toHaveClass(/is-dirty/);
    await expect(page.locator('#admin-content-publish')).toBeEnabled();
    await expect(page.locator('#admin-content-save-draft')).toBeEnabled();
    expect(await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    })).toBe(true);
    await page.locator('#admin-content-save-draft').click();
    await expect(page.locator('#admin-content-status')).toContainText('Draft saved in this browser.');
    await expect(page.locator('#admin-content-publish')).toHaveText('Publish');
    await expect(page.locator('#admin-content-publish')).toBeDisabled();
    await expect(page.locator('#admin-content-save-draft')).toBeDisabled();
    await page.locator('#admin-content-long-content').evaluate((textarea: HTMLTextAreaElement) => {
      textarea.value = JSON.stringify([{ type: 'text', body: 'Alpha body', align: 'left' }]);
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.locator('#admin-content-save-draft').click();
    await expect(page.locator('#admin-content-save-draft')).toBeDisabled();
    const draftBodyEditor = page.locator('#admin-content-blocks [data-content-field="body"]').first();
    await draftBodyEditor.evaluate((editor: HTMLElement) => {
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node && !(node.textContent || '').includes('Alpha body')) node = walker.nextNode();
      if (!node) throw new Error('Expected Alpha body text node');
      const range = document.createRange();
      range.setStart(node, 'Alpha'.length);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      editor.focus();
    });
    await page.keyboard.type(' ');
    await expect(page.locator('#admin-content-save-draft')).toBeEnabled();
    await page.keyboard.press('Backspace');
    await expect(page.locator('#admin-content-save-draft')).toBeDisabled();
    await page.locator('#admin-content-long-content').evaluate((textarea: HTMLTextAreaElement) => {
      textarea.value = JSON.stringify([{ type: 'image', src: '', alt: '', caption: '', align: 'left' }]);
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const mediaBlock = page.locator('#admin-content-blocks .content-block--image');
    await expect(mediaBlock.getByText('Open media settings to preview this block.')).toBeVisible();
    await expect(mediaBlock.getByLabel('Caption')).toHaveAttribute('data-placeholder', 'Optional caption - hidden unless filled');
    await expect(mediaBlock.locator('.admin-content-block__settings-panel')).toBeHidden();
    const settingsButton = mediaBlock.getByRole('button', { name: 'Media settings' });
    await expect(settingsButton).toHaveAttribute('aria-expanded', 'false');
    await settingsButton.click();
    await expect(settingsButton).toHaveAttribute('aria-expanded', 'true');
    await expect(mediaBlock.locator('.admin-content-block__settings-panel')).toBeVisible();
    await mediaBlock.getByLabel('Source URL').fill('/assets/images/hand-relations/poster.jpg');
    await mediaBlock.getByLabel('Alt text').fill('Hand Relations poster');
    await expect(page.locator('#admin-content-long-content')).toHaveValue(/Hand Relations poster/);
    await mediaBlock.getByLabel('Alt text').press('Escape');
    await expect(settingsButton).toHaveAttribute('aria-expanded', 'false');
    await expect(mediaBlock.locator('.admin-content-block__settings-panel')).toBeHidden();
    await page.locator('#admin-content-long-content').evaluate((textarea: HTMLTextAreaElement) => {
      textarea.value = JSON.stringify([{ type: 'text', body: 'Existing body.', align: 'left' }]);
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await page.locator('#admin-content-blocks [data-content-field="body"]').fill('<script>alert(1)</script>');
    await page.locator('#admin-content-editor').evaluate((form: HTMLFormElement) => form.requestSubmit());
    await expect(page.locator('#admin-content-status')).toContainText('Preview needs changes before it can publish.');
    await expect(page.locator('#admin-content-validation')).toContainText('raw <script> HTML');

    const bodyEditor = page.locator('#admin-content-blocks [data-content-field="body"]');
    await bodyEditor.fill('Safe updated body.');
    await expect.poll(() => calls.contentPreview.at(-1)?.draft.longContent?.[0]?.body).toContain('Safe updated body.');
    await bodyEditor.press('End');
    await bodyEditor.press('Enter');
    await bodyEditor.pressSequentially('/quote');
    await page.keyboard.press('Enter');
    await bodyEditor.selectText();
    const campaignContentBlocks = page.locator('#admin-content-blocks');
    await expect.poll(async () => {
      const chrome = campaignContentBlocks.locator('.admin-content-block__chrome').first();
      const typeBox = await chrome.locator('.admin-content-block__toolbar-group--type').boundingBox();
      const actionsBox = await chrome.locator('.admin-content-block__toolbar-group--block-actions').boundingBox();
      const formatBox = await chrome.locator('.admin-content-block__actions').boundingBox();
      if (!typeBox || !actionsBox || !formatBox) return false;
      const actionsRight = actionsBox.x + actionsBox.width;
      const formatRight = formatBox.x + formatBox.width;
      return Math.abs(typeBox.y - actionsBox.y) < 4
        && actionsBox.x > typeBox.x
        && formatBox.y > typeBox.y + typeBox.height - 2
        && Math.abs(actionsRight - formatRight) < 4;
    }).toBe(true);
    await campaignContentBlocks.getByLabel('Bold').first().click();
    await expect(campaignContentBlocks.getByLabel('Bold').first()).toHaveClass(/is-active/);
    await campaignContentBlocks.getByLabel('Bold').first().click();
    await expect(campaignContentBlocks.getByLabel('Bold').first()).not.toHaveClass(/is-active/);
    page.once('dialog', (dialog) => dialog.accept('https://example.com'));
    await campaignContentBlocks.getByLabel('Link').first().click();
    await campaignContentBlocks.locator('.admin-content-block__format-select').first().selectOption('h2');
    await expect(campaignContentBlocks.locator('.admin-content-block__format-select').first()).toHaveValue('h2');
    await campaignContentBlocks.getByLabel('Align center').first().click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z');
    await expect(page.locator('#admin-content-blocks .content-block')).toHaveCount(2);
    await expect(campaignContentBlocks.locator('[data-content-action="delete"]').first().locator('svg')).toHaveCount(1);
    await expect(campaignContentBlocks.locator('[data-content-action="delete"]').first()).toHaveText('');
    const topInsertControl = page.locator('#admin-content-blocks .admin-content-insert').first();
    const topInsertButton = topInsertControl.getByLabel('Add content block');
    await topInsertControl.hover({ position: { x: 8, y: 14 } });
    await topInsertButton.click();
    await expect(page.locator('#admin-content-blocks .content-block')).toHaveCount(3);
    const insertedCampaignBody = page.locator('#admin-content-blocks [data-content-index="0"][data-content-field="body"]');
    await expect(insertedCampaignBody).toBeFocused();
    await expect(insertedCampaignBody.locator('p')).toHaveCount(1);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z');
    await expect(page.locator('#admin-content-blocks .content-block')).toHaveCount(2);
    const insertControl = page.locator('#admin-content-blocks .admin-content-insert').nth(1);
    const insertButton = insertControl.getByLabel('Add content block');
    await expect(insertButton).toHaveCSS('opacity', '0');
    await insertControl.hover({ position: { x: 8, y: 14 } });
    await expect(insertButton).toHaveCSS('opacity', '1');
    await expect.poll(async () => insertControl.evaluate((control) => {
      const button = control.querySelector('.admin-content-insert__button');
      if (!(button instanceof HTMLElement)) return false;
      const controlRect = control.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      return buttonRect.left >= controlRect.left && buttonRect.right <= controlRect.right;
    })).toBe(true);
    await insertButton.click();
    await expect(page.locator('#admin-content-blocks .content-block')).toHaveCount(3);
    await expect(page.locator('#admin-content-blocks [data-content-index="1"][data-content-field="body"]')).toBeFocused();
    await page.locator('#admin-content-long-content').evaluate((textarea: HTMLTextAreaElement) => {
      textarea.value = JSON.stringify([
        { type: 'text', body: '## [Safe updated body.](https://example.com)', align: 'left' },
        { type: 'quote', text: '', author: '', align: 'left' }
      ]);
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.locator('#admin-content-blocks [data-content-field="body"]').first().click();
    await expect(campaignContentBlocks.locator('.admin-content-block__format-select').first()).toHaveValue('h2');
    await expect(campaignContentBlocks.locator('.admin-content-block__chrome').first()).toHaveCSS('opacity', '1');
    await page.locator('#admin-session-summary').click();
    await expect(campaignContentBlocks.locator('.admin-content-block__chrome').first()).toHaveCSS('opacity', '0');
    await page.locator('#admin-content-long-content').evaluate((textarea: HTMLTextAreaElement) => {
      textarea.value = JSON.stringify([
        { type: 'text', body: '## Mixed heading\n\nMixed paragraph', align: 'left' },
        { type: 'quote', text: '', author: '', align: 'left' }
      ]);
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.locator('#admin-content-blocks [data-content-field="body"]').first().evaluate((editor: HTMLElement) => {
      const heading = editor.querySelector('h2')?.firstChild;
      const paragraph = editor.querySelector('p')?.firstChild;
      if (!heading || !paragraph) throw new Error('Expected heading and paragraph nodes');
      const range = document.createRange();
      range.setStart(heading, 0);
      range.setEnd(paragraph, paragraph.textContent?.length || 0);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await expect(campaignContentBlocks.locator('.admin-content-block__format-select').first()).toHaveValue('multiple');
    await page.locator('#admin-content-long-content').evaluate((textarea: HTMLTextAreaElement) => {
      textarea.value = JSON.stringify([
        { type: 'text', body: '## [Safe updated body.](https://example.com)', align: 'left' },
        { type: 'quote', text: '', author: '', align: 'left' }
      ]);
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.locator('#admin-content-blocks [data-content-field="body"]').first().click();
    await campaignContentBlocks.getByLabel('Align center').first().click();
    const quoteEditor = page.locator('#admin-content-blocks [data-content-field="text"]');
    await quoteEditor.click();
    await expect(page.locator('#admin-content-blocks .content-block--quote [data-content-action="up"]')).toHaveCSS('font-style', 'normal');
    await quoteEditor.fill('A thoughtful pull quote.');
    await quoteEditor.selectText();
    await campaignContentBlocks.getByLabel('Italic').last().click();
    await page.locator('#admin-content-long-content').evaluate((textarea: HTMLTextAreaElement) => {
      textarea.value = JSON.stringify([{ type: 'video', provider: 'youtube', video_id: 'demo-video', caption: '', align: 'left' }]);
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect.poll(() => calls.contentPreview.at(-1)?.draft.longContent?.[0]?.type).toBe('video');
    await expect.poll(async () => page.locator('#admin-content-preview-mobile').evaluate((iframe: HTMLIFrameElement) => iframe.srcdoc)).toContain('https://www.youtube-nocookie.com/embed/demo-video');
    const videoBlock = page.locator('#admin-content-blocks .content-block--video');
    await videoBlock.locator('.video-embed').click({ position: { x: 20, y: 20 } });
    await expect(videoBlock).toHaveClass(/is-active/);
    await expect(videoBlock.locator('.admin-content-block__chrome')).toHaveCSS('opacity', '1');
    await page.locator('#admin-content-long-content').evaluate((textarea: HTMLTextAreaElement) => {
      textarea.value = JSON.stringify([
        { type: 'text', body: '## [Safe updated body.](https://example.com)', align: 'center' },
        { type: 'quote', text: 'A thoughtful pull quote.', author: '', align: 'left' }
      ]);
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.locator('#admin-content-editor').evaluate((form: HTMLFormElement) => form.requestSubmit());
    await expect(page.locator('#admin-content-status')).toContainText('Preview is ready.');

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#admin-content-publish').click();
    await expect(page.locator('#admin-content-status')).toContainText('Content published. Rebuild status: Yes');
    await expect.poll(() => calls.contentPublish.length).toBe(1);

    expect(calls.contentPreview.length).toBeGreaterThanOrEqual(2);
    expect(calls.contentPreview.at(-1)?.draft.longContent).toEqual([
      { type: 'text', body: '## [Safe updated body.](https://example.com)', align: 'center' },
      { type: 'quote', text: 'A thoughtful pull quote.', author: '', align: 'left' }
    ]);
    expect(calls.authStart).toHaveLength(0);
  });
});
