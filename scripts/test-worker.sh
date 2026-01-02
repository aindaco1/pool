#!/bin/bash
# Test Worker endpoints against local Jekyll site
# Runs automatically after jekyll build via _plugins/post_build_test.rb

set -e

SITE_URL="${SITE_URL:-http://127.0.0.1:4000}"
WORKER_URL="${WORKER_URL:-http://localhost:8787}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

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
WORKER_RESP=$(curl -sf "$WORKER_URL/notfound" 2>/dev/null) || { warn "Worker not running at $WORKER_URL (start with: cd worker && npx wrangler dev --env dev)"; exit 0; }
pass "Worker responding"

# 3. Test /start with invalid campaign
RESP=$(curl -sf -X POST "$WORKER_URL/start" \
  -H "Content-Type: application/json" \
  -d '{"orderId":"test-123","campaignSlug":"nonexistent-campaign"}' 2>/dev/null)
echo "$RESP" | grep -q "Campaign not found" || fail "/start should reject nonexistent campaign"
pass "/start rejects invalid campaign"

# 4. Test /start with live campaign (get first live campaign)
LIVE_SLUG=$(echo "$CAMPAIGNS" | jq -r '[.campaigns[] | select(.state == "live" and .charged == false)] | .[0].slug // empty')
if [ -n "$LIVE_SLUG" ]; then
  RESP=$(curl -sf -X POST "$WORKER_URL/start" \
    -H "Content-Type: application/json" \
    -d "{\"orderId\":\"test-$(date +%s)\",\"campaignSlug\":\"$LIVE_SLUG\",\"amountCents\":500,\"email\":\"test@example.com\"}" 2>/dev/null)
  
  if echo "$RESP" | grep -q '"url"'; then
    pass "/start returns Stripe URL for '$LIVE_SLUG'"
  elif echo "$RESP" | grep -q "deadline"; then
    warn "/start: Campaign '$LIVE_SLUG' deadline passed (update goal_deadline in _campaigns/$LIVE_SLUG.md)"
  else
    fail "/start failed for live campaign: $RESP"
  fi
else
  warn "No uncharged live campaigns to test /start"
fi

# 5. Test /pledge without token
RESP=$(curl -sf "$WORKER_URL/pledge" 2>/dev/null)
echo "$RESP" | grep -q "Missing token" || fail "/pledge should require token"
pass "/pledge requires token"

# 6. Test /votes without token  
RESP=$(curl -sf "$WORKER_URL/votes" 2>/dev/null)
echo "$RESP" | grep -q "Missing token\|error" || fail "/votes should require token"
pass "/votes requires token"

echo ""
echo -e "${GREEN}All tests passed!${NC}"
