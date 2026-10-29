import { test, expect, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import worker from '../../worker/src/index.js';
import { checkAddressConsistency } from '../../worker/src/address-consistency.js';
import { isValidEmail } from '../../worker/src/validation.js';

async function checkout(page: Page, physical = false, releaseWorker = '', holdInitialization = false) {
  const starts: any[] = [];
  const abandoned: string[] = [];
  let failAbandon = false;
  let failStart = false;
  let releaseStart: (() => void) | undefined;
  let holdStart: Promise<void> | undefined;
  let releaseQuotes: (() => void) | undefined;
  let holdQuotes: Promise<void> | undefined;
  const heldQuotes: string[] = [];
  await page.addInitScript(({ holdInitialization }) => {
    (window as any).__mounts = [];
    (window as any).__initializations = [];
    (window as any).__paymentReadyCallbacks = [];
    (window as any).__paymentErrorCallbacks = [];
    (window as any).__confirmations = 0;
    if (holdInitialization) (window as any).__holdInitialization = new Promise(resolve => { (window as any).__releaseInitialization = resolve; });
    (window as any).Stripe = () => ({
      // Pool must continue using Checkout Session setup, never Store's PaymentIntent path.
      initCheckout: async ({ clientSecret }: any) => {
        (window as any).__initializations.push(clientSecret);
        let sessionId = '';
        Promise.resolve(clientSecret).then(value => { sessionId = value; });
        await (window as any).__holdInitialization;
        return ({
        loadActions: async () => {
          await clientSecret;
          await (window as any).__holdActions;
          return { type: 'success', actions: {
          getSession: () => ({ id: sessionId }),
          updateEmail: async () => ({ type: 'success' }),
          updateShippingAddress: async () => ({ type: 'success' }),
          confirm: async () => { (window as any).__confirmations++; return { type: 'success' }; }
        } }; },
        createPaymentElement: () => {
          if ((window as any).__failMount) throw new Error('Setup failed to mount');
          let ready: (() => void) | undefined;
          let loadError: ((event: any) => void) | undefined;
          return {
            on: (event: string, handler: () => void) => {
              if (event === 'ready') ready = handler;
              if (event === 'loaderror') loadError = handler;
            },
            mount: (node: HTMLElement) => {
              (window as any).__mounts.push(sessionId);
              node.innerHTML = '<div data-test-payment-loading></div>';
              const finish = () => {
                node.innerHTML = '<div style="height:180px" data-test-payment>Card setup</div>';
                ready?.();
              };
              (window as any).__paymentReadyCallbacks.push(finish);
              (window as any).__paymentErrorCallbacks.push(() => loadError?.({ error: { message: 'Payment fields failed to load' } }));
              if (!(window as any).__holdPaymentReady) setTimeout(finish, 20);
            },
            unmount() {}
          };
        },
        on: (event: string, handler: any) => { if (event === 'change') handler({ session: { canConfirm: true } }); }
      }); }
    });
  }, { holdInitialization });
  await page.route('**/address/check', route => {
    const data = route.request().postDataJSON();
    return route.fulfill({ json: { billing: checkAddressConsistency(data.billing), shipping: checkAddressConsistency(data.shipping) } });
  });
  await page.route('**/tax/quote', async route => {
    const data = route.request().postDataJSON();
    if (holdQuotes) heldQuotes.push(`tax:${JSON.stringify(data)}`);
    await holdQuotes;
    const zip = (data.shippingAddress || data.billingAddress)?.postalCode;
    return route.fulfill({ json: { taxCents: zip === '10467' ? 89 : 76, taxDetails: { effectiveRate: zip === '10467' ? 0.08875 : 0.07563, estimated: true, coverage: 'zip_local' } } });
  });
  await page.route('**/shipping/quote', async route => {
    const data = route.request().postDataJSON();
    if (holdQuotes) heldQuotes.push(`shipping:${JSON.stringify(data)}`);
    await holdQuotes;
    const shippingCents = data.shippingAddress?.postalCode === '10467' ? 900 : 300;
    return route.fulfill({ json: { totalShippingCents: shippingCents, quotes: [{
      shippingCents, source: 'usps_live', selectedOption: 'standard', defaultOption: 'standard',
      availableOptions: [
        { id: 'standard', priceDeltaCents: 0, shippingCents },
        { id: 'signature_required', priceDeltaCents: 395, shippingCents: shippingCents + 395 }
      ]
    }] } });
  });
  await page.route('**/checkout-intent/start', async route => {
    const data = route.request().postDataJSON();
    starts.push(data);
    const sequence = starts.length;
    if (!isValidEmail(data.email)) return route.fulfill({ status: 400, json: { error: 'Invalid email format' } });
    if (failStart) return route.fulfill({ status: 503, json: { error: 'Temporary setup failure' } });
    await holdStart;
    await route.fulfill({ json: { checkoutUiMode: 'custom', sessionId: `cs_test_${sequence}`, clientSecret: `cs_test_secret_${sequence}`, publishableKey: 'pk_test_fixture', orderId: `pool-intent-${sequence}` } });
  });
  if (!releaseWorker) await page.route('**/checkout-intent/abandon', route => {
    abandoned.push(route.request().postDataJSON().orderId);
    return route.fulfill({ status: failAbandon ? 503 : 200, json: failAbandon ? { error: 'Release unavailable' } : { success: true } });
  });
  if (releaseWorker) await page.route('**/campaigns/smoke-editable/', async route => {
    const response = await route.fetch();
    // Permit the ephemeral test Worker without disabling CSP or browser CORS.
    const body = (await response.text()).replace("connect-src 'self'", `connect-src 'self' ${releaseWorker}`);
    await route.fulfill({ response, body });
  });
  if (releaseWorker) await page.route('**/add-ons/inventory', route => route.fulfill({ json: { products: {} } }));
  await page.goto('/campaigns/smoke-editable/', { waitUntil: 'domcontentloaded' });
  if (releaseWorker) await page.evaluate(base => {
    (window as any).POOL_CONFIG.workerBase = base;
    (window as any).POOL_CONFIG.platform.workerUrl = base;
  }, releaseWorker);
  await page.evaluate(async physical => {
    await (window as any).PoolCartRuntime.load('checkout-edit-regression');
    (window as any).POOL_CONFIG.stripePublishableKey = 'pk_test_fixture';
    const client = (window as any).PoolCartProvider.getApi();
    await client.api.cart.items.add({ id: 'smoke-editable__test-tier', name: 'Test tier', price: 10, quantity: 1, url: '/campaigns/smoke-editable/', shippable: physical, customFields: [{ name: '_category', value: physical ? 'physical' : 'digital' }] });
    await client.api.theme.cart.open();
    await client.api.theme.cart.navigate('/checkout');
  }, physical);
  const cart = page.locator('[data-pool-cart-root]');
  const attribute = physical ? 'data-cart-custom-shipping-field' : 'data-cart-tax-destination-field';
  const field = (name: string) => cart.locator(`[${attribute}="${name}"]`);
  const email = cart.locator('[data-cart-custom-checkout-email]');
  const body = cart.locator('.pool-first-party-cart__body');
  async function fillAddress() {
    if (physical) await field('name').fill('Test Supporter');
    await field('postal_code').fill('87048');
    await field('line1').fill('123 Test Street');
    await field('city').fill('Corrales');
    await field('state').fill('NM');
  }
  return { cart, field, email, body, starts, abandoned, fillAddress, heldQuotes,
    holdEstimates: () => { holdQuotes = new Promise<void>(resolve => { releaseQuotes = resolve; }); },
    releaseEstimates: () => { holdQuotes = undefined; releaseQuotes?.(); },
    failRelease: (value = true) => { failAbandon = value; },
    failPreparation: (value: boolean) => { failStart = value; },
    holdPreparation: () => { holdStart = new Promise<void>(resolve => { releaseStart = resolve; }); },
    releasePreparation: () => { holdStart = undefined; releaseStart?.(); }
  };
}

test('checkout SDK warms before details are complete without preparing or mounting a payment', async ({ page }) => {
  const c = await checkout(page);
  await expect.poll(() => page.evaluate(() => (window as any).__initializations.length)).toBe(1);
  expect(c.starts).toHaveLength(0);
  expect(await page.evaluate(() => (window as any).__mounts.length)).toBe(0);
  await c.email.fill('unfinished@');
  await c.field('postal_code').fill('870');
  await c.email.blur();
  expect(c.starts).toHaveLength(0);
  await c.fillAddress();
  await c.email.fill('supporter@example.com');
  await expect(c.cart.locator('[data-cart-confirm-custom-checkout]')).toBeEnabled();
  expect(c.starts).toHaveLength(1);
  expect(await page.evaluate(() => (window as any).__initializations.length)).toBe(1);
});

test('cart ZIP changed at checkout waits for visible payment fields before enabling Save', async ({ page }) => {
  const c = await checkout(page, true);
  await c.cart.locator('[data-cart-back]').click();
  await c.cart.locator('[data-cart-estimate-postal]').fill('90210');
  await expect(c.cart.locator('[data-cart-summary-shipping]')).toHaveText('$3.00');
  await c.cart.locator('[data-cart-continue]').click();
  await expect(c.field('postal_code')).toHaveValue('90210');
  await page.evaluate(() => { (window as any).__holdPaymentReady = true; });
  await c.fillAddress();
  await c.email.fill('supporter@example.com');
  await expect.poll(() => page.evaluate(() => (window as any).__mounts.length)).toBe(1);
  await expect(c.cart.locator('[data-cart-checkout-summary-tax]')).toHaveText('$0.76');
  await expect(c.cart.locator('[data-cart-checkout-summary-shipping]')).toHaveText('$3.00');
  const confirm = c.cart.locator('[data-cart-confirm-custom-checkout]');
  await expect(confirm).toBeDisabled();
  await expect(confirm).toHaveText('Loading secure payment...');
  await expect(c.cart.locator('[data-cart-payment-loading]')).toBeVisible();
  await expect(c.cart.locator('[data-test-payment]')).toHaveCount(0);
  await page.evaluate(() => (window as any).__paymentReadyCallbacks[0]());
  await expect(c.cart.locator('[data-test-payment]')).toBeVisible();
  await expect(c.cart.locator('[data-cart-payment-loading]')).toBeHidden();
  await expect(confirm).toBeEnabled();
  await expect(confirm).toHaveText('Save payment method');
  expect(c.starts).toHaveLength(1);
  expect(c.starts[0].shippingAddress).toMatchObject({ postalCode: '87048', state: 'NM' });
});

test('a checkout update does not restart Stripe while initialization leaves its container empty', async ({ page }) => {
  const c = await checkout(page, false, '', true);
  await c.fillAddress();
  await c.email.fill('supporter@example.com');
  await expect.poll(() => page.evaluate(() => (window as any).__initializations.length)).toBe(1);
  // A normal store notification must preserve an in-progress Stripe mount.
  await page.evaluate(async () => { await (window as any).PoolCartProvider.getApi().api.cart.update({}); });
  await page.evaluate(() => (window as any).__releaseInitialization());
  await expect(c.cart.locator('[data-test-payment]')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__initializations.length)).toBe(1);
  expect(c.starts).toHaveLength(1);
});

test('payment fields render during session loading but Save waits for the session actions', async ({ page }) => {
  const c = await checkout(page);
  await page.evaluate(() => {
    (window as any).__holdActions = new Promise(resolve => { (window as any).__releaseActions = resolve; });
  });
  await c.fillAddress();
  await c.email.fill('supporter@example.com');
  await expect(c.cart.locator('[data-test-payment]')).toBeVisible();
  const confirm = c.cart.locator('[data-cart-confirm-custom-checkout]');
  await expect(confirm).toBeDisabled();
  await expect(confirm).toHaveText('Loading secure payment...');
  await page.evaluate(async () => { await (window as any).PoolCartProvider.getApi().api.cart.update({}); });
  expect(await page.evaluate(() => (window as any).__initializations.length)).toBe(1);
  await page.evaluate(() => (window as any).__releaseActions());
  await expect(confirm).toBeEnabled();
  expect(c.starts).toHaveLength(1);
});

test('late ready and error events from an old ZIP cannot enable or fail its replacement', async ({ page }) => {
  const c = await checkout(page);
  await page.evaluate(() => { (window as any).__holdPaymentReady = true; });
  await c.fillAddress();
  await c.email.fill('supporter@example.com');
  await expect.poll(() => page.evaluate(() => (window as any).__mounts.length)).toBe(1);
  await c.field('postal_code').fill('10467');
  await c.field('state').fill('NY');
  await expect.poll(() => page.evaluate(() => (window as any).__mounts.length)).toBe(2);
  await page.evaluate(() => {
    (window as any).__paymentReadyCallbacks[0]();
    (window as any).__paymentErrorCallbacks[0]();
  });
  const confirm = c.cart.locator('[data-cart-confirm-custom-checkout]');
  await expect(confirm).toBeDisabled();
  await expect(c.cart.locator('[data-cart-payment-loading]')).toBeVisible();
  await expect(c.cart.locator('[data-cart-checkout-error]')).toBeHidden();
  await page.evaluate(() => (window as any).__paymentReadyCallbacks[1]());
  await expect(confirm).toBeEnabled();
  expect(c.abandoned).toEqual(['pool-intent-1']);
});

test('late session actions after a ZIP edit cannot replace the current payment fields', async ({ page }) => {
  const c = await checkout(page);
  await page.evaluate(() => {
    (window as any).__holdActions = new Promise(resolve => { (window as any).__releaseActions = resolve; });
  });
  await c.fillAddress();
  await c.email.fill('supporter@example.com');
  await expect(c.cart.locator('[data-test-payment]')).toBeVisible();
  await expect(c.cart.locator('[data-cart-confirm-custom-checkout]')).toBeDisabled();
  await page.evaluate(() => { (window as any).__holdActions = undefined; });
  await c.field('postal_code').fill('10467');
  await c.field('state').fill('NY');
  await expect(c.cart.locator('[data-cart-confirm-custom-checkout]')).toBeEnabled();
  await page.evaluate(() => (window as any).__releaseActions());
  await expect(c.cart.locator('[data-test-payment]')).toBeVisible();
  await expect(c.cart.locator('[data-cart-confirm-custom-checkout]')).toBeEnabled();
  await expect(c.cart.locator('[data-cart-checkout-error]')).toBeHidden();
  expect(await page.evaluate(() => (window as any).__initializations.length)).toBe(2);
  expect(c.abandoned).toEqual(['pool-intent-1']);
});

test('a payment element load failure offers retry without enabling an empty payment form', async ({ page }) => {
  const c = await checkout(page);
  await page.evaluate(() => { (window as any).__holdPaymentReady = true; });
  await c.fillAddress();
  await c.email.fill('supporter@example.com');
  await expect.poll(() => page.evaluate(() => (window as any).__mounts.length)).toBe(1);
  await page.evaluate(() => (window as any).__paymentErrorCallbacks[0]());
  await expect(c.cart.locator('[data-cart-checkout-error]')).toContainText('Payment fields failed to load');
  const retry = c.cart.getByRole('button', { name: 'Retry loading payment' });
  await expect(retry).toBeEnabled();
  await page.evaluate(() => {
    (window as any).__paymentReadyCallbacks[0]();
    (window as any).__holdPaymentReady = false;
  });
  await expect(c.cart.locator('[data-test-payment]')).toHaveCount(0);
  expect(c.abandoned).toEqual(['pool-intent-1']);
  await retry.click();
  await expect(c.cart.locator('[data-test-payment]')).toBeVisible();
  await expect(c.cart.locator('[data-cart-confirm-custom-checkout]')).toBeEnabled();
});

for (const physical of [false, true]) {
  test(`${physical ? 'shipping' : 'billing'}: slow estimates do not delay replacement payment fields`, async ({ page }) => {
    const c = await checkout(page, physical);
    await c.fillAddress();
    await c.email.fill('supporter@example.com');
    const confirm = c.cart.locator('[data-cart-confirm-custom-checkout]');
    await expect(confirm).toBeEnabled();
    c.holdEstimates();
    try {
      await c.field('postal_code').fill('10467');
      await c.field('state').fill('NY');
      await c.field('state').blur();
      await expect.poll(() => c.heldQuotes.length).toBeGreaterThan(0);
      // The preview requests remain pending. Canonical preparation and Stripe
      // mounting must run independently, after releasing the old reservation.
      await expect.poll(() => c.starts.length, { timeout: 3000 }).toBe(2);
      await expect(c.cart.locator('[data-test-payment]')).toHaveCount(1);
      expect(c.abandoned).toEqual(['pool-intent-1']);
      await expect(confirm).toBeDisabled();
      expect(new Set(c.heldQuotes).size).toBe(c.heldQuotes.length);
      expect(c.starts[1][physical ? 'shippingAddress' : 'billingAddress']).toMatchObject({ postalCode: '10467', state: 'NY' });
      await expect(c.field('line1')).toHaveValue('123 Test Street');
      expect(await page.evaluate(() => (window as any).__confirmations)).toBe(0);
    } finally {
      c.releaseEstimates();
    }
    await expect(c.cart.locator('[data-cart-checkout-summary-tax]')).toHaveText('$0.89');
    if (physical) await expect(c.cart.locator('[data-cart-checkout-summary-shipping]')).toHaveText('$9.00');
    await expect(confirm).toBeEnabled();
    expect(c.starts).toHaveLength(2);
  });
}

test('an older slow tax preview cannot overwrite a newer ZIP/state or block its payment', async ({ page }) => {
  const c = await checkout(page);
  await c.fillAddress();
  await c.email.fill('supporter@example.com');
  const confirm = c.cart.locator('[data-cart-confirm-custom-checkout]');
  await expect(confirm).toBeEnabled();
  let releaseOldQuote!: () => void;
  let oldResponse: ReturnType<Page['waitForResponse']> | undefined;
  const oldQuote = new Promise<void>(resolve => { releaseOldQuote = resolve; });
  await page.route('**/tax/quote', async route => {
    if (route.request().postDataJSON().billingAddress?.postalCode === '10467') await oldQuote;
    await route.fallback();
  });
  try {
    await c.field('postal_code').fill('10467');
    await c.field('state').fill('NY');
    await expect.poll(() => c.starts.length).toBe(2);
    await expect(c.cart.locator('[data-test-payment]')).toHaveCount(1);
    await expect(confirm).toBeDisabled();

    await c.field('postal_code').fill('90012');
    await c.field('state').fill('CA');
    await c.field('state').blur();
    await expect.poll(() => c.starts.length).toBe(3);
    await expect(confirm).toBeEnabled();
    // This fixture returns 76 cents for the newest ZIP; the held NY response is 89.
    await expect(c.cart.locator('[data-cart-checkout-summary-tax]')).toHaveText('$0.76');
    oldResponse = page.waitForResponse(response => response.url().endsWith('/tax/quote') &&
      response.request().postDataJSON().billingAddress?.postalCode === '10467');
  } finally {
    releaseOldQuote();
  }
  await (await oldResponse!).finished();
  await page.waitForLoadState('networkidle');
  await expect(c.cart.locator('[data-cart-checkout-summary-tax]')).toHaveText('$0.76');
  await expect(confirm).toBeEnabled();
  expect(c.starts.at(-1).billingAddress).toMatchObject({ postalCode: '90012', state: 'CA' });
  expect(await page.evaluate(() => (window as any).__confirmations)).toBe(0);
});

for (const physical of [false, true]) for (const width of [1280, 390]) {
  test(`${physical ? 'shipping' : 'billing'} ${width}: edits preserve fields and scroll, refresh setup and tax`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const c = await checkout(page, physical);
    if (width === 390) {
      for (const input of [c.email, c.field('postal_code'), c.field('country')]) {
        expect(await input.evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
      }
    }
    const consent = c.cart.locator('[data-cart-abandoned-consent]').locator('..');
    const consentBox = await consent.boundingBox();
    const textBox = await consent.locator('span').boundingBox();
    expect(consentBox!.width).toBeGreaterThan(200);
    expect(textBox!.x + textBox!.width).toBeLessThanOrEqual(consentBox!.x + consentBox!.width + 1);
    expect(textBox!.y + textBox!.height).toBeLessThanOrEqual(consentBox!.y + consentBox!.height + 1);
    await c.fillAddress();
    const original = await c.field('line1').elementHandle();
    await c.email.fill('supporter@example.com');
    await expect(c.cart.locator('[data-test-payment]')).toBeVisible();
    await expect(c.cart.locator('[data-cart-confirm-custom-checkout]')).toBeEnabled();
    if (physical) {
      await expect(c.cart.locator('[data-cart-checkout-summary-shipping]')).toHaveText('$3.00');
      await expect(c.cart.locator('[data-cart-custom-shipping-option]')).toHaveValue('standard');
    }
    const payment = c.cart.locator('[data-cart-payment-slot]');
    await expect.poll(async () => {
      const box = await payment.boundingBox(); const scroll = await c.body.boundingBox();
      return box!.y >= scroll!.y && box!.y < scroll!.y + scroll!.height;
    }).toBe(true);
    await c.field('postal_code').fill('10467');
    const before = await c.body.evaluate(node => node.scrollTop);
    await expect(c.cart.locator('[data-cart-state-conflict]:visible')).toContainText('NY');
    await expect(c.cart.locator('[data-test-payment]')).toHaveCount(0);
    await expect(c.field('line1')).toBeVisible();
    expect(await c.body.evaluate(node => node.scrollTop)).toBeCloseTo(before, 0);
    expect(await original!.evaluate(node => node.isConnected)).toBe(true);
    await c.field('state').fill('NY');
    await expect(c.cart.locator('[data-cart-state-conflict]:visible')).toHaveCount(0);
    await expect(c.cart.locator('[data-cart-city-suggestion]:visible')).toContainText('Bronx');
    await c.cart.locator('[data-cart-use-city]:visible').click();
    await expect(c.field('city')).toHaveValue('Bronx');
    const afterCity = await c.body.evaluate(node => node.scrollTop);
    await expect(c.cart.locator('[data-test-payment]')).toHaveCount(1);
    await expect(c.cart.locator('[data-cart-checkout-summary-tax]')).toHaveText('$0.89');
    if (physical) {
      await expect(c.cart.locator('[data-cart-checkout-summary-shipping]')).toHaveText('$9.00');
      await expect(c.cart.locator('[data-cart-checkout-summary-total]')).toHaveText('$20.39');
    }
    expect(await c.body.evaluate(node => node.scrollTop)).toBeCloseTo(afterCity, 0);
    await c.email.fill('updated@example');
    await expect(c.cart.locator('[data-test-payment]')).toHaveCount(0);
    await expect.poll(() => c.abandoned.length).toBeGreaterThan(0);
    const prepared = c.starts.length;
    await page.waitForTimeout(700);
    expect(c.starts).toHaveLength(prepared);
    await c.email.fill('updated@example.com');
    await expect(c.cart.locator('[data-test-payment]')).toHaveCount(1);
    expect(c.starts.at(-1).email).toBe('updated@example.com');
    expect(await original!.evaluate(node => node.isConnected)).toBe(true);
    expect(await page.evaluate(() => (window as any).__confirmations)).toBe(0);
    expect(c.starts.every(item => isValidEmail(item.email))).toBe(true);
    await c.cart.screenshot({ path: test.info().outputPath('edited-checkout.png') });
  });
}

test('ZIP/state edits release setup through the real cross-origin Worker response', async ({ page, baseURL }) => {
  const released: string[] = [];
  const rateLimits = new Map();
  const origin = new URL(baseURL!).origin;
  await page.context().grantPermissions(['local-network-access'], { origin });
  // Mocked responses do not exercise the Worker's CORS headers.
  // Only the release route uses this server; no Stripe calls or pledges are made.
  const server = createServer(async (incoming, outgoing) => {
    try {
      let body = '';
      for await (const chunk of incoming) body += chunk;
      if (incoming.method === 'POST') released.push(JSON.parse(body).orderId);
      const response = await worker.fetch(new Request(`http://worker.test${incoming.url}`, {
        method: incoming.method,
        headers: incoming.headers as Record<string, string>,
        ...(body ? { body } : {})
      }), {
        APP_MODE: 'test', CORS_ALLOWED_ORIGIN: origin,
        RATELIMIT: { get: async (key: string) => JSON.parse(rateLimits.get(key) || 'null'), put: async (key: string, value: string) => { rateLimits.set(key, value); } }
      }, { waitUntil: () => {} });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(await response.text());
    } catch {
      outgoing.writeHead(500).end();
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const c = await checkout(page, true, `http://127.0.0.1:${port}`);
    await c.fillAddress();
    await c.email.fill('supporter@example.com');
    await expect(c.cart.locator('[data-test-payment]')).toHaveCount(1);
    const original = await c.field('line1').elementHandle();
    await c.field('postal_code').fill('10467');
    const before = await c.body.evaluate(node => node.scrollTop);
    await expect(c.cart.locator('[data-cart-state-conflict]:visible')).toContainText('NY');
    await expect.poll(() => released.length).toBe(1);
    await c.field('state').fill('NY');
    await expect.poll(() => c.starts.length).toBe(2);
    await expect(c.cart.locator('[data-test-payment]')).toHaveCount(1);
    await expect(c.cart.locator('[data-cart-checkout-error]:visible')).toHaveCount(0);
    expect(await original!.evaluate(node => node.isConnected)).toBe(true);
    expect(await c.body.evaluate(node => node.scrollTop)).toBeCloseTo(before, 0);
    expect(released).toEqual(['pool-intent-1']);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

for (const width of [1280, 390, 320]) test(`shipping prices stay visible beside delivery choices in cart and checkout at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 700 });
  const c = await checkout(page, true);
  await c.fillAddress();
  const select = c.cart.locator('[data-cart-custom-shipping-option]');
  const amount = c.cart.locator('[data-cart-checkout-summary-shipping]');
  async function checkSummaryLayout(amountField: typeof amount, name: string) {
    const rows = await amountField.evaluate(node => {
      const summary = node.closest('.pool-first-party-cart__summary-row')!.parentElement!;
      return Array.from(summary.querySelectorAll<HTMLElement>('.pool-first-party-cart__summary-row'))
        .filter(row => !row.hidden)
        .map(row => {
          const label = row.querySelector('span')!.getBoundingClientRect();
          const price = row.querySelector('strong')!.getBoundingClientRect();
          return { right: price.right, priceY: price.y, labelY: label.y, labelBottom: label.bottom };
        });
    });
    expect(rows.length).toBeGreaterThanOrEqual(4);
    for (const row of rows) {
      expect(row.right).toBeCloseTo(rows[0].right, 0);
      expect(row.priceY).toBeGreaterThanOrEqual(row.labelY - 1);
      expect(row.priceY).toBeLessThan(row.labelBottom);
    }
    // Measure together so payment auto-scroll cannot move the row between reads.
    const { choice, price } = await amountField.evaluate(node => ({
      choice: node.closest('.pool-first-party-cart__summary-row')!
        .querySelector('[data-cart-custom-shipping-option]')!.getBoundingClientRect().toJSON(),
      price: node.getBoundingClientRect().toJSON()
    }));
    expect(choice!.width).toBeLessThanOrEqual(192);
    expect(choice!.height).toBeGreaterThanOrEqual(44);
    if (width < 724) {
      expect(choice!.y).toBeGreaterThanOrEqual(price!.y + price!.height);
      expect(await select.evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
    } else {
      expect(price!.x).toBeGreaterThan(choice!.x + choice!.width);
      expect(price!.y + price!.height / 2).toBeCloseTo(choice!.y + choice!.height / 2, 0);
    }
    const summary = c.cart.locator('.pool-first-party-cart__checkout-summary')
      .filter({ has: page.locator(name === 'checkout' ? '[data-cart-checkout-summary-shipping]' : '[data-cart-summary-shipping]') });
    await summary.screenshot({ path: test.info().outputPath(`${name}-summary.png`) });
  }
  await expect(amount).toHaveText('$3.00');
  await select.selectOption('signature_required');
  await expect(amount).toHaveText('$6.95');
  await c.email.fill('supporter@example.com');
  await expect(c.cart.locator('[data-test-payment]')).toHaveCount(1);
  expect(c.starts.at(-1).shippingOption).toBe('signature_required');
  await expect(c.cart.locator('[data-cart-checkout-summary-total]')).toHaveText('$18.21');
  await checkSummaryLayout(amount, 'checkout');
  await c.cart.locator('[data-cart-back]').click();
  const cartAmount = c.cart.locator('[data-cart-summary-shipping]');
  await expect(cartAmount).toHaveText('$3.00');
  const cartTotal = c.cart.locator('[data-cart-summary-total]');
  const standardTotal = await cartTotal.innerText();
  await select.selectOption('signature_required');
  await expect(cartAmount).toHaveText('$6.95');
  await expect(cartTotal).toHaveText(`$${(Number(standardTotal.replace('$', '')) + 3.95).toFixed(2)}`);
  await select.selectOption('standard');
  await expect(cartAmount).toHaveText('$3.00');
  await expect(cartTotal).toHaveText(standardTotal);
  await checkSummaryLayout(cartAmount, 'cart');
  const row = c.cart.locator('[data-cart-summary-shipping-row]');
  const rowBox = await row.boundingBox();
  const amountBox = await cartAmount.boundingBox();
  expect(amountBox!.x + amountBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 1);
  await row.screenshot({ path: test.info().outputPath('shipping-price.png') });
});

test('edits during preparation discard the obsolete setup and do not mount it', async ({ page }) => {
  const c = await checkout(page);
  c.holdPreparation();
  await c.fillAddress();
  await c.email.fill('old@example.com');
  await expect.poll(() => c.starts.length).toBe(1);
  await c.email.fill('new@example.com');
  c.releasePreparation();
  await expect(c.cart.locator('[data-test-payment]')).toHaveCount(1);
  expect(c.abandoned).toEqual(['pool-intent-1']);
  expect(c.starts.at(-1).email).toBe('new@example.com');
  expect(await page.evaluate(() => (window as any).__mounts)).toEqual(['cs_test_secret_2']);
});

test('failed setup can be retried; failed release blocks another setup', async ({ page }) => {
  const c = await checkout(page);
  c.failPreparation(true);
  await c.fillAddress();
  await c.email.fill('supporter@example.com');
  const retry = c.cart.getByRole('button', { name: 'Retry loading payment' });
  await expect(retry).toBeEnabled();
  c.failPreparation(false);
  await retry.click();
  await expect(c.cart.locator('[data-test-payment]')).toHaveCount(1);
  c.failRelease();
  await c.email.fill('new@example.com');
  await expect(c.cart.locator('[data-cart-checkout-error]')).toContainText('We could not refresh checkout');
  const count = c.starts.length;
  await page.waitForTimeout(700);
  expect(c.starts).toHaveLength(count);
  await expect(c.cart.locator('[data-cart-confirm-custom-checkout]')).toHaveCount(0);
  c.failRelease(false);
  await retry.click();
  await expect(c.cart.locator('[data-test-payment]')).toHaveCount(1);
  expect(c.starts.at(-1).email).toBe('new@example.com');
});


test('a failed Stripe mount releases its reservation and offers one explicit retry', async ({ page }) => {
  const c = await checkout(page);
  await page.evaluate(() => { (window as any).__failMount = true; });
  await c.fillAddress();
  await c.email.fill('supporter@example.com');
  const retry = c.cart.getByRole('button', { name: 'Retry loading payment' });
  await expect(retry).toBeEnabled();
  await expect(c.cart.locator('[data-cart-checkout-error]')).toContainText('Setup failed to mount');
  expect(c.abandoned).toEqual(['pool-intent-1']);
  await page.waitForTimeout(500);
  expect(c.starts).toHaveLength(1);
  await page.evaluate(() => { (window as any).__failMount = false; });
  await retry.click();
  await expect(c.cart.locator('[data-test-payment]')).toHaveCount(1);
});


test('autofill overlays remain interactive while the Pool page is locked', async ({ page }) => {
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    const host = document.createElement('autofill-fixture');
    host.style.cssText = 'position:fixed;top:100px;left:20px;z-index:2147483647';
    const button = document.createElement('button');
    button.textContent = 'Fill test details';
    button.addEventListener('click', () => {
      const email = document.querySelector<HTMLInputElement>('[data-cart-custom-checkout-email]')!;
      email.value = 'autofill@example.com';
      email.dispatchEvent(new Event('input', { bubbles: true }));
    });
    host.attachShadow({ mode: 'open' }).append(button);
    document.body.append(host);
  }));
  const c = await checkout(page);
  await expect(page.locator('#main-content')).toHaveAttribute('inert', '');
  await expect(page.locator('autofill-fixture')).not.toHaveAttribute('inert');
  await page.getByRole('button', { name: 'Fill test details' }).click();
  await expect(c.email).toHaveValue('autofill@example.com');
  const close = c.cart.getByRole('button', { name: 'Close cart' });
  await close.focus();
  await close.press('Shift+Tab');
  await expect(c.cart.locator('[data-cart-back]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await close.press('Escape');
  await expect(c.cart).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#main-content')).not.toHaveAttribute('inert');
});
