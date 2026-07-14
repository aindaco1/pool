import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

describe('package release scripts', () => {
  it('keeps coverage reproducible from declared dependencies', () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    expect(packageJson.scripts['test:unit:coverage']).toBe('vitest run --coverage');
    expect(packageJson.devDependencies['@vitest/coverage-v8']).toBeTruthy();
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

  it('makes Podman Playwright startup clean-checkout safe and diagnosable', () => {
    const podmanPlaywright = readFileSync(join(repoRoot, 'scripts', 'podman-playwright-run.sh'), 'utf8');
    const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'podman-e2e.yml'), 'utf8');
    expect(podmanPlaywright).toContain('cp _config.test.yml "$TEMP_LOCAL_CONFIG"');
    expect(podmanPlaywright).toContain('tail -n 120 "$PODMAN_PLAYWRIGHT_LOG"');
    expect(podmanPlaywright).toContain('rm -f "$TEMP_LOCAL_CONFIG"');
    expect(podmanPlaywright).not.toContain('exec podman run --rm');
    expect(workflow).toContain('/tmp/pool-playwright-podman.log');
  });

  it('does not require ripgrep on clean CI runners', () => {
    const premerge = readFileSync(join(repoRoot, 'scripts', 'pre-merge-regression.sh'), 'utf8');
    expect(premerge).toContain('if command -v rg');
    expect(premerge).toContain('grep -E "$@"');
    expect(premerge).toContain('search_text -n');
  });
});
