#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { buildPoolRestorePlan, readAndVerifyPoolSnapshot, transformPoolKvValues } from './pool-restore.mjs';

function valueArg(args, name, fallback = '') {
  const exact = args.indexOf(name);
  if (exact >= 0 && args[exact + 1]) return args[exact + 1];
  const prefix = `${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function stripeKeyMode(key) {
  if (String(key).startsWith('sk_live_') || String(key).startsWith('rk_live_')) return 'live';
  if (String(key).startsWith('sk_test_') || String(key).startsWith('rk_test_')) return 'test';
  return '';
}

function amountCents(pledge = {}) {
  const value = Number(pledge.amount ?? pledge.totalAmount ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function summarizePoolPledges(pledges = []) {
  const paymentIntents = new Map();
  const summary = {
    pledgeCount: 0,
    activeCount: 0,
    cancelledCount: 0,
    chargedCount: 0,
    paymentFailedCount: 0,
    chargedAmountCents: 0,
    activeAmountCents: 0,
    uniquePaymentIntentCount: 0
  };
  for (const pledge of pledges) {
    summary.pledgeCount += 1;
    const status = String(pledge?.pledgeStatus || '').toLowerCase();
    if (status === 'cancelled') {
      summary.cancelledCount += 1;
      continue;
    }
    if (status === 'active') {
      summary.activeCount += 1;
      summary.activeAmountCents += amountCents(pledge);
    }
    if (status === 'payment_failed') summary.paymentFailedCount += 1;
    if (pledge?.charged === true) {
      summary.chargedCount += 1;
      summary.chargedAmountCents += amountCents(pledge);
      const id = String(pledge?.stripePaymentIntentId || pledge?.paymentIntentId || '').trim();
      if (id) paymentIntents.set(id, (paymentIntents.get(id) || 0) + amountCents(pledge));
    }
  }
  summary.uniquePaymentIntentCount = paymentIntents.size;
  return { summary, paymentIntents };
}

export function reconcilePoolPaymentIntents(pledges = [], providerRows = []) {
  const snapshot = summarizePoolPledges(pledges);
  const provider = new Map(providerRows.map((row) => [String(row?.id || ''), row]));
  const mismatch = { missing: 0, amount: 0, status: 0, mode: 0 };
  let providerAmountCents = 0;
  let providerSucceeded = 0;
  for (const [id, expectedAmount] of snapshot.paymentIntents.entries()) {
    const row = provider.get(id);
    if (!row) {
      mismatch.missing += 1;
      continue;
    }
    const actualAmount = Number(row.amount_received ?? row.amount ?? 0) || 0;
    providerAmountCents += actualAmount;
    if (row.status === 'succeeded') providerSucceeded += 1;
    else mismatch.status += 1;
    if (actualAmount !== expectedAmount) mismatch.amount += 1;
    if (row.livemode !== undefined && Boolean(row.livemode) !== (row.expectedMode === 'live')) mismatch.mode += 1;
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    containsIdentifiers: false,
    containsCustomerData: false,
    snapshot: snapshot.summary,
    provider: {
      paymentIntentCount: providerRows.length,
      succeededCount: providerSucceeded,
      amountCents: providerAmountCents
    },
    mismatches: mismatch,
    ok: Object.values(mismatch).every((value) => value === 0)
  };
}

export function loadSnapshotPledges(snapshotPath) {
  const snapshot = readAndVerifyPoolSnapshot(snapshotPath);
  const plan = buildPoolRestorePlan(snapshot);
  const action = plan.actions.find((item) => item.familyId === 'pledges' && item.type === 'kv-restore');
  if (!action) throw new Error('Snapshot does not contain complete pledge values.');
  return transformPoolKvValues(JSON.parse(fs.readFileSync(action.valuesFile, 'utf8')))
    .map((record) => JSON.parse(record.value));
}

async function fetchPaymentIntents(ids, key, expectedMode, fetchImpl = fetch) {
  const rows = [];
  for (let index = 0; index < ids.length; index += 10) {
    const group = ids.slice(index, index + 10);
    const results = await Promise.all(group.map(async (id) => {
      const response = await fetchImpl(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${key}` }
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Stripe read failed with status ${response.status}.`);
      const row = await response.json();
      return {
        id: String(row.id || ''),
        amount: Number(row.amount || 0),
        amount_received: Number(row.amount_received || 0),
        status: String(row.status || ''),
        livemode: row.livemode === true,
        expectedMode
      };
    }));
    rows.push(...results.filter(Boolean));
  }
  return rows;
}

export async function runPoolRecoveryReconciliation(options = {}) {
  const pledges = loadSnapshotPledges(options.snapshot);
  const summarized = summarizePoolPledges(pledges);
  if (options.stripeMode === 'off') {
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      containsIdentifiers: false,
      containsCustomerData: false,
      providerComparison: 'disabled',
      snapshot: summarized.summary,
      ok: true
    };
  }
  if (!['live', 'test'].includes(options.stripeMode)) throw new Error('--stripe-mode must be live, test, or off.');
  const key = String(options.stripeKey || process.env.STRIPE_RECOVERY_READ_KEY || process.env.STRIPE_SECRET_KEY || '').trim();
  const actualMode = stripeKeyMode(key);
  if (!actualMode) throw new Error('A restricted Stripe read key is required.');
  if (actualMode !== options.stripeMode) throw new Error(`Stripe credential mode mismatch: expected ${options.stripeMode}.`);
  const rows = await fetchPaymentIntents(Array.from(summarized.paymentIntents.keys()), key, options.stripeMode, options.fetchImpl || fetch);
  return reconcilePoolPaymentIntents(pledges, rows);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node scripts/pool-recovery-reconciliation.mjs --snapshot=DIR --stripe-mode=live|test|off [--output=FILE]');
    console.log('Provider evidence contains aggregate counts and reason categories only, never pledge, customer, or Stripe identifiers.');
    return;
  }
  const output = valueArg(args, '--output', '');
  const result = await runPoolRecoveryReconciliation({
    snapshot: valueArg(args, '--snapshot', ''),
    stripeMode: valueArg(args, '--stripe-mode', 'off')
  });
  if (output) fs.writeFileSync(path.resolve(output), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.message || String(error));
    process.exit(1);
  });
}
