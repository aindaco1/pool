import { test, expect } from '@playwright/test';

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

async function routeManageWorker(page: any, options?: { pledges?: Array<Record<string, any>> }) {
  const paymentStartBodies: any[] = [];
  const cancelBodies: any[] = [];
  const modifyBodies: any[] = [];

  const pledges = options?.pledges || [activePledge];

  await page.route('**/api/campaigns.json', async (route: any) => {
    await route.fulfill({
      status: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        campaigns: [baseCampaign]
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
      body: JSON.stringify({ url: '#payment-update' })
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

  return {
    paymentStartBodies,
    cancelBodies,
    modifyBodies
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
    expect(requests.paymentStartBodies[0]).toEqual({ token: 'token-123' });
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
      orderId: 'pool-intent-123'
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
    expect(requests.modifyBodies[0]).toEqual({
      token: 'token-123',
      orderId: 'pool-intent-123',
      newTierId: 'frame-slot',
      newTierQty: 1,
      addTiers: null,
      supportItems: null,
      customAmount: null,
      tipPercent: 5
    });
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
    expect(requests.paymentStartBodies[0]).toEqual({ token: 'token-123' });
  });
});
