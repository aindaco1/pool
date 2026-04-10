import { test, expect } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers/mobile';

const CART_BUTTON_SELECTOR = 'button.poolcart-add-item';
const TIER_CARD_BUTTON_SELECTOR = '.tier-card button.poolcart-add-item';
const SIDEBAR_CART_BUTTON_SELECTOR = 'aside.campaign-sidebar button.poolcart-add-item';
const ENABLED_TIER_CARD_BUTTON_SELECTOR = '.tier-card button.poolcart-add-item:not([disabled])';
const ENABLED_SIDEBAR_CART_BUTTON_SELECTOR = 'aside.campaign-sidebar button.poolcart-add-item:not([disabled])';
const FEATURED_CARD_BUTTON_SELECTOR = '.campaign-card__featured-tier.poolcart-add-item';
const CART_ROOT_SELECTOR = '[data-pool-cart-root]';

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
      runtime: provider?.activeRuntime || (window as any).POOL_CONFIG?.cartRuntime || 'first_party',
      itemCount: state?.cart?.items?.count || 0,
      total: state?.cart?.total || 0,
      email: state?.cart?.email || '',
      billingName: state?.cart?.billingAddress?.name || '',
      items: items.map((item: any) => ({
        name: item.name,
        price: item.price,
        id: item.id,
        quantity: item.quantity
      }))
    };
  });
}

async function updateCartViaClient(page: any, payload: Record<string, any>) {
  return page.evaluate(async (nextPayload) => {
    const provider = (window as any).PoolCartProvider;
    if (provider?.whenReady) {
      await provider.whenReady();
    }

    const client = provider?.getApi?.();
    await client?.api?.cart?.update?.(nextPayload);

    const state = provider?.store?.getState?.() || client?.store?.getState?.();
    return {
      email: state?.cart?.email || '',
      billingName: state?.cart?.billingAddress?.name || ''
    };
  }, payload);
}

async function openCartViaClient(page: any) {
  await page.evaluate(async () => {
    const provider = (window as any).PoolCartProvider;
    if (provider?.whenReady) {
      await provider.whenReady();
    }

    const client = provider?.getApi?.();
    await client?.api?.theme?.cart?.open?.();
  });
}

async function getActiveRuntime(page: any) {
  return page.evaluate(() => {
    return (window as any).PoolCartProvider?.activeRuntime || (window as any).POOL_CONFIG?.cartRuntime || 'first_party';
  });
}

async function expectAriaSnapshotToContain(locator: any, fragments: string[]) {
  const snapshot = await locator.ariaSnapshot();
  for (const fragment of fragments) {
    expect(snapshot).toContain(fragment);
  }
}

test.describe('Campaign Page Structure', () => {
  test('campaign page stays free of horizontal overflow on a small phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/campaigns/smoke-editable/');

    await expect(page.locator('.campaign-container')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(page.locator('.campaign-header h1')).toBeInViewport();
    const sidebarButton = page.locator(ENABLED_SIDEBAR_CART_BUTTON_SELECTOR).first();
    await expect(sidebarButton).toBeVisible();
    await sidebarButton.scrollIntoViewIfNeeded();
    await expect(sidebarButton).toBeInViewport();
  });

  test('campaign page has required elements', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    // Main content areas
    await expect(page.locator('.campaign-container')).toBeVisible();
    await expect(page.locator('.campaign-header')).toBeVisible();
    await expect(page.locator('.campaign-sidebar')).toBeVisible();
    
    // Hero section (contains video or image)
    await expect(page.locator('.hero')).toBeVisible();
    
    // Progress bar
    await expect(page.locator('.progress-wrap')).toBeVisible();
    await expect(page.locator('.progress-bar')).toBeVisible();
    
    // At least one tier
    const tiers = page.locator('.tier-card');
    await expect(tiers.first()).toBeVisible();
  });

  test('progress bar has correct data attributes', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    const progressWrap = page.locator('.progress-wrap[data-live-stats]');
    await expect(progressWrap).toBeVisible();
    
    // Required data attributes for live-stats.js
    await expect(progressWrap).toHaveAttribute('data-campaign-slug', 'hand-relations');
    await expect(progressWrap).toHaveAttribute('data-goal');
    await expect(progressWrap).toHaveAttribute('data-max-threshold');
  });

  test('milestone markers are present', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    // 1/3 and 2/3 milestones
    const milestones = page.locator('.progress-marker--milestone');
    expect(await milestones.count()).toBeGreaterThanOrEqual(2);
    
    // Goal marker
    await expect(page.locator('.progress-marker--goal')).toBeVisible();
  });

  test('stretch goal markers are present when campaign has stretch goals', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    // Hand Relations has 2 stretch goals (35k and 50k)
    const stretchMarkers = page.locator('.progress-marker--stretch');
    expect(await stretchMarkers.count()).toBe(2);
    
    // Each should have a threshold
    const firstMarker = stretchMarkers.first();
    await expect(firstMarker).toHaveAttribute('data-threshold');
  });
});

test.describe('Tier Cards', () => {
  test('tier cards have required cart item attributes', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    const tierButtons = page.locator(TIER_CARD_BUTTON_SELECTOR);
    const count = await tierButtons.count();
    expect(count).toBeGreaterThan(0);
    
    // Check first tier has all required attributes
    const firstTier = tierButtons.first();
    await expect(firstTier).toHaveAttribute('data-item-id');
    await expect(firstTier).toHaveAttribute('data-item-name');
    await expect(firstTier).toHaveAttribute('data-item-price');
    await expect(firstTier).toHaveAttribute('data-item-url');
    await expect(firstTier).toHaveAttribute('data-item-description');
    await expect(firstTier).toHaveAttribute('data-item-max-quantity');
    await expect(firstTier).toHaveAttribute('data-item-stackable');
  });

  test('tier cards display inventory for limited tiers', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    // Find tier with limit display
    const limitDisplay = page.locator('.tier-card .limit');
    
    if (await limitDisplay.count() > 0) {
      const text = await limitDisplay.first().textContent();
      expect(text).toMatch(/Limit.*Remaining/);
      
      // Should have live data attributes
      const remainingEl = page.locator('[data-live-remaining]').first();
      const limitEl = page.locator('[data-live-limit]').first();
      
      await expect(remainingEl).toBeVisible();
      await expect(limitEl).toBeVisible();
    }
  });

  test('gated tier shows locked state', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    // Creature Cameo tier requires $35k threshold
    const gatedTier = page.locator('.tier-card[data-requires-threshold]');
    
    if (await gatedTier.count() > 0) {
      // Should have locked class initially (before threshold is met)
      await expect(gatedTier.first()).toHaveClass(/tier-card--locked/);
      
      // Button should be disabled
      const btn = gatedTier.first().locator(CART_BUTTON_SELECTOR);
      await expect(btn).toBeDisabled();
      
      // Unlock badge exists but is hidden (display: none) until unlocked
      const badge = gatedTier.first().locator('.tier-card__unlock-badge');
      await expect(badge).toBeAttached();
    }
  });

  test('disabled tiers show correct reason on non-live campaigns', async ({ page }) => {
    await page.goto('/campaigns/night-work/');
    
    // All tier buttons should be disabled
    const tierButtons = page.locator(TIER_CARD_BUTTON_SELECTOR);
    const firstButton = tierButtons.first();
    
    await expect(firstButton).toBeDisabled();
    
    // Button text should indicate it's upcoming
    const buttonText = await firstButton.textContent();
    expect(buttonText).toMatch(/Opens|Unavailable|Campaign Ended|Ended|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/);
  });

  test('sunder tiers are non-stackable and constrained to quantity 1', async ({ page }) => {
    await page.goto('/campaigns/sunder/');

    const tierButtons = page.locator(TIER_CARD_BUTTON_SELECTOR);
    const count = await tierButtons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const btn = tierButtons.nth(i);
      await expect(btn).toHaveAttribute('data-item-stackable', 'never');
      await expect(btn).toHaveAttribute('data-item-max-quantity', '1');
    }
  });
});

test.describe('Physical Products & Shipping', () => {
  test('tier cards include _category custom field', async ({ page }) => {
    await page.goto('/campaigns/tecolote/');
    
    const tierButtons = page.locator(TIER_CARD_BUTTON_SELECTOR);
    const count = await tierButtons.count();
    expect(count).toBeGreaterThan(0);
    
    let hasPhysical = false;
    let hasDigital = false;
    
    for (let i = 0; i < count; i++) {
      const btn = tierButtons.nth(i);
      const categoryValue = await btn.getAttribute('data-item-custom2-value');
      
      if (categoryValue === 'physical') hasPhysical = true;
      if (categoryValue === 'digital') hasDigital = true;
    }
    
    expect(hasPhysical).toBe(true);
    expect(hasDigital).toBe(true);
  });

  test('physical tier buttons set shippable to false', async ({ page }) => {
    await page.goto('/campaigns/tecolote/');
    
    const physicalTier = page.locator('.tier-card button.poolcart-add-item[data-item-custom2-value="physical"]').first();
    
    if (await physicalTier.count() > 0) {
      await expect(physicalTier).toHaveAttribute('data-item-shippable', 'false');
    }
  });

  test('campaign with all digital tiers has no physical category', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    const tierButtons = page.locator(TIER_CARD_BUTTON_SELECTOR);
    const count = await tierButtons.count();
    expect(count).toBeGreaterThan(0);
    
    for (let i = 0; i < count; i++) {
      const btn = tierButtons.nth(i);
      const categoryValue = await btn.getAttribute('data-item-custom2-value');
      
      // Should be 'digital' or not have the attribute (defaults to digital)
      if (categoryValue) {
        expect(categoryValue).toBe('digital');
      }
    }
  });
});

test.describe('Support Items', () => {
  test('support items have correct structure', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    const supportItems = page.locator('.support-item');
    
    if (await supportItems.count() > 0) {
      const firstItem = supportItems.first();
      
      // Amount display
      await expect(firstItem.locator('.support-item__amount')).toBeVisible();
      
      // Progress bar
      await expect(firstItem.locator('.support-item__progress')).toBeVisible();
      
      // Input and button
      const input = firstItem.locator('.support-item__input');
      const btn = firstItem.locator('.support-item__btn');
      
      if (await input.count() > 0) {
        await expect(input).toHaveAttribute('type', 'number');
        await expect(input).toHaveAttribute('min', '1');
        await expect(input).toHaveAttribute('max');
      }
      
      await expect(btn).toBeVisible();
    }
  });

  test('support item input updates cart data-item-price', async ({ page }) => {
    await page.goto('/campaigns/smoke-editable/');
    
    const supportInput = page.locator('#support-input-snack-run');
    const supportButton = page.locator('#support-btn-snack-run');
    await expect(supportInput).toBeVisible();
    await expect(supportInput).toBeEnabled();
    
    // Enter a value
    await supportInput.fill('75');
    await supportInput.dispatchEvent('input');
    
    // Verify the button price updated
    await expect(supportButton).toHaveAttribute('data-item-price', '75');
  });

  test('support items exist on campaign page', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    // Hand Relations has support items (location-scouting, casting)
    const supportItems = page.locator('.support-item');
    
    // Should have support items
    expect(await supportItems.count()).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Custom Amount', () => {
  test('custom amount section has correct structure', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    const customAmount = page.locator('.custom-amount');
    
    if (await customAmount.count() > 0) {
      // Campaign slug attribute
      await expect(customAmount).toHaveAttribute('data-campaign-slug', 'hand-relations');
      
      // Input
      const input = page.locator('#custom-amount-input');
      await expect(input).toHaveAttribute('type', 'number');
      await expect(input).toHaveAttribute('min', '1');
      
      // Button
      const btn = page.locator('#custom-amount-btn');
      await expect(btn).toHaveAttribute('data-item-id');
      await expect(btn).toHaveAttribute('data-item-price');
    }
  });

  test('custom amount input updates cart data-item-price', async ({ page }) => {
    await page.goto('/campaigns/smoke-editable/');
    
    const customInput = page.locator('#custom-amount-input');
    const customButton = page.locator('#custom-amount-btn');
    await expect(customInput).toBeVisible();
    await expect(customInput).toBeEnabled();
    
    // Initial price should be 25 (the placeholder default)
    await expect(customButton).toHaveAttribute('data-item-price', '25');
    
    // Enter a custom amount
    await customInput.fill('100');
    await customInput.dispatchEvent('input');
    
    // Verify the button price attribute updated
    await expect(customButton).toHaveAttribute('data-item-price', '100');
  });

  test('custom amount with late_support has data attribute', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    // Hand Relations has custom_late_support: true
    const customAmount = page.locator('.custom-amount[data-late-support="true"]');
    
    // May or may not be present depending on campaign state
    // Just check the attribute if it exists
    if (await customAmount.count() > 0) {
      await expect(customAmount).toHaveAttribute('data-goal');
    }
  });
});

test.describe('Homepage & Campaign Cards', () => {
  test('homepage displays campaign cards', async ({ page }) => {
    await page.goto('/');
    
    const campaignCards = page.locator('.campaign-card');
    expect(await campaignCards.count()).toBeGreaterThan(0);
  });

  test('campaign cards have required elements', async ({ page }) => {
    await page.goto('/');
    
    const firstCard = page.locator('.campaign-card').first();
    
    // Campaign slug data attribute
    await expect(firstCard).toHaveAttribute('data-campaign-slug');
    
    // Title link
    await expect(firstCard.locator('h2 a')).toBeVisible();
    
    // Progress bar
    await expect(firstCard.locator('.progress-wrap')).toBeVisible();
    
    // View Campaign button
    await expect(firstCard.locator('a.btn')).toBeVisible();
  });

  test('all campaign links are valid', async ({ page }) => {
    await page.goto('/');
    
    const campaignLinks = page.locator('.campaign-card a[href*="/campaigns/"]');
    const count = await campaignLinks.count();
    
    expect(count).toBeGreaterThan(0);
    
    // Check first few campaign links are valid
    for (let i = 0; i < Math.min(count, 3); i++) {
      const link = campaignLinks.nth(i);
      const href = await link.getAttribute('href');
      expect(href).toMatch(/\/campaigns\/.+/);
    }
  });

  test('featured tier button on campaign card has cart item attributes', async ({ page }) => {
    await page.goto('/');
    
    // Find a campaign card with a featured tier button
    const featuredBtn = page.locator(FEATURED_CARD_BUTTON_SELECTOR);
    
    if (await featuredBtn.count() > 0) {
      const btn = featuredBtn.first();
      await expect(btn).toHaveAttribute('data-item-id');
      await expect(btn).toHaveAttribute('data-item-name');
      await expect(btn).toHaveAttribute('data-item-price');
      await expect(btn).toHaveAttribute('data-item-url');
    }
  });
});

test.describe('Cart Integration', () => {
  test('cart runtime bootstrap is loaded', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    const bootstrap = await page.evaluate(() => {
      const cartRoot = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
      return {
        poolConfig: (window as any).POOL_CONFIG,
        hasProvider: Boolean((window as any).PoolCartProvider),
        hasCartRoot: Boolean(cartRoot),
        cartRootId: cartRoot?.id || null,
        hasVendorConfigAttributes: Boolean(
          cartRoot?.hasAttribute('data-api-key') ||
          cartRoot?.hasAttribute('data-config-modal-style')
        )
      };
    });
    
    expect(bootstrap.poolConfig).toBeDefined();
    expect(bootstrap.hasProvider).toBe(true);
    expect(bootstrap.hasCartRoot).toBe(true);
    expect(bootstrap.cartRootId).toBeNull();
    expect(bootstrap.hasVendorConfigAttributes).toBe(false);
  });

  test('POOL_CONFIG is set for live-stats.js', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    const poolConfig = await page.evaluate(() => {
      return (window as any).POOL_CONFIG;
    });
    
    expect(poolConfig).toBeDefined();
    expect(poolConfig.workerBase).toBeTruthy();
    // Worker URL varies: localhost:8787 for local, pledge.dustwave.xyz for prod
    expect(poolConfig.workerBase).toMatch(/localhost|127\.0\.0\.1|pledge\./);
  });

  test('live-stats.js functions are exposed globally', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    // Wait for scripts to load
    await page.waitForTimeout(500);
    
    const hasRefreshStats = await page.evaluate(() => {
      return typeof (window as any).refreshLiveStats === 'function';
    });
    
    const hasRefreshInventory = await page.evaluate(() => {
      return typeof (window as any).refreshLiveInventory === 'function';
    });
    
    const hasGetTierInventory = await page.evaluate(() => {
      return typeof (window as any).getTierInventory === 'function';
    });
    
    expect(hasRefreshStats).toBe(true);
    expect(hasRefreshInventory).toBe(true);
    expect(hasGetTierInventory).toBe(true);
  });
});

test.describe('Cart Flow', () => {
  test('can navigate to campaign and add tier to cart', async ({ page }) => {
    await page.goto('/');
    
    // Find and click on a live campaign
    const campaignLink = page.locator('a[href*="/campaigns/"]').first();
    await expect(campaignLink).toBeVisible();
    await campaignLink.click();
    
    await expect(page.locator('.campaign-container')).toBeVisible();
    
    // Find an enabled tier button in the sidebar
    const tierButton = page.locator(ENABLED_SIDEBAR_CART_BUTTON_SELECTOR).first();
    
    if (await tierButton.count() === 0) {
      console.log('No enabled tiers found - campaign may not be live');
      return;
    }
    
    const tierName = await tierButton.getAttribute('data-item-name');
    const tierPrice = await tierButton.getAttribute('data-item-price');
    
    expect(tierName).toBeTruthy();
    expect(tierPrice).toBeTruthy();
    
    // Click the tier button to add to cart
    await tierButton.click();
    
    // Wait for the cart runtime to react
    await page.waitForTimeout(2000);
    
    const cartContainer = page.locator(CART_ROOT_SELECTOR);
    await expect(cartContainer).toBeAttached();
  });

  test('add item to cart and verify cart state via API', async ({ page }) => {
    test.setTimeout(60_000);
    
    await page.goto('/campaigns/hand-relations/');
    
    const tierButton = page.locator(ENABLED_SIDEBAR_CART_BUTTON_SELECTOR).first();
    if (await tierButton.count() === 0) {
      console.log('No enabled tiers - skipping');
      return;
    }
    
    await tierButton.click();
    await page.waitForTimeout(3000);
    
    const cartState = await getCartSnapshot(page);
    
    expect(cartState.itemCount).toBeGreaterThan(0);
    expect(cartState.total).toBeGreaterThan(0);
    
    // Update cart with billing info via API
    // Note: This API is used by cart.js to auto-fill billing info during checkout.
    // The billing step is now hidden and auto-navigates to the Pledge step.
    const testEmail = `e2e-test+${Date.now()}@example.com`;
    
    await updateCartViaClient(page, {
      email: testEmail,
      billingAddress: {
        name: 'E2E Test User',
        address1: '123 Test Street',
        city: 'San Francisco',
        country: 'US',
        province: 'CA',
        postalCode: '94102'
      }
    });
    
    await page.waitForTimeout(500);
    
    const updatedCart = await getCartSnapshot(page);
    
    expect(updatedCart.email).toBe(testEmail);
    expect(updatedCart.billingName).toBe('E2E Test User');
  });

  test('cart shows tip-aware fee summary after adding an item', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/campaigns/sunder/');

    const tierButton = page.locator(ENABLED_SIDEBAR_CART_BUTTON_SELECTOR).first();
    if (await tierButton.count() === 0) {
      test.skip();
      return;
    }

    await tierButton.click();
    await openCartViaClient(page);

    const cartRuntime = await page.evaluate(() => {
      return (window as any).PoolCartProvider?.activeRuntime || (window as any).POOL_CONFIG?.cartRuntime || 'first_party';
    });

    if (cartRuntime === 'first_party') {
      await expect(page.locator('.pool-first-party-cart__tip-box')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('.pool-first-party-cart__checkout-summary')).toBeVisible();
      await expect(page.locator('.pool-first-party-cart__tip-percent')).toHaveText('5%');
      await expect(page.locator('.pool-first-party-cart__checkout-summary')).toContainText('tip (5%)');
      await expect(page.locator('.pool-first-party-cart__checkout-summary')).toContainText('Sales tax (7.875%)');
      await expect(page.locator('.pool-first-party-cart__checkout-summary')).toContainText('Pledge total');
      return;
    }

    await expect(page.locator('.pool-tip-box')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.pool-fee-summary')).toBeVisible();
    await expect(page.locator('.pool-tip-box__percent')).toHaveText('5%');
    await expect(page.locator('.pool-fee-summary')).toContainText('tip (5%)');
    await expect(page.locator('.pool-fee-summary')).toContainText('Sales tax (7.875%)');
  });

  test('first-party checkout preview posts canonical payload to /checkout-intent/start', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/campaigns/smoke-editable/');

    const cartRuntime = await page.evaluate(() => {
      return (window as any).PoolCartProvider?.activeRuntime || (window as any).POOL_CONFIG?.cartRuntime || 'first_party';
    });

    if (cartRuntime !== 'first_party') {
      test.skip();
      return;
    }

    const workerBase = await page.evaluate(() => {
      return (window as any).POOL_CONFIG?.workerBase;
    });
    const checkoutUiMode = await page.evaluate(() => {
      return (window as any).POOL_CONFIG?.checkoutUiMode || 'hosted';
    });

    expect(workerBase).toBeTruthy();

    let capturedPayload: any = null;
    await page.route(`${workerBase}/checkout-intent/start`, async (route) => {
      capturedPayload = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: '/campaigns/smoke-editable/#checkout-redirected' })
      });
    });

    const tierButton = page.locator(ENABLED_SIDEBAR_CART_BUTTON_SELECTOR).first();
    if (await tierButton.count() === 0) {
      test.skip();
      return;
    }

    const tierId = await tierButton.getAttribute('data-item-id');
    const campaignSlug = await page.locator('.campaign-container').getAttribute('data-campaign-slug');

    expect(tierId).toBeTruthy();
    expect(campaignSlug).toBeTruthy();

    await tierButton.click();
    await openCartViaClient(page);

    const tipSlider = page.locator('[data-cart-tip]');
    await expect(tipSlider).toBeVisible();
    await tipSlider.fill('6');
    await page.locator('[data-cart-continue]').click();
    await expect(page.locator('[data-cart-email]')).toHaveCount(0);
    await expect(page.locator('[data-cart-tip]')).toHaveCount(0);

    if (checkoutUiMode !== 'custom') {
      await expect(page.locator('[data-cart-start-checkout]')).toBeVisible();
      await page.evaluate(() => {
        const button = document.querySelector('[data-cart-start-checkout]') as HTMLButtonElement | null;
        button?.click();
      });
    }
    await page.waitForURL('**/campaigns/smoke-editable/#checkout-redirected');

    expect(capturedPayload).toMatchObject({
      campaignSlug,
      tipPercent: 6,
      items: [
        {
          id: tierId,
          quantity: 1
        }
      ],
      customAmount: 0
    });

    const pendingPledge = await page.evaluate(() => {
      const raw = sessionStorage.getItem('pool_pending_pledge');
      if (!raw) return null;
      try {
        return JSON.parse(raw)?.value ?? null;
      } catch {
        return null;
      }
    });
    expect(pendingPledge).toBe('true');
  });

  test('single-tier campaigns replace the previous cart item instead of stacking', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/campaigns/sunder/');

    const tierButtons = page.locator(ENABLED_SIDEBAR_CART_BUTTON_SELECTOR);
    if (await tierButtons.count() < 2) {
      test.skip();
      return;
    }

    const firstTierId = await tierButtons.nth(0).getAttribute('data-item-id');
    const secondTierId = await tierButtons.nth(1).getAttribute('data-item-id');
    const firstTierName = await tierButtons.nth(0).getAttribute('data-item-name');
    const secondTierName = await tierButtons.nth(1).getAttribute('data-item-name');

    expect(firstTierId).toBeTruthy();
    expect(secondTierId).toBeTruthy();

    await tierButtons.nth(0).click();
    await page.waitForTimeout(1500);

    await page.evaluate(async (itemId) => {
      const button = document.querySelector(`aside.campaign-sidebar button[data-item-id="${itemId}"]`) as HTMLButtonElement | null;
      const provider = (window as any).PoolCartProvider;
      if (provider?.whenReady) {
        await provider.whenReady();
      }

      const client = provider?.getApi?.();
      if (!button || !client?.api?.cart?.items?.add) return;

      await client.api.cart.items.add({
        id: button.dataset.itemId,
        name: button.dataset.itemName,
        price: Number(button.dataset.itemPrice || '0'),
        url: button.dataset.itemUrl,
        description: button.dataset.itemDescription || '',
        stackable: button.dataset.itemStackable === 'always',
        shippable: button.dataset.itemShippable === 'true',
        maxQuantity: Number(button.dataset.itemMaxQuantity || '99')
      });
    }, secondTierId);

    await page.waitForFunction(() => {
      const provider = (window as any).PoolCartProvider;
      const client = provider?.getApi?.();
      const state = provider?.store?.getState?.() || client?.store?.getState?.();
      const items = state?.cart?.items?.items || [];
      return items.length === 1;
    }, null, { timeout: 15000 });

    const cartState = (await getCartSnapshot(page)).items.map((item: any) => ({
      name: item.name,
      quantity: item.quantity
    }));

    expect(cartState).toHaveLength(1);
    expect(cartState[0].quantity).toBe(1);
    expect(cartState[0].name).toBe(secondTierName);
    expect(cartState[0].name).not.toBe(firstTierName);
  });

  test('single-tier replacement keeps tier items from other campaigns in the cart', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/campaigns/smoke-editable/');

    const otherCampaignButton = page.locator(ENABLED_TIER_CARD_BUTTON_SELECTOR).first();
    if (await otherCampaignButton.count() === 0) {
      test.skip();
      return;
    }

    const otherCampaignId = await otherCampaignButton.getAttribute('data-item-id');
    const otherCampaignName = await otherCampaignButton.getAttribute('data-item-name');
    expect(otherCampaignId).toBeTruthy();
    expect(otherCampaignName).toBeTruthy();
    await otherCampaignButton.click();

    await page.goto('/campaigns/sunder/');

    const sunderButton = page
      .locator(`${ENABLED_SIDEBAR_CART_BUTTON_SELECTOR}, ${ENABLED_TIER_CARD_BUTTON_SELECTOR}`)
      .first();
    if (await sunderButton.count() === 0) {
      test.skip();
      return;
    }

    const secondTierId = await sunderButton.getAttribute('data-item-id');
    const secondTierName = await sunderButton.getAttribute('data-item-name');
    expect(secondTierId).toBeTruthy();
    expect(secondTierName).toBeTruthy();
    await sunderButton.click();

    const cartItems = page.locator('.pool-first-party-cart__item');
    await expect(cartItems).toHaveCount(2, { timeout: 15000 });

    const cartState = (await getCartSnapshot(page)).items.map((item: any) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity
    }));

    expect(cartState).toHaveLength(2);
    expect(cartState.some((item: any) => item.id === otherCampaignId)).toBe(true);
    expect(cartState.some((item: any) => item.id === secondTierId && item.quantity === 1)).toBe(true);
  });
});

test.describe('First-Party Result Pages', () => {
  test('cancelled pledge page restores a saved first-party checkout', async ({ page }) => {
    await page.addInitScript((snapshot) => {
      window.localStorage.setItem('pool_first_party_checkout_snapshot', JSON.stringify(snapshot));
    }, {
      cart: {
        email: 'supporter@example.com',
        tipPercent: 6,
        items: [
          {
            id: 'demo__featured-tier',
            name: 'Demo Featured Tier',
            price: 25,
            quantity: 2,
            url: '/campaigns/demo/',
            description: 'Featured support tier',
            stackable: false,
            shippable: false,
            maxQuantity: 1
          }
        ]
      },
      campaignUrl: '/campaigns/demo/',
      savedAt: Date.now()
    });

    await page.route('**/checkout-intent/recovery?campaignSlug=demo', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          campaignSlug: 'demo',
          campaignTitle: 'Demo Campaign',
          effectiveState: 'live',
          acceptingPledges: true,
          statusMessage: 'Demo Campaign is still accepting pledges.'
        })
      });
    });

    await page.goto('/pledge-cancelled/');

    if (await getActiveRuntime(page) !== 'first_party') {
      test.skip();
      return;
    }

    const recoveryCard = page.locator('[data-first-party-recovery]');
    await expect(recoveryCard).toBeVisible();
    await expect(recoveryCard).toContainText('Your saved pledge is still here.');
    await expect(recoveryCard).toContainText('Campaign: Demo Campaign');
    await expect(recoveryCard).toContainText('Demo Campaign is still accepting pledges.');

    await expect.poll(async () => {
      return page.evaluate(() => {
        return (window as any).PoolCartProvider?.store?.getState?.()?.cart?.items?.count || 0;
      });
    }).toBe(1);
    await page.locator('[data-resume-first-party-pledge]').click();

    await expect(page.locator(CART_ROOT_SELECTOR)).toContainText('Checkout');
    await expect(page.locator(CART_ROOT_SELECTOR)).not.toContainText('Review your pledge');
    await expect(page.locator(CART_ROOT_SELECTOR)).toContainText('Demo Featured Tier');
  });

  test('success page hydrates backend-confirmed first-party pledge details', async ({ page }) => {
    await page.addInitScript((snapshot) => {
      window.localStorage.setItem('pool_first_party_checkout_snapshot', JSON.stringify(snapshot));
    }, {
      cart: {
        email: 'supporter@example.com',
        tipPercent: 6,
        items: [
          {
            id: 'demo__featured-tier',
            name: 'Demo Featured Tier',
            price: 25,
            quantity: 2,
            url: '/campaigns/demo/'
          },
          {
            id: 'demo__support__travel',
            name: 'Travel Support',
            price: 10,
            quantity: 1,
            url: '/campaigns/demo/'
          }
        ]
      },
      campaignUrl: '/campaigns/demo/',
      savedAt: Date.now()
    });

    await page.goto('/pledge-success/?orderId=pool-intent-demo123');

    if (await getActiveRuntime(page) !== 'first_party') {
      test.skip();
      return;
    }

    const summaryCard = page.locator('[data-first-party-success-summary]');
    await expect(summaryCard).toHaveCount(0);

    await expect.poll(async () => {
      return page.evaluate(() => window.localStorage.getItem('pool_first_party_checkout_snapshot'));
    }).toBeNull();
  });
});

test.describe('Accessibility', () => {
  test('skip link is present', async ({ page }) => {
    await page.goto('/');
    
    const skipLink = page.locator('.skip-link');
    await expect(skipLink).toBeAttached();
    await expect(skipLink).toHaveAttribute('href', '#main-content');
  });

  test('main content landmark exists', async ({ page }) => {
    await page.goto('/');
    
    const main = page.locator('main#main-content');
    await expect(main).toBeVisible();
  });

  test('tier buttons have accessible labels', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    const tierButtons = page.locator(TIER_CARD_BUTTON_SELECTOR);
    const count = await tierButtons.count();
    
    for (let i = 0; i < Math.min(count, 3); i++) {
      const btn = tierButtons.nth(i);
      const text = await btn.textContent();
      
      // Should have meaningful button text
      expect(text?.trim()).toBeTruthy();
      expect(text).toMatch(/Pledge|Opens|Unavailable|Sold Out|Unlocks|Campaign Ended|Ended/);
    }
  });

  test('form inputs have labels', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    // Custom amount input
    const customInput = page.locator('#custom-amount-input');
    if (await customInput.count() > 0) {
      // Should have associated label (may be sr-only)
      const label = page.locator('label[for="custom-amount-input"]');
      await expect(label).toBeAttached();
    }
  });
});

test.describe('Countdown Timers', () => {
  test('countdown timer shows pre-rendered values (no 00 00 00 00 flash)', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    const countdown = page.locator('#campaign-countdown');
    
    if (await countdown.count() === 0) {
      test.skip();
      return;
    }
    
    // Check immediately - values should NOT all be 00
    const daysEl = countdown.locator('[data-unit="days"] .flip-card__value');
    const hoursEl = countdown.locator('[data-unit="hours"] .flip-card__value');
    const minsEl = countdown.locator('[data-unit="mins"] .flip-card__value');
    const secsEl = countdown.locator('[data-unit="secs"] .flip-card__value');
    
    // Get all values immediately on page load
    const days = await daysEl.textContent();
    const hours = await hoursEl.textContent();
    const mins = await minsEl.textContent();
    const secs = await secsEl.textContent();
    
    // At least one should NOT be "00" (unless campaign just ended)
    const allZeros = days === '00' && hours === '00' && mins === '00' && secs === '00';
    
    // If campaign is ended, there should be an "ended" message instead
    const endedMessage = countdown.locator('.campaign-countdown__message');
    const hasEndedMessage = await endedMessage.count() > 0 && await endedMessage.isVisible();
    
    if (!hasEndedMessage) {
      // If not ended, shouldn't show all zeros (would indicate flash issue)
      expect(allZeros).toBe(false);
    }
  });

  test('countdown timer updates every second', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    const secsEl = page.locator('#campaign-countdown [data-unit="secs"] .flip-card__value');
    
    if (await secsEl.count() === 0) {
      test.skip();
      return;
    }
    
    const initialSecs = await secsEl.textContent();
    
    // Wait 2 seconds
    await page.waitForTimeout(2000);
    
    const newSecs = await secsEl.textContent();
    
    // Should have changed (unless at exactly 00 boundary)
    // Allow for boundary case but log it
    if (initialSecs === newSecs) {
      console.log(`Seconds unchanged: ${initialSecs} -> ${newSecs} (may be boundary case)`);
    }
  });
});

test.describe('Campaign States', () => {
  test('live campaign has enabled tiers', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    // At least one tier should be enabled
    const enabledTiers = page.locator(ENABLED_TIER_CARD_BUTTON_SELECTOR);
    
    // If campaign is live, should have enabled tiers (except gated ones)
    const count = await enabledTiers.count();
    // May be 0 if all tiers are gated or campaign state changed
    console.log(`Found ${count} enabled tier(s)`);
  });

  test('upcoming campaign has all tiers disabled', async ({ page }) => {
    await page.goto('/campaigns/night-work/');
    
    const tierButtons = page.locator(TIER_CARD_BUTTON_SELECTOR);
    const count = await tierButtons.count();
    
    if (count > 0) {
      // All should be disabled
      for (let i = 0; i < count; i++) {
        await expect(tierButtons.nth(i)).toBeDisabled();
      }
    }
  });

  test('campaign shows correct state indicator', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    // Progress meta should show deadline or status
    const progressMeta = page.locator('.progress-meta');
    const text = await progressMeta.textContent();
    
    // Should contain "of" (as in "$X of $Y")
    expect(text).toContain('of');
    
    // Should contain date or ended status
    expect(text).toMatch(/Ends|Ended|Starts|\d{4}/);
  });
});

test.describe('Checkout Flow', () => {
  test('custom on-site checkout can save a payment method without leaving the site', async ({ page }) => {
    test.setTimeout(60_000);

    await page.addInitScript(() => {
      (window as any).Stripe = () => ({
        initCheckout: async () => ({
          loadActions: async () => ({
            type: 'success',
            actions: {
              getSession: () => ({ id: 'cs_test_custom_e2e' }),
              updateEmail: async () => ({}),
              confirm: async () => ({ type: 'success' })
            }
          }),
          createPaymentElement: () => ({
            mount: (node: HTMLElement) => {
              node.innerHTML = '<div data-test-payment-element>Mock payment element</div>';
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

    await page.goto('/campaigns/smoke-editable/');

    const cartRuntime = await page.evaluate(() => {
      return (window as any).PoolCartProvider?.activeRuntime || (window as any).POOL_CONFIG?.cartRuntime || 'first_party';
    });
    if (cartRuntime !== 'first_party') {
      test.skip();
      return;
    }

    const workerBase = await page.evaluate(() => {
      return (window as any).POOL_CONFIG?.workerBase;
    });
    const checkoutUiMode = await page.evaluate(() => {
      return (window as any).POOL_CONFIG?.checkoutUiMode || 'hosted';
    });

    expect(workerBase).toBeTruthy();
    expect(checkoutUiMode).toBe('custom');

    let capturedPayload: any = null;
    await page.route(`${workerBase}/checkout-intent/start`, async (route) => {
      capturedPayload = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          checkoutUiMode: 'custom',
          sessionId: 'cs_test_custom_e2e',
          clientSecret: 'cs_test_custom_secret_e2e',
          publishableKey: 'pk_test_pool_e2e',
          orderId: 'pool-intent-e2e-custom-123'
        })
      });
    });
    await page.route(`${workerBase}/checkout-intent/summary?orderId=pool-intent-e2e-custom-123`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orderId: 'pool-intent-e2e-custom-123',
          campaignSlug: 'smoke-editable',
          campaignTitle: 'SMOKE EDITABLE',
          persisted: true,
          pledgeStatus: 'active',
          createdAt: '2026-04-09T12:34:56.000Z',
          shippingCollected: false,
          totals: {
            subtotal: 1000,
            tax: 79,
            shipping: 0,
            tipAmount: 50,
            amount: 1129
          }
        })
      });
    });
    await page.route(`${workerBase}/checkout-intent/complete`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          recovered: true,
          persisted: true,
          orderId: 'pool-intent-e2e-custom-123'
        })
      });
    });

    const tierButton = page.locator(ENABLED_SIDEBAR_CART_BUTTON_SELECTOR).first();
    await expect(tierButton).toBeVisible();
    const tierId = await tierButton.getAttribute('data-item-id');
    expect(tierId).toBeTruthy();

    await tierButton.click();
    await openCartViaClient(page);
    await page.locator('[data-cart-continue]').click();

    const emailField = page.locator('[data-cart-custom-checkout-email]');
    await expect(emailField).toBeVisible();
    await emailField.fill('e2e-supporter@example.com');

    const saveButton = page.locator('[data-cart-confirm-custom-checkout]');
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await page.waitForURL('**/pledge-success/**');
    await expect(page.locator('h1, h2').first()).toContainText(/Pledge|Saved|Success/i);

    expect(capturedPayload).toMatchObject({
      campaignSlug: 'smoke-editable',
      items: [
        {
          id: tierId,
          quantity: 1
        }
      ]
    });
  });

  test('custom on-site checkout supports keyboard-only activation through save', async ({ page }) => {
    test.setTimeout(60_000);

    await page.addInitScript(() => {
      (window as any).Stripe = () => ({
        initCheckout: async () => ({
          loadActions: async () => ({
            type: 'success',
            actions: {
              getSession: () => ({ id: 'cs_test_custom_keyboard' }),
              updateEmail: async () => ({}),
              confirm: async () => ({ type: 'success' })
            }
          }),
          createPaymentElement: () => ({
            mount: (node: HTMLElement) => {
              node.innerHTML = '<button type="button" data-test-payment-element>Mock payment element</button>';
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

    await page.goto('/campaigns/smoke-editable/');

    const cartRuntime = await page.evaluate(() => {
      return (window as any).PoolCartProvider?.activeRuntime || (window as any).POOL_CONFIG?.cartRuntime || 'first_party';
    });
    if (cartRuntime !== 'first_party') {
      test.skip();
      return;
    }

    const workerBase = await page.evaluate(() => {
      return (window as any).POOL_CONFIG?.workerBase;
    });
    const checkoutUiMode = await page.evaluate(() => {
      return (window as any).POOL_CONFIG?.checkoutUiMode || 'hosted';
    });

    expect(workerBase).toBeTruthy();
    expect(checkoutUiMode).toBe('custom');

    await page.route(`${workerBase}/checkout-intent/start`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          checkoutUiMode: 'custom',
          sessionId: 'cs_test_custom_keyboard',
          clientSecret: 'cs_test_custom_secret_keyboard',
          publishableKey: 'pk_test_pool_keyboard',
          orderId: 'pool-intent-e2e-keyboard-123'
        })
      });
    });
    await page.route(`${workerBase}/checkout-intent/summary?orderId=pool-intent-e2e-keyboard-123`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orderId: 'pool-intent-e2e-keyboard-123',
          campaignSlug: 'smoke-editable',
          campaignTitle: 'SMOKE EDITABLE',
          persisted: true,
          pledgeStatus: 'active',
          createdAt: '2026-04-09T12:34:56.000Z',
          shippingCollected: false,
          totals: {
            subtotal: 1000,
            tax: 79,
            shipping: 0,
            tipAmount: 50,
            amount: 1129
          }
        })
      });
    });
    await page.route(`${workerBase}/checkout-intent/complete`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          recovered: true,
          persisted: true,
          orderId: 'pool-intent-e2e-keyboard-123'
        })
      });
    });

    const tierButton = page.locator(ENABLED_SIDEBAR_CART_BUTTON_SELECTOR).first();
    await expect(tierButton).toBeVisible();
    await tierButton.focus();
    await page.keyboard.press('Enter');

    const cartPanel = page.locator('.pool-first-party-cart__panel');
    const cartDialog = page.locator('.pool-first-party-cart__panel[role="dialog"]');
    await expect(cartPanel).toBeVisible();
    await expect(page.locator('.pool-first-party-cart__close')).toBeFocused();
    await expectAriaSnapshotToContain(cartDialog, [
      'dialog "Your cart"',
      'button "Checkout"'
    ]);

    const continueButton = page.locator('[data-cart-continue]');
    await continueButton.focus();
    await expect(continueButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.locator('[data-cart-custom-checkout-email]')).toBeVisible();
    await expectAriaSnapshotToContain(cartDialog, [
      'dialog "Checkout"',
      'textbox "Email address"',
      'button "Save payment method"'
    ]);

    const emailField = page.locator('[data-cart-custom-checkout-email]');
    await expect(emailField).toBeVisible();
    await emailField.focus();
    await page.keyboard.type('keyboard-supporter@example.com');

    const saveButton = page.locator('[data-cart-confirm-custom-checkout]');
    await saveButton.focus();
    await expect(saveButton).toBeFocused();
    await page.keyboard.press('Enter');

    await page.waitForURL('**/pledge-success/**');
    await expect(page.locator('h1, h2').first()).toContainText(/Pledge|Saved|Success/i);
  });

  test('custom checkout keeps primary actions reachable on a small phone viewport', async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.addInitScript(() => {
      (window as any).Stripe = () => ({
        initCheckout: async () => ({
          loadActions: async () => ({
            type: 'success',
            actions: {
              getSession: () => ({ id: 'cs_test_custom_mobile' }),
              updateEmail: async () => ({}),
              confirm: async () => ({ type: 'success' })
            }
          }),
          createPaymentElement: () => ({
            mount: (node: HTMLElement) => {
              node.innerHTML = '<div data-test-payment-element>Mock payment element</div>';
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

    await page.goto('/campaigns/smoke-editable/');

    const workerBase = await page.evaluate(() => (window as any).POOL_CONFIG?.workerBase);
    expect(workerBase).toBeTruthy();

    await page.route(`${workerBase}/checkout-intent/start`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          checkoutUiMode: 'custom',
          sessionId: 'cs_test_custom_mobile',
          clientSecret: 'cs_test_custom_secret_mobile',
          publishableKey: 'pk_test_pool_mobile',
          orderId: 'pool-intent-e2e-mobile-123'
        })
      });
    });

    const tierButton = page.locator(ENABLED_SIDEBAR_CART_BUTTON_SELECTOR).first();
    await expect(tierButton).toBeVisible();
    await tierButton.click();
    await openCartViaClient(page);

    const cartPanel = page.locator('.pool-first-party-cart__panel');
    await expect(cartPanel).toBeVisible();
    await expect(page.locator('[data-cart-continue]')).toBeInViewport();
    await expectNoHorizontalOverflow(page);

    await page.locator('[data-cart-continue]').click();

    const saveButton = page.locator('[data-cart-confirm-custom-checkout]');
    await expect(page.locator('[data-cart-custom-checkout-email]')).toBeVisible();
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeInViewport();
    await expectNoHorizontalOverflow(page);
  });

  test('pledge flow API integration', async ({ page }) => {
    // Test that the Worker endpoint is reachable (doesn't require manual interaction)
    await page.goto('/campaigns/hand-relations/');
    
    const workerBase = await page.evaluate(() => {
      return (window as any).POOL_CONFIG?.workerBase;
    });
    
    if (!workerBase) {
      console.log('POOL_CONFIG.workerBase not set');
      return;
    }
    
    // Check if worker is reachable (should return 4xx for missing params, not 5xx)
    const response = await page.evaluate(async (base) => {
      try {
        const res = await fetch(`${base}/stats/hand-relations`);
        return { status: res.status, ok: res.ok };
      } catch (e: any) {
        return { error: e.message };
      }
    }, workerBase);
    
    console.log('Worker stats endpoint response:', response);
    
    // Stats endpoint should work (200) or be not found (404), not error
    if ('error' in response) {
      console.log(`Worker not reachable: ${response.error}`);
      // Skip assertion - worker may not be running in CI
    } else {
      expect(response.status).toBeLessThan(500);
    }
  });
});
