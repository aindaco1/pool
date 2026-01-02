# Testing Guide

This guide covers the test suites and manual testing setup.

## Quick Reference

```bash
npm run test:unit          # Unit tests (Vitest) — ~700ms
npm run test:unit:watch    # Watch mode
npm run test:unit:coverage # With coverage report
npm run test:e2e           # E2E tests (Playwright) — starts Jekyll
npm run test:e2e:headless  # CI mode
npm run test:security      # Security pen tests (Worker must be running)
npm run test:security:staging  # Security tests against staging
npm test                   # Run all tests
```

---

## Unit Tests (Vitest)

Fast, isolated tests for JS functions in `tests/unit/`.

### Coverage

| Module | Functions Tested |
|--------|-----------------|
| `live-stats.js` | `formatMoney`, `updateProgressBar`, `updateMarkerState`, `checkTierUnlocks`, `checkLateSupport`, `updateSupportItems`, `updateTierInventory` |

### Running

```bash
npm run test:unit          # Run once (37 tests)
npm run test:unit:watch    # Watch mode for development
npm run test:unit:coverage # Generate coverage report
```

### Adding Tests

Create files in `tests/unit/` with `.test.ts` extension:

```typescript
import { describe, it, expect } from 'vitest';

describe('myFunction', () => {
  it('does something', () => {
    expect(myFunction()).toBe(expected);
  });
});
```

---

## E2E Tests (Playwright)

Browser-based tests for full user flows in `tests/e2e/`.

### Coverage (31 tests + 1 manual)

**Campaign Page Structure:**
- Required page elements (hero, sidebar, progress bar)
- Progress bar data attributes for live-stats.js
- Milestone markers (1/3, 2/3, goal)
- Stretch goal markers

**Tier Cards:**
- Snipcart attributes (id, name, price, url, description)
- Inventory display for limited tiers
- Gated tier locked state and unlock badge
- Disabled states on non-live campaigns

**Support Items:**
- Structure (amount, progress, input, button)
- Input → Snipcart price sync
- Late support data attributes

**Custom Amount:**
- Structure and data attributes
- Input → Snipcart price sync
- Late support attributes

**Homepage & Campaign Cards:**
- Card display and required elements
- Valid campaign links
- Featured tier button attributes

**Snipcart Integration:**
- Script configuration
- POOL_CONFIG for live-stats.js
- Global functions (refreshLiveStats, getTierInventory)

**Cart Flow:**
- Navigation and add-to-cart
- Cart state via Snipcart API
- Billing info update

**Accessibility:**
- Skip link
- Main content landmark
- Accessible button labels
- Form input labels

**Campaign States:**
- Live campaign enabled tiers
- Upcoming campaign disabled tiers
- State indicators in progress meta

**Manual Checkout (skipped in CI):**
- Full pledge flow: Snipcart → billing → custom payment template → Stripe Checkout → success page
- Worker API integration test (automated, checks `/stats` endpoint)

### Running

```bash
npm run test:e2e           # Full suite (auto-starts Jekyll)
npm run test:e2e:quick     # Headed mode (requires running server)
npm run test:e2e:headless  # CI mode (headless)
npm run test:e2e:ui        # Interactive UI mode
```

### Adding Tests

Create files in `tests/e2e/` with `.spec.ts` extension:

```typescript
import { test, expect } from '@playwright/test';

test('user can do something', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.element')).toBeVisible();
});
```

---

## Security Tests (Vitest)

Penetration tests for the Worker API. Located in `tests/security/`.

### Coverage

| Category | Tests |
|----------|-------|
| Auth Bypass | Dev-token bypass, token validation, expiry, tampering |
| Webhook Security | Stripe signature verification, replay attacks |
| Authorization | Admin endpoints, cross-user access, test endpoint guards |
| Input Validation | XSS, injection, overflow, malformed input |
| Rate Limiting | Burst requests, DoS resilience |

### Running

```bash
# Start local Worker first
cd worker && wrangler dev

# In another terminal:
npm run test:security                # Against localhost:8787

# Against staging:
npm run test:security:staging

# Against production (read-only tests):
WORKER_URL=https://pledge.dustwave.xyz PROD_MODE=true npm run test:security
```

### Prerequisites

- Worker running locally (`wrangler dev`) or accessible staging/prod URL
- For full test coverage, set environment variables:
  - `WORKER_URL` — Base URL (default: `http://localhost:8787`)
  - `PROD_MODE` — Skip destructive tests (default: `false`)
  - `ADMIN_SECRET` — For admin auth tests
  - `TEST_TOKEN` — Valid magic link token

See [tests/security/README.md](../tests/security/README.md) for details.

---

## Manual Testing Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install -g wrangler`)
- [Stripe CLI](https://stripe.com/docs/stripe-cli) for webhook testing
- Snipcart account (test mode)
- Stripe account (test mode)
- Resend account (free tier: 3,000 emails/month)

---

## 1. Cloudflare Worker Setup

### Create KV Namespace

```bash
# Login to Cloudflare
wrangler login

# Create KV namespace for votes
wrangler kv:namespace create "VOTES"
# Note the ID it outputs

# For local dev, create a preview namespace
wrangler kv:namespace create "VOTES" --preview
```

### Configure wrangler.toml

Create `worker/wrangler.toml`:

```toml
name = "pledge-worker"
main = "src/index.js"
compatibility_date = "2024-01-01"

[vars]
SITE_BASE = "https://pool.dustwave.xyz"
SNIPCART_API_BASE = "https://app.snipcart.com/api"

# KV binding
[[kv_namespaces]]
binding = "VOTES"
id = "your-production-kv-id"
preview_id = "your-preview-kv-id"

# Secrets (set via wrangler secret put)
# STRIPE_SECRET_KEY
# SNIPCART_SECRET
# MAGIC_LINK_SECRET
# RESEND_API_KEY
```

### Set Secrets

```bash
cd worker

# Generate a random secret for magic links
openssl rand -base64 32

# Set secrets (use test keys!)
wrangler secret put STRIPE_SECRET_KEY
# Paste: sk_test_...

wrangler secret put SNIPCART_SECRET
# Paste: your Snipcart secret API key

wrangler secret put MAGIC_LINK_SECRET
# Paste: the random string you generated

wrangler secret put RESEND_API_KEY
# Paste: re_...
```

### Run Worker Locally

```bash
cd worker
wrangler dev
# Worker runs at http://localhost:8787
```

---

## 2. Resend Setup

### Create Account & API Key

1. Sign up at [resend.com](https://resend.com)
2. Go to **API Keys** → **Create API Key**
3. Name: "The Pool Dev"
4. Permission: "Sending access"
5. Copy the key (starts with `re_`)

### Verify Domain (for production)

1. Go to **Domains** → **Add Domain**
2. Add `dustwave.xyz`
3. Add the DNS records Resend provides
4. Wait for verification

### Test Mode (no domain needed)

For testing, you can send to your own email without domain verification:
- Resend allows sending from `onboarding@resend.dev` in test mode
- Or use your verified personal email

### Test Email Sending

```bash
curl -X POST 'https://api.resend.com/emails' \
  -H 'Authorization: Bearer re_YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "onboarding@resend.dev",
    "to": "your-email@example.com",
    "subject": "Test from The Pool",
    "html": "<p>Magic link test!</p>"
  }'
```

---

## 3. Snipcart Setup (Test Mode)

### Dashboard Configuration

1. Login to [app.snipcart.com](https://app.snipcart.com)
2. Go to **Account** → **API Keys**
3. Copy your **Public Test API Key**
4. Go to **Domains & URLs**
5. Add allowed domains:
   - `127.0.0.1:4000` (local dev)
   - `pool.dustwave.xyz` (production)

### Update Jekyll Config

In `_config.yml`, set your test key:

```yaml
snipcart_api_key: "YOUR_PUBLIC_TEST_API_KEY"
```

### Disable Product Validation (for local testing)

In Snipcart dashboard:
1. Go to **Store configurations** → **Product validation**
2. Toggle OFF "Fetch product details from URL"

This prevents validation errors on localhost.

---

## 4. Stripe Setup (Test Mode)

### Get Test Keys

1. Login to [dashboard.stripe.com](https://dashboard.stripe.com)
2. Toggle to **Test mode** (top right)
3. Go to **Developers** → **API keys**
4. Copy **Secret key** (`sk_test_...`)

### Install Stripe CLI

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Login
stripe login
```

### Forward Webhooks to Local Worker

```bash
# Forward Stripe webhooks to your local Worker
stripe listen --forward-to localhost:8787/webhooks/stripe
# Note the webhook signing secret it outputs (whsec_...)
```

Add the webhook secret to your Worker:
```bash
wrangler secret put STRIPE_WEBHOOK_SECRET
# Paste: whsec_...
```

---

## 5. Full End-to-End Test

### Start All Services

Terminal 1 - Jekyll:
```bash
bundle exec jekyll serve --config _config.yml,_config_development.yml
# Site at http://127.0.0.1:4000
```

Terminal 2 - Worker:
```bash
cd worker
wrangler dev
# Worker at http://localhost:8787
```

Terminal 3 - Stripe CLI:
```bash
stripe listen --forward-to localhost:8787/webhooks/stripe
```

### Update cart.js for Local Testing

Temporarily change the Worker URL in `assets/js/cart.js`:

```js
// For local testing:
const response = await fetch('http://localhost:8787/start', {
```

### Test the Flow

1. **Add to cart**: Go to http://127.0.0.1:4000/campaigns/hand-relations/
   - Click "Pledge $5" on a tier
   - Cart opens with item

2. **Checkout**: Click checkout in Snipcart
   - Fill in test billing info
   - Use Stripe test card: `4242 4242 4242 4242`
   - Any future expiry, any CVC

3. **Stripe Setup**: After Snipcart checkout, you're redirected to Stripe
   - Card is saved (not charged)
   - Redirected to success page

4. **Check email**: You should receive the supporter email with magic links

5. **Test community access**:
   - Click the community link in the email
   - Or use: http://127.0.0.1:4000/community/hand-relations/?dev=1

6. **Test voting**:
   - Vote on a decision
   - Refresh page - your vote should persist

### Stripe Test Cards

| Card Number | Scenario |
|-------------|----------|
| `4242 4242 4242 4242` | Successful payment |
| `4000 0000 0000 3220` | 3D Secure required |
| `4000 0000 0000 9995` | Declined (insufficient funds) |
| `4000 0000 0000 0002` | Declined (generic) |

---

## 6. Testing Individual Components

### Test Magic Link Token

```js
// In browser console on any page with the Worker running
const token = 'YOUR_TOKEN';
fetch(`http://localhost:8787/pledge?token=${token}`)
  .then(r => r.json())
  .then(console.log);
```

### Test Vote API

```bash
# Get vote status
curl "http://localhost:8787/votes?token=YOUR_TOKEN&decisions=poster,festival"

# Cast vote
curl -X POST http://localhost:8787/votes \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR_TOKEN","decisionId":"poster","option":"A"}'
```

### Test KV Locally

```bash
# List keys
wrangler kv:key list --binding VOTES --preview

# Get a value
wrangler kv:key get "results:hand-relations:poster" --binding VOTES --preview
```

---

## 7. Troubleshooting

### "Missing required information" in Snipcart
- Make custom fields optional for testing, or
- Fill in the required field in the cart before checkout

### Webhook not received
- Check Stripe CLI is running and forwarding
- Check Worker logs: `wrangler tail`
- Verify webhook secret is set

### Email not sent
- Check Resend dashboard for errors
- Verify API key is correct
- Check "from" address is verified or use `onboarding@resend.dev`

### Community page shows "Access Denied"
- Use `?dev=1` for local testing without Worker
- Check token cookie: `supporter_hand-relations`

### Votes not persisting
- Check KV binding in wrangler.toml
- Use `--preview` namespace for local dev
- Check Worker logs for errors

---

## 8. Testing Worker Enhancements

### Test Campaign Validation

1. **Build Jekyll to generate campaigns.json:**
   ```bash
   bundle exec jekyll build
   cat _site/api/campaigns.json  # Verify it exists
   ```

2. **Test with live campaign:**
   ```bash
   curl -X POST http://localhost:8787/start \
     -H "Content-Type: application/json" \
     -d '{"orderId":"test-123","campaignSlug":"hand-relations","amountCents":500,"email":"test@example.com"}'
   ```
   Expected: Returns `{"url":"https://checkout.stripe.com/..."}`

3. **Test with invalid campaign:**
   ```bash
   curl -X POST http://localhost:8787/start \
     -H "Content-Type: application/json" \
     -d '{"orderId":"test-123","campaignSlug":"nonexistent","amountCents":500}'
   ```
   Expected: Returns `{"error":"Campaign not found"}`

### Test Stripe Webhook Signature Verification

1. **Ensure Stripe CLI is forwarding webhooks:**
   ```bash
   stripe listen --forward-to localhost:8787/webhooks/stripe
   # Note the whsec_... secret it outputs
   ```

2. **Set the webhook secret:**
   ```bash
   cd worker
   wrangler secret put STRIPE_WEBHOOK_SECRET
   # Paste: whsec_...
   ```

3. **Trigger a test webhook:**
   ```bash
   stripe trigger checkout.session.completed
   ```
   Check Worker logs for "Pledge confirmed" message.

4. **Test invalid signature (should fail):**
   ```bash
   curl -X POST http://localhost:8787/webhooks/stripe \
     -H "stripe-signature: invalid" \
     -d '{"type":"test"}'
   ```
   Expected: `{"error":"Invalid signature"}`

### Test Snipcart Order Metadata

After completing a pledge flow:

1. **Check Snipcart dashboard** → Orders → Your test order
2. **Verify metadata contains:**
   - `stripeCustomerId`
   - `stripePaymentMethodId`
   - `stripeSetupIntentId`
   - `pledgeStatus: "active"`
   - `charged: false`

### Test Pledge Management Endpoints

1. **Get pledge details (requires valid token):**
   ```bash
   # Use token from supporter email
   curl "http://localhost:8787/pledge?token=YOUR_TOKEN"
   ```
   Expected: Returns order details with `canModify`, `canCancel` flags.

2. **Cancel pledge:**
   ```bash
   curl -X POST http://localhost:8787/pledge/cancel \
     -H "Content-Type: application/json" \
     -d '{"token":"YOUR_TOKEN"}'
   ```
   Expected: `{"success":true,"message":"Pledge cancelled"}`

3. **Verify cancellation:**
   - Check Snipcart order status = "Cancelled"
   - Retry cancel: should get `{"error":"Order is already cancelled"}`

### Test Update Payment Method

```bash
curl -X POST http://localhost:8787/pledge/payment-method/start \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR_TOKEN"}'
```
Expected: Returns new Stripe Checkout URL for card update.

### Test Live Stats Endpoint

1. **Get live stats for a campaign:**
   ```bash
   curl http://localhost:8787/stats/hand-relations
   ```
   Expected: Returns `{ pledgedAmount, pledgeCount, tierCounts, goalAmount, ... }`

2. **Verify stats update after pledge:**
   - Make a test pledge
   - Call stats endpoint again
   - Confirm `pledgedAmount` increased

3. **Recalculate stats (admin):**
   ```bash
   curl -X POST http://localhost:8787/stats/hand-relations/recalculate \
     -H "Authorization: Bearer YOUR_ADMIN_SECRET"
   ```

### Test Admin Rebuild Trigger

```bash
curl -X POST http://localhost:8787/admin/rebuild \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"reason":"test-rebuild"}'
```
Expected: Returns `{ success: true }` and triggers GitHub workflow.

---

## 9. Production Checklist

- [ ] Switch Stripe to live keys
- [ ] Switch Snipcart to live API key
- [ ] Remove `127.0.0.1:4000` from Snipcart allowed domains
- [ ] Verify `dustwave.xyz` domain in Resend
- [ ] Deploy Worker: `wrangler deploy`
- [ ] Set up Stripe webhook in dashboard → `https://pledge.dustwave.xyz/webhooks/stripe`
- [ ] Update `cart.js` Worker URL to production
- [ ] Test with a real $1 pledge

---

## 10. Secrets Reference

### GitHub Actions (Repo → Settings → Secrets)
- `STRIPE_SECRET_KEY` — Stripe live secret (sk_...)
- `SNIPCART_SECRET` — Snipcart API key (Basic auth for /api)
- Uses `GITHUB_TOKEN` auto-provided for commits

### Cloudflare Worker (wrangler or dashboard → Variables)
- `STRIPE_SECRET_KEY` — same as above
- `SNIPCART_SECRET` — same as above
- `SNIPCART_API_BASE` — `https://app.snipcart.com/api`
- `SITE_BASE` — `https://pool.dustwave.xyz`
- `MAGIC_LINK_SECRET` — Random 32+ char string for HMAC token signing
- `RESEND_API_KEY` — Resend API key for supporter emails (re_...)
- `ADMIN_SECRET` — Random string for admin API endpoints
- `GITHUB_TOKEN` — (optional) GitHub PAT with `workflow` scope for rebuild triggers

### Cloudflare KV
- **Namespace**: `PLEDGES` — Stores pledge data and aggregated stats
  - Keys: `pledge:{orderId}` → pledge JSON
  - Keys: `email:{email}` → array of order IDs
  - Keys: `stats:{campaignSlug}` → `{ pledgedAmount, pledgeCount, tierCounts }`
- **Namespace**: `VOTES` — Stores community votes
  - Keys: `vote:{campaignSlug}:{decisionId}:{orderId}` → option string
  - Keys: `results:{campaignSlug}:{decisionId}` → JSON `{optionA: count, ...}`

### Snipcart Dashboard
- **Public API key** → in `_includes/snipcart-foot.html`
- **Allowed domains** → include `pool.dustwave.xyz`
- **Email templates** (optional) → mention "pledge (charged later if funded)"

### Stripe Dashboard
- Webhook endpoint = `https://pledge.dustwave.xyz/webhooks/stripe`
  - Events: `checkout.session.completed`
- Product catalog not required; amounts come from Snipcart line items

### Resend Dashboard
- **Domain**: Verify `dustwave.xyz` for sending from `pledges@dustwave.xyz`
- **API Key**: Create key with "Sending access" permission
- Used for: Supporter access emails (magic links to /manage/ and /community/)
- Snipcart handles: Order confirmations, receipts, transactional emails
