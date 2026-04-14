import { test, expect } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers/mobile';

async function getCartSnapshot(page: any) {
  return page.evaluate(async () => {
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

test.describe('Public Page Keyboard Controls', () => {
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

  test('supports keyboard-only carousel gallery navigation', async ({ page }) => {
    await page.goto('/campaigns/common-ground/');

    const gallery = page.locator('.gallery--carousel .gallery__container').first();
    await expect(gallery).toBeVisible();

    await gallery.evaluate((node: Element) => {
      const el = node as HTMLElement;
      Object.defineProperty(el, 'clientWidth', { value: 320, configurable: true });
      Object.defineProperty(el, 'scrollWidth', { value: 1280, configurable: true });
    });

    await gallery.focus();
    await expect(gallery).toBeFocused();

    await page.keyboard.press('ArrowRight');
    await expect.poll(() => gallery.evaluate((node: Element) => (node as HTMLElement).scrollLeft)).toBeGreaterThan(0);

    await page.keyboard.press('End');
    await expect
      .poll(() =>
        gallery.evaluate((node: Element) => {
          const el = node as HTMLElement;
          return {
            scrollLeft: el.scrollLeft,
            maxScrollLeft: el.scrollWidth - el.clientWidth
          };
        })
      )
      .toMatchObject({
        scrollLeft: expect.any(Number),
        maxScrollLeft: expect.any(Number)
      });
    await expect
      .poll(() =>
        gallery.evaluate((node: Element) => {
          const el = node as HTMLElement;
          return (el.scrollWidth - el.clientWidth) - el.scrollLeft;
        })
      )
      .toBeLessThanOrEqual(180);

    await page.keyboard.press('Home');
    await expect.poll(() => gallery.evaluate((node: Element) => (node as HTMLElement).scrollLeft)).toBe(0);
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
