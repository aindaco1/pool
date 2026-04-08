#!/usr/bin/env bash
set -euo pipefail

echo "Running Podman self-check..."

./scripts/podman-doctor.sh

echo ""
echo "Starting Podman-backed local services..."
PODMAN_SELF_CHECK_LOG="${PODMAN_SELF_CHECK_LOG:-/tmp/pool-podman-self-check.log}"
./scripts/dev.sh --podman > "$PODMAN_SELF_CHECK_LOG" 2>&1 &
DEV_PID=$!

cleanup() {
  if [ -n "${DEV_PID:-}" ]; then
    kill "$DEV_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

for _ in {1..60}; do
  if curl -s http://127.0.0.1:4000 >/dev/null 2>&1 && \
     curl -s http://127.0.0.1:8787/stats/does-not-exist >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -s http://127.0.0.1:4000 >/dev/null 2>&1 || \
   ! curl -s http://127.0.0.1:8787/stats/does-not-exist >/dev/null 2>&1; then
  echo "❌ Podman-backed site/worker did not become ready within 60 seconds"
  exit 1
fi

echo "✅ Podman-backed site and worker are reachable"

./scripts/test-worker.sh

echo ""
echo "Running containerized automated browser suite..."
bash ./scripts/podman-playwright-run.sh npx playwright test

echo ""
echo "✅ Podman self-check passed"
