import { test, expect } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers/mobile';

const JSON_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*'
};

const baseCampaign = {
  slug: 'hand-relations',
  title: 'Hand Relations',
  state: 'live',
  single_tier_only: true,
  goal_amount: 2500,
  pledged_amount: 10,
  goal_deadline: '2026-12-31',
  tiers: [
    {
      id: 'frame-slot',
      name: 'Buy 1 Frame',
      price: 10,
      category: 'digital',
      stackable: false
    }
  ],
  support_items: []
};

const activePledge = {
  orderId: 'pool-intent-123',
  email: 'supporter@example.com',
  campaignSlug: 'hand-relations',
  pledgeStatus: 'active',
  subtotal: 1000,
  tax: 79,
  amount: 1079,
  tierId: 'frame-slot',
  tierName: 'Buy 1 Frame',
  tierQty: 1,
  supportItems: [],
  customAmount: 0,
  canModify: true,
  canCancel: true,
  canUpdatePaymentMethod: true,
  deadlinePassed: false,
  tipPercent: 0,
  tipAmount: 0
};

async function routeManageWorker(page: any, options?: {
  campaigns?: Array<Record<string, any>>,
  pledges?: Array<Record<string, any>>,
  paymentStartPayload?: Record<string, any>,
  shippingQuotePayload?: Record<string, any>
}) {
  const paymentStartBodies: any[] = [];
  const cancelBodies: any[] = [];
  const modifyBodies: any[] = [];
  const shippingQuoteBodies: any[] = [];

  const campaigns = options?.campaigns || [baseCampaign];
  const pledges = options?.pledges || [activePledge];
  const paymentStartPayload = options?.paymentStartPayload || { url: '#payment-update' };
  const shippingQuotePayload = options?.shippingQuotePayload || {
    quotes: [],
    totalShippingCents: 0,
    shippingAddress: {
      country: 'US',
      postalCode: '80205'
    }
  };

  await page.route('**/api/campaigns.json', async (route: any) => {
    await route.fulfill({
      status: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        campaigns
      })
    });
  });

  await page.route('**/pledges?token=token-123', async (route: any) => {
    await route.fulfill({
      status: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify(pledges)
    });
  });

  await page.route('**/stats/hand-relations', async (route: any) => {
    await route.fulfill({
      status: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        pledgedAmount: 1000,
        state: 'live',
        supportItems: {}
      })
    });
  });

  await page.route('**/inventory/hand-relations', async (route: any) => {
    await route.fulfill({
      status: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        tiers: {
          'frame-slot': { remaining: 10 }
        }
      })
    });
  });

  await page.route('**/pledge/payment-method/start', async (route: any) => {
    paymentStartBodies.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({
      status: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify(paymentStartPayload)
    });
  });

  await page.route('**/pledge/cancel', async (route: any) => {
    cancelBodies.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({
      status: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ ok: true })
    });
  });

  await page.route('**/pledge/modify', async (route: any) => {
    modifyBodies.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({
      status: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ ok: true })
    });
  });

  await page.route('**/shipping/quote', async (route: any) => {
    shippingQuoteBodies.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({
      status: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify(shippingQuotePayload)
    });
  });

  return {
    paymentStartBodies,
    cancelBodies,
    modifyBodies,
    shippingQuoteBodies
  };
}

test.describe('Manage Pledge Flows', () => {
  test('loads token-backed pledges and starts payment-method updates', async ({ page }) => {
    const requests = await routeManageWorker(page);

    await page.goto('/manage/?t=token-123');

    await expect(page.locator('#pledges-list')).toBeVisible();
    await expect(page.locator('.pledge-card__campaign')).toContainText(/hand relations/i);
    await expect(page.locator('.pledge-card__status')).toContainText('active');

    await page.evaluate(() => {
      const button = document.querySelector('[data-action="payment"][data-index="0"]') as HTMLButtonElement | null;
      button?.click();
    });

    await expect.poll(() => requests.paymentStartBodies.length).toBe(1);
    expect(requests.paymentStartBodies[0]).toEqual({ token: 'token-123', preferredLang: 'en' });
  });

  test('loads token-backed pledges on the Spanish route and preserves preferredLang', async ({ page }) => {
    const requests = await routeManageWorker(page);

    await page.goto('/es/manage/?t=token-123');

    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('#pledges-list')).toBeVisible();

    await page.evaluate(() => {
      const button = document.querySelector('[data-action="payment"][data-index="0"]') as HTMLButtonElement | null;
      button?.click();
    });

    await expect.poll(() => requests.paymentStartBodies.length).toBe(1);
    expect(requests.paymentStartBodies[0]).toEqual({ token: 'token-123', preferredLang: 'es' });
  });

  test('submits cancel confirmation to the worker', async ({ page }) => {
    const requests = await routeManageWorker(page);

    await page.goto('/manage/?t=token-123');

    await expect(page.locator('#pledges-list')).toBeVisible();

    await page.evaluate(() => {
      const button = document.querySelector('[data-action="cancel"][data-index="0"]') as HTMLButtonElement | null;
      button?.click();
    });
    await expect(page.locator('#cancel-section-0')).toBeVisible();
    await page.evaluate(() => {
      const button = document.querySelector('[data-action="cancel-confirm"][data-index="0"]') as HTMLButtonElement | null;
      button?.click();
    });

    await expect.poll(() => requests.cancelBodies.length).toBe(1);
    expect(requests.cancelBodies[0]).toEqual({
      token: 'token-123',
      orderId: 'pool-intent-123',
      preferredLang: 'en'
    });
  });

  test('supports keyboard-only cancellation flow', async ({ page }) => {
    const requests = await routeManageWorker(page);

    await page.goto('/manage/?t=token-123');
    await expect(page.locator('#pledges-list')).toBeVisible();

    const cancelButton = page.locator('[data-action="cancel"][data-index="0"]');
    await cancelButton.focus();
    await expect(cancelButton).toBeFocused();
    await page.keyboard.press('Enter');

    const cancelConfirmButton = page.locator('[data-action="cancel-confirm"][data-index="0"]');
    await expect(cancelConfirmButton).toBeVisible();
    await cancelConfirmButton.focus();
    await expect(cancelConfirmButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect.poll(() => requests.cancelBodies.length).toBe(1);
    expect(requests.cancelBodies[0]).toEqual({
      token: 'token-123',
      orderId: 'pool-intent-123',
      preferredLang: 'en'
    });
  });

  test('submits modify requests after confirm modal approval', async ({ page }) => {
    const requests = await routeManageWorker(page);

    await page.goto('/manage/?t=token-123');

    await expect(page.locator('#pledges-list')).toBeVisible();

    await page.evaluate(() => {
      const input = document.querySelector('#tip-percent-0') as HTMLInputElement | null;
      if (!input) return;
      input.value = '5';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const saveButton = page.locator('[data-action="save"][data-index="0"]');
    await expect(saveButton).toBeEnabled();
    await expect(saveButton).toHaveText('Save Changes');

    await page.evaluate(() => {
      const button = document.querySelector('[data-action="save"][data-index="0"]') as HTMLButtonElement | null;
      button?.click();
    });
    await expect(page.locator('#confirm-modal')).toBeVisible();
    await page.evaluate(() => {
      const button = document.querySelector('#confirm-modal-confirm') as HTMLButtonElement | null;
      button?.click();
    });

    await expect.poll(() => requests.modifyBodies.length).toBe(1);
    expect(requests.modifyBodies[0]).toMatchObject({
      token: 'token-123',
      orderId: 'pool-intent-123',
      preferredLang: 'en',
      newTierId: 'frame-slot',
      newTierQty: 1,
      addTiers: null,
      supportItems: null,
      customAmount: null,
      tipPercent: 5
    });
  });

  test('quotes physical support-item shipping before saving modify changes', async ({ page }) => {
    const physicalCampaign = {
      ...baseCampaign,
      support_items: [
        {
          id: 'signed-script',
          label: 'Signed Script',
          need: 'physical add-on',
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
      ]
    };
    const physicalPledge = {
      ...activePledge,
      shipping: 300,
      amount: 1379,
      shippingAddress: {
        country: 'US',
        postalCode: '80205'
      }
    };
    const requests = await routeManageWorker(page, {
      campaigns: [physicalCampaign],
      pledges: [physicalPledge],
      shippingQuotePayload: {
        quotes: [
          {
            campaignSlug: 'hand-relations',
            shippingCents: 675,
            source: 'usps_live',
            carrier: 'usps',
            service: 'usps_ground_advantage',
            domestic: true,
            defaultOption: 'standard',
            selectedOption: 'standard',
            availableOptions: [
              {
                id: 'standard',
                shippingCents: 675,
                priceDeltaCents: 0
              },
              {
                id: 'signature_required',
                shippingCents: 1070,
                priceDeltaCents: 395
              }
            ]
          }
        ],
        totalShippingCents: 675,
        shippingAddress: {
          country: 'US',
          postalCode: '80205'
        }
      }
    });

    await page.goto('/manage/?t=token-123');
    await expect(page.locator('#pledges-list')).toBeVisible();

    const supportInput = page.locator('input[data-support-id="signed-script"]');
    await expect(supportInput).toBeVisible();
    await supportInput.fill('25');

    const shippingOptionSelect = page.locator('#shipping-option-0');
    await expect(shippingOptionSelect).toBeVisible();
    await shippingOptionSelect.selectOption('signature_required');
    await expect(page.locator('#shipping-0')).toContainText('$10.70');
    await expect(page.locator('#amount-0')).toContainText('$48.46');

    const saveButton = page.locator('[data-action="save"][data-index="0"]');
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await expect(page.locator('#confirm-modal')).toBeVisible();
    await expect(page.locator('#confirm-modal')).toContainText('Shipping: $10.70');
    await expect(page.locator('#confirm-modal')).toContainText('Delivery option: Signature required');
    await expect.poll(() => requests.shippingQuoteBodies.length > 0).toBe(true);
    expect(requests.shippingQuoteBodies.at(-1)).toMatchObject({
      campaignSlug: 'hand-relations',
      items: [
        { id: 'hand-relations__frame-slot', quantity: 1 },
        { id: 'hand-relations__support__signed-script', amount: 25 }
      ],
      shippingAddress: {
        country: 'US',
        postalCode: '80205'
      }
    });

    await page.locator('#confirm-modal-confirm').click();
    await expect.poll(() => requests.modifyBodies.length).toBe(1);
    expect(requests.modifyBodies[0]).toMatchObject({
      token: 'token-123',
      orderId: 'pool-intent-123',
      preferredLang: 'en',
      newTierId: 'frame-slot',
      newTierQty: 1,
      addTiers: null,
      supportItems: [{ id: 'signed-script', amount: 25 }],
      customAmount: null,
      tipPercent: null,
      shippingOption: 'signature_required'
    });
  });

  test('supports keyboard-only modify confirmation flow', async ({ page }) => {
    const requests = await routeManageWorker(page);

    await page.goto('/manage/?t=token-123');
    await expect(page.locator('#pledges-list')).toBeVisible();

    const tipSlider = page.locator('#tip-percent-0');
    await tipSlider.focus();
    await expect(tipSlider).toBeFocused();
    await page.keyboard.press('ArrowRight');

    const saveButton = page.locator('[data-action="save"][data-index="0"]');
    await expect(saveButton).toBeEnabled();
    await saveButton.focus();
    await expect(saveButton).toBeFocused();
    await page.keyboard.press('Enter');

    const confirmModal = page.locator('#confirm-modal');
    await expect(confirmModal).toBeVisible();
    await expect(page.locator('#confirm-modal-cancel')).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.locator('#confirm-modal-confirm')).toBeFocused();
    await page.keyboard.press('Enter');

    await expect.poll(() => requests.modifyBodies.length).toBe(1);
    expect(requests.modifyBodies[0]).toEqual({
      token: 'token-123',
      orderId: 'pool-intent-123',
      preferredLang: 'en',
      newTierId: 'frame-slot',
      newTierQty: 1,
      addTiers: null,
      bundleAddOns: null,
      supportItems: null,
      customAmount: null,
      tipPercent: 1,
      shippingOption: null
    });
  });

  test('supports keyboard-only payment-method update flow', async ({ page }) => {
    const requests = await routeManageWorker(page, {
      paymentStartPayload: {
        checkoutUiMode: 'custom',
        sessionId: 'cs_test_update_keyboard_123',
        clientSecret: 'cs_test_update_secret_keyboard_123',
        publishableKey: 'pk_test_update_keyboard_123'
      }
    });

    await page.addInitScript(() => {
      (window as any).Stripe = () => ({
        initCheckout: async () => ({
          loadActions: async () => ({
            type: 'success',
            actions: {
              getSession: () => ({ id: 'cs_test_update_keyboard_123' }),
              updateEmail: async () => ({}),
              confirm: async () => {
                (window as any).__paymentUpdateConfirmed = true;
                return { type: 'success' };
              }
            }
          }),
          createPaymentElement: () => ({
            mount: (node: HTMLElement) => {
              node.innerHTML = '<button type="button" data-test-payment-update-element>Mock payment element</button>';
            },
            unmount: () => {}
          }),
          on: (eventName: string, handler: Function) => {
            if (eventName === 'change') {
              handler({ session: { canConfirm: true } });
            }
          }
        })
      });
    });

    await page.goto('/manage/?t=token-123');
    await expect(page.locator('#pledges-list')).toBeVisible();

    const paymentButton = page.locator('[data-action="payment"][data-index="0"]');
    await paymentButton.focus();
    await expect(paymentButton).toBeFocused();
    await page.keyboard.press('Enter');

    const modal = page.locator('#payment-update-modal');
    await expect(modal).toBeVisible();
    await expect(page.locator('#payment-update-email')).toBeFocused();

    const confirmButton = page.locator('#payment-update-confirm');
    await expect(confirmButton).toBeEnabled();
    await confirmButton.focus();
    await expect(confirmButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect.poll(() => requests.paymentStartBodies.length).toBe(1);
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__paymentUpdateConfirmed))).toBe(true);
  });

  test('supports keyboard-only payment-method modal escape and focus restore', async ({ page }) => {
    await routeManageWorker(page, {
      paymentStartPayload: {
        checkoutUiMode: 'custom',
        sessionId: 'cs_test_update_keyboard_456',
        clientSecret: 'cs_test_update_secret_keyboard_456',
        publishableKey: 'pk_test_update_keyboard_456'
      }
    });

    await page.addInitScript(() => {
      (window as any).Stripe = () => ({
        initCheckout: async () => ({
          loadActions: async () => ({
            type: 'success',
            actions: {
              getSession: () => ({ id: 'cs_test_update_keyboard_456' }),
              updateEmail: async () => ({})
            }
          }),
          createPaymentElement: () => ({
            mount: (node: HTMLElement) => {
              node.innerHTML = '<button type="button" data-test-payment-update-element>Mock payment element</button>';
            },
            unmount: () => {}
          }),
          on: (eventName: string, handler: Function) => {
            if (eventName === 'change') {
              handler({ session: { canConfirm: true } });
            }
          }
        })
      });
    });

    await page.goto('/manage/?t=token-123');
    await expect(page.locator('#pledges-list')).toBeVisible();

    const paymentButton = page.locator('[data-action="payment"][data-index="0"]');
    await paymentButton.focus();
    await page.keyboard.press('Enter');

    const modal = page.locator('#payment-update-modal');
    await expect(modal).toBeVisible();
    await expect(page.locator('#payment-update-email')).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(modal).toBeHidden();
    await expect(paymentButton).toBeFocused();
  });

  test('keeps manage and Update Card actions reachable on a small phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await routeManageWorker(page, {
      paymentStartPayload: {
        checkoutUiMode: 'custom',
        sessionId: 'cs_test_update_mobile_123',
        clientSecret: 'cs_test_update_secret_mobile_123',
        publishableKey: 'pk_test_update_mobile_123'
      }
    });

    await page.addInitScript(() => {
      (window as any).Stripe = () => ({
        initCheckout: async () => ({
          loadActions: async () => ({
            type: 'success',
            actions: {
              getSession: () => ({ id: 'cs_test_update_mobile_123' }),
              updateEmail: async () => ({})
            }
          }),
          createPaymentElement: () => ({
            mount: (node: HTMLElement) => {
              node.innerHTML = '<button type="button" data-test-payment-update-element>Mock payment element</button>';
            },
            unmount: () => {}
          }),
          on: (eventName: string, handler: Function) => {
            if (eventName === 'change') {
              handler({ session: { canConfirm: true } });
            }
          }
        })
      });
    });

    await page.goto('/manage/?t=token-123');
    await expect(page.locator('#pledges-list')).toBeVisible();
    const paymentButton = page.locator('[data-action="payment"][data-index="0"]');
    await expect(paymentButton).toBeVisible();
    await paymentButton.scrollIntoViewIfNeeded();
    await expect(paymentButton).toBeInViewport();
    await expectNoHorizontalOverflow(page);

    await paymentButton.click();

    const modal = page.locator('#payment-update-modal');
    const confirmButton = page.locator('#payment-update-confirm');
    await expect(modal).toBeVisible();
    await expect(confirmButton).toBeVisible();
    await expect(confirmButton).toBeInViewport();
    await expectNoHorizontalOverflow(page);
  });

  test('starts payment recovery for payment-failed pledges', async ({ page }) => {
    const requests = await routeManageWorker(page, {
      pledges: [
        {
          ...activePledge,
          orderId: 'pool-intent-failed',
          pledgeStatus: 'payment_failed',
          canModify: false,
          canCancel: false,
          deadlinePassed: true,
          lastPaymentError: 'Card declined.'
        }
      ]
    });

    await page.goto('/manage/?t=token-123');

    await expect(page.locator('#pledges-list')).toBeVisible();
    await expect(page.locator('.pledge-card__payment-failed')).toContainText('Payment failed');

    await page.evaluate(() => {
      const button = document.querySelector('.pledge-card__payment-failed [data-action="payment"]') as HTMLButtonElement | null;
      button?.click();
    });

    await expect.poll(() => requests.paymentStartBodies.length).toBe(1);
    expect(requests.paymentStartBodies[0]).toEqual({ token: 'token-123', preferredLang: 'en' });
  });
});
