#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

WORKER_PID=""

cleanup() {
  if [[ -n "${WORKER_PID}" ]]; then
    kill "${WORKER_PID}" 2>/dev/null || true
    wait "${WORKER_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT

echo "==> Pre-merge regression checks"
echo ""

export SITE_BASE="${SITE_BASE:-http://127.0.0.1:4000}"
export WORKER_BASE="${WORKER_BASE:-http://127.0.0.1:8787}"
export WORKER_URL="${WORKER_URL:-http://127.0.0.1:8787}"
export SNIPCART_MODE="${SNIPCART_MODE:-test}"
export STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-sk_test_smoke}"
export STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-whsec_smoke}"
export ADMIN_SECRET="${ADMIN_SECRET:-test-admin-secret}"
export MAGIC_LINK_SECRET="${MAGIC_LINK_SECRET:-test-magic-link-secret}"
export RESEND_API_KEY="${RESEND_API_KEY:-re_test_smoke}"
export SNIPCART_WEBHOOK_SECRET="${SNIPCART_WEBHOOK_SECRET:-snipcart_test_secret}"

echo "1. Syntax checks"
node --check worker/src/index.js
node --check worker/src/stats.js
node --check worker/src/snipcart.js
echo ""

echo "2. Focused regression suites"
npx vitest run \
  tests/unit/worker-business-logic.test.ts \
  tests/unit/worker-ops-integrity.test.ts \
  tests/unit/stats-pagination.test.ts
echo ""

echo "3. Full unit suite"
npm run test:unit
echo ""

echo "4. Security suite"
if [[ -f worker/.dev.vars ]]; then
  set -a
  # shellcheck disable=SC1091
  source worker/.dev.vars
  set +a
fi

(cd worker && npx wrangler dev --env dev --port 8787 >/tmp/pool-premerge-worker.log 2>&1) &
WORKER_PID=$!

for _ in {1..60}; do
  if curl -s "http://127.0.0.1:8787/notfound" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -s "http://127.0.0.1:8787/notfound" >/dev/null 2>&1; then
  echo "Worker failed to start. See /tmp/pool-premerge-worker.log"
  exit 1
fi

npm run test:security
cleanup
WORKER_PID=""
echo ""

echo "5. E2E suite"
npm run test:e2e:headless
echo ""

echo "Pre-merge regression checks completed."
