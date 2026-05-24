# Security Guide

This document covers the security architecture, known risks, applied hardening measures, accepted tradeoffs, and penetration testing procedures for The Pool crowdfunding platform.

## Security Architecture

### Authentication Mechanisms

| Mechanism | Endpoints | Description |
|-----------|-----------|-------------|
| **Magic Link Tokens** | `/pledge*`, `/pledges`, `/votes` | HMAC-SHA256 signed tokens with 90-day expiry |
| **Stripe Webhook Signature** | `/webhooks/stripe` | HMAC-SHA256 verification per Stripe spec |
| **Admin Secret** | `/admin/*` | `Authorization: Bearer <secret>` or `x-admin-key` header |
| **Test Mode Guard** | `/test/*` | `APP_MODE === 'test'` environment check |

### Data Storage (Cloudflare KV)

| Key Pattern | Namespace | Data | Sensitivity |
|-------------|-----------|------|-------------|
| `pledge:{orderId}` | PLEDGES | Email, amount, Stripe IDs, status | **High** - PII + payment data |
| `email:{email}` | PLEDGES | Array of order IDs | **Medium** - links email to pledges |
| `stats:{slug}` | PLEDGES | Aggregate totals | **Low** - public |
| `tier-inventory:{slug}` | PLEDGES | Tier claim counts | **Low** - public |
| `stripe-event:{id}` | PLEDGES | "processed" flag | **Low** - idempotency |
| `campaign-pledges:{slug}` | PLEDGES | Array of order IDs per campaign | **Low** - index |
| `campaign-charged:{slug}` | PLEDGES | Settlement completion timestamp | **Low** - flag |
| `settlement-job:{slug}` | PLEDGES | Settlement batch progress | **Low** - ephemeral |
| `pending-extras:{orderId}` | PLEDGES | Temporary support item / custom amount checkout extras | **Low** - ephemeral |
| `pending-tiers:{orderId}` | PLEDGES | Temporary overflow tier metadata during checkout | **Low** - ephemeral |
| `cron:lastRun` | PLEDGES | Last cron execution timestamp | **Low** - monitoring |
| `vote:{slug}:{decision}:{email}` | VOTES | Vote choice | **Medium** - links supporter to vote |
| `results:{slug}:{decision}` | VOTES | Vote tallies | **Low** - semi-public |
| `rl:{endpoint}:{ip}` | RATELIMIT | Request count + reset time | **Low** - ephemeral |

Scarce limited-tier reservation and committed-count truth is no longer stored in KV. That race-sensitive state now lives in the per-campaign Durable Object coordinator, while KV keeps only the public `tier-inventory:{slug}` projection.

---

## Vulnerability Summary

### Critical / High Priority

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| SEC-001 | Dev-token bypass on `/votes` in production | **High** | ✅ Fixed |
| SEC-002 | Stripe webhook fails open if secret not set | **High** | ✅ Fixed |
| SEC-003 | Test endpoints may be accessible in production | **High** | ✅ Fixed |

### Medium Priority

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| SEC-004 | CORS `Access-Control-Allow-Origin: *` on all endpoints | **Medium** | ✅ Fixed |
| SEC-005 | No rate limiting on expensive endpoints | **Medium** | ✅ Fixed |
| SEC-006 | Admin secret not timing-safe compared | **Medium** | ✅ Fixed |
| SEC-007 | Legacy hosted-cart webhook surface remained reachable | **Medium** | ✅ Fixed |

### Low Priority

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| SEC-008 | Magic link tokens long-lived (90 days) | **Low** | Acceptable |
| SEC-009 | Input validation on votes could be stricter | **Low** | ✅ Fixed |
| SEC-010 | Tokens in query strings (Referer leakage risk) | **Low** | Acceptable |
| SEC-011 | Input validation on checkout-start payloads | **Low** | ✅ Fixed |
| SEC-012 | Missing security response headers | **Low** | ✅ Fixed |

---

## Applied Hardening Notes

### Secret Storage Boundaries

Runtime credentials are intentionally separated from editable site configuration:

- Non-secret settings belong in `_config.yml`, `_config.local.yml`, or admin setting drafts.
- Local development secrets belong in ignored `worker/.dev.vars`; run `npm run secrets:dev` to create/update that file safely.
- Production Worker credentials belong in Cloudflare Worker secrets through `wrangler secret put`.
- Deploy credentials such as `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `DIARY_CHECK_BYPASS_SECRET` belong in GitHub repository secrets or ignored local env files used by operator scripts.
- The admin dashboard may show Configured/Missing status for runtime credentials, but it must not expose, edit, serialize, or publish secret values.

This boundary prevents the admin dashboard from becoming a credential store and keeps forks from accidentally committing Stripe, Resend, USPS, ZIP.TAX, or Cloudflare tokens while still making missing setup visible to operators.

### SEC-001: Lock Down Dev-Token Bypass (✅ FIXED)

**File:** `worker/src/routes/votes.js`

**Historical vulnerable pattern:**
```javascript
if (token.startsWith('dev-token-')) {
  campaignSlug = token.replace('dev-token-', '');
  orderId = 'dev-order-1';
}
```

**Fixed:**
```javascript
if (token.startsWith('dev-token-')) {
  if (env.APP_MODE !== 'test') {
    return jsonResponse({ error: 'Invalid token' }, 401);
  }
  campaignSlug = token.replace('dev-token-', '');
  orderId = 'dev-order-1';
  email = 'dev@test.com';
}
```

**Note:** Votes are keyed by **email** (not orderId) to prevent supporters with multiple pledges from voting multiple times. The Worker also resolves campaign decisions server-side, rejects unknown/closed decisions, and only accepts option values from the campaign's published allowlist.

Campaign-authored titles, descriptions, and support labels are also escaped by default in supporter-facing cart, manage, and community surfaces so forks with creator-editable content do not inherit a stored-XSS footgun by default. Long-form campaign and diary blocks now accept Markdown plus a very small inline HTML subset (`<br>`, `<em>`, `<strong>`, `<i>`, `<b>`, `<u>`); other raw tags are escaped at render time and rejected by the content audit. Markdown links are rewritten unless they use an allowlisted destination scheme (`http:`, `https:`, `mailto:`, or internal links), and structured embeds must use exact approved `https://` provider URLs instead of passing a substring check.
Community pages no longer persist the raw supporter bearer token in a long-lived cookie; the token now stays in browser session storage while a non-sensitive verification cookie handles lightweight UX state.

Limited-tier inventory mutations now flow through a per-campaign Durable Object coordinator from checkout start onward. Scarce tiers are reserved before redirecting into Stripe, confirmed at successful persistence time, and only projected back into KV for public reads. That keeps race-sensitive inventory truth out of client-visible KV while preserving efficient public `/inventory/:slug` reads.

The newer on-site Stripe checkout and `Update Card` flows now also fail more privately by default: Worker responses that carry Stripe session bootstrap data or order-specific completion state are served with `Cache-Control: private, no-store`, cross-site browser POSTs to checkout-start / checkout-complete / payment-method-start are rejected unless they originate from `SITE_BASE`, and the browser keeps only short-lived in-flight checkout markers for reservation recovery instead of leaving them in long-lived storage indefinitely. Long-lived cart persistence now keeps only cart structure and pricing inputs; contact and address drafts are downgraded to session-scoped storage, and `/checkout-intent/complete` has its own retry budget so local recovery can’t be spammed indefinitely. After successful pledge persistence, the checkout flow now also invalidates live stats/inventory caches immediately and leaves a short-lived refresh marker so restored campaign pages do not keep showing stale totals from pre-pledge browser state.

---

### SEC-002: Fail Closed on Missing Stripe Webhook Secret (✅ FIXED)

**File:** `worker/src/index.js` (handleStripeWebhook)

**Historical vulnerable pattern:**
```javascript
const webhookSecret = getStripeWebhookSecret(env);
if (webhookSecret) {
  // Only verifies if secret exists
}
```

**Fixed:**
```javascript
const webhookSecret = getStripeWebhookSecret(env);
if (!webhookSecret) {
  console.error('CRITICAL: Stripe webhook secret not configured');
  return jsonResponse({ error: 'Webhook not configured' }, 500);
}

const { valid, error } = await verifyStripeSignature(body, sig, webhookSecret);
if (!valid) {
  return jsonResponse({ error: 'Invalid signature' }, 401);
}
```

---

### SEC-003: Guard Test Endpoints (✅ FIXED)

**File:** `worker/src/index.js` (router)

The Worker now blocks test endpoints outside `APP_MODE === 'test'` before those handlers run:

```javascript
// Block test endpoints in production
if (path.startsWith('/test/') && env.APP_MODE !== 'test') {
  return jsonResponse({ error: 'Not found' }, 404);
}
```

Each handler also verifies the environment as defense in depth:
```javascript
async function handleTestSetup(request, env) {
  if (env.APP_MODE !== 'test') {
    return jsonResponse({ error: 'Not found' }, 404);
  }
  // ...
}
```

---

### SEC-004: Restrict CORS Origins (✅ FIXED)

**File:** `worker/src/index.js`

CORS is now restricted based on endpoint type:
- **Public endpoints** (`/stats/*`, `/inventory/*`): Allow `*`
- **Protected endpoints**: Use `env.SITE_BASE` or `env.CORS_ALLOWED_ORIGIN`

```javascript
function getAllowedOrigin(env, isPublic = false) {
  if (isPublic) return '*';
  return env.CORS_ALLOWED_ORIGIN || env.SITE_BASE || '*';
}

// Public endpoints pass isPublic=true:
return jsonResponse(data, 200, env, true);

// Protected endpoints use default:
return jsonResponse(data, 200, env);
```

---

### SEC-005: Rate Limiting (✅ FIXED)

**File:** `worker/src/index.js`

In-Worker rate limiting is now implemented using KV storage with per-IP tracking.

**Write-Path Rate Limits:**

| Endpoint | Limit | Window | Notes |
|----------|-------|--------|-------|
| `/checkout-intent/start` | 40 requests | 1 minute | Checkout starts; tuned higher so shared NATs and legitimate spikes still fit |
| `/shipping/quote` | 90 requests | 1 minute | Shipping quote refreshes stay roomy during cart edits |
| `/checkout-intent/complete` | 12 requests | 1 minute | Keyed by `orderId` instead of only IP to avoid punishing real retries |
| `/checkout-intent/abandon` | 12 requests | 1 minute | Keyed by `orderId` so reservation cleanup retries stay friendly to shared IPs |
| `/pledge` + `/pledges` | 120 requests | 1 minute | Manage-pledge reads stay generous because they are user-facing reads |
| `/pledge/cancel`, `/pledge/modify`, `/pledge/payment-method/start` | 30 requests | 1 minute | Manage-pledge writes |
| `/votes` | 45 requests | 1 minute | Voting endpoints |
| `/admin/*` | 5 requests | 1 minute | Admin operations |

**How It Works:**

- Rate limits are tracked **per IP address** using `CF-Connecting-IP` header
- Each IP gets its own bucket, so 100 different users won't interfere with each other
- Public read endpoints like `/live/:slug`, `/stats/:slug`, and `/inventory/:slug` stay uncapped so a legitimately viral campaign does not trip a DoS defense just for being popular
- The checkout and Manage Pledge write paths keep higher ceilings than a typical brute-force limit so shared NAT environments still have breathing room
- `/checkout-intent/complete` is keyed by `orderId`, which is friendlier to legitimate recovery retries than a pure per-IP bucket
- `/checkout-intent/abandon` is also keyed by `orderId`, so cleanup/release retries do not punish supporters behind the same NAT during a busy launch
- Stripe webhooks are protected with signature verification, idempotency, and a request-body size cap instead of a tight per-IP limit that could interfere with normal Stripe delivery
- Once a client is already over limit for the current window, repeated blocked requests fail closed without rewriting the same KV counter on every hit. That keeps abuse pressure from turning into unnecessary free-plan KV writes.
- Expensive POST routes now also reject obviously oversized request bodies before parsing JSON or touching Stripe/KV-heavy flows.
- Deployed Standard/Paid Workers now also declare `limits.cpu_ms = 100` in `wrangler.toml`. That is a denial-of-wallet guardrail, not a claim that normal requests are anywhere near that expensive.
- Admin-only observability endpoints now expose webhook delivery summaries and sampled mutation timings so operators can tune DoS defenses without relying only on raw log tails.

**Setup:**

1. Create the KV namespace:
   ```bash
   wrangler kv:namespace create "RATELIMIT"
   wrangler kv:namespace create "RATELIMIT" --preview
   ```

2. Add to `wrangler.toml` (both production and dev sections):
   ```toml
   # Production
   [[kv_namespaces]]
   binding = "RATELIMIT"
   id = "YOUR_RATELIMIT_KV_ID"
   preview_id = "YOUR_RATELIMIT_PREVIEW_ID"
   
   # Development (in [env.dev] section)
   [[env.dev.kv_namespaces]]
   binding = "RATELIMIT"
   id = "YOUR_RATELIMIT_KV_ID"
   preview_id = "YOUR_RATELIMIT_PREVIEW_ID"
   ```

**Note:** `RATELIMIT` is now a hard requirement. If the binding is missing, the Worker fails closed with `503` instead of serving traffic without abuse protection. That change increases the importance of having real KV headroom, but it does not mean the Workers Free plan is suddenly incompatible with the project's intended low-to-moderate crowdfunding scale.

**CPU cap note:** Cloudflare's configurable `limits` block is only enforced on the Standard Usage Model and only on deployed Workers, not in local development. The current `cpu_ms = 100` value was chosen as a conservative backstop after representative unit-harness requests landed around `6 ms`, `15 ms`, and `28 ms` wall-clock time for admin light, checkout recovery, and checkout abandon flows respectively. That is only a proxy measurement, but it is enough to justify a low ceiling with headroom instead of leaving the paid default at `30 seconds`.

**Observability note:** Use `GET /admin/observability/webhooks` to inspect webhook volume, duplicate deliveries, signature failures, and recent outcomes, and `GET /admin/observability/performance` to inspect sampled wall-clock timings for the key mutation routes. The helper script [`scripts/check-observability.sh`](../scripts/check-observability.sh) wraps both endpoints for local or deployed checks.

**Response when rate limited:**
```json
{
  "error": "Too many requests",
  "retryAfter": 45
}
```

Status: `429 Too Many Requests` with headers:
- `Retry-After`: Seconds until limit resets
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in window
- `X-RateLimit-Reset`: Unix timestamp when window resets

**Local Testing:**

Restart the Worker to reset rate limit counters (local KV is simulated and resets on restart):
```bash
lsof -ti:8787 | xargs kill -9
cd worker && npx wrangler dev --port 8787
```

---

### SEC-006: Timing-Safe Admin Secret Comparison (✅ FIXED)

**File:** `worker/src/index.js`

The Worker now uses a timing-safe comparison helper for admin secrets:
```javascript
function timingSafeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function requireAdmin(request, env) {
  const provided = request.headers.get('Authorization')?.replace('Bearer ', '') ||
                   request.headers.get('x-admin-key') || '';
  const expected = env.ADMIN_SECRET || '';
  
  if (!expected) {
    console.error('ADMIN_SECRET not configured');
    return { ok: false, status: 500, error: 'Admin not configured' };
  }
  
  if (!timingSafeEqual(provided, expected)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  
  return { ok: true };
}
```

---

## Accepted Tradeoffs / Follow-Up Candidates

These are the currently known items that are not treated as active vulnerabilities requiring immediate code changes:

### SEC-008: Magic Link Tokens Long-Lived (90 days)

Status: **Accepted tradeoff**

Why it remains:
- magic links are intentionally accountless and need to stay usable across longer campaign timelines
- each token is scoped to a specific order/campaign path rather than granting broad account access

If this ever changes, the likely follow-up would be shortening token lifetime and pairing it with easier reissue/recovery UX.

### SEC-010: Tokens in Query Strings (Referer Leakage Risk)

Status: **Accepted tradeoff**

Why it remains:
- magic-link entry currently depends on emailed URLs with query parameters
- the platform already limits referrer leakage with stricter response headers and scoped access behavior

If this becomes a higher-priority concern, the likely follow-up would be a one-time token exchange flow that strips the raw token from the visible URL after first load.

---

### SEC-007: Remove Legacy Hosted-Cart Webhook Surface (✅ FIXED)

**File:** `worker/src/index.js`

The Worker no longer exposes the removed third-party checkout webhook path at all, which eliminates an unnecessary callback surface the live flow no longer needs.

---

### SEC-009: Stricter Input Validation on Votes (✅ FIXED)

**File:** `worker/src/routes/votes.js`, `worker/src/validation.js`

Voting endpoints now validate:
- Decision IDs: max 100 chars, alphanumeric + hyphens only
- Vote options: max 50 chars
- Max 20 decision IDs per request

```javascript
// Validation rules
const MAX_VOTE_OPTION_LENGTH = 50;
const MAX_DECISION_ID_LENGTH = 100;
const VALID_SLUG_REGEX = /^[a-z0-9-]+$/;

// Validated before processing
if (!isValidDecisionId(decisionId)) {
  return jsonResponse({ error: 'Invalid decision ID format' }, 400, env);
}

if (!isValidVoteOption(option)) {
  return jsonResponse({ error: 'Invalid vote option format' }, 400, env);
}
```

---

### SEC-011: Input Validation on Checkout Start (✅ FIXED)

**File:** `worker/src/index.js`, `worker/src/validation.js`

The `/checkout-intent/start` path now validates:
- Campaign slugs: max 100 chars, alphanumeric + hyphens only (prevents injection/traversal)
- Email addresses: RFC-compliant format, max 254 chars
- Cart item IDs and quantities
- Support/custom amount inputs through canonical contribution rebuilding

```javascript
if (!isValidSlug(campaignSlug)) {
  return jsonResponse({ error: 'Invalid campaign slug format' }, 400);
}

if (email && !isValidEmail(email)) {
  return jsonResponse({ error: 'Invalid email format' }, 400);
}

if (!parsedCart.valid) {
  return jsonResponse({ error: parsedCart.error }, 400);
}
```

---

### SEC-012: Security Response Headers (✅ FIXED)

**File:** `worker/src/validation.js`

All API responses now include security headers:

```javascript
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',     // Prevents MIME-type sniffing
  'X-Frame-Options': 'DENY',                // Prevents clickjacking
  'X-XSS-Protection': '1; mode=block',      // Legacy XSS protection
  'Referrer-Policy': 'strict-origin-when-cross-origin'  // Limits referer leakage
};
```

---

## Secrets Checklist

Before deploying to production, verify these secrets are set:

| Secret | Environment Variable | Min Length |
|--------|---------------------|------------|
| Stripe API Key | `STRIPE_SECRET_KEY_LIVE` | N/A |
| Stripe Webhook Secret | `STRIPE_WEBHOOK_SECRET_LIVE` | 32+ chars |
| Checkout Intent Secret | `CHECKOUT_INTENT_SECRET` | 32+ chars |
| Magic Link Secret | `MAGIC_LINK_SECRET` | 32+ chars |
| Admin Secret | `ADMIN_SECRET` | 32+ chars |
| Resend API Key | `RESEND_API_KEY` | N/A |

Generate secure secrets:
```bash
openssl rand -base64 32
```

---

## Penetration Testing

See [tests/security/README.md](../tests/security/README.md) for the pen test suite.

Run security tests:
```bash
npm run test:secrets            # Audit local secret exposure in files + history
npm run test:security           # Against local Worker
npm run test:security:staging   # Against a staging worker, if you maintain one
```

`npm run test:premerge` now includes the secret audit automatically, so local merge gating checks both security behavior and accidental credential exposure.

For local runs, keep `CHECKOUT_INTENT_SECRET` configured if you want the live-worker checkout-start suite to exercise the real first-party signing path.

---

## Incident Response

### Token Compromise

If a magic link token is compromised:
1. The token is tied to a specific orderId/email/campaign
2. It can only access/modify that one authorized order
3. To invalidate: delete the pledge from KV (`GET /pledge` will then return `404` for that token)
4. Optionally: regenerate MAGIC_LINK_SECRET (invalidates ALL tokens)

### Admin Secret Compromise

1. Immediately rotate `ADMIN_SECRET` via `wrangler secret put`
2. Review audit logs for unauthorized admin actions
3. Re-check campaign stats and pledge data integrity

### Stripe Webhook Secret Compromise

1. Rotate the webhook secret in Stripe Dashboard → Webhooks
2. Update `STRIPE_WEBHOOK_SECRET_*` in Worker
3. Check for any suspicious pledges created during exposure window

### Missed Stripe Webhook (Development)

If the on-site payment step completes but the pledge doesn't appear yet (common in local dev when webhook forwarding is delayed or broken):

1. Check Stripe CLI output for webhook delivery status
2. The client will first try `/checkout-intent/complete` automatically for local recovery, but if the pledge still does not appear, use the admin recovery endpoint to manually create it:
   ```bash
   curl -X POST http://localhost:8787/admin/recover-checkout \
     -H 'Authorization: Bearer YOUR_ADMIN_SECRET' \
     -H 'Content-Type: application/json' \
     -d '{"sessionId": "cs_test_..."}'
   ```
3. The endpoint fetches the checkout session from Stripe and creates the pledge if it doesn't exist

**Prevention:**
- Use `scripts/dev.sh` which runs the Worker with local KV simulation
- `scripts/dev.sh` starts a single Stripe listener, forwards events to `127.0.0.1:8787/webhooks/stripe`, writes that same listener's `whsec_...` secret into `worker/.dev.vars`, and clears stale local processes on the standard dev ports before startup
- If you start Stripe manually, use the same listener instance for forwarding and for the secret you copy into local config
- `./scripts/dev.sh --podman` is the easiest way to keep the local site/Worker boundary production-like without relying on host Ruby/Wrangler setup
- For testing with seeded data, run `./scripts/seed-all-campaigns.sh` after starting the worker

---

## Security Contacts

- **Primary:** [alonso@dustwave.xyz]
- **Stripe Security:** [stripe.com/docs/security](https://stripe.com/docs/security)
- **Cloudflare Status:** [cloudflarestatus.com](https://www.cloudflarestatus.com)

---

_Last updated: Apr 9, 2026_
