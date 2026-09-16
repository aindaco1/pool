import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const helper = resolve('scripts/podman-machine.sh');
function select(os: string, connection = '', host = '', selected = 'shared-engine') {
  const result = spawnSync('bash', ['-c', `
    set -euo pipefail
    uname() { echo "$TEST_OS"; }
    podman() {
      case "$*" in
        'system connection list --format {{if .Default}}{{.Name}}{{end}}') echo "$TEST_SELECTED" ;;
        'machine inspect shared-engine') return 0 ;;
        'machine inspect '*) return 1 ;;
        *) echo "Unexpected lifecycle operation: $*" >&2; return 99 ;;
      esac
    }
    source "$1"
    pool_podman_configure_connection
    printf '%s|%s|%s' "\${CONTAINER_CONNECTION:-}" "\${CONTAINER_HOST:-}" "\${POOL_PODMAN_MACHINE:-}"
  `, 'test', helper], { encoding: 'utf8', env: { ...process.env, CONTAINER_CONNECTION: connection,
    CONTAINER_HOST: host, TEST_OS: os, TEST_SELECTED: selected } });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}
describe('shared Podman engine selection', () => {
  it.each(['Darwin', 'MINGW64_NT-10.0'])('pins the selected shared engine on %s', os => {
    expect(select(os)).toBe('shared-engine||shared-engine');
  });
  it('preserves explicit remote connections', () => {
    expect(select('Darwin', 'remote')).toBe('remote||');
  });
  it('preserves explicit URLs', () => {
    expect(select('Darwin', '', 'unix:///tmp/custom.sock')).toBe('|unix:///tmp/custom.sock|');
  });
  it('preserves native Linux selection', () => {
    expect(select('Linux')).toBe('||');
  });
  it('does not initialize a VM when no default is registered', () => {
    expect(select('Darwin', '', '', '')).toBe('||');
  });
  it('reports a busy host port without signalling its owner', () => {
    const source = readFileSync(resolve('scripts/dev-podman.sh'), 'utf8');
    const fn = source.slice(source.indexOf('wait_for_port_release() {'), source.indexOf('ensure_podman_ready() {'));
    const result = spawnSync('bash', ['-c', `
      set -euo pipefail
      lsof() { echo 'unrelated project listener'; }
      sleep() { :; }
      kill() { echo 'UNSAFE SIGNAL' >&2; return 99; }
      ${fn}
      wait_for_port_release 4000 Jekyll
    `], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Port 4000 is still in use');
    expect(result.stderr).not.toContain('UNSAFE SIGNAL');
  });
  it('enforces release memory even for an explicit remote endpoint', () => {
    const result = spawnSync('bash', ['-c', `
      set -euo pipefail
      uname() { echo Darwin; }
      sleep() { :; }
      podman() {
        case "$*" in
          '--version'|'info') return 0 ;;
          'info --format {{.Host.MemTotal}}') echo 4294967296 ;;
          *) echo "Unexpected operation: $*" >&2; return 99 ;;
        esac
      }
      export -f uname sleep podman
      bash "$1"
    `, 'test', resolve('scripts/podman-doctor.sh')], { encoding: 'utf8', env: {
      ...process.env, CONTAINER_HOST: 'unix:///tmp/explicit.sock', CONTAINER_CONNECTION: '',
      PODMAN_REQUIRE_RELEASE_RESOURCES: 'true'
    } });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('4096 MiB');
    expect(result.stdout).toContain('release gates need at least 6144 MiB');
    expect(result.stderr).not.toContain('Unexpected operation');
  });

});
