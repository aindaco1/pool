#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CONFIG = path.join(ROOT, 'config', 'performance-budgets.json');

function valueArg(args, name, fallback = '') {
  const found = args.find((arg) => arg.startsWith(`${name}=`));
  return found ? found.slice(name.length + 1) : fallback;
}

export function evaluateWorkerPerformanceEvidence(payload = {}, budgets = {}) {
  const summaryRows = (Array.isArray(payload.summaries) ? payload.summaries : []).flatMap((summary) => (
    Object.entries(summary?.operations || {}).map(([operation, metrics]) => ({ operation, ...metrics }))
  ));
  const rows = summaryRows.length > 0
    ? summaryRows
    : (Array.isArray(payload.slowRoutes) ? payload.slowRoutes : []);
  const checks = Object.entries(budgets.operations || {}).map(([operation, maximum]) => {
    const samples = rows.filter((row) => row?.operation === operation && Number(row?.count || 0) > 0);
    const actual = samples.length > 0
      ? Math.max(...samples.map((row) => Number(row?.p95Ms ?? Infinity)))
      : null;
    const count = samples.reduce((sum, row) => sum + Number(row?.count || 0), 0);
    return {
      operation,
      count,
      actualP95Ms: actual,
      maximumP95Ms: Number(maximum),
      ok: actual !== null && Number.isFinite(actual) && actual <= Number(maximum),
      failure: actual === null ? 'missing_samples' : (actual <= Number(maximum) ? '' : 'p95_above_budget')
    };
  });
  return {
    ok: checks.every((check) => check.ok),
    checks,
    containsCredentials: false,
    containsCustomerData: false
  };
}

export async function collectWorkerPerformanceEvidence(options = {}) {
  const config = options.config || JSON.parse(fs.readFileSync(options.configPath || DEFAULT_CONFIG, 'utf8'));
  let payload = options.payload;
  if (!payload) {
    const workerBase = String(options.workerBase || '').replace(/\/$/, '');
    const token = String(options.token || '');
    if (!workerBase || !token) throw new Error('Provide --input=<observability.json> or both --worker-base=<url> and ADMIN_PERFORMANCE_TOKEN.');
    const response = await (options.fetchImpl || fetch)(`${workerBase}/admin/observability/performance?days=${Number(options.days || 7)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`Performance observability request failed with HTTP ${response.status}.`);
    payload = await response.json();
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    ...evaluateWorkerPerformanceEvidence(payload, config.workerRoutes || {})
  };
}

async function main() {
  const args = process.argv.slice(2);
  const input = valueArg(args, '--input', '');
  const evidence = await collectWorkerPerformanceEvidence({
    configPath: valueArg(args, '--config', DEFAULT_CONFIG),
    payload: input ? JSON.parse(fs.readFileSync(path.resolve(input), 'utf8')) : null,
    workerBase: valueArg(args, '--worker-base', process.env.WORKER_BASE || ''),
    token: process.env.ADMIN_PERFORMANCE_TOKEN || '',
    days: valueArg(args, '--days', '7')
  });
  const output = valueArg(args, '--output', '');
  if (output) fs.writeFileSync(path.resolve(output), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
  if (!evidence.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.message || String(error));
    process.exit(1);
  });
}
