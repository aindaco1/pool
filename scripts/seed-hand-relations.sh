#!/bin/bash
# Seed diverse local-only report fixtures for the hand-relations campaign.

set -euo pipefail

USE_PODMAN=false
PODMAN_INTERNAL="${PODMAN_INTERNAL:-0}"
PODMAN_STARTED_BY_SCRIPT=false

for arg in "$@"; do
  if [[ "$arg" == "--podman" ]]; then
    USE_PODMAN=true
  fi
done

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

if [[ "$USE_PODMAN" == "true" && "$PODMAN_INTERNAL" != "1" ]]; then
  prefer_podman_path || true

  if ! podman exec pool-dev-worker true >/dev/null 2>&1; then
    echo "📦 Starting shared Podman dev stack..." >&2
    PODMAN_SEED_LOG="${PODMAN_SEED_LOG:-/tmp/pool-hand-relations-seed-podman.log}"
    PODMAN_DETACH=true SKIP_STRIPE=true ./scripts/dev.sh --podman > "$PODMAN_SEED_LOG" 2>&1
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

  exec podman exec pool-dev-worker bash -lc "cd /workspace && PODMAN_INTERNAL=1 node ./scripts/seed-hand-relations.mjs"
fi

if [[ -f "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  source "$HOME/.nvm/nvm.sh"
  nvm use 20 >/dev/null 2>&1 || true
fi

cd "$(dirname "$0")/.."
node ./scripts/seed-hand-relations.mjs
