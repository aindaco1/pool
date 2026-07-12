#!/usr/bin/env node
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { loadPoolDataInventory } from './lib/pool-data-inventory.mjs';

export const REQUIRED_POOL_STORAGE_PREFIXES = {
  PLEDGES: [
    'pledge:', 'email:', 'campaign-pledges:', 'campaign-charged:', 'stats:', 'tier-inventory:',
    'diary-sent:', 'milestones:', 'stripe-event:', 'admin-users:v1', 'admin-login:', 'admin-login-history:', 'admin-session:',
    'admin-audit:', 'admin-marketing-referrals:', 'admin-marketing-draft:', 'campaign-preview-reviewers:',
    'add-on-inventory-overrides', 'add-on-inventory-sold:v1', 'launch-reminder:',
    'launch-reminder-suppressed:', 'launch-reminder-sent:', 'launch-reminder-dispatch:',
    'launch-reminder-dispatch-queue:v1', 'abandoned-cart:', 'abandoned-cart-resume:',
    'abandoned-cart-sent:', 'abandoned-cart-suppressed:', 'abandoned-cart-suppressed-campaign:',
    'abandoned-cart-queue:v1', 'abandoned-cart-health:v1', 'supporter-email-retry:',
    'supporter-email-retry-queue:v1', 'campaign-runner-report:', 'pending-', 'cron:', 'observability:'
  ],
  VOTES: ['vote:', 'results:'],
  RATELIMIT: ['rl:']
};

export function validateRecoveryPolicyApproval(inventory = {}) {
  const approval = inventory.recoveryPolicyApproval || {};
  const errors = [];
  if (approval.status !== 'approved') errors.push('recovery policy is not approved');
  if (!String(approval.approvedBy || '').trim()) errors.push('recovery policy approver is missing');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(approval.approvedAt || ''))) errors.push('recovery policy approval date is invalid');
  if (approval.objectivesAndRetentionAccepted !== true) errors.push('recovery objectives and retention were not accepted');
  const approvedInterval = Number(approval.activeSalesSnapshotIntervalHours);
  const configuredInterval = Number(inventory.recoveryObjectives?.pledgesVotesAndAdminState?.rpoHours);
  if (!Number.isFinite(approvedInterval) || approvedInterval <= 0 || approvedInterval !== configuredInterval) {
    errors.push('approved active-sales snapshot interval does not match the configured Pool state RPO');
  }
  return { ok: errors.length === 0, errors };
}

export function auditPoolDataInventory(options = {}) {
  const inventory = options.inventory || loadPoolDataInventory();
  const documented = inventory.families.filter((family) => family.type === 'kv');
  const missing = [];
  for (const [binding, prefixes] of Object.entries(REQUIRED_POOL_STORAGE_PREFIXES)) {
    for (const prefix of prefixes) {
      if (!documented.some((family) => family.binding === binding && family.prefix === prefix)) {
        missing.push(`${binding}:${prefix}`);
      }
    }
  }
  const duplicateBindingsAndPrefixes = [];
  const seen = new Set();
  for (const family of documented) {
    const identity = `${family.binding}:${family.prefix}`;
    if (seen.has(identity)) duplicateBindingsAndPrefixes.push(identity);
    seen.add(identity);
  }
  const policyApproval = validateRecoveryPolicyApproval(inventory);
  const retention = inventory.retention || {};
  const retentionOk = retention.daily === 7 && retention.weekly === 5 && retention.monthly === 12 &&
    retention.releaseSnapshots === true && retention.offAccountCopiesMinimum >= 1 &&
    retention.encryptionRequiredForSensitiveValues === true;
  return {
    ok: missing.length === 0 && duplicateBindingsAndPrefixes.length === 0 && policyApproval.ok && retentionOk,
    missing,
    duplicateBindingsAndPrefixes,
    policyApproval,
    retentionOk
  };
}

function main() {
  const result = auditPoolDataInventory();
  if (!result.ok) {
    if (result.missing.length) console.error(`Pool data inventory is missing: ${result.missing.join(', ')}`);
    if (result.duplicateBindingsAndPrefixes.length) console.error(`Duplicate Pool data inventory prefixes: ${result.duplicateBindingsAndPrefixes.join(', ')}`);
    for (const error of result.policyApproval.errors) console.error(`Recovery policy approval: ${error}`);
    if (!result.retentionOk) console.error('Pool recovery retention does not match the approved 7/5/12 plus release/off-device policy.');
    process.exitCode = 1;
    return;
  }
  console.log('Pool data inventory covers required Worker storage families with the approved four-hour RPO/RTO and 7/5/12 retention policy.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
