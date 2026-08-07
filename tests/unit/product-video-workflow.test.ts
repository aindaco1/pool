import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  normalizeProductVideoFlow
} from '../../shared/dust-wave-platform/packages/product-video-core/src/index.js';

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(`${root}/${relativePath}`, 'utf8');
}

describe('Pool product-video adapter', () => {
  it('keeps product policy local while using the pinned shared engine', () => {
    const flow = normalizeProductVideoFlow(JSON.parse(read('video/product-demo.smoke-editable.json')));
    const smoke = normalizeProductVideoFlow(JSON.parse(read('tests/fixtures/product-video.smoke.json')));
    const campaign = read('_campaigns/smoke-editable.md');

    expect(flow.name).toBe('smoke-editable-homepage-flow');
    expect(flow.presentation.stylesheetPath).toBe('/assets/capture-presentation.css');
    expect(flow.actions.some((action) => action.action === 'click' && action.selector.includes('smoke-editable__standard-pass'))).toBe(true);
    expect(flow.actions.some((action) => action.action === 'click' && action.selector.includes('smoke-editable__first-time-sexpot-poster'))).toBe(true);
    expect(smoke.capture.fps).toBe(2);
    expect(campaign).toContain('featured_tier_id: standard-pass');
    expect(campaign).toContain('id: standard-pass');
    expect(campaign).toContain('id: smoke-editable__first-time-sexpot-poster');
  });

  it('uses the tracked test config and does not load capture styling in production templates', () => {
    const testConfig = read('_config.test.yml');
    const productionConfig = read('_config.yml');
    const gitignore = read('.gitignore');
    const runtimeHead = read('_includes/cart-runtime-head.html');
    const captureStyles = read('assets/capture-presentation.css');

    expect(testConfig).toContain('show_test_campaigns: true');
    expect(productionConfig).toMatch(/^\s+- tmp\s*$/m);
    expect(gitignore).toMatch(/^tmp\/$/m);
    expect(runtimeHead).not.toContain('capture-presentation.css');
    expect(captureStyles).toContain('data-product-video-capture="true"');
    expect(captureStyles).not.toContain('data-pool-capture');
  });

  it('pins thin capture, render, and smoke commands to the shared Platform CLIs', () => {
    const packageJson = JSON.parse(read('package.json'));
    const wrapper = read('scripts/render-product-demo.sh');

    expect(packageJson.scripts['video:demo:capture']).toBe('./scripts/render-product-demo.sh --capture-only');
    expect(packageJson.scripts['video:demo:render']).toBe('./scripts/render-product-demo.sh');
    expect(packageJson.scripts['test:product-video']).toContain('tests/fixtures/product-video.smoke.json');
    expect(wrapper).toContain('packages/product-video-core/bin/capture-product-video.mjs');
    expect(wrapper).toContain('packages/product-video-core/bin/render-product-video.mjs');
    expect(wrapper).toContain('_config.yml,_config.test.yml');
    expect(wrapper).toContain('if [ "${#FORMATS[@]}" -gt 0 ]');
    expect(wrapper).not.toContain('rm -rf');
  });
});
