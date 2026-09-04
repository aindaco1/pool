import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

describe('package release scripts', () => {
  it('pins explicit Jekyll template check and write commands', () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    const command = 'node ./shared/dust-wave-jekyll-template/bin/sync-consumer.mjs --consumer-root .';

    expect(packageJson.scripts['jekyll-template:check']).toBe(`${command} --check`);
    expect(packageJson.scripts['jekyll-template:sync']).toBe(`${command} --write`);
  });

  it('minifies only explicitly selected generated site roots', () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    const command = 'node ./shared/dust-wave-platform/packages/build-core/bin/minify-site-assets.mjs --asset-dir assets --asset-dir shared/dust-wave-platform/packages/site-shell/src';

    expect(packageJson.scripts['assets:minify']).toBe(`${command} --write`);
    expect(packageJson.scripts['assets:minify:check']).toBe(`${command} --check`);
  });

  it('keeps coverage reproducible from declared dependencies', () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    expect(packageJson.scripts['test:unit:coverage']).toBe('vitest run --coverage');
    expect(packageJson.devDependencies['@vitest/coverage-v8']).toBeTruthy();
  });

  it('keeps the supported Node runtime explicit and consistent', () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    const rootNodeVersion = readFileSync(join(repoRoot, '.nvmrc'), 'utf8').trim();
    const workerNodeVersion = readFileSync(join(repoRoot, 'worker', '.nvmrc'), 'utf8').trim();
    const npmConfig = readFileSync(join(repoRoot, '.npmrc'), 'utf8');

    expect(packageJson.engines.node).toBe('^22.22.2 || ^24.15.0 || ^26.0.0');
    expect(rootNodeVersion).toBe('24.15.0');
    expect(workerNodeVersion).toBe(rootNodeVersion);
    expect(npmConfig).toContain('engine-strict=true');
  });

  it('keeps the Playwright package, container, fallback, and docs aligned', () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    const packageVersion = String(packageJson.devDependencies['@playwright/test']).replace(/^[~^]/, '');
    const image = `mcr.microsoft.com/playwright:v${packageVersion}-noble`;
    const containerfile = readFileSync(join(repoRoot, 'Containerfile.playwright.dev'), 'utf8');
    const podmanLauncher = readFileSync(join(repoRoot, 'scripts', 'dev-podman.sh'), 'utf8');
    const podmanDocs = readFileSync(join(repoRoot, 'docs', 'PODMAN.md'), 'utf8');

    expect(containerfile).toContain(`FROM ${image}`);
    expect(podmanLauncher).toContain('PLAYWRIGHT_NODE_IMAGE=');
    expect(podmanLauncher).toContain('Containerfile.playwright.dev');
    expect(podmanLauncher).toContain('podman image exists "$PLAYWRIGHT_NODE_IMAGE"');
    expect(podmanLauncher).toContain('WORKER_NODE_IMAGE="$PLAYWRIGHT_NODE_IMAGE"');
    expect(podmanDocs).toContain('Playwright image pinned in `Containerfile.playwright.dev`');
  });

  it('groups only minor and patch root development updates', () => {
    const dependabot = readFileSync(join(repoRoot, '.github', 'dependabot.yml'), 'utf8');
    expect(dependabot).toMatch(/root-development-dependencies:[\s\S]*update-types:\s*\n\s*- minor\s*\n\s*- patch/);
  });

  it('defers only routine shared-tooling updates to Platform upgrades', () => {
    const dependabot = JSON.parse(execFileSync('ruby', [
      '-ryaml', '-rjson', '-e',
      'puts JSON.generate(YAML.load_file(ARGV.fetch(0)))',
      join(repoRoot, '.github', 'dependabot.yml')
    ], { encoding: 'utf8' }));
    const rootUpdates = dependabot.updates.find((update: Record<string, unknown>) =>
      update['package-ecosystem'] === 'npm' && update.directory === '/'
    );

    expect(rootUpdates.ignore).toEqual(['esbuild', 'smol-toml'].map((name) => ({
      'dependency-name': name,
      'update-types': [
        'version-update:semver-major',
        'version-update:semver-minor',
        'version-update:semver-patch'
      ]
    })));
    expect(dependabot.updates.filter((update: Record<string, unknown>) =>
      update !== rootUpdates
    ).every((update: Record<string, unknown>) => !update.ignore)).toBe(true);
  });

  it('bootstraps Jekyll gems when the Podman bundle volume is empty', () => {
    const premerge = readFileSync(join(repoRoot, 'scripts', 'pre-merge-regression.sh'), 'utf8');
    expect(premerge).toContain('bundle config set path');
    expect(premerge).toContain('bundle check >/dev/null 2>&1 || bundle install');
    expect(premerge).toContain('SKIP_TESTS=1 bundle exec jekyll build');
    expect(premerge).toContain("bash -lc 'set -euo pipefail; cd /workspace;");
    expect(premerge).toContain("--quiet' || return 1");
    expect(premerge).toContain('--quiet || return 1');
  });

  it('creates and removes localhost Jekyll overrides for clean checkouts', () => {
    const premerge = readFileSync(join(repoRoot, 'scripts', 'pre-merge-regression.sh'), 'utf8');
    const testConfig = readFileSync(join(repoRoot, '_config.test.yml'), 'utf8');
    expect(premerge).toContain('prepare_local_config');
    expect(premerge).toContain('TEMP_LOCAL_CONFIG="_config.local.yml"');
    expect(premerge).toContain('cp _config.test.yml "${TEMP_LOCAL_CONFIG}"');
    expect(testConfig).toContain('show_test_campaigns: true');
    expect(premerge).toContain('rm -f "${TEMP_LOCAL_CONFIG}"');
  });

  it('preserves the selected Ruby and Node toolchain for Playwright web-server startup', () => {
    const playwrightConfig = readFileSync(join(repoRoot, 'playwright.config.js'), 'utf8');
    expect(playwrightConfig).toContain('command: "bash -c');
    expect(playwrightConfig).not.toContain('command: "bash -lc');
  });

  it('replaces empty local test secrets with non-empty smoke defaults without retaining the temporary file', () => {
    const premerge = readFileSync(join(repoRoot, 'scripts', 'pre-merge-regression.sh'), 'utf8');
    expect(premerge).toContain("grep -qE '^STRIPE_WEBHOOK_SECRET=.+$'");
    expect(premerge).toContain('required["STRIPE_WEBHOOK_SECRET"] = 1');
    expect(premerge).toContain('ORIGINAL_DEV_VARS_BACKUP');
    expect(premerge).toContain('mv "${ORIGINAL_DEV_VARS_BACKUP}" worker/.dev.vars');
  });

  it('fails the mutable pledge smoke when fixture inventory is not claimed', () => {
    const smoke = readFileSync(join(repoRoot, 'scripts', 'smoke-pledge-management.sh'), 'utf8');
    expect(smoke).toContain('fail "fixture setup did not change $inventory_tier_id claimed count');
    expect(smoke).not.toContain('continuing with coherence checks');
    expect(smoke).toContain('cp _config.test.yml "$TEMP_LOCAL_CONFIG"');
    expect(smoke).toContain('rm -f "$TEMP_LOCAL_CONFIG"');
    expect(smoke.match(/\(\.tiers \/\/ \.\)\[\$tier\]\.claimed \/\/ 0/g)).toHaveLength(4);
  });

  it('makes Podman Playwright startup clean-checkout safe and diagnosable', () => {
    const podmanPlaywright = readFileSync(join(repoRoot, 'scripts', 'podman-playwright-run.sh'), 'utf8');
    const podmanStack = readFileSync(join(repoRoot, 'scripts', 'podman-stack-run.sh'), 'utf8');
    const podmanDev = readFileSync(join(repoRoot, 'scripts', 'dev-podman.sh'), 'utf8');
    const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'podman-e2e.yml'), 'utf8');
    expect(podmanPlaywright).toContain('cp _config.test.yml "$TEMP_LOCAL_CONFIG"');
    expect(podmanPlaywright).toContain('tail -n 120 "$PODMAN_PLAYWRIGHT_LOG"');
    expect(podmanPlaywright).toContain('rm -f "$TEMP_LOCAL_CONFIG"');
    expect(podmanPlaywright).not.toContain('exec podman run --rm');
    expect(podmanStack).toContain('cp _config.test.yml "$TEMP_LOCAL_CONFIG"');
    expect(podmanStack).toContain('rm -f "$TEMP_LOCAL_CONFIG"');
    expect(podmanDev).toContain('index($2, "mcr.microsoft.com/playwright:") == 1');
    expect(podmanDev).not.toContain('~ /^mcr\\\\.microsoft\\\\.com');
    expect(podmanDev).toContain('PODMAN_WORKER_INSTALL_TIMEOUT="${PODMAN_WORKER_INSTALL_TIMEOUT:-600}"');
    expect(podmanDev).toContain('node_modules/.package-lock.sha256');
    expect(podmanDev).toContain('dependencies did not install within ${PODMAN_WORKER_INSTALL_TIMEOUT}s');
    expect(workflow).toContain('/tmp/pool-playwright-podman.log');
  });

  it('bounds stubborn pre-merge cleanup without terminating siblings', () => {
    execFileSync('bash', ['scripts/pre-merge-regression.sh', '__process_cleanup_check'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PREMERGE_PROCESS_STOP_TIMEOUT_TICKS: '2',
      },
      stdio: 'pipe',
      timeout: 5_000,
    });
  });

  it('does not require ripgrep on clean CI runners', () => {
    const premerge = readFileSync(join(repoRoot, 'scripts', 'pre-merge-regression.sh'), 'utf8');
    expect(premerge).toContain('if command -v rg');
    expect(premerge).toContain('grep -E "$@"');
    expect(premerge).toContain('search_text -n');
  });
});
