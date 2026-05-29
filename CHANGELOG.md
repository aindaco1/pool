# Changelog

## v1.0.1 - 2026-05-29

- Added actual Stripe balance transaction fee/net capture for newly charged pledges and a super-admin backfill path for older charged pledge records.
- Updated dashboard Analytics to prefer stored actual Stripe fees when available, keep estimated fees only where needed, and label mixed/estimated values clearly.
- Added admin content-editor media uploads for campaign and diary content blocks, with immediate local previews and publish-time upload into the correct campaign asset directories.
- Added the dashboard media optimization pipeline: `npm run media:optimize`, `npm run media:optimize:check`, and a GitHub Actions workflow that losslessly compresses uploaded images, generates high-quality WebM video derivatives, and rewrites literal campaign/config video references after derivatives exist.
- Kept dashboard uploads source-preserving in the Worker while documenting the external optimization step for operators and forks.
- Made Supporters and Analytics return empty read-only views for campaigns without pledge indexes instead of blocking new or empty campaign dashboards.
- Reorganized the roadmap into completed work and Future Features, with implementation details for remaining post-1.0 follow-ups.
- Verified the full merge gate before release, including secret audit, syntax checks, focused regressions, full unit suite, build artifact checks, security suite, host Worker smoke, Podman mutable-pledge smoke, and headless E2E.

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
- Added admin dashboard accessibility, i18n, SEO/noindex, security, mobile/tablet responsiveness, and DRY UI passes, plus focused unit, Playwright, Podman smoke, and KV-write-budget coverage.
- Updated release metadata to `1.0.0`.

## v0.9.5 - 2026-05-03

- Aligned local Worker development with GitHub Actions by moving the Podman Worker image to Node 24.
- Updated Worker `compatibility_date` to `2026-05-03` so Wrangler 4 / Miniflare starts cleanly under Node 24.
- Updated host and Podman test wrappers to prefer Node 24, with Node 22 as the minimum Wrangler 4 fallback.
- Switched the Podman Worker dependency bootstrap to `npm ci` so local container starts do not rewrite `worker/package-lock.json`.
- Expanded creator launch documentation with add-ons, hosted embeds, tax/shipping fallback expectations, free-shipping decisions, report recipients, and fulfillment handoff.
- Added a Spanish creator checklist route for fork and creator onboarding.
- Verified the full merge gate, including security suite, host smoke, Podman mutable-pledge smoke, and headless E2E.

## v0.9.4 - 2026-05-02

- Previous milestone for campaign-runner reports, deployment hardening, creator checklist work, and Worker deployment compatibility updates.
