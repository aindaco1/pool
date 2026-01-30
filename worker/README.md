# The Pool - Pledge Worker

Cloudflare Worker handling pledge management, Stripe/Snipcart integration, and supporter authentication.

## Setup

### 1. Create KV Namespaces

```bash
cd worker

# Create VOTES namespace (if not already done)
wrangler kv:namespace create "VOTES"
wrangler kv:namespace create "VOTES" --preview

# Create PLEDGES namespace
wrangler kv:namespace create "PLEDGES"
wrangler kv:namespace create "PLEDGES" --preview
```

Update `wrangler.toml` with the returned IDs.

### 2. Configure Secrets

Set all required secrets:

```bash
# Stripe API Keys (get from https://dashboard.stripe.com/apikeys)
wrangler secret put STRIPE_SECRET_KEY_LIVE  # sk_live_...
wrangler secret put STRIPE_SECRET_KEY_TEST  # sk_test_...

# Stripe Webhook Secrets (get from https://dashboard.stripe.com/webhooks)
wrangler secret put STRIPE_WEBHOOK_SECRET_LIVE  # whsec_...
wrangler secret put STRIPE_WEBHOOK_SECRET_TEST  # whsec_...

# Snipcart API Keys (get from https://app.snipcart.com/dashboard/account/credentials)
wrangler secret put SNIPCART_SECRET_LIVE  # prod API key
wrangler secret put SNIPCART_SECRET_TEST  # test API key

# Magic Link Token Secret (generate a random 32+ character string)
wrangler secret put MAGIC_LINK_SECRET

# Resend API Key (get from https://resend.com/api-keys)
wrangler secret put RESEND_API_KEY

# Admin Secret (for broadcast endpoints - generate a random 32+ character string)
wrangler secret put ADMIN_SECRET

# Optional: Snipcart Webhook Validation
wrangler secret put SNIPCART_WEBHOOK_SECRET
```

### 3. Configure Webhooks

#### Stripe Webhooks

1. Go to [Stripe Webhooks](https://dashboard.stripe.com/webhooks)
2. Add endpoint: `https://pledge.dustwave.xyz/webhooks/stripe`
3. Select events:
   - `checkout.session.completed`
   - `payment_intent.payment_failed`
4. Copy the signing secret to `STRIPE_WEBHOOK_SECRET_LIVE`
5. Repeat for test mode with `STRIPE_WEBHOOK_SECRET_TEST`

#### Snipcart Webhooks

1. Go to [Snipcart Webhooks](https://app.snipcart.com/dashboard/webhooks)
2. Add endpoint: `https://pledge.dustwave.xyz/webhooks/snipcart`
3. Select events:
   - `order.completed`
4. Optionally set a request token for `SNIPCART_WEBHOOK_SECRET`

### 4. Deploy

```bash
# Development (uses test mode APIs)
wrangler dev --env dev

# Production
wrangler deploy
```

## API Endpoints

### POST /start
Create a Stripe SetupIntent session for a new pledge.

```json
{
  "orderId": "snipcart-order-token",
  "campaignSlug": "hand-relations",
  "amountCents": 500,
  "email": "supporter@example.com",
  "tierId": "frame-slot",
  "tierName": "Buy 1 Frame"
}
```

Returns: `{ "url": "https://checkout.stripe.com/..." }`

### GET /pledges?token={token}
Get all pledges for a user (by magic link token).

Returns array of pledge objects.

### GET /pledge?token={token}
Get single pledge details (legacy endpoint).

### POST /pledge/cancel
Cancel an active pledge.

```json
{
  "token": "magic-link-token",
  "orderId": "snipcart-order-token"
}
```

### POST /pledge/modify
Change tiers, quantity, or custom support for an active pledge.

```json
{
  "token": "magic-link-token",
  "orderId": "snipcart-order-token",
  "newTierId": "sfx-slot",
  "newTierQty": 2,
  "addTiers": [{ "id": "frame", "qty": 5 }],
  "customAmount": 25
}
```

All fields except `token` are optional. Changes are tracked in the pledge's `history` array with `type: "modified"` entries that include tier state and `customAmount`.

### POST /pledge/payment-method/start
Start a Stripe session to update payment method.

```json
{
  "token": "magic-link-token"
}
```

Returns: `{ "url": "https://checkout.stripe.com/..." }`

### POST /webhooks/stripe
Stripe webhook endpoint (signature verified).

### POST /webhooks/snipcart
Snipcart webhook endpoint.

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
Send a test email of any type. In test mode (`SNIPCART_MODE=test`), no auth required. In production, requires `x-admin-key` header.

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
| `SNIPCART_API_BASE` | Snipcart API base URL |
| `SNIPCART_MODE` | `"test"` or `"live"` - determines which API keys to use |
| `RESEND_RATE_LIMIT_DELAY` | Delay between emails in ms (default: 600ms to stay under Resend's 2 req/sec limit) |

## Data Flow

1. **User pledges on campaign page**
   - Snipcart cart created with tier item
   - After Snipcart checkout, POST to `/start` creates Stripe SetupIntent
   - User redirected to Stripe Checkout to save card

2. **Stripe webhook: checkout.session.completed**
   - Extract payment method and customer from SetupIntent
   - Store pledge data in KV and Snipcart metadata
   - Send confirmation email with magic link

3. **User manages pledge via /manage/?t={token}**
   - Frontend calls GET `/pledges` to list all pledges
   - User can modify tier, cancel, or update payment method

4. **Campaign reaches goal**
   - Admin triggers charge process (separate script)
   - Creates PaymentIntents using stored payment methods
   - Updates pledge status to "charged"

## Test Mode

For local development:

```bash
# Start Jekyll site
bundle exec jekyll serve --config _config.yml,_config.local.yml

# Start worker in test mode
cd worker
wrangler dev --env dev
```

The `--env dev` flag:
- Sets `SNIPCART_MODE=test`
- Uses `STRIPE_SECRET_KEY_TEST` and `SNIPCART_SECRET_TEST`
- Points `SITE_BASE` to localhost

Add `?dev` to the manage page URL for mock data: `http://127.0.0.1:4000/manage/?dev`

## Automated Diary Broadcasts

Diary entries are automatically broadcast to supporters when deployed:

1. When a new diary entry is added and the site is deployed, the `deploy.yml` GitHub Action calls `POST /admin/diary/check`
2. The worker fetches campaign data and compares diary entries against what's been sent
3. New entries are broadcast to all campaign supporters via email
4. Sent entries are tracked in KV (`diary-sent:{campaignSlug}`) to prevent duplicate emails

**Setup:** Ensure `ADMIN_SECRET` is set as a GitHub repository secret for the deploy action to authenticate.
