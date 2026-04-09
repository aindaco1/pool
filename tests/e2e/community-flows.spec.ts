import { test, expect } from '@playwright/test';

const JSON_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*'
};

test.describe('Community Flows', () => {
  test('supports keyboard-only denied-state supporter CTA flow', async ({ page }) => {
    await page.goto('/community/hand-relations/');
    await expect(page.locator('#community-denied')).toBeVisible();

    const supportLink = page.locator('#community-denied a.btn').first();
    await supportLink.focus();
    await expect(supportLink).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/campaigns\/hand-relations\/#tiers$/);
  });

  test('supports keyboard-only supporter voting flow', async ({ page }) => {
    const voteBodies: Array<Record<string, any>> = [];
    let selectedOption = '';

    await page.route('**/pledge?token=token-123', async (route: any) => {
      await route.fulfill({
        status: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          pledgeStatus: 'active'
        })
      });
    });

    await page.route('**/votes?token=token-123&decisions=*', async (route: any) => {
      await route.fulfill({
        status: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          decisions: {}
        })
      });
    });

    await page.route('**/votes', async (route: any) => {
      voteBodies.push(JSON.parse(route.request().postData() || '{}'));
      await route.fulfill({
        status: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          userChoice: selectedOption,
          totalVotes: 3,
          results: {
            [selectedOption]: 2,
            'First Festival Target': 1
          }
        })
      });
    });

    await page.goto('/community/hand-relations/?t=token-123');
    await expect(page.locator('#community-content')).toBeVisible();

    const firstOption = page.locator('.decision-voting input[type="radio"]').first();
    await firstOption.focus();
    await expect(firstOption).toBeFocused();
    await page.keyboard.press('Space');
    await expect(firstOption).toBeChecked();
    selectedOption = await firstOption.inputValue();

    const submitButton = page.locator('[data-action="submit-vote"]').first();
    await submitButton.focus();
    await expect(submitButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect.poll(() => voteBodies.length).toBe(1);
    expect(voteBodies[0]).toMatchObject({
      token: 'token-123',
      decisionId: expect.any(String),
      option: selectedOption
    });

    await expect(page.locator('[data-view="results"]').first()).toBeVisible();
    await expect(page.locator('[data-user-choice]').first()).toContainText(selectedOption);
  });

  test('supports keyboard-only supporter back-link navigation', async ({ page }) => {
    await page.route('**/pledge?token=token-123', async (route: any) => {
      await route.fulfill({
        status: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          campaignSlug: 'hand-relations',
          pledgeStatus: 'active'
        })
      });
    });

    await page.route('**/votes?token=token-123&decisions=*', async (route: any) => {
      await route.fulfill({
        status: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          decisions: {}
        })
      });
    });

    await page.goto('/community/hand-relations/?t=token-123');
    await expect(page.locator('#community-content')).toBeVisible();

    const backLink = page.locator('.community-page__back');
    await backLink.focus();
    await expect(backLink).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/campaigns\/hand-relations\/$/);
  });
});
