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
    const adminLayout = readRepoFile('_layouts', 'admin.html');
    const adminPage = readRepoFile('admin.md');
    const spanishAdminPage = readRepoFile('es', 'admin', 'index.html');
    const seoMeta = readRepoFile('_includes', 'seo-meta.html');

    expect(manageLayout).toContain('indexable=false');
    expect(communityLayout).toContain('indexable=false');
    expect(pledgeResultLayout).toContain('indexable=false');
    expect(adminLayout).toContain('indexable=false');
    expect(adminLayout).toContain('social=false');
    expect(adminPage).toContain('indexable: false');
    expect(adminPage).toContain('sitemap: false');
    expect(spanishAdminPage).toContain('indexable: false');
    expect(spanishAdminPage).toContain('sitemap: false');
    expect(seoMeta).toContain('assign social = include.social');
    expect(seoMeta).toContain('{% if social %}');
  });

  it('publishes crawl files with a sitemap and private-route exclusions', () => {
    const robots = readRepoFile('robots.txt');
    const sitemap = readRepoFile('sitemap.xml');

    expect(robots).toContain('Sitemap: {{ site.platform.site_url | default: site.url }}/sitemap.xml');
    expect(robots).toContain('Disallow: /manage/');
    expect(robots).toContain('Disallow: /admin/');
    expect(robots).toContain('Disallow: /es/admin/');
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
    expect(seoMeta).toContain('og:image:secure_url');
    expect(seoMeta).toContain('og:image:width');
    expect(seoMeta).toContain('og:image:height');
    expect(seoMeta).toContain('og:image:type');
    expect(seoMeta).toContain('twitter:image:alt');
    expect(seoMeta).toContain('application-name');
    expect(seoMeta).toContain('apple-mobile-web-app-title');
    expect(seoMeta).toContain('meta name="language"');
    expect(seoMeta).toContain('site.seo.default_social_image_alt');
    expect(seoMeta).toContain('site.seo.og_locale_overrides');
    expect(campaignLayout).toContain('campaign_preview_state');
    expect(campaignLayout).toContain('title=campaign_social_title');
    expect(campaignLayout).toContain('description=campaign_social_description');
    expect(campaignLayout).toContain('image_alt=campaign_social_image_alt');
    expect(campaignLayout).toContain('image_width=1200');
    expect(campaignLayout).toContain('image_height=630');
    expect(campaignLayout).toContain('image_type="image/svg+xml"');
    expect(campaignLayout).toContain('/share/campaign/{{ page.slug | uri_escape }}.svg?lang={{ current_lang | uri_escape }}');
    expect(seoMeta).toContain("unless image_url contains '://' or image_url contains 'data:'");
    expect(translationsEn).toContain('campaign_preview:');
    expect(translationsEs).toContain('campaign_preview:');
  });

  it('routes campaign chrome strings through shared translation keys', () => {
    const campaignLayout = readRepoFile('_layouts', 'campaign.html');
    const diaryInclude = readRepoFile('_includes', 'diary.html');
    const productionDiaryInclude = readRepoFile('_includes', 'production-diary.html');
    const productionPhasesInclude = readRepoFile('_includes', 'production-phases.html');
    const galleryBlock = readRepoFile('_includes', 'blocks', 'gallery.html');
    const localizedDateTime = readRepoFile('_includes', 'localized-datetime.html');
    const campaignCard = readRepoFile('_includes', 'campaign-card.html');

    expect(campaignLayout).toContain("key='campaign.play_video'");
    expect(campaignLayout).toContain('video-first-frame-poster.js');
    expect(campaignLayout).toContain('key="campaign.supporter_community_unlocked"');
    expect(campaignLayout).toContain('key="campaign.supporters_only_cta"');
    expect(campaignLayout).toContain('key="misc.video_not_supported"');
    expect(readRepoFile('_includes', 'blocks', 'video.html')).toContain('data-first-frame-poster="true"');
    expect(campaignLayout).toContain('{% if campaign_render_state == "upcoming" or campaign_render_state == "live" %}');
    expect(campaignLayout).toContain('key="runtime.campaign.countdown_funded"');
    expect(campaignLayout).toContain('key="runtime.campaign.countdown_ended"');
    expect(diaryInclude).toContain('key="diary.heading"');
    expect(diaryInclude).toContain("key='diary.tablist_label'");
    expect(diaryInclude).toContain('key="diary.empty"');
    expect(diaryInclude).toContain('localized-datetime.html');
    expect(productionDiaryInclude).toContain('key="diary.production_heading"');
    expect(productionDiaryInclude).toContain('key="diary.view_all_updates"');
    expect(productionDiaryInclude).toContain('localized-datetime.html');
    expect(localizedDateTime).toContain('a. m.');
    expect(localizedDateTime).toContain('p. m.');
    expect(productionPhasesInclude).toContain('key="production_phases.heading"');
    expect(productionPhasesInclude).toContain("key='production_phases.region_label'");
    expect(productionPhasesInclude).toContain('key="production_phases.fund_this_item"');
    expect(galleryBlock).toContain("key='runtime.campaign.image_gallery'");
    expect(campaignCard).toContain('translation_key=include.campaign.translation_key');
    expect(campaignCard).toContain('localized_paths=include.campaign.localized_paths');
  });

  it('keeps campaign locales wired through the shared switcher and localized routes', () => {
    const footer = readRepoFile('_includes', 'site-footer.html');
    const switcher = readRepoFile('_includes', 'language-switcher.html');
    const localizedUrl = readRepoFile('_includes', 'localized-url.html');
    const campaignLayout = readRepoFile('_layouts', 'campaign.html');
    const seoJsonLd = readRepoFile('_includes', 'seo-json-ld.html');
    const localizedCampaignPlugin = readRepoFile('_plugins', 'localized_campaign_pages.rb');

    expect(footer).toContain('translation_key=current_translation_key');
    expect(footer).toContain('localized_paths=current_localized_paths');
    expect(switcher).toContain('include.lang | default: page.lang');
    expect(switcher).toContain('include.localized_paths | default: page.localized_paths');
    expect(localizedUrl).toContain('include.translation_key and include.translation_key != page.translation_key');
    expect(campaignLayout).toContain('translation_key=page.translation_key localized_paths=page.localized_paths');
    expect(seoJsonLd).toContain("localized-url.html lang=current_lang translation_key='home'");
    expect(seoJsonLd).toContain('availableLanguage');
    expect(seoJsonLd).toContain('"inLanguage": {{ current_lang | jsonify }}');
    expect(localizedCampaignPlugin).toContain('class LocalizedCampaignPage < PageWithoutAFile');
    expect(localizedCampaignPlugin).toContain("campaign.data['localized_paths'] = localized_paths");
    expect(localizedCampaignPlugin).toContain("File.join(lang.to_s, 'campaigns', slug.to_s)");
  });

  it('keeps the public navigation focused on canonical public pages', () => {
    const header = readRepoFile('_includes', 'header.html');

    expect(header).not.toContain("translation_key='campaigns_index'");
    expect(header).toContain("translation_key='about'");
    expect(header).toContain("translation_key='terms'");
  });
});
