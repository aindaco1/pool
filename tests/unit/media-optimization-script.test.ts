import { describe, expect, it } from 'vitest';
import {
  normalizeRepoPath,
  publicAssetPathForRepoPath,
  rewriteMediaReferences,
  webmDerivativePathForVideo
} from '../../scripts/optimize-media.mjs';

describe('media optimization script helpers', () => {
  it('normalizes repository asset paths to public URLs', () => {
    expect(normalizeRepoPath('.\\assets\\videos\\campaigns\\their-love\\proof.mp4'))
      .toBe('assets/videos/campaigns/their-love/proof.mp4');
    expect(publicAssetPathForRepoPath('assets/videos/campaigns/their-love/proof.mp4'))
      .toBe('/assets/videos/campaigns/their-love/proof.mp4');
    expect(publicAssetPathForRepoPath('docs/DASHBOARD.md')).toBe('');
  });

  it('derives WebM video paths without changing existing WebM assets', () => {
    expect(webmDerivativePathForVideo('assets/videos/campaigns/their-love/proof.mp4'))
      .toBe('assets/videos/campaigns/their-love/proof.webm');
    expect(webmDerivativePathForVideo('assets/videos/campaigns/their-love/proof.mov'))
      .toBe('assets/videos/campaigns/their-love/proof.webm');
    expect(webmDerivativePathForVideo('assets/videos/campaigns/their-love/proof.webm'))
      .toBe('');
  });

  it('rewrites literal media references only for known generated derivatives', () => {
    const replacements = new Map([
      ['/assets/videos/campaigns/their-love/proof.mp4', '/assets/videos/campaigns/their-love/proof.webm']
    ]);
    const source = [
      'hero_video: /assets/videos/campaigns/their-love/proof.mp4',
      'poster: /assets/images/campaigns/their-love/poster.jpg'
    ].join('\n');

    expect(rewriteMediaReferences(source, replacements)).toBe([
      'hero_video: /assets/videos/campaigns/their-love/proof.webm',
      'poster: /assets/images/campaigns/their-love/poster.jpg'
    ].join('\n'));
  });
});
