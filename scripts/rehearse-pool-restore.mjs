#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { buildChecksumManifest } from './lib/file-integrity.mjs';
import { buildPoolKvBackupPlan } from './pool-backup.mjs';
import { buildPoolRestorePlan, readAndVerifyPoolSnapshot } from './pool-restore.mjs';

function valueArg(args, name, fallback = '') {
  const prefix = `${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function familyValues(familyId, prefix = '') {
  if (familyId === 'pledges') return {
    'pledge:active': JSON.stringify({ orderId: 'active', campaignSlug: 'demo', pledgeStatus: 'active', charged: false, amount: 5000 }),
    'pledge:charged': JSON.stringify({ orderId: 'charged', campaignSlug: 'demo', pledgeStatus: 'active', charged: true, amount: 7500, stripePaymentIntentId: 'pi_fixture' }),
    'pledge:failed': JSON.stringify({ orderId: 'failed', campaignSlug: 'demo', pledgeStatus: 'payment_failed', charged: false, amount: 2500 }),
    'pledge:cancelled': JSON.stringify({ orderId: 'cancelled', campaignSlug: 'demo', pledgeStatus: 'cancelled', charged: false, amount: 1000 })
  };
  if (familyId === 'admin-users') return {
    'admin-users:v1': JSON.stringify({ version: 1, users: [{ email: 'recovery-admin@example.com', role: 'super_admin', campaignSlugs: [] }] })
  };
  if (familyId === 'votes') return { 'vote:demo:color:voter@example.com': 'Blue' };
  if (familyId === 'marketing-referrals') return { 'admin-marketing-referrals:demo': JSON.stringify([{ code: 'launch', label: 'Launch' }]) };
  if (familyId.includes('suppression')) return { [`${prefix}fixture`]: JSON.stringify({ suppressedAt: new Date(0).toISOString() }) };
  if (familyId === 'stripe-events') return { 'stripe-event:evt_fixture': 'processed' };
  if (familyId === 'campaign-charged') return { 'campaign-charged:demo': new Date(0).toISOString() };
  return {};
}

export function createSyntheticPoolRecoverySnapshot(root) {
  const plan = buildPoolKvBackupPlan({ includeValues: true });
  writeJson(path.join(root, 'kv', 'plan.json'), plan);
  for (const item of plan) if (item.valuesFile) writeJson(path.join(root, item.valuesFile), familyValues(item.familyId, item.prefix));
  writeJson(path.join(root, 'manifest.json'), { version: 2, encrypted: false, synthetic: true, includesKvValues: true });
  writeJson(path.join(root, 'checksums.json'), {
    schemaVersion: 1,
    artifacts: buildChecksumManifest(root, { exclude: ['checksums.json'] })
  });
  return root;
}

export function rehearsePoolRestore(options = {}) {
  const root = options.root || fs.mkdtempSync(path.join(os.tmpdir(), 'pool-restore-rehearsal-'));
  createSyntheticPoolRecoverySnapshot(root);
  const snapshot = readAndVerifyPoolSnapshot(root);
  const plan = buildPoolRestorePlan(snapshot);
  const restored = plan.actions.filter((item) => item.type === 'kv-restore');
  const rebuilt = plan.actions.filter((item) => item.type === 'rebuild');
  const evidence = {
    schemaVersion: 1,
    rehearsedAt: new Date().toISOString(),
    target: 'synthetic-local-contract',
    productionWrites: false,
    providerWrites: false,
    containsCredentials: false,
    containsCustomerData: false,
    integrityArtifacts: plan.integrity.checked,
    restoredFamilies: restored.length,
    restoredRecords: restored.reduce((sum, item) => sum + Number(item.records || 0), 0),
    rebuiltFamilies: rebuilt.length,
    missingValueFamilies: plan.missingValueFamilies.length,
    invalidActions: plan.invalidActions.length,
    durableObjectStorageImported: false,
    representativePledgeStates: ['active', 'charged', 'payment_failed', 'cancelled'],
    ok: plan.complete && restored.some((item) => item.binding === 'PLEDGES') && restored.some((item) => item.binding === 'VOTES')
  };
  if (!options.keepSnapshot) fs.rmSync(root, { recursive: true, force: true });
  return evidence;
}

function main() {
  const args = process.argv.slice(2);
  const result = rehearsePoolRestore({ keepSnapshot: args.includes('--keep-snapshot') });
  const output = valueArg(args, '--output', '');
  if (output) fs.writeFileSync(path.resolve(output), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
