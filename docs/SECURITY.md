# Security Guide

This document covers the security architecture, known risks, hardening recommendations, and penetration testing procedures for The Pool crowdfunding platform.

## Security Architecture

### Authentication Mechanisms

| Mechanism | Endpoints | Description |
|-----------|-----------|-------------|
| **Magic Link Tokens** | `/pledge*`, `/pledges`, `/votes` | HMAC-SHA256 signed tokens with 90-day expiry |
| **Stripe Webhook Signature** | `/webhooks/stripe` | HMAC-SHA256 verification per Stripe spec |
| **Snipcart Webhook Token** | `/webhooks/snipcart` | `x-snipcart-requesttoken` header verification |
| **Admin Secret** | `/admin/*` | `Authorization: Bearer <secret>` or `x-admin-key` header |
| **Test Mode Guard** | `/test/*` | `SNIPCART_MODE === 'test'` environment check |

### Data Storage (Cloudflare KV)

| Key Pattern | Namespace | Data | Sensitivity |
|-------------|-----------|------|-------------|
| `pledge:{orderId}` | PLEDGES | Email, amount, Stripe IDs, status | **High** - PII + payment data |
| `email:{email}` | PLEDGES | Array of order IDs | **Medium** - links email to pledges |
| `stats:{slug}` | PLEDGES | Aggregate totals | **Low** - public |
| `inventory:{slug}` | PLEDGES | Tier claim counts | **Low** - public |
| `stripe-event:{id}` | PLEDGES | "processed" flag | **Low** - idempotency |
| `vote:{slug}:{decision}:{orderId}` | VOTES | Vote choice | **Medium** - links supporter to vote |
| `results:{slug}:{decision}` | VOTES | Vote tallies | **Low** - semi-public |
| `rl:{endpoint}:{ip}` | RATELIMIT | Request count + reset time | **Low** - ephemeral |

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
| SEC-007 | Snipcart webhook verification may be incomplete | **Medium** | ✅ Fixed |

### Low Priority

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| SEC-008 | Magic link tokens long-lived (90 days) | **Low** | Acceptable |
| SEC-009 | Input validation on votes could be stricter | **Low** | ✅ Fixed |
| SEC-010 | Tokens in query strings (Referer leakage risk) | **Low** | Acceptable |
| SEC-011 | Input validation on /start (slug, email, amount) | **Low** | ✅ Fixed |
| SEC-012 | Missing security response headers | **Low** | ✅ Fixed |

---

## Hardening Recommendations

### SEC-001: Lock Down Dev-Token Bypass

**File:** `worker/src/routes/votes.js`

**Current (VULNERABLE):**
```javascript
if (token.startsWith('dev-token-')) {
  campaignSlug = token.replace('dev-token-', '');
  orderId = 'dev-order-1';
}
```

**Fixed:**
```javascript
if (token.startsWith('dev-token-')) {
  if (env.SNIPCART_MODE !== 'test') {
    return jsonResponse({ error: 'Invalid token' }, 401);
  }
  campaignSlug = token.replace('dev-token-', '');
  orderId = 'dev-order-1';
}
```

---

### SEC-002: Fail Closed on Missing Stripe Webhook Secret

**File:** `worker/src/index.js` (handleStripeWebhook)

**Current (VULNERABLE):**
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

### SEC-003: Guard Test Endpoints

**File:** `worker/src/index.js` (router)

Add centralized guard before test endpoint routing:

```javascript
// Block test endpoints in production
if (path.startsWith('/test/') && env.SNIPCART_MODE !== 'test') {
  return jsonResponse({ error: 'Not found' }, 404);
}
```

Each handler should also verify (defense in depth):
```javascript
async function handleTestSetup(request, env) {
  if (env.SNIPCART_MODE !== 'test') {
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

**Rate Limits:**

| Endpoint | Limit | Window | Notes |
|----------|-------|--------|-------|
| `/start` | 20 requests | 1 minute | Pledge creation |
| `/votes` | 30 requests | 1 minute | Voting endpoints |
| `/admin/*` | 5 requests | 1 minute | Admin operations |
| `/pledge/*` | 20 requests | 1 minute | Pledge management |
| `/webhooks/*` | 100 requests | 1 minute | Webhook handlers |

**How It Works:**

- Rate limits are tracked **per IP address** using `CF-Connecting-IP` header
- Each IP gets its own bucket, so 100 different users won't interfere with each other
- The 20/min `/start` limit accommodates shared NAT environments (offices, universities)

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

**Note:** Rate limiting is optional - if `RATELIMIT` KV is not configured, requests proceed without limits. This allows gradual rollout.

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

### SEC-006: Timing-Safe Admin Secret Comparison

**File:** `worker/src/index.js`

Add helper:
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

### SEC-007: Verify Snipcart Webhook Token

**File:** `worker/src/index.js` (handleSnipcartWebhook)

Current implementation looks correct but ensure fail-closed:
```javascript
async function handleSnipcartWebhook(request, env, ctx) {
  if (env.SNIPCART_WEBHOOK_SECRET) {
    const requestToken = request.headers.get('x-snipcart-requesttoken');
    if (!timingSafeEqual(requestToken, env.SNIPCART_WEBHOOK_SECRET)) {
      console.error('Invalid Snipcart webhook token');
      return jsonResponse({ error: 'Invalid token' }, 401);
    }
  } else {
    // Fail closed if secret not configured
    console.error('SNIPCART_WEBHOOK_SECRET not configured');
    return jsonResponse({ error: 'Webhook not configured' }, 500);
  }
  // ...
}
```

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

### SEC-011: Input Validation on /start (✅ FIXED)

**File:** `worker/src/index.js`, `worker/src/validation.js`

The `/start` endpoint now validates:
- Campaign slugs: max 100 chars, alphanumeric + hyphens only (prevents injection/traversal)
- Email addresses: RFC-compliant format, max 254 chars
- Amount: positive integer, max $1M (100,000,000 cents)

```javascript
if (!isValidSlug(campaignSlug)) {
  return jsonResponse({ error: 'Invalid campaign slug format' }, 400);
}

if (email && !isValidEmail(email)) {
  return jsonResponse({ error: 'Invalid email format' }, 400);
}

if (amountCents !== undefined && !isValidAmount(amountCents)) {
  return jsonResponse({ error: 'Invalid amount' }, 400);
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
| Snipcart Secret | `SNIPCART_SECRET_LIVE` | N/A |
| Snipcart Webhook Token | `SNIPCART_WEBHOOK_SECRET` | 32+ chars |
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
npm run test:security           # Against local Worker
npm run test:security:staging   # Against staging (pledge-staging.dustwave.xyz)
```

---

## Incident Response

### Token Compromise

If a magic link token is compromised:
1. The token is tied to a specific orderId/email/campaign
2. It can only access/modify that user's pledges
3. To invalidate: delete the pledge from KV (orderId will no longer exist)
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

If a checkout completes but the pledge doesn't appear (common in local dev):

1. Check Stripe CLI output for webhook delivery status
2. Use the admin recovery endpoint to manually create the pledge:
   ```bash
   curl -X POST http://localhost:8787/admin/recover-checkout \
     -H 'Authorization: Bearer YOUR_ADMIN_SECRET' \
     -H 'Content-Type: application/json' \
     -d '{"sessionId": "cs_test_..."}'
   ```
3. The endpoint fetches the checkout session from Stripe and creates the pledge if it doesn't exist

**Prevention:**
- Use `scripts/dev.sh` which runs the Worker with local KV simulation
- Ensure `stripe listen --forward-to localhost:8787/webhooks/stripe` is running
- Verify `STRIPE_WEBHOOK_SECRET` in `.dev.vars` matches `stripe listen --print-secret`
- For testing with seeded data, run `./scripts/seed-all-campaigns.sh` after starting the worker

---

## Security Contacts

- **Primary:** [your-email@dustwave.xyz]
- **Stripe Security:** [stripe.com/docs/security](https://stripe.com/docs/security)
- **Cloudflare Status:** [cloudflarestatus.com](https://www.cloudflarestatus.com)

---

_Last updated: Jan 2026_
