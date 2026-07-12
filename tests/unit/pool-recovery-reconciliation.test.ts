import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createSyntheticPoolRecoverySnapshot } from '../../scripts/rehearse-pool-restore.mjs';
import { reconcilePoolPaymentIntents, runPoolRecoveryReconciliation, summarizePoolPledges } from '../../scripts/pool-recovery-reconciliation.mjs';

describe('Pool recovery reconciliation', () => {
  it('summarizes pledge truth without retaining customer or provider identifiers', () => {
    const result = summarizePoolPledges([
      { orderId: 'private', email: 'private@example.com', pledgeStatus: 'active', charged: true, amount: 5000, stripePaymentIntentId: 'pi_private' },
      { orderId: 'cancelled', pledgeStatus: 'cancelled', charged: false, amount: 1000 }
    ]);
    expect(result.summary).toMatchObject({ pledgeCount: 2, chargedCount: 1, chargedAmountCents: 5000, cancelledCount: 1, uniquePaymentIntentCount: 1 });
    expect(JSON.stringify(result.summary)).not.toMatch(/private|example|pi_/);
  });

  it('reports bounded mismatch categories and no identifiers', () => {
    const result = reconcilePoolPaymentIntents([
      { pledgeStatus: 'active', charged: true, amount: 5000, stripePaymentIntentId: 'pi_private' }
    ], [{ id: 'pi_private', amount_received: 4000, status: 'requires_payment_method', livemode: true, expectedMode: 'live' }]);
    expect(result).toMatchObject({ ok: false, mismatches: { missing: 0, amount: 1, status: 1, mode: 0 } });
    expect(JSON.stringify(result)).not.toContain('pi_private');
  });

  it('refuses credential mode mismatches before provider access', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-reconcile-'));
    createSyntheticPoolRecoverySnapshot(root);
    const fetchImpl = vi.fn();
    await expect(runPoolRecoveryReconciliation({
      snapshot: root,
      stripeMode: 'live',
      stripeKey: 'sk_test_private',
      fetchImpl
    })).rejects.toThrow(/mode mismatch/i);
    expect(fetchImpl).not.toHaveBeenCalled();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('performs read-only live aggregate comparison without exposing IDs', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-reconcile-live-'));
    createSyntheticPoolRecoverySnapshot(root);
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer rk_live_private' });
      return new Response(JSON.stringify({ id: 'pi_fixture', amount: 7500, amount_received: 7500, status: 'succeeded', livemode: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });
    const result = await runPoolRecoveryReconciliation({ snapshot: root, stripeMode: 'live', stripeKey: 'rk_live_private', fetchImpl });
    expect(result).toMatchObject({ ok: true, snapshot: { chargedCount: 1 }, provider: { paymentIntentCount: 1, succeededCount: 1, amountCents: 7500 } });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/pi_fixture|rk_live_private|example\.com/);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
