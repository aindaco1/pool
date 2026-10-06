import { test, expect } from '@playwright/test';

const videoId = 'p6jQjvYDcBQ';
const otherVideoId = 'dQw4w9WgXcQ';
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64');

// Match the Worker's read-only hero/content/diary facade contract. Use the real
// built shell, inherited CSP, opaque sandbox and external preview runtime.
function videoFacade(id: string, title: string) {
  return `<div class="hero__video hero__video--youtube hero__video--youtube-facade">
    <img class="hero__video-poster" src="https://i.ytimg.com/vi/${id}/maxresdefault.jpg" alt="" data-youtube-poster-fallback="https://i.ytimg.com/vi/${id}/hqdefault.jpg">
    <a class="hero__video-play hero__video-play--youtube" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener noreferrer" aria-label="${title}">Play</a>
  </div>`;
}

for (const locale of ['en', 'es']) {
  test(`protected preview plays YouTube in place with CSP and sandbox intact (${locale})`, async ({ page, context }) => {
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
      status: route.request().url().endsWith('/maxresdefault.jpg') ? 404 : 200,
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
        </head><body><h1>Preview fixture</h1><main><details><summary>Project details</summary>
        <p>Additional project information that moves the video down when expanded.</p></details>${videoFacade(videoId, 'Hero video')}
        ${videoFacade(otherVideoId, 'Diary video')}<button disabled>Support</button>${'<p>Campaign details continue below the videos.</p>'.repeat(30)}</main></body></html>` } })
    }));
    await page.goto(`${locale === 'es' ? '/es' : ''}/campaigns/hand-relations/preview/?t=preview-regression`);
    const frame = page.frameLocator('[data-campaign-preview-frame]');
    const layer = page.locator('[data-preview-video-layer]');
    const player = layer.locator('iframe').first();
    const hero = frame.locator('.hero__video').first();
    const diary = frame.locator('.hero__video').last();
    async function expectAligned(media = hero, video = player) {
      await expect.poll(async () => {
        const slot = await media.boundingBox();
        const playing = await video.boundingBox();
        if (!slot || !playing) return Infinity;
        return Math.max(...(['x', 'y', 'width', 'height'] as const).map(key => Math.abs(slot[key] - playing[key])));
      }).toBeLessThan(1);
    }
    await expect(frame.getByRole('heading', { name: 'Preview fixture' })).toBeVisible();
    await expect(page).not.toHaveURL(/\?t=/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow,noarchive');
    await expect(page.locator('[data-campaign-preview-frame]')).toHaveAttribute('sandbox', 'allow-scripts allow-popups allow-presentation');
    await expect(frame.locator('img').first()).toHaveAttribute('src', `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
    await expect.poll(() => frame.locator('img').first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    expect(players).toHaveLength(0);

    const slot = await frame.getByRole('link', { name: 'Hero video' }).getAttribute('data-preview-video-slot');
    const playMessage = { type: 'pool:preview-youtube', action: 'play', slot, bounds: { x: 0, y: 0, width: 200, height: 113 } };
    // Only the current campaign frame and authorized slots may create players.
    await page.evaluate(message => window.postMessage(message, '*'), playMessage);
    await page.evaluate(() => {
      const unrelated = document.createElement('iframe');
      unrelated.id = 'unrelated-preview';
      unrelated.setAttribute('sandbox', 'allow-scripts');
      unrelated.hidden = true;
      document.body.append(unrelated);
    });
    await page.frameLocator('#unrelated-preview').locator('body').evaluate((_body, message) => {
      window.parent.postMessage(message, '*');
    }, playMessage);
    await frame.locator('body').evaluate((_body, message) => {
      window.parent.postMessage({ ...message, slot: 'unknown-video' }, '*');
      window.parent.postMessage({ ...message, slot: 'https://evil.test/embed' }, '*');
      window.parent.postMessage({ ...message, bounds: { x: 0, y: 0, width: Infinity, height: 20 } }, '*');
      window.parent.postMessage({ ...message, bounds: { x: 0, y: 0, width: 10000, height: 20 } }, '*');
      window.parent.postMessage({ ...message, action: 'layout' }, '*');
    }, playMessage);
    await expect(layer.locator('iframe')).toHaveCount(0);

    await frame.getByRole('link', { name: 'Hero video' }).focus();
    await page.keyboard.press('Enter');
    await expect(player).toHaveAttribute('src', `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`);
    await expect(player).toHaveAccessibleName('Hero video');
    await expect(layer.frameLocator('iframe').getByText('Player loaded')).toBeVisible();
    expect(players).toEqual([{ url: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`, referer: `${origin}/` }]);
    expect(await layer.frameLocator('iframe').locator('body').evaluate(() => {
      localStorage.setItem('preview-player-test', 'ok');
      return localStorage.getItem('preview-player-test');
    })).toBe('ok');
    await expect(player).toBeFocused();
    await expect(page.locator('dialog[open], [aria-modal="true"]')).toHaveCount(0);
    await expectAligned();

    // The surrounding project stays usable, and layout shifts, resizing, and
    // both scroll containers preserve the media's original position and size.
    await frame.getByText('Project details', { exact: true }).click();
    await expect(frame.locator('details')).toHaveAttribute('open', '');
    await expectAligned();
    await page.setViewportSize(locale === 'es' ? { width: 430, height: 900 } : { width: 1280, height: 800 });
    await expectAligned();
    await frame.locator('body').evaluate(() => window.scrollTo(0, 300));
    await expect.poll(() => frame.locator('body').evaluate(() => window.scrollY)).toBe(300);
    await expectAligned();
    await page.evaluate(() => window.scrollBy(0, 120));
    await expectAligned();
    expect(players).toHaveLength(1); // Alignment never restarts playback.

    await frame.getByRole('link', { name: 'Diary video' }).click();
    const diaryPlayer = layer.locator('iframe').last();
    await expect(diaryPlayer).toHaveAttribute('src', `https://www.youtube-nocookie.com/embed/${otherVideoId}?autoplay=1&rel=0`);
    await expect(layer.locator('iframe')).toHaveCount(2);
    await expectAligned(diary, diaryPlayer);
    await expectAligned();
    // Even when scrolled above the preview, the hero cannot cover its header.
    const clip = await layer.boundingBox();
    expect(await layer.evaluate(element => getComputedStyle(element).overflow)).toBe('hidden');
    expect(clip!.height).toBeLessThanOrEqual((await page.locator('[data-campaign-preview-frame]').boundingBox())!.height);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByRole('heading', { name: locale === 'es' ? 'Vista previa' : 'Preview', exact: true })).toBeVisible();
    const heading = await page.getByRole('heading', { name: locale === 'es' ? 'Vista previa' : 'Preview', exact: true }).boundingBox();
    expect(await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.closest('[data-preview-video-layer]') === null,
      { x: heading!.x + heading!.width / 2, y: heading!.y + heading!.height / 2 })).toBe(true);
    expect(context.pages()).toHaveLength(1);

    // Access loss destroys every player and rejects messages from the old frame.
    denyAccess = true;
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await expect(page.locator('[data-campaign-preview-notice]')).toBeVisible();
    await frame.locator('body').evaluate((_body, message) => window.parent.postMessage(message, '*'), playMessage);
    await expect(layer.locator('iframe')).toHaveCount(0);
    expect(violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}
