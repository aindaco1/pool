import { test, expect } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers/mobile';

async function getCartSnapshot(page: any) {
  return page.evaluate(async () => {
    if ((window as any).PoolCartRuntime?.load) {
      await (window as any).PoolCartRuntime.load('e2e-public-cart-snapshot');
    }
    const provider = (window as any).PoolCartProvider;
    if (provider?.whenReady) {
      await provider.whenReady();
    }

    const client = provider?.getApi?.();
    const state = provider?.store?.getState?.() || client?.store?.getState?.();
    const items = state?.cart?.items?.items || [];

    return {
      itemCount: state?.cart?.items?.count || 0,
      items: items.map((item: any) => ({
        id: item.id,
        price: item.price,
        name: item.name
      }))
    };
  });
}

async function expectHeaderShareAfterBlurb(page: any) {
  await expect(page.locator('.campaign-header .campaign-share--mobile')).toBeVisible();
  await expect(page.locator('.campaign-facts .campaign-share--sidebar')).toBeHidden();
  expect(await page.locator('.campaign-header').evaluate(() => {
    const blurb = document.querySelector('.campaign-blurb');
    const share = document.querySelector('.campaign-header .campaign-share--mobile');
    if (!blurb || !share) return false;
    return blurb.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING;
  })).toBeTruthy();
}

test.describe('Public Page Keyboard Controls', () => {
  test('campaign share links use the intended responsive placements', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/campaigns/hand-relations/?utm_source=e2e&token=secret');

    const sidebarShare = page.locator('.campaign-facts .campaign-share--sidebar');
    const mobileShare = page.locator('.campaign-header .campaign-share--mobile');
    await expect(sidebarShare).toBeVisible();
    await expect(mobileShare).toBeHidden();
    await expect(sidebarShare.locator('.campaign-share__label')).toHaveCount(0);
    await expect(sidebarShare.locator('[data-campaign-share-target="copy"]')).toHaveCount(0);
    await expect(sidebarShare).toHaveAttribute('data-share-text', /HAND RELATIONS is launching Dec 1, 2026\. Follow the campaign and help it start strong:/);
    await expect(sidebarShare.locator('[data-campaign-share-target="bluesky"]')).toHaveAttribute('href', /utm_source%3De2e/);
    await expect(sidebarShare.locator('[data-campaign-share-target="x"]')).toHaveAttribute('href', /text=HAND%20RELATIONS%20is%20launching/);
    await expect(sidebarShare.locator('[data-campaign-share-target="email"]')).toHaveAttribute('href', /body=HAND%20RELATIONS%20is%20launching/);
    await expect(sidebarShare.locator('[data-campaign-share-target="bluesky"]')).not.toHaveAttribute('href', /token/);
    await expect(sidebarShare.locator('.campaign-share__icon').first()).toBeVisible();
    await expect(sidebarShare.locator('.campaign-share__icon-image').first()).toBeHidden();
    await page.evaluate(() => document.documentElement.classList.remove('supports-inline-svg'));
    await expect(sidebarShare.locator('.campaign-share__icon').first()).toBeHidden();
    await expect(sidebarShare.locator('.campaign-share__icon-image').first()).toBeVisible();
    expect(await sidebarShare.evaluate((share) => {
      const embed = document.querySelector('.campaign-facts__embed');
      return Boolean(embed && (share.compareDocumentPosition(embed) & Node.DOCUMENT_POSITION_FOLLOWING));
    })).toBe(true);

    await page.setViewportSize({ width: 1180, height: 900 });
    await page.reload();
    await expectHeaderShareAfterBlurb(page);
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 820, height: 1180 });
    await page.reload();
    await expectHeaderShareAfterBlurb(page);
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expectHeaderShareAfterBlurb(page);
    await expectNoHorizontalOverflow(page);
  });

  test('campaign header keeps tablet spacing before embedded video', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto('/campaigns/their-love/');

    await expect(page.locator('.hero__video--youtube')).toBeVisible();
    const gap = await page.evaluate(() => {
      const countdown = document.querySelector('.campaign-countdown')?.getBoundingClientRect();
      const hero = document.querySelector('.campaign-content .hero')?.getBoundingClientRect();
      if (!countdown || !hero) return null;
      return Math.round(hero.top - countdown.bottom);
    });

    expect(gap).not.toBeNull();
    expect(gap as number).toBeGreaterThanOrEqual(24);
    await expectNoHorizontalOverflow(page);
  });

  test('diary tabs stay usable on a small phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/campaigns/hand-relations/');

    const tablist = page.locator('.diary-tabs');
    const secondTab = page.locator('.diary-tab[role="tab"]').nth(1);
    await expect(tablist).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await secondTab.scrollIntoViewIfNeeded();
    await expect(secondTab).toBeInViewport();
    await secondTab.focus();
    await page.keyboard.press('Enter');
    await expect(secondTab).toHaveAttribute('aria-selected', 'true');
  });

  test('supports keyboard-only diary tab navigation', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');

    const activeTab = page.locator('.diary-tab[role="tab"]').first();
    await activeTab.focus();
    await expect(activeTab).toBeFocused();
    await expect(activeTab).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('ArrowRight');

    const nextTab = page.locator('.diary-tab[role="tab"]').nth(1);
    await expect(nextTab).toBeFocused();
    await expect(nextTab).toHaveAttribute('aria-selected', 'true');

    const controlledPanelId = await nextTab.getAttribute('aria-controls');
    await expect(page.locator(`#${controlledPanelId}`)).toBeVisible();
  });

  test('supports keyboard-only custom amount add-to-cart flow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/campaigns/smoke-editable/');

    const customInput = page.locator('#custom-amount-input');
    const customButton = page.locator('#custom-amount-btn');
    await expect(customInput).toBeVisible();

    await customInput.focus();
    await page.keyboard.type('37');
    await customButton.focus();
    await expect(customButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect.poll(() => getCartSnapshot(page)).toMatchObject({
      itemCount: 1,
      items: [
        expect.objectContaining({
          id: 'smoke-editable__custom-support',
          price: 37
        })
      ]
    });
    await expectNoHorizontalOverflow(page);
  });

  test('supports keyboard-only support-item add-to-cart flow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/campaigns/smoke-editable/');

    const supportInput = page.locator('.support-item__input').first();
    const supportButton = page.locator('.support-item__btn').first();
    await expect(supportInput).toBeVisible();

    await supportInput.focus();
    await page.keyboard.type('12');
    await supportButton.focus();
    await expect(supportButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect.poll(() => getCartSnapshot(page)).toMatchObject({
      itemCount: 1,
      items: [
        expect.objectContaining({
          price: 12
        })
      ]
    });
    await expectNoHorizontalOverflow(page);
  });

  test('supports keyboard-only supporter community teaser activation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/campaigns/worst-movie-ever/?dev=1');

    const communityButton = page.locator('#community-btn');
    await expect(communityButton).toBeVisible();
    await expect(communityButton).toContainText(/Access Community/i);
    await communityButton.scrollIntoViewIfNeeded();
    await expect(communityButton).toBeInViewport();
    await expectNoHorizontalOverflow(page);

    await communityButton.focus();
    await expect(communityButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/community\/worst-movie-ever\/$/);
  });
});
