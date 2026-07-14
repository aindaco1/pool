# Automatically loads _config.local.yml in development.
# Merge nested overrides without erasing the rest of their canonical section.

module PoolLocalConfig
  def self.deep_merge(base, override)
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
end

Jekyll::Hooks.register :site, :after_reset do |site|
  next if ENV['JEKYLL_ENV'] == 'production'

  base_config = File.join(site.source, '_config.yml')
  local_config = File.join(site.source, '_config.local.yml')
  next unless File.exist?(local_config)

  base = File.exist?(base_config) ? YAML.safe_load_file(base_config, permitted_classes: [Date, Time]) || {} : {}
  local = YAML.safe_load_file(local_config, permitted_classes: [Date, Time]) || {}
  site.config.replace(PoolLocalConfig.deep_merge(PoolLocalConfig.deep_merge(base, site.config), local))

  puts ">>> Loaded _config.local.yml (show_test_campaigns: #{site.config['show_test_campaigns']})"
end
