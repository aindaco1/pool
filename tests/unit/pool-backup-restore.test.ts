import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildChecksumManifest } from '../../scripts/lib/file-integrity.mjs';
import { buildPoolKvBackupPlan, validatePoolBackupSafety } from '../../scripts/pool-backup.mjs';
import {
  buildPoolRestorePlan,
  cleanupPoolPreviewRestore,
  productionPoolRestoreGate,
  readAndVerifyPoolSnapshot,
  transformPoolKvValues,
  validatePoolKvRecords
} from '../../scripts/pool-restore.mjs';
import { loadPoolDataInventory } from '../../scripts/lib/pool-data-inventory.mjs';

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function createSnapshotFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-snapshot-fixture-'));
  const plan = buildPoolKvBackupPlan({ includeValues: true });
  writeJson(path.join(root, 'kv', 'plan.json'), plan);
  for (const item of plan) {
    if (!item.valuesFile) continue;
    if (item.familyId === 'pledges') {
      writeJson(path.join(root, item.valuesFile), {
        'pledge:order-1': JSON.stringify({ orderId: 'order-1', campaignSlug: 'demo', pledgeStatus: 'active' })
      });
    } else if (item.familyId === 'admin-users') {
      writeJson(path.join(root, item.valuesFile), {
        'admin-users:v1': JSON.stringify({ users: [{ email: 'admin@example.com', role: 'super_admin', campaignSlugs: [] }] })
      });
    } else if (item.familyId === 'votes') {
      writeJson(path.join(root, item.valuesFile), { 'vote:demo:poster:voter@example.com': 'Blue' });
    } else {
      writeJson(path.join(root, item.valuesFile), {});
    }
  }
  writeJson(path.join(root, 'manifest.json'), { version: 2, encrypted: false, includesKvValues: true });
  writeJson(path.join(root, 'checksums.json'), {
    schemaVersion: 1,
    artifacts: buildChecksumManifest(root, { exclude: ['checksums.json'] })
  });
  return root;
}

describe('Pool backup and restore contracts', () => {
  it('requires acknowledgement and encryption outside the repository for sensitive capture', () => {
    const output = path.join(process.cwd(), 'unsafe-backup');
    const result = validatePoolBackupSafety({
      remote: true,
      kvValues: true,
      acknowledgeSensitive: '',
      encryptionRecipient: '',
      encryptionBackend: 'auto'
    }, output);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('POOL_SENSITIVE_BACKUP');
    expect(result.errors.join(' ')).toContain('encryption-recipient');
    expect(result.errors.join(' ')).toContain('repository');
  });

  it('captures values only for approved families across PLEDGES and VOTES', () => {
    const plan = buildPoolKvBackupPlan({ includeValues: true });
    expect(plan.find((item) => item.familyId === 'pledges')).toMatchObject({ binding: 'PLEDGES' });
    expect(plan.find((item) => item.familyId === 'votes')).toMatchObject({ binding: 'VOTES' });
    expect(plan.find((item) => item.familyId === 'campaign-stats')?.valuesFile).toBe('');
    expect(plan.some((item) => item.familyId === 'admin-sessions')).toBe(false);
  });

  it('normalizes both raw and structured Wrangler KV bulk-get formats', () => {
    expect(transformPoolKvValues({ one: 'raw', two: { value: 'structured', metadata: { v: 1 } } })).toEqual([
      { key: 'one', value: 'raw' },
      { key: 'two', value: 'structured', metadata: { v: 1 } }
    ]);
  });

  it('validates pledge identity before restore', () => {
    const family = loadPoolDataInventory().families.find((item) => item.id === 'pledges');
    const result = validatePoolKvRecords(family, [{ key: 'pledge:wrong', value: JSON.stringify({ orderId: 'right', campaignSlug: 'demo', pledgeStatus: 'active' }) }]);
    expect(result.ok).toBe(false);
  });

  it('builds a complete checksum-verified multi-binding restore plan', () => {
    const root = createSnapshotFixture();
    const snapshot = readAndVerifyPoolSnapshot(root);
    const plan = buildPoolRestorePlan(snapshot);
    expect(plan.complete).toBe(true);
    expect(plan.invalidActions).toEqual([]);
    expect(plan.actions.some((item) => item.type === 'kv-restore' && item.binding === 'PLEDGES')).toBe(true);
    expect(plan.actions.some((item) => item.type === 'kv-restore' && item.binding === 'VOTES')).toBe(true);
    expect(plan.actions.some((item) => item.familyId === 'admin-audit' && item.type === 'skip')).toBe(true);
    expect(plan.durableObjectPolicy).toContain('never import');

    const incidentPlan = buildPoolRestorePlan(snapshot, { includeIncidentEvidence: true });
    expect(incidentPlan.actions.some((item) => item.familyId === 'admin-audit' && item.type === 'kv-restore')).toBe(true);
  });

  it.each([
    ['PLEDGES', 'unchanged'], ['PLEDGES', 'changed'], ['PLEDGES', 'unreadable'],
    ['VOTES', 'changed'], ['VOTES', 'unreadable'], ['VOTES', 'incomplete'],
  ])('preflights both bindings with %s last and %s', (lastBinding, change) => {
    const root = createSnapshotFixture();
    const plan = buildPoolRestorePlan(readAndVerifyPoolSnapshot(root), { target: 'preview' });
    const byBinding = new Map<string, Map<string, string>>();
    const targets: string[] = [];
    for (const binding of ['PLEDGES', 'VOTES']) {
      const records = new Map([['unlisted', 'keep']]);
      for (const action of plan.actions.filter(item => item.binding === binding && item.type === 'kv-restore')) {
        for (const row of transformPoolKvValues(JSON.parse(fs.readFileSync(action.valuesFile, 'utf8')))) {
          records.set(row.key, row.value);
          targets.push(binding + '/' + row.key);
        }
      }
      byBinding.set(binding, records);
    }
    plan.actions.sort((a, b) => Number(a.binding === lastBinding) - Number(b.binding === lastBinding));
    const lastKey = [...byBinding.get(lastBinding)!.keys()].at(-1)!;
    if (change === 'unchanged') {
      expect(byBinding.get('PLEDGES')!.delete('admin-users:v1')).toBe(true);
      targets.splice(targets.indexOf('PLEDGES/admin-users:v1'), 1);
    }
    if (change === 'changed') byBinding.get(lastBinding)!.set(lastKey, 'replacement');
    const state = () => [...byBinding].map(([binding, values]) => [binding, [...values]]);
    const before = state();
    const deletes: string[] = [];
    let deleteCalls = 0;
    const run = (_cmd: string, args: string[]) => {
      const binding = args[args.indexOf('--binding') + 1];
      expect(args).toContain('--remote');
      expect(args).toContain('--preview');
      const records = byBinding.get(binding)!;
      const op = args.slice(1, 4).join(' ');
      const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
      if (op === 'kv key list') return ok(JSON.stringify([...records.keys()].map(name => ({ name }))));
      const keys: string[] = JSON.parse(fs.readFileSync(args[4], 'utf8'));
      if (op === 'kv bulk get') {
        if (change === 'unreadable' && binding === lastBinding && keys.includes(lastKey)) return { status: 1 };
        return ok(JSON.stringify(Object.fromEntries(keys.filter(key =>
          !(change === 'incomplete' && binding === lastBinding && key === lastKey)).map(key => [key, records.get(key)]))));
      }
      if (op === 'kv bulk delete') {
        deleteCalls += 1;
        for (const key of keys) { deletes.push(binding + '/' + key); records.delete(key); }
        return ok();
      }
      throw new Error('Unexpected command: ' + op);
    };
    const cleanup = () => cleanupPoolPreviewRestore(plan, {
      target: 'preview', acknowledgePreviewCleanup: 'POOL_PREVIEW_RESTORE_CLEANUP', runCommandFn: run
    });
    try {
      const result = cleanup();
      if (change === 'unchanged') {
        expect(result.ok).toBe(true);
        expect(deletes.sort()).toEqual(targets.sort());
        for (const values of byBinding.values()) expect([...values]).toEqual([['unlisted', 'keep']]);
        expect(deleteCalls).toBe(2);
        deleteCalls = 0;
        deletes.length = 0;
        expect(cleanup()).toMatchObject({ ok: true, records: 0, deletes: 0 });
      } else {
        expect(result).toMatchObject({ ok: false, records: 0, deletes: 0 });
        expect(state()).toEqual(before);
      }
      expect(deleteCalls).toBe(0);
      expect(deletes).toEqual([]);
      expect(JSON.stringify(result)).not.toContain(lastKey);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('fails production restore closed until every interlock is present', () => {
    const blocked = productionPoolRestoreGate({});
    expect(blocked.ok).toBe(false);
    expect(blocked.missing).toContain('maintenance mode');
    expect(blocked.missing).toContain('exact production acknowledgement');
    expect(blocked.missing).toContain('verified pre-restore snapshot');
  });
});
