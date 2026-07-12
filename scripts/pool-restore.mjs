#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runCommand } from './lib/command-runner.mjs';
import { transformKvBackupValuesToPutRecords } from './lib/kv-backup-records.mjs';
import { verifyChecksumManifest } from './lib/file-integrity.mjs';
import { loadPoolDataInventory } from './lib/pool-data-inventory.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKER_DIR = path.join(ROOT, 'worker');
const PRODUCTION_ACK = 'POOL_PRODUCTION_RESTORE';
const PREVIEW_CLEANUP_ACK = 'POOL_PREVIEW_RESTORE_CLEANUP';

function valueArg(args, name, fallback = '') {
  const prefix = `${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

export function parsePoolRestoreArgs(args = []) {
  return {
    snapshot: valueArg(args, '--snapshot', ''),
    target: valueArg(args, '--target', 'local'),
    persistTo: valueArg(args, '--persist-to', ''),
    execute: args.includes('--execute'),
    verify: args.includes('--verify'),
    cleanupPreview: args.includes('--cleanup-preview'),
    acknowledgePreviewCleanup: valueArg(args, '--acknowledge-preview-cleanup', ''),
    maintenanceMode: args.includes('--maintenance-mode'),
    stripePaused: args.includes('--stripe-paused'),
    settlementPaused: args.includes('--settlement-paused'),
    inventoryReviewed: args.includes('--inventory-reviewed'),
    includeIncidentEvidence: args.includes('--include-incident-evidence'),
    preRestoreSnapshot: valueArg(args, '--pre-restore-snapshot', ''),
    conflictPolicy: valueArg(args, '--conflict-policy', ''),
    acknowledgeProduction: valueArg(args, '--acknowledge-production', ''),
    help: args.includes('--help') || args.includes('-h')
  };
}

function printHelp() {
  console.log(`Usage: node scripts/pool-restore.mjs --snapshot=DIR [options]

Planning is the default. An encrypted receipt must first be decrypted into an
isolated private directory. Durable Object storage is never imported.

  --target=local|preview|production
  --execute                    Execute reviewed authoritative/control KV writes
  --verify                     Read back every restored KV value
  --cleanup-preview            Delete only snapshot-owned preview records
  --acknowledge-preview-cleanup=POOL_PREVIEW_RESTORE_CLEANUP
  --persist-to=DIR             Local Wrangler state directory
  --include-incident-evidence  Restore audit/login history only for an incident-specific plan

Production additionally requires:
  --maintenance-mode --stripe-paused --settlement-paused --inventory-reviewed
  --conflict-policy=overwrite
  --pre-restore-snapshot=DIR
  --acknowledge-production=POOL_PRODUCTION_RESTORE`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isWithin(root, candidate) {
  const base = path.resolve(root);
  const target = path.resolve(candidate);
  return target === base || target.startsWith(`${base}${path.sep}`);
}

export function readAndVerifyPoolSnapshot(snapshotPath) {
  const root = path.resolve(snapshotPath);
  const manifestPath = path.join(root, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('Snapshot manifest.json is missing.');
  const manifest = readJson(manifestPath);
  if (manifest.encrypted === true && !fs.existsSync(path.join(root, 'checksums.json'))) {
    throw new Error('Decrypt the encrypted snapshot into an isolated directory before restore planning.');
  }
  if (Number(manifest.version || 0) !== 2) throw new Error('Restore requires a Pool snapshot v2 manifest.');
  const checksumPath = path.join(root, 'checksums.json');
  if (!fs.existsSync(checksumPath)) throw new Error('Snapshot checksums.json is missing.');
  const checksums = readJson(checksumPath);
  const integrity = verifyChecksumManifest(root, checksums.artifacts || [], {
    requireComplete: true,
    exclude: ['checksums.json']
  });
  if (!integrity.ok) {
    throw new Error(`Snapshot integrity failed: ${integrity.failures.map((item) => `${item.path}:${item.reason}`).join(', ')}`);
  }
  return { root, manifest, integrity };
}

export function transformPoolKvValues(values = {}) {
  return transformKvBackupValuesToPutRecords(values);
}

export function validatePoolKvRecords(family, records = []) {
  const errors = [];
  const seen = new Set();
  for (const record of records) {
    if (!record.key || !record.key.startsWith(family.prefix)) errors.push(`${record.key || '<missing>'}: prefix mismatch`);
    if (seen.has(record.key)) errors.push(`${record.key}: duplicate`);
    seen.add(record.key);
    if (family.id === 'pledges') {
      try {
        const pledge = JSON.parse(record.value);
        if (!pledge?.orderId || record.key !== `pledge:${pledge.orderId}` || !pledge.campaignSlug || !pledge.pledgeStatus) {
          errors.push(`${record.key}: invalid pledge record`);
        }
      } catch {
        errors.push(`${record.key}: invalid pledge JSON`);
      }
    }
    if (family.id === 'admin-users') {
      try {
        const value = JSON.parse(record.value);
        const users = Array.isArray(value) ? value : value?.users;
        if (!Array.isArray(users) || users.some((user) => !String(user?.email || '').includes('@') || !['super_admin', 'campaign_user'].includes(user?.role))) {
          errors.push(`${record.key}: invalid admin user list`);
        }
      } catch {
        errors.push(`${record.key}: invalid admin user JSON`);
      }
    }
    if (family.id === 'votes' && !String(record.value || '').trim()) errors.push(`${record.key}: empty vote`);
  }
  return { ok: errors.length === 0, errors };
}

export function buildPoolRestorePlan(snapshot, options = {}) {
  const inventory = options.inventory || loadPoolDataInventory();
  const planFile = path.join(snapshot.root, 'kv', 'plan.json');
  const backupPlan = fs.existsSync(planFile) ? readJson(planFile) : [];
  const familyById = new Map(inventory.families.map((family) => [family.id, family]));
  const actions = [];
  const missingValueFamilies = [];
  const invalidActions = [];
  for (const item of backupPlan) {
    const family = familyById.get(item.familyId);
    if (!family) {
      invalidActions.push({ type: 'invalid', familyId: item.familyId, error: 'family is not in current inventory' });
      continue;
    }
    if (family.classification === 'ephemeral-quarantined') {
      actions.push({ type: 'skip', familyId: family.id, binding: family.binding, prefix: family.prefix, reason: 'quarantined' });
      continue;
    }
    if (family.classification === 'incident-evidence' && options.includeIncidentEvidence !== true) {
      actions.push({ type: 'skip', familyId: family.id, binding: family.binding, prefix: family.prefix, reason: 'incident evidence requires explicit inclusion' });
      continue;
    }
    if (family.backupValues !== true) {
      actions.push({ type: 'rebuild', familyId: family.id, binding: family.binding, prefix: family.prefix, reason: family.restoreDefault });
      continue;
    }
    if (!item.valuesFile) {
      missingValueFamilies.push({ familyId: family.id, binding: family.binding, prefix: family.prefix });
      continue;
    }
    const valuesFile = path.resolve(snapshot.root, item.valuesFile);
    if (!isWithin(snapshot.root, valuesFile) || !fs.existsSync(valuesFile)) {
      missingValueFamilies.push({ familyId: family.id, binding: family.binding, prefix: family.prefix });
      continue;
    }
    const records = transformPoolKvValues(readJson(valuesFile));
    const validation = validatePoolKvRecords(family, records);
    const action = {
      type: validation.ok ? 'kv-restore' : 'invalid',
      familyId: family.id,
      binding: family.binding,
      prefix: family.prefix,
      classification: family.classification,
      restorePhase: family.restorePhase,
      restoreDefault: family.restoreDefault,
      valuesFile,
      records: records.length,
      errors: validation.errors
    };
    actions.push(action);
    if (!validation.ok) invalidActions.push(action);
  }
  actions.sort((a, b) => Number(a.restorePhase || 99) - Number(b.restorePhase || 99) || String(a.familyId).localeCompare(String(b.familyId)));
  return {
    version: 1,
    snapshot: snapshot.root,
    integrity: snapshot.integrity,
    actions,
    invalidActions,
    missingValueFamilies,
    complete: invalidActions.length === 0 && missingValueFamilies.length === 0,
    durableObjectPolicy: 'never import; rebuild tier inventory from pledge truth and let checkout/settlement locks expire',
    verification: [
      'all restored KV values read back exactly',
      'campaign pledge and email indexes rebuilt from pledge truth',
      'stats, tier/add-on projections, and vote results reconcile',
      'Stripe PaymentIntent mode/count/amount aggregates reconcile before settlement resumes',
      'release smoke passes before production traffic reopens'
    ]
  };
}

export function productionPoolRestoreGate(options = {}) {
  const missing = [];
  if (options.maintenanceMode !== true) missing.push('maintenance mode');
  if (options.stripePaused !== true) missing.push('Stripe checkout/webhook mutation pause');
  if (options.settlementPaused !== true) missing.push('settlement/broadcast scheduler pause');
  if (options.inventoryReviewed !== true) missing.push('inventory and projection review');
  if (options.conflictPolicy !== 'overwrite') missing.push('conflict policy=overwrite');
  if (options.acknowledgeProduction !== PRODUCTION_ACK) missing.push('exact production acknowledgement');
  if (!options.preRestoreSnapshot) {
    missing.push('verified pre-restore snapshot');
  } else {
    try { readAndVerifyPoolSnapshot(options.preRestoreSnapshot); } catch { missing.push('verified pre-restore snapshot'); }
  }
  if (options.restoreSnapshot && options.preRestoreSnapshot && path.resolve(options.restoreSnapshot) === path.resolve(options.preRestoreSnapshot)) {
    missing.push('distinct pre-restore snapshot');
  }
  return { ok: missing.length === 0, missing };
}

function targetFlags(options = {}) {
  if (options.target === 'local') return ['--local', '--persist-to', options.persistTo || path.join(os.tmpdir(), 'pool-restore-wrangler')];
  if (options.target === 'preview') return ['--remote', '--preview'];
  return ['--remote'];
}

function runForOptions(options, command, args) {
  const execute = options.runCommandFn || runCommand;
  return execute(command, args, { cwd: WORKER_DIR, timeoutMs: 120_000, maxBuffer: 16 * 1024 * 1024 });
}

function chunks(values, size = 100) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

export function executePoolRestorePlan(plan, options = {}) {
  if (plan.invalidActions.length) throw new Error('Restore plan contains invalid records.');
  if (plan.missingValueFamilies.length) throw new Error(`Restore execution blocked: missing value artifacts for ${plan.missingValueFamilies.map((item) => item.familyId).join(', ')}.`);
  if (!['local', 'preview', 'production'].includes(options.target)) throw new Error('Restore target must be local, preview, or production.');
  if (options.target === 'production') {
    const gate = productionPoolRestoreGate({ ...options, restoreSnapshot: plan.snapshot });
    if (!gate.ok) throw new Error(`Production restore blocked: ${gate.missing.join(', ')}.`);
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-restore-'));
  const evidence = { ok: true, target: options.target, writes: 0, records: 0, failures: [] };
  try {
    for (const action of plan.actions.filter((item) => item.type === 'kv-restore')) {
      const records = transformPoolKvValues(readJson(action.valuesFile));
      if (!records.length) continue;
      const restoreFile = path.join(temp, `${action.binding}-${action.familyId}.json`);
      fs.writeFileSync(restoreFile, `${JSON.stringify(records, null, 2)}\n`, { mode: 0o600 });
      const result = runForOptions(options, 'npx', [
        'wrangler', 'kv', 'bulk', 'put', restoreFile, '--binding', action.binding, ...targetFlags(options)
      ]);
      evidence.writes += 1;
      evidence.records += records.length;
      if (result.status !== 0) {
        evidence.ok = false;
        evidence.failures.push({ familyId: action.familyId, reason: 'provider write failed' });
        break;
      }
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  return evidence;
}

export function verifyPoolRestorePlan(plan, options = {}) {
  if (plan.invalidActions.length || plan.missingValueFamilies.length) throw new Error('Restore verification requires a complete valid plan.');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-restore-verify-'));
  const evidence = { ok: true, target: options.target, reads: 0, records: 0, failures: [] };
  try {
    for (const action of plan.actions.filter((item) => item.type === 'kv-restore')) {
      const expected = transformPoolKvValues(readJson(action.valuesFile));
      const expectedMap = new Map(expected.map((entry) => [entry.key, entry.value]));
      for (const [index, group] of chunks(expected, 100).entries()) {
        const keysFile = path.join(temp, `${action.binding}-${action.familyId}-${index}.json`);
        fs.writeFileSync(keysFile, `${JSON.stringify(group.map((entry) => ({ name: entry.key })), null, 2)}\n`, { mode: 0o600 });
        const result = runForOptions(options, 'npx', [
          'wrangler', 'kv', 'bulk', 'get', keysFile, '--binding', action.binding, ...targetFlags(options)
        ]);
        evidence.reads += 1;
        if (result.status !== 0) {
          evidence.ok = false;
          evidence.failures.push({ familyId: action.familyId, reason: 'provider read failed' });
          continue;
        }
        const actual = transformPoolKvValues(JSON.parse(result.stdout || '{}'));
        for (const record of actual) {
          evidence.records += 1;
          if (expectedMap.get(record.key) !== record.value) {
            evidence.ok = false;
            evidence.failures.push({ familyId: action.familyId, key: record.key, reason: 'value mismatch' });
          }
          expectedMap.delete(record.key);
        }
      }
      for (const key of expectedMap.keys()) {
        evidence.ok = false;
        evidence.failures.push({ familyId: action.familyId, key, reason: 'missing after restore' });
      }
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  return evidence;
}

export function cleanupPoolPreviewRestore(plan, options = {}) {
  if (options.target !== 'preview') throw new Error('Snapshot-owned cleanup is preview-only.');
  if (options.acknowledgePreviewCleanup !== PREVIEW_CLEANUP_ACK) throw new Error('Preview cleanup requires exact acknowledgement.');
  if (plan.invalidActions.length || plan.missingValueFamilies.length) throw new Error('Preview cleanup requires a complete valid plan.');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-restore-cleanup-'));
  const evidence = { ok: true, deletes: 0, records: 0, failures: [] };
  try {
    for (const action of plan.actions.filter((item) => item.type === 'kv-restore')) {
      const records = transformPoolKvValues(readJson(action.valuesFile));
      if (!records.length) continue;
      const keysFile = path.join(temp, `${action.binding}-${action.familyId}.json`);
      fs.writeFileSync(keysFile, `${JSON.stringify(records.map((entry) => entry.key), null, 2)}\n`, { mode: 0o600 });
      const result = runForOptions(options, 'npx', [
        'wrangler', 'kv', 'bulk', 'delete', keysFile, '--binding', action.binding, '--remote', '--preview'
      ]);
      evidence.deletes += 1;
      evidence.records += records.length;
      if (result.status !== 0) {
        evidence.ok = false;
        evidence.failures.push({ familyId: action.familyId, reason: 'provider delete failed' });
      }
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  return evidence;
}

export async function runPoolRestore(options = {}) {
  const snapshot = readAndVerifyPoolSnapshot(options.snapshot);
  const plan = buildPoolRestorePlan(snapshot, options);
  const execution = options.execute ? executePoolRestorePlan(plan, options) : null;
  const verification = options.verify ? verifyPoolRestorePlan(plan, options) : null;
  const cleanup = options.cleanupPreview ? cleanupPoolPreviewRestore(plan, options) : null;
  return { snapshot, plan, execution, verification, cleanup };
}

async function main() {
  const options = parsePoolRestoreArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  if (!options.snapshot) throw new Error('--snapshot is required.');
  const result = await runPoolRestore(options);
  console.log(`Pool restore plan verified ${result.plan.integrity.checked} artifacts and prepared ${result.plan.actions.length} actions.`);
  if (!result.plan.complete) console.log(`Execution remains blocked: ${result.plan.missingValueFamilies.length} value families missing and ${result.plan.invalidActions.length} invalid actions.`);
  if (result.execution) console.log(`Restore execution ${result.execution.ok ? 'completed' : 'failed'}.`);
  if (result.verification) console.log(`Restore verification ${result.verification.ok ? 'completed' : 'failed'}.`);
  if (result.cleanup) console.log(`Preview cleanup ${result.cleanup.ok ? 'completed' : 'failed'}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}
