import {
  verifyResendWebhook as verifySharedResendWebhook
} from '../../shared/dust-wave-platform/packages/worker-core/src/resend.js';
import { sha256Hex } from '../../shared/dust-wave-platform/packages/worker-core/src/crypto.js';
import {
  classifyOutboxJob,
  createOutboxJobId,
  createOutboxJobRecord,
  createOutboxQueueState,
  normalizeOutboxEmail as normalizeEmail,
  outboxDeliveryErrorEvidence,
  outboxRetryDelayMs,
  outboxWebhookDeliveryStatus,
  outboxWebhookShouldSuppress,
  outboxWebhookTags,
  safeOutboxTagValue as safeTagValue,
  stableOutboxStringify as stableStringify,
  validOutboxJobId
} from '../../shared/dust-wave-platform/packages/worker-core/src/outbox.js';

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

function recipientFromPayload(payload = {}) {
  return normalizeEmail(payload.email || (Array.isArray(payload.to) ? payload.to[0] : payload.to));
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
  await env.PLEDGES.put(
    EMAIL_OUTBOX_QUEUE_STATE_KEY,
    JSON.stringify(createOutboxQueueState({ hasPending, nextDueAt })),
    { expirationTtl: hasPending ? EMAIL_OUTBOX_PAYLOAD_TTL_SECONDS : 60 * 60 }
  );
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
  const jobId = await createOutboxJobId({ kind, dedupeKey, payload });
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

  const created = createOutboxJobRecord({
    jobId,
    kind,
    payload,
    metadata: { campaignSlug: String(campaignSlug || payload?.campaignSlug || '') },
    existing,
    expiresAt,
    maxRecordBytes: MAX_FROZEN_PROVIDER_PAYLOAD_BYTES
  });
  if (!created.ok) return { sent: false, queued: false, reason: created.reason, jobId };
  await env.PLEDGES.put(outboxJobKey(jobId), created.serialized, { expirationTtl: EMAIL_OUTBOX_PAYLOAD_TTL_SECONDS });
  await writeQueueState(env, { hasPending: true, nextDueAt: created.record.nextAttemptAt });
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
    const disposition = classifyOutboxJob(job, { now, leaseMs: EMAIL_PROCESSING_LEASE_MS });
    if (disposition.state === 'missing' || disposition.state === 'terminal') continue;
    results.checked++;
    if (disposition.state === 'not_due') {
      hasPending = true;
      if (!nextDueAt || Date.parse(disposition.nextDueAt) < Date.parse(nextDueAt)) nextDueAt = disposition.nextDueAt;
      continue;
    }
    if (disposition.state === 'expired') {
      await env.PLEDGES.put(deliveryKey(job.jobId), JSON.stringify({ version: 1, status: 'expired', kind: job.kind, campaignSlug: job.campaignSlug, updatedAt: now.toISOString() }), { expirationTtl: EMAIL_DELIVERY_TTL_SECONDS });
      await env.PLEDGES.delete(key.name);
      results.failed++;
      continue;
    }
    if (disposition.state === 'leased') {
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
          lastError: outboxDeliveryErrorEvidence(error),
          updatedAt: now.toISOString()
        }), { expirationTtl: EMAIL_DELIVERY_TTL_SECONDS });
        await env.PLEDGES.delete(key.name);
        results.failed++;
        continue;
      }
      const next = new Date(now.getTime() + outboxRetryDelayMs(error, job.attempts, {
        quotaTypes: ['daily_quota_exceeded', 'monthly_quota_exceeded']
      }));
      job.status = 'retry';
      job.nextAttemptAt = next.toISOString();
      job.lastError = outboxDeliveryErrorEvidence(error);
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

export async function verifyResendWebhook(rawBody, headers, secret, now = new Date()) {
  const result = await verifySharedResendWebhook(rawBody, headers, secret, { now });
  if (result.valid) return { valid: true, id: result.id };
  if (result.error === 'invalid_signature') return { valid: false, id: result.id };
  return {
    valid: false,
    error: result.error === 'invalid_timestamp'
      ? 'timestamp_outside_tolerance'
      : result.error
  };
}

export async function processResendWebhook(env, event, svixId) {
  if (!env?.PLEDGES) return { processed: false, reason: 'storage_not_configured' };
  const markerKey = `${RESEND_WEBHOOK_MARKER_PREFIX}${svixId}`;
  if (await env.PLEDGES.get(markerKey)) return { processed: false, duplicate: true };
  const type = String(event?.type || '');
  const data = event?.data || {};
  const tags = outboxWebhookTags(data);
  const jobId = String(tags.pool_job || '');
  const providerId = String(data.email_id || '');
  if (validOutboxJobId(jobId)) {
    const key = deliveryKey(jobId);
    const delivery = await env.PLEDGES.get(key, { type: 'json' }) || { version: 1, providerId };
    delivery.providerId = delivery.providerId || providerId;
    delivery.lastEvent = type;
    delivery.lastEventAt = String(event.created_at || new Date().toISOString());
    delivery.status = outboxWebhookDeliveryStatus(type) || delivery.status;
    await env.PLEDGES.put(key, JSON.stringify(delivery), { expirationTtl: EMAIL_DELIVERY_TTL_SECONDS });
  }

  const shouldSuppress = outboxWebhookShouldSuppress(event);
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
