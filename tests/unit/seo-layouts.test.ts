import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
}

describe('SEO templates', () => {
  it('routes public layouts through the shared seo include', () => {
    const defaultLayout = readRepoFile('_layouts', 'default.html');
    const campaignLayout = readRepoFile('_layouts', 'campaign.html');

    expect(defaultLayout).toContain('{% include seo-meta.html');
    expect(campaignLayout).toContain('{% include seo-meta.html');
    expect(defaultLayout).toContain('{% include seo-json-ld.html');
    expect(campaignLayout).toContain('{% include seo-json-ld.html');
    expect(defaultLayout).toContain('translation_key=page.translation_key');
    expect(campaignLayout).toContain('translation_key=page.translation_key');
  });

  it('marks private pledge and supporter layouts as noindex', () => {
    const manageLayout = readRepoFile('_layouts', 'manage.html');
    const communityLayout = readRepoFile('_layouts', 'community.html');
    const pledgeResultLayout = readRepoFile('_layouts', 'pledge-result.html');

    expect(manageLayout).toContain('indexable=false');
    expect(communityLayout).toContain('indexable=false');
    expect(pledgeResultLayout).toContain('indexable=false');
  });

  it('publishes crawl files with a sitemap and private-route exclusions', () => {
    const robots = readRepoFile('robots.txt');
    const sitemap = readRepoFile('sitemap.xml');
    const config = readRepoFile('_config.yml');

    expect(robots).toContain('Sitemap: {{ site.platform.site_url | default: site.url }}/sitemap.xml');
    expect(robots).toContain('Disallow: /manage/');
    expect(robots).toContain('Disallow: /pledge-success/');
    expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(sitemap).toContain("item.layout == 'default'");
    expect(sitemap).toContain("item.test_only != true");
    expect(sitemap).toContain('<lastmod>');
    expect(config).toContain('campaigns_index:');
    expect(config).toContain('en: /campaigns/');
    expect(config).toContain('es: /es/campaigns/');
  });

  it('keeps the public community hub pointing at public campaign pages', () => {
    const communityIndex = readRepoFile('_includes', 'community-index-page.html');

    expect(communityIndex).toContain('href="{{ campaign.url }}"');
    expect(communityIndex).not.toContain('/community/{{ campaign.slug }}/');
    expect(communityIndex).toContain('community.index_supporter_note');
  });

  it('emits richer social metadata for locale and image alt text', () => {
    const seoMeta = readRepoFile('_includes', 'seo-meta.html');

    expect(seoMeta).toContain('og:locale');
    expect(seoMeta).toContain('og:locale:alternate');
    expect(seoMeta).toContain('og:image:alt');
    expect(seoMeta).toContain('twitter:image:alt');
    expect(seoMeta).toContain('site.seo.default_social_image_alt');
    expect(seoMeta).toContain('site.seo.og_locale_overrides');
  });

  it('adds a crawlable public campaigns archive route and navigation link', () => {
    const header = readRepoFile('_includes', 'header.html');
    const archiveInclude = readRepoFile('_includes', 'campaign-archive-page.html');
    const campaignsPage = readRepoFile('campaigns.md');
    const campaignsPageEs = readRepoFile('es', 'campaigns.md');

    expect(header).toContain("translation_key='campaigns_index'");
    expect(archiveInclude).toContain('campaign-card.html');
    expect(archiveInclude).toContain('campaign_archive.title');
    expect(campaignsPage).toContain('translation_key: campaigns_index');
    expect(campaignsPageEs).toContain('translation_key: campaigns_index');
  });
});
