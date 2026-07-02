# Roadmap

## Current Milestone

**v1.0.8**

The v1.0.8 milestone ports the Store-derived runtime hardening that fits this project, keeps Marketing reads lazy and authenticated, remembers admin dashboard tab/subtab context in browser-local state, adds locale completeness checks so supported translation catalogs stay aligned, and brings Store's generated-site SEO audit pattern into Pool's merge gate.

## Completed

**Protected campaign previews and new campaign creation**

- [x] Protected preview pages
  - Preview pages live at `/campaigns/:slug/preview/` and localized equivalents, but stay `noindex,nofollow,noarchive`, strict-origin referrer scoped for embedded media, no-store, outside public sitemap output, and excluded from public intent prefetching
  - Authenticated super admins and assigned campaign users can fetch preview payloads through the existing admin session and campaign-scope checks
  - Publishing admins receive a dashboard-visible signed preview link, explicitly invited reviewer emails receive signed preview links that expire in 24 hours, and the email copy says so clearly
  - Preview access validates token type, expiry, campaign slug, and allowed email against a 24-hour `campaign-preview-reviewers:<slug>` Worker KV allowlist instead of storing reviewer lists in GitHub-backed campaign front matter or public campaign JSON
  - New/preview-only campaigns remain invisible from public `/campaigns/:slug/`, homepage lists, localized campaign pages, community pages, `/api/campaigns.json`, add-on catalogs, share cards, and sitemap output until launched
- [x] New campaign creation
  - Super admins can create a preview-only campaign from the Campaigns dashboard with only a required title
  - The flow can optionally assign one or more existing campaign users and optionally create one or more new campaign users with required names and emails
  - Campaign source is created locally in dev or through the existing GitHub-backed `_campaigns/<slug>.md` publish path in production, the normal rebuild is triggered when GitHub-backed, assigned/new users are saved in `admin-users:v1`, and an admin audit event is recorded
  - Assigned campaign users receive Resend-powered emails with the admin dashboard link when users are assigned
- [x] Campaign archiving
  - The Campaigns -> Settings subtab shows Archive campaign below the background fields only to super admins when the campaign is not currently live
  - The Worker validates role, CSRF, campaign existence, and effective state, then archives locally in dev or dispatches `.github/workflows/archive-campaign.yml` in production
  - The archive move keeps campaign source and campaign-owned media in `archive/campaigns/<slug>/`, writes an archive manifest, and leaves media still referenced by other active campaigns in place
- [x] Publish conflict protection
  - Campaign content and preview publishes carry a GitHub file SHA/base revision when available
  - Stale publishes are rejected with a specific conflict response so browser-local drafts remain intact and users can reload before publishing

**Admin dashboard analytics and operations**

- [x] Gross and net revenue analytics
  - Campaign revenue and Platform revenue remain gross category totals, while net cards/table columns subtract each category's allocated processor-fee share
  - Successful supporter charges store Stripe balance transaction fee, net, gross, charge, and balance transaction IDs when available
  - Analytics uses actual stored Stripe fee values for charged pledges and the existing estimated fee model for active pledges or older charged records without Stripe balance data
  - A super-admin-only, CSRF-protected backfill path retrieves historical Stripe balance transaction data from campaign pledge indexes without KV list scans
  - Card and table labels keep gross and net values distinct for reconciliation
- [x] Plan usage tracker
  - Super admins can load Cloudflare Workers/KV and Resend quota usage from Settings -> Plan usage automatically when the section opens
  - The tracker shows plan names, progress bars, `used of limit` text, warning/critical thresholds, and plan-management links
  - Provider API tokens stay server-side; the browser receives only sanitized usage metrics and status messages
  - Loads are page-refresh scoped and read-only, with zero KV writes or list operations

**Platform foundation**

- [x] Branding and i18n scaffolding
  - The Pool / Dust Wave platform branding
  - money formatting plugin
  - translation helper, `en.yml`, and example templates
- [x] Worker backend and automation
  - pledge storage, stats, inventory, emails, auto-settlement, aggregated supporter charging, and automatic campaign state transitions
  - campaign state, browser countdowns, Worker deadlines, scheduled reports, settlement checks, and admin date/time surfaces share the same `platform.timezone` / `PLATFORM_TIMEZONE` model
  - the minute-level Worker scheduler persists `cron:lastRun` hourly instead of every minute, keeping cron health visible without baseline free-tier KV write churn
- [x] Podman local development
  - `./scripts/dev.sh --podman`, containerized headless Playwright, Podman-aware smoke/report helpers, `podman:doctor`, and `podman:self-check`
  - host and Podman Worker development use Node 24 to match GitHub Actions deployments and avoid the obsolete Node 20 Wrangler path
  - Wrangler 4 local development runs against Worker compatibility date `2026-05-03`, avoiding the older local-runtime polyfill crash under Node 24
  - Podman Worker dependency setup uses `npm ci` so local container starts do not mutate `worker/package-lock.json`
  - the Podman media optimizer includes `optipng` and `gifsicle` for local PNG/GIF source compression through the same repository media workflow
- [x] Setup and deploy helper
  - `npm run setup:deploy` / `scripts/setup-deploy.mjs` ships as a dependency-free Node CLI for local setup, production dry runs, config sync, Cloudflare KV creation/update, Worker secret writes, GitHub repository secret writes, auth helpers for `gh`/`wrangler`/optional Stripe CLI, and optional `wrangler deploy`
  - The helper keeps production setup idempotency and operator confirmation front of mind, while avoiding app-wrapper complexity until the script-first workflow is stable
  - Production setup now detects and reuses existing Cloudflare KV namespace bindings/resources before planning creation, including dry-run output that distinguishes reuse from create
  - Read-only readiness checks can call live Cloudflare, GitHub, Stripe, Resend, Turnstile, USPS, and ZIP.TAX provider APIs during setup/dry runs, with `--skip-readiness` available when operators need a narrower local check
  - Setup-helper subprocess tests exercise dry-run, temp-repo local secret generation, production KV create/reuse planning, generated Worker secret writes, and readiness probes with fake provider CLIs so coverage does not depend on live credentials

**Campaign and public experience**

- [x] Campaign page presentation
  - campaign sorting
  - uniform campaign cards with featured-tier preview
  - two-column campaign layout
  - hero image / wide image / video variants
  - countdown pre-rendering
  - tier images and creator images
  - campaign progress bars and milestone markers render static width/position classes so first load no longer waits for JavaScript to avoid collapsed marker layouts
  - responsive image generation includes a `640w` WebP rung between the existing `480w` and `960w` variants for mobile campaign pages
  - YouTube campaign hero videos render local poster/play facades and defer the remote iframe until supporter play intent
- [x] Funding and community features
  - production phases with registry items
  - community decisions / voting
  - production diary
  - ongoing funding
  - stretch-goal-gated tiers with unlock animations
  - Hand Relations production launch
- [x] Launch reminders
  - upcoming campaign pages can collect one-time launch reminder signups through a slim localized form with Turnstile, rate limiting, campaign/email dedupe, signed unsubscribe links, and bounded dispatch jobs
  - launch reminder delivery reuses the existing Resend email module, sender configuration, locale catalog, and pacing instead of adding a second email integration
  - launch reminder dispatch and supporter confirmation retry queues maintain small queue-state markers so idle scheduled ticks skip KV namespace list scans, with hourly compatibility rechecks for manually inserted legacy jobs
  - `_config.local.yml` can blank the reminder Turnstile site key so local development hides the widget consistently with local admin sign-in

**Pledging and supporter management**

- [x] No-account supporter management
  - magic-link architecture
  - pledge success / cancelled pages
  - `/manage/` dashboard
  - supporter-only `/community/:slug/` access with session-scoped supporter tokens
  - pledge history tracking
- [x] Flexible pledges
  - support items and custom amounts flowing cart → Worker → KV → stats
  - live support-item stats tracking
  - multi-tier pledge support via `additionalTiers`
  - non-stackable tier support
  - post/live Manage Pledge support-item display rules
- [x] Physical reward shipping
  - first-party physical-item detection
  - physical-tier shipping
  - checkout autofill and shipping-address support
- [x] Abandoned-checkout reminders
  - Abandoned-checkout reminders collect an explicit one-reminder opt-in, queue only after first-party Stripe session creation succeeds, delete on completed pledge persistence, suppress duplicate/signed-unsubscribed audiences, and send through the shared Resend email module
  - Signed reminder links restore a sanitized browser checkout draft for the same abandoned cart/contact context and start a fresh Stripe session without putting Stripe secrets in URLs
  - Scheduling uses `abandoned-cart-queue:v1`, retention limits, sent/suppression markers, and bounded batches so idle cron ticks avoid KV list scans
  - Campaign admins can view campaign-scoped abandoned-checkout reminder health from aggregate queue/outcome counters without listing KV namespaces, and admin-created suppression rows show the suppressed email so they can be cleared from the table
  - Campaign-scoped suppression controls are explicit admin mutations with CSRF, audit events, hashed email identifiers, and no retry-specific abandoned-cart action

**Payments, inventory, and reporting**

- [x] Stripe checkout and card updates
  - native on-site Stripe payment step in the second checkout sidecar
  - `Update Card` using the same secure pattern
  - fully automated checkout E2E coverage
  - post-persistence live-stats/inventory refresh handling
  - checkout hardening around storage, caching, origin checks, and recovery retries
- [x] Inventory and campaign accounting
  - live stats API
  - limited-tier inventory tracking
  - Durable-Object-backed oversell protection for scarce tiers
  - stats recalculation support for `additionalTiers`
  - platform add-on inventory uses a durable sold-count projection that pledge create, modify, and cancel paths update, so normal inventory reads no longer rebuild sold counts by listing all pledges after bootstrap
- [x] Supporter emails and reports
  - milestone notifications
  - tip-aware emails with full subtotal/tip/tax/shipping breakdowns
  - ledger-style pledge reports and fulfillment CSV exports
  - shipping included in reporting
  - automatic diary broadcasts use stable entry IDs so edited diary entries do not resend as new updates
- [x] Projection integrity tools
  - read-only drift checks for per-campaign and all-campaign projection state
  - `./scripts/check-projections.sh` operator wrapper for local and Podman-backed checks
  - mutable-pledge smoke coverage verifies campaigns stay projection-clean after setup, modify, and cancel
  - clearer operator guidance around projection drift versus ledger/current-state report differences
- [x] Add-on products
  - Platform add-ons support the first Dust Wave merch catalog (`DUST WAVE T-Shirt`, `DUST WAVE Sticker`, and `DUST WAVE Butterfingers T-Shirt`), fixed prices, simple variants, inventory, low-stock thresholds, sold-out filtering, and shared product cards
  - Campaigns can define `campaign_add_ons` in front matter; cart and Manage Pledge show them with the same add-on card patterns under a campaign-owned section
  - Multi-campaign carts use an anchor-campaign model, and removing a campaign pledge also removes campaign add-ons tied to that campaign
  - Campaign add-ons count toward the owning campaign subtotal and goal, inherit that campaign's shipping rules, and stay distinct from platform add-ons in reports and fulfillment ownership
  - Platform add-ons use separate platform revenue and fulfillment accounting, including a separate physical shipment/shipping charge for global add-ons
  - The Smoke Editable fixture covers imported campaign add-ons from the Dust Wave shop for browser, shipping, and report coverage
- [x] Shipping and delivery options
  - USPS-backed domestic/international rating replaced the old flat physical-fee model, with deployment fallback shipping, optional campaign overrides, and deployment/campaign free-shipping controls
  - Physical tiers and support items define shipping metadata with shared presets; deterministic manual-rate items like `sticker` and `signed_script` can skip USPS when eligible, and disc presets try cheaper valid classes like `MEDIA_MAIL` before parcel services
  - Worker-canonical shipping totals flow through checkout, Manage Pledge, emails, reports, and fulfillment exports
  - Delivery options support `standard`, `signature_required`, and `adult_signature_required` across cart, checkout, Manage Pledge, saved totals, and supporter emails
  - Checkout country data comes from a shipping-country reference, campaigns with flat-rate overrides skip USPS, and carts stay in estimate mode until a live quote is possible
  - Smoke coverage verifies real USPS domestic/international rating, fallback behavior, and signature-option flows

**Creator tooling and content**

- [x] Admin dashboard
  - `/admin/` and `/es/admin/` private shells with noindex handling and localized dashboard copy
  - magic-link sign-in, role-scoped super-admin and campaign-user access, CSRF/origin checks, safe cookie handling, and read-only session checks
  - Cloudflare Turnstile challenge support protects the admin email sign-in submission before magic-link email delivery
  - Settings, Add-ons, Campaigns, Analytics, Reports, Supporters, Marketing, Users, Secrets & credentials, and Runtime diagnostics views
  - super admins can set the default platform timezone from a select menu populated with supported IANA timezone options
  - Settings -> Users saves directly to Worker KV at `admin-users:v1` and emails sign-in instructions to newly created users when email is configured; Secrets & credentials remains status-only
  - Reports, Analytics, Supporters, content loads/previews, marketing link generation, and table filters avoid KV writes on normal read paths
  - Supporters and Analytics return empty read-only campaign views for campaigns without pledge indexes instead of blocking new/empty campaign dashboards
  - block-based WYSIWYG content editing uses one polymorphic block schema for campaign content and diary entries
  - diary editing preserves stable entry IDs, title-based IDs for new entries, and inline emphasis spacing so automatic emails send only for genuinely new entries
  - full campaign schema for tiers, campaign add-ons, stretch goals, support items, diary, and decisions
  - dashboard media uploads use convention-based asset directories, preserve existing IDs where needed, derive new IDs from names/labels, and dispatch lossless image optimization, responsive WebP variants, and WebM video derivatives with `scope=changed`
  - content and diary publishes clean up same-campaign dashboard-owned media that is no longer referenced; audio uploads remain source-preserved
  - diary hash links open the matching phase tab before scrolling to anchors such as `#diary-production`
  - physical product editors expose shipping presets or explicit package metadata while digital products hide shipping-only fields
  - Settings -> Advanced performance exposes the intent-prefetch enabled state, delay, and page-view limit for super admins, with Worker config mirroring through `INTENT_PREFETCH_*`
  - admin email sign-in keeps the existing Turnstile challenge after a login attempt and uses the shared dashboard status-message styling for more prominent auth feedback
  - dashboard reloads restore the last allowed top-level tab, Settings section, selected Campaigns campaign, and Campaigns subtab from browser-local state without adding Worker or KV writes
  - responsive, accessibility, security/noindex, Spanish i18n, browser, unit, and KV-write-budget coverage cover dashboard flows
- [x] Campaign marketing tools
  - Campaigns -> Marketing stays focused on campaign-link generation, saved referral codes, downloadable PNG/SVG QR codes, and the campaign embed builder without adding another top-level dashboard surface
  - Saved referral codes store only the explicit campaign-scoped referral record; QR preview/downloads are browser-local and do not read or write KV
  - Campaign QR generation was adapted from the MIT-licensed QR generator approach in `1612elphi/delphitools` for this stack's URL builder, saved referral links, and PNG/SVG download needs
  - Shared Marketing drafts use one campaign-scoped KV record with 7-day expiry, explicit load/save/clear controls, revision-conflict protection, and one bounded write only on user save/clear
- [x] Analytics attribution reporting
  - Analytics reuses the existing campaign pledge index and saved referral labels to show referral and UTM source/medium/campaign/content aggregates without KV list scans or a duplicate Marketing-tab reporting surface
- [x] Supporter email blasts
  - Campaigns -> Blast lets assigned campaign users and super admins send supporter email blasts to the campaign's indexed supporters using the shared WYSIWYG editor, subject, CTA Button Label, and CTA Button URL fields
  - Blast drafts remain browser-local; automatic dry runs run before test/live sends, test sends go only to the signed-in admin, live sends require the matching dry-run hash, and sent history is shown read-only below the editor
  - Blast image uploads reuse the campaign media upload/optimization path so email images are site-hosted under `assets/images/campaigns/<slug>/`; YouTube/Vimeo blocks render as email-safe links instead of embedded players
  - Shared Blast drafts use the same explicit 7-day shared-draft model as Marketing, including revision conflicts and no automatic background writes
- [x] WYSIWYG media selection
  - Campaign Content, Diary, and Blast image blocks can choose existing campaign images from a scoped media-library dialog instead of requiring pasted `/assets/...` paths
  - Super admins may also select shared/default images; campaign users see only media for campaigns they manage
  - The picker is read-only, GitHub-directory-backed, and adds no new KV state or duplicate media index
- [x] Creator docs and runbooks
  - the public Campaign Creator Checklist and Spanish checklist cover campaign add-ons, embed-code promotion, shipping fallback/free-shipping decisions, tax expectations, report recipients, fulfillment handoff, share-link planning, dashboard media uploads, launch reminders, platform timezone expectations, deferred YouTube hero embeds, and responsive WebP variants
  - a Spanish creator checklist route exists at `/es/creator-campaign-checklist/`

**Quality, accessibility, and design system**

- [x] Quality checks
  - Vitest unit coverage, Playwright E2E coverage, merge-gate checks, and local smoke coverage
  - Admin dashboard browser coverage spans `/admin/`, `/es/admin/`, Settings, Add-ons, Campaigns, Analytics, Reports, Supporters, Marketing, and Users
- [x] Public performance
  - public pages load a lightweight cart-runtime loader first and defer the full cart stack until persisted cart state, recovery state, or clear supporter intent requires it
  - same-origin public document prefetching follows a small local intent model with route allowlists, sensitive-query exclusions, network guards, low per-page limits, and a default-enabled config surface
  - production Pages builds minify generated `_site` CSS/JS after Jekyll output, while Cloudflare remains responsible for gzip/Brotli/Zstandard transfer compression and Auto Minify stays disabled
- [x] Accessibility
  - dialog, tab, tip-slider, error, and live-region semantics
  - axe-backed critical-surface coverage
  - broader browser accessibility coverage across campaign, community, pledge-result, About, and Terms states
  - shared public shells keep skip links and stable `main-content` anchors, and the cart trigger exposes clearer accessible labels and expanded state
- [x] Design system and responsive layout
  - shared tokens, typography, buttons, fields, card shells, stacked sections, responsive surfaces, tab lists, pill states, media-object grids, quantity steppers, and primary action buttons
  - public pages, campaign pages, cart / checkout, Manage Pledge, Update Card, community pages, and long-form content use the same layout and responsive patterns instead of parallel styling
  - mobile coverage includes overflow, scrollability, reachable primary actions, safe-area-aware cart/nav overlays, small-screen summary wrapping, and larger remove/close tap targets
  - add-on cards and Manage Pledge controls are normalized across desktop, tablet, and small-phone breakpoints
  - Node 25 test compatibility was repaired for the default local toolchain
- [x] Fork customization
  - canonical `platform`, `pricing`, `design`, `checkout`, and `cache` settings
  - auto-synced Worker mirroring from `_config.yml` / `_config.local.yml` into `worker/wrangler.toml`
  - curated CSS theme-variable bridge emitted into `assets/main.css`
  - configurable core brand assets and documented no-code customization surface
  - branded Stripe Elements and supporter emails follow the shared design/config surface instead of a separate checkout/email theme path
- [x] Spanish localization
  - `_config.yml` owns supported languages, language labels, and curated localized public-page routes
  - English + Spanish routes exist for `/`, `/about/`, `/terms/`, `/pledge-success/`, `/pledge-cancelled/`, `/manage/`, `/community/`, and supporter community pages
  - a quieter footer language switcher plus shared route helpers preserve query strings and hashes for tokenized routes such as `/manage/?t=...`
  - shared public campaign/community labels, site-owned cart/community/Manage Pledge runtime strings, campaign countdown/gallery/live-stats edge copy, and Worker supporter emails read from locale data plus persisted `preferredLang`
  - cart-button summaries, checkout tax-location helper copy, and localized public metadata follow the same shared locale model
- [x] SEO and structured metadata
  - shared metadata covers titles, descriptions, canonicals, OG/Twitter tags, and default social images across public layouts
  - `robots.txt`, `sitemap.xml`, and explicit `noindex,nofollow` handling keep private/tokenized/supporter-only flows out of search intent
  - public pages emit conservative `Organization` / `WebSite` JSON-LD, and campaign pages emit conservative `CreativeWork` plus breadcrumb JSON-LD
  - the public community hub points people back to public campaign pages instead of directing crawlers into supporter-only routes
  - merge-gate and unit coverage protect alternate-language metadata, sitemap inclusion, and the public crawl surface
  - bounded fork-facing SEO config covers `seo.x_handle`, `seo.same_as`, `seo.default_social_image_alt`, `seo.og_locale_overrides`, and whether the public community hub should remain indexable
  - structured browser and Worker debug logging ships as a config-driven developer aid with timestamps, severity labels, scoped prefixes, and browser global error capture
  - public metadata emits language/app-name hints, secure social-image tags where possible, and locale-aware JSON-LD language/breadcrumb roots
  - sitemap URL rendering is shared through `_includes/seo-sitemap-url.xml`, including localized `xhtml:link` alternates for localized public pages and campaign pages
  - `npm run test:seo` validates built crawl files, canonicals, hreflang alternates, social metadata, and JSON-LD as part of the merge gate
- [x] Embeds and share previews
  - campaign pages link to a hosted locale-aware embed builder that generates copy-paste iframe code with layout, theme, media, and CTA options
  - the embed widget uses live Worker-backed campaign state, auto-resizes after paste, and supports localized return links plus localized builder/runtime copy
  - the admin Marketing embed preview keeps progress fill, milestones, goal marker, and stretch-goal labels contained for video-led campaigns
  - campaign pages emit richer state-aware social metadata plus Worker-generated PNG share-card images, with SVG retained for internal preview/debug tooling
  - localized campaign routes, localized embed routes, and locale-aware share-card URLs keep embeds and rich previews aligned across English and Spanish
  - campaign pages render reusable icon-only share links for Bluesky, X, Threads, Facebook, SMS, and email, using localized URLs, local PNG icon fallbacks for inline-SVG edge cases, and state-aware CTA text where platforms allow message text
  - responsive share controls appear below the short blurb on mobile/tablet and above the embed button only on desktop
- [x] External website and FAQ
  - `thepool.fund` hosts the platform marketing site and developer FAQ derived from internal documentation
- [x] Denial-of-service protection
  - `RATELIMIT` KV is a hard requirement, with fail-closed behavior when the binding is missing
  - public read endpoints stay intentionally roomy for campaign virality, while checkout, Manage Pledge, and admin mutations use targeted rate limits and request-size caps
  - request-body parsing rejects malformed or obviously oversized payloads earlier across the Worker surface
  - `/checkout-intent/abandon` uses an order-scoped retry budget instead of a naive per-IP limiter
  - deployed Standard/Paid Workers declare a conservative `cpu_ms = 100` ceiling as a denial-of-wallet backstop
  - admin-only observability endpoints and `scripts/check-observability.sh` expose webhook outcome summaries and sampled mutation timings for tuning
- [x] Tax and checkout UX
  - Worker/provider seam, provisional tax UI, and final-tax destination plumbing cover cart, checkout, Manage Pledge, stored pledge data, and supporter emails
  - browser UX keeps tax at `--` until checkout has enough destination data, instead of inventing a fake precise value too early
  - custom checkout collects billing tax location for digital-only carts, while physical/mixed carts stay address-first and support browser autofill again
  - a free-first New Mexico path exists through a vendored starter dataset plus optional EDAC refinement
  - local smoke fixtures and merge-gate coverage work under location-aware tax providers instead of assuming flat tax
- [x] Campaign runner reports
  - campaign front matter supports `runner_report_emails`, with empty/missing meaning no runner reports for that campaign
  - `_config.yml` exposes a bounded `reports.campaign_runner` customization surface for enablement, platform-timezone send time, summaries, attachments, and subject prefix
  - the Worker sends daily campaign-scoped pledge-ledger emails at the configured local send time for live campaigns and split post-deadline fulfillment emails for campaign vs. platform fulfillers
  - the dashboard Reports tab previews pledge/fulfillment rows and downloads CSVs without sending emails or writing sent markers
  - shared-secret report endpoints remain separate for script/operator workflows that intentionally send reports
  - local CLI exports and scheduled Worker emails share the same JS report core to avoid CSV drift

## Future Features

- [ ] Post-v1.0.8 follow-ups
  - [ ] Setup app wrapper
    - Create a simple Mac/Windows/Linux app wrapper around the same setup core after the script-first workflow remains stable across more fork installs
  - [ ] Media library polish
    - Consider making Source URL an advanced/edit-existing-path affordance after the scoped picker has been exercised in production
- [ ] Tax calculator expansion
  - Support USA and international
  - Target local / jurisdiction-level US rates, not just state-level rates
  - Near-term focus: finish New Mexico local gross receipts tax coverage so the calculator can be manually tested end to end with more confidence
  - Add stronger offline/in-repo coverage for more free local-jurisdiction state datasets after New Mexico
  - Decide how much international logic should stay vendored offline versus optional provider-backed
  - Add a documented tax-data refresh/import workflow for future jurisdiction datasets
  - Future consideration: business tax handling such as VAT ID validation, reverse-charge flows, exemptions, and product tax classes
- [ ] Variant-specific add-on prices
  - Extend platform and campaign add-on variant schemas so a variant can override base price without requiring duplicate products
  - Update cart, checkout, Manage Pledge, analytics, reports, and fulfillment exports to use the resolved variant price consistently
  - Preserve backwards compatibility for existing add-ons whose variants only define `id`, `label`, and `inventory`
  - Add admin dashboard validation so price overrides cannot be negative, malformed, or silently ignored

## Known Issues

**Credit Card Autofill**: CC number, expiry, and CVV fields are inside Stripe's iframe for PCI compliance — not accessible to our autofill scripts.
