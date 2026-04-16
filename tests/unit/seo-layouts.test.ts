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

    expect(robots).toContain('Sitemap: {{ site.platform.site_url | default: site.url }}/sitemap.xml');
    expect(robots).toContain('Disallow: /manage/');
    expect(robots).toContain('Disallow: /pledge-success/');
    expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(sitemap).toContain("item.layout == 'default'");
    expect(sitemap).toContain("item.test_only != true");
    expect(sitemap).toContain('<lastmod>');
  });

  it('keeps the public community hub pointing at public campaign pages', () => {
    const communityIndex = readRepoFile('_includes', 'community-index-page.html');

    expect(communityIndex).toContain('href="{{ campaign.url }}"');
    expect(communityIndex).not.toContain('/community/{{ campaign.slug }}/');
    expect(communityIndex).toContain('community.index_supporter_note');
  });

  it('emits richer social metadata for locale and image alt text', () => {
    const seoMeta = readRepoFile('_includes', 'seo-meta.html');
    const campaignLayout = readRepoFile('_layouts', 'campaign.html');
    const translationsEn = readRepoFile('_data', 'i18n', 'en.yml');
    const translationsEs = readRepoFile('_data', 'i18n', 'es.yml');

    expect(seoMeta).toContain('og:locale');
    expect(seoMeta).toContain('og:locale:alternate');
    expect(seoMeta).toContain('og:image:alt');
    expect(seoMeta).toContain('twitter:image:alt');
    expect(seoMeta).toContain('site.seo.default_social_image_alt');
    expect(seoMeta).toContain('site.seo.og_locale_overrides');
    expect(campaignLayout).toContain('campaign_preview_state');
    expect(campaignLayout).toContain('title=campaign_social_title');
    expect(campaignLayout).toContain('description=campaign_social_description');
    expect(campaignLayout).toContain('image_alt=campaign_social_image_alt');
    expect(campaignLayout).toContain('/share/campaign/{{ page.slug | uri_escape }}.svg?lang={{ current_lang | uri_escape }}');
    expect(seoMeta).toContain("unless image_url contains '://' or image_url contains 'data:'");
    expect(translationsEn).toContain('campaign_preview:');
    expect(translationsEs).toContain('campaign_preview:');
  });

  it('routes campaign chrome strings through shared translation keys', () => {
    const campaignLayout = readRepoFile('_layouts', 'campaign.html');
    const diaryInclude = readRepoFile('_includes', 'diary.html');
    const productionPhasesInclude = readRepoFile('_includes', 'production-phases.html');
    const galleryBlock = readRepoFile('_includes', 'blocks', 'gallery.html');

    expect(campaignLayout).toContain("key='campaign.play_video'");
    expect(campaignLayout).toContain('key="campaign.supporter_community_unlocked"');
    expect(campaignLayout).toContain('key="campaign.supporters_only_cta"');
    expect(campaignLayout).toContain('key="misc.video_not_supported"');
    expect(diaryInclude).toContain('key="diary.heading"');
    expect(diaryInclude).toContain("key='diary.tablist_label'");
    expect(diaryInclude).toContain('key="diary.empty"');
    expect(productionPhasesInclude).toContain('key="production_phases.heading"');
    expect(productionPhasesInclude).toContain("key='production_phases.region_label'");
    expect(productionPhasesInclude).toContain('key="production_phases.fund_this_item"');
    expect(galleryBlock).toContain("key='runtime.campaign.image_gallery'");
  });

  it('keeps the public navigation focused on canonical public pages', () => {
    const header = readRepoFile('_includes', 'header.html');

    expect(header).not.toContain("translation_key='campaigns_index'");
    expect(header).toContain("translation_key='about'");
    expect(header).toContain("translation_key='terms'");
  });
});
