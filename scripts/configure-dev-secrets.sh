#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

DEV_VARS="worker/.dev.vars"
EXAMPLE_VARS="worker/.dev.vars.example"
NON_INTERACTIVE=false

for arg in "$@"; do
  case "$arg" in
    --non-interactive)
      NON_INTERACTIVE=true
      ;;
    -h|--help)
      echo "Usage: ./scripts/configure-dev-secrets.sh [--non-interactive]"
      echo ""
      echo "Creates or updates ignored local Worker secrets in worker/.dev.vars."
      echo "Existing non-empty values are preserved."
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

generate_local_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return 0
  fi

  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
}

ensure_dev_vars_file() {
  if [ -f "$DEV_VARS" ]; then
    chmod 600 "$DEV_VARS" 2>/dev/null || true
    return 0
  fi

  if [ -f "$EXAMPLE_VARS" ]; then
    cp "$EXAMPLE_VARS" "$DEV_VARS"
  else
    touch "$DEV_VARS"
  fi
  chmod 600 "$DEV_VARS" 2>/dev/null || true
  echo "Created $DEV_VARS with local-only permissions."
}

secret_value() {
  local key="$1"
  grep -E "^${key}=" "$DEV_VARS" 2>/dev/null | tail -1 | cut -d= -f2- || true
}

has_secret_value() {
  local key="$1"
  [ -n "$(secret_value "$key")" ]
}

set_secret_value() {
  local key="$1"
  local value="$2"
  local tmp_file=""

  tmp_file="$(mktemp)"
  if grep -qE "^${key}=" "$DEV_VARS" 2>/dev/null; then
    awk -v key="$key" -v replacement="${key}=${value}" '
      BEGIN { done = 0 }
      $0 ~ "^" key "=" {
        if (done == 0) {
          print replacement
          done = 1
        }
        next
      }
      { print }
    ' "$DEV_VARS" > "$tmp_file"
  else
    cp "$DEV_VARS" "$tmp_file"
    printf '\n%s=%s\n' "$key" "$value" >> "$tmp_file"
  fi

  mv "$tmp_file" "$DEV_VARS"
  chmod 600 "$DEV_VARS" 2>/dev/null || true
}

ensure_generated_secret() {
  local key="$1"
  local value=""

  if has_secret_value "$key"; then
    echo "$key already configured."
    return 0
  fi

  value="$(generate_local_secret)"
  set_secret_value "$key" "$value"
  echo "Generated $key."
}

prompt_optional_secret() {
  local key="$1"
  local label="$2"
  local value=""

  if has_secret_value "$key"; then
    echo "$key already configured."
    return 0
  fi

  if [ "$NON_INTERACTIVE" = "true" ] || [ ! -t 0 ]; then
    echo "$key skipped."
    return 0
  fi

  printf "%s (press Enter to skip): " "$label"
  IFS= read -r -s value || true
  printf '\n'
  if [ -n "$value" ]; then
    set_secret_value "$key" "$value"
    echo "Stored $key."
  else
    echo "$key skipped."
  fi
}

ensure_dev_vars_file

ensure_generated_secret "ADMIN_SECRET"
ensure_generated_secret "CHECKOUT_INTENT_SECRET"
ensure_generated_secret "MAGIC_LINK_SECRET"
ensure_generated_secret "ADMIN_SESSION_SECRET"

prompt_optional_secret "STRIPE_SECRET_KEY_TEST" "Stripe test secret key"
prompt_optional_secret "STRIPE_WEBHOOK_SECRET_TEST" "Stripe test webhook signing secret"
prompt_optional_secret "STRIPE_PUBLISHABLE_KEY_TEST" "Stripe test publishable key"
prompt_optional_secret "RESEND_API_KEY" "Resend API key"
prompt_optional_secret "USPS_CLIENT_SECRET" "USPS client secret"
prompt_optional_secret "ZIP_TAX_API_KEY" "ZIP.TAX API key"
prompt_optional_secret "CLOUDFLARE_API_TOKEN" "Cloudflare API token for local report/export scripts"

echo ""
echo "Local Worker secrets are stored in $DEV_VARS."
echo "This file is ignored by git and should stay on this machine."
