# Workflows

The Pool uses a **no-account, email-based pledge management system**. Backers save a payment method through Stripe in The Pool's on-site payment step, manage pledges via order-scoped magic links, and are only charged if the campaign is funded.

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
| `upcoming` | Buttons disabled, "Coming soon" | Countdown to launch |
| `live` | Pledge buttons active | Cards saved via The Pool's on-site Stripe payment step |
| `post` | Campaign closed | Charges processed (if funded) |

---

## System Components

| Component | Role |
|-----------|------|
| **First-party cart** | Browser-owned cart UI and checkout review state |
| **Stripe** | Checkout Sessions in setup mode (custom on-site payment step) + PaymentIntents (charge later) |
| **Cloudflare Worker** | Backend: checkout, webhooks, pledge storage (KV), combined live reads, stats, auto-settle cron |
| **Jekyll** | Static pages + campaign markdown |

---

## Pledge Lifecycle

```
1. BROWSE     → Visitor views campaign, adds tier to the first-party cart, adjusts optional tip
2. REVIEW     → First-party cart drawer shows pledge review, tip state, and immediate pricing
3. START      → Worker canonicalizes the cart via `/checkout-intent/start`, reserves scarce tiers when needed, and creates a setup-mode Stripe Checkout Session
4. SAVE CARD  → The existing checkout sidecar keeps the visitor on-site, mounts secure Stripe payment UI, and saves the payment method (no charge)
5. CONFIRM    → Stripe confirms the setup, then Worker persists one pledge per campaign in KV, sends campaign-specific supporter email(s), and refreshes live campaign reads before success UX completes
6. MANAGE     → Backer uses magic link to cancel/modify/update card
7. DEADLINE   → Worker cron (midnight MT) checks campaigns
8. CHARGE     → If funded + deadline passed: aggregate by email within each campaign, charge once per supporter per campaign
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

---

## Worker API Routes

### `POST /checkout-intent/start`
Create a setup-mode Stripe Checkout Session from the first-party cart state for the on-site payment step.

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
- `deadlinePassed`: `true` if campaign deadline has passed (Mountain Time)

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

### `POST /admin/broadcast/announcement`
Send a custom announcement email with optional CTA link to all campaign supporters.

**Headers:** `Authorization: Bearer ADMIN_SECRET`  
**Request:**
```json
{
  "campaignSlug": "worst-movie-ever",
  "subject": "Submissions close March 6th!",
  "heading": "Last call for submissions!",
  "body": "The deadline is this Thursday at midnight MT.",
  "ctaLabel": "Submit Your Reward",
  "ctaUrl": "https://example.com/submit",
  "dryRun": true
}
```
**Response:** `{ success, campaignSlug, subject, sent, failed, errors }`

**Fields:**
- `subject` (required) — Email subject line (prefixed with 📢 emoji)
- `heading` (optional) — Email heading (defaults to subject if omitted)
- `body` (required) — Message body text
- `ctaLabel` + `ctaUrl` (optional) — Adds a prominent button linking to the URL
- `dryRun` (optional) — Returns recipient list without sending

### `POST /admin/report/campaign-runner`
Preview or manually send a campaign-runner report for one campaign.

**Headers:** `Authorization: Bearer ADMIN_SECRET`  
**Request:**
```json
{
  "campaignSlug": "hand-relations",
  "reportType": "pledge",
  "dryRun": true,
  "markAsSent": false
}
```

**Fields:**
- `campaignSlug` (required) — Campaign to report on
- `reportType` (optional) — `pledge` or `fulfillment` (`pledge` by default)
- `dryRun` (optional) — Returns recipients, row counts, filename, and marker state without sending
- `markAsSent` (optional) — On live sends, writes the matching report marker so the scheduled run does not immediately duplicate the email; defaults to `true` when `dryRun` is false

Recipients still come from the campaign’s `runner_report_emails` front matter field.

**Dry-run example:**
```bash
curl -X POST http://localhost:8787/admin/report/campaign-runner \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_ADMIN_SECRET' \
  -d '{"campaignSlug":"hand-relations","reportType":"pledge","dryRun":true}'
```

**Manual send example:**
```bash
curl -X POST http://localhost:8787/admin/report/campaign-runner \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_ADMIN_SECRET' \
  -d '{"campaignSlug":"hand-relations","reportType":"fulfillment","dryRun":false,"markAsSent":true}'
```

**Operational notes:**
- run a dry run first when validating recipients, CSV shape, or subject-prefix customization
- use `reportType=pledge` for the daily live-campaign ledger and `reportType=fulfillment` for the one-time post-deadline export
- keep `markAsSent=false` only for deliberate preview-style sends that should not suppress the next scheduled report

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

The Worker has a scheduled trigger that runs daily at **7:00 AM UTC** (midnight Mountain Time):

```toml
# wrangler.toml
[triggers]
crons = ["0 7 * * *"]
```

**What it does:**

1. Records a heartbeat (`cron:lastRun` in KV)
2. Lists all campaigns with `goal_deadline` and `goal_amount`
3. For each campaign where deadline has passed (in MT), goal is met, and `campaign-charged:{slug}` is not set:
   - Dispatches batched settlement via `POST /admin/settle-dispatch/:slug`
4. Triggers GitHub Pages rebuild if any campaign state transitions detected

**Settlement dispatch (self-chaining batches):**

The `settle-dispatch` endpoint handles the actual charging in batches to stay within CF Worker's 50 subrequest limit:

1. Reads the campaign pledge index (`campaign-pledges:{slug}` in KV)
2. Initializes a settlement job (`settlement-job:{slug}`) tracking progress
3. Processes 6 pledges per batch via `POST /admin/settle-batch`
4. Self-invokes for the next batch until all pledges are processed
5. Each batch is a separate Worker invocation with its own subrequest budget
6. **Aggregates pledges by email** — each supporter gets ONE charge
7. On completion, sets `campaign-charged:{slug}` only when no active pledge still needs attention

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
- Uses the most recently updated payment method for each supporter
- Already-charged pledges are safely skipped (idempotent)
- Can be triggered manually via `POST /admin/settle-dispatch/:slug`
- Legacy monolithic settle still available: `POST /admin/settle/:slug` (use settle-dispatch for large campaigns)
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

| Provider | Purpose |
|----------|---------|
| **Resend** | All supporter emails (confirmation, milestones, diary updates, announcements, charge success, payment failed) |

The Worker handles all pledge-related email via Resend.

### Resend Integration (Worker)

The Worker sends supporter emails after Stripe webhook confirms the setup-mode session:

```js
// In Worker: POST /webhooks/stripe handler
async function sendSupporterEmail(env, { email, campaignSlug, campaignTitle, amount, token }) {
  const manageUrl = `${env.SITE_BASE}/manage/?t=${token}`;
  const communityUrl = `${env.SITE_BASE}/community/${campaignSlug}/?t=${token}`;
  
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'The Pool <pledges@dustwave.xyz>',
      to: email,
      subject: `Your pledge to ${campaignTitle}`,
      html: `
        <h1>Thanks for backing ${campaignTitle}!</h1>
        <p><strong>Pledge amount:</strong> $${(amount / 100).toFixed(0)}</p>
        <p><strong>Remember:</strong> Your card is saved but won't be charged unless this campaign reaches its goal.</p>
        <hr>
        <h2>Your Supporter Access</h2>
        <p>No account needed — these links are your keys:</p>
        <p><a href="${manageUrl}">Manage Your Pledge</a> — Cancel, modify, or update payment method</p>
        <p><a href="${communityUrl}">Supporter Community</a> — Vote on creative decisions</p>
        <hr>
        <p style="color:#666;font-size:12px;">Save this email! You'll need these links to manage your pledge.</p>
      `
    })
  });
}
```

### Email Templates

All emails show exact amounts with 2 decimal places (no rounding).

**Pledge Confirmation** (sent after the setup-mode Stripe session completes successfully)
- Subject: "Your pledge to {Campaign Title}"
- Contains: Full breakdown (subtotal, optional The Pool tip, tax, shipping if physical, total), pledge items, manage link, community link
- Includes: Instagram CTA (if campaign has Instagram URL)
- Community link shown only if campaign has active decisions

**Pledge Modified** (sent when supporter changes their pledge)
- Subject: "Pledge updated for {Campaign Title}"
- Contains: Previous subtotal, new subtotal, change amount (+/-), optional The Pool tip, tax, shipping (if physical), new total, updated pledge items
- Includes: Instagram CTA (if campaign has Instagram URL)
- Community link shown only if campaign has active decisions

**Charge Success** (sent when pledge is charged at settlement)
- Subject: "Payment confirmed for {Campaign Title}"
- Contains: Full breakdown (subtotal + tip + tax + shipping + total charged), pledge items
- Community link shown only if campaign has active decisions
- Note: No Instagram CTA (campaign is over)

**Payment Failed** (sent when off-session charge fails)
- Subject: "Action needed: Update payment for {Campaign Title}"
- Contains: Full breakdown (subtotal + tip + tax + shipping + amount due), pledge items, manage link to update card
- Note: No Instagram CTA (campaign is over)

**Pledge Cancelled** (sent when supporter cancels their pledge)
- Subject: "Pledge cancelled for {Campaign Title}"
- Contains: Breakdown including optional tip, confirmation card wasn't charged, link to view campaign (can re-pledge)
- Note: Supporter is removed from future campaign email updates

**Diary Update** (sent when new diary entry is added to campaign)
- Subject: "📝 {Diary Title} — {Campaign Title}"
- Contains: Diary title, plain-text excerpt (200 chars + ellipsis), "Read Full Update" button linking to campaign diary
- Includes: Supporter access links (community + manage), Instagram CTA (if campaign has Instagram URL)
- Note: Excerpts strip markdown formatting; the full content is on the campaign page

**Announcement** (sent via admin broadcast with optional CTA link)
- Subject: "📢 {Subject} — {Campaign Title}"
- Contains: Custom heading, message body, optional highlighted CTA button (custom label + URL)
- Includes: Supporter access links (community + manage), Instagram CTA (if campaign has Instagram URL)
- Endpoint: `POST /admin/broadcast/announcement`

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
- All deadlines evaluated in Mountain Time
- Community/voting access revoked immediately when pledge is cancelled
- `/votes` API checks pledge status on every request (not just token validity)

---

## Race Condition Handling

- `/pledge/cancel` and `/pledge/modify` reject if pledge `charged: true`
- `/pledge/cancel` and `/pledge/modify` reject if campaign deadline has passed (Mountain Time)
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

_Last updated: Apr 9, 2026_
