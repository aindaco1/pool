#!/bin/bash
# Generate CSV report of pledges from Cloudflare KV
#
# Usage:
#   ./scripts/pledge-report.sh [campaign-slug] [--env dev|production] [--local]

set -e

USE_PODMAN=false
PODMAN_REPORT_INTERNAL="${PODMAN_REPORT_INTERNAL:-0}"
PODMAN_STARTED_BY_SCRIPT=false
ORIGINAL_ARGS=()

for arg in "$@"; do
  if [[ "$arg" == "--podman" ]]; then
    USE_PODMAN=true
    continue
  fi
  ORIGINAL_ARGS+=("$arg")
done

set -- "${ORIGINAL_ARGS[@]}"

prefer_podman_path() {
  local candidate=""
  for candidate in \
    "/opt/podman/bin" \
    "/usr/local/podman/bin" \
    "/opt/homebrew/bin" \
    "/usr/local/bin"
  do
    if [[ -x "$candidate/podman" ]]; then
      export PATH="$candidate:$PATH"
      return 0
    fi
  done
  return 1
}

cleanup() {
  if [[ "$PODMAN_STARTED_BY_SCRIPT" == "true" ]]; then
    podman rm -f pool-dev-site pool-dev-worker >/dev/null 2>&1 || true
    podman pod rm -f pool-dev-pod >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

if [[ "$USE_PODMAN" == "true" && "$PODMAN_REPORT_INTERNAL" != "1" ]]; then
  prefer_podman_path || true

  if ! podman exec pool-dev-worker true >/dev/null 2>&1; then
    echo "📦 Starting shared Podman dev stack..." >&2
    PODMAN_REPORT_LOG="${PODMAN_REPORT_LOG:-/tmp/pool-pledge-report-podman.log}"
    PODMAN_DETACH=true SKIP_STRIPE=true ./scripts/dev.sh --podman > "$PODMAN_REPORT_LOG" 2>&1
    PODMAN_STARTED_BY_SCRIPT=true

    echo "⏳ Waiting for Podman-backed worker..." >&2
    for _ in {1..60}; do
      if podman exec pool-dev-worker true >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done

    if ! podman exec pool-dev-worker true >/dev/null 2>&1; then
      echo "❌ Podman worker did not become ready within 60 seconds" >&2
      exit 1
    fi
  fi

  QUOTED_ARGS=""
  for arg in "${ORIGINAL_ARGS[@]}"; do
    QUOTED_ARGS+=" $(printf '%q' "$arg")"
  done

  exec podman exec pool-dev-worker bash -lc "cd /workspace && PODMAN_REPORT_INTERNAL=1 ./scripts/pledge-report.sh${QUOTED_ARGS}"
fi

if [ -f "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use 20 >/dev/null 2>&1 || true
fi

CAMPAIGN_FILTER=""
ENV_NAME="production"
USE_LOCAL=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      ENV_NAME="${2:-production}"
      shift 2
      ;;
    --local)
      USE_LOCAL=true
      shift
      ;;
    --remote)
      USE_LOCAL=false
      shift
      ;;
    *)
      CAMPAIGN_FILTER="$1"
      shift
      ;;
  esac
done

if [[ "$USE_LOCAL" == "true" ]]; then
  echo "Fetching pledges from local Wrangler KV..." >&2
else
  echo "Fetching pledges from KV$([[ "$ENV_NAME" == "dev" ]] && printf ' (dev preview)')..." >&2
fi
echo "Report mode: pledge-report is a ledger/history export. Modify and cancel rows are deltas, not final current-state totals." >&2

FETCH_ARGS=()
if [[ -n "$CAMPAIGN_FILTER" ]]; then
  FETCH_ARGS+=("$CAMPAIGN_FILTER")
fi
if [[ "$ENV_NAME" == "dev" ]]; then
  FETCH_ARGS+=(--env dev)
fi
if [[ "$USE_LOCAL" == "true" ]]; then
  FETCH_ARGS+=(--local)
fi

python3 ./scripts/fetch-pledges-json.py "${FETCH_ARGS[@]}" | node ./worker/src/report-cli.js --type pledge
