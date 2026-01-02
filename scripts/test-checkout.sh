#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "🚀 Starting E2E checkout test with ngrok..."

# Check for ngrok
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok not found. Install with: brew install ngrok"
    exit 1
fi

# Kill any existing ngrok/jekyll processes
pkill -f "ngrok http" 2>/dev/null || true
pkill -f "jekyll serve" 2>/dev/null || true
sleep 1

# Start ngrok in background with header to bypass browser warning
echo "🌐 Starting ngrok tunnel..."
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
    kill $NGROK_PID 2>/dev/null || true
    exit 1
fi

echo "✅ ngrok URL: $NGROK_URL"

# Update _config.local.yml with ngrok URL
CONFIG_FILE="_config.local.yml"
BACKUP_FILE="_config.local.yml.bak"

# Backup original config
cp "$CONFIG_FILE" "$BACKUP_FILE"

# Update the URL in config
sed -i '' "s|^url:.*|url: $NGROK_URL|" "$CONFIG_FILE"

echo "📝 Updated $CONFIG_FILE with ngrok URL"

# Remind about Snipcart domain
NGROK_DOMAIN=$(echo "$NGROK_URL" | sed 's|https://||')
# Extract the wildcard domain (e.g., *.ngrok-free.dev from abc.ngrok-free.dev)
WILDCARD_DOMAIN=$(echo "$NGROK_DOMAIN" | sed 's/^[^.]*/*./')
echo ""
echo "ℹ️  Make sure Snipcart Test mode → Domains & URLs includes:"
echo "   $WILDCARD_DOMAIN"
echo ""

# Skip prompt if SKIP_SNIPCART_PROMPT is set
if [ -z "${SKIP_SNIPCART_PROMPT:-}" ]; then
    read -p "Press Enter to continue (set SKIP_SNIPCART_PROMPT=1 to skip)..."
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
kill $NGROK_PID 2>/dev/null || true

# Restore original config
mv "$BACKUP_FILE" "$CONFIG_FILE"
echo "✅ Restored original $CONFIG_FILE"

exit $TEST_EXIT
