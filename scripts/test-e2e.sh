#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "🚀 Starting E2E tests..."

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
bundle exec jekyll serve --port 4000 > /tmp/jekyll.log 2>&1 &
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
bundle exec jekyll serve --port 4000 > /tmp/jekyll.log 2>&1 &
JEKYLL_PID=$!

# Wait for Jekyll
for i in {1..30}; do
    if curl -s http://127.0.0.1:4000 > /dev/null 2>&1; then
        echo "✅ Jekyll ready with ngrok URL"
        break
    fi
    sleep 1
done

# Run manual checkout test
echo ""
echo "🧪 Running checkout test..."
npx playwright test --headed --grep "manual checkout"
CHECKOUT_EXIT=$?

# Cleanup
echo ""
echo "🧹 Cleaning up..."
kill $JEKYLL_PID 2>/dev/null || true
kill $NGROK_PID 2>/dev/null || true
mv _config.local.yml.bak _config.local.yml

exit $CHECKOUT_EXIT
