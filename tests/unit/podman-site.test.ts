import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];
function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'pool-site-test-'));
  temporaryDirectories.push(directory);
  return directory;
}
afterEach(() => {
  temporaryDirectories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true }));
});

describe('Podman site serving mode', () => {
  it.each(['1', 'true', '', 'false'])('serves the appropriate build with CI=%s', ci => {
    const directory = temporaryDirectory();
    writeFileSync(join(directory, 'bundle'), `#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = exec ]; then printf '%s\\n' "$@"; fi
`, { mode: 0o755 });
    const result = spawnSync('bash', ['-c', `
      cd() { return 0; }
      export -f cd
      bash "$1"
    `, 'test', resolve('scripts/podman-site-entrypoint.sh')], {
      encoding: 'utf8', env: { ...process.env, CI: ci, PATH: `${directory}:${process.env.PATH}` },
    });
    expect(result.status, result.stderr).toBe(0);
    const args = result.stdout.trim().split('\n');
    expect(args.slice(0, 3)).toEqual(['exec', 'jekyll', 'serve']);
    expect(args).toContain('--disable-disk-cache');
    const ciMode = ci === '1' || ci === 'true';
    expect(args).toContain(ciMode ? '--no-watch' : '--force_polling');
    expect(args).not.toContain(ciMode ? '--force_polling' : '--no-watch');
  });

  it('passes the caller CI mode to the site container', () => {
    const directory = temporaryDirectory();
    const log = join(directory, 'podman-calls');
    const source = readFileSync(resolve('scripts/dev-podman.sh'), 'utf8');
    const start = source.slice(source.indexOf('start_pod_containers() {'), source.indexOf('start_dev_stack_once() {'));
    const result = spawnSync('bash', ['-c', `
      set -euo pipefail
      podman() { printf '%s\\n' "$@" >> "$TEST_PODMAN_LOG"; }
      ${start}
      start_pod_containers
    `], { encoding: 'utf8', env: { ...process.env, CI: 'true', TEST_PODMAN_LOG: log,
      POD_NAME: 'test-pod', PODMAN_DEV_LABEL: 'test', JEKYLL_PORT: '4000', WORKER_PORT: '8787',
      SITE_CONTAINER: 'test-site', WORKER_CONTAINER: 'test-worker', ROOT_DIR: directory,
      SITE_VOLUME: 'test-bundle', WORKER_NODE_MODULES_VOLUME: 'test-worker-deps',
      SITE_IMAGE: 'test-site-image', WORKER_IMAGE: 'test-worker-image',
    } });
    expect(result.status, result.stderr).toBe(0);
    const calls = readFileSync(log, 'utf8');
    const siteCall = calls.slice(calls.indexOf('test-site\n'), calls.indexOf('test-site-image\n'));
    expect(siteCall.split('\n')).toContain('CI=true');
  });
});
