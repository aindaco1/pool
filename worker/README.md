# The Pool - Pledge Worker

Cloudflare Worker handling first-party checkout canonicalization, Stripe integration, pledge management, and order-scoped supporter authentication.

For day-to-day local development, prefer the repo-root Podman path:

```bash
npm run podman:doctor
./scripts/dev.sh --podman
```

That boots the site and Worker together on the standard local ports and is the easiest way to exercise the full on-site checkout and `Update Card` flows locally.

If you specifically work from the `worker/` directory, the Worker npm scripts now auto-run the config mirror first so `worker/wrangler.toml` stays aligned with the repo-root `_config.yml` / `_config.local.yml`.

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
```

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
  "tipPercent": 5
}
```

Returns either a custom-session bootstrap (`checkoutUiMode`, `sessionId`, `clientSecret`, `publishableKey`, `orderId`) or a hosted fallback URL.

The Worker rebuilds tier, add-on, custom-support, shipping, and subtotal state from first-party cart items, validates campaign state and inventory, signs a short-lived checkout snapshot, reserves scarce inventory for limited tiers before the payment step completes, and confirms those reservations when the pledge is actually persisted.

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

All fields except `token` are optional. Changes are tracked in the pledge's `history` array with `type: "modified"` entries that include tier state and `customAmount`.

The Worker validates the requested order against the token payload and recalculates totals from stored pledge state plus campaign definitions.

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

### POST /webhooks/stripe
Stripe webhook endpoint (signature verified).

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
| `SALES_TAX_RATE` | Sales tax rate mirrored from `pricing.sales_tax_rate` |
| `FLAT_SHIPPING_RATE` | Flat shipping rate mirrored from `pricing.flat_shipping_rate` |
| `DEFAULT_PLATFORM_TIP_PERCENT` | Default platform tip percent mirrored from `pricing.default_tip_percent` |
| `MAX_PLATFORM_TIP_PERCENT` | Max platform tip percent mirrored from `pricing.max_tip_percent` |
| `APP_MODE` | `"test"` or `"live"` - determines which API keys to use |
| `RESEND_RATE_LIMIT_DELAY` | Delay between emails in ms (default: 600ms to stay under Resend's 2 req/sec limit) |

When `SITE_BASE` points at local dev (`localhost` / `127.0.0.1`), embedded email images still fall back to the public `https://pool.dustwave.xyz` asset base so inbox clients do not receive broken localhost image URLs.

Fork note: treat those identity and pricing vars as mirrors of the structured site config in [`_config.yml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/_config.yml), especially the `platform` and `pricing` sections. The first-party cart/runtime and the custom on-site checkout UI are built-in platform behavior now, not Worker env toggles you should normally customize.

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

**Setup:** Ensure `ADMIN_SECRET` is set as a GitHub repository secret for the deploy action to authenticate.
