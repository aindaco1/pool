#!/bin/bash
# Test Worker endpoints against local Jekyll site
# Runs automatically after jekyll build via _plugins/post_build_test.rb

set -e

cd "$(dirname "$0")/.."

ruby ./scripts/sync-worker-config.rb >/dev/null

USE_PODMAN=false
PODMAN_STARTED_BY_SCRIPT=false

for arg in "$@"; do
  if [ "$arg" = "--podman" ]; then
    USE_PODMAN=true
  fi
done

SITE_URL="${SITE_URL:-http://127.0.0.1:4000}"
WORKER_URL="${WORKER_URL:-http://localhost:8787}"
REQUEST_IP="${REQUEST_IP:-127.0.0.$(( (RANDOM % 200) + 20 ))}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

WORKER_HEADERS=(
  -H "CF-Connecting-IP: ${REQUEST_IP}"
  -H "X-Forwarded-For: ${REQUEST_IP}"
)

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

prefer_podman_path() {
  local candidate=""
  for candidate in \
    "/opt/podman/bin" \
    "/usr/local/podman/bin" \
    "/opt/homebrew/bin" \
    "/usr/local/bin"
  do
    if [ -x "$candidate/podman" ]; then
      export PATH="$candidate:$PATH"
      return 0
    fi
  done
  return 1
}

podman_stack_ready() {
  curl -s "$SITE_URL" >/dev/null 2>&1 && \
    curl -s "$WORKER_URL/stats/does-not-exist" >/dev/null 2>&1
}

cleanup_podman_stack() {
  podman rm -f pool-dev-site pool-dev-worker >/dev/null 2>&1 || true
  podman pod rm -f pool-dev-pod >/dev/null 2>&1 || true
}

request_json() {
  local method="$1"
  local url="$2"
  local payload="$3"
  local body_file
  body_file=$(mktemp)

  REQUEST_STATUS=$(curl -s -o "$body_file" -w "%{http_code}" -X "$method" "$url" \
    "${WORKER_HEADERS[@]}" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>/dev/null || true)
  REQUEST_BODY=$(cat "$body_file")
  rm -f "$body_file"
}

cleanup() {
  if [ "$PODMAN_STARTED_BY_SCRIPT" = "true" ]; then
    cleanup_podman_stack
  fi
}

trap cleanup EXIT

if [ "$USE_PODMAN" = "true" ]; then
  prefer_podman_path || true
  if podman_stack_ready; then
    echo "✅ Reusing existing Podman dev stack"
  else
    echo "📦 Starting shared Podman dev stack..."
    PODMAN_DEV_LOG="${PODMAN_DEV_LOG:-/tmp/pool-test-worker-podman.log}"
    PODMAN_DETACH=true SKIP_STRIPE=true ./scripts/dev.sh --podman > "$PODMAN_DEV_LOG" 2>&1
    PODMAN_STARTED_BY_SCRIPT=true

    echo "⏳ Waiting for Podman-backed local services..."
    PODMAN_READY=false
    for _ in {1..60}; do
      if podman_stack_ready; then
        echo "✅ Podman dev stack is ready"
        PODMAN_READY=true
        break
      fi
      sleep 1
    done

    if [ "$PODMAN_READY" != "true" ]; then
      fail "Podman dev stack did not become ready within 60 seconds"
    fi
  fi
fi

echo "Testing Worker endpoints..."
echo "Site: $SITE_URL | Worker: $WORKER_URL"
echo ""

# 1. Test campaigns.json exists
echo "--- Campaign Data ---"
CAMPAIGNS=$(curl -sf "$SITE_URL/api/campaigns.json" 2>/dev/null) || fail "campaigns.json not accessible at $SITE_URL/api/campaigns.json"
pass "campaigns.json accessible"

# Check it's valid JSON with campaigns
echo "$CAMPAIGNS" | jq -e '.campaigns | length > 0' > /dev/null 2>&1 || fail "campaigns.json has no campaigns"
COUNT=$(echo "$CAMPAIGNS" | jq '.campaigns | length')
pass "Found $COUNT campaigns"

# Check for at least one live campaign
LIVE=$(echo "$CAMPAIGNS" | jq '[.campaigns[] | select(.state == "live")] | length')
if [ "$LIVE" -eq 0 ]; then
  warn "No live campaigns found"
else
  pass "$LIVE live campaign(s)"
fi

# 2. Test Worker is running
echo ""
echo "--- Worker Endpoints ---"
WORKER_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${WORKER_HEADERS[@]}" "$WORKER_URL/notfound" 2>/dev/null || true)
if [ -z "$WORKER_STATUS" ] || [ "$WORKER_STATUS" = "000" ]; then
  warn "Worker not running at $WORKER_URL (start with: cd worker && npx wrangler dev --env dev)"
  exit 0
fi
pass "Worker responding (HTTP $WORKER_STATUS)"

# 3. Test deleted legacy /start endpoint
request_json "POST" "$WORKER_URL/start" '{"campaignSlug":"nonexistent-campaign"}'
[ "$REQUEST_STATUS" = "404" ] || fail "/start should be absent now that the legacy checkout path is deleted (got $REQUEST_STATUS)"
pass "/start is absent"

# 4. Test /checkout-intent/start fail-closes on malformed cart payloads
request_json "POST" "$WORKER_URL/checkout-intent/start" '{"campaignSlug":"smoke-editable","email":"test@example.com","items":[{"id":"bad-item","quantity":1}]}'

if [ "$REQUEST_STATUS" = "200" ] && echo "$REQUEST_BODY" | grep -q '"url"'; then
  fail "/checkout-intent/start should not create a checkout session from a malformed cart payload"
fi

echo "$REQUEST_BODY" | grep -Eq "Invalid cart item id|Checkout intent signing unavailable|Campaign not accepting pledges" || fail "/checkout-intent/start should fail closed on malformed or unavailable checkout starts"
pass "/checkout-intent/start fail-closes on malformed checkout payloads"

# 5. Test /pledge without token
RESP=$(curl -s "${WORKER_HEADERS[@]}" "$WORKER_URL/pledge" 2>/dev/null)
echo "$RESP" | grep -q "Missing token" || fail "/pledge should require token"
pass "/pledge requires token"

# 6. Test /votes without token  
RESP=$(curl -s "${WORKER_HEADERS[@]}" "$WORKER_URL/votes" 2>/dev/null)
echo "$RESP" | grep -q "Missing token\|error" || fail "/votes should require token"
pass "/votes requires token"

echo ""
echo -e "${GREEN}All tests passed!${NC}"
