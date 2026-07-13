export const EMAIL_OUTBOX_PREFIX = 'email-outbox:v1:';
export const EMAIL_OUTBOX_QUEUE_STATE_KEY = 'email-outbox-queue:v1';
export const EMAIL_DELIVERY_PREFIX = 'email-delivery:v1:';
export const EMAIL_SUPPRESSION_PREFIX = 'email-suppression:v1:';
export const CAMPAIGN_EMAIL_SUPPRESSION_PREFIX = 'campaign-email-suppression:v1:';
export const RESEND_WEBHOOK_MARKER_PREFIX = 'resend-webhook:v1:';
const EMAIL_OUTBOX_PAYLOAD_TTL_SECONDS = 30 * 24 * 60 * 60;
const EMAIL_DELIVERY_TTL_SECONDS = 400 * 24 * 60 * 60;
const EMAIL_PROCESSING_LEASE_MS = 10 * 60 * 1000;
const RESEND_IDEMPOTENCY_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const MAX_FROZEN_PROVIDER_PAYLOAD_BYTES = 8 * 1024 * 1024;

const MARKETING_KINDS = new Set(['announcement', 'diary', 'milestone', 'launch_reminder', 'abandoned_cart']);
const TEMPLATE_SENDERS = Object.freeze({
  supporter: 'sendSupporterEmail',
  pledge_modified: 'sendPledgeModifiedEmail',
  pledge_cancelled: 'sendPledgeCancelledEmail',
  payment_failed: 'sendPaymentFailedEmail',
  charge_success: 'sendChargeSuccessEmail',
  diary: 'sendDiaryUpdateEmail',
  milestone: 'sendMilestoneEmail',
  announcement: 'sendAnnouncementEmail',
  report: 'sendCampaignRunnerReportEmail',
  admin_user_created: 'sendAdminUserCreatedEmail',
  campaign_assignment: 'sendCampaignAssignmentEmail',
  campaign_preview: 'sendCampaignPreviewEmail',
  launch_reminder: 'sendLaunchReminderEmail',
  abandoned_cart: 'sendAbandonedCartEmail'
});

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

function recipientFromPayload(payload = {}) {
  return normalizeEmail(payload.email || (Array.isArray(payload.to) ? payload.to[0] : payload.to));
}

function safeTagValue(value = '') {
  return String(value || '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 256) || 'none';
}

function outboxJobKey(jobId) {
  return `${EMAIL_OUTBOX_PREFIX}${jobId}`;
}

function deliveryKey(jobId) {
  return `${EMAIL_DELIVERY_PREFIX}${jobId}`;
}

async function suppressionKey(email) {
  return `${EMAIL_SUPPRESSION_PREFIX}${await sha256Hex(normalizeEmail(email))}`;
}

async function campaignSuppressionKey(campaignSlug, email) {
  return `${CAMPAIGN_EMAIL_SUPPRESSION_PREFIX}${String(campaignSlug || '')}:${await sha256Hex(normalizeEmail(email))}`;
}

async function writeQueueState(env, { hasPending, nextDueAt = '' }) {
  if (!env?.PLEDGES) return;
  await env.PLEDGES.put(EMAIL_OUTBOX_QUEUE_STATE_KEY, JSON.stringify({
    version: 1,
    hasPending: hasPending === true,
    nextDueAt: hasPending ? String(nextDueAt || '') : '',
    updatedAt: new Date().toISOString()
  }), { expirationTtl: hasPending ? EMAIL_OUTBOX_PAYLOAD_TTL_SECONDS : 60 * 60 });
}

export async function enqueueEmailOutbox(env, {
  kind,
  payload,
  dedupeKey = '',
  campaignSlug = '',
  expiresAt = ''
}) {
  if (!env?.PLEDGES) return { sent: false, queued: false, reason: 'Email outbox storage is not configured' };
  if (!TEMPLATE_SENDERS[kind]) return { sent: false, queued: false, reason: 'Unsupported email outbox template' };
  const normalizedDedupeKey = String(dedupeKey || stableStringify(payload));
  const jobId = await sha256Hex(`${kind}:${normalizedDedupeKey}`);
  const [delivered, existing] = await Promise.all([
    env.PLEDGES.get(deliveryKey(jobId), { type: 'json' }),
    env.PLEDGES.get(outboxJobKey(jobId), { type: 'json' })
  ]);
  if (['accepted', 'delivered'].includes(delivered?.status) || existing?.status === 'sent') {
    return { sent: true, queued: false, deduped: true, jobId, providerId: delivered?.providerId || '' };
  }
  if (existing && ['pending', 'processing', 'retry'].includes(existing.status)) {
    return { sent: true, queued: true, deduped: true, jobId };
  }

  const now = new Date().toISOString();
  const record = {
    version: 1,
    jobId,
    kind,
    status: 'pending',
    campaignSlug: String(campaignSlug || payload?.campaignSlug || ''),
    payload,
    contentHash: '',
    providerPayload: null,
    providerId: '',
    attempts: 0,
    createdAt: existing?.createdAt || now,
    nextAttemptAt: now,
    firstAttemptAt: '',
    lastAttemptAt: '',
    expiresAt: String(expiresAt || '')
  };
  const serialized = JSON.stringify(record);
  if (new TextEncoder().encode(serialized).byteLength > MAX_FROZEN_PROVIDER_PAYLOAD_BYTES) {
    return { sent: false, queued: false, reason: 'Email payload exceeds the durable outbox limit', jobId };
  }
  await env.PLEDGES.put(outboxJobKey(jobId), serialized, { expirationTtl: EMAIL_OUTBOX_PAYLOAD_TTL_SECONDS });
  await writeQueueState(env, { hasPending: true, nextDueAt: now });
  return { sent: true, queued: true, deduped: false, jobId };
}

async function renderProviderPayload(env, job) {
  const emailModule = await import('./email.js');
  const sender = emailModule[TEMPLATE_SENDERS[job.kind]];
  if (typeof sender !== 'function') throw new Error(`Email template is unavailable: ${job.kind}`);
  const captureEnv = { ...env, POOL_EMAIL_CAPTURE_PAYLOAD: 'true' };
  await sender(captureEnv, job.payload || {});
  const prepared = captureEnv.__POOL_CAPTURED_EMAIL_PAYLOAD;
  if (!prepared) throw new Error('Email template did not produce a provider payload');
  const tags = [
    { name: 'pool_job', value: safeTagValue(job.jobId) },
    { name: 'category', value: safeTagValue(job.kind) },
    ...(job.campaignSlug ? [{ name: 'campaign', value: safeTagValue(job.campaignSlug) }] : [])
  ];
  const providerPayload = { ...prepared, tags: [...(prepared.tags || []), ...tags] };
  if (new TextEncoder().encode(JSON.stringify(providerPayload)).byteLength > MAX_FROZEN_PROVIDER_PAYLOAD_BYTES) {
    throw new Error('Rendered email exceeds the durable outbox limit');
  }
  return providerPayload;
}

function retryDelayMs(error, attempts) {
  if (error?.retryAfterSeconds > 0) return Math.min(24 * 60 * 60 * 1000, error.retryAfterSeconds * 1000);
  if (error?.type === 'daily_quota_exceeded' || error?.type === 'monthly_quota_exceeded') return 24 * 60 * 60 * 1000;
  return Math.min(24 * 60 * 60 * 1000, Math.max(60 * 1000, (2 ** Math.min(attempts, 8)) * 60 * 1000));
}

async function isMarketingRecipientSuppressed(env, job) {
  if (!MARKETING_KINDS.has(job.kind)) return false;
  const email = recipientFromPayload(job.payload);
  if (!email) return false;
  const keys = [suppressionKey(email)];
  if (job.campaignSlug) keys.push(campaignSuppressionKey(job.campaignSlug, email));
  const values = await Promise.all((await Promise.all(keys)).map((key) => env.PLEDGES.get(key)));
  return values.some(Boolean);
}

export async function processEmailOutbox(env, { now = new Date(), limit = 10 } = {}) {
  if (!env?.PLEDGES) return { attempted: false, checked: 0, sent: 0, retried: 0, failed: 0, suppressed: 0 };
  const queueState = await env.PLEDGES.get(EMAIL_OUTBOX_QUEUE_STATE_KEY, { type: 'json' });
  if (queueState && queueState.hasPending === false) {
    return { attempted: false, checked: 0, sent: 0, retried: 0, failed: 0, suppressed: 0, skippedReason: 'idle' };
  }
  const nextDueMs = Date.parse(queueState?.nextDueAt || '');
  if (Number.isFinite(nextDueMs) && nextDueMs > now.getTime()) {
    return { attempted: false, checked: 0, sent: 0, retried: 0, failed: 0, suppressed: 0, skippedReason: 'not_due' };
  }

  const listing = await env.PLEDGES.list({ prefix: EMAIL_OUTBOX_PREFIX, limit: Math.max(1, Math.min(100, limit)) });
  const results = { attempted: (listing.keys || []).length > 0, checked: 0, sent: 0, retried: 0, failed: 0, suppressed: 0 };
  let hasPending = listing.list_complete === false;
  let nextDueAt = '';

  for (const key of listing.keys || []) {
    const job = await env.PLEDGES.get(key.name, { type: 'json' });
    if (!job || ['sent', 'failed', 'ambiguous', 'expired', 'suppressed'].includes(job.status)) continue;
    results.checked++;
    const dueMs = Date.parse(job.nextAttemptAt || '');
    if (Number.isFinite(dueMs) && dueMs > now.getTime()) {
      hasPending = true;
      if (!nextDueAt || dueMs < Date.parse(nextDueAt)) nextDueAt = job.nextAttemptAt;
      continue;
    }
    const expiresMs = Date.parse(job.expiresAt || '');
    if (Number.isFinite(expiresMs) && expiresMs <= now.getTime()) {
      await env.PLEDGES.put(deliveryKey(job.jobId), JSON.stringify({ version: 1, status: 'expired', kind: job.kind, campaignSlug: job.campaignSlug, updatedAt: now.toISOString() }), { expirationTtl: EMAIL_DELIVERY_TTL_SECONDS });
      await env.PLEDGES.delete(key.name);
      results.failed++;
      continue;
    }
    const processingMs = Date.parse(job.lastAttemptAt || '');
    if (job.status === 'processing' && Number.isFinite(processingMs) && now.getTime() - processingMs < EMAIL_PROCESSING_LEASE_MS) {
      hasPending = true;
      continue;
    }
    if (await isMarketingRecipientSuppressed(env, job)) {
      await env.PLEDGES.put(deliveryKey(job.jobId), JSON.stringify({ version: 1, status: 'suppressed', kind: job.kind, campaignSlug: job.campaignSlug, updatedAt: now.toISOString() }), { expirationTtl: EMAIL_DELIVERY_TTL_SECONDS });
      await env.PLEDGES.delete(key.name);
      results.suppressed++;
      continue;
    }

    try {
      if (!job.providerPayload) {
        job.providerPayload = await renderProviderPayload(env, job);
        job.contentHash = await sha256Hex(stableStringify(job.providerPayload));
      }
      job.status = 'processing';
      job.attempts = Number(job.attempts || 0) + 1;
      job.firstAttemptAt = job.firstAttemptAt || now.toISOString();
      job.lastAttemptAt = now.toISOString();
      job.updatedAt = now.toISOString();
      await env.PLEDGES.put(key.name, JSON.stringify(job), { expirationTtl: EMAIL_OUTBOX_PAYLOAD_TTL_SECONDS });

      const { sendPreparedResendEmail } = await import('./email.js');
      const response = await sendPreparedResendEmail(env, job.providerPayload, {
        idempotencyKey: `pool/${job.jobId}`,
        errorLabel: `Resend outbox error (${job.kind})`,
        failureLabel: `Failed to deliver ${job.kind} email`
      });
      const acceptedAt = new Date().toISOString();
      const existingDelivery = await env.PLEDGES.get(deliveryKey(job.jobId), { type: 'json' });
      const eventStatus = ['delivered', 'bounced', 'complained', 'failed', 'suppressed'].includes(existingDelivery?.status)
        ? existingDelivery.status
        : 'accepted';
      await env.PLEDGES.put(deliveryKey(job.jobId), JSON.stringify({
        ...(existingDelivery || {}),
        version: 1,
        status: eventStatus,
        kind: job.kind,
        campaignSlug: job.campaignSlug,
        providerId: String(existingDelivery?.providerId || response?.id || ''),
        contentHash: job.contentHash,
        acceptedAt
      }), { expirationTtl: EMAIL_DELIVERY_TTL_SECONDS });
      await env.PLEDGES.delete(key.name);
      results.sent++;
    } catch (error) {
      const firstAttemptMs = Date.parse(job.firstAttemptAt || '');
      const ambiguityExpired = error?.ambiguous && Number.isFinite(firstAttemptMs) && now.getTime() - firstAttemptMs > RESEND_IDEMPOTENCY_RETRY_WINDOW_MS;
      if (!error?.retryable || ambiguityExpired) {
        await env.PLEDGES.put(deliveryKey(job.jobId), JSON.stringify({
          version: 1,
          status: ambiguityExpired ? 'ambiguous' : 'failed',
          kind: job.kind,
          campaignSlug: job.campaignSlug,
          contentHash: job.contentHash,
          attempts: job.attempts,
          lastError: { type: String(error?.type || error?.name || 'Error'), statusCode: Number(error?.statusCode || 0) || 0 },
          updatedAt: now.toISOString()
        }), { expirationTtl: EMAIL_DELIVERY_TTL_SECONDS });
        await env.PLEDGES.delete(key.name);
        results.failed++;
        continue;
      }
      const next = new Date(now.getTime() + retryDelayMs(error, job.attempts));
      job.status = 'retry';
      job.nextAttemptAt = next.toISOString();
      job.lastError = { type: String(error?.type || error?.name || 'Error'), statusCode: Number(error?.statusCode || 0) || 0 };
      job.updatedAt = now.toISOString();
      await env.PLEDGES.put(key.name, JSON.stringify(job), { expirationTtl: EMAIL_OUTBOX_PAYLOAD_TTL_SECONDS });
      hasPending = true;
      if (!nextDueAt || next.getTime() < Date.parse(nextDueAt)) nextDueAt = next.toISOString();
      results.retried++;
    }
  }

  await writeQueueState(env, { hasPending, nextDueAt });
  return results;
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export async function verifyResendWebhook(rawBody, headers, secret, now = new Date()) {
  const id = String(headers?.id || '');
  const timestamp = String(headers?.timestamp || '');
  const signatureHeader = String(headers?.signature || '');
  if (!id || !timestamp || !signatureHeader || !secret) return { valid: false, error: 'missing_signature' };
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(now.getTime() / 1000 - timestampSeconds) > 5 * 60) {
    return { valid: false, error: 'timestamp_outside_tolerance' };
  }
  const secretValue = String(secret).startsWith('whsec_') ? String(secret).slice(6) : String(secret);
  let secretBytes;
  try { secretBytes = base64ToBytes(secretValue); } catch { return { valid: false, error: 'invalid_secret' }; }
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = `${id}.${timestamp}.${rawBody}`;
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signed));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  const expected = btoa(binary);
  const candidates = signatureHeader.split(' ').map((part) => part.trim()).filter(Boolean)
    .map((part) => part.startsWith('v1,') ? part.slice(3) : '')
    .filter(Boolean);
  return { valid: candidates.some((candidate) => constantTimeEqual(candidate, expected)), id };
}

function webhookTags(data = {}) {
  if (Array.isArray(data.tags)) return Object.fromEntries(data.tags.map((tag) => [tag.name, tag.value]));
  return data.tags && typeof data.tags === 'object' ? data.tags : {};
}

export async function processResendWebhook(env, event, svixId) {
  if (!env?.PLEDGES) return { processed: false, reason: 'storage_not_configured' };
  const markerKey = `${RESEND_WEBHOOK_MARKER_PREFIX}${svixId}`;
  if (await env.PLEDGES.get(markerKey)) return { processed: false, duplicate: true };
  const type = String(event?.type || '');
  const data = event?.data || {};
  const tags = webhookTags(data);
  const jobId = String(tags.pool_job || '');
  const providerId = String(data.email_id || '');
  if (jobId && /^[a-f0-9]{64}$/i.test(jobId)) {
    const key = deliveryKey(jobId);
    const delivery = await env.PLEDGES.get(key, { type: 'json' }) || { version: 1, providerId };
    delivery.providerId = delivery.providerId || providerId;
    delivery.lastEvent = type;
    delivery.lastEventAt = String(event.created_at || new Date().toISOString());
    if (type === 'email.delivered') delivery.status = 'delivered';
    else if (['email.bounced', 'email.complained', 'email.failed', 'email.suppressed'].includes(type)) delivery.status = type.replace('email.', '');
    await env.PLEDGES.put(key, JSON.stringify(delivery), { expirationTtl: EMAIL_DELIVERY_TTL_SECONDS });
  }

  const shouldSuppress = type === 'email.complained' || type === 'email.suppressed' ||
    (type === 'email.bounced' && String(data.bounce?.type || '').toLowerCase() === 'permanent');
  if (shouldSuppress) {
    for (const email of Array.isArray(data.to) ? data.to : []) {
      const normalized = normalizeEmail(email);
      if (!normalized) continue;
      await env.PLEDGES.put(await suppressionKey(normalized), JSON.stringify({
        version: 1,
        emailHash: await sha256Hex(normalized),
        reason: type,
        providerId,
        suppressedAt: String(event.created_at || new Date().toISOString())
      }), { expirationTtl: EMAIL_DELIVERY_TTL_SECONDS });
    }
  }
  await env.PLEDGES.put(markerKey, JSON.stringify({ type, providerId, processedAt: new Date().toISOString() }), {
    expirationTtl: 35 * 24 * 60 * 60
  });
  return { processed: true, type, jobId, suppressed: shouldSuppress };
}
