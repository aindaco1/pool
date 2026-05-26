import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
}

function extractTopLevelYamlBlock(source: string, blockName: string) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `${blockName}:`);
  if (start < 0) return [];
  const block: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[A-Za-z0-9_-]+:\s*$/.test(line)) break;
    block.push(line);
  }
  return block;
}

function extractTwoSpaceKeys(block: string[]) {
  return block
    .map((line) => line.match(/^  ([A-Za-z0-9_-]+):/)?.[1])
    .filter(Boolean);
}

class CountingKVNamespace {
  store = new Map<string, string>();
  getCalls = 0;
  putCalls = 0;
  deleteCalls = 0;
  listCalls = 0;

  async get(key: string, options?: { type?: string }) {
    this.getCalls += 1;
    if (!this.store.has(key)) return null;
    const value = this.store.get(key) as string;
    return options?.type === 'json' ? JSON.parse(value) : value;
  }

  async put(key: string, value: string) {
    this.putCalls += 1;
    this.store.set(key, value);
  }

  async delete(key: string) {
    this.deleteCalls += 1;
    this.store.delete(key);
  }

  async list(options?: { prefix?: string; cursor?: string }) {
    this.listCalls += 1;
    const prefix = String(options?.prefix || '');
    const keys = Array.from(this.store.keys())
      .filter((key) => !prefix || key.startsWith(prefix))
      .sort()
      .map((name) => ({ name }));
    return { keys, list_complete: true };
  }

  resetCounts() {
    this.getCalls = 0;
    this.putCalls = 0;
    this.deleteCalls = 0;
    this.listCalls = 0;
  }
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function createEnv() {
  return {
    SITE_BASE: 'https://pool.test',
    WORKER_BASE: 'https://pledge.pool.test',
    CANONICAL_SITE_BASE: 'https://pool.dustwave.xyz',
    CANONICAL_WORKER_BASE: 'https://pledge.dustwave.xyz',
    APP_MODE: 'test',
    ADMIN_EXPOSE_LOGIN_LINK: 'true',
    PLATFORM_AUTHOR: 'Dust Wave',
    SALES_TAX_RATE: '0.07625',
    MAGIC_LINK_SECRET: 'test-admin-session-secret',
    ADMIN_SECRET: 'admin-secret',
    ADMIN_BOOTSTRAP_EMAILS: 'admin@example.com',
    PLEDGES: new CountingKVNamespace(),
    RATELIMIT: new CountingKVNamespace()
  };
}

async function signInAdmin(env: ReturnType<typeof createEnv>, email = 'admin@example.com') {
  const ctx = { waitUntil: vi.fn() };
  const startResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/auth/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, preferredLang: 'en' })
  }), env, ctx);
  const startBody = await startResponse.json();
  const loginToken = new URL(startBody.loginUrl).searchParams.get('admin_login');
  const exchangeResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/auth/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: loginToken, preferredLang: 'en' })
  }), env, ctx);
  const exchangeBody = await exchangeResponse.json();
  return {
    ctx,
    response: exchangeResponse,
    cookie: exchangeResponse.headers.get('Set-Cookie')?.split(';')[0] || '',
    csrfToken: exchangeBody.csrfToken
  };
}

function getCookieValue(cookie: string, name: string) {
  for (const part of String(cookie || '').split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === name) {
      return decodeURIComponent(rawValue.join('=') || '');
    }
  }
  return '';
}

function resetKvCounters(env: ReturnType<typeof createEnv>) {
  (env.PLEDGES as CountingKVNamespace).resetCounts();
  (env.RATELIMIT as CountingKVNamespace).resetCounts();
}

function readKvCounters(env: ReturnType<typeof createEnv>) {
  const pledges = env.PLEDGES as CountingKVNamespace;
  const ratelimit = env.RATELIMIT as CountingKVNamespace;
  return {
    pledges: {
      put: pledges.putCalls,
      delete: pledges.deleteCalls,
      list: pledges.listCalls
    },
    ratelimit: {
      put: ratelimit.putCalls,
      delete: ratelimit.deleteCalls,
      list: ratelimit.listCalls
    }
  };
}

function expectNoKvWritesOrLists(env: ReturnType<typeof createEnv>, label: string) {
  expect(readKvCounters(env), label).toEqual({
    pledges: { put: 0, delete: 0, list: 0 },
    ratelimit: { put: 0, delete: 0, list: 0 }
  });
}

const campaignFixture = {
  slug: 'hand-relations',
  title: 'Hand Relations',
  state: 'live',
  goal_amount: 25000,
  goal_deadline: '2099-12-31',
  start_date: '2026-01-01',
  short_blurb: 'Elevated horror where a corporate empathy campaign consumes bureaucracy.',
  long_content: [
    {
      type: 'text',
      body: '## The Vision\n\nA safe fixture block.'
    }
  ],
  decisions: [
    {
      id: 'villain-name',
      type: 'poll',
      title: "Main Villain's Name",
      deadline: '2026-02-15',
      options: ['Dr. Badguy McEvilface', 'The Dark Inconvenience', 'Susan'],
      eligible: 'backers',
      status: 'open'
    }
  ],
  runner_report_emails: ['runner@example.com']
};

const addOnsFixture = {
  enabled: true,
  low_stock_threshold: 5,
  products: [
    {
      id: 'dust-wave-sticker',
      name: 'DUST WAVE Sticker',
      price: 3,
      category: 'physical',
      inventory: 50,
      scope: 'platform',
      variants: []
    },
    {
      id: 'dust-wave-shirt',
      name: 'DUST WAVE Shirt',
      price: 25,
      category: 'physical',
      scope: 'platform',
      variant_option_name: 'Size',
      variants: [
        { id: 's', label: 'S', inventory: 2 },
        { id: 'm', label: 'M', inventory: 4 }
      ]
    },
    {
      id: 'smoke-editable__poster',
      name: 'Campaign Poster',
      price: 35,
      category: 'physical',
      inventory: 10,
      scope: 'campaign',
      campaign_slug: 'smoke-editable',
      campaign_title: 'SMOKE EDITABLE',
      variants: []
    }
  ]
};

const originalFetch = global.fetch;

let worker: {
  fetch: (request: Request, env: Record<string, unknown>, ctx: { waitUntil: (promise: Promise<unknown>) => void }) => Promise<Response>;
};

let resetCampaignRuntimeStateForTests: () => void;

beforeAll(async () => {
  ({ default: worker } = await import('../../worker/src/index.js'));
  ({ __resetCampaignRuntimeStateForTests: resetCampaignRuntimeStateForTests } = await import('../../worker/src/campaigns.js'));
});

beforeEach(() => {
  vi.useRealTimers();
  resetCampaignRuntimeStateForTests();
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url === 'https://pool.test/api/campaigns.json') {
      return jsonResponse({ campaigns: [campaignFixture] });
    }
    if (url === 'https://pool.test/api/add-ons.json') {
      return jsonResponse(addOnsFixture);
    }
    if (url === 'https://api.resend.com/emails') {
      return jsonResponse({ id: 'email-test' });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('admin dashboard foundation', () => {
  it('adds private localized admin routes and shell assets', () => {
    const config = readRepoFile('_config.yml');
    const robots = readRepoFile('robots.txt');
    const adminPage = readRepoFile('admin.md');
    const spanishAdminPage = readRepoFile('es', 'admin', 'index.html');
    const layout = readRepoFile('_layouts', 'admin.html');
    const embedBuilder = readRepoFile('_includes', 'campaign-embed-builder.html');
    const adminFieldLabel = readRepoFile('_includes', 'admin-field-label.html');
    const csp = readRepoFile('_includes', 'first-party-admin-csp.html');
    const campaignsApi = readRepoFile('api', 'campaigns.json');
    const mainScss = readRepoFile('assets', 'main.scss');
    const adminScss = readRepoFile('assets', 'partials', '_admin.scss');
    const adminScript = readRepoFile('assets', 'js', 'admin-dashboard.js');

    expect(config).toContain('admin:');
    expect(config).toContain('users:');
    expect(config).toContain('email: alonso@dustwave.xyz');
    expect(config).toContain('production_site_url: "https://pool.dustwave.xyz"');
    expect(config).toContain('production_worker_url: "https://pledge.dustwave.xyz"');
    expect(config).toContain('admin_production_site_url: "https://pool.dustwave.xyz"');
    expect(config).toContain('admin_production_worker_url: "https://pledge.dustwave.xyz"');
    expect(config).toContain('en: /admin/');
    expect(config).toContain('es: /es/admin/');
    expect(robots).toContain('Disallow: /admin/');
    expect(robots).toContain('Disallow: /es/admin/');
    expect(adminPage).toContain('layout: admin');
    expect(adminPage).toContain('indexable: false');
    expect(adminPage).toContain('sitemap: false');
    expect(spanishAdminPage).toContain('layout: admin');
    expect(spanishAdminPage).toContain('indexable: false');
    expect(spanishAdminPage).toContain('sitemap: false');
    expect(layout).toContain('indexable=false');
    expect(layout).toContain('social=false');
    expect(layout).toContain('href="#main-content"');
    expect(layout).toContain('<main id="main-content"');
    expect(layout).toContain('data-admin-dashboard-script="true"');
    expect(layout).toContain('assign admin_config = site["admin"]');
    expect(layout).toContain('data-canonical-site-url="{{ site.admin_production_site_url');
    expect(layout).toContain('data-canonical-worker-base="{{ site.admin_production_worker_url');
    expect(layout).toContain('role="tablist"');
    expect(layout).toContain('data-admin-tab="settings"');
    expect(layout).toContain('data-admin-tab="campaigns"');
    expect(layout).not.toContain('data-admin-tab="content"');
    expect(layout).toContain('data-admin-tab="addons"');
    expect(layout.indexOf('data-admin-tab="settings"')).toBeLessThan(layout.indexOf('data-admin-tab="addons"'));
    expect(layout.indexOf('data-admin-tab="addons"')).toBeLessThan(layout.indexOf('data-admin-tab="campaigns"'));
    expect(layout.indexOf('data-admin-tab="campaigns"')).toBeLessThan(layout.indexOf('data-admin-tab="analytics"'));
    expect(layout.indexOf('data-admin-tab="analytics"')).toBeLessThan(layout.indexOf('data-admin-tab="reports"'));
    expect(layout.indexOf('data-admin-tab="reports"')).toBeLessThan(layout.indexOf('data-admin-tab="supporters"'));
    expect(layout.indexOf('data-admin-tab="supporters"')).toBeLessThan(layout.indexOf('data-admin-tab="marketing"'));
    expect(layout).toContain('id="admin-settings-results"');
    expect(layout).toContain('id="admin-campaign-tabs"');
    expect(layout).toContain('id="admin-campaign-settings-results"');
    expect(layout).toContain('id="admin-report-preview-form"');
    expect(layout).toContain('id="admin-report-download"');
    expect(layout).not.toContain('id="admin-report-send"');
    expect(layout).not.toContain('id="admin-report-mark-sent"');
    expect(layout).not.toContain('id="admin-inventory-section"');
    expect(layout).not.toContain('id="admin-inventory-load"');
    expect(layout).toContain('id="admin-marketing-builder"');
    expect(layout).toContain('for="admin-marketing-campaign" label_key="admin.campaign_label" help_key="admin.marketing_help_campaign" help_id="admin-marketing-help-campaign" lang=current_lang required=true');
    expect(layout).toContain('id="admin-marketing-campaign" class="admin-settings__input" name="campaignSlug" required');
    expect(layout).toContain('id="admin-marketing-referrer"');
    expect(layout).toContain('id="admin-marketing-referrer" class="admin-settings__input" name="referrer" type="text" autocomplete="name" inputmode="text" required');
    expect(layout).toContain('id="admin-marketing-ref" class="admin-settings__input admin-settings__input--readonly"');
    expect(layout).toContain('id="admin-marketing-ref" class="admin-settings__input admin-settings__input--readonly" name="ref" type="text" autocomplete="off" inputmode="text" readonly');
    expect(layout).toContain('id="admin-marketing-save-referral"');
    expect(layout).toContain('id="admin-marketing-cancel-edit"');
    expect(layout).not.toContain('id="admin-marketing-embed-link"');
    expect(layout).toContain('id="admin-marketing-url"');
    expect(layout).toContain('id="admin-marketing-help-campaign"');
    expect(layout).toContain('id="admin-marketing-help-source"');
    expect(layout).toContain('id="admin-marketing-help-medium"');
    expect(layout).toContain('id="admin-marketing-help-content"');
    expect(layout).toContain('id="admin-marketing-help-ref"');
    expect(layout).toContain('id="admin-marketing-help-referrer"');
    expect(layout).toContain('id="admin-marketing-help-url"');
    expect(adminFieldLabel).toContain('<div class="admin-settings__label">');
    expect(adminFieldLabel).toContain('<label for="{{ include.for }}">');
    expect(adminFieldLabel).not.toMatch(/<label\b[^>]*>[\s\S]*?<button\b[\s\S]*?<\/label>/);
    expect(layout).toContain('id="admin-marketing-snippets"');
    expect(layout).toContain('id="admin-marketing-referrals"');
    expect(layout).toContain('campaign-embed-builder.html');
    expect(layout).toContain('autoload="false"');
    expect(layout).toContain('sync_query="false"');
    expect(layout).toContain('admin_marketing=true');
    expect(embedBuilder).toContain('data-admin-marketing-embed="true"');
    expect(embedBuilder).toContain('data-campaign-embed-autoload="{{ embed_autoload }}"');
    expect(embedBuilder).toContain('data-campaign-embed-sync-query="{{ embed_sync_query }}"');
    expect(layout).toContain('/assets/js/campaign-embed.js');
    expect(layout.indexOf('id="admin-marketing-campaign"')).toBeLessThan(layout.indexOf('id="admin-marketing-referrer"'));
    expect(layout.indexOf('id="admin-marketing-referrer"')).toBeLessThan(layout.indexOf('id="admin-marketing-ref"'));
    expect(layout.indexOf('id="admin-marketing-ref"')).toBeLessThan(layout.indexOf('id="admin-marketing-source"'));
    expect(layout.indexOf('id="admin-marketing-source"')).toBeLessThan(layout.indexOf('id="admin-marketing-medium"'));
    expect(layout.indexOf('id="admin-marketing-medium"')).toBeLessThan(layout.indexOf('id="admin-marketing-content"'));
    expect(layout.indexOf('id="admin-marketing-content"')).toBeLessThan(layout.indexOf('id="admin-marketing-url"'));
    expect(layout.indexOf('id="admin-marketing-save-referral"')).toBeLessThan(layout.indexOf('id="admin-marketing-status"'));
    expect(layout.indexOf('id="admin-marketing-status"')).toBeLessThan(layout.indexOf('id="admin-marketing-referrals"'));
    expect(layout.indexOf('id="admin-marketing-referrals"')).toBeLessThan(layout.indexOf('id="admin-marketing-snippets"'));
    expect(layout.indexOf('id="admin-marketing-snippets"')).toBeLessThan(layout.indexOf('campaign-embed-builder.html'));
    expect(layout).toContain('id="admin-analytics-campaign"');
    expect(layout).not.toContain('id="admin-analytics-load"');
    expect(layout).toContain('id="admin-analytics-results"');
    expect(layout).toContain('id="admin-content-editor"');
    expect(layout).toContain('id="admin-content-blocks"');
    expect(layout).toContain('id="admin-content-long-content"');
    expect(layout).not.toContain('id="admin-content-preview"');
    expect(layout).not.toContain('id="admin-content-preview-desktop"');
    expect(layout).not.toContain('id="admin-content-load"');
    expect(layout).not.toContain('admin.content_advanced_json');
    expect(layout).toContain('id="admin-content-publish"');
    expect(layout).toContain('id="admin-campaign-status"');
    expect(layout).toContain('sandbox="allow-scripts allow-popups allow-presentation"');
    expect(csp).toContain("frame-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('https://www.youtube-nocookie.com');
    expect(csp).toContain('{{ site.platform.worker_url }}');
    expect(csp).toContain("media-src 'self' https: blob:");
    expect(campaignsApi).toContain('"decisions": {{ campaign.decisions | default: empty | jsonify }}');
    expect(mainScss).toContain('@import "partials/admin";');
    expect(adminScss).toContain('@media (max-width: 1100px)');
    expect(adminScss).toContain('.admin-tabs__list');
    expect(adminScss).toContain('overflow-x: auto;');
    expect(adminScss).toContain('.admin-mobile-tab-select');
    expect(adminScss).toContain('@media (max-width: 899px)');
    expect(adminScss).toContain('display: grid;');
    expect(adminScss).toContain('.admin-content-block.is-active .admin-content-block__chrome');
    expect(adminScss).toContain('.admin-settings__field-grid--count-5');
    expect(adminScss).toContain('repeat(auto-fit, minmax(8rem, 1fr))');
    expect(adminScript).toContain('pool-admin-marketing-builder');
    expect(adminScript).toContain('syncMobileTabSelect');
    expect(adminScript).toContain('filenameBase');
    expect(adminScript).toContain("url.searchParams.set('utm_campaign', campaign.slug)");
    expect(adminScript).toContain('/admin/marketing/referrals');
    expect(adminScript).toContain('/admin/analytics');
    expect(adminScript).toContain('function formatMoneyExact');
    expect(adminScript).toContain('minimumFractionDigits: 2');
    expect(adminScript).toContain('formatMoneyExact(supporter.amount)');
    expect(adminScript).toContain('/admin/settings');
    expect(adminScript).toContain('admin-settings__users-editor');
    expect(adminScript).toContain('data-admin-user-card');
    expect(adminScript).toContain('/admin/content/preview');
    expect(adminScript).toContain('/admin/content/publish');
    expect(adminScript).toContain('pool-admin-content-draft:');
  });

  it('keeps English and Spanish admin translation keys in parity', () => {
    const enAdminKeys = extractTwoSpaceKeys(extractTopLevelYamlBlock(readRepoFile('_data', 'i18n', 'en.yml'), 'admin'));
    const esAdminKeys = extractTwoSpaceKeys(extractTopLevelYamlBlock(readRepoFile('_data', 'i18n', 'es.yml'), 'admin'));

    expect(enAdminKeys.length).toBeGreaterThan(20);
    expect(esAdminKeys).toEqual(enAdminKeys);
  });

  it('keeps visible Spanish admin navigation labels translated', () => {
    const spanishAdminCatalog = readRepoFile('_data', 'i18n', 'es.yml');

    expect(spanishAdminCatalog).toContain('overview_title: "Panel de control"');
    expect(spanishAdminCatalog).toContain('marketing_title: "Promoción"');
  });

  it('keeps admin dashboard runtime translation keys in the admin catalog', () => {
    const enAdminKeys = new Set(extractTwoSpaceKeys(extractTopLevelYamlBlock(readRepoFile('_data', 'i18n', 'en.yml'), 'admin')));
    const adminScript = readRepoFile('assets', 'js', 'admin-dashboard.js');
    const directKeys = Array.from(adminScript.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g), (match) => match[1])
      .filter((key) => !key.endsWith('_'));

    expect(directKeys.filter((key) => !enAdminKeys.has(key))).toEqual([]);
    expect(enAdminKeys.has('settings_field_platform_name_label')).toBe(true);
    expect(enAdminKeys.has('settings_readonly_stripe_secret_key_help')).toBe(true);
    expect(enAdminKeys.has('campaign_field_short_blurb_help')).toBe(true);
    expect(enAdminKeys.has('campaign_readonly_state_label')).toBe(true);
    expect(adminScript).toContain("scope === 'campaign' ? 'campaign_field_' : 'settings_field_'");
    expect(adminScript).toContain("scope === 'campaign' ? 'campaign_readonly_' : 'settings_readonly_'");
  });

  it('exposes campaign content blocks to the admin content loader', () => {
    const campaignJsonTemplate = readRepoFile('api', 'campaigns.json');

    expect(campaignJsonTemplate).toContain('"long_content": {{ campaign.long_content | default: empty | jsonify }}');
    expect(campaignJsonTemplate).toContain('"image": {{ tier.image | jsonify }}');
    expect(campaignJsonTemplate).toContain('"late_support": {{ tier.late_support | default: false }}');
    expect(campaignJsonTemplate).toContain('"requires_threshold": {% if tier.requires_threshold %}{{ tier.requires_threshold }}{% else %}null{% endif %}');
    expect(campaignJsonTemplate).toContain('"body": {{ entry.body | jsonify }}');
    expect(campaignJsonTemplate).toContain('"content": {{ entry.content | default: empty | jsonify }}');
  });

  it('keeps admin session and dashboard summary reads free of KV writes', async () => {
    const env = createEnv();
    const ctx = { waitUntil: vi.fn() };

    const startResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/auth/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', preferredLang: 'en' })
    }), env, ctx);
    const startBody = await startResponse.json();
    expect(startResponse.status).toBe(200);
    expect(startBody.loginUrl).toContain('/admin/?admin_login=');

    const loginToken = new URL(startBody.loginUrl).searchParams.get('admin_login');
    const exchangeResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: loginToken, preferredLang: 'en' })
    }), env, ctx);
    expect(exchangeResponse.status).toBe(200);
    const cookie = exchangeResponse.headers.get('Set-Cookie')?.split(';')[0] || '';
    expect(cookie).toContain('pool_admin_session=');

    (env.PLEDGES as CountingKVNamespace).resetCounts();
    (env.RATELIMIT as CountingKVNamespace).resetCounts();

    const sessionResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/session', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(sessionResponse.status).toBe(200);
    const sessionBody = await sessionResponse.json();
    expect(sessionBody.user.role).toBe('super_admin');

    const summaryResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/dashboard/summary', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(summaryResponse.status).toBe(200);
    const summary = await summaryResponse.json();
    expect(summary.writeBudget).toEqual({ readOnly: true, kvWritesExpected: 0 });
    expect(summary.campaigns[0]).toMatchObject({ slug: 'hand-relations', title: 'Hand Relations' });

    expect((env.PLEDGES as CountingKVNamespace).putCalls).toBe(0);
    expect((env.PLEDGES as CountingKVNamespace).deleteCalls).toBe(0);
    expect((env.PLEDGES as CountingKVNamespace).listCalls).toBe(0);
    expect((env.RATELIMIT as CountingKVNamespace).putCalls).toBe(0);
    expect((env.RATELIMIT as CountingKVNamespace).deleteCalls).toBe(0);
    expect((env.RATELIMIT as CountingKVNamespace).listCalls).toBe(0);
  });

  it('authorizes admin users from mirrored config', async () => {
    const env = {
      ...createEnv(),
      ADMIN_BOOTSTRAP_EMAILS: '',
      ADMIN_USERS_JSON: JSON.stringify([{
        name: 'Admin Person',
        email: 'admin@example.com',
        role: 'super_admin',
        campaignSlugs: []
      }, {
        name: 'Creator Person',
        email: 'creator@example.com',
        role: 'campaign_user',
        campaignSlugs: ['hand-relations']
      }])
    };

    const campaignSession = await signInAdmin(env, 'creator@example.com');
    expect(campaignSession.response.status).toBe(200);
    const sessionResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/session', {
      method: 'GET',
      headers: { Cookie: campaignSession.cookie }
    }), env, campaignSession.ctx);
    expect(sessionResponse.status).toBe(200);
    const body = await sessionResponse.json();
    expect(body.user).toMatchObject({
      email: 'creator@example.com',
      role: 'campaign_user',
      campaignSlugs: ['hand-relations']
    });
  });

  it('prefers saved admin users from KV over mirrored config', async () => {
    const env = {
      ...createEnv(),
      ADMIN_BOOTSTRAP_EMAILS: '',
      ADMIN_USERS_JSON: JSON.stringify([{
        name: 'Admin Person',
        email: 'admin@example.com',
        role: 'super_admin',
        campaignSlugs: []
      }])
    };
    (env.PLEDGES as CountingKVNamespace).store.set('admin-users:v1', JSON.stringify({
      users: [{
        name: 'Creator Person',
        email: 'creator@example.com',
        role: 'campaign_user',
        campaigns: ['hand-relations']
      }]
    }));

    const campaignSession = await signInAdmin(env, 'creator@example.com');
    expect(campaignSession.response.status).toBe(200);
    const sessionResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/session', {
      method: 'GET',
      headers: { Cookie: campaignSession.cookie }
    }), env, campaignSession.ctx);
    expect(sessionResponse.status).toBe(200);
    const body = await sessionResponse.json();
    expect(body.user).toMatchObject({
      email: 'creator@example.com',
      role: 'campaign_user',
      campaignSlugs: ['hand-relations']
    });
  });

  it('saves admin user changes to KV and protects the current super admin', async () => {
    const env = createEnv();
    const { cookie, ctx, csrfToken } = await signInAdmin(env);

    async function saveUsers(users: unknown[]) {
      return worker.fetch(new Request('https://pledge.pool.test/admin/users', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'x-pool-admin-csrf': csrfToken },
        body: JSON.stringify({ users })
      }), env, ctx);
    }

    const deletedSelf = await saveUsers([{
      name: 'Other Admin',
      email: 'other-admin@example.com',
      role: 'super_admin',
      campaigns: []
    }]);
    expect(deletedSelf.status).toBe(422);
    await expect(deletedSelf.json()).resolves.toMatchObject({
      errors: [expect.stringContaining('Your account must stay a super admin')]
    });

    const demotedSelf = await saveUsers([{
      name: 'Admin Person',
      email: 'admin@example.com',
      role: 'campaign_user',
      campaigns: ['hand-relations']
    }, {
      name: 'Other Admin',
      email: 'other-admin@example.com',
      role: 'super_admin',
      campaigns: []
    }]);
    expect(demotedSelf.status).toBe(422);
    await expect(demotedSelf.json()).resolves.toMatchObject({
      errors: [expect.stringContaining('Your account must stay a super admin')]
    });

    resetKvCounters(env);
    const demotedOtherAdmin = await saveUsers([{
      name: 'Admin Person',
      email: 'admin@example.com',
      role: 'super_admin',
      campaigns: []
    }, {
      name: 'Other Admin',
      email: 'other-admin@example.com',
      role: 'campaign_user',
      campaigns: ['hand-relations']
    }]);
    expect(demotedOtherAdmin.status).toBe(200);
    await expect(demotedOtherAdmin.json()).resolves.toMatchObject({
      success: true,
      writeBudget: { readOnly: false, kvWritesExpected: 1 },
      users: expect.arrayContaining([
        expect.objectContaining({ email: 'other-admin@example.com', role: 'campaign_user', campaigns: ['hand-relations'] })
      ])
    });
    expect((env.PLEDGES as CountingKVNamespace).putCalls).toBe(1);
    const savedUsers = JSON.parse((env.PLEDGES as CountingKVNamespace).store.get('admin-users:v1') || '{}');
    expect(savedUsers).toMatchObject({
      updatedBy: 'admin@example.com',
      users: expect.arrayContaining([
        expect.objectContaining({ email: 'admin@example.com', role: 'super_admin' }),
        expect.objectContaining({ email: 'other-admin@example.com', role: 'campaign_user', campaignSlugs: ['hand-relations'] })
      ])
    });

    (env.RATELIMIT as CountingKVNamespace).store.clear();
    const deletedOtherUser = await saveUsers([{
      name: 'Admin Person',
      email: 'admin@example.com',
      role: 'super_admin',
      campaigns: []
    }]);
    expect(deletedOtherUser.status).toBe(200);
  });

  it('keeps admin users out of GitHub-backed settings publishing', async () => {
    const env = createEnv();
    const { cookie, ctx } = await signInAdmin(env);
    resetKvCounters(env);

    const previewResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/settings/preview', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        changes: [{
          path: 'admin.users',
          value: JSON.stringify([{
            name: 'Admin Person',
            email: 'admin@example.com',
            role: 'super_admin',
            campaigns: []
          }])
        }]
      })
    }), env, ctx);

    expect(previewResponse.status).toBe(422);
    await expect(previewResponse.json()).resolves.toMatchObject({
      errors: [expect.stringContaining('saved from the Users section')]
    });
    expectNoKvWritesOrLists(env, 'admin users settings preview rejection');
  });

  it('rejects unsafe admin setting values before they can be published', async () => {
    const env = createEnv();
    const { cookie, ctx } = await signInAdmin(env);
    resetKvCounters(env);

    const previewResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/settings/preview', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        changes: [
          { path: 'platform.logo_path', value: 'javascript:alert(1)' },
          { path: 'hero_video', campaignSlug: 'hand-relations', value: 'https://example.test/not-a-video' },
          { path: 'seo.same_as', value: 'https://example.test/profile\njavascript:alert(1)' },
          { path: 'design.font_body', value: 'Inter; background:url(javascript:alert(1))' },
          { path: 'short_blurb', campaignSlug: 'hand-relations', value: 'Help us [win](javascript:alert(1)).' },
          {
            path: 'diary',
            campaignSlug: 'hand-relations',
            value: JSON.stringify([{
              title: 'Unsafe diary',
              date: '2026-05-20T10:00:00Z',
              phase: 'fundraising',
              content: [{ type: 'image', src: 'javascript:alert(1)', alt: 'Unsafe' }]
            }])
          },
          { path: 'content_editor', campaignSlug: 'hand-relations', value: 'not publishable here' }
        ]
      })
    }), env, ctx);

    expect(previewResponse.status).toBe(422);
    const body = await previewResponse.json();
    const errors = body.errors.join('\n');
    expect(errors).toContain('Logo must use http or https');
    expect(errors).toContain('Hero video must be an uploaded MP4, WebM, or MOV video path, or a YouTube or Vimeo URL');
    expect(errors).toContain('Same-as links contains an invalid URL');
    expect(errors).toContain('Body font must be a simple CSS font stack');
    expect(errors).toContain('Short blurb includes an unsafe link URL');
    expect(errors).toContain('Diary entry "Unsafe diary" content is invalid');
    expect(errors).toContain('Content editor is saved through the Content tab');
    expectNoKvWritesOrLists(env, 'unsafe settings preview rejection');
  });

  it('returns role-scoped admin settings without KV writes', async () => {
    const env = createEnv();
    const { ctx, cookie } = await signInAdmin(env);

    resetKvCounters(env);
    const response = await worker.fetch(new Request('https://pledge.pool.test/admin/settings', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.scope).toBe('platform');
    expect(body.writeBudget).toEqual({ readOnly: true, kvWritesExpected: 0, kvListExpected: 0 });
    expect(body.sections).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Platform' }),
      expect.objectContaining({ title: 'Canonical URLs' }),
      expect.objectContaining({ title: 'Secrets & credentials' }),
      expect.objectContaining({ title: 'Runtime diagnostics' }),
      expect.objectContaining({ title: 'Pricing' }),
      expect.objectContaining({ title: 'Platform add-ons' })
    ]));
    const sectionTitles = body.sections.map((section: { title: string }) => section.title);
    expect(sectionTitles.indexOf('Design')).toBeLessThan(sectionTitles.indexOf('Users'));
    expect(sectionTitles.indexOf('Users')).toBeLessThan(sectionTitles.indexOf('Advanced performance'));
    expect(body.sections.slice(-2).map((section: { title: string }) => section.title)).toEqual([
      'Secrets & credentials',
      'Runtime diagnostics'
    ]);
    const settingsRows = [...body.sections, ...body.campaigns].flatMap((section: { rows: Array<{ help?: string }> }) => section.rows);
    expect(settingsRows.length).toBeGreaterThan(20);
    settingsRows.forEach((row: { label: string; help?: string }) => {
      expect(row.help, `${row.label} should include field help`).toEqual(expect.any(String));
      expect(row.help?.length, `${row.label} should include field help`).toBeGreaterThan(20);
    });
    const canonicalRows = body.sections.find((section: { title: string }) => section.title === 'Canonical URLs').rows;
    expect(canonicalRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Production site URL', value: 'https://pool.dustwave.xyz', path: 'platform.site_url', editable: true }),
      expect.objectContaining({ label: 'Production Worker URL', value: 'https://pledge.dustwave.xyz', path: 'platform.worker_url', editable: true })
    ]));
    const runtimeRows = body.sections.find((section: { title: string }) => section.title === 'Runtime diagnostics').rows;
    expect(runtimeRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Current site base', value: 'https://pool.test', editable: false }),
      expect.objectContaining({ label: 'Current Worker base', value: 'https://pledge.pool.test', editable: false })
    ]));
    const platformRows = body.sections.find((section: { title: string }) => section.title === 'Platform').rows;
    expect(platformRows.map((row: { label: string }) => row.label)).toEqual([
      'Site title',
      'Name',
      'Company',
      'Site author',
      'Default creator name',
      'Support email',
      'Site description',
      'Pledges email from',
      'Updates email from',
      'App mode'
    ]);
    expect(platformRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Site title', path: 'title', layoutGroup: 'platform-title-name', editable: true }),
      expect.objectContaining({ label: 'Name', path: 'platform.name', layoutGroup: 'platform-title-name', editable: true }),
      expect.objectContaining({ label: 'Company', path: 'platform.company_name', layoutGroup: 'platform-company-author', editable: true }),
      expect.objectContaining({ label: 'Site author', value: 'Dust Wave', path: 'author', layoutGroup: 'platform-company-author', editable: true }),
      expect.objectContaining({ label: 'Default creator name', path: 'platform.default_creator_name', layoutGroup: 'platform-creator-support', editable: true }),
      expect.objectContaining({ label: 'Support email', path: 'platform.support_email', layoutGroup: 'platform-creator-support', editable: true }),
      expect.objectContaining({ label: 'Pledges email from', path: 'platform.pledges_email_from', layoutGroup: 'platform-email-from', editable: true }),
      expect.objectContaining({ label: 'Updates email from', path: 'platform.updates_email_from', layoutGroup: 'platform-email-from', editable: true }),
      expect.objectContaining({ label: 'App mode', value: 'test', editable: false })
    ]));
    const pricingRows = body.sections.find((section: { title: string }) => section.title === 'Pricing').rows;
    expect(pricingRows.map((row: { label: string }) => row.label)).toEqual([
      'Sales Tax Rate',
      'Default Platform Tip Percent',
      'Max Platform Tip Percent'
    ]);
    expect(pricingRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Sales Tax Rate', rawValue: '0.07625', input: 'percent', displayMultiplier: 100, submitDivisor: 100 }),
      expect.objectContaining({ label: 'Default Platform Tip Percent', input: 'percent', layoutGroup: 'pricing-tip-percent' }),
      expect.objectContaining({ label: 'Max Platform Tip Percent', input: 'percent', layoutGroup: 'pricing-tip-percent' })
    ]));
    expect(pricingRows).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'pricing.flat_shipping_rate' })
    ]));
    const taxRows = body.sections.find((section: { title: string }) => section.title === 'Tax').rows;
    expect(taxRows.map((row: { label: string }) => row.label)).toEqual([
      'Provider',
      'Origin country',
      'Use regional origin',
      'New Mexico GRT API base',
      'ZIP.TAX API base'
    ]);
    expect(taxRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'Provider',
        input: 'select',
        layoutGroup: 'tax-provider-origin',
        options: expect.arrayContaining([
          expect.objectContaining({ value: 'flat', label: 'Flat rate' }),
          expect.objectContaining({ value: 'nm_grt', label: 'New Mexico GRT' })
        ])
      }),
      expect.objectContaining({
        label: 'Origin country',
        input: 'select',
        layoutGroup: 'tax-provider-origin',
        options: expect.arrayContaining([
          expect.objectContaining({ value: 'US', label: 'United States' })
        ])
      }),
      expect.objectContaining({
        label: 'Use regional origin',
        layoutGroup: 'tax-regional-provider-base'
      }),
      expect.objectContaining({
        label: 'New Mexico GRT API base',
        layoutGroup: 'tax-regional-provider-base',
        visibleWhen: { path: 'tax.provider', value: 'nm_grt' }
      }),
      expect.objectContaining({
        label: 'ZIP.TAX API base',
        layoutGroup: 'tax-regional-provider-base',
        visibleWhen: { path: 'tax.provider', value: 'zip_tax' }
      })
    ]));
    const shippingRows = body.sections.find((section: { title: string }) => section.title === 'Shipping').rows;
    expect(shippingRows.map((row: { label: string }) => row.label)).toEqual([
      'Origin postal code',
      'Origin country',
      'Fallback Shipping Fee (USD)',
      'Free shipping default',
      'Default shipping option',
      'USPS enabled',
      'USPS client ID',
      'USPS API base',
      'USPS timeout ms',
      'USPS quote cache TTL seconds',
      'USPS failure cooldown seconds',
      'USPS rate limit cooldown seconds'
    ]);
    expect(shippingRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'Origin postal code',
        path: 'shipping.origin_zip',
        layoutGroup: 'shipping-origin',
        help: expect.stringContaining('postal code')
      }),
      expect.objectContaining({
        label: 'Origin country',
        input: 'select',
        layoutGroup: 'shipping-origin',
        options: expect.arrayContaining([
          expect.objectContaining({ value: 'US', label: 'United States' })
        ])
      }),
      expect.objectContaining({
        label: 'Fallback Shipping Fee (USD)',
        path: 'shipping.fallback_flat_rate',
        input: 'decimal',
        min: 0,
        step: 0.01,
        layoutGroup: 'shipping-fallback-free',
        help: expect.stringContaining('carrier quotes')
      }),
      expect.objectContaining({
        label: 'Free shipping default',
        path: 'shipping.free_shipping_default',
        layoutGroup: 'shipping-fallback-free'
      }),
      expect.objectContaining({
        label: 'Default shipping option',
        path: 'shipping.default_option',
        input: 'select',
        layoutGroup: 'shipping-default-usps',
        help: expect.stringContaining('single default'),
        options: expect.arrayContaining([
          expect.objectContaining({ value: 'standard', label: 'Standard' })
        ])
      }),
      expect.objectContaining({
        label: 'USPS enabled',
        path: 'shipping.usps.enabled',
        layoutGroup: 'shipping-default-usps'
      }),
      expect.objectContaining({
        label: 'USPS client ID',
        layoutGroup: 'shipping-usps-auth',
        visibleWhen: { path: 'shipping.usps.enabled', value: 'true' }
      }),
      expect.objectContaining({
        label: 'USPS API base',
        path: 'shipping.usps.api_base',
        layoutGroup: 'shipping-usps-auth',
        placeholder: 'Default: https://apis.usps.com',
        visibleWhen: { path: 'shipping.usps.enabled', value: 'true' },
        help: expect.stringContaining('Leave blank')
      }),
      expect.objectContaining({
        label: 'USPS timeout ms',
        layoutGroup: 'shipping-usps-timeout-cache',
        visibleWhen: { path: 'shipping.usps.enabled', value: 'true' }
      }),
      expect.objectContaining({
        label: 'USPS quote cache TTL seconds',
        layoutGroup: 'shipping-usps-timeout-cache',
        visibleWhen: { path: 'shipping.usps.enabled', value: 'true' }
      }),
      expect.objectContaining({
        label: 'USPS failure cooldown seconds',
        layoutGroup: 'shipping-usps-cooldowns',
        visibleWhen: { path: 'shipping.usps.enabled', value: 'true' }
      }),
      expect.objectContaining({
        label: 'USPS rate limit cooldown seconds',
        layoutGroup: 'shipping-usps-cooldowns',
        visibleWhen: { path: 'shipping.usps.enabled', value: 'true' }
      })
    ]));
    const brandRows = body.sections.find((section: { title: string }) => section.title === 'Brand & SEO').rows;
    expect(brandRows.map((row: { label: string }) => row.label)).toEqual([
      'Logo',
      'Footer logo',
      'Favicon',
      'Default social image',
      'X handle',
      'Default social image alt',
      'Same-as links',
      'Index public community hub'
    ]);
    expect(brandRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'Logo',
        input: 'image-upload',
        path: 'platform.logo_path',
        layoutGroup: 'brand-logo-footer-logo',
        rawValue: '/assets/images/defaults/dust-wave-square.png',
        editable: true,
        help: expect.stringContaining('512 x 512')
      }),
      expect.objectContaining({ label: 'Footer logo', input: 'image-upload', path: 'platform.footer_logo_path', layoutGroup: 'brand-logo-footer-logo', editable: true }),
      expect.objectContaining({ label: 'Favicon', input: 'image-upload', path: 'platform.favicon_path', layoutGroup: 'brand-favicon-social-image', rawValue: '/assets/images/defaults/favicon.png', editable: true }),
      expect.objectContaining({ label: 'Default social image', input: 'image-upload', path: 'platform.default_social_image_path', layoutGroup: 'brand-favicon-social-image', rawValue: '/assets/images/defaults/dust-wave-square.png', editable: true }),
      expect.objectContaining({ label: 'X handle', input: 'text', path: 'seo.x_handle', layoutGroup: 'brand-x-social-alt', editable: true }),
      expect.objectContaining({ label: 'Default social image alt', input: 'text', path: 'seo.default_social_image_alt', layoutGroup: 'brand-x-social-alt', editable: true }),
      expect.objectContaining({
        label: 'Same-as links',
        input: 'url-list',
        path: 'seo.same_as',
        editable: true,
        placeholder: expect.stringContaining('https://www.instagram.com/your-handle'),
        help: expect.stringContaining('structured SEO data')
      }),
      expect.objectContaining({ label: 'Index public community hub', type: 'boolean', path: 'seo.index_public_community_hub', editable: true })
    ]));
    const secretRows = body.sections.find((section: { title: string }) => section.title === 'Secrets & credentials').rows;
    expect(secretRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Stripe secret key', value: 'Missing', editable: false, rawValue: 'Missing' }),
      expect.objectContaining({ label: 'Checkout intent secret', value: 'Missing', editable: false }),
      expect.objectContaining({ label: 'Magic link secret', value: 'Configured', editable: false }),
      expect.objectContaining({ label: 'Admin session secret', value: 'Optional / not configured', editable: false }),
      expect.objectContaining({ label: 'Cloudflare deploy credentials', value: 'GitHub secret / local shell only', editable: false })
    ]));
    secretRows.forEach((row: { path?: string; rawValue?: string; value?: string }) => {
      expect(row.path || '').toBe('');
      expect(String(row.rawValue || row.value || '')).not.toContain('test-admin-session-secret');
      expect(String(row.rawValue || row.value || '')).not.toContain('admin-secret');
    });
    const designRows = body.sections.find((section: { title: string }) => section.title === 'Design').rows;
    expect(designRows.map((row: { label: string }) => row.label)).toEqual([
      'Body font',
      'Heading font',
      'Text Color',
      'Muted Color',
      'Surface Color',
      'Border Color',
      'Primary Color',
      'Button Radius'
    ]);
    expect(designRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'Body font',
        input: 'text',
        path: 'design.font_body',
        editable: true,
        placeholder: '"Inter", sans-serif',
        layoutGroup: 'design-fonts',
        help: expect.stringContaining('loaded by the site CSS')
      }),
      expect.objectContaining({
        label: 'Heading font',
        input: 'text',
        path: 'design.font_display',
        editable: true,
        placeholder: '"gambado-sans", sans-serif',
        layoutGroup: 'design-fonts',
        help: expect.stringContaining('loaded by the site CSS')
      }),
      expect.objectContaining({ label: 'Text Color', input: 'color', path: 'design.color_text', editable: true, layoutGroup: 'design-colors', help: expect.stringContaining('Main body-copy') }),
      expect.objectContaining({ label: 'Muted Color', input: 'color', path: 'design.color_text_muted', editable: true, layoutGroup: 'design-colors', help: expect.stringContaining('Lower-emphasis') }),
      expect.objectContaining({ label: 'Surface Color', input: 'color', path: 'design.color_surface_subtle', editable: true, layoutGroup: 'design-colors', help: expect.stringContaining('panel background') }),
      expect.objectContaining({ label: 'Border Color', input: 'color', path: 'design.color_border', editable: true, layoutGroup: 'design-colors', help: expect.stringContaining('control-border') }),
      expect.objectContaining({ label: 'Primary Color', input: 'color', path: 'design.color_primary', editable: true, layoutGroup: 'design-colors', help: expect.stringContaining('Primary action') }),
      expect.objectContaining({ label: 'Button Radius', input: 'text', path: 'design.radius_lg', editable: true })
    ]));
    const usersRows = body.sections.find((section: { title: string }) => section.title === 'Users').rows;
    expect(usersRows).toEqual([
      expect.objectContaining({
        label: 'Users',
        path: 'admin.users',
        input: 'admin-users',
        type: 'admin_users',
        editable: true,
        currentUserEmail: 'admin@example.com',
        rawValue: expect.arrayContaining([
          expect.objectContaining({ email: 'admin@example.com', role: 'super_admin', campaigns: [] })
        ]),
        campaignOptions: expect.arrayContaining([
          expect.objectContaining({ value: 'hand-relations', label: 'Hand Relations' })
        ])
      })
    ]);
    const performanceRows = body.sections.find((section: { title: string }) => section.title === 'Advanced performance').rows;
    expect(performanceRows.map((row: { label: string }) => row.label)).toEqual([
      'Live stats cache TTL seconds',
      'Live inventory cache TTL seconds'
    ]);
    expect(performanceRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Live stats cache TTL seconds', path: 'cache.live_stats_ttl_seconds', input: 'integer', layoutGroup: 'cache-live-ttl' }),
      expect.objectContaining({ label: 'Live inventory cache TTL seconds', path: 'cache.live_inventory_ttl_seconds', input: 'integer', layoutGroup: 'cache-live-ttl' })
    ]));
    const reportRows = body.sections.find((section: { title: string }) => section.title === 'Campaign runner reports').rows;
    expect(reportRows.map((row: { label: string }) => row.label)).toEqual([
      'Enabled',
      'Send Time (Mountain Time)',
      'Email Subject Prefix',
      'Daily pledge report enabled',
      'Fulfillment report enabled',
      'Include stats summary',
      'Include CSV attachment'
    ]);
    expect(reportRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'Enabled',
        path: 'reports.campaign_runner.enabled',
        editable: true,
        type: 'boolean',
        layoutGroup: 'reports-enabled-time'
      }),
      expect.objectContaining({
        label: 'Send Time (Mountain Time)',
        input: 'time',
        path: 'reports.campaign_runner.send_hour_mt',
        layoutGroup: 'reports-enabled-time',
        visibleWhen: { path: 'reports.campaign_runner.enabled', value: 'true' },
        timeParts: expect.objectContaining({
          hourPath: 'reports.campaign_runner.send_hour_mt',
          minutePath: 'reports.campaign_runner.send_minute_mt'
        })
      }),
      expect.objectContaining({
        label: 'Email Subject Prefix',
        path: 'reports.campaign_runner.email_subject_prefix',
        visibleWhen: { path: 'reports.campaign_runner.enabled', value: 'true' }
      }),
      expect.objectContaining({
        label: 'Daily pledge report enabled',
        layoutGroup: 'reports-daily-fulfillment',
        visibleWhen: { path: 'reports.campaign_runner.enabled', value: 'true' }
      }),
      expect.objectContaining({
        label: 'Fulfillment report enabled',
        layoutGroup: 'reports-daily-fulfillment',
        visibleWhen: { path: 'reports.campaign_runner.enabled', value: 'true' }
      }),
      expect.objectContaining({
        label: 'Include stats summary',
        layoutGroup: 'reports-stats-csv',
        visibleWhen: { path: 'reports.campaign_runner.enabled', value: 'true' }
      }),
      expect.objectContaining({
        label: 'Include CSV attachment',
        layoutGroup: 'reports-stats-csv',
        visibleWhen: { path: 'reports.campaign_runner.enabled', value: 'true' }
      })
    ]));
    expect(reportRows).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Send minute MT' })
    ]));
    const debugRows = body.sections.find((section: { title: string }) => section.title === 'Debug').rows;
    expect(debugRows.map((row: { label: string }) => row.label)).toEqual([
      'Console logging enabled',
      'Verbose console logging'
    ]);
    expect(debugRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Console logging enabled', path: 'debug.console_logging_enabled', editable: true, type: 'boolean', layoutGroup: 'debug-logging' }),
      expect.objectContaining({ label: 'Verbose console logging', path: 'debug.verbose_console_logging', editable: true, type: 'boolean', layoutGroup: 'debug-logging' })
    ]));
    const addOnRows = body.sections.find((section: { title: string }) => section.title === 'Platform add-ons').rows;
    const addOnProducts = addOnRows.find((row: { label: string }) => row.label === 'Products');
    expect(addOnRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Enabled', path: 'add_ons.enabled', editable: true, type: 'boolean', layoutGroup: 'add-ons-enabled-stock' }),
      expect.objectContaining({ label: 'Low stock threshold', path: 'add_ons.low_stock_threshold', editable: true, input: 'integer', layoutGroup: 'add-ons-enabled-stock', visibleWhen: { path: 'add_ons.enabled', value: 'true' } }),
      expect.objectContaining({
        label: 'Products',
        path: 'add_ons.products',
        editable: true,
        input: 'add-on-products',
        visibleWhen: { path: 'add_ons.enabled', value: 'true' },
        rawValue: expect.arrayContaining([
          expect.objectContaining({ id: 'dust-wave-sticker', name: 'DUST WAVE Sticker' })
        ])
      })
    ]));
    expect(addOnProducts.rawValue).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'smoke-editable__poster' })
    ]));
    expect(body.campaigns[0]).toMatchObject({ title: 'Hand Relations' });
    const campaignRows = body.campaigns[0].rows;
    expect(campaignRows.slice(0, 27).map((row: { label: string }) => row.label)).toEqual([
      'Title',
      'Creator name',
      'Short blurb',
      'Slug',
      'URL',
      'Hero video',
      'Creator image',
      'Category',
      'Instagram URL',
      'Start date',
      'Goal deadline',
      'Goal amount',
      'Charged',
      'Test campaign',
      'State',
      'Single tier mode',
      'Show ongoing support',
      'Hide locked stretch goals',
      'Custom late support',
      'Shipping fallback flat rate',
      'Free shipping override',
      'Shipping',
      'Runner report emails',
      'Hero image',
      'Hero image wide',
      'Campaign background',
      'Progress background'
    ]);
    expect(campaignRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Title', value: 'Hand Relations', editable: true, path: 'title', layoutGroup: 'campaign-title-creator' }),
      expect.objectContaining({ label: 'Creator name', editable: true, path: 'creator_name', layoutGroup: 'campaign-title-creator' }),
      expect.objectContaining({ label: 'Short blurb', input: 'rich-text-inline' }),
      expect.objectContaining({ label: 'Slug', value: 'hand-relations', editable: false, path: 'slug', input: 'slug-derived', layoutGroup: 'campaign-slug-url' }),
      expect.objectContaining({ label: 'URL', value: '/campaigns/hand-relations/', editable: false, path: 'url', input: 'url-derived', layoutGroup: 'campaign-slug-url' }),
      expect.objectContaining({ label: 'Hero video', path: 'hero_video', input: 'video-upload', layoutGroup: 'campaign-hero-video-creator-image' }),
      expect.objectContaining({ label: 'Creator image', path: 'creator_image', input: 'image-upload', layoutGroup: 'campaign-hero-video-creator-image' }),
      expect.objectContaining({ label: 'Category', path: 'category', input: 'select', layoutGroup: 'campaign-category-instagram' }),
      expect.objectContaining({ label: 'Instagram URL', path: 'instagram', input: 'url', layoutGroup: 'campaign-category-instagram' }),
      expect.objectContaining({ label: 'Start date', input: 'date', layoutGroup: 'campaign-dates' }),
      expect.objectContaining({ label: 'Goal deadline', input: 'date', layoutGroup: 'campaign-dates' }),
      expect.objectContaining({ label: 'Goal amount', input: 'currency', layoutGroup: 'campaign-goal-charged' }),
      expect.objectContaining({ label: 'Charged', value: 'No', editable: false, layoutGroup: 'campaign-goal-charged' }),
      expect.objectContaining({ label: 'Test campaign', path: 'test_only', layoutGroup: 'campaign-test-state' }),
      expect.objectContaining({ label: 'State', value: 'live', editable: false, layoutGroup: 'campaign-test-state' }),
      expect.objectContaining({ label: 'Single tier mode', path: 'single_tier_only', layoutGroup: 'campaign-tier-ongoing' }),
      expect.objectContaining({ label: 'Show ongoing support', path: 'show_ongoing', layoutGroup: 'campaign-tier-ongoing' }),
      expect.objectContaining({ label: 'Hide locked stretch goals', path: 'stretch_hidden', layoutGroup: 'campaign-stretch-late-support' }),
      expect.objectContaining({ label: 'Custom late support', path: 'custom_late_support', layoutGroup: 'campaign-stretch-late-support' }),
      expect.objectContaining({ label: 'Shipping fallback flat rate', path: 'shipping_fallback_flat_rate', layoutGroup: 'campaign-shipping-free' }),
      expect.objectContaining({ label: 'Free shipping override', path: 'free_shipping', layoutGroup: 'campaign-shipping-free' }),
      expect.objectContaining({ label: 'Shipping', path: 'shipping_options', input: 'checkbox-list', options: expect.arrayContaining([
        expect.objectContaining({ value: 'signature_required' }),
        expect.objectContaining({ value: 'adult_signature_required' })
      ]) }),
      expect.objectContaining({ label: 'Runner report emails', value: 'runner@example.com', input: 'email-list' }),
      expect.objectContaining({ label: 'Hero image', path: 'hero_image', input: 'image-upload', layoutGroup: 'hero-images' }),
      expect.objectContaining({ label: 'Hero image wide', path: 'hero_image_wide', input: 'image-upload', layoutGroup: 'hero-images' }),
      expect.objectContaining({ label: 'Campaign background', path: 'campaign_background', input: 'image-upload', layoutGroup: 'background-images' }),
      expect.objectContaining({ label: 'Progress background', path: 'progress_background', input: 'image-upload', layoutGroup: 'background-images' }),
      expect.objectContaining({ label: 'Featured tier', path: 'featured_tier_id', input: 'select', options: expect.arrayContaining([
        expect.objectContaining({ label: 'None', value: '' })
      ]) }),
      expect.objectContaining({ label: 'Content editor', path: 'content_editor', input: 'content-editor' }),
      expect.objectContaining({ label: 'Tiers', path: 'tiers', input: 'campaign-collection', editable: true }),
      expect.objectContaining({ label: 'Support items', path: 'support_items', input: 'campaign-collection', editable: true }),
      expect.objectContaining({ label: 'Diary entries', path: 'diary', input: 'campaign-collection', editable: true }),
      expect.objectContaining({
        label: 'Decisions',
        path: 'decisions',
        input: 'campaign-collection',
        editable: true,
        rawValue: expect.arrayContaining([
          expect.objectContaining({ id: 'villain-name', title: "Main Villain's Name" })
        ])
      })
    ]));
    expectNoKvWritesOrLists(env, 'settings read');

    const userKey = `admin-user:${await sha256Hex('creator@example.com')}`;
    (env.PLEDGES as CountingKVNamespace).store.set(userKey, JSON.stringify({
      email: 'creator@example.com',
      role: 'campaign_user',
      campaignSlugs: ['hand-relations']
    }));
    const campaignSession = await signInAdmin(env, 'creator@example.com');
    resetKvCounters(env);
    const campaignResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/settings', {
      method: 'GET',
      headers: { Cookie: campaignSession.cookie }
    }), env, campaignSession.ctx);
    expect(campaignResponse.status).toBe(200);
    const campaignBody = await campaignResponse.json();
    expect(campaignBody.scope).toBe('campaign');
    expect(campaignBody.sections).toEqual([]);
    expect(campaignBody.campaigns).toHaveLength(1);
    expect(campaignBody.campaigns[0]).toMatchObject({ title: 'Hand Relations' });
    expectNoKvWritesOrLists(env, 'campaign settings read');
  });

  it('validates and publishes admin settings through GitHub without KV writes', async () => {
    const env = {
      ...createEnv(),
      GITHUB_TOKEN: 'github-token',
      GITHUB_OWNER: 'owner',
      GITHUB_REPO: 'repo',
      GITHUB_WORKFLOW: 'deploy.yml',
      GITHUB_REF: 'main'
    };
    const { ctx, cookie, csrfToken } = await signInAdmin(env);
    const githubCalls: Array<{ url: string; method: string; body?: any }> = [];
    const existingConfig = `title: The Pool
author: Dust Wave
debug:
  console_logging_enabled: true
  verbose_console_logging: true
seo:
  same_as: []
admin:
  local_bootstrap_emails:
    - "admin@example.com"
  users: []
platform:
  name: The Pool
  logo_path: "/assets/images/defaults/dust-wave-square.png"
  pledges_email_from: "The Pool <pledges@pool.test>"
  site_url: "https://pool.test"
pricing:
  sales_tax_rate: 0.07625
add_ons:
  enabled: true
  low_stock_threshold: 5
  products: []
`;
    const existingCampaign = `---
layout: campaign
title: "Hand Relations"
slug: hand-relations
short_blurb: "Old blurb"
instagram: "https://instagram.com/old"
hero_video: "/assets/videos/defaults/hand-relations.webm"
runner_report_emails:
  - "runner@example.com"
---
`;

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = String(init?.method || 'GET');
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({ campaigns: [campaignFixture] });
      }
      if (url === 'https://pool.test/api/add-ons.json') {
        return jsonResponse(addOnsFixture);
      }
      if (url.includes('/contents/_config.yml') && method === 'GET') {
        githubCalls.push({ url, method });
        return jsonResponse({
          path: '_config.yml',
          sha: 'config-sha',
          encoding: 'base64',
          content: Buffer.from(existingConfig, 'utf8').toString('base64')
        });
      }
      if (url.endsWith('/contents/_config.yml') && method === 'PUT') {
        const body = JSON.parse(String(init?.body || '{}'));
        githubCalls.push({ url, method, body });
        return jsonResponse({
          content: { path: '_config.yml', sha: 'new-config-sha' },
          commit: { sha: 'config-commit', html_url: 'https://github.test/config-commit' }
        });
      }
      if (url.includes('/contents/_campaigns/hand-relations.md') && method === 'GET') {
        githubCalls.push({ url, method });
        return jsonResponse({
          path: '_campaigns/hand-relations.md',
          sha: 'campaign-sha',
          encoding: 'base64',
          content: Buffer.from(existingCampaign, 'utf8').toString('base64')
        });
      }
      if (url.endsWith('/contents/_campaigns/hand-relations.md') && method === 'PUT') {
        const body = JSON.parse(String(init?.body || '{}'));
        githubCalls.push({ url, method, body });
        return jsonResponse({
          content: { path: '_campaigns/hand-relations.md', sha: 'new-campaign-sha' },
          commit: { sha: 'campaign-commit', html_url: 'https://github.test/campaign-commit' }
        });
      }
      if (url.endsWith('/actions/workflows/deploy.yml/dispatches') && method === 'POST') {
        githubCalls.push({ url, method, body: JSON.parse(String(init?.body || '{}')) });
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    resetKvCounters(env);
    const changes = [
      { path: 'platform.name', value: 'The Pool Updated' },
      { path: 'author', value: 'Dust Wave Studio' },
      { path: 'platform.logo_path', value: '/assets/images/admin/logo-uploaded.png' },
      { path: 'platform.pledges_email_from', value: 'The Pool <pledges@pool.test>' },
      { path: 'seo.same_as', value: 'https://example.test/profile\nhttps://social.example.test/pool' },
      { path: 'debug.verbose_console_logging', value: 'false' },
      { path: 'add_ons.low_stock_threshold', value: '3' },
      {
        path: 'add_ons.products',
        value: JSON.stringify([{
          id: 'new-sticker',
          name: 'New Sticker',
          description: 'A new sticker.',
          image_url: '/assets/images/add-ons/new-sticker.png',
          price: 4,
          category: 'physical',
          shipping_preset: 'sticker',
          inventory: 25,
          source_url: 'https://shop.example.test/new-sticker',
          variants: []
        }, {
          id: 'new-poster',
          name: 'New Poster',
          description: 'A custom poster.',
          image_url: '/assets/images/add-ons/new-poster.png',
          price: 12,
          category: 'physical',
          shipping: {
            weight_oz: 5,
            packaging_weight_oz: 3,
            length_in: 18,
            width_in: 3,
            height_in: 3,
            stack_height_in: 0.5
          },
          inventory: 10,
          variants: []
        }])
      },
      {
        path: 'campaign_add_ons',
        campaignSlug: 'hand-relations',
        value: JSON.stringify([{
          id: 'campaign-poster',
          name: 'Campaign Poster',
          description: 'A campaign-specific poster.',
          image_url: '/assets/images/campaign-add-ons/campaign-poster.png',
          price: 15,
          category: 'physical',
          shipping: {
            weight_oz: 6,
            length_in: 19,
            width_in: 4,
            height_in: 4
          },
          variants: []
        }])
      },
      {
        path: 'tiers',
        campaignSlug: 'hand-relations',
        value: JSON.stringify([{
          id: 'frame-slot',
          name: 'Buy 1 Frame Updated',
          price: 6,
          image: '/assets/images/defaults/tier-frame.png',
          description: 'Sponsor a frame.',
          stackable: true,
          category: 'physical',
          shipping: {
            weight_oz: 2,
            packaging_weight_oz: 1,
            length_in: 6,
            width_in: 4,
            height_in: 1
          },
          late_support: false
        }])
      },
      { path: 'title', campaignSlug: 'hand-relations', value: 'Hand Relations Updated' },
      { path: 'instagram', campaignSlug: 'hand-relations', value: 'https://instagram.com/updated' },
      { path: 'hero_video', campaignSlug: 'hand-relations', value: 'https://www.youtube.com/watch?v=XCQWR9cNsgY' }
    ];

    const previewResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/settings/preview', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes })
    }), env, ctx);
    expect(previewResponse.status).toBe(200);
    const previewBody = await previewResponse.json();
    expect(previewBody.writeBudget).toEqual({ readOnly: true, kvWritesExpected: 0, kvListExpected: 0 });
    expectNoKvWritesOrLists(env, 'settings preview');

    const publishResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/settings/publish', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'x-pool-admin-csrf': csrfToken },
      body: JSON.stringify({ changes })
    }), env, ctx);
    expect(publishResponse.status).toBe(200);
    const publishBody = await publishResponse.json();
    expect(publishBody.writeBudget).toEqual({ readOnly: false, kvWritesExpected: 0 });
    expect(publishBody.rebuild).toEqual({ triggered: true });

    const configPut = githubCalls.find((call) => call.url.endsWith('/contents/_config.yml') && call.method === 'PUT');
    const campaignPut = githubCalls.find((call) => call.url.endsWith('/contents/_campaigns/hand-relations.md') && call.method === 'PUT');
    const configContent = Buffer.from(configPut?.body.content || '', 'base64').toString('utf8');
    expect(configContent).toContain('name: "The Pool Updated"');
    expect(configContent).toContain('author: "Dust Wave Studio"');
    expect(configContent).toContain('logo_path: "/assets/images/admin/logo-uploaded.png"');
    expect(configContent).toContain('pledges_email_from: "The Pool <pledges@pool.test>"');
    expect(configContent).toContain('same_as:\n    - "https://example.test/profile"\n    - "https://social.example.test/pool"');
    expect(configContent).toContain('verbose_console_logging: false');
    expect(configContent).toContain('users: []');
    expect(configContent).toContain('low_stock_threshold: 3');
    expect(configContent).toContain('id: "new-sticker"');
    expect(configContent).toContain('price: 4.00');
    expect(configContent).toContain('id: "new-poster"');
    expect(configContent).toContain('shipping:\n        weight_oz: 5\n        packaging_weight_oz: 3\n        length_in: 18\n        width_in: 3\n        height_in: 3\n        stack_height_in: 0.5');
    const campaignContent = Buffer.from(campaignPut?.body.content || '', 'base64').toString('utf8');
    expect(campaignContent).toContain('slug: hand-relations');
    expect(campaignContent).toContain('title: "Hand Relations Updated"');
    expect(campaignContent).toContain('instagram: "https://instagram.com/updated"');
    expect(campaignContent).toContain('hero_video: "https://www.youtube.com/watch?v=XCQWR9cNsgY"');
    expect(campaignContent).toContain('campaign_add_ons:');
    expect(campaignContent).toContain('id: "campaign-poster"');
    expect(campaignContent).toContain('shipping:\n      weight_oz: 6\n      length_in: 19\n      width_in: 4\n      height_in: 4');
    expect(campaignContent).toContain('tiers:');
    expect(campaignContent).toContain('name: "Buy 1 Frame Updated"');
    expect(campaignContent).toContain('price: 6');
    expect(campaignContent).toContain('shipping:\n      weight_oz: 2\n      packaging_weight_oz: 1\n      length_in: 6\n      width_in: 4\n      height_in: 1');
    expect(githubCalls.some((call) => call.url.endsWith('/actions/workflows/deploy.yml/dispatches'))).toBe(true);
    expectNoKvWritesOrLists(env, 'settings publish');
  });

  it('uploads admin logo assets through GitHub without KV writes', async () => {
    const env = {
      ...createEnv(),
      GITHUB_TOKEN: 'github-token',
      GITHUB_OWNER: 'owner',
      GITHUB_REPO: 'repo',
      GITHUB_REF: 'main'
    };
    const { ctx, cookie, csrfToken } = await signInAdmin(env);
    const githubCalls: Array<{ url: string; method: string; body?: any }> = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = String(init?.method || 'GET');
      if (url.includes('/contents/assets/images/defaults/logo-') && method === 'PUT') {
        const body = JSON.parse(String(init?.body || '{}'));
        githubCalls.push({ url, method, body });
        return jsonResponse({
          content: { path: 'assets/images/defaults/logo-test.png', sha: 'logo-sha' },
          commit: { sha: 'logo-commit', html_url: 'https://github.test/logo-commit' }
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    resetKvCounters(env);
    const response = await worker.fetch(new Request('https://pledge.pool.test/admin/settings/logo-upload', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'x-pool-admin-csrf': csrfToken },
      body: JSON.stringify({
        filename: 'Logo Test.png',
        contentType: 'image/png',
        content: 'data:image/png;base64,aGVsbG8='
      })
    }), env, ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.path).toMatch(/^\/assets\/images\/defaults\/logo-\d{8}-\d{6}\.png$/);
    expect(body.processing).toMatchObject({ imageOptimization: 'source-preserved', videoTranscoding: 'not-video' });
    expect(body.writeBudget).toEqual({ readOnly: false, kvWritesExpected: 0 });
    expect(githubCalls).toHaveLength(1);
    expect(githubCalls[0].body.content).toBe('aGVsbG8=');
    expect(githubCalls[0].body.message).toContain('Upload admin logo');
    expectNoKvWritesOrLists(env, 'logo upload');
  });

  it('uploads campaign images to the campaign asset directory with canonical names', async () => {
    const env = {
      ...createEnv(),
      GITHUB_TOKEN: 'github-token',
      GITHUB_OWNER: 'owner',
      GITHUB_REPO: 'repo',
      GITHUB_REF: 'main'
    };
    const { ctx, cookie, csrfToken } = await signInAdmin(env);
    const githubCalls: Array<{ url: string; method: string; body?: any }> = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = String(init?.method || 'GET');
      if (url.includes('/contents/assets/images/campaigns/hand-relations/hero-wide-') && method === 'PUT') {
        const body = JSON.parse(String(init?.body || '{}'));
        githubCalls.push({ url, method, body });
        return jsonResponse({
          content: { path: 'assets/images/campaigns/hand-relations/hero-wide-test.webp', sha: 'image-sha' },
          commit: { sha: 'image-commit', html_url: 'https://github.test/image-commit' }
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    resetKvCounters(env);
    const response = await worker.fetch(new Request('https://pledge.pool.test/admin/settings/image-upload', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'x-pool-admin-csrf': csrfToken },
      body: JSON.stringify({
        filename: 'Client File Name.webp',
        contentType: 'image/webp',
        content: 'data:image/webp;base64,aGVsbG8=',
        kind: 'campaign',
        campaignSlug: 'hand-relations',
        fieldPath: 'hero_image_wide'
      })
    }), env, ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.path).toMatch(/^\/assets\/images\/campaigns\/hand-relations\/hero-wide-\d{8}-\d{6}\.webp$/);
    expect(body.processing).toMatchObject({ imageOptimization: 'source-preserved', videoTranscoding: 'not-video' });
    expect(body.writeBudget).toEqual({ readOnly: false, kvWritesExpected: 0 });
    expect(githubCalls).toHaveLength(1);
    expect(githubCalls[0].body.message).toContain('Upload admin image');
    expectNoKvWritesOrLists(env, 'campaign image upload');
  });

  it('uploads admin hero videos through GitHub without KV writes', async () => {
    const env = {
      ...createEnv(),
      GITHUB_TOKEN: 'github-token',
      GITHUB_OWNER: 'owner',
      GITHUB_REPO: 'repo',
      GITHUB_REF: 'main'
    };
    const { ctx, cookie, csrfToken } = await signInAdmin(env);
    const githubCalls: Array<{ url: string; method: string; body?: any }> = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = String(init?.method || 'GET');
      if (url.includes('/contents/assets/videos/campaigns/hand-relations/video-') && method === 'PUT') {
        const body = JSON.parse(String(init?.body || '{}'));
        githubCalls.push({ url, method, body });
        return jsonResponse({
          content: { path: 'assets/videos/campaigns/hand-relations/video-test.mp4', sha: 'video-sha' },
          commit: { sha: 'video-commit', html_url: 'https://github.test/video-commit' }
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    resetKvCounters(env);
    const response = await worker.fetch(new Request('https://pledge.pool.test/admin/settings/video-upload', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'x-pool-admin-csrf': csrfToken },
      body: JSON.stringify({
        filename: 'Hero Test.mp4',
        contentType: 'video/mp4',
        content: 'data:video/mp4;base64,aGVsbG8=',
        kind: 'campaign-video',
        campaignSlug: 'hand-relations',
        fieldPath: 'hero_video'
      })
    }), env, ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.path).toMatch(/^\/assets\/videos\/campaigns\/hand-relations\/video-\d{8}-\d{6}\.mp4$/);
    expect(body.processing).toMatchObject({ imageOptimization: 'not-image', videoTranscoding: 'source-preserved' });
    expect(body.writeBudget).toEqual({ readOnly: false, kvWritesExpected: 0 });
    expect(githubCalls).toHaveLength(1);
    expect(githubCalls[0].body.content).toBe('aGVsbG8=');
    expect(githubCalls[0].body.message).toContain('Upload admin video');
    expectNoKvWritesOrLists(env, 'video upload');
  });

  it('enforces the admin read-path KV budget with an explicit counter harness', async () => {
    const env = createEnv();
    const { ctx, cookie } = await signInAdmin(env);
    const pledges = env.PLEDGES as CountingKVNamespace;

    pledges.store.set('campaign-pledges:hand-relations', JSON.stringify(['order-budget-1']));
    pledges.store.set('pledge:order-budget-1', JSON.stringify({
      orderId: 'order-budget-1',
      email: 'budget-reader@example.com',
      campaignSlug: 'hand-relations',
      tierId: 'digital-pass',
      tierName: 'Digital Pass',
      tierQty: 1,
      pledgeStatus: 'active',
      amount: 5000,
      subtotal: 4500,
      tipAmount: 500,
      preferredLang: 'es',
      referralCode: 'launch-list',
      utmSource: 'email',
      createdAt: '2026-04-01T12:00:00.000Z'
    }));

    const readChecks: Array<{
      label: string;
      request: () => Request;
      expectBody?: (body: any) => void;
    }> = [
      {
        label: 'session read',
        request: () => new Request('https://pledge.pool.test/admin/session', {
          method: 'GET',
          headers: { Cookie: cookie }
        }),
        expectBody: (body) => expect(body).toMatchObject({ user: { role: 'super_admin' } })
      },
      {
        label: 'dashboard summary',
        request: () => new Request('https://pledge.pool.test/admin/dashboard/summary', {
          method: 'GET',
          headers: { Cookie: cookie }
        }),
        expectBody: (body) => expect(body.writeBudget).toEqual({ readOnly: true, kvWritesExpected: 0 })
      },
      {
        label: 'supporter filters',
        request: () => new Request('https://pledge.pool.test/admin/supporters?campaignSlug=hand-relations&status=active&q=budget', {
          method: 'GET',
          headers: { Cookie: cookie }
        }),
        expectBody: (body) => {
          expect(body.writeBudget).toEqual({ readOnly: true, kvWritesExpected: 0, kvListExpected: 0 });
          expect(body.supporters).toHaveLength(1);
        }
      },
      {
        label: 'report preview',
        request: () => new Request('https://pledge.pool.test/admin/reports/campaign-runner/preview?campaignSlug=hand-relations&reportType=pledge', {
          method: 'GET',
          headers: { Cookie: cookie }
        }),
        expectBody: (body) => {
          expect(body.dryRun).toBe(true);
          expect(body.writeBudget).toEqual({ readOnly: true, kvWritesExpected: 0, kvListExpected: 0 });
        }
      },
      {
        label: 'analytics view',
        request: () => new Request('https://pledge.pool.test/admin/analytics?campaignSlug=hand-relations', {
          method: 'GET',
          headers: { Cookie: cookie }
        }),
        expectBody: (body) => {
          expect(body.scope).toBe('campaign');
          expect(body.writeBudget).toEqual({ readOnly: true, kvWritesExpected: 0, kvListExpected: 0 });
        }
      },
      {
        label: 'content load',
        request: () => new Request('https://pledge.pool.test/admin/content/campaign?campaignSlug=hand-relations', {
          method: 'GET',
          headers: { Cookie: cookie }
        }),
        expectBody: (body) => expect(body.writeBudget).toEqual({ readOnly: true, kvWritesExpected: 0, kvListExpected: 0 })
      },
      {
        label: 'content preview',
        request: () => new Request('https://pledge.pool.test/admin/content/preview', {
          method: 'POST',
          headers: {
            Cookie: cookie,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            campaignSlug: 'hand-relations',
            draft: {
              title: 'Budget Preview',
              shortBlurb: 'Previewing without durable writes.',
              longContent: [{ type: 'text', body: 'Safe preview body.' }]
            }
          })
        }),
        expectBody: (body) => {
          expect(body.valid).toBe(true);
          expect(body.writeBudget).toEqual({ readOnly: true, kvWritesExpected: 0, kvListExpected: 0 });
        }
      }
    ];

    for (const check of readChecks) {
      resetKvCounters(env);
      const response = await worker.fetch(check.request(), env, ctx);
      expect(response.status, check.label).toBe(200);
      check.expectBody?.(await response.json());
      expectNoKvWritesOrLists(env, check.label);
    }

    const adminScript = readRepoFile('assets', 'js', 'admin-dashboard.js');
    expect(adminScript).toContain('pool-admin-marketing-builder');
    expect(adminScript).toContain('localStorage.removeItem(marketingStorageKey)');
    expect(adminScript).toContain('resetMarketingBuilderFields();');
    expect(adminScript).toContain('data-add-on-product-shipping-field');
    expect(adminScript).toContain('data-add-on-shipping-fields');
    expect(adminScript).toContain('data-collection-shipping-field');
    expect(adminScript).toContain('data-collection-shipping-fields');
    expect(adminScript).toContain('var deriveProductIds = true;');
    expect(adminScript).toContain("url.searchParams.set('utm_campaign', campaign.slug)");
    expect(adminScript).toContain('/admin/marketing/referrals');
  });

  it('rejects replayed admin login tokens without creating another session', async () => {
    const env = createEnv();
    const ctx = { waitUntil: vi.fn() };
    const pledges = env.PLEDGES as CountingKVNamespace;
    const ratelimit = env.RATELIMIT as CountingKVNamespace;

    const startResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/auth/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', preferredLang: 'en' })
    }), env, ctx);
    const loginToken = new URL((await startResponse.json()).loginUrl).searchParams.get('admin_login');

    const firstExchangeResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: loginToken, preferredLang: 'en' })
    }), env, ctx);
    expect(firstExchangeResponse.status).toBe(200);

    const sessionsBeforeReplay = Array.from(pledges.store.keys()).filter((key) => key.startsWith('admin-session:')).length;
    expect(sessionsBeforeReplay).toBe(1);
    pledges.resetCounts();
    ratelimit.resetCounts();

    const replayResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: loginToken, preferredLang: 'en' })
    }), env, ctx);

    expect(replayResponse.status).toBe(401);
    await expect(replayResponse.json()).resolves.toEqual({ error: 'Invalid or expired token' });
    expect(Array.from(pledges.store.keys()).filter((key) => key.startsWith('admin-session:'))).toHaveLength(1);
    expect(pledges.putCalls).toBe(0);
    expect(pledges.deleteCalls).toBe(0);
    expect(ratelimit.putCalls).toBe(1);
  });

  it('keeps near-expiry admin sessions fixed and rejects expired sessions without writes', async () => {
    const env = createEnv();
    const { ctx, cookie } = await signInAdmin(env);
    const pledges = env.PLEDGES as CountingKVNamespace;
    const ratelimit = env.RATELIMIT as CountingKVNamespace;
    const sessionToken = getCookieValue(cookie, 'pool_admin_session');
    const sessionKey = `admin-session:${await sha256Hex(sessionToken)}`;
    const sessionRecord = JSON.parse(pledges.store.get(sessionKey) || '{}');
    const nearExpiry = new Date(Date.now() + 30 * 1000).toISOString();

    pledges.store.set(sessionKey, JSON.stringify({
      ...sessionRecord,
      expiresAt: nearExpiry
    }));
    pledges.resetCounts();
    ratelimit.resetCounts();

    const nearExpiryResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/session', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(nearExpiryResponse.status).toBe(200);
    await expect(nearExpiryResponse.json()).resolves.toMatchObject({ expiresAt: nearExpiry });
    expect(JSON.parse(pledges.store.get(sessionKey) || '{}').expiresAt).toBe(nearExpiry);
    expect(pledges.putCalls).toBe(0);
    expect(pledges.deleteCalls).toBe(0);
    expect(ratelimit.putCalls).toBe(0);

    pledges.store.set(sessionKey, JSON.stringify({
      ...sessionRecord,
      expiresAt: new Date(Date.now() - 1000).toISOString()
    }));
    pledges.resetCounts();
    ratelimit.resetCounts();

    const expiredResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/session', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(expiredResponse.status).toBe(401);
    expect(expiredResponse.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
    await expect(expiredResponse.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(pledges.putCalls).toBe(0);
    expect(pledges.deleteCalls).toBe(0);
    expect(ratelimit.putCalls).toBe(0);
  });

  it('rate-limits admin auth starts with private no-store responses without touching normal read paths', async () => {
    const env = createEnv();
    const ctx = { waitUntil: vi.fn() };
    const ratelimit = env.RATELIMIT as CountingKVNamespace;
    const pledges = env.PLEDGES as CountingKVNamespace;

    let lastResponse: Response | null = null;
    for (let index = 0; index < 6; index += 1) {
      lastResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/auth/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.10'
        },
        body: JSON.stringify({ email: 'admin@example.com', preferredLang: 'en' })
      }), env, ctx);
    }

    expect(lastResponse?.status).toBe(429);
    expect(lastResponse?.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
    expect(lastResponse?.headers.get('Retry-After')).toBeTruthy();
    expect(lastResponse?.headers.get('X-RateLimit-Remaining')).toBe('0');
    await expect(lastResponse?.json()).resolves.toMatchObject({ error: 'Too many requests' });
    expect(ratelimit.putCalls).toBe(5);
    expect(pledges.putCalls).toBe(5);
  });

  it('rejects oversized admin auth payloads before rate-limit or auth KV writes', async () => {
    const env = createEnv();
    const ctx = { waitUntil: vi.fn() };
    const ratelimit = env.RATELIMIT as CountingKVNamespace;
    const pledges = env.PLEDGES as CountingKVNamespace;

    const response = await worker.fetch(new Request('https://pledge.pool.test/admin/auth/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@example.com',
        preferredLang: 'en',
        padding: 'x'.repeat(70 * 1024)
      })
    }), env, ctx);

    expect(response.status).toBe(413);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
    await expect(response.json()).resolves.toEqual({ error: 'Request body too large' });
    expect(ratelimit.putCalls).toBe(0);
    expect(pledges.putCalls).toBe(0);
  });

  it('lists campaign supporters from the campaign index without KV writes or list scans', async () => {
    const env = createEnv();
    const { ctx, cookie } = await signInAdmin(env);
    const pledges = env.PLEDGES as CountingKVNamespace;

    pledges.store.set('campaign-pledges:hand-relations', JSON.stringify(['order-1', 'order-2']));
    pledges.store.set('pledge:order-1', JSON.stringify({
      orderId: 'order-1',
      email: 'reader@example.com',
      campaignSlug: 'hand-relations',
      pledgeStatus: 'active',
      amount: 5000,
      subtotal: 4500,
      shippingAddress: { name: 'Reader One', country: 'US' },
      createdAt: '2026-04-01T12:00:00.000Z'
    }));
    pledges.store.set('pledge:order-2', JSON.stringify({
      orderId: 'order-2',
      email: 'digital@example.com',
      campaignSlug: 'hand-relations',
      pledgeStatus: 'charged',
      charged: true,
      amount: 2500,
      subtotal: 2500,
      createdAt: '2026-04-02T12:00:00.000Z'
    }));
    pledges.resetCounts();
    (env.RATELIMIT as CountingKVNamespace).resetCounts();

    const response = await worker.fetch(new Request('https://pledge.pool.test/admin/supporters?campaignSlug=hand-relations&fulfillment=physical', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.writeBudget).toEqual({ readOnly: true, kvWritesExpected: 0, kvListExpected: 0 });
    expect(body.supporters).toHaveLength(1);
    expect(body.supporters[0]).toMatchObject({
      email: 'reader@example.com',
      pledgeStatus: 'active',
      hasPhysicalReward: true
    });
    expect(JSON.stringify(body.supporters[0])).not.toContain('stripePaymentMethodId');

    expect(pledges.putCalls).toBe(0);
    expect(pledges.deleteCalls).toBe(0);
    expect(pledges.listCalls).toBe(0);
    expect((env.RATELIMIT as CountingKVNamespace).putCalls).toBe(0);
    expect((env.RATELIMIT as CountingKVNamespace).deleteCalls).toBe(0);
    expect((env.RATELIMIT as CountingKVNamespace).listCalls).toBe(0);
  });

  it('lists all supporters across campaigns scoped to the admin account', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({
          campaigns: [
            campaignFixture,
            { ...campaignFixture, slug: 'other-campaign', title: 'Other Campaign' },
            { ...campaignFixture, slug: 'missing-index-campaign', title: 'Missing Index Campaign' }
          ]
        });
      }
      if (url === 'https://pool.test/api/add-ons.json') return jsonResponse(addOnsFixture);
      if (url === 'https://api.resend.com/emails') return jsonResponse({ id: 'email-test' });
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const env = createEnv();
    const { ctx, cookie } = await signInAdmin(env);
    const pledges = env.PLEDGES as CountingKVNamespace;

    pledges.store.set('campaign-pledges:hand-relations', JSON.stringify(['order-all-1']));
    pledges.store.set('campaign-pledges:other-campaign', JSON.stringify(['order-all-2']));
    pledges.store.set('pledge:order-all-1', JSON.stringify({
      orderId: 'order-all-1',
      email: 'hand@example.com',
      campaignSlug: 'hand-relations',
      pledgeStatus: 'active',
      amount: 5000,
      createdAt: '2026-04-01T12:00:00.000Z'
    }));
    pledges.store.set('pledge:order-all-2', JSON.stringify({
      orderId: 'order-all-2',
      email: 'other@example.com',
      campaignSlug: 'other-campaign',
      pledgeStatus: 'charged',
      charged: true,
      amount: 2500,
      createdAt: '2026-04-02T12:00:00.000Z'
    }));
    pledges.resetCounts();
    (env.RATELIMIT as CountingKVNamespace).resetCounts();

    const response = await worker.fetch(new Request('https://pledge.pool.test/admin/supporters?status=all', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.scope).toBe('portfolio');
    expect(body.campaign).toBeNull();
    expect(body.campaigns.map((campaign: { slug: string }) => campaign.slug)).toEqual(['hand-relations', 'other-campaign', 'missing-index-campaign']);
    expect(body.missingCampaigns).toEqual([
      expect.objectContaining({ slug: 'missing-index-campaign' })
    ]);
    expect(body.supporters.map((supporter: { email: string; campaignSlug: string; campaignTitle: string }) => ({
      email: supporter.email,
      campaignSlug: supporter.campaignSlug,
      campaignTitle: supporter.campaignTitle
    }))).toEqual([
      { email: 'hand@example.com', campaignSlug: 'hand-relations', campaignTitle: 'Hand Relations' },
      { email: 'other@example.com', campaignSlug: 'other-campaign', campaignTitle: 'Other Campaign' }
    ]);
    expect(body.page.indexed).toBe(2);
    expect(body.writeBudget).toEqual({ readOnly: true, kvWritesExpected: 0, kvListExpected: 0 });
    expect(pledges.putCalls).toBe(0);
    expect(pledges.deleteCalls).toBe(0);
    expect(pledges.listCalls).toBe(0);
    expect((env.RATELIMIT as CountingKVNamespace).putCalls).toBe(0);
    expect((env.RATELIMIT as CountingKVNamespace).deleteCalls).toBe(0);
    expect((env.RATELIMIT as CountingKVNamespace).listCalls).toBe(0);
  });

  it('previews campaign-runner reports from the campaign index without KV writes or list scans', async () => {
    const env = createEnv();
    const { ctx, cookie } = await signInAdmin(env);
    const pledges = env.PLEDGES as CountingKVNamespace;

    pledges.store.set('campaign-pledges:hand-relations', JSON.stringify(['order-report-1']));
    pledges.store.set('pledge:order-report-1', JSON.stringify({
      orderId: 'order-report-1',
      email: 'reader@example.com',
      campaignSlug: 'hand-relations',
      tierId: 'digital-pass',
      tierName: 'Digital Pass',
      tierQty: 1,
      pledgeStatus: 'active',
      amount: 5000,
      subtotal: 4500,
      tipAmount: 500,
      createdAt: '2026-04-01T12:00:00.000Z'
    }));
    pledges.resetCounts();
    (env.RATELIMIT as CountingKVNamespace).resetCounts();

    const response = await worker.fetch(new Request('https://pledge.pool.test/admin/reports/campaign-runner/preview?campaignSlug=hand-relations&reportType=pledge', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.writeBudget).toEqual({ readOnly: true, kvWritesExpected: 0, kvListExpected: 0 });
    expect(body).toMatchObject({
      dryRun: true,
      campaignSlug: 'hand-relations',
      reportType: 'pledge',
      reportKind: 'Daily pledge report',
      rowCount: 1,
      recipientCount: 1
    });
    expect(body.header).toContain('email');
    expect(body.previewRows[0]).toContain('reader@example.com');
    expect(JSON.stringify(body)).not.toContain('stripePaymentMethodId');

    expect(pledges.putCalls).toBe(0);
    expect(pledges.deleteCalls).toBe(0);
    expect(pledges.listCalls).toBe(0);
    expect((env.RATELIMIT as CountingKVNamespace).putCalls).toBe(0);
    expect((env.RATELIMIT as CountingKVNamespace).deleteCalls).toBe(0);
    expect((env.RATELIMIT as CountingKVNamespace).listCalls).toBe(0);
  });

  it('previews all role-scoped campaign-runner reports without KV writes or list scans', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({
          campaigns: [
            campaignFixture,
            { ...campaignFixture, slug: 'other-campaign', title: 'Other Campaign' },
            { ...campaignFixture, slug: 'missing-index-campaign', title: 'Missing Index Campaign' }
          ]
        });
      }
      if (url === 'https://pool.test/api/add-ons.json') return jsonResponse(addOnsFixture);
      if (url === 'https://api.resend.com/emails') return jsonResponse({ id: 'email-test' });
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const env = createEnv();
    const { ctx, cookie } = await signInAdmin(env);
    const pledges = env.PLEDGES as CountingKVNamespace;

    ['hand-relations', 'other-campaign'].forEach((campaignSlug) => {
      pledges.store.set(`campaign-pledges:${campaignSlug}`, JSON.stringify([]));
    });
    const handOrderIds = Array.from({ length: 6 }, (_value, index) => `order-report-all-${index + 1}`);
    pledges.store.set('campaign-pledges:hand-relations', JSON.stringify(handOrderIds));
    pledges.store.set('campaign-pledges:other-campaign', JSON.stringify(['order-report-all-other']));
    handOrderIds.forEach((orderId, index) => {
      pledges.store.set(`pledge:${orderId}`, JSON.stringify({
        orderId,
        email: index === 0 ? 'hand-reader@example.com' : `hand-reader-${index + 1}@example.com`,
        campaignSlug: 'hand-relations',
        pledgeStatus: 'active',
        amount: 5000,
        subtotal: 4500,
        tipAmount: 500,
        createdAt: '2026-04-01T12:00:00.000Z'
      }));
    });
    pledges.store.set('pledge:order-report-all-other', JSON.stringify({
      orderId: 'order-report-all-other',
      email: 'other-reader@example.com',
      campaignSlug: 'other-campaign',
      pledgeStatus: 'active',
      amount: 2500,
      subtotal: 2000,
      tipAmount: 500,
      createdAt: '2026-04-02T12:00:00.000Z'
    }));
    resetKvCounters(env);

    const response = await worker.fetch(new Request('https://pledge.pool.test/admin/reports/campaign-runner/preview?campaignSlug=&reportType=pledge', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      scope: 'portfolio',
      campaignSlug: '',
      campaignTitle: 'All campaigns',
      reportType: 'pledge',
      rowCount: 7
    });
    expect(body.recipientCount).toBeGreaterThanOrEqual(0);
    expect(body.campaigns).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: 'hand-relations', rowCount: 6 }),
      expect.objectContaining({ slug: 'other-campaign', rowCount: 1 })
    ]));
    expect(body.missingCampaigns).toEqual([
      expect.objectContaining({ campaignSlug: 'missing-index-campaign' })
    ]);
    expect(body.previewRows).toHaveLength(7);
    expect(body.rows).toHaveLength(7);
    expect(body.previewRows.flat()).toEqual(expect.arrayContaining(['hand-reader@example.com', 'other-reader@example.com']));
    expectNoKvWritesOrLists(env, 'all reports read');
  });

  it('scopes all-campaign report previews to campaign admins', async () => {
    const env = createEnv();
    const userKey = `admin-user:${await sha256Hex('creator@example.com')}`;
    (env.PLEDGES as CountingKVNamespace).store.set(userKey, JSON.stringify({
      email: 'creator@example.com',
      role: 'campaign_user',
      campaignSlugs: ['hand-relations']
    }));
    const { ctx, cookie } = await signInAdmin(env, 'creator@example.com');
    const pledges = env.PLEDGES as CountingKVNamespace;

    pledges.store.set('campaign-pledges:hand-relations', JSON.stringify(['order-report-scope-1']));
    pledges.store.set('campaign-pledges:sunder', JSON.stringify(['order-report-scope-2']));
    pledges.store.set('pledge:order-report-scope-1', JSON.stringify({
      orderId: 'order-report-scope-1',
      email: 'scoped-reader@example.com',
      campaignSlug: 'hand-relations',
      pledgeStatus: 'active',
      amount: 5000,
      subtotal: 4500
    }));
    pledges.store.set('pledge:order-report-scope-2', JSON.stringify({
      orderId: 'order-report-scope-2',
      email: 'blocked-reader@example.com',
      campaignSlug: 'sunder',
      pledgeStatus: 'active',
      amount: 2500,
      subtotal: 2000
    }));
    resetKvCounters(env);

    const response = await worker.fetch(new Request('https://pledge.pool.test/admin/reports/campaign-runner/preview?campaignSlug=all&reportType=pledge', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.campaigns).toHaveLength(1);
    expect(body.campaigns[0]).toMatchObject({ slug: 'hand-relations', rowCount: 1 });
    expect(JSON.stringify(body)).toContain('scoped-reader@example.com');
    expect(JSON.stringify(body)).not.toContain('blocked-reader@example.com');
    expectNoKvWritesOrLists(env, 'campaign admin all reports read');
  });

  it('reads pledge-derived analytics from campaign indexes without KV writes or list scans', async () => {
    const env = createEnv();
    const { ctx, cookie } = await signInAdmin(env);
    const pledges = env.PLEDGES as CountingKVNamespace;
    const ratelimit = env.RATELIMIT as CountingKVNamespace;

    pledges.store.set('campaign-pledges:hand-relations', JSON.stringify(['order-analytics-1', 'order-analytics-2']));
    pledges.store.set('pledge:order-analytics-1', JSON.stringify({
      orderId: 'order-analytics-1',
      email: 'one@example.com',
      campaignSlug: 'hand-relations',
      pledgeStatus: 'active',
      amount: 7000,
      subtotal: 6000,
      tax: 400,
      shipping: 300,
      tipAmount: 300,
      preferredLang: 'en',
      referralCode: 'newsletter',
      utmSource: 'email',
      bundleAddOns: [
        { productId: 'dust-wave-sticker', quantity: 2, unitPrice: 300 },
        { productId: 'hand-relations__zine', quantity: 1, unitPrice: 1200, scope: 'campaign', campaignSlug: 'hand-relations' }
      ]
    }));
    pledges.store.set('pledge:order-analytics-2', JSON.stringify({
      orderId: 'order-analytics-2',
      email: 'two@example.com',
      campaignSlug: 'hand-relations',
      charged: true,
      amount: 5000,
      subtotal: 4500,
      tax: 250,
      shipping: 0,
      tipAmount: 250,
      preferredLang: 'es',
      ref: 'creator',
      attribution: { utmSource: 'instagram' }
    }));
    pledges.store.set('admin-marketing-referrals:hand-relations', JSON.stringify([
      { code: 'newsletter', referrer: 'Newsletter partner', campaignSlug: 'hand-relations' },
      { code: 'creator', referrer: 'Creator circle', campaignSlug: 'hand-relations' }
    ]));
    pledges.resetCounts();
    ratelimit.resetCounts();

    const response = await worker.fetch(new Request('https://pledge.pool.test/admin/analytics', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.writeBudget).toEqual({ readOnly: true, kvWritesExpected: 0, kvListExpected: 0 });
    expect(body.totals).toMatchObject({
      campaignCount: 1,
      indexedPledgeCount: 2,
      pledgeCount: 2,
      uniqueSupporters: 2,
      pledgedAmount: 12000,
      chargedAmount: 5000,
      campaignRevenue: 9900,
      campaignAddOnRevenue: 1200,
      platformAddOnRevenue: 600,
      platformTipRevenue: 550,
      estimatedStripeFeeAmount: 408,
      estimatedStripeFeePledgeCount: 2,
      physicalPledgeCount: 0,
      physicalPledgeAmount: 0,
      digitalPledgeCount: 2,
      digitalPledgeAmount: 12000
    });
    expect(body.statusBreakdown).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'active', count: 1, amount: 7000 }),
      expect.objectContaining({ key: 'charged', count: 1, amount: 5000 })
    ]));
    expect(body.languageBreakdown).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'en', count: 1 }),
      expect.objectContaining({ key: 'es', count: 1 })
    ]));
    expect(body.referralBreakdown).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'newsletter', count: 1 }),
      expect.objectContaining({ key: 'creator', count: 1 })
    ]));
    expect(body.referralLabels).toEqual({
      newsletter: 'Newsletter partner',
      creator: 'Creator circle'
    });

    expect(pledges.putCalls).toBe(0);
    expect(pledges.deleteCalls).toBe(0);
    expect(pledges.listCalls).toBe(0);
    expect(ratelimit.putCalls).toBe(0);
    expect(ratelimit.deleteCalls).toBe(0);
    expect(ratelimit.listCalls).toBe(0);
  });

  it('stores and lists saved marketing referral codes only on explicit save', async () => {
    const env = createEnv();
    const { ctx, cookie, csrfToken } = await signInAdmin(env);
    const pledges = env.PLEDGES as CountingKVNamespace;
    const ratelimit = env.RATELIMIT as CountingKVNamespace;
    resetKvCounters(env);

    const preflightResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/marketing/referrals', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://pool.test',
        'Access-Control-Request-Method': 'DELETE'
      }
    }), env, ctx);
    expect(preflightResponse.status).toBe(200);
    expect(preflightResponse.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');

    const emptyResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/marketing/referrals?campaignSlug=hand-relations', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(emptyResponse.status).toBe(200);
    expect(await emptyResponse.json()).toMatchObject({
      campaignSlug: 'hand-relations',
      referrals: [],
      writeBudget: { readOnly: true, kvWritesExpected: 0, kvListExpected: 0 }
    });
    expectNoKvWritesOrLists(env, 'marketing referrals read');

    resetKvCounters(env);
    const unsafeSaveResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/marketing/referrals', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        'x-pool-admin-csrf': csrfToken
      },
      body: JSON.stringify({
        campaignSlug: 'hand-relations',
        code: 'unsafe',
        name: '<img src=x onerror=alert(1)>',
        url: 'https://pool.test/campaigns/hand-relations/?utm_campaign=hand-relations&ref=unsafe'
      })
    }), env, ctx);
    expect(unsafeSaveResponse.status).toBe(400);
    await expect(unsafeSaveResponse.json()).resolves.toMatchObject({
      error: expect.stringContaining('Referrer name cannot include raw HTML')
    });
    expect(pledges.putCalls).toBe(0);
    expect(pledges.deleteCalls).toBe(0);
    expect(pledges.listCalls).toBe(0);

    (env.RATELIMIT as CountingKVNamespace).store.clear();
    resetKvCounters(env);
    const saveResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/marketing/referrals', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        'x-pool-admin-csrf': csrfToken
      },
      body: JSON.stringify({
        campaignSlug: 'hand-relations',
        code: 'Launch List!',
        name: 'Launch list',
        url: 'https://pool.test/campaigns/hand-relations/?utm_campaign=hand-relations&ref=launch-list'
      })
    }), env, ctx);
    expect(saveResponse.status).toBe(200);
    const saveBody = await saveResponse.json();
    expect(saveBody.referral).toMatchObject({
      campaignSlug: 'hand-relations',
      code: 'launch-list',
      name: 'Launch list',
      referrer: 'Launch list',
      url: 'https://pool.test/campaigns/hand-relations/?utm_campaign=hand-relations&ref=launch-list'
    });
    expect(saveBody.referrals).toEqual([
      expect.objectContaining({
        code: 'launch-list',
        referrer: 'Launch list',
        url: 'https://pool.test/campaigns/hand-relations/?utm_campaign=hand-relations&ref=launch-list'
      })
    ]);
    expect(pledges.putCalls).toBe(1);
    expect(pledges.deleteCalls).toBe(0);
    expect(pledges.listCalls).toBe(0);
    expect(ratelimit.putCalls).toBe(1);
    expect(ratelimit.deleteCalls).toBe(0);
    expect(ratelimit.listCalls).toBe(0);

    resetKvCounters(env);
    const editResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/marketing/referrals', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        'x-pool-admin-csrf': csrfToken
      },
      body: JSON.stringify({
        campaignSlug: 'hand-relations',
        originalCode: 'launch-list',
        code: 'Launch List Updated',
        referrer: 'Launch list updated',
        url: 'https://pool.test/campaigns/hand-relations/?utm_campaign=hand-relations&ref=launch-list-updated'
      })
    }), env, ctx);
    expect(editResponse.status).toBe(200);
    const editBody = await editResponse.json();
    expect(editBody.referrals).toEqual([
      expect.objectContaining({
        code: 'launch-list-updated',
        referrer: 'Launch list updated',
        url: 'https://pool.test/campaigns/hand-relations/?utm_campaign=hand-relations&ref=launch-list-updated'
      })
    ]);
    expect(pledges.putCalls).toBe(1);
    expect(pledges.deleteCalls).toBe(0);
    expect(pledges.listCalls).toBe(0);
    expect(ratelimit.putCalls).toBe(1);
    expect(ratelimit.deleteCalls).toBe(0);
    expect(ratelimit.listCalls).toBe(0);

    resetKvCounters(env);
    const listResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/marketing/referrals?campaignSlug=hand-relations', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.referrals).toEqual([
      expect.objectContaining({
        code: 'launch-list-updated',
        referrer: 'Launch list updated',
        url: 'https://pool.test/campaigns/hand-relations/?utm_campaign=hand-relations&ref=launch-list-updated'
      })
    ]);
    expectNoKvWritesOrLists(env, 'marketing referrals read after save');

    resetKvCounters(env);
    const deleteResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/marketing/referrals', {
      method: 'DELETE',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        'x-pool-admin-csrf': csrfToken
      },
      body: JSON.stringify({
        campaignSlug: 'hand-relations',
        code: 'launch-list-updated'
      })
    }), env, ctx);
    expect(deleteResponse.status).toBe(200);
    const deleteBody = await deleteResponse.json();
    expect(deleteBody.deletedCode).toBe('launch-list-updated');
    expect(deleteBody.referrals).toEqual([]);
    expect(pledges.putCalls).toBe(0);
    expect(pledges.deleteCalls).toBe(1);
    expect(pledges.listCalls).toBe(0);
    expect(ratelimit.putCalls).toBe(1);
    expect(ratelimit.deleteCalls).toBe(0);
    expect(ratelimit.listCalls).toBe(0);
  });

  it('deduplicates portfolio supporter counts across campaign analytics', async () => {
    resetCampaignRuntimeStateForTests();
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({
          campaigns: [
            campaignFixture,
            { ...campaignFixture, slug: 'other-campaign', title: 'Other Campaign' },
            { ...campaignFixture, slug: 'missing-index-campaign', title: 'Missing Index Campaign' }
          ]
        });
      }
      if (url === 'https://pool.test/api/add-ons.json') {
        return jsonResponse(addOnsFixture);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const env = createEnv();
    const { ctx, cookie } = await signInAdmin(env);
    const pledges = env.PLEDGES as CountingKVNamespace;
    pledges.store.set('campaign-pledges:hand-relations', JSON.stringify(['order-portfolio-1']));
    pledges.store.set('campaign-pledges:other-campaign', JSON.stringify(['order-portfolio-2']));
    pledges.store.set('pledge:order-portfolio-1', JSON.stringify({
      orderId: 'order-portfolio-1',
      email: 'shared@example.com',
      campaignSlug: 'hand-relations',
      pledgeStatus: 'active',
      amount: 3000,
      subtotal: 3000
    }));
    pledges.store.set('pledge:order-portfolio-2', JSON.stringify({
      orderId: 'order-portfolio-2',
      email: 'SHARED@example.com',
      campaignSlug: 'other-campaign',
      pledgeStatus: 'active',
      amount: 4000,
      subtotal: 4000
    }));
    pledges.resetCounts();

    const response = await worker.fetch(new Request('https://pledge.pool.test/admin/analytics', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.totals).toMatchObject({
      campaignCount: 3,
      pledgeCount: 2,
      uniqueSupporters: 1,
      pledgedAmount: 7000
    });
    expect(body.missingCampaigns).toEqual([
      expect.objectContaining({ slug: 'missing-index-campaign' })
    ]);
    expect(body.campaigns).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: 'hand-relations', totals: expect.objectContaining({ uniqueSupporters: 1 }) }),
      expect.objectContaining({ slug: 'other-campaign', totals: expect.objectContaining({ uniqueSupporters: 1 }) })
    ]));
    expect(JSON.stringify(body)).not.toContain('shared@example.com');
    expect(pledges.putCalls).toBe(0);
    expect(pledges.deleteCalls).toBe(0);
    expect(pledges.listCalls).toBe(0);
  });

  it('returns zero analytics for a campaign without a pledge index', async () => {
    resetCampaignRuntimeStateForTests();
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({
          campaigns: [
            { ...campaignFixture, slug: 'their-love', title: 'Their Love', state: 'prelaunch' }
          ]
        });
      }
      if (url === 'https://pool.test/api/add-ons.json') {
        return jsonResponse(addOnsFixture);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const env = createEnv();
    const { ctx, cookie } = await signInAdmin(env);
    const pledges = env.PLEDGES as CountingKVNamespace;
    resetKvCounters(env);

    const response = await worker.fetch(new Request('https://pledge.pool.test/admin/analytics?campaignSlug=their-love', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.scope).toBe('campaign');
    expect(body.campaignSlug).toBe('their-love');
    expect(body.totals).toMatchObject({
      campaignCount: 1,
      indexedPledgeCount: 0,
      pledgeCount: 0,
      uniqueSupporters: 0,
      pledgedAmount: 0,
      chargedAmount: 0,
      paymentFailedAmount: 0
    });
    expect(body.campaigns).toEqual([
      expect.objectContaining({
        slug: 'their-love',
        pledgeIndexPresent: false,
        totals: expect.objectContaining({ pledgeCount: 0 })
      })
    ]);
    expect(body.missingCampaigns).toEqual([
      expect.objectContaining({ slug: 'their-love' })
    ]);
    expectNoKvWritesOrLists(env, 'missing index analytics read');
    expect(pledges.putCalls).toBe(0);
    expect(pledges.deleteCalls).toBe(0);
    expect(pledges.listCalls).toBe(0);
  });

  it('loads and previews campaign content without KV writes or list scans', async () => {
    const env = createEnv();
    const { ctx, cookie } = await signInAdmin(env);
    const pledges = env.PLEDGES as CountingKVNamespace;
    const ratelimit = env.RATELIMIT as CountingKVNamespace;
    pledges.resetCounts();
    ratelimit.resetCounts();

    const loadResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/content/campaign?campaignSlug=hand-relations', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(loadResponse.status).toBe(200);
    const loaded = await loadResponse.json();
    expect(loaded.writeBudget).toEqual({ readOnly: true, kvWritesExpected: 0, kvListExpected: 0 });
    expect(loaded.campaign).toMatchObject({
      slug: 'hand-relations',
      title: 'Hand Relations',
      shortBlurb: 'Elevated horror where a corporate empathy campaign consumes bureaucracy.'
    });
    expect(Array.isArray(loaded.campaign.longContent)).toBe(true);

    const previewResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/content/preview', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        campaignSlug: 'hand-relations',
        draft: {
          title: 'Hand Relations Preview',
          shortBlurb: 'A **safe** preview with <em>legacy emphasis</em> and [Terms](https://pool.test/terms/).',
          longContent: [
            { type: 'text', body: '## The Vision\n\nThis is _Markdown_.\n\n- **$1** — one frame\n- **$5** — writer credit\n\n1. First scene\n2. Second scene' },
            { type: 'divider' },
            { type: 'quote', text: 'Make it strange.', author: 'Director' },
            { type: 'video', provider: 'youtube', video_id: 'video-demo', caption: 'Demo video' },
            { type: 'video', provider: 'local', src: '/assets/videos/campaigns/their-love/video.webm', caption: 'Proof of concept video' },
            {
              type: 'gallery',
              layout: 'grid',
              caption_style: 'overlay',
              images: [
                {
                  src: '/assets/images/campaigns/their-love/crew-james.png',
                  alt: 'James Clare',
                  caption: '<strong>James Clare - Writer/Director</strong><br>Lead <em>actor</em>'
                }
              ],
              caption: 'Crew gallery'
            },
            { type: 'embed', provider: 'youtube', src: 'https://www.youtube-nocookie.com/embed/demo', title: 'Demo video' }
          ]
        }
      })
    }), env, ctx);
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json();
    expect(preview.writeBudget).toEqual({ readOnly: true, kvWritesExpected: 0, kvListExpected: 0 });
    expect(preview).toMatchObject({
      dryRun: true,
      valid: true,
      campaignSlug: 'hand-relations'
    });
    expect(preview.preview.html).toContain('Hand Relations Preview');
    expect(preview.preview.html).toContain('<strong>safe</strong>');
    expect(preview.preview.html).toContain('<em>legacy emphasis</em>');
    expect(preview.preview.html).toContain('rel="noopener noreferrer"');
    expect(preview.preview.html).toContain('<ul><li><strong>$1</strong> — one frame</li><li><strong>$5</strong> — writer credit</li></ul>');
    expect(preview.preview.html).toContain('<ol><li>First scene</li><li>Second scene</li></ol>');
    expect(preview.preview.html).toContain('class="admin-content-preview__divider');
    expect(preview.preview.html).not.toContain('admin-content-preview__block--divider');
    expect(preview.preview.html).toContain('class="video-embed video-embed--youtube"');
    expect(preview.preview.html).toContain('https://www.youtube-nocookie.com/embed/video-demo');
    expect(preview.preview.html).toContain('allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"');
    expect(preview.preview.html).toContain('<figcaption class="admin-content-preview__caption">Demo video</figcaption>');
    expect(preview.preview.html).toContain('video-embed--local');
    expect(preview.preview.html).toContain('<video controls preload="none" playsinline data-first-frame-poster="true">');
    expect(preview.preview.html).toContain('<source src="/assets/videos/campaigns/their-love/video.webm" type="video/webm">');
    expect(preview.preview.html).toContain('<figcaption class="admin-content-preview__caption">Proof of concept video</figcaption>');
    expect(preview.preview.html).toContain('gallery--caption-overlay');
    expect(preview.preview.html).toContain('<span class="gallery__item-caption-text"><strong>James Clare - Writer/Director</strong><br>Lead <em>actor</em></span>');
    expect(preview.preview.html).not.toContain('&lt;strong&gt;James Clare');
    expect(preview.preview.html).toContain('<cite>— Director</cite>');
    expect(preview.preview.html).toContain('https://www.youtube-nocookie.com/embed/demo');

    expect(pledges.putCalls).toBe(0);
    expect(pledges.deleteCalls).toBe(0);
    expect(pledges.listCalls).toBe(0);
    expect(ratelimit.putCalls).toBe(0);
    expect(ratelimit.deleteCalls).toBe(0);
    expect(ratelimit.listCalls).toBe(0);
  });

  it('rejects unsafe campaign content preview drafts without persisting them', async () => {
    const env = createEnv();
    const { ctx, cookie } = await signInAdmin(env);
    const pledges = env.PLEDGES as CountingKVNamespace;
    pledges.resetCounts();

    const response = await worker.fetch(new Request('https://pledge.pool.test/admin/content/preview', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        campaignSlug: 'hand-relations',
        draft: {
          title: 'Unsafe Preview',
          shortBlurb: '<img src=x onerror=alert(1)>',
          longContent: [
            { type: 'embed', provider: 'loom', src: 'https://www.loom.com/embed/123' },
            { type: 'text', body: '<iframe src="https://example.com"></iframe>' },
            { type: 'text', body: 'Try [private](../admin).' },
            { type: 'embed', provider: 'youtube', html: '<iframe src="https://www.youtube.com/embed/demo"></iframe>' }
          ]
        }
      })
    }), env, ctx);

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.valid).toBe(false);
    expect(body.errors.join('\n')).toContain('raw <img> HTML');
    expect(body.errors.join('\n')).toContain('provider is not approved');
    expect(body.errors.join('\n')).toContain('raw <iframe> HTML');
    expect(body.errors.join('\n')).toContain('.html is not allowed');
    expect(body.errors.join('\n')).toContain('unsafe link URL');
    expect(body.preview.html).not.toContain('<img');
    expect(body.preview.html).not.toContain('<script');
    expect(body.preview.html).not.toContain('../admin');
    expect(pledges.putCalls).toBe(0);
    expect(pledges.deleteCalls).toBe(0);
    expect(pledges.listCalls).toBe(0);
  });

  it('strips header controls from admin magic-link email payloads', async () => {
    const env = {
      ...createEnv(),
      APP_MODE: 'production',
      ADMIN_EXPOSE_LOGIN_LINK: '',
      RESEND_API_KEY: 'resend-test',
      PLATFORM_NAME: 'Pool\r\nBCC: evil@example.com',
      UPDATES_EMAIL_FROM: 'Pool Admin <admin@example.com>\r\nBCC: evil@example.com'
    };

    const response = await worker.fetch(new Request('https://pledge.pool.test/admin/auth/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', preferredLang: 'en' })
    }), env, { waitUntil: vi.fn() });

    expect(response.status).toBe(200);
    const resendCall = (global.fetch as unknown as { mock: { calls: Array<[RequestInfo | URL, RequestInit?]> } }).mock.calls
      .find(([input]) => input === 'https://api.resend.com/emails');
    expect(resendCall).toBeTruthy();
    const payload = JSON.parse(String(resendCall?.[1]?.body || '{}'));
    expect(payload.from).toBe('Pool Admin <admin@example.com> BCC: evil@example.com');
    expect(payload.subject).toBe('Your admin sign-in link | Pool BCC: evil@example.com');
    expect(payload.from).not.toMatch(/[\r\n]/);
    expect(payload.subject).not.toMatch(/[\r\n]/);
    expect(payload.reply_to).toBeTruthy();
    expect(payload.html).toContain('<a href="https://pool.test/admin/?admin_login=');
    expect(payload.html).toContain('border-radius:');
    expect(payload.html).toContain('Open admin');
    expect(payload.text).toContain('Open admin (https://pool.test/admin/?admin_login=');
  });

  it('emails admin sign-in links on deployed test-mode Workers instead of exposing them in the response', async () => {
    const env = {
      ...createEnv(),
      APP_MODE: 'test',
      ADMIN_EXPOSE_LOGIN_LINK: '',
      SITE_BASE: 'https://pool.dustwave.xyz',
      WORKER_BASE: 'https://pledge.dustwave.xyz',
      CORS_ALLOWED_ORIGIN: 'https://pool.dustwave.xyz',
      RESEND_API_KEY: 'resend-test'
    };

    const response = await worker.fetch(new Request('https://pledge.dustwave.xyz/admin/auth/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', preferredLang: 'en' })
    }), env, { waitUntil: vi.fn() });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.loginUrl).toBeUndefined();
    expect(body.sent).toBe(true);
    const resendCall = (global.fetch as unknown as { mock: { calls: Array<[RequestInfo | URL, RequestInit?]> } }).mock.calls
      .find(([input]) => input === 'https://api.resend.com/emails');
    expect(resendCall).toBeTruthy();
    const payload = JSON.parse(String(resendCall?.[1]?.body || '{}'));
    expect(payload.to).toBe('admin@example.com');
    expect(payload.html).toContain('<a href="https://pool.dustwave.xyz/admin/?admin_login=');
    expect(payload.html).toContain('Open admin');
    expect(payload.text).toContain('Open admin (https://pool.dustwave.xyz/admin/?admin_login=');
  });

  it('publishes validated campaign content through GitHub with CSRF and one audit write', async () => {
    const env = {
      ...createEnv(),
      GITHUB_TOKEN: 'github-test',
      GITHUB_OWNER: 'dust-wave',
      GITHUB_REPO: 'pool',
      GITHUB_REF: 'main',
      GITHUB_WORKFLOW: 'deploy.yml'
    };
    const { ctx, cookie, csrfToken } = await signInAdmin(env);
    const pledges = env.PLEDGES as CountingKVNamespace;
    const ratelimit = env.RATELIMIT as CountingKVNamespace;
    const githubCalls: Array<{ url: string; method: string; body?: any }> = [];
    const existingMarkdown = `---
layout: campaign
title: "Hand Relations"
slug: hand-relations
short_blurb: "Old blurb"
long_content:
  - type: text
    body: |
      Old body.
tiers:
  - id: frame-slot
    name: Buy 1 Frame
---
`;

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = String(init?.method || 'GET');
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({ campaigns: [campaignFixture] });
      }
      if (url === 'https://pool.test/api/add-ons.json') {
        return jsonResponse(addOnsFixture);
      }
      if (url.includes('/contents/_campaigns/hand-relations.md') && method === 'GET') {
        githubCalls.push({ url, method });
        return jsonResponse({
          path: '_campaigns/hand-relations.md',
          sha: 'old-file-sha',
          encoding: 'base64',
          content: Buffer.from(existingMarkdown, 'utf8').toString('base64')
        });
      }
      if (url.endsWith('/contents/_campaigns/hand-relations.md') && method === 'PUT') {
        const body = JSON.parse(String(init?.body || '{}'));
        githubCalls.push({ url, method, body });
        return jsonResponse({
          content: { path: '_campaigns/hand-relations.md', sha: 'new-file-sha' },
          commit: { sha: 'commit-sha-123', html_url: 'https://github.test/commit/commit-sha-123' }
        });
      }
      if (url.endsWith('/actions/workflows/deploy.yml/dispatches') && method === 'POST') {
        githubCalls.push({ url, method, body: JSON.parse(String(init?.body || '{}')) });
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    pledges.resetCounts();
    ratelimit.resetCounts();

    const missingCsrfResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/content/publish', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        intent: 'publish',
        campaignSlug: 'hand-relations',
        draft: {
          title: 'Hand Relations Publish',
          shortBlurb: 'Published blurb.',
          longContent: [{ type: 'text', body: 'Published body.' }]
        }
      })
    }), env, ctx);
    expect(missingCsrfResponse.status).toBe(403);

    pledges.resetCounts();
    ratelimit.resetCounts();
    githubCalls.length = 0;

    const response = await worker.fetch(new Request('https://pledge.pool.test/admin/content/publish', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        'x-pool-admin-csrf': csrfToken
      },
      body: JSON.stringify({
        intent: 'publish',
        campaignSlug: 'hand-relations',
        draft: {
          title: 'Hand Relations Publish',
          shortBlurb: 'Published blurb.',
          longContent: [
            { type: 'text', body: '## Published\n\nFresh body.', align: 'center' },
            { type: 'quote', text: 'Make it stranger.', author: 'Director' },
            { type: 'video', provider: 'local', src: '/assets/videos/campaigns/their-love/video.webm', caption: 'Proof of concept video' },
            {
              type: 'gallery',
              layout: 'grid',
              caption_style: 'overlay',
              images: [
                {
                  src: '/assets/images/campaigns/their-love/crew-james.png',
                  alt: 'James Clare',
                  caption: '<strong>James Clare - Writer/Director</strong><br>Lead <em>actor</em>'
                }
              ]
            }
          ]
        }
      })
    }), env, ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      campaignSlug: 'hand-relations',
      githubPath: '_campaigns/hand-relations.md',
      commitSha: 'commit-sha-123',
      writeBudget: {
        readOnly: false,
        kvWritesExpected: 1,
        kvListExpected: 0
      }
    });
    expect(body.rebuild).toEqual({ triggered: true });
    expect(body.auditKey).toContain('admin-audit:');

    const putCall = githubCalls.find((call) => call.method === 'PUT');
    expect(putCall).toBeTruthy();
    const committedMarkdown = Buffer.from(String(putCall?.body?.content || ''), 'base64').toString('utf8');
    expect(committedMarkdown).toContain('title: "Hand Relations Publish"');
    expect(committedMarkdown).toContain('short_blurb: "Published blurb."');
    expect(committedMarkdown).toContain('long_content:');
    expect(committedMarkdown).toContain('align: "center"');
    expect(committedMarkdown).toContain('Fresh body.');
    expect(committedMarkdown).toContain('provider: "local"');
    expect(committedMarkdown).toContain('src: "/assets/videos/campaigns/their-love/video.webm"');
    expect(committedMarkdown).toContain('caption_style: "overlay"');
    expect(committedMarkdown).toContain('caption: "<strong>James Clare - Writer/Director</strong><br>Lead <em>actor</em>"');
    expect(committedMarkdown).toContain('tiers:');
    expect(putCall?.body).toMatchObject({
      sha: 'old-file-sha',
      branch: 'main',
      message: 'Update hand-relations campaign content'
    });
    expect(githubCalls.some((call) => call.url.endsWith('/actions/workflows/deploy.yml/dispatches'))).toBe(true);
    expect(JSON.parse(pledges.store.get(body.auditKey) as string)).toMatchObject({
      action: 'campaign:publish_content',
      adminEmail: 'admin@example.com',
      campaignSlug: 'hand-relations',
      githubPath: '_campaigns/hand-relations.md',
      commitSha: 'commit-sha-123',
      rebuildTriggered: true
    });
    expect(pledges.putCalls).toBe(1);
    expect(pledges.deleteCalls).toBe(0);
    expect(pledges.listCalls).toBe(0);
    expect(ratelimit.putCalls).toBe(1);
    expect(ratelimit.deleteCalls).toBe(0);
    expect(ratelimit.listCalls).toBe(0);
  });

  it('downloads campaign-runner CSVs without KV writes or list scans', async () => {
    const env = createEnv();
    const { ctx, cookie } = await signInAdmin(env);
    const pledges = env.PLEDGES as CountingKVNamespace;

    pledges.store.set('campaign-pledges:hand-relations', JSON.stringify(['order-csv-1']));
    pledges.store.set('pledge:order-csv-1', JSON.stringify({
      orderId: 'order-csv-1',
      email: 'csv-reader@example.com',
      campaignSlug: 'hand-relations',
      tierId: 'digital-pass',
      tierName: 'Digital Pass',
      tierQty: 1,
      pledgeStatus: 'active',
      amount: 3000,
      subtotal: 3000,
      createdAt: '2026-04-03T12:00:00.000Z'
    }));
    pledges.resetCounts();
    (env.RATELIMIT as CountingKVNamespace).resetCounts();

    const response = await worker.fetch(new Request('https://pledge.pool.test/admin/reports/campaign-runner.csv?campaignSlug=hand-relations&reportType=pledge', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    expect(response.headers.get('Content-Disposition')).toContain('hand-relations-pledge-report-');
    const csv = await response.text();
    expect(csv).toContain('email,campaign,items');
    expect(csv).toContain('csv-reader@example.com');

    expect(pledges.putCalls).toBe(0);
    expect(pledges.deleteCalls).toBe(0);
    expect(pledges.listCalls).toBe(0);
    expect((env.RATELIMIT as CountingKVNamespace).putCalls).toBe(0);
    expect((env.RATELIMIT as CountingKVNamespace).deleteCalls).toBe(0);
    expect((env.RATELIMIT as CountingKVNamespace).listCalls).toBe(0);
  });

  it('reads platform add-on inventory for super admins without KV writes', async () => {
    const env = createEnv();
    const { ctx, cookie } = await signInAdmin(env);
    const pledges = env.PLEDGES as CountingKVNamespace;
    const ratelimit = env.RATELIMIT as CountingKVNamespace;

    pledges.store.set('pledge:add-on-order-1', JSON.stringify({
      orderId: 'add-on-order-1',
      campaignSlug: 'hand-relations',
      pledgeStatus: 'active',
      bundleAddOns: [
        { productId: 'dust-wave-sticker', quantity: 2 },
        { productId: 'dust-wave-shirt', variantId: 's', quantity: 1 },
        { productId: 'smoke-editable__poster', quantity: 9, scope: 'campaign', campaignSlug: 'smoke-editable' }
      ]
    }));
    pledges.resetCounts();
    ratelimit.resetCounts();

    const response = await worker.fetch(new Request('https://pledge.pool.test/admin/add-ons/inventory', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.writeBudget).toEqual({ readOnly: true, kvWritesExpected: 0, kvListExpected: 1 });
    expect(body.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        productId: 'dust-wave-sticker',
        configuredInventory: 50,
        inventory: 50,
        sold: 2,
        remaining: 48,
        hasOverride: false
      }),
      expect.objectContaining({
        productId: 'dust-wave-shirt',
        variantId: 's',
        configuredInventory: 2,
        inventory: 2,
        sold: 1,
        remaining: 1
      })
    ]));
    expect(body.rows.some((row: { productId: string }) => row.productId === 'smoke-editable__poster')).toBe(false);

    expect(pledges.putCalls).toBe(0);
    expect(pledges.deleteCalls).toBe(0);
    expect(pledges.listCalls).toBeGreaterThanOrEqual(1);
    expect(ratelimit.putCalls).toBe(0);
    expect(ratelimit.deleteCalls).toBe(0);
    expect(ratelimit.listCalls).toBe(0);
  });

  it('sets platform add-on inventory overrides with CSRF and audit writes', async () => {
    const env = createEnv();
    const { ctx, cookie, csrfToken } = await signInAdmin(env);
    const pledges = env.PLEDGES as CountingKVNamespace;
    const ratelimit = env.RATELIMIT as CountingKVNamespace;

    pledges.store.set('pledge:add-on-order-2', JSON.stringify({
      orderId: 'add-on-order-2',
      campaignSlug: 'hand-relations',
      pledgeStatus: 'active',
      bundleAddOns: [
        { productId: 'dust-wave-sticker', quantity: 2 }
      ]
    }));
    pledges.resetCounts();
    ratelimit.resetCounts();

    const response = await worker.fetch(new Request('https://pledge.pool.test/admin/add-ons/inventory', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        'x-pool-admin-csrf': csrfToken
      },
      body: JSON.stringify({
        action: 'set',
        productId: 'dust-wave-sticker',
        inventory: 80
      })
    }), env, ctx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      mutation: {
        action: 'set',
        productId: 'dust-wave-sticker',
        before: {
          configuredInventory: 50,
          inventory: 50,
          sold: 2,
          remaining: 48,
          hasOverride: false
        },
        after: {
          configuredInventory: 50,
          inventory: 80,
          overrideInventory: 80,
          sold: 2,
          remaining: 78,
          hasOverride: true
        }
      },
      writeBudget: {
        readOnly: false,
        kvWritesExpected: 2,
        kvListExpected: 2
      }
    });
    expect(body.auditKey).toContain('admin-audit:');
    expect(JSON.parse(pledges.store.get('add-on-inventory-overrides') as string)).toMatchObject({
      products: {
        'dust-wave-sticker': {
          inventory: 80
        }
      }
    });
    expect(JSON.parse(pledges.store.get(body.auditKey) as string)).toMatchObject({
      action: 'platform_inventory:manage',
      adminEmail: 'admin@example.com',
      productId: 'dust-wave-sticker',
      inventoryAction: 'set'
    });

    expect(pledges.putCalls).toBe(2);
    expect(pledges.deleteCalls).toBe(0);
    expect(pledges.listCalls).toBeGreaterThanOrEqual(2);
    expect(ratelimit.putCalls).toBe(1);
    expect(ratelimit.deleteCalls).toBe(0);
    expect(ratelimit.listCalls).toBe(0);
  });

  it('enforces campaign-user scope on supporter reads', async () => {
    resetCampaignRuntimeStateForTests();
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://pool.test/api/campaigns.json') {
        return jsonResponse({
          campaigns: [
            campaignFixture,
            { ...campaignFixture, slug: 'other-campaign', title: 'Other Campaign' }
          ]
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const env = createEnv();
    const pledges = env.PLEDGES as CountingKVNamespace;
    pledges.store.set(`admin-user:${await sha256Hex('creator@example.com')}`, JSON.stringify({
      email: 'creator@example.com',
      role: 'campaign_user',
      campaignSlugs: ['hand-relations']
    }));
    pledges.store.set('campaign-pledges:hand-relations', JSON.stringify([]));
    pledges.store.set('campaign-pledges:other-campaign', JSON.stringify([]));

    const { ctx, cookie } = await signInAdmin(env, 'creator@example.com');
    const allowedResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/supporters?campaignSlug=hand-relations', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(allowedResponse.status).toBe(200);

    const scopedAllResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/supporters', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(scopedAllResponse.status).toBe(200);
    const scopedAllBody = await scopedAllResponse.json();
    expect(scopedAllBody.scope).toBe('portfolio');
    expect(scopedAllBody.campaigns.map((campaign: { slug: string }) => campaign.slug)).toEqual(['hand-relations']);

    const forbiddenResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/supporters?campaignSlug=other-campaign', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(forbiddenResponse.status).toBe(403);

    const forbiddenAnalyticsResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/analytics?campaignSlug=other-campaign', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(forbiddenAnalyticsResponse.status).toBe(403);

    const forbiddenContentResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/content/preview', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        campaignSlug: 'other-campaign',
        draft: {
          title: 'Other Campaign',
          shortBlurb: 'Nope',
          longContent: []
        }
      })
    }), env, ctx);
    expect(forbiddenContentResponse.status).toBe(403);

    const platformInventoryResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/add-ons/inventory', {
      method: 'GET',
      headers: { Cookie: cookie }
    }), env, ctx);
    expect(platformInventoryResponse.status).toBe(403);
  });

  it('requires the admin CSRF token before clearing a browser session', async () => {
    const env = createEnv();
    const { ctx, cookie, csrfToken } = await signInAdmin(env);

    const missingCsrfResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/logout', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: '{}'
    }), env, ctx);
    expect(missingCsrfResponse.status).toBe(403);

    const validLogoutResponse = await worker.fetch(new Request('https://pledge.pool.test/admin/logout', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'x-pool-admin-csrf': csrfToken
      },
      body: '{}'
    }), env, ctx);
    expect(validLogoutResponse.status).toBe(200);
    expect(validLogoutResponse.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });

  it('rejects cross-origin admin mutations before durable writes', async () => {
    const env = createEnv();
    const { ctx, cookie, csrfToken } = await signInAdmin(env);
    const pledges = env.PLEDGES as CountingKVNamespace;
    const ratelimit = env.RATELIMIT as CountingKVNamespace;
    pledges.resetCounts();
    ratelimit.resetCounts();

    const response = await worker.fetch(new Request('https://pledge.pool.test/admin/add-ons/inventory', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: 'https://evil.test',
        'Content-Type': 'application/json',
        'x-pool-admin-csrf': csrfToken
      },
      body: JSON.stringify({
        action: 'set',
        productId: 'dust-wave-sticker',
        inventory: 80
      })
    }), env, ctx);

    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
    await expect(response.json()).resolves.toEqual({ error: 'Origin not allowed' });
    expect(pledges.putCalls).toBe(0);
    expect(pledges.deleteCalls).toBe(0);
    expect(ratelimit.putCalls).toBe(1);
  });
});
