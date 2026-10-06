import { test, expect } from '@playwright/test';

const videoId = 'p6jQjvYDcBQ';
const otherVideoId = 'dQw4w9WgXcQ';
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64');

// Match the Worker's read-only hero/content/diary facade contract. Use the real
// built shell, inherited CSP, opaque sandbox and external preview runtime.
function videoFacade(id: string, title: string) {
  return `<div class="hero__video hero__video--youtube hero__video--youtube-facade">
    <img class="hero__video-poster" src="https://i.ytimg.com/vi/${id}/maxres1.jpg" alt="" data-youtube-poster-fallback="https://i.ytimg.com/vi/${id}/hq1.jpg">
    <a class="hero__video-play hero__video-play--youtube" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener noreferrer" aria-label="${title}">Play</a>
  </div>`;
}

for (const locale of ['en', 'es']) {
  test(`protected preview plays YouTube with CSP and sandbox intact (${locale})`, async ({ page, context }) => {
    await page.setViewportSize(locale === 'es' ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    const siteBase = test.info().project.use.baseURL as string;
    const origin = new URL(siteBase).origin;
    const violations: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const players: { url: string; referer?: string }[] = [];
    let denyAccess = false;
    page.on('console', message => {
      if (/violates.*Content Security Policy|blocked script execution/i.test(message.text())) violations.push(message.text());
    });
    await page.route('https://i.ytimg.com/**', route => route.fulfill({
      status: route.request().url().endsWith('/maxres1.jpg') ? 404 : 200,
      contentType: 'image/png', body: tinyPng
    }));
    await page.route('https://www.youtube-nocookie.com/embed/**', async route => {
      const headers = await route.request().allHeaders();
      players.push({ url: route.request().url(), referer: headers.referer });
      await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Test player</title><p>Player loaded</p>' });
    });
    await page.route('**/admin/campaign-preview/hand-relations?*', route => route.fulfill({
      status: denyAccess ? 401 : 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'cache-control': 'private, no-store' },
      body: JSON.stringify(denyAccess ? { error: 'Expired' } : { preview: { html: `<!doctype html><html lang="${locale}"><head>
        <base href="${origin}/"><link rel="stylesheet" href="/assets/main.css">
        </head><body><h1>Preview fixture</h1><main>${videoFacade(videoId, 'Hero video')}
        ${videoFacade(otherVideoId, 'Diary video')}<button disabled>Support</button></main></body></html>` } })
    }));
    await page.goto(`${locale === 'es' ? '/es' : ''}/campaigns/hand-relations/preview/?t=preview-regression`);
    const frame = page.frameLocator('[data-campaign-preview-frame]');
    const dialog = page.locator('[data-preview-video-dialog]');
    const player = dialog.locator('iframe');
    const close = dialog.getByRole('button', { name: locale === 'es' ? 'Cerrar' : 'Close', exact: true });
    await expect(frame.getByRole('heading', { name: 'Preview fixture' })).toBeVisible();
    await expect(page).not.toHaveURL(/\?t=/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow,noarchive');
    await expect(page.locator('[data-campaign-preview-frame]')).toHaveAttribute('sandbox', 'allow-scripts allow-popups allow-presentation');
    await expect(frame.locator('img').first()).toHaveAttribute('src', `https://i.ytimg.com/vi/${videoId}/hq1.jpg`);
    await expect.poll(() => frame.locator('img').first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    expect(players).toHaveLength(0);

    // Messages from the parent or an unrelated frame, unknown IDs, and URLs
    // masquerading as IDs must never create a player.
    await page.evaluate(id => window.postMessage({ type: 'pool:preview-youtube', videoId: id }, '*'), videoId);
    await page.evaluate(() => {
      const unrelated = document.createElement('iframe');
      unrelated.id = 'unrelated-preview';
      unrelated.setAttribute('sandbox', 'allow-scripts');
      unrelated.hidden = true;
      document.body.append(unrelated);
    });
    await page.frameLocator('#unrelated-preview').locator('body').evaluate((_body, id) => {
      window.parent.postMessage({ type: 'pool:preview-youtube', videoId: id }, '*');
    }, videoId);
    await frame.locator('body').evaluate(() => {
      window.parent.postMessage({ type: 'pool:preview-youtube', videoId: 'https://evil.test/embed' }, '*');
      window.parent.postMessage({ type: 'pool:preview-youtube', videoId: 'unknown-video' }, '*');
    });
    await expect(dialog).not.toBeVisible();
    await expect(player).toHaveCount(0);

    await frame.getByRole('link', { name: 'Hero video' }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName(locale === 'es' ? 'Video de la campaña' : 'Campaign video');
    await expect(player).toHaveAttribute('src', `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`);
    await expect(dialog.frameLocator('iframe').getByText('Player loaded')).toBeVisible();
    expect(players).toEqual([{ url: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`, referer: `${origin}/` }]);
    // A real player needs its own origin/storage, unavailable under srcdoc's sandbox.
    expect(await dialog.frameLocator('iframe').locator('body').evaluate(() => {
      localStorage.setItem('preview-player-test', 'ok');
      return localStorage.getItem('preview-player-test');
    })).toBe('ok');
    await expect(close).toBeFocused();
    const bounds = await dialog.boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(player).toHaveCount(0);
    await expect(frame.getByRole('link', { name: 'Hero video' })).toBeFocused();

    await frame.getByRole('link', { name: 'Diary video' }).click();
    await expect(player).toHaveAttribute('src', `https://www.youtube-nocookie.com/embed/${otherVideoId}?autoplay=1&rel=0`);
    await close.click();
    await expect(player).toHaveCount(0);
    await expect(frame.getByRole('link', { name: 'Diary video' })).toBeFocused();
    expect(context.pages()).toHaveLength(1);

    // Losing access during history restoration also closes an active player
    // and prevents the old frame from reopening it.
    await frame.getByRole('link', { name: 'Hero video' }).click();
    await expect(dialog).toBeVisible();
    denyAccess = true;
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await expect(page.locator('[data-campaign-preview-notice]')).toBeVisible();
    await expect(dialog).not.toBeVisible();
    await frame.locator('body').evaluate((_body, id) => window.parent.postMessage({ type: 'pool:preview-youtube', videoId: id }, '*'), videoId);
    await expect(player).toHaveCount(0);
    expect(violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}
