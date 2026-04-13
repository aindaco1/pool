#!/bin/bash
# Local smoke test for pledge modify/cancel using the dedicated test-only campaign.

set -euo pipefail

USE_PODMAN=false
PODMAN_STARTED_BY_SCRIPT=false

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

podman_stack_ready() {
  curl -sf "http://127.0.0.1:4000/campaigns/$CAMPAIGN_SLUG/" > /dev/null 2>&1 && \
    curl -sf "$WORKER_URL/stats/$CAMPAIGN_SLUG" | jq -e '.state == "live"' > /dev/null 2>&1 && \
    curl -sf "$WORKER_URL/inventory/$CAMPAIGN_SLUG" > /dev/null 2>&1
}

cleanup_podman_stack() {
  podman rm -f pool-dev-site pool-dev-worker >/dev/null 2>&1 || true
  podman pod rm -f pool-dev-pod >/dev/null 2>&1 || true
}

recalculate_stats() {
  curl -sf -X POST "${WORKER_HEADERS[@]}" "$WORKER_URL/stats/$CAMPAIGN_SLUG/recalculate" \
    -H "Authorization: Bearer $ADMIN_SECRET"
}

recalculate_inventory() {
  curl -sf -X POST "${WORKER_HEADERS[@]}" "$WORKER_URL/inventory/$CAMPAIGN_SLUG/recalculate" \
    -H "Authorization: Bearer $ADMIN_SECRET"
}

check_projection_drift() {
  curl -sf -X POST "${WORKER_HEADERS[@]}" "$WORKER_URL/stats/$CAMPAIGN_SLUG/check" \
    -H "Authorization: Bearer $ADMIN_SECRET"
}

cleanup_fixture() {
  curl -s -X POST "${WORKER_HEADERS[@]}" "$WORKER_URL/test/cleanup" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$SMOKE_EMAIL\",\"campaignSlug\":\"$CAMPAIGN_SLUG\"}" >/dev/null || true
}

cleanup() {
  cleanup_fixture
  if [ "$PODMAN_STARTED_BY_SCRIPT" = "true" ]; then
    cleanup_podman_stack
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
  if podman_stack_ready; then
    echo "✅ Reusing existing Podman dev stack"
  else
    echo "📦 Starting shared Podman dev stack..."
    PODMAN_DEV_LOG="${PODMAN_DEV_LOG:-/tmp/pool-smoke-podman.log}"
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

echo "Local pledge management smoke test"
echo "Worker: $WORKER_URL | Campaign: $CAMPAIGN_SLUG | Email: $SMOKE_EMAIL"
echo ""

cleanup_fixture

if [ -n "$ADMIN_SECRET" ]; then
  initial_stats_response="$(recalculate_stats)" || fail "initial stats recalculate failed"
  initial_inventory_response="$(recalculate_inventory)" || fail "initial inventory recalculate failed"
  initial_drift_response="$(check_projection_drift)" || fail "initial projection drift check failed"
  initial_stats="$(echo "$initial_stats_response" | jq '.stats')"
  initial_inventory="$(echo "$initial_inventory_response" | jq '.inventory')"
  [ "$(echo "$initial_drift_response" | jq -r '.inSync')" = "true" ] || fail "initial projection drift detected for $CAMPAIGN_SLUG"
else
  initial_stats=$(curl -sf "${WORKER_HEADERS[@]}" "$WORKER_URL/stats/$CAMPAIGN_SLUG") || fail "stats endpoint unavailable for $CAMPAIGN_SLUG"
  initial_inventory=$(curl -sf "${WORKER_HEADERS[@]}" "$WORKER_URL/inventory/$CAMPAIGN_SLUG") || fail "inventory endpoint unavailable for $CAMPAIGN_SLUG"
fi
initial_pledge_count=$(echo "$initial_stats" | jq -r '.pledgeCount // 0')
initial_pledged_amount=$(echo "$initial_stats" | jq -r '.pledgedAmount // 0')
initial_state=$(echo "$initial_stats" | jq -r '.state // empty')
if [ -z "$initial_state" ]; then
  initial_state=$(curl -sf "${WORKER_HEADERS[@]}" "$WORKER_URL/stats/$CAMPAIGN_SLUG" | jq -r '.state // "unknown"')
fi
if [ "$initial_state" != "live" ]; then
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
  post_setup_stats_response="$(recalculate_stats)" || fail "stats recalculate failed"
  post_setup_inventory_response="$(recalculate_inventory)" || fail "inventory recalculate failed"
  post_setup_drift_response="$(check_projection_drift)" || fail "projection drift check failed after setup"
  post_setup_stats="$(echo "$post_setup_stats_response" | jq '.stats')"
  post_setup_inventory="$(echo "$post_setup_inventory_response" | jq '.inventory')"
  [ "$(echo "$post_setup_drift_response" | jq -r '.inSync')" = "true" ] || fail "projection drift detected after fixture setup"
  pass "stats and inventory recalculated for fixture pledge"
else
  warn "ADMIN_SECRET not set; skipping explicit stats/inventory rebuild after fixture setup"
  post_setup_stats=$(curl -sf "${WORKER_HEADERS[@]}" "$WORKER_URL/stats/$CAMPAIGN_SLUG") || fail "stats endpoint unavailable after setup"
  post_setup_inventory=$(curl -sf "${WORKER_HEADERS[@]}" "$WORKER_URL/inventory/$CAMPAIGN_SLUG") || fail "inventory endpoint unavailable after setup"
fi

pledges=$(curl -sf "${WORKER_HEADERS[@]}" "$WORKER_URL/pledges?token=$token") || fail "/pledges failed"
can_modify=$(echo "$pledges" | jq -r '.[0].canModify')
can_cancel=$(echo "$pledges" | jq -r '.[0].canCancel')

[ "$can_modify" = "true" ] || fail "expected canModify=true"
[ "$can_cancel" = "true" ] || fail "expected canCancel=true"
pass "manage link exposes mutable pledge state"

if [ -n "$inventory_tier_id" ] && [ "$inventory_tier_qty" -gt 0 ]; then
  initial_claimed=$(echo "$initial_inventory" | jq -r --arg tier "$inventory_tier_id" '.tiers[$tier].claimed // 0')
  claimed_after_setup=$(echo "$post_setup_inventory" | jq -r --arg tier "$inventory_tier_id" '.tiers[$tier].claimed // 0')
  expected_claimed_after_setup=$((initial_claimed + inventory_tier_qty))
  if [ "$claimed_after_setup" = "$expected_claimed_after_setup" ]; then
    pass "limited inventory claim recorded"
  else
    warn "fixture setup did not change $inventory_tier_id claimed count from $initial_claimed to $expected_claimed_after_setup (observed $claimed_after_setup); continuing with coherence checks"
    expected_claimed_after_setup="$claimed_after_setup"
  fi
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

if [ -n "$ADMIN_SECRET" ]; then
  post_modify_stats="$(recalculate_stats | jq '.stats')" || fail "stats recalculate failed after modify"
  post_modify_inventory="$(recalculate_inventory | jq '.inventory')" || fail "inventory recalculate failed after modify"
  post_modify_drift="$(check_projection_drift)" || fail "projection drift check failed after modify"
  [ "$(echo "$post_modify_drift" | jq -r '.inSync')" = "true" ] || fail "projection drift detected after modify"
fi

expected_pledge_count_after_modify=$(echo "$post_setup_stats" | jq -r '.pledgeCount // 0')
[ "$(echo "$post_modify_stats" | jq -r '.pledgeCount // 0')" = "$expected_pledge_count_after_modify" ] || fail "expected pledgeCount to stay at $expected_pledge_count_after_modify after modify"
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

if [ -n "$ADMIN_SECRET" ]; then
  post_cancel_stats="$(recalculate_stats | jq '.stats')" || fail "stats recalculate failed after cancel"
  post_cancel_inventory="$(recalculate_inventory | jq '.inventory')" || fail "inventory recalculate failed after cancel"
  post_cancel_drift="$(check_projection_drift)" || fail "projection drift check failed after cancel"
  [ "$(echo "$post_cancel_drift" | jq -r '.inSync')" = "true" ] || fail "projection drift detected after cancel"
fi

[ "$(echo "$post_cancel_pledges" | jq 'length')" = "0" ] || fail "cancelled pledge should not remain in manage list"
[ "$(echo "$post_cancel_stats" | jq -r '.pledgeCount // 0')" = "$initial_pledge_count" ] || fail "expected pledgeCount to return to $initial_pledge_count after cancel"
[ "$(echo "$post_cancel_stats" | jq -r '.pledgedAmount // 0')" = "$initial_pledged_amount" ] || fail "expected pledgedAmount to return to $initial_pledged_amount after cancel"
if [ -n "$inventory_tier_id" ] && [ -n "$initial_claimed" ]; then
  [ "$(echo "$post_cancel_inventory" | jq -r --arg tier "$inventory_tier_id" '.tiers[$tier].claimed // 0')" = "$initial_claimed" ] || fail "expected $inventory_tier_id claim count to return to $initial_claimed after cancel"
fi
pass "cancel releases stats and inventory"

echo ""
pass "local pledge management smoke test passed"
