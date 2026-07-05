#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const results = [];

function add(status, label, detail = '') {
  results.push({ status, label, detail });
  const suffix = detail ? ` - ${detail}` : '';
  console.log(`${status.padEnd(5)} ${label}${suffix}`);
}

function run(command, args = [], label) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    env: process.env
  });
  if (result.status === 0) {
    add('PASS', label, 'completed');
    return true;
  }
  const detail = String(result.stderr || result.stdout || `${command} failed`)
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-3)
    .join(' | ');
  add('FAIL', label, detail || `${command} failed`);
  return false;
}

console.log('Pool release pledge/report evidence');
console.log(`Generated: ${new Date().toISOString()}`);
console.log('');

run('npx', [
  'vitest',
  'run',
  'tests/unit/pledge-management.test.ts',
  'tests/unit/checkout-intent.test.ts',
  'tests/unit/reports-core.test.ts',
  'tests/unit/report-scripts.test.ts',
  'tests/unit/email-tip.test.ts',
  'tests/unit/settlement.test.ts',
  'tests/unit/worker-ops-integrity.test.ts'
], 'Pledge, settlement, report, and email unit evidence');

const failCount = results.filter((entry) => entry.status === 'FAIL').length;
const warnCount = results.filter((entry) => entry.status === 'WARN').length;
const skipCount = results.filter((entry) => entry.status === 'SKIP').length;
console.log('');
console.log(`Summary: ${failCount} fail, ${warnCount} warn, ${skipCount} skip`);
if (failCount) process.exit(1);
