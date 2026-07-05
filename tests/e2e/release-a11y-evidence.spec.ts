import { test, expect } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers/mobile';

const SITE_BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4002';

async function focusedElementSummary(page: any) {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element) return null;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      tagName: element.tagName.toLowerCase(),
      text: element.textContent?.replace(/\s+/g, ' ').trim() || '',
      ariaLabel: element.getAttribute('aria-label') || '',
      id: element.id || '',
      visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow
    };
  });
}

function hasVisibleFocusStyle(summary: any) {
  if (!summary) return false;
  const outlineWidth = Number.parseFloat(String(summary.outlineWidth || '0'));
  return outlineWidth > 0 ||
    !['none', 'auto', ''].includes(String(summary.outlineStyle || '')) ||
    String(summary.boxShadow || '') !== 'none';
}

test.describe('Release Accessibility Evidence', () => {
  test('release focus order reaches pledge controls with visible focus', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/campaigns/smoke-editable/');
    await expect(page.locator('main')).toBeVisible();

    let foundPledgeControl = false;
    const visited = [];
    for (let index = 0; index < 45; index += 1) {
      await page.keyboard.press('Tab');
      const focused = await focusedElementSummary(page);
      if (focused?.visible) visited.push(focused.text || focused.ariaLabel || focused.id || focused.tagName);
      if (/Add|Pledge|Support|Custom amount/i.test(focused?.text || focused?.ariaLabel || focused?.id || '')) {
        foundPledgeControl = true;
        expect(focused.visible).toBe(true);
        expect(hasVisibleFocusStyle(focused)).toBe(true);
        break;
      }
    }

    expect(foundPledgeControl, `Visited focusables: ${visited.join(' -> ')}`).toBe(true);
    await expectNoHorizontalOverflow(page);
  });

  test('release live status regions announce launch reminder state changes', async ({ page }) => {
    await page.route((url) => url.pathname === '/launch-reminders', async (route) => {
      const request = route.request();
      const origin = request.headers().origin || SITE_BASE;
      const headers = {
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'POST, OPTIONS',
        'vary': 'origin'
      };
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: {
          ...headers,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ok: true })
      });
    });

    await page.goto('/campaigns/hand-relations/');
    const form = page.locator('[data-launch-reminder-form]:visible').first();
    const status = form.locator('[data-launch-reminder-status]');
    await expect(status).toHaveAttribute('role', 'status');
    await expect(status).toHaveAttribute('aria-live', 'polite');

    await form.getByLabel('Email address').fill('supporter@example.com');
    await form.getByRole('button', { name: 'Remind me' }).click();
    await expect(status).toContainText(/You['’]re on the reminder list\./);
    await expectNoHorizontalOverflow(page);
  });

  test('release reduced motion preference keeps campaign cart surfaces usable', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/campaigns/smoke-editable/');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('[data-pool-cart-root]')).toHaveCount(1);
    await expect(page.locator('.tier-card').first()).toBeVisible();
    await expect(page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).resolves.toBe(true);
    await expectNoHorizontalOverflow(page);
  });
});
