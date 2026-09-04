// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { auditDependencies, classifyAuditResult, main, parseAuditArgs } from '../../scripts/audit-dependencies.mjs';
import { runCommand } from '../../scripts/lib/command-runner.mjs';

function reportResult(severity?: string, status = severity && severity !== 'low' ? 1 : 0) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: severity ? 1 : 0 };
  if (severity) counts[severity] = 1;
  return {
    status, signal: '', error: '', timedOut: false, stderr: '',
    stdout: JSON.stringify({
      auditReportVersion: 2,
      vulnerabilities: severity ? { example: { name: 'example', severity, range: '<1.0.0' } } : {},
      metadata: { vulnerabilities: counts }
    })
  };
}

function errorResult(code: string) {
  return { ...reportResult(), status: 1, stdout: JSON.stringify({ error: { code } }) };
}

describe('dependency audit result classification', () => {
  it('requires a real, consistent audit report, not merely exit zero', () => {
    expect(classifyAuditResult(reportResult()).state).toBe('passed');
    for (const stdout of ['', 'null', '{}', 'not JSON', '{"auditReportVersion":2}', '{"error":{}}']) {
      expect(classifyAuditResult({ ...reportResult(), stdout })).toMatchObject({ state: 'incomplete', retryable: false });
    }
  });

  it.each(['moderate', 'high', 'critical'])('fails %s findings even with an unexpected zero exit status', severity => {
    expect(classifyAuditResult(reportResult(severity, 0)).state).toBe('findings');
    expect(classifyAuditResult(reportResult(severity, 1)).state).toBe('findings');
  });

  it('retains below-threshold findings in the report', () => {
    expect(classifyAuditResult(reportResult('low'))).toMatchObject({
      state: 'passed', report: { metadata: { vulnerabilities: { low: 1, total: 1 } } }
    });
  });

  it('rejects invalid counts, mismatched severities, empty findings, errors, and unsupported reports', () => {
    const mutations = [
      report => { report.metadata.vulnerabilities.low = -1; },
      report => { report.metadata.vulnerabilities.total = 0; },
      report => { report.metadata.vulnerabilities.low = '1'; },
      report => { report.metadata.vulnerabilities.low = 0.5; },
      report => { report.vulnerabilities.example.severity = 'unknown'; },
      report => { report.vulnerabilities = {}; },
      report => { report.vulnerabilities = []; },
      report => { report.error = { code: 'E401' }; },
      report => { report.auditReportVersion = 1; }
    ];
    for (const mutate of mutations) {
      const result = reportResult('low');
      const report = JSON.parse(result.stdout);
      mutate(report);
      expect(classifyAuditResult({ ...result, stdout: JSON.stringify(report) }).state).toBe('incomplete');
    }
  });

  it('does not accept reports from failed or interrupted processes', () => {
    for (const patch of [{ status: 1 }, { status: 2 }, { signal: 'SIGTERM' }, { error: 'spawn failed' }, { timedOut: true }]) {
      expect(classifyAuditResult({ ...reportResult(), ...patch }).state).toBe('incomplete');
    }
  });

  it.each(['E408', 'E429', 'E500', 'E502', 'E503', 'E504', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'EPIPE'])(
    'retries the known transient code %s', code => {
      expect(classifyAuditResult(errorResult(code))).toMatchObject({ state: 'incomplete', retryable: true });
    }
  );

  it.each(['E401', 'E403', 'E404', 'EUSAGE', 'ENOLOCK', 'ENOENT', 'ENOTFOUND', 'CERT_HAS_EXPIRED'])(
    'does not retry the configuration/authentication failure %s', code => {
      expect(classifyAuditResult({ ...errorResult(code), stderr: 'earlier request: E503' })).toMatchObject({ state: 'incomplete', retryable: false });
    }
  );

  it('recognizes the observed npm timeout with an empty error object and HTTP service failures', () => {
    const timeout = {
      ...reportResult(), status: 1,
      stdout: JSON.stringify({ message: 'network timeout at: https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', error: { summary: '', detail: '' } })
    };
    expect(classifyAuditResult(timeout)).toMatchObject({ state: 'incomplete', retryable: true });
    expect(classifyAuditResult({ ...timeout, stdout: '{"statusCode":503}' }).retryable).toBe(true);
    expect(classifyAuditResult({ ...timeout, stdout: '', timedOut: true }).retryable).toBe(true);
    expect(classifyAuditResult({ ...errorResult('FETCH_ERROR'), stderr: 'request-timeout' }).retryable).toBe(true);
    expect(classifyAuditResult(errorResult('FETCH_ERROR')).retryable).toBe(false);
    expect(classifyAuditResult({ ...timeout, stdout: '{"statusCode":401}', stderr: 'earlier E503' }).retryable).toBe(false);
  });
});

describe('bounded dependency audit execution', () => {
  it('retries transient errors with bounded backoff and then succeeds', async () => {
    const execute = vi.fn().mockReturnValueOnce(errorResult('E503')).mockReturnValueOnce(errorResult('E429')).mockReturnValue(reportResult());
    const sleepFn = vi.fn();
    const log = vi.fn();
    expect((await auditDependencies({ target: 'worker', scope: 'full', runCommandFn: execute, sleepFn, log })).state).toBe('passed');
    expect(execute).toHaveBeenCalledTimes(3);
    expect(sleepFn.mock.calls).toEqual([[5000], [10000]]);
    expect(execute).toHaveBeenLastCalledWith('npm', [
      'audit', '--json', '--package-lock-only', '--ignore-scripts', '--audit-level=moderate',
      '--fetch-retries=0', '--fetch-timeout=30000', '--include=optional', '--include=peer', '--include=dev'
    ], { cwd: expect.stringMatching(/\/worker\/$/), timeoutMs: 45000, killSignal: 'SIGKILL' });
  });

  it('stops after three incomplete attempts and never claims a clean audit or logs raw transport errors', async () => {
    const execute = vi.fn(() => ({ ...errorResult('E503'), stderr: 'private transport diagnostics' }));
    const sleepFn = vi.fn();
    const log = vi.fn();
    const result = await auditDependencies({ target: 'root', scope: 'production', runCommandFn: execute, sleepFn, log });
    expect(result).toMatchObject({ state: 'incomplete', retryable: true });
    expect(execute).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0][1]).toContain('--omit=dev');
    expect(execute.mock.calls[0][1]).not.toContain('--include=dev');
    expect(JSON.stringify(log.mock.calls)).not.toContain('PASSED');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private transport diagnostics');
  });

  it.each([reportResult('moderate'), reportResult('low'), errorResult('ENOLOCK'), { ...reportResult(), stdout: '' }])(
    'does not retry a completed report or an unknown/nontransient failure', async result => {
      const execute = vi.fn(() => result);
      const sleepFn = vi.fn();
      await auditDependencies({ target: 'root', scope: 'full', runCommandFn: execute, sleepFn, log: vi.fn() });
      expect(execute).toHaveBeenCalledTimes(1);
      expect(sleepFn).not.toHaveBeenCalled();
    }
  );

  it('prints below-threshold findings for explicit review', async () => {
    const log = vi.fn();
    await auditDependencies({ target: 'root', scope: 'full', runCommandFn: () => reportResult('low'), log });
    expect(JSON.stringify(log.mock.calls)).toContain('example');
    expect(JSON.stringify(log.mock.calls)).toContain('failure threshold: moderate');
  });

  it('rejects unknown targets and scopes before spawning npm', async () => {
    const execute = vi.fn();
    for (const options of [{ target: '../other', scope: 'full' }, { target: 'root', scope: 'none' }]) {
      await expect(auditDependencies({ ...options, runCommandFn: execute })).rejects.toThrow('Invalid audit');
    }
    expect(execute).not.toHaveBeenCalled();
  });

  it('enforces the shared process deadline even when a child ignores SIGTERM', () => {
    const start = Date.now();
    const result = runCommand(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"], {
      timeoutMs: 300, killSignal: 'SIGKILL'
    });
    expect(result.timedOut).toBe(true);
    expect(result.signal).toBe('SIGKILL');
    expect(Date.now() - start).toBeLessThan(3000);
  });
});

describe('dependency audit command line', () => {
  it('defaults to both lockfiles and both scopes, and validates explicit choices', () => {
    expect(parseAuditArgs([])).toEqual({ target: 'all', scope: 'both' });
    expect(parseAuditArgs(['--target=worker', '--scope=production'])).toEqual({ target: 'worker', scope: 'production' });
    for (const args of [['--fix'], ['--target=../other'], ['--scope=none'], ['--target=root', '--target=worker']]) {
      expect(() => parseAuditArgs(args)).toThrow();
    }
  });

  it.each(['passed', 'findings', 'incomplete'])('runs all four audits even after %s, with distinct failure exit codes', async state => {
    const auditFn = vi.fn().mockResolvedValueOnce({ state }).mockResolvedValue({ state: 'passed' });
    expect(await main([], auditFn)).toBe({ passed: 0, findings: 1, incomplete: 2 }[state]);
    expect(auditFn.mock.calls).toEqual([
      [{ target: 'root', scope: 'production' }], [{ target: 'root', scope: 'full' }],
      [{ target: 'worker', scope: 'production' }], [{ target: 'worker', scope: 'full' }]
    ]);
  });

  it('keeps incomplete evidence failing even if other scopes contain findings', async () => {
    const auditFn = vi.fn().mockResolvedValueOnce({ state: 'incomplete' }).mockResolvedValue({ state: 'findings' });
    expect(await main([], auditFn)).toBe(2);
    expect(auditFn).toHaveBeenCalledTimes(4);
  });

  it('supports a single matrix cell without running unrelated audits', async () => {
    const auditFn = vi.fn().mockResolvedValue({ state: 'passed' });
    expect(await main(['--target=worker', '--scope=full'], auditFn)).toBe(0);
    expect(auditFn.mock.calls).toEqual([[{ target: 'worker', scope: 'full' }]]);
  });
});
