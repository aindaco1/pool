#!/usr/bin/env bash
set -euo pipefail

cd /workspace

bundle config set path "${BUNDLE_PATH:-/usr/local/bundle}" >/dev/null
bundle check >/dev/null 2>&1 || bundle install

# CI exercises a fixed build, like the host Playwright server. Polling the
# source tree competes with browser tests and is only needed during editing.
watch_mode=--force_polling
if [[ "${CI:-}" == "1" || "${CI:-}" == "true" ]]; then
  watch_mode=--no-watch
fi

exec bundle exec jekyll serve \
  --config _config.yml,_config.local.yml \
  --disable-disk-cache \
  "$watch_mode" \
  --host 0.0.0.0 \
  --port 4000
