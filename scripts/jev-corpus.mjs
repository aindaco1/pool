// Pool owns scenarios and captures. The shared evaluator never reads product data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  sendSupporterEmail, sendPledgeModifiedEmail, sendPledgeCancelledEmail,
  sendPaymentFailedEmail, sendChargeSuccessEmail
} from '../worker/src/email.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REQUIREMENTS = {
  pending: { pending: 'Says pledge confirmation is still pending, without claiming the pledge is already saved.', retry: 'Offers checking the status of this existing pledge.' },
  saved: { saved: 'Says the pledge is saved.', conditional: 'Says no charge occurs now and charging depends on the campaign reaching its funding goal.' },
  active: { conditional: 'Says no charge occurs now and charging depends on the campaign reaching its funding goal.', tip: 'Says the platform tip is optional and does not count toward the campaign goal.' },
  locked: { locked: 'Says the campaign deadline has passed and the pledge is locked.', card: 'Says the supporter can still update their payment method.' },
  failed: { failed: 'Says payment failed.', recovery: 'Asks the supporter to update their payment method to complete the pledge.' },
  charged: { charged: 'Confirms payment was successfully charged, rather than merely saving a pledge.' },
  cancelled: { cancelled: 'Confirms the pledge was cancelled and will not be charged.' },
  modified: { updated: 'Confirms the pledge was updated.', conditional: 'Says charging depends on the campaign reaching its funding goal.' }
};

function visibleText(element) {
  assert.ok(element, 'Expected rendered element');
  const copy = element.cloneNode(true);
  copy.querySelectorAll('[hidden],script,style,.pledge-countdown').forEach((node) => node.remove());
  return copy.textContent.replace(/\s+/g, ' ').trim();
}

function pageDom(siteDirectory, route) {
  return new JSDOM(fs.readFileSync(path.join(siteDirectory, route, 'index.html'), 'utf8'), {
    url: `https://pool.test/${route}/?t=synthetic-token&orderId=pool-intent-synthetic`, runScripts: 'outside-only'
  });
}

function runScript(dom, name) {
  dom.window.eval(fs.readFileSync(path.join(ROOT, 'assets/js', name), 'utf8'));
}

async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Synthetic browser render did not complete');
}

export async function captureCheckout(siteDirectory, lang, persisted) {
  const dom = pageDom(siteDirectory, `${lang === 'es' ? 'es/' : ''}pledge-success`);
  try {
    let calls = 0;
    dom.window.AbortSignal = AbortSignal;
    dom.window.fetch = async (url) => {
      assert.equal(new URL(url).pathname, '/checkout-intent/summary');
      calls++;
      return new Response(JSON.stringify({ persisted }));
    };
    runScript(dom, 'pledge-result.js');
    await until(() => calls === 1 && !dom.window.document.querySelector('[data-pledge-confirmation-retry]').disabled);
    const panel = dom.window.document.querySelector('[data-pledge-confirmation]');
    const saved = dom.window.document.querySelector('[data-pledge-confirmed]');
    assert.equal(panel.hidden, persisted);
    assert.equal(saved.hidden, !persisted);
    return { id: `checkout-${persisted ? 'saved' : 'pending'}-${lang}`, lang,
      candidate: visibleText(persisted ? saved : panel), requirements: REQUIREMENTS[persisted ? 'saved' : 'pending'] };
  } finally { dom.window.close(); }
}

export async function captureManage(siteDirectory, lang, state) {
  const dom = pageDom(siteDirectory, `${lang === 'es' ? 'es/' : ''}manage`);
  try {
    runScript(dom, 'pool-config.js');
    dom.window.POOL_CONFIG.addOns = { enabled: false, products: [] };
    dom.window.POOL_CONFIG.platform.workerUrl = 'https://worker.test';
    const campaign = { slug: 'synthetic-film', title: 'Synthetic Film', state: state === 'active' ? 'live' : 'post',
      goal_amount: 2500, pledged_amount: 10, goal_deadline: '2099-12-31', tiers: [{ id: 'digital', name: 'Digital reward', price: 35, category: 'digital' }], support_items: [] };
    const pledge = { orderId: 'pool-intent-synthetic', email: 'supporter@example.com', campaignSlug: campaign.slug,
      pledgeStatus: { active: 'active', locked: 'active', failed: 'payment_failed', charged: 'charged', cancelled: 'cancelled' }[state],
      subtotal: 3500, tax: 276, shipping: 300, tipAmount: 210, tipPercent: 6, amount: 4286,
      tierId: 'digital', tierName: 'Digital reward', tierQty: 1, supportItems: [], customAmount: 0,
      canModify: state === 'active', canCancel: state === 'active', canUpdatePaymentMethod: true, deadlinePassed: state !== 'active' };
    const unexpected = [];
    dom.window.fetch = async (input) => {
      const url = new URL(input, 'https://worker.test');
      let value;
      if (url.pathname === '/api/campaigns.json') value = { campaigns: [campaign] };
      else if (url.pathname === '/pledges') value = [pledge];
      else if (url.pathname === '/live/synthetic-film') value = { stats: { state: campaign.state, pledgedAmount: 3500 }, inventory: { tiers: {} } };
      else if (url.pathname === '/add-ons/inventory') value = { products: {} };
      else { unexpected.push(url.pathname); throw new Error('Unexpected synthetic fetch'); }
      return new Response(JSON.stringify(value));
    };
    runScript(dom, 'manage-page.js');
    await until(() => dom.window.document.querySelector('.pledge-card'));
    assert.deepEqual(unexpected, []);
    const card = dom.window.document.querySelector('.pledge-card');
    assert.equal(!!card.querySelector('[data-action="save"]'), state === 'active');
    assert.equal(!!card.querySelector('[data-action="cancel"]'), state === 'active');
    return { id: `manage-${state}-${lang}`, lang, candidate: visibleText(card), requirements: REQUIREMENTS[state] };
  } finally { dom.window.close(); }
}

export async function captureEmails(catalog, lang) {
  const env = { POOL_EMAIL_CAPTURE_PAYLOAD: 'true', POOL_EMAIL_DRY_RUN: 'true', I18N_CATALOG: catalog,
    SITE_BASE: 'https://pool.test', PLATFORM_NAME: 'The Pool', PLATFORM_COMPANY_NAME: 'Dust Wave',
    SUPPORT_EMAIL: 'support@example.com', PLEDGES_EMAIL_FROM: 'The Pool <pledges@example.com>' };
  const values = { email: 'supporter@example.com', campaignSlug: 'synthetic-film', campaignTitle: 'Synthetic Film',
    subtotal: 3500, newSubtotal: 3500, previousSubtotal: 3000, previousTax: 276, previousShipping: 300, previousTipAmount: 210,
    tax: 276, shipping: 300, tipAmount: 210, tipPercent: 6, amount: 4286, token: 'synthetic-token', preferredLang: lang, hasDecisions: false };
  const cases = [];
  for (const [state, send] of Object.entries({ saved: sendSupporterEmail, modified: sendPledgeModifiedEmail, cancelled: sendPledgeCancelledEmail, failed: sendPaymentFailedEmail, charged: sendChargeSuccessEmail })) {
    const result = await send(env, values);
    assert.equal(result.captured, true);
    const payload = result.payload;
    assert.ok(payload.html && payload.text);
    assert.ok(payload.text.includes('$42.86'), 'Canonical fixture total must survive email rendering');
    const dom = new JSDOM(payload.html);
    try {
      for (const [format, body] of [['html', visibleText(dom.window.document.body)], ['text', payload.text]]) {
        // URLs are unnecessary to the semantic question. Routing stays an exact check.
        const candidate = `${payload.subject}\n${body}`.replace(/https?:\/\/[^\s<>]+/g, '[link]');
        cases.push({ id: `email-${state}-${format}-${lang}`, lang, candidate,
          requirements: state === 'saved' ? { conditional: REQUIREMENTS.saved.conditional } : REQUIREMENTS[state] });
      }
      if (state !== 'cancelled') assert.ok(payload.html.includes(`${lang === 'es' ? '/es' : ''}/manage/?t=synthetic-token`));
    } finally { dom.window.close(); }
  }
  return cases;
}

export async function capturePoolCases(siteDirectory) {
  const catalog = JSON.parse(fs.readFileSync(path.join(siteDirectory, 'assets/i18n.json'), 'utf8'));
  const cases = [];
  for (const lang of ['en', 'es']) {
    for (const persisted of [false, true]) cases.push(await captureCheckout(siteDirectory, lang, persisted));
    for (const state of ['active', 'locked', 'failed', 'charged', 'cancelled']) cases.push(await captureManage(siteDirectory, lang, state));
    cases.push(...await captureEmails(catalog, lang));
  }
  return cases;
}
