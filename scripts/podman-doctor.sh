#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/podman-machine.sh"

prefer_podman_path() {
  command -v podman >/dev/null 2>&1 && return 0
  local candidate=""
  for candidate in \
    "/opt/homebrew/bin" \
    "/opt/podman/bin" \
    "/usr/local/podman/bin" \
    "/usr/local/bin"
  do
    if [ -x "$candidate/podman" ]; then
      export PATH="$candidate:$PATH"
      return 0
    fi
  done
  return 1
}

detect_os_family() {
  case "$(uname -s)" in
    Darwin)
      echo "macos"
      ;;
    Linux)
      echo "linux"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      echo "windows"
      ;;
    *)
      echo "unknown"
      ;;
  esac
}

pass() { printf '✅ %s\n' "$1"; }
warn() { printf '⚠️  %s\n' "$1"; }
fail() { printf '❌ %s\n' "$1"; exit 1; }

PODMAN_RELEASE_MIN_MEMORY_MIB="${PODMAN_RELEASE_MIN_MEMORY_MIB:-6144}"
PODMAN_REQUIRE_RELEASE_RESOURCES="${PODMAN_REQUIRE_RELEASE_RESOURCES:-false}"

prefer_podman_path || true

if ! command -v podman >/dev/null 2>&1; then
  fail "Podman is not on PATH. Install Podman first: https://podman.io/docs/installation"
fi

OS_FAMILY="$(detect_os_family)"
echo "Podman doctor"
echo "OS family: $OS_FAMILY"
echo ""

if ! podman --version >/dev/null 2>&1; then
  fail "Podman CLI is installed but not responding. Try reinstalling Podman or reopening your shell."
fi
pass "Podman CLI is available"

pool_podman_configure_connection || fail "Unable to select the configured Podman engine."
pool_podman_wait_ready || fail "Podman engine is not ready."
pass "Podman engine is reachable"

if [ -n "${POOL_PODMAN_MACHINE:-}" ]; then
  pass "Using Podman machine: $POOL_PODMAN_MACHINE"
  CLIENT_VERSION="$(podman version --format '{{.Client.Version}}' 2>/dev/null || true)"
  SERVER_VERSION="$(podman version --format '{{.Server.Version}}' 2>/dev/null || true)"
  if [ -n "$CLIENT_VERSION" ] && [ -n "$SERVER_VERSION" ] && [ "$CLIENT_VERSION" != "$SERVER_VERSION" ]; then
    warn "Podman client $CLIENT_VERSION and VM engine $SERVER_VERSION differ. Update the selected VM in place; see docs/PODMAN.md#updating-the-machine."
  else
    pass "Podman client/engine version: $CLIENT_VERSION"
  fi

  STABILITY_CHECKS=3
  if [ "$PODMAN_REQUIRE_RELEASE_RESOURCES" = "true" ]; then STABILITY_CHECKS=10; fi
  for _ in $(seq 1 "$STABILITY_CHECKS"); do
    pool_podman_configure_connection
    if ! podman info >/dev/null 2>&1; then
      LOG_PATH="$(pool_podman_log_path)"
      [ -z "$LOG_PATH" ] || echo "   Podman machine log: $LOG_PATH"
      fail "The selected Podman machine is not staying reachable. No VM was restarted."
    fi
    sleep 1
  done
  pass "Podman machine stays reachable after startup"
fi

# Remote/explicit endpoints still receive the strict release resource check.
MACHINE_MEMORY_MIB=""
MEMORY_COMPARISON_MIN_MIB="$PODMAN_RELEASE_MIN_MEMORY_MIB"
if [ -n "${POOL_PODMAN_MACHINE:-}" ]; then
  MACHINE_MEMORY_MIB="$(podman machine inspect --format '{{.Resources.Memory}}' "$POOL_PODMAN_MACHINE" 2>/dev/null || true)"
fi
if ! [[ "$MACHINE_MEMORY_MIB" =~ ^[0-9]+$ ]]; then
  MEMORY_BYTES="$(podman info --format '{{.Host.MemTotal}}' 2>/dev/null || true)"
  if [[ "$MEMORY_BYTES" =~ ^[0-9]+$ ]]; then
    MACHINE_MEMORY_MIB="$((MEMORY_BYTES / 1024 / 1024))"
    MEMORY_COMPARISON_MIN_MIB="$((PODMAN_RELEASE_MIN_MEMORY_MIB * 9 / 10))"
  fi
fi
if [[ "$MACHINE_MEMORY_MIB" =~ ^[0-9]+$ ]]; then
  if [ "$MACHINE_MEMORY_MIB" -lt "$MEMORY_COMPARISON_MIN_MIB" ]; then
    if [ "$PODMAN_REQUIRE_RELEASE_RESOURCES" = "true" ]; then
      fail "Selected engine has ${MACHINE_MEMORY_MIB} MiB; release gates need at least ${PODMAN_RELEASE_MIN_MEMORY_MIB} MiB configured. Resize only when all projects are idle."
    fi
    warn "Selected engine has ${MACHINE_MEMORY_MIB} MiB; release baseline is ${PODMAN_RELEASE_MIN_MEMORY_MIB} MiB configured."
  else
    pass "Selected engine memory: ${MACHINE_MEMORY_MIB} MiB"
  fi
elif [ "$PODMAN_REQUIRE_RELEASE_RESOURCES" = "true" ]; then
  fail "Cannot verify the selected engine's release memory baseline."
fi

ROOTLESS="$(podman info --format '{{.Host.Security.Rootless}}' 2>/dev/null || echo false)"
if [ "$ROOTLESS" != "true" ]; then
  fail "Podman is not running rootless. This repo expects a rootless local setup."
fi
pass "Podman is running rootless"

if ! podman run --rm docker.io/library/alpine:3.20 echo ok >/tmp/pool-podman-doctor-alpine.log 2>&1; then
  cat /tmp/pool-podman-doctor-alpine.log >&2 || true
  fail "Podman could not run a simple container."
fi
pass "Basic container execution works"

echo ""
echo "Recommended next checks:"
echo "  ./scripts/dev.sh --podman"
echo "  npm run test:e2e:headless:podman"
