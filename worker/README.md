# The Pool - Pledge Worker

Cloudflare Worker handling first-party checkout canonicalization, Stripe integration, pledge management, order-scoped supporter authentication, upcoming-campaign launch reminders, consent-based abandoned-checkout reminders, campaign supporter blasts, protected campaign previews, and the private browser admin dashboard APIs.

## Shared Platform boundary

Pool `v1.2.20` pins Dust Wave Platform `v0.32.0` at exact commit
`85165a16ac6923b438514bdce0a9957c1804db5f`. The Worker consumes the pinned
`worker-core`, `shipping-core`, `tax-core`, `inventory-core`, and `media-core`
packages for characterized, runtime-neutral mechanics. Pool retains every
route, request schema, campaign/pledge model, Durable Object and KV policy,
credential, Stripe/Resend/Cloudflare policy, side effect, deployment, and
rollback decision.

The separately pinned Dust Wave Jekyll Template is compile-time source-upgrade
tooling only. It is never imported by this Worker and is excluded from the
generated public site.

For day-to-day local development, prefer the repo-root Podman path:

```bash
npm run podman:doctor
./scripts/dev.sh --podman
```

That boots the site and Worker together on the standard local ports and is the easiest way to exercise the full on-site checkout and `Update Card` flows locally.

The repo-root Podman path runs the Worker with Node 24, matching GitHub Actions. Host-only Worker development should also use Node 24 when possible; Wrangler 4 requires at least Node 22. The Worker compatibility date is intentionally shared across local and deployed environments so Miniflare/Workers runtime behavior does not drift.

If you specifically work from the `worker/` directory, the Worker npm scripts now auto-run the config mirror first so `worker/wrangler.toml` stays aligned with the repo-root `_config.yml` / `_config.local.yml`.

Treat `_config.local.yml` as an override-only file for localhost-specific values. The canonical fork-facing settings should live in the repo-root `_config.yml`, and the Worker mirror will follow from there.

Use [`docs/PAYMENT_PROCESSOR.md`](../docs/PAYMENT_PROCESSOR.md) for Stripe setup, checkout, webhook, settlement, and reconciliation details. Use [`docs/BACKUP_RESTORE.md`](../docs/BACKUP_RESTORE.md) for classified snapshots, preview restore, retention, and disaster recovery. Use [`docs/EMAIL.md`](../docs/EMAIL.md) for Resend sender setup, email types, localization, and delivery behavior. Use [`docs/ETHICAL_RISK.md`](../docs/ETHICAL_RISK.md) before adding Worker behavior that changes money, data collection, messaging, automation, public sharing, analytics, or admin power.

Campaign-runner report delivery follows that same pattern:

- campaign-level recipients live in campaign front matter as `runner_report_emails`
- deployment-wide timing and email/report behavior live in `_config.yml` under `reports.campaign_runner`
- the Worker mirror carries those non-secret settings into `wrangler.toml`
- the shared report core in `worker/src/reports.js` now powers both scheduled runner emails and the local shell export helpers so CSV logic stays in one place
- the browser dashboard Reports tab previews and downloads pledge/fulfillment CSVs without sending email or writing sent markers

The mirrored Worker config now also includes the shared debug flags:

- `DEBUG_CONSOLE_LOGGING_ENABLED`
- `DEBUG_VERBOSE_CONSOLE_LOGGING`

Those come from `debug.console_logging_enabled` and `debug.verbose_console_logging` in the repo-root [`_config.yml`](../_config.yml). Console logging stays enabled by default, while verbose debug/info/log noise defaults to off so warning/error output remains useful without shipping broad diagnostic detail.

The Worker mirror also carries the public intent-prefetch knobs used by generated public pages:

- `INTENT_PREFETCH_ENABLED`
- `INTENT_PREFETCH_DELAY_MS`
- `INTENT_PREFETCH_LIMIT`

Those come from `performance.intent_prefetch_*` in the repo-root config and are editable by super admins in **Settings -> Advanced performance**. They are mirrored for config parity and operational visibility; the actual prefetch runtime still loads only on public static layouts and rejects private, tokenized, checkout, admin, supporter, and sensitive-query routes in the browser.

The disabled Podcast benefit bridge is also mirrored from
`podcast_benefits.enabled`, `bridge_url`, and `bridge_timeout_ms`. Its dedicated
`POOL_PODCAST_BRIDGE_SECRET` must be installed independently in the matching
Pool and Podcast environments. The current client validates the exact endpoint,
normalizes the shared high-entropy code contract, signs the exact JSON body,
rejects redirects, bounds the response, and classifies retryable failures. It
is not connected to checkout, settlement, email, or any product/tier mapping
until that mapping and durable delivery lifecycle are explicitly selected.

Write-path DoS protection now requires a `RATELIMIT` KV namespace. If that binding is missing, the Worker fails closed with `503` instead of running without abuse protection. Public live-data reads stay intentionally roomy for campaign spikes, while checkout, Manage Pledge, and admin mutations use the tighter per-IP caps documented in [`docs/SECURITY.md`](../docs/SECURITY.md). That requirement adds safety, not a new assumption that every fork must immediately outgrow the Workers Free plan.

Deployed Standard/Paid Workers now also set `limits.cpu_ms = 100` in [`wrangler.toml`](./wrangler.toml). That limit is not enforced in local development and is not a Workers Free override; it is a conservative denial-of-wallet ceiling for paid deployments that still leaves comfortable room above the currently observed fast-path request timings in the unit harness.

Tax calculation is now routed through a provider seam in `worker/src/tax.js`:

- `TAX_PROVIDER=flat` keeps the current configured-rate behavior from `SALES_TAX_RATE`
- `TAX_PROVIDER=offline_rules` uses vendored rules for international VAT/GST and state-level fallback handling
- `TAX_PROVIDER=nm_grt` uses the vendored New Mexico starter dataset and can refine New Mexico street-address lookups against the free EDAC GRT API
- `TAX_PROVIDER=zip_tax` adds local / jurisdiction-level US lookups through ZIP.TAX and falls back to `offline_rules` for destinations outside US/CA

Non-secret provider settings are mirrored from the repo-root `_config.yml` into [`wrangler.toml`](./wrangler.toml) as `TAX_PROVIDER`, `TAX_ORIGIN_COUNTRY`, `TAX_USE_REGIONAL_ORIGIN`, `NM_GRT_API_BASE`, and `ZIP_TAX_API_BASE`. If you enable `zip_tax`, also set `ZIP_TAX_API_KEY` as a Worker secret or in [`worker/.dev.vars`](../worker/.dev.vars). The vendored New Mexico starter snapshot is pinned in `@dustwave/tax-core`; its updater requires an explicit reviewed output path and fails before writing if any lookup fails.

In the current browser flow, tax previews are intentionally allowed to stay provisional. If the cart or custom checkout does not yet have enough location data, the site shows `--` and waits for `/tax/quote` or `/checkout-intent/start` to finalize the tax result. New Mexico lookups are the most exact built-in path right now and typically need full street-level address data, not just ZIP/state, before the Worker can return a reliable local GRT result.

The Worker now also writes lightweight observability summaries into `PLEDGES` KV for two things:

- Stripe webhook delivery outcomes and recent delivery history
- sampled wall-clock timings for a small set of mutation routes used to tune the `cpu_ms` cap

Campaign-runner reports use the configured platform timezone. `PLATFORM_TIMEZONE` defaults to `America/Denver`, and the minute-level Worker scheduler checks the configured local send time before sending so forks can use any supported IANA timezone.

Upcoming-campaign launch reminders also run through the minute-level scheduler. Public campaign pages collect explicit opt-in email reminders only while a campaign is upcoming; the Worker stores campaign-scoped hashed signup keys, queues one dispatch job when that campaign becomes live, and sends through the existing Resend email module with the updates sender. The dispatch queue keeps `launch-reminder-dispatch-queue:v1` state so idle scheduled ticks skip dispatch namespace scans; queued jobs mark the state pending immediately, and idle state expires hourly for compatibility with manually inserted jobs. The reminder path does not add a second Resend API integration.

Abandoned-checkout reminders use the same budget pattern. The browser shows an explicit one-reminder checkbox only in the custom first-party checkout contact surface, and `/checkout-intent/start` queues `abandoned-cart:{orderId}` only after Stripe successfully creates the Checkout Session. Successful webhook persistence deletes the same order's reminder record. The scheduled pass reads `abandoned-cart-queue:v1` first and skips namespace lists when idle or before the next due time; when due, it processes a bounded batch, checks the campaign pledge index to avoid emailing supporters who completed through another order, writes one sent marker per email/campaign set, and sends through the shared Resend email module with signed `/abandoned-cart/unsubscribe` and resume-link tokens. The optional `ABANDONED_CART_TOKEN_SECRET` falls back to `MAGIC_LINK_SECRET`.

Supporter confirmation email retries use the same free-tier-aware pattern. Failed sends write `supporter-email-retry:{orderId}` plus `supporter-email-retry-queue:v1`, and the scheduled retry pass skips KV list scans while the queue is idle or before the next retry is due.

Public campaign-page media optimization remains a static-site concern rather than a Worker runtime concern. The Worker preserves dashboard uploads as source files and dispatches the repository optimizer for committed image/video uploads; Jekyll templates, the repository media optimizer, and the deploy artifact step handle responsive WebP variants, local YouTube hero poster facades, and generated CSS/JS minification before the public Pages artifact is served. Blast announcement image uploads reuse the campaign content upload kind and directory, so email images are site-hosted under `assets/images/campaigns/<slug>/` and optimized by the same repository workflow instead of adding Worker-side image processing or extra KV state.

Public SEO and crawl validation is also a static-site concern. Build `_site`, minify generated assets, then run `npm run test:seo` from the repo root to validate generated robots, sitemap, canonicals, hreflang alternates, social metadata, and JSON-LD before changing Worker share-card or public campaign URL behavior.

The sampling rate defaults to `0.1` and can be overridden with `OBSERVABILITY_SAMPLE_RATE=0.05` (or any `0-1` value) if a fork wants fewer or more sampled timing writes.

Worker-side stats and inventory repair now also treat `campaign-pledges:{slug}` as projection state instead of permanent truth. If a campaign index drifts from the underlying active pledge records, the recalc paths repair it automatically while rebuilding campaign totals and limited-tier inventory.

Before mutating anything, operators can now run read-only drift checks through:

- `POST /stats/:slug/check`
- `POST /admin/projections/check`
- [`scripts/check-projections.sh`](../scripts/check-projections.sh) from the repo root

Those checks compare stored `campaign-pledges:{slug}`, `stats:{slug}`, and `tier-inventory:{slug}` projections against active pledge truth and return a structured diff instead of silently repairing state.

The same “saved truth over draft state” rule now applies to platform add-ons: `_config.yml` defines the starting inventory baseline for each product or variant, while the Worker stores sold counts in `add-on-inventory-sold:v1`, updates that projection after pledge create, modify, or cancel events, and avoids repeated pledge namespace scans for normal inventory reads after the initial projection bootstrap.

## Setup

For a guided cross-platform setup from the repo root, prefer:

```bash
npm run setup:deploy -- --mode=local
npm run setup:deploy -- --mode=production --dry-run
```

The helper checks `gh`, `wrangler`, and optional Stripe CLI authentication, syncs `_config.yml` into this Worker config, creates KV namespaces, updates `wrangler.toml`, writes Worker secrets, writes GitHub repository secrets, and can deploy when passed `--deploy`. Review the dry run first; production secrets are prompted/generated separately and are not copied from ignored local `.dev.vars`.

### 1. Create KV Namespaces

```bash
cd worker

wrangler kv:namespace create "VOTES"
wrangler kv:namespace create "VOTES" --preview
wrangler kv:namespace create "PLEDGES"
wrangler kv:namespace create "PLEDGES" --preview
```

Update `wrangler.toml` with the returned IDs.

### 2. Configure Secrets

Local development secrets live in ignored [`worker/.dev.vars`](../worker/.dev.vars). The safest setup path is:

```bash
npm run secrets:dev
```

The helper creates `worker/.dev.vars` from [`worker/.dev.vars.example`](./.dev.vars.example) when needed, applies local-only permissions, generates signing secrets for local development, and prompts for optional provider keys without echoing values back to the terminal. The dev launchers also run this helper in non-interactive mode so local signing secrets exist before Wrangler starts. Do not paste production secret values into `worker/.dev.vars` as a backup; use separate local-only values there.

Production secrets belong in Cloudflare Worker secrets:

```bash
# Stripe API Keys
wrangler secret put STRIPE_SECRET_KEY_LIVE
wrangler secret put STRIPE_SECRET_KEY_TEST

# Browser publishable keys for on-site Stripe fields. These are not secrets;
# set them through dashboard Settings or Worker vars, not `wrangler secret`.
STRIPE_PUBLISHABLE_KEY_LIVE=pk_live_...
STRIPE_PUBLISHABLE_KEY_TEST=pk_test_...

# Stripe Webhook Secrets
wrangler secret put STRIPE_WEBHOOK_SECRET_LIVE
wrangler secret put STRIPE_WEBHOOK_SECRET_TEST

# Optional: Film summary-only aggregate adapter
wrangler secret put FILM_STRIPE_SUMMARY_ADAPTER_SECRET

# First-party checkout intent signing secret
wrangler secret put CHECKOUT_INTENT_SECRET

# Magic link token secret
wrangler secret put MAGIC_LINK_SECRET

# Optional dedicated campaign-preview reviewer token secret.
# Falls back to MAGIC_LINK_SECRET / admin signing secrets when omitted.
wrangler secret put CAMPAIGN_PREVIEW_SECRET

# Email delivery
wrangler secret put RESEND_API_KEY
# Optional but recommended for delivery/suppression evidence after creating
# https://pledge.dustwave.xyz/webhooks/resend in Resend.
wrangler secret put RESEND_WEBHOOK_SECRET

# Admin endpoints
wrangler secret put ADMIN_SECRET
# Optional scoped admin endpoint secrets. When set, these routes reject
# ADMIN_SECRET and require their narrower secret.
wrangler secret put ADMIN_SETTLEMENT_SECRET
wrangler secret put ADMIN_BROADCAST_SECRET

# Browser admin sessions and bootstrap access
wrangler secret put ADMIN_SESSION_SECRET
# _config.yml admin.users seeds ADMIN_USERS_JSON; dashboard user edits save to
# the PLEDGES KV key admin-users:v1 and do not publish to GitHub.
# Local dev reads ADMIN_BOOTSTRAP_EMAILS from worker/.dev.vars as a
# recovery/bootstrap super-admin path.

# Cloudflare Turnstile challenge verification when public widgets are enabled
wrangler secret put TURNSTILE_SECRET_KEY

# Optional admin plan usage tracker. Use a read-only GraphQL Analytics token,
# not the broader Wrangler deploy token. Add Billing Read to detect the
# current Workers plan from account subscriptions.
wrangler secret put CLOUDFLARE_USAGE_API_TOKEN
# Also make CLOUDFLARE_ACCOUNT_ID available to the Worker runtime, either as
# a plain Worker variable or as a secret if you do not want it in config.
# CLOUDFLARE_WORKER_SCRIPT_NAME is optional and filters request metrics to one script.

# Optional: scoped launch-reminder Turnstile / unsubscribe-token secrets
wrangler secret put LAUNCH_REMINDER_TURNSTILE_SECRET_KEY
wrangler secret put LAUNCH_REMINDER_TOKEN_SECRET

# Optional: dedicated abandoned-checkout reminder token secret
# Falls back to MAGIC_LINK_SECRET when omitted.
wrangler secret put ABANDONED_CART_TOKEN_SECRET

# USPS OAuth secret (keep the client id in site config)
wrangler secret put USPS_CLIENT_SECRET

# Optional: ZIP.TAX API key for local/jurisdiction-level tax lookup
wrangler secret put ZIP_TAX_API_KEY
```

If a GitHub Actions workflow or operator job calls scoped admin endpoints, set the same scoped value as a GitHub repository secret for that workflow as well. Repository secrets authenticate GitHub Actions; they do not create or update Cloudflare Worker runtime secrets. Do not store secret values in `_config.yml`, campaign YAML, KV, admin setting drafts, or committed documentation. Stripe publishable keys are public browser keys and may be stored in dashboard Settings or deployment vars. The admin dashboard only reports whether runtime credentials appear configured; it does not read or persist secret values.

The Resend API key must be allowed to send from the domain configured in `PLEDGES_EMAIL_FROM` and `UPDATES_EMAIL_FROM`. For the live Dust Wave deployment, those sender addresses use `pool.dustwave.xyz`; authorizing only a root domain does not authorize subdomain senders, and authorizing only a subdomain does not authorize root-domain senders.

See [`../docs/EMAIL.md`](../docs/EMAIL.md) before adding new email workflows so sender identity, localization, branding, and retry behavior stay on the shared path.

For Settings -> Plan usage, Resend normally needs only `RESEND_API_KEY`. Optional `PLAN_USAGE_RESEND_PLAN`, `RESEND_EMAILS_MONTHLY_LIMIT`, and `RESEND_EMAILS_DAILY_LIMIT` values are display overrides for deployments where Resend returns rate-limit headers but does not expose the monthly sent-usage header through a safe read endpoint.

Custom checkout requires the matching Stripe publishable key for the current `APP_MODE`. If the Worker is configured for custom checkout but no publishable key is available, checkout falls back to Stripe-hosted Checkout instead of returning `503`, so pledges can still continue while the publishable key is being configured.

USPS setup for this repo is split intentionally:

- keep `shipping.usps.client_id` in the repo-root [`_config.yml`](../_config.yml) or [`_config.local.yml`](../_config.local.yml)
- keep `USPS_CLIENT_SECRET` in Worker secrets or [`worker/.dev.vars`](../worker/.dev.vars)
- if you want to point the Worker at USPS TEM for testing, also set `shipping.usps.api_base` or `USPS_API_BASE`

The Pool currently only needs USPS OAuth plus the default pricing/shipping-options product set for live quote calculation. It does **not** require USPS Labels / Ship / EPA setup unless the project later grows into label generation.

### 3. Configure Stripe Webhooks

1. Go to [Stripe Webhooks](https://dashboard.stripe.com/webhooks)
2. Add endpoint: `https://pledge.dustwave.xyz/webhooks/stripe`
3. Select events:
   - `checkout.session.completed`
   - `payment_intent.payment_failed`
4. Copy the signing secret to `STRIPE_WEBHOOK_SECRET_LIVE`
5. Repeat for test mode with `STRIPE_WEBHOOK_SECRET_TEST`

### 4. Deploy / Run

For full local development, prefer the repo-root Podman path above. If you specifically need to run only the Worker on the host:

```bash
npm run dev
```

Deploy with:

```bash
npm run deploy
npm run deploy:worker
```

On GitHub, pushes to `main` also deploy the Worker automatically through `.github/workflows/deploy.yml`. The workflow uses repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; create `CLOUDFLARE_API_TOKEN` as a user API token under **My Profile -> API Tokens** with the **Edit Cloudflare Workers** template, scoped to this account and the `dustwave.xyz` zone. Do not use an account-owned API token, because Wrangler still calls user-scoped endpoints during deploy. Cache purging can use a narrower `CLOUDFLARE_CACHE_PURGE_TOKEN` and otherwise falls back to `CLOUDFLARE_API_TOKEN`; the separate cache-purge token is recommended so the deploy token does not need zone cache-purge access. The Pages deploy job requires `pages: write` and `id-token: write`; keep those permissions explicit if the workflow is copied into a fork.

## API Endpoints

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
Get single pledge details (legacy endpoint).

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

## Content Safety Notes

- Campaign/diary text blocks accept Markdown plus a small inline HTML subset: `<br>`, `<em>`, `<strong>`, `<i>`, `<b>`, `<u>`.
- Markdown links are rewritten unless they use an allowlisted destination scheme (`http:`, `https:`, `mailto:`, or internal links).
- External Markdown links automatically get `target="_blank"` and `rel="noopener noreferrer"`.
- Structured embeds only render when the provider URL is an approved `https://` Spotify, YouTube, or Vimeo embed URL.
- Local video blocks may include an optional poster image; without one, browser UI generates a first-frame poster from the same-origin video asset without changing the stored block.

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
Stripe webhook endpoint (signature verified).

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
- `POST /admin/campaigns/create` lets super admins create preview-only campaigns through the GitHub-backed campaign source path, assign one or more existing campaign users, optionally create multiple new campaign users in `admin-users:v1`, email assigned users the admin dashboard link, and record an audit event
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

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SITE_BASE` | Base URL of the Jekyll site |
| `WORKER_BASE` | Public base URL of the Worker |
| `PLATFORM_NAME` | Public platform name used in Worker responses and email copy |
| `PLATFORM_COMPANY_NAME` | Company/platform-author name used for platform-tip copy |
| `SUPPORT_EMAIL` | Support contact mirrored from site config |
| `PLEDGES_EMAIL_FROM` | Sender identity for pledge-related emails; its domain must be authorized in Resend |
| `UPDATES_EMAIL_FROM` | Sender identity for update / milestone / Blast / announcement emails; its domain must be authorized in Resend |
| `POOL_EMAIL_DRY_RUN` | Optional no-send release evidence mode for supporter/update emails; truthy values skip the Resend request and return a dry-run id |
| `RESEND_EMAIL_DRY_RUN` | Compatibility alias for no-send Resend evidence mode |
| `RESEND_WEBHOOK_SECRET` | Resend/Svix signing secret for `POST /webhooks/resend` |
| `EMAIL_OUTBOX_ENABLED` | Production durable email outbox flag; defaults on unless explicitly `false` |
| `PAYMENT_RECONCILIATION_ENABLED` | Enables daily indexed Stripe reconciliation; defaults on in live mode and off in test mode |
| `EMAIL_LOGO_PATH` | Supporter-email logo path mirrored from `platform.logo_path` |
| `EMAIL_FONT_FAMILY` | Supporter-email body font stack mirrored from `design.font_body` |
| `EMAIL_HEADING_FONT_FAMILY` | Supporter-email heading font stack mirrored from `design.font_display` |
| `EMAIL_COLOR_TEXT` | Supporter-email base text color mirrored from `design.color_text` |
| `EMAIL_COLOR_MUTED` | Supporter-email muted text color mirrored from `design.color_text_muted` |
| `EMAIL_COLOR_SURFACE` | Supporter-email card surface color mirrored from `design.color_surface_subtle` |
| `EMAIL_COLOR_BORDER` | Supporter-email border color mirrored from `design.color_border` |
| `EMAIL_COLOR_PRIMARY` | Supporter-email primary CTA/link color mirrored from `design.color_primary` |
| `EMAIL_BUTTON_RADIUS` | Supporter-email button radius mirrored from `design.radius_lg` |
| `I18N_CATALOG_JSON` | Optional inline locale catalog override for Worker email localization in tests or custom deployments |
| `SALES_TAX_RATE` | Sales tax rate mirrored from `pricing.sales_tax_rate` |
| `FLAT_SHIPPING_RATE` | Legacy flat-shipping compatibility baseline mirrored from `pricing.flat_shipping_rate` |
| `SHIPPING_ORIGIN_ZIP` | USPS shipping origin ZIP mirrored from `shipping.origin_zip` |
| `SHIPPING_ORIGIN_COUNTRY` | USPS shipping origin country mirrored from `shipping.origin_country` |
| `SHIPPING_FALLBACK_FLAT_RATE` | Fallback shipping rate mirrored from `shipping.fallback_flat_rate` |
| `FREE_SHIPPING_DEFAULT` | Deployment-wide free-shipping default mirrored from `shipping.free_shipping_default` |
| `USPS_ENABLED` | Whether USPS live quoting is enabled |
| `USPS_CLIENT_ID` | USPS OAuth client id mirrored from `shipping.usps.client_id` |
| `USPS_API_BASE` | USPS API base URL mirrored from `shipping.usps.api_base` |
| `USPS_TIMEOUT_MS` | USPS request timeout in ms |
| `USPS_QUOTE_CACHE_TTL_SECONDS` | Short-lived in-memory USPS quote cache TTL |
| `USPS_FAILURE_COOLDOWN_SECONDS` | Cooldown after repeated USPS failures |
| `USPS_RATE_LIMIT_COOLDOWN_SECONDS` | Cooldown after USPS `429` responses |
| `DEFAULT_PLATFORM_TIP_PERCENT` | Default platform tip percent mirrored from `pricing.default_tip_percent` |
| `MAX_PLATFORM_TIP_PERCENT` | Max platform tip percent mirrored from `pricing.max_tip_percent` |
| `APP_MODE` | `"test"` or `"live"` - determines which API keys to use. Production deployments should use `"live"`; local `dev` uses `"test"`. |
| `ADMIN_LOCAL_REPO_WRITES_ENABLED` | Dev-only guard that lets `APP_MODE=test` create preview-only campaign files and archive campaign source/media in the mounted local repository. Do not enable on deployed Workers. |
| `ADMIN_LOCAL_REPO_SERVICE` | Dev-only local helper URL used by Wrangler/Podman because the Worker runtime cannot write files directly. Defaults to `http://127.0.0.1:8799` in `env.dev`. |
| `CORS_ALLOWED_ORIGIN` | Browser origin allowed to call the Worker from the dashboard/site |
| `CAMPAIGN_PREVIEW_SECRET` | Optional dedicated HMAC signing secret for 24-hour campaign preview reviewer links; falls back to existing signing secrets when omitted |
| `ADMIN_EXPOSE_LOGIN_LINK` | Optional local-only escape hatch to return admin login URLs in `/admin/auth/start` responses. Do not enable on deployed Workers. |
| `ADMIN_SESSION_SECRET` | Secret used for browser admin session cookies |
| `ADMIN_BOOTSTRAP_EMAILS` | Optional bootstrap/recovery super-admin emails; set this in `worker/.dev.vars` for local dev |
| `ADMIN_USERS_JSON` | Seed/recovery admin users mirrored from `_config.yml`; runtime dashboard edits save to KV at `admin-users:v1` |
| `ADMIN_TEST_CAMPAIGNS` | Optional comma-separated campaign slugs exposed to the local admin dashboard test setup |
| `TURNSTILE_SECRET_KEY` | Shared Cloudflare Turnstile secret key for admin email sign-in and launch reminder challenge verification |
| `ADMIN_TURNSTILE_SECRET_KEY` | Optional admin-specific Turnstile secret when not using `TURNSTILE_SECRET_KEY` |
| `ADMIN_TURNSTILE_REQUIRED` | Optional fail-closed flag for deployments that expect Turnstile to be configured |
| `ADMIN_TURNSTILE_BYPASS` | Local/test-only bypass for automated admin auth tests; do not enable on deployed Workers |
| `CLOUDFLARE_USAGE_API_TOKEN` / `CLOUDFLARE_ANALYTICS_API_TOKEN` | Optional read-only GraphQL Analytics token for Settings -> Plan usage; add Billing Read for Workers plan auto-detection and keep it separate from deploy tokens |
| `CLOUDFLARE_ACCOUNT_ID` | Account id used by Cloudflare plan usage GraphQL queries |
| `CLOUDFLARE_WORKER_SCRIPT_NAME` | Optional Worker script filter for Cloudflare request metrics; omit for account-wide Workers usage |
| `PLAN_USAGE_CLOUDFLARE_PLAN` / `PLAN_USAGE_RESEND_PLAN` | Optional display plan keys (`free`, `standard`/`paid`, `pro`, `scale`) used only when provider plan auto-detection is unavailable |
| `CLOUDFLARE_*_DAILY_LIMIT` / `CLOUDFLARE_*_MONTHLY_LIMIT` | Optional Cloudflare metric limit overrides for Workers requests and KV reads/writes/deletes/lists, for example `CLOUDFLARE_WORKERS_REQUESTS_MONTHLY_LIMIT` |
| `RESEND_EMAILS_MONTHLY_LIMIT` / `RESEND_EMAILS_DAILY_LIMIT` | Optional Resend display quota overrides used when Resend exposes plan/rate-limit data but omits monthly sent-usage headers |
| `PLAN_USAGE_WARNING_PERCENT` / `PLAN_USAGE_CRITICAL_PERCENT` | Optional warning thresholds for plan usage progress bars |
| `LAUNCH_REMINDERS_ENABLED` | Enables public upcoming-campaign launch reminder signup handling; mirrored from `_config.yml` |
| `LAUNCH_REMINDER_TURNSTILE_SECRET_KEY` | Optional reminder-specific Turnstile secret when not using `TURNSTILE_SECRET_KEY` |
| `LAUNCH_REMINDER_TURNSTILE_REQUIRED` | Optional fail-closed flag for reminder signups when a reminder Turnstile widget is expected |
| `LAUNCH_REMINDER_TURNSTILE_BYPASS` | Local/test-only bypass for reminder signup automation; do not enable on deployed Workers |
| `LAUNCH_REMINDER_TOKEN_SECRET` | Optional unsubscribe-token signing secret; falls back to `MAGIC_LINK_SECRET` |
| `LAUNCH_REMINDER_DISPATCH_BATCH_SIZE` | Optional per-job reminder dispatch batch size override |
| `LAUNCH_REMINDER_DISPATCH_JOB_LIMIT` | Optional number of reminder dispatch jobs to process per scheduled tick |
| `ABANDONED_CART_TOKEN_SECRET` | Optional abandoned-checkout reminder token secret for unsubscribe and resume links; falls back to `MAGIC_LINK_SECRET` |
| `INTENT_PREFETCH_ENABLED` | Public document intent-prefetch enabled flag mirrored from site config |
| `INTENT_PREFETCH_DELAY_MS` | Hover/focus delay before public document prefetch starts |
| `INTENT_PREFETCH_LIMIT` | Maximum public document prefetches per page view |

When `SITE_BASE` points at local dev (`localhost` / `127.0.0.1`), embedded email images still fall back to the public `https://pool.dustwave.xyz` asset base so inbox clients do not receive broken localhost image URLs.

Production email uses the durable shared outbox in `worker/src/email-outbox.js`: it freezes the rendered payload, sends with a deterministic Resend idempotency key, retries bounded provider failures, and checks local suppression immediately before delivery. Keep new workflows on `queuePoolEmail` / `enqueueEmailOutbox` plus the shared `worker/src/email.js` templates so sender identity, localization, branding, consent, and provider behavior do not drift. Admin login and explicit test sends remain immediate.

Fork note: treat those identity, email-branding, pricing, and shipping vars as mirrors of the structured site config in [`_config.yml`](../_config.yml), especially the `platform`, `design`, `pricing`, and `shipping` sections. The first-party cart/runtime and the custom on-site checkout UI are built-in platform behavior now, not Worker env toggles you should normally customize directly.

Keep `USPS_CLIENT_SECRET` out of site config. It belongs in Worker secrets or [`worker/.dev.vars`](../worker/.dev.vars).

Localization note: the Worker now localizes supporter-facing email subjects/body copy and localized `/manage/` / `/community/:slug/` links from the shared site locale catalog. In normal operation it fetches that catalog from `SITE_BASE/assets/i18n.json`; tests and advanced deployments can inject `I18N_CATALOG_JSON` instead. That means localized supporter emails and localized routes such as `/es/manage/` or `/es/community/:slug/` stay aligned with the site locale model when a deployment adds those routes.

The Worker also serves localized campaign share-card previews at `GET /share/campaign/:slug.png` with an optional `?lang=es` query. The generated PNG mirrors the campaign embed's state/progress language and uses the square campaign `hero_image` inside the card. The SVG route remains available at `GET /share/campaign/:slug.svg` for internal preview/debug tooling, but public `og:image` metadata should use PNG or another static raster image because not every external crawler accepts SVG images.

## Data Flow

The full payment runbook is in [`../docs/PAYMENT_PROCESSOR.md`](../docs/PAYMENT_PROCESSOR.md). This section is the compact Worker data-flow summary.

1. **User pledges on campaign page**
   - first-party cart created with tier item
   - `POST /checkout-intent/start` creates the setup-mode Stripe session used by the on-site payment step
   - the existing checkout sidecar mounts secure Stripe payment UI to save the card

2. **Stripe webhook: checkout.session.completed**
   - Extract payment method and customer from SetupIntent
   - Persist pledge data in KV and update stats/inventory
   - Commit webhook idempotency only after successful persistence
   - Send confirmation email with an order-scoped magic link

3. **User manages pledge via /manage/?t={token}**
   - Frontend calls GET `/pledges`
   - The token can read/modify only its own authorized order
   - User can modify tier, cancel, or update payment method

4. **Campaign reaches goal**
   - The scheduler or an authorized operator dispatches campaign settlement
   - The campaign's settlement coordinator serializes settlement batches
   - The Worker creates PaymentIntents using stored payment methods and deterministic idempotency keys
   - Pledges update to "charged" or "payment_failed"

## Test Mode

Preferred local development path:

```bash
npm run podman:doctor
./scripts/dev.sh --podman
```

That starts the site and the Worker together, and the Worker still runs with `--env dev` under the hood.

The broader automated browser path now builds and serves a static `_site`, so local headless checks exercise the same published-style asset layout as the site build rather than relying on `jekyll serve`.

If you specifically need the Worker-only fallback:

```bash
cd worker
wrangler dev --env dev
```

The `dev` environment:
- Sets `APP_MODE=test`
- Uses `STRIPE_SECRET_KEY_TEST`
- Points `SITE_BASE` to localhost
- Sets `CORS_ALLOWED_ORIGIN` to the local Jekyll origin
- Allows the admin sign-in route to return the local development login URL instead of requiring email delivery
- Reads `ADMIN_BOOTSTRAP_EMAILS` from `worker/.dev.vars` for local bootstrap super-admin access
- Saves dashboard user-management edits directly to the PLEDGES KV key `admin-users:v1`
- Uses `hand-relations` and `smoke-editable` as the default `/test/setup` campaigns

To seed both admin dashboard test campaigns against a running local Worker:

```bash
../scripts/seed-admin-test-campaigns.sh
```

Add `?dev` to the manage page URL for mock data: `http://127.0.0.1:4000/manage/?dev`

## Automated Diary Broadcasts

Diary entries are automatically broadcast to supporters when deployed:

1. When a new diary entry is added and the site is deployed, the `deploy.yml` GitHub Action calls `POST /admin/diary/check`
2. The worker fetches campaign data and compares diary entries against what's been sent
3. New entries are broadcast to all campaign supporters via email
4. Sent entries are tracked in KV (`diary-sent:{campaignSlug}`) to prevent duplicate emails

Diary entries should have stable `id` values. The dashboard preserves existing IDs and the Worker derives title-based IDs when publishing entries that do not have one yet. Automatic broadcasts track `id:{entryId}` markers and still recognize legacy date markers, including date strings that only differ by `:00` seconds formatting. Updating an existing diary entry title, date display, phase, or content should not send another automatic email.

**Setup:** Ensure `ADMIN_SECRET` is set as a GitHub repository secret for the deploy action to authenticate, or set `ADMIN_BROADCAST_SECRET` in both Cloudflare Worker secrets and GitHub repository secrets when using scoped broadcast credentials. If the post-deploy check receives a Cloudflare challenge page, also configure `DIARY_CHECK_BYPASS_SECRET` plus the matching WAF skip rule described above.
