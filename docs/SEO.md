# SEO

This document describes The Pool's current SEO model in 2026. It is intentionally conservative: public pages are made easier to crawl and understand, while supporter-only and tokenized flows stay out of index intent. The implementation is designed around real metadata, real public pages, and honest structured data rather than content padding or rich-result bait.

## Principles

- strengthen discoverability of real public pages and campaign pages
- keep the fork-facing SEO surface small and trustworthy
- preserve accessibility, privacy, and security boundaries
- avoid SEO tactics that create thin, misleading, or junk content

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
- Worker-generated campaign share-card PNGs for public social metadata, with SVG retained for internal preview/debug tooling
- generated [`robots.txt`](../robots.txt)
- generated [`sitemap.xml`](../sitemap.xml)
- explicit `noindex,nofollow` on tokenized or supporter-only layouts
- explicit `noindex,nofollow,noarchive`, `sitemap: false`, robots disallows, and disabled social metadata on the private admin dashboard
- conservative `Organization` / `WebSite` JSON-LD
- conservative campaign `CreativeWork` plus breadcrumb JSON-LD, both aligned with the active page language where supported
- campaign `CreativeWork` JSON-LD now also includes `headline`, `mainEntityOfPage`, `isPartOf`, and published/modified timestamps so public campaign pages read more like real editorial landing pages than anonymous blobs
- a public community hub that links back to public campaign pages instead of pushing crawlers into supporter-only routes

The main implementation files are:

- [/_includes/seo-meta.html](../_includes/seo-meta.html)
- [/_includes/seo-json-ld.html](../_includes/seo-json-ld.html)
- [/_layouts/campaign.html](../_layouts/campaign.html)
- [/worker/src/index.js](../worker/src/index.js)
- [/robots.txt](../robots.txt)
- [/sitemap.xml](../sitemap.xml)

Campaign social previews default to a Worker-generated, crawler-friendly PNG that uses live campaign progress. A campaign can still override that with `social_image` when it needs a fixed static raster image, ideally JPEG or PNG at `1200 x 630`.

The public Open Graph route is:

- `/share/campaign/{slug}.png?lang=en`
- `/share/campaign/{slug}.png?lang=es`

That route generates a state-aware SVG card from live campaign data, then rasterizes it to PNG so shared links stay crawler-safe while still showing pledged total, goal progress, campaign state, and the campaign's square `hero_image` with the richer share-card styling. The Worker also keeps the SVG version at `/share/campaign/{slug}.svg?lang={lang}` for internal preview/debug tooling, but SVG is not the public metadata default because some external crawlers reject it.

## Indexing Contract

Indexable by default:

- home
- about
- terms
- public campaign pages
- public post-campaign pages that still have discovery value
- the public community hub when `seo.index_public_community_hub` is enabled

Non-indexable by default:

- cart and checkout flows
- pledge success / cancelled pages
- `/manage/`
- `/admin/`
- `/es/admin/`
- supporter community pages
- tokenized routes and user-specific query-string access paths

This is enforced through a mix of:

- layout-level robots meta tags
- `robots.txt`
- sitemap inclusion rules
- sitemap `lastmod` hints for public pages and campaigns

Admin dashboard contract:

- [admin.md](../admin.md) and [es/admin/index.html](../es/admin/index.html) must keep `indexable: false` and `sitemap: false`
- [/_layouts/admin.html](../_layouts/admin.html) must call `seo-meta.html` with `indexable=false` and `social=false`
- [`robots.txt`](../robots.txt) must disallow `/admin/` and `/es/admin/`
- [`sitemap.xml`](../sitemap.xml) must not include admin routes
- the admin layout must not emit JSON-LD or Open Graph/Twitter social-preview metadata; the dashboard is a private app surface, not a public search result or share target

## Structured Data

The site only emits schema types that map cleanly to visible content and real data:

- `Organization`
- `WebSite`
- `BreadcrumbList`
- campaign-level `CreativeWork`

The implementation intentionally does not emit:

- fake FAQ schema
- fake reviews or star ratings
- product/offer schema that overstates what the page actually represents

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
- public-page front matter `title` / `description`
- campaign content fields such as `title`, `short_blurb`, `creator_name`, `category`, and hero imagery

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
- campaign preview inputs that already exist in the content model, such as campaign title, blurb, category, creator, and the square hero image used inside generated share cards

Forks should not assume support for:

- arbitrary per-page SEO config matrices
- custom schema taxonomies beyond the documented surface
- indexing of private or tokenized supporter flows

## Validation Checklist

When checking a deployment manually:

- page source for home/about/terms/campaign pages has correct title, description, canonical, OG, and Twitter tags
- campaign pages emit a crawler-friendly `social_image` when configured, otherwise the Worker share-card PNG route
- `robots.txt` is reachable and only exposes intended public crawl paths
- `sitemap.xml` is reachable and only includes intended public URLs
- private/tokenized pages emit `noindex` where appropriate
- `/admin/` and `/es/admin/` emit `noindex,nofollow,noarchive`, do not appear in `sitemap.xml`, and do not emit social-preview or JSON-LD metadata
- JSON-LD validates cleanly
- localized pages keep coherent canonical and alternate links
- localized campaign pages keep coherent canonical and alternate links
- localized pages keep coherent JSON-LD language and breadcrumb roots
- metadata additions do not create accessibility or performance regressions

## Non-Goals

The current SEO model explicitly avoids:

- AI-generated filler content
- doorway pages
- hidden text or keyword stuffing
- fake FAQ or review schema
- indexing supporter-only, session-bound, or tokenized access flows
- treating the admin dashboard as a public landing page, share target, or crawlable documentation surface

## Current Follow-Up Work

The roadmap still tracks a few SEO follow-ups outside this document:

- manual validation of structured data, crawl files, and campaign share cards against external tooling
- expanding automated SEO regression coverage further if the SEO surface grows beyond the current public-page + campaign-page model
- deciding whether any additional fork-facing SEO knobs are worth supporting beyond the current bounded surface

## Notes

This implementation was guided by Google Search Central guidance around:

- canonicalization
- robots meta usage
- sitemap construction
- structured data basics
- breadcrumb structured data

The core rule remains simple: public metadata should reflect visible public content, and private/supporter-only flows should stay outside search intent.
