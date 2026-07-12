import process from 'node:process';
import { commandAvailable, runCommand } from './command-runner.mjs';

function unquoteConfigValue(value) {
  const normalized = String(value || '').trim();
  if (normalized.length >= 2) {
    const quote = normalized[0];
    if ((quote === '"' || quote === "'") && normalized.at(-1) === quote) {
      return normalized.slice(1, -1).trim();
    }
  }
  return normalized;
}

export function parseStripeCliConfig(output) {
  const config = new Map();
  for (const line of String(output || '').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    config.set(match[1], unquoteConfigValue(match[2]));
  }
  return config;
}

function configuredCredential(config, mode, now) {
  const key = config.get(`${mode}_mode_api_key`) || '';
  if (!key || /^(?:null|none|<none>)$/i.test(key)) return false;

  const expiresAt = config.get(`${mode}_mode_key_expires_at`) || '';
  if (!expiresAt || /^(?:null|none|<none>)$/i.test(expiresAt)) return true;
  const expiresAtMs = Date.parse(expiresAt);
  return !Number.isFinite(expiresAtMs) || expiresAtMs > now;
}

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

  const result = execute('stripe', ['config', '--list'], commandOptions);
  if (result.status !== 0 || result.error) {
    return { available: true, authenticated: false, reason: 'stripe CLI is not authenticated' };
  }

  const config = parseStripeCliConfig(result.stdout);
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const mode = options.mode === 'live' || options.mode === 'test' ? options.mode : 'any';
  const authenticated = mode === 'any'
    ? configuredCredential(config, 'live', now) || configuredCredential(config, 'test', now)
    : configuredCredential(config, mode, now);
  if (!authenticated) {
    return { available: true, authenticated: false, reason: 'stripe CLI is not authenticated' };
  }

  return { available: true, authenticated: true, reason: '' };
}
