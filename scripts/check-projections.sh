#!/bin/bash
# Check whether campaign-facing projection state has drifted from active pledge truth.
#
# Usage:
#   ./scripts/check-projections.sh                  # Check all campaigns
#   ./scripts/check-projections.sh smoke-editable   # Check one campaign
#   ./scripts/check-projections.sh --podman         # Reuse/start the Podman dev stack

set -euo pipefail

cd "$(dirname "$0")/.."

ruby ./scripts/sync-worker-config.rb >/dev/null

USE_PODMAN=false
PODMAN_STARTED_BY_SCRIPT=false
CAMPAIGN_SLUG=""

for arg in "$@"; do
  case "$arg" in
    --podman)
      USE_PODMAN=true
      ;;
    *)
      if [ -z "$CAMPAIGN_SLUG" ]; then
        CAMPAIGN_SLUG="$arg"
      fi
      ;;
  esac
done

SITE_URL="${SITE_URL:-http://127.0.0.1:4000}"
WORKER_URL="${WORKER_URL:-http://127.0.0.1:8787}"
ADMIN_SECRET="${ADMIN_SECRET:-}"
REQUEST_IP="${REQUEST_IP:-127.0.2.$(( (RANDOM % 200) + 20 ))}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

WORKER_HEADERS=(
  -H "CF-Connecting-IP: ${REQUEST_IP}"
  -H "X-Forwarded-For: ${REQUEST_IP}"
)

pass() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

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
  curl -sf "$SITE_URL" >/dev/null 2>&1 && curl -sf "$WORKER_URL/notfound" >/dev/null 2>&1
}

cleanup_podman_stack() {
  podman rm -f pool-dev-site pool-dev-worker >/dev/null 2>&1 || true
  podman pod rm -f pool-dev-pod >/dev/null 2>&1 || true
}

cleanup() {
  if [ "$PODMAN_STARTED_BY_SCRIPT" = "true" ]; then
    cleanup_podman_stack
  fi
}

trap cleanup EXIT

if [ -z "$ADMIN_SECRET" ] && [ -f "worker/.dev.vars" ]; then
  ADMIN_SECRET=$(grep '^ADMIN_SECRET=' worker/.dev.vars | head -1 | cut -d= -f2-)
fi

[ -n "$ADMIN_SECRET" ] || fail "ADMIN_SECRET is required (set it in the environment or worker/.dev.vars)"
command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v jq >/dev/null 2>&1 || fail "jq is required"

if [ "$USE_PODMAN" = "true" ]; then
  prefer_podman_path || true
  if podman_stack_ready; then
    echo "✅ Reusing existing Podman dev stack"
  else
    echo "📦 Starting shared Podman dev stack..."
    PODMAN_DEV_LOG="${PODMAN_DEV_LOG:-/tmp/pool-check-projections-podman.log}"
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

if [ -n "$CAMPAIGN_SLUG" ]; then
  RESPONSE=$(curl -sf -X POST "${WORKER_HEADERS[@]}" "$WORKER_URL/stats/$CAMPAIGN_SLUG/check" \
    -H "Authorization: Bearer $ADMIN_SECRET" \
    -H "Content-Type: application/json") || fail "Projection check failed for $CAMPAIGN_SLUG"

  IN_SYNC=$(echo "$RESPONSE" | jq -r '.inSync')
  echo "$RESPONSE" | jq
  if [ "$IN_SYNC" = "true" ]; then
    pass "No projection drift detected for $CAMPAIGN_SLUG"
    exit 0
  fi
  fail "Projection drift detected for $CAMPAIGN_SLUG"
else
  RESPONSE=$(curl -sf -X POST "${WORKER_HEADERS[@]}" "$WORKER_URL/admin/projections/check" \
    -H "Authorization: Bearer $ADMIN_SECRET" \
    -H "Content-Type: application/json") || fail "Projection check failed"

  IN_SYNC=$(echo "$RESPONSE" | jq -r '.inSync')
  CHECKED=$(echo "$RESPONSE" | jq -r '.checkedCampaigns')
  DRIFTED=$(echo "$RESPONSE" | jq -c '.driftedCampaigns')

  echo "$RESPONSE" | jq '{ inSync, checkedCampaigns, driftedCampaigns, results }'
  if [ "$IN_SYNC" = "true" ]; then
    pass "No projection drift detected across $CHECKED campaigns"
    exit 0
  fi
  warn "Drifted campaigns: $DRIFTED"
  fail "Projection drift detected"
fi
