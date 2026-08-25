# Security Penetration Tests

This directory contains security-focused tests for the Worker API. Run these before deploying to production.

## Quick Start

```bash
# Audit local secret exposure first
npm run test:secrets

# 1. Start the local Worker (in worker/ directory)
cd worker && npx wrangler dev --port 8787

# 2. Run security tests (in project root)
npm run test:security

# Run against staging
WORKER_URL=https://pledge-staging.dustwave.xyz npm run test:security

# Run against production (read-only tests only)
WORKER_URL=https://pledge.dustwave.xyz PROD_MODE=true npm run test:security
```

## Local Development Setup

For the live-worker webhook checks, configure the Stripe webhook secret locally.

- `STRIPE_WEBHOOK_SECRET`

The easiest way to get a matching local setup is:

```bash
./scripts/dev.sh
```

or the merge gate:

```bash
npm run test:premerge
```

`npm run test:premerge` includes the secret audit automatically before the Worker, smoke, and browser suites.

For rate limiting tests to work locally, ensure the `RATELIMIT` KV namespace is configured in `wrangler.toml`. The Worker treats that binding as required:

```toml
# In [[kv_namespaces]] section (production)
[[kv_namespaces]]
binding = "RATELIMIT"
id = "YOUR_RATELIMIT_KV_ID"
preview_id = "YOUR_RATELIMIT_PREVIEW_ID"

# Also in [[env.dev.kv_namespaces]] section (development)
[[env.dev.kv_namespaces]]
binding = "RATELIMIT"
id = "YOUR_RATELIMIT_KV_ID"
preview_id = "YOUR_RATELIMIT_PREVIEW_ID"
```

**Note:** Restart the Worker after making changes to reset rate limit counters (KV is simulated locally and resets on restart).

## Test Categories

### 1. Authentication Bypass (`auth-bypass.test.ts`)
- Dev-token bypass on `/votes` endpoints
- Missing/invalid magic link tokens
- Expired tokens
- Tampered token signatures

### 2. Webhook Security (`webhook-security.test.ts`)
- Invalid Stripe signatures
- Replay attacks (same event ID)
- Malformed webhook payloads
- Missing signature headers
- Stripe webhook surface requires valid signatures

### 3. Authorization (`authorization.test.ts`)
- Cross-user pledge access attempts
- Admin endpoint access without secret
- Test endpoint access in production mode

### 4. Input Validation (`input-validation.test.ts`)
- Oversized payloads
- Malicious campaign slugs
- SQL/NoSQL injection patterns
- XSS payloads in user fields

### 5. Rate Limiting (`rate-limiting.test.ts`)
- Public `/stats/:slug` bursts stay uncapped so campaign virality is not treated like abuse
- Burst requests to `/checkout-intent/start` hit the enforced write bucket
- Manage Pledge reads and writes hit their own higher but enforced buckets
- Vote spam attempts (45 req/min limit)
- Admin brute force simulation (5 req/min limit)
- Resource exhaustion prevention rejects oversized checkout bodies with `413`
- DoS resilience and concurrent operation safety
- Concurrent operation safety

## Configuration

Set these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKER_URL` | `http://localhost:8787` | Worker endpoint to test |
| `PROD_MODE` | `false` | Skip destructive tests |
| `ADMIN_SECRET` | (none) | Admin secret for auth tests |
| `ADMIN_SETTLEMENT_SECRET` | (none) | Optional scoped settlement secret for environments that enforce settlement auth |
| `ADMIN_BROADCAST_SECRET` | (none) | Optional scoped broadcast secret for environments that enforce broadcast/diary auth |
| `TEST_TOKEN` | (none) | Valid magic link token for auth tests |

## CI Integration

Add to GitHub Actions:

```yaml
security-tests:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
    - run: npm ci
    - run: npm run test:security
      env:
        WORKER_URL: ${{ secrets.STAGING_WORKER_URL }}
```

## Writing New Tests

```typescript
import { test, expect, describe } from 'vitest';
import { securityFetch, expectUnauthorized } from './helpers';

describe('My Security Test', () => {
  test('rejects invalid input', async () => {
    const res = await securityFetch('/endpoint', {
      method: 'POST',
      body: JSON.stringify({ malicious: '<script>alert(1)</script>' })
    });
    
    // The test passes when the request is rejected.
    expect(res.status).toBe(400);
  });
});
```
