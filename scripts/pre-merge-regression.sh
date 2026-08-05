#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

WORKER_PID=""
JEKYLL_PID=""
TEMP_DEV_VARS=""
TEMP_LOCAL_CONFIG=""
ORIGINAL_DEV_VARS_BACKUP=""
LOG_DIR="$(mktemp -d /tmp/pool-premerge-logs.XXXXXX)"
declare -a PHASE_RESULTS=()
HOST_JEKYLL_STATUS="unknown"
HOST_JEKYLL_FAILURE_REASON=""
HOST_JEKYLL_LOG=""

prepare_local_config() {
  if [[ -f _config.local.yml ]]; then
    return 0
  fi

  TEMP_LOCAL_CONFIG="_config.local.yml"
  cp _config.test.yml "${TEMP_LOCAL_CONFIG}"
}

search_text() {
  if command -v rg >/dev/null 2>&1; then
    command rg "$@"
  else
    grep -E "$@"
  fi
}

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

prefer_current_node_path() {
  local candidate=""
  for candidate in \
    "$HOME/.nvm/versions/node/v24.*/bin" \
    "$HOME/.nvm/versions/node/v22.*/bin"
  do
    for resolved in $candidate; do
      if [[ -x "$resolved/node" ]]; then
        export PATH="$resolved:$PATH"
        return 0
      fi
    done
  done
  return 1
}

stabilize_podman_connection() {
  local socket_path=""

  prefer_podman_path || return 0
  command -v podman >/dev/null 2>&1 || return 0

  socket_path="$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}' podman-machine-default 2>/dev/null || true)"
  if [[ -n "${socket_path}" && -S "${socket_path}" ]]; then
    unset CONTAINER_CONNECTION
    export CONTAINER_HOST="unix://${socket_path}"
  fi
}

check_host_jekyll_status() {
  if ! command -v bundle >/dev/null 2>&1; then
    HOST_JEKYLL_STATUS="missing_bundler"
    return 1
  fi
  if bundle check >/dev/null 2>&1; then
    HOST_JEKYLL_STATUS="ready"
    return 0
  fi
  HOST_JEKYLL_STATUS="missing_gems"
  return 1
}

prepare_host_jekyll() {
  if check_host_jekyll_status; then
    return 0
  fi

  if [[ "${HOST_JEKYLL_STATUS}" != "missing_gems" ]]; then
    return 1
  fi

  echo "Host Bundler is present but Jekyll gems are missing; attempting bundle install..."
  HOST_JEKYLL_LOG="${LOG_DIR}/host-jekyll-bundle-install.log"
  if bundle install >"${HOST_JEKYLL_LOG}" 2>&1 && bundle check >/dev/null 2>&1; then
    HOST_JEKYLL_STATUS="ready"
    echo "Host Jekyll gems installed successfully."
    return 0
  fi

  HOST_JEKYLL_STATUS="bundle_install_failed"
  if [[ -f "${HOST_JEKYLL_LOG}" ]] && search_text -q "can no longer be found in that source" "${HOST_JEKYLL_LOG}"; then
    HOST_JEKYLL_FAILURE_REASON="locked gem version is unavailable from RubyGems"
  elif [[ -f "${HOST_JEKYLL_LOG}" ]] && search_text -q "extensions are not built" "${HOST_JEKYLL_LOG}"; then
    HOST_JEKYLL_FAILURE_REASON="native gem extensions are missing on the host Ruby"
  else
    HOST_JEKYLL_FAILURE_REASON="bundle install failed"
  fi
  return 1
}

print_host_jekyll_fallback_reason() {
  case "${HOST_JEKYLL_STATUS}" in
    missing_bundler)
      echo "Host Bundler is unavailable; falling back to the Podman-backed Jekyll build"
      ;;
    missing_gems)
      echo "Host Jekyll gems are missing; falling back to the Podman-backed Jekyll build"
      ;;
    bundle_install_failed)
      if [[ -n "${HOST_JEKYLL_FAILURE_REASON}" ]]; then
        echo "Host Jekyll gems could not be installed cleanly (${HOST_JEKYLL_FAILURE_REASON}); falling back to the Podman-backed Jekyll build"
      else
        echo "Host Jekyll gems could not be installed cleanly; falling back to the Podman-backed Jekyll build"
      fi
      if [[ -n "${HOST_JEKYLL_LOG}" ]]; then
        echo "Host Bundler log: ${HOST_JEKYLL_LOG}"
      fi
      ;;
    *)
      echo "Host Jekyll is unavailable; falling back to the Podman-backed Jekyll build"
      ;;
  esac
}

ensure_podman_ready() {
  prefer_podman_path || true
  if ! command -v podman >/dev/null 2>&1; then
    echo "Podman is required for the fallback Jekyll build path."
    return 1
  fi
  stabilize_podman_connection
  if ! podman info >/dev/null 2>&1; then
    ./scripts/podman-doctor.sh >/dev/null 2>&1 || true
    stabilize_podman_connection
    podman info >/dev/null 2>&1 || return 1
  fi

  for _ in 1 2 3; do
    stabilize_podman_connection
    if ! podman info >/dev/null 2>&1; then
      echo "Podman became unreachable during fallback build setup."
      return 1
    fi
    sleep 1
  done
}

build_with_podman_jekyll() {
  ensure_podman_ready || return 1

  if ! podman image exists localhost/pool-dev-site:latest; then
    podman build -t localhost/pool-dev-site:latest -f Containerfile.dev .
  fi

  podman volume exists pool-dev-bundle >/dev/null 2>&1 || podman volume create pool-dev-bundle >/dev/null

  podman run --rm \
    -v "$PWD:/workspace" \
    -v pool-dev-bundle:/usr/local/bundle \
    localhost/pool-dev-site:latest \
    bash -lc 'set -euo pipefail; cd /workspace; bundle config set path "${BUNDLE_PATH:-/usr/local/bundle}" >/dev/null; bundle check >/dev/null 2>&1 || bundle install; SKIP_TESTS=1 bundle exec jekyll build --config _config.yml,_config.local.yml --quiet' || return 1

  minify_site_assets
}

build_with_host_jekyll() {
  SKIP_TESTS=1 bundle exec jekyll build --config _config.yml,_config.local.yml --quiet || return 1
  minify_site_assets
}

minify_site_assets() {
  if ! command -v node >/dev/null 2>&1; then
    echo "Node is required to minify generated site assets"
    return 1
  fi
  node ./scripts/minify-site-assets.mjs --write >/dev/null
}

verify_build_artifacts() {
  if ! search_text -n '\.pool-first-party-cart__panel' _site/assets/main.css >/dev/null; then
    echo "main.css is missing expected first-party cart UI styles"
    return 1
  fi
  if [[ ! -f _site/assets/admin.css ]] || ! search_text -n '\.admin-dashboard' _site/assets/admin.css >/dev/null; then
    echo "admin.css is missing expected isolated dashboard styles"
    return 1
  fi
  if ! node ./scripts/audit-performance-budgets.mjs >/dev/null; then
    echo "Generated asset performance budgets failed"
    return 1
  fi
  if [[ ! -f _site/robots.txt ]]; then
    echo "robots.txt is missing from the built site"
    return 1
  fi
  if [[ ! -f _site/sitemap.xml ]]; then
    echo "sitemap.xml is missing from the built site"
    return 1
  fi
  if [[ ! -f _site/sitemap.txt ]]; then
    echo "sitemap.txt is missing from the built site"
    return 1
  fi
  if ! search_text -n 'Sitemap: .+/sitemap\.xml' _site/robots.txt >/dev/null; then
    echo "robots.txt is missing its sitemap pointer"
    return 1
  fi
  if ! search_text -n 'Disallow: /manage/' _site/robots.txt >/dev/null; then
    echo "robots.txt is missing the manage-route disallow"
    return 1
  fi
  if ! search_text -n '<urlset xmlns="http://www\.sitemaps\.org/schemas/sitemap/0\.9" xmlns:xhtml="http://www\.w3\.org/1999/xhtml">' _site/sitemap.xml >/dev/null; then
    echo "sitemap.xml is missing the expected urlset root"
    return 1
  fi
  if ! search_text -n '<loc>.+/campaigns/' _site/sitemap.xml >/dev/null; then
    echo "sitemap.xml is missing public campaign URLs"
    return 1
  fi
  if ! search_text -n 'application/ld\+json' _site/index.html >/dev/null; then
    echo "Home page is missing JSON-LD"
    return 1
  fi
  if ! search_text -n 'application/ld\+json' _site/campaigns/*/index.html >/dev/null; then
    echo "Campaign pages are missing JSON-LD"
    return 1
  fi
  if ! search_text -n 'meta name="robots" content="noindex,nofollow,noarchive"' _site/manage/index.html >/dev/null; then
    echo "Manage page is missing noindex robots metadata"
    return 1
  fi
  if ! search_text -n 'meta name="robots" content="noindex,nofollow,noarchive"' _site/admin/index.html >/dev/null; then
    echo "Admin page is missing noindex robots metadata"
    return 1
  fi
  if ! node ./scripts/minify-site-assets.mjs --check >/dev/null; then
    echo "Generated CSS/JS assets still have minification savings"
    return 1
  fi
  if ! search_text -n 'meta name="robots" content="noindex,nofollow,noarchive"' _site/es/admin/index.html >/dev/null; then
    echo "Spanish admin page is missing noindex robots metadata"
    return 1
  fi
  if search_text -n 'property="og:title"|name="twitter:card"|application/ld\+json' _site/admin/index.html >/dev/null; then
    echo "Admin page is emitting public social or structured-data metadata"
    return 1
  fi
  if search_text -n 'property="og:title"|name="twitter:card"|application/ld\+json' _site/es/admin/index.html >/dev/null; then
    echo "Spanish admin page is emitting public social or structured-data metadata"
    return 1
  fi
  if search_text -n '<loc>.+/admin/' _site/sitemap.xml >/dev/null; then
    echo "sitemap.xml unexpectedly includes the admin route"
    return 1
  fi
  if ! SEO_SITE_DIR=_site node ./scripts/audit-seo.mjs >/dev/null; then
    echo "SEO audit failed for generated build artifacts"
    return 1
  fi
}

reset_podman_dev_artifacts() {
  if ! ensure_podman_ready; then
    ./scripts/podman-doctor.sh >/dev/null 2>&1 || return 1
    ensure_podman_ready || return 1
  fi
  podman rm -f pool-dev-site pool-dev-worker >/dev/null 2>&1 || true
  podman pod rm -f pool-dev-pod >/dev/null 2>&1 || true
}

stop_worker() {
  if [[ -n "${WORKER_PID}" ]]; then
    kill "${WORKER_PID}" 2>/dev/null || true
    wait "${WORKER_PID}" 2>/dev/null || true
    WORKER_PID=""
  fi
}

start_worker() {
  (
    prefer_current_node_path || true
    cd worker && npx wrangler dev --env dev --port 8787 >/tmp/pool-premerge-worker.log 2>&1
  ) &
  WORKER_PID=$!

  for _ in {1..60}; do
    if curl -s "http://127.0.0.1:8787/notfound" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Worker failed to start. See /tmp/pool-premerge-worker.log"
  return 1
}

cleanup() {
  stop_worker
  if [[ -n "${JEKYLL_PID}" ]]; then
    kill "${JEKYLL_PID}" 2>/dev/null || true
    wait "${JEKYLL_PID}" 2>/dev/null || true
  fi
  if [[ -n "${TEMP_DEV_VARS}" && -f "${TEMP_DEV_VARS}" ]]; then
    rm -f "${TEMP_DEV_VARS}"
  fi
  if [[ -n "${ORIGINAL_DEV_VARS_BACKUP}" && -f "${ORIGINAL_DEV_VARS_BACKUP}" ]]; then
    mv "${ORIGINAL_DEV_VARS_BACKUP}" worker/.dev.vars
  fi
  if [[ -n "${TEMP_LOCAL_CONFIG}" && -f "${TEMP_LOCAL_CONFIG}" ]]; then
    rm -f "${TEMP_LOCAL_CONFIG}"
  fi
}

trap cleanup EXIT

prepare_local_config
ruby ./scripts/sync-worker-config.rb >/dev/null

if [[ "${1:-}" = "__podman_build_check" ]]; then
  build_with_podman_jekyll
  verify_build_artifacts
  exit 0
fi

if [[ "${1:-}" = "__host_or_podman_build_check" ]]; then
  if build_with_host_jekyll; then
    verify_build_artifacts
    exit 0
  fi

  echo "Host Jekyll build failed during artifact verification; retrying with the Podman-backed build..."
  build_with_podman_jekyll
  verify_build_artifacts
  exit 0
fi

phase_slug() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}

print_phase_summary() {
  local entry=""
  local status=""
  local label=""
  local logfile=""
  echo ""
  echo "Phase summary:"
  for entry in "${PHASE_RESULTS[@]}"; do
    IFS='|' read -r status label logfile <<< "$entry"
    echo "  - ${status}: ${label}"
    echo "    log: ${logfile}"
  done
  echo "  logs dir: ${LOG_DIR}"
}

run_phase() {
  local label="$1"
  shift

  local slug
  local logfile
  local status
  slug="$(phase_slug "$label")"
  logfile="${LOG_DIR}/${slug}.log"

  echo "${label}"
  if "$@" >"${logfile}" 2>&1; then
    PHASE_RESULTS+=("PASS|${label}|${logfile}")
    echo "  PASS"
    echo "  log: ${logfile}"
    echo ""
    return 0
  else
    status=$?
  fi

  PHASE_RESULTS+=("FAIL|${label}|${logfile}")
  echo "  FAIL"
  echo "  log: ${logfile}"
  echo ""
  echo "Last log lines:"
  tail -n 60 "${logfile}" || true
  print_phase_summary
  return "${status}"
}

host_site_ready() {
  local body
  body="$(curl -fsS "http://127.0.0.1:4000/admin/" 2>/dev/null || true)"
  [[ "${body}" == *'id="admin-auth-panel"'* ]]
}

echo "==> Pre-merge regression checks"
echo ""

export SITE_BASE="${SITE_BASE:-http://127.0.0.1:4000}"
export WORKER_BASE="${WORKER_BASE:-http://127.0.0.1:8787}"
export WORKER_URL="${WORKER_URL:-http://127.0.0.1:8787}"
export APP_MODE="${APP_MODE:-test}"
export STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-sk_test_smoke}"
export STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-whsec_smoke}"
export ADMIN_SECRET="${ADMIN_SECRET:-test-admin-secret}"
export ADMIN_BOOTSTRAP_EMAILS="${ADMIN_BOOTSTRAP_EMAILS:-admin@example.com}"
export MAGIC_LINK_SECRET="${MAGIC_LINK_SECRET:-test-magic-link-secret}"
export RESEND_API_KEY="${RESEND_API_KEY:-re_test_smoke}"
export POOL_EMAIL_DRY_RUN="${POOL_EMAIL_DRY_RUN:-true}"
SMOKE_ADMIN_SECRET="${ADMIN_SECRET}"

prefer_current_node_path || true
stabilize_podman_connection

if [[ -f worker/.dev.vars ]]; then
  DEV_ADMIN_SECRET="$(grep '^ADMIN_SECRET=' worker/.dev.vars | head -1 | cut -d= -f2- || true)"
  if [[ -n "${DEV_ADMIN_SECRET}" ]]; then
    SMOKE_ADMIN_SECRET="${DEV_ADMIN_SECRET}"
  fi
fi

run_phase "1. Secret audit" npm run test:secrets

run_phase "2. Syntax checks" bash -lc '
  node --check worker/src/index.js
  node --check worker/src/email.js
  node --check worker/src/email-outbox.js
  node --check worker/src/media-catalog.js
  node --check worker/src/podcast-benefits.js
  node --check worker/src/stripe.js
  node --check worker/src/stats.js
  node --check scripts/optimize-media.mjs
  node --check scripts/release-i18n-seo-evidence.mjs
  node --check scripts/release-pledge-evidence.mjs
  node --check scripts/release-payment-smoke.mjs
  node --check scripts/release-provider-checks.mjs
  node --check scripts/release-screen-reader-evidence.mjs
  node scripts/optimize-media.mjs --check --manifest-only >/dev/null
  bash -n scripts/release-smoke.sh scripts/release-a11y-evidence.sh
'

run_phase "3. Focused regression suites" npx vitest run \
  tests/unit/worker-business-logic.test.ts \
  tests/unit/worker-ops-integrity.test.ts \
  tests/unit/email-outbox.test.ts \
  tests/unit/stripe-client.test.ts \
  tests/unit/media-optimization-script.test.ts \
  tests/unit/stats-pagination.test.ts

run_phase "4. Full unit suite" npm run test:unit

run_phase "4b. Release evidence command sanity" bash -lc '
  npm run release:smoke -- --help >/dev/null
  npm run release:providers -- --help >/dev/null
  WORKER_URL= WORKER_BASE= SITE_URL= SITE_BASE= npm run release:payment-smoke -- --no-dev-vars
'

USE_PODMAN_JEKYLL=false
if prepare_host_jekyll; then
  run_phase "5. First-party build artifact checks" bash -lc 'scripts/pre-merge-regression.sh __host_or_podman_build_check'
else
  print_host_jekyll_fallback_reason
  USE_PODMAN_JEKYLL=true
  run_phase "5. First-party build artifact checks" bash -lc '
    for candidate in "$HOME"/.nvm/versions/node/v24.*/bin "$HOME"/.nvm/versions/node/v22.*/bin; do
      if [[ -x "$candidate/node" ]]; then
        PATH="$candidate:$PATH"
        break
      fi
    done
    PATH="/opt/podman/bin:$PATH"
    scripts/pre-merge-regression.sh __podman_build_check
  '
fi

if [[ "${USE_PODMAN_JEKYLL}" = "true" ]]; then
  prefer_podman_path || true
  if command -v podman >/dev/null 2>&1; then
    podman pod rm -f pool-dev-pod >/dev/null 2>&1 || true
  fi
fi

if command -v lsof >/dev/null 2>&1; then
  EXISTING_WORKER_PIDS="$(lsof -ti tcp:8787 || true)"
  if [[ -n "${EXISTING_WORKER_PIDS}" ]]; then
    echo "Stopping existing process(es) on port 8787"
    while IFS= read -r pid; do
      [[ -z "${pid}" ]] && continue
      process_name="$(ps -p "${pid}" -o comm= 2>/dev/null | tr -d '[:space:]' || true)"
      if [[ "${process_name}" = "gvproxy" ]]; then
        echo "Skipping gvproxy on port 8787; Podman ports are cleaned up via pod removal."
        continue
      fi
      kill "${pid}" 2>/dev/null || true
    done <<< "${EXISTING_WORKER_PIDS}"
    sleep 1
  fi
fi

if [[ -f worker/.dev.vars ]]; then
  ORIGINAL_DEV_VARS_BACKUP="$(mktemp)"
  cp worker/.dev.vars "${ORIGINAL_DEV_VARS_BACKUP}"
  {
    cat "${ORIGINAL_DEV_VARS_BACKUP}"
    grep -q '^STRIPE_SECRET_KEY=' "${ORIGINAL_DEV_VARS_BACKUP}" || echo "STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}"
    grep -q '^SITE_BASE=' "${ORIGINAL_DEV_VARS_BACKUP}" || echo "SITE_BASE=${SITE_BASE}"
    grep -q '^ADMIN_SECRET=' "${ORIGINAL_DEV_VARS_BACKUP}" || echo "ADMIN_SECRET=${ADMIN_SECRET}"
    grep -q '^ADMIN_BOOTSTRAP_EMAILS=' "${ORIGINAL_DEV_VARS_BACKUP}" || echo "ADMIN_BOOTSTRAP_EMAILS=${ADMIN_BOOTSTRAP_EMAILS}"
    grep -q '^RESEND_API_KEY=' "${ORIGINAL_DEV_VARS_BACKUP}" || echo "RESEND_API_KEY=${RESEND_API_KEY}"
    grep -q '^POOL_EMAIL_DRY_RUN=' "${ORIGINAL_DEV_VARS_BACKUP}" || echo "POOL_EMAIL_DRY_RUN=${POOL_EMAIL_DRY_RUN}"
    grep -q '^MAGIC_LINK_SECRET=' "${ORIGINAL_DEV_VARS_BACKUP}" || echo "MAGIC_LINK_SECRET=${MAGIC_LINK_SECRET}"
    grep -q '^STRIPE_WEBHOOK_SECRET=' "${ORIGINAL_DEV_VARS_BACKUP}" || echo "STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}"
  } > worker/.dev.vars
else
  TEMP_DEV_VARS="worker/.dev.vars"
  cat > "${TEMP_DEV_VARS}" <<EOF
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
SITE_BASE=${SITE_BASE}
ADMIN_SECRET=${ADMIN_SECRET}
ADMIN_BOOTSTRAP_EMAILS=${ADMIN_BOOTSTRAP_EMAILS}
RESEND_API_KEY=${RESEND_API_KEY}
POOL_EMAIL_DRY_RUN=${POOL_EMAIL_DRY_RUN}
MAGIC_LINK_SECRET=${MAGIC_LINK_SECRET}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
EOF
fi

start_worker || exit 1

run_phase "6. Security suite" npm run test:security

stop_worker

run_phase "6b. Podman release resource check" env PODMAN_REQUIRE_RELEASE_RESOURCES=true npm run podman:doctor

if [[ "${USE_PODMAN_JEKYLL}" = "true" ]]; then
  reset_podman_dev_artifacts || exit 1
  run_phase "7a. Podman worker smoke" ./scripts/test-worker.sh --podman
  reset_podman_dev_artifacts || exit 1
  run_phase "7b. Podman mutable-pledge smoke" env ADMIN_SECRET="${SMOKE_ADMIN_SECRET}" ./scripts/smoke-pledge-management.sh --podman
else
  start_worker || exit 1

  if ! host_site_ready; then
    bundle exec jekyll serve --config _config.yml,_config.local.yml --port 4000 >/tmp/pool-premerge-jekyll.log 2>&1 &
    JEKYLL_PID=$!
  fi

  for _ in {1..60}; do
    if host_site_ready; then
      break
    fi
    sleep 1
  done

  if ! host_site_ready; then
    echo "Jekyll failed to start. See /tmp/pool-premerge-jekyll.log"
    exit 1
  fi

  run_phase "7a. Host worker smoke" env SITE_URL=http://127.0.0.1:4000 WORKER_URL=http://127.0.0.1:8787 ./scripts/test-worker.sh
  stop_worker
  reset_podman_dev_artifacts || exit 1
  run_phase "7b. Podman mutable-pledge smoke" env ADMIN_SECRET="${SMOKE_ADMIN_SECRET}" ./scripts/smoke-pledge-management.sh --podman
fi

if [[ "${USE_PODMAN_JEKYLL}" = "true" ]]; then
  reset_podman_dev_artifacts || exit 1
  run_phase "8. Podman E2E suite" env CI=1 ./scripts/podman-playwright-run.sh npx playwright test --workers=1
else
  run_phase "8. Headless E2E suite" npm run test:e2e:headless
fi

echo "Pre-merge regression checks completed."
print_phase_summary
