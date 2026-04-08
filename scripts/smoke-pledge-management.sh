#!/bin/bash
# Local smoke test for pledge modify/cancel using the dedicated test-only campaign.

set -euo pipefail

USE_PODMAN=false

for arg in "$@"; do
  if [ "$arg" = "--podman" ]; then
    USE_PODMAN=true
  fi
done

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

cleanup_fixture() {
  curl -s -X POST "${WORKER_HEADERS[@]}" "$WORKER_URL/test/cleanup" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$SMOKE_EMAIL\"}" >/dev/null || true
}

cleanup() {
  cleanup_fixture
  if [ -n "${DEV_PID:-}" ]; then
    kill "$DEV_PID" 2>/dev/null || true
  fi
}

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v jq >/dev/null 2>&1 || fail "jq is required"

if [ -z "$ADMIN_SECRET" ] && [ -f "worker/.dev.vars" ]; then
  ADMIN_SECRET=$(grep '^ADMIN_SECRET=' worker/.dev.vars | head -1 | cut -d= -f2-)
fi

trap cleanup EXIT

if [ "$USE_PODMAN" = "true" ]; then
  prefer_podman_path || true
  echo "📦 Starting shared Podman dev stack..."
  PODMAN_DEV_LOG="${PODMAN_DEV_LOG:-/tmp/pool-smoke-podman.log}"
  ./scripts/dev.sh --podman > "$PODMAN_DEV_LOG" 2>&1 &
  DEV_PID=$!

  echo "⏳ Waiting for Podman-backed local services..."
  PODMAN_READY=false
  for _ in {1..60}; do
    if curl -s "http://127.0.0.1:4000" > /dev/null 2>&1 && \
       curl -s "$WORKER_URL/stats/does-not-exist" > /dev/null 2>&1; then
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

echo "Local pledge management smoke test"
echo "Worker: $WORKER_URL | Campaign: $CAMPAIGN_SLUG | Email: $SMOKE_EMAIL"
echo ""

cleanup_fixture

if [ -n "$ADMIN_SECRET" ]; then
  curl -sf -X POST "${WORKER_HEADERS[@]}" "$WORKER_URL/stats/$CAMPAIGN_SLUG/recalculate" \
    -H "Authorization: Bearer $ADMIN_SECRET" >/dev/null || fail "initial stats recalculate failed"
  curl -sf -X POST "${WORKER_HEADERS[@]}" "$WORKER_URL/inventory/$CAMPAIGN_SLUG/recalculate" \
    -H "Authorization: Bearer $ADMIN_SECRET" >/dev/null || fail "initial inventory recalculate failed"
fi

initial_stats=$(curl -sf "${WORKER_HEADERS[@]}" "$WORKER_URL/stats/$CAMPAIGN_SLUG") || fail "stats endpoint unavailable for $CAMPAIGN_SLUG"
initial_inventory=$(curl -sf "${WORKER_HEADERS[@]}" "$WORKER_URL/inventory/$CAMPAIGN_SLUG") || fail "inventory endpoint unavailable for $CAMPAIGN_SLUG"
initial_pledge_count=$(echo "$initial_stats" | jq -r '.pledgeCount // 0')
initial_pledged_amount=$(echo "$initial_stats" | jq -r '.pledgedAmount // 0')
if [ "$(echo "$initial_stats" | jq -r '.state')" != "live" ]; then
  fail "campaign '$CAMPAIGN_SLUG' is not live"
fi
pass "campaign is live and ready for mutate/cancel smoke"

setup=$(curl -sf -X POST "${WORKER_HEADERS[@]}" "$WORKER_URL/test/setup" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"campaignSlug\":\"$CAMPAIGN_SLUG\"}") || fail "/test/setup failed"

token=$(echo "$setup" | jq -r '.token')
order_id=$(echo "$setup" | jq -r '.pledges[0].orderId')
inventory_tier_id=$(echo "$setup" | jq -r '.pledges[0].additionalTiers[0].id // empty')
inventory_tier_qty=$(echo "$setup" | jq -r '.pledges[0].additionalTiers[0].qty // 0')

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

if [ -n "$inventory_tier_id" ] && [ "$inventory_tier_qty" -gt 0 ]; then
  initial_claimed=$(echo "$initial_inventory" | jq -r --arg tier "$inventory_tier_id" '.tiers[$tier].claimed // 0')
  post_setup_inventory=$(curl -sf "${WORKER_HEADERS[@]}" "$WORKER_URL/inventory/$CAMPAIGN_SLUG")
  claimed_after_setup=$(echo "$post_setup_inventory" | jq -r --arg tier "$inventory_tier_id" '.tiers[$tier].claimed // 0')
  expected_claimed_after_setup=$((initial_claimed + inventory_tier_qty))
  [ "$claimed_after_setup" = "$expected_claimed_after_setup" ] || fail "expected $inventory_tier_id claimed count to increase from $initial_claimed to $expected_claimed_after_setup after setup"
  pass "limited inventory claim recorded"
else
  expected_claimed_after_setup=''
  initial_claimed=''
  pass "fixture pledge did not include a limited tier claim"
fi

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

expected_pledge_count_after_modify=$((initial_pledge_count + 1))
[ "$(echo "$post_modify_stats" | jq -r '.pledgeCount // 0')" = "$expected_pledge_count_after_modify" ] || fail "expected pledgeCount to increase from $initial_pledge_count to $expected_pledge_count_after_modify after modify"
if [ -n "$inventory_tier_id" ] && [ -n "$expected_claimed_after_setup" ]; then
  [ "$(echo "$post_modify_inventory" | jq -r --arg tier "$inventory_tier_id" '.tiers[$tier].claimed // 0')" = "$expected_claimed_after_setup" ] || fail "modify should preserve $inventory_tier_id claim at $expected_claimed_after_setup"
fi
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
[ "$(echo "$post_cancel_stats" | jq -r '.pledgeCount // 0')" = "$initial_pledge_count" ] || fail "expected pledgeCount to return to $initial_pledge_count after cancel"
[ "$(echo "$post_cancel_stats" | jq -r '.pledgedAmount // 0')" = "$initial_pledged_amount" ] || fail "expected pledgedAmount to return to $initial_pledged_amount after cancel"
if [ -n "$inventory_tier_id" ] && [ -n "$initial_claimed" ]; then
  [ "$(echo "$post_cancel_inventory" | jq -r --arg tier "$inventory_tier_id" '.tiers[$tier].claimed // 0')" = "$initial_claimed" ] || fail "expected $inventory_tier_id claim count to return to $initial_claimed after cancel"
fi
pass "cancel releases stats and inventory"

echo ""
pass "local pledge management smoke test passed"
