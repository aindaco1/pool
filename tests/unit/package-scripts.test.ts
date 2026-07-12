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
  });

  it('creates and removes localhost Jekyll overrides for clean checkouts', () => {
    const premerge = readFileSync(join(repoRoot, 'scripts', 'pre-merge-regression.sh'), 'utf8');
    expect(premerge).toContain('prepare_local_config');
    expect(premerge).toContain('TEMP_LOCAL_CONFIG="_config.local.yml"');
    expect(premerge).toContain('show_test_campaigns: true');
    expect(premerge).toContain('rm -f "${TEMP_LOCAL_CONFIG}"');
  });

  it('does not require ripgrep on clean CI runners', () => {
    const premerge = readFileSync(join(repoRoot, 'scripts', 'pre-merge-regression.sh'), 'utf8');
    expect(premerge).toContain('if command -v rg');
    expect(premerge).toContain('grep -E "$@"');
    expect(premerge).toContain('search_text -n');
  });
});
