# Roadmap

## Completed

**Search and Google crawl readiness**

- [x] Sitemap and live crawl verification
  - Sitemap `lastmod` values now come only from real content dates instead of changing for every build
  - Jekyll's implicit collection `date` is excluded from sitemap and campaign SEO metadata so deployment timestamps cannot appear as content publication or modification dates
  - `/sitemap.txt` is generated from the same public-item selector as `/sitemap.xml`, and automated generated-site and post-deploy audits require the two URL lists to match exactly
  - The generated SEO audit rejects malformed XML, duplicate URLs, invalid or future dates, private routes, and incoherent structured data
  - Production deploys compare ordinary and Google Inspection sitemap responses, require correct XML/robots content types, and fetch every submitted public URL with bounded propagation retries
  - Cloudflare analytics confirmed Search Console live inspection requests arrived from Google ASN 15169 with the official `Google-InspectionTool` user agent and were not mitigated, ruling out Pool firewall and origin denial as the observed generic live-test error

**Shopping readiness and public policy refresh**

- [x] Featured-reward product pages
  - Campaign Shopping support reuses the existing `featured_tier_id`, reward data, localized route model, cart button, seller identity, and merchant policy instead of creating a second catalog
  - Enabling fails closed unless the featured reward is physical and has a positive price, image, description, and exact availability date after the campaign deadline and within one year
  - Focused product pages expose visible preorder, availability, shipping, and final-sale facts with aligned Open Graph and `Product` / `Offer` / breadcrumb data; expired or upcoming campaign offers become `OutOfStock`
  - The current Their Love candidate remains disabled; exact availability, Merchant Center setup, feed/destination configuration, and Shopping activation are tracked as Future Features rather than release claims
- [x] Public policies and bilingual content
  - Terms now publish stable shipping and no-returns anchors, a clear final-sale default, a seven-day fulfillment-problem reporting guideline, carrier-record verification, good-faith untracked review, available remedies, and nonwaivable-rights language
  - About and Terms use `_config.yml` author/company and support-email values, avoid stale release copy, and keep English/Spanish section parity
  - Shared UI and documentation target neutral US/Latin American Spanish; the owner completed the final fluent review for v1.1.2 on 2026-07-14 in addition to automated completeness checks
  - Brand & SEO exposes the Shopping return-policy country while keeping the no-returns type read-only so dashboard state, public Terms, and JSON-LD cannot silently diverge

**Variant-specific add-on prices**

- [x] Shared price contract and historical accounting
  - Platform `_config.yml` add-ons and campaign `campaign_add_ons` accept optional variant `price`; blank inherits the product price and explicit zero remains a valid override
  - Browser runtimes share `resolveAddOnUnitPriceCents`, legacy cart/Manage fallbacks implement the same rule, and variant product state carries `priceCents`
  - Cart and Manage Pledge selectors show differing variant prices and update card/subtotal state through the existing selection flow
  - The Worker rejects browser price authority, canonicalizes new or changed selections from the current catalog, and preserves persisted `unitPrice` for unchanged historical pledge lines
  - The platform/campaign admin editors expose localized optional variant prices, reject negative, malformed, or above-ceiling values, and serialize `price` only for real overrides; the Worker independently enforces the canonical `$1,000,000` amount ceiling
  - Existing add-ons require no migration because variants without `price` continue inheriting their product price

**Production quality gates and admin operations hardening**

- [x] Store v1.0.8 release carryover review
  - Pool v1.1.0/v1.1.1 already contains the applicable shared price, media, Stripe, reconciliation, and email-outbox slices
  - The hosted-runner AWS CLI recovery fix was carried over; Store's multi-processor order filter does not apply because Pool is Stripe-only and campaign-scoped
  - Store readiness, Workers Cache, global catalog marketing, product/SKU, coupon, ticket, order, download, and R2 surfaces remain excluded or mapped to existing Pool-native controls
- [x] Store-aligned release gates adapted to Pool
  - One performance-budget config governs generated JavaScript/CSS ceilings, route-specific Lighthouse categories/Web Vitals/resource limits, executable dashboard/Worker timing targets, Workers Cache evidence policy, and public/private cache targets
  - Scriptable Lighthouse and cache-policy evidence cover core public, campaign, runtime shell, admin, generated JSON, static asset, and private Worker routes; evaluator unit tests run without live provider credentials
  - Existing bounded Worker timing histograms now sample the dashboard summary and settings reads, surface p50/p95/p99/max and slow-route summaries in Settings -> Runtime diagnostics, and feed a redacted authenticated p95 release audit without a second telemetry store or customer/request payloads
  - Homepage campaign-card backgrounds reuse responsive WebP derivatives and lazy loading, cutting the measured home transfer from roughly 4.0 MB to 1.5 MB and repeated throttled LCP from roughly 20.3 seconds to 5.4-6.6 seconds
  - Both production and full dependency audits pass after pinning the compatible clean Lighthouse release
  - Pool v1.0.9 session/device review and revocation, searchable audit filters/CSV, full provider/security readiness, production-posture drift checks, localization packets, pinned deployment workflows, and scheduled Podman coverage remain the shared admin-operations baseline
  - Workers Cache remains disabled until representative Pool evidence proves at least the configured 40% p95 improvement, matching the Store decision rather than enabling it speculatively
  - Automated accessibility/i18n/SEO checks remain release gates; human VoiceOver/NVDA and native-Spanish review are documented optional evidence
  - Store-only product, SKU, ticket/RSVP, signed-download, and R2 download-abuse systems remain intentionally excluded

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

- [x] Store-aligned Settings administration
  - Settings follows the Store ordering for shared sections while preserving Pool-specific controls
  - Pool's privacy-minimized Admin sessions and searchable Audit log APIs are exposed through responsive, localized views with session revocation, campaign-aware filtering, human-readable actions/targets/status, and private CSV export
  - Local development magic-link login presents a direct super-admin dashboard link without exposing the raw token as display text
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
- [x] Backup, restore, and disaster recovery runbook
  - Classified Git, `PLEDGES`, `VOTES`, `RATELIMIT`, Stripe, and Durable Object boundaries in `config/pool-data-inventory.json`, with four-hour pledge/vote/admin RPO/RTO and approved 7-daily/5-weekly/12-monthly/release retention
  - Added metadata and encrypted captured-value snapshots, checksums, decryptability proof, safe retention pruning, append-only off-device copies, and readiness checks without secret-value export
  - Added classification-driven local/preview/production restore plans, authoritative-value validation, derived-state rebuilds, quarantine exclusions, exact preview cleanup, readback verification, and explicit payment/maintenance/approval production gates
  - Documented restore order, Durable Object non-import policy, provider reconciliation, production acknowledgements, and post-restore checks in `docs/BACKUP_RESTORE.md`

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

- [x] Payment integrity hardening
  - New payment and checkout records carry explicit USD currency plus value-time, Worker booking-time, and processor-availability timing where Stripe exposes it; legacy records default safely to USD during reads
  - Stripe API calls pin an explicit version, normalize provider errors, use deterministic idempotency for retry-safe writes, and emit a bounded redacted `processor-event:v1:*` journal without card data, raw webhook payloads, or supporter email addresses
  - Webhooks use a processing lease before side effects and retain processed markers for 35 days, so concurrent delivery returns a retryable conflict while stale work can safely resume
  - Settlement persists `settlement-group:v1:*` state before charging, resumes successful processor objects, reuses safe keys inside Stripe's 24-hour idempotency window, and stops for operator review rather than blindly retrying ambiguous work after that window
  - Settlement jobs persist current-batch checkpoints, detect stale work, retain operational state for 400 days, and do not mark campaigns charged while missing-customer, failed, or needs-attention pledges remain
  - Scheduled and super-admin-triggered reconciliation compares indexed pledge truth with Stripe PaymentIntents and settlement jobs, then stores explicit open/resolved `reconciliation-break:v1:*` records without namespace scans
  - Production email side effects share a durable `email-outbox:v1:*` path with frozen payloads, deterministic Resend idempotency, bounded retries, crash leases, provider delivery webhooks, permanent-bounce/complaint suppression, and 400-day minimal delivery evidence
  - Diary, milestone, and announcement email now include signed campaign-scoped RFC 8058 one-click unsubscribe handling; transaction, admin-login, and test email semantics remain distinct
  - Manual ambiguous-money recovery remains disabled because two distinct super-admin operators are not currently available; automated idempotent recovery and explicit reconciliation breaks are the supported path

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
- [x] Recovery reconciliation
  - Added read-only Stripe PaymentIntent reconciliation so recovery evidence can compare restored pledge truth with processor state without creating or mutating payments
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

- [x] Media library usability and optimization workflow
  - The existing repository is still the only media store; a deterministic rebuildable `_data/media-optimization-manifest.json` describes campaign/shared image, video, and audio sources plus generated derivatives, hashes, dimensions, duration, size, references, and warnings
  - Campaign media browsing now supports search, image/video/audio tabs, recent/name sorting, thumbnails and metadata, campaign/shared scope, source/derived status, reference locations, optimization state, and broken-reference warnings
  - Creators can pick campaign images, local videos/posters, and audio without pasting paths, safely replace a same-campaign source using its current GitHub SHA, and dispatch the existing changed/all optimization workflow under role scope
  - Meaningful images require alt text while explicit decorative images persist empty alt text; legacy empty-alt images remain compatible with a warning
  - Shared placement budgets warn about oversized hero, gallery, tier, Blast, and poster media without creating a second blocking policy or Worker-side processor
  - Generated responsive image/video files are hidden as standalone picker choices, while intentionally skipped larger derivatives remain recorded so they are not misreported as missing
  - Unit coverage protects manifest classification, placement budgets, picker filtering, editor behavior, and accessibility semantics; the existing native optimizer check remains authoritative for derivative generation

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
- [x] Disaster recovery automation
  - Added low-traffic preflight, weekly synthetic rehearsals, and an opt-in protected quarterly captured-data preview drill with byte-verified off-account archive readback
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

- [ ] Google Shopping launch for the featured Their Love reward
  - Keep `shopping.enabled: false` until the featured poster's exact expected availability date is confirmed and the visible campaign timeline can publish the same honest date
  - Create and verify Merchant Center, then configure the feed and Shopping destination from the existing campaign/featured-tier source before expecting Shopping-tab placement; do not create a second product catalog
  - After those prerequisites pass, enable the existing Shopping product through the dashboard or canonical campaign source and verify the rendered offer, feed acceptance, destination status, and public Shopping placement
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

## Known Issues

**Credit Card Autofill**: CC number, expiry, and CVV fields are inside Stripe's iframe for PCI compliance — not accessible to our autofill scripts.
