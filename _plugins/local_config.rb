# Automatically loads _config.local.yml in development
# This allows `bundle exec jekyll serve` to work without specifying configs

Jekyll::Hooks.register :site, :after_reset do |site|
  next if ENV['JEKYLL_ENV'] == 'production'
  
  local_config = File.join(site.source, '_config.local.yml')
  next unless File.exist?(local_config)
  
  local = YAML.safe_load_file(local_config, permitted_classes: [Date, Time]) || {}
  site.config.merge!(local)
  
  puts ">>> Loaded _config.local.yml (show_test_campaigns: #{site.config['show_test_campaigns']})"
end
