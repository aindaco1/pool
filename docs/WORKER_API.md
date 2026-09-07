# Worker API

This is the endpoint reference for contributors and operators integrating with
the Pool Worker. It consolidates the route examples previously spread across
the architecture and component guides. The handlers in
[`worker/src/index.js`](../worker/src/index.js) and
[`worker/src/routes/`](../worker/src/routes/) are authoritative; this is a guide
to the documented integration routes, not a generated inventory of every handler.

## Authentication and Related Runbooks

Browser dashboard routes use role-scoped sessions and CSRF/origin checks.
Supporter routes verify the order-scoped magic-link token against pledge truth.
Operator routes require the applicable admin credential; scoped settlement and
broadcast secrets override the general fallback on their respective routes.
Examples use placeholders. See [Security](SECURITY.md) for authentication and
private-cache rules.

[Payment Processor](PAYMENT_PROCESSOR.md) owns checkout, settlement,
reconciliation, and recovery procedures. [Email](EMAIL.md) owns provider
configuration, delivery, consent, and suppression. [Dashboard](DASHBOARD.md)
owns the browser operating workflow. [Deployment](DEPLOYMENT.md) owns Actions
and post-deploy setup. A dry run or enqueue response is not provider delivery
or payment acceptance.

## Routes

### POST /checkout-intent/start
Canonicalize the first-party cart payload and create a Stripe setup-mode Checkout Session for a new pledge.

```json
{
  "campaignSlug": "hand-relations",
  "items": [
    { "id": "hand-relations__producer-credit", "quantity": 1 }
  ],
  "customAmount": 0,
  "email": "supporter@example.com",
  "tipPercent": 5,
  "shippingAddress": {
    "country": "US",
    "postalCode": "87120"
  },
  "shippingOption": "standard"
}
```

Returns either a custom-session bootstrap (`checkoutUiMode`, `sessionId`, `clientSecret`, `publishableKey`, `orderId`) or a hosted fallback URL.

If the browser already has a billing tax destination, it can also include `billingAddress` in that payload so the final checkout quote does not have to fall back to shipping-only tax destination rules.

The Worker rebuilds tier, bundle add-on, custom-support, shipping, and subtotal state from first-party cart items, validates campaign state and inventory, signs a short-lived checkout snapshot, reserves scarce inventory for limited tiers before the payment step completes, and confirms those reservations when the pledge is actually persisted. For physical pledges or physical add-ons, shipping is Worker-calculated from destination plus campaign/item shipping metadata, using USPS live quotes when available and deployment or campaign fallback rates when not.

When a pledge qualifies for shipping upgrades, the Worker also persists the selected limited delivery option (`standard`, `signature_required`, or `adult_signature_required`) so the cart, Manage Pledge, stored pledge total, and supporter emails stay aligned.

Limited-tier reservations and claims are serialized through a per-campaign Durable Object coordinator before the KV inventory snapshot is updated, so concurrent checkout starts, retries, modifications, and webhook completions cannot oversell scarce rewards.

### GET /pledges?token={token}
Get the pledge(s) authorized by a magic link token.

Current behavior: the token returns only its own authorized order.

### GET /pledge?token={token}
Read pledge details for magic link management page.

If the token is valid but its pledge record no longer exists, this route returns `404` instead of synthesizing a placeholder pledge.

**Response:**
```json
{
  "campaignSlug": "hand-relations",
  "orderId": "xxx",
  "email": "backer@example.com",
  "amount": 5000,
  "tierId": "producer-credit",
  "pledgeStatus": "active",
  "canModify": true,
  "canCancel": true,
  "canUpdatePaymentMethod": true,
  "deadlinePassed": false
}
```

**Status values:** `active`, `cancelled`, `charged`, `payment_failed`

**Flag logic:**
- `canModify` / `canCancel`: `true` only if `pledgeStatus === 'active'` AND `!charged` AND deadline not passed
- `canUpdatePaymentMethod`: `true` if `!charged` (allowed even after deadline for failed payment recovery)
- `deadlinePassed`: `true` if campaign deadline has passed in the platform timezone

### POST /pledge/cancel
Cancel an active pledge.

```json
{
  "token": "magic-link-token",
  "orderId": "pool-intent-abc123"
}
```

### POST /pledge/modify
Change tiers, quantity, or custom support for an active pledge.

```json
{
  "token": "magic-link-token",
  "orderId": "pool-intent-abc123",
  "newTierId": "sfx-slot",
  "newTierQty": 2,
  "addTiers": [{ "id": "frame", "qty": 5 }],
  "customAmount": 25
}
```

All fields except `token` are optional. Changes are tracked in the pledge's `history` array with `type: "modified"` entries that include tier state, bundle add-on changes, `customAmount`, shipping deltas, and any selected shipping option.

The Worker validates the requested order against the token payload and recalculates totals from stored pledge state plus campaign definitions. Same-price structural changes, such as an add-on variant swap, still count as real pledge changes for persistence and supporter email purposes.

### POST /stats/:slug/check
Run a read-only projection drift check for one campaign.

Requires admin auth and returns whether the stored campaign index, stats projection, and tier inventory projection are still in sync with active pledge truth.

### POST /admin/projections/check
Run the same read-only drift check across all campaigns.

This is the Worker-side endpoint that powers [`scripts/check-projections.sh`](../scripts/check-projections.sh) and the newer mutable-pledge smoke assertions.

### POST /pledge/payment-method/start
Start a Stripe session to update payment method.

```json
{
  "token": "magic-link-token"
}
```

Returns either a custom-session bootstrap for the on-site `Update Card` flow or a hosted fallback URL.

### GET /share/campaign/:slug.png
Return a public PNG share card for one campaign.

Optional query params:

- `lang=en|es` to localize campaign UI copy

The rendered card uses live campaign data, including current state, pledged total, goal progress, creator/category metadata, and the campaign's square `hero_image` as the embedded preview image. The Worker rasterizes the same SVG card design into PNG so social crawlers get a compatible image without losing the richer preview styling. Campaign pages use this crawler-friendly PNG route for `og:image` / `twitter:image` metadata unless a campaign explicitly provides a static `social_image`. The visible card does not print the campaign URL; the URL remains available through the surrounding Open Graph metadata.

### GET /share/campaign/:slug.svg
Return the same campaign share-card concept as SVG for internal preview/debug tooling. Use the PNG route for public social metadata because some external crawlers reject SVG images.

### POST /webhooks/stripe
Handle `checkout.session.completed`:
- Extract `payment_method` and `customer` from SetupIntent
- Fetch `supportItems`, `customAmount`, and additional tiers from temp KV when needed
- Store one pledge per campaign in KV with status `active` (includes support items, custom amount, shipping fee, tip, and shipping address)
- Update live stats (pledgedAmount, tierCounts, supportItems)
- Confirm held limited-tier reservations, or claim through the serialized coordinator if the pledge predates reservation-aware checkout start
- Generate magic link token
- Send campaign-specific supporter confirmation email(s)

Webhook idempotency is committed only after successful pledge persistence so transient failures can retry safely.

### POST /webhooks/resend
Resend/Svix webhook endpoint for delivered, bounced, complained, failed, and suppressed events. Requires `RESEND_WEBHOOK_SECRET`, verifies the raw request body and timestamp, deduplicates `svix-id`, updates privacy-minimized delivery state, and hashes recipients before local permanent-bounce/complaint suppression.

### GET or POST /campaign-email/unsubscribe?t={token}
Signed campaign-scoped unsubscribe for diary, milestone, and live announcement mail. RFC 8058 POST returns a blank success response; browser GET returns a no-store confirmation page. The stored preference is an email hash and does not suppress transactional pledge/payment email.

### POST /film/stripe-summary
Server-to-server Film adapter for summary-only Stripe aggregates. Requires `Authorization: Bearer <FILM_STRIPE_SUMMARY_ADAPTER_SECRET>`, `dataBoundary: "summary_only"`, `source: "pool"`, and mapped campaign slugs in `mappedRefs`. The response is limited to aggregate money/count fields, mapped-ref counts, status, generated timestamp, and currency. It does not return supporter emails, payment intent IDs, charge IDs, balance transaction IDs, or card/payment-method data, and it writes a metadata-only admin audit event.

### POST /tax/quote
Return a Worker-calculated tax preview for cart / checkout UI.

```json
{
  "subtotalCents": 1000,
  "shippingCents": 300,
  "billingAddress": {
    "country": "US",
    "postalCode": "80205",
    "state": "CO"
  }
}
```

The current browser flow uses this for provisional cart / custom-checkout tax display. It is same-origin protected, rate limited, and intended for first-party UI previews rather than public third-party use.

If the payload does not include enough destination detail for the configured provider, the Worker can return a provisional/no-tax-result response and let the browser keep displaying `--` until checkout has a better billing or shipping destination.

### POST /launch-reminders
Save a public launch reminder signup for an upcoming campaign.

```json
{
  "campaignSlug": "their-love",
  "email": "supporter@example.com",
  "preferredLang": "en",
  "consent": true,
  "turnstileToken": "optional-widget-token"
}
```

The endpoint is enabled by `LAUNCH_REMINDERS_ENABLED`, accepts only upcoming campaigns, requires explicit consent, rate limits by IP, and verifies Cloudflare Turnstile when a reminder or shared Turnstile secret is configured. Signup records are campaign scoped and deduped by a normalized email hash, so refreshing or submitting again updates one active reminder instead of creating a list of duplicates.

### GET /launch-reminders/unsubscribe?t={token}
Suppress a campaign-scoped launch reminder.

The token is signed by `LAUNCH_REMINDER_TOKEN_SECRET` or the `MAGIC_LINK_SECRET` fallback, and it only authorizes the campaign/email hash encoded in the token. The unsubscribe path marks the signup unsubscribed, writes a suppression marker, and returns a noindex/no-store HTML response.

Launch reminder dispatch is scheduler-driven: when a campaign becomes live, the daily lifecycle pass queues one dispatch job; minute-level scheduled runs drain that job in bounded batches. Each recipient gets a per-campaign sent marker before the job advances, and email delivery uses the existing `sendLaunchReminderEmail` helper in `worker/src/email.js`, the shared Resend payload builder, and `UPDATES_EMAIL_FROM`.

### GET /admin/observability/webhooks?days=2
Admin-only webhook observability summary.

Returns recent per-day webhook delivery counts, outcomes, event-type rollups, duration stats, and a short recent-event window for debugging retries, signature failures, and unexpected traffic spikes.

### GET /admin/observability/performance?days=2
Admin-only sampled performance summary.

Returns sampled wall-clock timings for key mutation routes such as checkout start, checkout completion, Manage Pledge writes, shipping quotes, and checkout abandon. This is intended as a tuning aid for the deployed `cpu_ms` cap, not as a high-cardinality tracing system.

### Browser Admin Dashboard

The private `/admin/` and `/es/admin/` shells use cookie-backed Worker routes instead of exposing `ADMIN_SECRET` in browser code:

- `POST /admin/auth/start` verifies Cloudflare Turnstile first when `TURNSTILE_SECRET_KEY` is configured, then sends a short-lived localized magic link for an authorized admin email. Deployed Workers email the link through Resend; local development may expose the link in the JSON response only for localhost/test setups or explicit `ADMIN_EXPOSE_LOGIN_LINK=true`.
- `POST /admin/auth/exchange` exchanges that one-time token for the `pool_admin_session` cookie
- `GET /admin/session` reads the current session without refreshing or writing it
- `POST /admin/logout` clears the session
- `GET /admin/dashboard/summary` reads role-scoped campaign summaries
- `GET /admin/settings` reads a role-scoped settings/config snapshot for the dashboard
- `POST /admin/settings/preview` validates settings changes without publishing
- `POST /admin/settings/logo-upload`, `POST /admin/settings/image-upload`, `POST /admin/settings/audio-upload`, and `POST /admin/settings/video-upload` stage dashboard uploads through the same GitHub-backed publish path as their owning settings/content fields; image/video uploads request the **Optimize dashboard media** workflow with `scope=changed` after commit, while native image optimization and video transcoding still run in the repository media pipeline rather than inside the Worker
- `POST /admin/settings/publish` validates and publishes platform settings, platform add-ons, campaign variables, and campaign structured data through GitHub-backed commits
- The browser remembers dashboard tab/subtab context locally across reloads; this restoration does not call a Worker route and does not write KV or GitHub state
- `POST /admin/users` saves dashboard-managed admin users directly to `admin-users:v1` in Worker KV and emails newly created users sign-in instructions when Resend is configured
- `POST /admin/campaigns/create` lets super admins create preview-only campaigns through the GitHub-backed campaign source path, optionally assign existing/new campaign users in `admin-users:v1`, email assigned users the admin dashboard link, and record an audit event. Assignments are additive; unrelated existing users, including unassigned users, are preserved. A failed campaign file write leaves users unchanged and sends no assignment email.
- `POST /admin/campaigns/archive` lets super admins archive non-live campaigns locally in dev or by dispatching `.github/workflows/archive-campaign.yml` in production; the Worker validates CSRF, role, slug, campaign existence, and effective state, records an audit event, and moves campaign source/media through the dev repo helper or GitHub Actions
- `POST /admin/campaign-preview/publish` lets super admins and assigned campaign users publish a protected preview, stores the publishing admin plus optional reviewer emails in `campaign-preview-reviewers:{slug}` with a 24-hour TTL, returns a signed dashboard preview link for the publishing admin, sends signed links to optional reviewers, writes only preview flags to campaign Markdown, and records an audit event
- `GET /admin/campaign-preview/:slug` returns a private/no-store full campaign page preview payload with campaign fonts/media embeds and read-only pledge controls when the requester has an authorized admin session or a valid reviewer token whose email is still on the 24-hour KV allowlist
- `GET /admin/analytics` reads role-scoped pledge-derived revenue, status, language, referral, UTM source/medium/campaign/content, and campaign/platform split metrics without writing analytics state; dashboard currency presentation keeps exact cents
- `GET /admin/plan-usage` lets super admins load Cloudflare and Resend plan usage from provider APIs without exposing provider tokens to the browser or writing KV state; the dashboard loads it automatically when Settings -> Plan usage is opened
- `POST /admin/analytics/stripe-financials/backfill` lets super admins backfill actual Stripe fee/net values from Stripe balance transactions for charged pledges, using campaign pledge indexes instead of KV list scans
- `GET /admin/reconciliation/:slug` reads stored campaign payment breaks; CSRF-protected super-admin `POST` runs bounded pledge/Stripe/settlement reconciliation without KV namespace scans
- `POST /film/stripe-summary` exposes Film-facing Pool aggregates only after bearer adapter auth; mapped refs are campaign slugs, and the response stays summary-only
- `GET /admin/content/campaign?campaignSlug=...` loads role-scoped campaign content into the browser editor without persisting a draft
- `POST /admin/content/preview` validates and renders role-scoped campaign content drafts without publishing, auditing, or writing KV
- `POST /admin/content/publish` validates the same draft, updates the campaign Markdown file through GitHub, triggers the normal rebuild workflow, and writes one audit event
- `GET /admin/supporters?campaignSlug=...` reads campaign-scoped supporter rows from `campaign-pledges:{slug}` only; dashboard amount presentation keeps exact cents
- `GET /admin/reports/campaign-runner/preview?campaignSlug=...&reportType=pledge|fulfillment` previews shared campaign-runner report output without sending email or writing markers
- `GET /admin/reports/campaign-runner.csv?campaignSlug=...&reportType=pledge|fulfillment` downloads the same shared report CSV without sending email or writing markers
- `GET /admin/marketing/referrals?campaignSlug=...` lists saved campaign referral codes without writing or scanning pledge truth
- `POST /admin/marketing/referrals` explicitly saves or updates a campaign referral code with CSRF protection and one campaign-scoped KV write
- `DELETE /admin/marketing/referrals` explicitly deletes a saved campaign referral code with CSRF protection and one campaign-scoped KV write
- `GET /admin/marketing/draft?campaignSlug=...&surface=marketing|blast`, `POST /admin/marketing/draft`, and `DELETE /admin/marketing/draft` provide explicit shared Marketing/Blast draft load/save/clear with 7-day TTLs, revision conflict protection, and one campaign-scoped KV write only on save/clear
- `GET /admin/media/library?campaignSlug=...` lists existing campaign images for WYSIWYG image blocks through GitHub directory reads; campaign users stay campaign-scoped, and super admins may also see shared/default images
- `GET /admin/abandoned-checkout/health?campaignSlug=...` reads aggregate abandoned-checkout reminder health without KV lists; admin-created suppression outcomes include the suppressed email so campaign admins can clear them from the recent outcomes table
- `POST /admin/abandoned-checkout/suppression` and `DELETE /admin/abandoned-checkout/suppression` explicitly set or clear campaign-scoped abandoned-checkout reminder suppression with CSRF protection, hashed email identifiers, audit events, and bounded KV writes
- `GET /abandoned-cart/resume?t=...` verifies a signed resume token, reads the short-lived `abandoned-cart-resume:{orderId}` snapshot created after a reminder sends, and returns only sanitized cart/contact draft data so the browser can start a fresh checkout session
- `GET /admin/marketing/announcements?campaignSlug=...` reads recent sent Blast history from bounded admin-audit records for the selected campaign
- `POST /admin/marketing/announcement` dry-runs, test-sends, or live-sends a Campaigns -> Blast message with dashboard session, CSRF/origin checks, indexed-audience validation, matching dry-run hash enforcement for live sends, and one audit write after dispatch
- `GET /admin/add-ons/inventory` reads platform add-on baseline, sold, remaining, and override state for super admins
- `POST /admin/add-ons/inventory` explicitly sets, restocks, or resets platform add-on inventory baseline overrides with CSRF protection and audit logging

Normal dashboard reads, supporter filters, pagination, pledge-derived analytics, marketing referral lists, abandoned-checkout health, media-library picker loads, report previews, CSV downloads, content loads, protected preview payload reads, content previews, Blast dry runs, and local editor drafts are designed to add zero KV writes and zero KV list operations. Plan usage loads are also KV read-only, but intentionally call Cloudflare and Resend provider APIs once when a super admin opens Settings -> Plan usage. Browser-initiated user saves, marketing referral saves, shared draft saves/clears, scoped abandoned-checkout suppression mutations, live Blast sends, content publishes, preview publishes, new campaign creation, campaign archive operations, and inventory changes are explicit mutations: user saves write `admin-users:v1`, referral saves write one campaign-scoped referral list, shared draft saves write one 7-day draft record, scoped reminder suppressions write/delete one suppression record plus audit/health updates, live Blast sends write one audit event after dispatch, content publishes commit to GitHub, trigger the rebuild workflow, and write one audit event, preview publishes write one short-lived `campaign-preview-reviewers:{slug}` access allowlist plus one audit event, new campaign creation may write `admin-users:v1` plus one audit event in addition to the campaign file write, and archive writes one audit event while local dev or `.github/workflows/archive-campaign.yml` moves source/media into `archive/campaigns/<slug>/`. Abandoned-checkout reminder sends also write one short-lived `abandoned-cart-resume:{orderId}` record so the signed email CTA can restore a sanitized browser checkout draft without adding queue scans. If an older campaign is missing its `campaign-pledges:{slug}` projection, dashboard read endpoints return zero rows or a non-blocking missing-index notice instead of falling back to a namespace scan; run the existing projection repair/rebuild tools explicitly when that happens.

Admin auth starts/exchanges and browser-admin mutations are rate limited through the `RATELIMIT` binding and return private/no-store failures when throttled. Normal authenticated reads such as session checks, dashboard summaries, supporter filters, report previews, analytics views, and content previews are intentionally not KV-rate-limited. Magic-link login tokens are one-time use, and session reads do not refresh near-expiry sessions or clean up expired sessions on the read path. Cookie-backed admin mutations require both the session CSRF token and a trusted same-site `Origin`/`Referer` or non-cross-site fetch context before durable writes.

When `TURNSTILE_SECRET_KEY` is configured, `POST /admin/auth/start` verifies the Cloudflare Turnstile challenge before sending magic-link email. Keep that protection on the submit path only so it does not add dashboard pageview or typing-time KV writes.

Platform add-on inventory uses `_config.yml` as the configured baseline, optional `add-on-inventory-overrides` KV state for operator restocks, and `add-on-inventory-sold:v1` for sold counts derived from saved pledge truth. Admin inventory page views do not load the inventory table automatically; the super-admin inventory read is explicit and uses the sold-count projection after bootstrap, while set/restock/reset actions write only the override state plus an audit event.

The marketing-tool slice keeps campaign URL building, UTM/referral parameters, embed-builder shortcuts, local field preferences, QR previews/downloads, and unsaved field edits in browser state. Saved referral codes and shared drafts are separate: referral listing is read-only, referral saves and shared draft saves are explicit campaign-scoped KV mutations, and stale shared-draft saves fail on revision mismatch. Referral/UTM performance reporting belongs to Analytics and stays read-only. Blast local edits remain browser-local unless explicitly saved as a shared draft; image upload is an explicit GitHub-backed media mutation before test/live sends, dry runs use the campaign pledge index without KV lists or writes, and live sends write only the required audit event after dispatch.

### POST /admin/broadcast/diary
Send diary update notification to all campaign supporters. Requires `x-admin-key` header.

```json
{
  "campaignSlug": "hand-relations",
  "diaryTitle": "Week 3 Update",
  "diaryExcerpt": "Optional preview text...",
  "dryRun": true  // Set to true to preview recipients without sending
}
```

### POST /admin/diary/check
Check all campaigns for new diary entries and broadcast them automatically. Called by GitHub Actions after deploy. Requires `Authorization: Bearer {ADMIN_BROADCAST_SECRET}` when the scoped broadcast secret is configured, otherwise `Authorization: Bearer {ADMIN_SECRET}`.

If Cloudflare zone security challenges the GitHub Actions request before it reaches the Worker, set a repository secret named `DIARY_CHECK_BYPASS_SECRET` and add a Cloudflare WAF skip rule for `POST /admin/diary/check` when `X-Pool-Diary-Check` matches that secret. Keep the Worker admin or broadcast secret enabled; the bypass header is only an edge-rule signal, not Worker authentication.

```json
{
  "dryRun": true  // Optional: preview without sending
}
```

Returns:
```json
{
  "success": true,
  "checked": 2,
  "newEntries": [
    { "campaignSlug": "...", "campaignTitle": "...", "date": "2026-01-15", "title": "..." }
  ],
  "sent": 10,
  "failed": 0,
  "errors": []
}
```

### POST /admin/broadcast/milestone
Send milestone notification to all campaign supporters. Requires `x-admin-key` header.

```json
{
  "campaignSlug": "hand-relations",
  "milestone": "one-third",  // "one-third", "two-thirds", "goal", or "stretch"
  "stretchGoalName": "Director's Commentary",  // Required for "stretch" milestone
  "dryRun": true
}
```

### POST /admin/report/campaign-runner
Preview or manually send a campaign-runner report for one campaign. Requires `x-admin-key` header.

```json
{
  "campaignSlug": "hand-relations",
  "reportType": "pledge",   // "pledge" or "fulfillment"
  "dryRun": true,
  "markAsSent": false
}
```

Notes:

- `dryRun: true` returns recipients, row counts, filename, and marker status without sending
- omitting `markAsSent` defaults it to `true` for live sends so the matching scheduled run does not immediately duplicate the report
- campaign recipients still come from campaign front matter `runner_report_emails`
- `reportType: "pledge"` is the daily live-campaign ledger report
- `reportType: "fulfillment"` is the one-time post-deadline shipment/export report
- report emails use short, emoji-free, deliverability-first subjects with the configured prefix plus report kind and campaign title
- daily pledge emails include campaign-only totals plus a short momentum/coaching note in the body
- fulfillment sends split by fulfiller:
  - campaign-runner recipients get only the campaign-fulfilled rows
  - `platform.support_email` gets a separate platform-fulfillment email when platform rows exist
- fulfillment emails use a fulfillment-specific summary/body note rather than reusing the daily pledge-report summary
- fulfillment dry runs/report responses expose `campaignRowCount`, `platformRowCount`, and `platformRecipient`

Dry-run example:

```bash
curl -X POST https://pledge.dustwave.xyz/admin/report/campaign-runner \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_SECRET" \
  -d '{"campaignSlug":"hand-relations","reportType":"pledge","dryRun":true}'
```

Manual send example:

```bash
curl -X POST https://pledge.dustwave.xyz/admin/report/campaign-runner \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_SECRET" \
  -d '{"campaignSlug":"hand-relations","reportType":"fulfillment","dryRun":false,"markAsSent":true}'
```

Operational guidance:

- prefer `dryRun: true` first when checking a new campaign, recipient list, or customization change
- set `markAsSent: false` only when you intentionally want a manual send without consuming the scheduled-send marker
- deployment-wide behavior comes from `_config.yml` under `reports.campaign_runner`, while per-campaign recipients stay in front matter
- for fulfillment, validate both the runner and platform slices before sending if a campaign includes platform add-ons

### POST /test/email
Send a test email of any type. In test mode (`APP_MODE=test`), no auth required. In production, requires `x-admin-key` header.

```json
{
  "type": "supporter",  // See types below
  "email": "test@example.com",
  "campaignSlug": "hand-relations"
}
```

Valid types:
- `supporter` - Pledge confirmation (with sample pledge items)
- `modified` - Pledge modification (with sample pledge items)
- `payment-failed` - Payment failure (with subtotal/tax breakdown and pledge items)
- `charge-success` - Charge success (with subtotal/tax breakdown and pledge items)
- `diary` - Diary update notification
- `milestone-one-third` - 1/3 goal milestone
- `milestone-two-thirds` - 2/3 goal milestone
- `milestone-goal` - Goal reached
- `milestone-stretch` - Stretch goal unlocked

**Production usage:**
```bash
curl -X POST https://pledge.dustwave.xyz/test/email \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_SECRET" \
  -d '{"email": "test@example.com", "type": "supporter", "campaignSlug": "hand-relations"}'
```


## Live Data and Operator Helpers

### GET /stats/:campaignSlug
Get live pledge statistics for a campaign.


### GET /live/:campaignSlug
Get the combined public live snapshot for a campaign.

**Response shape:**
```json
{
  "stats": { "pledgedAmount": 1200, "pledgeCount": 3 },
  "inventory": {
    "tiers": {
      "frame-slot": { "limit": 1000, "claimed": 2, "remaining": 998 }
    }
  }
}
```

Campaign pages and the Manage Pledge UI prefer this endpoint so cold loads burn one Worker request instead of separate `stats` and `inventory` reads. The browser then caches the result in `localStorage` for the configured TTL.

**Response:**
```json
{
  "campaignSlug": "hand-relations",
  "pledgedAmount": 380000,
  "pledgeCount": 42,
  "tierCounts": { "producer-credit": 10, "frame-slot": 32 },
  "goalAmount": 25000,
  "percentFunded": 15,
  "updatedAt": "2025-01-15T12:00:00Z"
}
```


### POST /stats/:campaignSlug/recalculate
Recalculate stats from all pledges in KV (admin only).

**Headers:** `Authorization: Bearer ADMIN_SECRET`


### POST /admin/rebuild
Trigger a GitHub Pages rebuild (for state transitions).

**Headers:** `Authorization: Bearer ADMIN_SECRET`

**Request:** `{ "reason": "campaign-state-change" }` (optional)


### POST /admin/marketing/announcement
Dry-run, test-send, or live-send a Campaigns -> Blast supporter email from the browser dashboard.

The browser route requires a dashboard session, CSRF/origin checks, campaign scope, and an indexed `campaign-pledges:{slug}` audience. Dry runs validate the exact subject/content/CTA/audience and return a `dryRunHash` without sending email, writing audits, or listing KV namespaces. Test sends go only to the signed-in admin. Live sends require the matching dry-run hash and write one admin-audit event after dispatch.

**Request:**
```json
{
  "campaignSlug": "worst-movie-ever",
  "subject": "Submissions close March 6th!",
  "content": [
    { "type": "text", "body": "The deadline is this Thursday at midnight in the platform timezone." }
  ],
  "ctaLabel": "Submit Your Reward",
  "ctaUrl": "https://example.com/submit",
  "dryRunHash": "required-for-live-send"
}
```


### POST /admin/broadcast/announcement
Legacy shared-secret operator endpoint for a custom announcement email with optional CTA link to all campaign supporters.

**Headers:** `Authorization: Bearer ADMIN_BROADCAST_SECRET` when configured, otherwise `Authorization: Bearer ADMIN_SECRET`
**Request:**
```json
{
  "campaignSlug": "worst-movie-ever",
  "subject": "Submissions close March 6th!",
  "heading": "Last call for submissions!",
  "body": "The deadline is this Thursday at midnight in the platform timezone.",
  "ctaLabel": "Submit Your Reward",
  "ctaUrl": "https://example.com/submit",
  "dryRun": true
}
```
**Response:** `{ success, campaignSlug, subject, sent, failed, errors }`

**Fields:**
- `subject` (required) — Email subject line body; delivery formats it as `{Subject} | {Campaign Title}`
- `heading` (optional) — Email heading (defaults to subject if omitted)
- `body` (required) — Message body text
- `ctaLabel` + `ctaUrl` (optional) — Adds a prominent button linking to the URL
- `dryRun` (optional) — Returns recipient list without sending


### POST /admin/recover-checkout
Recover a missed Stripe webhook by manually creating a pledge from a completed checkout session.

**Headers:** `Authorization: Bearer ADMIN_SECRET`

**Request:** `{ sessionId: "cs_test_..." }` or `{ orderId: "pledge-..." }`

**Response:**
```json
{
  "success": true,
  "message": "Pledge recovered from Stripe checkout session",
  "pledge": { ... },
  "stripeSessionId": "cs_test_..."
}
```

**Use case:** When local development misses a webhook (Worker wasn't running, Stripe CLI not forwarding, etc.), use this to recover:
```bash
curl -X POST http://localhost:8787/admin/recover-checkout \
  -H 'Authorization: Bearer YOUR_ADMIN_SECRET' \
  -H 'Content-Type: application/json' \
  -d '{"sessionId": "cs_test_abc123..."}'
```

---
