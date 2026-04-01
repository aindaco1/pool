#!/bin/bash
# Test Worker endpoints against local Jekyll site
# Runs automatically after jekyll build via _plugins/post_build_test.rb

set -e

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

# 3. Test /start rejects missing checkout token
request_json "POST" "$WORKER_URL/start" '{"campaignSlug":"nonexistent-campaign"}'
[ "$REQUEST_STATUS" = "400" ] || fail "/start should return 400 when checkout token is missing (got $REQUEST_STATUS)"
echo "$REQUEST_BODY" | grep -q "Missing checkout token" || fail "/start should explain that the checkout token is missing"
pass "/start rejects tokenless requests"

# 4. Test /start fail-closes without a verifiable Snipcart checkout session
# Prefer the dedicated local smoke campaign when it is available, otherwise fall back
# to the first campaign slug so we can still validate the checkout-session contract.
START_SLUG=$(echo "$CAMPAIGNS" | jq -r '
  if any(.campaigns[]; .slug == "smoke-editable" and .state == "live" and .charged == false) then
    "smoke-editable"
  else
    (.campaigns[0].slug // empty)
  end
')
if [ -n "$START_SLUG" ]; then
  request_json "POST" "$WORKER_URL/start" "{\"publicToken\":\"invalid-local-smoke-token\",\"campaignSlug\":\"$START_SLUG\",\"email\":\"test@example.com\"}"

  if [ "$REQUEST_STATUS" = "200" ] && echo "$REQUEST_BODY" | grep -q '"url"'; then
    fail "/start should not create a checkout response from an invalid Snipcart token"
  fi

  echo "$REQUEST_BODY" | grep -Eq "Invalid checkout token|Unable to verify checkout session" || fail "/start should fail closed when checkout verification cannot succeed"
  pass "/start fail-closes without a verifiable checkout session"
else
  warn "No campaigns found to validate /start session verification"
fi

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
