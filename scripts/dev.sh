#!/bin/bash
# Start all dev services in parallel

trap 'kill 0' EXIT

echo "🚀 Starting development environment..."

# Check Stripe CLI login
if ! stripe config --list &>/dev/null; then
  echo "⚠️  Not logged into Stripe CLI. Running 'stripe login'..."
  stripe login
  if [ $? -ne 0 ]; then
    echo "❌ Stripe login failed. Continuing without webhook forwarding."
    SKIP_STRIPE=true
  fi
fi

# Check if ngrok is installed
if ! command -v ngrok &>/dev/null; then
  echo "⚠️  ngrok not found. Install it with 'brew install ngrok' for Snipcart webhook testing."
  SKIP_NGROK=true
else
  # Kill any existing ngrok processes to avoid port conflicts
  if pgrep -x ngrok > /dev/null; then
    echo "🔄 Killing existing ngrok processes..."
    killall ngrok 2>/dev/null
    sleep 1
  fi
fi

# Jekyll (without livereload - causes issues with iCloud Drive sync)
echo "📦 Starting Jekyll..."
bundle exec jekyll serve --config _config.yml,_config.local.yml &

# Wrangler (worker) - use local simulation for KV (faster, works with seed-all-campaigns.sh)
# Note: Real pledges from Stripe go to remote KV. Use --remote flag if you need them.
echo "⚡ Starting Wrangler (local KV)..."
(cd worker && source ~/.nvm/nvm.sh && nvm use 20 && wrangler dev --env dev) &

# Stripe CLI (forward webhooks to local worker)
if [ "$SKIP_STRIPE" != "true" ]; then
  echo "💳 Getting Stripe webhook secret..."
  STRIPE_SECRET=$(stripe listen --print-secret 2>/dev/null)
  if [ -n "$STRIPE_SECRET" ]; then
    # Update .dev.vars with the CLI webhook secret
    DEV_VARS="worker/.dev.vars"
    if [ -f "$DEV_VARS" ]; then
      if grep -q "^STRIPE_WEBHOOK_SECRET=" "$DEV_VARS"; then
        sed -i '' "s|^STRIPE_WEBHOOK_SECRET=.*|STRIPE_WEBHOOK_SECRET=$STRIPE_SECRET|" "$DEV_VARS"
      else
        echo "STRIPE_WEBHOOK_SECRET=$STRIPE_SECRET" >> "$DEV_VARS"
      fi
      echo "   Updated $DEV_VARS with CLI webhook secret"
    fi
  fi
  echo "💳 Starting Stripe webhook forwarding..."
  stripe listen --forward-to localhost:8787/webhooks/stripe &
else
  echo "⏭️  Skipping Stripe webhook forwarding"
fi

# ngrok tunnel for Snipcart product crawling (Jekyll on port 4000)
# Note: Free ngrok only supports 1 tunnel. For webhook testing, deploy the worker.
if [ "$SKIP_NGROK" != "true" ]; then
  echo "🌐 Starting ngrok tunnel for Jekyll (Snipcart product crawling)..."
  sleep 2  # Wait for Jekyll to start
  
  ngrok http 4000 --log=stdout > /tmp/ngrok.log 2>&1 &
  NGROK_PID=$!
  
  # Wait for ngrok to start
  sleep 4
  
  # Extract URL from ngrok API
  NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | python3 -c "
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
    echo "📝 For webhook testing, deploy the worker and set Snipcart webhook to:"
    echo "   https://pledge.dustwave.xyz/webhooks/snipcart"
    echo ""
  else
    echo "⚠️  Could not get ngrok URL. Check http://localhost:4040"
    echo "   Log: /tmp/ngrok.log"
    cat /tmp/ngrok.log | tail -5
  fi
else
  echo "⏭️  Skipping ngrok tunnel"
fi

echo ""
echo "✅ All services starting..."
echo "   Jekyll:   http://127.0.0.1:4000"
echo "   Worker:   http://127.0.0.1:8787"
echo "   Stripe:   forwarding to worker"
if [ "$SKIP_NGROK" != "true" ]; then
  echo "   ngrok:    http://localhost:4040 (inspect tunnels)"
fi
echo ""
echo "💡 TROUBLESHOOTING:"
echo "   If a Stripe checkout completes but pledge doesn't appear:"
echo "   1. Check Stripe CLI output for webhook delivery"
echo "   2. Use admin recovery endpoint to manually create pledge:"
echo ""
echo "      curl -X POST http://localhost:8787/admin/recover-checkout \\"
echo "        -H 'Authorization: Bearer YOUR_ADMIN_SECRET' \\"
echo "        -H 'Content-Type: application/json' \\"
echo "        -d '{\"sessionId\": \"cs_test_...\"}'"
echo ""
echo "Press Ctrl+C to stop all services"

wait
