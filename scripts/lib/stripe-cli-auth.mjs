import process from 'node:process';
import { commandAvailable, runCommand } from './command-runner.mjs';

export function stripeCliAuthState(options = {}) {
  const available = options.commandAvailableFn || commandAvailable;
  const execute = options.runCommandFn || runCommand;
  const commandOptions = {
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    timeoutMs: options.timeoutMs || 5_000,
    maxBuffer: 1024 * 1024
  };
  if (!available('stripe', commandOptions)) {
    return { available: false, authenticated: false, reason: 'stripe CLI not found' };
  }
  // whoami reads both keychain and legacy credentials without starting a login.
  const result = execute('stripe', ['whoami', '--format', 'json'], commandOptions);
  let identity;
  try { identity = JSON.parse(result.stdout || '{}') || {}; } catch { identity = {}; }
  const mode = options.mode === 'live' || options.mode === 'test' ? options.mode : null;
  const usableKey = mode
    ? identity[`${mode}_mode_key`]?.available === true
    : identity.live_mode_key?.available === true || identity.test_mode_key?.available === true;
  const authenticated = result.status === 0 && !result.error && identity.authenticated === true && usableKey;
  return { available: true, authenticated, reason: authenticated ? '' : 'stripe CLI is not authenticated' };
}
