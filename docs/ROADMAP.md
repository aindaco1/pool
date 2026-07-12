# Roadmap

## Current Milestone

**v1.0.9**

The v1.0.9 milestone adapts the Store v1.0.6/v1.0.7 production-operations work to Pool's pledge model: classified encrypted recovery, four-hour recovery objectives, bulk admin reads, session/audit controls, performance and cache evidence gates, posture/localization automation, and reviewed production deployment.

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
  - Merge-gate sanity checks cover release script syntax plus `release:smoke`, provider evidence, and payment smoke command surfaces without sending email
- [x] Release evidence automation
  - `npm run release:smoke` wraps premerge, setup/deploy readiness dry run, Podman E2E when available, focused accessibility evidence, optional screen-reader transcript evidence, rendered i18n/SEO evidence, pledge/report evidence, provider readiness, and payment smoke readiness
  - focused commands cover accessibility, rendered i18n/SEO, pledge/report, provider readiness, payment smoke, and optional VoiceOver/Whisper transcript evidence
  - the Release Provider Evidence GitHub Actions workflow provides strict Cloudflare DNS API evidence through dedicated DNS-read secrets
  - `POOL_EMAIL_DRY_RUN` / `RESEND_EMAIL_DRY_RUN` let release evidence render email payloads without calling Resend
- [x] Public performance
  - public pages load a lightweight cart-runtime loader first and defer the full cart stack until persisted cart state, recovery state, or clear supporter intent requires it
  - same-origin public document prefetching follows a small local intent model with route allowlists, sensitive-query exclusions, network guards, low per-page limits, and a default-enabled config surface
  - production Pages builds minify generated `_site` CSS/JS after Jekyll output, while Cloudflare remains responsible for gzip/Brotli/Zstandard transfer compression and Auto Minify stays disabled
- [x] Accessibility
  - dialog, tab, tip-slider, error, and live-region semantics
  - axe-backed critical-surface coverage
  - broader browser accessibility coverage across campaign, community, pledge-result, About, and Terms states
  - shared public shells keep skip links and stable `main-content` anchors, and the cart trigger exposes clearer accessible labels and expanded state
  - release evidence checks campaign pledge focus order, launch-reminder live status updates, reduced-motion campaign cart surfaces, high-zoom behavior, keyboard paths, and mobile overflow
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
  - release i18n/SEO evidence samples rendered English and Spanish public pages, active campaign metadata, private-route noindex shells, sitemap alternates, robots boundaries, and route copy
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

- [ ] Cross-repo parity and docs-as-code discipline
  - Treat Store and Pool feature parity as transferable implementation slices, not a mandate to copy product surfaces. Shared slices include setup/readiness, media authoring, performance gates, security posture, admin audit/session controls, accessibility evidence expansions, i18n QA, SEO sampling expansions, release smoke hardening, payment reconciliation, backup discipline, tax-provider hardening, and add-on price-resolution rules
  - Keep Pool-specific nouns and storage boundaries intact: `_campaigns/`, pledge/order records, `PLEDGES`, `VOTES`, per-campaign Durable Object coordination, platform/campaign add-ons, protected campaign previews, Manage Pledge, supporter community/votes, embeds/share cards, campaign diaries, Blast, launch reminders, abandoned-checkout reminders, and the Pool admin dashboard
  - When Store lands a stronger implementation first, port only the reusable primitive and document the Pool mapping in the relevant Pool docs; for example, Store product/default media selection maps to Pool campaign/default media selection, not to Store's `_products` catalog, R2 download library, coupons, ticket/RSVP, or order lookup surfaces
  - When Pool lands a stronger implementation first, keep regression notes that help Store adopt the primitive without changing Pool behavior or weakening campaign/pledge semantics
  - Keep docs-as-code current by updating the owning document and tests with each slice, not only this roadmap, so README, `worker/README.md`, and the relevant `docs/*.md` files match the implemented source of truth
- [ ] Guided setup TUI wrapper
  - Build a thin, good-looking terminal UI around the existing `scripts/setup-deploy.mjs` setup core instead of creating a separate desktop app or duplicating provider logic
  - Take interface cues from modern terminal-first tools such as [Hermes Agent CLI](https://hermes-agent.nousresearch.com/docs/user-guide/cli) and [Amp CLI](https://ampcode.com/manual): clear status area, responsive progress, keyboard-friendly navigation, streaming task output, interrupt/retry affordances, and a polished command palette feel
  - Keep the script-first contract intact: every TUI action should map to an existing setup mode or a small extension of that mode, and CI/non-interactive users should still be able to use the underlying CLI directly
  - Support the current local and production paths: local secret generation, production dry run, provider readiness checks, KV create/reuse planning, Worker secret writes, GitHub secret writes, optional deploy, and Podman readiness guidance
  - Show a step-by-step readiness board with provider status, required credentials, planned mutations, skipped checks, generated local-only secrets, and clear next actions before any live mutation
  - Keep secrets private in the UI: masked inputs, no terminal echo, no logs containing secret values, and explicit reminders that production secrets are not copied into `worker/.dev.vars`
  - Provide copyable fallback commands for every failed step so operators can drop back to Wrangler, GitHub CLI, Stripe CLI, or the existing setup script without losing context
  - Add transcript/log export that redacts secrets and captures setup decisions, provider statuses, command versions, and failure reasons for support without creating a new telemetry backend
  - Add smoke-test shortcuts after setup, such as `podman:doctor`, `./scripts/dev.sh --podman`, `./scripts/test-checkout.sh --podman`, `npm run test:secrets`, and `npm run test:i18n`, while still leaving actual test orchestration in existing scripts
  - Keep implementation small and cross-platform: prefer a Node TUI layer over the current setup core, avoid Electron/native packaging until the terminal wrapper proves useful, and document any platform-specific terminal limitations
- [ ] Media library usability and optimization workflow
  - Improve the existing campaign-scoped media picker and upload path for creators without adding a second media index, KV-backed media database, or alternate storage backend
  - Make Source URL an advanced/edit-existing-path affordance so normal creators pick from existing campaign media, upload a new file, or replace a referenced file without pasting `/assets/...` paths by hand
  - Add creator-friendly media browsing: campaign-scoped filters, image/video/audio type tabs, thumbnail previews, filename/search filtering, recently uploaded assets, dimensions/duration/file-size display, and clear source-vs-derived labels
  - Improve accessibility and publishing quality at the point of use: required alt text for meaningful images, decorative-image handling, captions where supported, focal/crop guidance for square hero, wide hero, cards, social previews, and email-safe Blast images
  - Add safe replace/reuse flows that show where an asset is referenced across campaign content, diary entries, hero fields, tier/add-on images, Blast drafts, embeds, and social/share surfaces before changing or removing it
  - Surface optimization status in the dashboard by reusing the repository media optimizer outputs: source file, generated WebP widths, generated WebM derivatives, pending optimization, stale derivative, missing derivative, and oversized source warnings
  - Add repair actions that dispatch or suggest the existing media optimization workflow with `scope=changed` or `scope=all`, rather than introducing Worker-side image/video processing
  - Add broken-reference checks for campaign-owned media so creators see missing files, deleted source assets, failed derivative generation, and email image paths that will not resolve publicly
  - Add lightweight performance budgets for common placements, including hero image, gallery image, tier image, Blast image, and video poster, with warnings instead of hard blocks unless the file is unsafe or unsupported
  - Keep cleanup conservative and explainable: publish-time cleanup should continue deleting only same-campaign dashboard-owned media that disappeared from normalized content and is not referenced elsewhere
  - Extend tests around media picker usability, optimization-state rendering, broken-reference warnings, cleanup safety, responsive image selection, and Blast image payload safety without duplicating the optimizer's own native-tool checks
  - Update creator-facing docs with media naming, alt-text, source/derivative expectations, optimization warnings, replacement behavior, and when to ask a platform operator for shared/default media
- [ ] Production quality gates and admin operations hardening
  - Adapt the relevant Store Future Work hardening to The Pool without importing Store-only product, ticket/RSVP, R2 download, or storefront catalog systems; focus on public campaigns, embeds, cart/checkout, Manage Pledge, admin dashboard, campaign creator workflows, Worker routes, and scheduled jobs
  - Add lightweight performance budgets for campaign pages, embeds, cart, checkout, Manage Pledge, and admin routes, covering JavaScript size, CSS size, image/video weight, critical route timing, Worker response time, and dashboard table/render latency
  - Add repeatable Lighthouse/PageSpeed checks for core public routes and embeds before production deploys, keeping the checks scriptable and optional where external provider credentials or stable URLs are unavailable
  - Surface Worker timing percentiles and slow-route summaries in Settings -> Plan usage or Runtime diagnostics by reusing existing observability samples instead of adding a second telemetry backend
  - Add cache-status checks for static assets, generated JSON feeds, campaign pages, embed assets, share-card responses, and private/no-store routes so public performance improvements do not weaken checkout, admin, preview, or tokenized cache rules
  - Expand setup/readiness checks so they mirror the full security guide: Worker secrets, Stripe webhooks, Resend senders, Turnstile widgets, USPS and ZIP.TAX credentials, `RATELIMIT`, CSP, allowed origins, admin bootstrap users, protected previews, lookup/manage tokens, reminders, and production mode
  - Add an admin session/device review view with recent login metadata and explicit session revocation, using the existing admin auth/session/audit model rather than a separate account system
  - Expand admin audit events into a searchable dashboard audit view with filters and CSV export, reusing existing KV-backed audit records and keeping sensitive payloads redacted
  - Add scheduled secret/config posture checks that warn when production-required secrets, webhook endpoints, allowed origins, provider readiness, or admin user posture drift from expected config; surface results through admin diagnostics and/or GitHub issues instead of silently mutating runtime state
  - Expand release-artifact support beyond the optional VoiceOver/Whisper helper to the documented manual VoiceOver and NVDA pass, including checklist evidence for public campaign pages, cart/checkout, Manage Pledge, creator dashboard editing, reports, and admin auth flows
  - Expand automated accessibility coverage beyond the current campaign focus/status/reduced-motion release evidence to mounted checkout/payment surfaces when Stripe test fixtures are available, plus high-zoom screenshots for cart, checkout, Manage Pledge, campaign editing, reports, supporter tables, and campaign embed builder controls
  - Keep long campaign titles, tier/add-on/variant labels, filenames, referral/UTM labels, supporter emails/names, Blast subjects, and dense tablet/mobile admin rows in regression fixtures so layout hardening covers real creator/admin content
  - Move remaining hardcoded public/admin runtime strings into `_data/i18n/*` or runtime message JSON as they are touched, and add localized QA snapshots for checkout errors, Manage Pledge, campaign creation/editing, report downloads, Blast sends, and fulfillment/status copy
  - Define a translator/native-speaker review loop before adding locales beyond English and Spanish, including localized campaign metadata, alternate links, JSON-LD language values, emails, and dashboard help text
  - Keep Podman smoke coverage aligned with the host merge gate, add troubleshooting notes for stale `gvproxy`, port conflicts, and first-run image rebuilds if they recur, and consider a scheduled Podman E2E CI job if runner support remains reliable
  - Expand rendered SEO QA beyond the current release samples with more active campaigns, localized campaign pages, share-card URL checks, and noindex handling for preview, checkout, and supporter-only routes
  - Expand the dedicated release smoke script and evidence checklist beyond the current pledge/report/payment/provider baseline for paid physical pledges, digital-only pledges, platform and campaign add-ons, Manage Pledge modify/cancel/update-card paths, launch reminders, abandoned-checkout reminders, supporter email blasts, settlement, pledge/fulfillment reports, analytics, and admin downloads
  - Update `docs/PERFORMANCE.md`, `docs/SECURITY.md`, `docs/ACCESSIBILITY.md`, `docs/I18N.md`, `docs/PODMAN.md`, `docs/SEO.md`, `docs/TESTING.md`, `docs/DASHBOARD.md`, and `docs/WORKFLOWS.md` as each hardening slice lands so the release procedure stays docs-as-code rather than tribal knowledge
- [ ] Payment integrity hardening from the Fintech Engineering Handbook
  - Keep the current architecture: Stripe remains the processor, Stripe owns card data, the Cloudflare Worker remains the canonical payment boundary, KV remains pledge/projection storage, Durable Objects serialize scarce inventory and settlement, and the Worker scheduler handles bounded background work
  - Avoid adding a full double-entry ledger unless The Pool later adds refunds, payouts, stored balances, multi-currency money movement, or marketplace-style splits; for the current pledge model, prefer a lightweight append-only payment event journal that references existing pledge/order/campaign IDs
  - Add explicit `currency` metadata to newly persisted pledge, checkout manifest, settlement, report, and analytics rows, defaulting older rows to the deployment's current USD assumption during reads instead of introducing multi-currency behavior
  - Add clearer payment timing fields without duplicating existing history: value time for supporter/Stripe events, Worker booking time for persistence, and settlement/processor availability time when Stripe balance transaction data is available
  - Add a bounded, redacted processor-event journal for high-value Stripe interactions and webhooks, storing event IDs, object IDs, request intent, response status, idempotency key, mode, timestamps, reconciliation status, and only the minimal raw provider payload needed for recovery or audit, with explicit retention and PII minimization
  - Reuse existing observability summaries and Stripe financial backfill logic to build periodic reconciliation jobs that compare pledge truth, settlement jobs, Stripe PaymentIntents, webhook idempotency markers, and stored fee/net data through `campaign-pledges:{slug}` indexes instead of namespace scans
  - Represent reconciliation differences as explicit `reconciliation-break:*` records with status, severity, source object IDs, first/last seen timestamps, and operator notes; dashboard views and scripts should read those records rather than inventing a second reporting model
  - Move payment-adjacent side effects toward a small KV-backed outbox shared by supporter confirmations, payment failure/success emails, report emails, diary/milestone broadcasts, and Blast sends, so pledge persistence and notification delivery can be retried independently through the existing scheduler and Resend helper
  - Harden settlement resumability by making each batch step re-run-safe, adding stale-job detection, and recording enough per-batch state to resume or safely roll forward without recharging supporters
  - Add invariant and crash/resume tests using the existing Vitest and smoke harnesses: no duplicate charged pledge for one settlement group, no charged pledge without Stripe PaymentIntent ID, campaign subtotal projections equal active pledge truth after create/modify/cancel sequences, failed emails stay retryable without mutating pledge truth, and repeated webhooks/batches remain idempotent
  - Keep any production payment test transactions clearly tagged, normal-booked, and reconciled through the same pledge/payment paths rather than hidden behind special-case accounting or reporting behavior
  - Add a narrowly scoped maker/checker path only for manual money-affecting recovery operations that are not already automated or retry-safe, using existing admin sessions, role scopes, CSRF, and audit records rather than introducing a separate approval service
  - Document the new journal, reconciliation breaks, and outbox in `docs/PAYMENT_PROCESSOR.md`, `docs/WORKFLOWS.md`, `docs/SECURITY.md`, and `worker/README.md`, including retention, PII, and operator runbooks
- [x] Backup, restore, and disaster recovery runbook
  - Classified Git, `PLEDGES`, `VOTES`, `RATELIMIT`, Stripe, and Durable Object boundaries in `config/pool-data-inventory.json`, with four-hour pledge/vote/admin RPO/RTO and approved 7-daily/5-weekly/12-monthly/release retention
  - Added metadata and encrypted captured-value snapshots, checksums, decryptability proof, safe retention pruning, append-only off-device copies, and readiness checks without secret-value export
  - Added classification-driven local/preview/production restore plans, authoritative-value validation, derived-state rebuilds, quarantine exclusions, exact preview cleanup, readback verification, and explicit payment/maintenance/approval production gates
  - Added read-only Stripe PaymentIntent reconciliation, low-traffic preflight, weekly synthetic rehearsals, and an opt-in protected quarterly captured-data preview drill with byte-verified off-account archive readback
  - Documented restore order, Durable Object non-import policy, provider reconciliation, production acknowledgements, and post-restore checks in `docs/BACKUP_RESTORE.md`
- [ ] Tax calculator expansion and compliance hardening
  - Start from the current implemented baseline: `worker/src/tax.js` already provides `flat`, `offline_rules`, `nm_grt`, and `zip_tax` provider modes; `_config.yml` mirrors non-secret `tax.*` settings into `worker/wrangler.toml`; `/tax/quote`, checkout, Manage Pledge, stored pledge `taxDetails`, emails, analytics, and reports already use Worker-calculated tax totals; and the browser keeps tax provisional as `--` until it has enough destination detail
  - Keep the current architecture DRY: the Worker remains the only tax authority, cart and Manage Pledge keep requesting quotes instead of duplicating tax math, `_config.yml` owns non-secret provider settings, Worker secrets own provider keys, and reports/analytics continue reading persisted `tax` / `taxDetails` instead of recalculating historical obligations from today's catalog or rate data
  - Prioritize the U.S. experience first, then treat international VAT/GST compliance as a later phase; near-term work should focus on reliable state, county, municipal, special-district, D.C., and U.S. territory coverage before adding cross-border registration, invoicing, or reverse-charge behavior
  - Clarify the tax model before expanding scope: document which amounts are taxable today (`subtotal` including tiers, support items, campaign add-ons, and platform add-ons), which are not currently taxed (`tipAmount` and most shipping unless a provider response marks shipping taxable), and whether each future product category should be taxable, exempt, reduced-rate, digital, admission, donation-like, or shipping-taxable
  - Add item-level tax classification without splitting the checkout model: introduce a shared tax-line builder that turns tiers, support items, custom support, campaign add-ons, platform add-ons, and shipping into typed taxable lines with stable IDs, category codes, amounts, quantity, campaign/platform ownership, and exemption flags, then let providers aggregate those lines when they only support subtotal-level quoting
  - Preserve current supporter UX while improving correctness: keep provisional `--` display when destination is incomplete, but make quote states explicit (`needs_input`, `quoted`, `provider_unavailable`, `fallback_used`) so cart, checkout, Manage Pledge, and admin diagnostics can distinguish missing address from provider failure or deliberate fallback
  - Resolve the `/tax/quote` documentation/behavior mismatch: decide whether the endpoint should continue returning `400`/`503` for missing destination/provider failure, or return a structured provisional response that matches the browser copy in `worker/README.md`; update Worker route tests and docs either way
  - Finish the New Mexico path first because it matches the current deployment: broaden the vendored GRT starter dataset beyond the five current reference locations, add metadata for generation date/source/effective period, improve city/postal/street matching diagnostics, and add a repeatable refresh workflow with reviewable diffs rather than silent live-rate drift
  - Add a monthly GitHub Actions tax-rate watch workflow with `schedule` and `workflow_dispatch` triggers that checks for U.S. rate changes across state, county, municipal, and special-district levels, runs the New Mexico starter refresh, samples ZIP.TAX quotes for configured fixtures, compares results against checked-in snapshots, and opens a pull request or issue with reviewable diffs instead of changing production behavior silently
  - Add provider health controls for live lookups: timeouts, bounded retries where safe, short-lived quote caching keyed by normalized destination/provider/rate version, rate-limit/circuit-breaker behavior for ZIP.TAX and EDAC, redacted error logging, and admin/runtime diagnostics that show provider readiness without exposing API keys
  - Combine the New Mexico-specific solution with ZIP.TAX into a comprehensive U.S. strategy: use EDAC/vendored NM data where it is stronger and free, use ZIP.TAX as the general local-rate provider for all other states, D.C., and U.S. territories, and keep one provider adapter contract so checkout, Manage Pledge, reports, and tests do not care which source produced the quote
  - Decide the fallback policy explicitly per provider and checkout stage: keep the existing configured flat-rate fallback as one available option, but define when previews may use fallback, when production checkout should block, when an operator-approved fallback rate may be used, and whether zero-tax quotes are ever allowed when ZIP.TAX or EDAC is unavailable
  - Strengthen international behavior later: treat `offline_rules` as a conservative preview/fallback, then decide whether international VAT/GST should remain vendored, move to a provider-backed path, or stay disabled by default until registration/nexus obligations are known; add country/state/province normalization and test fixtures for intended launch countries before enabling collection
  - Add business/customer tax features only after scope is approved: VAT ID capture and validation, reverse-charge handling, exemption certificates, tax-inclusive pricing, B2B/B2C rules, destination evidence requirements, and localized invoice/receipt copy should be behind explicit config, admin docs, and tests rather than implicit checkout behavior
  - Improve privacy and retention of tax destinations: review whether persisted `taxDetails.destination` should keep full street address forever, whether stored tax evidence can be minimized or hashed after settlement/report windows, and how this interacts with fulfillment addresses that already require PII retention
  - Add reconciliation and remittance support: create tax liability exports grouped by provider, source, jurisdiction, location code, effective rate, taxable subtotal, taxable shipping, tax collected, campaign/platform ownership, and refund/cancel/modify deltas; ensure reports preserve historical stored tax details even after provider settings or catalog categories change
  - Extend testing at the right layers: unit tests for tax-line construction and provider adapters, fixture tests for NM starter/API fallback and ZIP.TAX shipping taxability, Worker tests for checkout and Manage Pledge tax deltas, browser tests for provisional/error/fallback UI states, report tests for tax liability exports, and setup tests for provider credential/readiness handling
  - Update docs after implementation: `docs/CUSTOMIZATION.md`, `docs/WORKFLOWS.md`, `docs/TESTING.md`, `docs/SECURITY.md`, `worker/README.md`, `docs/PAYMENT_PROCESSOR.md`, creator checklists, and dashboard help text should explain provider selection, fallback policy, refresh cadence, tax category behavior, stored evidence, and what operators must verify with a tax professional
- [ ] Variant-specific add-on prices
  - Adapt the Store pattern carefully: Store already supports variant prices for first-class `_products` and its add-on suggestion runtime resolves `variant.price ?? product.price`, but Pool should borrow only that price-resolution behavior rather than Store's broader product catalog, download, SKU, and R2 model
  - Keep Pool's current architecture: platform add-ons stay in `_config.yml` under `add_ons.products`, campaign add-ons stay in campaign front matter under `campaign_add_ons`, `/api/add-ons.json` remains the static shared catalog, the Worker remains authoritative for totals, and persisted `bundleAddOns.unitPrice` stays the cents-denominated value used by checkout, Manage Pledge, emails, analytics, reports, and fulfillment
  - Add a single shared price-resolution rule for add-ons: a variant may define optional dollar `price`; when present and valid it overrides the product base price, and when absent or blank the product price remains the fallback so existing `id`/`label`/`inventory` variants keep their current behavior
  - Implement DRY helpers instead of ad hoc math: add browser-side `resolveAddOnUnitPriceCents(product, variant)` in the shared add-on utility, add the Worker-side equivalent used by `validateBundleAddOns`, and update the legacy inline `PoolAddOnUtils` fallback inside `assets/js/cart-provider.js` so older boot paths do not drift
  - Update cart and Manage Pledge product-state normalization so each variant state carries `priceCents`, product cards display the selected variant price or an appropriate price range, and changing a variant with a different price updates subtotal, tax/shipping preview inputs, save-button dirty state, and Stripe checkout line items through the existing add-on selection flow
  - Update Worker canonicalization so submitted browser prices are never trusted: `validateBundleAddOns` should recalculate `unitPrice` from the catalog and selected variant, reject invalid products/variants as it does now, and keep inventory allowance logic quantity-only so `add-on-inventory-sold:v1` and inventory overrides do not need a schema change
  - Extend admin dashboard add-on editors for both platform and campaign add-ons with an optional variant Price field beside variant label/inventory, localized help text that explains blank means inherit base price, validation that rejects negative/malformed/nonfinite prices, and YAML serialization that writes `price` only when a real variant override exists
  - Keep `/api/add-ons.json` and `POOL_CONFIG.addOns` as the only catalog surfaces; since the Liquid include already emits raw `variants`, the implementation should only need tests proving variant `price` survives config/front matter into browser and Worker catalog reads
  - Preserve reporting/accounting boundaries: campaign-scoped variant add-ons still count toward campaign subtotal and funding progress, platform add-ons still stay in platform add-on revenue, and reports/analytics/fulfillment exports should continue reading persisted `unitPrice` instead of re-resolving historical prices from the current catalog
  - Add coverage across the existing harnesses: unit tests for add-on utility price resolution and product-state display, Worker tests for checkout manifest and Manage Pledge recalculation with different variant prices, admin-dashboard tests for validation/YAML serialization, report tests for persisted unit-price output, and a focused browser/E2E path that changes a variant and observes subtotal/save-state changes
  - Update `docs/ADD_ON_PRODUCTS.md`, creator checklist copy, and dashboard/help text with examples of inherited versus variant-specific add-on prices, including a warning that changing catalog prices affects future checkouts while existing pledges keep the saved `unitPrice`

## Known Issues

**Credit Card Autofill**: CC number, expiry, and CVV fields are inside Stripe's iframe for PCI compliance — not accessible to our autofill scripts.
