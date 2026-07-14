# SEO

This document describes The Pool's current SEO model in 2026. It is intentionally conservative: public pages are made easier to crawl and understand, while supporter-only and tokenized flows stay out of index intent. The implementation is designed around real metadata, real public pages, and honest structured data rather than content padding or rich-result bait.

## Principles

- strengthen discoverability of real public pages and campaign pages
- keep the fork-facing SEO surface small and trustworthy
- preserve accessibility, privacy, and security boundaries
- avoid SEO tactics that create thin, misleading, or junk content
- apply the [Ethical Risk review](./ETHICAL_RISK.md) before changing metadata, share cards, public indexing, or social distribution in ways that could misstate campaign status, scarcity, deadlines, or private access

## Current Implementation

The current baseline includes:

- shared metadata includes for public pages and public campaign pages
- alternate-language metadata on localized public pages and localized campaign pages
- canonical URLs on public layouts
- locale-aware Open Graph metadata on public layouts
- campaign pages now use `og:type=article` plus bounded article publish/modified timestamps derived from campaign content dates
- explicit language/app-name metadata on public layouts
- page-level descriptions on core public routes
- Open Graph and Twitter card metadata
- secure social-image tags where the page image is already HTTPS
- social image alt metadata
- state-aware campaign social titles and descriptions
- state-aware campaign share-link intent text for platforms that accept message copy, while Facebook and other card-first destinations keep relying on the page URL and Open Graph metadata
- public campaign diary hash links activate the matching diary phase tab before scrolling, so anchors into hidden panels such as `#diary-production` remain valid share/email targets
- Worker-generated campaign share-card PNGs for public social metadata, with SVG retained for internal preview/debug tooling
- generated [`robots.txt`](../robots.txt)
- generated [`sitemap.xml`](../sitemap.xml)
- generated diagnostic [`sitemap.txt`](../sitemap.txt), intentionally not advertised as a second canonical sitemap in `robots.txt`
- shared public sitemap selection in [`_includes/seo-sitemap-items.liquid`](../_includes/seo-sitemap-items.liquid), with XML rendering and localized `xhtml:link` alternates in [`_includes/seo-sitemap-url.xml`](../_includes/seo-sitemap-url.xml)
- authored sitemap `lastmod` values only through `last_modified_at`; Jekyll's implicit collection `date` and build time are never treated as content changes
- campaign article publication and modification metadata derived from explicit `published_at`, `last_modified_at`, or the campaign start date rather than Jekyll's deployment-time collection date
- a generated-site SEO audit at [`scripts/audit-seo.mjs`](../scripts/audit-seo.mjs), exposed as `npm run test:seo` and wired into the merge gate
- a live crawl-endpoint audit at [`scripts/audit-crawl-endpoints.mjs`](../scripts/audit-crawl-endpoints.mjs) that compares ordinary and Google Inspection responses for both sitemap formats, requires identical XML/text URL lists, validates sitemap/robots status and content types, and fetches every submitted public URL after production deploys
- explicit `noindex,nofollow` on tokenized or supporter-only layouts
- explicit `noindex,nofollow,noarchive`, `sitemap: false`, robots disallows, and disabled social metadata on the private admin dashboard
- protected campaign preview shells with `noindex,nofollow,noarchive`, no social metadata, no JSON-LD, no public sitemap inclusion, and no public prefetch eligibility
- conservative `Organization` / `WebSite` JSON-LD
- organization contact and `MerchantReturnNotPermitted` policy data linked to the visible Terms policy
- conservative campaign `CreativeWork` plus breadcrumb JSON-LD, both aligned with the active page language where supported
- campaign `CreativeWork` JSON-LD now also includes `headline`, `mainEntityOfPage`, `isPartOf`, and published/modified timestamps so public campaign pages read more like real editorial landing pages than anonymous blobs
- a public community hub that links back to public campaign pages instead of pushing crawlers into supporter-only routes
- opt-in, localized product pages for one campaign's featured physical reward, with visible preorder, availability, shipping, and final-sale disclosures plus matching `Product` / `Offer` data

The main implementation files are:

- [/_includes/seo-meta.html](../_includes/seo-meta.html)
- [/_includes/seo-json-ld.html](../_includes/seo-json-ld.html)
- [/_includes/seo-sitemap-items.liquid](../_includes/seo-sitemap-items.liquid)
- [/_layouts/campaign.html](../_layouts/campaign.html)
- [/_plugins/campaign_shopping_product_pages.rb](../_plugins/campaign_shopping_product_pages.rb)
- [/_includes/campaign-shopping-product.html](../_includes/campaign-shopping-product.html)
- [/worker/src/index.js](../worker/src/index.js)
- [/scripts/audit-seo.mjs](../scripts/audit-seo.mjs)
- [/scripts/audit-crawl-endpoints.mjs](../scripts/audit-crawl-endpoints.mjs)
- [/robots.txt](../robots.txt)
- [/sitemap.xml](../sitemap.xml)
- [/sitemap.txt](../sitemap.txt)

Campaign social previews default to a Worker-generated, crawler-friendly PNG that uses live campaign progress. A campaign can still override that with `social_image` when it needs a fixed static raster image, ideally JPEG or PNG at `1200 x 630`.

The public Open Graph route is:

- `/share/campaign/{slug}.png?lang=en`
- `/share/campaign/{slug}.png?lang=es`

That route generates a state-aware SVG card from live campaign data, then rasterizes it to PNG so shared links stay crawler-safe while still showing pledged total, goal progress, campaign state, and the campaign's square `hero_image` with the richer share-card styling. The Worker also keeps the SVG version at `/share/campaign/{slug}.svg?lang={lang}` for internal preview/debug tooling, but SVG is not the public metadata default because some external crawlers reject it.

Campaign page share links keep the same separation of concerns:

- Open Graph and Twitter metadata control crawler previews and share-card images.
- Platform share URLs include richer, state-aware intent text only where the destination supports message text.
- Share URLs preserve only safe UTM/referral query params and do not add image URLs or private state to the shared URL.

## Indexing Contract

Indexable by default:

- home
- about
- terms
- public campaign pages
- public post-campaign pages that still have discovery value
- the public community hub when `seo.index_public_community_hub` is enabled
- a focused featured-reward page when its campaign explicitly enables a complete Shopping product configuration

Non-indexable by default:

- cart and checkout flows
- pledge success / cancelled pages
- `/manage/`
- `/admin/`
- `/es/admin/`
- protected campaign preview pages such as `/campaigns/:slug/preview/`
- supporter community pages
- tokenized routes and user-specific query-string access paths

This is enforced through a mix of:

- layout-level robots meta tags
- `robots.txt`
- sitemap inclusion rules
- sitemap `lastmod` hints for public pages and campaigns
- sitemap hreflang alternate links for localized page/campaign pairs
- generated-output validation through `npm run test:seo`
- post-deploy origin validation through `npm run test:crawl-endpoints -- --base=https://pool.dustwave.xyz`

Admin dashboard contract:

- [admin.md](../admin.md) and [es/admin/index.html](../es/admin/index.html) must keep `indexable: false` and `sitemap: false`
- [/_layouts/admin.html](../_layouts/admin.html) must call `seo-meta.html` with `indexable=false` and `social=false`
- [`robots.txt`](../robots.txt) must disallow `/admin/` and `/es/admin/`
- [`sitemap.xml`](../sitemap.xml) must not include admin routes
- the admin layout must not emit JSON-LD or Open Graph/Twitter social-preview metadata; the dashboard is a private app surface, not a public search result or share target

Protected campaign preview contract:

- `/_layouts/campaign-preview.html` must keep `indexable=false` and `social=false`
- preview pages must not appear in `sitemap.xml`
- preview-only campaigns must not generate public `/campaigns/:slug/` pages, localized public campaign pages, public campaign JSON entries, add-on catalog entries, share-card metadata, or public embed targets until launched
- preview pages must fetch protected content through the Worker at request time instead of embedding campaign titles or draft payloads in static HTML
- public prefetching must reject `/campaigns/:slug/preview/` and token query strings such as `?t=...`

## Structured Data

The site only emits schema types that map cleanly to visible content and real data:

- `Organization`
- `WebSite`
- `BreadcrumbList`
- campaign-level `CreativeWork`
- `MerchantReturnPolicy` with a visible final-sale policy
- `Product` and `Offer` only on an explicitly enabled, focused physical-reward page

The implementation intentionally does not emit:

- fake FAQ schema
- fake reviews or star ratings
- product/offer schema on campaign landing pages, digital rewards, services, creative participation, or incomplete preorder records

## Featured Reward Shopping Pages

Shopping support deliberately reuses a campaign's existing `featured_tier_id`. The generated product page derives its name, description, image, price, category, cart behavior, campaign, seller identity, and stable SKU from existing sources rather than creating a parallel catalog.

To become eligible, the selected featured tier must be physical and have a positive price, image, and description. The campaign must also opt in with an exact expected availability date:

```yml
featured_tier_id: physical-poster
shopping:
  enabled: true
  availability_date: 2027-01-31
```

The generator fails the build if the date is invalid, precedes the campaign deadline, or is more than one year after the build date. While the campaign is live, the offer is marked `PreOrder`; outside the live campaign window it remains a useful product page but changes to `OutOfStock`. The product page visibly explains all-or-nothing charging, expected availability, shipping treatment, and the no-returns policy.

The campaign dashboard exposes the enable switch and availability date alongside the featured tier. Keep the switch off until the creator confirms the exact date and the visible campaign timeline agrees.

Product structured data can make a page eligible for Google product experiences, but it does not by itself guarantee placement on Google's Shopping tab. A Merchant Center account, verified website, product data source, shipping settings, return-policy settings, destination eligibility, and Google review are separate launch requirements. When a feed is added, it must use the same page, SKU, price, availability, image, and policy facts; do not create a second product catalog in the feed generator.

## Supported SEO Config Surface

The fork-facing SEO surface is intentionally bounded. Current supported settings include:

- top-level `title`
- top-level `description`
- `platform.name`
- `platform.site_url`
- `platform.default_social_image_path`
- `seo.x_handle`
- `seo.same_as`
- `seo.index_public_community_hub`
- `seo.default_social_image_alt`
- `seo.og_locale_overrides`
- `seo.merchant_return_policy.applicable_country`
- `seo.merchant_return_policy.return_policy_category`
- public-page front matter `title` / `description`
- campaign content fields such as `title`, `short_blurb`, `creator_name`, `category`, and hero imagery
- campaign `featured_tier_id` plus `shopping.enabled` / `shopping.availability_date`

This keeps the SEO model variable-first without opening up a huge matrix of fragile or unsupported knobs.

Public metadata also derives a few safe values automatically:

- `og:locale` from the active page language
- `og:locale:alternate` from the supported translated languages for that page
- `language`, `application-name`, and `apple-mobile-web-app-title` from the active site/page identity
- `og:image:alt` / `twitter:image:alt` from explicit image alt text when present, otherwise the page title
- `og:image:secure_url` when the chosen social image already resolves to HTTPS
- `article:published_time` / `article:modified_time` on campaign pages when campaign dates are available
- campaign preview copy from campaign state (`upcoming`, `live`, `funded`, `ended`)
- campaign preview images from `social_image` when configured, otherwise the Worker-generated PNG share-card route
- `WebSite.availableLanguage`, localized breadcrumb roots, and campaign `CreativeWork.inLanguage` from the configured locale model

Forks can override part of that behavior in a bounded way:

- `seo.default_social_image_alt` supplies the fallback alt text for default social images
- `seo.og_locale_overrides` maps language codes to explicit Open Graph locale strings

Example:

```yml
seo:
  x_handle: dustwave
  same_as:
    - https://www.instagram.com/dustwave
    - https://www.youtube.com/@dustwave
  index_public_community_hub: true
  default_social_image_alt: "Dust Wave on The Pool"
  og_locale_overrides:
    en: en_US
    es: es_ES
```

## What Forks Can Safely Change

Forks can safely customize:

- site identity and default metadata
- organization social-profile links
- whether the public community hub should remain indexable
- page and campaign descriptive copy that already exists in the content model
- campaign preview inputs that already exist in the content model, such as campaign title, the first long-content text block used for social descriptions, category, creator, a `funded: true` flag for successful post-campaign metadata before settlement, and the square hero image used inside generated share cards

Forks should not assume support for:

- arbitrary per-page SEO config matrices
- custom schema taxonomies beyond the documented surface
- indexing of private or tokenized supporter flows

## Validation Checklist

When checking a deployment manually:

- page source for home/about/terms/campaign pages has correct title, description, canonical, OG, and Twitter tags
- campaign pages emit a crawler-friendly `social_image` when configured, otherwise the Worker share-card PNG route
- visible campaign share links use the canonical campaign URL and do not replace the metadata-driven social card contract
- `robots.txt` is reachable and only exposes intended public crawl paths
- `sitemap.xml` is reachable and only includes intended public URLs
- `sitemap.txt` is reachable, contains one absolute URL per line, and exactly matches the XML sitemap URL list
- `npm run test:seo` passes against a freshly built `_site`
- private/tokenized pages emit `noindex` where appropriate
- `/admin/` and `/es/admin/` emit `noindex,nofollow,noarchive`, do not appear in `sitemap.xml`, and do not emit social-preview or JSON-LD metadata
- `/campaigns/:slug/preview/` emits `noindex,nofollow,noarchive`, does not appear in `sitemap.xml`, and does not emit social-preview or JSON-LD metadata
- JSON-LD validates cleanly
- localized pages keep coherent canonical and alternate links
- localized campaign pages keep coherent canonical and alternate links
- localized pages keep coherent JSON-LD language and breadcrumb roots
- an enabled Shopping product generates coherent English/Spanish routes, visible preorder facts, `og:type=product`, `Product` / `Offer` / breadcrumb data, and sitemap alternates
- `npm run test:crawl-endpoints -- --base=https://pool.dustwave.xyz` confirms both deployed sitemap formats and every submitted URL are directly fetchable without an HTML interstitial
- metadata additions do not create accessibility or performance regressions

## Non-Goals

The current SEO model explicitly avoids:

- AI-generated filler content
- doorway pages
- hidden text or keyword stuffing
- fake FAQ or review schema
- indexing supporter-only, session-bound, or tokenized access flows
- treating the admin dashboard or protected campaign previews as public landing pages, share targets, or crawlable documentation surfaces

## Current Follow-Up Work

The roadmap still tracks a few SEO follow-ups outside this document:

- manual validation of structured data, crawl files, and campaign share cards against external tooling
- expanding automated SEO regression coverage further if the SEO surface grows beyond the current public-page + campaign-page model
- deciding whether any additional fork-facing SEO knobs are worth supporting beyond the current bounded surface
- creating and verifying the Merchant Center account before enabling Shopping destinations
- confirming the exact expected availability date and completing Merchant Center/feed/destination setup before enabling the current featured reward candidate

## Notes

This implementation was guided by Google Search Central guidance around:

- canonicalization
- robots meta usage
- sitemap construction
- structured data basics
- breadcrumb structured data

The core rule remains simple: public metadata should reflect visible public content, and private/supporter-only flows should stay outside search intent.

---

_Last updated: July 14, 2026_
