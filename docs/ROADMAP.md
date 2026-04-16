# Roadmap

## Completed

**Platform foundation**

- [x] Core branding, formatting, and internationalization scaffolding
  - The Pool / Dust Wave platform branding
  - money formatting plugin
  - translation helper, `en.yml`, and example templates
- [x] Cloudflare Worker backend and lifecycle automation
  - pledge storage, stats, inventory, and emails
  - auto-settle cron
  - aggregated supporter charging
  - DST-aware Mountain Time deadline handling across frontend + Worker
  - automatic campaign state transitions
- [x] Podman-backed local development and testing
  - `./scripts/dev.sh --podman`
  - containerized headless Playwright
  - Podman-aware smoke/report helpers plus `podman:doctor` and `podman:self-check`

**Campaign and public experience**

- [x] Public campaign presentation system
  - campaign sorting
  - uniform campaign cards with featured-tier preview
  - two-column campaign layout
  - hero image / wide image / video variants
  - countdown pre-rendering
  - tier images and creator images
- [x] Funding and supporter features on campaign pages
  - production phases with registry items
  - community decisions / voting
  - production diary
  - ongoing funding
  - stretch-goal-gated tiers with unlock animations
  - Hand Relations production launch

**Pledging and supporter management**

- [x] No-account supporter management flow
  - magic-link architecture
  - pledge success / cancelled pages
  - `/manage/` dashboard
  - supporter-only `/community/:slug/` access with session-scoped supporter tokens
  - pledge history tracking
- [x] Flexible pledge composition
  - support items and custom amounts flowing cart → Worker → KV → stats
  - live support-item stats tracking
  - multi-tier pledge support via `additionalTiers`
  - non-stackable tier support
  - post/live Manage Pledge support-item display rules
- [x] Physical reward fulfillment basics
  - first-party physical-item detection
  - physical-tier shipping
  - checkout autofill and shipping-address support

**Payments, inventory, and reporting**

- [x] First-party Stripe checkout and payment-method updates
  - native on-site Stripe payment step in the second checkout sidecar
  - `Update Card` using the same secure pattern
  - fully automated checkout E2E coverage
  - post-persistence live-stats/inventory refresh handling
  - checkout hardening around storage, caching, origin checks, and recovery retries
- [x] Inventory integrity and campaign accounting
  - live stats API
  - limited-tier inventory tracking
  - Durable-Object-backed oversell protection for scarce tiers
  - stats recalculation support for `additionalTiers`
- [x] Reporting and supporter communications
  - milestone notifications
  - tip-aware emails with full subtotal/tip/tax/shipping breakdowns
  - ledger-style pledge reports and fulfillment CSV exports
  - shipping included in reporting
- [x] Projection repair follow-up work
  - read-only drift checks for per-campaign and all-campaign projection state
  - `./scripts/check-projections.sh` operator wrapper for local and Podman-backed checks
  - mutable-pledge smoke coverage now verifies campaigns stay projection-clean after setup, modify, and cancel
  - clearer operator guidance around projection drift versus ledger/current-state report differences
- [x] Platform-wide add-on products for backer upsells
  - first-wave product import:
    - `DUST WAVE T-Shirt`
    - `DUST WAVE Sticker`
    - `DUST WAVE Butterfingers T-Shirt`
  - fixed-price global catalog items and simple variants now live in config
  - cart sidecar and Manage Pledge can both add or subtract anchor-bound add-ons
  - multi-campaign carts stay supported through an anchor-campaign model
  - add-on revenue now rides canonical checkout, shipping, email, and reporting flows without counting toward campaign funding goals
  - pledge and fulfillment exports now separate campaign pledge revenue from platform add-on revenue
  - inventory, low-stock thresholds, sold-out variant filtering, and saved-truth stock awareness now exist for the first merch wave
  - add-ons now render as shared product cards with image, description, quantity, variant selection, and one-click add/remove controls
- [x] Campaign-specific add-on products
  - campaigns can now define `campaign_add_ons` directly in front matter without introducing a second merch UI system
  - cart sidecar keeps the same add-on card UX, but adds one shared `Campaign Add-ons` section below platform `Add-ons`
  - Manage Pledge shows only the current pledge campaign’s campaign add-ons while reusing the same selected/available add-on card patterns
  - campaign add-ons now count toward the owning campaign subtotal and goal-tracking math instead of behaving like platform merch
  - campaign add-ons inherit the owning campaign’s shipping rules and fallback overrides, including in mixed multi-campaign carts
  - physical global add-ons now combine into one separate platform shipment / shipping charge instead of borrowing campaign shipping behavior
  - removing a campaign pledge from the cart now also removes campaign add-ons tied to that campaign
  - pledge and fulfillment reports now keep platform add-ons and campaign add-ons operationally distinct, including fulfiller ownership
  - Smoke Editable now includes imported campaign add-ons from the Dust Wave shop for browser, shipping, and report coverage
- [x] Shipping calculator replacing the old flat physical-fee model
  - USPS-backed live rating for domestic and international physical pledges
  - deployment-level fallback shipping plus optional campaign-level fallback overrides
  - deployment-level free-shipping default plus optional campaign overrides
  - physical tier and support-item shipping metadata with shared presets for common goods
  - Worker-canonical shipping totals in checkout, Manage Pledge, emails, reports, and fulfillment exports
  - limited domestic shipping options with `standard`, `signature_required`, and `adult_signature_required`
  - checkout and Manage Pledge UI now reflect live quotes, fallback quotes, and free-shipping states without inventing a browser-side shipping engine
- [x] Shipping follow-up work
  - real USPS credentialed smoke coverage now exists for domestic live rating, international live rating, fallback behavior, and signature-option flows
  - the checkout country selector now reads from a dedicated shipping-country reference instead of burying USPS-aware destination data in runtime code
  - campaigns with explicit flat-rate overrides now skip USPS entirely for those shipments
  - deterministic manual-rate items like `sticker` and `signed_script` can skip USPS and use documented flat-mail pricing when they still qualify
  - disc presets now try cheaper valid classes like `MEDIA_MAIL` before parcel services, while mixed shipments still fall back to the safer parcel model
  - cart and checkout now stay in estimate mode until a live quote is actually possible, including ZIP-field hiding for shipments that already have known shipping
  - the limited delivery-option selector is now wired through cart, checkout, Manage Pledge, saved totals, and supporter emails instead of stopping at quote preview

**Creator tooling and content**

- [x] Pages CMS integration for campaign editing
  - block-based content editing
  - polymorphic block schema
  - datetime picker for diary entries
  - full campaign schema for tiers, stretch goals, support items, diary, and decisions
- [x] Documentation consolidation and internal runbooks

**Quality, accessibility, and design system**

- [x] Automated quality baseline
  - Vitest unit coverage
  - Playwright E2E coverage
  - stronger merge gate and local smoke coverage
- [x] Accessibility compliance milestone
  - stronger dialog, tab, tip-slider, error, and live-region semantics
  - axe-backed critical-surface coverage
  - broader browser accessibility coverage across campaign, community, pledge-result, About, and Terms states
- [x] Typography, elements, and layouts redesign
  - shared tokens, typography, buttons, fields, and surfaces
  - aligned public pages, campaign pages, cart / checkout, and Manage Pledge styling
  - removal of stale parallel styling
- [x] Mobile responsiveness pass
  - focused audit-and-polish work rather than a redesign
  - shared responsive fixes across campaign pages, cart / checkout, Manage Pledge, Update Card, community pages, and long-form content
  - mobile browser regressions for overflow, scrollability, and reachable primary actions
- [x] Zero-regression styles reorganization to be cleaner, more efficient, and as DRY as possible
  - shared Sass primitives now cover repeated card shells, stacked sections, responsive surfaces, tab lists, pill states, media-object grids, quantity steppers, and primary action buttons
  - cart / checkout, Manage Pledge, campaign pages, community pages, and long-form content now lean on those shared patterns instead of carrying parallel near-duplicate styling
  - add-on cards and Manage Pledge controls were normalized across desktop, tablet, and small-phone breakpoints without redesigning the established visual language
  - Node 25 test compatibility was repaired so the style branch could stay validated on the default local toolchain
  - the branch kept zero-regression pressure through focused Vitest coverage, Podman-backed Playwright mobile checks, and a full green merge gate
- [x] Variable-first customization for forks
  - canonical `platform`, `pricing`, `design`, `checkout`, and `cache` settings
  - auto-synced Worker mirroring from `_config.yml` / `_config.local.yml` into `worker/wrangler.toml`
  - curated CSS theme-variable bridge via `assets/theme-vars.css`
  - configurable core brand assets and documented no-code customization surface
- [x] i18n completion with a Spanish language translation available
  - `_config.yml` now owns supported languages, language labels, and curated localized public-page routes
  - English + Spanish routes now exist for `/`, `/about/`, `/terms/`, `/pledge-success/`, `/pledge-cancelled/`, `/manage/`, `/community/`, and supporter community pages
  - a quieter footer language switcher plus shared route helpers preserve query strings and hashes for tokenized routes such as `/manage/?t=...`
  - shared public campaign/community labels, site-owned cart/community/Manage Pledge runtime strings, campaign countdown/gallery/live-stats edge copy, and Worker supporter emails now read from locale data plus persisted `preferredLang`
- [x] SEO fundamentals baseline
  - shared metadata now covers titles, descriptions, canonicals, OG/Twitter tags, and default social images across public layouts
  - `robots.txt`, `sitemap.xml`, and explicit `noindex,nofollow` handling keep private/tokenized/supporter-only flows out of search intent
  - public pages emit conservative `Organization` / `WebSite` JSON-LD, and campaign pages emit conservative `CreativeWork` plus breadcrumb JSON-LD
  - the public community hub now points people back to public campaign pages instead of directing crawlers into supporter-only routes
  - stronger merge-gate and unit coverage now protect alternate-language metadata, sitemap inclusion, and the public crawl surface
  - bounded fork-facing SEO config now covers `seo.x_handle`, `seo.same_as`, `seo.default_social_image_alt`, `seo.og_locale_overrides`, and whether the public community hub should remain indexable
  - structured browser and Worker debug logging now ships as a config-driven developer aid with timestamps, severity labels, scoped prefixes, and browser global error capture
- [x] Campaign embeds and richer share previews
  - campaign pages now link to a hosted locale-aware embed builder that generates copy-paste iframe code with layout, theme, media, and CTA options
  - the embed widget uses live Worker-backed campaign state, auto-resizes after paste, and supports localized return links plus localized builder/runtime copy
  - campaign pages now emit richer state-aware social metadata plus Worker-generated share-card SVG images that stay closer to the embed’s visual language
  - localized campaign routes, localized embed routes, and locale-aware share-card URLs keep embeds and rich previews aligned across English and Spanish

## Planned

- [ ] Admin dashboard page (read-only) from KV data
  - Super admin and per-campaign users
  - Magic link auth
  - Variable customizability
  - add-on inventory baseline override / reset controls so admins can restock sold-out products without editing `_config.yml`
  - decide what the platform-merch admin/reporting surface should look like alongside campaign-facing data
- [ ] Replace Pages CMS with dedicated content editor and per-campaign permissions
  - Review Pages CMS GitHub repo for a starting place
  - Super admin and per-campaign users
  - Magic link auth
  - Block-based with the ability to preview campaign content
- [ ] Non-Stripe tax calculator to replace flat rate sales tax
  - Support USA, and international
- [ ] Developer FAQ based on internal documentation
- [ ] Marketing landing page for the platform on a different domain
- [ ] Denial of service attack defense pass
- [ ] Support different prices per add-on variation

## Known Issues

**Credit Card Autofill**: CC number, expiry, and CVV fields are inside Stripe's iframe for PCI compliance — not accessible to our autofill scripts.