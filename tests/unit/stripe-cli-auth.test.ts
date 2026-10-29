import { describe, expect, it, vi } from 'vitest';
import { stripeCliAuthState } from '../../scripts/lib/stripe-cli-auth.mjs';

const authenticatedIdentity = {
  authenticated: true, display_name: 'private operator',
  live_mode_key: { available: true }, test_mode_key: { available: true }
};
const result = (identity: unknown) => ({ status: 0, stdout: JSON.stringify(identity), stderr: '' });

describe('Stripe CLI authentication detection', () => {
  it('does not probe an unavailable CLI', () => {
    const execute = vi.fn();
    expect(stripeCliAuthState({ commandAvailableFn: () => false, runCommandFn: execute }))
      .toEqual({ available: false, authenticated: false, reason: 'stripe CLI not found' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('recognizes keychain-backed live authentication without reading raw credentials', () => {
    const execute = vi.fn(() => result(authenticatedIdentity));
    const state = stripeCliAuthState({ commandAvailableFn: () => true, runCommandFn: execute, mode: 'live' });
    expect(execute).toHaveBeenCalledWith('stripe', ['whoami', '--format', 'json'], expect.any(Object));
    expect(state).toEqual({ available: true, authenticated: true, reason: '' });
    expect(JSON.stringify(state)).not.toContain('private operator');
  });

  it('does not treat test-only authentication as live access', () => {
    const runCommandFn = () => result({ ...authenticatedIdentity, live_mode_key: { available: false } });
    const common = { commandAvailableFn: () => true, runCommandFn };
    expect(stripeCliAuthState({ ...common, mode: 'live' }).authenticated).toBe(false);
    expect(stripeCliAuthState({ ...common, mode: 'test' }).authenticated).toBe(true);
    expect(stripeCliAuthState(common).authenticated).toBe(true);
  });

  it.each([
    { status: 1, stdout: 'sensitive pairing URL' },
    { status: 0, stdout: 'malformed private output' },
    { status: 0, stdout: 'null' },
    result({ authenticated: false }),
    result({ authenticated: true })
  ])('fails closed without exposing identity or authentication output', probe => {
    expect(stripeCliAuthState({ commandAvailableFn: () => true, runCommandFn: () => probe }))
      .toEqual({ available: true, authenticated: false, reason: 'stripe CLI is not authenticated' });
  });
});
