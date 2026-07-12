#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildChecksumManifest, enforcePrivatePermissions, sha256File } from './lib/file-integrity.mjs';
import { commandAvailable, runCommand } from './lib/command-runner.mjs';
import { loadPoolDataInventory, poolKvBackupFamilies, poolKvValueBackupFamilies, poolQuarantinedKvFamilies } from './lib/pool-data-inventory.mjs';
import { normalizeWranglerInventory } from './lib/wrangler-config.mjs';
import { stripeCliAuthState } from './lib/stripe-cli-auth.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKER_DIR = path.join(ROOT, 'worker');
const WRANGLER_PATH = path.join(WORKER_DIR, 'wrangler.toml');
const DEV_VARS_PATH = path.join(WORKER_DIR, '.dev.vars');
const INVENTORY = loadPoolDataInventory();
const SENSITIVE_ACK = 'POOL_SENSITIVE_BACKUP';
const LOCAL_PATHS = [
  'README.md', 'CHANGELOG.md', '_config.yml', '_config.local.yml', 'Gemfile', 'Gemfile.lock',
  'package.json', 'package-lock.json', 'worker/package.json', 'worker/package-lock.json',
  'worker/wrangler.toml', 'config/pool-data-inventory.json'
];
const SECRET_NAMES = [
  'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_DNS_API_TOKEN',
  'ADMIN_SECRET', 'ADMIN_SESSION_SECRET', 'MAGIC_LINK_SECRET', 'CHECKOUT_INTENT_SECRET',
  'STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY_LIVE', 'STRIPE_SECRET_KEY_TEST',
  'STRIPE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_SECRET_LIVE', 'STRIPE_WEBHOOK_SECRET_TEST',
  'RESEND_API_KEY', 'TURNSTILE_SECRET_KEY', 'ADMIN_TURNSTILE_SECRET_KEY',
  'LAUNCH_REMINDER_TURNSTILE_SECRET_KEY', 'LAUNCH_REMINDER_TOKEN_SECRET',
  'ABANDONED_CART_TOKEN_SECRET', 'USPS_CLIENT_SECRET', 'ZIP_TAX_API_KEY',
  'GITHUB_TOKEN', 'ADMIN_SETTLEMENT_SECRET', 'ADMIN_BROADCAST_SECRET'
];

function timestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function valueArg(args, name, fallback = '') {
  const prefix = `${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

export function parsePoolBackupArgs(args = []) {
  return {
    output: valueArg(args, '--output', ''),
    remote: args.includes('--remote'),
    kvValues: args.includes('--kv-values'),
    releaseSnapshot: args.includes('--release-snapshot'),
    acknowledgeSensitive: valueArg(args, '--acknowledge-sensitive', ''),
    encryptionRecipient: valueArg(args, '--encryption-recipient', process.env.POOL_BACKUP_ENCRYPTION_RECIPIENT || ''),
    encryptionBackend: valueArg(args, '--encryption-backend', 'auto'),
    skipGitBundle: args.includes('--skip-git-bundle'),
    skipBuild: args.includes('--skip-build'),
    dryRun: args.includes('--dry-run'),
    help: args.includes('--help') || args.includes('-h')
  };
}

function printHelp() {
  console.log(`Usage: node scripts/pool-backup.mjs [options]

Creates a checksum-covered Pool snapshot v2 manifest. Planning and metadata
capture never export secret values. Sensitive KV values require encryption.

  --output=DIR          Defaults to ~/pool-backups/<UTC timestamp>
  --remote              Capture read-only Worker/provider and KV key metadata
  --kv-values           Capture approved authoritative/control KV values
  --release-snapshot    Protect the result in retention planning
  --acknowledge-sensitive=POOL_SENSITIVE_BACKUP
  --encryption-recipient=RECIPIENT
  --encryption-backend=auto|age|gpg
  --skip-git-bundle     Skip the repository recovery bundle
  --skip-build          Skip isolated Jekyll/Wrangler build evidence
  --dry-run             Print the plan without writing or provider mutations`);
}

function run(command, args = [], options = {}) {
  return runCommand(command, args, { cwd: options.cwd || ROOT, ...options });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function safeName(value) {
  return String(value || 'item').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'item';
}

function isWithin(root, candidate) {
  const base = path.resolve(root);
  const target = path.resolve(candidate);
  return target === base || target.startsWith(`${base}${path.sep}`);
}

function resolveExistingAncestor(candidate) {
  const suffix = [];
  let current = path.resolve(candidate);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(candidate);
    suffix.unshift(path.basename(current));
    current = parent;
  }
  return path.resolve(fs.realpathSync(current), ...suffix);
}

export function validatePoolBackupSafety(options, output) {
  const sensitive = options.kvValues === true;
  const errors = [];
  if (sensitive && options.remote !== true) errors.push('--kv-values requires --remote.');
  if (sensitive && options.acknowledgeSensitive !== SENSITIVE_ACK) {
    errors.push(`Sensitive capture requires --acknowledge-sensitive=${SENSITIVE_ACK}.`);
  }
  if (sensitive && !String(options.encryptionRecipient || '').trim()) {
    errors.push('Sensitive capture requires --encryption-recipient.');
  }
  if (sensitive && isWithin(fs.realpathSync(ROOT), resolveExistingAncestor(output))) {
    errors.push('Sensitive snapshots cannot be written inside or through a symlink into the repository.');
  }
  if (!['auto', 'age', 'gpg'].includes(String(options.encryptionBackend || 'auto'))) {
    errors.push('Encryption backend must be auto, age, or gpg.');
  }
  return { ok: errors.length === 0, sensitive, errors };
}

function readDevVarNames(devVarsPath = DEV_VARS_PATH) {
  if (!fs.existsSync(devVarsPath)) return new Set();
  return new Set(fs.readFileSync(devVarsPath, 'utf8').split(/\r?\n/)
    .map((line) => line.match(/^([A-Z0-9_]+)=/)?.[1]).filter(Boolean));
}

export function buildPoolSecretInventory(options = {}) {
  const optionShape = options && (Object.hasOwn(options, 'env') || Object.hasOwn(options, 'devVarsPath'));
  const env = optionShape ? (options.env || process.env) : (Object.keys(options || {}).length ? options : process.env);
  const localNames = readDevVarNames(optionShape ? (options.devVarsPath || DEV_VARS_PATH) : DEV_VARS_PATH);
  return SECRET_NAMES.map((name) => ({
    name,
    shellPresent: Boolean(String(env[name] || '').trim()),
    localDevPresent: localNames.has(name),
    valueExported: false
  }));
}

export function buildPoolKvBackupPlan({ includeValues = false, inventory = INVENTORY } = {}) {
  const valueIds = new Set(poolKvValueBackupFamilies({ inventory }).map((family) => family.id));
  return poolKvBackupFamilies({ inventory }).map((family) => {
    const base = `${safeName(family.binding)}-${safeName(family.id)}`;
    return {
      familyId: family.id,
      binding: family.binding,
      prefix: family.prefix,
      classification: family.classification,
      keysFile: `kv/${base}.keys.json`,
      valuesFile: includeValues && valueIds.has(family.id) ? `kv/${base}.values.json` : ''
    };
  });
}

function captureCommand(manifest, label, command, args, options = {}) {
  const record = { label, command, args, status: 'planned' };
  manifest.commands.push(record);
  if (options.dryRun) return { status: 0, stdout: '', stderr: '', planned: true };
  const result = run(command, args, options);
  record.status = result.status;
  if (result.status !== 0) {
    manifest.warnings.push(`${label} failed: ${options.failureReason || result.error || `exit ${result.status}`}`);
  }
  if (options.stdoutFile && result.status === 0) writeText(options.stdoutFile, result.stdout);
  return result;
}

function captureGit(manifest, root, options) {
  const gitDir = path.join(root, 'git');
  ensureDir(gitDir);
  captureCommand(manifest, 'git head', 'git', ['rev-parse', 'HEAD'], { ...options, stdoutFile: path.join(gitDir, 'pool-head.txt') });
  captureCommand(manifest, 'git status', 'git', ['status', '--porcelain=v1', '--branch'], { ...options, stdoutFile: path.join(gitDir, 'pool-status.txt') });
  captureCommand(manifest, 'git diff', 'git', ['diff', '--binary'], { ...options, stdoutFile: path.join(gitDir, 'pool-working-tree.patch') });
  if (!options.skipGitBundle) {
    captureCommand(manifest, 'git bundle', 'git', ['bundle', 'create', path.join(gitDir, 'pool.bundle'), '--all'], { ...options, timeoutMs: 120_000 });
  }
}

function captureLocalFiles(manifest, root) {
  const copied = [];
  for (const relative of LOCAL_PATHS) {
    const source = path.join(ROOT, relative);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) continue;
    const target = path.join(root, 'files', relative);
    ensureDir(path.dirname(target));
    fs.copyFileSync(source, target);
    fs.chmodSync(target, 0o600);
    copied.push(relative);
  }
  manifest.localFiles = copied;
}

function captureBuildEvidence(manifest, root, options) {
  if (options.skipBuild) return;
  const evidenceDir = path.join(root, 'build');
  ensureDir(evidenceDir);
  const buildDir = path.join(os.tmpdir(), `pool-backup-build-${process.pid}`);
  try {
    captureCommand(manifest, 'Jekyll production build', 'bundle', ['exec', 'jekyll', 'build', '--destination', buildDir], {
      ...options, cwd: ROOT, timeoutMs: 180_000, stdoutFile: path.join(evidenceDir, 'jekyll-build.txt')
    });
    captureCommand(manifest, 'Wrangler deploy dry run', 'npx', ['wrangler', 'deploy', '--dry-run', '--outdir', path.join(buildDir, 'worker')], {
      ...options, cwd: WORKER_DIR, timeoutMs: 120_000, stdoutFile: path.join(evidenceDir, 'wrangler-dry-run.txt')
    });
  } finally {
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
}

function captureProviderMetadata(manifest, root, options, wrangler) {
  const dir = path.join(root, 'provider');
  ensureDir(dir);
  writeJson(path.join(dir, 'wrangler-inventory.json'), wrangler);
  writeJson(path.join(dir, 'secret-inventory.json'), buildPoolSecretInventory({ env: process.env }));
  if (!options.remote) return;
  captureCommand(manifest, 'wrangler versions list', 'npx', ['wrangler', 'versions', 'list', '--json', '--env='], {
    ...options, cwd: WORKER_DIR, stdoutFile: path.join(dir, 'worker-versions.json'), failureReason: 'Worker version inventory unavailable'
  });
  captureCommand(manifest, 'wrangler deployments list', 'npx', ['wrangler', 'deployments', 'list', '--json', '--env='], {
    ...options, cwd: WORKER_DIR, stdoutFile: path.join(dir, 'worker-deployments.json'), failureReason: 'Worker deployment inventory unavailable'
  });
  captureCommand(manifest, 'wrangler secret names', 'npx', ['wrangler', 'secret', 'list', '--format', 'json', '--env='], {
    ...options, cwd: WORKER_DIR, stdoutFile: path.join(dir, 'worker-secret-names.json'), failureReason: 'Worker secret-name inventory unavailable'
  });
  const stripeAuth = stripeCliAuthState({ cwd: ROOT, mode: 'test' });
  if (stripeAuth.authenticated) {
    captureCommand(manifest, 'Stripe webhook inventory', 'stripe', ['webhook_endpoints', 'list', '--limit', '100'], {
      ...options, stdoutFile: path.join(dir, 'stripe-webhook-endpoints.json'), failureReason: 'authenticated Stripe CLI inventory request failed'
    });
  } else {
    manifest.warnings.push(`${stripeAuth.reason}; Stripe endpoint inventory skipped.`);
  }
}

function chunks(values, size = 100) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function captureKv(manifest, root, options) {
  const dir = path.join(root, 'kv');
  ensureDir(dir);
  const plan = buildPoolKvBackupPlan({ includeValues: options.kvValues });
  writeJson(path.join(dir, 'plan.json'), plan);
  writeJson(path.join(dir, 'classification.json'), {
    schemaVersion: INVENTORY.schemaVersion,
    families: INVENTORY.families,
    quarantined: poolQuarantinedKvFamilies({ inventory: INVENTORY }).map((family) => family.id),
    durableObjectRestore: 'reconcile-or-expire; never import storage directly'
  });
  if (!options.remote) return;
  for (const item of plan) {
    const keysPath = path.join(root, item.keysFile);
    const listed = captureCommand(manifest, `KV keys ${item.binding}/${item.prefix}`, 'npx', [
      'wrangler', 'kv', 'key', 'list', '--remote', '--binding', item.binding, '--prefix', item.prefix
    ], { ...options, cwd: WORKER_DIR, stdoutFile: keysPath, failureReason: 'KV key inventory failed' });
    manifest.usage.kvListOperations += 1;
    if (!item.valuesFile) continue;
    if (listed.status !== 0) throw new Error(`Required KV key inventory failed for ${item.familyId}.`);
    const keyEntries = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
    if (!Array.isArray(keyEntries)) throw new Error(`KV key inventory is invalid for ${item.familyId}.`);
    const valueMap = {};
    for (const [index, group] of chunks(keyEntries, 100).entries()) {
      const names = group.map((entry) => ({ name: String(entry?.name || entry || '') })).filter((entry) => entry.name);
      const keysFile = path.join(dir, `${safeName(item.binding)}-${safeName(item.familyId)}-${index + 1}.keys.json`);
      const valuesFile = path.join(dir, `${safeName(item.binding)}-${safeName(item.familyId)}-${index + 1}.values.json`);
      writeJson(keysFile, names);
      const read = captureCommand(manifest, `KV values ${item.binding}/${item.familyId} ${index + 1}`, 'npx', [
        'wrangler', 'kv', 'bulk', 'get', keysFile, '--remote', '--binding', item.binding
      ], { ...options, cwd: WORKER_DIR, stdoutFile: valuesFile, failureReason: 'KV bulk value capture failed' });
      manifest.usage.kvBulkReadOperations += 1;
      if (read.status !== 0) throw new Error(`KV value capture failed for ${item.familyId}.`);
      Object.assign(valueMap, JSON.parse(fs.readFileSync(valuesFile, 'utf8')) || {});
      fs.rmSync(keysFile, { force: true });
      fs.rmSync(valuesFile, { force: true });
    }
    if (Object.keys(valueMap).length !== keyEntries.length) {
      throw new Error(`KV value capture count mismatch for ${item.familyId}.`);
    }
    writeJson(path.join(root, item.valuesFile), valueMap);
    manifest.usage.kvKeysRead += keyEntries.length;
    manifest.kvValueCapture.push({ familyId: item.familyId, binding: item.binding, keys: keyEntries.length, complete: true });
  }
}

function writeRestoreGuide(root) {
  writeText(path.join(root, 'RESTORE_PLAN.md'), `# Pool Restore Plan

1. Verify every checksum and decrypt into an isolated private directory.
2. Restore Git-backed campaign/config/media history first.
3. Restore reviewed admin users, authoritative pledges, consent/suppression state, votes, then idempotency controls.
4. Do not restore sessions, login nonces, rate limits, preview capabilities, checkout scratch rows, pending reminders, cron markers, or Durable Object storage.
5. Rebuild campaign/email indexes, stats, add-on/tier projections, and vote results from restored truth.
6. Reconcile Stripe state and require maker/checker approval before any money-affecting or inventory-coordinator recovery.
7. Verify through Pool release smoke before reopening pledge, settlement, reminder, or broadcast traffic.
`);
}

function selectEncryptionBackend(requested = 'auto') {
  if (requested === 'age' || (requested === 'auto' && commandAvailable('age'))) return commandAvailable('age') ? 'age' : '';
  if (requested === 'gpg' || requested === 'auto') return commandAvailable('gpg') ? 'gpg' : '';
  return '';
}

function encryptSnapshot(staging, output, options, manifest) {
  const backend = selectEncryptionBackend(options.encryptionBackend);
  if (!backend) throw new Error('No supported encryption backend is available. Install age or GPG.');
  ensureDir(output);
  const archive = path.join(path.dirname(staging), `${path.basename(staging)}.tar.gz`);
  const encryptedName = backend === 'age' ? 'pool-backup.tar.gz.age' : 'pool-backup.tar.gz.gpg';
  const encrypted = path.join(output, encryptedName);
  try {
    let result = run('tar', ['-czf', archive, '-C', staging, '.']);
    if (result.status !== 0) throw new Error('Unable to archive sensitive snapshot.');
    fs.chmodSync(archive, 0o600);
    result = backend === 'age'
      ? run('age', ['--recipient', options.encryptionRecipient, '--output', encrypted, archive])
      : run('gpg', ['--batch', '--yes', '--trust-model', 'always', '--encrypt', '--recipient', options.encryptionRecipient, '--output', encrypted, archive]);
    if (result.status !== 0) throw new Error('Unable to encrypt sensitive snapshot.');
    fs.chmodSync(encrypted, 0o600);
    const identity = String(process.env.POOL_BACKUP_AGE_IDENTITY || '').trim();
    result = backend === 'age'
      ? (identity ? run('age', ['--decrypt', '--identity', identity, '--output', '/dev/null', encrypted]) : { status: 1 })
      : run('gpg', ['--batch', '--decrypt', '--output', '/dev/null', encrypted]);
    if (result.status !== 0) throw new Error('Encrypted snapshot decryptability verification failed.');
  } finally {
    fs.rmSync(archive, { force: true });
  }
  fs.rmSync(staging, { recursive: true, force: true });
  const receipt = {
    version: 2,
    createdAt: manifest.createdAt,
    completedAt: manifest.completedAt,
    encrypted: true,
    outputName: path.basename(output),
    encryptionBackend: backend,
    archive: encryptedName,
    archiveBytes: fs.statSync(encrypted).size,
    archiveSha256: sha256File(encrypted),
    releaseSnapshot: manifest.releaseSnapshot,
    durationMs: manifest.durationMs,
    usage: manifest.usage,
    warningCount: manifest.warnings.length
  };
  writeJson(path.join(output, 'manifest.json'), receipt);
  enforcePrivatePermissions(output);
  return receipt;
}

export async function createPoolBackup(raw = {}) {
  const options = {
    output: raw.output || path.join(os.homedir(), 'pool-backups', timestamp()),
    remote: raw.remote === true,
    kvValues: raw.kvValues === true,
    releaseSnapshot: raw.releaseSnapshot === true,
    acknowledgeSensitive: raw.acknowledgeSensitive || '',
    encryptionRecipient: raw.encryptionRecipient || process.env.POOL_BACKUP_ENCRYPTION_RECIPIENT || '',
    encryptionBackend: raw.encryptionBackend || 'auto',
    skipGitBundle: raw.skipGitBundle === true,
    skipBuild: raw.skipBuild === true,
    dryRun: raw.dryRun === true
  };
  const output = path.resolve(options.output);
  const safety = validatePoolBackupSafety(options, output);
  if (!safety.ok && !options.dryRun) throw new Error(safety.errors.join(' '));
  const plan = buildPoolKvBackupPlan({ includeValues: options.kvValues });
  if (options.dryRun) return { version: 2, dryRun: true, output, sensitive: safety.sensitive, safety, kvPlan: plan };
  const staging = safety.sensitive ? `${output}.staging-${process.pid}` : output;
  if (fs.existsSync(output) || fs.existsSync(staging)) throw new Error(`Backup output already exists: ${fs.existsSync(output) ? output : staging}`);
  const wrangler = normalizeWranglerInventory(fs.readFileSync(WRANGLER_PATH, 'utf8'));
  const started = Date.now();
  const manifest = {
    version: 2,
    createdAt: new Date(started).toISOString(),
    completedAt: '',
    outputDir: output,
    remote: options.remote,
    includesKvValues: options.remote && options.kvValues,
    encrypted: safety.sensitive,
    releaseSnapshot: options.releaseSnapshot,
    recoveryObjectives: INVENTORY.recoveryObjectives,
    retention: INVENTORY.retention,
    excludedDataClasses: poolQuarantinedKvFamilies({ inventory: INVENTORY }).map((family) => family.id),
    wrangler: {
      name: wrangler.name,
      compatibilityDate: wrangler.compatibilityDate,
      kvBindings: wrangler.kvNamespaces,
      durableObjects: wrangler.durableObjects,
      routes: wrangler.routes
    },
    warnings: [...safety.errors],
    commands: [],
    kvValueCapture: [],
    usage: { kvListOperations: 0, kvBulkReadOperations: 0, kvKeysRead: 0 }
  };
  try {
    ensureDir(staging);
    captureGit(manifest, staging, options);
    captureLocalFiles(manifest, staging);
    captureBuildEvidence(manifest, staging, options);
    captureProviderMetadata(manifest, staging, options, wrangler);
    captureKv(manifest, staging, options);
    writeRestoreGuide(staging);
    manifest.completedAt = new Date().toISOString();
    manifest.durationMs = Date.now() - started;
    manifest.artifacts = buildChecksumManifest(staging, { exclude: ['manifest.json', 'checksums.json'] });
    writeJson(path.join(staging, 'manifest.json'), manifest);
    writeJson(path.join(staging, 'checksums.json'), {
      schemaVersion: 1,
      generatedAt: manifest.completedAt,
      artifacts: buildChecksumManifest(staging, { exclude: ['checksums.json'] })
    });
    enforcePrivatePermissions(staging);
    return safety.sensitive ? encryptSnapshot(staging, output, options, manifest) : manifest;
  } catch (error) {
    if (safety.sensitive) fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  const options = parsePoolBackupArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  const result = await createPoolBackup(options);
  if (result.dryRun) {
    console.log(`Pool backup plan: ${result.kvPlan.length} classified KV families; sensitive=${result.sensitive}; output=${result.output}`);
    for (const error of result.safety.errors) console.log(`Safety gate: ${error}`);
    return;
  }
  console.log(`Pool backup snapshot completed at ${result.outputDir || options.output || 'configured output'} with ${result.warningCount ?? result.warnings?.length ?? 0} warning(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}
