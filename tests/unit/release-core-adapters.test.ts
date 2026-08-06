import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CACHE_POLICY_ORIGINS,
  collectCachePolicyEvidence
} from '../../scripts/audit-cache-policy.mjs';
import { ADMIN_RESPONSE_RULE_POLICY } from '../../scripts/configure-cloudflare-admin-response-rule.mjs';
import {
  SCREEN_READER_EVIDENCE_POLICY,
  collectScreenReaderEvidence
} from '../../scripts/release-screen-reader-evidence.mjs';

describe('Release Core consumer adapters', () => {
  it('retains Pool production origins while delegating cache evaluation', async () => {
    expect(CACHE_POLICY_ORIGINS).toEqual({
      site: 'https://pool.dustwave.xyz',
      worker: 'https://pledge.dustwave.xyz'
    });
    await expect(collectCachePolicyEvidence({
      config: { cachePolicy: [] },
      now: () => new Date('2026-08-06T00:00:00.000Z')
    })).resolves.toMatchObject({
      generatedAt: '2026-08-06T00:00:00.000Z',
      ok: true,
      checks: [],
      containsCredentials: false,
      containsCustomerData: false
    });
  });

  it('injects only Pool-owned Cloudflare and screen-reader policy', () => {
    expect(ADMIN_RESPONSE_RULE_POLICY).toMatchObject({
      ruleRef: 'pool_admin_no_transform_v1',
      rulesetName: 'Pool cache response rules',
      adminPaths: ['/admin', '/es/admin']
    });
    expect(SCREEN_READER_EVIDENCE_POLICY).toEqual({
      productLabel: 'Pool',
      tempPrefix: 'pool-screen-reader-evidence-',
      defaultExpectedPhrases: ['The Pool'],
      defaultUrl: 'http://127.0.0.1:4002/'
    });
  });

  it('keeps the adapter import-safe and delegates command execution to Platform', () => {
    const output: string[] = [];
    expect(collectScreenReaderEvidence({
      args: ['--help'],
      writeLine: (line: string) => output.push(line)
    })).toMatchObject({ product: 'Pool', exitCode: 0, help: true });
    expect(output.join('\n')).toContain('release:screen-reader-evidence');

    const source = readFileSync('scripts/release-screen-reader-evidence.mjs', 'utf8');
    expect(source).toContain('release-core/src/screen-reader-evidence.js');
    expect(source).not.toContain('node:child_process');
  });
});
