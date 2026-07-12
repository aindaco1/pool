import { describe, expect, it } from 'vitest';
import { auditPoolDataInventory } from '../../scripts/audit-pool-data-inventory.mjs';
import { classifyPoolKvKey, loadPoolDataInventory, poolKvValueBackupFamilies } from '../../scripts/lib/pool-data-inventory.mjs';

describe('Pool recovery data inventory', () => {
  it('covers required KV families and the approved recovery policy', () => {
    const audit = auditPoolDataInventory();
    expect(audit).toMatchObject({ ok: true, missing: [], duplicateBindingsAndPrefixes: [], retentionOk: true });
  });

  it('backs up authoritative/control values but not derived or quarantined values', () => {
    const families = poolKvValueBackupFamilies();
    expect(families.map((family) => family.id)).toContain('pledges');
    expect(families.map((family) => family.id)).toContain('votes');
    expect(families.map((family) => family.id)).not.toContain('campaign-stats');
    expect(families.map((family) => family.id)).not.toContain('admin-sessions');
  });

  it('chooses the most specific prefix when classifications overlap', () => {
    const inventory = loadPoolDataInventory();
    expect(classifyPoolKvKey('PLEDGES', 'abandoned-cart-suppressed-campaign:demo:hash', { inventory })?.id)
      .toBe('abandoned-cart-campaign-suppressions');
    expect(classifyPoolKvKey('PLEDGES', 'abandoned-cart-resume:order', { inventory })?.id)
      .toBe('abandoned-cart-resume');
  });
});
