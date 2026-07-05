# Payment Processor

The Pool uses Stripe as its payment processor, with the Cloudflare Worker as the canonical checkout, pledge, webhook, and settlement boundary. The public site can collect cart intent, but the Worker rebuilds the money shape, creates Stripe sessions, persists pledges, and later charges saved payment methods only when an all-or-nothing campaign succeeds.

This document describes the current implementation from setup through integration. It also folds in relevant fintech engineering practices from Voytek Pitula's [Fintech Engineering Handbook](https://w.pitula.me/fintech-engineering-handbook/) as operating guidance for The Pool.

## Current Model

The Pool is not a stored-value wallet, marketplace ledger, or bank-like balance system. It is a crowdfunding pledge system:

- Supporters save a card through Stripe Checkout in `setup` mode.
- The Worker stores pledge records in Cloudflare KV after Stripe confirms the setup session.
- Cards are not charged at pledge time.
- After the campaign deadline, funded campaigns are settled by creating off-session Stripe PaymentIntents against saved payment methods.
- One multi-campaign checkout fans out into one campaign-scoped pledge record per campaign after confirmation.
- Shipping, tax, and platform tip are charged dollars but do not all count toward campaign funding progress.

Stripe owns card data and PCI-sensitive payment fields. The Pool owns pledge intent, campaign accounting, emails, dashboard reporting, and settlement orchestration.

## Engineering Principles

Payment code should optimize for boring correctness over cleverness.

### No Invented Money

Runtime money values that enter pledge storage, reports, emails, and Stripe requests are represented as integer cents. Campaign authors and config files may use dollars or rates for usability, but Worker records and processor calls should use cents at the boundary.

Rules for new payment code:

- Do not store pledge amounts as floats.
- Pair every amount with its meaning: `subtotal`, `tax`, `shipping`, `tipAmount`, `amount`.
- Keep currency assumptions explicit. The current deployment is USD-oriented; do not silently introduce multi-currency fields.
- Round only at controlled boundaries, then store the rounded cent value.
- Campaign progress uses campaign subtotal, not total charged amount.

### No Lost State

The Worker must be able to explain what happened to a pledge even when an external callback is delayed, duplicated, or retried.

Current state surfaces:

- `pledge:{orderId}` stores the pledge record and `history`.
- `campaign-pledges:{slug}` indexes order IDs for reports, settlement, backfills, and dashboard reads.
- `stats:{slug}` and `tier-inventory:{slug}` are rebuildable projections.
- `stripe-event:{event.id}` prevents duplicate webhook processing.
- `checkout-intent:{orderId}` stores the checkout manifest used to persist bundled checkouts.
- `settlement-job:{slug}` tracks batched settlement progress.
- webhook and performance observability summaries live in `PLEDGES` KV for operator review.

The current system does not maintain a double-entry ledger. If The Pool later holds balances, splits payouts, supports refunds, or handles multi-party money movement, add a true append-only ledger with derived balances instead of extending pledge projections into accounting truth.

### No Blind Trust

The browser, Stripe webhook delivery order, and external API success are all treated as untrusted inputs.

Current controls:

- `/checkout-intent/start` rebuilds totals from first-party cart items, campaign definitions, shipping rules, tax provider output, and configured tip limits.
- Checkout intent tokens are HMAC-signed and short-lived.
- Limited-tier reservation and settlement are serialized through Durable Objects.
- Stripe webhook signatures are verified over the raw request body.
- Stripe calls use idempotency keys where repeat execution could create duplicate money movement.
- Settlement uses deterministic idempotency keys per campaign/supporter charge group.
- Sensitive checkout responses are `private, no-store`.
- Checkout and payment-method POST routes require the trusted site origin.

## Setup

Use the repo-root setup helper whenever possible:

```bash
npm run setup:deploy -- --mode=local
npm run setup:deploy -- --mode=production --dry-run
```

The helper syncs public config into the Worker, creates or reuses KV namespaces, checks provider CLIs where possible, and writes secrets only after confirmation.

### Required Worker Bindings

Production and dev Worker environments need:

- `PLEDGES` KV namespace
- `RATELIMIT` KV namespace
- `CHECKOUT_INTENTS` Durable Object binding
- `TIER_INVENTORY_COORDINATOR` Durable Object binding
- `SETTLEMENT_COORDINATOR` Durable Object binding

`VOTES` is not payment-specific, but most complete deployments also configure it.

### Public Config

These values are non-secret and live in `_config.yml`, then mirror into `worker/wrangler.toml` through `npm run sync:worker-config`:

- `platform.site_url` -> `SITE_BASE`
- `platform.worker_url` -> `WORKER_BASE`
- `platform.timezone` -> `PLATFORM_TIMEZONE`
- `checkout.stripe_publishable_key` -> `STRIPE_PUBLISHABLE_KEY`
- `pricing.sales_tax_rate` -> `SALES_TAX_RATE`
- `pricing.default_tip_percent` -> `DEFAULT_PLATFORM_TIP_PERCENT`
- `pricing.max_tip_percent` -> `MAX_PLATFORM_TIP_PERCENT`
- `tax.*` -> `TAX_*`
- `shipping.*` -> `SHIPPING_*` and `USPS_*`

Stripe publishable keys are browser-visible and may be stored in config or Worker vars. Secret keys and webhook secrets must not be stored in `_config.yml`.

### Required Secrets

Local development secrets live in ignored `worker/.dev.vars`. Production secrets belong in Cloudflare Worker secrets:

```bash
wrangler secret put STRIPE_SECRET_KEY_LIVE
wrangler secret put STRIPE_SECRET_KEY_TEST
wrangler secret put STRIPE_WEBHOOK_SECRET_LIVE
wrangler secret put STRIPE_WEBHOOK_SECRET_TEST
wrangler secret put CHECKOUT_INTENT_SECRET
wrangler secret put MAGIC_LINK_SECRET
wrangler secret put ADMIN_SECRET
wrangler secret put ADMIN_SESSION_SECRET
wrangler secret put RESEND_API_KEY
```

Recommended scoped secrets:

```bash
wrangler secret put ADMIN_SETTLEMENT_SECRET
wrangler secret put ABANDONED_CART_TOKEN_SECRET
wrangler secret put TURNSTILE_SECRET_KEY
```

Optional provider secrets:

```bash
wrangler secret put USPS_CLIENT_SECRET
wrangler secret put ZIP_TAX_API_KEY
```

When a GitHub Actions workflow calls settlement or other protected routes, add the matching scoped secret to GitHub repository secrets too. GitHub repository secrets do not automatically become Worker runtime secrets.

### Stripe Webhooks

Create Stripe webhook endpoints for test and live mode.

Production endpoint:

```text
https://pledge.dustwave.xyz/webhooks/stripe
```

Events:

- `checkout.session.completed`
- `payment_intent.payment_failed`

Copy each endpoint signing secret into the matching Worker secret:

- `STRIPE_WEBHOOK_SECRET_TEST`
- `STRIPE_WEBHOOK_SECRET_LIVE`

For local work, prefer:

```bash
./scripts/dev.sh --podman
```

That path can run the Stripe listener, forward events to `127.0.0.1:8787/webhooks/stripe`, and write the listener's `whsec_...` value into `worker/.dev.vars`.

## Checkout Integration

### 1. Browser Cart

The static site owns the cart UI and stores cart structure. It may collect contact, shipping, billing, tip, and cart selections, but it does not decide final totals.

The browser calls:

```text
POST /checkout-intent/start
```

Important fields include:

- `campaignSlug`
- `items`
- `email`
- `tipPercent`
- `shippingAddress`
- `billingAddress`
- `shippingOption`
- `abandonedCartConsent`

### 2. Worker Canonicalization

The Worker rebuilds the order from trusted inputs:

- campaign tier definitions
- campaign add-ons and platform add-ons
- support items and custom amounts
- campaign state and threshold gates
- limited-tier availability
- shipping presets and USPS/fallback policy
- tax provider result
- configured tip bounds

The resulting checkout manifest stores cent values and a hash of the canonical cart. For limited inventory, the Worker reserves scarce tiers through the per-campaign Durable Object before creating the Stripe session.

### 3. Stripe Setup Session

The Worker creates a Stripe Checkout Session in `setup` mode. The normal path returns a custom on-site checkout bootstrap:

```json
{
  "checkoutUiMode": "custom",
  "sessionId": "cs_test_...",
  "clientSecret": "cs_test_..._secret_...",
  "publishableKey": "pk_test_...",
  "orderId": "pool-intent-..."
}
```

If custom checkout is unavailable because the publishable key is missing, the Worker falls back to a hosted Stripe Checkout URL instead of failing the supporter.

The Stripe session metadata includes order and integrity context such as:

- `orderId`
- `campaignSlug`
- `checkoutProvider`
- `checkoutNonce`
- `checkoutCartHash`
- `amountCents`
- `tipPercent`
- `hasPhysical`
- `preferredLang`

### 4. Completion And Webhook

Stripe sends `checkout.session.completed`. The Worker:

1. Reads the raw request body.
2. Verifies the Stripe signature with the correct webhook secret.
3. Checks `stripe-event:{event.id}` idempotency.
4. Retrieves Stripe session, SetupIntent, customer, and payment method details as needed.
5. Loads the saved checkout manifest.
6. Recomputes the checkout hash and validates the manifest.
7. Persists one `pledge:{orderId}` record per campaign.
8. Updates campaign indexes and projections.
9. Confirms limited-tier reservations.
10. Sends supporter confirmation email through Resend.
11. Deletes or marks transient checkout/reminder state.
12. Marks the Stripe event processed only after persistence succeeds.

This makes duplicate webhooks safe and transient failures retryable.

The custom checkout sidecar also has a guarded recovery path:

```text
POST /checkout-intent/complete
```

That route retrieves the Stripe session and creates the pledge if the webhook was delayed or missed in local development. It is origin-checked, order-scoped, and retry-limited.

## Manage Pledge And Update Card

Supporters manage pledges through order-scoped magic links, not accounts.

Payment method updates call:

```text
POST /pledge/payment-method/start
```

The Worker creates another setup-mode Stripe Checkout Session. In custom mode, the Manage Pledge modal mounts Stripe's secure payment UI on-site. The webhook then updates the stored pledge's customer/payment method IDs.

If the pledge was in `payment_failed` state and the campaign is funded after deadline, the Worker attempts an immediate off-session retry after the new payment method is saved.

## Settlement

Settlement runs only after a campaign deadline has passed in the configured platform timezone and the campaign is funded.

Preferred path:

```text
POST /admin/settle-dispatch/:slug
POST /admin/settle-batch
```

Current behavior:

- `SETTLEMENT_COORDINATOR` locks one campaign at a time.
- `settlement-job:{slug}` tracks batched progress.
- Each batch processes a bounded set of pledge order IDs.
- Active uncharged pledges are grouped by supporter email within the campaign.
- The most recent saved payment method for the supporter/campaign group is used.
- The Worker creates one off-session Stripe PaymentIntent per supporter/campaign group.
- Stripe idempotency keys are deterministic for the campaign/supporter charge group.
- Successful pledges are marked `charged`.
- Failed pledges are marked `payment_failed` and emailed an Update Card link.
- `campaign-charged:{slug}` is written only when no active pledge remains unresolved.

The legacy monolithic settlement route still exists for small/manual cases:

```text
POST /admin/settle/:slug
```

Use `ADMIN_SETTLEMENT_SECRET` for settlement automation when configured. It is narrower than `ADMIN_SECRET`.

## Data Model

### Pledge Record

Pledge money fields are integer cents:

```json
{
  "orderId": "pool-intent-abc123",
  "email": "supporter@example.com",
  "campaignSlug": "hand-relations",
  "subtotal": 5000,
  "tax": 394,
  "shipping": 300,
  "tipPercent": 5,
  "tipAmount": 250,
  "amount": 5944,
  "stripeCustomerId": "cus_...",
  "stripePaymentMethodId": "pm_...",
  "stripeSetupIntentId": "seti_...",
  "pledgeStatus": "active",
  "charged": false,
  "history": [
    {
      "type": "created",
      "subtotal": 5000,
      "tax": 394,
      "shipping": 300,
      "tipAmount": 250,
      "amount": 5944,
      "at": "2026-01-15T12:00:00Z"
    }
  ]
}
```

Charged pledges may also store actual Stripe financial data:

- `stripePaymentIntentId`
- `stripeChargeId`
- `stripeBalanceTransactionId`
- `stripeFinancials.grossAmount`
- `stripeFinancials.feeAmount`
- `stripeFinancials.netAmount`
- `stripeFinancials.source`

Dashboard analytics prefer actual Stripe balance transaction data where present and label estimates when actuals are missing.

### Projection Records

These are useful state, but they are not accounting truth:

- `stats:{slug}`
- `tier-inventory:{slug}`
- `campaign-pledges:{slug}`
- `add-on-inventory-sold:v1`

Use projection drift checks before repair:

```bash
./scripts/check-projections.sh
./scripts/check-projections.sh --podman
```

Or call:

```text
POST /stats/:slug/check
POST /admin/projections/check
```

### What Is Not Stored

The Pool does not store:

- card numbers
- CVV
- raw Stripe payment form contents
- full payment processor ledgers
- permanent balances

The current implementation also does not persist raw Stripe webhook payloads by default. It verifies over the raw body, stores idempotency and observability summaries, and can retrieve Stripe objects again when recovery/backfill is needed. If operational requirements change, add bounded raw-event retention with a PII policy and retention window.

## Operations

### Webhook Observability

Use:

```text
GET /admin/observability/webhooks?days=2
```

Or:

```bash
ADMIN_SECRET=... ./scripts/check-observability.sh --local
```

Review duplicate deliveries, signature failures, mode mismatches, skipped events, and recent outcomes.

### Missed Local Webhook

If local checkout completed in Stripe but no pledge appears:

1. Check Stripe CLI forwarding.
2. Confirm the local `STRIPE_WEBHOOK_SECRET*` matches the running listener.
3. Let the checkout sidecar retry `/checkout-intent/complete`.
4. If needed, recover manually:

```bash
curl -X POST http://localhost:8787/admin/recover-checkout \
  -H 'Authorization: Bearer YOUR_ADMIN_SECRET' \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"cs_test_..."}'
```

### Stripe Financial Backfill

For older charged pledges missing balance transaction details, super admins can use:

```text
POST /admin/analytics/stripe-financials/backfill
```

The backfill uses campaign pledge indexes and grouped Stripe PaymentIntent lookups. It should not scan the entire KV namespace during normal operation.

### Reconciliation Checklist

Before and after settlement:

- Confirm the campaign is past deadline in `PLATFORM_TIMEZONE`.
- Run settlement dry-run when possible.
- Check projection drift.
- Review webhook observability.
- Check `payment_failed` rows and supporter retry emails.
- Backfill Stripe financials when analytics need actual fee/net values.
- Compare dashboard Reports CSVs with pledge/fulfillment script output for high-stakes fulfillment work.

## Testing

Fast local checks:

```bash
npm run test:unit
npm run test:security
```

Payment-focused checks:

```bash
npm run release:payment-smoke -- --no-dev-vars
npx vitest run \
  tests/unit/checkout-intent.test.ts \
  tests/unit/settlement.test.ts \
  tests/unit/worker-business-logic.test.ts \
  tests/unit/worker-ops-integrity.test.ts
```

Local full-flow helpers:

```bash
./scripts/dev.sh --podman
./scripts/test-checkout.sh --podman
./scripts/smoke-pledge-management.sh --podman
./scripts/check-projections.sh --podman
```

For local release evidence that exercises mutable pledge paths without sending email:

```bash
PAYMENT_SMOKE_ALLOW_MUTATION=1 \
PAYMENT_SMOKE_WORKER_URL=http://127.0.0.1:8787 \
PAYMENT_SMOKE_SITE_URL=http://127.0.0.1:4000 \
POOL_EMAIL_DRY_RUN=true \
npm run release:payment-smoke -- --local-mutation
```

The payment smoke refuses production Pool hosts for mutation evidence unless `PAYMENT_SMOKE_ALLOW_PRODUCTION=1` is explicitly set.

Manual Stripe test cards:

- success: `4242 4242 4242 4242`
- 3D Secure: `4000 0000 0000 3220`
- declined/failed cards: use the current Stripe test-card catalog

For processor behavior, prefer Stripe test mode and the Stripe CLI over hand-built webhook payloads. Sandboxes are useful, but they are not a replacement for signature verification, idempotency tests, and recovery/reconciliation checks.

## Related Docs

- [WORKFLOWS.md](./WORKFLOWS.md)
- [SECURITY.md](./SECURITY.md)
- [TESTING.md](./TESTING.md)
- [DASHBOARD.md](./DASHBOARD.md)
- [EMAIL.md](./EMAIL.md)
- [worker/README.md](../worker/README.md)
