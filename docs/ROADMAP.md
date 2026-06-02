# Roadmap

## Current Milestone

**v1.0.3**

The v1.0 feature set and release-hardening pass are complete. v1.0.3 adds configurable platform timezone handling, opt-in launch reminders for upcoming campaigns, Cloudflare KV list-budget hardening, and mobile campaign-page performance refinements, while preserving the default `America/Denver` lifecycle model for existing forks.

## Completed

**Platform foundation**

- [x] Core branding, formatting, and internationalization scaffolding
  - The Pool / Dust Wave platform branding
  - money formatting plugin
  - translation helper, `en.yml`, and example templates
- [x] Cloudflare Worker backend and lifecycle automation
  - pledge storage, stats, inventory, and emails
  - auto-settle scheduler
  - aggregated supporter charging
  - DST-aware configurable platform timezone deadline handling across frontend + Worker
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
  - automatic diary broadcasts use stable entry IDs so edited diary entries do not resend as new updates
- [x] Actual Stripe fee/net analytics foundation
  - successful supporter charges now capture Stripe balance transaction fee, net, gross, charge, and balance transaction IDs when available
  - analytics uses actual stored Stripe fee values for charged pledges and keeps estimated fees for active pledges or older charged records without Stripe balance data
  - a super-admin-only, CSRF-protected backfill path retrieves historical Stripe balance transaction data from campaign pledge indexes without KV list scans
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

- [x] Private admin dashboard for campaign editing and operations
  - `/admin/` and `/es/admin/` private shells with noindex handling and localized dashboard copy
  - magic-link sign-in, role-scoped super-admin and campaign-user access, CSRF/origin checks, safe cookie handling, and read-only session checks
  - Cloudflare Turnstile challenge support protects the admin email sign-in submission before magic-link email delivery
  - Settings, Add-ons, Campaigns, Analytics, Reports, Supporters, Marketing, Users, Secrets & credentials, and Runtime diagnostics views
  - Settings -> Users saves directly to Worker KV at `admin-users:v1` and emails sign-in instructions to newly created users when email is configured; Secrets & credentials remains status-only
  - Reports, Analytics, Supporters, content loads/previews, marketing link generation, and table filters avoid KV writes on normal read paths
  - Supporters and Analytics return empty read-only campaign views for campaigns without pledge indexes instead of blocking new/empty campaign dashboards
  - block-based WYSIWYG content editing
  - polymorphic block schema reused by campaign content and diary entries
  - diary entry editing preserves stable entry IDs, and newly added diary entries receive title-based IDs during publish so automatic emails send only for genuinely new entries
  - full campaign schema for tiers, campaign add-ons, stretch goals, support items, diary, and decisions
  - dashboard uploads route to convention-based asset directories, preserve existing IDs where needed, and derive new IDs from names/labels
  - dashboard media uploads stay source-preserving in the Worker, with external lossless image optimization, responsive WebP variants, and WebM derivative generation in the repository media pipeline
  - physical product editors expose shipping presets or explicit package metadata while digital products hide shipping-only fields
  - desktop/tablet/mobile responsive pass, accessibility pass, security pass, SEO noindex pass, and Spanish i18n pass
  - focused unit, browser, and KV-write-budget coverage for admin dashboard flows
- [x] Documentation consolidation and internal runbooks

**Quality, accessibility, and design system**

- [x] Automated quality baseline
  - Vitest unit coverage
  - Playwright E2E coverage
  - stronger merge gate and local smoke coverage
  - final v1.0 verification covered admin dashboard browser flows, premerge regression checks, and local Podman smoke through `/admin/`, `/es/admin/`, Settings, Add-ons, Campaigns, Analytics, Reports, Supporters, Marketing, and Users
- [x] Accessibility compliance milestone
  - stronger dialog, tab, tip-slider, error, and live-region semantics
  - axe-backed critical-surface coverage
  - broader browser accessibility coverage across campaign, community, pledge-result, About, and Terms states
  - shared public shells now keep skip links and stable `main-content` anchors, and the cart trigger exposes clearer accessible labels and expanded state
- [x] Typography, elements, and layouts redesign
  - shared tokens, typography, buttons, fields, and surfaces
  - aligned public pages, campaign pages, cart / checkout, and Manage Pledge styling
  - removal of stale parallel styling
- [x] Mobile responsiveness pass
  - focused audit-and-polish work rather than a redesign
  - shared responsive fixes across campaign pages, cart / checkout, Manage Pledge, Update Card, community pages, and long-form content
  - mobile browser regressions for overflow, scrollability, and reachable primary actions
  - safe-area-aware cart/nav overlays, better small-screen summary wrapping, and larger remove/close tap targets are now part of the baseline
- [x] Zero-regression styles reorganization to be cleaner, more efficient, and as DRY as possible
  - shared Sass primitives now cover repeated card shells, stacked sections, responsive surfaces, tab lists, pill states, media-object grids, quantity steppers, and primary action buttons
  - cart / checkout, Manage Pledge, campaign pages, community pages, and long-form content now lean on those shared patterns instead of carrying parallel near-duplicate styling
  - add-on cards and Manage Pledge controls were normalized across desktop, tablet, and small-phone breakpoints without redesigning the established visual language
  - Node 25 test compatibility was repaired so the style branch could stay validated on the default local toolchain
  - the branch kept zero-regression pressure through focused Vitest coverage, Podman-backed Playwright mobile checks, and a full green merge gate
- [x] Variable-first customization for forks
  - canonical `platform`, `pricing`, `design`, `checkout`, and `cache` settings
  - auto-synced Worker mirroring from `_config.yml` / `_config.local.yml` into `worker/wrangler.toml`
  - curated CSS theme-variable bridge emitted into `assets/main.css`
  - configurable core brand assets and documented no-code customization surface
  - branded Stripe Elements and supporter emails now follow the shared design/config surface instead of a separate checkout/email theme path
- [x] i18n completion with a Spanish language translation available
  - `_config.yml` now owns supported languages, language labels, and curated localized public-page routes
  - English + Spanish routes now exist for `/`, `/about/`, `/terms/`, `/pledge-success/`, `/pledge-cancelled/`, `/manage/`, `/community/`, and supporter community pages
  - a quieter footer language switcher plus shared route helpers preserve query strings and hashes for tokenized routes such as `/manage/?t=...`
  - shared public campaign/community labels, site-owned cart/community/Manage Pledge runtime strings, campaign countdown/gallery/live-stats edge copy, and Worker supporter emails now read from locale data plus persisted `preferredLang`
  - cart-button summaries, checkout tax-location helper copy, and localized public metadata now follow the same shared locale model
- [x] SEO fundamentals baseline
  - shared metadata now covers titles, descriptions, canonicals, OG/Twitter tags, and default social images across public layouts
  - `robots.txt`, `sitemap.xml`, and explicit `noindex,nofollow` handling keep private/tokenized/supporter-only flows out of search intent
  - public pages emit conservative `Organization` / `WebSite` JSON-LD, and campaign pages emit conservative `CreativeWork` plus breadcrumb JSON-LD
  - the public community hub now points people back to public campaign pages instead of directing crawlers into supporter-only routes
  - stronger merge-gate and unit coverage now protect alternate-language metadata, sitemap inclusion, and the public crawl surface
  - bounded fork-facing SEO config now covers `seo.x_handle`, `seo.same_as`, `seo.default_social_image_alt`, `seo.og_locale_overrides`, and whether the public community hub should remain indexable
  - structured browser and Worker debug logging now ships as a config-driven developer aid with timestamps, severity labels, scoped prefixes, and browser global error capture
  - public metadata now also emits language/app-name hints, secure social-image tags where possible, and locale-aware JSON-LD language/breadcrumb roots
- [x] Campaign embeds and richer share previews
  - campaign pages now link to a hosted locale-aware embed builder that generates copy-paste iframe code with layout, theme, media, and CTA options
  - the embed widget uses live Worker-backed campaign state, auto-resizes after paste, and supports localized return links plus localized builder/runtime copy
  - the admin Marketing embed preview keeps progress fill, milestones, goal marker, and stretch-goal labels contained for video-led campaigns
  - campaign pages now emit richer state-aware social metadata plus Worker-generated PNG share-card images, with SVG retained for internal preview/debug tooling
  - localized campaign routes, localized embed routes, and locale-aware share-card URLs keep embeds and rich previews aligned across English and Spanish
- [x] v1.0.2 performance, sharing, and admin polish
  - campaign progress bars and milestone markers now render static width/position classes so first load no longer waits for JavaScript to avoid collapsed marker layouts
  - public pages load a lightweight cart-runtime loader first and defer the full cart stack until persisted cart state, recovery state, or clear supporter intent requires it
  - same-origin public document prefetching now follows a small local intent model with route allowlists, sensitive-query exclusions, network guards, low per-page limits, and a default-enabled config surface
  - Settings -> Advanced performance exposes the intent-prefetch enabled state, delay, and page-view limit for super admins, with Worker config mirroring through `INTENT_PREFETCH_*`
  - production Pages builds now minify generated `_site` CSS/JS after Jekyll output, while Cloudflare remains responsible for gzip/Brotli/Zstandard transfer compression and Auto Minify stays disabled
  - campaign pages now render reusable icon-only share links for Bluesky, X, Threads, Facebook, SMS, and email, using localized URLs, local PNG icon fallbacks for inline-SVG edge cases, and state-aware CTA text where platforms allow message text
  - responsive share controls appear below the short blurb on mobile/tablet and above the embed button only on desktop
  - admin email sign-in keeps the existing Turnstile challenge after a login attempt and uses the shared dashboard status-message styling for more prominent auth feedback
  - the public Campaign Creator Checklist and Spanish checklist were updated for the v1.0.2 creator-facing changes, including share-link planning and dashboard media uploads
- [x] v1.0.3 platform timezone, launch reminders, and media workflow hardening
  - super admins can set the default platform timezone from a select menu populated with supported IANA timezone options
  - Jekyll campaign state, browser countdowns, Worker deadline checks, campaign state transitions, scheduled campaign-runner reports, settlement checks, and admin date/time surfaces now share the same `platform.timezone` / `PLATFORM_TIMEZONE` model
  - upcoming campaign pages can collect one-time launch reminder signups through a slim localized form with Turnstile, rate limiting, campaign/email dedupe, signed unsubscribe links, and bounded dispatch jobs
  - launch reminder delivery reuses the existing Resend email module, sender configuration, locale catalog, and pacing instead of adding a second email integration
  - the minute-level Worker scheduler now persists `cron:lastRun` hourly instead of every minute, keeping cron health visible without consuming the free-tier KV write budget as baseline churn
  - launch reminder dispatch and supporter confirmation retry queues now maintain small queue-state markers so idle scheduled ticks skip KV namespace list scans, with hourly compatibility rechecks for manually inserted legacy jobs
  - platform add-on inventory now uses a durable sold-count projection that pledge create, modify, and cancel paths update, so normal inventory reads no longer rebuild sold counts by listing all pledges after bootstrap
  - `_config.local.yml` can blank the reminder Turnstile site key so local development hides the widget consistently with local admin sign-in
  - the Podman media optimizer now includes `optipng` and `gifsicle` for local PNG/GIF source compression through the same repository media workflow
  - responsive image generation now includes a `640w` WebP rung between the existing `480w` and `960w` variants for mobile campaign pages
  - YouTube campaign hero videos now render local poster/play facades and defer the remote iframe until supporter play intent
  - the public creator checklists now describe the creator-facing v1.0.3 changes, including launch reminders, platform timezone expectations, deferred YouTube hero embeds, and responsive WebP variants
- [x] Developer FAQ based on internal documentation
- [x] Marketing landing page for the platform on a different domain
- [x] Denial of service attack defense pass
  - `RATELIMIT` KV is now a hard requirement, with fail-closed behavior when the binding is missing
  - public read endpoints stay intentionally roomy for campaign virality, while checkout, Manage Pledge, and admin mutations use targeted rate limits and request-size caps
  - request-body parsing now rejects malformed or obviously oversized payloads earlier across the Worker surface
  - `/checkout-intent/abandon` uses an order-scoped retry budget instead of a naive per-IP limiter
  - deployed Standard/Paid Workers now declare a conservative `cpu_ms = 100` ceiling as a denial-of-wallet backstop
  - admin-only observability endpoints and `scripts/check-observability.sh` now expose webhook outcome summaries and sampled mutation timings for tuning
- [x] Tax groundwork and checkout UX pass
  - Worker/provider seam, provisional tax UI, and final-tax destination plumbing are now in place across cart, checkout, Manage Pledge, stored pledge data, and supporter emails
  - current browser UX now keeps tax at `--` until checkout has enough destination data, instead of inventing a fake precise value too early
  - custom checkout now collects billing tax location for digital-only carts, while physical/mixed carts stay address-first and support browser autofill again
  - a free-first New Mexico path now exists through a vendored starter dataset plus optional EDAC refinement
  - local smoke fixtures and merge-gate coverage now work under location-aware tax providers instead of assuming flat tax
- [x] Reports for campaign runners
  - campaign front matter now supports `runner_report_emails`, with empty/missing meaning no runner reports for that campaign
  - `_config.yml` now exposes a bounded `reports.campaign_runner` customization surface for enablement, platform-timezone send time, summaries, attachments, and subject prefix
  - the Worker sends daily campaign-scoped pledge-ledger emails at the configured local send time for live campaigns and split post-deadline fulfillment emails for campaign vs. platform fulfillers
  - the dashboard Reports tab previews pledge/fulfillment rows and downloads CSVs without sending emails or writing sent markers
  - shared-secret report endpoints remain separate for script/operator workflows that intentionally send reports
  - local CLI exports and scheduled Worker emails now share the same JS report core to avoid CSV drift
- [x] v0.9.5 local-runtime parity and creator launch handoff
  - Podman Worker development now runs on Node 24 to match GitHub Actions deployments
  - host and Podman helper scripts now prefer Node 24 and no longer force the obsolete Node 20 Wrangler path
  - Wrangler 4 local development runs against Worker compatibility date `2026-05-03`, avoiding the older local-runtime polyfill crash under Node 24
  - Podman Worker dependency setup now uses `npm ci` so local container starts do not mutate `worker/package-lock.json`
  - the public Campaign Creator Checklist now covers campaign add-ons, embed-code promotion, shipping fallback/free-shipping decisions, tax expectations, report recipients, and fulfillment handoff
  - a Spanish creator checklist route now exists at `/es/creator-campaign-checklist/`

## Future Features

- [ ] Further tax calculator work
  - Support USA and international
  - Target local / jurisdiction-level US rates, not just state-level rates
  - Near-term focus: finish New Mexico local gross receipts tax coverage so the calculator can be manually tested end to end with more confidence
  - Add stronger offline/in-repo coverage for more free local-jurisdiction state datasets after New Mexico
  - Decide how much international logic should stay vendored offline versus optional provider-backed
  - Add a documented tax-data refresh/import workflow for future jurisdiction datasets
  - Future consideration: business tax handling such as VAT ID validation, reverse-charge flows, exemptions, and product tax classes
- [ ] Add net revenue analytics after allocated processor fees
  - Keep existing Campaign revenue and Platform revenue cards as gross category totals for clarity
  - Add separate Net campaign revenue and Net platform revenue values
  - Allocate actual Stripe fees proportionally across campaign revenue, platform revenue, tax, and shipping based on each component's share of the charged PaymentIntent
  - Fall back to estimated fee allocation only for active pledges or older charged pledges without actual Stripe balance transaction data
  - Make card/table help text explicit about gross versus net values so analytics reconcile cleanly
- [ ] Add richer campaign marketing tools
  - announcement composer with local drafts, read-only dry runs, and explicit live-send/audit writes
  - optional abandoned-cart follow-up only after consent, retention, duplicate-send prevention, and free-tier-aware storage are designed
- [ ] Support different prices per add-on variation
  - Extend platform and campaign add-on variant schemas so a variant can override base price without requiring duplicate products
  - Update cart, checkout, Manage Pledge, analytics, reports, and fulfillment exports to use the resolved variant price consistently
  - Preserve backwards compatibility for existing add-ons whose variants only define `id`, `label`, and `inventory`
  - Add admin dashboard validation so price overrides cannot be negative, malformed, or silently ignored
- [ ] Allow super admins and campaign users to publish email-protected campaign preview pages
  - Add a preview publication state that exposes draft campaign pages only through signed, expiring links
  - Scope preview access to super admins, assigned campaign users, or explicitly invited reviewers
  - Keep previews out of `robots.txt`, `sitemap.xml`, public campaign indexes, and social metadata intended for live pages
  - Reuse the existing magic-link/session validation patterns instead of introducing a separate password system
  - Make preview publishing clear in the admin dashboard so users understand it does not make the campaign publicly live

## Known Issues

**Credit Card Autofill**: CC number, expiry, and CVV fields are inside Stripe's iframe for PCI compliance — not accessible to our autofill scripts.
