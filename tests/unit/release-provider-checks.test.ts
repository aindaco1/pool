import { describe, expect, it } from 'vitest';
import { buildProviderEvidence } from '../../scripts/release-provider-checks.mjs';

describe('release provider evidence', () => {
  it('builds a sanitized passing artifact for downstream posture jobs', () => {
    const evidence = buildProviderEvidence([
      { status: 'PASS', label: 'Cloudflare DNS zone', detail: 'configured zone resolved' },
      { status: 'PASS', label: 'Public Worker DNS', detail: 'worker host resolves' }
    ], {
      generatedAt: '2026-07-12T00:00:00.000Z',
      strict: true,
      cloudflareDnsOnly: true,
      usedDevVars: false
    });

    expect(evidence).toMatchObject({
      schemaVersion: 1,
      status: 'pass',
      failCount: 0,
      warnCount: 0,
      skipCount: 0,
      strict: true,
      cloudflareDnsOnly: true,
      usedDevVars: false,
      containsCredentials: false,
      containsCustomerData: false
    });
    expect(evidence.results).toHaveLength(2);
  });

  it('counts failures, warnings, and skipped checks without carrying extra fields', () => {
    const evidence = buildProviderEvidence([
      { status: 'FAIL', label: 'Required check', detail: 'not ready', secret: 'do-not-copy' },
      { status: 'WARN', label: 'Optional check', detail: 'review' },
      { status: 'SKIP', label: 'Credential check', detail: 'not configured' }
    ] as any[]);

    expect(evidence).toMatchObject({ status: 'fail', failCount: 1, warnCount: 1, skipCount: 1 });
    expect(JSON.stringify(evidence)).not.toContain('do-not-copy');
  });
});
