# Run Worker tests after explicit `jekyll build` (not during serve)
# Skips if JEKYLL_ENV=production or Worker isn't running
# Set RUN_E2E=1 to also run Playwright E2E tests

Jekyll::Hooks.register :site, :post_write do |site|
  next if ENV['JEKYLL_ENV'] == 'production'
  next if ENV['SKIP_TESTS'] == '1'
  next if site.config['serving']  # Skip during `jekyll serve`

  # Worker tests
  worker_script = File.join(site.source, 'scripts', 'test-worker.sh')
  if File.exist?(worker_script)
    puts "\n>>> Running Worker tests..."
    system(worker_script)
  end

  # Optional E2E tests (run with RUN_E2E=1)
  e2e_script = File.join(site.source, 'scripts', 'test-e2e.sh')
  if ENV['RUN_E2E'] == '1' && File.exist?(e2e_script)
    puts "\n>>> Running E2E tests..."
    system(e2e_script)
  end
end
