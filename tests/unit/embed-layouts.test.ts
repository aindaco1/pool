import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
}

describe('campaign embed surface', () => {
  it('ships a dedicated embed page and layout that stay out of indexing', () => {
    const embedPage = readRepoFile('embed', 'campaign', 'index.html');
    const embedPageEs = readRepoFile('es', 'embed', 'campaign', 'index.html');
    const embedLayout = readRepoFile('_layouts', 'campaign-embed.html');

    expect(embedPage).toContain('layout: campaign-embed');
    expect(embedPageEs).toContain('layout: campaign-embed');
    expect(embedPageEs).toContain('lang: es');
    expect(embedPage).toContain('indexable: false');
    expect(embedPage).toContain('data-campaign-embed-root');
    expect(embedPage).toContain('data-campaign-embed-layout');
    expect(embedPage).toContain('data-campaign-embed-theme');
    expect(embedPage).toContain('data-campaign-embed-media');
    expect(embedLayout).toContain('indexable=false');
    expect(embedLayout).toContain('data-campaign-embed-close');
    expect(embedLayout).toContain('/assets/js/campaign-embed.js');
    expect(embedLayout).toContain('data-pool-config-script="true"');
  });

  it('extends the static campaign payload with the fields the embed needs', () => {
    const campaignsApi = readRepoFile('api', 'campaigns.json');

    expect(campaignsApi).toContain('"url":');
    expect(campaignsApi).toContain('"creator_name":');
    expect(campaignsApi).toContain('"category":');
    expect(campaignsApi).toContain('"short_blurb_html":');
    expect(campaignsApi).toContain('"hero_video":');
    expect(campaignsApi).toContain('"progress_background":');
  });

  it('includes a dedicated embed client and styles for generator + live widget rendering', () => {
    const embedScript = readRepoFile('assets', 'js', 'campaign-embed.js');
    const embedStyles = readRepoFile('assets', 'partials', '_embed.scss');
    const campaignLayout = readRepoFile('_layouts', 'campaign.html');

    expect(embedScript).toContain('pool-campaign-embed:resize');
    expect(embedScript).toContain('buildEmbedCode');
    expect(embedScript).toContain('buildResizeHelperScript');
    expect(embedScript).toContain('data-pool-campaign-embed');
    expect(embedScript).toContain('__POOL_CAMPAIGN_EMBED_RESIZE__');
    expect(embedScript).toContain('data-campaign-embed-close');
    expect(embedScript).toContain('layout');
    expect(embedScript).toContain('theme');
    expect(embedScript).toContain('media');
    expect(embedScript).toContain('normalizeEmbedOptions');
    expect(embedScript).toContain("'/live/'");
    expect(embedScript).toContain('window.location.pathname');
    expect(embedStyles).toContain('.campaign-embed-builder');
    expect(embedStyles).toContain('.campaign-embed-builder__option-grid');
    expect(embedStyles).toContain('.campaign-embed-shell__close');
    expect(embedStyles).toContain('.campaign-embed-widget');
    expect(embedStyles).toContain('.campaign-embed-widget--theme-warm');
    expect(embedStyles).toContain('.campaign-embed-card--compact');
    expect(embedStyles).toContain('.campaign-embed-card__countdown');
    expect(campaignLayout).toContain("key=\"campaign.embed_title\"");
    expect(campaignLayout).toContain("path='/embed/campaign/'");
  });
});
