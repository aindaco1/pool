// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const premerge = readFileSync(join(process.cwd(), 'scripts/pre-merge-regression.sh'), 'utf8');
const buildDispatch = premerge.slice(
  premerge.indexOf('USE_PODMAN_JEKYLL=false\n'),
  premerge.indexOf('\nif [[ "${USE_PODMAN_JEKYLL}" = "true" ]]; then')
);

describe('pre-merge host toolchain inheritance', () => {
  it.each([true, false])('preserves the selected tools when host Jekyll is available: %s', (hostAvailable) => {
    const fixture = mkdtempSync(join(tmpdir(), 'pool-premerge-toolchain-'));
    const bin = join(fixture, 'selected-tools');
    const log = join(fixture, 'tools.log');
    const executable = (file: string, text: string) => writeFileSync(file, text, { mode: 0o755 });
    try {
      mkdirSync(bin);
      mkdirSync(join(fixture, 'scripts'));
      // Deterministically model a login profile that discards the caller's
      // toolchain, without reading or modifying the user's shell profiles.
      executable(join(bin, 'bash'), `#!/bin/sh
if [ "$1" = "-lc" ]; then
  shift
  export PATH=/usr/bin:/bin
  exec /bin/bash -c "$@"
fi
exec /bin/bash "$@"
`);
      for (const name of ['ruby', 'bundle', 'node']) {
        executable(join(bin, name), `#!/bin/sh\nprintf '%s\\n' '${name}' >> "$POOL_TOOLCHAIN_LOG"\n`);
      }
      executable(join(fixture, 'scripts/pre-merge-regression.sh'), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$1" >> "$POOL_TOOLCHAIN_LOG"
ruby --version
bundle check
node --version
`);
      execFileSync('/bin/bash', ['-c', `
set -euo pipefail
run_phase() { shift; "$@"; }
prepare_host_jekyll() { ${hostAvailable ? 'bundle check' : 'return 1'}; }
print_host_jekyll_fallback_reason() { :; }
${buildDispatch}
`], {
        cwd: fixture,
        env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, POOL_TOOLCHAIN_LOG: log },
        encoding: 'utf8',
        timeout: 10_000,
      });
      expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual([
        ...(hostAvailable ? ['bundle'] : []),
        hostAvailable ? '__host_or_podman_build_check' : '__podman_build_check',
        'ruby', 'bundle', 'node',
      ]);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
