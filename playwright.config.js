const { defineConfig } = require('@playwright/test');
const useExternalServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === '1';

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 1,
  use: {
    baseURL: 'http://127.0.0.1:4000',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: useExternalServer
    ? undefined
    : {
        command: 'bundle exec jekyll serve --config _config.yml,_config.local.yml --port 4000',
        port: 4000,
        timeout: 120_000,
        reuseExistingServer: true,
      },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
