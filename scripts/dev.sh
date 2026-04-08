#!/bin/bash
# Start all dev services in parallel

set -euo pipefail

for arg in "$@"; do
  if [ "$arg" = "--podman" ]; then
    exec "$(cd "$(dirname "$0")" && pwd)/dev-podman.sh"
  fi
done

trap 'kill 0' EXIT

JEKYLL_PORT=4000
WORKER_PORT=8787
NGROK_API_PORT=4040
STRIPE_LOG="/tmp/pool-stripe-listen.log"
LOCAL_CONFIG_FILE="_config.local.yml"
LOCAL_CART_RUNTIME=$(grep -E '^cart_runtime:' "$LOCAL_CONFIG_FILE" 2>/dev/null | awk '{print $2}')
LOCAL_CHECKOUT_PROVIDER=$(grep -E '^checkout_provider:' "$LOCAL_CONFIG_FILE" 2>/dev/null | awk '{print $2}')
USES_FIRST_PARTY_LOCAL=false
SKIP_STRIPE=false
SKIP_NGROK=false

if [ "$LOCAL_CART_RUNTIME" = "first_party" ] && [ "$LOCAL_CHECKOUT_PROVIDER" = "first_party" ]; then
  USES_FIRST_PARTY_LOCAL=true
fi

prefer_node20_path() {
  local candidate=""
  for candidate in \
    "$HOME/.nvm/versions/node/v20.19.6/bin" \
    "$HOME/.nvm/versions/node/v20.*/bin"
  do
    for resolved in $candidate; do
      if [ -x "$resolved/node" ]; then
        export PATH="$resolved:$PATH"
        return 0
      fi
    done
  done
  return 1
}

prefer_stripe_path() {
  local candidate=""
  for candidate in \
    "/opt/homebrew/bin" \
    "/usr/local/bin" \
    "$HOME/.local/bin"
  do
    if [ -x "$candidate/stripe" ]; then
      export PATH="$candidate:$PATH"
      return 0
    fi
  done
  return 1
}

has_local_secret() {
  local key="$1"
  grep -q "^${key}=" "worker/.dev.vars" 2>/dev/null
}

generate_local_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return 0
  fi

  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
}

ensure_local_secret() {
  local key="$1"
  local value=""

  if has_local_secret "$key"; then
    return 0
  fi

  value="$(generate_local_secret)"
  if [ -z "$value" ]; then
    echo "❌ Failed to generate local secret for $key"
    return 1
  fi

  echo "${key}=${value}" >> worker/.dev.vars
  echo "🔐 Added missing ${key} to worker/.dev.vars"
}

run_stripe_login() {
  echo "🔐 Refreshing Stripe CLI authentication..."
  printf '\n' | stripe login
}

start_stripe_listener() {
  rm -f "$STRIPE_LOG"
  stripe listen --forward-to "127.0.0.1:$WORKER_PORT/webhooks/stripe" > "$STRIPE_LOG" 2>&1 &
  STRIPE_LISTEN_PID=$!
}

wait_for_stripe_secret() {
  local secret=""
  for _ in $(seq 1 20); do
    if [ -f "$STRIPE_LOG" ]; then
      secret=$(grep -Eo 'whsec_[A-Za-z0-9_]+' "$STRIPE_LOG" 2>/dev/null | head -1 || true)
      if [ -n "$secret" ]; then
        echo "$secret"
        return 0
      fi
      if grep -q "Authorization failed" "$STRIPE_LOG"; then
        return 1
      fi
    fi
    sleep 1
  done
  return 1
}

kill_port_if_busy() {
  local port="$1"
  local label="$2"
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids=$(lsof -ti tcp:"$port" || true)
    if [ -n "$pids" ]; then
      echo "🔄 Clearing existing $label process(es) on port $port..."
      while IFS= read -r pid; do
        [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
      done <<< "$pids"
      sleep 1
    fi
  fi
}

echo "🚀 Starting development environment..."

prefer_node20_path || true
prefer_stripe_path || true

if [ "$USES_FIRST_PARTY_LOCAL" = "true" ]; then
  ensure_local_secret "CHECKOUT_INTENT_SECRET"
fi

# Check Stripe CLI login
if ! stripe config --list &>/dev/null; then
  echo "⚠️  Not logged into Stripe CLI. Running 'stripe login'..."
  run_stripe_login
  if [ $? -ne 0 ]; then
    echo "❌ Stripe login failed. Continuing without webhook forwarding."
    SKIP_STRIPE=true
  fi
fi

# Check if ngrok is installed
if ! command -v ngrok &>/dev/null; then
  if [ "$USES_FIRST_PARTY_LOCAL" != "true" ]; then
    echo "⚠️  ngrok not found. Install it with 'brew install ngrok' for external tunnel testing."
  fi
  SKIP_NGROK=true
else
  # Kill any existing ngrok processes to avoid port conflicts
  if pgrep -x ngrok > /dev/null; then
    echo "🔄 Killing existing ngrok processes..."
    killall ngrok 2>/dev/null
    sleep 1
  fi
fi

# Clear stale local services so the dev environment matches the test harness ports.
kill_port_if_busy "$JEKYLL_PORT" "Jekyll"
kill_port_if_busy "$WORKER_PORT" "Worker"
kill_port_if_busy "$NGROK_API_PORT" "ngrok inspector"

# Jekyll (without livereload - causes issues with iCloud Drive sync)
echo "📦 Starting Jekyll..."
bundle exec jekyll serve --config _config.yml,_config.local.yml --port "$JEKYLL_PORT" &

# Wrangler (worker) - use local simulation for KV (faster, works with seed-all-campaigns.sh)
# Note: Real pledges from Stripe go to remote KV. Use --remote flag if you need them.
echo "⚡ Starting Wrangler (local KV)..."
(cd worker && {
  prefer_node20_path || true
  npx wrangler dev --env dev --port "$WORKER_PORT"
}) &

# Stripe CLI (forward webhooks to local worker)
if [ "${SKIP_STRIPE:-false}" != "true" ]; then
  echo "💳 Starting Stripe webhook forwarding..."
  start_stripe_listener

  echo "💳 Waiting for Stripe webhook secret..."
  STRIPE_SECRET="$(wait_for_stripe_secret || true)"

  if [ -z "$STRIPE_SECRET" ] && [ -f "$STRIPE_LOG" ] && grep -q "Authorization failed" "$STRIPE_LOG"; then
    echo "⚠️  Stripe CLI authentication appears stale. Re-running 'stripe login'..."
    kill "$STRIPE_LISTEN_PID" 2>/dev/null || true
    wait "$STRIPE_LISTEN_PID" 2>/dev/null || true
    if run_stripe_login; then
      echo "💳 Retrying Stripe webhook forwarding..."
      start_stripe_listener
      STRIPE_SECRET="$(wait_for_stripe_secret || true)"
    else
      echo "❌ Stripe login failed. Continuing without webhook forwarding."
      SKIP_STRIPE=true
    fi
  fi

  if [ "${SKIP_STRIPE:-false}" != "true" ] && [ -n "$STRIPE_SECRET" ]; then
    DEV_VARS="worker/.dev.vars"
    if [ -f "$DEV_VARS" ]; then
      if grep -q "^STRIPE_WEBHOOK_SECRET=" "$DEV_VARS"; then
        sed -i '' "s|^STRIPE_WEBHOOK_SECRET=.*|STRIPE_WEBHOOK_SECRET=$STRIPE_SECRET|" "$DEV_VARS"
      else
        echo "STRIPE_WEBHOOK_SECRET=$STRIPE_SECRET" >> "$DEV_VARS"
      fi
      echo "   Updated $DEV_VARS with Stripe listener secret"
    fi
  elif [ "${SKIP_STRIPE:-false}" != "true" ]; then
    echo "⚠️  Could not detect Stripe webhook secret from listener output"
    if [ -f "$STRIPE_LOG" ] && grep -q "Authorization failed" "$STRIPE_LOG"; then
      echo "   Stripe CLI authentication failed even after retrying login."
    fi
    echo "   Check $STRIPE_LOG and update worker/.dev.vars manually if needed"
    SKIP_STRIPE=true
  fi
else
  echo "⏭️  Skipping Stripe webhook forwarding"
fi

# ngrok is only needed when validating an external tunnel locally.
if [ "$USES_FIRST_PARTY_LOCAL" = "true" ]; then
  echo "⏭️  Local config uses first-party cart/checkout; skipping ngrok tunnel setup"
elif [ "${SKIP_NGROK:-false}" != "true" ]; then
  echo "🌐 Starting ngrok tunnel for Jekyll..."
  sleep 2  # Wait for Jekyll to start
  
  ngrok http "$JEKYLL_PORT" --log=stdout > /tmp/ngrok.log 2>&1 &
  NGROK_PID=$!
  
  # Wait for ngrok to start
  sleep 4
  
  # Extract URL from ngrok API
  NGROK_URL=$(curl -s "http://127.0.0.1:$NGROK_API_PORT/api/tunnels" 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for t in data.get('tunnels', []):
        url = t.get('public_url', '')
        if url.startswith('https://'):
            print(url)
            break
except: pass
" 2>/dev/null)
  
  if [ -n "$NGROK_URL" ]; then
    echo ""
    echo "📋 NGROK TUNNEL:"
    echo "   Jekyll: $NGROK_URL"
    echo ""
    echo "⚠️  UPDATE _config.local.yml:"
    echo "   url: $NGROK_URL"
    echo ""
    echo "📝 ngrok is optional now and mainly useful for external-device testing."
    echo "   The first-party checkout flow does not require vendor product crawling."
    echo ""
  else
    echo "⚠️  Could not get ngrok URL. Check http://127.0.0.1:$NGROK_API_PORT"
    echo "   Log: /tmp/ngrok.log"
    cat /tmp/ngrok.log | tail -5
  fi
else
  echo "⏭️  Skipping ngrok tunnel"
fi

echo ""
echo "✅ All services starting..."
echo "   Jekyll:   http://127.0.0.1:$JEKYLL_PORT"
echo "   Worker:   http://127.0.0.1:$WORKER_PORT"
if [ "${SKIP_STRIPE:-false}" = "true" ]; then
  echo "   Stripe:   webhook forwarding inactive"
else
  echo "   Stripe:   forwarding to worker"
fi
if [ "$USES_FIRST_PARTY_LOCAL" != "true" ] && [ "${SKIP_NGROK:-false}" != "true" ]; then
  echo "   ngrok:    http://127.0.0.1:$NGROK_API_PORT (inspect tunnels)"
fi
echo ""
echo "💡 TROUBLESHOOTING:"
echo "   If a Stripe checkout completes but pledge doesn't appear:"
echo "   1. Check Stripe CLI output for webhook delivery"
echo "   2. If Stripe forwarding is inactive, rerun ./scripts/dev.sh and finish the browser auth"
echo "   3. Use admin recovery endpoint to manually create pledge:"
echo ""
echo "      curl -X POST http://localhost:8787/admin/recover-checkout \\"
echo "        -H 'Authorization: Bearer YOUR_ADMIN_SECRET' \\"
echo "        -H 'Content-Type: application/json' \\"
echo "        -d '{\"sessionId\": \"cs_test_...\"}'"
echo ""
echo "🧪 USEFUL CHECKS:"
echo "   npm run test:secrets"
echo "   ./scripts/test-worker.sh"
echo "   ./scripts/smoke-pledge-management.sh"
echo ""
echo "Press Ctrl+C to stop all services"

wait
