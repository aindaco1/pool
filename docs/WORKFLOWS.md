# Workflows

The Pool uses a **no-account, email-based pledge management system**. Backers save their card via Stripe, manage pledges via magic links, and are only charged if the campaign is funded.

## Key Differentiators

- **No accounts** — Email + payment info only (no registration)
- **Magic link management** — Cancel, modify, or update payment method via email link
- **All-or-nothing** — Cards saved now, charged only if goal is met
- **Film-focused** — Designed for creative crowdfunding

---

## Campaign State Machine

```
upcoming → live → post
```

| State | UX | Actions |
|-------|-----|---------|
| `upcoming` | Buttons disabled, "Coming soon" | Countdown to launch |
| `live` | Pledge buttons active | Cards saved via Stripe SetupIntent |
| `post` | Campaign closed | Charges processed (if funded) |

---

## System Components

| Component | Role |
|-----------|------|
| **Snipcart** | Cart UI only (billing step auto-skipped, no payment processing) |
| **Stripe** | SetupIntents (save cards) + PaymentIntents (charge later) |
| **Cloudflare Worker** | Backend: checkout, webhooks, pledge storage (KV), stats, auto-settle cron |
| **Jekyll** | Static pages + campaign markdown |

---

## Pledge Lifecycle

```
1. BROWSE     → Visitor views campaign, adds tier to Snipcart cart
2. CHECKOUT   → Billing auto-filled → JS intercepts "Continue to Pledge"
3. START      → Worker creates Stripe Checkout (setup mode)
4. SAVE CARD  → Stripe Checkout saves payment method (no charge)
5. CONFIRM    → Stripe webhook → Worker stores pledge in KV, sends magic link email
6. MANAGE     → Backer uses magic link to cancel/modify/update card
7. DEADLINE   → Worker cron (midnight MT) checks campaigns
8. CHARGE     → If funded + deadline passed: aggregate by email, charge once per supporter
9. COMPLETE   → Update pledge_status to 'charged' or 'payment_failed'
```

---

## Pledge Storage (Cloudflare KV)

Pledges are stored in Cloudflare KV (not Snipcart). Key patterns:

| Key | Contents |
|-----|----------|
| `pledge:{orderId}` | Full pledge data (email, amount, tier, Stripe IDs, status, history) |
| `email:{email}` | Array of order IDs for that email |
| `stats:{campaignSlug}` | Aggregated totals (pledgedAmount, pledgeCount, tierCounts, supportItems) |
| `tier-inventory:{campaignSlug}` | Claim counts for limited tiers |
| `pending-extras:{orderId}` | Temporary storage for support items/custom amount during checkout |

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
  "subtotal": 5000,
  "tax": 394,
  "shipping": 300,
  "amount": 5694,
  "shippingAddress": { "name": "Jane Doe", "address1": "123 Main St", "city": "Albuquerque", "province": "NM", "postalCode": "87101", "country": "US" },
  "stripeCustomerId": "cus_xxx",
  "stripePaymentMethodId": "pm_xxx",
  "pledgeStatus": "active",
  "charged": false,
  "history": [
    { "type": "created", "subtotal": 5000, "tax": 394, "shipping": 300, "amount": 5694, "tierId": "producer-credit", "tierQty": 1, "customAmount": 25, "at": "2026-01-15T12:00:00Z" }
  ]
}
```

**Support items and custom amounts:**
- `supportItems` — Array of `{ id, amount }` for production phase contributions
- `customAmount` — Dollar amount for "no reward" custom support additions
- `additionalTiers` — Array of `{ id, qty }` for multi-tier pledges (when `single_tier_only: false`)

**History entries:**
Each history entry tracks a pledge event with full context:
- `type` — `created`, `modified`, or `cancelled`
- `subtotal` / `subtotalDelta` — Pre-tax amount (or delta for modifications)
- `tax` / `taxDelta` — Tax amount (or delta)
- `amount` / `amountDelta` — Total with tax + shipping (or delta)
- `shipping` / `shippingDelta` — Flat shipping fee (or delta, for tier category changes)
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
  "orderId": "snipcart-order-token",
  "email": "backer@example.com",
  "campaignSlug": "hand-relations",
  "exp": 1754000000
}
```

**Token format:** `base64url(payload).base64url(HMAC-SHA256(payload, secret))`

**Verification:**
1. Decode and verify signature
2. Check expiry
3. Fetch pledge from KV and cross-check email + campaign

---

## Worker API Routes

### `POST /start`
Create Stripe Checkout session (setup mode) after Snipcart order.

**Request:**
```json
{
  "orderId": "pledge-123",
  "campaignSlug": "hand-relations",
  "tiers": [{ "id": "producer-credit", "qty": 1, "price": 50 }],
  "supportItems": [{ "id": "location-scouting", "amount": 25 }],
  "customAmount": 10,
  "hasPhysical": true,
  "subtotal": 8500,
  "tax": 669
}
```
**Response:** `{ url }` → Redirect to Stripe Checkout

**Data flow:**
1. Cart.js extracts tiers, support items, custom amount, and physical item flag from Snipcart cart
2. Worker stores `supportItems` and `customAmount` in temp KV key (`pending-extras:{orderId}`)
3. Worker sets `hasExtras` and `hasPhysical` flags in Stripe Checkout metadata
4. If `hasPhysical`, Stripe Checkout collects shipping address via `shipping_address_collection`
5. On webhook, Worker fetches extras from temp KV, extracts shipping address from Stripe session, and merges into final pledge

### `POST /webhooks/stripe`
Handle `checkout.session.completed`:
- Extract `payment_method` and `customer` from SetupIntent
- Fetch `supportItems` and `customAmount` from temp KV (if `hasExtras` flag set)
- Store pledge in KV with status `active` (includes support items, custom amount, shipping fee, and shipping address)
- Update live stats (pledgedAmount, tierCounts, supportItems)
- Claim tier inventory (for limited tiers)
- Generate magic link token
- Send supporter confirmation email

### `GET /pledge?token=...`
Read pledge details for magic link management page.

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

**Request:** `{ token, newTierId, newAmount }`  
**Validation:**
- Rejects if pledge is charged
- Rejects if campaign deadline has passed (via `isCampaignLive` check)

**Action:** Update pledge in KV, adjust stats delta, swap tier inventory

### `POST /pledge/payment-method/start`
Update saved payment method.

**Request:** `{ token }`  
**Response:** `{ url }` → New Stripe Checkout session (setup mode)

### `GET /stats/:campaignSlug`
Get live pledge statistics for a campaign.

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
Campaign detail with tier buttons → Snipcart cart

### `/campaigns/:slug/pledge-success/`
Post-Stripe success page with confirmation + manage link

### `/campaigns/:slug/pledge-cancel/`
User cancelled Stripe Checkout (not the pledge itself)

### `/manage/`
Magic link landing page for pledge management:
- Reads `?t=...` token
- Fetches pledge details from Worker
- Shows pledge cards with state-dependent UI
- Displays full breakdown: subtotal, tax (7.875%), shipping ($3 if physical), total

**Pledge card states:**

| Status | UI Treatment |
|--------|-------------|
| `active` | Full edit controls (tier selection, support items, cancel button) |
| `active` + deadline passed | Locked notice, "Update Card" only |
| `charged` | Muted card, "✓ Successfully charged on {date}" notice |
| `payment_failed` | Warning notice with "Update Payment Method" button |
| `cancelled` | "This pledge has been cancelled" notice |

**Shipping in modify flow:** When a supporter changes tiers, the manage page dynamically recalculates shipping — if the new tier selection includes any `category: physical` tier, the $3 shipping fee is shown; otherwise it's hidden. The confirmation modal shows the updated total before the user confirms.

**Dev mode:** Add `?dev` to URL for mock pledge data testing

### `/community/:slug/`
Supporter-only community page:
- Always verifies with Worker API (doesn't trust cookies alone)
- On success: Sets `supporter_{slug}` cookie (90 days) for UX optimization
- On failure (cancelled pledge, expired token): Clears cookies, shows access denied CTA
- Shows voting/polling decisions exclusive to backers
- `/votes` API returns 403 for cancelled pledges (double-checks access)
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
7. On completion, sets `campaign-charged:{slug}` marker to prevent re-settlement

**Campaign pledge index:**

A per-campaign array of order IDs (`campaign-pledges:{slug}`) is maintained automatically:
- Added on pledge creation (webhook) and recovery (`/admin/recover-checkout`)
- Removed on pledge cancellation
- Can be rebuilt: `POST /admin/campaign-index/rebuild/:slug`

**Key behaviors:**
- Cancelled pledges are never charged
- Multiple pledges from same email = one aggregated charge (subtotals + shipping summed)
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

Note: Snipcart emails are disabled — the Worker handles all pledge-related email via Resend.

### Resend Integration (Worker)

The Worker sends supporter emails after Stripe webhook confirms the SetupIntent:

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

**Pledge Confirmation** (sent after Stripe SetupIntent success)
- Subject: "Your pledge to {Campaign Title}"
- Contains: Full breakdown (subtotal, tax, shipping if physical, total), pledge items, manage link, community link
- Includes: Instagram CTA (if campaign has Instagram URL)
- Community link shown only if campaign has active decisions

**Pledge Modified** (sent when supporter changes their pledge)
- Subject: "Pledge updated for {Campaign Title}"
- Contains: Previous subtotal, new subtotal, change amount (+/-), tax, shipping (if physical), new total, updated pledge items
- Includes: Instagram CTA (if campaign has Instagram URL)
- Community link shown only if campaign has active decisions

**Charge Success** (sent when pledge is charged at settlement)
- Subject: "Payment confirmed for {Campaign Title}"
- Contains: Full breakdown (subtotal + tax + shipping + total charged), pledge items
- Community link shown only if campaign has active decisions
- Note: No Instagram CTA (campaign is over)

**Payment Failed** (sent when off-session charge fails)
- Subject: "Action needed: Update payment for {Campaign Title}"
- Contains: Full breakdown (subtotal + tax + shipping + amount due), pledge items, manage link to update card
- Note: No Instagram CTA (campaign is over)

**Pledge Cancelled** (sent when supporter cancels their pledge)
- Subject: "Pledge cancelled for {Campaign Title}"
- Contains: Amount, confirmation card wasn't charged, link to view campaign (can re-pledge)
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
- All deadlines evaluated in Mountain Time
- Community/voting access revoked immediately when pledge is cancelled
- `/votes` API checks pledge status on every request (not just token validity)

---

## Race Condition Handling

- `/pledge/cancel` and `/pledge/modify` reject if pledge `charged: true`
- `/pledge/cancel` and `/pledge/modify` reject if campaign deadline has passed (Mountain Time)
- Cron checks `pledgeStatus === 'active'` and `!charged` before charging
- `pledgeStatus` and `charged` flags prevent double-charging
- Aggregation by email ensures one charge per supporter even with multiple pledges
- Manage page shows deadline-passed notice and hides cancel/modify buttons once deadline passes
- Payment method updates remain available after deadline (for failed payment recovery)

---

## Stretch Goals

- Defined in campaign front matter: `stretch_goals[]`
- Auto-unlock when `pledged_amount >= threshold`
- Display as `achieved` or `locked`
- Optional: gate tiers with `requires_threshold`

---

_Last updated: Mar 4, 2026_
