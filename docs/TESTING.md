# Testing Guide

This guide covers the test suites and manual testing setup.

## Quick Reference

```bash
npm run test:unit          # Unit tests (Vitest) — ~700ms
npm run test:unit:watch    # Watch mode
npm run test:unit:coverage # With coverage report
npm run test:secrets       # Secret exposure audit for local env files
npm run test:premerge      # Merge-readiness checks for changed Worker logic
npm run test:e2e           # E2E tests (Playwright) — starts Jekyll
npm run test:e2e:headless  # CI mode
npm run test:security      # Security pen tests (Worker must be running)
npm run test:security:staging  # Security tests against a staging worker, if you maintain one
npm test                   # Run all tests
```

---

## Unit Tests (Vitest)

Fast, isolated tests for JS functions in `tests/unit/`.

### Coverage

| Module | Functions Tested |
|--------|-----------------|
| `live-stats.js` | `formatMoney`, `updateProgressBar`, `updateMarkerState`, `checkTierUnlocks`, `checkLateSupport`, `updateSupportItems`, `updateTierInventory` |
| `platform-tip` | Tip sanitization, tip percent derivation, tip amount calculation |
| `pledge-management` | DST-aware deadline enforcement (MST/MDT via Intl), cancel/modify/payment-method validation, pledge status transitions, multi-campaign independence, shipping in pledge records, API response shape |
| `settlement` | Charge aggregation (including shipping fees), payment success/failure, retry flow, dry-run mode, edge cases, batched settlement, campaign pledge index, settlement dispatch, shipping in settlement, cron heartbeat |
| `email-broadcasts` | Diary excerpt extraction (with ellipsis truncation), diary/milestone tracking helpers, milestone checking logic, rate limiting |
| `email-tip` | Tip-aware supporter email breakdowns across confirmation / modified / cancelled / failed / charged emails |
| `votes` | Email-based vote storage/dedup, vote status retrieval, campaign results, result aggregation |

### Running

```bash
npm run test:unit          # Run once
npm run test:unit:watch    # Watch mode for development
npm run test:unit:coverage # Generate coverage report
```

---

## Pre-Merge Regression Runbook

Use this before merging branches that touch checkout, Worker business logic, fulfillment, or broadcast flows.

### Automated Gate

```bash
npm run test:premerge
```

This runs:

- `npm run test:secrets` to verify local env files stay ignored and their secret values do not appear in tracked files or git history
- `node --check` for the changed Worker entrypoints
- Focused regression suites:
  - `tests/unit/worker-business-logic.test.ts`
  - `tests/unit/cart-start-token.test.ts`
  - `tests/unit/snipcart-parsing.test.ts`
  - `tests/unit/worker-ops-integrity.test.ts`
  - `tests/unit/stats-pagination.test.ts`
- Local smoke scripts against the test-only mutable campaign:
  - `scripts/test-worker.sh` for site/Worker contract checks and `/start` fail-closed verification without a real Snipcart session
  - `scripts/smoke-pledge-management.sh` for successful modify/cancel coverage on the local-only mutable campaign
- Full unit suite via `npm run test:unit`
- Security suite via `npm run test:security` against an auto-started local Worker
- Playwright headless E2E via `npm run test:e2e:headless`

The pre-merge script now auto-starts Jekyll with `_config.yml,_config.local.yml` when needed so the local-only `smoke-editable` campaign is available during merge gating, and the Playwright harness uses the same combined config locally.

The dedicated `tests/unit/cart-start-token.test.ts` regression runs the real checkout browser code in jsdom and asserts that the pledge button sends `cartToken` to `/start` when Snipcart does not expose a custom-gateway `publicToken`.

On GitHub, the same gate runs automatically in the `Merge Smoke` workflow for pull requests targeting `main`.

### Secret Audit

Run this before pushing when local secrets have changed, or let `npm run test:premerge` run it automatically:

```bash
npm run test:secrets
```

The audit checks:

- `worker/.dev.vars` remains gitignored and untracked
- non-allowlisted secret values from local env files do not appear in tracked or untracked repo files
- those values do not appear in git history

CI remains safe when `worker/.dev.vars` does not exist; in that case the audit still verifies ignore rules and skips the local value scan.

### Main Branch Comparison

Run the same automated gate on `main` in a clean worktree so the baseline and the patch branch are directly comparable. If `main` predates `test:premerge`, run the equivalent syntax, unit, security, and E2E commands manually there.

```bash
git worktree add ../pool-main-check main
ln -s "$(pwd)/node_modules" ../pool-main-check/node_modules
cd ../pool-main-check
npm run test:premerge
```

If you create the temporary worktree, remove it after comparison:

```bash
cd -
git worktree remove ../pool-main-check
```

### Manual Smoke Checklist

Run these against staging before merge when a staging environment exists. If no staging environment exists for The Pool, run the same checklist locally with `./scripts/dev.sh` and record that exception in the PR/release notes.

1. Start a new checkout on a live test campaign and confirm `/start` returns a Stripe Checkout URL.
2. Complete a pledge and verify the webhook stores the pledge, stats update, and confirmation email path stays healthy.
3. Modify a pledge with tier/support/custom amount changes and verify totals, history, and inventory update correctly.
4. Cancel an uncharged pledge and verify stats and inventory are released correctly.
5. Run settlement dry-run and live-run on seeded pledges, confirming campaigns only mark settled when nothing needs attention.
6. Trigger diary, announcement, and milestone broadcasts on a campaign large enough to cross pagination boundaries.

For checkout or Worker business-logic changes, a smoke pass is still required before merge:

- Prefer staging when available.
- If no staging exists, use the stronger local path:
  - `./scripts/dev.sh`
  - `./scripts/smoke-pledge-management.sh`
  - the operator checklist in [docs/MERGE_SMOKE_CHECKLIST.md](./MERGE_SMOKE_CHECKLIST.md)
  - a PR note explicitly stating that no staging environment exists

For an operator-ready version with exact commands and expected results, use [docs/MERGE_SMOKE_CHECKLIST.md](./MERGE_SMOKE_CHECKLIST.md).

For local rehearsal of pledge management, prefer the `smoke-editable` campaign. It is local-only via `test_only: true`, stays live well past the normal smoke window, and gives `/test/setup` a stable target for modify/cancel coverage.

You can exercise that path end to end with:

```bash
./scripts/smoke-pledge-management.sh
```

### Intentional Behavior Changes

When reviewing results, do not flag these as regressions:

- Magic links are now order-scoped instead of email-scoped.
- `/start` no longer reserves limited inventory before checkout completion.
- Legacy `GET /checkout` is intentionally disabled.

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

### Coverage (40 tests total; 35 run in CI and 5 are skipped/manual/local-only)

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

**Physical Products & Shipping:**
- `_category` custom field (physical/digital) on tier buttons
- Physical tier buttons set `shippable="false"` (Snipcart bypass)
- Digital-only campaigns have no physical category tiers

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
- Billing auto-fill (placeholder data for Snipcart validation)
- Tip slider updates cart totals immediately
- Single-tier campaigns replace the previous tier immediately when a new tier is selected

**Accessibility:**
- Skip link
- Main content landmark
- Accessible button labels
- Form input labels

**Countdown Timers:**
- Pre-rendered values (no "00 00 00 00" flash)
- Timer updates every second

**Campaign States:**
- Live campaign enabled tiers
- Upcoming campaign disabled tiers
- State indicators in progress meta

**Manual Checkout (skipped in CI):**
- Full pledge flow: Snipcart → billing → custom payment template → Stripe Checkout → success page
- Verify checkout order summary preview appears immediately and resolves to tip-aware totals
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
| Webhook Security | Stripe signature verification, duplicate-event handling, shipping address injection, Snipcart request-token verification |
| Authorization | Admin endpoints, cross-user access, test endpoint guards |
| Input Validation | XSS, injection, overflow, malformed input, hasPhysical flag abuse, shipping fee manipulation, additionalTiers/supportItems injection |
| Rate Limiting | Burst requests, DoS resilience |

### Running

```bash
# Start local Worker first
cd worker && wrangler dev

# In another terminal:
npm run test:security                # Against localhost:8787

# Against staging, if you maintain one:
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

Preferred option for local end-to-end testing:

```bash
./scripts/dev.sh
```

This starts Jekyll, the Worker, Stripe CLI forwarding, and writes the matching `STRIPE_WEBHOOK_SECRET` into `worker/.dev.vars`.
It also clears stale processes on ports `4000`, `8787`, and `4040` so the local stack matches the automated smoke/test harness.

Manual fallback:

```bash
# Forward Stripe webhooks to your local Worker
stripe listen --forward-to 127.0.0.1:8787/webhooks/stripe
# Note the webhook signing secret it outputs (whsec_...)
```

Add the webhook secret to your local Worker config:
```bash
printf '\nSTRIPE_WEBHOOK_SECRET=whsec_...\n' >> worker/.dev.vars
# Or edit worker/.dev.vars and replace the existing STRIPE_WEBHOOK_SECRET value
```

---

## 5. Full End-to-End Test

### Start All Services

Preferred:

```bash
./scripts/dev.sh
```

Manual fallback:

Terminal 1 - Jekyll:
```bash
bundle exec jekyll serve --config _config.yml,_config.local.yml --port 4000
# Site at http://127.0.0.1:4000
```

Terminal 2 - Worker:
```bash
cd worker
npx wrangler dev --env dev --port 8787
# Worker at http://127.0.0.1:8787
```

Terminal 3 - Stripe CLI:
```bash
stripe listen --forward-to 127.0.0.1:8787/webhooks/stripe
```

### Test the Flow

1. **Add to cart**: Go to http://127.0.0.1:4000/campaigns/hand-relations/
   - Click "Pledge $5" on a tier
   - Cart opens with item

2. **Checkout**: Click checkout in Snipcart
   - Fill in test billing info
   - Use Stripe test card: `4242 4242 4242 4242`
   - Any future expiry, any CVC
   - Verify the cart shows subtotal + tip + tax + shipping immediately
   - Verify checkout order summary shows the same breakdown without a delayed blank state

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
   ./scripts/dev.sh
   # Or, manually: stripe listen --forward-to localhost:8787/webhooks/stripe
   ```

2. **Set the webhook secret:**
   ```bash
   # scripts/dev.sh does this automatically for worker/.dev.vars
   # Manual setup only if you are not using scripts/dev.sh
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
- **Email templates** → disabled for pledge flows; supporter email is sent by the Worker via Resend

### Stripe Dashboard
- Webhook endpoint = `https://pledge.dustwave.xyz/webhooks/stripe`
  - Events: `checkout.session.completed`
- Product catalog not required; amounts come from Snipcart line items

### Resend Dashboard
- **Domain**: Verify `dustwave.xyz` for sending from `pledges@dustwave.xyz`
- **API Key**: Create key with "Sending access" permission
- Used for: All supporter-facing pledge email (confirmation, manage/community access, diary updates, announcements, charge success, payment failure, cancellations)
- Snipcart transactional pledge emails are disabled
