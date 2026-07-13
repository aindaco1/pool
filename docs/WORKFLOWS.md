# Workflows

The Pool uses a **no-account, email-based pledge management system**. Backers save a payment method through Stripe in The Pool's on-site payment step, manage pledges via order-scoped magic links, and are only charged if the campaign is funded.

For setup, processor operations, and reconciliation, use [PAYMENT_PROCESSOR.md](./PAYMENT_PROCESSOR.md). For classified snapshots, recovery ordering, and restore gates, use [BACKUP_RESTORE.md](./BACKUP_RESTORE.md). For sender setup, email types, localization, and delivery behavior, use [EMAIL.md](./EMAIL.md).

## Key Differentiators

- **No accounts** — Email + payment info only (no registration)
- **Magic link management** — Cancel, modify, or update payment method via an order-scoped email link
- **All-or-nothing** — Cards saved now, charged only if goal is met
- **Optional platform tip** — 0% to 15% The Pool tip (default 5%) added to totals but excluded from campaign progress
- **Worker-owned email** — All supporter email comes from Resend
- **Film-focused** — Designed for creative crowdfunding

---

## Campaign State Machine

```
upcoming → live → post
```

| State | UX | Actions |
|-------|-----|---------|
| `upcoming` | Buttons disabled, "Coming soon" | Countdown to launch, optional one-time launch reminder signup |
| `live` | Pledge buttons active | Cards saved via The Pool's on-site Stripe payment step |
| `post` | Campaign closed | Charges processed (if funded) |

---

## System Components

| Component | Role |
|-----------|------|
| **First-party cart** | Browser-owned cart UI and checkout review state |
| **Stripe** | Checkout Sessions in setup mode (custom on-site payment step) + PaymentIntents (charge later) |
| **Cloudflare Worker** | Backend: checkout, webhooks, pledge storage (KV), combined live reads, stats, auto-settle scheduler |
| **Jekyll** | Static pages + campaign markdown |
| **Admin dashboard** | Private browser workspace for settings, campaigns, add-ons, reports, analytics, supporters, marketing links, and users |

---

## Pledge Lifecycle

```
1. BROWSE     → Visitor views campaign, adds tier to the first-party cart, adjusts optional tip
2. REVIEW     → First-party cart drawer shows pledge review, tip state, and immediate pricing
3. START      → Worker canonicalizes the cart via `/checkout-intent/start`, reserves scarce tiers when needed, and creates a setup-mode Stripe Checkout Session
4. SAVE CARD  → The existing checkout sidecar keeps the visitor on-site, mounts secure Stripe payment UI, and saves the payment method (no charge)
5. CONFIRM    → Stripe confirms the setup, then Worker persists one pledge per campaign in KV, sends campaign-specific supporter email(s), and refreshes live campaign reads before success UX completes
6. MANAGE     → Backer uses magic link to cancel/modify/update card
7. DEADLINE   → Worker scheduler checks campaigns after midnight in the platform timezone
8. CHARGE     → If funded + deadline passed: aggregate by email within each campaign, charge once per supporter per campaign, and store actual Stripe fee/net data when Stripe returns balance transaction details
9. COMPLETE   → Update pledge_status to 'charged' or 'payment_failed'
```

---

## Pledge Storage (Cloudflare KV)

Pledges are stored in Cloudflare KV. Key patterns:

| Key | Contents |
|-----|----------|
| `pledge:{orderId}` | Full pledge data (email, amount, tier, Stripe IDs, status, history) |
| `email:{email}` | Array of order IDs for that email |
| `stats:{campaignSlug}` | Aggregated totals (pledgedAmount, pledgeCount, tierCounts, supportItems) |
| `tier-inventory:{campaignSlug}` | Claim counts for limited tiers |
| `campaign-pledges:{campaignSlug}` | Campaign-scoped pledge index for reports, settlement, rebuilds, and admin reads |
| `pending-extras:{orderId}` | Temporary storage for support items/custom amount during checkout |
| `pending-tiers:{orderId}` | Temporary storage for additional tiers when Stripe metadata would be too large |
| `checkout-intent:{orderId}` | Canonicalized checkout payload used to fan bundled checkout into campaign-scoped pledges |
| `launch-reminder:{campaignSlug}:{emailHash}` | Upcoming-campaign reminder signup and opt-in metadata |
| `launch-reminder-suppressed:{campaignSlug}:{emailHash}` | Campaign-scoped reminder unsubscribe marker |
| `launch-reminder-sent:{campaignSlug}:{emailHash}` | Launch reminder send idempotency marker |
| `launch-reminder-dispatch:{campaignSlug}` | Bounded dispatch job cursor for a campaign that just became live |
| `launch-reminder-dispatch-queue:v1` | Queue-state marker that lets idle launch reminder scheduled ticks skip dispatch list scans |
| `abandoned-cart:{orderId}` | Explicitly opted-in abandoned-checkout reminder record |
| `abandoned-cart-resume:{orderId}` | Short-lived signed-link checkout resume snapshot created only after a reminder sends |
| `abandoned-cart-queue:v1` | Queue-state marker that lets idle abandoned-checkout scheduled ticks skip namespace scans |
| `abandoned-cart-sent:{emailHash}:{campaignSetHash}` | Abandoned-checkout send idempotency marker |
| `abandoned-cart-suppressed:{emailHash}` | Abandoned-checkout unsubscribe marker |
| `abandoned-cart-suppressed-campaign:{campaignSlug}:{emailHash}` | Admin-managed campaign-scoped reminder suppression marker |
| `abandoned-cart-health:v1` | Aggregate abandoned-checkout queue/outcome counters for campaign-scoped health views |
| `supporter-email-retry:{orderId}` | Queued supporter confirmation email retry payload |
| `supporter-email-retry-queue:v1` | Queue-state marker with the next due supporter email retry time |
| `add-on-inventory-sold:v1` | Sold-count projection for platform add-on inventory |
| `admin-users:v1` | Runtime dashboard users saved from **Settings -> Users** |
| `admin-marketing-referrals:{campaignSlug}` | Saved referral code and QR source metadata for the dashboard Marketing tab |
| `admin-marketing-draft:{campaignSlug}:{surface}` | Explicit shared Marketing/Blast draft with 7-day TTL and revision conflict protection |

Scarce-tier reservations and committed claim state now live in the per-campaign Durable Object coordinator rather than KV. `tier-inventory:{campaignSlug}` remains the public projection used by `/inventory/:slug` and `/live/:slug`.

**Pledge record:**
```json
{
  "orderId": "pledge-1234567890-abc123",
  "email": "backer@example.com",
  "campaignSlug": "hand-relations",
  "tierId": "producer-credit",
  "tierQty": 1,
  "additionalTiers": [{ "id": "frame-slot", "qty": 2 }],
  "supportItems": [{ "id": "location-scouting", "amount": 50 }],
  "customAmount": 25,
  "tipPercent": 5,
  "tipAmount": 250,
  "subtotal": 5000,
  "tax": 394,
  "shipping": 300,
  "amount": 5944,
  "shippingAddress": { "name": "Jane Doe", "address1": "123 Main St", "city": "Albuquerque", "province": "NM", "postalCode": "87101", "country": "US" },
  "stripeCustomerId": "cus_xxx",
  "stripePaymentMethodId": "pm_xxx",
  "pledgeStatus": "active",
  "charged": false,
  "history": [
    { "type": "created", "subtotal": 5000, "tax": 394, "shipping": 300, "tipPercent": 5, "tipAmount": 250, "amount": 5944, "tierId": "producer-credit", "tierQty": 1, "customAmount": 25, "at": "2026-01-15T12:00:00Z" }
  ]
}
```

**Support items and custom amounts:**
- `supportItems` — Array of `{ id, amount }` for production phase contributions
- `customAmount` — Dollar amount for "no reward" custom support additions
- `additionalTiers` — Array of `{ id, qty }` for multi-tier pledges (when `single_tier_only: false`)
- `tipPercent` / `tipAmount` — Optional The Pool platform tip stored separately from campaign subtotal
- Bundled multi-campaign checkouts are persisted as separate pledge records, one per campaign
- Add-on variants may override their product base price. The Worker resolves current catalog prices for new or changed selections, while an unchanged persisted product/variant retains its saved `bundleAddOns.unitPrice` through quantity-only edits; reports and emails use that historical saved value.

**History entries:**
Each history entry tracks a pledge event with full context:
- `type` — `created`, `modified`, or `cancelled`
- `subtotal` / `subtotalDelta` — Pre-tax amount (or delta for modifications)
- `tipAmount` / `tipAmountDelta` — Platform tip amount (or delta)
- `tipPercent` — Selected tip percentage after this event
- `tax` / `taxDelta` — Tax amount (or delta)
- `amount` / `amountDelta` — Total with tax + shipping + tip (or delta)
- `shipping` / `shippingDelta` — Stored shipping amount (or delta, including live-quote, fallback, or free-shipping changes)
- `tierId`, `tierQty`, `additionalTiers` — Tier state after this event
- `customAmount` — Custom support amount (if present)
- `at` — ISO timestamp

**Status values:** `active`, `cancelled`, `charged`, `payment_failed`

Charged pledges can also carry Stripe financial metadata:

- `stripePaymentIntentId`
- `stripeChargeId`
- `stripeBalanceTransactionId`
- `stripeFinancials.source`
- `stripeFinancials.grossAmount`
- `stripeFinancials.feeAmount`
- `stripeFinancials.netAmount`

Dashboard Analytics prefers those actual fee/net values for charged pledges and falls back to estimates only for active pledges or older charged rows that have not been backfilled.

---

## Magic Link Tokens

Stateless HMAC-signed tokens (no database needed):

**Payload:**
```json
{
  "orderId": "pool-intent-abc123",
  "email": "backer@example.com",
  "campaignSlug": "hand-relations",
  "exp": 1754000000
}
```

**Token format:** `base64url(payload).base64url(HMAC-SHA256(payload, secret))`

**Verification:**
1. Decode and verify signature
2. Check expiry
3. Resolve the authorized `orderId`
4. Fetch pledge from KV and cross-check email + campaign

Each token only authorizes its own order. A valid link no longer grants email-wide access to every pledge on the same address, and a valid token without a real backing pledge now fails closed instead of returning a synthetic placeholder.

## Supporter Trust Boundaries

The pledge lifecycle should remain understandable to a supporter who never reads the code. Use [ETHICAL_RISK.md](./ETHICAL_RISK.md) when a workflow change affects data collection, money, reminders, campaign visibility, admin power, or public sharing.

Trust-sensitive workflow rules:

- Browser UI can preview and explain state, but the Worker must canonicalize money, inventory, permissions, and persistence.
- Supporters should be able to distinguish estimated vs final tax/shipping, draft vs committed pledge state, active vs closed campaigns, and reminder signup vs required checkout steps.
- Email reminders and campaign updates should be opt-in or pledge-scoped, deduped, suppressible where appropriate, and sent through dry-run-aware paths.
- Private, tokenized, preview, admin, and supporter-only routes should not become indexable, prefetched, or share-card targets.
- Bulk or automated workflows should have bounded batches, audit records, idempotency, and operator evidence before live sends or mutations.

---

## Worker API Routes

### `POST /checkout-intent/start`
Create a setup-mode Stripe Checkout Session from the first-party cart state for the on-site payment step.

The complete payment processor integration, including setup-mode checkout, webhook persistence, recovery, settlement, and Stripe financial backfill, is documented in [PAYMENT_PROCESSOR.md](./PAYMENT_PROCESSOR.md).

**Request:**
```json
{
  "campaignSlug": "hand-relations",
  "items": [
    { "id": "hand-relations__producer-credit", "quantity": 1 }
  ],
  "tipPercent": 5
}
```
**Response:**  
- custom mode: `{ checkoutUiMode, sessionId, clientSecret, publishableKey, orderId }`
- hosted fallback: `{ checkoutUiMode: "hosted", url }`

If custom checkout is selected but the current environment does not have a Stripe publishable key, the Worker uses the hosted fallback response instead of failing the checkout start.

**Data flow:**
1. Cart.js passes the selected tip percent plus the current first-party cart items
2. Worker reconstructs the cart shape from first-party items and canonical campaign rules
3. Worker validates campaign state, single-tier rules, threshold gates, and scarce-tier availability
4. For limited tiers, Worker reserves scarce inventory through the per-campaign coordinator, then stores any overflow tier/support-item metadata in temp KV (`pending-tiers:*`, `pending-extras:*`) and creates a setup-mode Stripe Checkout Session
5. In custom UI mode, the existing second checkout sidecar mounts secure Stripe payment UI on-site; physical checkouts also capture shipping details during that step
6. Worker treats webhook persistence as the source of truth, with a first-party recovery path available for local or delayed-completion cases so the sidecar does not claim success before the pledge is actually persisted
7. On persistence, Worker fetches any temp metadata, extracts shipping details from Stripe, computes `subtotal + tax + shipping + tip`, persists one pledge per campaign, and confirms any held limited-tier reservations through the per-campaign Durable Object coordinator
8. After persistence succeeds, the client invalidates campaign live-stat caches and writes a short-lived refresh marker so restored tabs and follow-up page loads fetch fresh totals

Limited-tier availability decisions now come from the coordinator's reservation-aware state on write paths, while `/inventory/:slug` and `/live/:slug` continue reading the public KV projection only.

The Worker does not trust client-submitted tier names, quantities, support-item amounts, or `amountCents`. `/checkout-intent/start` now reserves scarce inventory before the payment step completes, and persistence confirms those reservations. Older campaigns do not need a migration job because claimed inventory can rebuild from pledge truth, and successful persistence can still fall back to a fresh coordinator claim if no preexisting reservation exists.

## Content Rendering Safety

- Long-form campaign text is sanitized before Markdown rendering and then post-processed to neutralize unsafe link schemes.
- Structured embeds are only rendered when their `src` resolves to an exact approved provider origin/path.
- Campaign-content audits still protect `_campaigns/*.md`, but the render layer enforces the same rules so forks and future content sources do not rely on audits alone.

### `POST /webhooks/stripe`
Handle `checkout.session.completed`:
- Extract `payment_method` and `customer` from SetupIntent
- Fetch `supportItems`, `customAmount`, and additional tiers from temp KV when needed
- Store one pledge per campaign in KV with status `active` (includes support items, custom amount, shipping fee, tip, and shipping address)
- Update live stats (pledgedAmount, tierCounts, supportItems)
- Confirm held limited-tier reservations, or claim through the serialized coordinator if the pledge predates reservation-aware checkout start
- Generate magic link token
- Send campaign-specific supporter confirmation email(s)

Webhook idempotency is committed only after successful pledge persistence so transient failures can retry safely.

### `GET /pledges?token=...`
Read the pledge collection available to a magic link session.

**Current behavior:** a token returns only its own authorized order.

### `GET /pledge?token=...`
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

### `POST /pledge/cancel`
Cancel an active pledge.

**Request:** `{ token }`  
**Validation:**
- Rejects if pledge is charged
- Rejects if campaign deadline has passed

**Actions:**
1. Mark pledge as cancelled in KV, update stats, release tier inventory
2. Send cancellation confirmation email
3. If no remaining active pledges for this email/campaign → clear `email:{email}` mapping from KV (revokes community access)

### `POST /pledge/modify`
Change tier or amount.

**Request:** `{ token, orderId, ...changes }`
**Validation:**
- Rejects if pledge is charged
- Rejects if campaign deadline has passed (via `isCampaignLive` check)
- Rejects if `orderId` does not match the token's authorized order
- Rebuilds totals from stored pledge state plus campaign definitions instead of trusting client money fields

**Action:** Update pledge in KV, adjust stats delta, swap tier inventory

### `POST /pledge/payment-method/start`
Update saved payment method.

**Request:** `{ token }`  
**Response:**  
- custom mode: `{ checkoutUiMode, sessionId, clientSecret, publishableKey }`
- hosted fallback: `{ checkoutUiMode: "hosted", url }`

**Data flow:**
1. Manage Pledge validates the magic-link token and active pledge state
2. Worker creates a setup-mode Stripe Checkout Session for payment-method refresh
3. In custom mode, the existing Update Card modal mounts Stripe's secure payment UI on-site
4. Worker keeps webhook persistence as the source of truth, with the same guarded completion-recovery path available for delayed local webhook delivery
5. On success, the pledge record updates to the newly saved payment method and `payment_failed` retries can charge again immediately

### `GET /stats/:campaignSlug`
Get live pledge statistics for a campaign.

### `GET /live/:campaignSlug`
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

### `POST /stats/:campaignSlug/recalculate`
Recalculate stats from all pledges in KV (admin only).

**Headers:** `Authorization: Bearer ADMIN_SECRET`

### `POST /admin/rebuild`
Trigger a GitHub Pages rebuild (for state transitions).

**Headers:** `Authorization: Bearer ADMIN_SECRET`  
**Request:** `{ "reason": "campaign-state-change" }` (optional)

### `POST /admin/marketing/announcement`
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

### Marketing dashboard helpers

Referral and UTM performance lives in `GET /admin/analytics`, which reads campaign pledge indexes and returns referral plus UTM source/medium/campaign/content breakdowns without listing pledge truth. Missing campaign indexes produce a non-blocking Analytics notice instead of a Marketing-tab failure.

`GET /admin/marketing/draft?campaignSlug=...&surface=marketing|blast`, `POST /admin/marketing/draft`, and `DELETE /admin/marketing/draft` load, save, and clear explicit shared drafts. Draft writes are campaign-scoped, expire after 7 days, and carry a revision token so stale saves return a conflict.

`GET /admin/media/library?campaignSlug=...` lists existing campaign images for WYSIWYG image blocks. Campaign users see only assigned campaign media; super admins can also choose shared/default images. The picker reads GitHub directories and does not create KV state.

`GET /admin/abandoned-checkout/health?campaignSlug=...` reads aggregate abandoned-checkout reminder health without KV list operations. Admin-created suppression outcomes include the suppressed email so the dashboard can show and clear those rows. `POST` and `DELETE /admin/abandoned-checkout/suppression` explicitly set or clear campaign-scoped reminder suppressions with CSRF, hashed email identifiers, audit events, and bounded KV writes. Signed reminder resume links read `abandoned-cart-resume:{orderId}` and restore a sanitized browser checkout snapshot so supporters can start a fresh Stripe session from the same campaign/cart context.

### `POST /admin/broadcast/announcement`
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

### Browser Admin Dashboard

The private dashboard is available at `/admin/` and `/es/admin/`. It uses magic-link sign-in and a cookie-backed Worker session; browser code never receives `ADMIN_SECRET`.

Primary flows:

- Dashboard summary, analytics, reports, supporters, content loads, and content previews are read-only browsing flows.
- Campaign content/settings and platform settings/add-ons publish through Worker validation and GitHub-backed commits.
- Super-admin **Create new campaign** writes a preview-only campaign Markdown file locally in dev or through the GitHub-backed path in production, optionally saves multiple new campaign users to `admin-users:v1`, emails assigned users the admin dashboard link, and keeps the campaign hidden from public routes until launch.
- Campaign **Preview** publishes protected preview flags through GitHub, stores the publishing admin plus optional reviewer emails only in a 24-hour `campaign-preview-reviewers:{slug}` KV allowlist, returns a dashboard-visible 24-hour link for the publishing admin, sends signed 24-hour links to optional reviewers, and serves private/no-store preview payloads through `/admin/campaign-preview/:slug`.
- Super-admin **Archive campaign** is available only for non-live campaigns. The Worker validates role, CSRF, campaign slug, and effective state, then archives directly in the mounted repo for local dev or dispatches `.github/workflows/archive-campaign.yml` in production; the archive move writes `archive-manifest.json` and keeps campaign source/media under `archive/campaigns/<slug>/`.
- **Settings -> Users** saves directly to Worker KV at `admin-users:v1`.
- Saved referral codes and shared Marketing/Blast drafts save to campaign-scoped KV only when explicitly saved or cleared.
- **Analytics** attribution reporting and **Marketing** abandoned-checkout health read indexed/aggregate data without KV namespace scans.
- **Reports** previews pledge/fulfillment rows and downloads CSVs; it does not send email and does not mark reports as sent.
- **Analytics** uses stored actual Stripe fee/net data when available and exposes a super-admin backfill for older charged pledges.
- Content-editor media uploads stage files locally, upload on publish or Blast send, and commit source-preserved assets through the GitHub-backed path; image/video uploads then request the `Optimize dashboard media` workflow with `scope=changed` for image compression, responsive WebP variants (`320w`, `480w`, `640w`, `960w`, `1600w`), and video derivatives. Image blocks can also choose existing campaign images from a scoped read-only media picker. Publish also deletes same-campaign dashboard-owned media that disappeared from content blocks or removed diary entries and is not referenced elsewhere in the campaign.
- **Secrets & credentials** reports configured/missing status only; it does not expose or store secret values.

Report preview/download endpoints used by the dashboard:

```bash
curl "http://localhost:8787/admin/reports/campaign-runner/preview?campaignSlug=hand-relations&reportType=pledge"
```

```bash
curl "http://localhost:8787/admin/reports/campaign-runner.csv?campaignSlug=hand-relations&reportType=fulfillment"
```

For authenticated browser use these endpoints require the dashboard session cookie and CSRF/origin protections where applicable. Script-driven admin endpoints that use Bearer secrets remain separate from the browser dashboard contract. Settlement routes can require `ADMIN_SETTLEMENT_SECRET`, and broadcast/diary/milestone routes can require `ADMIN_BROADCAST_SECRET`; if a scoped secret is not configured, the route falls back to `ADMIN_SECRET`. Set scoped secrets in Cloudflare Worker secrets for runtime enforcement, and add matching GitHub repository secrets only for Actions or operator workflows that call those endpoints.

Stripe financials backfill for super admins:

```bash
curl -X POST "http://localhost:8787/admin/analytics/stripe-financials/backfill" \
  -H 'Content-Type: application/json' \
  -H 'x-pool-admin-csrf: <dashboard-csrf-token>' \
  --cookie "pool_admin_session=<session-cookie>" \
  -d '{"campaignSlug":"hand-relations","dryRun":true}'
```

The backfill uses `campaign-pledges:{slug}` indexes and grouped PaymentIntent lookups, not KV namespace scans.

### `POST /admin/recover-checkout`
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

## Front-End Pages

### `/campaigns/:slug/`
Campaign detail with tier buttons → first-party cart drawer

### `/campaigns/:slug/pledge-success/`
Post-persistence success page with confirmation + manage link

### `/campaigns/:slug/pledge-cancel/`
User left the payment step before completion (not the pledge itself)

### `/manage/`
Magic link landing page for pledge management:
- Reads `?t=...` token
- Fetches pledge details from Worker
- Shows pledge cards with state-dependent UI
- Groups projects into **Active** and **Closed** sections
- Sorts active cards with the most recent campaigns first
- Displays full breakdown: subtotal, optional The Pool tip, configured sales tax, and stored shipping amount for the pledge, plus total
- Reads pricing labels and rates from shared config so cart UI, Worker totals, emails, and reports stay aligned for forks

**Pledge card states:**

| Status | UI Treatment |
|--------|-------------|
| `active` | Full edit controls (tier selection, support items, cancel button) |
| `active` + deadline passed | Locked badge + locked notice, read-only pledge controls, "Update Card" only |
| `charged` | Muted card, "✓ Successfully charged on {date}" notice |
| `payment_failed` | Warning notice with "Update Payment Method" button |
| `cancelled` | "This pledge has been cancelled" notice |

**Shipping in modify flow:** When a supporter changes tiers or physical support items, the manage page dynamically recalculates shipping. Physical selections can use USPS-backed live quotes, configured fallback rates, free-shipping overrides, and limited domestic signature-option upgrades. The confirmation modal shows the updated shipping and total before the user confirms.

**Tip in modify flow:** The manage page exposes the same 0% to 15% tip slider. During live campaigns, supporters can adjust it and see subtotal / tip / tax / shipping / total update immediately. Once the deadline passes, the tip slider becomes read-only along with the rest of the pledge controls.

**Dev mode:** Add `?dev` to URL for mock pledge data testing

### `/community/:slug/`
Supporter-only community page:
- Always verifies with Worker API (doesn't trust cookies alone)
- On success: Sets a non-sensitive `supporter_{slug}` cookie for UX optimization and stores the raw bearer token only in `sessionStorage`
- On failure (cancelled pledge, expired token): Clears session token state, shows access denied CTA
- Shows voting/polling decisions exclusive to backers
- `/votes` API returns 403 for cancelled pledges (double-checks access)
- `/votes` only accepts campaign-defined decision IDs and campaign-defined option values
- Closed decisions stay readable but reject new votes
- Votes are keyed by **email** (not orderId) — supporters with multiple pledges still get one vote per decision

---

## Charging Flow (Worker Cron)

The Worker has a minute-level scheduled trigger. Daily lifecycle work is gated to a small midnight window in the configured platform timezone and claimed once per local date:

```toml
# wrangler.toml
[triggers]
crons = ["* * * * *"]
```

**What it does:**

1. Records an hourly heartbeat (`cron:lastRun` in KV) so the minute-level scheduler does not burn the free KV write budget
2. Lists all campaigns with `goal_deadline` and `goal_amount`
3. Drains queued launch reminder dispatch jobs in bounded batches only when queue state says work is pending
4. Queues one launch reminder dispatch job when an upcoming campaign becomes live
5. For each campaign where deadline has passed in the platform timezone, goal is met, and `campaign-charged:{slug}` is not set:
   - Dispatches batched settlement via `POST /admin/settle-dispatch/:slug`
6. Triggers GitHub Pages rebuild if any campaign state transitions detected

The scheduler is intentionally free-tier-aware. Launch reminder dispatch and supporter confirmation email retry queues each keep a small queue-state key. When a queue is known idle, scheduled runs skip the corresponding KV namespace list operation and rely on an hourly idle recheck for compatibility with manually inserted jobs. When real work is queued, the write path marks that queue pending immediately so the next scheduled run can process it without waiting for the compatibility recheck.

**Settlement dispatch (self-chaining batches):**

The `settle-dispatch` endpoint handles the actual charging in batches to stay within CF Worker's 50 subrequest limit:

1. Claims the campaign's `SETTLEMENT_COORDINATOR` Durable Object lock
2. Reads the campaign pledge index (`campaign-pledges:{slug}` in KV)
3. Initializes a settlement job (`settlement-job:{slug}`) tracking progress
4. Processes 6 pledges from the same campaign per batch via `POST /admin/settle-batch`
5. Self-invokes for the next batch until all pledges are processed, forwarding the same lock owner
6. Each batch is a separate Worker invocation with its own subrequest budget
7. **Aggregates pledges by email** — each supporter gets ONE charge per campaign
8. Uses a deterministic Stripe idempotency key per campaign/supporter charge group
9. On completion, sets `campaign-charged:{slug}` only when no active pledge still needs attention

**Campaign pledge index:**

A per-campaign array of order IDs (`campaign-pledges:{slug}`) is maintained automatically:
- Added on pledge creation (webhook) and recovery (`/admin/recover-checkout`)
- Removed on pledge cancellation
- Can be rebuilt: `POST /admin/campaign-index/rebuild/:slug`
- Stats and inventory recalculation now also repair stale indexes if the stored array no longer matches the active pledge records
- Drift can now be checked without mutation via `POST /stats/:slug/check` or `POST /admin/projections/check`

**Key behaviors:**
- Cancelled pledges are never charged
- Multiple pledges from same email = one aggregated charge (subtotals + shipping + tax + tip summed)
- Multi-campaign carts remain supported because checkout persistence creates one pledge record per campaign; settlement locks and batches are campaign-scoped and reject mixed-campaign batches
- Uses the most recently updated payment method for each supporter
- Already-charged pledges are safely skipped (idempotent)
- Can be triggered manually via `POST /admin/settle-dispatch/:slug` with `ADMIN_SETTLEMENT_SECRET` when configured, otherwise `ADMIN_SECRET`
- Legacy monolithic settle still available: `POST /admin/settle/:slug`; it uses the same campaign lock and Stripe idempotency key path, but `settle-dispatch` is preferred for large campaigns
- Cron heartbeat: check via `GET /admin/cron/status`

### Payment Failure & Retry

When a charge fails during settlement:

1. **Pledge marked `payment_failed`** with error message stored
2. **Email sent** with "Update Payment Method" button linking to manage page
3. **Supporter updates card** via `/pledge/payment-method/start`
4. **Auto-retry charge** happens immediately after successful payment method update
5. If retry succeeds: pledge marked `charged`, success email sent
6. If retry fails again: pledge stays `payment_failed`, can retry again

This allows supporters to fix expired/declined cards without manual admin intervention.

---

## Email Architecture

This section summarizes pledge-related email behavior. The complete Resend setup and email-type reference lives in [EMAIL.md](./EMAIL.md).

| Provider | Purpose |
|----------|---------|
| **Resend** | All supporter emails (confirmation, milestones, diary updates, announcements, charge success, payment failed) |

The Worker handles all pledge-related email via Resend.

In production, callers enqueue a durable `email-outbox:v1:*` record instead of waiting on Resend. The scheduler freezes the rendered payload on first attempt, sends it with a deterministic provider idempotency key, and keeps pledge truth independent from notification retry. Test sends, dry-run rendering, and admin login links remain immediate. Signed Resend events at `POST /webhooks/resend` update minimal delivery state and hashed suppression; Pool does not sync pledge audiences into Resend Contacts or Broadcasts.

Diary, milestone, and live announcement mail includes a campaign-scoped RFC 8058 one-click unsubscribe URL. Suppression is checked immediately before provider delivery. Payment and pledge lifecycle mail remains transactional.

### Resend Integration (Worker)

The Worker sends supporter emails after Stripe webhook confirms the setup-mode session. The sender domain must be authorized for the configured Resend API key; for this deployment, pledge confirmations use `The Pool <pledges@pool.dustwave.xyz>` because `pool.dustwave.xyz` is the authorized sending domain.

```js
// In Worker: POST /webhooks/stripe handler
async function sendSupporterEmail(env, { orderId, email, campaignSlug, campaignTitle, amount, token }) {
  return enqueueEmailOutbox(env, {
    kind: 'supporter',
    campaignSlug,
    dedupeKey: `supporter-confirmation:${orderId}`,
    payload: { email, campaignSlug, campaignTitle, amount, token }
  });
}
```

### Email Templates

All emails show exact amounts with 2 decimal places (no rounding).

**Pledge Confirmation** (sent after the setup-mode Stripe session completes successfully)
- Subject: "Pledge confirmed | {Campaign Title}"
- Contains: Full breakdown (subtotal, optional The Pool tip, tax, shipping if physical, total), pledge items, manage link, community link
- Includes: Instagram CTA (if campaign has Instagram URL)
- Community link shown only if campaign has active decisions

**Pledge Modified** (sent when supporter changes their pledge)
- Subject: "Pledge updated | {Campaign Title}"
- Contains: Previous subtotal, new subtotal, change amount (+/-), optional The Pool tip, tax, shipping (if physical), new total, updated pledge items
- Includes: Instagram CTA (if campaign has Instagram URL)
- Community link shown only if campaign has active decisions

**Charge Success** (sent when pledge is charged at settlement)
- Subject: "Payment confirmed | {Campaign Title}"
- Contains: Full breakdown (subtotal + tip + tax + shipping + total charged), pledge items
- Community link shown only if campaign has active decisions
- Note: No Instagram CTA (campaign is over)

**Payment Failed** (sent when off-session charge fails)
- Subject: "Update payment method | {Campaign Title}"
- Contains: Full breakdown (subtotal + tip + tax + shipping + amount due), pledge items, manage link to update card
- Note: No Instagram CTA (campaign is over)

**Pledge Cancelled** (sent when supporter cancels their pledge)
- Subject: "Pledge cancelled | {Campaign Title}"
- Contains: Breakdown including optional tip, confirmation card wasn't charged, link to view campaign (can re-pledge)
- Note: Supporter is removed from future campaign email updates

**Diary Update** (sent when new diary entry is added to campaign)
- Subject: "{Diary Title} | {Campaign Title}"
- Contains: Diary title, plain-text excerpt (200 chars + ellipsis), "Read Full Update" button linking to campaign diary
- Includes: Supporter access links (community + manage), Instagram CTA (if campaign has Instagram URL)
- Note: Excerpts strip markdown formatting; the full content is on the campaign page

**Blast / Announcement** (sent via Campaigns -> Blast or legacy admin broadcast with optional CTA link)
- Subject: "{Subject} | {Campaign Title}"
- Contains: Campaign-scoped update content, optional hosted campaign images, email-safe YouTube/Vimeo links, and optional highlighted CTA button (custom label + URL)
- Includes: Supporter access links (community + manage), Instagram CTA (if campaign has Instagram URL)
- Endpoints: `POST /admin/marketing/announcement` for browser Blast, `POST /admin/broadcast/announcement` for legacy operator sends

**Launch Reminder** (sent once when an upcoming campaign becomes live)
- Subject: "Now live | {Campaign Title}"
- Contains: Campaign title, localized launch copy, campaign CTA, and unsubscribe link
- Uses: Signup `preferredLang`, existing Resend sender configuration, suppression markers, and sent markers
- Note: Reminder signup is separate from pledging and can be cancelled from the reminder email

---

## Security Considerations

- Magic links expire (90 days)
- Tokens verified against KV pledge record (email + campaign match)
- Pledge mutations blocked once pledge is charged
- All secrets in Cloudflare Worker environment variables
- Stripe webhook signatures verified
- Sensitive checkout and payment-method bootstrap responses are `private, no-store`
- First-party checkout and payment-method POSTs enforce trusted `SITE_BASE` origins
- Browser-stored checkout drafts and in-flight identifiers are session-scoped or time-limited
- All deadlines evaluated in the platform timezone
- Launch reminder signups require explicit campaign/email opt-in, rate limiting, and Turnstile verification when configured
- Launch reminder unsubscribe links use scoped signed tokens and suppress only that campaign/email reminder
- Community/voting access revoked immediately when pledge is cancelled
- `/votes` API checks pledge status on every request (not just token validity)

---

## Race Condition Handling

- `/pledge/cancel` and `/pledge/modify` reject if pledge `charged: true`
- `/pledge/cancel` and `/pledge/modify` reject if campaign deadline has passed in the platform timezone
- Cron checks `pledgeStatus === 'active'` and `!charged` before charging
- `pledgeStatus` and `charged` flags prevent double-charging
- Aggregation by email ensures one charge per supporter per campaign even with multiple pledge rows
- Manage page shows deadline-passed notice, locked badge, and read-only pledge controls once deadline passes
- Payment method updates remain available after deadline (for failed payment recovery)

---

## Stretch Goals

- Defined in campaign front matter: `stretch_goals[]`
- Auto-unlock when `pledged_amount >= threshold`
- Display as `achieved` or `locked`
- Optional: gate tiers with `requires_threshold`

---

_Last updated: June 18, 2026_
