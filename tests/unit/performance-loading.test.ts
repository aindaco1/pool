import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..', '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), 'utf8');

describe('Pool performance loading policy', () => {
  it('keeps admin styles out of the public stylesheet', () => {
    expect(read('assets', 'main.scss')).not.toContain('@import "partials/admin"');
    expect(read('assets', 'admin.scss')).toContain('@import "partials/admin"');
    expect(read('_layouts', 'admin.html')).toContain('/assets/admin.css');
  });

  it('defers Adobe display fonts with a no-script fallback', () => {
    const head = read('_includes', 'cart-runtime-head.html');
    expect(head).toContain('media="print" data-deferred-stylesheet="true"');
    expect(head).toContain('<noscript><link rel="stylesheet" href="https://use.typekit.net/hoj2yet.css"></noscript>');
    expect(head).toContain('/assets/js/deferred-stylesheets.js');
    expect(read('assets', 'js', 'deferred-stylesheets.js')).toContain("stylesheet.media = 'all'");
  });

  it('serves campaign-card backgrounds responsively and outside the eager critical path', () => {
    const card = read('_includes', 'campaign-card.html');
    expect(card).toContain('responsive-image.html src=include.campaign.campaign_background');
    expect(card).toContain('picture_class="campaign-card__background-picture"');
    expect(card).toContain('loading="lazy"');
    expect(card).toContain('sizes="(min-width: 900px) 360px, 100vw"');
    expect(read('assets', 'partials', '_cards.scss')).toContain('&__background-picture');
  });

  it('keeps Workers Cache disabled pending representative benefit evidence', () => {
    const config = JSON.parse(read('config', 'performance-budgets.json'));
    expect(config.workersCache.enabled).toBe(false);
    expect(config.workerRoutes.minimumCacheP95ImprovementPercent).toBe(40);
  });
});
