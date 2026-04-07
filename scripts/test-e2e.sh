#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "🚀 Starting E2E tests..."

LOCAL_CONFIG_FILE="_config.local.yml"
LOCAL_CART_RUNTIME=$(grep -E '^cart_runtime:' "$LOCAL_CONFIG_FILE" 2>/dev/null | awk '{print $2}')
LOCAL_CHECKOUT_PROVIDER=$(grep -E '^checkout_provider:' "$LOCAL_CONFIG_FILE" 2>/dev/null | awk '{print $2}')
USES_FIRST_PARTY_LOCAL=false

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

prefer_node20_path || true

has_local_secret() {
    local key="$1"
    grep -q "^${key}=" "worker/.dev.vars" 2>/dev/null
}

if [ "$USES_FIRST_PARTY_LOCAL" = "true" ] && ! has_local_secret "CHECKOUT_INTENT_SECRET"; then
    echo "⚠️  CHECKOUT_INTENT_SECRET is missing from worker/.dev.vars."
    echo "   Automated E2E coverage still runs, but real first-party checkout start will fail closed."
fi

# Kill any existing processes
pkill -f "ngrok http" 2>/dev/null || true
pkill -f "jekyll serve" 2>/dev/null || true
sleep 1

# Start Jekyll with localhost first (for automated tests)
echo "🔨 Starting Jekyll (localhost)..."
rm -rf _site .jekyll-cache

# Temporarily use localhost URL for automated tests
LOCAL_URL="http://127.0.0.1:4000"
NGROK_URL="https://cole-unelapsed-patrice.ngrok-free.dev"

# Build with localhost for fast automated tests
sed -i.bak "s|^url:.*|url: $LOCAL_URL|" _config.local.yml
bundle exec jekyll serve --config _config.yml,_config.local.yml --port 4000 > /tmp/jekyll.log 2>&1 &
JEKYLL_PID=$!

# Wait for Jekyll
for i in {1..30}; do
    if curl -s http://127.0.0.1:4000 > /dev/null 2>&1; then
        echo "✅ Jekyll ready"
        break
    fi
    sleep 1
done

# Run automated tests first (no ngrok needed)
echo ""
echo "🧪 Running automated tests..."
CI=1 npx playwright test --headed
AUTOMATED_EXIT=$?

if [ $AUTOMATED_EXIT -ne 0 ]; then
    echo "❌ Automated tests failed"
    kill $JEKYLL_PID 2>/dev/null || true
    mv _config.local.yml.bak _config.local.yml
    exit $AUTOMATED_EXIT
fi

echo ""
echo "✅ Automated tests passed!"
echo ""

if [ "$USES_FIRST_PARTY_LOCAL" != "true" ]; then
    echo "🌐 Starting ngrok for checkout test..."

    # Start ngrok
    ngrok http 4000 --request-header-add "ngrok-skip-browser-warning:true" --log=stdout > /tmp/ngrok.log 2>&1 &
    NGROK_PID=$!
    sleep 3

    # Update config to use ngrok URL
    sed -i '' "s|^url:.*|url: $NGROK_URL|" _config.local.yml

    # Rebuild Jekyll with ngrok URL
    kill $JEKYLL_PID 2>/dev/null || true
    sleep 1
    rm -rf _site .jekyll-cache
    bundle exec jekyll serve --config _config.yml,_config.local.yml --port 4000 > /tmp/jekyll.log 2>&1 &
    JEKYLL_PID=$!

    # Wait for Jekyll
    for i in {1..30}; do
        if curl -s http://127.0.0.1:4000 > /dev/null 2>&1; then
            echo "✅ Jekyll ready with ngrok URL"
            break
        fi
        sleep 1
    done
else
    echo "⏭️  Local config uses first-party checkout; running manual checkout test on localhost"
fi

# Run manual checkout test
echo ""
echo "🧪 Running checkout test..."
npx playwright test --headed --grep "manual checkout"
CHECKOUT_EXIT=$?

# Cleanup
echo ""
echo "🧹 Cleaning up..."
kill $JEKYLL_PID 2>/dev/null || true
kill ${NGROK_PID:-0} 2>/dev/null || true
mv _config.local.yml.bak _config.local.yml

exit $CHECKOUT_EXIT
