# Changelog

## v1.2.0 - Unreleased

Release preparation:

- Added the pinned `aindaco1/dust-wave-platform` submodule as the versioned boundary for primitives shared with Store, Dust Wave, and Podcast.
- Moved the byte-identical Turnstile implementation into `@dustwave/worker-core` while retaining Pool's local import seam and adding a consumer contract test.
- Advanced the shared boundary to `@dustwave/worker-core` 0.2.0, which adds
  typed product-neutral crypto and Stripe mechanics for Podcast without moving
  Pool business rules or changing Pool's existing Turnstile adapter.
- Kept Pool's campaign, pledge, configuration, session, storage, and deployment authority independent; the submodule contains no Pool data or secrets and can be rolled back by pointer.
- Advanced `@dustwave/worker-core` to 0.3.0 and added an inert, fail-closed
  Pool-to-Podcast grant/revoke client with a shared high-entropy one-time-code
  contract. Product/tier mapping, durable delivery, and supporter issuance
  remain disabled until their explicit configuration and staging gate.
- Advanced the shared workspace to 0.6.0 and
  `@dustwave/admin-shell` 0.2.0, moving Pool and Store's byte-identical QR
  generator into the pinned shared boundary. Pool still loads the same
  characterized implementation through its static admin shell; only the
  source authority and generated path changed.
- Centralized the Worker provider identity and added a release-contract test
  that keeps root/Worker packages and locks, canonical config, release label,
  Stripe, and Resend aligned to v1.2.0.

## v1.1.2 - 2026-07-14

Release scope:

- Fixed misleading sitemap freshness by emitting `lastmod` only from real page/campaign dates, and expanded the generated audit to reject malformed XML, duplicates, invalid/future timestamps, private URLs, and structured-data drift.
- Added a dependency-free post-deploy crawl audit that compares ordinary and Google Inspection sitemap responses, validates sitemap/robots status and MIME types, and fetches every submitted public URL with bounded propagation retries.
- Added fail-closed, localized Shopping product pages that reuse a campaign's featured physical tier, existing cart behavior, configured author/company identity, and policy data. Product publishing requires an explicit enable switch plus complete physical-reward facts and an exact expected availability date.
- Kept the Their Love featured poster candidate disabled; confirming its exact availability date and completing Merchant Center verification plus feed/destination setup remain explicit Future Features before Shopping-tab placement is expected.
- Added Organization merchant return-policy/contact data, focused Product/Offer metadata, and direct links to stable Shipping and Return Policy anchors beside the DUST WAVE footer mark on desktop/tablet and below Terms in the mobile menu; automated checks ensure that a no-returns policy never publishes a fictitious return window.
- Rewrote the public About and Terms pages in English and neutral US/Latin American Spanish, using `_config.yml` identity/contact values and documenting all-or-nothing charging, shipping, final-sale defaults, fulfillment-error handling, seven-day reporting verification, privacy, and creative-submission rules.
- Reviewed Store v1.0.8 carryover: Pool already contained the relevant price, media, Stripe, reconciliation, and durable-email work; adopted the GitHub-hosted AWS CLI recovery fix; exposed the existing session review/revocation and audit search/CSV APIs through localized Settings sections; made their shared info-button guidance, filters, tables, revoke controls, plain-language actions, normalized targets (including generated local test slugs), and status/change explanations responsive and understandable from desktop through mobile while retaining canonical identifiers for filtering, diagnostics, and export; aligned shared Settings sections to Store's order while retaining Pool-specific seams; adapted Brand & SEO to the no-returns Shopping policy; and excluded Store-specific readiness, cache, catalog, order, coupon, ticket, download, R2, and multi-processor surfaces.
- Matched Store's local admin sign-in affordance by rendering the development-only returned login URL as a localized **Open admin** link while keeping deployed sign-in links email-only.
- Hardened the pre-merge Jekyll helpers so a failed host or Podman build cannot fall through to minification and validate stale `_site` output; the release gate now proves a fresh generated build before artifact checks.

Post-release cleanup:

- Removed the remaining implicit Jekyll collection-date fallback from sitemap, Open Graph article, JSON-LD, and generated Shopping-product metadata so deployments cannot impersonate content publication or modification dates. Sitemap `lastmod` now requires an authored `last_modified_at`; campaign article dates use explicit `published_at` when provided and otherwise the campaign start date.
- Added `/sitemap.txt` as a generated diagnostic sitemap using the exact same shared public-item selector as `/sitemap.xml`, without advertising a second canonical sitemap in `robots.txt`. Generated and post-deploy audits require its URL list to match the XML sitemap exactly and compare ordinary versus Google Inspection responses for both formats.
- Recorded post-deployment evidence that Search Console's official Inspection Tool reached the production sitemap from Google-owned addresses without Cloudflare mitigation while receiving a valid HTTP 200 XML response, isolating the remaining generic live-test error from the site's firewall and origin behavior.

## v1.1.1 - 2026-07-12

Release scope:

- Added a deterministic, rebuildable repository media manifest covering campaign/shared images, video, and audio; source hashes, dimensions, duration, file size, responsive WebP/WebM derivatives, reference locations, optimization state, and intentionally skipped larger derivatives stay reviewable in Git.
- Expanded the existing dashboard media picker with search, accessible type tabs, recent/name sorting, rich metadata, optimization and placement-budget warnings, reference visibility, broken-reference reporting, local video/poster/audio selection, and role-scoped repair actions through the existing optimizer workflow.
- Added safe same-campaign source replacement with GitHub SHA conflict protection, kept generated derivatives out of standalone picker results, and retained the repository as the only media authority—no KV media database or alternate storage backend was introduced.
- Added explicit decorative-image authoring while requiring alt text for meaningful images; legacy empty-alt content remains compatible with a migration warning.
- Hardened Stripe integration with an explicit API version, normalized redacted errors/observability, deterministic idempotency on retry-safe writes, explicit USD/timing metadata, 35-day webhook markers with processing leases, and a 400-day minimal processor-event journal.
- Made settlement crash/resume-safe with durable pre-charge group state, safe reuse within Stripe's idempotency window, stale-job checkpoints, successful PaymentIntent recovery, and needs-attention stops instead of blind recharges after ambiguous outcomes.
- Added scheduled and super-admin-triggered reconciliation of indexed pledge truth, Stripe PaymentIntents, and settlement jobs, recording open/resolved `reconciliation-break:v1:*` evidence without KV namespace scans.
- Routed production transactional, report, campaign update, Blast, launch-reminder, and abandoned-checkout email through a shared KV outbox with frozen payloads, deterministic Resend idempotency, bounded retries, crash leases, provider delivery webhooks, and privacy-minimized long-term delivery evidence; admin login and test sends remain immediate.
- Added signed campaign-scoped one-click unsubscribe for diary, milestone, and announcement email plus local permanent-bounce/complaint suppression compatible with Resend's email and webhook APIs.
- Added focused media, Stripe client, outbox, webhook-signature, retry, suppression, and existing Worker regression coverage; updated setup, Worker configuration, payment/email/security/workflow/dashboard/testing documentation, and roadmap status for the completed release.

## v1.1.0 - 2026-07-12

Release scope:

- Added optional variant-specific prices to platform and campaign add-ons. Blank prices inherit the product base price, explicit zero-dollar overrides remain valid, and cart/Manage Pledge cards update the displayed price when the selected variant changes.
- Kept money authority in the Worker: new or changed add-on variants are repriced from the current catalog, submitted browser prices are ignored, and an unchanged product/variant on an existing pledge preserves its valid historical `unitPrice` through quantity-only edits.
- Extended the shared add-on model, legacy browser fallbacks, admin product editor, validation, and YAML serialization without introducing a second catalog or migrating existing products. Product, variant, catalog, and historical prices cannot bypass the canonical `$1,000,000` amount ceiling.
- Replaced eager full-size campaign-card backgrounds with responsive WebP sources and lazy decoding, reducing the measured throttled homepage transfer from roughly 4.0 MB to 1.5 MB and LCP from roughly 20.3 seconds to 5.4–6.6 seconds.
- Added centralized, route-specific Lighthouse and expanded cache-policy release evidence alongside the existing generated-asset budgets. Eleven deployed public/private targets are covered, and Workers Cache remains disabled until representative evidence proves the configured p95 benefit.
- Made dashboard and Worker timing limits executable: browser tests consume readiness, tab-switch, and table-render budgets; the Worker samples dashboard summary/settings reads; and a redacted authenticated audit evaluates configured p95 ceilings without collecting request or customer payloads.
- Hardened admin failures so unauthorized responses are private and non-cacheable, and pinned the compatible clean Lighthouse release so both production-only and full dependency audits pass with no known vulnerabilities.
- Moved and refreshed `AGENTS.md` at the repository root so contributors and coding agents automatically discover the current checkout, security, performance, recovery, and release invariants.

## v1.0.9 - 2026-07-12

Release scope:

- Adapted backup and disaster-recovery model to Pool's Git, `PLEDGES`, `VOTES`, `RATELIMIT`, Stripe, and Durable Object boundaries, with an approved four-hour RPO/RTO and 7-daily/5-weekly/12-monthly plus release-snapshot retention policy.
- Added checksum-covered metadata and encrypted KV-value snapshots, repository-boundary checks, age/GPG encryption verification, release receipts, safe retention pruning, append-only off-device copies, and readiness evidence without secret-value export.
- Added classification-driven restore plans for local, preview, and production; authoritative-family validation; derived-state rebuilds; quarantine exclusions; exact preview cleanup; readback verification; and explicit production maintenance, Stripe, settlement, conflict, pre-restore-snapshot, and acknowledgement gates.
- Added synthetic weekly restore rehearsals and quarterly low-traffic protected preview drills with captured-production data disabled until protected credentials and operator approval are configured. Protected drills upload to S3-compatible off-account storage and verify a byte-identical download before restore.
- Added read-only Stripe reconciliation for snapshot pledge totals and PaymentIntent state, plus aggregate-only Cloudflare traffic preflight evidence.
- Split routine Pages refreshes from manual reviewed Worker/full production deployment, pinned all GitHub Actions to immutable commits, added monthly Dependabot coverage for Actions and both npm projects, and made Stripe CLI probes non-interactive.
- Added a shared Pool pledge read model with deterministic privacy-safe watermarks, no-change responses, and production KV bulk reads in batches of 100 across analytics, supporters, reports, index repair, settlement, and financial backfills.
- Added privacy-minimized admin login history, active/recent session review, explicit session revocation, searchable audit metadata, formula-safe audit CSV exports, and deferred Turnstile loading until unauthenticated state is known.
- Added a managed Cloudflare admin response-rule reconciler and public verification for `private, no-store, no-transform, max-age=0, must-revalidate` on English and Spanish admin routes.
- Split admin-only CSS from the public stylesheet, deferred Adobe display-font CSS, established measured generated-asset budgets, and kept Workers Cache disabled until representative evidence shows at least a 40% p95 benefit.
- Added weekly production-posture drift checks, monthly source-hashed Spanish review packets without claiming professional review, a scheduled Podman E2E workflow, and a 6 GiB Podman release-suite resource gate.
- Added sanitized JSON provider-evidence artifacts for downstream recovery/posture workflows, with failure/warning/skip counts and explicit credential/customer-data exclusions.

## v1.0.8 - 2026-07-01

Release scope:

- Ported Store-derived Cloudflare Rocket Loader hardening by opting Pool first-party layout/include scripts out with `data-cfasync="false"`, covering public campaign, cart, preview, manage, community, pledge-result, and admin surfaces.
- Hardened admin Marketing data loading so saved referral codes and abandoned-checkout health load lazily only when an authenticated admin opens Marketing, with campaign-scoped in-flight and loaded-state guards.
- Remembered the last admin dashboard tab plus Settings section, selected Campaigns campaign, and Campaigns subtab in browser-local state so reloads return admins to the same working context without Worker or KV writes.
- Added an explicit QR vendor browser-global shim so the admin Marketing QR builder does not rely on optimizer-sensitive classic-script globals.
- Added a locale completeness audit and unit coverage to keep supported i18n catalogs aligned with English.
- Added template regression coverage that scans layouts/includes for local first-party scripts missing the Rocket Loader opt-out.
- Moved Vitest config files to ESM `.mts` modules and updated scripts/Jekyll excludes to avoid Vite's deprecated CJS Node API path.
- Added a generated-site SEO audit (`npm run test:seo`) adapted from Store, wired it into the merge gate, and moved sitemap URL rendering into a shared include that emits localized hreflang alternates.
- Adapted release-evidence tooling for Pool with `release:smoke`, focused accessibility, rendered i18n/SEO, pledge/report evidence, provider readiness, payment smoke, and optional screen-reader transcript commands.
- Added a Release Provider Evidence GitHub Actions workflow for strict Cloudflare DNS evidence through a dedicated DNS-read token.
- Added Pool no-send email dry-run support through `POOL_EMAIL_DRY_RUN` / `RESEND_EMAIL_DRY_RUN` so release smokes can render supporter/report/admin email payloads without calling Resend.
- Added Pool-specific release accessibility evidence for campaign pledge focus order, launch-reminder live status updates, and reduced-motion campaign cart surfaces.
- Integrated release evidence command sanity into the merge gate and enabled Pool email dry-run mode for local/CI merge smoke runs.
- Added mobile metadata/CSS polish from Store so public, admin, manage, community, embed, preview, and pledge-result document heads opt out of automatic phone/date/address/email detection while shared controls inherit the current theme consistently.
- Updated the admin settings request to send the current preferred language, keeping Pool's existing client-side i18n row normalization ready for Worker-side schema localization.

## v1.0.7 - 2026-06-19

Release scope:

- Added campaign-scoped abandoned-checkout reminder health in Marketing with aggregate queue/outcome counts, recent outcomes, scoped suppression/clear controls, hashed email identifiers, audit events, signed checkout resume links, and no retry-specific abandoned-cart action.
- Hardened `npm run setup:deploy` with Cloudflare KV namespace reuse, clearer dry-run reuse/create output, live read-only provider readiness checks, `--skip-readiness` for narrow dry runs, and subprocess-based unit coverage for dry-run, local-secret, production-KV, readiness, and generated-secret paths.
- Added explicit shared Marketing and Blast drafts with one campaign-scoped KV record per surface, 7-day expiry, revision-conflict protection, and no background writes.
- Added Analytics referral/UTM performance reporting for saved and unsaved campaign links, including UTM source/medium/campaign/content aggregates from existing campaign pledge indexes without KV namespace scans.
- Added a shared WYSIWYG image media picker for Campaign Content, Diary, and Blast image blocks. Campaign users see campaign-scoped media; super admins can also select shared/default images. The picker is read-only and adds no new KV state.

## v1.0.6 - 2026-06-18

Release scope:

- Expanded **Campaigns -> Marketing** into a more complete campaign-promotion workspace without adding another top-level dashboard view. Campaign admins can build tracked URLs, save referral codes, preview/download campaign QR codes as PNG/SVG, and use the existing campaign embed builder from the same tab.
- Added **Campaigns -> Blast** for supporter email blasts. Assigned campaign users and super admins can draft with the shared WYSIWYG content editor, upload campaign-hosted images through the existing media pipeline, link YouTube/Vimeo videos in an email-safe way, send tests to themselves, send live blasts to indexed campaign supporters, and review read-only sent history.
- Added automatic Blast dry-run validation before test or live sends. Dry runs validate content and audience from the campaign pledge index without sending email, writing audit records, or listing KV namespaces; live sends require the matching dry-run hash and write the audit event after dispatch.
- Added browser-local QR generation adapted from the MIT-licensed `1612elphi/delphitools` approach, keeping QR previews and downloads free of Worker reads/writes.
- Added consent-based abandoned-checkout reminders for the first-party checkout path. Supporters must explicitly opt in, reminders queue only after Stripe session creation succeeds, completed pledges delete queued reminders, sent/suppressed audiences are deduped, and unsubscribe links are signed.
- Kept abandoned-checkout scheduling free-tier aware with `abandoned-cart-queue:v1`, bounded batches, retention limits, sent/suppression markers, and idle cron ticks that skip KV namespace list scans.
- Added the cross-platform `npm run setup:deploy` helper for local and production setup. The dependency-free Node CLI supports dry runs, local secret generation, config sync, Cloudflare KV creation/update, Worker secret writes, GitHub repository secret writes, `gh`/`wrangler`/optional Stripe CLI auth checks, and optional `wrangler deploy`.

## v1.0.5 - 2026-06-14

Release scope:

- Added protected campaign previews for super admins, assigned campaign users, and explicitly invited reviewer emails. Preview links are signed, campaign-scoped, dashboard-visible for the publishing admin, and expire after 24 hours.
- Added super-admin campaign creation for preview-only campaigns. Campaign users are optional at creation time; super admins can assign multiple existing users or create multiple new users, and assigned users receive the admin dashboard link by email when delivery is configured.
- Added super-admin campaign archiving for non-live campaigns. Local development archives through the mounted repo helper, while production dispatches the validated `archive-campaign` GitHub Actions workflow.
- Preserved public visibility and SEO boundaries: preview-only campaigns remain hidden from public campaign routes, home/community/add-on indexes, `/api/campaigns.json`, embeds, share-card metadata, sitemap output, robots intent, and public prefetching until launched.
- Preserved KV budget discipline: dashboard reads, preview rendering, field browsing, local drafts, reports, supporters, and analytics remain read-only; explicit create, preview publish, user save, archive audit, and email actions perform bounded writes.
- Added lightweight multi-user editing safeguards with GitHub base-revision checks for campaign content and preview publishes, stale-publish conflicts, local draft preservation, and audit events for create, preview publish, archive, and content publish actions.
- Kept the new dashboard UI accessible, localized, mobile-responsive, and DRY by reusing shared admin label/help/info-button, email-list, modal, focus, and status patterns.
- Improved Podman local development resilience with supervised service restarts, stale Podman recovery attempts, local repo helper support for create/archive testing, and updated Podman documentation.
- Added GitHub-backed protected preview publication at `/admin/campaign-preview/publish`, no-store preview payload reads at `/admin/campaign-preview/:slug`, generic noindex preview shells at `/campaigns/:slug/preview/` for every campaign slug so emailed links do not depend on a post-publish rebuild, and 24-hour KV preview access allowlists at `campaign-preview-reviewers:<slug>`.
- Added signed 24-hour dashboard preview links for the publishing admin, optional signed reviewer preview emails, and campaign-assignment emails through the shared Resend email theme and i18n catalog.
- Rendered protected preview payloads as full read-only campaign page previews with campaign CSS/fonts loaded, media embeds enabled, and pledge controls disabled.
- Matched protected-preview diary rendering to the public campaign diary tabs, phase panels, and dashed entry cards.
- Added super-admin dashboard controls for new preview-only campaign creation and protected preview publication.
- Added super-admin-only campaign archiving for non-live campaigns from Campaigns -> Settings, backed locally by dev-only repository writes and in production by a manual GitHub Actions workflow that moves `_campaigns/<slug>.md` and campaign-owned media into `archive/campaigns/<slug>/` without deleting archived data.
- Added preview-only/public filtering across campaign JSON, homepage/community/add-on indexes, localized pages, sitemap, robots intent, and prefetch eligibility.
- Added base-revision conflict checks for campaign content and preview publishes.
- Kept previewer emails out of GitHub-backed campaign Markdown and public generated artifacts; campaign source now carries only the preview flag and compatibility-empty `preview_reviewer_emails: []`.

## v1.0.4 - 2026-06-11

- Added super-admin Settings -> Plan usage tracking for Cloudflare Workers/KV and Resend quotas, with automatic load, provider-detected plan names where available, progress bars, warning thresholds, and provider plan links while keeping provider tokens server-side.
- Added dashboard net campaign/platform revenue analytics after allocated actual or estimated Stripe processor fees, while preserving gross Campaign revenue and Platform revenue cards for reconciliation.
- Added component-level processor fee allocation across campaign revenue, platform revenue, tax, and shipping so table/CSV exports reconcile with stored Stripe balance transactions or existing fee estimates.
- Documented usage-tracker environment variables and the read-only Cloudflare GraphQL Analytics plus Billing Read token boundary for usage and Workers plan detection.
- Reorganized local Worker `.dev.vars` scaffolding and `npm run secrets:dev` output into purpose-based groups, including Plan Usage provider settings and overrides.

## v1.0.3 - 2026-06-01

- Added configurable platform timezone handling across Jekyll campaign state, browser countdowns, Worker lifecycle automation, campaign-runner reports, dashboard settings, and Worker config mirroring. The default remains `America/Denver` for compatibility, and super admins can choose from supported IANA timezones.
- Added upcoming-campaign launch reminders with a slim public signup form, Cloudflare Turnstile verification, campaign/email dedupe, signed unsubscribe links, bounded KV dispatch jobs, and Resend delivery through the existing shared email module.
- Added Durable Object-backed campaign settlement serialization, deterministic Stripe idempotency keys, and mixed-campaign batch rejection so scheduled/manual settlement cannot overlap charges for the same campaign while multi-campaign carts remain campaign-scoped.
- Added scoped admin automation secrets for settlement and broadcast routes. When configured, `ADMIN_SETTLEMENT_SECRET` and `ADMIN_BROADCAST_SECRET` reject fallback use of the broader `ADMIN_SECRET`.
- Hardened production deployment credentials by requiring token-based Cloudflare auth, documenting the required Cloudflare user API token shape for Wrangler deploys, splitting cache purge onto `CLOUDFLARE_CACHE_PURGE_TOKEN`, and removing legacy or unused repo secrets.
- Hardened the deploy workflow so dashboard media optimization opens a pull request instead of pushing generated media changes directly to `main`.
- Tightened private CORS defaults, Stripe error redaction, checkout/settlement auth tests, and local secret generation for scoped admin secrets.
- Hardened public content and embed boundaries: campaign Markdown link sanitization now handles nested/encoded unsafe schemes, hosted embeds use specific postMessage target origins, and tokenized Manage pages opt into no-referrer behavior.
- Reduced baseline Workers KV write usage by changing the minute-level scheduler heartbeat to persist hourly instead of every minute, preserving cron health visibility while keeping the free-tier write budget available for real mutations.
- Reduced baseline Workers KV list usage by adding queue-state markers for launch reminder dispatch and supporter confirmation email retries, so idle scheduled ticks skip namespace scans and retry scans wait until the next queued attempt is due.
- Added a durable add-on inventory sold-count projection maintained by pledge create, modify, and cancel paths, avoiding repeated pledge namespace scans for normal add-on inventory reads after the first projection bootstrap.
- Updated local development so `_config.local.yml` can hide launch reminder Turnstile widgets the same way local admin sign-in can hide its Turnstile widget.
- Extended the Podman media optimizer image and wrappers with `optipng` and `gifsicle` so local PNG/GIF source compression uses the same repository media workflow as responsive image and video derivative generation.
- Added a mobile PageSpeed performance pass for campaign pages: YouTube hero videos now render as local poster/play facades and load the remote iframe only after play intent, avoiding the initial YouTube JavaScript/CSS cost.
- Added responsive hero-image preloads and a `640w` WebP derivative rung so mobile campaign pages can choose smaller browser assets between the existing `480w` and `960w` variants.
- Updated the media optimizer to skip generated responsive WebP derivatives during source optimization, keeping generated browser assets up to date without recursively re-encoding them.
- Fixed dashboard-authored diary rich text so inline bold/italic/underline markers normalize leading and trailing boundary spaces instead of rendering stray Markdown delimiters on public campaign pages.
- Fixed public diary hash links, including links into non-default diary tabs such as `#diary-production`, so the matching tab opens before the page scrolls to the anchor.
- Updated dashboard image/video uploads to dispatch the **Optimize dashboard media** workflow with `scope=changed` after the source-preserving GitHub commit succeeds; audio uploads remain source-preserved.
- Added publish-time cleanup for dashboard-owned campaign content and diary media that is removed from published content and no longer referenced elsewhere in the same campaign.

## v1.0.2 - 2026-06-01

- Added public-page performance fixes from the PageSpeed review: remote-video campaign pages no longer preload hidden fallback hero images, tier images opt into lazy/async decoding, default brand logos reserve their intrinsic dimensions, and public pages avoid eager Stripe preconnects before cart intent.
- Extended the dashboard media optimization pipeline to generate responsive WebP image variants for PNG, JPEG, and GIF source images, so public campaign templates can serve smaller browser assets while keeping original uploads as source-of-truth fallbacks.
- Added a manual `scope=all` option to the **Optimize dashboard media** workflow so existing campaigns can be reprocessed through the same media pipeline used for new dashboard uploads.
- Updated campaign, tier, card, gallery, and content-image templates to use generated responsive variants when they exist without changing visible page structure or campaign Markdown references.

## v1.0.1 - 2026-05-29

- Added actual Stripe balance transaction fee/net capture for newly charged pledges and a super-admin backfill path for older charged pledge records.
- Updated dashboard Analytics to prefer stored actual Stripe fees when available, keep estimated fees only where needed, and label mixed/estimated values clearly.
- Added admin content-editor media uploads for campaign and diary content blocks, with immediate local previews and publish-time upload into the correct campaign asset directories.
- Added the dashboard media optimization pipeline: `npm run media:optimize`, `npm run media:optimize:check`, and a GitHub Actions workflow that losslessly compresses uploaded images, generates high-quality WebM video derivatives, and rewrites literal campaign/config video references after derivatives exist.
- Kept dashboard uploads source-preserving in the Worker while documenting the external optimization step for operators and forks.
- Made Supporters and Analytics return empty read-only views for campaigns without pledge indexes instead of blocking new or empty campaign dashboards.

## v1.0.0 - 2026-05-26

- Added the private admin dashboard as the supported browser editing and operations surface at `/admin/` and `/es/admin/`.
- Added role-scoped magic-link admin authentication for super admins and campaign users, with cookie-backed sessions, CSRF/origin checks, and browser-safe admin APIs that do not expose `ADMIN_SECRET`.
- Added admin sign-in challenge protection support for Cloudflare Turnstile-compatible deployments while keeping local/test bypasses explicit.
- Added dashboard tabs for Settings, Add-ons, Campaigns, Analytics, Reports, Supporters, Marketing, Users, Secrets & credentials, and Runtime diagnostics.
- Replaced the Pages CMS editing model with the dashboard-driven workflow while keeping `_config.yml` and campaign Markdown as the reviewable fork-facing source of truth.
- Added WYSIWYG block editing for campaign content and diary entries, including media settings, link editing, Markdown-style inline formatting, mobile previews, local drafts, and publish-state tracking.
- Added dashboard editing for campaign settings, tiers, support items, campaign add-ons, stretch goals, ongoing items, diary entries, decisions, platform add-ons, and platform settings.
- Added dashboard upload handling for campaign media, brand assets, add-on images, and hero videos using convention-based asset directories and slug-style filenames.
- Added dashboard Users management backed by Worker KV at `admin-users:v1`, separate from GitHub-backed publish flows.
- Added notification emails for newly created dashboard users when Resend is configured; user edits do not resend invitations.
- Added dashboard Marketing tools for referral/UTM URL building, saved referral codes, reusable embed-builder UI, and copyable launch snippets.
- Fixed Marketing embed previews for campaigns with YouTube or Vimeo hero media so progress bars, milestones, and stretch-goal labels stay contained.
- Added role-scoped dashboard Analytics, Reports, and Supporters views with sortable/filterable tables, exact-cent dollar display, and CSV downloads; report previews/downloads do not send email or write sent markers.
- Preserved the Cloudflare Workers KV free-tier target by keeping normal dashboard reads, previews, filters, analytics, and local drafts at zero KV writes.
- Aligned pledge email sender configuration with the authorized Resend sender domain and documented sender-domain setup for forks.
- Made GitHub Pages deploy permissions explicit for the production deploy workflow.

## v0.9.5 - 2026-05-03

- Aligned local Worker development with GitHub Actions by moving the Podman Worker image to Node 24.
- Updated Worker `compatibility_date` to `2026-05-03` so Wrangler 4 / Miniflare starts cleanly under Node 24.
- Updated host and Podman test wrappers to prefer Node 24, with Node 22 as the minimum Wrangler 4 fallback.
- Switched the Podman Worker dependency bootstrap to `npm ci` so local container starts do not rewrite `worker/package-lock.json`.
- Expanded creator launch documentation with add-ons, hosted embeds, tax/shipping fallback expectations, free-shipping decisions, report recipients, and fulfillment handoff.
- Added a Spanish creator checklist route for fork and creator onboarding.

## v0.9.4 - 2026-05-02

- Previous milestone for campaign-runner reports, deployment hardening, creator checklist work, and Worker deployment compatibility updates.
