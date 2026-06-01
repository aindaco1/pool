import { getCampaign, getEffectiveState } from './campaigns.js';
import { RESEND_RATE_LIMIT_DELAY_MS, sendLaunchReminderEmail } from './email.js';
import { getPlatformName } from './provider-config.js';
import { generateToken, verifyToken } from './token.js';
import { isValidEmail, isValidSlug, jsonResponse, SECURITY_HEADERS } from './validation.js';
import { verifyTurnstile } from './turnstile.js';

const SIGNUP_PREFIX = 'launch-reminder:';
const SUPPRESSION_PREFIX = 'launch-reminder-suppressed:';
const SENT_PREFIX = 'launch-reminder-sent:';
const DISPATCH_PREFIX = 'launch-reminder-dispatch:';
const COMPLETE_PREFIX = 'launch-reminder-complete:';
const TOKEN_SCOPE_UNSUBSCRIBE = 'launch-reminder-unsubscribe';
const DEFAULT_DISPATCH_BATCH_SIZE = 25;
const DEFAULT_DISPATCH_JOB_LIMIT = 3;
const DISPATCH_JOB_TTL_SECONDS = 14 * 24 * 60 * 60;
const SENT_MARKER_TTL_SECONDS = 400 * 24 * 60 * 60;
const COMPLETE_MARKER_TTL_SECONDS = 400 * 24 * 60 * 60;
const SUPPRESSION_TTL_SECONDS = 400 * 24 * 60 * 60;

function isTruthyEnv(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function isFalsyEnv(value) {
  return ['0', 'false', 'no', 'off'].includes(String(value || '').trim().toLowerCase());
}

function normalizeLang(value) {
  return String(value || '').trim().toLowerCase() === 'es' ? 'es' : 'en';
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function getSignupKey(campaignSlug, emailHash) {
  return `${SIGNUP_PREFIX}${campaignSlug}:${emailHash}`;
}

function getSignupPrefix(campaignSlug) {
  return `${SIGNUP_PREFIX}${campaignSlug}:`;
}

function getSuppressionKey(campaignSlug, emailHash) {
  return `${SUPPRESSION_PREFIX}${campaignSlug}:${emailHash}`;
}

function getSentKey(campaignSlug, emailHash) {
  return `${SENT_PREFIX}${campaignSlug}:${emailHash}`;
}

function getDispatchKey(campaignSlug) {
  return `${DISPATCH_PREFIX}${campaignSlug}`;
}

function getCompleteKey(campaignSlug) {
  return `${COMPLETE_PREFIX}${campaignSlug}`;
}

function getLaunchReminderTokenSecret(env) {
  return String(env?.LAUNCH_REMINDER_TOKEN_SECRET || env?.MAGIC_LINK_SECRET || '').trim();
}

function isLaunchRemindersEnabled(env = {}) {
  return !isFalsyEnv(env.LAUNCH_REMINDERS_ENABLED);
}

function getSiteBase(env = {}) {
  return String(env.SITE_BASE || env.CANONICAL_SITE_BASE || 'https://pool.dustwave.xyz').replace(/\/+$/, '');
}

function getWorkerBase(env = {}) {
  return String(env.WORKER_BASE || env.CANONICAL_WORKER_BASE || env.SITE_BASE || 'https://pool.dustwave.xyz').replace(/\/+$/, '');
}

function safeUrl(pathOrUrl, base) {
  try {
    const url = new URL(pathOrUrl || '/', base || 'https://pool.dustwave.xyz');
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return String(base || '');
    return url.toString();
  } catch {
    return String(base || '');
  }
}

function getCampaignUrl(campaign, preferredLang, env) {
  const lang = normalizeLang(preferredLang);
  const siteBase = getSiteBase(env);
  const localizedPath = campaign?.localized_paths?.[lang];
  const fallbackPath = campaign?.url || `/campaigns/${encodeURIComponent(campaign?.slug || '')}/`;
  return safeUrl(localizedPath || fallbackPath, siteBase);
}

function getUnsubscribeUrl(env, token) {
  const url = new URL('/launch-reminders/unsubscribe', getWorkerBase(env));
  url.searchParams.set('t', token);
  return url.toString();
}

function launchReminderHtmlResponse(title, body, status = 200) {
  return new Response(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(title)}</title>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(body)}</p>
  </main>
</body>
</html>`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      ...SECURITY_HEADERS
    }
  });
}

function launchReminderErrorResponse(error, status, env, code = 'launch_reminder_error') {
  return jsonResponse({ error, code }, status, env);
}

export async function verifyLaunchReminderSignupChallenge(request, env, body = {}) {
  if (!isLaunchRemindersEnabled(env)) return null;

  const result = await verifyTurnstile(request, env, body.turnstileToken || body['cf-turnstile-response'], {
    action: 'launch_reminder_signup',
    secretEnvNames: ['LAUNCH_REMINDER_TURNSTILE_SECRET_KEY', 'TURNSTILE_SECRET_KEY'],
    requiredEnvName: 'LAUNCH_REMINDER_TURNSTILE_REQUIRED',
    bypassEnvName: 'LAUNCH_REMINDER_TURNSTILE_BYPASS'
  });

  if (result.ok) return null;

  const status = result.status || 400;
  const error = result.code === 'challenge_not_configured'
    ? 'Launch reminder challenge is not configured'
    : result.code === 'challenge_required'
      ? 'Launch reminder challenge required'
      : result.code === 'challenge_unavailable'
        ? 'Launch reminder challenge verification unavailable'
        : 'Launch reminder challenge verification failed';
  return launchReminderErrorResponse(error, status, env, `launch_reminder_${result.code || 'challenge_failed'}`);
}

export async function handleLaunchReminderSignup(_request, env, body = {}) {
  if (!isLaunchRemindersEnabled(env)) {
    return launchReminderErrorResponse('Launch reminders are not enabled', 404, env, 'launch_reminders_disabled');
  }
  if (!env?.PLEDGES) {
    return launchReminderErrorResponse('Launch reminders are not configured', 503, env, 'launch_reminders_not_configured');
  }

  const campaignSlug = String(body.campaignSlug || body.campaign_slug || '').trim();
  const email = normalizeEmail(body.email);
  const preferredLang = normalizeLang(body.preferredLang || body.lang);
  const consent = body.consent === true || String(body.consent || '').trim().toLowerCase() === 'true';

  if (!isValidSlug(campaignSlug)) {
    return launchReminderErrorResponse('Campaign not found', 404, env, 'campaign_not_found');
  }
  if (!isValidEmail(email)) {
    return launchReminderErrorResponse('Enter a valid email address', 400, env, 'invalid_email');
  }
  if (!consent) {
    return launchReminderErrorResponse('Consent is required', 400, env, 'consent_required');
  }

  const campaign = await getCampaign(env, campaignSlug);
  if (!campaign) {
    return launchReminderErrorResponse('Campaign not found', 404, env, 'campaign_not_found');
  }

  const effectiveState = getEffectiveState(campaign, env);
  if (effectiveState !== 'upcoming') {
    return launchReminderErrorResponse('Launch reminders are only available before this campaign starts', 409, env, 'campaign_not_upcoming');
  }

  const now = new Date().toISOString();
  const emailHash = await sha256Hex(email);
  const signupKey = getSignupKey(campaignSlug, emailHash);
  const existing = await env.PLEDGES.get(signupKey, { type: 'json' });
  const record = {
    version: 1,
    campaignSlug,
    campaignTitle: campaign.title || campaignSlug,
    email,
    emailHash,
    preferredLang,
    status: 'active',
    source: 'campaign-page',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    unsubscribedAt: null,
    lastSentAt: existing?.lastSentAt || null
  };

  await env.PLEDGES.put(signupKey, JSON.stringify(record));
  await env.PLEDGES.delete(getSuppressionKey(campaignSlug, emailHash));

  return jsonResponse({ ok: true, status: 'registered' }, 200, env);
}

export async function handleLaunchReminderUnsubscribe(request, env) {
  if (!env?.PLEDGES) {
    return launchReminderHtmlResponse('Reminder unavailable', 'Launch reminders are not configured.', 503);
  }

  const tokenSecret = getLaunchReminderTokenSecret(env);
  if (!tokenSecret) {
    return launchReminderHtmlResponse('Reminder unavailable', 'Unsubscribe links are not configured.', 503);
  }

  const url = new URL(request.url);
  const token = String(url.searchParams.get('t') || '').trim();
  const payload = token ? await verifyToken(tokenSecret, token, env) : null;
  if (
    !payload ||
    payload.scope !== TOKEN_SCOPE_UNSUBSCRIBE ||
    !isValidSlug(payload.campaignSlug) ||
    !payload.emailHash
  ) {
    return launchReminderHtmlResponse('Reminder link expired', 'This reminder link is invalid or expired.', 400);
  }

  const now = new Date().toISOString();
  const campaignSlug = String(payload.campaignSlug);
  const emailHash = String(payload.emailHash);
  const signupKey = getSignupKey(campaignSlug, emailHash);
  const existing = await env.PLEDGES.get(signupKey, { type: 'json' });
  if (existing) {
    existing.status = 'unsubscribed';
    existing.unsubscribedAt = existing.unsubscribedAt || now;
    existing.updatedAt = now;
    await env.PLEDGES.put(signupKey, JSON.stringify(existing));
  }

  await env.PLEDGES.put(getSuppressionKey(campaignSlug, emailHash), JSON.stringify({
    campaignSlug,
    emailHash,
    email: payload.email || existing?.email || '',
    suppressedAt: now,
    source: 'unsubscribe'
  }), { expirationTtl: SUPPRESSION_TTL_SECONDS });

  return launchReminderHtmlResponse('Reminder unsubscribed', 'You will not receive this launch reminder.');
}

async function campaignHasLaunchReminderSignups(env, campaignSlug) {
  const listing = await env.PLEDGES.list({
    prefix: getSignupPrefix(campaignSlug),
    limit: 1
  });
  return Array.isArray(listing?.keys) && listing.keys.length > 0;
}

export async function ensureLaunchReminderDispatchForCampaign(env, campaign) {
  if (!isLaunchRemindersEnabled(env) || !env?.PLEDGES || !campaign?.slug) {
    return { queued: false, reason: 'not_configured' };
  }

  const campaignSlug = campaign.slug;
  const effectiveState = getEffectiveState(campaign, env);
  if (effectiveState !== 'live') {
    return { queued: false, reason: 'campaign_not_live' };
  }

  const completeKey = getCompleteKey(campaignSlug);
  const dispatchKey = getDispatchKey(campaignSlug);
  const [complete, existingJob] = await Promise.all([
    env.PLEDGES.get(completeKey),
    env.PLEDGES.get(dispatchKey, { type: 'json' })
  ]);
  if (complete) return { queued: false, reason: 'already_complete' };
  if (existingJob?.status === 'pending') return { queued: false, reason: 'already_queued' };

  if (!(await campaignHasLaunchReminderSignups(env, campaignSlug))) {
    await env.PLEDGES.put(completeKey, new Date().toISOString(), { expirationTtl: COMPLETE_MARKER_TTL_SECONDS });
    return { queued: false, reason: 'no_signups' };
  }

  const now = new Date().toISOString();
  await env.PLEDGES.put(dispatchKey, JSON.stringify({
    version: 1,
    status: 'pending',
    campaignSlug,
    campaignTitle: campaign.title || campaignSlug,
    cursor: undefined,
    queuedAt: now,
    updatedAt: now,
    sent: 0,
    skipped: 0,
    failed: 0
  }), { expirationTtl: DISPATCH_JOB_TTL_SECONDS });

  return { queued: true };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function processLaunchReminderJob(env, jobKey, job, now) {
  const campaignSlug = String(job?.campaignSlug || '').trim();
  if (!isValidSlug(campaignSlug)) {
    await env.PLEDGES.delete(jobKey);
    return { sent: 0, skipped: 0, failed: 0, completed: false, deleted: true };
  }

  const campaign = await getCampaign(env, campaignSlug);
  const batchSize = Math.max(1, Math.min(
    100,
    Number.parseInt(String(env.LAUNCH_REMINDER_DISPATCH_BATCH_SIZE || DEFAULT_DISPATCH_BATCH_SIZE), 10) || DEFAULT_DISPATCH_BATCH_SIZE
  ));
  const listing = await env.PLEDGES.list({
    prefix: getSignupPrefix(campaignSlug),
    cursor: job.cursor,
    limit: batchSize
  });
  const keys = Array.isArray(listing?.keys) ? listing.keys : [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const keyInfo of keys) {
    const key = keyInfo?.name;
    if (!key) continue;
    const signup = await env.PLEDGES.get(key, { type: 'json' });
    if (!signup?.email || !signup.emailHash || signup.status !== 'active') {
      skipped++;
      continue;
    }

    const suppressionKey = getSuppressionKey(campaignSlug, signup.emailHash);
    const sentKey = getSentKey(campaignSlug, signup.emailHash);
    const [suppressed, alreadySent] = await Promise.all([
      env.PLEDGES.get(suppressionKey),
      env.PLEDGES.get(sentKey)
    ]);
    if (suppressed || alreadySent) {
      skipped++;
      continue;
    }

    const tokenSecret = getLaunchReminderTokenSecret(env);
    if (!tokenSecret) {
      failed++;
      continue;
    }

    const token = await generateToken(tokenSecret, {
      scope: TOKEN_SCOPE_UNSUBSCRIBE,
      campaignSlug,
      emailHash: signup.emailHash,
      email: signup.email
    }, 365);
    const campaignTitle = signup.campaignTitle || campaign?.title || job.campaignTitle || campaignSlug;
    const preferredLang = normalizeLang(signup.preferredLang);
    const result = await sendLaunchReminderEmail(env, {
      email: signup.email,
      campaignSlug,
      campaignTitle,
      campaignUrl: getCampaignUrl(campaign || { slug: campaignSlug }, preferredLang, env),
      unsubscribeUrl: getUnsubscribeUrl(env, token),
      preferredLang
    });

    if (!result?.sent) {
      failed++;
      continue;
    }

    const sentAt = now.toISOString();
    await env.PLEDGES.put(sentKey, sentAt, { expirationTtl: SENT_MARKER_TTL_SECONDS });
    signup.status = 'sent';
    signup.lastSentAt = sentAt;
    signup.updatedAt = sentAt;
    await env.PLEDGES.put(key, JSON.stringify(signup));
    sent++;
    await sleep(RESEND_RATE_LIMIT_DELAY_MS);
  }

  job.sent = Number(job.sent || 0) + sent;
  job.skipped = Number(job.skipped || 0) + skipped;
  job.failed = Number(job.failed || 0) + failed;
  job.updatedAt = now.toISOString();

  if (failed > 0) {
    await env.PLEDGES.put(jobKey, JSON.stringify(job), { expirationTtl: DISPATCH_JOB_TTL_SECONDS });
    return { sent, skipped, failed, completed: false };
  }

  if (listing?.list_complete !== false) {
    job.status = 'complete';
    job.completedAt = now.toISOString();
    await env.PLEDGES.put(getCompleteKey(campaignSlug), job.completedAt, { expirationTtl: COMPLETE_MARKER_TTL_SECONDS });
    await env.PLEDGES.delete(jobKey);
    return { sent, skipped, failed, completed: true };
  }

  job.cursor = listing.cursor;
  await env.PLEDGES.put(jobKey, JSON.stringify(job), { expirationTtl: DISPATCH_JOB_TTL_SECONDS });
  return { sent, skipped, failed, completed: false };
}

export async function processLaunchReminderDispatchJobs(env, now = new Date()) {
  if (!isLaunchRemindersEnabled(env) || !env?.PLEDGES) {
    return { attempted: false, jobs: 0, sent: 0, skipped: 0, failed: 0, completed: 0 };
  }

  const jobLimit = Math.max(1, Math.min(
    10,
    Number.parseInt(String(env.LAUNCH_REMINDER_DISPATCH_JOB_LIMIT || DEFAULT_DISPATCH_JOB_LIMIT), 10) || DEFAULT_DISPATCH_JOB_LIMIT
  ));
  const listing = await env.PLEDGES.list({
    prefix: DISPATCH_PREFIX,
    limit: jobLimit
  });
  const keys = Array.isArray(listing?.keys) ? listing.keys.slice(0, jobLimit) : [];
  const results = { attempted: keys.length > 0, jobs: 0, sent: 0, skipped: 0, failed: 0, completed: 0 };

  for (const keyInfo of keys) {
    const jobKey = keyInfo?.name;
    if (!jobKey) continue;
    const job = await env.PLEDGES.get(jobKey, { type: 'json' });
    if (!job || job.status !== 'pending') {
      await env.PLEDGES.delete(jobKey);
      continue;
    }
    const result = await processLaunchReminderJob(env, jobKey, job, now);
    results.jobs++;
    results.sent += result.sent || 0;
    results.skipped += result.skipped || 0;
    results.failed += result.failed || 0;
    if (result.completed) results.completed++;
  }

  return results;
}

export function getLaunchReminderDiagnostics(env = {}) {
  return {
    enabled: isLaunchRemindersEnabled(env),
    platformName: getPlatformName(env)
  };
}
