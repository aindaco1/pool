#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

CAPTURE_BIN="$ROOT_DIR/shared/dust-wave-platform/packages/product-video-core/bin/capture-product-video.mjs"
RENDER_BIN="$ROOT_DIR/shared/dust-wave-platform/packages/product-video-core/bin/render-product-video.mjs"
FLOW_PATH="$ROOT_DIR/video/product-demo.smoke-editable.json"
BASE_URL="http://127.0.0.1:4010"
MARKETING_REPO="${POOL_MARKETING_REPO:-}"
WORK_ROOT="$ROOT_DIR/tmp/product-video"
RUN_ID="$(date +%Y%m%d-%H%M%S)-$$"
RUN_DIR="$WORK_ROOT/$RUN_ID"
FRAME_DIR="$RUN_DIR/frames"
OUTPUT_DIR="$RUN_DIR/output"
SITE_DIR="$RUN_DIR/site"
STARTED_SERVER=0
SERVER_PID=""
CAPTURE_ONLY=0
FORMATS=()

usage() {
  cat <<'EOF'
Usage: ./scripts/render-product-demo.sh [options]

Options:
  --flow <path>            Consumer-owned product flow JSON
  --base-url <origin>      Existing preview origin
  --capture-only           Capture frames without running FFmpeg
  --format <format>        prores, webm, or hevc; may be repeated
  --marketing-repo <path>  Copy browser outputs into a checked-out marketing repo
  --help                   Show this message

Environment:
  POOL_MARKETING_REPO      Same as --marketing-repo

The default localhost preview is built with _config.yml,_config.test.yml, so
the stable smoke-editable fixture is available from a clean checkout.
EOF
}

require_value() {
  if [ "$#" -lt 2 ] || [ -z "$2" ] || [[ "$2" == --* ]]; then
    echo "$1 requires a value" >&2
    exit 1
  fi
}

cleanup() {
  if [ "$STARTED_SERVER" -eq 1 ] && [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

while [ "$#" -gt 0 ]; do
  case "$1" in
    --flow)
      require_value "$1" "${2:-}"
      FLOW_PATH="$2"
      shift 2
      ;;
    --base-url)
      require_value "$1" "${2:-}"
      BASE_URL="$2"
      shift 2
      ;;
    --capture-only)
      CAPTURE_ONLY=1
      shift
      ;;
    --format)
      require_value "$1" "${2:-}"
      FORMATS+=("$2")
      shift 2
      ;;
    --marketing-repo)
      require_value "$1" "${2:-}"
      MARKETING_REPO="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

wait_for_http() {
  local url="$1"
  local attempt=""
  for attempt in $(seq 1 60); do
    if curl -fsS -- "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

start_default_preview() {
  if [ "$BASE_URL" != "http://127.0.0.1:4010" ]; then
    echo "The supplied preview is unavailable; automatic startup is limited to http://127.0.0.1:4010" >&2
    exit 1
  fi
  bundle exec jekyll build \
    --config _config.yml,_config.test.yml \
    --destination "$SITE_DIR" \
    --quiet
  python3 -m http.server 4010 --bind 127.0.0.1 --directory "$SITE_DIR" >"$RUN_DIR/site.log" 2>&1 &
  SERVER_PID="$!"
  STARTED_SERVER=1
  if ! wait_for_http "$BASE_URL"; then
    echo "Timed out waiting for the local product-video preview" >&2
    exit 1
  fi
}

copy_to_marketing_repo() {
  local marketing_repo="$1"
  if [ ! -d "$marketing_repo/.git" ] && ! git -C "$marketing_repo" rev-parse --git-dir >/dev/null 2>&1; then
    echo "Marketing destination must be an existing Git checkout" >&2
    exit 1
  fi
  local target_dir="$marketing_repo/assets/videos"
  mkdir -p "$target_dir"
  cp "$OUTPUT_DIR/product-demo.webm" "$target_dir/hero-demo.webm"
  cp "$OUTPUT_DIR/product-demo.mp4" "$target_dir/hero-demo.mp4"
}

require_command node
require_command bundle
require_command python3
require_command curl
mkdir -p "$RUN_DIR"

if ! curl -fsS -- "$BASE_URL" >/dev/null 2>&1; then
  start_default_preview
fi

node "$CAPTURE_BIN" \
  --base-url "$BASE_URL" \
  --flow "$FLOW_PATH" \
  --work-root "$WORK_ROOT" \
  --output-dir "$FRAME_DIR" \
  >"$RUN_DIR/capture-manifest.json"

if [ "$CAPTURE_ONLY" -eq 1 ]; then
  cat <<EOF
Product demo capture complete.

Run directory:
  $RUN_DIR

Capture manifest:
  $RUN_DIR/capture-manifest.json
EOF
  exit 0
fi

require_command ffmpeg
require_command ffprobe
render_args=(
  --manifest "$RUN_DIR/capture-manifest.json"
  --work-root "$WORK_ROOT"
  --output-dir "$OUTPUT_DIR"
  --name product-demo
)
if [ "${#FORMATS[@]}" -gt 0 ]; then
  for format in "${FORMATS[@]}"; do
    render_args+=(--format "$format")
  done
fi
node "$RENDER_BIN" "${render_args[@]}" >"$RUN_DIR/render-result.json"

if [ -n "$MARKETING_REPO" ]; then
  copy_to_marketing_repo "$MARKETING_REPO"
fi

cat <<EOF
Product demo render complete.

Run directory:
  $RUN_DIR

Outputs:
  $OUTPUT_DIR/product-demo-master.mov
  $OUTPUT_DIR/product-demo.webm
  $OUTPUT_DIR/product-demo.mp4
EOF
