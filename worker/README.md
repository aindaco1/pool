# The Pool - Pledge Worker

Cloudflare Worker handling first-party checkout canonicalization, Stripe integration, pledge management, and order-scoped supporter authentication.

For day-to-day local development, prefer the repo-root Podman path:

```bash
npm run podman:doctor
./scripts/dev.sh --podman
```

That boots the site and Worker together on the standard local ports and is the easiest way to exercise the full on-site checkout and `Update Card` flows locally.

If you specifically work from the `worker/` directory, the Worker npm scripts now auto-run the config mirror first so `worker/wrangler.toml` stays aligned with the repo-root `_config.yml` / `_config.local.yml`.

Treat `_config.local.yml` as an override-only file for localhost-specific values. The canonical fork-facing settings should live in the repo-root `_config.yml`, and the Worker mirror will follow from there.

Campaign-runner report delivery follows that same pattern:

- campaign-level recipients live in campaign front matter as `runner_report_emails`
- deployment-wide timing and email/report behavior live in `_config.yml` under `reports.campaign_runner`
- the Worker mirror carries those non-secret settings into `wrangler.toml`
- the shared report core in `worker/src/reports.js` now powers both scheduled runner emails and the local shell export helpers so CSV logic stays in one place

The mirrored Worker config now also includes the shared debug flags:

- `DEBUG_CONSOLE_LOGGING_ENABLED`
- `DEBUG_VERBOSE_CONSOLE_LOGGING`

Those come from `debug.console_logging_enabled` and `debug.verbose_console_logging` in the repo-root [`_config.yml`](../_config.yml), and both default to `true` so local and deployed Workers stay verbose unless a fork explicitly turns logging down.

Write-path DoS protection now requires a `RATELIMIT` KV namespace. If that binding is missing, the Worker fails closed with `503` instead of running without abuse protection. Public live-data reads stay intentionally roomy for campaign spikes, while checkout, Manage Pledge, and admin mutations use the tighter per-IP caps documented in [`docs/SECURITY.md`](../docs/SECURITY.md). That requirement adds safety, not a new assumption that every fork must immediately outgrow the Workers Free plan.

Deployed Standard/Paid Workers now also set `limits.cpu_ms = 100` in [`wrangler.toml`](./wrangler.toml). That limit is not enforced in local development and is not a Workers Free override; it is a conservative denial-of-wallet ceiling for paid deployments that still leaves comfortable room above the currently observed fast-path request timings in the unit harness.

Tax calculation is now routed through a provider seam in `worker/src/tax.js`:

- `TAX_PROVIDER=flat` keeps the current configured-rate behavior from `SALES_TAX_RATE`
- `TAX_PROVIDER=offline_rules` uses vendored rules for international VAT/GST and state-level fallback handling
- `TAX_PROVIDER=nm_grt` uses the vendored New Mexico starter dataset and can refine New Mexico street-address lookups against the free EDAC GRT API
- `TAX_PROVIDER=zip_tax` adds local / jurisdiction-level US lookups through ZIP.TAX and falls back to `offline_rules` for destinations outside US/CA

Non-secret provider settings are mirrored from the repo-root `_config.yml` into [`wrangler.toml`](./wrangler.toml) as `TAX_PROVIDER`, `TAX_ORIGIN_COUNTRY`, `TAX_USE_REGIONAL_ORIGIN`, `NM_GRT_API_BASE`, and `ZIP_TAX_API_BASE`. If you enable `zip_tax`, also set `ZIP_TAX_API_KEY` as a Worker secret or in [`worker/.dev.vars`](../worker/.dev.vars). Refresh the vendored New Mexico starter file with `node ../scripts/update-nm-grt-starter.mjs`.

In the current browser flow, tax previews are intentionally allowed to stay provisional. If the cart or custom checkout does not yet have enough location data, the site shows `--` and waits for `/tax/quote` or `/checkout-intent/start` to finalize the tax result. New Mexico lookups are the most exact built-in path right now and typically need full street-level address data, not just ZIP/state, before the Worker can return a reliable local GRT result.

The Worker now also writes lightweight observability summaries into `PLEDGES` KV for two things:

- Stripe webhook delivery outcomes and recent delivery history
- sampled wall-clock timings for a small set of mutation routes used to tune the `cpu_ms` cap

Campaign-runner reports now use dedicated scheduled runs at 7:00 AM Mountain Time. The Worker keeps that window MT-aware in code, while `wrangler.toml` includes the paired UTC cron entries needed to cover both MST and MDT safely.

The sampling rate defaults to `0.1` and can be overridden with `OBSERVABILITY_SAMPLE_RATE=0.05` (or any `0-1` value) if a fork wants fewer or more sampled timing writes.

Worker-side stats and inventory repair now also treat `campaign-pledges:{slug}` as projection state instead of permanent truth. If a campaign index drifts from the underlying active pledge records, the recalc paths repair it automatically while rebuilding campaign totals and limited-tier inventory.

Before mutating anything, operators can now run read-only drift checks through:

- `POST /stats/:slug/check`
- `POST /admin/projections/check`
- [`scripts/check-projections.sh`](../scripts/check-projections.sh) from the repo root

Those checks compare stored `campaign-pledges:{slug}`, `stats:{slug}`, and `tier-inventory:{slug}` projections against active pledge truth and return a structured diff instead of silently repairing state.

The same “saved truth over draft state” rule now applies to platform add-ons: `_config.yml` defines the starting inventory baseline for each product or variant, while the Worker derives effective remaining inventory from saved pledge state and invalidates cached add-on inventory after pledge create, modify, or cancel events.

## Setup

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

```bash
# Stripe API Keys
wrangler secret put STRIPE_SECRET_KEY_LIVE
wrangler secret put STRIPE_SECRET_KEY_TEST

# Stripe Webhook Secrets
wrangler secret put STRIPE_WEBHOOK_SECRET_LIVE
wrangler secret put STRIPE_WEBHOOK_SECRET_TEST

# First-party checkout intent signing secret
wrangler secret put CHECKOUT_INTENT_SECRET

# Magic link token secret
wrangler secret put MAGIC_LINK_SECRET

# Email delivery
wrangler secret put RESEND_API_KEY

# Admin endpoints
wrangler secret put ADMIN_SECRET

# USPS OAuth secret (keep the client id in site config)
wrangler secret put USPS_CLIENT_SECRET

# Optional: ZIP.TAX API key for local/jurisdiction-level tax lookup
wrangler secret put ZIP_TAX_API_KEY
```

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

On GitHub, pushes to `main` also deploy the Worker automatically through `.github/workflows/deploy.yml`. The preferred setup uses repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. As a temporary fallback, the workflow also accepts legacy Cloudflare auth via `CLOUDFLARE_EMAIL` and `CLOUDFLARE_KEY`.

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

### POST /pledge/payment-method/start
Start a Stripe session to update payment method.

```json
{
  "token": "magic-link-token"
}
```

Returns either a custom-session bootstrap for the on-site `Update Card` flow or a hosted fallback URL.

### GET /share/campaign/:slug.svg
Return a public SVG share card for one campaign.

Optional query params:

- `lang=en|es` to localize campaign UI copy and the footer campaign link

The rendered card uses live campaign data, including current state, pledged total, goal progress, and creator/category metadata. Campaign-page `og:image` / `twitter:image` tags point at this route so social previews stay aligned with live campaign and embed state.

### POST /webhooks/stripe
Stripe webhook endpoint (signature verified).

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

### GET /admin/observability/webhooks?days=2
Admin-only webhook observability summary.

Returns recent per-day webhook delivery counts, outcomes, event-type rollups, duration stats, and a short recent-event window for debugging retries, signature failures, and unexpected traffic spikes.

### GET /admin/observability/performance?days=2
Admin-only sampled performance summary.

Returns sampled wall-clock timings for key mutation routes such as checkout start, checkout completion, Manage Pledge writes, shipping quotes, and checkout abandon. This is intended as a tuning aid for the deployed `cpu_ms` cap, not as a high-cardinality tracing system.

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
Check all campaigns for new diary entries and broadcast them automatically. Called by GitHub Actions after deploy. Requires `Authorization: Bearer {ADMIN_SECRET}` header.

If Cloudflare zone security challenges the GitHub Actions request before it reaches the Worker, set a repository secret named `DIARY_CHECK_BYPASS_SECRET` and add a Cloudflare WAF skip rule for `POST /admin/diary/check` when `X-Pool-Diary-Check` matches that secret. Keep `ADMIN_SECRET` enabled; the bypass header is only an edge-rule signal, not Worker authentication.

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
- omitting `markAsSent` defaults it to `true` for live sends so the matching cron run does not immediately duplicate the report
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
| `PLEDGES_EMAIL_FROM` | Sender identity for pledge-related emails |
| `UPDATES_EMAIL_FROM` | Sender identity for update / milestone / announcement emails |
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
| `APP_MODE` | `"test"` or `"live"` - determines which API keys to use |
| `RESEND_RATE_LIMIT_DELAY` | Delay between emails in ms (default: 600ms to stay under Resend's 2 req/sec limit) |

When `SITE_BASE` points at local dev (`localhost` / `127.0.0.1`), embedded email images still fall back to the public `https://pool.dustwave.xyz` asset base so inbox clients do not receive broken localhost image URLs.

Fork note: treat those identity, email-branding, pricing, and shipping vars as mirrors of the structured site config in [`_config.yml`](../_config.yml), especially the `platform`, `design`, `pricing`, and `shipping` sections. The first-party cart/runtime and the custom on-site checkout UI are built-in platform behavior now, not Worker env toggles you should normally customize directly.

Keep `USPS_CLIENT_SECRET` out of site config. It belongs in Worker secrets or [`worker/.dev.vars`](../worker/.dev.vars).

Localization note: the Worker now localizes supporter-facing email subjects/body copy and localized `/manage/` / `/community/:slug/` links from the shared site locale catalog. In normal operation it fetches that catalog from `SITE_BASE/assets/i18n.json`; tests and advanced deployments can inject `I18N_CATALOG_JSON` instead. That means localized supporter emails and localized routes such as `/es/manage/` or `/es/community/:slug/` stay aligned with the site locale model when a deployment adds those routes.

The Worker also serves localized campaign share-card previews at `GET /share/campaign/:slug.svg` with an optional `?lang=es` query. Campaign pages use that route for their social image metadata, and the generated SVG mirrors the campaign embed's state/progress language while linking back to the localized public campaign route.

## Data Flow

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
   - Admin triggers charge process (separate script)
   - Creates PaymentIntents using stored payment methods
   - Updates pledge status to "charged"

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

Add `?dev` to the manage page URL for mock data: `http://127.0.0.1:4000/manage/?dev`

## Automated Diary Broadcasts

Diary entries are automatically broadcast to supporters when deployed:

1. When a new diary entry is added and the site is deployed, the `deploy.yml` GitHub Action calls `POST /admin/diary/check`
2. The worker fetches campaign data and compares diary entries against what's been sent
3. New entries are broadcast to all campaign supporters via email
4. Sent entries are tracked in KV (`diary-sent:{campaignSlug}`) to prevent duplicate emails

**Setup:** Ensure `ADMIN_SECRET` is set as a GitHub repository secret for the deploy action to authenticate. If the post-deploy check receives a Cloudflare challenge page, also configure `DIARY_CHECK_BYPASS_SECRET` plus the matching WAF skip rule described above.
