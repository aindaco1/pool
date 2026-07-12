import { describe, expect, it, vi } from 'vitest';

import { parseStripeCliConfig, stripeCliAuthState } from '../../scripts/lib/stripe-cli-auth.mjs';

describe('Stripe CLI authentication detection', () => {
  it('reports an unavailable CLI without executing an auth probe', () => {
    const execute = vi.fn();
    expect(stripeCliAuthState({
      commandAvailableFn: () => false,
      runCommandFn: execute
    })).toEqual({
      available: false,
      authenticated: false,
      reason: 'stripe CLI not found'
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('uses only the local config inventory and returns a fixed signed-out reason', () => {
    const execute = vi.fn(() => ({
      status: 1,
      error: '',
      stdout: 'sensitive pairing output',
      stderr: 'sensitive authentication URL'
    }));
    const state = stripeCliAuthState({
      commandAvailableFn: () => true,
      runCommandFn: execute
    });

    expect(execute).toHaveBeenCalledWith('stripe', ['config', '--list'], expect.any(Object));
    expect(state).toEqual({
      available: true,
      authenticated: false,
      reason: 'stripe CLI is not authenticated'
    });
    expect(JSON.stringify(state)).not.toContain('sensitive');
  });

  it('accepts an unexpired live CLI credential without retaining config output', () => {
    const state = stripeCliAuthState({
      commandAvailableFn: () => true,
      now: Date.parse('2026-07-12T00:00:00Z'),
      runCommandFn: () => ({
        status: 0,
        error: '',
        stdout: "display_name = 'operator@example.com'\nlive_mode_api_key = 'rk_live_sensitive'\nlive_mode_key_expires_at = '2026-10-09'\n",
        stderr: ''
      })
    });

    expect(state).toEqual({ available: true, authenticated: true, reason: '' });
    expect(JSON.stringify(state)).not.toContain('operator@example.com');
    expect(JSON.stringify(state)).not.toContain('rk_live_sensitive');
  });

  it('honors requested modes and rejects expired credentials', () => {
    const runCommandFn = () => ({
      status: 0,
      error: '',
      stdout: "live_mode_api_key = 'rk_live_expired'\nlive_mode_key_expires_at = '2026-01-01'\ntest_mode_api_key = 'rk_test_current'\ntest_mode_key_expires_at = '2027-01-01'\n",
      stderr: ''
    });
    const common = {
      commandAvailableFn: () => true,
      now: Date.parse('2026-07-12T00:00:00Z'),
      runCommandFn
    };

    expect(stripeCliAuthState({ ...common, mode: 'live' }).authenticated).toBe(false);
    expect(stripeCliAuthState({ ...common, mode: 'test' }).authenticated).toBe(true);
    expect(stripeCliAuthState(common).authenticated).toBe(true);
  });

  it('parses quoted config values without retaining section noise', () => {
    const config = parseStripeCliConfig("[default]\naccount_id = 'acct_123'\ncolor = \"auto\"\n");
    expect(Object.fromEntries(config)).toEqual({ account_id: 'acct_123', color: 'auto' });
  });
});
