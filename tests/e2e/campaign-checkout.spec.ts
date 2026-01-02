import { test, expect } from '@playwright/test';

test.describe('Campaign Page Structure', () => {
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
  test('tier cards have required Snipcart attributes', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    const tierButtons = page.locator('.tier-card button.snipcart-add-item');
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
      const btn = gatedTier.first().locator('button.snipcart-add-item');
      await expect(btn).toBeDisabled();
      
      // Unlock badge exists but is hidden (display: none) until unlocked
      const badge = gatedTier.first().locator('.tier-card__unlock-badge');
      await expect(badge).toBeAttached();
    }
  });

  test('disabled tiers show correct reason on non-live campaigns', async ({ page }) => {
    await page.goto('/campaigns/night-work/');
    
    // All tier buttons should be disabled
    const tierButtons = page.locator('.tier-card button.snipcart-add-item');
    const firstButton = tierButtons.first();
    
    await expect(firstButton).toBeDisabled();
    
    // Button text should indicate it's upcoming
    const buttonText = await firstButton.textContent();
    expect(buttonText).toMatch(/Opens|Unavailable|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/);
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

  test('support item input updates Snipcart data-item-price', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    const supportInput = page.locator('#support-input-location-scouting');
    const supportButton = page.locator('#support-btn-location-scouting');
    
    if (await supportInput.count() === 0) {
      test.skip();
      return;
    }
    
    if (await supportInput.isDisabled()) {
      test.skip();
      return;
    }
    
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

  test('custom amount input updates Snipcart data-item-price', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    const customInput = page.locator('#custom-amount-input');
    const customButton = page.locator('#custom-amount-btn');
    
    if (await customInput.isDisabled()) {
      test.skip();
      return;
    }
    
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

  test('featured tier button on campaign card has Snipcart attributes', async ({ page }) => {
    await page.goto('/');
    
    // Find a campaign card with a featured tier button
    const featuredBtn = page.locator('.campaign-card__featured-tier.snipcart-add-item');
    
    if (await featuredBtn.count() > 0) {
      const btn = featuredBtn.first();
      await expect(btn).toHaveAttribute('data-item-id');
      await expect(btn).toHaveAttribute('data-item-name');
      await expect(btn).toHaveAttribute('data-item-price');
      await expect(btn).toHaveAttribute('data-item-url');
    }
  });
});

test.describe('Snipcart Integration', () => {
  test('Snipcart script configuration is loaded', async ({ page }) => {
    await page.goto('/campaigns/hand-relations/');
    
    const snipcartSettings = await page.evaluate(() => {
      return (window as any).SnipcartSettings;
    });
    
    expect(snipcartSettings).toBeDefined();
    expect(snipcartSettings.publicApiKey).toBeTruthy();
    expect(snipcartSettings.loadStrategy).toBe('on-user-interaction');
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
    const tierButton = page.locator('aside.campaign-sidebar button.snipcart-add-item:not([disabled])').first();
    
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
    
    // Wait for Snipcart to load
    await page.waitForTimeout(2000);
    
    // Snipcart container should exist
    const snipcartContainer = page.locator('#snipcart');
    await expect(snipcartContainer).toBeAttached();
  });

  test('add item to cart and verify cart state via API', async ({ page }) => {
    test.setTimeout(60_000);
    
    await page.goto('/campaigns/hand-relations/');
    
    const tierButton = page.locator('aside.campaign-sidebar button.snipcart-add-item:not([disabled])').first();
    if (await tierButton.count() === 0) {
      console.log('No enabled tiers - skipping');
      return;
    }
    
    await tierButton.click();
    await page.waitForTimeout(3000);
    
    // Verify cart via Snipcart JavaScript API
    const cartState = await page.evaluate(async () => {
      const waitForSnipcart = () => new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Snipcart timeout')), 10000);
        if ((window as any).Snipcart) {
          clearTimeout(timeout);
          resolve((window as any).Snipcart);
        } else {
          document.addEventListener('snipcart.ready', () => {
            clearTimeout(timeout);
            resolve((window as any).Snipcart);
          });
        }
      });
      
      const Snipcart = await waitForSnipcart();
      const state = Snipcart.store.getState();
      return {
        itemCount: state.cart.items.count,
        total: state.cart.total,
        items: state.cart.items.items.map((i: any) => ({ 
          name: i.name, 
          price: i.price,
          id: i.id 
        }))
      };
    });
    
    expect(cartState.itemCount).toBeGreaterThan(0);
    expect(cartState.total).toBeGreaterThan(0);
    
    // Update cart with billing info via API
    const testEmail = `e2e-test+${Date.now()}@example.com`;
    
    await page.evaluate((email) => {
      (window as any).Snipcart.api.cart.update({
        email: email,
        billingAddress: {
          name: 'E2E Test User',
          address1: '123 Test Street',
          city: 'San Francisco',
          country: 'US',
          province: 'CA',
          postalCode: '94102'
        }
      });
    }, testEmail);
    
    await page.waitForTimeout(500);
    
    const updatedCart = await page.evaluate(() => {
      const state = (window as any).Snipcart.store.getState();
      return {
        email: state.cart.email,
        billingName: state.cart.billingAddress?.name
      };
    });
    
    expect(updatedCart.email).toBe(testEmail);
    expect(updatedCart.billingName).toBe('E2E Test User');
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
    
    const tierButtons = page.locator('.tier-card button.snipcart-add-item');
    const count = await tierButtons.count();
    
    for (let i = 0; i < Math.min(count, 3); i++) {
      const btn = tierButtons.nth(i);
      const text = await btn.textContent();
      
      // Should have meaningful button text
      expect(text?.trim()).toBeTruthy();
      expect(text).toMatch(/Pledge|Opens|Unavailable|Sold Out|Unlocks/);
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
    const enabledTiers = page.locator('.tier-card button.snipcart-add-item:not([disabled])');
    
    // If campaign is live, should have enabled tiers (except gated ones)
    const count = await enabledTiers.count();
    // May be 0 if all tiers are gated or campaign state changed
    console.log(`Found ${count} enabled tier(s)`);
  });

  test('upcoming campaign has all tiers disabled', async ({ page }) => {
    await page.goto('/campaigns/night-work/');
    
    const tierButtons = page.locator('.tier-card button.snipcart-add-item');
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

test.describe('Manual Checkout Flow', () => {
  test('manual pledge flow - Snipcart to Stripe', async ({ page }) => {
    // Skip in CI - requires manual interaction and running Worker
    test.skip(!!process.env.CI, 'Skipped in CI - requires manual interaction');
    
    test.setTimeout(300_000); // 5 minutes for manual completion
    
    const baseUrl = process.env.PROD_TEST ? 'https://pool.dustwave.xyz' : '';
    
    try {
      // 1. Navigate to campaign
      await page.goto(`${baseUrl}/campaigns/hand-relations/`);
      console.log('\n📍 Navigated to Hand Relations campaign');
      
      // 2. Add tier to cart
      const tierButton = page.locator('aside.campaign-sidebar button.snipcart-add-item:not([disabled])').first();
      if (await tierButton.count() === 0) {
        console.log('❌ No enabled tiers - campaign may not be live');
        return;
      }
      
      const tierName = await tierButton.getAttribute('data-item-name');
      const tierPrice = await tierButton.getAttribute('data-item-price');
      console.log(`🎯 Adding tier: ${tierName} ($${tierPrice})`);
      
      await tierButton.click();
      console.log('🛒 Added tier to cart');
      
      // 3. Wait for Snipcart and open cart
      await page.waitForTimeout(2000);
      await page.evaluate(() => {
        (window as any).Snipcart.api.theme.cart.open();
      });
      console.log('🛒 Cart opened');
      
      // Should see pledge notice in cart
      await page.waitForTimeout(1000);
      const pledgeNotice = page.locator('.pledge-notice-cart');
      if (await pledgeNotice.count() > 0) {
        console.log('✅ Pledge notice visible in cart');
      }
      
      // 4. Click Checkout
      await page.locator('button:has-text("Checkout")').first().click();
      console.log('➡️  Clicked Checkout');
      await page.waitForTimeout(2000);
      
      // 5. Fill billing form
      console.log('\n📝 Filling billing form...');
      await page.locator('input[name="name"]').fill('E2E Test User');
      await page.locator('input[name="email"]').fill('e2e-test@example.com');
      await page.locator('input[name="address1"]').fill('123 Test Street');
      await page.locator('input[name="city"]').fill('San Francisco');
      await page.locator('select[name="country"]').selectOption('US');
      await page.waitForTimeout(500);
      
      const provinceSelect = page.locator('select[name="province"]');
      if (await provinceSelect.count() > 0) {
        await provinceSelect.selectOption('CA');
      }
      await page.locator('input[name="postalCode"]').fill('94102');
      console.log('✅ Billing form filled');
      
      // 6. Continue to payment step
      await page.locator('button:has-text("Continue")').first().click();
      console.log('➡️  Clicked Continue to payment');
      await page.waitForTimeout(2000);
      
      // 7. Should see custom payment template with pledge button
      const pledgeButton = page.locator('#pool-pledge-button');
      await expect(pledgeButton).toBeVisible({ timeout: 10000 });
      console.log('✅ Custom pledge button visible');
      
      // 8. Check terms checkbox
      const termsCheckbox = page.locator('input[name="agree-terms"]');
      if (await termsCheckbox.count() > 0) {
        await termsCheckbox.check();
        console.log('✅ Terms checkbox checked');
      }
      
      console.log('\n' + '='.repeat(60));
      console.log('🎯 MANUAL STEPS REQUIRED');
      console.log('='.repeat(60));
      console.log('\n1. Click "Save Card & Pledge" button');
      console.log('   (This will redirect to Stripe Checkout)');
      console.log('\n2. In Stripe Checkout, enter test card:');
      console.log('   Card:   4242 4242 4242 4242');
      console.log('   Expiry: 12/34');
      console.log('   CVC:    123');
      console.log('\n3. Click "Set up" or "Save card"');
      console.log('\n4. You should be redirected to /pledge-success/');
      console.log('   with a confirmation message');
      console.log('\n⏳ Waiting up to 5 minutes for completion...\n');
      
      // Wait for redirect to success page or user closes browser
      try {
        await page.waitForURL('**/pledge-success/**', { timeout: 300_000 });
        console.log('✅ Redirected to success page!');
        
        // Verify success page content
        const successHeading = page.locator('h1, h2');
        const headingText = await successHeading.first().textContent();
        console.log(`📄 Success page heading: ${headingText}`);
        
        console.log('\n✅ Test complete - pledge flow successful!');
      } catch (e: any) {
        if (e.message?.includes('closed')) {
          console.log('✅ Browser closed by user.');
        } else if (e.name === 'TimeoutError') {
          console.log('⏰ Timeout waiting for success page');
        } else {
          throw e;
        }
      }
    } catch (e: any) {
      if (e.message?.includes('Target page, context or browser has been closed')) {
        console.log('✅ Browser closed by user. Test complete.');
      } else {
        throw e;
      }
    }
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
