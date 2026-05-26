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

Admins sign in with an email magic link. Deployed Workers email the link through Resend and do not return it in the browser response. Local development can expose the link only when the site/Worker base is localhost or when `ADMIN_EXPOSE_LOGIN_LINK=true` is set explicitly. The local development defaults seed `alonso@dustwave.xyz` as a super admin through `ADMIN_BOOTSTRAP_EMAILS` and `_config.yml` `admin.users`.

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
| Platform settings and platform add-ons publish | Worker validates input, writes to GitHub-backed config/assets, triggers the normal rebuild/deploy path, and shows the result as a dashboard platform message |
| Image/video uploads | Worker validates media, commits the asset path through GitHub, and updates the relevant field locally until publish |
| Marketing referral save/edit/delete | Campaign-scoped KV mutation for saved referral codes |
| Settings -> Users save | Single KV write to `admin-users:v1` |
| Secrets & credentials | Read-only status only; secret values are never shown, edited, serialized, or published |

Normal dashboard reads must stay within the KV-write budget described in `worker/README.md` and covered by tests.

GitHub-backed publish actions require the deployed Worker to have `GITHUB_TOKEN` plus the repo metadata variables configured. Without that token, the dashboard can still browse, draft, preview, manage runtime users, and save referral codes, but publish actions will fail with a GitHub configuration message. Successful publish actions should leave the Publish button disabled again once the saved server state matches the local form state.

## Top-Level Tabs

The top-level dashboard order is:

1. **Settings**: platform configuration, branding/SEO, pricing, tax, shipping, runner reports, design, users, performance, debug, credential status, and runtime diagnostics.
2. **Add-ons**: platform add-on availability and product details, visible only to super admins.
3. **Campaigns**: role-scoped campaign settings, page content, rewards, campaign add-ons, stretch goals, ongoing items, diary entries, and decisions.
4. **Analytics**: pledge-derived campaign and portfolio analytics.
5. **Reports**: CSV preview/download for pledge and fulfillment reports.
6. **Supporters**: role-scoped supporter browsing, filtering, sorting, and CSV export.
7. **Marketing**: referral URL builder, saved referral codes, launch snippets, and embed-builder controls.

## Settings

Settings are grouped in a left sidebar. Super admins can edit publishable configuration sections and save runtime-only user management separately.

### Platform

Platform identity fields include site title, platform name, company, author, default creator name, support email, site description, email sender names, and app mode.

The pledge and update sender fields must use domains authorized for the configured Resend API key. For this deployment, pledge confirmations use `The Pool <pledges@pool.dustwave.xyz>` so the sender domain matches the authorized `pool.dustwave.xyz` Resend domain.

### Brand & SEO

Brand and search fields include logo, footer logo, favicon, default social image, X handle, default social image alt text, same-as links, and whether the public community hub is indexable.

Use one same-as URL per line. Use canonical public profile URLs, for example:

```text
https://www.instagram.com/example
https://www.imdb.com/name/nm0000000/
```

### Pricing, Tax, And Shipping

Pricing covers non-secret platform-tip and default flat-fee values. Tax and shipping sections choose providers and non-secret runtime settings. Provider-specific fields are conditional; for example, ZIP.TAX fields should appear only when ZIP.TAX is selected, and USPS fields should appear only when USPS is enabled.

Do not store API keys or provider secrets in Settings. Use Worker secrets or ignored local `.dev.vars`.

### Campaign Runner Reports

Campaign runner report settings control the scheduled report system: enabled state, Mountain Time send time, subject prefix, pledge/fulfillment report toggles, summary inclusion, and CSV attachment behavior.

The Reports tab is still the preferred browser UI for generating and downloading on-demand CSVs.

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

### Campaign Settings

Campaign settings include identity, dates, goal amount, charged/read-only state, runner report emails, shipping overrides, hero media, creator image, backgrounds, and other campaign front matter.

Slug and URL are read-only derived fields. Existing campaign slugs are preserved. For new repo-created campaigns, keep the slug URL-safe and stable because checkout, reports, magic links, and pledge records depend on it.

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

The editor supports slash commands, keyboard undo for block changes, Markdown-style inline formatting, links, unordered/ordered lists, alignment controls, media settings, and mobile preview. **Save draft** stores a browser-local draft. **Publish** validates and writes through the Worker.

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

The dashboard shows cards for pledge totals, revenue categories, tax, shipping, estimated Stripe fees, pledge status, supporters, average pledge, campaign add-ons, referral attribution, UTM source, fulfillment type, language, and other pledge-derived breakdowns. Money values display exact cents.

Estimated Stripe fees are planning estimates until actual Stripe balance transaction fee/net values are stored during payment writes.

## Marketing

The Marketing tab builds campaign URLs with referral and UTM parameters, saves referral codes, generates launch snippets, and exposes the campaign embed-builder UI.

Saved referral codes store:

- referrer name
- referral code
- generated URL
- creation timestamp

The URL builder clears after saving and on refresh. Referral saves/edits/deletes are explicit KV mutations.

## Media

Images and videos uploaded through the dashboard are validated before persistence, renamed with lowercase slug-style filenames, and committed to the asset directory that matches their use:

- Platform brand images: `assets/images/defaults/`
- Platform add-on product images: `assets/images/add-ons/`
- Campaign add-on product images: `assets/images/campaign-add-ons/`
- Campaign images, tier images, diary images, and decision option images: `assets/images/campaigns/<campaign-slug>/`
- Campaign videos: `assets/videos/campaigns/<campaign-slug>/`
- Platform/default videos: `assets/videos/defaults/`

Recommended campaign media:

- Hero image: square, around 1000x1000px
- Hero image wide: 16:9, around 1600x900px
- Creator image: square, around 400x400px
- Default social image: large 16:9 or Open Graph-friendly image
- Hero video: direct MP4/WebM/MOV upload up to 100 MB, or a YouTube/Vimeo URL

The Worker upload endpoint is source-preserving. It validates type, size, campaign scope, directory, and filename, but it does not run native image optimizers or FFmpeg. Lossless image compression and video transcoding to WebM should happen in a dedicated build/CI/media pipeline so quality settings, generated derivatives, and rollback behavior are explicit. The dashboard response reports whether an upload was source-preserved or already WebM.

Use meaningful alt text for images that communicate content. Decorative backgrounds can use empty alt text in the public templates.

## Security And Accessibility Guardrails

The dashboard follows these project rules:

- Browser controls are usability aids; Worker validation is authoritative.
- All mutations require a valid admin session and CSRF header.
- Role and campaign scoping are enforced server-side.
- Secrets are never stored in `_config.yml`, campaign YAML, dashboard drafts, KV user records, or GitHub commits.
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
- if testing locally with Turnstile enabled, use Cloudflare's test keys or set `ADMIN_TURNSTILE_BYPASS=true` only in a local/test Worker environment

### Changes Do Not Appear On The Public Site

Dashboard publish actions commit to GitHub and start the normal deploy path. Wait for the deploy to finish, then hard refresh. Local browser drafts do not affect the public site until published.

### A Campaign Shows Empty Or Missing Data

Check the campaign Markdown front matter and the Worker settings response. Invalid YAML or unsupported field shapes can prevent fields from rendering correctly in the dashboard.

### Reports, Supporters, Or Analytics Show Missing Index Messages

Dashboard read endpoints rely on `campaign-pledges:{slug}` indexes and intentionally do not fall back to expensive namespace scans. Run the projection repair/rebuild tooling explicitly when an old campaign is missing its index.

---

_Last updated: May 25, 2026_
