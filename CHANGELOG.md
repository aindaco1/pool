# Changelog

## v1.0.7 - 2026-06-19

Release scope:

- Added campaign-scoped abandoned-checkout reminder health in Marketing with aggregate queue/outcome counts, recent outcomes, scoped suppression/clear controls, hashed email identifiers, audit events, signed checkout resume links, and no retry-specific abandoned-cart action.
- Hardened `npm run setup:deploy` with Cloudflare KV namespace reuse, clearer dry-run reuse/create output, live read-only provider readiness checks, `--skip-readiness` for narrow dry runs, and subprocess-based unit coverage for dry-run, local-secret, production-KV, readiness, and generated-secret paths.
- Added explicit shared Marketing and Blast drafts with one campaign-scoped KV record per surface, 7-day expiry, revision-conflict protection, and no background writes.
- Added Analytics referral/UTM performance reporting for saved and unsaved campaign links, including UTM source/medium/campaign/content aggregates from existing campaign pledge indexes without KV namespace scans.
- Added a shared WYSIWYG image media picker for Campaign Content, Diary, and Blast image blocks. Campaign users see campaign-scoped media; super admins can also select shared/default images. The picker is read-only and adds no new KV state.
- Updated English/Spanish dashboard copy, README/Worker/Dashboard docs, roadmap, creator checklist, About/Terms context, and targeted unit coverage for the new behavior.

## v1.0.6 - 2026-06-18

Release scope:

- Expanded **Campaigns -> Marketing** into a more complete campaign-promotion workspace without adding another top-level dashboard view. Campaign admins can build tracked URLs, save referral codes, preview/download campaign QR codes as PNG/SVG, and use the existing campaign embed builder from the same tab.
- Added **Campaigns -> Blast** for supporter email blasts. Assigned campaign users and super admins can draft with the shared WYSIWYG content editor, upload campaign-hosted images through the existing media pipeline, link YouTube/Vimeo videos in an email-safe way, send tests to themselves, send live blasts to indexed campaign supporters, and review read-only sent history.
- Added automatic Blast dry-run validation before test or live sends. Dry runs validate content and audience from the campaign pledge index without sending email, writing audit records, or listing KV namespaces; live sends require the matching dry-run hash and write the audit event after dispatch.
- Added browser-local QR generation adapted from the MIT-licensed `1612elphi/delphitools` approach, keeping QR previews and downloads free of Worker reads/writes.
- Added consent-based abandoned-checkout reminders for the first-party checkout path. Supporters must explicitly opt in, reminders queue only after Stripe session creation succeeds, completed pledges delete queued reminders, sent/suppressed audiences are deduped, and unsubscribe links are signed.
- Kept abandoned-checkout scheduling free-tier aware with `abandoned-cart-queue:v1`, bounded batches, retention limits, sent/suppression markers, and idle cron ticks that skip KV namespace list scans.
- Added the cross-platform `npm run setup:deploy` helper for local and production setup. The dependency-free Node CLI supports dry runs, local secret generation, config sync, Cloudflare KV creation/update, Worker secret writes, GitHub repository secret writes, `gh`/`wrangler`/optional Stripe CLI auth checks, and optional `wrangler deploy`.
- Reused shared email, WYSIWYG, media-upload, QR/download, label/help/info-button, responsive admin layout, and audit patterns rather than adding parallel implementations.
- Updated README, Worker README, dashboard docs, roadmap, security/performance notes, smoke checklist, creator checklist, public About/Terms pages, and targeted unit/browser coverage for the new 1.0.6 behavior.
- Deferred deeper abandoned-checkout admin reporting, setup-helper idempotency/readiness checks, shared cross-admin marketing drafts, and a native setup app wrapper to v1.0.7 follow-up work.

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
