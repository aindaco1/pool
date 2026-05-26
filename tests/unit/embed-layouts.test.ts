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
    const embedBuilder = readRepoFile('_includes', 'campaign-embed-builder.html');

    expect(embedPage).toContain('layout: campaign-embed');
    expect(embedPageEs).toContain('layout: campaign-embed');
    expect(embedPageEs).toContain('lang: es');
    expect(embedPage).toContain('indexable: false');
    expect(embedPage).toContain('campaign-embed-builder.html');
    expect(embedBuilder).toContain('data-campaign-embed-root');
    expect(embedBuilder).toContain('data-campaign-embed-layout');
    expect(embedBuilder).toContain('data-campaign-embed-theme');
    expect(embedBuilder).toContain('data-campaign-embed-media');
    expect(embedBuilder).toContain('data-campaign-embed-cta');
    expect(embedBuilder).toContain('campaign-embed-code-help');
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
    const runtimeMessages = readRepoFile('_includes', 'runtime-messages-json.html');
    const translationsEs = readRepoFile('_data', 'i18n', 'es.yml');

    expect(embedScript).toContain('pool-campaign-embed:resize');
    expect(embedScript).toContain('buildEmbedCode');
    expect(embedScript).toContain('buildResizeHelperScript');
    expect(embedScript).toContain('data-pool-campaign-embed');
    expect(embedScript).toContain('__POOL_CAMPAIGN_EMBED_RESIZE__');
    expect(embedScript).toContain('data-campaign-embed-close');
    expect(embedScript).toContain('layout');
    expect(embedScript).toContain('theme');
    expect(embedScript).toContain('media');
    expect(embedScript).toContain('cta');
    expect(embedScript).toContain('normalizeEmbedOptions');
    expect(embedScript).toContain('embed.iframe_title');
    expect(embedScript).toContain('embed.view_campaign_label');
    expect(embedScript).toContain('embed.creator_label');
    expect(embedScript).toContain('embed.countdown_days');
    expect(embedScript).toContain('embed.raised_label');
    expect(embedScript).toContain('getPercentClass');
    expect(embedScript).toContain('data-progress-width');
    expect(embedScript).toContain('data-progress-left');
    expect(embedScript).toContain("u-width-pct-");
    expect(embedScript).toContain("u-left-pct-");
    expect(embedScript).not.toContain('<span style="width: ');
    expect(embedScript).not.toContain('" style="left: ');
    expect(embedScript).toContain("'/live/'");
    expect(embedScript).toContain('getEmbedPagePath');
    expect(embedScript).toContain('pool-campaign-embed:set-campaign');
    expect(embedScript).toContain('campaignEmbedSyncQuery');
    expect(runtimeMessages).toContain('"embed":');
    expect(translationsEs).toContain('media_label: "Medios"');
    expect(embedStyles).toContain('.campaign-embed-builder');
    expect(embedStyles).toContain('.campaign-embed-builder__option-grid');
    expect(embedStyles).toContain('.campaign-embed-builder__help');
    expect(embedStyles).toContain('.campaign-embed-shell__close');
    expect(embedStyles).toContain('.campaign-embed-widget');
    expect(embedStyles).toContain('.campaign-embed-widget--theme-warm');
    expect(embedStyles).toContain('.campaign-embed-card--compact');
    expect(embedStyles).toContain('.campaign-embed-card__countdown');
    expect(campaignLayout).toContain("key=\"campaign.embed_title\"");
    expect(campaignLayout).toContain("path='/embed/campaign/'");
  });
});
