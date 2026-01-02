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
pre → live → post
```

| State | UX | Actions |
|-------|-----|---------|
| `pre` | Buttons disabled, "Coming soon" | Countdown to launch |
| `live` | Pledge buttons active | Cards saved via Stripe SetupIntent |
| `post` | Campaign closed | Charges processed (if funded) |

---

## System Components

| Component | Role |
|-----------|------|
| **Snipcart** | Cart UI only (collects billing info, no payment processing) |
| **Stripe** | SetupIntents (save cards) + PaymentIntents (charge later) |
| **Cloudflare Worker** | Backend: checkout, webhooks, pledge storage (KV), stats, auto-settle cron |
| **Jekyll** | Static pages + campaign markdown |

---

## Pledge Lifecycle

```
1. BROWSE     → Visitor views campaign, adds tier to Snipcart cart
2. CHECKOUT   → User fills billing info → JS intercepts "Continue to payment"
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
  "amount": 5394,
  "stripeCustomerId": "cus_xxx",
  "stripePaymentMethodId": "pm_xxx",
  "pledgeStatus": "active",
  "charged": false,
  "history": [{ "type": "created", "at": "..." }]
}
```

**Support items and custom amounts:**
- `supportItems` — Array of `{ id, amount }` for production phase contributions
- `customAmount` — Integer (cents) for "no reward" pledge additions
- `additionalTiers` — Array of `{ id, qty }` for multi-tier pledges (when `single_tier_only: false`)

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
  "subtotal": 8500,
  "tax": 669,
  "billingAddress": { "name": "...", "email": "...", ... }
}
```
**Response:** `{ url }` → Redirect to Stripe Checkout

**Data flow:**
1. Cart.js extracts tiers, support items, and custom amount from Snipcart cart
2. Worker stores `supportItems` and `customAmount` in temp KV key (`pending-extras:{orderId}`)
3. Worker sets `hasExtras` flag in Stripe Checkout metadata
4. On webhook, Worker fetches extras from temp KV and merges into final pledge

### `POST /webhooks/stripe`
Handle `checkout.session.completed`:
- Extract `payment_method` and `customer` from SetupIntent
- Fetch `supportItems` and `customAmount` from temp KV (if `hasExtras` flag set)
- Store pledge in KV with status `active` (includes support items and custom amount)
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
  "canCancel": true
}
```

### `POST /pledge/cancel`
Cancel an active pledge.

**Request:** `{ token }`  
**Action:** Mark pledge as cancelled in KV, update stats, release tier inventory

### `POST /pledge/modify`
Change tier or amount.

**Request:** `{ token, newTierId, newAmount }`  
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
- Shows cancel/modify/update-card buttons

### `/community/:slug/`
Supporter-only community page:
- Verifies `?t=...` token against Worker
- Sets `supporter_{slug}` cookie (90 days) for future visits
- Shows voting/polling decisions exclusive to backers
- Access denied page shown to non-supporters

---

## Charging Flow (Worker Cron)

The Worker has a scheduled trigger that runs daily at **7:00 AM UTC** (midnight Mountain Standard Time):

```toml
# wrangler.toml
[triggers]
crons = ["0 7 * * *"]
```

**What it does:**

1. Lists all campaigns with `goal_deadline` and `goal_amount`
2. For each campaign where deadline has passed (in MT) and goal is met:
   - Checks if there are any uncharged active pledges
   - If so, runs the settle logic
3. **Aggregates pledges by email** — each supporter gets ONE charge:
   ```js
   // For each unique email:
   stripe.paymentIntents.create({
     amount: totalAmountForThisSupporter,
     currency: 'usd',
     customer: mostRecentCustomerId,
     payment_method: mostRecentPaymentMethodId,
     off_session: true,
     confirm: true
   })
   ```
4. Updates all underlying pledges as `charged` or `payment_failed`
5. Sends ONE confirmation email per supporter

**Key behaviors:**
- Cancelled pledges are never charged
- Multiple pledges from same email = one aggregated charge
- Uses the most recently updated payment method for each supporter
- Can also be triggered manually via `POST /admin/settle/:slug`

---

## Email Architecture

| Provider | Purpose |
|----------|---------|
| **Resend** | All supporter emails (confirmation, milestones, charge success, payment failed) |

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

**Pledge Confirmation** (sent after Stripe SetupIntent success)
- Subject: "Your pledge to {Campaign Title}"
- Contains: Amount, all-or-nothing reminder, manage link, community link
- Note: "No account needed — these links are your keys"

**Failed Charge** (sent when off-session charge fails)
- Subject: "Action needed: Update your payment method"
- Contains: Manage link to update card, deadline reminder

---

## Security Considerations

- Magic links expire (90 days)
- Tokens verified against KV pledge record (email + campaign match)
- Pledge mutations blocked once pledge is charged
- All secrets in Cloudflare Worker environment variables
- Stripe webhook signatures verified
- All deadlines evaluated in Mountain Time

---

## Race Condition Handling

- `/pledge/cancel` and `/pledge/modify` reject if pledge `charged: true`
- Cron checks `pledgeStatus === 'active'` and `!charged` before charging
- `pledgeStatus` and `charged` flags prevent double-charging
- Aggregation by email ensures one charge per supporter even with multiple pledges

---

## Stretch Goals

- Defined in campaign front matter: `stretch_goals[]`
- Auto-unlock when `pledged_amount >= threshold`
- Display as `achieved` or `locked`
- Optional: gate tiers with `requires_threshold`

---

_Last updated: Jan 2026_
