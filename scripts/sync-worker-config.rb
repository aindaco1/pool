#!/usr/bin/env ruby
# Sync Worker-mirrored settings from _config.yml / _config.local.yml into worker/wrangler.toml.

require 'yaml'

ROOT = File.expand_path('..', __dir__)
BASE_CONFIG_PATH = File.join(ROOT, '_config.yml')
LOCAL_CONFIG_PATH = File.join(ROOT, '_config.local.yml')
WRANGLER_PATH = File.join(ROOT, 'worker', 'wrangler.toml')

TOP_LEVEL_ORDER = [
  'SITE_BASE',
  'WORKER_BASE',
  'APP_MODE',
  'PLATFORM_NAME',
  'PLATFORM_COMPANY_NAME',
  'PLATFORM_AUTHOR',
  'SUPPORT_EMAIL',
  'PLEDGES_EMAIL_FROM',
  'UPDATES_EMAIL_FROM',
  'SALES_TAX_RATE',
  'FLAT_SHIPPING_RATE',
  'SHIPPING_ORIGIN_ZIP',
  'SHIPPING_ORIGIN_COUNTRY',
  'SHIPPING_FALLBACK_FLAT_RATE',
  'FREE_SHIPPING_DEFAULT',
  'USPS_ENABLED',
  'USPS_CLIENT_ID',
  'USPS_API_BASE',
  'USPS_TIMEOUT_MS',
  'USPS_QUOTE_CACHE_TTL_SECONDS',
  'USPS_FAILURE_COOLDOWN_SECONDS',
  'USPS_RATE_LIMIT_COOLDOWN_SECONDS',
  'DEFAULT_PLATFORM_TIP_PERCENT',
  'MAX_PLATFORM_TIP_PERCENT'
].freeze

DEV_ENV_ORDER = [
  'SITE_BASE',
  'WORKER_BASE',
  'APP_MODE',
  'PLATFORM_NAME',
  'PLATFORM_COMPANY_NAME',
  'PLATFORM_AUTHOR',
  'SUPPORT_EMAIL',
  'PLEDGES_EMAIL_FROM',
  'UPDATES_EMAIL_FROM',
  'SALES_TAX_RATE',
  'FLAT_SHIPPING_RATE',
  'SHIPPING_ORIGIN_ZIP',
  'SHIPPING_ORIGIN_COUNTRY',
  'SHIPPING_FALLBACK_FLAT_RATE',
  'FREE_SHIPPING_DEFAULT',
  'USPS_ENABLED',
  'USPS_CLIENT_ID',
  'USPS_API_BASE',
  'USPS_TIMEOUT_MS',
  'USPS_QUOTE_CACHE_TTL_SECONDS',
  'USPS_FAILURE_COOLDOWN_SECONDS',
  'USPS_RATE_LIMIT_COOLDOWN_SECONDS',
  'DEFAULT_PLATFORM_TIP_PERCENT',
  'MAX_PLATFORM_TIP_PERCENT'
].freeze

def deep_merge(base, override)
  return base unless override.is_a?(Hash)
  return override unless base.is_a?(Hash)

  merged = base.dup
  override.each do |key, value|
    merged[key] = if merged[key].is_a?(Hash) && value.is_a?(Hash)
      deep_merge(merged[key], value)
    else
      value
    end
  end
  merged
end

def load_yaml(path)
  return {} unless File.exist?(path)
  YAML.load_file(path) || {}
end

def parse_simple_assignments(content)
  values = {}
  content.scan(/^([A-Z_]+)\s*=\s*"([^"]*)"$/) do |key, value|
    values[key] = value
  end
  values
end

def parse_inline_vars(content)
  env_match = content.match(/^\[env\.dev\]\s*\nvars\s*=\s*\{([^}]*)\}/m)
  return {} unless env_match

  values = {}
  env_match[1].scan(/([A-Z_]+)\s*=\s*"([^"]*)"/) do |key, value|
    values[key] = value
  end
  values
end

def format_decimal(value, places)
  return nil if value.nil?
  format("%.#{places}f", value.to_f)
end

def format_int(value)
  return nil if value.nil?
  value.to_i.to_s
end

def toml_escape(value)
  String(value).gsub('\\', '\\\\').gsub('"', '\"')
end

def replace_toml_section(content, section_header, body_lines)
  lines = content.lines
  start_index = lines.index { |line| line.strip == section_header }
  return content unless start_index

  end_index = start_index + 1
  while end_index < lines.length && !lines[end_index].start_with?('[')
    end_index += 1
  end

  replacement = ["#{section_header}\n", *body_lines.map { |line| "#{line}\n" }, "\n"]
  lines[start_index...end_index] = replacement
  lines.join
end

def build_mirror_values(config, existing)
  platform = config['platform'] || {}
  pricing = config['pricing'] || {}
  shipping = config['shipping'] || {}
  usps = shipping['usps'] || {}

  {
    'SITE_BASE' => platform['site_url'] || config['url'] || existing['SITE_BASE'],
    'WORKER_BASE' => platform['worker_url'] || existing['WORKER_BASE'],
    'APP_MODE' => existing['APP_MODE'] || 'live',
    'PLATFORM_NAME' => platform['name'] || config['title'] || existing['PLATFORM_NAME'],
    'PLATFORM_COMPANY_NAME' => platform['company_name'] || config['author'] || existing['PLATFORM_COMPANY_NAME'],
    'PLATFORM_AUTHOR' => platform['company_name'] || config['author'] || existing['PLATFORM_AUTHOR'],
    'SUPPORT_EMAIL' => platform['support_email'] || existing['SUPPORT_EMAIL'],
    'PLEDGES_EMAIL_FROM' => platform['pledges_email_from'] || existing['PLEDGES_EMAIL_FROM'],
    'UPDATES_EMAIL_FROM' => platform['updates_email_from'] || existing['UPDATES_EMAIL_FROM'],
    'SALES_TAX_RATE' => pricing.key?('sales_tax_rate') ? pricing['sales_tax_rate'].to_s : existing['SALES_TAX_RATE'],
    'FLAT_SHIPPING_RATE' => pricing.key?('flat_shipping_rate') ? format_decimal(pricing['flat_shipping_rate'], 2) : existing['FLAT_SHIPPING_RATE'],
    'SHIPPING_ORIGIN_ZIP' => shipping['origin_zip'] || existing['SHIPPING_ORIGIN_ZIP'],
    'SHIPPING_ORIGIN_COUNTRY' => shipping['origin_country'] || existing['SHIPPING_ORIGIN_COUNTRY'],
    'SHIPPING_FALLBACK_FLAT_RATE' => shipping.key?('fallback_flat_rate') ? format_decimal(shipping['fallback_flat_rate'], 2) : existing['SHIPPING_FALLBACK_FLAT_RATE'],
    'FREE_SHIPPING_DEFAULT' => shipping.key?('free_shipping_default') ? (shipping['free_shipping_default'] ? 'true' : 'false') : existing['FREE_SHIPPING_DEFAULT'],
    'USPS_ENABLED' => usps.key?('enabled') ? (usps['enabled'] ? 'true' : 'false') : existing['USPS_ENABLED'],
    'USPS_CLIENT_ID' => usps.key?('client_id') ? usps['client_id'].to_s : existing['USPS_CLIENT_ID'],
    'USPS_API_BASE' => usps.key?('api_base') ? usps['api_base'].to_s : existing['USPS_API_BASE'],
    'USPS_TIMEOUT_MS' => usps.key?('timeout_ms') ? format_int(usps['timeout_ms']) : existing['USPS_TIMEOUT_MS'],
    'USPS_QUOTE_CACHE_TTL_SECONDS' => usps.key?('quote_cache_ttl_seconds') ? format_int(usps['quote_cache_ttl_seconds']) : existing['USPS_QUOTE_CACHE_TTL_SECONDS'],
    'USPS_FAILURE_COOLDOWN_SECONDS' => usps.key?('failure_cooldown_seconds') ? format_int(usps['failure_cooldown_seconds']) : existing['USPS_FAILURE_COOLDOWN_SECONDS'],
    'USPS_RATE_LIMIT_COOLDOWN_SECONDS' => usps.key?('rate_limit_cooldown_seconds') ? format_int(usps['rate_limit_cooldown_seconds']) : existing['USPS_RATE_LIMIT_COOLDOWN_SECONDS'],
    'DEFAULT_PLATFORM_TIP_PERCENT' => pricing.key?('default_tip_percent') ? format_int(pricing['default_tip_percent']) : existing['DEFAULT_PLATFORM_TIP_PERCENT'],
    'MAX_PLATFORM_TIP_PERCENT' => pricing.key?('max_tip_percent') ? format_int(pricing['max_tip_percent']) : existing['MAX_PLATFORM_TIP_PERCENT']
  }.compact
end

base_config = load_yaml(BASE_CONFIG_PATH)
local_config = load_yaml(LOCAL_CONFIG_PATH)
dev_config = deep_merge(base_config, local_config)

content = File.read(WRANGLER_PATH)
existing_top = parse_simple_assignments(content)
existing_dev = parse_inline_vars(content)

top_values = build_mirror_values(base_config, existing_top)
dev_values = build_mirror_values(dev_config, existing_dev).merge('APP_MODE' => 'test')

updated = content.dup

vars_block = TOP_LEVEL_ORDER.map do |key|
  value = top_values[key]
  next nil unless value
  %(#{key} = "#{toml_escape(value)}")
end.compact.join("\n")

updated = replace_toml_section(updated, '[vars]', vars_block.split("\n"))

dev_vars_line = "vars = { #{DEV_ENV_ORDER.map { |key|
  value = dev_values[key]
  next nil unless value
  %(#{key} = "#{toml_escape(value)}")
}.compact.join(', ')} }"

updated.gsub!(/(^\[env\.dev\]\s*\n)vars\s*=\s*\{[^}]*\}/m, "\\1#{dev_vars_line}")

if updated == content
  puts '✅ worker/wrangler.toml already in sync with _config.yml and _config.local.yml'
  exit 0
end

File.write(WRANGLER_PATH, updated)
puts '✅ Synced worker/wrangler.toml from _config.yml and _config.local.yml'
