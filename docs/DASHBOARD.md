# Admin Dashboard

This document is the operator reference for The Pool's private admin dashboard and should be treated as the source of truth for dashboard-based campaign editing, reporting, analytics, marketing links, add-ons, and user management.

## Audience

Use this guide if you are:

- a super admin managing platform settings, admin users, platform add-ons, reports, analytics, or all campaigns
- a campaign admin managing assigned campaign settings, campaign content, rewards, diary entries, decisions, and campaign-specific reports
- a fork maintainer deciding which settings belong in `_config.yml`, Worker secrets, KV, or campaign Markdown

## Access

The dashboard is available at:

- `/admin/`
- `/es/admin/`

Admins sign in with an email magic link. Deployed Workers email the link through Resend and do not return it in the browser response. Local development can expose the link only when the site/Worker base is localhost or when `ADMIN_EXPOSE_LOGIN_LINK=true` is set explicitly. Local development grants bootstrap super-admin access through `ADMIN_BOOTSTRAP_EMAILS` in ignored `worker/.dev.vars`; production seed/recovery users come from `_config.yml` `admin.users` or deployed `ADMIN_USERS_JSON`.

Admin sign-in can require Cloudflare Turnstile. Configure the public widget key in `_config.yml` as `admin.turnstile_site_key`, and store the matching `TURNSTILE_SECRET_KEY` as a Worker secret. When the secret is configured, `POST /admin/auth/start` verifies the challenge token before rate-limit writes, login-nonce writes, or magic-link email delivery. `ADMIN_TURNSTILE_BYPASS=true` is available only for local/test automation and should not be enabled on deployed Workers.

Admin users have two roles:

- **Super admin**: can manage platform settings, platform add-ons, all campaigns, analytics, reports, supporters, marketing tools, and admin users.
- **Campaign user**: can manage only the campaigns assigned to that user. Campaign users do not see the top-level Settings or Add-ons tabs.

Admin user edits made in **Settings -> Users** save directly to Worker KV at `admin-users:v1`. They do not publish to GitHub and do not trigger a site deploy. `_config.yml` and `ADMIN_USERS_JSON` remain seed/recovery sources.

## Local Development

Use the Podman stack so the static site and Worker run together:

```bash
npm run podman:doctor
./scripts/dev.sh --podman
```

Then open:

```text
http://127.0.0.1:4000/admin/
```

The dev stack derives `CORS_ALLOWED_ORIGIN` from the local site origin and uses the test admin/campaign defaults documented in `README.md` and `worker/README.md`.

## Write Model

The dashboard intentionally separates read-only browsing, local drafting, KV writes, and GitHub-backed publishing.

| Action | Storage / side effect |
|--------|------------------------|
| Dashboard summary, analytics, reports, supporters, table filtering, and content preview | Read-only; should add zero KV writes |
| Content editor **Save draft** | Browser-local draft only |
| Campaign content/settings publish | Worker validates input, writes to GitHub-backed files, triggers the normal rebuild/deploy path, and records an audit event |
| Protected preview publish | Worker validates campaign scope and base revision, writes only preview flags to GitHub-backed campaign Markdown, stores the publishing admin plus optional reviewer emails in `PLEDGES` KV at `campaign-preview-reviewers:<slug>` with a 24-hour TTL, returns a dashboard-visible signed link for the publisher, sends signed links to optional reviewers, and records an audit event |
| Super-admin campaign creation | Worker creates a preview-only `_campaigns/<slug>.md` file locally in dev or through GitHub in production, optionally saves assigned/new campaign users to `admin-users:v1`, emails assigned campaign users when present, triggers rebuild when GitHub-backed, and records an audit event |
| Super-admin campaign archive | Worker validates super-admin role, CSRF, campaign existence, and non-live state, then archives locally in dev or dispatches `.github/workflows/archive-campaign.yml` in production; the archive move keeps campaign source and campaign-owned media under `archive/campaigns/<slug>/` |
| Platform settings and platform add-ons publish | Worker validates input, writes to GitHub-backed config/assets, triggers the normal rebuild/deploy path, and shows the result as a dashboard platform message |
| Image/video/audio uploads | Worker validates media, commits the asset path through GitHub, and updates the relevant field locally until publish |
| Marketing referral save/edit/delete | Campaign-scoped KV mutation for saved referral codes |
| Settings -> Users save | Single KV write to `admin-users:v1` |
| Settings -> Plan usage | Read-only Cloudflare/Resend provider API calls; zero KV writes or list operations |
| Secrets & credentials | Read-only status only; secret values are never shown, edited, serialized, or published |

Normal dashboard reads must stay within the KV-write budget described in `worker/README.md` and covered by tests.

GitHub-backed publish actions require the deployed Worker to have `GITHUB_TOKEN` plus the repo metadata variables configured. Without that token, the dashboard can still browse, draft, preview, manage runtime users, and save referral codes, but publish actions will fail with a GitHub configuration message. Successful publish actions should leave the Publish button disabled again once the saved server state matches the local form state.

## Top-Level Tabs

The top-level dashboard order is:

1. **Settings**: platform configuration, branding/SEO, pricing, tax, shipping, runner reports, design, users, performance, plan usage, debug, credential status, and runtime diagnostics.
2. **Add-ons**: platform add-on availability and product details, visible only to super admins.
3. **Campaigns**: role-scoped campaign settings, page content, rewards, campaign add-ons, stretch goals, ongoing items, diary entries, decisions, and Blast supporter announcements.
4. **Analytics**: pledge-derived campaign and portfolio analytics.
5. **Reports**: CSV preview/download for pledge and fulfillment reports.
6. **Supporters**: role-scoped supporter browsing, filtering, sorting, and CSV export.
7. **Marketing**: referral URL builder, saved referral codes, downloadable campaign QR codes, and embed-builder controls.

## Settings

Settings are grouped in a left sidebar. Super admins can edit publishable configuration sections and save runtime-only user management separately.

### Platform

Platform identity fields include site title, platform name, company, author, default creator name, support email, site description, canonical site/Worker URLs, email sender names, app mode, and the default platform timezone. The canonical URL fields sit below Site Description in the Platform section, one per column on wide viewports.

The pledge and update sender fields must use domains authorized for the configured Resend API key. For this deployment, pledge confirmations use `The Pool <pledges@pool.dustwave.xyz>` so the sender domain matches the authorized `pool.dustwave.xyz` Resend domain.

The default timezone field is a select menu backed by supported IANA timezone values. It controls campaign start/deadline boundaries, countdowns, scheduled campaign-runner reports, lifecycle automation, and settlement checks. The default remains `America/Denver` until a super admin changes it.

### Brand & SEO

Brand and search fields include logo, footer logo, favicon, default social image, X handle, default social image alt text, same-as links, and whether the public community hub is indexable.

Use one same-as URL per line. Use canonical public profile URLs, for example:

```text
https://www.instagram.com/example
https://www.imdb.com/name/nm0000000/
```

The local stack can override `SITE_BASE` and `WORKER_BASE` from `_config.local.yml`, but `scripts/sync-worker-config.rb` keeps `CANONICAL_SITE_BASE` and `CANONICAL_WORKER_BASE` pinned to the production values from `_config.yml`. That lets the local dashboard show production publish targets without breaking localhost requests.

### Checkout

Checkout exposes the Stripe publishable key used by browser payment UI. This is not a secret, but it must match the current Stripe mode. Secret keys and webhook signing secrets stay in Worker secrets or ignored local env files.

### Pricing, Tax, And Shipping

Pricing covers non-secret platform-tip and default flat-fee values. Tax and shipping sections choose providers and non-secret runtime settings. Provider-specific fields are conditional; for example, ZIP.TAX fields should appear only when ZIP.TAX is selected, and USPS fields should appear only when USPS is enabled.

Do not store API keys or provider secrets in Settings. Use Worker secrets or ignored local `.dev.vars`.

### Campaign Runner Reports

Campaign runner report settings control the scheduled report system: enabled state, platform-timezone send time, subject prefix, pledge/fulfillment report toggles, summary inclusion, and CSV attachment behavior. Super admins set the default platform timezone in the Platform settings section.

The Reports tab is still the preferred browser UI for generating and downloading on-demand CSVs.

### Advanced Performance

Advanced performance settings expose the safe public intent-prefetch controls:

- enable or disable public document prefetching
- tune the hover/focus delay before prefetching starts
- cap the number of prefetched documents per page view

The defaults are intentionally conservative and apply only to public same-origin document links. Admin, checkout, Manage Pledge, supporter-community, tokenized, external, and sensitive-query links are excluded by the runtime. Publishing these settings updates `_config.yml`, mirrors the `INTENT_PREFETCH_*` Worker vars, and requires the normal static rebuild before public pages use the new values.

### Plan Usage

Plan usage is a super-admin-only read-only section for operational provider limits. It loads automatically when **Settings -> Plan usage** opens and refreshes only when the admin reloads the page.

The Worker calls Cloudflare and Resend with server-side credentials and returns sanitized plan names, usage numbers, limits, severity, and provider links. Provider tokens never reach the browser, and the endpoint does not write KV or list KV namespaces.

Cloudflare usage uses `CLOUDFLARE_USAGE_API_TOKEN` or `CLOUDFLARE_ANALYTICS_API_TOKEN` plus `CLOUDFLARE_ACCOUNT_ID`. Add Billing Read to the usage token if Workers plan auto-detection should work; otherwise set `PLAN_USAGE_CLOUDFLARE_PLAN`. Resend usage uses `RESEND_API_KEY`; optional plan/limit overrides exist because safe Resend probes can expose rate-limit headers without monthly sent-usage headers.

### Design

Design settings expose curated theme variables such as body font, heading font, text colors, surface/border/primary colors, and button radius.

Font fields must reference fonts already loaded by the site's CSS. The dashboard does not import arbitrary remote fonts.

### Users

Super admins can create, edit, and delete dashboard users.

Rules:

- You cannot delete your own super-admin account.
- You cannot demote your own super-admin account.
- You can demote or delete other super admins.
- Campaign users must have at least one assigned campaign.
- User changes save to KV immediately through the Users save button; they do not use the Settings publish button.
- Newly created users are emailed sign-in instructions when Resend is configured. Edits to existing users do not resend the email.

### Secrets & Credentials

This section reports configured/missing status for runtime credentials only. It must not display or edit secret values.

## Platform Add-ons

The Add-ons tab manages platform-wide products that can be attached to pledges independently of campaign revenue.

Each product supports:

- name and derived read-only ID
- description
- image upload
- price
- physical/digital category
- shipping preset
- manual weight/dimensions when a physical product has no shipping preset
- inventory
- source URL
- variant option name
- variants with label, derived read-only ID, and inventory

Digital add-ons hide shipping fields. Physical add-ons can use a preset or explicit package dimensions.

## Campaigns

Campaigns are shown in a left sidebar. Super admins see all campaigns. Campaign users see only assigned campaigns.

For super admins, the first row of the Campaigns sidebar is an icon-only `+` button for **Create new campaign**. Existing campaigns appear below that row. Campaign users do not see the create button.

Each campaign has these subtabs:

1. **Settings**
2. **Content**
3. **Tiers**
4. **Support Items**
5. **Add-Ons**
6. **Stretch Goals**
7. **Ongoing Items**
8. **Diary Entries**
9. **Decisions**

### Create New Campaign

Create new campaign is super-admin-only. It creates a preview-only campaign that remains invisible from public `/campaigns/:slug/`, localized campaign routes, homepage/community/add-on indexes, `/api/campaigns.json`, share cards, sitemap output, robots crawl intent, embeds, and public prefetch eligibility until the campaign is launched.

Required fields:

- campaign title
- one or more campaign users

Super admins can create a campaign with no assigned campaign users, select multiple existing campaign users, choose **Create new campaign user**, and add one or more new campaign users with required names and emails in the same dialog. New users are saved to `admin-users:v1`; assigned campaign users receive a Resend-powered email with the admin dashboard link when email delivery is configured.

The Worker derives the slug from the title, writes `_campaigns/<slug>.md` through the existing GitHub publish path, sets preview-only/public-hidden defaults, triggers the normal rebuild, and records an audit event. The flow does not require launch dates, goal amount, rewards, images, or page content.

### Protected Preview

The **Preview** button appears next to **Publish** for campaign content. Super admins and assigned campaign users can publish a protected preview for campaigns they can edit.

Preview publication:

- validates the current campaign scope and CSRF token
- rejects stale base revisions when the campaign Markdown changed since the editor loaded
- writes only preview state to GitHub-backed campaign Markdown; previewer emails are not committed
- stores the publishing admin plus optional reviewer allowlist in `PLEDGES` KV under `campaign-preview-reviewers:<slug>` with a 24-hour TTL
- returns a signed preview link for the publishing admin so the dashboard can keep it visible after the modal closes
- emails explicitly invited additional reviewers signed preview links that expire in 24 hours, with that expiry stated in the email copy
- records an admin audit event

Preview pages live at `/campaigns/:slug/preview/` and localized equivalents. Generic static shells are generated for every campaign slug so emailed preview links can open immediately; the shell does not embed the campaign title or draft content. It fetches a full read-only campaign page preview through the Worker with either the current admin session or a valid reviewer token, loads the campaign stylesheet and font kit, permits approved media-player embeds, and disables pledge controls. The static preview shell is `noindex,nofollow,noarchive`, uses no social metadata, strips the preview token from the address bar after load, and remains outside public sitemap output and public prefetch eligibility.

### Campaign Settings

Campaign settings include identity, dates, goal amount, charged/read-only state, runner report emails, shipping overrides, hero media, creator image, backgrounds, and other campaign front matter.

Slug and URL are read-only derived fields. Existing campaign slugs are preserved. For new repo-created campaigns, keep the slug URL-safe and stable because checkout, reports, magic links, and pledge records depend on it.

Super admins see **Archive campaign** at the bottom of the Settings subtab after **Campaign background** and **Progress background** when the campaign is not currently live. Campaign users never see this control, and live campaigns hide it entirely. Archiving prompts for confirmation, then moves the campaign out of active source without deleting data. In local dev, `ADMIN_LOCAL_REPO_WRITES_ENABLED=true` routes the Worker through a token-protected local repo helper that moves mounted repo files. In production, the Worker starts the repository **Archive campaign** GitHub Action. Both paths move `_campaigns/<slug>.md`, campaign-owned image/video/audio files, and referenced campaign add-on media into `archive/campaigns/<slug>/`, write an `archive-manifest.json`, and leave media still referenced by other active campaigns in place and listed in the manifest.

### Content

The Content tab edits campaign long-form page content in a WYSIWYG block editor.

Supported block types include:

- text
- quote
- image
- gallery
- video
- audio
- embed
- divider

The editor supports block insertion controls, keyboard undo for block changes, Markdown-style inline formatting, links, unordered/ordered lists, alignment controls, media settings, and mobile preview. **Save draft** stores a browser-local draft. **Publish** validates and writes through the Worker.

Uploaded video blocks can include an explicit poster image. When no poster is set, the dashboard and public campaign page generate an in-browser poster from the video's first frame while keeping the playable video itself lazy-loaded until the user presses play.

Content safety rules:

- Prefer Markdown for inline formatting.
- Safe Markdown links are preserved.
- Unsafe schemes such as `javascript:` and `data:` are rejected.
- Raw scripts, event-handler attributes, and unsupported HTML are rejected by the Worker normalization layer.
- Structured embeds must use approved providers and exact trusted origins.

### Tiers

Tiers define pledge reward levels. Existing tier IDs are preserved; new IDs are derived from the name and shown read-only.

Physical tiers can use a shipping preset or explicit package metadata. Digital tiers hide shipping fields. Quantity limit controls total availability; stackable controls whether one supporter can claim more than one unit.

### Support Items

Support items are standalone campaign funding needs. Existing IDs are preserved; new IDs are derived from the name and shown read-only.

Digital support items hide shipping fields. Physical support items can use shipping presets and package metadata.

### Campaign Add-ons

Campaign add-ons are optional products attached only to one campaign. They follow the same product/variant model as platform add-ons but contribute to the campaign's accounting instead of platform add-on revenue.

### Stretch Goals

Stretch goals define funding milestones with thresholds, titles, descriptions, and display status.

### Ongoing Items

Ongoing items define post-campaign or ongoing support needs shown by the campaign template.

### Diary Entries

Diary entries are campaign updates sorted newest first. Each entry includes title, date/time, phase, and its own WYSIWYG content editor. Diary content uses the same content block model as the campaign Content tab.

### Decisions

Decisions define supporter vote/poll prompts. `vote` means the result is meant to decide an outcome; `poll` means the result is advisory supporter feedback. Both use the same option and tally flow today.

Status is read-only and derived from the deadline. Eligibility is role-scoped to campaign supporters or charged campaign supporters.

## Reports

Reports can preview and download standard CSV exports for the campaigns the signed-in admin can access.

Supported report types:

- pledge report
- fulfillment report

The browser report UI is download-oriented. It does not need manual email-send or mark-as-sent controls.

## Supporters

The Supporters tab shows role-scoped supporter rows with live filtering, sorting, campaign scoping, exact-cent dollar amounts, and CSV export for the currently visible result set. Super admins can choose **All** campaigns; campaign users can choose from assigned campaigns.

## Analytics

Analytics is derived from existing pledge indexes and campaign summaries. It should not create analytics-specific KV writes on view.

The dashboard shows cards for pledge totals, revenue categories, net revenue after allocated processor fees, tax, shipping, Stripe fees, pledge status, supporters, average pledge, campaign add-ons, referral attribution, UTM source, fulfillment type, language, and other pledge-derived breakdowns. Money values display exact cents.

Gross Campaign revenue and Platform revenue remain visible for reconciliation. Net campaign revenue and Net platform revenue subtract each category's allocated share of actual Stripe processor fees when stored balance transaction data exists. Active pledges and older charged pledge rows without actual Stripe balance data continue to use the standard planning estimate. Super-admin-only backfills can safely retrieve historical balance transaction data from Stripe without KV list scans through `POST /admin/analytics/stripe-financials/backfill`.

## Marketing

The Marketing tab builds campaign URLs with referral and UTM parameters, shows the campaign QR preview/download controls beside the URL output, saves referral codes, and exposes the campaign embed-builder UI.

Saved referral codes store:

- referrer name
- referral code
- generated URL
- QR code source metadata for the generated URL
- creation timestamp

The URL builder clears after saving and on refresh. Referral saves/edits/deletes are explicit KV mutations.

QR codes are generated in the browser from the current campaign URL builder output or a saved referral URL, including referral and UTM parameters. The current builder preview updates without Worker calls, and PNG/SVG downloads are browser-local file downloads. QR preview and download actions do not read or write KV.

## Blast

Campaigns -> Blast sends supporter announcements for the selected campaign without adding another top-level dashboard view. Campaign users may send blasts for campaigns assigned to them, and super admins may send for any campaign. Blast drafts are browser-local for now and reuse the campaign WYSIWYG content editor for email-ready headings, text, quotes, lists, links, uploaded campaign-hosted images, and YouTube/Vimeo video links. The dashboard automatically uploads staged Blast images through the same campaign media upload path used by Content and diary blocks before the dry run, so image files are committed under `assets/images/campaigns/<slug>/` and queued for repository media optimization before the email payload is built. The dashboard automatically runs the dry-run validation before Send test or Send blast; failed upload or audience checks explain the reason before any email send is attempted.

Dry runs validate the message, compute the indexed audience count, and return a dry-run hash without rate-limit writes, audit writes, email sends, or KV lists. Test sends go only to the signed-in admin. Live sends require the matching dry-run hash for the exact message and audience, send through the shared Resend updates sender, and write one audit event after dispatch. The Blast tab shows read-only sent history from recent audit records, including subject, content, CTA Button Label, and CTA Button URL.

Blast email rendering only includes hosted site images from `/assets/images/...`; arbitrary remote image URLs are omitted server-side. YouTube and Vimeo blocks render as email-safe links/buttons rather than iframe or video embeds because most email clients block embedded players.

If `campaign-pledges:<slug>` is missing, announcement dry-runs and sends fail closed with `campaign_index_required`; rebuild the campaign index before sending. This avoids falling back to pledge namespace scans on an operator path that can run in production.

## Media

Images and videos uploaded through the dashboard are validated before persistence, renamed with lowercase slug-style filenames, and committed to the asset directory that matches their use:

- Platform brand images: `assets/images/defaults/`
- Platform add-on product images: `assets/images/add-ons/`
- Campaign add-on product images: `assets/images/campaign-add-ons/`
- Campaign images, content-block images, tier images, diary images, and decision option images: `assets/images/campaigns/<campaign-slug>/`
- Campaign videos: `assets/videos/campaigns/<campaign-slug>/`
- Campaign audio: `assets/audio/campaigns/<campaign-slug>/`
- Platform/default videos: `assets/videos/defaults/`

Recommended campaign media:

- Hero image: square, around 1000x1000px
- Hero image wide: 16:9, around 1600x900px
- Creator image: square, around 400x400px
- Default social image: large 16:9 or Open Graph-friendly image
- Hero video: direct MP4/WebM/MOV upload up to 100 MB, or a YouTube/Vimeo URL

The campaign Content editor, diary-entry content editors, and Blast image blocks stage selected media in the browser first. The block shows the selected image, video, or audio selection immediately, but the file is not uploaded until the user publishes content or sends/tests a Blast. During publish or Blast send, the dashboard uploads staged media into the campaign asset directory, replaces the temporary browser preview with the final `/assets/...` path, and then commits the campaign YAML or builds the Blast email payload.

Campaign-scoped media uploads require access to that campaign. Super admins can upload any campaign media and platform/default media; campaign admins can upload only media for campaigns they manage. Platform add-on and platform brand uploads stay super-admin only.

When a published content media block is removed, or a diary entry with media blocks is removed, the Worker compares the previous campaign data with the normalized draft being committed. Dashboard-owned files under the same campaign media directories are deleted from GitHub when they are no longer referenced anywhere else in that campaign. External URLs, shared/default assets, and campaign media still referenced by another block or field are preserved.

The Worker upload endpoint is source-preserving. It validates type, size, campaign scope, directory, and filename, but it does not run native image optimizers or FFmpeg. For image and video uploads, the Worker dispatches the **Optimize dashboard media** GitHub Actions workflow with `scope=changed` after the GitHub commit succeeds. Lossless image compression and video transcoding still run outside the Worker through the repository media pipeline.

Campaign archive moves are repository-side for the same reason. In local dev, the Worker calls the local repo helper when `ADMIN_LOCAL_REPO_WRITES_ENABLED=true`; in production, the dashboard dispatches the **Archive campaign** workflow after super-admin authorization, and the workflow validates the slug before moving campaign source and campaign-owned media into `archive/campaigns/<slug>/`.

Use `npm run media:optimize` locally or manually dispatch the workflow when retrying optimization, reviewing repo-side media changes, or processing files outside the dashboard upload path. If the host machine does not have the native optimizers installed, use `npm run media:optimize:podman` to run the same script inside the Podman site image with `optipng`, `gifsicle`, `libjpeg-turbo-progs`, `webp`, and `ffmpeg`. Use `npm run media:optimize:check` or `npm run media:optimize:check:podman` when reviewing a media-heavy branch and you want to fail on pending image optimizations, responsive WebP variants, or missing video derivatives. The pipeline optimizes images in place when the optimized result is smaller, generates responsive `.webp` image variants for public templates at `320w`, `480w`, `640w`, `960w`, and `1600w`, generates high-quality `.webm` derivatives beside uploaded MP4/MOV files, and rewrites literal `_campaigns` / `_config.yml` references from the uploaded source video to the generated WebM derivative. Original source images and videos remain in the repository for rollback and future re-encoding. Use the workflow's manual `scope=all` option when deployed existing media needs a full reprocess.

Use meaningful alt text for images that communicate content. Decorative backgrounds can use empty alt text in the public templates.

## Security And Accessibility Guardrails

The dashboard follows these project rules:

- Browser controls are usability aids; Worker validation is authoritative.
- All mutations require a valid admin session and CSRF header.
- Role and campaign scoping are enforced server-side.
- Secrets are never stored in `_config.yml`, campaign YAML, dashboard drafts, KV user records, or GitHub commits.
- Preview access emails are stored only in short-lived Worker KV allowlists, not in campaign Markdown, public JSON, sitemap output, or generated page metadata.
- Shared admin label/help components should be used for new fields.
- Hidden editor chrome should not be keyboard-reachable.
- Sortable tables should expose `aria-sort`.

See `docs/SECURITY.md` and `docs/ACCESSIBILITY.md` for the detailed standards.

## Testing

Useful focused checks:

```bash
node --check assets/js/admin-dashboard.js
npx vitest run tests/unit/admin-dashboard.test.ts
npm run test:e2e:headless:podman -- tests/e2e/admin-dashboard.spec.ts --project=chromium
```

Use the broader gate before merge when dashboard changes affect Worker behavior, public rendering, or shared config:

```bash
./scripts/pre-merge-regression.sh
```

## Troubleshooting

### Unable To Start Admin Sign-In

Check:

- the Worker is running
- `CORS_ALLOWED_ORIGIN` matches the site origin
- the email is present in `_config.yml` `admin.users`, `ADMIN_USERS_JSON`, `ADMIN_BOOTSTRAP_EMAILS`, or the KV-backed users list
- local secrets exist in `worker/.dev.vars`
- if Turnstile is enabled, `_config.yml` has `admin.turnstile_site_key` and the Worker has `TURNSTILE_SECRET_KEY`
- if launch reminder Turnstile is enabled, `_config.yml` has `launch_reminders.turnstile_site_key` and the Worker has `TURNSTILE_SECRET_KEY` or `LAUNCH_REMINDER_TURNSTILE_SECRET_KEY`
- if testing locally with Turnstile enabled, use Cloudflare's test keys or set `ADMIN_TURNSTILE_BYPASS=true` only in a local/test Worker environment

### Changes Do Not Appear On The Public Site

Dashboard publish actions commit to GitHub and start the normal deploy path. Wait for the deploy to finish, then hard refresh. Local browser drafts do not affect the public site until published.

### Worker Settings Look Stale

The supported entry points run `scripts/sync-worker-config.rb` automatically. If you edited `_config.yml` or `_config.local.yml` directly and are checking `worker/wrangler.toml` before restarting the stack, run:

```bash
npm run sync:worker-config
```

### A Campaign Shows Empty Or Missing Data

Check the campaign Markdown front matter and the Worker settings response. Invalid YAML or unsupported field shapes can prevent fields from rendering correctly in the dashboard.

### Reports, Supporters, Or Analytics Show Missing Index Messages

Dashboard read endpoints rely on `campaign-pledges:{slug}` indexes and intentionally do not fall back to expensive namespace scans. Run the projection repair/rebuild tooling explicitly when an old campaign is missing its index.

---

_Last updated: June 11, 2026_
