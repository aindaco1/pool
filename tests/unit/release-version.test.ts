import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { WORKER_USER_AGENT, WORKER_VERSION } from '../../worker/src/version.js';

const repositoryRoot = process.cwd();

function readJson(relativePath: string) {
  return JSON.parse(readFileSync(`${repositoryRoot}/${relativePath}`, 'utf8'));
}

function readPlatformValue(key: string) {
  const config = readFileSync(`${repositoryRoot}/_config.yml`, 'utf8');
  const platformBlock = config.split(/^platform:\s*$/m)[1]?.split(/^\S/m)[0] || '';
  const match = platformBlock.match(
    new RegExp(`^\\s+${key}:\\s*["']?([^"'\\s]+)["']?\\s*$`, 'm')
  );
  return match?.[1];
}

describe('release version contract', () => {
  it('keeps packages, locks, canonical config, and provider identity aligned', () => {
    const versions = [
      readJson('package.json').version,
      readJson('package-lock.json').version,
      readJson('package-lock.json').packages[''].version,
      readJson('worker/package.json').version,
      readJson('worker/package-lock.json').version,
      readJson('worker/package-lock.json').packages[''].version,
      readPlatformValue('version')
    ];

    expect(versions).toEqual(versions.map(() => WORKER_VERSION));
    expect(readPlatformValue('release_label')).toBe(`v${WORKER_VERSION}`);
    expect(WORKER_USER_AGENT).toBe(`the-pool-worker/${WORKER_VERSION}`);
    const emailSource = readFileSync(`${repositoryRoot}/worker/src/email.js`, 'utf8');
    const stripeSource = readFileSync(`${repositoryRoot}/worker/src/stripe.js`, 'utf8');
    expect(emailSource).toMatch(/['"]User-Agent['"]:\s*WORKER_USER_AGENT/);
    expect(stripeSource).toContain('userAgent: clientOptions.userAgent || WORKER_USER_AGENT');
    expect(emailSource).not.toMatch(/the-pool-worker\/\d/);
    expect(stripeSource).not.toMatch(/the-pool-worker\/\d/);
  });
});
