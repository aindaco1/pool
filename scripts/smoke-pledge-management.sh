#!/bin/bash
# Local smoke test for pledge modify/cancel using the dedicated test-only campaign.

set -euo pipefail

WORKER_URL="${WORKER_URL:-http://127.0.0.1:8787}"
CAMPAIGN_SLUG="${CAMPAIGN_SLUG:-smoke-editable}"
SMOKE_EMAIL="${SMOKE_EMAIL:-smoke-local@example.com}"
ADMIN_SECRET="${ADMIN_SECRET:-}"
REQUEST_IP="${REQUEST_IP:-127.0.1.$(( (RANDOM % 200) + 20 ))}"

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

cleanup() {
  curl -s -X POST "${WORKER_HEADERS[@]}" "$WORKER_URL/test/cleanup" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$SMOKE_EMAIL\"}" >/dev/null || true
}

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v jq >/dev/null 2>&1 || fail "jq is required"

if [ -z "$ADMIN_SECRET" ] && [ -f "worker/.dev.vars" ]; then
  ADMIN_SECRET=$(grep '^ADMIN_SECRET=' worker/.dev.vars | head -1 | cut -d= -f2-)
fi

trap cleanup EXIT

echo "Local pledge management smoke test"
echo "Worker: $WORKER_URL | Campaign: $CAMPAIGN_SLUG | Email: $SMOKE_EMAIL"
echo ""

cleanup

initial_stats=$(curl -sf "${WORKER_HEADERS[@]}" "$WORKER_URL/stats/$CAMPAIGN_SLUG") || fail "stats endpoint unavailable for $CAMPAIGN_SLUG"
initial_inventory=$(curl -sf "${WORKER_HEADERS[@]}" "$WORKER_URL/inventory/$CAMPAIGN_SLUG") || fail "inventory endpoint unavailable for $CAMPAIGN_SLUG"

if [ "$(echo "$initial_stats" | jq -r '.state')" != "live" ]; then
  fail "campaign '$CAMPAIGN_SLUG' is not live"
fi
pass "campaign is live and ready for mutate/cancel smoke"

setup=$(curl -sf -X POST "${WORKER_HEADERS[@]}" "$WORKER_URL/test/setup" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"campaignSlug\":\"$CAMPAIGN_SLUG\"}") || fail "/test/setup failed"

token=$(echo "$setup" | jq -r '.token')
order_id=$(echo "$setup" | jq -r '.pledges[0].orderId')

[ -n "$token" ] && [ "$token" != "null" ] || fail "setup did not return a token"
[ -n "$order_id" ] && [ "$order_id" != "null" ] || fail "setup did not return an order id"
pass "test pledge created"

if [ -n "$ADMIN_SECRET" ]; then
  curl -sf -X POST "${WORKER_HEADERS[@]}" "$WORKER_URL/stats/$CAMPAIGN_SLUG/recalculate" \
    -H "Authorization: Bearer $ADMIN_SECRET" >/dev/null || fail "stats recalculate failed"
  curl -sf -X POST "${WORKER_HEADERS[@]}" "$WORKER_URL/inventory/$CAMPAIGN_SLUG/recalculate" \
    -H "Authorization: Bearer $ADMIN_SECRET" >/dev/null || fail "inventory recalculate failed"
  pass "stats and inventory recalculated for fixture pledge"
else
  warn "ADMIN_SECRET not set; skipping explicit stats/inventory rebuild after fixture setup"
fi

pledges=$(curl -sf "${WORKER_HEADERS[@]}" "$WORKER_URL/pledges?token=$token") || fail "/pledges failed"
can_modify=$(echo "$pledges" | jq -r '.[0].canModify')
can_cancel=$(echo "$pledges" | jq -r '.[0].canCancel')

[ "$can_modify" = "true" ] || fail "expected canModify=true"
[ "$can_cancel" = "true" ] || fail "expected canCancel=true"
pass "manage link exposes mutable pledge state"

post_setup_inventory=$(curl -sf "${WORKER_HEADERS[@]}" "$WORKER_URL/inventory/$CAMPAIGN_SLUG")
claimed_after_setup=$(echo "$post_setup_inventory" | jq -r '.tiers["limited-poster"].claimed // 0')
[ "$claimed_after_setup" = "1" ] || fail "expected limited-poster claimed count to be 1 after setup"
pass "limited inventory claim recorded"

modify=$(curl -sf -X POST "${WORKER_HEADERS[@]}" "$WORKER_URL/pledge/modify" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$token\",\"orderId\":\"$order_id\",\"supportItems\":[{\"id\":\"snack-run\",\"amount\":500}],\"customAmount\":700,\"tipPercent\":10}") || fail "/pledge/modify failed"

new_amount=$(echo "$modify" | jq -r '.newAmount')
previous_amount=$(echo "$modify" | jq -r '.previousAmount')
[ "$new_amount" != "null" ] || fail "modify response did not include newAmount"
[ "$previous_amount" != "null" ] || fail "modify response did not include previousAmount"

if [ "$new_amount" -le "$previous_amount" ]; then
  fail "modify did not increase the pledge amount as expected"
fi
pass "modify updates pledge totals"

post_modify_stats=$(curl -sf "${WORKER_HEADERS[@]}" "$WORKER_URL/stats/$CAMPAIGN_SLUG")
post_modify_inventory=$(curl -sf "${WORKER_HEADERS[@]}" "$WORKER_URL/inventory/$CAMPAIGN_SLUG")

[ "$(echo "$post_modify_stats" | jq -r '.pledgeCount')" = "1" ] || fail "expected one active pledge after modify"
[ "$(echo "$post_modify_inventory" | jq -r '.tiers["limited-poster"].claimed // 0')" = "1" ] || fail "modify should preserve limited inventory claim"
pass "modify preserves stats and inventory coherently"

cancel=$(curl -sf -X POST "${WORKER_HEADERS[@]}" "$WORKER_URL/pledge/cancel" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$token\",\"orderId\":\"$order_id\"}") || fail "/pledge/cancel failed"

if [ "$(echo "$cancel" | jq -r '.success')" != "true" ]; then
  fail "cancel response did not report success"
fi
pass "cancel request succeeded"

post_cancel_pledges=$(curl -sf "${WORKER_HEADERS[@]}" "$WORKER_URL/pledges?token=$token")
post_cancel_stats=$(curl -sf "${WORKER_HEADERS[@]}" "$WORKER_URL/stats/$CAMPAIGN_SLUG")
post_cancel_inventory=$(curl -sf "${WORKER_HEADERS[@]}" "$WORKER_URL/inventory/$CAMPAIGN_SLUG")

[ "$(echo "$post_cancel_pledges" | jq 'length')" = "0" ] || fail "cancelled pledge should not remain in manage list"
[ "$(echo "$post_cancel_stats" | jq -r '.pledgeCount')" = "0" ] || fail "expected pledgeCount=0 after cancel"
[ "$(echo "$post_cancel_stats" | jq -r '.pledgedAmount')" = "0" ] || fail "expected pledgedAmount=0 after cancel"
[ "$(echo "$post_cancel_inventory" | jq -r '.tiers["limited-poster"].claimed // 0')" = "0" ] || fail "expected limited inventory release after cancel"
pass "cancel releases stats and inventory"

echo ""
pass "local pledge management smoke test passed"
