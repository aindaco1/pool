import { test, expect } from '@playwright/test';
import path from 'node:path';

const axePath = path.resolve(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js');

async function runAxe(page: any) {
  await page.route('**/__axe-core.js', async (route: any) => {
    await route.fulfill({
      path: axePath,
      contentType: 'application/javascript'
    });
  });
  await page.addScriptTag({ url: '/__axe-core.js' });
  return page.evaluate(async () => {
    // @ts-ignore
    return window.axe.run(document, {
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
    results.violations
      .map((violation: any) => `${violation.id}: ${violation.help}`)
      .join('\n')
  ).toEqual([]);
}

async function expectAriaSnapshotToContain(locator: any, fragments: string[]) {
  const snapshot = await locator.ariaSnapshot();
  for (const fragment of fragments) {
    expect(snapshot).toContain(fragment);
  }
}

const JSON_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*'
};

async function routeCommunitySupporterAccess(page: any, token = 'token-123') {
  await page.route(`**/pledge?token=${token}`, async (route: any) => {
    await route.fulfill({
      status: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        campaignSlug: 'hand-relations',
        pledgeStatus: 'active'
      })
    });
  });

  await page.route(`**/votes?token=${token}&decisions=*`, async (route: any) => {
    await route.fulfill({
      status: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        decisions: {}
      })
    });
  });
}

test.describe('Public Page Accessibility', () => {
  test('home page has no obvious axe violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('main')).toBeVisible();
    await expectNoAxeViolations(page);
    await expectAriaSnapshotToContain(page.locator('main'), [
      'heading "The Pool campaigns"',
      'heading "Active"',
      'heading "Completed"'
    ]);
  });

  test('live campaign page has no obvious axe violations', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    await expect(page.locator('.campaign-container')).toBeVisible();
    await expectNoAxeViolations(page);
    await expectAriaSnapshotToContain(page.locator('main'), [
      'heading "HAND RELATIONS"',
      'heading "Campaign Ended"'
    ]);
  });

  test('non-live campaign page has no obvious axe violations', async ({ page }) => {
    await page.goto('/campaigns/night-work/');
    await expect(page.locator('.campaign-container')).toBeVisible();
    await expectNoAxeViolations(page);
    await expectAriaSnapshotToContain(page.locator('main'), [
      'heading "NIGHT WORK"',
      'heading "Campaign Ended"'
    ]);
  });

  test('post campaign page has no obvious axe violations', async ({ page }) => {
    await page.goto('/campaigns/common-ground/');
    await expect(page.locator('.campaign-container')).toBeVisible();
    await expectNoAxeViolations(page);
    await expectAriaSnapshotToContain(page.locator('main'), [
      'heading "COMMON GROUND"',
      'heading "Festival Run"'
    ]);
  });

  test('physical campaign page has no obvious axe violations', async ({ page }) => {
    await page.goto('/campaigns/tecolote/');
    await expect(page.locator('.campaign-container')).toBeVisible();
    await expectNoAxeViolations(page);
    await expectAriaSnapshotToContain(page.locator('main'), [
      'heading "TECOLOTE"',
      'heading "Diary"',
      'heading "Tiers"'
    ]);
  });

  test('long-form community-heavy campaign page has no obvious axe violations', async ({ page }) => {
    await page.goto('/campaigns/worst-movie-ever/');
    await expect(page.locator('.campaign-container')).toBeVisible();
    await expectNoAxeViolations(page);
    await expectAriaSnapshotToContain(page.locator('main'), [
      'heading "THE WORST MOVIE EVER"',
      'heading "Supporter Community"',
      'heading "Diary"'
    ]);
  });

  test('about page has no obvious axe violations', async ({ page }) => {
    await page.goto('/about/');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('h1')).toContainText(/What Is The Pool/i);
    await expectNoAxeViolations(page);
    await expectAriaSnapshotToContain(page.locator('main'), [
      'heading "What Is The Pool?"',
      'heading "The Technology"'
    ]);
  });

  test('terms page has no obvious axe violations', async ({ page }) => {
    await page.goto('/terms/');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('h1')).toContainText(/Terms/i);
    await expectNoAxeViolations(page);
    await expectAriaSnapshotToContain(page.locator('main'), [
      'heading "Terms & Creative Guidelines"',
      'heading "Payment Processing"'
    ]);
  });

  test('pledge success page has no obvious axe violations', async ({ page }) => {
    await page.goto('/pledge-success/?orderId=pool-intent-demo123');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('h1')).toContainText(/Pledge is Saved/i);
    await expectNoAxeViolations(page);
    await expectAriaSnapshotToContain(page.locator('main'), [
      'heading "Your Pledge is Saved!"',
      'link "Back to Campaigns"'
    ]);
  });

  test('pledge cancelled page has no obvious axe violations', async ({ page }) => {
    await page.goto('/pledge-cancelled/');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('h1')).toContainText(/Checkout Cancelled/i);
    await expectNoAxeViolations(page);
    await expectAriaSnapshotToContain(page.locator('main'), [
      'heading "Checkout Cancelled"',
      'link "Back to Campaigns"'
    ]);
  });

  test('community index page has no obvious axe violations', async ({ page }) => {
    await page.goto('/community/');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('h1')).toContainText(/Campaign Community/i);
    await expectNoAxeViolations(page);
    await expectAriaSnapshotToContain(page.locator('main'), [
      'heading "Campaign Community"',
      'link "HAND RELATIONS"'
    ]);
  });

  test('community denied page has no obvious axe violations', async ({ page }) => {
    await page.goto('/community/hand-relations/');
    await expect(page.locator('#community-denied')).toBeVisible();
    await expectNoAxeViolations(page);
    await expectAriaSnapshotToContain(page.locator('main'), [
      'heading "Join the HAND RELATIONS Community"',
      'link "Support This Campaign →"'
    ]);
  });

  test('supporter community page has no obvious axe violations', async ({ page }) => {
    await routeCommunitySupporterAccess(page);
    await page.goto('/community/hand-relations/?t=token-123');
    await expect(page.locator('#community-content')).toBeVisible();
    await expectNoAxeViolations(page);
    await expectAriaSnapshotToContain(page.locator('main'), [
      'heading "HAND RELATIONS Community"',
      'heading "Active Decisions"',
      'button "Submit Vote"'
    ]);
  });
});
