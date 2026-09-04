#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { runCommand } from './lib/command-runner.mjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const targets = { root: repoRoot, worker: fileURLToPath(new URL('../worker/', import.meta.url)) };
const scopes = ['production', 'full'];
const severities = ['info', 'low', 'moderate', 'high', 'critical'];
const attempts = 3;

export function parseAuditArgs(args) {
  const options = { target: 'all', scope: 'both' };
  const seen = new Set();
  for (const arg of args) {
    const match = /^--(target|scope)=(.+)$/.exec(arg);
    if (!match || seen.has(match[1])) throw new Error('Use --target=root|worker|all and --scope=production|full|both.');
    const [, key, value] = match;
    const allowed = key === 'target' ? [...Object.keys(targets), 'all'] : [...scopes, 'both'];
    if (!allowed.includes(value)) throw new Error(`Invalid audit ${key}.`);
    options[key] = value;
    seen.add(key);
  }
  return options;
}

function validReport(report) {
  const counts = report?.metadata?.vulnerabilities;
  const entries = report?.vulnerabilities;
  if (report?.error || report?.auditReportVersion !== 2 || !counts || !entries ||
      typeof entries !== 'object' || Array.isArray(entries)) return false;
  if (![...severities, 'total'].every(key => Number.isSafeInteger(counts[key]) && counts[key] >= 0)) return false;
  if (severities.reduce((sum, key) => sum + counts[key], 0) !== counts.total) return false;
  const findings = Object.values(entries);
  return findings.length === counts.total && severities.every(severity =>
    findings.filter(finding => finding?.severity === severity).length === counts[severity]
  );
}

export function classifyAuditResult(result) {
  let report;
  try { report = JSON.parse(result.stdout); } catch { /* Incomplete output must never pass. */ }
  if (!result.error && !result.signal && !result.timedOut && validReport(report)) {
    const counts = report.metadata.vulnerabilities;
    if (![0, 1].includes(result.status)) return { state: 'incomplete', retryable: false, reason: 'unexpected npm exit status' };
    if (counts.moderate + counts.high + counts.critical > 0) return { state: 'findings', report };
    if (result.status === 0) return { state: 'passed', report };
    return { state: 'incomplete', retryable: false, reason: 'npm exit status contradicts the report' };
  }

  const code = report?.error?.code || report?.code;
  const statusCode = report?.error?.statusCode || report?.statusCode;
  // Only known transport/service failures are retried, never auth/configuration errors.
  const transientCode = /^(?:E(?:408|429|5\d\d)|ETIMEDOUT|ESOCKETTIMEDOUT|ECONNRESET|EAI_AGAIN|EPIPE)$/;
  const transientMessage = /\b(?:ETIMEDOUT|ESOCKETTIMEDOUT|ECONNRESET|EAI_AGAIN|EPIPE|E408|E429|E5\d\d)\b|network timeout at:|request-timeout/i.test(
    `${report?.message || ''}\n${result.stderr || ''}\n${result.error || ''}`
  );
  const retryable = result.timedOut || (code ? transientCode.test(code) || (code === 'FETCH_ERROR' && transientMessage) :
    statusCode ? [408, 429, 500, 502, 503, 504].includes(statusCode) : transientMessage);
  return {
    state: 'incomplete', retryable: Boolean(retryable),
    reason: result.timedOut ? 'process deadline exceeded' : retryable ? 'npm service/network failure' : 'npm did not return a valid, successful audit report'
  };
}

export async function auditDependencies({ target, scope, runCommandFn = runCommand, sleepFn = sleep, log = console.log }) {
  if (!Object.hasOwn(targets, target) || !scopes.includes(scope)) throw new Error('Invalid audit target or scope.');
  const args = [
    'audit', '--json', '--package-lock-only', '--ignore-scripts', '--audit-level=moderate',
    '--fetch-retries=0', '--fetch-timeout=30000', '--include=optional', '--include=peer',
    scope === 'production' ? '--omit=dev' : '--include=dev'
  ];
  const label = `${target}/${scope}`;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    log(`[${label}] audit attempt ${attempt}/${attempts} (45s process deadline)`);
    const result = classifyAuditResult(runCommandFn('npm', args, { cwd: targets[target], timeoutMs: 45_000, killSignal: 'SIGKILL' }));
    if (result.report) {
      log(`[${label}] ${result.state.toUpperCase()}: ${JSON.stringify(result.report.metadata.vulnerabilities)} (failure threshold: moderate)`);
      if (result.report.metadata.vulnerabilities.total > 0) log(JSON.stringify(result.report.vulnerabilities, null, 2));
      return result;
    }
    log(`[${label}] INCOMPLETE: ${result.reason}; this is not a clean audit.`);
    if (!result.retryable || attempt === attempts) return result;
    const delayMs = attempt * 5_000;
    log(`[${label}] retrying in ${delayMs / 1000}s`);
    await sleepFn(delayMs);
  }
}

export async function main(args = process.argv.slice(2), auditFn = auditDependencies) {
  const options = parseAuditArgs(args);
  const selectedTargets = options.target === 'all' ? Object.keys(targets) : [options.target];
  const selectedScopes = options.scope === 'both' ? scopes : [options.scope];
  let exitCode = 0;
  // Run every requested scope even if another fails, retaining separate evidence.
  for (const target of selectedTargets) {
    for (const scope of selectedScopes) {
      const result = await auditFn({ target, scope });
      exitCode = Math.max(exitCode, { passed: 0, findings: 1, incomplete: 2 }[result.state]);
    }
  }
  return exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(`Dependency audit failed: ${error.message}`);
    process.exitCode = 2;
  });
}
