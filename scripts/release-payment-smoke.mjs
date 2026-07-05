#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEV_VARS_PATH = path.join(ROOT, 'worker', '.dev.vars');
const args = process.argv.slice(2);
const help = args.includes('--help') || args.includes('-h');
const noDevVars = args.includes('--no-dev-vars') ||
  process.env.PAYMENT_SMOKE_USE_DEV_VARS === '0' ||
  process.env.RELEASE_USE_DEV_VARS === '0';
const localMutation = args.includes('--local-mutation') || process.env.PAYMENT_SMOKE_ALLOW_MUTATION === '1';
const useDevVars = !noDevVars;

if (help) {
  console.log(`Usage: npm run release:payment-smoke -- [options]

Options:
  --no-dev-vars       Do not read worker/.dev.vars. Use this for clean-shell CI probes.
  --local-mutation    Run the local mutable pledge smoke against a running local/Podman stack.
                      This never targets production.
  --help              Show this help.

Default behavior runs payment-adjacent unit checks and, when local/non-production
URLs are available, the read-only Worker checkout boundary smoke. Mutation smoke
is opt-in because The Pool saves cards now and charges later through settlement.

For local mutation evidence:

  PAYMENT_SMOKE_ALLOW_MUTATION=1 \\
  PAYMENT_SMOKE_WORKER_URL=http://127.0.0.1:8787 \\
  PAYMENT_SMOKE_SITE_URL=http://127.0.0.1:4000 \\
  POOL_EMAIL_DRY_RUN=true \\
  npm run release:payment-smoke -- --local-mutation
`);
  process.exit(0);
}

const results = [];
const FETCH_TIMEOUT_MS = Number(process.env.PAYMENT_SMOKE_FETCH_TIMEOUT_MS || 10000);

function add(status, label, detail = '') {
  results.push({ status, label, detail });
  const suffix = detail ? ` - ${detail}` : '';
  console.log(`${status.padEnd(5)} ${label}${suffix}`);
}

function readKeyValueFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const pivot = trimmed.indexOf('=');
    env[trimmed.slice(0, pivot).trim()] = trimmed.slice(pivot + 1).trim();
  }
  return env;
}

const devVars = readKeyValueFile(DEV_VARS_PATH);

function envValue(name) {
  const shellValue = String(process.env[name] || '').trim();
  if (shellValue) return shellValue;
  if (useDevVars) return String(devVars[name] || '').trim();
  return '';
}

function workerUrlFromEnv() {
  return (envValue('PAYMENT_SMOKE_WORKER_URL') || envValue('WORKER_URL') || envValue('WORKER_BASE')).replace(/\/+$/, '');
}

function siteUrlFromEnv() {
  return (envValue('PAYMENT_SMOKE_SITE_URL') || envValue('SITE_URL') || envValue('SITE_BASE')).replace(/\/+$/, '');
}

function urlsAreDerivedFromDevVars() {
  return useDevVars &&
    (devVars.WORKER_BASE || devVars.SITE_BASE) &&
    !process.env.PAYMENT_SMOKE_WORKER_URL &&
    !process.env.WORKER_URL &&
    !process.env.WORKER_BASE &&
    !process.env.PAYMENT_SMOKE_SITE_URL &&
    !process.env.SITE_URL &&
    !process.env.SITE_BASE;
}

function run(command, commandArgs = [], options = {}) {
  return spawnSync(command, commandArgs, {
    cwd: options.cwd || ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    env: { ...process.env, ...(options.env || {}) }
  });
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    let parsed = null;
    try {
      parsed = await response.json();
    } catch {}
    return { ok: response.ok, status: response.status, body: parsed };
  } catch (error) {
    return { ok: false, status: 0, body: null, error: error?.message || 'request failed' };
  } finally {
    clearTimeout(timeout);
  }
}

function assertNonProductionUrl(url, label) {
  if (!url) return { ok: false, reason: `${label} is not configured` };
  try {
    const host = new URL(url).hostname;
    if (['pool.dustwave.xyz', 'pledge.dustwave.xyz'].includes(host) && envValue('PAYMENT_SMOKE_ALLOW_PRODUCTION') !== '1') {
      return { ok: false, reason: `${label} points at production; use local/non-production URLs` };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: `${label} must be an absolute URL` };
  }
}

console.log('Pool release payment smoke');
console.log(`Generated: ${new Date().toISOString()}`);
console.log(`Dev vars: ${useDevVars ? 'yes' : 'no'}`);
console.log(`Local mutation: ${localMutation ? 'yes' : 'no'}`);
console.log('');

const unit = run('npx', [
  'vitest',
  'run',
  'tests/unit/checkout-intent.test.ts',
  'tests/unit/stripe-checkout-sidecar.test.ts',
  'tests/unit/settlement.test.ts',
  'tests/unit/pledge-management.test.ts',
  'tests/unit/email-tip.test.ts'
]);
if (unit.status === 0) add('PASS', 'Payment unit contract checks', 'checkout, Stripe sidecar, settlement, pledge management, and email contracts passed');
else add('FAIL', 'Payment unit contract checks', String(unit.stderr || unit.stdout || 'vitest failed').split(/\r?\n/).filter(Boolean).slice(-1)[0] || 'vitest failed');

if (envValue('POOL_EMAIL_DRY_RUN') || envValue('RESEND_EMAIL_DRY_RUN')) {
  add('PASS', 'No-send email evidence mode', 'POOL_EMAIL_DRY_RUN or RESEND_EMAIL_DRY_RUN is enabled');
} else {
  add('SKIP', 'No-send email evidence mode', 'set POOL_EMAIL_DRY_RUN=true or RESEND_EMAIL_DRY_RUN=true when running local mutation smoke');
}

const workerUrl = workerUrlFromEnv();
const siteUrl = siteUrlFromEnv();
if (workerUrl && siteUrl) {
  const reachable = await fetchJson(`${workerUrl}/notfound`);
  if (reachable.status === 0) {
    if (urlsAreDerivedFromDevVars()) {
      add('SKIP', 'Worker checkout boundary smoke', `local Worker from worker/.dev.vars is not running: ${reachable.error || 'request failed'}`);
    } else {
      add('FAIL', 'Worker checkout boundary smoke', `Worker URL is unreachable: ${reachable.error || 'request failed'}`);
    }
  } else {
    const worker = run('./scripts/test-worker.sh', [], {
      env: {
        WORKER_URL: workerUrl,
        SITE_URL: siteUrl
      }
    });
    if (worker.status === 0) add('PASS', 'Worker checkout boundary smoke', 'checkout start and malformed payload checks passed');
    else add('FAIL', 'Worker checkout boundary smoke', String(worker.stderr || worker.stdout || 'scripts/test-worker.sh failed').split(/\r?\n/).filter(Boolean).slice(-1)[0] || 'scripts/test-worker.sh failed');
  }
} else {
  add('SKIP', 'Worker checkout boundary smoke', 'set PAYMENT_SMOKE_WORKER_URL and PAYMENT_SMOKE_SITE_URL for local/non-production Worker evidence');
}

if (localMutation) {
  const workerCheck = assertNonProductionUrl(workerUrl, 'PAYMENT_SMOKE_WORKER_URL');
  const siteCheck = assertNonProductionUrl(siteUrl, 'PAYMENT_SMOKE_SITE_URL');
  if (!workerCheck.ok) {
    add('FAIL', 'Local mutable pledge smoke', workerCheck.reason);
  } else if (!siteCheck.ok) {
    add('FAIL', 'Local mutable pledge smoke', siteCheck.reason);
  } else {
    const smoke = run('./scripts/smoke-pledge-management.sh', [], {
      env: {
        WORKER_URL: workerUrl,
        SITE_URL: siteUrl,
        POOL_EMAIL_DRY_RUN: envValue('POOL_EMAIL_DRY_RUN') || 'true',
        RESEND_EMAIL_DRY_RUN: envValue('RESEND_EMAIL_DRY_RUN')
      }
    });
    if (smoke.status === 0) add('PASS', 'Local mutable pledge smoke', 'create/modify/cancel projection path passed');
    else add('FAIL', 'Local mutable pledge smoke', String(smoke.stderr || smoke.stdout || 'smoke-pledge-management failed').split(/\r?\n/).filter(Boolean).slice(-1)[0] || 'smoke-pledge-management failed');
  }
} else {
  add('SKIP', 'Local mutable pledge smoke', 'set PAYMENT_SMOKE_ALLOW_MUTATION=1 or pass --local-mutation against a local/non-production stack');
}

const failCount = results.filter((entry) => entry.status === 'FAIL').length;
const warnCount = results.filter((entry) => entry.status === 'WARN').length;
const skipCount = results.filter((entry) => entry.status === 'SKIP').length;
console.log('');
console.log(`Summary: ${failCount} fail, ${warnCount} warn, ${skipCount} skip`);
if (failCount) process.exit(1);
