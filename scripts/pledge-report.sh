#!/bin/bash
# Generate CSV report of pledges from Cloudflare KV
#
# Usage:
#   ./scripts/pledge-report.sh [campaign-slug] [--env dev|production] [--local]

set -eo pipefail

USE_PODMAN=false
PODMAN_REPORT_INTERNAL="${PODMAN_REPORT_INTERNAL:-0}"
PODMAN_STARTED_BY_SCRIPT=false
REPORT_JSON_TMP=""
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

load_cloudflare_report_env_file() {
  local env_file="$1"
  local line=""
  local key=""
  local value=""

  [[ -f "$env_file" ]] || return 0

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    key="${key#export }"
    case "$key" in
      CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID)
        if [[ -z "${!key:-}" ]]; then
          value="${value#"${value%%[![:space:]]*}"}"
          value="${value%"${value##*[![:space:]]}"}"
          value="${value%\"}"
          value="${value#\"}"
          value="${value%\'}"
          value="${value#\'}"
          export "$key=$value"
        fi
        ;;
    esac
  done < "$env_file"
}

load_cloudflare_report_env() {
  [[ "${POOL_REPORT_LOAD_ENV:-1}" == "0" ]] && return 0
  load_cloudflare_report_env_file ".env"
  load_cloudflare_report_env_file ".env.local"
  load_cloudflare_report_env_file ".env.cloudflare"
  load_cloudflare_report_env_file "worker/.dev.vars"
}

cleanup() {
  if [[ -n "$REPORT_JSON_TMP" ]]; then
    rm -f "$REPORT_JSON_TMP" >/dev/null 2>&1 || true
  fi

  if [[ "$PODMAN_STARTED_BY_SCRIPT" == "true" ]]; then
    podman rm -f pool-dev-site pool-dev-worker >/dev/null 2>&1 || true
    podman pod rm -f pool-dev-pod >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT
load_cloudflare_report_env

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

  PODMAN_ENV_ARGS=()
  for env_name in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID; do
    if [[ -n "${!env_name:-}" ]]; then
      PODMAN_ENV_ARGS+=(-e "$env_name")
    fi
  done

  exec podman exec "${PODMAN_ENV_ARGS[@]}" pool-dev-worker bash -lc "cd /workspace && PODMAN_REPORT_INTERNAL=1 ./scripts/pledge-report.sh${QUOTED_ARGS}"
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

REPORT_JSON_TMP="$(mktemp "${TMPDIR:-/tmp}/pool-pledge-report.XXXXXX")"
python3 ./scripts/fetch-pledges-json.py "${FETCH_ARGS[@]}" > "$REPORT_JSON_TMP"
node ./worker/src/report-cli.js --type pledge < "$REPORT_JSON_TMP"
