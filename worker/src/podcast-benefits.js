import {
  hmacSha256,
  normalizeEmail
} from '../../shared/dust-wave-platform/packages/worker-core/src/crypto.js';
import {
  generatePodcastBenefitCode,
  normalizePodcastBenefitCode
} from '../../shared/dust-wave-platform/packages/worker-core/src/podcast-benefits.js';
import { isValidEmail, isValidSlug } from './validation.js';

const PODCAST_BRIDGE_PATH = '/v1/internal/pool/grants';
const DEFAULT_TIMEOUT_MS = 5_000;
const MAXIMUM_TIMEOUT_MS = 15_000;
const MAXIMUM_RESPONSE_BYTES = 16_384;

export {
  generatePodcastBenefitCode,
  normalizePodcastBenefitCode
};

export class PodcastBenefitBridgeError extends Error {
  constructor(code, {
    status = 0,
    retryable = false,
    cause
  } = {}) {
    super(code, cause ? { cause } : undefined);
    this.name = 'PodcastBenefitBridgeError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function podcastBenefitBridgeConfigured(env = {}) {
  try {
    return isTruthy(env.PODCAST_BENEFITS_ENABLED)
      && String(env.POOL_PODCAST_BRIDGE_SECRET || '').length >= 32
      && Boolean(resolvePodcastBridgeUrl(env));
  } catch {
    return false;
  }
}

export function buildPodcastBenefitEvent(input = {}, {
  now = new Date()
} = {}) {
  const eventId = validIdentifier(input.eventId, 'eventId');
  const grantId = validIdentifier(input.grantId, 'grantId');
  const action = input.action === 'grant' || input.action === 'revoke'
    ? input.action
    : invalid('action must be grant or revoke');
  if (action === 'revoke') {
    return { eventId, grantId, action };
  }

  const showSlug = String(input.showSlug || '').trim().toLowerCase();
  if (!isValidSlug(showSlug)) invalid('showSlug is invalid');
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) invalid('email is invalid');
  const code = normalizePodcastBenefitCode(input.code);
  const durationDays = input.durationDays === null
    || input.durationDays === undefined
    ? null
    : validInteger(input.durationDays, 'durationDays', 3_660);
  const redeemBy = validRedeemBy(input.redeemBy, now);

  return {
    eventId,
    grantId,
    action,
    showSlug,
    email,
    code,
    ...(durationDays === null ? {} : { durationDays }),
    ...(redeemBy ? { redeemBy } : {})
  };
}

export async function sendPodcastBenefitEvent(
  env,
  input,
  {
    fetchImpl = globalThis.fetch,
    now = new Date()
  } = {}
) {
  if (!podcastBenefitBridgeConfigured(env)) {
    throw new PodcastBenefitBridgeError('podcast_bridge_not_configured');
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetchImpl is required');
  }
  const event = buildPodcastBenefitEvent(input, { now });
  const body = JSON.stringify(event);
  const timestamp = Math.floor(now.getTime() / 1_000);
  const signature = await hmacSha256(
    `${timestamp}.${body}`,
    env.POOL_PODCAST_BRIDGE_SECRET,
    'hex'
  );
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    bridgeTimeoutMs(env)
  );
  let response;
  try {
    response = await fetchImpl(resolvePodcastBridgeUrl(env), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-pool-podcast-timestamp': String(timestamp),
        'x-pool-podcast-signature': signature
      },
      body,
      redirect: 'error',
      signal: controller.signal
    });
  } catch (error) {
    throw new PodcastBenefitBridgeError(
      controller.signal.aborted
        ? 'podcast_bridge_timeout'
        : 'podcast_bridge_unavailable',
      { retryable: true, cause: error }
    );
  } finally {
    clearTimeout(timeout);
  }

  const payload = await readBoundedJson(response);
  if (
    !response.ok
    || payload?.accepted !== true
    || payload?.action !== event.action
  ) {
    throw new PodcastBenefitBridgeError('podcast_bridge_rejected', {
      status: response.status,
      retryable: retryableStatus(response.status)
    });
  }
  return {
    accepted: true,
    action: event.action,
    status: String(payload.status || ''),
    idempotent: payload.idempotent === true
  };
}

function resolvePodcastBridgeUrl(env) {
  let url;
  try {
    url = new URL(String(env.PODCAST_BRIDGE_URL || ''));
  } catch {
    throw new PodcastBenefitBridgeError('podcast_bridge_url_invalid');
  }
  const localTest = String(env.APP_MODE || '').trim().toLowerCase() === 'test'
    && ['127.0.0.1', 'localhost'].includes(url.hostname)
    && url.protocol === 'http:';
  if (
    (!localTest && url.protocol !== 'https:')
    || url.username
    || url.password
    || url.port
    || url.pathname !== PODCAST_BRIDGE_PATH
    || url.search
    || url.hash
  ) {
    throw new PodcastBenefitBridgeError('podcast_bridge_url_invalid');
  }
  return url.href;
}

function bridgeTimeoutMs(env) {
  const value = Number(env.PODCAST_BRIDGE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return Number.isSafeInteger(value) && value >= 1_000
    && value <= MAXIMUM_TIMEOUT_MS
    ? value
    : DEFAULT_TIMEOUT_MS;
}

async function readBoundedJson(response) {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_RESPONSE_BYTES) {
    throw new PodcastBenefitBridgeError('podcast_bridge_response_invalid', {
      status: response.status,
      retryable: retryableStatus(response.status)
    });
  }
  const reader = response.body?.getReader();
  if (!reader) return {};
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAXIMUM_RESPONSE_BYTES) {
      await reader.cancel();
      throw new PodcastBenefitBridgeError('podcast_bridge_response_invalid', {
        status: response.status,
        retryable: retryableStatus(response.status)
      });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new PodcastBenefitBridgeError('podcast_bridge_response_invalid', {
      status: response.status,
      retryable: retryableStatus(response.status)
    });
  }
}

function retryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function validIdentifier(value, field) {
  const text = String(value || '').trim();
  if (
    text.length < 1
    || text.length > 160
    || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(text)
  ) {
    invalid(`${field} is invalid`);
  }
  return text;
}

function validInteger(value, field, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    invalid(`${field} is invalid`);
  }
  return number;
}

function validRedeemBy(value, now) {
  if (value === null || value === undefined || value === '') return '';
  const date = new Date(String(value));
  const nowMs = now.getTime();
  if (
    !Number.isFinite(nowMs)
    || !Number.isFinite(date.getTime())
    || date.getTime() <= nowMs
    || date.getTime() > nowMs + 5 * 366 * 24 * 60 * 60 * 1_000
  ) {
    invalid('redeemBy is invalid');
  }
  return date.toISOString();
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(
    String(value || '').trim().toLowerCase()
  );
}

function invalid(message) {
  throw new TypeError(message);
}
