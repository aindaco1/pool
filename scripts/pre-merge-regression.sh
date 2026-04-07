#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

WORKER_PID=""
JEKYLL_PID=""
TEMP_DEV_VARS=""
ORIGINAL_DEV_VARS_BACKUP=""

stop_worker() {
  if [[ -n "${WORKER_PID}" ]]; then
    kill "${WORKER_PID}" 2>/dev/null || true
    wait "${WORKER_PID}" 2>/dev/null || true
    WORKER_PID=""
  fi
}

start_worker() {
  (
    export PATH="$HOME/.nvm/versions/node/v20.19.6/bin:$PATH"
    cd worker && npx wrangler dev --env dev --port 8787 >/tmp/pool-premerge-worker.log 2>&1
  ) &
  WORKER_PID=$!

  for _ in {1..60}; do
    if curl -s "http://127.0.0.1:8787/notfound" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Worker failed to start. See /tmp/pool-premerge-worker.log"
  return 1
}

cleanup() {
  stop_worker
  if [[ -n "${JEKYLL_PID}" ]]; then
    kill "${JEKYLL_PID}" 2>/dev/null || true
    wait "${JEKYLL_PID}" 2>/dev/null || true
  fi
  if [[ -n "${TEMP_DEV_VARS}" && -f "${TEMP_DEV_VARS}" ]]; then
    rm -f "${TEMP_DEV_VARS}"
  fi
  if [[ -n "${ORIGINAL_DEV_VARS_BACKUP}" && -f "${ORIGINAL_DEV_VARS_BACKUP}" ]]; then
    mv "${ORIGINAL_DEV_VARS_BACKUP}" worker/.dev.vars
  fi
}

trap cleanup EXIT

echo "==> Pre-merge regression checks"
echo ""

export SITE_BASE="${SITE_BASE:-http://127.0.0.1:4000}"
export WORKER_BASE="${WORKER_BASE:-http://127.0.0.1:8787}"
export WORKER_URL="${WORKER_URL:-http://127.0.0.1:8787}"
export APP_MODE="${APP_MODE:-test}"
export STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-sk_test_smoke}"
export STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-whsec_smoke}"
export ADMIN_SECRET="${ADMIN_SECRET:-test-admin-secret}"
export MAGIC_LINK_SECRET="${MAGIC_LINK_SECRET:-test-magic-link-secret}"
export RESEND_API_KEY="${RESEND_API_KEY:-re_test_smoke}"
SMOKE_ADMIN_SECRET="${ADMIN_SECRET}"

if [[ -f worker/.dev.vars ]]; then
  DEV_ADMIN_SECRET="$(grep '^ADMIN_SECRET=' worker/.dev.vars | head -1 | cut -d= -f2- || true)"
  if [[ -n "${DEV_ADMIN_SECRET}" ]]; then
    SMOKE_ADMIN_SECRET="${DEV_ADMIN_SECRET}"
  fi
fi

echo "1. Secret audit"
npm run test:secrets
echo ""

echo "2. Syntax checks"
node --check worker/src/index.js
node --check worker/src/stats.js
echo ""

echo "3. Focused regression suites"
npx vitest run \
  tests/unit/worker-business-logic.test.ts \
  tests/unit/worker-ops-integrity.test.ts \
  tests/unit/stats-pagination.test.ts
echo ""

echo "4. Full unit suite"
npm run test:unit
echo ""

echo "5. First-party build artifact checks"
bundle exec jekyll build --config _config.yml,_config.local.yml --quiet

if ! rg -n '\.pool-first-party-cart__panel' _site/assets/main.css >/dev/null; then
  echo "main.css is missing expected first-party cart UI styles"
  exit 1
fi
echo ""

echo "6. Security suite"
if command -v lsof >/dev/null 2>&1; then
  EXISTING_WORKER_PIDS="$(lsof -ti tcp:8787 || true)"
  if [[ -n "${EXISTING_WORKER_PIDS}" ]]; then
    echo "Stopping existing process(es) on port 8787"
    while IFS= read -r pid; do
      [[ -n "${pid}" ]] && kill "${pid}" 2>/dev/null || true
    done <<< "${EXISTING_WORKER_PIDS}"
    sleep 1
  fi
fi

if [[ -f worker/.dev.vars ]]; then
  ORIGINAL_DEV_VARS_BACKUP="$(mktemp)"
  cp worker/.dev.vars "${ORIGINAL_DEV_VARS_BACKUP}"
  {
    cat "${ORIGINAL_DEV_VARS_BACKUP}"
    grep -q '^STRIPE_SECRET_KEY=' "${ORIGINAL_DEV_VARS_BACKUP}" || echo "STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}"
    grep -q '^SITE_BASE=' "${ORIGINAL_DEV_VARS_BACKUP}" || echo "SITE_BASE=${SITE_BASE}"
    grep -q '^ADMIN_SECRET=' "${ORIGINAL_DEV_VARS_BACKUP}" || echo "ADMIN_SECRET=${ADMIN_SECRET}"
    grep -q '^RESEND_API_KEY=' "${ORIGINAL_DEV_VARS_BACKUP}" || echo "RESEND_API_KEY=${RESEND_API_KEY}"
    grep -q '^MAGIC_LINK_SECRET=' "${ORIGINAL_DEV_VARS_BACKUP}" || echo "MAGIC_LINK_SECRET=${MAGIC_LINK_SECRET}"
    grep -q '^STRIPE_WEBHOOK_SECRET=' "${ORIGINAL_DEV_VARS_BACKUP}" || echo "STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}"
  } > worker/.dev.vars
else
  TEMP_DEV_VARS="worker/.dev.vars"
  cat > "${TEMP_DEV_VARS}" <<EOF
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
SITE_BASE=${SITE_BASE}
ADMIN_SECRET=${ADMIN_SECRET}
RESEND_API_KEY=${RESEND_API_KEY}
MAGIC_LINK_SECRET=${MAGIC_LINK_SECRET}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
EOF
fi

start_worker || exit 1

npm run test:security
echo ""

echo "7. Local mutable-pledge smoke"
stop_worker
start_worker || exit 1

if ! curl -s "http://127.0.0.1:4000" >/dev/null 2>&1; then
  bundle exec jekyll serve --config _config.yml,_config.local.yml --port 4000 >/tmp/pool-premerge-jekyll.log 2>&1 &
  JEKYLL_PID=$!
fi

for _ in {1..60}; do
  if curl -s "http://127.0.0.1:4000" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -s "http://127.0.0.1:4000" >/dev/null 2>&1; then
  echo "Jekyll failed to start. See /tmp/pool-premerge-jekyll.log"
  exit 1
fi

SITE_URL=http://127.0.0.1:4000 WORKER_URL=http://127.0.0.1:8787 ./scripts/test-worker.sh
WORKER_URL=http://127.0.0.1:8787 ADMIN_SECRET="${SMOKE_ADMIN_SECRET}" ./scripts/smoke-pledge-management.sh
echo ""

echo "8. E2E suite"
npm run test:e2e:headless
echo ""

echo "Pre-merge regression checks completed."
