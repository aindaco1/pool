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

wrangler_dev_var() {
  local key="$1"
  ruby -e '
    content = File.read(ARGV[0])
    key = ARGV[1]
    match = content.match(/^\[env\.dev\.vars\]\s*\n(.*?)(?=^\[|\z)/m)
    if match
      match[1].scan(/^([A-Z_]+)\s*=\s*"((?:\\.|[^"])*)"/) do |name, value|
        next unless name == key
        puts value.gsub(/\\"/, "\"").gsub(/\\\\/, "\\")
        exit 0
      end
    end

    match = content.match(/^\[env\.dev\]\s*\nvars\s*=\s*\{([^}]*)\}/m)
    exit 0 unless match

    match[1].scan(/([A-Z_]+)\s*=\s*"((?:\\.|[^"])*)"/) do |name, value|
      next unless name == key
      puts value.gsub(/\\"/, "\"").gsub(/\\\\/, "\\")
      exit 0
    end
  ' "worker/wrangler.toml" "$key"
}

example_dev_var() {
  local key="$1"
  grep -E "^${key}=" "$EXAMPLE_VARS" 2>/dev/null | tail -1 | cut -d= -f2- || true
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

ensure_local_default() {
  local key="$1"
  local value=""

  if has_secret_value "$key"; then
    echo "$key already configured."
    return 0
  fi

  value="$(wrangler_dev_var "$key")"
  if [ -z "$value" ]; then
    value="$(example_dev_var "$key")"
  fi
  if [ -z "$value" ]; then
    echo "$key skipped."
    return 0
  fi

  set_secret_value "$key" "$value"
  echo "Configured local default $key."
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

prompt_optional_value() {
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
  IFS= read -r value || true
  if [ -n "$value" ]; then
    set_secret_value "$key" "$value"
    echo "Stored $key."
  else
    echo "$key skipped."
  fi
}

organize_dev_vars_file() {
  ruby - "$DEV_VARS" "$EXAMPLE_VARS" <<'RUBY'
dev_path, example_path = ARGV

groups = [
  ['Local routing and mode', %w[
    APP_MODE SITE_BASE WORKER_BASE CANONICAL_SITE_BASE CANONICAL_WORKER_BASE CORS_ALLOWED_ORIGIN
  ]],
  ['Local admin access', %w[
    ADMIN_BOOTSTRAP_EMAILS ADMIN_TEST_CAMPAIGNS
  ]],
  ['Admin auth, sessions, and challenge protection', %w[
    ADMIN_SECRET ADMIN_SETTLEMENT_SECRET ADMIN_BROADCAST_SECRET ADMIN_SESSION_SECRET CHECKOUT_INTENT_SECRET MAGIC_LINK_SECRET
    TURNSTILE_SECRET_KEY ADMIN_TURNSTILE_REQUIRED ADMIN_TURNSTILE_BYPASS
  ]],
  ['Stripe checkout and webhooks', %w[
    STRIPE_SECRET_KEY STRIPE_SECRET_KEY_TEST STRIPE_PUBLISHABLE_KEY_TEST STRIPE_WEBHOOK_SECRET STRIPE_WEBHOOK_SECRET_TEST
  ]],
  ['Email delivery and Resend plan usage', %w[
    RESEND_API_KEY PLAN_USAGE_RESEND_PLAN RESEND_EMAILS_MONTHLY_LIMIT RESEND_EMAILS_DAILY_LIMIT
  ]],
  ['Dashboard publish, report helpers, and Cloudflare plan usage', %w[
    GITHUB_TOKEN CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_USAGE_API_TOKEN CLOUDFLARE_ANALYTICS_API_TOKEN
    CLOUDFLARE_WORKER_SCRIPT_NAME PLAN_USAGE_CLOUDFLARE_PLAN PLAN_USAGE_WARNING_PERCENT PLAN_USAGE_CRITICAL_PERCENT
    CLOUDFLARE_WORKERS_REQUESTS_DAILY_LIMIT CLOUDFLARE_WORKERS_REQUESTS_MONTHLY_LIMIT
    CLOUDFLARE_KV_READS_DAILY_LIMIT CLOUDFLARE_KV_READS_MONTHLY_LIMIT
    CLOUDFLARE_KV_WRITES_DAILY_LIMIT CLOUDFLARE_KV_WRITES_MONTHLY_LIMIT
    CLOUDFLARE_KV_DELETES_DAILY_LIMIT CLOUDFLARE_KV_DELETES_MONTHLY_LIMIT
    CLOUDFLARE_KV_LISTS_DAILY_LIMIT CLOUDFLARE_KV_LISTS_MONTHLY_LIMIT
  ]],
  ['Shipping and tax provider credentials', %w[
    USPS_ENABLED USPS_CLIENT_ID USPS_CLIENT_SECRET ZIP_TAX_API_KEY
  ]]
]

def read_assignments(path)
  values = {}
  order = []
  return [values, order] unless File.exist?(path)

  File.readlines(path, chomp: true).each do |line|
    next unless line =~ /\A([A-Z][A-Z0-9_]*)=(.*)\z/

    key = Regexp.last_match(1)
    value = Regexp.last_match(2)
    order << key unless values.key?(key)
    values[key] = value
  end

  [values, order]
end

values, existing_order = read_assignments(dev_path)
example_values, example_order = read_assignments(example_path)
example_order.each do |key|
  values[key] = example_values[key] unless values.key?(key)
end

known_keys = groups.flat_map { |(_title, keys)| keys }.uniq
ordered_keys = (existing_order + example_order + values.keys).uniq

lines = [
  '# Local Worker defaults and machine-specific secrets.',
  '# Generated/organized by scripts/configure-dev-secrets.sh.',
  '# This file is ignored by git and should stay on this machine.'
]

groups.each do |title, keys|
  present = keys.select { |key| values.key?(key) }
  next if present.empty?

  lines << ''
  lines << "# #{title}."
  present.each do |key|
    lines << "#{key}=#{values[key]}"
  end
end

other_keys = ordered_keys.reject { |key| known_keys.include?(key) }
unless other_keys.empty?
  lines << ''
  lines << '# Other local values preserved from this file.'
  other_keys.each do |key|
    lines << "#{key}=#{values[key]}"
  end
end

File.write(dev_path, "#{lines.join("\n")}\n")
RUBY
  chmod 600 "$DEV_VARS" 2>/dev/null || true
}

ensure_dev_vars_file

ensure_local_default "SITE_BASE"
ensure_local_default "WORKER_BASE"
ensure_local_default "CANONICAL_SITE_BASE"
ensure_local_default "CANONICAL_WORKER_BASE"
ensure_local_default "CORS_ALLOWED_ORIGIN"
ensure_local_default "APP_MODE"
ensure_local_default "ADMIN_BOOTSTRAP_EMAILS"
ensure_local_default "ADMIN_TEST_CAMPAIGNS"

ensure_generated_secret "ADMIN_SECRET"
ensure_generated_secret "ADMIN_SETTLEMENT_SECRET"
ensure_generated_secret "ADMIN_BROADCAST_SECRET"
ensure_generated_secret "CHECKOUT_INTENT_SECRET"
ensure_generated_secret "MAGIC_LINK_SECRET"
ensure_generated_secret "ADMIN_SESSION_SECRET"

prompt_optional_secret "STRIPE_SECRET_KEY_TEST" "Stripe test secret key"
prompt_optional_secret "STRIPE_WEBHOOK_SECRET_TEST" "Stripe test webhook signing secret"
prompt_optional_secret "STRIPE_PUBLISHABLE_KEY_TEST" "Stripe test publishable key"
prompt_optional_secret "RESEND_API_KEY" "Resend API key"
prompt_optional_secret "USPS_CLIENT_SECRET" "USPS client secret"
prompt_optional_secret "ZIP_TAX_API_KEY" "ZIP.TAX API key"
prompt_optional_secret "CLOUDFLARE_API_TOKEN" "Cloudflare user API token for local report/export scripts"
prompt_optional_value "CLOUDFLARE_ACCOUNT_ID" "Cloudflare account ID for local reports and plan usage"
prompt_optional_secret "CLOUDFLARE_USAGE_API_TOKEN" "Cloudflare read-only usage analytics API token"
prompt_optional_value "CLOUDFLARE_WORKER_SCRIPT_NAME" "Cloudflare Worker script name for plan usage filtering"
prompt_optional_value "PLAN_USAGE_CLOUDFLARE_PLAN" "Cloudflare plan override (free or standard)"
prompt_optional_value "PLAN_USAGE_RESEND_PLAN" "Resend plan override (free, pro, scale, or paid)"
prompt_optional_value "RESEND_EMAILS_MONTHLY_LIMIT" "Resend monthly email limit override"
prompt_optional_value "RESEND_EMAILS_DAILY_LIMIT" "Resend daily email limit override"

organize_dev_vars_file

echo ""
echo "Local Worker secrets are stored in $DEV_VARS."
echo "This file is ignored by git and should stay on this machine."
