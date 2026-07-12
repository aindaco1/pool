import { describe, expect, it } from 'vitest';
import {
  adminPoolPledgeSnapshotIsUnchanged,
  buildAdminPoolPledgeSnapshotMetadata,
  comparePoolPledges,
  normalizePoolPledgeOrderId,
  normalizeAdminPoolPledgeWatermark,
  readPoolPledgeBatch
} from '../../worker/src/admin-pool-read-model.js';

describe('admin Pool pledge read model', () => {
  const pledges = [
    {
      orderId: 'pool-intent-older:campaign-a',
      campaignSlug: 'campaign-a',
      pledgeStatus: 'active',
      amount: 2500,
      updatedAt: '2026-07-10T12:00:00.000Z'
    },
    {
      orderId: 'pool-intent-newer:campaign-a',
      campaignSlug: 'campaign-a',
      pledgeStatus: 'charged',
      amount: 5000,
      updatedAt: '2026-07-11T12:00:00.000Z'
    }
  ];

  it('builds a deterministic, privacy-safe watermark independent of input order', () => {
    const first = buildAdminPoolPledgeSnapshotMetadata(pledges);
    const second = buildAdminPoolPledgeSnapshotMetadata(pledges.slice().reverse());
    expect(first).toEqual(second);
    expect(first.watermark).toMatch(/^pledges-v1-[a-f0-9]{16}$/);
    expect(first.latestKnownUpdatedAt).toBe('2026-07-11T12:00:00.000Z');
    expect(JSON.stringify(first)).not.toContain('campaign-a');
  });

  it('changes the watermark when pledge state changes', () => {
    const before = buildAdminPoolPledgeSnapshotMetadata(pledges);
    const after = buildAdminPoolPledgeSnapshotMetadata([
      pledges[0],
      { ...pledges[1], pledgeStatus: 'refunded' }
    ]);
    expect(after.watermark).not.toBe(before.watermark);
  });

  it('supports watermark and timestamp no-change checks', () => {
    const snapshot = buildAdminPoolPledgeSnapshotMetadata(pledges);
    expect(adminPoolPledgeSnapshotIsUnchanged(snapshot, { watermark: snapshot.watermark })).toBe(true);
    expect(adminPoolPledgeSnapshotIsUnchanged(snapshot, { since: snapshot.latestKnownUpdatedAt })).toBe(true);
    expect(adminPoolPledgeSnapshotIsUnchanged(snapshot, { watermark: 'pledges-v1-0000000000000000' })).toBe(false);
    expect(normalizeAdminPoolPledgeWatermark('bad')).toBe('');
  });

  it('normalizes order ids and provides a stable newest-first comparator', () => {
    expect(normalizePoolPledgeOrderId('  pledge:one  ')).toBe('pledge:one');
    expect(normalizePoolPledgeOrderId('bad\nkey')).toBe('');
    expect(pledges.slice().sort(comparePoolPledges)[0].orderId).toContain('newer');
  });

  it('uses one bulk KV read and preserves requested order', async () => {
    const get = async (keys: string[]) => new Map([
      [keys[0], { orderId: 'one' }],
      [keys[1], { orderId: 'two' }]
    ]);
    const values = await readPoolPledgeBatch({ get }, ['one', 'two']);
    expect(values.map((value) => value?.orderId)).toEqual(['one', 'two']);
  });

  it('falls back for local single-key KV adapters', async () => {
    const get = async (key: string | string[]) => {
      if (Array.isArray(key)) throw new TypeError('single key only');
      return { orderId: key.replace('pledge:', '') };
    };
    const values = await readPoolPledgeBatch({ get }, ['one', 'two']);
    expect(values.map((value) => value?.orderId)).toEqual(['one', 'two']);
  });
});
