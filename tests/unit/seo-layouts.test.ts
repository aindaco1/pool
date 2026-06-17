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
    const header = readRepoFile('_includes', 'header.html');
    const footer = readRepoFile('_includes', 'site-footer.html');
    const cartRuntimeHead = readRepoFile('_includes', 'cart-runtime-head.html');
    const cartRuntimeFoot = readRepoFile('_includes', 'cart-runtime-foot.html');
    const responsiveImage = readRepoFile('_includes', 'responsive-image.html');
    const responsiveImagePreload = readRepoFile('_includes', 'responsive-image-preload.html');
    const tierCard = readRepoFile('_includes', 'tier-card.html');
    const contentImageBlock = readRepoFile('_includes', 'blocks', 'image.html');
    const galleryBlock = readRepoFile('_includes', 'blocks', 'gallery.html');
    const pagePrefetch = readRepoFile('_includes', 'page-prefetch.html');
    const campaignShareLinks = readRepoFile('_includes', 'campaign-share-links.html');
    const sharePlatformIcon = readRepoFile('_includes', 'share-platform-icon.html');
    const config = readRepoFile('_config.yml');
    const homePage = readRepoFile('index.html');
    const spanishHomePage = readRepoFile('es', 'index.html');

    expect(defaultLayout).toContain('{% include seo-meta.html');
    expect(campaignLayout).toContain('{% include seo-meta.html');
    expect(defaultLayout).toContain('{% include seo-json-ld.html');
    expect(campaignLayout).toContain('{% include seo-json-ld.html');
    expect(defaultLayout).toContain('translation_key=page.translation_key');
    expect(campaignLayout).toContain('translation_key=page.translation_key');
    expect(defaultLayout).toContain('{% if page.live_stats %}');
    expect(defaultLayout).toContain('<script src="/assets/js/live-stats.js?v={{ asset_version }}" defer></script>');
    expect(campaignLayout).toContain('campaign_hero_has_remote_video');
    expect(campaignLayout).toContain('campaign_hero_has_youtube_video');
    expect(campaignLayout).toContain('{% elsif campaign_hero_has_remote_video %}');
    expect(campaignLayout).toContain('campaign_hero_preload_image');
    expect(campaignLayout).toContain('responsive-image-preload.html src=campaign_hero_preload_image');
    expect(campaignLayout).toContain('data-youtube-embed');
    expect(campaignLayout).toContain('data-youtube-src="https://www.youtube-nocookie.com/embed/{{ yt_id }}?autoplay=1&amp;rel=0"');
    expect(campaignLayout).toContain('/maxres1.jpg');
    expect(campaignLayout).toContain('data-youtube-poster-fallback');
    expect(campaignLayout).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(campaignLayout).toContain('class="hero__video-poster"');
    expect(campaignLayout).toContain('fetchpriority="high" decoding="async"');
    expect(campaignLayout).toContain('responsive-image.html src=page.campaign_background');
    expect(cartRuntimeHead).toContain('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
    expect(cartRuntimeHead).toContain('<link rel="preconnect" href="https://use.typekit.net" crossorigin>');
    expect(cartRuntimeHead).toContain('<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Inter:400,700">');
    expect(cartRuntimeHead).toContain('<link rel="stylesheet" href="https://use.typekit.net/hoj2yet.css">');
    expect(cartRuntimeHead).not.toContain('/assets/theme-vars.css');
    expect(readRepoFile('assets', 'main.scss')).not.toContain('@import url("https://fonts.googleapis.com');
    expect(readRepoFile('assets', 'main.scss')).not.toContain('@import url("https://use.typekit.net');
    expect(responsiveImage).toContain('local_image_dimensions');
    expect(responsiveImage).toContain('picture_class');
    expect(responsiveImage).toContain('aria-hidden="true"');
    expect(responsiveImagePreload).toContain('imagesrcset="{{ responsive_srcset | escape }}"');
    expect(responsiveImagePreload).toContain('default: "320,480,640,960,1600"');
    expect(header).toContain('responsive-image.html src=header_logo_path');
    expect(header).toContain('widths="320,480"');
    expect(footer).toContain('responsive-image.html src=footer_logo_path');
    expect(footer).toContain('widths="320,480"');
    expect(responsiveImage).toContain('<source type="image/webp" srcset="{{ responsive_srcset | escape }}"');
    expect(responsiveImage).toContain('default: "320,480,640,960,1600"');
    expect(campaignLayout).toContain('responsive-image.html src=page.hero_image_wide');
    expect(tierCard).toContain('loading="lazy" decoding="async"');
    expect(tierCard).toContain('responsive-image.html src=include.tier.image');
    expect(contentImageBlock).toContain('responsive-image.html src=block.src');
    expect(galleryBlock).toContain('responsive-image.html src=img.src');
    expect(readRepoFile('_includes', 'progress.html')).toContain('responsive-image.html src=include.progress_background');
    expect(readRepoFile('_includes', 'support-items.html')).toContain('responsive-image.html src=include.campaign.progress_background');
    expect(campaignLayout).toContain('<script src="/assets/js/live-stats.js?v={{ asset_version }}" defer></script>');
    expect(campaignLayout).toContain('<script src="/assets/js/campaign.js?v={{ asset_version }}" defer></script>');
    expect(campaignLayout).toContain('campaign-share-links.html class="campaign-share--mobile"');
    expect(campaignLayout).toContain('campaign-share-links.html class="campaign-share--sidebar"');
    expect(campaignLayout).toContain('campaign_social_share_text');
    expect(campaignLayout).toContain('text=campaign_social_share_text');
    expect(campaignShareLinks).toContain('data-campaign-share-target="bluesky"');
    expect(campaignShareLinks).toContain('data-share-text="{{ campaign_share_message | escape }}"');
    expect(campaignShareLinks).toContain('{% include share-platform-icon.html icon="bluesky" %}');
    expect(campaignShareLinks).not.toContain('campaign-share__label');
    expect(campaignShareLinks).not.toContain('data-share-copy-label');
    expect(campaignShareLinks).not.toContain('data-campaign-share-target="copy"');
    expect(campaignShareLinks).toContain('sms:?&amp;body=');
    expect(sharePlatformIcon).toContain('/assets/images/share-icons/{{ icon | uri_escape }}.png');
    expect(sharePlatformIcon).toContain('campaign-share__icon-image');
    expect(sharePlatformIcon).toContain('campaign-share__icon--{{ icon | escape }}');
    expect(sharePlatformIcon).toContain('{%- when "threads" -%}');
    expect(sharePlatformIcon).not.toContain('{%- when "copy" -%}');
    ['bluesky', 'x', 'threads', 'facebook', 'sms', 'email'].forEach((icon) => {
      expect(fs.existsSync(path.join(repoRoot, 'assets', 'images', 'share-icons', `${icon}.png`))).toBe(true);
      expect(fs.existsSync(path.join(repoRoot, 'assets', 'images', 'share-icons', `${icon}.svg`))).toBe(true);
    });
    ['copy', 'check'].forEach((icon) => {
      expect(fs.existsSync(path.join(repoRoot, 'assets', 'images', 'share-icons', `${icon}.png`))).toBe(false);
      expect(fs.existsSync(path.join(repoRoot, 'assets', 'images', 'share-icons', `${icon}.svg`))).toBe(false);
    });
    expect(defaultLayout).toContain('{% include page-prefetch.html %}');
    expect(campaignLayout).toContain('{% include page-prefetch.html %}');
    expect(pagePrefetch).toContain('site.performance.intent_prefetch_enabled == true');
    expect(pagePrefetch).toContain('/assets/js/page-prefetch.js?v={{ asset_version }}');
    expect(config).toContain('intent_prefetch_enabled: true');
    expect(cartRuntimeFoot).not.toContain('/assets/js/campaign.js');
    expect(cartRuntimeFoot).toContain('/assets/js/cart-runtime-loader.js?v={{ asset_version }}');
    expect(cartRuntimeFoot).toContain('data-pool-cart-runtime-loader="true"');
    expect(cartRuntimeFoot).not.toContain('/assets/js/cart-provider.js');
    expect(cartRuntimeFoot).not.toContain('/assets/js/cart.js?v={{ asset_version }}');
    expect(cartRuntimeFoot).not.toContain('/assets/js/add-on-utils.js');
    expect(cartRuntimeFoot).not.toContain('/assets/js/stripe-checkout-sidecar.js');
    expect(cartRuntimeFoot).not.toContain('<link rel="preconnect" href="https://js.stripe.com"');
    expect(cartRuntimeFoot).not.toContain('<link rel="preconnect" href="https://api.stripe.com"');
    expect(homePage).toContain('live_stats: true');
    expect(spanishHomePage).toContain('live_stats: true');
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
    expect(manageLayout).toContain('<meta name="referrer" content="no-referrer">');
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
    expect(campaignLayout).toContain('campaign_preview_excerpt_source');
    expect(campaignLayout).toContain('block.type == "text"');
    expect(campaignLayout).toContain('safe_markdown_source | markdownify');
    expect(campaignLayout).toContain('page.funded == true');
    expect(campaignLayout).toContain('title=campaign_social_title');
    expect(campaignLayout).toContain('description=campaign_social_description');
    expect(campaignLayout).toContain('page.social_image | default: campaign_worker_social_image');
    expect(campaignLayout).toContain('image_alt=campaign_social_image_alt');
    expect(campaignLayout).toContain('image_width=campaign_social_image_width');
    expect(campaignLayout).toContain('image_height=campaign_social_image_height');
    expect(campaignLayout).toContain('image_type=campaign_social_image_type');
    expect(campaignLayout).toContain('/share/campaign/{{ page.slug | uri_escape }}.png?lang={{ current_lang | uri_escape }}');
    expect(campaignLayout).toContain('default: "image/png"');
    expect(seoMeta).toContain("unless image_url contains '://' or image_url contains 'data:'");
    expect(translationsEn).toContain('campaign_preview:');
    expect(translationsEn).toContain('funded_title: "%{title} is funded!"');
    expect(translationsEn).toContain('live_share_text: "Help %{title} reach its goal by %{date}. Pledge or share before the deadline:"');
    expect(translationsEs).toContain('campaign_preview:');
    expect(translationsEs).toContain('funded_title: "¡%{title} está financiada!"');
    expect(translationsEs).toContain('live_share_text: "Ayuda a que %{title} alcance su meta antes del %{date}. Apoya o comparte antes de la fecha límite:"');
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
    expect(readRepoFile('assets', 'js', 'video-first-frame-poster.js')).toContain('IntersectionObserver');
    expect(readRepoFile('assets', 'js', 'video-first-frame-poster.js')).toContain('document.baseURI');
    expect(readRepoFile('assets', 'js', 'video-first-frame-poster.js')).toContain("window.location.origin !== 'null'");
    expect(campaignLayout).toContain('key="campaign.supporter_community_unlocked"');
    expect(campaignLayout).toContain('key="campaign.supporters_only_cta"');
    expect(campaignLayout).toContain('key="misc.video_not_supported"');
    expect(readRepoFile('_includes', 'blocks', 'video.html')).toContain('data-first-frame-poster="true"');
    expect(readRepoFile('_includes', 'blocks', 'video.html')).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(readRepoFile('_includes', 'blocks', 'embed.html')).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(campaignLayout).toContain('{% if campaign_render_state == "upcoming" or campaign_render_state == "live" %}');
    expect(campaignLayout).toContain('key="runtime.campaign.countdown_funded"');
    expect(campaignLayout).toContain('key="runtime.campaign.countdown_ended"');
    expect(campaignLayout).toContain('key="campaign.embed_title"');
    expect(readRepoFile('_includes', 'campaign-share-links.html')).toContain('key="campaign.share_label"');
    expect(readRepoFile('_includes', 'campaign-share-links.html')).toContain('key="campaign.share_to_platform"');
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
