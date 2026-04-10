#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

ruby ./scripts/sync-worker-config.rb

JEKYLL_PORT=4000
WORKER_PORT=8787
STRIPE_LOG="/tmp/pool-stripe-listen.log"
POD_NAME="pool-dev-pod"
SITE_CONTAINER="pool-dev-site"
WORKER_CONTAINER="pool-dev-worker"
SITE_IMAGE="localhost/pool-dev-site:latest"
WORKER_IMAGE="localhost/pool-dev-worker:latest"
SITE_VOLUME="pool-dev-bundle"
WORKER_NODE_MODULES_VOLUME="pool-dev-worker-node-modules"
SKIP_STRIPE="${SKIP_STRIPE:-false}"
PODMAN_REBUILD="${PODMAN_REBUILD:-0}"
PODMAN_SOCKET=""
PODMAN_DETACH="${PODMAN_DETACH:-false}"

detect_podman_socket() {
  podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}' podman-machine-default 2>/dev/null || true
}

configure_podman_connection() {
  local socket_path="${1:-}"

  if [ -z "$socket_path" ]; then
    socket_path="$(detect_podman_socket)"
  fi

  PODMAN_SOCKET="$socket_path"
  if [ -n "$socket_path" ]; then
    unset CONTAINER_CONNECTION
    export CONTAINER_HOST="unix://${socket_path}"
  fi
}

podman_machine_log_path() {
  local socket_path="${PODMAN_SOCKET:-}"

  if [ -z "$socket_path" ]; then
    socket_path="$(detect_podman_socket)"
  fi

  if [ -n "$socket_path" ]; then
    echo "$(dirname "$socket_path")/podman-machine-default.log"
  fi
}

ensure_podman_stability() {
  local os_family="$1"
  local log_path=""

  if ! { [ "$os_family" = "macos" ] || [ "$os_family" = "windows" ]; }; then
    return 0
  fi

  for _ in $(seq 1 5); do
    configure_podman_connection
    if ! podman info >/dev/null 2>&1; then
      echo "❌ Podman machine became unreachable immediately after startup."
      log_path="$(podman_machine_log_path)"
      if [ -n "$log_path" ] && [ -f "$log_path" ]; then
        echo "   Podman machine log: $log_path"
        tail -n 20 "$log_path" || true
      fi
      return 1
    fi
    sleep 1
  done

  return 0
}

for arg in "$@"; do
  if [ "$arg" = "--detach" ]; then
    PODMAN_DETACH=true
  fi
done

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

prefer_node20_path() {
  local candidate=""
  for candidate in \
    "$HOME/.nvm/versions/node/v20.19.6/bin" \
    "$HOME/.nvm/versions/node/v20.*/bin"
  do
    for resolved in $candidate; do
      if [ -x "$resolved/node" ]; then
        export PATH="$resolved:$PATH"
        return 0
      fi
    done
  done
  return 1
}

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

prefer_stripe_path() {
  local candidate=""
  for candidate in \
    "/opt/homebrew/bin" \
    "/usr/local/bin" \
    "$HOME/.local/bin"
  do
    if [ -x "$candidate/stripe" ]; then
      export PATH="$candidate:$PATH"
      return 0
    fi
  done
  return 1
}

has_local_secret() {
  local key="$1"
  grep -q "^${key}=" "worker/.dev.vars" 2>/dev/null
}

generate_local_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return 0
  fi

  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
}

ensure_local_secret() {
  local key="$1"
  local value=""

  if has_local_secret "$key"; then
    return 0
  fi

  value="$(generate_local_secret)"
  if [ -z "$value" ]; then
    echo "❌ Failed to generate local secret for $key"
    return 1
  fi

  echo "${key}=${value}" >> worker/.dev.vars
  echo "🔐 Added missing ${key} to worker/.dev.vars"
}

run_stripe_login() {
  echo "🔐 Refreshing Stripe CLI authentication..."
  printf '\n' | stripe login
}

start_stripe_listener() {
  rm -f "$STRIPE_LOG"
  stripe listen --forward-to "127.0.0.1:$WORKER_PORT/webhooks/stripe" > "$STRIPE_LOG" 2>&1 &
  STRIPE_LISTEN_PID=$!
}

wait_for_stripe_secret() {
  local secret=""
  for _ in $(seq 1 20); do
    if [ -f "$STRIPE_LOG" ]; then
      secret=$(grep -Eo 'whsec_[A-Za-z0-9_]+' "$STRIPE_LOG" 2>/dev/null | head -1 || true)
      if [ -n "$secret" ]; then
        echo "$secret"
        return 0
      fi
      if grep -q "Authorization failed" "$STRIPE_LOG"; then
        return 1
      fi
    fi
    sleep 1
  done
  return 1
}

kill_port_if_busy() {
  local port="$1"
  local label="$2"
  local pids=""

  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi

  pids="$(lsof -ti tcp:"$port" || true)"
  if [ -z "$pids" ]; then
    return 0
  fi

  echo "🔄 Clearing existing $label process(es) on port $port..."
  while IFS= read -r pid; do
    [ -z "$pid" ] && continue
    local process_name=""
    process_name="$(ps -p "$pid" -o comm= 2>/dev/null | tr -d '[:space:]' || true)"
    if [ "$process_name" = "gvproxy" ]; then
      echo "   Skipping gvproxy; Podman will manage that listener."
      continue
    fi
    kill "$pid" 2>/dev/null || true
  done <<< "$pids"
  sleep 1
}

ensure_podman_ready() {
  if ! command -v podman >/dev/null 2>&1; then
    echo "❌ Podman is required for --podman mode."
    echo "   Install it from https://podman.io/docs/installation"
    exit 1
  fi

  local os_family
  os_family="$(detect_os_family)"

  if [ "$os_family" = "macos" ] || [ "$os_family" = "windows" ]; then
    local machine_vmtype=""
    machine_vmtype="$(podman machine info 2>/dev/null | awk '/vmtype:/ {print $2}' | head -n 1 || true)"
    if [ "$os_family" = "macos" ] && [ -n "$machine_vmtype" ] && [ "$machine_vmtype" = "applehv" ]; then
      echo "⚠️  Podman is using the applehv backend on macOS."
      echo "   If Podman machine startup is unstable, prefer libkrun via ~/.config/containers/containers.conf:"
      echo "   [machine]"
      echo "   provider = \"libkrun\""
    fi
    if ! podman machine inspect >/dev/null 2>&1; then
      echo "🛠️  Initializing default Podman machine..."
      podman machine init
    fi
    local machine_state=""
    machine_state="$(podman machine inspect --format '{{.State}}' podman-machine-default 2>/dev/null || true)"
    if [ "$machine_state" != "running" ]; then
      echo "🚀 Ensuring Podman machine is running..."
      podman machine start --quiet --no-info podman-machine-default >/tmp/pool-podman-machine-start.log 2>&1 &
    else
      echo "✅ Podman machine already running"
    fi
    configure_podman_connection
  fi

  echo "⏳ Waiting for Podman API to become ready..."
  local ready=0
  local attempted_restart=0
  for _ in $(seq 1 60); do
    if { [ "$os_family" = "macos" ] || [ "$os_family" = "windows" ]; }; then
      configure_podman_connection
    fi
    if podman info >/dev/null 2>&1; then
      ready=1
      break
    fi
    if [ "$ready" != "1" ] && [ "$attempted_restart" = "0" ] && { [ "$os_family" = "macos" ] || [ "$os_family" = "windows" ]; }; then
      local machine_state=""
      machine_state="$(podman machine inspect --format '{{.State}}' podman-machine-default 2>/dev/null || true)"
      if [ "$machine_state" = "running" ]; then
        echo "🔄 Podman machine looks stale; restarting it..."
        podman machine stop podman-machine-default >/tmp/pool-podman-machine-stop.log 2>&1 || true
        podman machine start --quiet --no-info podman-machine-default >/tmp/pool-podman-machine-start.log 2>&1 || true
        configure_podman_connection
        attempted_restart=1
      fi
    fi
    sleep 2
  done

  if [ "$ready" != "1" ]; then
    if [ "$os_family" = "linux" ]; then
      echo "❌ Podman API did not become ready."
    else
      echo "❌ Podman machine did not become ready."
    fi
    local podman_log=""
    if [ -n "${PODMAN_SOCKET:-}" ]; then
      podman_log="$(dirname "$PODMAN_SOCKET")/podman-machine-default.log"
    fi
    if [ -n "$podman_log" ] && [ -f "$podman_log" ]; then
      if grep -q "Entering emergency mode" "$podman_log" || grep -q "Ignition has failed" "$podman_log"; then
        echo "   The Podman VM booted into emergency mode."
        echo "   Host fix: podman machine rm -f podman-machine-default && podman machine init --now"
        echo "   Last machine log lines:"
        tail -n 20 "$podman_log" || true
        exit 1
      fi
    fi
    if [ "$os_family" = "linux" ]; then
      echo "   Try: podman info"
      echo "   If that fails, restart your rootless Podman service/session and rerun this command."
    else
      echo "   Try: podman machine stop && podman machine start"
    fi
    exit 1
  fi

  local rootless
  rootless="$(podman info --format '{{.Host.Security.Rootless}}' 2>/dev/null || echo true)"
  if [ "$rootless" != "true" ]; then
    echo "❌ Podman must run rootless for this local dev path."
    exit 1
  fi

  ensure_podman_stability "$os_family" || exit 1
}

build_image_if_needed() {
  local image="$1"
  local context="$2"
  local file="$3"

  if [ "$PODMAN_REBUILD" = "1" ] || ! podman image exists "$image"; then
    echo "🔨 Building $image..."
    podman build -t "$image" -f "$file" "$context"
  fi
}

cleanup_pod() {
  podman rm -f "$SITE_CONTAINER" >/dev/null 2>&1 || true
  podman rm -f "$WORKER_CONTAINER" >/dev/null 2>&1 || true
  podman pod rm -f "$POD_NAME" >/dev/null 2>&1 || true
}

wait_for_http() {
  local url="$1"
  local label="$2"
  for _ in $(seq 1 40); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "✅ $label ready"
      return 0
    fi
    sleep 1
  done

  echo "❌ $label failed to start"
  return 1
}

cleanup() {
  kill "${STRIPE_LISTEN_PID:-0}" >/dev/null 2>&1 || true
  cleanup_pod
}

if [ "$PODMAN_DETACH" != "true" ]; then
  trap 'cleanup' EXIT
fi

prefer_node20_path || true
prefer_podman_path || true
prefer_stripe_path || true
ensure_podman_ready
ensure_local_secret "CHECKOUT_INTENT_SECRET"

cleanup_pod
kill_port_if_busy "$JEKYLL_PORT" "Jekyll"
kill_port_if_busy "$WORKER_PORT" "Worker"

build_image_if_needed "$SITE_IMAGE" "$ROOT_DIR" "$ROOT_DIR/Containerfile.dev"
build_image_if_needed "$WORKER_IMAGE" "$ROOT_DIR/worker" "$ROOT_DIR/worker/Containerfile.dev"

podman volume exists "$SITE_VOLUME" >/dev/null 2>&1 || podman volume create "$SITE_VOLUME" >/dev/null
podman volume exists "$WORKER_NODE_MODULES_VOLUME" >/dev/null 2>&1 || podman volume create "$WORKER_NODE_MODULES_VOLUME" >/dev/null

echo "📦 Starting Podman dev pod..."
podman pod create \
  --name "$POD_NAME" \
  -p "127.0.0.1:${JEKYLL_PORT}:4000" \
  -p "127.0.0.1:${WORKER_PORT}:8787" >/dev/null

podman run -d \
  --name "$SITE_CONTAINER" \
  --pod "$POD_NAME" \
  -v "$ROOT_DIR:/workspace" \
  -v "$SITE_VOLUME:/usr/local/bundle" \
  "$SITE_IMAGE" >/dev/null

podman run -d \
  --name "$WORKER_CONTAINER" \
  --pod "$POD_NAME" \
  -v "$ROOT_DIR:/workspace" \
  -v "$WORKER_NODE_MODULES_VOLUME:/workspace/worker/node_modules" \
  "$WORKER_IMAGE" >/dev/null

wait_for_http "http://127.0.0.1:${JEKYLL_PORT}" "Jekyll"
wait_for_http "http://127.0.0.1:${WORKER_PORT}/stats/does-not-exist" "Worker"

if [ "$SKIP_STRIPE" != "true" ]; then
  if ! command -v stripe >/dev/null 2>&1; then
    echo "⚠️  Stripe CLI not found. Continuing without webhook forwarding."
    SKIP_STRIPE=true
  elif ! stripe config --list &>/dev/null; then
    echo "⚠️  Not logged into Stripe CLI. Running 'stripe login'..."
    if ! run_stripe_login; then
      echo "❌ Stripe login failed. Continuing without webhook forwarding."
      SKIP_STRIPE=true
    fi
  fi
fi

if [ "$SKIP_STRIPE" != "true" ]; then
  echo "💳 Starting Stripe webhook forwarding..."
  start_stripe_listener
  STRIPE_SECRET="$(wait_for_stripe_secret || true)"

  if [ -z "$STRIPE_SECRET" ] && [ -f "$STRIPE_LOG" ] && grep -q "Authorization failed" "$STRIPE_LOG"; then
    echo "⚠️  Stripe CLI authentication appears stale. Re-running 'stripe login'..."
    kill "$STRIPE_LISTEN_PID" 2>/dev/null || true
    wait "$STRIPE_LISTEN_PID" 2>/dev/null || true
    if run_stripe_login; then
      start_stripe_listener
      STRIPE_SECRET="$(wait_for_stripe_secret || true)"
    else
      echo "❌ Stripe login failed. Continuing without webhook forwarding."
      SKIP_STRIPE=true
    fi
  fi

  if [ "$SKIP_STRIPE" != "true" ] && [ -n "$STRIPE_SECRET" ]; then
    if grep -q "^STRIPE_WEBHOOK_SECRET=" worker/.dev.vars 2>/dev/null; then
      sed -i.bak "s|^STRIPE_WEBHOOK_SECRET=.*|STRIPE_WEBHOOK_SECRET=$STRIPE_SECRET|" worker/.dev.vars
      rm -f worker/.dev.vars.bak
    else
      echo "STRIPE_WEBHOOK_SECRET=$STRIPE_SECRET" >> worker/.dev.vars
    fi
    echo "   Updated worker/.dev.vars with Stripe listener secret"
  else
    echo "⚠️  Stripe webhook forwarding inactive"
    SKIP_STRIPE=true
  fi
fi

echo ""
echo "✅ Podman local dev is running"
echo "   Jekyll:   http://127.0.0.1:${JEKYLL_PORT}"
echo "   Worker:   http://127.0.0.1:${WORKER_PORT}"
if [ "$SKIP_STRIPE" = "true" ]; then
  echo "   Stripe:   webhook forwarding inactive"
else
  echo "   Stripe:   forwarding to worker"
fi
echo ""
echo "💡 Podman notes:"
echo "   - Rebuild images with: PODMAN_REBUILD=1 ./scripts/dev.sh --podman"
echo "   - Logs: podman logs -f $SITE_CONTAINER | podman logs -f $WORKER_CONTAINER"
echo "   - Stop all services with Ctrl+C"
echo ""

if [ "$PODMAN_DETACH" = "true" ]; then
  echo "📎 Detached mode enabled; containers will keep running after this command exits"
  exit 0
fi

while true; do
  sleep 1
done
