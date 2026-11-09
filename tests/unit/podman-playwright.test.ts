import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function launch(volume: string, status = 0) {
  return spawnSync('bash', ['-c', `
    uname() { echo Linux; }
    curl() { return 0; }
    podman() {
      case "$1" in
        inspect) printf '%s' "$TEST_WORKER_VOLUME" ;;
        image|volume) return 0 ;;
        run) printf '%s\\n' "$@"; return "$TEST_COMMAND_STATUS" ;;
        *) echo "Unexpected lifecycle operation: $*" >&2; return 99 ;;
      esac
    }
    export -f uname curl podman
    bash "$1" node --version
  `, 'test', resolve('scripts/podman-playwright-run.sh')], {
    encoding: 'utf8', env: { ...process.env, PODMAN_REBUILD: '0',
      TEST_WORKER_VOLUME: volume, TEST_COMMAND_STATUS: String(status) },
  });
}

describe('Podman browser fixture dependencies', () => {
  it('mounts the running Worker dependency volume read-only', () => {
    const result = launch('isolated-worker-dependencies');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.split('\n')).toContain('isolated-worker-dependencies:/workspace/worker/node_modules:ro');
    const version = JSON.parse(readFileSync('package-lock.json', 'utf8')).packages['node_modules/@playwright/test'].version;
    expect(result.stdout).toContain(`localhost/pool-dev-playwright:${version}-node-24.22.1`);
  });
  it('fails before launching tests when the dependency volume is unavailable', () => {
    const result = launch('');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('dependency volume');
    expect(result.stdout).not.toContain('--rm');
  });
  it('preserves test failure without cleaning up a stack it did not start', () => {
    const result = launch('isolated-worker-dependencies', 42);
    expect(result.status).toBe(42);
    expect(result.stderr).not.toContain('Unexpected lifecycle operation');
  });
});
