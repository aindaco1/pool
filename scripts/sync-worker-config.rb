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
  'PLATFORM_NAME',
  'PLATFORM_COMPANY_NAME',
  'PLATFORM_AUTHOR',
  'SUPPORT_EMAIL',
  'PLEDGES_EMAIL_FROM',
  'UPDATES_EMAIL_FROM',
  'SALES_TAX_RATE',
  'FLAT_SHIPPING_RATE',
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

def build_mirror_values(config, existing)
  platform = config['platform'] || {}
  pricing = config['pricing'] || {}

  {
    'SITE_BASE' => platform['site_url'] || config['url'] || existing['SITE_BASE'],
    'WORKER_BASE' => platform['worker_url'] || existing['WORKER_BASE'],
    'PLATFORM_NAME' => platform['name'] || config['title'] || existing['PLATFORM_NAME'],
    'PLATFORM_COMPANY_NAME' => platform['company_name'] || config['author'] || existing['PLATFORM_COMPANY_NAME'],
    'PLATFORM_AUTHOR' => platform['company_name'] || config['author'] || existing['PLATFORM_AUTHOR'],
    'SUPPORT_EMAIL' => platform['support_email'] || existing['SUPPORT_EMAIL'],
    'PLEDGES_EMAIL_FROM' => platform['pledges_email_from'] || existing['PLEDGES_EMAIL_FROM'],
    'UPDATES_EMAIL_FROM' => platform['updates_email_from'] || existing['UPDATES_EMAIL_FROM'],
    'SALES_TAX_RATE' => pricing.key?('sales_tax_rate') ? pricing['sales_tax_rate'].to_s : existing['SALES_TAX_RATE'],
    'FLAT_SHIPPING_RATE' => pricing.key?('flat_shipping_rate') ? format_decimal(pricing['flat_shipping_rate'], 2) : existing['FLAT_SHIPPING_RATE'],
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

TOP_LEVEL_ORDER.each do |key|
  next unless top_values[key]
  updated.gsub!(/^#{Regexp.escape(key)}\s*=\s*"[^"]*"$/, %(#{key} = "#{toml_escape(top_values[key])}"))
end

dev_vars_line = "vars = { #{DEV_ENV_ORDER.filter_map { |key|
  value = dev_values[key]
  next nil unless value
  %(#{key} = "#{toml_escape(value)}")
}.join(', ')} }"

updated.gsub!(/(^\[env\.dev\]\s*\n)vars\s*=\s*\{[^}]*\}/m, "\\1#{dev_vars_line}")

if updated == content
  puts 'worker/wrangler.toml already matches _config.yml and _config.local.yml'
  exit 0
end

File.write(WRANGLER_PATH, updated)
puts 'Synced worker/wrangler.toml from _config.yml and _config.local.yml'
