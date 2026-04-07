#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

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

echo "🚀 Starting E2E checkout test..."

if [ "$USES_FIRST_PARTY_LOCAL" = "true" ] && ! has_local_secret "CHECKOUT_INTENT_SECRET"; then
    echo "⚠️  CHECKOUT_INTENT_SECRET is missing from worker/.dev.vars."
    echo "   First-party manual checkout will fail until that local secret is set."
fi

# Check for ngrok only when validating an external tunnel path.
if [ "$USES_FIRST_PARTY_LOCAL" != "true" ] && ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok not found. Install with: brew install ngrok"
    exit 1
fi

# Kill any existing ngrok/jekyll processes
pkill -f "ngrok http" 2>/dev/null || true
pkill -f "jekyll serve" 2>/dev/null || true
sleep 1

# Update _config.local.yml with ngrok URL
CONFIG_FILE="_config.local.yml"
BACKUP_FILE="_config.local.yml.bak"
LOCAL_URL="http://127.0.0.1:4000"

# Backup original config
cp "$CONFIG_FILE" "$BACKUP_FILE"

if [ "$USES_FIRST_PARTY_LOCAL" = "true" ]; then
    sed -i '' "s|^url:.*|url: $LOCAL_URL|" "$CONFIG_FILE"
    echo "📝 Using localhost checkout URLs for first-party local testing"
else
    # Start ngrok in background with header to bypass browser warning
    echo "🌐 Starting ngrok tunnel for checkout..."
    ngrok http 4000 --request-header-add "ngrok-skip-browser-warning:true" --log=stdout > /tmp/ngrok.log 2>&1 &
    NGROK_PID=$!

    # Wait for ngrok to start and get URL
    echo "⏳ Waiting for ngrok to initialize..."
    sleep 3

    # Get the ngrok URL from the API
    NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels | grep -o '"public_url":"https://[^"]*' | head -1 | sed 's/"public_url":"//')

    if [ -z "$NGROK_URL" ]; then
        echo "❌ Failed to get ngrok URL. Check if ngrok is authenticated."
        echo "   Run: ngrok config add-authtoken YOUR_TOKEN"
        kill ${NGROK_PID:-0} 2>/dev/null || true
        exit 1
    fi

    echo "✅ ngrok URL: $NGROK_URL"
    sed -i '' "s|^url:.*|url: $NGROK_URL|" "$CONFIG_FILE"
    echo "📝 Updated $CONFIG_FILE with ngrok URL"

    # Remind about the optional public tunnel domain
    NGROK_DOMAIN=$(echo "$NGROK_URL" | sed 's|https://||')
    WILDCARD_DOMAIN=$(echo "$NGROK_DOMAIN" | sed 's/^[^.]*/*./')
    echo ""
    echo "ℹ️  If you are testing from external devices, allow this tunnel domain:"
    echo "   $WILDCARD_DOMAIN"
    echo ""
fi

# Skip prompt if SKIP_CHECKOUT_PROMPT is set
if [ -z "${SKIP_CHECKOUT_PROMPT:-}" ]; then
    read -p "Press Enter to continue (set SKIP_CHECKOUT_PROMPT=1 to skip)..."
fi

# Clear Jekyll cache and start server
echo "🔨 Building Jekyll..."
rm -rf _site .jekyll-cache
bundle exec jekyll serve --port 4000 > /tmp/jekyll.log 2>&1 &
JEKYLL_PID=$!

# Wait for Jekyll to be ready
echo "⏳ Waiting for Jekyll to start..."
for i in {1..30}; do
    if curl -s http://127.0.0.1:4000 > /dev/null 2>&1; then
        echo "✅ Jekyll is ready"
        break
    fi
    sleep 1
done

# Run the checkout test
echo "🧪 Running checkout test..."
echo ""
MANUAL_CHECKOUT=1 npm run test:e2e -- --headed --grep "manual checkout"
TEST_EXIT=$?

# Cleanup
echo ""
echo "🧹 Cleaning up..."
kill $JEKYLL_PID 2>/dev/null || true
kill ${NGROK_PID:-0} 2>/dev/null || true

# Restore original config
mv "$BACKUP_FILE" "$CONFIG_FILE"
echo "✅ Restored original $CONFIG_FILE"

exit $TEST_EXIT
