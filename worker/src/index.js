/**
 * The Pool - Pledge Worker
 * 
 * Routes:
 *   POST /checkout-intent/start - Create Stripe Checkout from first-party cart state
 *   POST /shipping/quote      - Quote shipping for a first-party cart
 *   GET  /checkout-intent/summary - Fetch first-party success summary data
 *   GET  /checkout-intent/recovery - Fetch campaign recovery state for cancelled result flow
 *   POST /webhooks/stripe    - Handle Stripe webhooks
 *   GET  /pledge             - Get single pledge details (legacy)
 *   GET  /pledges            - Get all pledges for user
 *   POST /pledge/cancel      - Cancel a pledge
 *   POST /pledge/modify      - Modify pledge tier/amount
 *   POST /pledge/payment-method/start - Update payment method
 *   GET  /votes              - Get voting status
 *   POST /votes              - Cast a vote
 *   GET  /live/:slug         - Get combined live stats + inventory for a campaign
 *   GET  /stats/:slug        - Get live pledge stats for a campaign
 *   GET  /share/campaign/:slug.png - Get crawler-safe campaign share-card image
 *   GET  /share/campaign/:slug.svg - Get internal/debug campaign share-card image
 *   POST /stats/:slug/check - Check stats/index/inventory projection drift (admin)
 *   POST /stats/:slug/recalculate - Recalculate stats from KV (admin)
 *   GET  /inventory/:slug    - Get tier inventory (remaining counts) for a campaign
 *   POST /inventory/:slug/recalculate - Recalculate tier inventory from pledges (admin)
 *   POST /admin/projections/check - Check projection drift across campaigns (admin)
 *   GET  /admin/session         - Read current browser admin session
 *   GET  /admin/dashboard/summary - Read role-scoped admin dashboard summary
 *   GET  /admin/settings      - Read role-scoped admin settings/config snapshot
 *   POST /admin/settings/preview - Validate admin settings changes without writes
 *   POST /admin/settings/publish - Publish admin settings changes through GitHub
 *   GET  /admin/analytics       - Read role-scoped pledge-derived analytics
 *   GET  /admin/content/campaign - Read a role-scoped editable campaign content snapshot
 *   POST /admin/content/preview - Validate and render a role-scoped campaign content preview
 *   POST /admin/content/publish - Publish validated campaign content through GitHub
 *   GET  /admin/supporters      - Read role-scoped campaign supporters
 *   GET  /admin/reports/campaign-runner/preview - Preview campaign-runner reports
 *   GET  /admin/reports/campaign-runner.csv - Download campaign-runner CSVs
 *   GET  /admin/add-ons/inventory - Read platform add-on inventory for super admins
 *   POST /admin/add-ons/inventory - Override or reset platform add-on inventory baselines
 *   POST /admin/inventory/init-all    - Initialize inventory for all campaigns (admin)
 *   POST /admin/rebuild      - Trigger GitHub Pages rebuild (admin)
 *   POST /admin/broadcast/announcement - Send announcement with CTA link to campaign supporters
 *   POST /admin/broadcast/diary     - Send diary update to all campaign supporters
 *   POST /admin/diary/check         - Check all campaigns for new diary entries and broadcast
 *   POST /admin/broadcast/milestone - Send milestone notification to all campaign supporters
 *   POST /admin/report/campaign-runner - Dry-run or send a campaign-runner report for one campaign
 *   POST /admin/milestone-check/:slug - Check and trigger any pending milestones for a campaign
 *   POST /admin/settle/:slug        - Settle campaign: charge pledges if funded + deadline passed
 *   POST /admin/settle-batch        - Settle specific pledges by order ID (batched, max 6)
 *   POST /admin/settle-dispatch/:slug - Dispatch batched settlement (self-chains until complete)
 *   POST /admin/backfill-customers/:slug - Create Stripe customers for pledges missing them
 *   POST /admin/campaign-index/rebuild/:slug - Rebuild campaign pledge index from KV
 *   GET  /admin/cron/status         - Check cron heartbeat status
 *   POST /admin/recover-checkout   - Recover missed Stripe webhook (creates pledge from session)
 *   POST /test/setup         - Create test pledges (test mode only)
 *   POST /test/cleanup       - Remove test pledges (test mode only)
 *   POST /test/email         - Test individual email sends (test mode only)
 */

import { generateToken, verifyToken } from './token.js';
import { sendSupporterEmail, sendPaymentFailedEmail, sendPledgeModifiedEmail, sendPledgeCancelledEmail, sendDiaryUpdateEmail, sendMilestoneEmail, sendChargeSuccessEmail, sendAnnouncementEmail, sendCampaignRunnerReportEmail, sendAdminUserCreatedEmail } from './email.js';
import { handleGetVotes, handlePostVote } from './routes/votes.js';
import { verifyStripeSignature, createStripeClient } from './stripe.js';
import { isCampaignLive, getCampaign, getCampaigns, getEffectiveState } from './campaigns.js';
import { getAddOns, getAddOnInventorySnapshot, invalidateAddOnInventorySnapshot, mutateAddOnInventoryOverride } from './add-ons.js';
import { getCampaignStats, addPledgeToStats, removePledgeFromStats, recalculateStats, getTierInventory, claimTierInventory, releaseTierInventory, recalculateTierInventory, checkMilestones, markMilestoneSent, getSentMilestones, updateSupportItemStats, getSentDiaryEntries, markDiarySent, claimTierSelectionInventory, applyTierInventorySelectionChanges, checkCampaignProjectionDrift } from './stats.js';
import { getGitHubTextFile, putGitHubBase64File, putGitHubTextFile, triggerSiteRebuild } from './github.js';
import { getScopedConsole } from './logger.js';
import { isValidSlug, isValidEmail, isValidAmount, SECURITY_HEADERS, getAllowedOrigin } from './validation.js';
import { calculatePlatformTip, derivePlatformTipPercent, sanitizePlatformTipPercent } from './tip.js';
import { hashCheckoutContribution, hashCheckoutBundle, buildCheckoutHashInput, buildCheckoutBundleHashInput, CHECKOUT_INTENT_VERSION, DEFAULT_CHECKOUT_INTENT_TTL_SECONDS } from './checkout-intent.js';
import {
  getCampaignRunnerDailyPledgeReportEnabled,
  getCampaignRunnerFulfillmentReportEnabled,
  getCampaignRunnerIncludeCsvAttachment,
  getCampaignRunnerIncludeStatsSummary,
  getCampaignRunnerReportHourMt,
  getCampaignRunnerReportMinuteMt,
  getCampaignRunnerReportsEnabled,
  getCampaignShippingFallbackFeeCents,
  getCheckoutProvider,
  getCheckoutUiMode,
  getDefaultPlatformTipPercent,
  getFlatShippingFeeCents,
  getMaxPlatformTipPercent,
  getPlatformCompanyName,
  getSupportEmail,
  getShippingFallbackFeeCents
} from './provider-config.js';
import { normalizeShippingDestination, quoteCampaignShipment } from './shipping.js';
import { normalizeTaxDestination, quoteTax } from './tax.js';
import { buildFulfillmentReport, buildPledgeLedgerReport, rebuildCsvReport } from './reports.js';
import {
  adminCorsResponse,
  getEffectiveAdminUsers,
  handleAdminAuthExchange,
  handleAdminAuthStart,
  handleAdminLogout,
  handleAdminSession,
  requireAdminSession,
  saveStoredAdminUsers,
  verifyAdminAuthStartChallenge
} from './admin-auth.js';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
export { CheckoutIntentNonceCoordinator } from './checkout-intent-do.js';
export { TierInventoryCoordinator } from './tier-inventory-do.js';

let console = globalThis.console;

function configureWorkerLogging(env) {
  console = getScopedConsole(env, 'index');
}

// Rate limit delay for Resend API (2 req/sec limit)
const RESEND_RATE_LIMIT_DELAY = 600; // ms between emails
const STRIPE_CUSTOM_UI_MODE_API_VERSION = '2026-02-25.clover';
const PRIVATE_NO_STORE_CACHE_CONTROL = 'private, no-store, max-age=0';
const DEFAULT_I18N_LANG = 'en';
const ADD_ON_ITEM_PREFIX = 'addon__';
const SUPPORTER_EMAIL_RETRY_PREFIX = 'supporter-email-retry:';
const SUPPORTER_EMAIL_RETRY_CRON = '*/15 * * * *';
const CAMPAIGN_RUNNER_REPORT_CRONS = new Set(['0 13 * * *', '0 14 * * *']);
const SUPPORTER_EMAIL_RETRY_BATCH_SIZE = 10;
const SUPPORTER_EMAIL_RETRY_TTL_SECONDS = 30 * 24 * 60 * 60;
const SHARE_CARD_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600';
const SHARE_CARD_RASTER_WIDTH = 1200;
const SHARE_CARD_RASTER_HEIGHT = 630;
const MAX_STANDARD_JSON_BODY_BYTES = 64 * 1024;
const MAX_ADMIN_LOGO_UPLOAD_BODY_BYTES = 1024 * 1024;
const MAX_ADMIN_IMAGE_UPLOAD_BODY_BYTES = 12 * 1024 * 1024;
const MAX_ADMIN_VIDEO_UPLOAD_BODY_BYTES = 140 * 1024 * 1024;
const MAX_STRIPE_WEBHOOK_BODY_BYTES = 256 * 1024;
const RATELIMIT_REQUIRED_ERROR = 'Rate limit storage not configured';
const OBSERVABILITY_RETENTION_SECONDS = 14 * 24 * 60 * 60;
const OBSERVABILITY_RECENT_EVENT_LIMIT = 25;
const OBSERVABILITY_MAX_DAYS = 7;
const DEFAULT_OBSERVABILITY_SAMPLE_RATE = 0.1;
const CAMPAIGN_RUNNER_REPORT_MARKER_TTL_SECONDS = 180 * 24 * 60 * 60;
const ADMIN_AUDIT_EVENT_TTL_SECONDS = 400 * 24 * 60 * 60;

// Extract plain text excerpt from diary entry (supports both legacy body and content blocks)
function getDiaryExcerpt(entry, maxLength = 200) {
  // Legacy: plain text body
  if (entry.body && typeof entry.body === 'string') {
    return entry.body.slice(0, maxLength);
  }
  
  // New: content blocks array
  if (entry.content && Array.isArray(entry.content)) {
    const textParts = [];
    for (const block of entry.content) {
      if (block.type === 'text' && block.body) {
        // Strip basic markdown formatting for email excerpt
        const plainText = block.body
          .replace(/\*\*([^*]+)\*\*/g, '$1')  // bold
          .replace(/\*([^*]+)\*/g, '$1')       // italic
          .replace(/_([^_]+)_/g, '$1')         // italic
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // links
          .replace(/^#+\s*/gm, '')              // headers
          .replace(/\n+/g, ' ')                 // newlines to spaces
          .trim();
        textParts.push(plainText);
      } else if (block.type === 'quote' && block.text) {
        textParts.push(`"${block.text}"`);
      }
    }
    const combined = textParts.join(' ').trim();
    if (combined.length > maxLength) {
      return combined.slice(0, maxLength) + '…';
    }
    return combined;
  }
  
  return '';
}

function escapeSvgText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatSvgCurrencyFromCents(cents) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format((Number(cents || 0) / 100));
}

function formatSvgDate(dateString) {
  if (!dateString) return '';
  const [year, month, day] = String(dateString).split('-').map(Number);
  if (!year || !month || !day) return String(dateString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function trimSvgText(value, maxLength = 140) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trimEnd() + '…';
}

function stripHtmlTags(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function encodeArrayBufferAsBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function fetchImageAsDataUrl(url) {
  if (!url) return '';
  try {
    const response = await fetch(url);
    if (!response.ok) return '';
    const contentType = response.headers.get('Content-Type') || 'image/png';
    const buffer = await response.arrayBuffer();
    return `data:${contentType};base64,${encodeArrayBufferAsBase64(buffer)}`;
  } catch {
    return '';
  }
}

function wrapSvgText(value, maxCharsPerLine = 24, maxLines = 3) {
  const words = String(value ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const lines = [];
  let currentLine = '';
  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length <= maxCharsPerLine || currentLine === '') {
      currentLine = nextLine;
      continue;
    }
    lines.push(currentLine);
    currentLine = word;
    if (lines.length === maxLines - 1) break;
  }
  if (currentLine) {
    const consumedWords = lines.join(' ').split(' ').filter(Boolean).length;
    const remainingWords = words.slice(consumedWords);
    const finalLine = remainingWords.join(' ') || currentLine;
    lines.push(trimSvgText(finalLine, maxCharsPerLine + 8));
  }
  return lines.slice(0, maxLines);
}

function getShareCardMessages(preferredLang = DEFAULT_I18N_LANG) {
  const lang = normalizePreferredLang(preferredLang);
  if (lang.startsWith('es')) {
    return {
      creator: 'CREADOR',
      category: 'CATEGORÍA',
      starts: 'Empieza',
      ends: 'Termina',
      funded: 'Financiada',
      ended: 'Finalizada',
      campaign: 'Campaña',
      of: 'de',
      fundedPercent: 'financiado'
    };
  }
  return {
    creator: 'CREATOR',
    category: 'CATEGORY',
    starts: 'Starts',
    ends: 'Ends',
    funded: 'Funded',
    ended: 'Ended',
    campaign: 'Campaign',
    of: 'of',
    fundedPercent: 'funded'
  };
}

async function buildCampaignShareCardSvg({ env, campaign, stats, effectiveState, isFunded, preferredLang }) {
  const siteBase = String(env?.SITE_BASE || '').replace(/\/$/, '');
  const publicSiteBase = String(env?.CANONICAL_SITE_BASE || env?.SITE_BASE || '').replace(/\/$/, '');
  const canonicalCampaignPath = String(campaign?.url || `/campaigns/${encodeURIComponent(campaign?.slug || '')}/`);
  const campaignPath = getLocalizedPath(canonicalCampaignPath, preferredLang);
  const campaignUrlLabel = `${publicSiteBase}${campaignPath}`;
  const title = trimSvgText(campaign?.title || campaign?.slug || 'Campaign', 48);
  const displayTitle = title.toLocaleUpperCase(preferredLang || DEFAULT_I18N_LANG);
  const creator = trimSvgText(campaign?.creator_name || 'The Pool', 40);
  const category = trimSvgText(campaign?.category || 'Campaign', 32);
  const blurb = trimSvgText(stripHtmlTags(campaign?.short_blurb || ''), 180);
  const titleLines = wrapSvgText(displayTitle, 12, 2);
  const hasMultiLineTitle = titleLines.length > 1;
  const blurbLines = wrapSvgText(blurb, hasMultiLineTitle ? 32 : 34, hasMultiLineTitle ? 2 : 3);
  const heroImage = campaign?.hero_image_wide || campaign?.hero_image || '';
  const progressBackground = campaign?.progress_background || '';
  const heroImageUrl = heroImage ? `${siteBase}${heroImage}` : '';
  const progressBackgroundUrl = progressBackground ? `${siteBase}${progressBackground}` : '';
  const heroImageDataUrl = await fetchImageAsDataUrl(heroImageUrl);
  const progressBackgroundDataUrl = await fetchImageAsDataUrl(progressBackgroundUrl);
  const pledgedAmount = Number(stats?.pledgedAmount || 0);
  const goalAmountCents = Number(campaign?.goal_amount || 0) * 100;
  const progressPct = goalAmountCents > 0
    ? Math.max(0, Math.min(100, Math.round((pledgedAmount / goalAmountCents) * 100)))
    : 0;
  const messages = getShareCardMessages(preferredLang);
  const panelLeft = 620;
  const progressWidth = 456;
  const goalMarkerOne = panelLeft + Math.round(progressWidth / 3);
  const goalMarkerTwo = panelLeft + Math.round((progressWidth * 2) / 3);
  const goalMarkerThree = panelLeft + progressWidth;
  const progressHandleX = panelLeft + Math.round((progressWidth * progressPct) / 100);
  const handleX = Math.max(632, Math.min(goalMarkerThree, progressHandleX));
  const creatorY = 126;
  const metaGap = 32;
  const categoryY = creatorY + metaGap;
  const badgeTop = 204;
  const badgeHeight = 42;
  const badgeTextY = 231;
  const titleY = hasMultiLineTitle ? 312 : 332;
  const titleFontSize = hasMultiLineTitle ? 72 : 86;
  const titleLineHeight = hasMultiLineTitle ? 66 : 74;
  const blurbY = titleY + ((Math.max(titleLines.length, 1) - 1) * titleLineHeight) + 45;
  const blurbLineHeight = 36;
  const amountY = blurbY + ((Math.max(blurbLines.length, 1) - 1) * blurbLineHeight) + (hasMultiLineTitle ? 66 : 91);
  const progressY = amountY + 19;
  const footerY = progressY + (hasMultiLineTitle ? 44 : 56);

  let badgeText = messages.campaign;
  if (effectiveState === 'upcoming') {
    badgeText = `${messages.starts} ${formatSvgDate(campaign?.start_date)}`;
  } else if (effectiveState === 'live') {
    badgeText = `${messages.ends} ${formatSvgDate(campaign?.goal_deadline)}`;
  } else if (isFunded) {
    badgeText = messages.funded;
  } else {
    badgeText = messages.ended;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeSvgText(title)}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fffdf8" />
      <stop offset="55%" stop-color="#f2f0eb" />
      <stop offset="100%" stop-color="#e7ecef" />
    </linearGradient>
    <linearGradient id="panel" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#10141b" />
      <stop offset="100%" stop-color="#1a2028" />
    </linearGradient>
    <linearGradient id="progressFill" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0f1117" />
      <stop offset="100%" stop-color="#303846" />
    </linearGradient>
    <clipPath id="heroClip">
      <rect x="48" y="76" width="492" height="506" rx="28" ry="28" />
    </clipPath>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  ${progressBackgroundDataUrl ? `<image href="${escapeSvgText(progressBackgroundDataUrl)}" x="0" y="0" width="1200" height="630" opacity="0.08" preserveAspectRatio="xMidYMid slice" />` : ''}
  <rect x="48" y="76" width="492" height="506" rx="28" ry="28" fill="#131820" />
  ${heroImageDataUrl ? `<image href="${escapeSvgText(heroImageDataUrl)}" x="48" y="76" width="492" height="506" preserveAspectRatio="xMidYMid slice" clip-path="url(#heroClip)" />` : ''}
  <rect x="48" y="76" width="492" height="506" rx="28" ry="28" fill="url(#panel)" opacity="${heroImageDataUrl ? '0.18' : '1'}" />
  <rect x="578" y="76" width="574" height="506" rx="34" ry="34" fill="#fbfbf7" opacity="0.93" />
  <text x="${panelLeft}" y="${creatorY}" fill="#666f7d" font-family="Inter, sans-serif" font-size="18" font-weight="700" letter-spacing="1.4">${escapeSvgText(messages.creator)}: ${escapeSvgText(creator.toUpperCase())}</text>
  <text x="${panelLeft}" y="${categoryY}" fill="#666f7d" font-family="Inter, sans-serif" font-size="18" font-weight="700" letter-spacing="1.4">${escapeSvgText(messages.category)}: ${escapeSvgText(category.toUpperCase())}</text>
  <rect x="${panelLeft}" y="${badgeTop}" width="248" height="${badgeHeight}" rx="21" ry="21" fill="#11141c" />
  <text x="744" y="${badgeTextY}" text-anchor="middle" fill="#ffffff" font-family="Inter, sans-serif" font-size="21" font-weight="700">${escapeSvgText(badgeText)}</text>
  <text x="${panelLeft}" y="${titleY}" fill="#11141c" font-family="Inter, sans-serif" font-size="${titleFontSize}" font-weight="800">${titleLines.map((line, index) => `<tspan x="${panelLeft}" dy="${index === 0 ? 0 : titleLineHeight}">${escapeSvgText(line)}</tspan>`).join('')}</text>
  <text x="${panelLeft}" y="${blurbY}" fill="#3d4552" font-family="Inter, sans-serif" font-size="28" font-style="italic">${blurbLines.map((line, index) => `<tspan x="${panelLeft}" dy="${index === 0 ? 0 : blurbLineHeight}">${escapeSvgText(line)}</tspan>`).join('')}</text>
  <text x="${panelLeft}" y="${amountY}" fill="#697180" font-family="Inter, sans-serif" font-size="30" font-weight="700"><tspan fill="#11141c" font-size="42" font-weight="800">${escapeSvgText(formatSvgCurrencyFromCents(pledgedAmount))}</tspan><tspan dx="12">${escapeSvgText(messages.of)} ${escapeSvgText(formatSvgCurrencyFromCents(goalAmountCents))}</tspan></text>
  <rect x="${panelLeft}" y="${progressY}" width="${progressWidth}" height="18" rx="9" ry="9" fill="#e5e8ee" />
  ${progressBackgroundDataUrl ? `<image href="${escapeSvgText(progressBackgroundDataUrl)}" x="${panelLeft}" y="${progressY}" width="${progressWidth}" height="18" opacity="0.1" preserveAspectRatio="none" />` : ''}
  <rect x="${panelLeft}" y="${progressY}" width="${Math.max(12, Math.round((progressWidth * progressPct) / 100))}" height="18" rx="9" ry="9" fill="url(#progressFill)" />
  <line x1="${goalMarkerOne}" y1="${progressY - 6}" x2="${goalMarkerOne}" y2="${progressY + 24}" stroke="#7d8695" stroke-width="2" opacity="0.55" />
  <line x1="${goalMarkerTwo}" y1="${progressY - 6}" x2="${goalMarkerTwo}" y2="${progressY + 24}" stroke="#7d8695" stroke-width="2" opacity="0.55" />
  <line x1="${goalMarkerThree}" y1="${progressY - 6}" x2="${goalMarkerThree}" y2="${progressY + 24}" stroke="#7d8695" stroke-width="2" opacity="0.55" />
  <circle cx="${goalMarkerOne}" cy="${progressY + 9}" r="8" fill="#ffffff" stroke="#657082" stroke-width="4" />
  <circle cx="${goalMarkerTwo}" cy="${progressY + 9}" r="8" fill="#ffffff" stroke="#657082" stroke-width="4" />
  <circle cx="${goalMarkerThree}" cy="${progressY + 9}" r="8" fill="#ffffff" stroke="#657082" stroke-width="4" />
  <circle cx="${handleX}" cy="${progressY + 9}" r="12" fill="#ffffff" stroke="#596273" stroke-width="6" />
  <text x="${panelLeft}" y="${footerY}" fill="#596273" font-family="Inter, sans-serif" font-size="22" font-weight="700">${escapeSvgText(String(progressPct))}% ${escapeSvgText(messages.fundedPercent)}</text>
  <text x="1076" y="${footerY}" text-anchor="end" fill="#7d8593" font-family="Inter, sans-serif" font-size="10" font-weight="700">${escapeSvgText(campaignUrlLabel)}</text>
</svg>`;
}

const SHARE_CARD_FONT = Object.freeze({
  'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  'C': ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  'G': ['01111', '10000', '10000', '10011', '10001', '10001', '01110'],
  'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  'I': ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  'J': ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  'W': ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '$': ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '00100', '00100', '01000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  '"': ['01010', '01010', '01010', '00000', '00000', '00000', '00000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '@': ['01110', '10001', '10111', '10101', '10111', '10000', '01110'],
  '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010']
});

const SHARE_CARD_FONT_WIDTH = 5;
const SHARE_CARD_FONT_HEIGHT = 7;
const SHARE_CARD_COLORS = Object.freeze({
  background: [248, 247, 242],
  surface: [255, 255, 255],
  border: [207, 214, 224],
  text: [17, 20, 28],
  muted: [93, 102, 117],
  soft: [229, 232, 238],
  fill: [17, 20, 28],
  fillSoft: [48, 56, 70]
});

function createShareCardSurface(width = SHARE_CARD_RASTER_WIDTH, height = SHARE_CARD_RASTER_HEIGHT) {
  const pixels = new Uint8Array(width * height * 3);
  for (let index = 0; index < pixels.length; index += 3) {
    pixels[index] = SHARE_CARD_COLORS.background[0];
    pixels[index + 1] = SHARE_CARD_COLORS.background[1];
    pixels[index + 2] = SHARE_CARD_COLORS.background[2];
  }
  return { width, height, pixels };
}

function fillShareCardRect(surface, x, y, width, height, color) {
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(surface.width, Math.ceil(x + width));
  const endY = Math.min(surface.height, Math.ceil(y + height));
  if (endX <= startX || endY <= startY) return;
  for (let row = startY; row < endY; row += 1) {
    let offset = ((row * surface.width) + startX) * 3;
    for (let col = startX; col < endX; col += 1) {
      surface.pixels[offset] = color[0];
      surface.pixels[offset + 1] = color[1];
      surface.pixels[offset + 2] = color[2];
      offset += 3;
    }
  }
}

function strokeShareCardRect(surface, x, y, width, height, color, thickness = 2) {
  fillShareCardRect(surface, x, y, width, thickness, color);
  fillShareCardRect(surface, x, y + height - thickness, width, thickness, color);
  fillShareCardRect(surface, x, y, thickness, height, color);
  fillShareCardRect(surface, x + width - thickness, y, thickness, height, color);
}

function normalizeBitmapText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function getShareCardGlyph(char) {
  if (char === ' ') return null;
  return SHARE_CARD_FONT[char] || SHARE_CARD_FONT['?'];
}

function measureShareCardText(value, scale = 4, letterSpacing = 1) {
  const text = normalizeBitmapText(value);
  if (!text) return 0;
  let width = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    width += (char === ' ' ? 3 : SHARE_CARD_FONT_WIDTH) * scale;
    if (index < text.length - 1) width += letterSpacing * scale;
  }
  return width;
}

function truncateShareCardText(value, maxWidth, scale = 4, letterSpacing = 1) {
  let text = normalizeBitmapText(value);
  const suffix = '...';
  if (measureShareCardText(text, scale, letterSpacing) <= maxWidth) return text;
  while (text.length > 0 && measureShareCardText(`${text}${suffix}`, scale, letterSpacing) > maxWidth) {
    text = text.slice(0, -1).trimEnd();
  }
  return text ? `${text}${suffix}` : suffix;
}

function wrapShareCardText(value, maxWidth, options = {}) {
  const scale = options.scale || 4;
  const letterSpacing = options.letterSpacing ?? 1;
  const maxLines = options.maxLines || 3;
  const words = normalizeBitmapText(value).split(' ').filter(Boolean);
  const lines = [];
  let wordIndex = 0;

  while (wordIndex < words.length && lines.length < maxLines) {
    let line = words[wordIndex];
    wordIndex += 1;

    while (wordIndex < words.length && measureShareCardText(`${line} ${words[wordIndex]}`, scale, letterSpacing) <= maxWidth) {
      line = `${line} ${words[wordIndex]}`;
      wordIndex += 1;
    }

    if (lines.length === maxLines - 1 && wordIndex < words.length) {
      lines.push(truncateShareCardText(`${line} ${words.slice(wordIndex).join(' ')}`, maxWidth, scale, letterSpacing));
      return lines;
    }

    lines.push(truncateShareCardText(line, maxWidth, scale, letterSpacing));
  }

  return lines;
}

function drawShareCardText(surface, value, x, y, options = {}) {
  const scale = Math.max(1, Math.floor(options.scale || 4));
  const color = options.color || SHARE_CARD_COLORS.text;
  const letterSpacing = options.letterSpacing ?? 1;
  const text = normalizeBitmapText(value);
  let cursorX = Math.floor(x);

  for (const char of text) {
    if (char === ' ') {
      cursorX += (3 + letterSpacing) * scale;
      continue;
    }

    const glyph = getShareCardGlyph(char);
    for (let row = 0; row < SHARE_CARD_FONT_HEIGHT; row += 1) {
      for (let col = 0; col < SHARE_CARD_FONT_WIDTH; col += 1) {
        if (glyph[row][col] === '1') {
          fillShareCardRect(surface, cursorX + (col * scale), y + (row * scale), scale, scale, color);
        }
      }
    }
    cursorX += (SHARE_CARD_FONT_WIDTH + letterSpacing) * scale;
  }
}

function drawShareCardTextLines(surface, lines, x, y, options = {}) {
  const scale = options.scale || 4;
  const lineHeight = options.lineHeight || Math.round((SHARE_CARD_FONT_HEIGHT + 2) * scale);
  lines.forEach((line, index) => {
    drawShareCardText(surface, line, x, y + (lineHeight * index), options);
  });
}

function encodeUInt32Be(value) {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff
  ]);
}

function concatUint8Arrays(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function createCrc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[index] = crc >>> 0;
  }
  return table;
}

const PNG_CRC32_TABLE = createCrc32Table();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = PNG_CRC32_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes) {
  let a = 1;
  let b = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    a = (a + bytes[index]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function createPngChunk(type, data = new Uint8Array()) {
  const typeBytes = new TextEncoder().encode(type);
  const crcInput = concatUint8Arrays([typeBytes, data]);
  return concatUint8Arrays([
    encodeUInt32Be(data.length),
    typeBytes,
    data,
    encodeUInt32Be(crc32(crcInput))
  ]);
}

function zlibStore(bytes) {
  const chunks = [new Uint8Array([0x78, 0x01])];
  for (let offset = 0; offset < bytes.length; offset += 65535) {
    const length = Math.min(65535, bytes.length - offset);
    const final = offset + length >= bytes.length ? 1 : 0;
    const nlen = (~length) & 0xffff;
    chunks.push(new Uint8Array([
      final,
      length & 0xff,
      (length >>> 8) & 0xff,
      nlen & 0xff,
      (nlen >>> 8) & 0xff
    ]));
    chunks.push(bytes.subarray(offset, offset + length));
  }
  chunks.push(encodeUInt32Be(adler32(bytes)));
  return concatUint8Arrays(chunks);
}

function encodePngRgb(surface) {
  const scanlineLength = surface.width * 3 + 1;
  const raw = new Uint8Array(scanlineLength * surface.height);
  for (let row = 0; row < surface.height; row += 1) {
    const rawOffset = row * scanlineLength;
    raw[rawOffset] = 0;
    raw.set(
      surface.pixels.subarray(row * surface.width * 3, (row + 1) * surface.width * 3),
      rawOffset + 1
    );
  }

  const ihdr = new Uint8Array(13);
  ihdr.set(encodeUInt32Be(surface.width), 0);
  ihdr.set(encodeUInt32Be(surface.height), 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return concatUint8Arrays([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    createPngChunk('IHDR', ihdr),
    createPngChunk('IDAT', zlibStore(raw)),
    createPngChunk('IEND')
  ]);
}

function drawShareCardMetric(surface, label, value, x, y, width) {
  drawShareCardText(surface, label, x, y, {
    scale: 4,
    color: SHARE_CARD_COLORS.muted,
    letterSpacing: 1
  });
  const valueText = truncateShareCardText(value, width, 7, 1);
  drawShareCardText(surface, valueText, x, y + 44, {
    scale: 7,
    color: SHARE_CARD_COLORS.text,
    letterSpacing: 1
  });
}

function buildCampaignShareCardFallbackPng({ env, campaign, stats, effectiveState, isFunded, preferredLang }) {
  const surface = createShareCardSurface();
  const messages = getShareCardMessages(preferredLang);
  const publicSiteBase = String(env?.CANONICAL_SITE_BASE || env?.SITE_BASE || '').replace(/\/$/, '');
  const canonicalCampaignPath = String(campaign?.url || `/campaigns/${encodeURIComponent(campaign?.slug || '')}/`);
  const campaignPath = getLocalizedPath(canonicalCampaignPath, preferredLang);
  const campaignUrlLabel = `${publicSiteBase}${campaignPath}`.replace(/^https?:\/\//, '');
  const pledgedAmount = Number(stats?.pledgedAmount || 0);
  const goalAmountCents = Number(campaign?.goal_amount || 0) * 100;
  const progressPct = goalAmountCents > 0
    ? Math.max(0, Math.min(100, Math.round((pledgedAmount / goalAmountCents) * 100)))
    : 0;
  const title = campaign?.title || campaign?.slug || 'Campaign';
  const creator = campaign?.creator_name || 'The Pool';
  const category = campaign?.category || 'Campaign';
  const blurb = stripHtmlTags(campaign?.short_blurb || '');

  let badgeText = messages.campaign;
  if (effectiveState === 'upcoming') {
    badgeText = `${messages.starts} ${formatSvgDate(campaign?.start_date)}`;
  } else if (effectiveState === 'live') {
    badgeText = `${messages.ends} ${formatSvgDate(campaign?.goal_deadline)}`;
  } else if (isFunded) {
    badgeText = messages.funded;
  } else {
    badgeText = messages.ended;
  }

  fillShareCardRect(surface, 48, 52, 1104, 526, SHARE_CARD_COLORS.surface);
  strokeShareCardRect(surface, 48, 52, 1104, 526, SHARE_CARD_COLORS.border, 3);
  fillShareCardRect(surface, 48, 52, 14, 526, SHARE_CARD_COLORS.fill);
  fillShareCardRect(surface, 90, 498, 800, 24, SHARE_CARD_COLORS.soft);
  fillShareCardRect(surface, 90, 498, Math.max(16, Math.round(800 * (progressPct / 100))), 24, SHARE_CARD_COLORS.fill);

  drawShareCardText(surface, `${messages.creator}: ${creator}`, 90, 96, {
    scale: 4,
    color: SHARE_CARD_COLORS.muted,
    letterSpacing: 1
  });
  drawShareCardText(surface, `${messages.category}: ${category}`, 90, 138, {
    scale: 4,
    color: SHARE_CARD_COLORS.muted,
    letterSpacing: 1
  });

  const titleLines = wrapShareCardText(title, 700, { scale: 11, maxLines: 2, letterSpacing: 1 });
  drawShareCardTextLines(surface, titleLines, 90, 204, {
    scale: 11,
    lineHeight: 92,
    color: SHARE_CARD_COLORS.text,
    letterSpacing: 1
  });

  const blurbTop = titleLines.length > 1 ? 388 : 322;
  const blurbLines = wrapShareCardText(blurb, 720, { scale: 5, maxLines: 3, letterSpacing: 1 });
  drawShareCardTextLines(surface, blurbLines, 90, blurbTop, {
    scale: 5,
    lineHeight: 46,
    color: SHARE_CARD_COLORS.fillSoft,
    letterSpacing: 1
  });

  drawShareCardText(surface, `${formatSvgCurrencyFromCents(pledgedAmount)} ${messages.of} ${formatSvgCurrencyFromCents(goalAmountCents)}`, 90, 548, {
    scale: 5,
    color: SHARE_CARD_COLORS.text,
    letterSpacing: 1
  });

  fillShareCardRect(surface, 920, 96, 178, 50, SHARE_CARD_COLORS.fill);
  drawShareCardText(surface, truncateShareCardText(badgeText, 142, 4, 1), 946, 112, {
    scale: 4,
    color: SHARE_CARD_COLORS.surface,
    letterSpacing: 1
  });

  drawShareCardMetric(surface, 'PROGRESS', `${progressPct}%`, 920, 196, 180);
  drawShareCardMetric(surface, 'PLEDGED', formatSvgCurrencyFromCents(pledgedAmount), 920, 318, 180);
  drawShareCardMetric(surface, 'GOAL', formatSvgCurrencyFromCents(goalAmountCents), 920, 440, 180);

  drawShareCardText(surface, `${progressPct}% ${messages.fundedPercent}`, 910, 548, {
    scale: 4,
    color: SHARE_CARD_COLORS.muted,
    letterSpacing: 1
  });
  drawShareCardText(surface, truncateShareCardText(campaignUrlLabel, 420, 3, 1), 90, 586, {
    scale: 3,
    color: SHARE_CARD_COLORS.muted,
    letterSpacing: 1
  });

  return encodePngRgb(surface);
}

let shareCardRasterizerInputPromise;
let shareCardRasterizerInitPromise;
let shareCardFontBuffersPromise;

function shouldLoadResvgWasmFromFileSystem() {
  return typeof process !== 'undefined'
    && Boolean(process?.versions?.node)
    && typeof globalThis.WebSocketPair === 'undefined'
    && !String(globalThis.navigator?.userAgent || '').includes('Cloudflare-Workers');
}

async function getShareCardRasterizerInput() {
  if (!shareCardRasterizerInputPromise) {
    shareCardRasterizerInputPromise = (async () => {
      if (shouldLoadResvgWasmFromFileSystem()) {
        const { readFile } = await import('node:fs/promises');
        return readFile(`${process.cwd()}/worker/node_modules/@resvg/resvg-wasm/index_bg.wasm`);
      }
      const wasmModule = await import('@resvg/resvg-wasm/index_bg.wasm');
      return wasmModule.default || wasmModule;
    })();
  }
  return shareCardRasterizerInputPromise;
}

async function normalizeBinaryModuleData(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof Response) {
    return new Uint8Array(await value.arrayBuffer());
  }
  if (typeof value === 'string' || value instanceof URL || value instanceof Request) {
    const response = await fetch(value);
    if (!response.ok) throw new Error(`Unable to load share-card font module: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }
  return value;
}

async function getShareCardFontBuffers() {
  if (!shareCardFontBuffersPromise) {
    shareCardFontBuffersPromise = (async () => {
      if (shouldLoadResvgWasmFromFileSystem()) {
        const { readFile } = await import('node:fs/promises');
        const [romanFont, italicFont] = await Promise.all([
          readFile(`${process.cwd()}/worker/src/assets/fonts/inter-roman.bin`),
          readFile(`${process.cwd()}/worker/src/assets/fonts/inter-italic.bin`)
        ]);
        return [
          new Uint8Array(romanFont),
          new Uint8Array(italicFont)
        ];
      }
      const [romanFontModule, italicFontModule] = await Promise.all([
        import('./assets/fonts/inter-roman.bin'),
        import('./assets/fonts/inter-italic.bin')
      ]);
      return Promise.all([
        normalizeBinaryModuleData(romanFontModule.default || romanFontModule),
        normalizeBinaryModuleData(italicFontModule.default || italicFontModule)
      ]);
    })();
  }
  return shareCardFontBuffersPromise;
}

async function ensureShareCardRasterizer() {
  if (!shareCardRasterizerInitPromise) {
    shareCardRasterizerInitPromise = initWasm(getShareCardRasterizerInput()).catch((error) => {
      shareCardRasterizerInitPromise = null;
      throw error;
    });
  }
  return shareCardRasterizerInitPromise;
}

async function rasterizeShareCardSvg(svg) {
  await ensureShareCardRasterizer();
  const fontBuffers = await getShareCardFontBuffers();
  const renderer = new Resvg(svg, {
    fitTo: { mode: 'original' },
    font: {
      fontBuffers,
      defaultFontFamily: 'Inter',
      sansSerifFamily: 'Inter'
    },
    shapeRendering: 2,
    textRendering: 1,
    imageRendering: 0
  });

  try {
    const rendered = renderer.render();
    try {
      return rendered.asPng();
    } finally {
      rendered.free();
    }
  } finally {
    renderer.free();
  }
}

async function buildCampaignShareCardPng(options) {
  const svg = await buildCampaignShareCardSvg(options);
  try {
    return await rasterizeShareCardSvg(svg);
  } catch (error) {
    console.warn('Share-card SVG rasterization failed; using fallback PNG renderer', error);
    return buildCampaignShareCardFallbackPng(options);
  }
}

// SEC-006: Timing-safe string comparison to prevent timing attacks
function timingSafeEqual(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
  }

function getSiteOrigin(env) {
  try {
    return new URL(String(env?.SITE_BASE || '')).origin;
  } catch {
    return '';
  }
}

function normalizePreferredLang(value, fallback = DEFAULT_I18N_LANG) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(normalized) ? normalized : fallback;
}

function getLocalizedPath(path, preferredLang = DEFAULT_I18N_LANG) {
  const lang = normalizePreferredLang(preferredLang);
  const normalizedPath = String(path || '/').startsWith('/') ? String(path || '/') : `/${String(path || '')}`;
  return lang === DEFAULT_I18N_LANG ? normalizedPath : `/${lang}${normalizedPath}`;
}

function getLocalizedSiteUrl(env, path, preferredLang = DEFAULT_I18N_LANG) {
  return `${String(env.SITE_BASE || '').replace(/\/+$/, '')}${getLocalizedPath(path, preferredLang)}`;
}

function getTestFixtureOrderId(email = 'test@example.com', campaignSlug = 'hand-relations') {
  const normalizedEmail = String(email || '')
    .trim()
    .toLowerCase();
  const normalizedCampaignSlug = String(campaignSlug || '')
    .trim()
    .toLowerCase();

  if (
    normalizedEmail === 'test@example.com' &&
    normalizedCampaignSlug === 'hand-relations'
  ) {
    return 'test-order-active-1';
  }

  const safeEmail = normalizedEmail
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'test';
  const safeCampaignSlug = normalizedCampaignSlug
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'campaign';

  return `test-order-${safeCampaignSlug}-${safeEmail}`;
}

function isTrustedSiteOriginRequest(request, env) {
  const expectedOrigin = getSiteOrigin(env);
  if (!expectedOrigin) return true;

  const secFetchSite = String(request.headers.get('Sec-Fetch-Site') || '').trim().toLowerCase();
  if (secFetchSite === 'cross-site') {
    return false;
  }

  const origin = String(request.headers.get('Origin') || '').trim();
  if (origin) {
    return timingSafeEqual(origin, expectedOrigin);
  }

  const referer = String(request.headers.get('Referer') || '').trim();
  if (!referer) {
    return true;
  }

  try {
    return timingSafeEqual(new URL(referer).origin, expectedOrigin);
  } catch {
    return false;
  }
}

function requireTrustedSiteOrigin(request, env) {
  if (isTrustedSiteOriginRequest(request, env)) {
    return { ok: true };
  }

  return {
    ok: false,
    response: privateJsonResponse({ error: 'Origin not allowed' }, 403, env)
  };
}

  // Campaign pledge index helpers - maintain per-campaign list of order IDs
  function getCampaignIndexKey(campaignSlug) {
  return `campaign-pledges:${campaignSlug}`;
  }

  async function getCampaignOrderIds(env, campaignSlug) {
  if (!env.PLEDGES) return null;
  const orderIds = await env.PLEDGES.get(getCampaignIndexKey(campaignSlug), { type: 'json' });
  return Array.isArray(orderIds) ? orderIds : null;
  }

  async function addToCampaignIndex(env, campaignSlug, orderId) {
  if (!env.PLEDGES) return;
  const key = getCampaignIndexKey(campaignSlug);
  const index = await getCampaignOrderIds(env, campaignSlug) || [];
  if (!index.includes(orderId)) {
   index.push(orderId);
   await env.PLEDGES.put(key, JSON.stringify(index));
  }
  }

  async function removeFromCampaignIndex(env, campaignSlug, orderId) {
  if (!env.PLEDGES) return;
  const key = getCampaignIndexKey(campaignSlug);
  const index = await getCampaignOrderIds(env, campaignSlug) || [];
  const filtered = index.filter(id => id !== orderId);
  if (filtered.length === index.length) {
    return;
  }
  if (filtered.length === 0) {
    await env.PLEDGES.delete(key);
    return;
  }
  await env.PLEDGES.put(key, JSON.stringify(filtered));
  }

  async function listAllPledgeKeys(env) {
  if (!env.PLEDGES) return [];
  const keys = [];
  let cursor = undefined;
  do {
    const page = await env.PLEDGES.list({ prefix: 'pledge:', cursor });
    keys.push(...(page.keys || []));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return keys;
  }

function getSettlementNeedsAttention(batchResult = {}) {
  const details = Array.isArray(batchResult.details) ? batchResult.details : [];
  const skippedNeedingAttention = details.filter(detail =>
    detail?.status === 'not_found' || detail?.status === 'missing_stripe_ids'
  ).length;
  return {
    skippedNeedingAttention,
    unresolved: (batchResult.failed || 0) + skippedNeedingAttention
  };
  }

function getAppMode(env = {}) {
  return String(env.APP_MODE || 'live').trim().toLowerCase() === 'test'
    ? 'test'
    : 'live';
}

  async function finalizeSettlementDispatch(env, campaignSlug, jobKey, job) {
  const needsAttention = (job.totalNeedsAttention || 0) > 0;
  job.status = needsAttention ? 'needs_attention' : 'done';
  job.completedAt = Date.now();
  await env.PLEDGES.put(jobKey, JSON.stringify(job), { expirationTtl: 604800 });
  if (!needsAttention) {
    await env.PLEDGES.put(`campaign-charged:${campaignSlug}`, new Date().toISOString());
  }
  return { needsAttention };
  }

  // SEC-005: Rate limiting helper
// Returns { allowed: true } or { allowed: false, response: Response }
async function checkRateLimit(request, env, options = {}) {
  const {
    prefix = 'ratelimit',
    limit = 60,
    windowSeconds = 60,
    keyFn = null,
    privateResponse: usePrivateResponse = false
  } = options;

  const rateLimitResponse = (data, status = 429, headers = {}) => {
    const responseHeaders = {
      ...headers
    };
    return usePrivateResponse
      ? privateJsonResponse(data, status, env, responseHeaders)
      : jsonResponse(data, status, env, false, responseHeaders);
  };
  
  if (!env.RATELIMIT) {
    return {
      allowed: false,
      response: rateLimitResponse({ error: RATELIMIT_REQUIRED_ERROR }, 503)
    };
  }
  
  const ip = request.headers.get('CF-Connecting-IP') || 
             request.headers.get('X-Forwarded-For')?.split(',')[0] || 
             'unknown';
  const key = keyFn ? `${prefix}:${keyFn(request)}` : `${prefix}:${ip}`;
  
  try {
    const now = Math.floor(Date.now() / 1000);
    const record = await env.RATELIMIT.get(key, { type: 'json' }) || { count: 0, reset: now + windowSeconds };
    
    // Reset window if expired
    if (now > record.reset) {
      record.count = 0;
      record.reset = now + windowSeconds;
    }

    // Once a client is already over limit inside the current window,
    // fail closed without rewriting the same counter on every blocked hit.
    if (record.count >= limit) {
      const retryAfter = Math.max(0, record.reset - now);
      return {
        allowed: false,
        response: rateLimitResponse({
          error: 'Too many requests',
          retryAfter
        }, 429, {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(record.reset)
        })
      };
    }
    
    record.count++;
    
    // Store updated count
    await env.RATELIMIT.put(key, JSON.stringify(record), { 
      expirationTtl: windowSeconds + 10 
    });
    
    if (record.count > limit) {
      const retryAfter = record.reset - now;
      return {
        allowed: false,
        response: rateLimitResponse({
          error: 'Too many requests',
          retryAfter 
        }, 429, {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(record.reset)
        })
      };
    }
    
    return { 
      allowed: true,
      remaining: limit - record.count,
      reset: record.reset
    };
  } catch (err) {
    console.error('Rate limit check failed:', err);
    return {
      allowed: false,
      response: rateLimitResponse({ error: 'Rate limiting unavailable' }, 503)
    };
  }
}

function getRequestContentLength(request) {
  const raw = request.headers.get('Content-Length');
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function requestHasJsonContentType(request) {
  const contentType = String(request.headers.get('Content-Type') || '').trim().toLowerCase();
  return contentType === 'application/json' || contentType.startsWith('application/json;');
}

function requireBodySizeWithinLimit(request, env, maxBytes, { privateResponse: usePrivateResponse = false } = {}) {
  const contentLength = getRequestContentLength(request);
  if (contentLength === null || contentLength <= maxBytes) {
    return { ok: true };
  }

  const response = usePrivateResponse
    ? privateJsonResponse({ error: 'Request body too large' }, 413, env)
    : jsonResponse({ error: 'Request body too large' }, 413, env);

  return {
    ok: false,
    response
  };
}

async function readRequestTextWithinLimit(request, env, maxBytes, { privateResponse: usePrivateResponse = false } = {}) {
  const contentLengthCheck = requireBodySizeWithinLimit(request, env, maxBytes, { privateResponse: usePrivateResponse });
  if (!contentLengthCheck.ok) {
    return contentLengthCheck;
  }

  if (!request.body) {
    return { ok: true, text: '' };
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      const response = usePrivateResponse
        ? privateJsonResponse({ error: 'Request body too large' }, 413, env)
        : jsonResponse({ error: 'Request body too large' }, 413, env);
      return { ok: false, response };
    }
    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return { ok: true, text };
}

async function parseJsonRequestBody(request, env, {
  maxBytes = MAX_STANDARD_JSON_BODY_BYTES,
  privateResponse: usePrivateResponse = false,
  emptyValue = null
} = {}) {
  if (!requestHasJsonContentType(request)) {
    const response = usePrivateResponse
      ? privateJsonResponse({ error: 'Expected application/json request body' }, 415, env)
      : jsonResponse({ error: 'Expected application/json request body' }, 415, env);
    return { ok: false, response };
  }

  const textResult = await readRequestTextWithinLimit(request, env, maxBytes, { privateResponse: usePrivateResponse });
  if (!textResult.ok) {
    return textResult;
  }

  const text = String(textResult.text || '');
  if (text.trim() === '') {
    return { ok: true, body: emptyValue };
  }

  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    const response = usePrivateResponse
      ? privateJsonResponse({ error: 'Invalid JSON' }, 400, env)
      : jsonResponse({ error: 'Invalid JSON' }, 400, env);
    return { ok: false, response };
  }
}

async function parseOptionalJsonRequestBody(request, env, {
  maxBytes = MAX_STANDARD_JSON_BODY_BYTES,
  privateResponse: usePrivateResponse = false,
  emptyValue = null
} = {}) {
  const textResult = await readRequestTextWithinLimit(request, env, maxBytes, { privateResponse: usePrivateResponse });
  if (!textResult.ok) {
    return textResult;
  }

  const text = String(textResult.text || '');
  if (text.trim() === '') {
    return { ok: true, body: emptyValue };
  }

  if (!requestHasJsonContentType(request)) {
    const response = usePrivateResponse
      ? privateJsonResponse({ error: 'Expected application/json request body' }, 415, env)
      : jsonResponse({ error: 'Expected application/json request body' }, 415, env);
    return { ok: false, response };
  }

  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    const response = usePrivateResponse
      ? privateJsonResponse({ error: 'Invalid JSON' }, 400, env)
      : jsonResponse({ error: 'Invalid JSON' }, 400, env);
    return { ok: false, response };
  }
}

function getObservabilityDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getObservabilitySummaryKey(kind, dateKey = getObservabilityDateKey()) {
  return `observability:${kind}:${dateKey}`;
}

function getObservabilityRecentKey(kind) {
  return `observability:${kind}:recent`;
}

function clampObservabilityDays(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 2;
  return Math.min(OBSERVABILITY_MAX_DAYS, parsed);
}

function getObservabilityDateKeys(days = 2) {
  const clampedDays = clampObservabilityDays(days);
  const keys = [];
  const now = new Date();
  for (let i = 0; i < clampedDays; i++) {
    const date = new Date(now);
    date.setUTCDate(now.getUTCDate() - i);
    keys.push(getObservabilityDateKey(date));
  }
  return keys;
}

function bucketStatusCode(status) {
  const numericStatus = Number.parseInt(String(status || ''), 10);
  if (!Number.isFinite(numericStatus) || numericStatus <= 0) return 'unknown';
  return `${Math.floor(numericStatus / 100)}xx`;
}

function updateDurationStats(target, durationMs) {
  const safeDuration = Math.max(0, Number(durationMs) || 0);
  target.count = (target.count || 0) + 1;
  target.totalMs = (target.totalMs || 0) + safeDuration;
  target.maxMs = Math.max(target.maxMs || 0, safeDuration);
  target.minMs = target.count === 1
    ? safeDuration
    : Math.min(Number(target.minMs ?? safeDuration), safeDuration);
  target.lastMs = safeDuration;
}

function finalizeDurationStats(target = {}) {
  const count = Number(target.count || 0);
  const totalMs = Number(target.totalMs || 0);
  return {
    count,
    totalMs,
    avgMs: count > 0 ? Number((totalMs / count).toFixed(2)) : 0,
    minMs: count > 0 ? Number(target.minMs || 0) : 0,
    maxMs: Number(target.maxMs || 0),
    lastMs: Number(target.lastMs || 0)
  };
}

function getObservabilitySampleRate(env = {}) {
  const raw = env.OBSERVABILITY_SAMPLE_RATE ?? env.PERFORMANCE_SAMPLE_RATE ?? DEFAULT_OBSERVABILITY_SAMPLE_RATE;
  const parsed = Number.parseFloat(String(raw));
  if (!Number.isFinite(parsed)) return DEFAULT_OBSERVABILITY_SAMPLE_RATE;
  return Math.min(1, Math.max(0, parsed));
}

function truncateObservabilityValue(value, maxLength = 120) {
  const stringValue = String(value ?? '').trim();
  if (!stringValue) return '';
  return stringValue.length > maxLength
    ? `${stringValue.slice(0, maxLength - 1)}…`
    : stringValue;
}

function queueBackgroundTask(ctx, task, label = 'background task') {
  const guardedTask = Promise.resolve(task).catch((err) => {
    console.error(`${label} failed:`, err?.message || err);
  });
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(guardedTask);
    return;
  }
  guardedTask.catch(() => {});
}

async function updateObservabilitySummary(env, kind, updateFn) {
  if (!env.PLEDGES) return null;
  const dateKey = getObservabilityDateKey();
  const key = getObservabilitySummaryKey(kind, dateKey);
  const summary = await env.PLEDGES.get(key, { type: 'json' }) || {
    kind,
    date: dateKey,
    createdAt: new Date().toISOString(),
    updatedAt: null
  };
  const next = updateFn(summary) || summary;
  next.kind = kind;
  next.date = dateKey;
  next.updatedAt = new Date().toISOString();
  await env.PLEDGES.put(key, JSON.stringify(next), {
    expirationTtl: OBSERVABILITY_RETENTION_SECONDS
  });
  return next;
}

async function appendObservabilityRecentEvent(env, kind, entry) {
  if (!env.PLEDGES) return;
  const key = getObservabilityRecentKey(kind);
  const recent = await env.PLEDGES.get(key, { type: 'json' }) || [];
  const normalizedEntry = {
    recordedAt: new Date().toISOString(),
    ...entry
  };
  const next = [normalizedEntry, ...recent].slice(0, OBSERVABILITY_RECENT_EVENT_LIMIT);
  await env.PLEDGES.put(key, JSON.stringify(next), {
    expirationTtl: OBSERVABILITY_RETENTION_SECONDS
  });
}

async function recordWebhookObservation(env, observation = {}) {
  if (!env.PLEDGES) return;
  const {
    outcome = 'unknown',
    eventId = '',
    eventType = 'unknown',
    orderId = '',
    status = 0,
    durationMs = 0
  } = observation;

  await updateObservabilitySummary(env, 'webhook', (summary) => {
    summary.received = Number(summary.received || 0) + 1;
    summary.outcomes = summary.outcomes || {};
    summary.outcomes[outcome] = Number(summary.outcomes[outcome] || 0) + 1;
    summary.statusCounts = summary.statusCounts || {};
    const statusBucket = bucketStatusCode(status);
    summary.statusCounts[statusBucket] = Number(summary.statusCounts[statusBucket] || 0) + 1;
    summary.eventTypes = summary.eventTypes || {};
    const normalizedEventType = truncateObservabilityValue(eventType || 'unknown', 80) || 'unknown';
    const eventTypeSummary = summary.eventTypes[normalizedEventType] || {
      received: 0,
      outcomes: {}
    };
    eventTypeSummary.received += 1;
    eventTypeSummary.outcomes[outcome] = Number(eventTypeSummary.outcomes[outcome] || 0) + 1;
    summary.eventTypes[normalizedEventType] = eventTypeSummary;
    summary.durations = summary.durations || {};
    updateDurationStats(summary.durations, durationMs);
    return summary;
  });

  await appendObservabilityRecentEvent(env, 'webhook', {
    outcome,
    eventId: truncateObservabilityValue(eventId, 80),
    eventType: truncateObservabilityValue(eventType || 'unknown', 80) || 'unknown',
    orderId: truncateObservabilityValue(orderId, 80),
    status: Number(status || 0),
    durationMs: Math.max(0, Number(durationMs) || 0)
  });
}

async function recordPerformanceObservation(env, observation = {}) {
  if (!env.PLEDGES) return;
  const {
    operation = 'unknown',
    status = 0,
    durationMs = 0
  } = observation;

  await updateObservabilitySummary(env, 'performance', (summary) => {
    summary.sampleRate = getObservabilitySampleRate(env);
    summary.operations = summary.operations || {};
    const normalizedOperation = truncateObservabilityValue(operation || 'unknown', 80) || 'unknown';
    const operationSummary = summary.operations[normalizedOperation] || {
      count: 0,
      totalMs: 0,
      minMs: 0,
      maxMs: 0,
      lastMs: 0,
      statusCounts: {}
    };
    updateDurationStats(operationSummary, durationMs);
    const statusBucket = bucketStatusCode(status);
    operationSummary.statusCounts[statusBucket] = Number(operationSummary.statusCounts[statusBucket] || 0) + 1;
    summary.operations[normalizedOperation] = operationSummary;
    return summary;
  });
}

function maybeRecordPerformanceObservation(env, ctx, operation, startedAt, response) {
  const sampleRate = getObservabilitySampleRate(env);
  if (sampleRate <= 0 || Math.random() > sampleRate) {
    return response;
  }

  queueBackgroundTask(
    ctx,
    recordPerformanceObservation(env, {
      operation,
      status: response?.status || 0,
      durationMs: Date.now() - startedAt
    }),
    `performance observation (${operation})`
  );
  return response;
}

async function withObservedOperation(env, ctx, operation, fn) {
  const startedAt = Date.now();
  const response = await fn();
  return maybeRecordPerformanceObservation(env, ctx, operation, startedAt, response);
}

async function listObservabilitySummaries(env, kind, days = 2) {
  if (!env.PLEDGES) return [];

  const summaries = [];
  for (const dateKey of getObservabilityDateKeys(days)) {
    const summary = await env.PLEDGES.get(getObservabilitySummaryKey(kind, dateKey), { type: 'json' });
    if (!summary) continue;

    if (kind === 'performance') {
      const operations = {};
      for (const [operation, entry] of Object.entries(summary.operations || {})) {
        operations[operation] = {
          ...finalizeDurationStats(entry),
          statusCounts: entry?.statusCounts || {}
        };
      }
      summaries.push({
        date: summary.date,
        updatedAt: summary.updatedAt,
        sampleRate: summary.sampleRate ?? getObservabilitySampleRate(env),
        operations
      });
      continue;
    }

    summaries.push({
      date: summary.date,
      updatedAt: summary.updatedAt,
      received: Number(summary.received || 0),
      outcomes: summary.outcomes || {},
      statusCounts: summary.statusCounts || {},
      eventTypes: summary.eventTypes || {},
      durations: finalizeDurationStats(summary.durations || {})
    });
  }

  return summaries;
}

async function getObservabilityRecentEvents(env, kind) {
  if (!env.PLEDGES) return [];
  return await env.PLEDGES.get(getObservabilityRecentKey(kind), { type: 'json' }) || [];
}

// Rate limit configurations for different endpoint types
const RATE_LIMITS = {
  start: { prefix: 'rl:start', limit: 40, windowSeconds: 60 },          // 40 checkout starts/min/IP
  shipping: { prefix: 'rl:shipping', limit: 90, windowSeconds: 60 },    // 90 quote refreshes/min/IP
  tax: { prefix: 'rl:tax', limit: 90, windowSeconds: 60 },              // 90 tax quote refreshes/min/IP
  complete: { prefix: 'rl:complete', limit: 12, windowSeconds: 60 },    // 12 recovery attempts/min/order
  abandon: { prefix: 'rl:abandon', limit: 12, windowSeconds: 60 },      // 12 abandon attempts/min/order
  votes: { prefix: 'rl:votes', limit: 45, windowSeconds: 60 },          // 45 vote reads/writes/min/IP
  admin: { prefix: 'rl:admin', limit: 5, windowSeconds: 60 },       // 5 admin calls/min
  pledgeRead: { prefix: 'rl:pledge-read', limit: 120, windowSeconds: 60 },   // 120 manage reads/min/IP
  pledgeWrite: { prefix: 'rl:pledge-write', limit: 30, windowSeconds: 60 }   // 30 manage mutations/min/IP
};

const ADMIN_RATE_LIMIT_OPTIONS = {
  ...RATE_LIMITS.admin,
  privateResponse: true
};

// SEC-006: Admin authentication helper with timing-safe comparison
function requireAdmin(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const adminKey = request.headers.get('x-admin-key') || '';
  
  if (!env.ADMIN_SECRET) {
    console.error('CRITICAL: ADMIN_SECRET not configured');
    return { ok: false, response: jsonResponse({ error: 'Admin not configured' }, 500) };
  }
  
  // Check Bearer token in Authorization header
  const bearerToken = authHeader.replace('Bearer ', '');
  if (bearerToken && timingSafeEqual(bearerToken, env.ADMIN_SECRET)) {
    return { ok: true };
  }
  
  // Check x-admin-key header
  if (adminKey && timingSafeEqual(adminKey, env.ADMIN_SECRET)) {
    return { ok: true };
  }
  
  return { ok: false, response: jsonResponse({ error: 'Unauthorized' }, 401) };
}

// Mountain Time offset: -7 hours (MST) or -6 hours (MDT)
// Returns deadline as end of day (23:59:59) in Mountain Time, DST-aware
function getMTOffset(dateString) {
  // Use Intl to determine if a date falls in MST (-7) or MDT (-6)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    timeZoneName: 'short'
  });
  // Check the target date at noon to avoid edge cases
  const [year, month, day] = dateString.split('-').map(Number);
  const parts = fmt.formatToParts(new Date(Date.UTC(year, month - 1, day, 19, 0, 0))); // noon MT ≈ 19:00 UTC
  const tzName = parts.find(p => p.type === 'timeZoneName')?.value;
  return tzName === 'MDT' ? 6 : 7;
}

function getDeadlineMT(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const offset = getMTOffset(dateString);
  // End of day in MT = 23:59:59 MT = next day (23+offset):59:59 UTC
  return new Date(Date.UTC(year, month - 1, day, 23 + offset, 59, 59));
}

// Check if we're past the deadline in Mountain Time
function isDeadlinePassed(dateString) {
  const deadline = getDeadlineMT(dateString);
  return new Date() > deadline;
}

function getMountainTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return {
    year: Number(map.year || 0) || 0,
    month: Number(map.month || 0) || 0,
    day: Number(map.day || 0) || 0,
    hour: Number(map.hour || 0) || 0,
    minute: Number(map.minute || 0) || 0
  };
}

function getMountainDateKey(date = new Date()) {
  const parts = getMountainTimeParts(date);
  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0')
  ].join('-');
}

function formatCampaignRunnerReportDateLabel(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date) + ' MT';
}

function formatUsdCents(cents = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format((Number(cents || 0) || 0) / 100);
}

function countRecentCampaignPledges(pledges = [], now = new Date(), windowMs = 24 * 60 * 60 * 1000) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) {
    return 0;
  }

  return (pledges || []).filter((pledge) => {
    const createdAtMs = new Date(pledge?.createdAt || 0).getTime();
    return Number.isFinite(createdAtMs) && createdAtMs >= (nowMs - windowMs) && createdAtMs <= nowMs;
  }).length;
}

function formatDeadlineCountdown(dateString, now = new Date()) {
  if (!dateString) {
    return '';
  }

  const deadline = getDeadlineMT(dateString);
  const diffMs = deadline.getTime() - now.getTime();
  const absDiffMs = Math.abs(diffMs);
  const totalHours = Math.floor(absDiffMs / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const dayLabel = `${days} day${days === 1 ? '' : 's'}`;
  const hourLabel = `${hours} hour${hours === 1 ? '' : 's'}`;

  if (diffMs >= 0) {
    return `${dayLabel}, ${hourLabel} left until deadline`;
  }

  return `Deadline passed ${dayLabel}, ${hourLabel} ago`;
}

function getDaysUntilDeadline(dateString, now = new Date()) {
  if (!dateString) {
    return null;
  }
  const diffMs = getDeadlineMT(dateString).getTime() - now.getTime();
  return diffMs / (24 * 60 * 60 * 1000);
}

function buildCampaignRunnerEncouragement(campaign, reportKind, pledges = [], now = new Date()) {
  const normalizedReportKind = String(reportKind || '').trim().toLowerCase();

  if (normalizedReportKind.includes('fulfillment report')) {
    const effectiveState = getEffectiveState(campaign) || campaign?.state || 'unknown';
    const deadlineLine = campaign?.goal_deadline
      ? formatDeadlineCountdown(campaign.goal_deadline, now)
      : null;

    return {
      title: 'Fulfillment note',
      intro: `**Communication above everything.** Delivery timing matters, but supporters stay with you when they understand what is happening and can see that you are still moving.`,
      tips: [
        'If anything slips, **announce it within 48-72 hours of knowing**. Silence damages trust faster than a realistic delay.',
        'Be **specific and honest** about the cause, the fix, and the next update date. A concrete plan beats a vague apology every time.',
        'Set a **realistic timeline with buffer**, then stay visible with regular updates until every item is fulfilled.'
      ],
      closing: effectiveState === 'post' && deadlineLine
        ? `Supporters are usually patient when communication is clear. ${deadlineLine}, so now is the time to keep fulfillment **predictable, visible, and human**.`
        : 'Trust is the real deliverable here. Consistent updates, realistic dates, and quick replies are what keep supporters on your side.'
    };
  }

  if (reportKind !== 'Daily pledge report') {
    return null;
  }

  const effectiveState = getEffectiveState(campaign) || campaign?.state || 'unknown';
  const newPledgesLast24Hours = countRecentCampaignPledges(pledges, now);
  const daysUntilDeadline = getDaysUntilDeadline(campaign?.goal_deadline, now);
  const recentMomentumLine = newPledgesLast24Hours > 0
    ? `You picked up **${newPledgesLast24Hours} new pledge${newPledgesLast24Hours === 1 ? '' : 's'}** in the previous 24 hours, which is a strong prompt to give people one more fresh reason to pay attention today.`
    : 'If momentum feels quiet right now, that is normal. The middle stretch of a campaign is rarely won by repeating the launch ask; it is won by giving people **something new to care about**.';

  if (effectiveState === 'live' && daysUntilDeadline !== null && daysUntilDeadline <= 5) {
    return {
      title: 'Momentum note',
      intro: `Most campaigns get their biggest natural surges at **launch** and **close**. You are in one of those windows now. ${recentMomentumLine}`,
      tips: [
        '**Follow up** with people who already heard from you but have not replied yet, and be specific about what is left to raise and when the campaign ends.',
        'Increase campaign updates with **something worth clicking and sharing**, like a candid video, a new image, or a behind-the-scenes story beat.',
        'Give the team **one focused push today**: personal outreach, a limited-time reason to act now, or a matching-contribution style moment.'
      ],
      closing: 'Fresh stories and direct follow-up are often what turn *last-minute attention* into **real momentum**.'
    };
  }

  if (effectiveState === 'live' && campaign?.start_date) {
    const startDate = new Date(`${campaign.start_date}T00:00:00Z`);
    const daysSinceStart = (now.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000);
    if (Number.isFinite(daysSinceStart) && daysSinceStart <= 5) {
      return {
        title: 'Momentum note',
        intro: `Most campaigns naturally spike at **launch** and **close**. Early on, the job is not to say the same thing louder. It is to keep giving people **fresh proof that the campaign is alive**. ${recentMomentumLine}`,
        tips: [
          'Send **short personal outreach in small batches** instead of emailing everyone at once, so new visitors see visible activity when they land.',
          'Post campaign updates that are **worth opening**, not just funding totals. Supporters stay engaged when they get story, texture, and something shareable.',
          'Celebrate the next visible milestone early so supporters feel **progress before the finish line**.'
        ],
        closing: '**New information** and visible movement are what keep launch energy from fading too fast.'
      };
    }
  }

  if (effectiveState === 'post') {
    return {
      title: 'Momentum note',
      intro: 'Campaigns usually surge at **launch** and **close**, but the real lesson lives in what kept people listening between those moments.',
      tips: [
        'Review which updates, outreach, and story beats **created movement**, then reuse those patterns for your next launch or final-week push.',
        'The strongest campaigns keep giving supporters **new things to say, share, and celebrate** instead of repeating the same ask for weeks.',
        'Momentum compounds when the whole team has a **clear plan** for outreach, updates, and follow-through.'
      ],
      closing: 'Treat this report like a map of what resonated, then turn those lessons into your next burst of **momentum**.'
    };
  }

  return {
    title: 'Momentum note',
    intro: `Most campaigns get their natural spikes at **launch** and **close**. The middle stretch is where creators keep attention by having **new things to say**. ${recentMomentumLine}`,
    tips: [
      'Make updates **worth clicking**: share images, video, story context, milestones, or progress people can actually pass along.',
      'Give supporters **something new to rally around**, like a milestone celebration, a fresh incentive, an event, or a time-boxed push.',
      'Keep outreach **personal and specific**. Short direct notes, texts, and asks usually outperform generic repeated blasts.'
    ],
    closing: 'Every day is a fresh chance to make the campaign feel **active, specific, and worth sharing**.'
  };
}

function shouldRunCampaignRunnerReportsNow(env, date = new Date()) {
  const parts = getMountainTimeParts(date);
  return (
    parts.hour === getCampaignRunnerReportHourMt(env) &&
    parts.minute === getCampaignRunnerReportMinuteMt(env)
  );
}

function normalizeCampaignRunnerReportRecipients(campaign = {}) {
  const seen = new Set();
  const recipients = [];
  for (const rawValue of campaign?.runner_report_emails || []) {
    const email = String(rawValue || '').trim().toLowerCase();
    if (!email || seen.has(email) || !isValidEmail(email)) {
      continue;
    }
    seen.add(email);
    recipients.push(email);
  }
  return recipients;
}

function normalizeCampaignRunnerReportType(value) {
  const normalized = String(value || 'pledge').trim().toLowerCase();
  return normalized === 'fulfillment' ? 'fulfillment' : 'pledge';
}

function getCampaignRunnerReportKindLabel(reportType) {
  return normalizeCampaignRunnerReportType(reportType) === 'fulfillment'
    ? 'Fulfillment report'
    : 'Daily pledge report';
}

function getCampaignRunnerReportMarkerKey(reportType, campaignSlug, reportDateKey) {
  const normalizedType = normalizeCampaignRunnerReportType(reportType);
  if (normalizedType === 'fulfillment') {
    return `campaign-runner-report:fulfillment:${campaignSlug}`;
  }
  return `campaign-runner-report:pledge:${campaignSlug}:${reportDateKey}`;
}

function sanitizeStoredTaxDetails(taxDetails, fallback = {}) {
  if (!taxDetails || typeof taxDetails !== 'object') {
    return {
      provider: String(fallback.provider || 'flat'),
      source: String(fallback.source || 'flat_rate'),
      effectiveRate: Number(fallback.effectiveRate || 0) || 0,
      locationCode: typeof fallback.locationCode === 'string' && fallback.locationCode.trim() ? fallback.locationCode.trim() : null,
      destination: fallback.destination || null,
      jurisdiction: fallback.jurisdiction || null,
      taxableSubtotalCents: Math.max(0, Number(fallback.taxableSubtotalCents || 0) || 0),
      taxableShippingCents: Math.max(0, Number(fallback.taxableShippingCents || 0) || 0),
      shippingTaxed: fallback.shippingTaxed === true,
      shippingCents: Math.max(0, Number(fallback.shippingCents || 0) || 0),
      breakdown: Array.isArray(fallback.breakdown) ? fallback.breakdown : []
    };
  }

  return {
    provider: String(taxDetails.provider || fallback.provider || 'flat'),
    source: String(taxDetails.source || fallback.source || 'flat_rate'),
    effectiveRate: Number(taxDetails.effectiveRate ?? fallback.effectiveRate ?? 0) || 0,
    locationCode: typeof (taxDetails.locationCode ?? fallback.locationCode) === 'string' && String(taxDetails.locationCode ?? fallback.locationCode).trim()
      ? String(taxDetails.locationCode ?? fallback.locationCode).trim()
      : null,
    destination: taxDetails.destination || fallback.destination || null,
    jurisdiction: taxDetails.jurisdiction || fallback.jurisdiction || null,
    taxableSubtotalCents: Math.max(0, Number(taxDetails.taxableSubtotalCents ?? fallback.taxableSubtotalCents ?? 0) || 0),
    taxableShippingCents: Math.max(0, Number(taxDetails.taxableShippingCents ?? fallback.taxableShippingCents ?? 0) || 0),
    shippingTaxed: taxDetails.shippingTaxed === true,
    shippingCents: Math.max(0, Number(taxDetails.shippingCents ?? fallback.shippingCents ?? 0) || 0),
    breakdown: Array.isArray(taxDetails.breakdown) ? taxDetails.breakdown : (Array.isArray(fallback.breakdown) ? fallback.breakdown : [])
  };
}

function buildStoredTaxDetailsFallback(pledgeData) {
  const subtotal = Math.max(0, Number(pledgeData?.subtotal ?? pledgeData?.amount ?? 0) || 0);
  const shipping = Math.max(0, Number(pledgeData?.shipping || 0) || 0);
  return {
    destination: pledgeData?.billingAddress || pledgeData?.shippingAddress || pledgeData?.taxDetails?.destination || null,
    taxableSubtotalCents: subtotal,
    taxableShippingCents: 0,
    shippingTaxed: false,
    shippingCents: shipping
  };
}

function getStoredTaxDetails(pledgeData) {
  return sanitizeStoredTaxDetails(pledgeData?.taxDetails, buildStoredTaxDetailsFallback(pledgeData));
}

function getStoredTipPercent(env, pledgeData, fallback = 0) {
  if (!pledgeData) return fallback;
  return sanitizePlatformTipPercent(
    pledgeData.tipPercent,
    fallback,
    getMaxPlatformTipPercent(env)
  );
}

function getStoredTipAmount(env, pledgeData) {
  if (!pledgeData) return 0;
  if (typeof pledgeData.tipAmount === 'number') {
    return pledgeData.tipAmount;
  }
  const subtotal = pledgeData.subtotal ?? pledgeData.amount ?? 0;
  return calculatePlatformTip(subtotal, getStoredTipPercent(env, pledgeData, 0), getMaxPlatformTipPercent(env));
}

async function buildPledgeTotals(env, subtotalCents, { shipping = 0, tipPercent, taxDestination = null } = {}) {
  const normalizedSubtotal = Math.max(0, Number(subtotalCents) || 0);
  const normalizedShipping = Math.max(0, Number(shipping) || 0);
  const defaultTipPercent = getDefaultPlatformTipPercent(env);
  const maxTipPercent = getMaxPlatformTipPercent(env);
  const normalizedTipPercent = sanitizePlatformTipPercent(tipPercent, defaultTipPercent, maxTipPercent);
  const taxQuote = await quoteTax(env, {
    subtotalCents: normalizedSubtotal,
    shippingCents: normalizedShipping,
    destination: taxDestination
  });
  const tax = taxQuote.taxCents;
  const tipAmount = calculatePlatformTip(normalizedSubtotal, normalizedTipPercent, maxTipPercent);
  return {
    subtotal: normalizedSubtotal,
    tax,
    taxDetails: sanitizeStoredTaxDetails(taxQuote, {
      taxableSubtotalCents: normalizedSubtotal,
      taxableShippingCents: 0,
      shippingTaxed: false,
      shippingCents: normalizedShipping
    }),
    shipping: normalizedShipping,
    tipPercent: normalizedTipPercent,
    tipAmount,
    amount: normalizedSubtotal + tax + normalizedShipping + tipAmount
  };
}

function normalizeTierId(rawTierId) {
  if (typeof rawTierId !== 'string' || rawTierId.length === 0) return null;
  return rawTierId.split('__').pop();
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function buildSupportItemDefinitionMap(campaign) {
  return new Map((campaign?.support_items || []).map(item => [item.id, item]));
}

function supportItemsIncludePhysical(campaign, supportItems = []) {
  const definitions = buildSupportItemDefinitionMap(campaign);
  return (supportItems || []).some((item) => {
    if (!item?.id || !(Number(item.amount) > 0)) return false;
    return definitions.get(item.id)?.category === 'physical';
  });
}

function getSupportItemsWithLabels(campaign, supportItems = []) {
  const supportItemMap = buildSupportItemDefinitionMap(campaign);
  return supportItems.map(item => ({
    ...item,
    label: supportItemMap.get(item.id)?.label || item.id
  }));
}

function getBundleAddOnSubtotal(bundleAddOns = []) {
  return (bundleAddOns || []).reduce((sum, addOn) => (
    sum + ((Number(addOn?.unitPrice || 0) || 0) * (Number(addOn?.quantity || 0) || 0))
  ), 0);
}

function isCampaignScopedBundleAddOn(addOn) {
  return String(addOn?.scope || '').trim().toLowerCase() === 'campaign';
}

function getCampaignBundleAddOnSubtotal(bundleAddOns = [], campaignSlug = '') {
  const normalizedCampaignSlug = String(campaignSlug || '').trim();
  return (bundleAddOns || []).reduce((sum, addOn) => {
    const quantity = Number(addOn?.quantity || 0) || 0;
    const unitPrice = Number(addOn?.unitPrice || 0) || 0;
    if (quantity <= 0 || unitPrice <= 0) return sum;
    if (!isCampaignScopedBundleAddOn(addOn)) return sum;
    if (normalizedCampaignSlug && String(addOn?.campaignSlug || '').trim() !== normalizedCampaignSlug) {
      return sum;
    }
    return sum + (unitPrice * quantity);
  }, 0);
}

function getPlatformBundleAddOnSubtotal(bundleAddOns = []) {
  return (bundleAddOns || []).reduce((sum, addOn) => {
    const quantity = Number(addOn?.quantity || 0) || 0;
    const unitPrice = Number(addOn?.unitPrice || 0) || 0;
    if (quantity <= 0 || unitPrice <= 0) return sum;
    return isCampaignScopedBundleAddOn(addOn) ? sum : sum + (unitPrice * quantity);
  }, 0);
}

function getCampaignScopedBundleAddOns(bundleAddOns = [], campaignSlug = '') {
  const normalizedCampaignSlug = String(campaignSlug || '').trim();
  if (!normalizedCampaignSlug) {
    return [];
  }
  return (bundleAddOns || []).filter((addOn) => (
    isCampaignScopedBundleAddOn(addOn) &&
    String(addOn?.campaignSlug || '').trim() === normalizedCampaignSlug
  )).map((addOn) => ({ ...addOn }));
}

function getPlatformBundleAddOns(bundleAddOns = []) {
  return (bundleAddOns || []).filter((addOn) => !isCampaignScopedBundleAddOn(addOn)).map((addOn) => ({ ...addOn }));
}

function bundleAddOnsIncludePhysical(bundleAddOns = []) {
  return (bundleAddOns || []).some((addOn) => (
    addOn?.category === 'physical' && Number(addOn?.quantity || 0) > 0
  ));
}

function getBundleAddOnsForAnchorCampaign(bundleAddOns = [], anchorCampaignSlug = '', campaignSlug = '') {
  const normalizedAnchorCampaignSlug = String(anchorCampaignSlug || '').trim();
  const normalizedCampaignSlug = String(campaignSlug || '').trim();
  if (!normalizedCampaignSlug) {
    return [];
  }

  return Array.isArray(bundleAddOns)
    ? bundleAddOns.filter((addOn) => {
        if (isCampaignScopedBundleAddOn(addOn)) {
          return String(addOn?.campaignSlug || '').trim() === normalizedCampaignSlug;
        }
        return Boolean(normalizedAnchorCampaignSlug) && normalizedAnchorCampaignSlug === normalizedCampaignSlug;
      }).map((addOn) => ({ ...addOn }))
    : [];
}

function getBundleAddOnsWithLabels(bundleAddOns = []) {
  return (bundleAddOns || []).map((addOn) => ({
    ...addOn,
    label: addOn?.name || addOn?.productId || 'Add-on'
  }));
}

function buildPledgeItemsPayload(campaign, canonicalContribution, bundleAddOns = []) {
  const additionalTiersWithNames = (canonicalContribution.additionalTiers || []).map((tier) => {
    const tierData = campaign?.tiers?.find((entry) => entry.id === tier.id);
    return { ...tier, name: tierData?.name || tier.id };
  });
  const supportItemsWithLabels = getSupportItemsWithLabels(campaign, canonicalContribution.supportItems || []);
  const hasPhysicalShipping = canonicalContribution.hasPhysical === true ||
    (Array.isArray(bundleAddOns) && bundleAddOns.some((addOn) => String(addOn?.category || '').trim().toLowerCase() === 'physical'));

  return {
    tierName: canonicalContribution.tierName,
    tierQty: canonicalContribution.tierQty,
    additionalTiers: additionalTiersWithNames,
    supportItems: supportItemsWithLabels,
    addOns: getBundleAddOnsWithLabels(bundleAddOns),
    customAmount: canonicalContribution.customAmount,
    shippingOption: hasPhysicalShipping
      ? (canonicalContribution.shippingOption || 'standard')
      : ''
  };
}

function normalizePledgeItemsForComparison(pledgeItems = {}) {
  return {
    tierName: String(pledgeItems?.tierName || ''),
    tierQty: Math.max(0, Number(pledgeItems?.tierQty || 0)),
    customAmount: Math.max(0, Number(pledgeItems?.customAmount || 0)),
    shippingOption: String(pledgeItems?.shippingOption || '').trim().toLowerCase(),
    additionalTiers: (pledgeItems?.additionalTiers || []).map((tier) => ({
      id: String(tier?.id || ''),
      name: String(tier?.name || ''),
      qty: Math.max(0, Number(tier?.qty || 0))
    })).sort((a, b) => (
      a.id.localeCompare(b.id) ||
      a.name.localeCompare(b.name) ||
      a.qty - b.qty
    )),
    supportItems: (pledgeItems?.supportItems || []).map((item) => ({
      id: String(item?.id || ''),
      label: String(item?.label || ''),
      amount: Math.max(0, Number(item?.amount || 0))
    })).sort((a, b) => (
      a.id.localeCompare(b.id) ||
      a.label.localeCompare(b.label) ||
      a.amount - b.amount
    )),
    addOns: (pledgeItems?.addOns || []).map((addOn) => ({
      productId: String(addOn?.productId || ''),
      label: String(addOn?.label || addOn?.name || ''),
      variantId: String(addOn?.variantId || ''),
      variantLabel: String(addOn?.variantLabel || ''),
      quantity: Math.max(0, Number(addOn?.quantity || addOn?.qty || 0))
    })).sort((a, b) => (
      a.productId.localeCompare(b.productId) ||
      a.variantId.localeCompare(b.variantId) ||
      a.label.localeCompare(b.label) ||
      a.quantity - b.quantity
    ))
  };
}

function havePledgeItemsChanged(previousItems = null, nextItems = null) {
  return JSON.stringify(normalizePledgeItemsForComparison(previousItems || {}))
    !== JSON.stringify(normalizePledgeItemsForComparison(nextItems || {}));
}

function getPledgeTierSelections(pledge, campaign) {
  const selectedTiers = [];
  const allTiers = [];

  if (pledge?.tierId) {
    allTiers.push({ id: pledge.tierId, qty: pledge.tierQty || 1 });
  }

  for (const addTier of pledge?.additionalTiers || []) {
    allTiers.push({ id: addTier.id, qty: addTier.qty || 1 });
  }

  const seen = new Set();
  for (const tierItem of allTiers) {
    const canonicalTierId = normalizeTierId(tierItem.id);
    if (!canonicalTierId || seen.has(canonicalTierId)) continue;

    const tier = campaign?.tiers?.find(entry => entry.id === canonicalTierId);
    if (!tier) {
      return { valid: false, error: `Tier "${canonicalTierId}" not found` };
    }

    const qty = tierItem.qty || 1;
    if (!isPositiveInteger(qty)) {
      return { valid: false, error: `Invalid quantity for tier "${canonicalTierId}"` };
    }

    selectedTiers.push({ id: canonicalTierId, qty, tier });
    seen.add(canonicalTierId);
  }

  return finalizeTierSelection(selectedTiers);
}

function finalizeTierSelection(selectedTiers) {
  const normalizedSelections = selectedTiers.map(entry => ({
    id: normalizeTierId(entry.id),
    qty: entry.qty,
    tier: entry.tier
  }));

  if (normalizedSelections.length === 0) {
    return {
      valid: true,
      selectedTiers: [],
      tierId: null,
      tierName: null,
      tierQty: 0,
      additionalTiers: [],
      hasPhysical: false
    };
  }

  const [primaryTier, ...additionalTierSelections] = normalizedSelections;
  return {
    valid: true,
    selectedTiers: normalizedSelections,
    tierId: primaryTier.id,
    tierName: primaryTier.tier.name,
    tierQty: primaryTier.qty,
    additionalTiers: additionalTierSelections.map(entry => ({ id: entry.id, qty: entry.qty })),
    hasPhysical: normalizedSelections.some(entry => entry.tier?.category === 'physical')
  };
}

function enforceSingleTierSelection(campaign, selectedTiers) {
  if (campaign?.single_tier_only === true && selectedTiers.length > 1) {
    return { valid: false, error: 'This campaign only allows one tier per pledge' };
  }
  return null;
}

function getCampaignPledgedAmountCents(campaign, stats) {
  if (Number.isFinite(stats?.pledgedAmount)) {
    return stats.pledgedAmount;
  }
  const pledgedAmount = Number(campaign?.pledged_amount || 0);
  return Number.isFinite(pledgedAmount) ? pledgedAmount * 100 : 0;
}

function buildTierCountMapFromSelections(selections = []) {
  const counts = {};
  for (const entry of selections || []) {
    if (!entry?.id) continue;
    counts[entry.id] = (counts[entry.id] || 0) + (entry.qty || 1);
  }
  return counts;
}

function buildSupportItemAmountMap(items = []) {
  const amounts = {};
  for (const item of items || []) {
    if (!item?.id) continue;
    amounts[item.id] = (amounts[item.id] || 0) + (item.amount || 0);
  }
  return amounts;
}

function compareCartShapeToContribution(orderCart, canonicalContribution) {
  const requestedTierCounts = buildTierCountMapFromSelections(canonicalContribution.selectedTiers);
  const orderTierCounts = buildTierCountMapFromSelections(orderCart.tierSelections);
  const requestedTierIds = Object.keys(requestedTierCounts).sort();
  const orderTierIds = Object.keys(orderTierCounts).sort();

  if (requestedTierIds.length !== orderTierIds.length) {
    return { valid: false, error: 'Order contents mismatch' };
  }

  for (const tierId of requestedTierIds) {
    if (requestedTierCounts[tierId] !== orderTierCounts[tierId]) {
      return { valid: false, error: 'Order contents mismatch' };
    }
  }

  const requestedSupportItems = buildSupportItemAmountMap(canonicalContribution.supportItems);
  const orderSupportItems = buildSupportItemAmountMap(orderCart.supportItems);
  const requestedSupportIds = Object.keys(requestedSupportItems).sort();
  const orderSupportIds = Object.keys(orderSupportItems).sort();
  if (requestedSupportIds.length !== orderSupportIds.length) {
    return { valid: false, error: 'Order contents mismatch' };
  }

  for (const itemId of requestedSupportIds) {
    if (requestedSupportItems[itemId] !== orderSupportItems[itemId]) {
      return { valid: false, error: 'Order contents mismatch' };
    }
  }

  if ((canonicalContribution.customAmount || 0) !== (orderCart.customAmount || 0)) {
    return { valid: false, error: 'Order contents mismatch' };
  }

  return { valid: true };
}

function getCustomFieldValue(item = {}, fieldName = '') {
  const fields = Array.isArray(item?.customFields) ? item.customFields : [];
  const match = fields.find((field) => field?.name === fieldName);
  return match ? String(match.value || '') : '';
}

function parseAddOnCartItem(item = {}) {
  const itemId = typeof item?.id === 'string' ? item.id.trim() : '';
  if (!itemId.startsWith(ADD_ON_ITEM_PREFIX)) {
    return { valid: false, error: 'Invalid add-on item id' };
  }

  const afterPrefix = itemId.slice(ADD_ON_ITEM_PREFIX.length);
  const [rawProductId, rawVariantId = ''] = afterPrefix.split('__variant__');
  const productId = String(rawProductId || '').trim();
  const variantId = String(rawVariantId || getCustomFieldValue(item, '_variant_id')).trim();
  const variantLabel = String(getCustomFieldValue(item, '_variant_label')).trim();
  const quantity = Number(item?.quantity ?? 1);

  if (!productId || !isPositiveInteger(quantity)) {
    return { valid: false, error: 'Invalid add-on selection' };
  }

  return {
    valid: true,
    addOn: {
      productId,
      variantId,
      variantLabel,
      quantity
    }
  };
}

function resolveBundleAddOnAnchorCampaignSlug(rawAnchorCampaignSlug, carts = []) {
  const cartCampaignSlugs = carts.map((cart) => cart.campaignSlug).filter(Boolean);
  if (cartCampaignSlugs.length === 0) {
    return null;
  }

  const normalizedAnchor = typeof rawAnchorCampaignSlug === 'string' ? rawAnchorCampaignSlug.trim() : '';
  if (normalizedAnchor && cartCampaignSlugs.includes(normalizedAnchor)) {
    return normalizedAnchor;
  }

  if (cartCampaignSlugs.length === 1) {
    return cartCampaignSlugs[0];
  }

  return cartCampaignSlugs[0];
}

async function validateBundleAddOns(env, bundleAddOns = [], { currentSelections = [] } = {}) {
  if (!Array.isArray(bundleAddOns) || bundleAddOns.length === 0) {
    return { valid: true, bundleAddOns: [] };
  }

  const catalog = await getAddOns(env);
  const inventorySnapshot = await getAddOnInventorySnapshot(env);
  if (catalog?.enabled !== true) {
    return { valid: false, error: 'Global add-ons are not enabled for this deployment' };
  }

  const products = new Map((catalog?.products || []).map((product) => [String(product.id || ''), product]));
  const normalizedSelections = [];
  const selectedProducts = new Set();
  const allowanceByKey = new Map();
  for (const currentSelection of Array.isArray(currentSelections) ? currentSelections : []) {
    const allowanceProductId = String(currentSelection?.productId || '').trim();
    const allowanceVariantId = String(currentSelection?.variantId || '').trim();
    const allowanceQty = Number(currentSelection?.quantity || 0);
    if (!allowanceProductId || !isPositiveInteger(allowanceQty)) continue;
    allowanceByKey.set(`${allowanceProductId}::${allowanceVariantId}`, allowanceQty);
  }

  for (const selection of bundleAddOns) {
    const productId = String(selection?.productId || '').trim();
    const quantity = Number(selection?.quantity || 0);
    if (!productId || !isPositiveInteger(quantity)) {
      return { valid: false, error: 'Invalid bundle add-on selection' };
    }

    const product = products.get(productId);
    if (!product) {
      return { valid: false, error: `Add-on "${productId}" not found` };
    }

    if (selectedProducts.has(productId)) {
      return { valid: false, error: `Add-on "${productId}" can only be selected once per order` };
    }
    selectedProducts.add(productId);

    const variants = Array.isArray(product.variants) ? product.variants : [];
    const normalizedVariantId = String(selection?.variantId || '').trim();
    let resolvedVariantId = '';
    let resolvedVariantLabel = '';

    if (variants.length > 0) {
      const variant = variants.find((entry) => String(entry?.id || '') === normalizedVariantId);
      if (!variant) {
        return { valid: false, error: `Add-on "${productId}" requires a valid variant selection` };
      }
      resolvedVariantId = String(variant.id || '');
      resolvedVariantLabel = String(variant.label || resolvedVariantId);
    }

    const productInventory = inventorySnapshot?.products?.[productId] || null;
    const variantInventory = resolvedVariantId
      ? productInventory?.variants?.[resolvedVariantId] || null
      : null;
    const rawAvailableQuantity = resolvedVariantId
      ? variantInventory?.remaining
      : productInventory?.remaining;
    const availableQuantity = rawAvailableQuantity === null || rawAvailableQuantity === undefined
      ? null
      : Number(rawAvailableQuantity);
    const allowance = allowanceByKey.get(`${productId}::${resolvedVariantId}`) || 0;
    if (Number.isFinite(availableQuantity) && quantity > (availableQuantity + allowance)) {
      return {
        valid: false,
        error: `Only ${Math.max(0, availableQuantity + allowance)} remaining for ${String(product.name || productId)}${resolvedVariantLabel ? ` (${resolvedVariantLabel})` : ''}`
      };
    }

    normalizedSelections.push({
      productId,
      name: String(product.name || productId),
      imageUrl: String(product.image_url || ''),
      sourceUrl: String(product.source_url || ''),
      scope: String(product.scope || 'platform'),
      campaignSlug: String(product.campaign_slug || ''),
      campaignTitle: String(product.campaign_title || ''),
      variantId: resolvedVariantId,
      variantLabel: resolvedVariantLabel,
      quantity,
      unitPrice: Math.round(Number(product.price || 0) * 100),
      category: String(product.category || 'digital'),
      shipping_preset: product.shipping_preset || null,
      shipping: product.shipping || null
    });
  }

  normalizedSelections.sort((a, b) => (
    a.productId.localeCompare(b.productId) ||
    a.variantId.localeCompare(b.variantId)
  ));

  return { valid: true, bundleAddOns: normalizedSelections };
}

async function handleGetAddOnInventory(env) {
  const snapshot = await getAddOnInventorySnapshot(env);
  return jsonResponse(snapshot, 200, env, true, {
    'Cache-Control': PRIVATE_NO_STORE_CACHE_CONTROL
  });
}

function extractCampaignCartsFromFirstPartyItems(
  items = [],
  customAmount = 0,
  campaignSlug = null,
  bundleAddOnAnchorCampaignSlug = null
) {
  if (!Array.isArray(items)) {
    return { valid: false, error: 'Invalid cart items' };
  }

  const normalizedCampaignSlug = typeof campaignSlug === 'string' && campaignSlug ? campaignSlug : null;
  const campaignCarts = new Map();
  const bundleAddOns = [];

  function getCampaignCart(itemCampaignSlug) {
    if (!campaignCarts.has(itemCampaignSlug)) {
      campaignCarts.set(itemCampaignSlug, {
        campaignSlug: itemCampaignSlug,
        tierCounts: new Map(),
        supportItems: [],
        customAmount: 0
      });
    }
    return campaignCarts.get(itemCampaignSlug);
  }

  for (const item of items) {
    const itemId = typeof item?.id === 'string' ? item.id : '';
    if (!itemId.includes('__')) {
      return { valid: false, error: 'Invalid cart item id' };
    }

    if (itemId.startsWith(ADD_ON_ITEM_PREFIX)) {
      const parsedAddOn = parseAddOnCartItem(item);
      if (!parsedAddOn.valid) {
        return { valid: false, error: parsedAddOn.error };
      }
      bundleAddOns.push(parsedAddOn.addOn);
      continue;
    }

    const [itemCampaignSlug] = itemId.split('__');
    if (normalizedCampaignSlug && !campaignCarts.has(itemCampaignSlug) && campaignCarts.size === 0 && itemCampaignSlug !== normalizedCampaignSlug) {
      // Accept item-derived campaign slugs as the source of truth; campaignSlug is only a hint.
    }
    const cart = getCampaignCart(itemCampaignSlug);

    if (itemId.includes('__support__')) {
      const supportItemId = itemId.split('__support__')[1];
      const amount = Number(item?.amount);
      if (!supportItemId || !isNonNegativeInteger(amount)) {
        return { valid: false, error: 'Invalid support item selection' };
      }
      if (amount > 0) {
        cart.supportItems.push({ id: supportItemId, amount });
      }
      continue;
    }

    if (itemId.includes('__custom-support')) {
      const amount = Number(item?.amount ?? item?.price ?? 0);
      if (!isNonNegativeInteger(amount)) {
        return { valid: false, error: 'Invalid custom support amount' };
      }
      cart.customAmount += amount;
      continue;
    }

    const tierId = itemId.split('__')[1];
    const quantity = Number(item?.quantity ?? 1);
    if (!tierId || !isPositiveInteger(quantity)) {
      return { valid: false, error: 'Invalid tier selection' };
    }
    cart.tierCounts.set(tierId, (cart.tierCounts.get(tierId) || 0) + quantity);
  }

  const carts = Array.from(campaignCarts.values())
    .map((cart) => ({
      campaignSlug: cart.campaignSlug,
      tierSelections: Array.from(cart.tierCounts, ([id, qty]) => ({ id, qty })),
      supportItems: cart.supportItems,
      customAmount: Number(cart.customAmount) || 0
    }))
    .filter((cart) => cart.tierSelections.length > 0 || cart.supportItems.length > 0 || cart.customAmount > 0)
    .sort((a, b) => a.campaignSlug.localeCompare(b.campaignSlug));

  const resolvedAnchorCampaignSlug = bundleAddOns.length > 0
    ? resolveBundleAddOnAnchorCampaignSlug(bundleAddOnAnchorCampaignSlug, carts)
    : null;

  if (bundleAddOns.length > 0 && !resolvedAnchorCampaignSlug) {
    return { valid: false, error: 'Bundle add-ons require at least one campaign in the cart' };
  }

  return {
    valid: true,
    carts,
    bundleAddOns,
    bundleAddOnAnchorCampaignSlug: resolvedAnchorCampaignSlug
  };
}

function buildBundleOrderId(baseOrderId, campaignSlug) {
  return `${baseOrderId}-${campaignSlug}`;
}

function getCheckoutBundleStorageKey(orderId) {
  return `pending-checkout:${orderId}`;
}

function validateTierSelection(campaign, rawTierId, rawQty, seenTierIds) {
  const tierId = normalizeTierId(rawTierId);
  if (!tierId) {
    return { valid: false, error: 'Invalid tier selection' };
  }

  if (seenTierIds.has(tierId)) {
    return { valid: false, error: `Duplicate tier "${tierId}" is not allowed` };
  }

  const tier = campaign?.tiers?.find(entry => entry.id === tierId);
  if (!tier) {
    return { valid: false, error: `Tier "${tierId}" not found` };
  }

  if (tier.sold_out || (tier.remaining !== undefined && tier.remaining <= 0)) {
    return { valid: false, error: `Tier "${tierId}" is sold out` };
  }

  const qty = Number(rawQty ?? 1);
  if (!isPositiveInteger(qty)) {
    return { valid: false, error: `Invalid quantity for tier "${tierId}"` };
  }

  if (tier.stackable !== true && qty !== 1) {
    return { valid: false, error: `Tier "${tierId}" does not support multiple quantities` };
  }

  seenTierIds.add(tierId);
  return { valid: true, selection: { id: tierId, qty, tier } };
}

function buildTierSelectionFromStartRequest(campaign, { tierId, tierQty = 1, additionalTiers = [] }) {
  const seenTierIds = new Set();
  const selectedTiers = [];

  if (tierId) {
    const primaryTier = validateTierSelection(campaign, tierId, tierQty, seenTierIds);
    if (!primaryTier.valid) return primaryTier;
    selectedTiers.push(primaryTier.selection);
  }

  if (additionalTiers !== undefined && !Array.isArray(additionalTiers)) {
    return { valid: false, error: 'Invalid additional tier selection' };
  }

  for (const tierItem of additionalTiers || []) {
    const result = validateTierSelection(campaign, tierItem?.id, tierItem?.qty ?? 1, seenTierIds);
    if (!result.valid) return result;
    selectedTiers.push(result.selection);
  }

  const singleTierViolation = enforceSingleTierSelection(campaign, selectedTiers);
  if (singleTierViolation) return singleTierViolation;

  return finalizeTierSelection(selectedTiers);
}

function buildTierSelectionFromModifyRequest(campaign, currentPledge, { newTierId, newTierQty, addTiers }) {
  if (Array.isArray(addTiers)) {
    const seenTierIds = new Set();
    const selectedTiers = [];
    for (const tierItem of addTiers) {
      const result = validateTierSelection(campaign, tierItem?.id, tierItem?.qty ?? 1, seenTierIds);
      if (!result.valid) return result;
      selectedTiers.push(result.selection);
    }
    const singleTierViolation = enforceSingleTierSelection(campaign, selectedTiers);
    if (singleTierViolation) return singleTierViolation;
    return finalizeTierSelection(selectedTiers);
  }

  const currentSelection = getPledgeTierSelections(currentPledge, campaign);
  if (!currentSelection.valid) return currentSelection;

  if (!currentSelection.selectedTiers.length) {
    if (newTierId !== null && newTierId !== undefined) {
      return buildTierSelectionFromStartRequest(campaign, {
        tierId: newTierId,
        tierQty: newTierQty ?? 1,
        additionalTiers: []
      });
    }
    return currentSelection;
  }

  const selectedTiers = [...currentSelection.selectedTiers];
  if (newTierId !== null && newTierId !== undefined) {
    const updatedPrimary = validateTierSelection(campaign, newTierId, newTierQty ?? selectedTiers[0].qty, new Set());
    if (!updatedPrimary.valid) return updatedPrimary;
    selectedTiers[0] = updatedPrimary.selection;
  } else if (newTierQty !== null && newTierQty !== undefined) {
    const currentPrimaryTier = selectedTiers[0];
    const updatedPrimary = validateTierSelection(campaign, currentPrimaryTier.id, newTierQty, new Set());
    if (!updatedPrimary.valid) return updatedPrimary;
    selectedTiers[0] = updatedPrimary.selection;
  }

  return finalizeTierSelection(selectedTiers);
}

function buildDesiredSupportItems(campaign, currentSupportItems = [], requestedSupportItems) {
  const supportItemDefinitions = buildSupportItemDefinitionMap(campaign);
  const mergedSupportItems = new Map();

  for (const item of currentSupportItems || []) {
    if (item?.id && Number.isFinite(item.amount) && item.amount > 0) {
      mergedSupportItems.set(item.id, item.amount);
    }
  }

  if (requestedSupportItems === null || requestedSupportItems === undefined) {
    return {
      valid: true,
      supportItems: Array.from(mergedSupportItems, ([id, amount]) => ({ id, amount }))
    };
  }

  if (!Array.isArray(requestedSupportItems)) {
    return { valid: false, error: 'Invalid support item selection' };
  }

  const seenSupportItemIds = new Set();
  for (const item of requestedSupportItems) {
    const supportItemId = typeof item?.id === 'string' ? item.id : null;
    if (!supportItemId || !supportItemDefinitions.has(supportItemId)) {
      return { valid: false, error: 'Invalid support item selection' };
    }

    if (seenSupportItemIds.has(supportItemId)) {
      return { valid: false, error: `Duplicate support item "${supportItemId}" is not allowed` };
    }
    seenSupportItemIds.add(supportItemId);

    const amount = Number(item.amount);
    if (!isNonNegativeInteger(amount) || !isValidAmount(amount * 100)) {
      return { valid: false, error: `Invalid amount for support item "${supportItemId}"` };
    }

    if (amount === 0) {
      mergedSupportItems.delete(supportItemId);
    } else {
      mergedSupportItems.set(supportItemId, amount);
    }
  }

  return {
    valid: true,
    supportItems: Array.from(mergedSupportItems, ([id, amount]) => ({ id, amount }))
  };
}

async function buildCanonicalContribution(env, campaign, {
  tierSelection,
  supportItems = [],
  customAmount = 0,
  bundleAddOns = [],
  tipPercent,
  shippingCents = null,
  shippingOption = 'standard',
  taxDestination = null
}) {
  const normalizedCustomAmount = Number(customAmount);
  if (!isNonNegativeInteger(normalizedCustomAmount) || !isValidAmount(normalizedCustomAmount * 100)) {
    return { valid: false, error: 'Invalid custom support amount' };
  }

  let subtotal = normalizedCustomAmount * 100;
  for (const tierItem of tierSelection.selectedTiers) {
    subtotal += (tierItem.tier.price || 0) * tierItem.qty * 100;
  }

  for (const supportItem of supportItems) {
    subtotal += supportItem.amount * 100;
  }

  const campaignBundleAddOns = getCampaignScopedBundleAddOns(bundleAddOns, campaign?.slug);
  const platformBundleAddOns = getPlatformBundleAddOns(bundleAddOns);
  const goalTrackingSubtotal = subtotal + getCampaignBundleAddOnSubtotal(bundleAddOns, campaign?.slug);
  subtotal += getBundleAddOnSubtotal(bundleAddOns);

  if (!isValidAmount(subtotal)) {
    return { valid: false, error: 'Invalid pledge amount' };
  }

  if (subtotal <= 0) {
    return { valid: false, error: 'Pledge must include at least one contribution' };
  }

  const hasCampaignPhysical =
    tierSelection.hasPhysical === true ||
    supportItemsIncludePhysical(campaign, supportItems) ||
    bundleAddOnsIncludePhysical(campaignBundleAddOns);
  const hasPlatformPhysical = bundleAddOnsIncludePhysical(platformBundleAddOns);
  const hasPhysical = hasCampaignPhysical || hasPlatformPhysical;
  const resolvedShippingCents = Number.isFinite(Number(shippingCents))
    ? Math.max(0, Number(shippingCents))
    : (
        (hasCampaignPhysical ? getCampaignShippingFallbackFeeCents(campaign, env) : 0) +
        (hasPlatformPhysical ? getShippingFallbackFeeCents(env) : 0)
      );
  const normalizedShippingOption = String(shippingOption || 'standard').trim().toLowerCase() || 'standard';

  try {
    return {
      valid: true,
      ...tierSelection,
      hasPhysical,
      shippingOption: normalizedShippingOption,
      supportItems,
      bundleAddOns,
      customAmount: normalizedCustomAmount,
      goalTrackingSubtotal,
      totals: await buildPledgeTotals(env, subtotal, {
        shipping: resolvedShippingCents,
        tipPercent,
        taxDestination
      })
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Failed to calculate tax'
    };
  }
}

async function buildCanonicalContributionForStoredShipping(env, campaign, {
  tierSelection,
  supportItems = [],
  customAmount = 0,
  bundleAddOns = [],
  tipPercent,
  shippingAddress = null,
  currentShipping = 0,
  shippingOption = 'standard',
  taxDestination = null
}) {
  const normalizedTaxDestination = taxDestination
    ? normalizeTaxDestination(taxDestination)
    : (shippingAddress ? normalizeTaxDestination(shippingAddress) : { valid: false, destination: null });
  const effectiveTaxDestination = normalizedTaxDestination.valid ? normalizedTaxDestination.destination : null;
  const canonicalContribution = await buildCanonicalContribution(env, campaign, {
    tierSelection,
    supportItems,
    customAmount,
    bundleAddOns,
    tipPercent,
    shippingCents: currentShipping,
    shippingOption,
    taxDestination: effectiveTaxDestination
  });
  if (!canonicalContribution.valid || !canonicalContribution.hasPhysical) {
    return canonicalContribution;
  }

  const campaignBundleAddOns = getCampaignScopedBundleAddOns(bundleAddOns, campaign?.slug);
  const platformBundleAddOns = getPlatformBundleAddOns(bundleAddOns);
  const hasCampaignPhysical =
    tierSelection.hasPhysical === true ||
    supportItemsIncludePhysical(campaign, supportItems) ||
    bundleAddOnsIncludePhysical(campaignBundleAddOns);
  const hasPlatformPhysical = bundleAddOnsIncludePhysical(platformBundleAddOns);
  let resolvedShippingCents = Math.max(0, Number(currentShipping) || 0);
  const normalizedDestination = normalizeShippingDestination(shippingAddress);

  if (normalizedDestination.valid) {
    resolvedShippingCents = 0;

    if (hasCampaignPhysical) {
      const quotedShipment = await quoteCampaignShipment(
        env,
        campaign,
        tierSelection,
        normalizedDestination.destination,
        supportItems,
        shippingOption,
        campaignBundleAddOns
      );
      if (!quotedShipment.valid) {
        return quotedShipment;
      }
      resolvedShippingCents += Math.max(0, Number(quotedShipment.quote?.shippingCents) || 0);
      canonicalContribution.shippingOption = quotedShipment.selectedOption || canonicalContribution.shippingOption || 'standard';
    }

    if (hasPlatformPhysical) {
      const platformShipment = await quoteCampaignShipment(
        env,
        null,
        { selectedTiers: [] },
        normalizedDestination.destination,
        [],
        shippingOption,
        platformBundleAddOns
      );
      if (!platformShipment.valid) {
        return platformShipment;
      }
      resolvedShippingCents += Math.max(0, Number(platformShipment.quote?.shippingCents) || 0);
    }
  } else if (resolvedShippingCents === 0) {
    resolvedShippingCents =
      (hasCampaignPhysical ? getCampaignShippingFallbackFeeCents(campaign, env) : 0) +
      (hasPlatformPhysical ? getShippingFallbackFeeCents(env) : 0);
  }

  canonicalContribution.totals = await buildPledgeTotals(env, canonicalContribution.totals.subtotal, {
    shipping: resolvedShippingCents,
    tipPercent: canonicalContribution.totals.tipPercent,
    taxDestination: effectiveTaxDestination || (normalizedDestination.valid ? normalizedDestination.destination : null)
  });

  return canonicalContribution;
}

async function validateTierThresholdSelection(env, campaignSlug, campaign, selectedTiers = [], existingSelectedTiers = []) {
  const thresholdTiers = selectedTiers.filter(tierItem => Number(tierItem.tier?.requires_threshold) > 0);
  if (thresholdTiers.length === 0) {
    return { valid: true };
  }

  const stats = await getCampaignStats(env, campaignSlug);
  const pledgedAmountCents = getCampaignPledgedAmountCents(campaign, stats);
  const existingTierCounts = getTierQuantityMap(existingSelectedTiers);

  for (const tierItem of thresholdTiers) {
    const requiredThresholdCents = Number(tierItem.tier.requires_threshold) * 100;
    const existingQty = existingTierCounts[tierItem.id] || 0;

    if (tierItem.qty <= existingQty) {
      continue;
    }

    if (pledgedAmountCents < requiredThresholdCents) {
      return {
        valid: false,
        error: `Tier "${tierItem.id}" unlocks at $${Number(tierItem.tier.requires_threshold).toLocaleString()}`
      };
    }
  }

  return { valid: true };
}

function getTierQuantityMap(selectedTiers = []) {
  const counts = {};
  for (const tierItem of selectedTiers) {
    counts[tierItem.id] = (counts[tierItem.id] || 0) + (tierItem.qty || 1);
  }
  return counts;
}

async function ensureTierAvailability(env, campaignSlug, campaign, selectedTiers = [], existingTierCounts = {}, excludedReservationOrderId = null) {
  if (!env.PLEDGES) return { valid: true };

  let inventory = await getTierInventory(env, campaignSlug);
  if (Object.keys(inventory).length === 0 && campaign?.tiers?.some(tier => tier.limit_total)) {
    inventory = await recalculateTierInventory(env, campaignSlug, campaign.tiers) || {};
  }

  const reservedCounts = await getReservedTierCounts(env, campaignSlug, excludedReservationOrderId);

  for (const tierItem of selectedTiers) {
    if (!tierItem.tier?.limit_total) continue;

    const tierInventory = inventory[tierItem.id] || {
      limit: tierItem.tier.limit_total,
      claimed: 0
    };
    const available = tierInventory.limit
      - tierInventory.claimed
      - (reservedCounts[tierItem.id] || 0)
      + (existingTierCounts[tierItem.id] || 0);
    if (tierItem.qty > available) {
      return {
        valid: false,
        error: available <= 0
          ? `Tier "${tierItem.id}" is sold out`
          : `Only ${available} remaining for tier "${tierItem.id}"`,
        remaining: Math.max(0, available)
      };
    }
  }

  return { valid: true };
}

function hasTierInventoryCoordinator(env) {
  return !!env?.TIER_INVENTORY_COORDINATOR;
}

function getTierInventoryCoordinatorStub(env, campaignSlug) {
  const id = env.TIER_INVENTORY_COORDINATOR.idFromName(campaignSlug);
  return env.TIER_INVENTORY_COORDINATOR.get(id);
}

async function callTierInventoryCoordinator(env, campaignSlug, path, payload = {}) {
  const response = await getTierInventoryCoordinatorStub(env, campaignSlug).fetch(
    `https://tier-inventory-coordinator${path}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignSlug, ...payload })
    }
  );

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error || 'Tier inventory coordinator request failed');
  }
  return body;
}

async function buildTierInventorySnapshot(env, campaignSlug, campaign = null) {
  if (hasTierInventoryCoordinator(env)) {
    try {
      const result = await callTierInventoryCoordinator(env, campaignSlug, '/snapshot');
      if (result?.inventory && typeof result.inventory === 'object') {
        return JSON.parse(JSON.stringify(result.inventory));
      }
    } catch (err) {
      console.error('Failed to fetch tier inventory snapshot from coordinator:', err.message);
    }
  }

  let inventory = await getTierInventory(env, campaignSlug);
  if (Object.keys(inventory).length === 0 && campaign?.tiers?.some(tier => tier.limit_total)) {
    inventory = await recalculateTierInventory(env, campaignSlug, campaign.tiers) || {};
  }
  return JSON.parse(JSON.stringify(inventory || {}));
}

async function buildTierAvailabilitySnapshot(env, campaignSlug, campaign = null) {
  if (hasTierInventoryCoordinator(env)) {
    try {
      const result = await callTierInventoryCoordinator(env, campaignSlug, '/snapshot');
      if (result?.inventory && typeof result.inventory === 'object') {
        return {
          inventory: JSON.parse(JSON.stringify(result.inventory)),
          reservedCounts: result?.reservedCounts && typeof result.reservedCounts === 'object'
            ? JSON.parse(JSON.stringify(result.reservedCounts))
            : {}
        };
      }
    } catch (err) {
      console.error('Failed to fetch reservation-aware tier snapshot from coordinator:', err.message);
    }
  }

  return {
    inventory: await buildTierInventorySnapshot(env, campaignSlug, campaign),
    reservedCounts: await getReservedTierCounts(env, campaignSlug)
  };
}

function getTierReservationKey(campaignSlug, orderId) {
  return `tier-reservation:${campaignSlug}:${orderId}`;
}

function getTierReservationCountsKey(campaignSlug) {
  return `tier-reservation-counts:${campaignSlug}`;
}

async function getReservedTierCounts(env, campaignSlug, excludedOrderId = null) {
  if (!env.PLEDGES || !hasTierInventoryCoordinator(env)) return {};

  try {
    const result = await callTierInventoryCoordinator(env, campaignSlug, '/reserved-counts', {
      reservationId: excludedOrderId
    });
    if (result?.reservedCounts && typeof result.reservedCounts === 'object') {
      return result.reservedCounts;
    }
  } catch (err) {
    console.error('Failed to fetch reserved tier counts from coordinator:', err.message);
  }
  return {};
}

function resolveAuthorizedOrderId(payload, requestedOrderId = null) {
  if (!payload?.orderId) {
    return { valid: false, error: 'Invalid token scope' };
  }

  if (requestedOrderId && requestedOrderId !== payload.orderId) {
    return { valid: false, error: 'Unauthorized' };
  }

  return { valid: true, orderId: payload.orderId };
}

async function saveTierReservation(env, campaignSlug, orderId, selectedTiers = [], campaign = null) {
  if (!env.PLEDGES || !orderId) return { success: true };
  const limitedTiers = selectedTiers
    .filter(tierItem => tierItem.tier?.limit_total)
    .map(tierItem => ({ id: tierItem.id, qty: tierItem.qty }));

  if (limitedTiers.length === 0) {
    await clearTierReservation(env, campaignSlug, orderId);
    return { success: true };
  }

  try {
    if (!hasTierInventoryCoordinator(env)) {
      return { success: false, error: 'Limited tier reservation unavailable' };
    }

    const inventory = await buildTierInventorySnapshot(env, campaignSlug, campaign);
    const result = await callTierInventoryCoordinator(env, campaignSlug, '/reserve-selection', {
      reservationId: orderId,
      nextCounts: getTierQuantityMap(limitedTiers),
      inventory
    });
    if (!result?.success) {
      return result;
    }

    return { success: true };
  } catch (err) {
    try {
      await callTierInventoryCoordinator(env, campaignSlug, '/release-reservation', {
        reservationId: orderId
      });
    } catch (releaseErr) {
      console.error('Failed to rollback tier reservation in coordinator:', releaseErr.message);
    }
    throw err;
  }
}

async function deleteTierReservationProjection(env, campaignSlug, orderId) {
  if (!env.PLEDGES || !orderId) return;
  const reservationKey = getTierReservationKey(campaignSlug, orderId);
  const countsKey = getTierReservationCountsKey(campaignSlug);
  await Promise.all([
    env.PLEDGES.delete(reservationKey),
    env.PLEDGES.delete(countsKey)
  ]);
}

async function clearTierReservation(env, campaignSlug, orderId) {
  if (!env.PLEDGES || !orderId) return;
  await deleteTierReservationProjection(env, campaignSlug, orderId);
  if (hasTierInventoryCoordinator(env)) {
    try {
      await callTierInventoryCoordinator(env, campaignSlug, '/release-reservation', {
        reservationId: orderId
      });
    } catch (err) {
      console.error('Failed to clear tier reservation in coordinator:', err.message);
    }
  }
}

async function abandonCheckoutIntent(env, orderId) {
  if (!env.PLEDGES || !orderId) {
    return { success: true, released: 0 };
  }

  const manifest = await env.PLEDGES.get(getCheckoutBundleStorageKey(orderId), { type: 'json' });
  if (!manifest || !Array.isArray(manifest.campaigns)) {
    return { success: true, released: 0 };
  }

  for (const campaignEntry of manifest.campaigns) {
    const reservedOrderId = String(campaignEntry?.orderId || '').trim();
    const campaignSlug = String(campaignEntry?.campaignSlug || '').trim();
    if (!campaignSlug || !reservedOrderId) continue;
    await clearTierReservation(env, campaignSlug, reservedOrderId);
  }

  await env.PLEDGES.delete(getCheckoutBundleStorageKey(orderId));
  return { success: true, released: manifest.campaigns.length };
}

async function claimSelectedTierInventory(env, campaignSlug, selectedTiers = [], campaign) {
  return claimTierSelectionInventory(env, campaignSlug, selectedTiers, campaign);
}

async function confirmOrClaimSelectedTierInventory(env, campaignSlug, orderId, selectedTiers = [], campaign) {
  const limitedTiers = selectedTiers
    .filter(tierItem => tierItem?.tier?.limit_total)
    .map(tierItem => ({ id: tierItem.id, qty: tierItem.qty || 1 }));

  if (!env.PLEDGES || !orderId || limitedTiers.length === 0) {
    return claimSelectedTierInventory(env, campaignSlug, selectedTiers, campaign);
  }

  if (!hasTierInventoryCoordinator(env)) {
    return claimSelectedTierInventory(env, campaignSlug, selectedTiers, campaign);
  }

  const inventory = await buildTierInventorySnapshot(env, campaignSlug, campaign);
  const result = await callTierInventoryCoordinator(env, campaignSlug, '/confirm-reservation', {
    reservationId: orderId,
    inventory
  });
  if (!result?.success) {
    return result;
  }
  if (!result.confirmed) {
    return claimSelectedTierInventory(env, campaignSlug, selectedTiers, campaign);
  }

  await deleteTierReservationProjection(env, campaignSlug, orderId);
  return {
    success: true,
    claimedTiers: limitedTiers
  };
}

async function applyTierInventoryChanges(env, campaignSlug, campaign, previousSelection = [], nextSelection = []) {
  return applyTierInventorySelectionChanges(env, campaignSlug, campaign, previousSelection, nextSelection);
}

async function persistNewPledge(env, {
  campaign,
  campaignSlug,
  pledgeData,
  supportItems = [],
  selectedTiers = []
}) {
  if (!env.PLEDGES) {
    return { success: false, error: 'PLEDGES KV not configured' };
  }

  const inventoryClaim = await confirmOrClaimSelectedTierInventory(
    env,
    campaignSlug,
    pledgeData.orderId,
    selectedTiers,
    campaign
  );
  if (!inventoryClaim.success) {
    return inventoryClaim;
  }

  let emailIndexed = false;
  let campaignIndexed = false;
  let statsUpdated = false;
  let supportStatsUpdated = false;

  try {
    await env.PLEDGES.put(`pledge:${pledgeData.orderId}`, JSON.stringify(pledgeData));

    const emailKey = `email:${pledgeData.email.toLowerCase()}`;
    const existingOrders = await env.PLEDGES.get(emailKey, { type: 'json' }) || [];
    if (!existingOrders.includes(pledgeData.orderId)) {
      existingOrders.push(pledgeData.orderId);
      await env.PLEDGES.put(emailKey, JSON.stringify(existingOrders));
    }
    emailIndexed = true;

    await addToCampaignIndex(env, campaignSlug, pledgeData.orderId);
    campaignIndexed = true;

    await addPledgeToStats(env, {
      campaignSlug,
      amount: pledgeData.goalTrackingSubtotal ?? pledgeData.subtotal,
      tierId: pledgeData.tierId,
      tierQty: pledgeData.tierQty,
      additionalTiers: pledgeData.additionalTiers || []
    });
    statsUpdated = true;

    if (supportItems.length > 0) {
      await updateSupportItemStats(env, campaignSlug, [], supportItems);
      supportStatsUpdated = true;
    }

    invalidateAddOnInventorySnapshot(env);

    return { success: true };
  } catch (err) {
    await env.PLEDGES.delete(`pledge:${pledgeData.orderId}`);

    if (emailIndexed) {
      const emailKey = `email:${pledgeData.email.toLowerCase()}`;
      const existingOrders = await env.PLEDGES.get(emailKey, { type: 'json' }) || [];
      const filteredOrders = existingOrders.filter(id => id !== pledgeData.orderId);
      await env.PLEDGES.put(emailKey, JSON.stringify(filteredOrders));
    }

    if (campaignIndexed) {
      await removeFromCampaignIndex(env, campaignSlug, pledgeData.orderId);
    }

    if (supportStatsUpdated) {
      await updateSupportItemStats(env, campaignSlug, supportItems, []);
    }

    if (statsUpdated) {
      await removePledgeFromStats(env, {
        campaignSlug,
        amount: pledgeData.goalTrackingSubtotal ?? pledgeData.subtotal,
        tierId: pledgeData.tierId,
        tierQty: pledgeData.tierQty,
        additionalTiers: pledgeData.additionalTiers || [],
        supportItems,
        customAmount: pledgeData.customAmount || 0
      });
    }

    invalidateAddOnInventorySnapshot(env);

    for (const claimedTier of inventoryClaim.claimedTiers || []) {
      await releaseTierInventory(env, campaignSlug, claimedTier.id, claimedTier.qty);
    }

    return { success: false, error: err.message };
  }
}

function getStripeKey(env) {
  if (getAppMode(env) === 'test' && env.STRIPE_SECRET_KEY_TEST) {
    return env.STRIPE_SECRET_KEY_TEST;
  }
  if (getAppMode(env) === 'live' && env.STRIPE_SECRET_KEY_LIVE) {
    return env.STRIPE_SECRET_KEY_LIVE;
  }
  return env.STRIPE_SECRET_KEY;
}

function getStripeWebhookSecret(env) {
  if (getAppMode(env) === 'test' && env.STRIPE_WEBHOOK_SECRET_TEST) {
    return env.STRIPE_WEBHOOK_SECRET_TEST;
  }
  if (getAppMode(env) === 'live' && env.STRIPE_WEBHOOK_SECRET_LIVE) {
    return env.STRIPE_WEBHOOK_SECRET_LIVE;
  }
  return env.STRIPE_WEBHOOK_SECRET;
}

function getStripePublishableKey(env) {
  if (getAppMode(env) === 'test' && env.STRIPE_PUBLISHABLE_KEY_TEST) {
    return env.STRIPE_PUBLISHABLE_KEY_TEST;
  }
  if (getAppMode(env) === 'live' && env.STRIPE_PUBLISHABLE_KEY_LIVE) {
    return env.STRIPE_PUBLISHABLE_KEY_LIVE;
  }
  return env.STRIPE_PUBLISHABLE_KEY || '';
}

function resolveCheckoutUiRuntime(env) {
  const requestedMode = getCheckoutUiMode(env);
  const stripePublishableKey = getStripePublishableKey(env);
  const usingCustomCheckoutUi = requestedMode === 'custom' && Boolean(stripePublishableKey);

  return {
    usingCustomCheckoutUi,
    stripePublishableKey: usingCustomCheckoutUi ? stripePublishableKey : ''
  };
}

export default {
  async fetch(request, env, ctx) {
    configureWorkerLogging(env);
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS' && path.startsWith('/admin/')) {
      return adminCorsResponse(env);
    }

    if (method === 'OPTIONS') {
      return corsResponse(env);
    }

    if (!env.RATELIMIT) {
      return jsonResponse({ error: RATELIMIT_REQUIRED_ERROR }, 503, env);
    }

    try {
      // SEC-003: Block test endpoints in production mode (unless admin-authenticated)
      if (path.startsWith('/test/') && getAppMode(env) !== 'test') {
        const auth = requireAdmin(request, env);
        if (!auth.ok) {
          return jsonResponse({ error: 'Not found' }, 404);
        }
      }

      if (path === '/admin/auth/start' && method === 'POST') {
        const parsedBody = await parseJsonRequestBody(request, env, {
          maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
          privateResponse: true
        });
        if (!parsedBody.ok) return parsedBody.response;
        const challengeResponse = await verifyAdminAuthStartChallenge(request, env, parsedBody.body || {});
        if (challengeResponse) return challengeResponse;
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        return handleAdminAuthStart(request, env, parsedBody.body || {});
      }

      if (path === '/admin/auth/exchange' && method === 'POST') {
        const parsedBody = await parseJsonRequestBody(request, env, {
          maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
          privateResponse: true
        });
        if (!parsedBody.ok) return parsedBody.response;
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        return handleAdminAuthExchange(request, env, parsedBody.body || {});
      }

      if (path === '/admin/session' && method === 'GET') {
        return handleAdminSession(request, env);
      }

      if (path === '/admin/logout' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES, { privateResponse: true });
        if (!bodyLimit.ok) return bodyLimit.response;
        return handleAdminLogout(request, env);
      }

      if (path === '/admin/dashboard/summary' && method === 'GET') {
        return handleAdminDashboardSummary(request, env);
      }

      if (path === '/admin/settings' && method === 'GET') {
        return handleAdminSettings(request, env);
      }

      if (path === '/admin/settings/preview' && method === 'POST') {
        const parsedBody = await parseJsonRequestBody(request, env, {
          maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
          privateResponse: true,
          emptyValue: {}
        });
        if (!parsedBody.ok) return parsedBody.response;
        return handleAdminSettingsPreview(request, env, parsedBody.body || {});
      }

      if (path === '/admin/settings/logo-upload' && method === 'POST') {
        return handleAdminLogoUpload(request, env);
      }

      if (path === '/admin/settings/image-upload' && method === 'POST') {
        return handleAdminImageUpload(request, env);
      }

      if (path === '/admin/settings/video-upload' && method === 'POST') {
        return handleAdminVideoUpload(request, env);
      }

      if (path === '/admin/settings/publish' && method === 'POST') {
        return handleAdminSettingsPublish(request, env);
      }

      if (path === '/admin/users' && method === 'POST') {
        const parsedBody = await parseJsonRequestBody(request, env, {
          maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
          privateResponse: true,
          emptyValue: {}
        });
        if (!parsedBody.ok) return parsedBody.response;
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        return handleAdminUsersSave(request, env, parsedBody.body || {});
      }

      if (path === '/admin/analytics' && method === 'GET') {
        return handleAdminAnalytics(request, env);
      }

      if (path === '/admin/marketing/referrals' && method === 'GET') {
        return handleAdminMarketingReferrals(request, env);
      }

      if (path === '/admin/marketing/referrals' && method === 'POST') {
        const parsedBody = await parseJsonRequestBody(request, env, {
          maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
          privateResponse: true,
          emptyValue: {}
        });
        if (!parsedBody.ok) return parsedBody.response;
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        return handleAdminMarketingReferralSave(request, env, parsedBody.body || {});
      }

      if (path === '/admin/marketing/referrals' && method === 'DELETE') {
        const parsedBody = await parseJsonRequestBody(request, env, {
          maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
          privateResponse: true,
          emptyValue: {}
        });
        if (!parsedBody.ok) return parsedBody.response;
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        return handleAdminMarketingReferralDelete(request, env, parsedBody.body || {});
      }

      if (path === '/admin/content/campaign' && method === 'GET') {
        return handleAdminContentCampaign(request, env);
      }

      if (path === '/admin/content/preview' && method === 'POST') {
        const parsedBody = await parseJsonRequestBody(request, env, {
          maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
          privateResponse: true,
          emptyValue: {}
        });
        if (!parsedBody.ok) return parsedBody.response;
        return handleAdminContentPreview(request, env, parsedBody.body || {});
      }

      if (path === '/admin/content/publish' && method === 'POST') {
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        return handleAdminContentPublish(request, env);
      }

      if (path === '/admin/supporters' && method === 'GET') {
        return handleAdminSupporters(request, env);
      }

      if (path === '/admin/reports/campaign-runner/preview' && method === 'GET') {
        return handleAdminCampaignRunnerReportPreview(request, env);
      }

      if (path === '/admin/reports/campaign-runner.csv' && method === 'GET') {
        return handleAdminCampaignRunnerReportCsv(request, env);
      }

      if (path === '/admin/add-ons/inventory' && method === 'GET') {
        return handleAdminAddOnInventory(request, env);
      }

      if (path === '/admin/add-ons/inventory' && method === 'POST') {
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        return handleAdminAddOnInventoryMutation(request, env);
      }

      if (path === '/checkout-intent/start' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES, { privateResponse: true });
        if (!bodyLimit.ok) return bodyLimit.response;
        return withObservedOperation(env, ctx, 'checkout_intent_start', () => handleFirstPartyCheckoutStart(request, env));
      }

      if (path === '/shipping/quote' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES, { privateResponse: true });
        if (!bodyLimit.ok) return bodyLimit.response;
        return withObservedOperation(env, ctx, 'shipping_quote', () => handleShippingQuote(request, env));
      }

      if (path === '/tax/quote' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES, { privateResponse: true });
        if (!bodyLimit.ok) return bodyLimit.response;
        return withObservedOperation(env, ctx, 'tax_quote', () => handleTaxQuote(request, env));
      }

      if (path === '/checkout-intent/summary' && method === 'GET') {
        return handleFirstPartyCheckoutSummary(request, env);
      }

      if (path === '/checkout-intent/recovery' && method === 'GET') {
        return handleFirstPartyCheckoutRecovery(request, env);
      }

      if (path === '/checkout-intent/complete' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES, { privateResponse: true });
        if (!bodyLimit.ok) return bodyLimit.response;
        return withObservedOperation(env, ctx, 'checkout_intent_complete', () => handleFirstPartyCheckoutComplete(request, env, ctx));
      }

      if (path === '/webhooks/stripe' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STRIPE_WEBHOOK_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        return handleStripeWebhook(request, env, ctx);
      }

      if (path === '/pledge' && method === 'GET') {
        const rl = await checkRateLimit(request, env, RATE_LIMITS.pledgeRead);
        if (!rl.allowed) return rl.response;
        return handleGetPledge(request, env);
      }

      if (path === '/pledges' && method === 'GET') {
        const rl = await checkRateLimit(request, env, RATE_LIMITS.pledgeRead);
        if (!rl.allowed) return rl.response;
        return handleGetPledges(request, env);
      }

      if (path === '/pledge/cancel' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        const rl = await checkRateLimit(request, env, RATE_LIMITS.pledgeWrite);
        if (!rl.allowed) return rl.response;
        return withObservedOperation(env, ctx, 'pledge_cancel', () => handleCancelPledge(request, env));
      }

      if (path === '/pledge/modify' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        const rl = await checkRateLimit(request, env, RATE_LIMITS.pledgeWrite);
        if (!rl.allowed) return rl.response;
        return withObservedOperation(env, ctx, 'pledge_modify', () => handleModifyPledge(request, env));
      }

      if (path === '/pledge/payment-method/start' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES, { privateResponse: true });
        if (!bodyLimit.ok) return bodyLimit.response;
        const rl = await checkRateLimit(request, env, RATE_LIMITS.pledgeWrite);
        if (!rl.allowed) return rl.response;
        return withObservedOperation(env, ctx, 'pledge_payment_method_start', () => handleUpdatePaymentMethod(request, env));
      }

      if (path === '/votes' && method === 'GET') {
        // SEC-005: Rate limit vote reads
        const rl = await checkRateLimit(request, env, RATE_LIMITS.votes);
        if (!rl.allowed) return rl.response;
        return handleGetVotes(request, env);
      }

      if (path === '/votes' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        // SEC-005: Rate limit vote casting
        const rl = await checkRateLimit(request, env, RATE_LIMITS.votes);
        if (!rl.allowed) return rl.response;
        return handlePostVote(request, env);
      }

      if (path === '/test/setup' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        return handleTestSetup(request, env);
      }

      if (path === '/test/cleanup' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        return handleTestCleanup(request, env);
      }

      if (path === '/admin/rebuild' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        // SEC-005: Rate limit admin endpoints aggressively
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        return handleAdminRebuild(request, env);
      }

      if (path === '/admin/broadcast/announcement' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        return handleBroadcastAnnouncement(request, env);
      }

      if (path === '/admin/broadcast/diary' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        return handleBroadcastDiary(request, env);
      }

      if (path === '/admin/diary/check' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        return handleDiaryCheck(request, env);
      }

      if (path === '/admin/broadcast/milestone' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        return handleBroadcastMilestone(request, env);
      }

      if (path === '/admin/report/campaign-runner' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        return handleCampaignRunnerReport(request, env);
      }

      if (path.startsWith('/admin/milestone-check/') && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        const campaignSlug = path.replace('/admin/milestone-check/', '');
        return handleMilestoneCheck(request, campaignSlug, env);
      }

      if (path.startsWith('/admin/settle/') && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        const campaignSlug = path.replace('/admin/settle/', '');
        return handleSettleCampaign(request, campaignSlug, env);
      }

      if (path === '/test/email' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        return handleTestEmail(request, env);
      }

      if (path === '/test/votes' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        return handleTestVotes(request, env);
      }

      if (path === '/checkout-intent/abandon' && method === 'POST') {
        const parsedBody = await parseJsonRequestBody(request, env, {
          maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
          privateResponse: true
        });
        if (!parsedBody.ok) return parsedBody.response;
        const body = parsedBody.body || {};
        const orderId = String(body?.orderId || '').trim();
        if (!orderId) {
          return jsonResponse({ error: 'Missing orderId' }, 400);
        }
        const rl = await checkRateLimit(request, env, {
          ...RATE_LIMITS.abandon,
          keyFn: () => orderId
        });
        if (!rl.allowed) return rl.response;
        return withObservedOperation(env, ctx, 'checkout_intent_abandon', async () => {
          const result = await abandonCheckoutIntent(env, orderId);
          return jsonResponse(result);
        });
      }

      if (path.startsWith('/live/') && method === 'GET') {
        const campaignSlug = path.replace('/live/', '');
        return handleGetLiveCampaign(campaignSlug, env);
      }

      if (path.startsWith('/share/campaign/') && (method === 'GET' || method === 'HEAD') && path.endsWith('.svg')) {
        const campaignSlug = path.replace('/share/campaign/', '').replace(/\.svg$/, '');
        return handleGetCampaignShareCard(campaignSlug, request, env);
      }

      if (path.startsWith('/share/campaign/') && (method === 'GET' || method === 'HEAD') && path.endsWith('.png')) {
        const campaignSlug = path.replace('/share/campaign/', '').replace(/\.png$/, '');
        return handleGetCampaignShareCardPng(campaignSlug, request, env);
      }

      // Stats endpoints for live pledge totals
      if (path.startsWith('/stats/') && method === 'GET') {
        const campaignSlug = path.replace('/stats/', '');
        return handleGetStats(campaignSlug, env);
      }

      if (path.startsWith('/stats/') && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        const campaignSlug = path.replace('/stats/', '').replace(/\/(check|recalculate)$/, '');
        if (path.endsWith('/check')) {
          return handleCheckStatsProjection(request, campaignSlug, env);
        }
        return handleRecalculateStats(request, campaignSlug, env);
      }

      // Tier inventory endpoints
      if (path.startsWith('/inventory/') && method === 'GET') {
        const campaignSlug = path.replace('/inventory/', '');
        return handleGetInventory(campaignSlug, env);
      }

      if (path === '/add-ons/inventory' && method === 'GET') {
        return handleGetAddOnInventory(env);
      }

      if (path.startsWith('/inventory/') && path.endsWith('/recalculate') && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        const campaignSlug = path.replace('/inventory/', '').replace('/recalculate', '');
        return handleRecalculateInventory(request, campaignSlug, env);
      }

      if (path === '/admin/inventory/init-all' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        return handleInitAllInventory(request, env);
      }

      if (path === '/admin/projections/check' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        return handleCheckAllProjectionDrift(request, env);
      }

      // Admin: Recover a missed Stripe checkout session (creates pledge from completed session)
      if (path === '/admin/recover-checkout' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        return handleRecoverCheckout(request, env);
      }

      // Admin: Backfill missing Stripe customer IDs on pledges (processes batch per call)
      if (path.startsWith('/admin/campaign-index/rebuild/') && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        const campaignSlug = path.replace('/admin/campaign-index/rebuild/', '');
        return handleRebuildCampaignIndex(request, campaignSlug, env);
      }

      if (path.startsWith('/admin/backfill-customers/') && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        const campaignSlug = path.replace('/admin/backfill-customers/', '');
        return handleBackfillCustomers(request, campaignSlug, env);
      }

      // Admin: Settle specific pledges by order ID (avoids full KV scan + subrequest limits)
      if (path === '/admin/settle-batch' && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        return handleSettleBatch(request, env);
      }

      // Admin: Dispatch batched settlement for a campaign (self-chains until complete)
      if (path.startsWith('/admin/settle-dispatch/') && method === 'POST') {
        const bodyLimit = requireBodySizeWithinLimit(request, env, MAX_STANDARD_JSON_BODY_BYTES);
        if (!bodyLimit.ok) return bodyLimit.response;
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        const campaignSlug = path.replace('/admin/settle-dispatch/', '');
        return handleSettleDispatch(request, campaignSlug, env);
      }

      // Admin: Check cron heartbeat status
      if (path === '/admin/cron/status' && method === 'GET') {
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        return handleCronStatus(request, env);
      }

      if (path === '/admin/observability/webhooks' && method === 'GET') {
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        return handleWebhookObservability(request, env);
      }

      if (path === '/admin/observability/performance' && method === 'GET') {
        const rl = await checkRateLimit(request, env, ADMIN_RATE_LIMIT_OPTIONS);
        if (!rl.allowed) return rl.response;
        return handlePerformanceObservability(request, env);
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse({ error: 'Internal server error' }, 500);
    }
  },

  // Cron triggers:
  // - `0 6 * * *` / `0 7 * * *`: daily campaign transitions + settlement checks at midnight Mountain Time
  // - `0 13 * * *` / `0 14 * * *`: 7:00 AM Mountain Time campaign-runner reports
  // - `*/15 * * * *`: retry failed supporter confirmation emails
  async scheduled(event, env, ctx) {
    configureWorkerLogging(env);
    console.log('⏰ Scheduled task triggered:', new Date().toISOString());
    const cronExpression = String(event?.cron || '');
    
    // Heartbeat: record cron execution
    if (env.PLEDGES) {
      await env.PLEDGES.put('cron:lastRun', new Date().toISOString(), { expirationTtl: 172800 });
    }

    if (cronExpression === SUPPORTER_EMAIL_RETRY_CRON) {
      try {
        const retryResults = await processQueuedSupporterEmails(env);
        if (env.PLEDGES) {
          await env.PLEDGES.put('cron:lastEmailRetryRun', new Date().toISOString(), { expirationTtl: 172800 });
        }
        console.log('📧 Supporter email retry complete:', retryResults);
      } catch (err) {
        console.error('📧 Supporter email retry failed:', err);
        if (env.PLEDGES) {
          await env.PLEDGES.put('cron:lastError', JSON.stringify({
            at: new Date().toISOString(),
            error: err.message
          }), { expirationTtl: 604800 });
        }
      }
      return;
    }

    if (CAMPAIGN_RUNNER_REPORT_CRONS.has(cronExpression)) {
      try {
        const reportResults = await processCampaignRunnerReports(env);
        if (env.PLEDGES && reportResults.attempted) {
          await env.PLEDGES.put('cron:lastCampaignRunnerReportRun', new Date().toISOString(), { expirationTtl: 172800 });
        }
        console.log('📊 Campaign runner report cron complete:', reportResults);
      } catch (err) {
        console.error('📊 Campaign runner report cron failed:', err);
        if (env.PLEDGES) {
          await env.PLEDGES.put('cron:lastError', JSON.stringify({
            at: new Date().toISOString(),
            error: err.message
          }), { expirationTtl: 604800 });
        }
      }
      return;
    }
    
    try {
      const campaigns = await getCampaigns(env);
      const results = { checked: 0, settlementDispatched: 0, transitioned: 0, errors: [] };
      let needsRebuild = false;
      
      for (const campaign of campaigns.campaigns || campaigns) {
        results.checked++;
        
        // Check if campaign state should transition based on dates
        const effectiveState = getEffectiveState(campaign);
        if (effectiveState !== campaign.state) {
          console.log(`⏰ Campaign ${campaign.slug}: state transition detected (${campaign.state} → ${effectiveState})`);
          results.transitioned++;
          needsRebuild = true;
        }
        
        // Skip campaigns without deadline/goal for settlement
        if (!campaign.goal_deadline || !campaign.goal_amount) {
          continue;
        }
        
        // Check if deadline has passed (in Mountain Time)
        if (!isDeadlinePassed(campaign.goal_deadline)) {
          continue;
        }

        // Skip if already fully settled
        if (env.PLEDGES) {
          const settled = await env.PLEDGES.get(`campaign-charged:${campaign.slug}`);
          if (settled) {
            console.log(`⏰ Campaign ${campaign.slug}: already settled`);
            continue;
          }
        }
        
        // Check if funded
        const stats = await getCampaignStats(env, campaign.slug);
        const goalAmountCents = campaign.goal_amount * 100;
        
        if (stats.pledgedAmount < goalAmountCents) {
          console.log(`⏰ Campaign ${campaign.slug}: not funded (${stats.pledgedAmount}/${goalAmountCents})`);
          continue;
        }
        
        // Settle directly to avoid self-invocation 522 timeouts
        console.log(`⏰ Settling campaign: ${campaign.slug}`);
        try {
          const settleResult = await settleCampaign(campaign.slug, env);
          console.log(`✅ Settlement complete for ${campaign.slug}:`, JSON.stringify({
            supportersCharged: settleResult.supportersCharged,
            supportersFailed: settleResult.supportersFailed,
            pledgesCharged: settleResult.pledgesCharged,
            totalCharged: settleResult.totalCharged
          }));
          
          // Only mark campaigns settled when every active pledge was chargeable.
          if (
            settleResult.supportersCharged > 0 &&
            settleResult.supportersFailed === 0 &&
            (settleResult.skippedNoCustomer || 0) === 0
          ) {
            await env.PLEDGES.put(`campaign-charged:${campaign.slug}`, new Date().toISOString());
          }
          
          results.settlementDispatched++;
        } catch (settleErr) {
          results.errors.push({ campaign: campaign.slug, error: settleErr.message });
          console.error(`❌ Settlement failed for ${campaign.slug}:`, settleErr.message);
        }
      }
      
      // Trigger site rebuild if any campaigns transitioned state
      if (needsRebuild && env.GITHUB_TOKEN) {
        console.log('🔄 Triggering site rebuild for state transitions...');
        try {
          await triggerSiteRebuild(env, 'scheduled-state-transition');
          console.log('✅ Site rebuild triggered');
        } catch (rebuildErr) {
          console.error('❌ Failed to trigger rebuild:', rebuildErr.message);
          results.errors.push({ type: 'rebuild', error: rebuildErr.message });
        }
      }

      const retryResults = await processQueuedSupporterEmails(env);
      if (retryResults.processed > 0) {
        console.log('📧 Supporter email retry complete:', retryResults);
      }
      
      console.log('⏰ Scheduled task complete:', results);
    } catch (err) {
      console.error('⏰ Scheduled task error:', err);
      if (env.PLEDGES) {
        await env.PLEDGES.put('cron:lastError', JSON.stringify({
          at: new Date().toISOString(),
          error: err.message
        }), { expirationTtl: 604800 });
      }
    }
  }
};

function getCheckoutIntentCoordinator(env) {
  const namespace = env.CHECKOUT_INTENTS;
  if (!namespace || typeof namespace.idFromName !== 'function' || typeof namespace.get !== 'function') {
    return null;
  }
  const id = namespace.idFromName('checkout-intent-nonce-coordinator');
  return namespace.get(id);
}

async function consumeCheckoutIntentNonce(env, { nonce, cartHash, exp }) {
  const coordinator = getCheckoutIntentCoordinator(env);
  if (!coordinator) {
    return { ok: false, status: 503, error: 'Checkout intent coordinator unavailable' };
  }

  const response = await coordinator.fetch('https://checkout-intents.internal/consume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce, cartHash, exp })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    return {
      ok: false,
      status: response.status || 503,
      error: payload.error || 'Checkout intent nonce rejected'
    };
  }

  return { ok: true };
}

async function consumeSupporterEmailNonce(env, orderId) {
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId) {
    return { ok: true, fresh: true };
  }

  const coordinator = getCheckoutIntentCoordinator(env);
  if (!coordinator) {
    return { ok: true, fresh: true };
  }

  const exp = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
  const response = await coordinator.fetch('https://checkout-intents.internal/consume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nonce: `supporter-email:${normalizedOrderId}`,
      cartHash: 'supporter-email',
      exp
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (response.ok && payload.ok === true) {
    return { ok: true, fresh: true };
  }

  if (response.status === 409) {
    return { ok: true, fresh: false };
  }

  console.warn('📧 Supporter email nonce coordinator unavailable, continuing without dedupe:', {
    orderId: normalizedOrderId,
    status: response.status,
    error: payload.error || 'unknown'
  });
  return { ok: true, fresh: true };
}

function getSupporterEmailRetryKey(orderId) {
  return `${SUPPORTER_EMAIL_RETRY_PREFIX}${String(orderId || '').trim()}`;
}

function getSupporterEmailRetryDelayMs(attempts) {
  const normalizedAttempts = Math.max(1, Number(attempts) || 1);
  return Math.min(12 * 60 * 60 * 1000, 5 * 60 * 1000 * (2 ** (normalizedAttempts - 1)));
}

async function updatePledgeEmailDeliveryState(env, orderId, updates = {}) {
  const normalizedOrderId = String(orderId || '').trim();
  if (!env.PLEDGES || !normalizedOrderId || !updates || typeof updates !== 'object') {
    return;
  }

  const pledge = await env.PLEDGES.get(`pledge:${normalizedOrderId}`, { type: 'json' });
  if (!pledge) return;

  await env.PLEDGES.put(`pledge:${normalizedOrderId}`, JSON.stringify({
    ...pledge,
    ...updates
  }));
}

async function queueSupporterEmailRetry(env, { orderId, payload, error, attempts = 0 }) {
  const normalizedOrderId = String(orderId || '').trim();
  if (!env.PLEDGES || !normalizedOrderId || !payload) {
    return;
  }

  const retryKey = getSupporterEmailRetryKey(normalizedOrderId);
  const existing = await env.PLEDGES.get(retryKey, { type: 'json' });
  const nextAttempts = Math.max(Number(existing?.attempts || 0), Number(attempts || 0)) + 1;
  const now = new Date();
  const nextAttemptAt = new Date(now.getTime() + getSupporterEmailRetryDelayMs(nextAttempts)).toISOString();
  const lastError = String(error || 'Unknown supporter email error');

  await env.PLEDGES.put(retryKey, JSON.stringify({
    orderId: normalizedOrderId,
    payload,
    attempts: nextAttempts,
    createdAt: existing?.createdAt || now.toISOString(),
    lastAttemptAt: now.toISOString(),
    nextAttemptAt,
    lastError
  }), { expirationTtl: SUPPORTER_EMAIL_RETRY_TTL_SECONDS });

  await updatePledgeEmailDeliveryState(env, normalizedOrderId, {
    emailSent: false,
    emailError: lastError,
    emailRetryQueuedAt: now.toISOString(),
    emailRetryAttempts: nextAttempts,
    emailNextRetryAt: nextAttemptAt
  });
}

async function clearSupporterEmailRetry(env, orderId) {
  const normalizedOrderId = String(orderId || '').trim();
  if (!env.PLEDGES || !normalizedOrderId) {
    return;
  }

  await env.PLEDGES.delete(getSupporterEmailRetryKey(normalizedOrderId));
}

async function attemptSupporterEmailDelivery(env, { orderId, payload, attempts = 0 }) {
  const normalizedOrderId = String(orderId || '').trim();
  try {
    await sendSupporterEmail(env, payload);
    await clearSupporterEmailRetry(env, normalizedOrderId);
    await updatePledgeEmailDeliveryState(env, normalizedOrderId, {
      emailSent: true,
      emailError: null,
      emailSentAt: new Date().toISOString(),
      emailRetryQueuedAt: null,
      emailRetryAttempts: Number(attempts || 0),
      emailNextRetryAt: null
    });
    return { ok: true };
  } catch (err) {
    const message = err?.message || 'Unknown supporter email error';
    await queueSupporterEmailRetry(env, {
      orderId: normalizedOrderId,
      payload,
      error: message,
      attempts
    });
    return { ok: false, error: message };
  }
}

async function processQueuedSupporterEmails(env, { maxJobs = SUPPORTER_EMAIL_RETRY_BATCH_SIZE } = {}) {
  if (!env.PLEDGES) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  const dueRecords = [];
  let cursor;

  do {
    const page = await env.PLEDGES.list({ prefix: SUPPORTER_EMAIL_RETRY_PREFIX, cursor });
    for (const entry of page?.keys || []) {
      const record = await env.PLEDGES.get(entry.name, { type: 'json' });
      if (!record?.orderId || !record?.payload) continue;
      if (!record.nextAttemptAt || Date.parse(record.nextAttemptAt) <= Date.now()) {
        dueRecords.push(record);
      }
    }
    cursor = page?.list_complete ? undefined : page?.cursor;
  } while (cursor);

  dueRecords.sort((left, right) => {
    const leftTime = Date.parse(left?.nextAttemptAt || left?.createdAt || 0);
    const rightTime = Date.parse(right?.nextAttemptAt || right?.createdAt || 0);
    return leftTime - rightTime;
  });

  let processed = 0;
  let sent = 0;
  let failed = 0;

  for (const record of dueRecords.slice(0, Math.max(1, Number(maxJobs) || SUPPORTER_EMAIL_RETRY_BATCH_SIZE))) {
    processed++;
    const result = await attemptSupporterEmailDelivery(env, {
      orderId: record.orderId,
      payload: record.payload,
      attempts: Number(record.attempts || 0)
    });
    if (result.ok) {
      sent++;
    } else {
      failed++;
    }
  }

  return { processed, sent, failed };
}

function createCheckoutNonce() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isFirstPartyOrderId(orderId) {
  return /^pool-intent-[a-z0-9_-]+$/i.test(String(orderId || ''));
}

async function handleFirstPartyCheckoutStart(request, env) {
  if (getCheckoutProvider(env) !== 'first_party') {
    return jsonResponse({ error: 'Not found' }, 404);
  }

  const trustedOrigin = requireTrustedSiteOrigin(request, env);
  if (!trustedOrigin.ok) return trustedOrigin.response;

  const rateLimit = await checkRateLimit(request, env, RATE_LIMITS.start);
  if (!rateLimit.allowed) return rateLimit.response;

  const parsedBody = await parseJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
    privateResponse: true
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;
  const {
    campaignSlug,
    items,
    customAmount = 0,
    email,
    tipPercent,
    preferredLang,
    billingAddress,
    shippingAddress,
    shippingOption,
    bundleAddOnAnchorCampaignSlug
  } = body || {};
  const normalizedPreferredLang = normalizePreferredLang(preferredLang);
  const normalizedTipPercent = sanitizePlatformTipPercent(
    tipPercent,
    getDefaultPlatformTipPercent(env),
    getMaxPlatformTipPercent(env)
  );
  if (campaignSlug && !isValidSlug(campaignSlug)) {
    return privateJsonResponse({ error: 'Invalid campaign slug format' }, 400, env);
  }

  if (email && !isValidEmail(email)) {
    return privateJsonResponse({ error: 'Invalid email format' }, 400, env);
  }

  const normalizedDestination = shippingAddress
    ? normalizeShippingDestination(shippingAddress)
    : { valid: false, destination: null };
  if (shippingAddress && !normalizedDestination.valid) {
    return privateJsonResponse({ error: normalizedDestination.error }, 400, env);
  }
  const normalizedShippingTaxAddress = normalizedDestination.valid
    ? normalizeTaxDestination(normalizedDestination.destination)
    : { valid: false, destination: null };
  const normalizedBillingAddress = billingAddress
    ? normalizeTaxDestination(billingAddress)
    : { valid: false, destination: null };
  if (billingAddress && !normalizedBillingAddress.valid) {
    return privateJsonResponse({ error: normalizedBillingAddress.error }, 400, env);
  }

  const parsedCart = extractCampaignCartsFromFirstPartyItems(
    items,
    customAmount,
    campaignSlug,
    bundleAddOnAnchorCampaignSlug
  );
  if (!parsedCart.valid) {
    return privateJsonResponse({ error: parsedCart.error }, 400, env);
  }

  const orderCarts = parsedCart.carts || [];
  const validatedBundleAddOns = await validateBundleAddOns(env, parsedCart.bundleAddOns || []);
  if (!validatedBundleAddOns.valid) {
    return privateJsonResponse({ error: validatedBundleAddOns.error }, 400, env);
  }
  const bundleAddOns = validatedBundleAddOns.bundleAddOns || [];
  const resolvedBundleAddOnAnchorCampaignSlug = bundleAddOns.length > 0
    ? parsedCart.bundleAddOnAnchorCampaignSlug
    : null;
  if (orderCarts.length === 0) {
    return privateJsonResponse({ error: 'Your cart is empty.' }, 400, env);
  }

  const checkoutGroups = [];
  for (const orderCart of orderCarts) {
    if (!orderCart.campaignSlug) {
      return privateJsonResponse({ error: 'Could not determine campaign from cart contents' }, 400, env);
    }

    const { valid, error, campaign } = await isCampaignLive(env, orderCart.campaignSlug);
    if (!valid) {
      return privateJsonResponse({ error: error || 'Campaign not accepting pledges' }, 400, env);
    }

    const tierSelection = buildTierSelectionFromStartRequest(campaign, {
      tierId: orderCart.tierSelections[0]?.id || null,
      tierQty: orderCart.tierSelections[0]?.qty || 1,
      additionalTiers: orderCart.tierSelections.slice(1)
    });
    if (!tierSelection.valid) {
      return privateJsonResponse({ error: tierSelection.error }, 400, env);
    }

    const desiredSupportItems = buildDesiredSupportItems(campaign, [], orderCart.supportItems);
    if (!desiredSupportItems.valid) {
      return privateJsonResponse({ error: desiredSupportItems.error }, 400, env);
    }

    const canonicalContribution = await buildCanonicalContributionForStoredShipping(env, campaign, {
      tierSelection,
      supportItems: desiredSupportItems.supportItems,
      customAmount: orderCart.customAmount,
      bundleAddOns: getBundleAddOnsForAnchorCampaign(
        bundleAddOns,
        resolvedBundleAddOnAnchorCampaignSlug,
        orderCart.campaignSlug
      ),
      tipPercent: normalizedTipPercent,
      taxDestination: normalizedBillingAddress.valid
        ? normalizedBillingAddress.destination
        : (normalizedShippingTaxAddress.valid ? normalizedShippingTaxAddress.destination : null),
      shippingAddress: normalizedDestination.valid ? normalizedDestination.destination : null,
      shippingOption
    });
    if (!canonicalContribution.valid) {
      return privateJsonResponse({ error: canonicalContribution.error }, 400, env);
    }

    const sessionShape = compareCartShapeToContribution(orderCart, canonicalContribution);
    if (!sessionShape.valid) {
      return privateJsonResponse({ error: sessionShape.error }, 400, env);
    }

    const thresholdValidation = await validateTierThresholdSelection(
      env,
      orderCart.campaignSlug,
      campaign,
      canonicalContribution.selectedTiers
    );
    if (!thresholdValidation.valid) {
      return privateJsonResponse({ error: thresholdValidation.error }, 400, env);
    }

    const availability = await ensureTierAvailability(
      env,
      orderCart.campaignSlug,
      campaign,
      canonicalContribution.selectedTiers
    );
    if (!availability.valid) {
      return privateJsonResponse({ error: availability.error, remaining: availability.remaining }, 400, env);
    }

    checkoutGroups.push({
      campaign,
      campaignSlug: orderCart.campaignSlug,
      canonicalContribution
    });
  }

  if (!env.CHECKOUT_INTENT_SECRET) {
    return privateJsonResponse({ error: 'Checkout intent signing unavailable' }, 503, env);
  }

  const bundleTotals = checkoutGroups.reduce((totals, group) => ({
    subtotal: totals.subtotal + (group.canonicalContribution.totals.subtotal || 0),
    tax: totals.tax + (group.canonicalContribution.totals.tax || 0),
    shipping: totals.shipping + (group.canonicalContribution.totals.shipping || 0),
    tipAmount: totals.tipAmount + (group.canonicalContribution.totals.tipAmount || 0),
    amount: totals.amount + (group.canonicalContribution.totals.amount || 0)
  }), {
    subtotal: 0,
    tax: 0,
    shipping: 0,
    tipAmount: 0,
    amount: 0
  });

  const nonce = createCheckoutNonce();
  const checkoutIntentExp = Math.floor(Date.now() / 1000) + DEFAULT_CHECKOUT_INTENT_TTL_SECONDS;
  const checkoutHashInput = buildCheckoutBundleHashInput({
    bundleAddOns,
    bundleAddOnAnchorCampaignSlug: resolvedBundleAddOnAnchorCampaignSlug,
    contributions: checkoutGroups.map((group) => ({
      campaignSlug: group.campaignSlug,
      canonicalContribution: group.canonicalContribution,
      tipPercent: normalizedTipPercent
    }))
  });
  const checkoutCartHash = await hashCheckoutBundle(checkoutHashInput);

  const nonceResult = await consumeCheckoutIntentNonce(env, {
    nonce,
    cartHash: checkoutCartHash,
    exp: checkoutIntentExp
  });
  if (!nonceResult.ok) {
    return privateJsonResponse({ error: nonceResult.error }, nonceResult.status, env);
  }

  const orderId = `pool-intent-${nonce}`;
  const bundleManifest = {
    orderId,
    checkoutProvider: 'first_party',
    preferredLang: normalizedPreferredLang,
    campaignCount: checkoutGroups.length,
    bundleAddOnAnchorCampaignSlug: resolvedBundleAddOnAnchorCampaignSlug,
    bundleAddOns,
    bundleAddOnTotals: {
      count: bundleAddOns.length,
      quantity: bundleAddOns.reduce((sum, entry) => sum + (Number(entry.quantity) || 0), 0),
      subtotal: bundleAddOns.reduce((sum, entry) => sum + ((Number(entry.unitPrice) || 0) * (Number(entry.quantity) || 0)), 0)
    },
    tipPercent: normalizedTipPercent,
    billingAddress: normalizedBillingAddress.valid ? normalizedBillingAddress.destination : null,
    totals: bundleTotals,
    campaigns: checkoutGroups.map((group) => ({
      orderId: checkoutGroups.length === 1 ? orderId : buildBundleOrderId(orderId, group.campaignSlug),
      campaignSlug: group.campaignSlug,
      tierId: group.canonicalContribution.tierId || '',
      tierName: group.canonicalContribution.tierName || '',
      tierQty: group.canonicalContribution.tierQty || 1,
      additionalTiers: group.canonicalContribution.additionalTiers || [],
      supportItems: group.canonicalContribution.supportItems || [],
      customAmount: group.canonicalContribution.customAmount || 0,
      hasPhysical: group.canonicalContribution.hasPhysical === true,
      shippingOption: group.canonicalContribution.shippingOption || 'standard',
      totals: group.canonicalContribution.totals
    }))
  };

  if (env.PLEDGES) {
    await env.PLEDGES.put(
      getCheckoutBundleStorageKey(orderId),
      JSON.stringify(bundleManifest),
      { expirationTtl: 86400 }
    );
  }

  const reservedCheckoutGroups = [];
  try {
    for (const group of checkoutGroups) {
      const checkoutOrderId = checkoutGroups.length === 1
        ? orderId
        : buildBundleOrderId(orderId, group.campaignSlug);
      const reservation = await saveTierReservation(
        env,
        group.campaignSlug,
        checkoutOrderId,
        group.canonicalContribution.selectedTiers,
        group.campaign
      );
      if (!reservation?.success) {
        throw new Error(reservation.error || 'Failed to reserve limited inventory');
      }
      reservedCheckoutGroups.push({ campaignSlug: group.campaignSlug, orderId: checkoutOrderId });
    }
  } catch (reservationErr) {
    if (env.PLEDGES) {
      await env.PLEDGES.delete(getCheckoutBundleStorageKey(orderId));
    }
    for (const reservedGroup of reservedCheckoutGroups) {
      await clearTierReservation(env, reservedGroup.campaignSlug, reservedGroup.orderId);
    }
    return privateJsonResponse({ error: reservationErr.message }, 409, env);
  }

  const stripe = createStripeClient(getStripeKey(env));
  const { usingCustomCheckoutUi, stripePublishableKey } = resolveCheckoutUiRuntime(env);

  try {
    const allowedShippingCountries = [
      'US', 'CA', 'MX', 'AR', 'BR', 'CL', 'CO', 'CR', 'DO', 'EC', 'GT', 'JM', 'PA', 'PE', 'PR', 'UY',
      'AT', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU',
      'IE', 'IS', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
      'AU', 'IN', 'JP', 'KR'
    ];
    const sessionParams = {
      mode: 'setup',
      payment_method_types: ['card', 'link'],
      metadata: {
        orderId,
        campaignSlug: checkoutGroups[0].campaignSlug,
        amountCents: String(bundleTotals.subtotal),
        tierId: checkoutGroups.length === 1 ? (checkoutGroups[0].canonicalContribution.tierId || '') : '',
        tierName: checkoutGroups.length === 1 ? (checkoutGroups[0].canonicalContribution.tierName || '') : '',
        tierQty: String(checkoutGroups.length === 1 ? (checkoutGroups[0].canonicalContribution.tierQty || 1) : 0),
        tipPercent: String(normalizedTipPercent),
        shippingOption: checkoutGroups.length === 1 ? (checkoutGroups[0].canonicalContribution.shippingOption || 'standard') : '',
        hasAdditionalTiers: checkoutGroups.some((group) => group.canonicalContribution.additionalTiers.length > 0) ? 'true' : '',
        hasExtras: checkoutGroups.some((group) => group.canonicalContribution.supportItems.length > 0 || group.canonicalContribution.customAmount > 0) ? 'true' : '',
        hasPhysical: checkoutGroups.some((group) => group.canonicalContribution.hasPhysical) ? 'true' : '',
        checkoutBundleMode: checkoutGroups.length > 1 ? 'true' : '',
        checkoutBundleCount: String(checkoutGroups.length),
        checkoutBundleHasAddOns: bundleAddOns.length > 0 ? 'true' : '',
        bundleAddOnAnchorCampaignSlug: resolvedBundleAddOnAnchorCampaignSlug || '',
        checkoutProvider: 'first_party',
        preferredLang: normalizedPreferredLang,
        checkoutNonce: nonce,
        checkoutCartHash,
        checkoutSnapshotVersion: String(CHECKOUT_INTENT_VERSION)
      }
    };

    if (usingCustomCheckoutUi) {
      sessionParams.ui_mode = 'custom';
      sessionParams.return_url = getLocalizedSiteUrl(env, `/pledge-success/?orderId=${orderId}`, normalizedPreferredLang);
      sessionParams.consent_collection = {
        payment_method_reuse_agreement: {
          position: 'hidden'
        }
      };
    } else {
      sessionParams.success_url = getLocalizedSiteUrl(env, `/pledge-success/?orderId=${orderId}`, normalizedPreferredLang);
      sessionParams.cancel_url = getLocalizedSiteUrl(env, '/pledge-cancelled/', normalizedPreferredLang);
    }

    if (email) {
      sessionParams.customer_email = email;
    }

    if (checkoutGroups.some((group) => group.canonicalContribution.hasPhysical)) {
      sessionParams.shipping_address_collection = {
        allowed_countries: allowedShippingCountries
      };
    }

    const session = await stripe.checkout.sessions.create(
      sessionParams,
      usingCustomCheckoutUi ? { stripeVersion: STRIPE_CUSTOM_UI_MODE_API_VERSION } : undefined
    );

    if (usingCustomCheckoutUi) {
      if (!session.client_secret) {
        throw new Error('Stripe custom checkout session missing client_secret');
      }

      return privateJsonResponse({
        checkoutUiMode: 'custom',
        sessionId: session.id,
        clientSecret: session.client_secret,
        publishableKey: stripePublishableKey,
        orderId
      }, 200, env);
    }

    return privateJsonResponse({ checkoutUiMode: 'hosted', url: session.url }, 200, env);
  } catch (stripeErr) {
    if (env.PLEDGES) {
      await env.PLEDGES.delete(getCheckoutBundleStorageKey(orderId));
    }
    for (const reservedGroup of reservedCheckoutGroups) {
      await clearTierReservation(env, reservedGroup.campaignSlug, reservedGroup.orderId);
    }
    return privateJsonResponse({ error: 'Failed to create checkout session: ' + stripeErr.message }, 500, env);
  }
}

async function handleShippingQuote(request, env) {
  const trustedOrigin = requireTrustedSiteOrigin(request, env);
  if (!trustedOrigin.ok) return trustedOrigin.response;

  const rateLimit = await checkRateLimit(request, env, RATE_LIMITS.shipping);
  if (!rateLimit.allowed) return rateLimit.response;

  const parsedBody = await parseJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
    privateResponse: true
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;

  const {
    campaignSlug,
    items,
    customAmount = 0,
    shippingAddress,
    shippingOption,
    bundleAddOnAnchorCampaignSlug
  } = body || {};

  if (campaignSlug && !isValidSlug(campaignSlug)) {
    return privateJsonResponse({ error: 'Invalid campaign slug format' }, 400, env);
  }

  const normalizedDestination = normalizeShippingDestination(shippingAddress);
  if (!normalizedDestination.valid) {
    return privateJsonResponse({ error: normalizedDestination.error }, 400, env);
  }

  const parsedCart = extractCampaignCartsFromFirstPartyItems(
    items,
    customAmount,
    campaignSlug,
    bundleAddOnAnchorCampaignSlug
  );
  if (!parsedCart.valid) {
    return privateJsonResponse({ error: parsedCart.error }, 400, env);
  }

  const validatedBundleAddOns = await validateBundleAddOns(env, parsedCart.bundleAddOns || []);
  if (!validatedBundleAddOns.valid) {
    return privateJsonResponse({ error: validatedBundleAddOns.error }, 400, env);
  }

  const orderCarts = parsedCart.carts || [];
  if (orderCarts.length === 0) {
    return privateJsonResponse({ error: 'Your cart is empty.' }, 400, env);
  }

  const quotes = [];
  const platformBundleAddOns = getPlatformBundleAddOns(validatedBundleAddOns.bundleAddOns || []);
  for (const orderCart of orderCarts) {
    const campaign = await getCampaign(env, orderCart.campaignSlug);
    if (!campaign) {
      return privateJsonResponse({ error: `Campaign "${orderCart.campaignSlug}" not found` }, 404, env);
    }

    const tierSelection = buildTierSelectionFromStartRequest(campaign, {
      tierId: orderCart.tierSelections[0]?.id || null,
      tierQty: orderCart.tierSelections[0]?.qty || 1,
      additionalTiers: orderCart.tierSelections.slice(1)
    });
    if (!tierSelection.valid) {
      return privateJsonResponse({ error: tierSelection.error }, 400, env);
    }

    const desiredSupportItems = buildDesiredSupportItems(campaign, [], orderCart.supportItems);
    if (!desiredSupportItems.valid) {
      return privateJsonResponse({ error: desiredSupportItems.error }, 400, env);
    }

    const quote = await quoteCampaignShipment(
      env,
      campaign,
      tierSelection,
      normalizedDestination.destination,
      desiredSupportItems.supportItems,
      shippingOption,
      getCampaignScopedBundleAddOns(validatedBundleAddOns.bundleAddOns || [], orderCart.campaignSlug)
    );
    if (!quote.valid) {
      return privateJsonResponse({ error: quote.error }, 400, env);
    }

    quotes.push({
      campaignSlug: quote.campaignSlug,
      shippingCents: quote.quote.shippingCents,
      source: quote.quote.source,
      carrier: quote.quote.carrier,
      service: quote.quote.service,
      domestic: quote.quote.domestic,
      availableOptions: quote.availableOptions,
      defaultOption: quote.defaultOption,
      selectedOption: quote.selectedOption,
      shipment: quote.shipment
    });
  }

  if (bundleAddOnsIncludePhysical(platformBundleAddOns)) {
    const platformQuote = await quoteCampaignShipment(
      env,
      null,
      { selectedTiers: [] },
      normalizedDestination.destination,
      [],
      shippingOption,
      platformBundleAddOns
    );
    if (!platformQuote.valid) {
      return privateJsonResponse({ error: platformQuote.error }, 400, env);
    }

    quotes.push({
      campaignSlug: '',
      shippingCents: platformQuote.quote.shippingCents,
      source: platformQuote.quote.source,
      carrier: platformQuote.quote.carrier,
      service: platformQuote.quote.service,
      domestic: platformQuote.quote.domestic,
      availableOptions: platformQuote.availableOptions,
      defaultOption: platformQuote.defaultOption,
      selectedOption: platformQuote.selectedOption,
      shipment: platformQuote.shipment
    });
  }

  return privateJsonResponse({
    quotes,
    totalShippingCents: quotes.reduce((sum, quote) => sum + (Number(quote.shippingCents) || 0), 0),
    shippingAddress: normalizedDestination.destination
  }, 200, env);
}

async function handleTaxQuote(request, env) {
  const trustedOrigin = requireTrustedSiteOrigin(request, env);
  if (!trustedOrigin.ok) return trustedOrigin.response;

  const rateLimit = await checkRateLimit(request, env, RATE_LIMITS.tax);
  if (!rateLimit.allowed) return rateLimit.response;

  const parsedBody = await parseJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
    privateResponse: true
  });
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.body || {};
  const subtotalCents = Math.max(0, Number(body.subtotalCents) || 0);
  const shippingCents = Math.max(0, Number(body.shippingCents) || 0);

  if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) {
    return privateJsonResponse({ error: 'Subtotal is required' }, 400, env);
  }

  const normalizedBillingAddress = body.billingAddress
    ? normalizeTaxDestination(body.billingAddress)
    : { valid: false, destination: null };
  if (body.billingAddress && !normalizedBillingAddress.valid) {
    return privateJsonResponse({ error: normalizedBillingAddress.error }, 400, env);
  }

  const normalizedShippingTaxAddress = body.shippingAddress
    ? normalizeTaxDestination(body.shippingAddress)
    : { valid: false, destination: null };
  if (body.shippingAddress && !normalizedShippingTaxAddress.valid) {
    return privateJsonResponse({ error: normalizedShippingTaxAddress.error }, 400, env);
  }

  const taxDestination = normalizedBillingAddress.valid
    ? normalizedBillingAddress.destination
    : (normalizedShippingTaxAddress.valid ? normalizedShippingTaxAddress.destination : null);
  if (!taxDestination) {
    return privateJsonResponse({ error: 'Billing or shipping address is required to calculate tax' }, 400, env);
  }

  try {
    const taxQuote = await quoteTax(env, {
      subtotalCents,
      shippingCents,
      destination: taxDestination
    });

    return privateJsonResponse({
      subtotalCents,
      shippingCents,
      taxCents: taxQuote.taxCents,
      taxDetails: sanitizeStoredTaxDetails(taxQuote, {
        destination: taxDestination,
        taxableSubtotalCents: subtotalCents,
        taxableShippingCents: 0,
        shippingTaxed: false,
        shippingCents
      }),
      destination: taxDestination
    }, 200, env);
  } catch (error) {
    return privateJsonResponse({
      error: error instanceof Error ? error.message : 'Tax quote failed'
    }, 503, env);
  }
}

async function handleFirstPartyCheckoutSummary(request, env) {
  if (getCheckoutProvider(env) !== 'first_party') {
    return jsonResponse({ error: 'Not found' }, 404);
  }

  if (!env.PLEDGES) {
    return jsonResponse({ error: 'Pledge storage unavailable' }, 503);
  }

  const url = new URL(request.url);
  const orderId = url.searchParams.get('orderId');

  if (!isFirstPartyOrderId(orderId)) {
    return jsonResponse({ error: 'Invalid orderId' }, 400);
  }

  const pledge = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
  if (!pledge) {
    const bundle = await env.PLEDGES.get(getCheckoutBundleStorageKey(orderId), { type: 'json' });
    if (bundle?.campaigns?.length) {
      const campaignTitles = [];
      for (const entry of bundle.campaigns) {
        const campaign = await getCampaign(env, entry.campaignSlug);
        campaignTitles.push(campaign?.title || entry.campaignSlug);
      }

      const shippingCollected = bundle.campaigns.some((entry) => entry.hasPhysical === true);

      return privateJsonResponse({
        orderId: bundle.orderId || orderId,
        campaignSlug: bundle.campaigns[0]?.campaignSlug || null,
        campaignTitle: campaignTitles.length === 1 ? campaignTitles[0] : null,
        campaignTitles,
        persisted: Boolean(bundle.confirmedAt),
        pledgeStatus: 'active',
        createdAt: null,
        shippingCollected,
        totals: {
          subtotal: Number(bundle?.totals?.subtotal || 0),
          tax: Number(bundle?.totals?.tax || 0),
          shipping: Number(bundle?.totals?.shipping || 0),
          tipAmount: Number(bundle?.totals?.tipAmount || 0),
          amount: Number(bundle?.totals?.amount || 0)
        }
      }, 200, env);
    }

    return privateJsonResponse({ error: 'Not found' }, 404, env);
  }

  const campaign = await getCampaign(env, pledge.campaignSlug);

  const shippingCollected = Boolean(
    pledge?.shippingAddress?.name ||
    pledge?.shippingAddress?.address1 ||
    pledge?.shippingAddress?.city ||
    pledge?.shippingAddress?.postalCode ||
    pledge?.shippingAddress?.country
  );

  return privateJsonResponse({
    orderId: pledge.orderId,
    campaignSlug: pledge.campaignSlug,
    campaignTitle: campaign?.title || null,
    persisted: true,
    pledgeStatus: pledge.pledgeStatus || 'active',
    createdAt: pledge.createdAt || null,
    shippingCollected,
    totals: {
      subtotal: Number(pledge?.subtotal || 0),
      tax: Number(pledge?.tax || 0),
      shipping: Number(pledge?.shipping || 0),
      tipAmount: Number(pledge?.tipAmount || 0),
      amount: Number(pledge?.amount || 0)
    }
  }, 200, env);
}

async function handleFirstPartyCheckoutRecovery(request, env) {
  if (getCheckoutProvider(env) !== 'first_party') {
    return jsonResponse({ error: 'Not found' }, 404);
  }

  const url = new URL(request.url);
  const campaignSlug = url.searchParams.get('campaignSlug');

  if (!campaignSlug || !isValidSlug(campaignSlug)) {
    return jsonResponse({ error: 'Invalid campaign slug format' }, 400);
  }

  const campaign = await getCampaign(env, campaignSlug);
  if (!campaign) {
    return jsonResponse({ error: 'Campaign not found' }, 404);
  }

  const liveCheck = await isCampaignLive(env, campaignSlug);
  const campaignTitle = campaign.title || campaignSlug;
  const acceptingPledges = liveCheck.valid === true;

  return jsonResponse({
    campaignSlug,
    campaignTitle,
    effectiveState: getEffectiveState(campaign),
    acceptingPledges,
    statusMessage: acceptingPledges
      ? `${campaignTitle} is still accepting pledges.`
      : (liveCheck.error || 'Campaign not accepting pledges')
  }, 200, env);
}

async function handleFirstPartyCheckoutComplete(request, env, ctx) {
  if (getCheckoutProvider(env) !== 'first_party') {
    return jsonResponse({ error: 'Not found' }, 404);
  }

  const trustedOrigin = requireTrustedSiteOrigin(request, env);
  if (!trustedOrigin.ok) return trustedOrigin.response;

  const parsedBody = await parseJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
    privateResponse: true
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;

  const orderId = String(body?.orderId || '').trim();
  const sessionId = String(body?.sessionId || '').trim();

  if (!isFirstPartyOrderId(orderId)) {
    return privateJsonResponse({ error: 'Invalid orderId' }, 400, env);
  }

  const rateLimit = await checkRateLimit(request, env, {
    ...RATE_LIMITS.complete,
    keyFn: () => orderId || 'unknown'
  });
  if (!rateLimit.allowed) return rateLimit.response;

  if (!sessionId) {
    return privateJsonResponse({ error: 'Missing sessionId' }, 400, env);
  }

  if (!env.PLEDGES) {
    return privateJsonResponse({ error: 'Pledge storage unavailable' }, 503, env);
  }

  const existingPledge = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
  if (existingPledge) {
    return privateJsonResponse({
      success: true,
      recovered: false,
      persisted: true,
      orderId
    }, 200, env);
  }

  const stripe = createStripeClient(getStripeKey(env));

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session) {
      return privateJsonResponse({ error: 'Checkout session not found' }, 404, env);
    }

    if (String(session?.metadata?.orderId || '') !== orderId) {
      return privateJsonResponse({ error: 'Checkout session does not match orderId' }, 409, env);
    }

    if (session.status !== 'complete') {
      return privateJsonResponse({
        error: 'Checkout session is not complete',
        persisted: false,
        status: session.status
      }, 409, env);
    }

    if (session.mode !== 'setup') {
      return privateJsonResponse({ error: 'Session is not a setup mode session' }, 400, env);
    }
    const metadata = session.metadata || {};
    const bundleManifest = await loadCheckoutBundleManifest(env, orderId);
    const setupIntentId = session.setup_intent;
    const normalizedTipPercent = metadata.tipPercent === undefined || metadata.tipPercent === null || metadata.tipPercent === ''
      ? 0
      : sanitizePlatformTipPercent(
        metadata.tipPercent,
        getDefaultPlatformTipPercent(env),
        getMaxPlatformTipPercent(env)
      );
    const email = session.customer_email || session.customer_details?.email;
    let customerId = session.customer;

    let shippingAddress = null;
    if (session.shipping_details) {
      const sd = session.shipping_details;
      shippingAddress = {
        name: sd.name || '',
        address1: sd.address?.line1 || '',
        address2: sd.address?.line2 || '',
        city: sd.address?.city || '',
        province: sd.address?.state || '',
        postalCode: sd.address?.postal_code || '',
        country: sd.address?.country || ''
      };
    }
    const recoveredBillingAddress = normalizeTaxDestination(session.customer_details?.address || bundleManifest?.billingAddress || null);

    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    const paymentMethodId = setupIntent.payment_method;

    if (!customerId && setupIntent.customer) {
      customerId = setupIntent.customer;
    }

    if (!customerId) {
      try {
        const newCustomer = await stripe.customers.create({ email });
        if (newCustomer.id) {
          await stripe.paymentMethods.attach(paymentMethodId, { customer: newCustomer.id });
          customerId = newCustomer.id;
        }
      } catch (custErr) {
        console.error('Failed to create Stripe customer during checkout completion:', custErr.message);
      }
    }

    if (metadata.checkoutProvider === 'first_party' && bundleManifest?.campaigns?.length) {
      const recoveryResponse = await processFirstPartyCheckoutBundle({
        env,
        ctx,
        stripe,
        session,
        orderId,
        email,
        customerId,
        paymentMethodId,
        setupIntentId,
        billingAddress: recoveredBillingAddress.valid ? recoveredBillingAddress.destination : null,
        shippingAddress,
        normalizedTipPercent,
        checkoutCartHash: metadata.checkoutCartHash,
        checkoutSnapshotVersion: metadata.checkoutSnapshotVersion,
        bundleManifest,
        markStripeEventProcessed: async () => {}
      });

      if (!recoveryResponse.ok) {
        const payload = await recoveryResponse.json().catch(() => ({}));
        return privateJsonResponse({
          error: payload?.error || 'Failed to complete checkout session',
          persisted: false
        }, recoveryResponse.status || 500, env);
      }

      const summaryBundle = await loadCheckoutBundleManifest(env, orderId);
      const recoveredPledge = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
      const persisted = Boolean(recoveredPledge) || Boolean(summaryBundle?.confirmedAt);

      return privateJsonResponse({
        success: persisted,
        recovered: persisted,
        persisted,
        orderId
      }, persisted ? 200 : 409, env);
    }

    return privateJsonResponse({
      error: 'Checkout session could not be completed from recovery data',
      persisted: false
    }, 409, env);
  } catch (err) {
    return privateJsonResponse({
      error: 'Failed to complete checkout session',
      details: err?.message || 'Unknown error',
      persisted: false
    }, 500, env);
  }
}

async function loadCheckoutBundleManifest(env, orderId) {
  if (!env.PLEDGES || !orderId) return null;
  return env.PLEDGES.get(getCheckoutBundleStorageKey(orderId), { type: 'json' });
}

async function persistCheckoutBundleManifest(env, orderId, manifest) {
  if (!env.PLEDGES || !orderId || !manifest) return;
  await env.PLEDGES.put(getCheckoutBundleStorageKey(orderId), JSON.stringify(manifest), { expirationTtl: 86400 });
}

async function processFirstPartyCheckoutBundle({
  env,
  ctx,
  stripe,
  session,
  orderId,
  email,
  customerId,
  paymentMethodId,
  setupIntentId,
  billingAddress,
  shippingAddress,
  normalizedTipPercent,
  checkoutCartHash,
  checkoutSnapshotVersion,
  bundleManifest,
  markStripeEventProcessed
}) {
  if (!bundleManifest?.campaigns?.length) {
    return jsonResponse({ error: 'Missing checkout bundle data' }, 409);
  }

  if (String(checkoutSnapshotVersion || '') !== String(CHECKOUT_INTENT_VERSION)) {
    console.error('📝 Invalid first-party checkout snapshot version:', checkoutSnapshotVersion);
    return jsonResponse({ error: 'Invalid checkout snapshot version' }, 409);
  }

  const bundleHashInput = buildCheckoutBundleHashInput({
    bundleAddOns: bundleManifest.bundleAddOns || [],
    bundleAddOnAnchorCampaignSlug: bundleManifest.bundleAddOnAnchorCampaignSlug || '',
    contributions: bundleManifest.campaigns.map((entry) => ({
      campaignSlug: entry.campaignSlug,
      canonicalContribution: {
        selectedTiers: [
          ...(entry.tierId ? [{ id: entry.tierId, qty: entry.tierQty || 1 }] : []),
          ...(entry.additionalTiers || [])
        ],
        supportItems: entry.supportItems || [],
        customAmount: entry.customAmount || 0,
        hasPhysical: entry.hasPhysical === true,
        totals: entry.totals || {}
      },
      tipPercent: normalizedTipPercent
    }))
  });
  const recomputedCheckoutCartHash = await hashCheckoutBundle(bundleHashInput);
  if (recomputedCheckoutCartHash !== checkoutCartHash) {
    console.error('📝 First-party checkout cart hash mismatch:', {
      orderId,
      expectedHashPrefix: String(checkoutCartHash).slice(0, 12),
      actualHashPrefix: recomputedCheckoutCartHash.slice(0, 12)
    });
    return jsonResponse({ error: 'Checkout integrity verification failed' }, 409);
  }

  const processedCampaigns = [];
  const confirmedCampaigns = [];
  const supporterEmailJobs = [];

  for (const entry of bundleManifest.campaigns) {
    const campaignSlug = entry.campaignSlug;
    const campaign = await getCampaign(env, campaignSlug);
    const campaignTitle = campaign?.title || campaignSlug.replace(/-/g, ' ').toUpperCase();
    const pledgeOrderId = entry.orderId || buildBundleOrderId(orderId, campaignSlug);

    const existingPledge = await env.PLEDGES.get(`pledge:${pledgeOrderId}`, { type: 'json' });
    if (existingPledge) {
      processedCampaigns.push({ orderId: pledgeOrderId, campaignSlug });
      confirmedCampaigns.push({ orderId: pledgeOrderId, campaignSlug, campaignTitle });
      continue;
    }

    const tierSelection = buildTierSelectionFromStartRequest(campaign, {
      tierId: entry.tierId || null,
      tierQty: entry.tierQty || 1,
      additionalTiers: entry.additionalTiers || []
    });
    if (!tierSelection.valid) {
      console.error('📝 Invalid tier selection in webhook bundle:', tierSelection.error);
      return jsonResponse({ error: tierSelection.error }, 409);
    }

    const thresholdValidation = await validateTierThresholdSelection(
      env,
      campaignSlug,
      campaign,
      tierSelection.selectedTiers
    );
    if (!thresholdValidation.valid) {
      console.error('📝 Threshold-gated tier rejected during bundle webhook processing:', thresholdValidation.error);
      return jsonResponse({ error: thresholdValidation.error }, 409);
    }

    const desiredSupportItems = buildDesiredSupportItems(campaign, [], entry.supportItems || []);
    if (!desiredSupportItems.valid) {
      console.error('📝 Invalid support items in webhook bundle:', desiredSupportItems.error);
      return jsonResponse({ error: desiredSupportItems.error }, 409);
    }

    const anchorBundleAddOns = getBundleAddOnsForAnchorCampaign(
      bundleManifest.bundleAddOns || [],
      bundleManifest.bundleAddOnAnchorCampaignSlug || '',
      campaignSlug
    );

    const canonicalContribution = await buildCanonicalContributionForStoredShipping(env, campaign, {
      tierSelection,
      supportItems: desiredSupportItems.supportItems,
      customAmount: entry.customAmount || 0,
      bundleAddOns: anchorBundleAddOns,
      tipPercent: normalizedTipPercent,
      taxDestination: billingAddress || bundleManifest?.billingAddress || null,
      shippingAddress: shippingAddress || null,
      shippingOption: entry.shippingOption || 'standard'
    });
    if (!canonicalContribution.valid) {
      console.error('📝 Invalid pledge contribution in webhook bundle:', canonicalContribution.error);
      return jsonResponse({ error: canonicalContribution.error }, 409);
    }

    const availability = await ensureTierAvailability(
      env,
      campaignSlug,
      campaign,
      canonicalContribution.selectedTiers,
      {},
      pledgeOrderId
    );
    if (!availability.valid) {
      console.warn('📝 Inventory unavailable during bundle webhook processing:', availability.error);
      return jsonResponse({ error: availability.error }, 409);
    }

    const now = new Date().toISOString();
    const pledgeData = {
      orderId: pledgeOrderId,
      email,
      campaignSlug,
      preferredLang: normalizePreferredLang(bundleManifest?.preferredLang, DEFAULT_I18N_LANG),
      tierId: canonicalContribution.tierId,
      tierName: canonicalContribution.tierName,
      tierQty: canonicalContribution.tierQty,
      additionalTiers: canonicalContribution.additionalTiers.length > 0 ? canonicalContribution.additionalTiers : undefined,
      supportItems: canonicalContribution.supportItems.length > 0 ? canonicalContribution.supportItems : undefined,
      bundleAddOns: anchorBundleAddOns.length > 0 ? anchorBundleAddOns : undefined,
      bundleAddOnAnchorCampaignSlug: anchorBundleAddOns.length > 0 ? campaignSlug : undefined,
      bundleAddOnSubtotal: anchorBundleAddOns.length > 0 ? getBundleAddOnSubtotal(anchorBundleAddOns) : 0,
      customAmount: canonicalContribution.customAmount > 0 ? canonicalContribution.customAmount : undefined,
      goalTrackingSubtotal: canonicalContribution.goalTrackingSubtotal,
      shippingOption: canonicalContribution.shippingOption || 'standard',
      billingAddress: billingAddress || bundleManifest?.billingAddress || undefined,
      shippingAddress: canonicalContribution.hasPhysical ? (shippingAddress || undefined) : undefined,
      subtotal: canonicalContribution.totals.subtotal,
      tax: canonicalContribution.totals.tax,
      taxDetails: canonicalContribution.totals.taxDetails,
      shipping: canonicalContribution.totals.shipping,
      tipPercent: canonicalContribution.totals.tipPercent,
      tipAmount: canonicalContribution.totals.tipAmount,
      amount: canonicalContribution.totals.amount,
      stripeCustomerId: customerId,
      stripePaymentMethodId: paymentMethodId,
      stripeSetupIntentId: setupIntentId,
      pledgeStatus: 'active',
      charged: false,
      createdAt: now,
      updatedAt: now,
      history: [{
        type: 'created',
        subtotal: canonicalContribution.totals.subtotal,
        tax: canonicalContribution.totals.tax,
        taxDetails: canonicalContribution.totals.taxDetails,
        shipping: canonicalContribution.totals.shipping,
        tipPercent: canonicalContribution.totals.tipPercent,
        tipAmount: canonicalContribution.totals.tipAmount,
        amount: canonicalContribution.totals.amount,
        shippingOption: canonicalContribution.shippingOption || 'standard',
        billingAddress: billingAddress || bundleManifest?.billingAddress || undefined,
        tierId: canonicalContribution.tierId,
        tierQty: canonicalContribution.tierQty,
        additionalTiers: canonicalContribution.additionalTiers.length > 0 ? canonicalContribution.additionalTiers : undefined,
        supportItems: canonicalContribution.supportItems.length > 0 ? canonicalContribution.supportItems : undefined,
        bundleAddOns: anchorBundleAddOns.length > 0 ? anchorBundleAddOns : undefined,
        bundleAddOnSubtotal: anchorBundleAddOns.length > 0 ? getBundleAddOnSubtotal(anchorBundleAddOns) : 0,
        customAmount: canonicalContribution.customAmount > 0 ? canonicalContribution.customAmount : undefined,
        at: now
      }]
    };

    const persisted = await persistNewPledge(env, {
      campaign,
      campaignSlug,
      pledgeData,
      supportItems: canonicalContribution.supportItems,
      selectedTiers: canonicalContribution.selectedTiers
    });
    if (!persisted.success) {
      console.error('📝 Failed to persist bundle pledge after webhook:', persisted.error);
      return jsonResponse({ error: persisted.error }, 409);
    }

    processedCampaigns.push({ orderId: pledgeOrderId, campaignSlug });
    confirmedCampaigns.push({ orderId: pledgeOrderId, campaignSlug, campaignTitle });

    ctx.waitUntil(
      triggerMilestoneEmails(env, campaignSlug).catch(err => {
        console.error('Milestone email trigger failed:', err.message);
      })
    );

    const emailNonce = await consumeSupporterEmailNonce(env, pledgeOrderId);
    if (emailNonce.fresh) {
      const token = await generateToken(env.MAGIC_LINK_SECRET, {
        orderId: pledgeOrderId,
        email,
        campaignSlug
      });

      supporterEmailJobs.push({
        orderId: pledgeOrderId,
        email,
        campaignSlug,
        campaignTitle,
        preferredLang: pledgeData.preferredLang,
        subtotal: canonicalContribution.totals.subtotal,
        tax: canonicalContribution.totals.tax,
        shipping: canonicalContribution.totals.shipping,
        tipAmount: canonicalContribution.totals.tipAmount,
        tipPercent: canonicalContribution.totals.tipPercent,
        token,
        instagramUrl: campaign?.instagram,
        hasDecisions: campaign?.has_decisions === true,
        pledgeItems: buildPledgeItemsPayload(campaign, canonicalContribution, anchorBundleAddOns)
      });
    }
  }

  await persistCheckoutBundleManifest(env, orderId, {
    ...bundleManifest,
    confirmedAt: new Date().toISOString(),
    confirmedCampaigns
  });

  if (supporterEmailJobs.length > 0) {
    ctx.waitUntil((async () => {
      for (const job of supporterEmailJobs) {
        const { orderId, ...payload } = job;
        const result = await attemptSupporterEmailDelivery(env, {
          orderId,
          payload
        });
        if (!result.ok) {
          console.error('Supporter confirmation email failed after checkout completion:', result.error);
        }
      }
    })());
  }

  await markStripeEventProcessed();
  return jsonResponse({ received: true, bundled: true, pledges: processedCampaigns });
}

async function handleStripeWebhook(request, env, ctx) {
  console.log('📨 Stripe webhook received');
  const startedAt = Date.now();
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');
  let observedEventId = '';
  let observedEventType = 'unknown';
  let observedOrderId = '';
  const finishWebhook = (response, outcome, extra = {}) => {
    queueBackgroundTask(
      ctx,
      recordWebhookObservation(env, {
        outcome,
        eventId: extra.eventId ?? observedEventId,
        eventType: extra.eventType ?? observedEventType,
        orderId: extra.orderId ?? observedOrderId,
        status: response?.status || 0,
        durationMs: Date.now() - startedAt
      }),
      `webhook observation (${outcome})`
    );
    return response;
  };

  // SEC-002: Early mode detection from raw payload to avoid signature mismatch
  // When prod worker (live mode) receives test events, the signature won't verify
  // because test events are signed with a different secret. Parse livemode early
  // and acknowledge if it doesn't match our environment.
  try {
    const parsed = JSON.parse(body);
    const isLiveEvent = parsed.livemode === true;
    const isLiveMode = getAppMode(env) === 'live';
    if (isLiveEvent !== isLiveMode) {
      console.log('📨 Skipping event (mode mismatch, pre-verification):', { 
        eventId: parsed.id, 
        eventType: parsed.type,
        isLiveEvent, 
        isLiveMode 
      });
      return finishWebhook(
        jsonResponse({ received: true, skipped: 'mode mismatch' }, 200),
        'mode_mismatch',
        {
          eventId: parsed.id,
          eventType: parsed.type
        }
      );
    }
  } catch (parseErr) {
    console.error('📨 Failed to parse webhook body for mode check:', parseErr.message);
    // Continue to signature verification which will fail properly
  }

  // SEC-002: If webhook secret is not configured, acknowledge receipt but don't process
  // This prevents Stripe from retrying indefinitely (e.g., test mode webhooks hitting prod worker)
  const webhookSecret = getStripeWebhookSecret(env);
  if (!webhookSecret) {
    console.warn('Stripe webhook secret not configured for this mode, acknowledging receipt');
    return finishWebhook(
      jsonResponse({ received: true, skipped: 'webhook secret not configured' }, 200),
      'secret_missing'
    );
  }

  const { valid, error } = await verifyStripeSignature(body, sig, webhookSecret);
  if (!valid) {
    console.error('Webhook signature verification failed:', error);
    return finishWebhook(jsonResponse({ error: 'Invalid signature' }, 401), 'invalid_signature');
  }

  const event = JSON.parse(body);
  observedEventId = String(event?.id || '').trim();
  observedEventType = String(event?.type || 'unknown').trim() || 'unknown';
  console.log('📨 Event type:', event.type);

  const eventKey = env.PLEDGES ? `stripe-event:${event.id}` : null;
  const markStripeEventProcessed = async () => {
    if (env.PLEDGES && eventKey) {
      await env.PLEDGES.put(eventKey, 'processed', { expirationTtl: 86400 });
    }
  };

  // Idempotency: skip if we've already processed this event
  if (env.PLEDGES && eventKey) {
    const alreadyProcessed = await env.PLEDGES.get(eventKey);
    if (alreadyProcessed) {
      console.log('📨 Skipping duplicate event:', event.id);
      return finishWebhook(jsonResponse({ received: true }), 'duplicate_event');
    }
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    if (session.mode === 'setup') {
      const { orderId, campaignSlug, amountCents, tierId, tierName, tierQty, tipPercent, hasAdditionalTiers, hasExtras, hasPhysical, isPaymentUpdate, checkoutProvider, checkoutNonce, checkoutCartHash, checkoutSnapshotVersion, preferredLang, shippingOption } = session.metadata;
      observedOrderId = String(orderId || '').trim();
      const tierQtyNum = parseInt(tierQty) || 1;
      const normalizedTipPercent = tipPercent === undefined || tipPercent === null || tipPercent === ''
        ? 0
        : sanitizePlatformTipPercent(
          tipPercent,
          getDefaultPlatformTipPercent(env),
          getMaxPlatformTipPercent(env)
        );
      const email = session.customer_email || session.customer_details?.email;
      let customerId = session.customer;
      const setupIntentId = session.setup_intent;

      const bundleManifest = checkoutProvider === 'first_party'
        ? await loadCheckoutBundleManifest(env, orderId)
        : null;

      // Fetch additional tiers from KV if present
      let additionalTiers = [];
      let supportItems = [];
      let customAmount = 0;
      if (checkoutProvider === 'first_party' && bundleManifest?.campaigns?.length === 1) {
        additionalTiers = bundleManifest.campaigns[0].additionalTiers || [];
        supportItems = bundleManifest.campaigns[0].supportItems || [];
        customAmount = bundleManifest.campaigns[0].customAmount || 0;
      } else {
        if (hasAdditionalTiers === 'true' && env.PLEDGES) {
          additionalTiers = await env.PLEDGES.get(`pending-tiers:${orderId}`, { type: 'json' }) || [];
          if (additionalTiers.length > 0) {
            console.log('📨 Found additional tiers for order:', orderId, additionalTiers);
          }
        }

        if (hasExtras === 'true' && env.PLEDGES) {
          const extras = await env.PLEDGES.get(`pending-extras:${orderId}`, { type: 'json' });
          if (extras) {
            supportItems = extras.supportItems || [];
            customAmount = extras.customAmount || 0;
            console.log('📨 Found extras for order:', orderId, { supportItems, customAmount });
          }
        }
      }

      // Extract shipping address from Stripe Checkout session (collected via shipping_address_collection)
      let shippingAddress = null;
      if (hasPhysical === 'true' && session.shipping_details) {
        const sd = session.shipping_details;
        shippingAddress = {
          name: sd.name || '',
          address1: sd.address?.line1 || '',
          address2: sd.address?.line2 || '',
          city: sd.address?.city || '',
          province: sd.address?.state || '',
          postalCode: sd.address?.postal_code || '',
          country: sd.address?.country || ''
        };
        console.log('📨 Captured shipping address from Stripe session:', orderId);
      }
      const recoveredBillingAddress = normalizeTaxDestination(
        session.customer_details?.address ||
        bundleManifest?.billingAddress ||
        null
      );

      const stripe = createStripeClient(getStripeKey(env));
      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      const paymentMethodId = setupIntent.payment_method;

      // Resolve customerId from SetupIntent if not on session (happens when /start
      // fell back to customer_email instead of creating a Stripe customer)
      if (!customerId && setupIntent.customer) {
        customerId = setupIntent.customer;
        console.log('📨 Resolved customerId from SetupIntent:', customerId);
      }

      // Last resort: create a customer and attach the payment method
      if (!customerId) {
        try {
          const newCustomer = await stripe.customers.create({ email });
          if (newCustomer.id) {
            await stripe.paymentMethods.attach(paymentMethodId, { customer: newCustomer.id });
            customerId = newCustomer.id;
            console.log('📨 Created fallback customer:', customerId);
          }
        } catch (custErr) {
          console.error('📨 Failed to create fallback customer:', custErr.message);
        }
      }

      if (checkoutProvider === 'first_party' && bundleManifest?.campaigns?.length > 1 && isPaymentUpdate !== 'true') {
        const bundleResponse = await processFirstPartyCheckoutBundle({
          env,
          ctx,
          stripe,
          session,
          orderId,
          email,
          customerId,
          paymentMethodId,
          setupIntentId,
          billingAddress: recoveredBillingAddress.valid ? recoveredBillingAddress.destination : null,
          shippingAddress,
          normalizedTipPercent,
          checkoutCartHash,
          checkoutSnapshotVersion,
          bundleManifest,
          markStripeEventProcessed
        });
        return finishWebhook(bundleResponse, bundleResponse.status >= 400 ? 'bundled_failed' : 'bundled_processed');
      }

      const campaign = await getCampaign(env, campaignSlug);
      const campaignTitle = campaign?.title || campaignSlug.replace(/-/g, ' ').toUpperCase();

      if (env.PLEDGES) {
        if (isPaymentUpdate === 'true') {
          // Payment method update: just update the payment method on existing pledge
          const existingPledge = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
          if (existingPledge) {
            const wasPaymentFailed = existingPledge.pledgeStatus === 'payment_failed';
            
            existingPledge.stripeCustomerId = customerId;
            existingPledge.stripePaymentMethodId = paymentMethodId;
            existingPledge.stripeSetupIntentId = setupIntentId;
            existingPledge.updatedAt = new Date().toISOString();
            
            // If payment was failed, reset to active
            if (wasPaymentFailed) {
              existingPledge.pledgeStatus = 'active';
              existingPledge.lastPaymentError = null;
            }
            await env.PLEDGES.put(`pledge:${orderId}`, JSON.stringify(existingPledge));
            console.log('📝 Payment method updated for pledge:', orderId);

            // Auto-retry charge if this was a failed payment and campaign is past deadline + funded
            if (wasPaymentFailed && !existingPledge.charged) {
              const pledgeCampaign = await getCampaign(env, existingPledge.campaignSlug);
              if (pledgeCampaign?.goal_deadline && isDeadlinePassed(pledgeCampaign.goal_deadline)) {
                const stats = await getCampaignStats(env, existingPledge.campaignSlug);
                const goalAmountCents = (pledgeCampaign.goal_amount || 0) * 100;
                
                if (stats.pledgedAmount >= goalAmountCents) {
                  console.log('💳 Auto-retrying charge for updated payment method:', orderId);
                  
                  try {
                    const retryStripe = createStripeClient(getStripeKey(env));
                    const paymentIntent = await retryStripe.paymentIntents.create({
                      amount: existingPledge.amount,
                      currency: 'usd',
                      customer: customerId,
                      payment_method: paymentMethodId,
                      off_session: true,
                      confirm: true,
                      metadata: {
                        orderId: existingPledge.orderId,
                        campaignSlug: existingPledge.campaignSlug,
                        email: existingPledge.email
                      }
                    });

                    if (paymentIntent.status === 'succeeded') {
                      existingPledge.charged = true;
                      existingPledge.pledgeStatus = 'charged';
                      existingPledge.chargedAt = new Date().toISOString();
                      existingPledge.stripePaymentIntentId = paymentIntent.id;
                      existingPledge.updatedAt = new Date().toISOString();
                      await env.PLEDGES.put(`pledge:${existingPledge.orderId}`, JSON.stringify(existingPledge));

                      const chargeToken = await generateToken(env.MAGIC_LINK_SECRET, {
                        orderId: existingPledge.orderId,
                        email: existingPledge.email,
                        campaignSlug: existingPledge.campaignSlug
                      });

                      // Build pledge items for email
                      const chargeCampaignTiers = pledgeCampaign?.tiers || [];
                      const chargeAdditionalTiers = (existingPledge.additionalTiers || []).map(t => {
                        const tierData = chargeCampaignTiers.find(ct => ct.id === t.id);
                        return { ...t, name: tierData?.name || t.id };
                      });
                      const chargeSupportItems = (existingPledge.supportItems || []).map(s => {
                        const itemData = pledgeCampaign?.support_items?.find(si => si.id === s.id);
                        return { ...s, label: itemData?.label || s.id };
                      });

                      await sendChargeSuccessEmail(env, {
                        email: existingPledge.email,
                        campaignSlug: existingPledge.campaignSlug,
                        campaignTitle: pledgeCampaign.title || existingPledge.campaignSlug,
                        preferredLang: existingPledge.preferredLang || DEFAULT_I18N_LANG,
                        subtotal: existingPledge.subtotal || existingPledge.amount,
                        tax: existingPledge.tax || 0,
                        taxDetails: getStoredTaxDetails(existingPledge),
                        shipping: existingPledge.shipping || 0,
                        tipAmount: getStoredTipAmount(env, existingPledge),
                        tipPercent: getStoredTipPercent(env, existingPledge, 0),
                        amount: existingPledge.amount,
                        token: chargeToken,
                        hasDecisions: pledgeCampaign?.has_decisions === true,
                        pledgeItems: {
                          tierName: existingPledge.tierName || null,
                          tierQty: existingPledge.tierQty || 1,
                          additionalTiers: chargeAdditionalTiers,
                          supportItems: chargeSupportItems,
                          addOns: getBundleAddOnsWithLabels(existingPledge.bundleAddOns || []),
                          customAmount: existingPledge.customAmount || 0
                        }
                      });
                      console.log('✅ Auto-retry charge succeeded:', orderId);
                    } else {
                      throw new Error(`Payment requires action: ${paymentIntent.status}`);
                    }
                  } catch (chargeErr) {
                    console.error('❌ Auto-retry charge failed:', chargeErr.message);
                    existingPledge.pledgeStatus = 'payment_failed';
                    existingPledge.lastPaymentError = chargeErr.message;
                    existingPledge.updatedAt = new Date().toISOString();
                    await env.PLEDGES.put(`pledge:${existingPledge.orderId}`, JSON.stringify(existingPledge));
                  }
                }
              }
            }
          }
        } else {
          // New pledge: check if already exists (webhook may be retried by Stripe)
          const existingPledge = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
          if (existingPledge) {
            await clearTierReservation(env, campaignSlug, orderId);
            await env.PLEDGES.delete(`pending-tiers:${orderId}`);
            await env.PLEDGES.delete(`pending-extras:${orderId}`);
            await env.PLEDGES.delete(getCheckoutBundleStorageKey(orderId));
            // Duplicate webhook - pledge already processed
            console.log('📝 Pledge already exists, skipping duplicate webhook:', orderId);
            await markStripeEventProcessed();
            return finishWebhook(jsonResponse({ received: true }), 'duplicate_pledge');
          }
          
          const tierSelection = buildTierSelectionFromStartRequest(campaign, {
            tierId,
            tierQty: tierQtyNum,
            additionalTiers
          });
          if (!tierSelection.valid) {
            console.error('📝 Invalid tier selection in webhook metadata:', tierSelection.error);
            return finishWebhook(jsonResponse({ error: tierSelection.error }, 409), 'rejected_conflict');
          }

          const thresholdValidation = await validateTierThresholdSelection(
            env,
            campaignSlug,
            campaign,
            tierSelection.selectedTiers
          );
          if (!thresholdValidation.valid) {
            console.error('📝 Threshold-gated tier rejected during webhook processing:', thresholdValidation.error);
            return finishWebhook(jsonResponse({ error: thresholdValidation.error }, 409), 'rejected_conflict');
          }

          const desiredSupportItems = buildDesiredSupportItems(campaign, [], supportItems);
          if (!desiredSupportItems.valid) {
            console.error('📝 Invalid support items in webhook metadata:', desiredSupportItems.error);
            return finishWebhook(jsonResponse({ error: desiredSupportItems.error }, 409), 'rejected_conflict');
          }

          const anchorBundleAddOns = getBundleAddOnsForAnchorCampaign(
            bundleManifest?.bundleAddOns || [],
            bundleManifest?.bundleAddOnAnchorCampaignSlug || '',
            campaignSlug
          );

          const canonicalContribution = await buildCanonicalContributionForStoredShipping(env, campaign, {
            tierSelection,
            supportItems: desiredSupportItems.supportItems,
            customAmount,
            bundleAddOns: anchorBundleAddOns,
            tipPercent: normalizedTipPercent,
            taxDestination: recoveredBillingAddress.valid ? recoveredBillingAddress.destination : (bundleManifest?.billingAddress || null),
            shippingAddress: shippingAddress || null,
            shippingOption: bundleManifest?.campaigns?.[0]?.shippingOption || shippingOption || 'standard'
          });
          if (!canonicalContribution.valid) {
            console.error('📝 Invalid pledge contribution in webhook metadata:', canonicalContribution.error);
            return finishWebhook(jsonResponse({ error: canonicalContribution.error }, 409), 'rejected_conflict');
          }

          if (checkoutProvider === 'first_party') {
            if (String(checkoutSnapshotVersion || '') !== String(CHECKOUT_INTENT_VERSION)) {
              console.error('📝 Invalid first-party checkout snapshot version:', checkoutSnapshotVersion);
              return finishWebhook(jsonResponse({ error: 'Invalid checkout snapshot version' }, 409), 'rejected_conflict');
            }

            if (!checkoutNonce || !checkoutCartHash) {
              console.error('📝 Missing first-party checkout integrity metadata');
              return finishWebhook(jsonResponse({ error: 'Missing checkout integrity metadata' }, 409), 'rejected_conflict');
            }

            const recomputedCheckoutCartHash = bundleManifest?.campaigns?.length === 1
              ? await hashCheckoutBundle(buildCheckoutBundleHashInput({
                  bundleAddOns: bundleManifest?.bundleAddOns || [],
                  bundleAddOnAnchorCampaignSlug: bundleManifest?.bundleAddOnAnchorCampaignSlug || '',
                  contributions: [{
                    campaignSlug,
                    canonicalContribution,
                    tipPercent: normalizedTipPercent
                  }]
                }))
              : await hashCheckoutContribution(buildCheckoutHashInput({
                  campaignSlug,
                  canonicalContribution,
                  tipPercent: normalizedTipPercent
                }));

            if (recomputedCheckoutCartHash !== checkoutCartHash) {
              console.error('📝 First-party checkout cart hash mismatch:', {
                orderId,
                checkoutNonce,
                expectedHashPrefix: String(checkoutCartHash).slice(0, 12),
                actualHashPrefix: recomputedCheckoutCartHash.slice(0, 12)
              });
              return finishWebhook(jsonResponse({ error: 'Checkout integrity verification failed' }, 409), 'rejected_conflict');
            }
          }

          const availability = await ensureTierAvailability(
            env,
            campaignSlug,
            campaign,
            canonicalContribution.selectedTiers,
            {},
            orderId
          );
          if (!availability.valid) {
            console.warn('📝 Inventory unavailable during webhook processing:', availability.error);
            return finishWebhook(jsonResponse({ error: availability.error }, 409), 'rejected_conflict');
          }

          const now = new Date().toISOString();
          const pledgeData = {
            orderId,
            email,
            campaignSlug,
            preferredLang: normalizePreferredLang(bundleManifest?.preferredLang || preferredLang, DEFAULT_I18N_LANG),
            tierId: canonicalContribution.tierId,
            tierName: canonicalContribution.tierName,
            tierQty: canonicalContribution.tierQty,
            additionalTiers: canonicalContribution.additionalTiers.length > 0 ? canonicalContribution.additionalTiers : undefined,
            supportItems: canonicalContribution.supportItems.length > 0 ? canonicalContribution.supportItems : undefined,
            bundleAddOns: anchorBundleAddOns.length > 0 ? anchorBundleAddOns : undefined,
            bundleAddOnAnchorCampaignSlug: anchorBundleAddOns.length > 0 ? campaignSlug : undefined,
            bundleAddOnSubtotal: anchorBundleAddOns.length > 0 ? getBundleAddOnSubtotal(anchorBundleAddOns) : 0,
            customAmount: canonicalContribution.customAmount > 0 ? canonicalContribution.customAmount : undefined,
            goalTrackingSubtotal: canonicalContribution.goalTrackingSubtotal,
            shippingOption: canonicalContribution.shippingOption || 'standard',
            billingAddress: recoveredBillingAddress.valid ? recoveredBillingAddress.destination : (bundleManifest?.billingAddress || undefined),
            shippingAddress: shippingAddress || undefined,
            subtotal: canonicalContribution.totals.subtotal,
            tax: canonicalContribution.totals.tax,
            taxDetails: canonicalContribution.totals.taxDetails,
            shipping: canonicalContribution.totals.shipping,
            tipPercent: canonicalContribution.totals.tipPercent,
            tipAmount: canonicalContribution.totals.tipAmount,
            amount: canonicalContribution.totals.amount,
            stripeCustomerId: customerId,
            stripePaymentMethodId: paymentMethodId,
            stripeSetupIntentId: setupIntentId,
            pledgeStatus: 'active',
            charged: false,
            createdAt: now,
            updatedAt: now,
            history: [{
              type: 'created',
              subtotal: canonicalContribution.totals.subtotal,
              tax: canonicalContribution.totals.tax,
              taxDetails: canonicalContribution.totals.taxDetails,
              shipping: canonicalContribution.totals.shipping,
              tipPercent: canonicalContribution.totals.tipPercent,
              tipAmount: canonicalContribution.totals.tipAmount,
              amount: canonicalContribution.totals.amount,
              shippingOption: canonicalContribution.shippingOption || 'standard',
              billingAddress: recoveredBillingAddress.valid ? recoveredBillingAddress.destination : (bundleManifest?.billingAddress || undefined),
              tierId: canonicalContribution.tierId,
              tierQty: canonicalContribution.tierQty,
              additionalTiers: canonicalContribution.additionalTiers.length > 0 ? canonicalContribution.additionalTiers : undefined,
              supportItems: canonicalContribution.supportItems.length > 0 ? canonicalContribution.supportItems : undefined,
              bundleAddOns: anchorBundleAddOns.length > 0 ? anchorBundleAddOns : undefined,
              bundleAddOnSubtotal: anchorBundleAddOns.length > 0 ? getBundleAddOnSubtotal(anchorBundleAddOns) : 0,
              customAmount: canonicalContribution.customAmount > 0 ? canonicalContribution.customAmount : undefined,
              at: now
            }]
          };

          const persisted = await persistNewPledge(env, {
            campaign,
            campaignSlug,
            pledgeData,
            supportItems: canonicalContribution.supportItems,
            selectedTiers: canonicalContribution.selectedTiers
          });
          if (!persisted.success) {
            console.error('📝 Failed to persist pledge after webhook:', persisted.error);
            return finishWebhook(jsonResponse({ error: persisted.error }, 409), 'persistence_failed');
          }

          await env.PLEDGES.delete(`pending-tiers:${orderId}`);
          await env.PLEDGES.delete(`pending-extras:${orderId}`);
          if (bundleManifest?.campaigns?.length === 1) {
            await persistCheckoutBundleManifest(env, orderId, {
              ...bundleManifest,
              confirmedAt: new Date().toISOString(),
              confirmedCampaigns: [{ orderId, campaignSlug, campaignTitle }]
            });
          }

          // Check for milestone emails (async, don't block response but keep worker alive)
          ctx.waitUntil(
            triggerMilestoneEmails(env, campaignSlug).catch(err => {
              console.error('Milestone email trigger failed:', err.message);
            })
          );

          // Send supporter confirmation email
          const token = await generateToken(env.MAGIC_LINK_SECRET, {
            orderId,
            email,
            campaignSlug
          });

          const emailNonce = await consumeSupporterEmailNonce(env, orderId);
          if (emailNonce.fresh) {
            ctx.waitUntil(
              attemptSupporterEmailDelivery(env, {
                orderId,
                payload: {
                  email,
                  campaignSlug,
                  campaignTitle,
                  preferredLang: pledgeData.preferredLang,
                  subtotal: canonicalContribution.totals.subtotal,
                  tax: canonicalContribution.totals.tax,
                  taxDetails: canonicalContribution.totals.taxDetails,
                  shipping: canonicalContribution.totals.shipping,
                  tipAmount: canonicalContribution.totals.tipAmount,
                  tipPercent: canonicalContribution.totals.tipPercent,
                  token,
                  instagramUrl: campaign?.instagram,
                  hasDecisions: campaign?.has_decisions === true,
                  pledgeItems: buildPledgeItemsPayload(campaign, canonicalContribution, anchorBundleAddOns)
                }
              }).then((result) => {
                if (!result.ok) {
                  console.error('Supporter confirmation email failed after webhook persistence:', result.error);
                }
              })
            );
          }

          console.log('Pledge confirmed:', { orderId, email, campaignSlug });
        }
      }
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const paymentIntent = event.data.object;
    const { orderId, email, campaignSlug } = paymentIntent.metadata || {};
    observedOrderId = String(orderId || '').trim();
    
    if (orderId && email) {
      const campaign = await getCampaign(env, campaignSlug);
      const campaignTitle = campaign?.title || campaignSlug?.replace(/-/g, ' ').toUpperCase() || 'Unknown Campaign';
      
      // Get pledge data first for email content
      let pledgeData = null;
      if (env.PLEDGES) {
        pledgeData = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
      }
      
      const token = await generateToken(env.MAGIC_LINK_SECRET, {
        orderId,
        email,
        campaignSlug
      });

      // Build pledge items for email
      let pledgeItemsForEmail = null;
      if (pledgeData) {
        const failedCampaignTiers = campaign?.tiers || [];
        const failedAdditionalTiers = (pledgeData.additionalTiers || []).map(t => {
          const tierData = failedCampaignTiers.find(ct => ct.id === t.id);
          return { ...t, name: tierData?.name || t.id };
        });
        const failedSupportItems = (pledgeData.supportItems || []).map(s => {
          const itemData = campaign?.support_items?.find(si => si.id === s.id);
          return { ...s, label: itemData?.label || s.id };
        });
        pledgeItemsForEmail = {
          tierName: pledgeData.tierName || null,
          tierQty: pledgeData.tierQty || 1,
          additionalTiers: failedAdditionalTiers,
          supportItems: failedSupportItems,
          addOns: getBundleAddOnsWithLabels(pledgeData.bundleAddOns || []),
          customAmount: pledgeData.customAmount || 0
        };
      }

      await sendPaymentFailedEmail(env, {
        email,
        campaignSlug,
        campaignTitle,
        preferredLang: pledgeData?.preferredLang || DEFAULT_I18N_LANG,
        subtotal: pledgeData?.subtotal || pledgeData?.amount || 0,
        tax: pledgeData?.tax || 0,
        taxDetails: pledgeData ? getStoredTaxDetails(pledgeData) : null,
        shipping: pledgeData?.shipping || 0,
        tipAmount: getStoredTipAmount(env, pledgeData),
        tipPercent: getStoredTipPercent(env, pledgeData, 0),
        amount: pledgeData?.amount || 0,
        token,
        pledgeItems: pledgeItemsForEmail
      });

      if (pledgeData) {
        pledgeData.pledgeStatus = 'payment_failed';
        pledgeData.lastPaymentError = paymentIntent.last_payment_error?.message || 'Unknown error';
        pledgeData.updatedAt = new Date().toISOString();
        await env.PLEDGES.put(`pledge:${orderId}`, JSON.stringify(pledgeData));
      }
    }
  }

  await markStripeEventProcessed();
  const defaultOutcome = event.type === 'payment_intent.payment_failed'
    ? 'payment_failed_processed'
    : event.type === 'checkout.session.completed'
      ? 'processed'
      : 'ignored_event_type';
  return finishWebhook(jsonResponse({ received: true }), defaultOutcome);
}

async function handleGetPledge(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return jsonResponse({ error: 'Missing token' }, 400);
  }

  const payload = await verifyToken(env.MAGIC_LINK_SECRET, token, env);
  if (!payload) {
    return jsonResponse({ error: 'Invalid or expired token' }, 401);
  }

  if (env.PLEDGES) {
    const pledgeData = await env.PLEDGES.get(`pledge:${payload.orderId}`, { type: 'json' });
    if (pledgeData) {
      // Check if campaign deadline has passed
      const campaign = await getCampaign(env, pledgeData.campaignSlug);
      const deadlinePassed = campaign?.goal_deadline && isDeadlinePassed(campaign.goal_deadline);
      const canChange = pledgeData.pledgeStatus === 'active' && !pledgeData.charged && !deadlinePassed;
      
      return jsonResponse({
        orderId: pledgeData.orderId,
        email: pledgeData.email,
        campaignSlug: pledgeData.campaignSlug,
        pledgeStatus: pledgeData.pledgeStatus,
        subtotal: pledgeData.subtotal,
        tax: pledgeData.tax,
        taxDetails: getStoredTaxDetails(pledgeData),
        shipping: pledgeData.shipping || 0,
        tipPercent: getStoredTipPercent(env, pledgeData, 0),
        tipAmount: getStoredTipAmount(env, pledgeData),
        amount: pledgeData.amount,
        tierId: pledgeData.tierId,
        tierName: pledgeData.tierName,
        tierQty: pledgeData.tierQty || 1,
        additionalTiers: pledgeData.additionalTiers || [],
        supportItems: pledgeData.supportItems || [],
        bundleAddOns: pledgeData.bundleAddOns || [],
        bundleAddOnAnchorCampaignSlug: pledgeData.bundleAddOnAnchorCampaignSlug || '',
        bundleAddOnSubtotal: pledgeData.bundleAddOnSubtotal || 0,
        customAmount: pledgeData.customAmount || 0,
        billingAddress: pledgeData.billingAddress || null,
        canModify: canChange,
        canCancel: canChange,
        canUpdatePaymentMethod: !pledgeData.charged,
        deadlinePassed
      });
    }
  }

  return jsonResponse({ error: 'Pledge not found' }, 404);
}

async function handleGetPledges(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return jsonResponse({ error: 'Missing token' }, 400);
  }

  const payload = await verifyToken(env.MAGIC_LINK_SECRET, token, env);
  if (!payload) {
    return jsonResponse({ error: 'Invalid or expired token' }, 401);
  }

  const authorizedOrder = resolveAuthorizedOrderId(payload);
  if (!authorizedOrder.valid) {
    return jsonResponse({ error: authorizedOrder.error }, 403);
  }

  const pledges = [];

  if (env.PLEDGES) {
    const pledgeData = await env.PLEDGES.get(`pledge:${authorizedOrder.orderId}`, { type: 'json' });
    if (pledgeData && pledgeData.pledgeStatus !== 'cancelled') {
      const campaign = await getCampaign(env, pledgeData.campaignSlug);
      const deadlinePassed = campaign?.goal_deadline && isDeadlinePassed(campaign.goal_deadline);
      const canChange = pledgeData.pledgeStatus === 'active' && !pledgeData.charged && !deadlinePassed;

      pledges.push({
        orderId: pledgeData.orderId,
        email: pledgeData.email,
        campaignSlug: pledgeData.campaignSlug,
        pledgeStatus: pledgeData.pledgeStatus,
        subtotal: pledgeData.subtotal,
        tax: pledgeData.tax,
        taxDetails: getStoredTaxDetails(pledgeData),
        shipping: pledgeData.shipping || 0,
        tipPercent: getStoredTipPercent(env, pledgeData, 0),
        tipAmount: getStoredTipAmount(env, pledgeData),
        amount: pledgeData.amount,
        tierId: pledgeData.tierId,
        tierName: pledgeData.tierName,
        tierQty: pledgeData.tierQty || 1,
        additionalTiers: pledgeData.additionalTiers || [],
        supportItems: pledgeData.supportItems || [],
        bundleAddOns: pledgeData.bundleAddOns || [],
        bundleAddOnAnchorCampaignSlug: pledgeData.bundleAddOnAnchorCampaignSlug || '',
        bundleAddOnSubtotal: pledgeData.bundleAddOnSubtotal || 0,
        customAmount: pledgeData.customAmount || 0,
        billingAddress: pledgeData.billingAddress || null,
        shippingAddress: pledgeData.shippingAddress || null,
        canModify: canChange,
        canCancel: canChange,
        canUpdatePaymentMethod: !pledgeData.charged,
        deadlinePassed
      });
    }
  }

  return jsonResponse(pledges);
}

async function handleCancelPledge(request, env) {
  const parsedBody = await parseJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;
  const { token, orderId, preferredLang } = body;

  if (!token) {
    return jsonResponse({ error: 'Missing token' }, 400);
  }

  const payload = await verifyToken(env.MAGIC_LINK_SECRET, token, env);
  if (!payload) {
    return jsonResponse({ error: 'Invalid or expired token' }, 401);
  }

  const authorizedOrder = resolveAuthorizedOrderId(payload, orderId);
  if (!authorizedOrder.valid) {
    return jsonResponse({ error: authorizedOrder.error }, 403);
  }
  const targetOrderId = authorizedOrder.orderId;

  let cancelledPledgeData = null;
  
  if (env.PLEDGES) {
    const pledgeData = await env.PLEDGES.get(`pledge:${targetOrderId}`, { type: 'json' });
    if (pledgeData) {
      if (pledgeData.email.toLowerCase() !== payload.email.toLowerCase()) {
        return jsonResponse({ error: 'Unauthorized' }, 403);
      }
      
      if (pledgeData.charged) {
        return jsonResponse({ error: 'Cannot cancel - pledge has been charged' }, 400);
      }
      
      // Check if campaign deadline has passed
      const campaign = await getCampaign(env, pledgeData.campaignSlug);
      if (campaign?.goal_deadline && isDeadlinePassed(campaign.goal_deadline)) {
        return jsonResponse({ error: 'Cannot cancel - campaign deadline has passed' }, 400);
      }
      
      // Store for stats update
      cancelledPledgeData = { ...pledgeData };
      
      const now = new Date().toISOString();
      pledgeData.pledgeStatus = 'cancelled';
      pledgeData.cancelledAt = now;
      pledgeData.updatedAt = now;
      pledgeData.preferredLang = normalizePreferredLang(preferredLang, pledgeData.preferredLang || payload.preferredLang || DEFAULT_I18N_LANG);
      
      // Append cancellation to history
      const cancelSubtotal = pledgeData.subtotal || pledgeData.amount || 0;
      const cancelTax = pledgeData.tax || 0;
      const cancelShipping = pledgeData.shipping || 0;
      const cancelTipPercent = getStoredTipPercent(env, pledgeData, 0);
      const cancelTipAmount = getStoredTipAmount(env, pledgeData);
      const cancelAmount = pledgeData.amount || 0;
      if (!pledgeData.history) {
        pledgeData.history = [{
          type: 'created',
          subtotal: cancelSubtotal,
          tax: cancelTax,
          taxDetails: getStoredTaxDetails(pledgeData),
          shipping: cancelShipping,
          tipPercent: cancelTipPercent,
          tipAmount: cancelTipAmount,
          amount: cancelAmount,
          shippingOption: pledgeData.shippingOption || 'standard',
          tierId: pledgeData.tierId,
          tierQty: pledgeData.tierQty || 1,
          additionalTiers: pledgeData.additionalTiers,
          customAmount: pledgeData.customAmount || undefined,
          at: pledgeData.createdAt
        }];
      }
      pledgeData.history.push({
        type: 'cancelled',
        subtotalDelta: -cancelSubtotal,
        taxDelta: -cancelTax,
        taxDetails: getStoredTaxDetails(pledgeData),
        shippingDelta: -cancelShipping,
        tipPercent: cancelTipPercent,
        tipAmountDelta: -cancelTipAmount,
        amountDelta: -cancelAmount,
        shippingOption: pledgeData.shippingOption || 'standard',
        customAmount: pledgeData.customAmount || undefined,
        at: now
      });
      
      await env.PLEDGES.put(`pledge:${targetOrderId}`, JSON.stringify(pledgeData));

      await removeFromCampaignIndex(env, pledgeData.campaignSlug, targetOrderId);

      // Update live stats (use subtotal for goal tracking)
      await removePledgeFromStats(env, {
        campaignSlug: pledgeData.campaignSlug,
        amount: pledgeData.goalTrackingSubtotal || pledgeData.subtotal || pledgeData.amount || 0,
        tierId: pledgeData.tierId,
        tierQty: pledgeData.tierQty || 1,
        additionalTiers: pledgeData.additionalTiers || [],
        supportItems: pledgeData.supportItems || [],
        customAmount: pledgeData.customAmount || 0
      });

      // Release tier inventory
      if (pledgeData.tierId) {
        await releaseTierInventory(env, pledgeData.campaignSlug, pledgeData.tierId, pledgeData.tierQty || 1);
        console.log('📦 Tier inventory released:', pledgeData.tierId);
      }
      // Also release additional tiers (multi-tier mode)
      if (pledgeData.additionalTiers) {
        for (const addTier of pledgeData.additionalTiers) {
          await releaseTierInventory(env, pledgeData.campaignSlug, addTier.id, addTier.qty || 1);
          console.log('📦 Additional tier inventory released:', addTier.id);
        }
      }

      invalidateAddOnInventorySnapshot(env);
      
      // Update email mapping - check if user has other active pledges
      const emailKey = `email:${pledgeData.email.toLowerCase()}`;
      const existingOrders = await env.PLEDGES.get(emailKey, { type: 'json' }) || [];
      
      // Remove this order from the list
      const updatedOrders = existingOrders.filter(id => id !== targetOrderId);
      
      // Check remaining orders for active pledges
      let hasActivePledges = false;
      for (const otherId of updatedOrders) {
        const otherPledge = await env.PLEDGES.get(`pledge:${otherId}`, { type: 'json' });
        if (otherPledge && otherPledge.pledgeStatus !== 'cancelled') {
          hasActivePledges = true;
          break;
        }
      }
      
      if (hasActivePledges) {
        // Keep the email mapping but with updated order list
        await env.PLEDGES.put(emailKey, JSON.stringify(updatedOrders));
        console.log('📧 Email mapping updated (user has other active pledges):', emailKey);
      } else {
        // Remove email mapping entirely - user loses Community access
        await env.PLEDGES.delete(emailKey);
        console.log('📧 Email mapping removed (no active pledges):', emailKey);
      }
      
      // Send cancellation confirmation email (reuse campaign from deadline check)
      const campaignTitle = campaign?.title || pledgeData.campaignSlug.replace(/-/g, ' ').toUpperCase();
      
      try {
        await sendPledgeCancelledEmail(env, {
          email: pledgeData.email,
          campaignSlug: pledgeData.campaignSlug,
          campaignTitle,
          preferredLang: pledgeData.preferredLang,
          subtotal: cancelSubtotal,
          tax: cancelTax,
          taxDetails: getStoredTaxDetails(pledgeData),
          shipping: cancelShipping,
          tipAmount: cancelTipAmount,
          tipPercent: cancelTipPercent,
          amount: cancelAmount
        });
        console.log('📧 Cancellation email sent to:', pledgeData.email);
      } catch (emailErr) {
        console.error('📧 Failed to send cancellation email:', emailErr.message);
        // Don't fail the cancellation if email fails
      }
      
      // KV pledge found and cancelled - we're done
      return jsonResponse({
        success: true,
        message: 'Pledge cancelled'
      });
    }
  }

  // No KV pledge found - this shouldn't happen for new pledges
  return jsonResponse({ error: 'Pledge not found' }, 404);
}

async function handleModifyPledge(request, env) {
  const parsedBody = await parseJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;
  const { token, orderId, newTierId, newTierQty, addTiers, supportItems, bundleAddOns, customAmount, tipPercent, preferredLang, shippingOption } = body;

  if (!token) {
    return jsonResponse({ error: 'Missing token' }, 400);
  }

  // Must have at least one change
  const hasTierChange = newTierId !== null && newTierId !== undefined;
  const hasQtyChange = newTierQty !== null && newTierQty !== undefined;
  const hasAddTiersPayload = Array.isArray(addTiers); // addTiers was passed (even if empty = tier removal)
  const hasSupportChange = Array.isArray(supportItems) && supportItems.length > 0;
  const hasBundleAddOnChange = Array.isArray(bundleAddOns);
  const hasCustomAmountChange = customAmount !== null && customAmount !== undefined;
  const hasTipChange = tipPercent !== null && tipPercent !== undefined;
  const hasShippingOptionChange = shippingOption !== null && shippingOption !== undefined;

  if (!hasTierChange && !hasQtyChange && !hasAddTiersPayload && !hasSupportChange && !hasBundleAddOnChange && !hasCustomAmountChange && !hasTipChange && !hasShippingOptionChange) {
    return jsonResponse({ error: 'No changes specified' }, 400);
  }

  const payload = await verifyToken(env.MAGIC_LINK_SECRET, token, env);
  if (!payload) {
    return jsonResponse({ error: 'Invalid or expired token' }, 401);
  }

  const authorizedOrder = resolveAuthorizedOrderId(payload, orderId);
  if (!authorizedOrder.valid) {
    return jsonResponse({ error: authorizedOrder.error }, 403);
  }
  const targetOrderId = authorizedOrder.orderId;
  let currentPledge = null;
  let campaignSlug = payload.campaignSlug;
  let currentTipPercent = 0;

  if (env.PLEDGES) {
    const pledgeData = await env.PLEDGES.get(`pledge:${targetOrderId}`, { type: 'json' });
    if (pledgeData) {
      if (pledgeData.email.toLowerCase() !== payload.email.toLowerCase()) {
        return jsonResponse({ error: 'Unauthorized' }, 403);
      }
      
      if (pledgeData.charged) {
        return jsonResponse({ error: 'Cannot modify - pledge has been charged' }, 400);
      }
      
      currentPledge = pledgeData;
      campaignSlug = pledgeData.campaignSlug || campaignSlug;
      currentTipPercent = getStoredTipPercent(env, pledgeData, 0);
    }
  }

  const { valid, error, campaign } = await isCampaignLive(env, campaignSlug);
  if (!valid) {
    return jsonResponse({ error: error || 'Campaign no longer accepting pledges' }, 400);
  }

  if (!currentPledge) {
    return jsonResponse({ error: 'Pledge not found' }, 404);
  }

  const normalizedTipPercent = hasTipChange
    ? sanitizePlatformTipPercent(tipPercent, currentTipPercent, getMaxPlatformTipPercent(env))
    : currentTipPercent;
  const currentTierSelection = getPledgeTierSelections(currentPledge, campaign);
  if (!currentTierSelection.valid) {
    return jsonResponse({ error: currentTierSelection.error }, 400);
  }

  const desiredTierSelection = buildTierSelectionFromModifyRequest(campaign, currentPledge, {
    newTierId,
    newTierQty,
    addTiers
  });
  if (!desiredTierSelection.valid) {
    return jsonResponse({ error: desiredTierSelection.error }, 400);
  }

  const thresholdValidation = await validateTierThresholdSelection(
    env,
    campaignSlug,
    campaign,
    desiredTierSelection.selectedTiers,
    currentTierSelection.selectedTiers
  );
  if (!thresholdValidation.valid) {
    return jsonResponse({ error: thresholdValidation.error }, 400);
  }

  const desiredSupportItems = buildDesiredSupportItems(
    campaign,
    currentPledge.supportItems || [],
    hasSupportChange ? supportItems : null
  );
  if (!desiredSupportItems.valid) {
    return jsonResponse({ error: desiredSupportItems.error }, 400);
  }

  const desiredBundleAddOns = hasBundleAddOnChange
    ? await validateBundleAddOns(env, bundleAddOns, { currentSelections: currentPledge.bundleAddOns || [] })
    : { valid: true, bundleAddOns: currentPledge.bundleAddOns || [] };
  if (!desiredBundleAddOns.valid) {
    return jsonResponse({ error: desiredBundleAddOns.error }, 400);
  }

  const canonicalContribution = await buildCanonicalContributionForStoredShipping(env, campaign, {
    tierSelection: desiredTierSelection,
    supportItems: desiredSupportItems.supportItems,
    bundleAddOns: desiredBundleAddOns.bundleAddOns,
    customAmount: hasCustomAmountChange ? customAmount : (currentPledge.customAmount || 0),
    tipPercent: normalizedTipPercent,
    shippingAddress: currentPledge.shippingAddress || null,
    currentShipping: currentPledge.shipping || 0,
    shippingOption: hasShippingOptionChange ? shippingOption : (currentPledge.shippingOption || 'standard'),
    taxDestination: getStoredTaxDetails(currentPledge).destination || null
  });
  if (!canonicalContribution.valid) {
    return jsonResponse({ error: canonicalContribution.error }, 400);
  }

  const availability = await ensureTierAvailability(
    env,
    campaignSlug,
    campaign,
    canonicalContribution.selectedTiers,
    getTierQuantityMap(currentTierSelection.selectedTiers)
  );
  if (!availability.valid) {
    return jsonResponse({ error: availability.error, remaining: availability.remaining }, 400);
  }

  // Track updated pledge data for email
  let updatedPledgeData = null;

  // Update in KV
  if (env.PLEDGES) {
    const pledgeData = await env.PLEDGES.get(`pledge:${targetOrderId}`, { type: 'json' });
    if (pledgeData) {
      const originalPledgeData = JSON.parse(JSON.stringify(pledgeData));
      const inventoryUpdate = await applyTierInventoryChanges(
        env,
        campaignSlug,
        campaign,
        currentTierSelection.selectedTiers,
        canonicalContribution.selectedTiers
      );
      if (!inventoryUpdate.success) {
        return jsonResponse({ error: inventoryUpdate.error }, 409);
      }

      const now = new Date().toISOString();
      const nextPledgeData = {
        ...pledgeData,
        previousTierId: hasTierChange ? pledgeData.tierId : pledgeData.previousTierId,
        tierId: canonicalContribution.tierId,
        tierName: canonicalContribution.tierName,
        tierQty: canonicalContribution.tierQty,
        additionalTiers: canonicalContribution.additionalTiers.length > 0 ? canonicalContribution.additionalTiers : [],
        supportItems: canonicalContribution.supportItems.length > 0 ? canonicalContribution.supportItems : [],
        bundleAddOns: desiredBundleAddOns.bundleAddOns.length > 0 ? desiredBundleAddOns.bundleAddOns : [],
        bundleAddOnAnchorCampaignSlug: desiredBundleAddOns.bundleAddOns.length > 0 ? campaignSlug : '',
        bundleAddOnSubtotal: desiredBundleAddOns.bundleAddOns.length > 0 ? getBundleAddOnSubtotal(desiredBundleAddOns.bundleAddOns) : 0,
        customAmount: canonicalContribution.customAmount > 0 ? canonicalContribution.customAmount : 0,
        goalTrackingSubtotal: canonicalContribution.goalTrackingSubtotal,
        shippingOption: canonicalContribution.shippingOption || pledgeData.shippingOption || 'standard',
        subtotal: canonicalContribution.totals.subtotal,
        tax: canonicalContribution.totals.tax,
        taxDetails: canonicalContribution.totals.taxDetails,
        shipping: canonicalContribution.totals.shipping,
        tipPercent: canonicalContribution.totals.tipPercent,
        tipAmount: canonicalContribution.totals.tipAmount,
        amount: canonicalContribution.totals.amount,
        preferredLang: normalizePreferredLang(preferredLang, pledgeData.preferredLang || payload.preferredLang || DEFAULT_I18N_LANG),
        modifiedAt: now,
        updatedAt: now
      };

      const previousSubtotal = currentPledge?.subtotal ?? currentPledge?.amount ?? 0;
      const previousTax = currentPledge?.tax ?? 0;
      const previousShipping = currentPledge?.shipping ?? 0;
      const previousTipAmount = getStoredTipAmount(env, currentPledge);
      const previousAmount = currentPledge?.amount ?? 0;

      if (!nextPledgeData.history) {
        nextPledgeData.history = [{
          type: 'created',
          subtotal: previousSubtotal,
          tax: previousTax,
          taxDetails: sanitizeStoredTaxDetails(originalPledgeData.taxDetails, {
            taxableSubtotalCents: previousSubtotal,
            taxableShippingCents: 0,
            shippingTaxed: false,
            shippingCents: previousShipping
          }),
          shipping: previousShipping,
          tipPercent: currentTipPercent,
          tipAmount: previousTipAmount,
          amount: previousAmount,
          shippingOption: originalPledgeData.shippingOption || 'standard',
          tierId: originalPledgeData.tierId,
          tierQty: originalPledgeData.tierQty || 1,
          additionalTiers: originalPledgeData.additionalTiers?.length > 0 ? originalPledgeData.additionalTiers : undefined,
          bundleAddOns: originalPledgeData.bundleAddOns?.length > 0 ? originalPledgeData.bundleAddOns : undefined,
          customAmount: originalPledgeData.customAmount || undefined,
          at: originalPledgeData.createdAt
        }];
      }

      nextPledgeData.history.push({
        type: 'modified',
        subtotalDelta: canonicalContribution.totals.subtotal - previousSubtotal,
        taxDelta: canonicalContribution.totals.tax - previousTax,
        taxDetails: canonicalContribution.totals.taxDetails,
        shippingDelta: canonicalContribution.totals.shipping - previousShipping,
        tipPercent: canonicalContribution.totals.tipPercent,
        tipAmount: canonicalContribution.totals.tipAmount,
        tipAmountDelta: canonicalContribution.totals.tipAmount - previousTipAmount,
        amountDelta: canonicalContribution.totals.amount - previousAmount,
        shippingOption: nextPledgeData.shippingOption || 'standard',
        tierId: nextPledgeData.tierId,
        tierQty: nextPledgeData.tierQty,
        additionalTiers: nextPledgeData.additionalTiers.length > 0 ? nextPledgeData.additionalTiers : undefined,
        bundleAddOns: nextPledgeData.bundleAddOns.length > 0 ? nextPledgeData.bundleAddOns : undefined,
        customAmount: nextPledgeData.customAmount || undefined,
        at: now
      });

      let pledgeStored = false;
      let statsReconciled = false;

      try {
        await env.PLEDGES.put(`pledge:${targetOrderId}`, JSON.stringify(nextPledgeData));
        pledgeStored = true;

        await recalculateStats(env, campaignSlug);
        statsReconciled = true;

        invalidateAddOnInventorySnapshot(env);

        updatedPledgeData = nextPledgeData;
      } catch (err) {
        console.error('Failed to persist pledge modification:', err.message);

        if (pledgeStored) {
          await env.PLEDGES.put(`pledge:${targetOrderId}`, JSON.stringify(originalPledgeData));
        }

        if (pledgeStored || statsReconciled) {
          await recalculateStats(env, campaignSlug);
        }

        await applyTierInventoryChanges(
          env,
          campaignSlug,
          campaign,
          canonicalContribution.selectedTiers,
          currentTierSelection.selectedTiers
        );

        return jsonResponse({ error: 'Failed to modify pledge' }, 500);
      }
    }
  }

  // Send confirmation email (use subtotals without tax for clarity)
  const previousSubtotal = currentPledge?.subtotal ?? currentPledge?.amount ?? 0;
  const previousTax = currentPledge?.tax ?? 0;
  const previousShipping = currentPledge?.shipping ?? 0;
  const previousTipAmount = getStoredTipAmount(env, currentPledge);
  const previousPledgeItemsForEmail = buildPledgeItemsPayload(campaign, currentPledge, currentPledge?.bundleAddOns || []);
  const nextPledgeItemsForEmail = updatedPledgeData
    ? buildPledgeItemsPayload(campaign, updatedPledgeData, updatedPledgeData.bundleAddOns || [])
    : buildPledgeItemsPayload(campaign, {
      ...currentPledge,
      tierId: canonicalContribution.tierId,
      tierName: canonicalContribution.tierName,
      tierQty: canonicalContribution.tierQty,
      additionalTiers: canonicalContribution.additionalTiers,
      supportItems: canonicalContribution.supportItems,
      customAmount: canonicalContribution.customAmount
    }, desiredBundleAddOns.bundleAddOns);
  const pledgeItemsChanged = havePledgeItemsChanged(previousPledgeItemsForEmail, nextPledgeItemsForEmail);
  const shippingOptionChangedForEmail = String(currentPledge?.shippingOption || 'standard').trim().toLowerCase()
    !== String(canonicalContribution?.shippingOption || currentPledge?.shippingOption || 'standard').trim().toLowerCase();
  if (
    previousSubtotal !== canonicalContribution.totals.subtotal ||
    previousTax !== canonicalContribution.totals.tax ||
    previousShipping !== canonicalContribution.totals.shipping ||
    previousTipAmount !== canonicalContribution.totals.tipAmount ||
    pledgeItemsChanged ||
    shippingOptionChangedForEmail
  ) {
    try {
      const campaignTitle = campaign?.title || campaignSlug.replace(/-/g, ' ').toUpperCase();
      const emailToken = await generateToken(env.MAGIC_LINK_SECRET, {
        orderId: targetOrderId,
        email: payload.email,
        campaignSlug
      });
      await sendPledgeModifiedEmail(env, {
        email: payload.email,
        campaignSlug,
        campaignTitle,
        preferredLang: updatedPledgeData?.preferredLang || currentPledge?.preferredLang || payload.preferredLang || DEFAULT_I18N_LANG,
        previousSubtotal,
        previousTax,
        previousShipping,
        previousTipAmount,
        newSubtotal: canonicalContribution.totals.subtotal,
        tax: canonicalContribution.totals.tax,
        taxDetails: canonicalContribution.totals.taxDetails,
        shipping: canonicalContribution.totals.shipping,
        tipAmount: canonicalContribution.totals.tipAmount,
        tipPercent: canonicalContribution.totals.tipPercent,
        token: emailToken,
        instagramUrl: campaign?.instagram,
        pledgeItems: nextPledgeItemsForEmail
      });
    } catch (err) {
      console.error('Failed to send modification email:', err.message);
    }
  }

  return jsonResponse({
    success: true,
    message: 'Pledge modified',
    newTier: canonicalContribution.tierId ? {
      id: canonicalContribution.tierId,
      name: canonicalContribution.tierName,
      price: campaign?.tiers?.find(tier => tier.id === canonicalContribution.tierId)?.price || 0
    } : null,
    tierQty: canonicalContribution.tierQty,
    previousSubtotal: currentPledge?.subtotal || currentPledge?.amount,
    previousAmount: currentPledge?.amount || 0,
    previousTipAmount,
    subtotal: canonicalContribution.totals.subtotal,
    tax: canonicalContribution.totals.tax,
    taxDetails: canonicalContribution.totals.taxDetails,
    shipping: canonicalContribution.totals.shipping,
    tipPercent: canonicalContribution.totals.tipPercent,
    tipAmount: canonicalContribution.totals.tipAmount,
    bundleAddOns: desiredBundleAddOns.bundleAddOns,
    newAmount: canonicalContribution.totals.amount,
    campaignSlug
  });
}

async function handleUpdatePaymentMethod(request, env) {
  const trustedOrigin = requireTrustedSiteOrigin(request, env);
  if (!trustedOrigin.ok) return trustedOrigin.response;

  const parsedBody = await parseJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
    privateResponse: true
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;
  const { token, preferredLang } = body;

  if (!token) {
    return privateJsonResponse({ error: 'Missing token' }, 400, env);
  }

  const payload = await verifyToken(env.MAGIC_LINK_SECRET, token, env);
  if (!payload) {
    return privateJsonResponse({ error: 'Invalid or expired token' }, 401, env);
  }

  let existingCustomerId = null;
  let pledgePreferredLang = normalizePreferredLang(preferredLang, payload.preferredLang || DEFAULT_I18N_LANG);

  if (env.PLEDGES) {
    const pledgeData = await env.PLEDGES.get(`pledge:${payload.orderId}`, { type: 'json' });
    if (pledgeData?.stripeCustomerId) {
      existingCustomerId = pledgeData.stripeCustomerId;
    }
    if (pledgeData?.preferredLang) {
      pledgePreferredLang = normalizePreferredLang(pledgeData.preferredLang, pledgePreferredLang);
    }
  }

  const stripe = createStripeClient(getStripeKey(env));
  const { usingCustomCheckoutUi, stripePublishableKey } = resolveCheckoutUiRuntime(env);
  
  const sessionParams = {
    mode: 'setup',
    payment_method_types: ['card', 'link'],
    metadata: {
      orderId: payload.orderId,
      campaignSlug: payload.campaignSlug,
      email: payload.email,
      isPaymentUpdate: 'true'
    }
  };

  if (usingCustomCheckoutUi) {
    sessionParams.ui_mode = 'custom';
    sessionParams.return_url = getLocalizedSiteUrl(env, `/manage/?t=${token}`, pledgePreferredLang);
    sessionParams.consent_collection = {
      payment_method_reuse_agreement: {
        position: 'hidden'
      }
    };
  } else {
    sessionParams.success_url = getLocalizedSiteUrl(env, `/manage/?t=${token}`, pledgePreferredLang);
    sessionParams.cancel_url = getLocalizedSiteUrl(env, `/manage/?t=${token}`, pledgePreferredLang);
  }

  // Try with existing customer, fall back to email if customer doesn't exist
  if (existingCustomerId) {
    try {
      await stripe.customers.retrieve(existingCustomerId);
      sessionParams.customer = existingCustomerId;
    } catch (err) {
      console.log('Customer not found, using email instead:', existingCustomerId);
      sessionParams.customer_email = payload.email;
    }
  } else {
    sessionParams.customer_email = payload.email;
  }

  try {
    const session = await stripe.checkout.sessions.create(
      sessionParams,
      usingCustomCheckoutUi ? { stripeVersion: STRIPE_CUSTOM_UI_MODE_API_VERSION } : undefined
    );

    if (usingCustomCheckoutUi) {
      if (!session.client_secret) {
        console.error('Stripe custom session missing client_secret:', JSON.stringify(session, null, 2));
        return privateJsonResponse({ error: 'Failed to create checkout session' }, 500, env);
      }

      return privateJsonResponse({
        checkoutUiMode: 'custom',
        sessionId: session.id,
        clientSecret: session.client_secret,
        publishableKey: stripePublishableKey
      }, 200, env);
    }

    if (!session.url) {
      console.error('Stripe session has no URL:', JSON.stringify(session, null, 2));
      return privateJsonResponse({ error: 'Failed to create checkout session' }, 500, env);
    }

    return privateJsonResponse({ checkoutUiMode: 'hosted', url: session.url }, 200, env);
  } catch (err) {
    console.error('Stripe checkout session error:', err);
    return privateJsonResponse({ error: `Stripe error: ${err.message || 'Unknown error'}` }, 500, env);
  }
}

/**
 * Core settle logic - charge all active pledges for a campaign
 * Aggregates by email so each supporter gets ONE charge for their total
 * Returns results object with supportersCharged, pledgesCharged, etc.
 */
async function settleCampaign(campaignSlug, env, options = {}) {
  const { dryRun = false } = options;
  
  const campaign = await getCampaign(env, campaignSlug);
  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (!env.PLEDGES) {
    throw new Error('PLEDGES KV not configured');
  }

  const stripe = createStripeClient(getStripeKey(env));
  const orderIds = await getCampaignOrderIds(env, campaignSlug);
  if (!orderIds) {
    throw new Error(`Campaign pledge index missing for ${campaignSlug}. Run /admin/rebuild/${campaignSlug} first.`);
  }
  
  // Aggregate pledges by email - one charge per supporter
  const pledgesByEmail = {};
  let skippedNoCustomer = 0;

  for (const orderId of orderIds) {
    const pledge = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
    if (pledge && 
        pledge.campaignSlug === campaignSlug && 
        pledge.pledgeStatus === 'active' &&
        !pledge.charged &&
        pledge.stripePaymentMethodId) {
      
      if (!pledge.stripeCustomerId) {
        console.error(`❌ Skipping pledge ${pledge.orderId}: missing stripeCustomerId (run /admin/backfill-customers/${campaignSlug} first)`);
        skippedNoCustomer++;
        continue;
      }

      const email = pledge.email.toLowerCase();
      if (!pledgesByEmail[email]) {
        pledgesByEmail[email] = {
          pledges: [],
          totalAmount: 0,
          customerId: null,
          paymentMethodId: null,
          latestUpdated: null
        };
      }
      
      pledgesByEmail[email].pledges.push(pledge);
      pledgesByEmail[email].totalAmount += pledge.amount || 0;
      
      // Use the most recently updated payment method for this email
      const pledgeUpdated = new Date(pledge.updatedAt || pledge.createdAt);
      if (!pledgesByEmail[email].latestUpdated || pledgeUpdated > pledgesByEmail[email].latestUpdated) {
        pledgesByEmail[email].latestUpdated = pledgeUpdated;
        pledgesByEmail[email].customerId = pledge.stripeCustomerId;
        pledgesByEmail[email].paymentMethodId = pledge.stripePaymentMethodId;
      }
    }
  }

  const supportersToCharge = Object.entries(pledgesByEmail).map(([email, data]) => ({
    email,
    pledges: data.pledges,
    totalAmount: data.totalAmount,
    customerId: data.customerId,
    paymentMethodId: data.paymentMethodId
  }));

  if (dryRun) {
    return {
      dryRun: true,
      campaignSlug,
      skippedNoCustomer,
      supporterCount: supportersToCharge.length,
      pledgeCount: supportersToCharge.reduce((sum, s) => sum + s.pledges.length, 0),
      totalAmount: supportersToCharge.reduce((sum, s) => sum + s.totalAmount, 0),
      supporters: supportersToCharge.map(s => ({
        email: s.email,
        totalAmount: s.totalAmount,
        pledgeCount: s.pledges.length,
        orderIds: s.pledges.map(p => p.orderId)
      }))
    };
  }

  const campaignTitle = campaign.title || campaignSlug.replace(/-/g, ' ').toUpperCase();
  
  const results = { 
    campaignSlug,
    supportersCharged: 0,
    supportersFailed: 0,
    skippedNoCustomer,
    pledgesCharged: 0, 
    errors: [],
    totalCharged: 0
  };

  for (const supporter of supportersToCharge) {
    try {
      // Create ONE PaymentIntent for all pledges from this supporter
      const paymentIntent = await stripe.paymentIntents.create({
        amount: supporter.totalAmount,
        currency: 'usd',
        customer: supporter.customerId,
        payment_method: supporter.paymentMethodId,
        off_session: true,
        confirm: true,
        metadata: {
          campaignSlug,
          email: supporter.email,
          pledgeCount: supporter.pledges.length.toString(),
          orderIds: supporter.pledges.map(p => p.orderId).join(',')
        }
      });

      if (paymentIntent.status === 'succeeded') {
        const chargedAt = new Date().toISOString();
        
        // Update ALL pledges for this supporter as charged
        for (const pledge of supporter.pledges) {
          pledge.charged = true;
          pledge.pledgeStatus = 'charged';
          pledge.chargedAt = chargedAt;
          pledge.stripePaymentIntentId = paymentIntent.id;
          pledge.updatedAt = chargedAt;
          await env.PLEDGES.put(`pledge:${pledge.orderId}`, JSON.stringify(pledge));
        }

        // Send ONE success email per supporter
        try {
          const token = await generateToken(env.MAGIC_LINK_SECRET, {
            orderId: supporter.pledges[0].orderId,
            email: supporter.email,
            campaignSlug
          });

          // Calculate combined subtotal and tax from all pledges
          let combinedSubtotal = 0;
          let combinedTax = 0;
          let combinedShipping = 0;
          let combinedTipAmount = 0;
          const combinedItems = { tierName: null, tierQty: 0, additionalTiers: [], supportItems: [], addOns: [], customAmount: 0 };
          
          for (const pledge of supporter.pledges) {
            combinedSubtotal += pledge.subtotal || pledge.amount || 0;
            combinedTax += pledge.tax || 0;
            combinedShipping += pledge.shipping || 0;
            combinedTipAmount += getStoredTipAmount(env, pledge);
            
            // Merge tier items
            if (pledge.tierName) {
              if (!combinedItems.tierName) {
                combinedItems.tierName = pledge.tierName;
                combinedItems.tierQty = pledge.tierQty || 1;
              } else if (combinedItems.tierName === pledge.tierName) {
                combinedItems.tierQty += pledge.tierQty || 1;
              } else {
                // Different main tier - add as additional
                const existingTier = combinedItems.additionalTiers.find(t => t.name === pledge.tierName);
                if (existingTier) {
                  existingTier.qty += pledge.tierQty || 1;
                } else {
                  combinedItems.additionalTiers.push({ name: pledge.tierName, qty: pledge.tierQty || 1 });
                }
              }
            }
            
            // Merge additional tiers
            for (const addTier of (pledge.additionalTiers || [])) {
              const tierData = campaign?.tiers?.find(t => t.id === addTier.id);
              const tierName = tierData?.name || addTier.id;
              const existingTier = combinedItems.additionalTiers.find(t => t.name === tierName);
              if (existingTier) {
                existingTier.qty += addTier.qty || 1;
              } else {
                combinedItems.additionalTiers.push({ name: tierName, qty: addTier.qty || 1 });
              }
            }
            
            // Merge support items
            for (const supportItem of (pledge.supportItems || [])) {
              const itemData = campaign?.support_items?.find(si => si.id === supportItem.id);
              const label = itemData?.label || supportItem.id;
              const existingItem = combinedItems.supportItems.find(s => s.label === label);
              if (existingItem) {
                existingItem.amount += supportItem.amount || 0;
              } else {
                combinedItems.supportItems.push({ label, amount: supportItem.amount || 0 });
              }
            }

            for (const addOn of (pledge.bundleAddOns || [])) {
              const existingAddOn = combinedItems.addOns.find((entry) => (
                entry.productId === addOn.productId && entry.variantId === addOn.variantId
              ));
              if (existingAddOn) {
                existingAddOn.quantity += addOn.quantity || 1;
              } else {
                combinedItems.addOns.push({ ...addOn });
              }
            }
            
            // Sum custom amounts
            combinedItems.customAmount += pledge.customAmount || 0;
          }

        await sendChargeSuccessEmail(env, {
          email: supporter.email,
          campaignSlug,
          campaignTitle,
          preferredLang: supporter.pledges[0]?.preferredLang || DEFAULT_I18N_LANG,
          subtotal: combinedSubtotal,
            tax: combinedTax,
            shipping: combinedShipping,
            tipAmount: combinedTipAmount,
            tipPercent: derivePlatformTipPercent(combinedSubtotal, combinedTipAmount, 0, getMaxPlatformTipPercent(env)),
            amount: supporter.totalAmount,
            token,
            hasDecisions: campaign?.has_decisions === true,
            pledgeItems: combinedItems
          });
        } catch (emailErr) {
          console.error('Failed to send charge success email:', emailErr.message);
        }

        results.supportersCharged++;
        results.pledgesCharged += supporter.pledges.length;
        results.totalCharged += supporter.totalAmount;
      } else if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_payment_method') {
        throw new Error(`Payment requires action: ${paymentIntent.status}`);
      }
    } catch (err) {
      results.supportersFailed++;
      results.errors.push({ 
        email: supporter.email,
        totalAmount: supporter.totalAmount,
        pledgeCount: supporter.pledges.length,
        orderIds: supporter.pledges.map(p => p.orderId),
        error: err.message 
      });

      // Update ALL pledges for this supporter as failed
      for (const pledge of supporter.pledges) {
        pledge.pledgeStatus = 'payment_failed';
        pledge.lastPaymentError = err.message;
        pledge.updatedAt = new Date().toISOString();
        await env.PLEDGES.put(`pledge:${pledge.orderId}`, JSON.stringify(pledge));
      }

      // Send payment failed email so supporter can update their payment method
      try {
        const token = await generateToken(env.MAGIC_LINK_SECRET, {
          orderId: supporter.pledges[0].orderId,
          email: supporter.email,
          campaignSlug
        });

        // Calculate combined subtotal, tax, and items for failed payment email
        let failedSubtotal = 0;
        let failedTax = 0;
        let failedShipping = 0;
        let failedTipAmount = 0;
        const failedItems = { tierName: null, tierQty: 0, additionalTiers: [], supportItems: [], addOns: [], customAmount: 0 };
        
        for (const pledge of supporter.pledges) {
          failedSubtotal += pledge.subtotal || pledge.amount || 0;
          failedTax += pledge.tax || 0;
          failedShipping += pledge.shipping || 0;
          failedTipAmount += getStoredTipAmount(env, pledge);
          
          if (pledge.tierName) {
            if (!failedItems.tierName) {
              failedItems.tierName = pledge.tierName;
              failedItems.tierQty = pledge.tierQty || 1;
            } else if (failedItems.tierName === pledge.tierName) {
              failedItems.tierQty += pledge.tierQty || 1;
            } else {
              const existingTier = failedItems.additionalTiers.find(t => t.name === pledge.tierName);
              if (existingTier) {
                existingTier.qty += pledge.tierQty || 1;
              } else {
                failedItems.additionalTiers.push({ name: pledge.tierName, qty: pledge.tierQty || 1 });
              }
            }
          }
          
          for (const addTier of (pledge.additionalTiers || [])) {
            const tierData = campaign?.tiers?.find(t => t.id === addTier.id);
            const tierName = tierData?.name || addTier.id;
            const existingTier = failedItems.additionalTiers.find(t => t.name === tierName);
            if (existingTier) {
              existingTier.qty += addTier.qty || 1;
            } else {
              failedItems.additionalTiers.push({ name: tierName, qty: addTier.qty || 1 });
            }
          }
          
          for (const supportItem of (pledge.supportItems || [])) {
            const itemData = campaign?.support_items?.find(si => si.id === supportItem.id);
            const label = itemData?.label || supportItem.id;
            const existingItem = failedItems.supportItems.find(s => s.label === label);
            if (existingItem) {
              existingItem.amount += supportItem.amount || 0;
            } else {
              failedItems.supportItems.push({ label, amount: supportItem.amount || 0 });
            }
          }

          for (const addOn of (pledge.bundleAddOns || [])) {
            const existingAddOn = failedItems.addOns.find((entry) => (
              entry.productId === addOn.productId && entry.variantId === addOn.variantId
            ));
            if (existingAddOn) {
              existingAddOn.quantity += addOn.quantity || 1;
            } else {
              failedItems.addOns.push({ ...addOn });
            }
          }
          
          failedItems.customAmount += pledge.customAmount || 0;
        }

        await sendPaymentFailedEmail(env, {
          email: supporter.email,
          campaignSlug,
          campaignTitle,
          preferredLang: supporter.pledges[0]?.preferredLang || DEFAULT_I18N_LANG,
          subtotal: failedSubtotal,
          tax: failedTax,
          shipping: failedShipping,
          tipAmount: failedTipAmount,
          tipPercent: derivePlatformTipPercent(failedSubtotal, failedTipAmount, 0, getMaxPlatformTipPercent(env)),
          amount: supporter.totalAmount,
          token,
          pledgeItems: failedItems
        });
        console.log('📧 Sent payment failed email to:', supporter.email);
      } catch (emailErr) {
        console.error('Failed to send payment failed email:', emailErr.message);
      }
    }
  }

  return results;
}

/**
 * Admin: Settle campaign - charge all pledges if funded and deadline passed
 */
async function handleSettleCampaign(request, campaignSlug, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  if (!campaignSlug) {
    return jsonResponse({ error: 'Missing campaign slug' }, 400);
  }

  const campaign = await getCampaign(env, campaignSlug);
  if (!campaign) {
    return jsonResponse({ error: 'Campaign not found' }, 404);
  }

  const stats = await getCampaignStats(env, campaignSlug);
  const goalAmountCents = (campaign.goal_amount || 0) * 100;

  // Check if campaign is funded
  if (stats.pledgedAmount < goalAmountCents) {
    return jsonResponse({ 
      error: 'Campaign not funded',
      pledgedAmount: stats.pledgedAmount,
      goalAmount: goalAmountCents
    }, 400);
  }

  // Check if deadline has passed (Mountain Time)
  if (campaign.goal_deadline) {
    if (!isDeadlinePassed(campaign.goal_deadline)) {
      const deadline = getDeadlineMT(campaign.goal_deadline);
      return jsonResponse({ 
        error: 'Deadline has not passed yet',
        deadline: deadline.toISOString(),
        deadlineMT: campaign.goal_deadline + ' 23:59:59 MT',
        now: new Date().toISOString()
      }, 400);
    }
  }

  const parsedBody = await parseOptionalJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
    emptyValue: {}
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body || {};
  const dryRun = body.dryRun === true;

  try {
    const results = await settleCampaign(campaignSlug, env, { dryRun });
    
    if (dryRun) {
      return jsonResponse(results);
    }
    
    // Only mark settlement complete if every active pledge was chargeable.
    if (
      results.supportersCharged > 0 &&
      results.supportersFailed === 0 &&
      (results.skippedNoCustomer || 0) === 0 &&
      env.PLEDGES
    ) {
      await env.PLEDGES.put(`campaign-charged:${campaignSlug}`, new Date().toISOString());
    }
    
    return jsonResponse({
      success: true,
      ...results
    });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

/**
 * Dispatch batched settlement for a campaign.
 * Reads the campaign pledge index, splits into batches of 6,
 * processes one batch, then self-invokes for the next batch.
 * Each invocation gets its own 50-subrequest budget.
 */
async function handleSettleDispatch(request, campaignSlug, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  if (!campaignSlug || !env.PLEDGES) {
    return jsonResponse({ error: 'Missing campaign slug or PLEDGES not configured' }, 400);
  }

  const BATCH_SIZE = 6;

  // Check if already fully settled
  const settledMarker = await env.PLEDGES.get(`campaign-charged:${campaignSlug}`);
  if (settledMarker) {
    return jsonResponse({ message: 'Campaign already settled', campaignSlug, settledAt: settledMarker });
  }

  // Load or initialize settlement job
  const jobKey = `settlement-job:${campaignSlug}`;
  let job = await env.PLEDGES.get(jobKey, { type: 'json' });

  if (!job || job.status !== 'running') {
    // Initialize: read campaign pledge index
    const orderIds = await getCampaignOrderIds(env, campaignSlug);

    if (!orderIds) {
      return jsonResponse({
        error: `Campaign pledge index missing for ${campaignSlug}. Run /admin/rebuild/${campaignSlug} first.`,
        campaignSlug,
        requiresRebuild: true
      }, 409);
    }

    job = {
      status: 'running',
      cursor: 0,
      total: orderIds.length,
      orderIds,
      startedAt: Date.now(),
      lastBatchAt: null,
      batchesCompleted: 0,
      totalCharged: 0,
      totalFailed: 0,
      totalSkipped: 0,
      totalNeedsAttention: 0
    };
  }

  if (job.cursor >= job.total) {
    const finalized = await finalizeSettlementDispatch(env, campaignSlug, jobKey, job);
    console.log(`${finalized.needsAttention ? '⚠️' : '✅'} Settlement complete for ${campaignSlug}:`, JSON.stringify(job));
    return jsonResponse({
      message: finalized.needsAttention ? 'Settlement completed with unresolved pledges' : 'Settlement complete',
      ...job
    });
  }

  // Process one batch
  const batch = job.orderIds.slice(job.cursor, job.cursor + BATCH_SIZE);
  console.log(`💳 Settling batch ${job.batchesCompleted + 1} for ${campaignSlug}: ${batch.length} pledges (${job.cursor}/${job.total})`);

  try {
    const batchRes = await fetch(`${env.WORKER_BASE}/admin/settle-batch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.ADMIN_SECRET}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ orderIds: batch })
    });
    const batchResult = await batchRes.json();

    job.cursor += batch.length;
    job.lastBatchAt = Date.now();
    job.batchesCompleted++;
    job.totalCharged += batchResult.charged || 0;
    job.totalFailed += batchResult.failed || 0;
    job.totalSkipped += batchResult.skipped || 0;
    const needsAttention = getSettlementNeedsAttention(batchResult);
    job.totalNeedsAttention += needsAttention.unresolved;

    // Save progress
    await env.PLEDGES.put(jobKey, JSON.stringify(job), { expirationTtl: 604800 });

    // Chain: self-invoke for the next batch if more remain
    if (job.cursor < job.total) {
      console.log(`🔗 Chaining next batch for ${campaignSlug} (${job.cursor}/${job.total})`);
      // Use a non-blocking fetch so this response returns immediately
      const nextFetch = fetch(`${env.WORKER_BASE}/admin/settle-dispatch/${campaignSlug}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.ADMIN_SECRET}`,
          'Content-Type': 'application/json'
        }
      }).catch(err => console.error('Chain dispatch failed:', err.message));

      // Can't use ctx.waitUntil here (not in scheduled), so await it
      await nextFetch;
    } else {
      // Final batch done
      const finalized = await finalizeSettlementDispatch(env, campaignSlug, jobKey, job);
      console.log(`${finalized.needsAttention ? '⚠️' : '✅'} Settlement complete for ${campaignSlug}:`, JSON.stringify(job));
    }

    return jsonResponse({
      campaignSlug,
      batchProcessed: batch.length,
      batchResult,
      progress: `${job.cursor}/${job.total}`,
      status: job.status
    });
  } catch (err) {
    console.error(`❌ Batch settlement failed for ${campaignSlug}:`, err.message);
    job.lastError = err.message;
    await env.PLEDGES.put(jobKey, JSON.stringify(job), { expirationTtl: 604800 });
    return jsonResponse({ error: err.message, progress: `${job.cursor}/${job.total}` }, 500);
  }
}

async function handleCronStatus(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const lastRun = await env.PLEDGES?.get('cron:lastRun');
  const lastError = await env.PLEDGES?.get('cron:lastError', { type: 'json' });

  return jsonResponse({
    lastRun,
    lastError,
    now: new Date().toISOString()
  });
}

async function handleWebhookObservability(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const days = clampObservabilityDays(url.searchParams.get('days'));
  const summaries = await listObservabilitySummaries(env, 'webhook', days);
  const recent = await getObservabilityRecentEvents(env, 'webhook');

  return jsonResponse({
    success: true,
    days,
    now: new Date().toISOString(),
    summaries,
    recent
  });
}

async function handlePerformanceObservability(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const days = clampObservabilityDays(url.searchParams.get('days'));
  const summaries = await listObservabilitySummaries(env, 'performance', days);

  return jsonResponse({
    success: true,
    days,
    sampleRate: getObservabilitySampleRate(env),
    now: new Date().toISOString(),
    summaries
  });
}

async function handleSettleBatch(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const parsedBody = await parseJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
    emptyValue: {}
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body || {};
  const { orderIds, dryRun = false } = body;

  if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
    return jsonResponse({ error: 'Missing orderIds array' }, 400);
  }

  if (orderIds.length > 6) {
    return jsonResponse({ error: 'Max 6 orderIds per batch to stay within subrequest limits' }, 400);
  }

  if (!env.PLEDGES) {
    return jsonResponse({ error: 'PLEDGES KV not configured' }, 500);
  }

  const stripe = createStripeClient(getStripeKey(env));
  const results = { charged: 0, skipped: 0, failed: 0, errors: [], details: [] };

  // Read all pledges in this batch
  const pledges = [];
  for (const orderId of orderIds) {
    const pledge = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
    if (!pledge) {
      results.details.push({ orderId, status: 'not_found' });
      results.skipped++;
      continue;
    }
    if (pledge.charged || pledge.pledgeStatus === 'charged') {
      results.details.push({ orderId, status: 'already_charged' });
      results.skipped++;
      continue;
    }
    if (!pledge.stripeCustomerId || !pledge.stripePaymentMethodId) {
      results.details.push({ orderId, status: 'missing_stripe_ids' });
      results.skipped++;
      continue;
    }
    pledges.push(pledge);
  }

  if (pledges.length === 0) {
    return jsonResponse({ ...results, message: 'No chargeable pledges in batch' });
  }

  // Group by email for aggregation
  const byEmail = {};
  for (const pledge of pledges) {
    const email = pledge.email.toLowerCase();
    if (!byEmail[email]) {
      byEmail[email] = { pledges: [], totalAmount: 0 };
    }
    byEmail[email].pledges.push(pledge);
    byEmail[email].totalAmount += pledge.amount || 0;
  }

  if (dryRun) {
    return jsonResponse({
      dryRun: true,
      supporters: Object.entries(byEmail).map(([email, data]) => ({
        email,
        totalAmount: data.totalAmount,
        pledgeCount: data.pledges.length,
        orderIds: data.pledges.map(p => p.orderId)
      }))
    });
  }

  // Fetch campaign data once (for email template)
  const campaignSlug = pledges[0].campaignSlug;
  const campaign = await getCampaign(env, campaignSlug);
  const campaignTitle = campaign?.title || campaignSlug;

  for (const [email, data] of Object.entries(byEmail)) {
    // Use most recently updated payment method
    let customerId, paymentMethodId;
    let latest = null;
    for (const p of data.pledges) {
      const updated = new Date(p.updatedAt || p.createdAt);
      if (!latest || updated > latest) {
        latest = updated;
        customerId = p.stripeCustomerId;
        paymentMethodId = p.stripePaymentMethodId;
      }
    }

    // Reset any payment_failed status before charging
    for (const p of data.pledges) {
      if (p.pledgeStatus === 'payment_failed') {
        p.pledgeStatus = 'active';
        p.lastPaymentError = null;
        await env.PLEDGES.put(`pledge:${p.orderId}`, JSON.stringify(p));
      }
    }

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: data.totalAmount,
        currency: 'usd',
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        metadata: {
          campaignSlug,
          email,
          pledgeCount: data.pledges.length.toString(),
          orderIds: data.pledges.map(p => p.orderId).join(',')
        }
      });

      if (paymentIntent.status === 'succeeded') {
        const chargedAt = new Date().toISOString();
        for (const pledge of data.pledges) {
          pledge.charged = true;
          pledge.pledgeStatus = 'charged';
          pledge.chargedAt = chargedAt;
          pledge.stripePaymentIntentId = paymentIntent.id;
          pledge.updatedAt = chargedAt;
          await env.PLEDGES.put(`pledge:${pledge.orderId}`, JSON.stringify(pledge));
        }

        // Send success email
        try {
          const token = await generateToken(env.MAGIC_LINK_SECRET, {
            orderId: data.pledges[0].orderId,
            email,
            campaignSlug
          });

          let combinedSubtotal = 0;
          let combinedTax = 0;
          let combinedShipping = 0;
          let combinedTipAmount = 0;
          const combinedItems = { tierName: null, tierQty: 0, additionalTiers: [], supportItems: [], customAmount: 0 };
          for (const pledge of data.pledges) {
            combinedSubtotal += pledge.subtotal || pledge.amount || 0;
            combinedTax += pledge.tax || 0;
            combinedShipping += pledge.shipping || 0;
            combinedTipAmount += getStoredTipAmount(env, pledge);
            if (pledge.tierName) {
              if (!combinedItems.tierName) {
                combinedItems.tierName = pledge.tierName;
                combinedItems.tierQty = pledge.tierQty || 1;
              } else {
                combinedItems.additionalTiers.push({ name: pledge.tierName, qty: pledge.tierQty || 1 });
              }
            }
            for (const at of (pledge.additionalTiers || [])) {
              const tierData = campaign?.tiers?.find(t => t.id === at.id);
              combinedItems.additionalTiers.push({ name: tierData?.name || at.id, qty: at.qty || 1 });
            }
            for (const si of (pledge.supportItems || [])) {
              const itemData = campaign?.support_items?.find(s => s.id === si.id);
              combinedItems.supportItems.push({ label: itemData?.label || si.id, amount: si.amount || 0 });
            }
            combinedItems.customAmount += pledge.customAmount || 0;
          }

          await sendChargeSuccessEmail(env, {
            email, campaignSlug, campaignTitle,
            preferredLang: data.pledges[0]?.preferredLang || DEFAULT_I18N_LANG,
            subtotal: combinedSubtotal, tax: combinedTax, shipping: combinedShipping, tipAmount: combinedTipAmount, tipPercent: derivePlatformTipPercent(combinedSubtotal, combinedTipAmount, 0, getMaxPlatformTipPercent(env)), amount: data.totalAmount,
            token,
            hasDecisions: campaign?.has_decisions === true,
            pledgeItems: combinedItems
          });
        } catch (emailErr) {
          console.error('Failed to send charge success email:', emailErr.message);
        }

        results.charged += data.pledges.length;
        results.details.push({ email, status: 'charged', amount: data.totalAmount });
      } else {
        throw new Error('Payment status: ' + paymentIntent.status);
      }
    } catch (err) {
      results.failed += data.pledges.length;
      results.errors.push({ email, orderIds: data.pledges.map(p => p.orderId), error: err.message });
      results.details.push({ email, status: 'failed', error: err.message });

      for (const pledge of data.pledges) {
        pledge.pledgeStatus = 'payment_failed';
        pledge.lastPaymentError = err.message;
        pledge.updatedAt = new Date().toISOString();
        await env.PLEDGES.put(`pledge:${pledge.orderId}`, JSON.stringify(pledge));
      }
    }
  }

  return jsonResponse(results);
}

async function handleRebuildCampaignIndex(request, campaignSlug, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  if (!campaignSlug || !env.PLEDGES) {
    return jsonResponse({ error: 'Missing campaign slug or PLEDGES not configured' }, 400);
  }

  // Scan all pledge keys and rebuild index for this campaign
  const orderIds = [];
  let cursor = undefined;
  do {
    const page = await env.PLEDGES.list({ prefix: 'pledge:', cursor });
    for (const key of page.keys) {
      const pledge = await env.PLEDGES.get(key.name, { type: 'json' });
      if (pledge && pledge.campaignSlug === campaignSlug && pledge.pledgeStatus !== 'cancelled') {
        orderIds.push(pledge.orderId);
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  await env.PLEDGES.put(`campaign-pledges:${campaignSlug}`, JSON.stringify(orderIds));

  return jsonResponse({ campaignSlug, orderIds: orderIds.length, rebuilt: true });
}

async function handleBackfillCustomers(request, campaignSlug, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  if (!campaignSlug) {
    return jsonResponse({ error: 'Missing campaign slug' }, 400);
  }

  if (!env.PLEDGES) {
    return jsonResponse({ error: 'PLEDGES KV not configured' }, 500);
  }

  const BATCH_SIZE = 5;
  const stripe = createStripeClient(getStripeKey(env));
  const parsedBody = await parseOptionalJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
    emptyValue: {}
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body || {};
  const dryRun = body.dryRun === true;

  const orderIds = await getCampaignOrderIds(env, campaignSlug);
  if (!orderIds) {
    return jsonResponse({
      error: `Campaign pledge index missing for ${campaignSlug}. Run /admin/rebuild/${campaignSlug} first.`,
      campaignSlug,
      requiresRebuild: true
    }, 409);
  }

  // Find pledges missing stripeCustomerId
  const needsBackfill = [];

  for (const orderId of orderIds) {
    const key = `pledge:${orderId}`;
    const pledge = await env.PLEDGES.get(key, { type: 'json' });
    if (pledge &&
        pledge.campaignSlug === campaignSlug &&
        pledge.pledgeStatus === 'active' &&
        !pledge.charged &&
        !pledge.stripeCustomerId &&
        pledge.stripePaymentMethodId) {
      needsBackfill.push({ key, pledge });
    }
  }

  if (needsBackfill.length === 0) {
    return jsonResponse({ message: 'All pledges have customer IDs', remaining: 0 });
  }

  const batch = needsBackfill.slice(0, BATCH_SIZE);
  const results = { processed: 0, failed: 0, remaining: needsBackfill.length - batch.length, errors: [] };

  if (dryRun) {
    return jsonResponse({
      dryRun: true,
      needsBackfill: needsBackfill.length,
      batchSize: batch.length,
      pledges: needsBackfill.map(p => ({ orderId: p.pledge.orderId, email: p.pledge.email }))
    });
  }

  for (const { key, pledge } of batch) {
    try {
      // Create a Stripe customer for this pledge
      const customer = await stripe.customers.create({
        email: pledge.email,
        metadata: { source: 'backfill', orderId: pledge.orderId, campaignSlug }
      });

      if (!customer.id) {
        throw new Error(customer.error?.message || 'Customer creation failed');
      }

      // Attach the existing payment method to the new customer
      await stripe.paymentMethods.attach(pledge.stripePaymentMethodId, {
        customer: customer.id
      });

      // Update pledge in KV
      pledge.stripeCustomerId = customer.id;
      await env.PLEDGES.put(key, JSON.stringify(pledge));

      console.log(`🔧 Backfilled customer for ${pledge.orderId}: ${customer.id}`);
      results.processed++;
    } catch (err) {
      console.error(`❌ Backfill failed for ${pledge.orderId}:`, err.message);
      results.failed++;
      results.errors.push({ orderId: pledge.orderId, error: err.message });
    }
  }

  return jsonResponse(results);
}

async function handleTestSetup(request, env) {
  if (getAppMode(env) !== 'test') {
    return jsonResponse({ error: 'Test endpoints only available in test mode' }, 403);
  }

  if (!env.PLEDGES) {
    return jsonResponse({ error: 'PLEDGES KV not configured' }, 500);
  }

  const parsedBody = await parseOptionalJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
    emptyValue: {}
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body || {};
  const email = body.email || 'test@example.com';
  const campaignSlugs = getTestSetupCampaignSlugs(body, env);
  const fixtureBillingAddress = body.billingAddress || {
    country: 'US',
    postalCode: '87048',
    state: 'NM',
    city: 'Corrales',
    line1: '1228 W La Entrada'
  };

  // Create a real Stripe test customer so payment method updates work
  let stripeCustomerId = null;
  try {
    const stripe = createStripeClient(getStripeKey(env));
    const customer = await stripe.customers.create({ email });
    stripeCustomerId = customer.id;
    console.log('📧 Created test Stripe customer:', stripeCustomerId);
  } catch (err) {
    console.error('Failed to create Stripe customer:', err.message);
  }

  const testPledges = [];
  for (const campaignSlug of campaignSlugs) {
    const campaign = await getCampaign(env, campaignSlug);
    const tiers = campaign?.tiers || [];
    const isSingleTier = campaign?.single_tier_only === true;
    const firstTier = tiers[0];
    const secondTier = tiers[1];

    const firstTierPrice = firstTier?.price || 5;
    const firstTierQty = body.tierQty || 2;

    let subtotal;
    let additionalTiers = [];
    if (isSingleTier) {
      subtotal = firstTierPrice * firstTierQty * 100;
    } else {
      const secondTierPrice = secondTier?.price || 0;
      const secondTierQty = 1;
      subtotal = (firstTierPrice * firstTierQty + secondTierPrice * secondTierQty) * 100;
      if (secondTier) {
        additionalTiers = [{ id: secondTier.id, qty: secondTierQty }];
      }
    }
    const totals = await buildPledgeTotals(env, subtotal, {
      shipping: getFlatShippingFeeCents(env),
      tipPercent: getDefaultPlatformTipPercent(env),
      taxDestination: fixtureBillingAddress
    });

    testPledges.push({
      orderId: getTestFixtureOrderId(email, campaignSlug),
      email,
      campaignSlug,
      tierId: firstTier?.id || 'frame',
      tierName: firstTier?.name || 'Test Tier',
      tierQty: firstTierQty,
      subtotal: totals.subtotal,
      tax: totals.tax,
      shipping: totals.shipping,
      tipPercent: totals.tipPercent,
      tipAmount: totals.tipAmount,
      amount: totals.amount,
      customAmount: 0,
      supportItems: [],
      additionalTiers,
      billingAddress: fixtureBillingAddress,
      stripeCustomerId: stripeCustomerId || 'cus_test_123',
      stripePaymentMethodId: null, // No payment method until they add one
      pledgeStatus: 'active',
      charged: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  const orderIds = [];
  for (const pledge of testPledges) {
    await env.PLEDGES.put(`pledge:${pledge.orderId}`, JSON.stringify(pledge));
    await addToCampaignIndex(env, pledge.campaignSlug, pledge.orderId);
    orderIds.push(pledge.orderId);
  }

  const emailKey = `email:${email.toLowerCase()}`;
  await env.PLEDGES.put(emailKey, JSON.stringify(orderIds));

  const manageLinks = [];
  for (const pledge of testPledges) {
    const token = await generateToken(env.MAGIC_LINK_SECRET, {
      orderId: pledge.orderId,
      email,
      campaignSlug: pledge.campaignSlug
    });
    manageLinks.push({
      campaignSlug: pledge.campaignSlug,
      orderId: pledge.orderId,
      token,
      manageUrl: `${env.SITE_BASE}/manage/?t=${token}`
    });
  }
  const primaryLink = manageLinks[0] || {};

  return jsonResponse({
    success: true,
    message: 'Test pledges created',
    pledges: testPledges.map(p => ({
      orderId: p.orderId,
      campaignSlug: p.campaignSlug,
      status: p.pledgeStatus,
      tierId: p.tierId,
      tierQty: p.tierQty,
      additionalTiers: p.additionalTiers,
      subtotal: p.subtotal,
      tax: p.tax,
      tipPercent: p.tipPercent,
      tipAmount: p.tipAmount,
      amount: p.amount
    })),
    token: primaryLink.token,
    manageUrl: primaryLink.manageUrl,
    manageLinks
  });
}

function getTestSetupCampaignSlugs(body = {}, env = {}) {
  const configured = String(env.ADMIN_TEST_CAMPAIGNS || 'hand-relations,smoke-editable').split(',');
  const requested = Array.isArray(body.campaignSlugs)
    ? body.campaignSlugs
    : (body.campaignSlug ? [body.campaignSlug] : configured);
  const slugs = requested
    .map((slug) => String(slug || '').trim())
    .filter(Boolean);
  const uniqueSlugs = Array.from(new Set(slugs));
  return uniqueSlugs.length ? uniqueSlugs : ['hand-relations', 'smoke-editable'];
}

async function handleTestCleanup(request, env) {
  if (getAppMode(env) !== 'test') {
    return jsonResponse({ error: 'Test endpoints only available in test mode' }, 403);
  }

  if (!env.PLEDGES) {
    return jsonResponse({ error: 'PLEDGES KV not configured' }, 500);
  }

  const parsedBody = await parseOptionalJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
    emptyValue: {}
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body || {};
  const email = body.email || 'test@example.com';
  const campaignSlugs = getTestSetupCampaignSlugs(body, env);

  const testOrderIds = [
    ...campaignSlugs.map((campaignSlug) => getTestFixtureOrderId(email, campaignSlug)),
    'test-order-active-1'
  ];

  for (const orderId of testOrderIds) {
    const pledge = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
    if (pledge?.campaignSlug) {
      await removeFromCampaignIndex(env, pledge.campaignSlug, orderId);
    }
    await env.PLEDGES.delete(`pledge:${orderId}`);
  }

  await env.PLEDGES.delete(`email:${email.toLowerCase()}`);

  return jsonResponse({
    success: true,
    message: 'Test pledges cleaned up',
    deleted: testOrderIds
  });
}

/**
 * Get all supporters for a campaign from KV
 */
async function getCampaignSupporters(env, campaignSlug) {
  if (!env.PLEDGES) return [];
  
  const supporters = [];
  const seenEmails = new Set();
  const orderIds = await getCampaignOrderIds(env, campaignSlug);

  if (Array.isArray(orderIds)) {
    for (const orderId of orderIds) {
      const pledgeData = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
      if (!pledgeData) continue;
      if (pledgeData.campaignSlug !== campaignSlug) continue;
      if (pledgeData.pledgeStatus === 'cancelled') continue;
      if (!pledgeData.email) continue;

      const emailLower = pledgeData.email.toLowerCase();
      if (seenEmails.has(emailLower)) continue;
      seenEmails.add(emailLower);

      supporters.push({
        email: pledgeData.email,
        orderId: pledgeData.orderId,
        preferredLang: normalizePreferredLang(pledgeData.preferredLang, DEFAULT_I18N_LANG)
      });
    }

    return supporters;
  }

  const pledgeKeys = await listAllPledgeKeys(env);

  for (const key of pledgeKeys) {
    const pledgeData = await env.PLEDGES.get(key.name, { type: 'json' });
    if (!pledgeData) continue;
    if (pledgeData.campaignSlug !== campaignSlug) continue;
    if (pledgeData.pledgeStatus === 'cancelled') continue;
    if (!pledgeData.email) continue;
    
    const emailLower = pledgeData.email.toLowerCase();
    if (seenEmails.has(emailLower)) continue;
    seenEmails.add(emailLower);
    
    supporters.push({
      email: pledgeData.email,
      orderId: pledgeData.orderId,
      preferredLang: normalizePreferredLang(pledgeData.preferredLang, DEFAULT_I18N_LANG)
    });
  }
  
  return supporters;
}

async function getCampaignReportPledges(env, campaignSlug) {
  if (!env.PLEDGES) {
    return [];
  }

  const pledges = [];
  const orderIds = await getCampaignOrderIds(env, campaignSlug);

  if (Array.isArray(orderIds)) {
    for (const orderId of orderIds) {
      const pledgeData = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
      if (!pledgeData) continue;
      if (pledgeData.campaignSlug !== campaignSlug) continue;
      pledges.push(pledgeData);
    }
    return pledges;
  }

  const pledgeKeys = await listAllPledgeKeys(env);
  for (const key of pledgeKeys) {
    const pledgeData = await env.PLEDGES.get(key.name, { type: 'json' });
    if (!pledgeData) continue;
    if (pledgeData.campaignSlug !== campaignSlug) continue;
    pledges.push(pledgeData);
  }

  return pledges;
}

async function getIndexedCampaignReportPledges(env, campaignSlug) {
  if (!env.PLEDGES) {
    return { ok: true, pledges: [] };
  }

  const orderIds = await getCampaignOrderIds(env, campaignSlug);
  if (!Array.isArray(orderIds)) {
    return {
      ok: false,
      error: 'Campaign pledge index is required for dashboard report previews',
      code: 'campaign_index_required',
      pledges: []
    };
  }

  const pledges = [];
  for (const orderId of orderIds) {
    const normalizedOrderId = String(orderId || '').trim();
    if (!normalizedOrderId) continue;
    const pledgeData = await env.PLEDGES.get(`pledge:${normalizedOrderId}`, { type: 'json' });
    if (!pledgeData) continue;
    if (String(pledgeData?.campaignSlug || '') !== campaignSlug) continue;
    pledges.push(pledgeData);
  }

  return { ok: true, pledges, indexed: orderIds.length };
}

function getCampaignRunnerStatsSummary(campaign, stats, env, reportKind, pledges = [], now = new Date()) {
  if (reportKind === 'Fulfillment report') {
    return [];
  }

  const summary = [];
  const goalAmountCents = Math.round((Number(campaign?.goal_amount || 0) || 0) * 100);
  const pledgedAmountCents = Number(stats?.pledgedAmount || 0) || 0;
  const totalPledges = Number(stats?.pledgeCount || 0) || pledges.length || 0;
  const newPledgesLast24Hours = countRecentCampaignPledges(pledges, now);
  const percentFunded = goalAmountCents > 0
    ? ((pledgedAmountCents / goalAmountCents) * 100).toFixed(1).replace(/\.0$/, '')
    : '0';

  summary.push(`Total pledges: ${totalPledges}`);
  summary.push(`New pledges in the previous 24 hours: ${newPledgesLast24Hours}`);
  summary.push(`Pledged total: ${formatUsdCents(pledgedAmountCents)}`);
  if (goalAmountCents > 0) {
    summary.push(`Goal progress: ${formatUsdCents(goalAmountCents)} goal (${percentFunded}% funded)`);
  }
  if (campaign?.goal_deadline) {
    summary.push(formatDeadlineCountdown(campaign.goal_deadline, now));
  }

  return summary;
}

function getFulfillmentReportColumnIndex(report, columnName) {
  return Array.isArray(report?.header) ? report.header.indexOf(columnName) : -1;
}

function filterFulfillmentReportRows(report, predicate) {
  if (!Array.isArray(report?.rows) || !Array.isArray(report?.header)) {
    return rebuildCsvReport({ header: [], rows: [] });
  }

  return rebuildCsvReport({
    header: report.header,
    rows: report.rows.filter((row) => predicate(Array.isArray(row) ? row : []))
  });
}

function countFulfillmentItemEntries(itemsValue = '') {
  return String(itemsValue || '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .length;
}

function getFulfillmentSummary(report, {
  audienceLabel,
  fulfillerLabel,
  includeDeadline = false,
  campaign = null,
  now = new Date()
} = {}) {
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  const emailIndex = getFulfillmentReportColumnIndex(report, 'email');
  const itemsIndex = getFulfillmentReportColumnIndex(report, 'items');
  const addOnItemsIndex = getFulfillmentReportColumnIndex(report, 'add_on_items');
  const subtotalIndex = getFulfillmentReportColumnIndex(report, 'subtotal');
  const uniqueSupporters = new Set();
  let lineItems = 0;
  let subtotalCents = 0;

  for (const row of rows) {
    if (emailIndex >= 0) {
      const email = String(row[emailIndex] || '').trim().toLowerCase();
      if (email) uniqueSupporters.add(email);
    }
    if (itemsIndex >= 0) {
      lineItems += countFulfillmentItemEntries(row[itemsIndex]);
    }
    if (addOnItemsIndex >= 0) {
      lineItems += countFulfillmentItemEntries(row[addOnItemsIndex]);
    }
    if (subtotalIndex >= 0) {
      subtotalCents += Math.round((Number(row[subtotalIndex] || 0) || 0) * 100);
    }
  }

  const summary = [];
  summary.push(`Supporters to fulfill: ${uniqueSupporters.size}`);
  summary.push(`Items to fulfill: ${lineItems}`);
  summary.push(`Total raised: ${formatUsdCents(subtotalCents)}`);

  return summary;
}

async function maybeSendCampaignRunnerReport(env, campaign, reportKind, reportDateKey, reportDateLabel, pledges, reportDate = new Date()) {
  const recipients = normalizeCampaignRunnerReportRecipients(campaign);
  const isFulfillmentReport = reportKind === 'Fulfillment report';
  if ((!recipients.length && !isFulfillmentReport) || !pledges.length) {
    return {
      attempted: false,
      sent: 0,
      skipped: recipients.length ? 'no-pledges' : 'no-recipients',
      recipients
    };
  }

  const report = reportKind === 'Fulfillment report'
    ? buildFulfillmentReport(pledges, {
      campaign,
      platformFulfiller: getPlatformCompanyName(env)
    })
    : buildPledgeLedgerReport(pledges, { campaign });
  const slugPart = String(campaign?.slug || 'campaign-report').trim() || 'campaign-report';
  const datePart = String(reportDateKey || '').trim() || getMountainDateKey();
  const includeStatsSummary = getCampaignRunnerIncludeStatsSummary(env);
  const includeCsvAttachment = getCampaignRunnerIncludeCsvAttachment(env);
  const campaignTitle = campaign.title || campaign.slug;

  if (isFulfillmentReport) {
    const fulfillerIndex = getFulfillmentReportColumnIndex(report, 'fulfiller');
    const campaignFulfillmentReport = filterFulfillmentReportRows(
      report,
      (row) => fulfillerIndex >= 0 && String(row[fulfillerIndex] || '').trim() === campaign.slug
    );
    const platformFulfillerLabel = getPlatformCompanyName(env);
    const platformFulfillmentReport = filterFulfillmentReportRows(
      report,
      (row) => fulfillerIndex >= 0 && String(row[fulfillerIndex] || '').trim() === platformFulfillerLabel
    );
    const supportEmail = String(getSupportEmail(env) || '').trim().toLowerCase();
    let sent = 0;
    let platformSent = 0;

    if (campaignFulfillmentReport.rows.length > 0) {
      const runnerSummary = includeStatsSummary
        ? getFulfillmentSummary(campaignFulfillmentReport, {
          audienceLabel: 'Campaign runner fulfillment',
          fulfillerLabel: campaign.slug,
          includeDeadline: true,
          campaign,
          now: reportDate
        })
        : [];
      const fulfillmentEncouragement = buildCampaignRunnerEncouragement(campaign, reportKind, pledges, reportDate);
      const runnerCsvFilename = `${slugPart}-fulfillment-report-${datePart}.csv`;

      for (let index = 0; index < recipients.length; index += 1) {
        if (sent > 0) {
          await new Promise((resolve) => setTimeout(resolve, RESEND_RATE_LIMIT_DELAY));
        }

        await sendCampaignRunnerReportEmail(env, {
          email: recipients[index],
          campaignSlug: campaign.slug,
          campaignTitle,
          reportKind,
          reportDateLabel,
          statsSummary: runnerSummary,
          encouragement: fulfillmentEncouragement,
          csvFilename: runnerCsvFilename,
          csvContent: campaignFulfillmentReport.csv,
          includeCsvAttachment
        });
        sent += 1;
      }
    }

    if (supportEmail && platformFulfillmentReport.rows.length > 0) {
      if (sent > 0) {
        await new Promise((resolve) => setTimeout(resolve, RESEND_RATE_LIMIT_DELAY));
      }

      const platformSummary = includeStatsSummary
        ? getFulfillmentSummary(platformFulfillmentReport, {
          audienceLabel: 'Platform fulfillment',
          fulfillerLabel: platformFulfillerLabel,
          includeDeadline: true,
          campaign,
          now: reportDate
        })
        : [];
      const platformEncouragement = buildCampaignRunnerEncouragement(campaign, 'Platform fulfillment report', pledges, reportDate);
      const platformCsvFilename = `${slugPart}-platform-fulfillment-report-${datePart}.csv`;

      await sendCampaignRunnerReportEmail(env, {
        email: supportEmail,
        campaignSlug: campaign.slug,
        campaignTitle,
        reportKind: 'Platform fulfillment report',
        reportDateLabel,
        statsSummary: platformSummary,
        encouragement: platformEncouragement,
        csvFilename: platformCsvFilename,
        csvContent: platformFulfillmentReport.csv,
        includeCsvAttachment
      });
      sent += 1;
      platformSent = 1;
    }

    return {
      attempted: campaignFulfillmentReport.rows.length > 0 || platformFulfillmentReport.rows.length > 0,
      sent,
      rowCount: campaignFulfillmentReport.rows.length,
      recipients,
      platformRecipient: supportEmail || null,
      platformRowCount: platformFulfillmentReport.rows.length,
      campaignRowCount: campaignFulfillmentReport.rows.length,
      platformSent
    };
  }

  const stats = await getCampaignStats(env, campaign.slug);
  const summary = includeStatsSummary
    ? getCampaignRunnerStatsSummary(campaign, stats, env, reportKind, pledges, reportDate)
    : [];
  const encouragement = buildCampaignRunnerEncouragement(campaign, reportKind, pledges, reportDate);
  const csvFilename = `${slugPart}-pledge-report-${datePart}.csv`;

  let sent = 0;
  for (let index = 0; index < recipients.length; index += 1) {
    if (index > 0) {
      await new Promise((resolve) => setTimeout(resolve, RESEND_RATE_LIMIT_DELAY));
    }

    await sendCampaignRunnerReportEmail(env, {
      email: recipients[index],
      campaignSlug: campaign.slug,
      campaignTitle,
      reportKind,
      reportDateLabel,
      statsSummary: summary,
      encouragement,
      csvFilename,
      csvContent: report.csv,
      includeCsvAttachment
    });
    sent += 1;
  }

  return { attempted: true, sent, rowCount: report.rows.length, recipients };
}

async function processCampaignRunnerReports(env, now = new Date()) {
  if (!env.PLEDGES || !getCampaignRunnerReportsEnabled(env) || !shouldRunCampaignRunnerReportsNow(env, now)) {
    return { attempted: false, sent: 0, skipped: 'disabled-or-outside-window' };
  }

  const campaignsData = await getCampaigns(env);
  const campaigns = campaignsData?.campaigns || campaignsData || [];
  const reportDateKey = getMountainDateKey(now);
  const reportDateLabel = formatCampaignRunnerReportDateLabel(now);
  const results = {
    attempted: true,
    checked: 0,
    sent: 0,
    reports: [],
    errors: []
  };

  for (const campaign of campaigns) {
    const recipients = normalizeCampaignRunnerReportRecipients(campaign);
    const supportEmail = String(getSupportEmail(env) || '').trim().toLowerCase();
    const shouldCheckPledgeReport = recipients.length > 0;
    const shouldCheckFulfillmentReport = Boolean(supportEmail || recipients.length > 0);
    if (!shouldCheckPledgeReport && !shouldCheckFulfillmentReport) {
      continue;
    }

    results.checked += 1;

    try {
      const effectiveState = getEffectiveState(campaign);
      const pledges = await getCampaignReportPledges(env, campaign.slug);

      if (effectiveState === 'live' && shouldCheckPledgeReport && getCampaignRunnerDailyPledgeReportEnabled(env)) {
        const markerKey = `campaign-runner-report:pledge:${campaign.slug}:${reportDateKey}`;
        const alreadySent = await env.PLEDGES.get(markerKey);
        if (!alreadySent) {
          const outcome = await maybeSendCampaignRunnerReport(env, campaign, 'Daily pledge report', reportDateKey, reportDateLabel, pledges, now);
          if (outcome.attempted && outcome.sent > 0) {
            await env.PLEDGES.put(markerKey, JSON.stringify({
              sentAt: new Date().toISOString(),
              sent: outcome.sent,
              reportDateKey
            }), { expirationTtl: CAMPAIGN_RUNNER_REPORT_MARKER_TTL_SECONDS });
            results.sent += outcome.sent;
            results.reports.push({ campaignSlug: campaign.slug, type: 'pledge', sent: outcome.sent, rowCount: outcome.rowCount });
          }
        }
      }

      if (effectiveState === 'post' && shouldCheckFulfillmentReport && getCampaignRunnerFulfillmentReportEnabled(env)) {
        const markerKey = `campaign-runner-report:fulfillment:${campaign.slug}`;
        const alreadySent = await env.PLEDGES.get(markerKey);
        if (!alreadySent) {
          const outcome = await maybeSendCampaignRunnerReport(env, campaign, 'Fulfillment report', reportDateKey, reportDateLabel, pledges, now);
          if (outcome.attempted && outcome.sent > 0) {
            await env.PLEDGES.put(markerKey, JSON.stringify({
              sentAt: new Date().toISOString(),
              sent: outcome.sent,
              reportDateKey
            }), { expirationTtl: CAMPAIGN_RUNNER_REPORT_MARKER_TTL_SECONDS });
            results.sent += outcome.sent;
            results.reports.push({ campaignSlug: campaign.slug, type: 'fulfillment', sent: outcome.sent, rowCount: outcome.rowCount });
          }
        }
      }
    } catch (error) {
      results.errors.push({
        campaignSlug: campaign.slug,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return results;
}

async function handleCampaignRunnerReport(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const parsedBody = await parseJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES
  });
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.body || {};
  const campaignSlug = String(body.campaignSlug || '').trim();
  const reportType = normalizeCampaignRunnerReportType(body.reportType);
  const dryRun = body.dryRun === true;
  const markAsSent = body.markAsSent === undefined ? !dryRun : body.markAsSent === true;

  if (!campaignSlug) {
    return jsonResponse({ error: 'Missing campaignSlug' }, 400);
  }

  const campaign = await getCampaign(env, campaignSlug);
  if (!campaign) {
    return jsonResponse({ error: 'Campaign not found' }, 404);
  }

  const recipients = normalizeCampaignRunnerReportRecipients(campaign);
  const supportEmail = String(getSupportEmail(env) || '').trim().toLowerCase();
  const reportDate = new Date();
  const reportDateKey = getMountainDateKey(reportDate);
  const reportDateLabel = formatCampaignRunnerReportDateLabel(reportDate);
  const markerKey = getCampaignRunnerReportMarkerKey(reportType, campaignSlug, reportDateKey);
  const markerPayload = await env.PLEDGES?.get(markerKey, { type: 'json' });
  const reportKind = getCampaignRunnerReportKindLabel(reportType);
  const pledges = await getCampaignReportPledges(env, campaignSlug);
  const report = reportType === 'fulfillment'
    ? buildFulfillmentReport(pledges, {
      campaign,
      platformFulfiller: getPlatformCompanyName(env)
    })
    : buildPledgeLedgerReport(pledges, { campaign });
  const summary = getCampaignRunnerIncludeStatsSummary(env)
    ? getCampaignRunnerStatsSummary(
      campaign,
      await getCampaignStats(env, campaignSlug),
      env,
      reportKind,
      pledges,
      reportDate
    )
    : [];
  const csvFilename = `${campaignSlug}-${reportType === 'fulfillment' ? 'fulfillment-report' : 'pledge-report'}-${reportDateKey}.csv`;
  const fulfillerIndex = reportType === 'fulfillment'
    ? getFulfillmentReportColumnIndex(report, 'fulfiller')
    : -1;
  const campaignRowCount = reportType === 'fulfillment'
    ? filterFulfillmentReportRows(
      report,
      (row) => fulfillerIndex >= 0 && String(row[fulfillerIndex] || '').trim() === campaign.slug
    ).rows.length
    : report.rows.length;
  const platformRowCount = reportType === 'fulfillment'
    ? filterFulfillmentReportRows(
      report,
      (row) => fulfillerIndex >= 0 && String(row[fulfillerIndex] || '').trim() === getPlatformCompanyName(env)
    ).rows.length
    : 0;

  if (dryRun) {
    return jsonResponse({
      dryRun: true,
      campaignSlug,
      reportType,
      reportKind,
      effectiveState: getEffectiveState(campaign) || campaign?.state || 'unknown',
      recipientCount: recipients.length,
      recipients,
      platformRecipient: reportType === 'fulfillment' ? supportEmail || null : null,
      rowCount: campaignRowCount,
      campaignRowCount,
      platformRowCount,
      csvFilename,
      reportDateKey,
      reportDateLabel,
      includeStatsSummary: getCampaignRunnerIncludeStatsSummary(env),
      includeCsvAttachment: getCampaignRunnerIncludeCsvAttachment(env),
      alreadyMarked: Boolean(markerPayload),
      markerKey,
      markAsSentDefault: !dryRun,
      statsSummary: summary
    });
  }

  const outcome = await maybeSendCampaignRunnerReport(env, campaign, reportKind, reportDateKey, reportDateLabel, pledges, reportDate);

  if (markAsSent && outcome.attempted && outcome.sent > 0 && env.PLEDGES) {
    await env.PLEDGES.put(markerKey, JSON.stringify({
      sentAt: new Date().toISOString(),
      sent: outcome.sent,
      reportDateKey,
      source: 'admin_manual'
    }), { expirationTtl: CAMPAIGN_RUNNER_REPORT_MARKER_TTL_SECONDS });
  }

  return jsonResponse({
    success: true,
    campaignSlug,
    reportType,
    reportKind,
    effectiveState: getEffectiveState(campaign) || campaign?.state || 'unknown',
    recipientCount: recipients.length,
    recipients,
    platformRecipient: reportType === 'fulfillment' ? supportEmail || null : null,
    rowCount: outcome.campaignRowCount ?? campaignRowCount,
    campaignRowCount: outcome.campaignRowCount ?? campaignRowCount,
    platformRowCount: outcome.platformRowCount ?? platformRowCount,
    csvFilename,
    reportDateKey,
    reportDateLabel,
    markedAsSent: markAsSent && outcome.attempted && outcome.sent > 0,
    alreadyMarked: Boolean(markerPayload),
    ...outcome
  });
}

/**
 * Trigger automatic milestone emails when funding thresholds are crossed
 * Called after stats are updated with a new pledge
 */
async function triggerMilestoneEmails(env, campaignSlug) {
  try {
    const campaign = await getCampaign(env, campaignSlug);
    if (!campaign || !campaign.goal_amount) return;
    
    const stats = await getCampaignStats(env, campaignSlug);
    const goalAmountCents = campaign.goal_amount * 100;
    const progress = stats.pledgedAmount / goalAmountCents;
    
    // Pass campaign to check stretch goals too
    const newMilestones = await checkMilestones(env, campaignSlug, stats.pledgedAmount, goalAmountCents, campaign);
    
    if (newMilestones.length === 0) return;
    
    console.log('🎯 Milestone(s) reached:', newMilestones, 'for campaign:', campaignSlug);
    
    // Mark skipped intermediate milestones as sent (so they don't trigger later)
    // If we're sending 'goal', also mark one-third and two-thirds as sent
    // If we're sending 'two-thirds', also mark one-third as sent
    const sent_milestones = await getSentMilestones(env, campaignSlug);
    if (newMilestones.includes('goal')) {
      if (progress >= 0.33 && !sent_milestones.includes('one-third')) {
        await markMilestoneSent(env, campaignSlug, 'one-third');
        console.log('🎯 Skipped intermediate milestone one-third (goal reached)');
      }
      if (progress >= 0.66 && !sent_milestones.includes('two-thirds')) {
        await markMilestoneSent(env, campaignSlug, 'two-thirds');
        console.log('🎯 Skipped intermediate milestone two-thirds (goal reached)');
      }
    } else if (newMilestones.includes('two-thirds')) {
      if (progress >= 0.33 && !sent_milestones.includes('one-third')) {
        await markMilestoneSent(env, campaignSlug, 'one-third');
        console.log('🎯 Skipped intermediate milestone one-third (two-thirds reached)');
      }
    }
    
    for (const milestoneItem of newMilestones) {
      // Handle both string milestones and stretch goal objects
      const isStretch = typeof milestoneItem === 'object' && milestoneItem.type === 'stretch';
      const milestoneType = isStretch ? 'stretch' : milestoneItem;
      const milestoneId = isStretch ? milestoneItem.id : milestoneItem;
      const stretchGoalName = isStretch ? milestoneItem.name : undefined;
      const latestSentMilestones = await getSentMilestones(env, campaignSlug);

      if (latestSentMilestones.includes(milestoneId)) {
        console.log(`🎯 Skipping already-sent milestone ${milestoneId} for ${campaignSlug}`);
        continue;
      }

      await markMilestoneSent(env, campaignSlug, milestoneId);
      const supporters = await getCampaignSupporters(env, campaignSlug);

      console.log(`🎯 Starting milestone ${milestoneId} email broadcast...`);
      
      let sent = 0;
      let failed = 0;
      
      for (let i = 0; i < supporters.length; i++) {
        const supporter = supporters[i];
        
        // Rate limit: Resend allows 2 req/sec
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, RESEND_RATE_LIMIT_DELAY));
        }
        
        try {
          const token = await generateToken(env.MAGIC_LINK_SECRET, {
            orderId: supporter.orderId,
            email: supporter.email,
            campaignSlug
          });

          await sendMilestoneEmail(env, {
            email: supporter.email,
            campaignSlug,
            campaignTitle: campaign.title,
            preferredLang: supporter.preferredLang || DEFAULT_I18N_LANG,
            milestone: milestoneType,
            pledgedAmount: stats.pledgedAmount,
            goalAmount: goalAmountCents,
            stretchGoalName,
            token,
            instagramUrl: campaign.instagram
          });
          sent++;
        } catch (err) {
          console.error('Failed to send milestone email:', supporter.email, err.message);
          failed++;
        }
      }
      
      console.log(`🎯 Milestone ${milestoneId} emails sent: ${sent}, failed: ${failed}`);
    }
  } catch (err) {
    console.error('Error triggering milestone emails:', err.message);
  }
}

/**
 * Admin: Broadcast announcement with optional CTA link to all campaign supporters
 */
async function handleBroadcastAnnouncement(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const parsedBody = await parseJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body || {};
  const { campaignSlug, subject, heading, body: messageBody, ctaLabel, ctaUrl, dryRun } = body;

  if (!campaignSlug || !subject || !messageBody) {
    return jsonResponse({ error: 'Missing campaignSlug, subject, or body' }, 400);
  }

  const campaign = await getCampaign(env, campaignSlug);
  if (!campaign) {
    return jsonResponse({ error: 'Campaign not found' }, 404);
  }

  const supporters = await getCampaignSupporters(env, campaignSlug);
  
  if (dryRun) {
    return jsonResponse({
      dryRun: true,
      campaignSlug,
      subject,
      ctaLabel,
      ctaUrl,
      recipientCount: supporters.length,
      recipients: supporters.map(s => s.email)
    });
  }

  const results = { sent: 0, failed: 0, errors: [] };

  for (let i = 0; i < supporters.length; i++) {
    const supporter = supporters[i];
    
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, RESEND_RATE_LIMIT_DELAY));
    }
    
    try {
      const token = await generateToken(env.MAGIC_LINK_SECRET, {
        orderId: supporter.orderId,
        email: supporter.email,
        campaignSlug
      });

      await sendAnnouncementEmail(env, {
        email: supporter.email,
        campaignSlug,
        campaignTitle: campaign.title,
        preferredLang: supporter.preferredLang || DEFAULT_I18N_LANG,
        subject,
        heading,
        body: messageBody,
        ctaLabel,
        ctaUrl,
        token,
        instagramUrl: campaign.instagram,
        hasDecisions: campaign?.has_decisions === true
      });
      results.sent++;
    } catch (err) {
      results.failed++;
      results.errors.push({ email: supporter.email, error: err.message });
    }
  }

  return jsonResponse({
    success: true,
    campaignSlug,
    subject,
    ...results
  });
}

/**
 * Admin: Broadcast diary update to all campaign supporters
 */
async function handleBroadcastDiary(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const parsedBody = await parseJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body || {};
  const { campaignSlug, diaryTitle, diaryExcerpt, dryRun } = body;

  if (!campaignSlug || !diaryTitle) {
    return jsonResponse({ error: 'Missing campaignSlug or diaryTitle' }, 400);
  }

  const campaign = await getCampaign(env, campaignSlug);
  if (!campaign) {
    return jsonResponse({ error: 'Campaign not found' }, 404);
  }

  const supporters = await getCampaignSupporters(env, campaignSlug);
  
  if (dryRun) {
    return jsonResponse({
      dryRun: true,
      campaignSlug,
      diaryTitle,
      recipientCount: supporters.length,
      recipients: supporters.map(s => s.email)
    });
  }

  const results = { sent: 0, failed: 0, errors: [] };

  for (let i = 0; i < supporters.length; i++) {
    const supporter = supporters[i];
    
    // Rate limit: Resend allows 2 req/sec
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, RESEND_RATE_LIMIT_DELAY));
    }
    
    try {
      const token = await generateToken(env.MAGIC_LINK_SECRET, {
        orderId: supporter.orderId,
        email: supporter.email,
        campaignSlug
      });

      await sendDiaryUpdateEmail(env, {
        email: supporter.email,
        campaignSlug,
        campaignTitle: campaign.title,
        preferredLang: supporter.preferredLang || DEFAULT_I18N_LANG,
        diaryTitle,
        diaryExcerpt,
        token,
        hasDecisions: campaign?.has_decisions === true
      });
      results.sent++;
    } catch (err) {
      results.failed++;
      results.errors.push({ email: supporter.email, error: err.message });
    }
  }

  return jsonResponse({
    success: true,
    campaignSlug,
    diaryTitle,
    ...results
  });
}

/**
 * Admin: Check all campaigns for new diary entries and broadcast them
 * Called automatically after deploy via GitHub Action
 */
async function handleDiaryCheck(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const parsedBody = await parseOptionalJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
    emptyValue: {}
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body || {};
  const { dryRun } = body;

  const campaignsData = await getCampaigns(env);
  const campaigns = campaignsData.campaigns || campaignsData;
  
  const results = {
    checked: 0,
    newEntries: [],
    sent: 0,
    failed: 0,
    errors: []
  };

  for (const campaign of campaigns) {
    results.checked++;
    
    if (!campaign.diary || !Array.isArray(campaign.diary) || campaign.diary.length === 0) {
      continue;
    }

    const sentDates = await getSentDiaryEntries(env, campaign.slug);
    
    for (const entry of campaign.diary) {
      if (!entry.date || !entry.title) continue;
      
      if (sentDates.includes(entry.date)) continue;
      
      results.newEntries.push({
        campaignSlug: campaign.slug,
        campaignTitle: campaign.title,
        date: entry.date,
        title: entry.title
      });

      if (dryRun) continue;

      const supporters = await getCampaignSupporters(env, campaign.slug);
      
      if (supporters.length === 0) {
        await markDiarySent(env, campaign.slug, entry.date);
        continue;
      }

      console.log(`📝 Broadcasting diary entry "${entry.title}" to ${supporters.length} supporters of ${campaign.slug}`);

      for (let i = 0; i < supporters.length; i++) {
        const supporter = supporters[i];
        
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, RESEND_RATE_LIMIT_DELAY));
        }
        
        try {
          const token = await generateToken(env.MAGIC_LINK_SECRET, {
            orderId: supporter.orderId,
            email: supporter.email,
            campaignSlug: campaign.slug
          });

          await sendDiaryUpdateEmail(env, {
            email: supporter.email,
            campaignSlug: campaign.slug,
            campaignTitle: campaign.title,
            preferredLang: supporter.preferredLang || DEFAULT_I18N_LANG,
            diaryTitle: entry.title,
            diaryExcerpt: getDiaryExcerpt(entry),
            diaryPhase: entry.phase,
            token,
            instagramUrl: campaign.instagram,
            hasDecisions: campaign?.has_decisions === true
          });
          results.sent++;
        } catch (err) {
          results.failed++;
          results.errors.push({ 
            campaignSlug: campaign.slug,
            diaryDate: entry.date,
            email: supporter.email, 
            error: err.message 
          });
        }
      }

      await markDiarySent(env, campaign.slug, entry.date);
    }
  }

  return jsonResponse({
    success: true,
    dryRun: !!dryRun,
    ...results
  });
}

/**
 * Admin: Broadcast milestone notification to all campaign supporters
 */
async function handleBroadcastMilestone(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const parsedBody = await parseJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body || {};
  const { campaignSlug, milestone, stretchGoalName, dryRun } = body;

  if (!campaignSlug || !milestone) {
    return jsonResponse({ error: 'Missing campaignSlug or milestone' }, 400);
  }

  const validMilestones = ['one-third', 'two-thirds', 'goal', 'stretch'];
  if (!validMilestones.includes(milestone)) {
    return jsonResponse({ error: `Invalid milestone. Must be one of: ${validMilestones.join(', ')}` }, 400);
  }

  const campaign = await getCampaign(env, campaignSlug);
  if (!campaign) {
    return jsonResponse({ error: 'Campaign not found' }, 404);
  }

  const supporters = await getCampaignSupporters(env, campaignSlug);
  
  // Build milestone ID for tracking (matches format used by checkMilestones)
  // For stretch goals, caller should provide stretchThreshold to form the ID
  const url = new URL(request.url);
  const stretchThreshold = url.searchParams.get('stretchThreshold');
  const milestoneId = milestone === 'stretch' && stretchThreshold 
    ? `stretch:${stretchThreshold}` 
    : milestone;
  
  // Check if already sent (prevent duplicates)
  const sentMilestones = await getSentMilestones(env, campaignSlug);
  const alreadySent = sentMilestones.includes(milestoneId);
  
  if (dryRun) {
    return jsonResponse({
      dryRun: true,
      campaignSlug,
      milestone,
      milestoneId,
      alreadySent,
      recipientCount: supporters.length,
      recipients: supporters.map(s => s.email)
    });
  }
  
  // Warn but don't block if already sent (admin may want to resend intentionally)
  if (alreadySent) {
    console.warn(`⚠️ Milestone ${milestoneId} already sent for ${campaignSlug}, proceeding anyway (manual broadcast)`);
  }

  const results = { sent: 0, failed: 0, errors: [] };

  for (let i = 0; i < supporters.length; i++) {
    const supporter = supporters[i];
    
    // Rate limit: Resend allows 2 req/sec
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, RESEND_RATE_LIMIT_DELAY));
    }
    
    try {
      const token = await generateToken(env.MAGIC_LINK_SECRET, {
        orderId: supporter.orderId,
        email: supporter.email,
        campaignSlug
      });

      await sendMilestoneEmail(env, {
        email: supporter.email,
        campaignSlug,
        campaignTitle: campaign.title,
        preferredLang: supporter.preferredLang || DEFAULT_I18N_LANG,
        milestone,
        pledgedAmount: campaign.pledged_amount || 0,
        goalAmount: campaign.goal_amount || 100000,
        stretchGoalName,
        token,
        instagramUrl: campaign.instagram
      });
      results.sent++;
    } catch (err) {
      results.failed++;
      results.errors.push({ email: supporter.email, error: err.message });
    }
  }
  
  // Mark milestone as sent (prevents auto-trigger from sending again)
  await markMilestoneSent(env, campaignSlug, milestoneId);

  return jsonResponse({
    success: true,
    campaignSlug,
    milestone,
    milestoneId,
    ...results
  });
}

/**
 * Admin: Check and trigger any pending milestone emails for a campaign
 * Use this to catch up on milestones for campaigns that crossed thresholds before auto-trigger was implemented
 */
async function handleMilestoneCheck(request, campaignSlug, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const campaign = await getCampaign(env, campaignSlug);
  if (!campaign) {
    return jsonResponse({ error: 'Campaign not found' }, 404);
  }

  const stats = await getCampaignStats(env, campaignSlug);
  const goalAmountCents = (campaign.goal_amount || 0) * 100;
  
  if (!goalAmountCents) {
    return jsonResponse({ error: 'Campaign has no goal amount set' }, 400);
  }

  const progress = stats.pledgedAmount / goalAmountCents;
  // Pass campaign to check stretch goals too
  const newMilestones = await checkMilestones(env, campaignSlug, stats.pledgedAmount, goalAmountCents, campaign);
  const sentMilestones = await getSentMilestones(env, campaignSlug);

  // Check if dryRun requested
  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === 'true';

  if (dryRun) {
    return jsonResponse({
      dryRun: true,
      campaignSlug,
      pledgedAmount: stats.pledgedAmount,
      goalAmount: goalAmountCents,
      progress: `${(progress * 100).toFixed(1)}%`,
      sentMilestones,
      pendingMilestones: newMilestones,
      stretchGoals: campaign.stretch_goals || []
    });
  }

  if (newMilestones.length === 0) {
    return jsonResponse({
      success: true,
      campaignSlug,
      message: 'No new milestones to trigger',
      progress: `${(progress * 100).toFixed(1)}%`,
      sentMilestones
    });
  }

  // Mark skipped intermediate milestones as sent (so they don't trigger later)
  const skippedMilestones = [];
  if (newMilestones.some(m => m === 'goal' || (typeof m === 'object' && m.type === 'stretch'))) {
    // If goal or stretch is being sent, mark any skipped percentage milestones
    if (newMilestones.includes('goal')) {
      if (progress >= 0.33 && !sentMilestones.includes('one-third')) {
        await markMilestoneSent(env, campaignSlug, 'one-third');
        skippedMilestones.push('one-third');
      }
      if (progress >= 0.66 && !sentMilestones.includes('two-thirds')) {
        await markMilestoneSent(env, campaignSlug, 'two-thirds');
        skippedMilestones.push('two-thirds');
      }
    } else if (newMilestones.includes('two-thirds')) {
      if (progress >= 0.33 && !sentMilestones.includes('one-third')) {
        await markMilestoneSent(env, campaignSlug, 'one-third');
        skippedMilestones.push('one-third');
      }
    }
  }

  const results = { sent: 0, failed: 0, milestones: [], skippedMilestones };

  for (const milestoneItem of newMilestones) {
    // Handle both string milestones and stretch goal objects
    const isStretch = typeof milestoneItem === 'object' && milestoneItem.type === 'stretch';
    const milestoneType = isStretch ? 'stretch' : milestoneItem;
    const milestoneId = isStretch ? milestoneItem.id : milestoneItem;
    const stretchGoalName = isStretch ? milestoneItem.name : undefined;
    const latestSentMilestones = await getSentMilestones(env, campaignSlug);

    if (latestSentMilestones.includes(milestoneId)) {
      results.milestones.push({ milestone: milestoneId, sent: 0, failed: 0, skipped: true });
      continue;
    }

    await markMilestoneSent(env, campaignSlug, milestoneId);
    const supporters = await getCampaignSupporters(env, campaignSlug);

    let mSent = 0;
    let mFailed = 0;

    for (let i = 0; i < supporters.length; i++) {
      const supporter = supporters[i];
      
      // Rate limit: Resend allows 2 req/sec
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, RESEND_RATE_LIMIT_DELAY));
      }
      
      try {
        const token = await generateToken(env.MAGIC_LINK_SECRET, {
          orderId: supporter.orderId,
          email: supporter.email,
          campaignSlug
        });

        await sendMilestoneEmail(env, {
          email: supporter.email,
          campaignSlug,
          campaignTitle: campaign.title,
          preferredLang: supporter.preferredLang || DEFAULT_I18N_LANG,
          milestone: milestoneType,
          pledgedAmount: stats.pledgedAmount,
          goalAmount: goalAmountCents,
          stretchGoalName,
          token,
          instagramUrl: campaign.instagram
        });
        mSent++;
        results.sent++;
      } catch (err) {
        mFailed++;
        results.failed++;
      }
    }

    results.milestones.push({ milestone: milestoneId, sent: mSent, failed: mFailed });
  }

  return jsonResponse({
    success: true,
    campaignSlug,
    progress: `${(progress * 100).toFixed(1)}%`,
    ...results
  });
}

/**
 * Test endpoint: Send individual test emails (test mode only)
 */
async function handleTestEmail(request, env) {
  // Allow in test mode, or in production with admin auth
  if (getAppMode(env) !== 'test') {
    const auth = requireAdmin(request, env);
    if (!auth.ok) {
      return jsonResponse({ error: 'Test endpoints require admin auth in production' }, 403);
    }
  }

  const parsedBody = await parseJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body || {};
  const { type, email, campaignSlug } = body;

  if (!type || !email) {
    return jsonResponse({ error: 'Missing type or email' }, 400);
  }

  const campaign = await getCampaign(env, campaignSlug || 'hand-relations');
  const campaignTitle = campaign?.title || 'Test Campaign';
  const instagramUrl = campaign?.instagram || 'https://instagram.com/thepool';
  
  // Use the same test order ID shape as /test/setup so manage links work.
  const resolvedCampaignSlug = campaignSlug || 'hand-relations';
  const testOrderId = getTestFixtureOrderId(email, resolvedCampaignSlug);

  const token = await generateToken(env.MAGIC_LINK_SECRET, {
    orderId: testOrderId,
    email,
    campaignSlug: resolvedCampaignSlug
  });

  try {
    switch (type) {
      case 'supporter':
        await sendSupporterEmail(env, {
          email,
          campaignSlug: campaignSlug || 'hand-relations',
          campaignTitle,
          subtotal: 5000,
          tax: 394,
          shipping: 300,
          tipAmount: 250,
          tipPercent: 5,
          token,
          instagramUrl,
          hasDecisions: campaign?.has_decisions === true,
          pledgeItems: {
            tierName: 'Test Tier',
            tierQty: 2,
            additionalTiers: [],
            supportItems: [{ label: 'Location Scouting', amount: 10 }],
            customAmount: 5
          }
        });
        break;

      case 'modified':
        await sendPledgeModifiedEmail(env, {
          email,
          campaignSlug: campaignSlug || 'hand-relations',
          campaignTitle,
          previousSubtotal: 5000,
          previousTax: 394,
          previousShipping: 300,
          previousTipAmount: 250,
          newSubtotal: 10000,
          tax: 788,
          shipping: 300,
          tipAmount: 500,
          tipPercent: 5,
          token,
          instagramUrl,
          pledgeItems: {
            tierName: 'Test Tier',
            tierQty: 3,
            additionalTiers: [{ name: 'Digital Download', qty: 1 }],
            supportItems: [{ label: 'Location Scouting', amount: 15 }],
            customAmount: 10
          }
        });
        break;

      case 'payment-failed':
        await sendPaymentFailedEmail(env, {
          email,
          campaignSlug: campaignSlug || 'hand-relations',
          campaignTitle,
          preferredLang: DEFAULT_I18N_LANG,
          subtotal: 10000,  // $100.00
          tax: 788,         // $7.88
          shipping: 300,    // $3.00
          tipAmount: 500,   // $5.00
          tipPercent: 5,
          amount: 11588,    // $115.88 total
          token,
          pledgeItems: {
            tierName: 'Test Tier',
            tierQty: 2,
            additionalTiers: [{ name: 'Digital Download', qty: 1 }],
            supportItems: [{ label: 'Location Scouting', amount: 15 }],
            customAmount: 10
          }
        });
        break;

      case 'diary':
        await sendDiaryUpdateEmail(env, {
          email,
          campaignSlug: campaignSlug || 'hand-relations',
          campaignTitle,
          preferredLang: DEFAULT_I18N_LANG,
          diaryTitle: 'Test Diary Entry',
          diaryExcerpt: 'This is a test diary update to verify the email template is working correctly.',
          token,
          instagramUrl,
          hasDecisions: campaign?.has_decisions === true
        });
        break;

      case 'milestone-one-third':
        await sendMilestoneEmail(env, {
          email,
          campaignSlug: campaignSlug || 'hand-relations',
          campaignTitle,
          preferredLang: DEFAULT_I18N_LANG,
          milestone: 'one-third',
          pledgedAmount: 3333,
          goalAmount: 10000,
          token,
          instagramUrl
        });
        break;

      case 'milestone-two-thirds':
        await sendMilestoneEmail(env, {
          email,
          campaignSlug: campaignSlug || 'hand-relations',
          campaignTitle,
          preferredLang: DEFAULT_I18N_LANG,
          milestone: 'two-thirds',
          pledgedAmount: 6666,
          goalAmount: 10000,
          token,
          instagramUrl
        });
        break;

      case 'milestone-goal':
        await sendMilestoneEmail(env, {
          email,
          campaignSlug: campaignSlug || 'hand-relations',
          campaignTitle,
          preferredLang: DEFAULT_I18N_LANG,
          milestone: 'goal',
          pledgedAmount: 10000,
          goalAmount: 10000,
          token,
          instagramUrl
        });
        break;

      case 'milestone-stretch':
        await sendMilestoneEmail(env, {
          email,
          campaignSlug: campaignSlug || 'hand-relations',
          campaignTitle,
          preferredLang: DEFAULT_I18N_LANG,
          milestone: 'stretch',
          pledgedAmount: 15000,
          goalAmount: 10000,
          stretchGoalName: 'Director\'s Commentary',
          token,
          instagramUrl
        });
        break;

      case 'charge-success':
        await sendChargeSuccessEmail(env, {
          email,
          campaignSlug: campaignSlug || 'hand-relations',
          campaignTitle,
          preferredLang: DEFAULT_I18N_LANG,
          subtotal: 10000,  // $100.00
          tax: 788,         // $7.88
          shipping: 300,    // $3.00
          tipAmount: 500,   // $5.00
          tipPercent: 5,
          amount: 11588,    // $115.88 total
          token,
          hasDecisions: campaign?.has_decisions === true,
          pledgeItems: {
            tierName: 'Test Tier',
            tierQty: 2,
            additionalTiers: [{ name: 'Digital Download', qty: 1 }],
            supportItems: [{ label: 'Location Scouting', amount: 15 }],
            customAmount: 10
          }
        });
        break;

      default:
        return jsonResponse({ 
          error: 'Invalid type. Valid types: supporter, modified, payment-failed, diary, milestone-one-third, milestone-two-thirds, milestone-goal, milestone-stretch, charge-success' 
        }, 400);
    }

    return jsonResponse({
      success: true,
      type,
      email,
      message: `Test ${type} email sent`
    });
  } catch (err) {
    return jsonResponse({
      success: false,
      error: err.message
    }, 500);
  }
}

async function handleTestVotes(request, env) {
  if (getAppMode(env) !== 'test') {
    return jsonResponse({ error: 'Test endpoints only available in test mode' }, 403);
  }

  const parsedBody = await parseJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body || {};
  const { campaignSlug, decisions } = body;

  if (!campaignSlug || !decisions) {
    return jsonResponse({ error: 'Missing campaignSlug or decisions' }, 400);
  }

  const seeded = [];
  for (const [decisionId, votes] of Object.entries(decisions)) {
    const resultsKey = `results:${campaignSlug}:${decisionId}`;
    await env.VOTES.put(resultsKey, JSON.stringify(votes));
    seeded.push({ decisionId, votes });
  }

  return jsonResponse({
    success: true,
    campaignSlug,
    seeded
  });
}

async function handleAdminRebuild(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  let reason = 'admin-triggered';
  const parsedBody = await parseOptionalJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
    emptyValue: {}
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body || {};
  if (body.reason) reason = body.reason;

  const result = await triggerSiteRebuild(env, reason);
  
  if (result.triggered) {
    return jsonResponse({ success: true, message: 'Site rebuild triggered' });
  }
  
  return jsonResponse({ 
    success: false, 
    error: result.reason || 'Failed to trigger rebuild' 
  }, 500);
}

async function handleAdminDashboardSummary(request, env) {
  const auth = await requireAdminSession(request, env, 'campaign:read');
  if (!auth.ok) return auth.response;

  const { campaigns } = await getCampaigns(env);
  const allowedCampaigns = (campaigns || []).filter((campaign) => (
    auth.user.role === 'super_admin' ||
    auth.user.campaignSlugs.includes(String(campaign?.slug || ''))
  ));

  const campaignSummaries = [];
  const totals = {
    campaignCount: allowedCampaigns.length,
    liveCampaigns: 0,
    pledgedAmount: 0,
    pledgeCount: 0
  };

  for (const campaign of allowedCampaigns) {
    const stats = await getCampaignStats(env, campaign.slug);
    const pledgedAmount = Number(stats?.pledgedAmount || 0);
    const pledgeCount = Number(stats?.pledgeCount || 0);
    const goalAmount = Number(campaign?.goal_amount || 0);
    const effectiveState = getEffectiveState(campaign) || campaign?.state || 'unknown';
    if (effectiveState === 'live') {
      totals.liveCampaigns += 1;
    }
    totals.pledgedAmount += pledgedAmount;
    totals.pledgeCount += pledgeCount;

    campaignSummaries.push({
      slug: campaign.slug,
      title: campaign.title || campaign.slug,
      state: campaign.state || 'unknown',
      effectiveState,
      goalAmount,
      pledgedAmount,
      pledgeCount,
      percentFunded: goalAmount > 0
        ? Math.round((pledgedAmount / (goalAmount * 100)) * 100)
        : 0,
      runnerReportConfigured: Array.isArray(campaign.runner_report_emails) && campaign.runner_report_emails.length > 0
    });
  }

  return privateJsonResponse({
    user: auth.user,
    totals,
    campaigns: campaignSummaries,
    writeBudget: adminWriteBudget({ readOnly: true, kvWritesExpected: 0 }),
    generatedAt: new Date().toISOString()
  }, 200, env);
}

function stringifyAdminSettingValue(value) {
  if (value === undefined || value === null || value === '') return 'Not configured';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function adminSettingsSection(title, entries) {
  return {
    title,
    rows: entries.map(([label, value, options = {}]) => ({
      label,
      value: stringifyAdminSettingValue(value),
      rawValue: value ?? '',
      editable: Boolean(options.editable),
      path: options.path || '',
      type: options.type || 'string',
      input: options.input || options.type || 'text',
      min: options.min,
      max: options.max,
      step: options.step,
      displayMultiplier: options.displayMultiplier,
      submitDivisor: options.submitDivisor,
      placeholder: options.placeholder || '',
      options: Array.isArray(options.options) ? options.options : [],
      campaignOptions: Array.isArray(options.campaignOptions) ? options.campaignOptions : [],
      currentUserEmail: options.currentUserEmail || '',
      timeParts: options.timeParts && typeof options.timeParts === 'object' ? options.timeParts : null,
      visibleWhen: options.visibleWhen && typeof options.visibleWhen === 'object' ? options.visibleWhen : null,
      layoutGroup: options.layoutGroup || '',
      campaignSlug: options.campaignSlug || '',
      help: options.help || ''
    }))
  };
}

const ADMIN_TAX_PROVIDER_OPTIONS = [
  { value: 'flat', label: 'Flat rate' },
  { value: 'offline_rules', label: 'Offline rules' },
  { value: 'nm_grt', label: 'New Mexico GRT' },
  { value: 'zip_tax', label: 'ZIP.TAX' },
  { value: 'external', label: 'External/custom' }
];

const ADMIN_ORIGIN_COUNTRY_OPTIONS = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'AU', label: 'Australia' },
  { value: 'NZ', label: 'New Zealand' },
  { value: 'MX', label: 'Mexico' },
  { value: 'FR', label: 'France' },
  { value: 'DE', label: 'Germany' },
  { value: 'ES', label: 'Spain' },
  { value: 'IT', label: 'Italy' },
  { value: 'NL', label: 'Netherlands' },
  { value: 'SE', label: 'Sweden' }
];

const ADMIN_SHIPPING_DEFAULT_OPTION_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'signature_required', label: 'Signature required' },
  { value: 'adult_signature_required', label: 'Adult signature required' }
];

const ADMIN_CAMPAIGN_STATE_OPTIONS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'live', label: 'Live' },
  { value: 'post', label: 'Post-campaign' },
  { value: 'pre', label: 'Pre-launch (legacy)' }
];

const ADMIN_USPS_ENABLED_VISIBLE_WHEN = { path: 'shipping.usps.enabled', value: 'true' };
const ADMIN_CAMPAIGN_RUNNER_ENABLED_VISIBLE_WHEN = { path: 'reports.campaign_runner.enabled', value: 'true' };

const ADMIN_PLATFORM_SETTING_SCHEMA = new Map([
  ['title', { label: 'Site title', type: 'string', input: 'text', layoutGroup: 'platform-title-name', help: 'Default site title used in browser metadata, SEO fallbacks, and fork-facing platform identity.' }],
  ['author', { label: 'Site author', type: 'string', input: 'text', layoutGroup: 'platform-company-author', help: 'The top-level site author used in metadata, feeds, and fork-facing branding.' }],
  ['description', { label: 'Site description', type: 'string', input: 'textarea', help: 'Default SEO description used when a page or campaign does not provide a more specific summary.' }],
  ['platform.name', { label: 'Name', type: 'string', input: 'text', layoutGroup: 'platform-title-name', help: 'The public platform name shown in site chrome, emails, and admin headings.' }],
  ['platform.company_name', { label: 'Company', type: 'string', input: 'text', layoutGroup: 'platform-company-author', help: 'The organization name used for ownership, fulfillment, and platform-facing copy.' }],
  ['platform.default_creator_name', { label: 'Default creator name', type: 'string', input: 'text', layoutGroup: 'platform-creator-support', help: 'Fallback creator name shown on campaigns that do not define their own creator.' }],
  ['platform.support_email', { label: 'Support email', type: 'string', input: 'email', layoutGroup: 'platform-creator-support', help: 'The public email address users should contact for pledge or platform support.' }],
  ['platform.pledges_email_from', { label: 'Pledges email from', type: 'string', input: 'email-sender', layoutGroup: 'platform-email-from', help: 'Sender identity used for pledge confirmation and pledge status emails. The sending domain must still be authorized by the email provider.' }],
  ['platform.updates_email_from', { label: 'Updates email from', type: 'string', input: 'email-sender', layoutGroup: 'platform-email-from', help: 'Sender identity used for campaign update and announcement emails. The sending domain must still be authorized by the email provider.' }],
  ['platform.site_url', { label: 'Production site URL', type: 'string', input: 'url', help: 'The canonical public website URL used in generated links, metadata, and deploy-time config.' }],
  ['platform.worker_url', { label: 'Production Worker URL', type: 'string', input: 'url', help: 'The canonical production Worker API URL used by the live site for pledge and admin requests.' }],
  ['platform.footer_logo_path', { label: 'Footer logo', type: 'string', input: 'image-upload', layoutGroup: 'brand-logo-footer-logo', help: 'Logo image used in the site footer. A square or horizontal PNG, JPEG, or WebP works best.' }],
  ['platform.favicon_path', { label: 'Favicon', type: 'string', input: 'image-upload', layoutGroup: 'brand-favicon-social-image', help: 'Small browser-tab icon for the site. Use a simple square PNG for the most reliable display.' }],
  ['platform.default_social_image_path', { label: 'Default social image', type: 'string', input: 'image-upload', layoutGroup: 'brand-favicon-social-image', help: 'Fallback image used for social share cards when a page or campaign does not provide its own image. Recommended: 1200 x 630 px.' }],
  ['seo.default_social_image_alt', { label: 'Default social image alt', type: 'string', input: 'text', layoutGroup: 'brand-x-social-alt', help: 'Fallback alt text that describes the default social share image for screen readers and metadata consumers.' }],
  ['seo.x_handle', { label: 'X handle', type: 'string', input: 'text', layoutGroup: 'brand-x-social-alt', help: 'Optional X/Twitter handle used for Twitter card metadata. Include or omit the @ sign.' }],
  ['seo.same_as', { label: 'Same-as links', type: 'list', input: 'url-list', placeholder: 'https://www.instagram.com/your-handle\nhttps://www.youtube.com/@your-channel', help: 'Official public profile URLs for this platform or organization, used in structured SEO data to connect the site to its social/web presence. Add one URL per line.' }],
  ['seo.index_public_community_hub', { label: 'Index public community hub', type: 'boolean', help: 'Whether search engines may index the public supporter-community hub.' }],
  ['checkout.stripe_publishable_key', { label: 'Stripe publishable key', type: 'string', input: 'stripe-publishable-key', help: 'Non-secret Stripe publishable key used by the browser checkout UI. Stripe secret and webhook keys must remain Worker secrets.' }],
  ['pricing.sales_tax_rate', { label: 'Sales Tax Rate', type: 'number', input: 'percent', min: 0, max: 1, step: 0.0001, displayMultiplier: 100, submitDivisor: 100, layoutGroup: 'pricing-tax-shipping', help: 'The fallback sales tax rate shown as a percentage, such as 7.625 for a 7.625% rate.' }],
  ['pricing.default_tip_percent', { label: 'Default Platform Tip Percent', type: 'number', input: 'percent', min: 0, max: 100, step: 1, layoutGroup: 'pricing-tip-percent', help: 'The default optional platform tip percentage shown during checkout.' }],
  ['pricing.max_tip_percent', { label: 'Max Platform Tip Percent', type: 'number', input: 'percent', min: 0, max: 100, step: 1, layoutGroup: 'pricing-tip-percent', help: 'The highest platform tip percentage the checkout UI should allow.' }],
  ['tax.provider', { label: 'Provider', type: 'string', input: 'select', options: ADMIN_TAX_PROVIDER_OPTIONS, layoutGroup: 'tax-provider-origin', help: 'The tax calculation mode used by checkout, such as flat rate, offline rules, New Mexico GRT, or ZIP.TAX.' }],
  ['tax.origin_country', { label: 'Origin country', type: 'string', input: 'select', options: ADMIN_ORIGIN_COUNTRY_OPTIONS, layoutGroup: 'tax-provider-origin', help: 'The country used as the tax origin for fallback and regional tax calculations.' }],
  ['tax.use_regional_origin', { label: 'Use regional origin', type: 'boolean', layoutGroup: 'tax-regional-provider-base', help: 'Whether tax calculations should use regional origin details when the provider supports them.' }],
  ['tax.nm_grt_api_base', { label: 'New Mexico GRT API base', type: 'string', input: 'url', layoutGroup: 'tax-regional-provider-base', visibleWhen: { path: 'tax.provider', value: 'nm_grt' }, help: 'API base URL for New Mexico GRT lookup when the New Mexico tax provider is active.' }],
  ['tax.zip_tax_api_base', { label: 'ZIP.TAX API base', type: 'string', input: 'url', layoutGroup: 'tax-regional-provider-base', visibleWhen: { path: 'tax.provider', value: 'zip_tax' }, help: 'API base URL for ZIP.TAX lookup when the ZIP.TAX provider is active.' }],
  ['shipping.origin_zip', { label: 'Origin postal code', type: 'string', layoutGroup: 'shipping-origin', help: 'The postal code packages ship from, used for shipping quotes and fallback shipping logic.' }],
  ['shipping.origin_country', { label: 'Origin country', type: 'string', input: 'select', options: ADMIN_ORIGIN_COUNTRY_OPTIONS, layoutGroup: 'shipping-origin', help: 'The country packages ship from, used for shipping quotes and destination validation.' }],
  ['shipping.fallback_flat_rate', { label: 'Fallback Shipping Fee (USD)', type: 'number', input: 'decimal', min: 0, step: 0.01, layoutGroup: 'shipping-fallback-free', help: 'The fallback shipping fee in USD used when carrier quotes are disabled or unavailable.' }],
  ['shipping.free_shipping_default', { label: 'Free shipping default', type: 'boolean', layoutGroup: 'shipping-fallback-free', help: 'Whether new or unspecified physical items should default to free shipping.' }],
  ['shipping.default_option', { label: 'Default shipping option', type: 'string', input: 'select', options: ADMIN_SHIPPING_DEFAULT_OPTION_OPTIONS, layoutGroup: 'shipping-default-usps', help: 'Preferred delivery option selected by default when it is available. This is a single default, while campaign Shipping controls which optional requirements are available.' }],
  ['shipping.usps.enabled', { label: 'USPS enabled', type: 'boolean', layoutGroup: 'shipping-default-usps', help: 'Whether checkout should try USPS live shipping quotes when USPS credentials are configured.' }],
  ['shipping.usps.client_id', { label: 'USPS client ID', type: 'string', layoutGroup: 'shipping-usps-auth', visibleWhen: ADMIN_USPS_ENABLED_VISIBLE_WHEN, help: 'The non-secret USPS OAuth client ID used for live USPS rate quotes.' }],
  ['shipping.usps.api_base', { label: 'USPS API base', type: 'string', input: 'url', placeholder: 'Default: https://apis.usps.com', layoutGroup: 'shipping-usps-auth', visibleWhen: ADMIN_USPS_ENABLED_VISIBLE_WHEN, help: 'Optional override for the USPS API base URL. Leave blank to use the production USPS default: https://apis.usps.com.' }],
  ['shipping.usps.timeout_ms', { label: 'USPS timeout ms', type: 'number', input: 'integer', min: 100, step: 100, layoutGroup: 'shipping-usps-timeout-cache', visibleWhen: ADMIN_USPS_ENABLED_VISIBLE_WHEN, help: 'How long the Worker waits for USPS before falling back or failing the quote attempt.' }],
  ['shipping.usps.quote_cache_ttl_seconds', { label: 'USPS quote cache TTL seconds', type: 'number', input: 'integer', min: 0, step: 1, layoutGroup: 'shipping-usps-timeout-cache', visibleWhen: ADMIN_USPS_ENABLED_VISIBLE_WHEN, help: 'How long successful USPS shipping quotes are cached to reduce external API calls.' }],
  ['shipping.usps.failure_cooldown_seconds', { label: 'USPS failure cooldown seconds', type: 'number', input: 'integer', min: 0, step: 1, layoutGroup: 'shipping-usps-cooldowns', visibleWhen: ADMIN_USPS_ENABLED_VISIBLE_WHEN, help: 'How long to pause USPS quote attempts after a transient USPS failure.' }],
  ['shipping.usps.rate_limit_cooldown_seconds', { label: 'USPS rate limit cooldown seconds', type: 'number', input: 'integer', min: 0, step: 1, layoutGroup: 'shipping-usps-cooldowns', visibleWhen: ADMIN_USPS_ENABLED_VISIBLE_WHEN, help: 'How long to pause USPS quote attempts after a USPS rate-limit response.' }],
  ['reports.campaign_runner.enabled', { label: 'Enabled', type: 'boolean', layoutGroup: 'reports-enabled-time', help: 'Whether scheduled campaign-runner reports are enabled for the platform.' }],
  ['reports.campaign_runner.daily_pledge_report_enabled', { label: 'Daily pledge report enabled', type: 'boolean', layoutGroup: 'reports-daily-fulfillment', visibleWhen: ADMIN_CAMPAIGN_RUNNER_ENABLED_VISIBLE_WHEN, help: 'Whether campaign admins should receive daily pledge ledger reports.' }],
  ['reports.campaign_runner.fulfillment_report_enabled', { label: 'Fulfillment report enabled', type: 'boolean', layoutGroup: 'reports-daily-fulfillment', visibleWhen: ADMIN_CAMPAIGN_RUNNER_ENABLED_VISIBLE_WHEN, help: 'Whether campaign admins should receive fulfillment-focused reports.' }],
  ['reports.campaign_runner.send_hour_mt', { label: 'Send Time (Mountain Time)', type: 'number', input: 'integer', min: 0, max: 23, step: 1, layoutGroup: 'reports-enabled-time', visibleWhen: ADMIN_CAMPAIGN_RUNNER_ENABLED_VISIBLE_WHEN, help: 'The Mountain Time clock time when scheduled campaign-runner reports should be sent.' }],
  ['reports.campaign_runner.send_minute_mt', { label: 'Send minute MT', type: 'number', input: 'integer', min: 0, max: 59, step: 1, visibleWhen: ADMIN_CAMPAIGN_RUNNER_ENABLED_VISIBLE_WHEN, help: 'The minute within the scheduled Mountain Time hour when reports should be sent.' }],
  ['reports.campaign_runner.include_stats_summary', { label: 'Include stats summary', type: 'boolean', layoutGroup: 'reports-stats-csv', visibleWhen: ADMIN_CAMPAIGN_RUNNER_ENABLED_VISIBLE_WHEN, help: 'Whether report emails should include campaign totals and performance summary details.' }],
  ['reports.campaign_runner.include_csv_attachment', { label: 'Include CSV attachment', type: 'boolean', layoutGroup: 'reports-stats-csv', visibleWhen: ADMIN_CAMPAIGN_RUNNER_ENABLED_VISIBLE_WHEN, help: 'Whether report emails should include downloadable CSV attachments.' }],
  ['reports.campaign_runner.email_subject_prefix', { label: 'Email subject prefix', type: 'string', visibleWhen: ADMIN_CAMPAIGN_RUNNER_ENABLED_VISIBLE_WHEN, help: 'The prefix added to campaign-runner report email subject lines.' }],
  ['add_ons.enabled', { label: 'Enabled', type: 'boolean', layoutGroup: 'add-ons-enabled-stock', help: 'Whether platform-level add-ons are enabled for checkout.' }],
  ['add_ons.low_stock_threshold', { label: 'Low stock threshold', type: 'number', input: 'integer', min: 0, step: 1, layoutGroup: 'add-ons-enabled-stock', visibleWhen: { path: 'add_ons.enabled', value: 'true' }, help: 'The inventory count where platform add-ons should be treated as low stock.' }],
  ['add_ons.products', { label: 'Products', type: 'add_on_products', input: 'add-on-products', visibleWhen: { path: 'add_ons.enabled', value: 'true' }, help: 'The platform add-on product catalog shown during checkout.' }],
  ['platform.logo_path', { label: 'Logo', type: 'string', input: 'image-upload', layoutGroup: 'brand-logo-footer-logo', help: 'The logo image used in platform emails. For best results upload a square PNG, JPEG, or WebP at 512 x 512 px or larger, under 512 KB, with transparent or solid background.' }],
  ['debug.console_logging_enabled', { label: 'Console logging enabled', type: 'boolean', layoutGroup: 'debug-logging', help: 'Whether browser and Worker console logging is enabled for diagnostics.' }],
  ['debug.verbose_console_logging', { label: 'Verbose console logging', type: 'boolean', layoutGroup: 'debug-logging', help: 'Whether extra diagnostic detail should be logged during troubleshooting.' }],
  ['design.font_body', { label: 'Body font', type: 'string', input: 'text', placeholder: '"Inter", sans-serif', layoutGroup: 'design-fonts', help: 'The primary font stack used across the site. Font names only work if the font is loaded by the site CSS or available on the visitor\'s device. Supporter emails reuse this value where email clients allow it.' }],
  ['design.font_display', { label: 'Heading font', type: 'string', input: 'text', placeholder: '"gambado-sans", sans-serif', layoutGroup: 'design-fonts', help: 'The display font stack used for headings and prominent text. Font names only work if the font is loaded by the site CSS or available on the visitor\'s device. Supporter emails reuse this value where supported.' }],
  ['design.color_text', { label: 'Text Color', type: 'string', input: 'color', layoutGroup: 'design-colors', help: 'Main body-copy color used across public pages, admin previews, checkout UI, and supporter emails.' }],
  ['design.color_text_muted', { label: 'Muted Color', type: 'string', input: 'color', layoutGroup: 'design-colors', help: 'Lower-emphasis text color used for metadata, helper copy, captions, and secondary labels.' }],
  ['design.color_surface_subtle', { label: 'Surface Color', type: 'string', input: 'color', layoutGroup: 'design-colors', help: 'Subtle panel background color used for quiet surfaces, cards, and email containers.' }],
  ['design.color_border', { label: 'Border Color', type: 'string', input: 'color', layoutGroup: 'design-colors', help: 'Divider and control-border color used across the site, admin UI, checkout UI, and supporter emails.' }],
  ['design.color_primary', { label: 'Primary Color', type: 'string', input: 'color', layoutGroup: 'design-colors', help: 'Primary action and brand accent color used for links, buttons, progress accents, and email calls to action.' }],
  ['design.radius_lg', { label: 'Button Radius', type: 'string', input: 'text', help: 'The large border radius used for major buttons and rounded elements across the site and supporter emails.' }],
  ['admin.users', { label: 'Users', type: 'admin_users', input: 'admin-users', help: 'Admin accounts allowed to sign in. Super admins can manage the whole platform; campaign users can manage only the campaigns selected here.' }],
  ['cache.live_stats_ttl_seconds', { label: 'Live stats cache TTL seconds', type: 'number', input: 'integer', min: 0, step: 1, layoutGroup: 'cache-live-ttl', help: 'How long browsers cache live campaign stats before asking the Worker again.' }],
  ['cache.live_inventory_ttl_seconds', { label: 'Live inventory cache TTL seconds', type: 'number', input: 'integer', min: 0, step: 1, layoutGroup: 'cache-live-ttl', help: 'How long browsers cache live inventory before asking the Worker again.' }]
]);

const ADMIN_CAMPAIGN_CATEGORY_OPTIONS = [
  { label: 'Short Film', value: 'Short Film' },
  { label: 'Feature Film', value: 'Feature Film' },
  { label: 'Documentary', value: 'Documentary' },
  { label: 'Web Series', value: 'Web Series' },
  { label: 'Music Video', value: 'Music Video' },
  { label: 'Album', value: 'Album' },
  { label: 'Other', value: 'Other' }
];

const ADMIN_CAMPAIGN_FREE_SHIPPING_OPTIONS = [
  { label: 'Inherit deployment default', value: 'inherit' },
  { label: 'Free shipping', value: 'true' },
  { label: 'Paid shipping', value: 'false' }
];

const ADMIN_CAMPAIGN_SHIPPING_CHOICE_OPTIONS = [
  { label: 'Signature required', value: 'signature_required' },
  { label: 'Adult signature required', value: 'adult_signature_required' }
];

const ADMIN_CAMPAIGN_SETTING_SCHEMA = new Map([
  ['title', { label: 'Title', type: 'string', layoutGroup: 'campaign-title-creator', help: 'Public campaign title shown on campaign pages, cards, checkout, reports, and admin lists.' }],
  ['test_only', { label: 'Test campaign', type: 'boolean', layoutGroup: 'campaign-test-state', help: 'Keeps this campaign out of public production lists unless test campaigns are explicitly enabled.' }],
  ['creator_name', { label: 'Creator name', type: 'string', layoutGroup: 'campaign-title-creator', help: 'Public person, team, or organization credited as the campaign creator.' }],
  ['creator_image', { label: 'Creator image', type: 'string', input: 'image-upload', layoutGroup: 'campaign-hero-video-creator-image', help: 'Square creator or team image shown on the campaign page. Recommended: 400 x 400 px or larger.' }],
  ['category', { label: 'Category', type: 'string', input: 'select', options: ADMIN_CAMPAIGN_CATEGORY_OPTIONS, layoutGroup: 'campaign-category-instagram', help: 'Public category shown on campaign cards and campaign pages.' }],
  ['instagram', { label: 'Instagram URL', type: 'string', input: 'url', layoutGroup: 'campaign-category-instagram', help: 'Optional Instagram profile or post URL used for campaign links and sharing.' }],
  ['short_blurb', { label: 'Short blurb', type: 'string', input: 'rich-text-inline', help: 'Brief formatted campaign summary used on cards, previews, and the campaign-page lead. Supports bold, italic, and underline.' }],
  ['hero_image', { label: 'Hero image', type: 'string', input: 'image-upload', layoutGroup: 'hero-images', help: 'Primary square campaign image used on cards and as fallback campaign media. Recommended: 1000 x 1000 px.' }],
  ['hero_image_wide', { label: 'Hero image wide', type: 'string', input: 'image-upload', layoutGroup: 'hero-images', help: 'Wide campaign hero image used where the layout has horizontal space. Recommended: 1600 x 900 px.' }],
  ['hero_video', { label: 'Hero video', type: 'string', input: 'video-upload', layoutGroup: 'campaign-hero-video-creator-image', help: 'Optional campaign hero video. Upload an MP4, WebM, or MOV file up to 100 MB, or paste a YouTube or Vimeo URL.' }],
  ['campaign_background', { label: 'Campaign background', type: 'string', input: 'image-upload', layoutGroup: 'background-images', help: 'Optional campaign page background image. Recommended: 1920 x 1080 px, compressed, and subtle enough to keep text readable.' }],
  ['progress_background', { label: 'Progress background', type: 'string', input: 'image-upload', layoutGroup: 'background-images', help: 'Optional image used behind campaign progress areas when the campaign template supports it.' }],
  ['start_date', { label: 'Start date', type: 'string', input: 'date', layoutGroup: 'campaign-dates', help: 'Date the campaign is scheduled to start. Used with state and deadline for public messaging.' }],
  ['goal_deadline', { label: 'Goal deadline', type: 'string', input: 'date', layoutGroup: 'campaign-dates', help: 'Fundraising deadline used for countdowns, effective state, and closing the primary campaign.' }],
  ['goal_amount', { label: 'Goal amount', type: 'number', input: 'currency', min: 0, step: 1, layoutGroup: 'campaign-goal-charged', help: 'Funding target in USD used for progress bars, summaries, checkout context, and reports.' }],
  ['runner_report_emails', { label: 'Runner report emails', type: 'list', input: 'email-list', help: 'Recipients for campaign-runner pledge and fulfillment reports. Type an email and press comma or Enter to add it.' }],
  ['featured_tier_id', { label: 'Featured tier', type: 'string', input: 'select', help: 'Existing pledge tier to highlight first or more prominently on campaign pages.' }],
  ['single_tier_only', { label: 'Single tier mode', type: 'boolean', layoutGroup: 'campaign-tier-ongoing', help: 'Limits each pledge to one tier selection. Tier quantity is still controlled by each tier\'s Stackable setting.' }],
  ['stretch_goals', { label: 'Stretch goals', type: 'campaign_collection', input: 'campaign-collection', collection: 'stretch_goals', help: 'Funding milestones shown on the campaign page and unlocked as pledge totals grow.' }],
  ['stretch_hidden', { label: 'Hide locked stretch goals', type: 'boolean', layoutGroup: 'campaign-stretch-late-support', help: 'Hides locked stretch-goal details until their thresholds are reached.' }],
  ['custom_late_support', { label: 'Custom late support', type: 'boolean', layoutGroup: 'campaign-stretch-late-support', help: 'Allows supporters to enter a custom support amount after the primary campaign has ended.' }],
  ['shipping_fallback_flat_rate', { label: 'Shipping fallback flat rate', type: 'number', input: 'currency', min: 0, step: 0.01, layoutGroup: 'campaign-shipping-free', help: 'Campaign-specific flat shipping amount used when live carrier quotes are unavailable. Leave blank to use the platform default.' }],
  ['free_shipping', { label: 'Free shipping override', type: 'string', input: 'select', options: ADMIN_CAMPAIGN_FREE_SHIPPING_OPTIONS, layoutGroup: 'campaign-shipping-free', help: 'Per-campaign free-shipping override. Inherit follows the platform default.' }],
  ['shipping_options', { label: 'Shipping', type: 'list', input: 'checkbox-list', options: ADMIN_CAMPAIGN_SHIPPING_CHOICE_OPTIONS, help: 'Optional shipping requirements for physical rewards, such as signature requirements. Standard shipping remains available.' }],
  ['show_ongoing', { label: 'Show ongoing support', type: 'boolean', layoutGroup: 'campaign-tier-ongoing', help: 'Shows ongoing support items after or alongside the main campaign support flow.' }],
  ['ongoing_items', { label: 'Ongoing items', type: 'campaign_collection', input: 'campaign-collection', collection: 'ongoing_items', help: 'Ongoing support needs shown when ongoing support is enabled for this campaign.' }],
  ['campaign_add_ons', { label: 'Campaign add-ons', type: 'add_on_products', input: 'add-on-products', help: 'Optional products attached to this campaign. They count toward this campaign and follow this campaign\'s shipping rules.' }],
  ['content_editor', { label: 'Content editor', type: 'content_editor', input: 'content-editor', help: 'WYSIWYG block editor for the campaign page long-form content.' }],
  ['tiers', { label: 'Tiers', type: 'campaign_collection', input: 'campaign-collection', collection: 'tiers', help: 'Pledge tiers supporters can select, including pricing, limits, images, and fulfillment behavior.' }],
  ['support_items', { label: 'Support items', type: 'campaign_collection', input: 'campaign-collection', collection: 'support_items', help: 'Standalone support goals shown outside the main pledge tiers.' }],
  ['diary', { label: 'Diary entries', type: 'campaign_collection', input: 'campaign-collection', collection: 'diary', help: 'Campaign updates or diary posts shown newest first.' }],
  ['decisions', { label: 'Decisions', type: 'campaign_collection', input: 'campaign-collection', collection: 'decisions', help: 'Supporter vote or poll questions, including eligibility, deadlines, options, and option images.' }]
]);

function editableAdminSetting(path, type = 'string', campaignSlug = '') {
  const schema = campaignSlug
    ? ADMIN_CAMPAIGN_SETTING_SCHEMA.get(path)
    : ADMIN_PLATFORM_SETTING_SCHEMA.get(path);
  return {
    editable: true,
    path,
    type: schema?.type || type,
    input: schema?.input || type || 'text',
    min: schema?.min,
    max: schema?.max,
    step: schema?.step,
    displayMultiplier: schema?.displayMultiplier,
    submitDivisor: schema?.submitDivisor,
    placeholder: schema?.placeholder || '',
    options: schema?.options || [],
    visibleWhen: schema?.visibleWhen || null,
    layoutGroup: schema?.layoutGroup || '',
    help: schema?.help || '',
    campaignSlug
  };
}

function readOnlyAdminSettingHelp(help, layoutGroup = '') {
  return { help, layoutGroup };
}

function derivedCampaignSetting(path, input, help, layoutGroup = '') {
  return { path, input, type: 'string', derived: true, help, layoutGroup };
}

function readOnlyConditionalAdminSettingHelp(help, visibleWhen) {
  return { help, visibleWhen };
}

function campaignRunnerSendTimeSetting(hour, minute) {
  return {
    ...editableAdminSetting('reports.campaign_runner.send_hour_mt', 'number'),
    input: 'time',
    help: 'The Mountain Time clock time when scheduled campaign-runner reports should be sent.',
    timeParts: {
      hourPath: 'reports.campaign_runner.send_hour_mt',
      minutePath: 'reports.campaign_runner.send_minute_mt',
      hour: Number(hour || 0),
      minute: Number(minute || 0)
    }
  };
}

function publicCampaignSettings(campaign = {}) {
  return {
    slug: campaign.slug || '',
    title: campaign.title || campaign.slug || '',
    testOnly: campaign.test_only === true,
    creatorName: campaign.creator_name || '',
    creatorImage: campaign.creator_image || '',
    category: campaign.category || '',
    instagram: campaign.instagram || '',
    state: campaign.state || 'unknown',
    effectiveState: getEffectiveState(campaign) || campaign.state || 'unknown',
    url: campaign.url || `/campaigns/${encodeURIComponent(campaign.slug || '')}/`,
    startDate: campaign.start_date || '',
    goalDeadline: campaign.goal_deadline || '',
    goalAmount: campaign.goal_amount ?? '',
    charged: Boolean(campaign.charged),
    shortBlurb: campaign.short_blurb || '',
    heroImage: campaign.hero_image || '',
    heroImageWide: campaign.hero_image_wide || '',
    heroVideo: campaign.hero_video || '',
    campaignBackground: campaign.campaign_background || '',
    progressBackground: campaign.progress_background || '',
    runnerReportEmails: Array.isArray(campaign.runner_report_emails) ? campaign.runner_report_emails : [],
    featuredTierId: campaign.featured_tier_id || '',
    singleTierOnly: campaign.single_tier_only === true,
    stretchGoals: Array.isArray(campaign.stretch_goals) ? campaign.stretch_goals : [],
    stretchHidden: campaign.stretch_hidden !== false,
    customLateSupport: campaign.custom_late_support === true,
    shippingFallbackFlatRate: campaign.shipping_fallback_flat_rate ?? '',
    freeShipping: campaign.free_shipping === true || campaign.free_shipping === false ? String(campaign.free_shipping) : String(campaign.free_shipping || 'inherit'),
    shippingOptions: Array.isArray(campaign.shipping_options) ? campaign.shipping_options : [],
    showOngoing: campaign.show_ongoing === true,
    ongoingItems: Array.isArray(campaign.ongoing_items) ? campaign.ongoing_items : [],
    campaignAddOns: Array.isArray(campaign.campaign_add_ons) ? campaign.campaign_add_ons : [],
    tiers: Array.isArray(campaign.tiers) ? campaign.tiers : [],
    supportItems: Array.isArray(campaign.support_items) ? campaign.support_items : [],
    diary: Array.isArray(campaign.diary) ? campaign.diary : [],
    decisions: Array.isArray(campaign.decisions) ? campaign.decisions : []
  };
}

function campaignTierSelectOptions(tiers = []) {
  const options = [{ label: 'None', value: '' }];
  if (!Array.isArray(tiers)) return options;
  tiers.forEach((tier) => {
    const id = String(tier?.id || '').trim();
    if (!id) return;
    const name = String(tier?.name || id).trim();
    const price = Number(tier?.price);
    const priceLabel = Number.isFinite(price) ? `$${price} - ` : '';
    options.push({
      label: `${priceLabel}${name} (${id})`,
      value: id
    });
  });
  return options;
}

function campaignSettingsSection(campaign = {}) {
  const settings = publicCampaignSettings(campaign);
  const featuredTierSetting = {
    ...editableAdminSetting('featured_tier_id', 'string', settings.slug),
    options: campaignTierSelectOptions(settings.tiers)
  };
  return adminSettingsSection(settings.title || settings.slug || 'Campaign', [
    ['Title', settings.title, editableAdminSetting('title', 'string', settings.slug)],
    ['Creator name', settings.creatorName, editableAdminSetting('creator_name', 'string', settings.slug)],
    ['Short blurb', settings.shortBlurb, editableAdminSetting('short_blurb', 'string', settings.slug)],
    ['Slug', settings.slug, derivedCampaignSetting('slug', 'slug-derived', 'URL-safe campaign identifier. Existing campaigns keep their current slug; new campaigns derive it from the title.', 'campaign-slug-url')],
    ['URL', settings.url, derivedCampaignSetting('url', 'url-derived', 'Public campaign page URL. Existing campaigns keep their current URL; new campaigns derive it from the title.', 'campaign-slug-url')],
    ['Hero video', settings.heroVideo, editableAdminSetting('hero_video', 'string', settings.slug)],
    ['Creator image', settings.creatorImage, editableAdminSetting('creator_image', 'string', settings.slug)],
    ['Category', settings.category, editableAdminSetting('category', 'string', settings.slug)],
    ['Instagram URL', settings.instagram, editableAdminSetting('instagram', 'string', settings.slug)],
    ['Start date', settings.startDate, editableAdminSetting('start_date', 'string', settings.slug)],
    ['Goal deadline', settings.goalDeadline, editableAdminSetting('goal_deadline', 'string', settings.slug)],
    ['Goal amount', settings.goalAmount, editableAdminSetting('goal_amount', 'number', settings.slug)],
    ['Charged', settings.charged, readOnlyAdminSettingHelp('Read-only flag showing whether this campaign has been marked as charged after fundraising.', 'campaign-goal-charged')],
    ['Test campaign', settings.testOnly, editableAdminSetting('test_only', 'boolean', settings.slug)],
    ['State', settings.state, readOnlyAdminSettingHelp('Read-only configured lifecycle state. Public behavior also depends on dates and campaign operations.', 'campaign-test-state')],
    ['Single tier mode', settings.singleTierOnly, editableAdminSetting('single_tier_only', 'boolean', settings.slug)],
    ['Show ongoing support', settings.showOngoing, editableAdminSetting('show_ongoing', 'boolean', settings.slug)],
    ['Hide locked stretch goals', settings.stretchHidden, editableAdminSetting('stretch_hidden', 'boolean', settings.slug)],
    ['Custom late support', settings.customLateSupport, editableAdminSetting('custom_late_support', 'boolean', settings.slug)],
    ['Shipping fallback flat rate', settings.shippingFallbackFlatRate, editableAdminSetting('shipping_fallback_flat_rate', 'number', settings.slug)],
    ['Free shipping override', settings.freeShipping, editableAdminSetting('free_shipping', 'string', settings.slug)],
    ['Shipping', settings.shippingOptions, editableAdminSetting('shipping_options', 'list', settings.slug)],
    ['Runner report emails', settings.runnerReportEmails, editableAdminSetting('runner_report_emails', 'list', settings.slug)],
    ['Hero image', settings.heroImage, editableAdminSetting('hero_image', 'string', settings.slug)],
    ['Hero image wide', settings.heroImageWide, editableAdminSetting('hero_image_wide', 'string', settings.slug)],
    ['Campaign background', settings.campaignBackground, editableAdminSetting('campaign_background', 'string', settings.slug)],
    ['Progress background', settings.progressBackground, editableAdminSetting('progress_background', 'string', settings.slug)],
    ['Stretch goals', settings.stretchGoals, editableAdminSetting('stretch_goals', 'campaign_collection', settings.slug)],
    ['Ongoing items', settings.ongoingItems, editableAdminSetting('ongoing_items', 'campaign_collection', settings.slug)],
    ['Campaign add-ons', settings.campaignAddOns, editableAdminSetting('campaign_add_ons', 'add_on_products', settings.slug)],
    ['Content editor', '', editableAdminSetting('content_editor', 'content_editor', settings.slug)],
    ['Featured tier', settings.featuredTierId, featuredTierSetting],
    ['Tiers', settings.tiers, editableAdminSetting('tiers', 'campaign_collection', settings.slug)],
    ['Support items', settings.supportItems, editableAdminSetting('support_items', 'campaign_collection', settings.slug)],
    ['Diary entries', settings.diary, editableAdminSetting('diary', 'campaign_collection', settings.slug)],
    ['Decisions', settings.decisions, editableAdminSetting('decisions', 'campaign_collection', settings.slug)]
  ]);
}

function parseAdminDelimitedList(value) {
  return String(value || '')
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function adminUserSettingsRows(env) {
  const users = await getEffectiveAdminUsers(env);
  return users.map((user) => ({
    name: user.name || '',
    email: user.email,
    role: user.role === 'super_admin' ? 'super_admin' : 'campaign_user',
    campaigns: user.role === 'super_admin' ? [] : (user.campaignSlugs || [])
  }));
}

function adminCampaignOptions(campaigns = []) {
  return (Array.isArray(campaigns) ? campaigns : [])
    .map((campaign) => ({
      label: String(campaign?.title || campaign?.slug || '').trim(),
      value: String(campaign?.slug || '').trim()
    }))
    .filter((campaign) => campaign.value);
}

function adminSecretStatusRows(env) {
  const isConfigured = (value) => String(value || '').trim().length > 0;
  const status = (value, required = true) => {
    if (isConfigured(value)) return 'Configured';
    return required ? 'Missing' : 'Optional / not configured';
  };
  const activeStripeSecret = getStripeKey(env);
  const activeStripeWebhookSecret = getStripeWebhookSecret(env);
  const uspsRequired = String(env.USPS_ENABLED || '').toLowerCase() === 'true';
  const zipTaxRequired = String(env.TAX_PROVIDER || '').toLowerCase() === 'zip_tax';
  const turnstileRequired = ['1', 'true', 'yes', 'on'].includes(String(env.ADMIN_TURNSTILE_REQUIRED || '').toLowerCase());

  return [
    ['Stripe secret key', status(activeStripeSecret), readOnlyAdminSettingHelp('Secret Stripe API key for the current Worker mode. Store it in Worker secrets for production or worker/.dev.vars for local development.')],
    ['Stripe webhook secret', status(activeStripeWebhookSecret), readOnlyAdminSettingHelp('Stripe webhook signing secret for the current Worker mode. This must stay outside site config and admin setting drafts.')],
    ['Checkout intent secret', status(env.CHECKOUT_INTENT_SECRET), readOnlyAdminSettingHelp('Signing secret for first-party checkout intent payloads and reservation recovery. Generate a unique value per environment.')],
    ['Magic link secret', status(env.MAGIC_LINK_SECRET), readOnlyAdminSettingHelp('Signing secret for supporter magic links and scoped pledge-management access. Generate a unique value per environment.')],
    ['Admin session secret', status(env.ADMIN_SESSION_SECRET, false), readOnlyAdminSettingHelp('Dedicated signing secret for browser admin sessions. Optional in development because the Worker has fallbacks, but production should set it explicitly.')],
    ['Admin recovery secret', status(env.ADMIN_SECRET), readOnlyAdminSettingHelp('Bearer secret used by protected admin automation and recovery endpoints. Keep this in Worker or GitHub secrets only.')],
    ['Admin Turnstile secret', status(env.TURNSTILE_SECRET_KEY || env.ADMIN_TURNSTILE_SECRET_KEY, turnstileRequired), readOnlyAdminSettingHelp('Cloudflare Turnstile secret used to verify admin email sign-in challenges. Required when the admin Turnstile widget is enabled.')],
    ['Resend API key', status(env.RESEND_API_KEY), readOnlyAdminSettingHelp('Email provider API key used for admin magic links, pledge emails, and campaign notifications. Never store it in _config.yml.')],
    ['USPS client secret', status(env.USPS_CLIENT_SECRET, uspsRequired), readOnlyAdminSettingHelp('USPS OAuth client secret for live shipping quotes. Required only when USPS is enabled; the client ID remains non-secret config.')],
    ['ZIP.TAX API key', status(env.ZIP_TAX_API_KEY || env.TAX_API_KEY, zipTaxRequired), readOnlyAdminSettingHelp('ZIP.TAX API key for jurisdiction-level tax lookup. Required only when the ZIP.TAX provider is selected.')],
    ['Cloudflare deploy credentials', 'GitHub secret / local shell only', readOnlyAdminSettingHelp('Cloudflare API tokens are not visible to the Worker runtime. Store deploy credentials in GitHub repository secrets or ignored local env files.')]
  ];
}

async function handleAdminSettings(request, env) {
  const auth = await requireAdminSession(request, env, 'campaign:read');
  if (!auth.ok) return auth.response;

  const [{ campaigns }, addOns] = await Promise.all([
    getCampaigns(env),
    auth.user.role === 'super_admin' ? getAddOns(env) : Promise.resolve(null)
  ]);
  const allowedCampaigns = (campaigns || []).filter((campaign) => (
    auth.user.role === 'super_admin' ||
    auth.user.campaignSlugs.includes(String(campaign?.slug || ''))
  ));

  const campaignSections = allowedCampaigns.map(campaignSettingsSection);
  const sections = [];
  const canonicalSiteBase = env.CANONICAL_SITE_BASE || env.SITE_BASE;
  const canonicalWorkerBase = env.CANONICAL_WORKER_BASE || env.WORKER_BASE;
  const platformAddOnProducts = Array.isArray(addOns?.products)
    ? addOns.products.filter((product) => String(product?.scope || 'platform') === 'platform')
    : [];
  const seoSameAs = parseAdminDelimitedList(env.SEO_SAME_AS);
  const platformLogoPath = env.EMAIL_LOGO_PATH || '/assets/images/defaults/dust-wave-square.png';
  const platformFooterLogoPath = env.PLATFORM_FOOTER_LOGO_PATH || platformLogoPath;
  const platformFaviconPath = env.PLATFORM_FAVICON_PATH || '/assets/images/defaults/favicon.png';
  const platformDefaultSocialImagePath = env.PLATFORM_DEFAULT_SOCIAL_IMAGE_PATH || platformLogoPath;

  if (auth.user.role === 'super_admin') {
    sections.push(
      adminSettingsSection('Platform', [
        ['Site title', env.SITE_TITLE || env.PLATFORM_NAME, editableAdminSetting('title')],
        ['Name', env.PLATFORM_NAME, editableAdminSetting('platform.name')],
        ['Company', env.PLATFORM_COMPANY_NAME, editableAdminSetting('platform.company_name')],
        ['Site author', env.PLATFORM_AUTHOR, editableAdminSetting('author')],
        ['Default creator name', env.PLATFORM_DEFAULT_CREATOR_NAME || env.PLATFORM_COMPANY_NAME || env.PLATFORM_AUTHOR, editableAdminSetting('platform.default_creator_name')],
        ['Support email', env.SUPPORT_EMAIL, editableAdminSetting('platform.support_email')],
        ['Site description', env.SITE_DESCRIPTION, editableAdminSetting('description')],
        ['Pledges email from', env.PLEDGES_EMAIL_FROM, editableAdminSetting('platform.pledges_email_from')],
        ['Updates email from', env.UPDATES_EMAIL_FROM, editableAdminSetting('platform.updates_email_from')],
        ['App mode', env.APP_MODE, readOnlyAdminSettingHelp('The runtime environment mode currently used by the Worker, such as live or test.')]
      ]),
      adminSettingsSection('Brand & SEO', [
        ['Logo', platformLogoPath, editableAdminSetting('platform.logo_path')],
        ['Footer logo', platformFooterLogoPath, editableAdminSetting('platform.footer_logo_path')],
        ['Favicon', platformFaviconPath, editableAdminSetting('platform.favicon_path')],
        ['Default social image', platformDefaultSocialImagePath, editableAdminSetting('platform.default_social_image_path')],
        ['X handle', env.SEO_X_HANDLE, editableAdminSetting('seo.x_handle')],
        ['Default social image alt', env.SEO_DEFAULT_SOCIAL_IMAGE_ALT || env.PLATFORM_NAME, editableAdminSetting('seo.default_social_image_alt')],
        ['Same-as links', seoSameAs, editableAdminSetting('seo.same_as', 'list')],
        ['Index public community hub', env.SEO_INDEX_PUBLIC_COMMUNITY_HUB ?? 'true', editableAdminSetting('seo.index_public_community_hub', 'boolean')]
      ]),
      adminSettingsSection('Canonical URLs', [
        ['Production site URL', canonicalSiteBase, editableAdminSetting('platform.site_url')],
        ['Production Worker URL', canonicalWorkerBase, editableAdminSetting('platform.worker_url')]
      ]),
      adminSettingsSection('Checkout', [
        ['Stripe publishable key', env.STRIPE_PUBLISHABLE_KEY || '', editableAdminSetting('checkout.stripe_publishable_key')]
      ]),
      adminSettingsSection('Pricing', [
        ['Sales Tax Rate', env.SALES_TAX_RATE, editableAdminSetting('pricing.sales_tax_rate', 'number')],
        ['Default Platform Tip Percent', env.DEFAULT_PLATFORM_TIP_PERCENT, editableAdminSetting('pricing.default_tip_percent', 'number')],
        ['Max Platform Tip Percent', env.MAX_PLATFORM_TIP_PERCENT, editableAdminSetting('pricing.max_tip_percent', 'number')]
      ]),
      adminSettingsSection('Tax', [
        ['Provider', env.TAX_PROVIDER, editableAdminSetting('tax.provider')],
        ['Origin country', env.TAX_ORIGIN_COUNTRY, editableAdminSetting('tax.origin_country')],
        ['Use regional origin', env.TAX_USE_REGIONAL_ORIGIN, editableAdminSetting('tax.use_regional_origin', 'boolean')],
        ['New Mexico GRT API base', env.NM_GRT_API_BASE, editableAdminSetting('tax.nm_grt_api_base')],
        ['ZIP.TAX API base', env.ZIP_TAX_API_BASE, editableAdminSetting('tax.zip_tax_api_base')]
      ]),
      adminSettingsSection('Shipping', [
        ['Origin postal code', env.SHIPPING_ORIGIN_ZIP, editableAdminSetting('shipping.origin_zip')],
        ['Origin country', env.SHIPPING_ORIGIN_COUNTRY, editableAdminSetting('shipping.origin_country')],
        ['Fallback Shipping Fee (USD)', env.SHIPPING_FALLBACK_FLAT_RATE, editableAdminSetting('shipping.fallback_flat_rate', 'number')],
        ['Free shipping default', env.FREE_SHIPPING_DEFAULT, editableAdminSetting('shipping.free_shipping_default', 'boolean')],
        ['Default shipping option', env.SHIPPING_DEFAULT_OPTION || 'standard', editableAdminSetting('shipping.default_option')],
        ['USPS enabled', env.USPS_ENABLED, editableAdminSetting('shipping.usps.enabled', 'boolean')],
        ['USPS client ID', env.USPS_CLIENT_ID, editableAdminSetting('shipping.usps.client_id')],
        ['USPS API base', env.USPS_API_BASE, editableAdminSetting('shipping.usps.api_base')],
        ['USPS timeout ms', env.USPS_TIMEOUT_MS, editableAdminSetting('shipping.usps.timeout_ms', 'number')],
        ['USPS quote cache TTL seconds', env.USPS_QUOTE_CACHE_TTL_SECONDS, editableAdminSetting('shipping.usps.quote_cache_ttl_seconds', 'number')],
        ['USPS failure cooldown seconds', env.USPS_FAILURE_COOLDOWN_SECONDS, editableAdminSetting('shipping.usps.failure_cooldown_seconds', 'number')],
        ['USPS rate limit cooldown seconds', env.USPS_RATE_LIMIT_COOLDOWN_SECONDS, editableAdminSetting('shipping.usps.rate_limit_cooldown_seconds', 'number')]
      ]),
      adminSettingsSection('Campaign runner reports', [
        ['Enabled', env.CAMPAIGN_RUNNER_REPORTS_ENABLED, editableAdminSetting('reports.campaign_runner.enabled', 'boolean')],
        ['Send Time (Mountain Time)', env.CAMPAIGN_RUNNER_REPORT_HOUR_MT, campaignRunnerSendTimeSetting(env.CAMPAIGN_RUNNER_REPORT_HOUR_MT, env.CAMPAIGN_RUNNER_REPORT_MINUTE_MT)],
        ['Email Subject Prefix', env.CAMPAIGN_RUNNER_EMAIL_SUBJECT_PREFIX, editableAdminSetting('reports.campaign_runner.email_subject_prefix')],
        ['Daily pledge report enabled', env.CAMPAIGN_RUNNER_DAILY_PLEDGE_REPORT_ENABLED, editableAdminSetting('reports.campaign_runner.daily_pledge_report_enabled', 'boolean')],
        ['Fulfillment report enabled', env.CAMPAIGN_RUNNER_FULFILLMENT_REPORT_ENABLED, editableAdminSetting('reports.campaign_runner.fulfillment_report_enabled', 'boolean')],
        ['Include stats summary', env.CAMPAIGN_RUNNER_INCLUDE_STATS_SUMMARY, editableAdminSetting('reports.campaign_runner.include_stats_summary', 'boolean')],
        ['Include CSV attachment', env.CAMPAIGN_RUNNER_INCLUDE_CSV_ATTACHMENT, editableAdminSetting('reports.campaign_runner.include_csv_attachment', 'boolean')]
      ]),
      adminSettingsSection('Design', [
        ['Body font', env.EMAIL_FONT_FAMILY, editableAdminSetting('design.font_body')],
        ['Heading font', env.EMAIL_HEADING_FONT_FAMILY, editableAdminSetting('design.font_display')],
        ['Text Color', env.EMAIL_COLOR_TEXT, editableAdminSetting('design.color_text')],
        ['Muted Color', env.EMAIL_COLOR_MUTED, editableAdminSetting('design.color_text_muted')],
        ['Surface Color', env.EMAIL_COLOR_SURFACE, editableAdminSetting('design.color_surface_subtle')],
        ['Border Color', env.EMAIL_COLOR_BORDER, editableAdminSetting('design.color_border')],
        ['Primary Color', env.EMAIL_COLOR_PRIMARY, editableAdminSetting('design.color_primary')],
        ['Button Radius', env.EMAIL_BUTTON_RADIUS, editableAdminSetting('design.radius_lg')]
      ]),
      adminSettingsSection('Users', [
        ['Users', await adminUserSettingsRows(env), {
          ...editableAdminSetting('admin.users', 'admin_users'),
          campaignOptions: adminCampaignOptions(campaigns),
          currentUserEmail: auth.user.email
        }]
      ]),
      adminSettingsSection('Platform add-ons', [
        ['Enabled', addOns?.enabled === true, editableAdminSetting('add_ons.enabled', 'boolean')],
        ['Low stock threshold', addOns?.low_stock_threshold ?? 5, editableAdminSetting('add_ons.low_stock_threshold', 'number')],
        ['Products', platformAddOnProducts, editableAdminSetting('add_ons.products', 'add_on_products')]
      ]),
      adminSettingsSection('Advanced performance', [
        ['Live stats cache TTL seconds', env.LIVE_STATS_CACHE_TTL_SECONDS || '300', editableAdminSetting('cache.live_stats_ttl_seconds', 'number')],
        ['Live inventory cache TTL seconds', env.LIVE_INVENTORY_CACHE_TTL_SECONDS || '300', editableAdminSetting('cache.live_inventory_ttl_seconds', 'number')]
      ]),
      adminSettingsSection('Debug', [
        ['Console logging enabled', env.DEBUG_CONSOLE_LOGGING_ENABLED, editableAdminSetting('debug.console_logging_enabled', 'boolean')],
        ['Verbose console logging', env.DEBUG_VERBOSE_CONSOLE_LOGGING, editableAdminSetting('debug.verbose_console_logging', 'boolean')]
      ]),
      adminSettingsSection('Secrets & credentials', adminSecretStatusRows(env)),
      adminSettingsSection('Runtime diagnostics', [
        ['Current site base', env.SITE_BASE, readOnlyAdminSettingHelp('The site origin the current Worker runtime is configured to trust for browser requests.')],
        ['Current Worker base', env.WORKER_BASE, readOnlyAdminSettingHelp('The Worker API base URL used by the current runtime environment.')],
        ['CORS allowed origin', env.CORS_ALLOWED_ORIGIN, readOnlyAdminSettingHelp('The browser origin allowed to make credentialed admin and checkout requests to the Worker.')]
      ])
    );
  }

  return privateJsonResponse({
    user: auth.user,
    scope: auth.user.role === 'super_admin' ? 'platform' : 'campaign',
    sections,
    campaigns: campaignSections,
    writeBudget: adminReadBudget(),
    generatedAt: new Date().toISOString()
  }, 200, env);
}

function normalizeAdminUserCampaigns(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || '').split(',');
  return Array.from(new Set(source
    .map((item) => String(item || '').trim())
    .filter(Boolean)));
}

const ADMIN_TEXT_DEFAULT_MAX_LENGTH = 500;
const ADMIN_URL_MAX_LENGTH = 2048;
const ADMIN_FONT_STACK_MAX_LENGTH = 200;
const ADMIN_CSS_LENGTH_MAX_LENGTH = 50;
const ADMIN_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ADMIN_DATE_TIME_REGEX = /^\d{4}-\d{2}-\d{2}(?:[T ][0-2]\d:[0-5]\d(?::[0-5]\d)?(?:Z|[+-][0-2]\d:[0-5]\d)?)?$/;
const ADMIN_SAFE_SLUG_VALUES = /^[a-z0-9_-]+$/;

function stripAdminControlCharacters(value, { allowNewlines = false } = {}) {
  const text = String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return allowNewlines
    ? text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    : text.replace(/[\u0000-\u001F\u007F]/g, '');
}

function hasAdminRawHtml(value) {
  const text = String(value || '');
  return /<!--|<\?|<\s*\/?\s*[a-z][^>]*>/i.test(text);
}

function normalizeAdminPlainText(value, label = 'Value', {
  maxLength = ADMIN_TEXT_DEFAULT_MAX_LENGTH,
  allowNewlines = false,
  allowRawHtml = false
} = {}) {
  const text = stripAdminControlCharacters(value, { allowNewlines }).trim();
  if (text.length > maxLength) return { ok: false, error: `${label} is too long.` };
  if (!allowRawHtml && hasAdminRawHtml(text)) {
    return { ok: false, error: `${label} cannot include raw HTML.` };
  }
  return { ok: true, value: text };
}

function normalizeAdminSlugValue(value, label = 'ID', { required = true } = {}) {
  const text = stripAdminControlCharacters(value).trim().toLowerCase();
  if (!text && !required) return { ok: true, value: '' };
  if (!isValidSlug(text)) return { ok: false, error: `${label} must use lowercase letters, numbers, and hyphens only.` };
  return { ok: true, value: text };
}

function normalizeAdminSafeToken(value, label = 'Value', { maxLength = 80, required = false } = {}) {
  const text = stripAdminControlCharacters(value).trim().toLowerCase();
  if (!text && !required) return { ok: true, value: '' };
  if (!text || text.length > maxLength || !ADMIN_SAFE_SLUG_VALUES.test(text)) {
    return { ok: false, error: `${label} must use letters, numbers, hyphens, or underscores only.` };
  }
  return { ok: true, value: text };
}

function isSafeAdminRootRelativePath(value) {
  const text = String(value || '').trim();
  if (!text.startsWith('/') || text.startsWith('//') || text.includes('\\')) return false;
  if (/[\u0000-\u001F\u007F<>"'`\s]/.test(text)) return false;
  const pathOnly = text.split(/[?#]/)[0];
  let decoded = pathOnly;
  try {
    decoded = decodeURIComponent(pathOnly);
  } catch {
    return false;
  }
  return !decoded.split('/').some((segment) => segment === '..');
}

function normalizeAdminUrlReference(value, label = 'URL', {
  allowRelative = true,
  requireAbsolute = false
} = {}) {
  const text = stripAdminControlCharacters(value).trim();
  if (!text) return { ok: true, value: '' };
  if (text.length > ADMIN_URL_MAX_LENGTH) return { ok: false, error: `${label} is too long.` };
  if (/[\u0000-\u001F\u007F<>"'`\s]/.test(text)) return { ok: false, error: `${label} contains unsafe characters.` };
  if (text.startsWith('/')) {
    if (requireAbsolute || !allowRelative) return { ok: false, error: `${label} must be an absolute http or https URL.` };
    if (!isSafeAdminRootRelativePath(text)) return { ok: false, error: `${label} must be a safe root-relative path.` };
    return { ok: true, value: text };
  }
  try {
    const parsed = new URL(text);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { ok: false, error: `${label} must use http or https.` };
    }
    if (parsed.username || parsed.password) {
      return { ok: false, error: `${label} cannot include embedded credentials.` };
    }
    return { ok: true, value: parsed.toString() };
  } catch {
    return { ok: false, error: `${label} must be a valid URL.` };
  }
}

function normalizeAdminAssetReference(value, label = 'Asset') {
  return normalizeAdminUrlReference(value, label, { allowRelative: true });
}

function parseAdminExternalVideoReference(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (host === 'youtu.be') {
      const id = parts[0] || '';
      return /^[A-Za-z0-9_-]+$/.test(id) ? { provider: 'youtube', id } : null;
    }
    if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) {
      let id = parsed.pathname === '/watch' ? parsed.searchParams.get('v') || '' : '';
      if (!id && ['embed', 'shorts', 'live'].includes(parts[0])) id = parts[1] || '';
      return /^[A-Za-z0-9_-]+$/.test(id) ? { provider: 'youtube', id } : null;
    }
    if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
      const videoIndex = parts.indexOf('video');
      const id = videoIndex >= 0 && /^\d+$/.test(parts[videoIndex + 1] || '')
        ? parts[videoIndex + 1]
        : parts.find((part) => /^\d+$/.test(part));
      return id ? { provider: 'vimeo', id } : null;
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeAdminHeroVideoReference(value, label = 'Hero video') {
  const normalized = normalizeAdminAssetReference(value, label);
  if (!normalized.ok || !normalized.value) return normalized;
  if (parseAdminExternalVideoReference(normalized.value)) return normalized;
  const path = normalized.value.startsWith('/')
    ? normalized.value.split(/[?#]/)[0]
    : new URL(normalized.value).pathname;
  if (/\.(mp4|webm|mov)$/i.test(path)) return normalized;
  return {
    ok: false,
    error: `${label} must be an uploaded MP4, WebM, or MOV video path, or a YouTube or Vimeo URL.`
  };
}

function collectAdminRichTextErrors(value, fieldName, { maxLength = 8000 } = {}) {
  const text = stripAdminControlCharacters(value, { allowNewlines: true }).trim();
  const errors = [];
  if (text.length > maxLength) errors.push(`${fieldName} is too long.`);
  if (/\bstyle\s*=\s*["']/i.test(text)) errors.push(`${fieldName} includes inline style attributes, which are not allowed.`);
  if (/<script\b/i.test(text)) errors.push(`${fieldName} includes raw <script> HTML, which is not allowed.`);
  const inlineEvents = text.match(/\son[a-z]+\s*=\s*["']/ig) || [];
  for (const match of inlineEvents) {
    errors.push(`${fieldName} includes an inline event handler (${match.trim()}).`);
  }
  if (/<iframe\b/i.test(text)) errors.push(`${fieldName} includes raw <iframe> HTML, which is not allowed.`);
  text.replace(/<\s*\/?\s*([a-z0-9]+)(?:\s[^>]*)?>/ig, (_match, tagName) => {
    const tag = String(tagName || '').toLowerCase();
    if (!ADMIN_CONTENT_ALLOWED_INLINE_TAGS.has(tag)) {
      errors.push(`${fieldName} includes raw <${tag}> HTML; use Markdown or approved content blocks instead.`);
    }
    return '';
  });
  text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, _label, href) => {
    if (!isAdminPreviewAllowedLink(href)) errors.push(`${fieldName} includes an unsafe link URL.`);
    return '';
  });
  return { text, errors };
}

function normalizeAdminRichTextStorageValue(value, label = 'Text', { maxLength = 8000, required = false } = {}) {
  const normalized = collectAdminRichTextErrors(value, label, { maxLength });
  if (required && !normalized.text) return { ok: false, error: `${label} is required.` };
  if (normalized.errors.length) return { ok: false, error: normalized.errors.join(' ') };
  return { ok: true, value: normalized.text };
}

function normalizeAdminCssFontStack(value, label = 'Font') {
  const normalized = normalizeAdminPlainText(value, label, { maxLength: ADMIN_FONT_STACK_MAX_LENGTH });
  if (!normalized.ok || !normalized.value) return normalized;
  if (/[;{}()<>\\]/.test(normalized.value) || /\b(?:url|expression)\s*\(/i.test(normalized.value) || !/^[A-Za-z0-9\s'",._-]+$/.test(normalized.value)) {
    return { ok: false, error: `${label} must be a simple CSS font stack without CSS functions or declarations.` };
  }
  return normalized;
}

function normalizeAdminCssLength(value, label = 'CSS length') {
  const normalized = normalizeAdminPlainText(value, label, { maxLength: ADMIN_CSS_LENGTH_MAX_LENGTH });
  if (!normalized.ok || !normalized.value) return normalized;
  if (!/^(?:0|[0-9]+(?:\.[0-9]+)?(?:px|rem|em|%)?)$/.test(normalized.value)) {
    return { ok: false, error: `${label} must be a CSS length like 6px, 0.5rem, or 50%.` };
  }
  return normalized;
}

function normalizeAdminUsers(value, schema = {}) {
  let users;
  try {
    users = Array.isArray(value) ? value : JSON.parse(String(value || '[]'));
  } catch {
    return { ok: false, error: `${schema.label || 'Users'} must be valid user JSON.` };
  }
  if (!Array.isArray(users)) return { ok: false, error: `${schema.label || 'Users'} must be a list.` };
  if (users.length > 100) return { ok: false, error: `${schema.label || 'Users'} can include at most 100 users.` };

  const availableCampaigns = new Set((schema.availableCampaignSlugs || []).map((campaignSlug) => String(campaignSlug || '').trim()).filter(Boolean));
  const currentUserEmail = String(schema.currentUserEmail || '').trim().toLowerCase();
  const seenEmails = new Set();
  const superAdminEmails = new Set();
  const normalized = [];

  for (const [index, user] of users.entries()) {
    if (!user || typeof user !== 'object' || Array.isArray(user)) {
      return { ok: false, error: `User ${index + 1} must be an object.` };
    }
    const normalizedName = normalizeAdminPlainText(user.name || '', `User ${index + 1} name`, { maxLength: 100 });
    if (!normalizedName.ok) return normalizedName;
    const name = normalizedName.value;
    const email = String(user.email || '').trim().toLowerCase();
    if (!isValidEmail(email)) return { ok: false, error: `User ${index + 1} needs a valid email address.` };
    if (seenEmails.has(email)) return { ok: false, error: `User email "${email}" is duplicated.` };
    seenEmails.add(email);

    const role = String(user.role || '').trim() === 'super_admin' ? 'super_admin' : 'campaign_user';
    const campaigns = role === 'super_admin'
      ? []
      : normalizeAdminUserCampaigns(user.campaigns ?? user.campaignSlugs ?? user.campaign_slugs);
    if (role === 'campaign_user' && !campaigns.length) {
      return { ok: false, error: `Campaign user "${email}" needs at least one campaign.` };
    }
    const invalidCampaign = campaigns.find((campaignSlug) => !isValidSlug(campaignSlug));
    if (invalidCampaign) return { ok: false, error: `User "${email}" references an invalid campaign "${invalidCampaign}".` };
    const unknownCampaign = campaigns.find((campaignSlug) => availableCampaigns.size && !availableCampaigns.has(campaignSlug));
    if (unknownCampaign) return { ok: false, error: `User "${email}" references unknown campaign "${unknownCampaign}".` };
    if (role === 'super_admin') superAdminEmails.add(email);

    normalized.push({ name, email, role, campaigns });
  }

  if (!superAdminEmails.size) return { ok: false, error: 'Users must include at least one super admin.' };
  if (currentUserEmail && !superAdminEmails.has(currentUserEmail)) {
    return { ok: false, error: 'Your account must stay a super admin before publishing user changes.' };
  }

  return { ok: true, value: normalized };
}

function normalizeAdminSettingsValue(value, schema = {}) {
  const label = schema.label || 'Value';
  if (schema.type === 'boolean') {
    if (value === true || value === 'true') return { ok: true, value: true };
    if (value === false || value === 'false') return { ok: true, value: false };
    return { ok: false, error: `${label} must be true or false.` };
  }
  if (schema.type === 'admin_users') {
    return normalizeAdminUsers(value, schema);
  }
  if (schema.type === 'add_on_products') {
    return normalizeAdminAddOnProducts(value, schema);
  }
  if (schema.type === 'campaign_collection') {
    return normalizeAdminCampaignCollection(value, schema);
  }
  if (schema.type === 'content_editor') {
    return { ok: false, error: `${label} is saved through the Content tab, not settings publishing.` };
  }
  if (schema.type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number)) return { ok: false, error: `${label} must be a number.` };
    if (schema.input === 'integer' && !Number.isInteger(number)) return { ok: false, error: `${label} must be a whole number.` };
    if (schema.min !== undefined && number < schema.min) return { ok: false, error: `${label} must be at least ${schema.min}.` };
    if (schema.max !== undefined && number > schema.max) return { ok: false, error: `${label} must be no more than ${schema.max}.` };
    return { ok: true, value: number };
  }
  if (schema.input === 'select' && Array.isArray(schema.options) && schema.options.length > 0) {
    const text = String(value ?? '').trim();
    const allowed = new Set(schema.options.map((option) => String(option?.value ?? '').trim()));
    if (!allowed.has(text)) {
      return { ok: false, error: `${label} must be one of the available options.` };
    }
    return { ok: true, value: text };
  }
  if (schema.type === 'list') {
    const items = Array.isArray(value)
      ? value
      : String(value || '').split(/[\n,]+/);
    let normalizedItems = items.map((item) => stripAdminControlCharacters(item).trim()).filter(Boolean);
    if (Array.isArray(schema.options) && schema.options.length > 0) {
      const allowed = new Set(schema.options.map((option) => String(option?.value ?? '').trim()).filter(Boolean));
      const invalid = normalizedItems.find((item) => !allowed.has(item));
      if (invalid) return { ok: false, error: `${label} contains an unavailable option.` };
    }
    if (schema.input === 'email-list') {
      normalizedItems = normalizedItems.map((item) => item.toLowerCase());
      const invalid = normalizedItems.find((item) => !isValidEmail(item));
      if (invalid) return { ok: false, error: `${label} contains an invalid email address.` };
    }
    if (schema.input === 'url-list') {
      const normalizedUrls = [];
      for (const item of normalizedItems) {
        const normalizedUrl = normalizeAdminUrlReference(item, label, { allowRelative: false, requireAbsolute: true });
        if (!normalizedUrl.ok) return { ok: false, error: `${label} contains an invalid URL.` };
        normalizedUrls.push(normalizedUrl.value);
      }
      normalizedItems = normalizedUrls;
    } else {
      const invalid = normalizedItems.find((item) => hasAdminRawHtml(item));
      if (invalid) return { ok: false, error: `${label} cannot include raw HTML.` };
    }
    return {
      ok: true,
      value: normalizedItems
    };
  }
  const text = stripAdminControlCharacters(value, { allowNewlines: schema.input === 'textarea' }).trim();
  if (schema.input === 'date' && text && !ADMIN_DATE_REGEX.test(text)) {
    return { ok: false, error: `${label} must use YYYY-MM-DD.` };
  }
  if (schema.input === 'slug' && !isValidSlug(text)) {
    return { ok: false, error: `${label} must use lowercase letters, numbers, and hyphens only.` };
  }
  if (schema.input === 'color' && text && !/^#[0-9a-f]{6}$/i.test(text)) {
    return { ok: false, error: `${label} must use a hex color like #101215.` };
  }
  if (schema.input === 'url') {
    const requireAbsolute = [
      'platform.site_url',
      'platform.worker_url',
      'tax.nm_grt_api_base',
      'tax.zip_tax_api_base',
      'shipping.usps.api_base'
    ].includes(schema.path);
    return normalizeAdminUrlReference(text, label, { allowRelative: !requireAbsolute, requireAbsolute });
  }
  if (schema.input === 'video-upload' && schema.path === 'hero_video') {
    return normalizeAdminHeroVideoReference(text, label);
  }
  if (schema.input === 'image-upload' || schema.input === 'video-upload') {
    return normalizeAdminAssetReference(text, label);
  }
  if (schema.input === 'email' && text && !isValidEmail(text)) {
    return { ok: false, error: `${label} must be a valid email address.` };
  }
  if (schema.input === 'email') {
    return { ok: true, value: text };
  }
  if (schema.input === 'email-sender' && text) {
    if (text.length > 200 || /[\n\r]/.test(text) || /<\s*\/?\s*[a-z][^>]*>/i.test(text.replace(/<[^<>]+>$/, ''))) {
      return { ok: false, error: `${label} must be a single sender identity.` };
    }
    const senderEmail = text.match(/<([^<>]+)>$/)?.[1] || text;
    if (!isValidEmail(senderEmail.trim())) {
      return { ok: false, error: `${label} must be an email address or Name <email@example.com>.` };
    }
  }
  if (schema.input === 'email-sender') {
    return { ok: true, value: text };
  }
  if (schema.input === 'stripe-publishable-key' && text && !/^pk_(test|live)_[A-Za-z0-9_]+$/.test(text)) {
    return { ok: false, error: `${label} must start with pk_test_ or pk_live_.` };
  }
  if (schema.input === 'stripe-publishable-key') {
    return { ok: true, value: text };
  }
  if (schema.input === 'rich-text-inline') {
    return normalizeAdminRichTextStorageValue(text, label, { maxLength: 2000 });
  }
  if (schema.path === 'design.font_body' || schema.path === 'design.font_display') {
    return normalizeAdminCssFontStack(text, label);
  }
  if (schema.path === 'design.radius_lg') {
    return normalizeAdminCssLength(text, label);
  }
  const maxLength = schema.input === 'textarea' ? 1000 : 500;
  const normalized = normalizeAdminPlainText(text, label, {
    maxLength,
    allowNewlines: schema.input === 'textarea'
  });
  if (!normalized.ok) {
    return normalized;
  }
  return { ok: true, value: normalized.value };
}

function normalizeAdminAddOnProducts(value, schema = {}) {
  let products;
  try {
    products = Array.isArray(value) ? value : JSON.parse(String(value || '[]'));
  } catch {
    return { ok: false, error: `${schema.label || 'Products'} must be valid product JSON.` };
  }
  if (!Array.isArray(products)) {
    return { ok: false, error: `${schema.label || 'Products'} must be a list.` };
  }
  if (products.length > 50) {
    return { ok: false, error: `${schema.label || 'Products'} can include at most 50 products.` };
  }

  const seen = new Set();
  const normalized = [];
  for (const [index, product] of products.entries()) {
    if (!product || typeof product !== 'object' || Array.isArray(product)) {
      return { ok: false, error: `Product ${index + 1} must be an object.` };
    }
    const idResult = normalizeAdminSlugValue(product.id || '', `Product ${index + 1} id`);
    if (!idResult.ok) return idResult;
    const id = idResult.value;
    if (seen.has(id)) return { ok: false, error: `Product id "${id}" is duplicated.` };
    seen.add(id);

    const normalizedName = normalizeAdminPlainText(product.name || '', `Product "${id}" name`, { maxLength: 120 });
    if (!normalizedName.ok) return normalizedName;
    const name = normalizedName.value;
    if (!name) return { ok: false, error: `Product "${id}" needs a name.` };
    const category = String(product.category || 'physical').trim().toLowerCase();
    if (!['physical', 'digital'].includes(category)) return { ok: false, error: `Product "${id}" category must be physical or digital.` };
    const price = Number(product.price);
    if (!Number.isFinite(price) || price < 0) return { ok: false, error: `Product "${id}" needs a non-negative price.` };
    const description = normalizeAdminRichTextStorageValue(product.description || '', `Product "${id}" description`, { maxLength: 2000 });
    if (!description.ok) return description;
    const imageUrl = normalizeAdminAssetReference(product.image_url || product.imageUrl || '', `Product "${id}" image`);
    if (!imageUrl.ok) return imageUrl;

    const normalizedProduct = {
      id,
      name,
      description: description.value,
      image_url: imageUrl.value,
      price: Number(price.toFixed(2)),
      category
    };
    const shippingPresetResult = normalizeAdminSafeToken(product.shipping_preset || product.shippingPreset || '', `Product "${id}" shipping preset`);
    if (!shippingPresetResult.ok) return shippingPresetResult;
    const shippingPreset = shippingPresetResult.value;
    if (category === 'physical' && shippingPreset) {
      normalizedProduct.shipping_preset = shippingPreset;
    } else if (category === 'physical') {
      const shipping = normalizeAdminShippingPackage(product.shipping, `Product "${id}"`);
      if (!shipping.ok) return shipping;
      normalizedProduct.shipping = shipping.value;
    }
    const sourceUrlResult = normalizeAdminUrlReference(product.source_url || product.sourceUrl || '', `Product "${id}" source URL`, { allowRelative: true });
    if (!sourceUrlResult.ok) return sourceUrlResult;
    const sourceUrl = sourceUrlResult.value;
    if (sourceUrl) normalizedProduct.source_url = sourceUrl;
    const variantOptionNameResult = normalizeAdminPlainText(product.variant_option_name || product.variantOptionName || '', `Product "${id}" variant option name`, { maxLength: 80 });
    if (!variantOptionNameResult.ok) return variantOptionNameResult;
    const variantOptionName = variantOptionNameResult.value;
    if (variantOptionName) normalizedProduct.variant_option_name = variantOptionName;
    const inventory = product.inventory === '' || product.inventory === undefined || product.inventory === null
      ? null
      : Number(product.inventory);
    if (inventory !== null) {
      if (!Number.isInteger(inventory) || inventory < 0) return { ok: false, error: `Product "${id}" inventory must be a non-negative whole number.` };
      normalizedProduct.inventory = inventory;
    }

    const variants = Array.isArray(product.variants) ? product.variants : [];
    if (variants.length > 30) return { ok: false, error: `Product "${id}" can include at most 30 variants.` };
    const seenVariants = new Set();
    normalizedProduct.variants = [];
    for (const [variantIndex, variant] of variants.entries()) {
      const variantIdResult = normalizeAdminSlugValue(variant?.id || '', `Variant ${variantIndex + 1} for "${id}" id`);
      if (!variantIdResult.ok) return variantIdResult;
      const variantId = variantIdResult.value;
      if (seenVariants.has(variantId)) return { ok: false, error: `Variant id "${variantId}" is duplicated for "${id}".` };
      seenVariants.add(variantId);
      const normalizedLabel = normalizeAdminPlainText(variant?.label || '', `Variant "${variantId}" label`, { maxLength: 120 });
      if (!normalizedLabel.ok) return normalizedLabel;
      const label = normalizedLabel.value;
      if (!label) return { ok: false, error: `Variant "${variantId}" for "${id}" needs a label.` };
      const variantInventory = variant.inventory === '' || variant.inventory === undefined || variant.inventory === null
        ? null
        : Number(variant.inventory);
      const normalizedVariant = { id: variantId, label };
      if (variantInventory !== null) {
        if (!Number.isInteger(variantInventory) || variantInventory < 0) return { ok: false, error: `Variant "${variantId}" inventory must be a non-negative whole number.` };
        normalizedVariant.inventory = variantInventory;
      }
      normalizedProduct.variants.push(normalizedVariant);
    }
    normalized.push(normalizedProduct);
  }
  return { ok: true, value: normalized };
}

const ADMIN_SHIPPING_PACKAGE_FIELDS = [
  ['weight_oz', 'weight', true],
  ['packaging_weight_oz', 'packaging weight', false],
  ['length_in', 'length', true],
  ['width_in', 'width', true],
  ['height_in', 'height', true],
  ['stack_height_in', 'stack height', false]
];

function normalizeAdminShippingPackage(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: `${label} needs package weight and dimensions when Shipping preset is None.` };
  }
  const normalized = {};
  for (const [key, fieldLabel, required] of ADMIN_SHIPPING_PACKAGE_FIELDS) {
    const raw = value[key];
    if (raw === '' || raw === undefined || raw === null) {
      if (required) return { ok: false, error: `${label} needs package ${fieldLabel}.` };
      continue;
    }
    const number = Number(raw);
    if (!Number.isFinite(number) || number < 0 || (required && number <= 0)) {
      return { ok: false, error: `${label} package ${fieldLabel} must be ${required ? 'greater than 0' : '0 or greater'}.` };
    }
    normalized[key] = Number(number.toFixed(3));
  }
  return { ok: true, value: normalized };
}

function parseAdminJsonArray(value, label) {
  try {
    const parsed = Array.isArray(value) ? value : JSON.parse(String(value || '[]'));
    if (!Array.isArray(parsed)) return { ok: false, error: `${label} must be a list.` };
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, error: `${label} must be valid JSON.` };
  }
}

function optionalAdminNumber(value, field, { integer = false } = {}) {
  if (value === '' || value === undefined || value === null) return { ok: true, value: undefined };
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (integer && !Number.isInteger(number))) {
    return { ok: false, error: `${field} must be a non-negative ${integer ? 'whole ' : ''}number.` };
  }
  return { ok: true, value: number };
}

function normalizeAdminCampaignCollection(value, schema = {}) {
  const label = schema.label || 'Items';
  const parsed = parseAdminJsonArray(value, label);
  if (!parsed.ok) return parsed;
  if (parsed.value.length > 100) return { ok: false, error: `${label} can include at most 100 items.` };

  const collection = schema.collection;
  const normalized = [];
  for (const [index, item] of parsed.value.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: `${label} item ${index + 1} must be an object.` };
    }
    const out = {};
    if (collection === 'diary') {
      const title = normalizeAdminPlainText(item.title || '', `Diary entry ${index + 1} title`, { maxLength: 160 });
      if (!title.ok) return title;
      out.title = title.value;
      if (!out.title) return { ok: false, error: `Diary entry ${index + 1} needs a title.` };
      out.date = stripAdminControlCharacters(item.date || '').trim();
      if (out.date && !ADMIN_DATE_TIME_REGEX.test(out.date)) return { ok: false, error: `Diary entry "${out.title}" date must be a valid date/time.` };
      const phase = normalizeAdminSafeToken(item.phase || '', `Diary entry "${out.title}" phase`);
      if (!phase.ok) return phase;
      out.phase = phase.value;
      const rawContent = Array.isArray(item.content) && item.content.length
        ? item.content
        : [{ type: 'text', body: String(item.body || '').trim(), align: 'left' }];
      const errors = [];
      const warnings = [];
      out.content = rawContent.slice(0, ADMIN_CONTENT_MAX_BLOCKS).map((block, blockIndex) => validateAdminContentBlock(block, blockIndex, errors, warnings)).filter(Boolean);
      if (rawContent.length > ADMIN_CONTENT_MAX_BLOCKS) warnings.push(`Diary entry "${out.title}" was limited to ${ADMIN_CONTENT_MAX_BLOCKS} blocks.`);
      if (errors.length) return { ok: false, error: `Diary entry "${out.title}" content is invalid: ${errors.join(' ')}` };
      if (!out.content.length) return { ok: false, error: `Diary entry "${out.title}" needs body text.` };
      normalized.push(out);
      continue;
    }

    if (collection === 'stretch_goals') {
      const threshold = optionalAdminNumber(item.threshold, `Stretch goal ${index + 1} threshold`);
      if (!threshold.ok || threshold.value === undefined) return { ok: false, error: threshold.error || `Stretch goal ${index + 1} needs a threshold.` };
      out.threshold = threshold.value;
      const title = normalizeAdminPlainText(item.title || '', `Stretch goal ${index + 1} title`, { maxLength: 160 });
      if (!title.ok) return title;
      out.title = title.value;
      if (!out.title) return { ok: false, error: `Stretch goal ${index + 1} needs a title.` };
      const description = normalizeAdminRichTextStorageValue(item.description || '', `Stretch goal "${out.title}" description`, { maxLength: 1000 });
      if (!description.ok) return description;
      out.description = description.value;
      const status = normalizeAdminSafeToken(item.status || '', `Stretch goal "${out.title}" status`);
      if (!status.ok) return status;
      out.status = status.value;
      normalized.push(out);
      continue;
    }

    if (collection === 'ongoing_items') {
      const labelText = normalizeAdminPlainText(item.label || '', `Ongoing item ${index + 1} label`, { maxLength: 160 });
      if (!labelText.ok) return labelText;
      out.label = labelText.value;
      if (!out.label) return { ok: false, error: `Ongoing item ${index + 1} needs a label.` };
      const remaining = optionalAdminNumber(item.remaining, `Ongoing item "${out.label}" remaining`);
      if (!remaining.ok) return { ok: false, error: remaining.error };
      if (remaining.value !== undefined) out.remaining = remaining.value;
      normalized.push(out);
      continue;
    }

    out.id = String(item.id || '').trim();
    if (!isValidSlug(out.id)) return { ok: false, error: `${label} item ${index + 1} needs a URL-safe id.` };

    if (collection === 'tiers') {
      const name = normalizeAdminPlainText(item.name || '', `Tier "${out.id}" name`, { maxLength: 160 });
      if (!name.ok) return name;
      out.name = name.value;
      if (!out.name) return { ok: false, error: `Tier "${out.id}" needs a name.` };
      const price = optionalAdminNumber(item.price, `Tier "${out.id}" price`);
      if (!price.ok || price.value === undefined) return { ok: false, error: price.error || `Tier "${out.id}" needs a price.` };
      out.price = price.value;
      const image = normalizeAdminAssetReference(item.image || item.image_url || '', `Tier "${out.id}" image`);
      if (!image.ok) return image;
      out.image = image.value;
      const description = normalizeAdminRichTextStorageValue(item.description || '', `Tier "${out.id}" description`, { maxLength: 3000 });
      if (!description.ok) return description;
      out.description = description.value;
      const limit = optionalAdminNumber(item.limit_total, `Tier "${out.id}" limit`, { integer: true });
      if (!limit.ok) return { ok: false, error: limit.error };
      if (limit.value !== undefined) out.limit_total = limit.value;
      const remaining = optionalAdminNumber(item.remaining, `Tier "${out.id}" remaining`, { integer: true });
      if (!remaining.ok) return { ok: false, error: remaining.error };
      if (remaining.value !== undefined) out.remaining = remaining.value;
      out.stackable = item.stackable === true || item.stackable === 'true';
      const category = String(item.category || '').trim().toLowerCase();
      out.category = ['physical', 'digital'].includes(category) ? category : 'digital';
      const shippingPresetResult = normalizeAdminSafeToken(item.shipping_preset || '', `Tier "${out.id}" shipping preset`);
      if (!shippingPresetResult.ok) return shippingPresetResult;
      const shippingPreset = shippingPresetResult.value;
      if (out.category === 'physical' && shippingPreset) {
        out.shipping_preset = shippingPreset;
      } else if (out.category === 'physical') {
        const shipping = normalizeAdminShippingPackage(item.shipping, `Tier "${out.id}"`);
        if (!shipping.ok) return shipping;
        out.shipping = shipping.value;
      }
      out.late_support = item.late_support === true || item.late_support === 'true';
      const threshold = optionalAdminNumber(item.requires_threshold, `Tier "${out.id}" threshold`);
      if (!threshold.ok) return { ok: false, error: threshold.error };
      if (threshold.value !== undefined) out.requires_threshold = threshold.value;
      normalized.push(out);
      continue;
    }

    if (collection === 'support_items') {
      const labelText = normalizeAdminPlainText(item.label || '', `Support item "${out.id}" name`, { maxLength: 160 });
      if (!labelText.ok) return labelText;
      out.label = labelText.value;
      if (!out.label) return { ok: false, error: `Support item "${out.id}" needs a label.` };
      const need = normalizeAdminRichTextStorageValue(item.need || '', `Support item "${out.id}" description`, { maxLength: 2000 });
      if (!need.ok) return need;
      out.need = need.value;
      const target = optionalAdminNumber(item.target, `Support item "${out.id}" target`);
      if (!target.ok || target.value === undefined) return { ok: false, error: target.error || `Support item "${out.id}" needs a target.` };
      out.target = target.value;
      const category = String(item.category || '').trim().toLowerCase();
      out.category = ['physical', 'digital'].includes(category) ? category : '';
      const shippingPreset = normalizeAdminSafeToken(item.shipping_preset || '', `Support item "${out.id}" shipping preset`);
      if (!shippingPreset.ok) return shippingPreset;
      if (out.category === 'physical' && shippingPreset.value) out.shipping_preset = shippingPreset.value;
      out.late_support = item.late_support === true || item.late_support === 'true';
      normalized.push(out);
      continue;
    }

    if (collection === 'decisions') {
      out.type = ['vote', 'poll'].includes(String(item.type || '').trim()) ? String(item.type).trim() : 'vote';
      const title = normalizeAdminPlainText(item.title || '', `Decision "${out.id}" title`, { maxLength: 160 });
      if (!title.ok) return title;
      out.title = title.value;
      if (!out.title) return { ok: false, error: `Decision "${out.id}" needs a title.` };
      out.deadline = stripAdminControlCharacters(item.deadline || '').trim();
      if (out.deadline && !ADMIN_DATE_REGEX.test(out.deadline)) return { ok: false, error: `Decision "${out.id}" deadline must use YYYY-MM-DD.` };
      const eligible = normalizeAdminSafeToken(item.eligible || 'backers', `Decision "${out.id}" eligible`, { required: true });
      if (!eligible.ok) return eligible;
      out.eligible = eligible.value;
      const status = String(item.status || 'open').trim().toLowerCase();
      out.status = status === 'closed' ? 'closed' : 'open';
      const options = Array.isArray(item.options)
        ? item.options
        : String(item.optionsText || '').split('\n').map((line) => line.trim()).filter(Boolean);
      if (options.length > 50) return { ok: false, error: `Decision "${out.id}" can include at most 50 options.` };
      const decisionOptions = [];
      for (const [optionIndex, option] of options.entries()) {
        if (option && typeof option === 'object') {
          const optionLabel = normalizeAdminPlainText(option.label || '', `Decision "${out.id}" option ${optionIndex + 1}`, { maxLength: 160 });
          if (!optionLabel.ok) return optionLabel;
          const image = normalizeAdminAssetReference(option.image || '', `Decision "${out.id}" option ${optionIndex + 1} image`);
          if (!image.ok) return image;
          if (optionLabel.value) decisionOptions.push(image.value ? { label: optionLabel.value, image: image.value } : optionLabel.value);
          continue;
        }
        const [optionLabel, image] = String(option || '').split('|').map((part) => part.trim());
        const normalizedLabel = normalizeAdminPlainText(optionLabel, `Decision "${out.id}" option ${optionIndex + 1}`, { maxLength: 160 });
        if (!normalizedLabel.ok) return normalizedLabel;
        const normalizedImage = normalizeAdminAssetReference(image || '', `Decision "${out.id}" option ${optionIndex + 1} image`);
        if (!normalizedImage.ok) return normalizedImage;
        if (normalizedLabel.value) decisionOptions.push(normalizedImage.value ? { label: normalizedLabel.value, image: normalizedImage.value } : normalizedLabel.value);
      }
      out.options = decisionOptions;
      if (!out.options.length) return { ok: false, error: `Decision "${out.id}" needs at least one option.` };
      normalized.push(out);
      continue;
    }

    normalized.push(out);
  }
  return { ok: true, value: normalized };
}

async function validateAdminSettingsChanges(request, env, body = {}, options = {}) {
  const auth = await requireAdminSession(request, env, 'campaign:read', options);
  if (!auth.ok) return { ok: false, response: auth.response };

  const changes = Array.isArray(body?.changes) ? body.changes : [];
  if (changes.length > 80) {
    return { ok: false, response: privateJsonResponse({ error: 'Too many settings changes.' }, 400, env) };
  }

  const { campaigns } = await getCampaigns(env);
  const campaignMap = new Map((campaigns || []).map((campaign) => [String(campaign?.slug || ''), campaign]));
  const normalized = [];
  const errors = [];
  const warnings = [];

  changes.forEach((change, index) => {
    const path = String(change?.path || '').trim();
    const campaignSlug = String(change?.campaignSlug || '').trim();
    let schema = campaignSlug
      ? ADMIN_CAMPAIGN_SETTING_SCHEMA.get(path)
      : ADMIN_PLATFORM_SETTING_SCHEMA.get(path);

    if (!schema) {
      errors.push(`changes[${index}] is not an editable setting.`);
      return;
    }
    if (!campaignSlug && auth.user.role !== 'super_admin') {
      errors.push(`changes[${index}] requires super admin access.`);
      return;
    }
    if (!campaignSlug && path === 'admin.users') {
      errors.push(`changes[${index}] must be saved from the Users section.`);
      return;
    }
    if (campaignSlug) {
      if (!isValidSlug(campaignSlug) || !campaignMap.has(campaignSlug)) {
        errors.push(`changes[${index}] references an unknown campaign.`);
        return;
      }
      if (auth.user.role !== 'super_admin' && !auth.user.campaignSlugs.includes(campaignSlug)) {
        errors.push(`changes[${index}] is outside this admin account's campaign scope.`);
        return;
      }
    }
    const normalizedValue = normalizeAdminSettingsValue(change?.value, { ...schema, path });
    if (!normalizedValue.ok) {
      errors.push(`changes[${index}]: ${normalizedValue.error}`);
      return;
    }
    if (campaignSlug && path === 'featured_tier_id') {
      const campaign = campaignMap.get(campaignSlug) || {};
      const tierIds = new Set((Array.isArray(campaign?.tiers) ? campaign.tiers : [])
        .map((tier) => String(tier?.id || '').trim())
        .filter(Boolean));
      const nextTierId = String(normalizedValue.value || '').trim();
      if (nextTierId && !tierIds.has(nextTierId)) {
        errors.push(`changes[${index}]: Featured tier must be one of this campaign's existing tiers.`);
        return;
      }
    }
    if (campaignSlug && path === 'slug') {
      const nextSlug = String(normalizedValue.value || '').trim();
      const duplicate = (campaigns || []).find((campaign) => (
        String(campaign?.slug || '') !== campaignSlug &&
        String(campaign?.slug || '') === nextSlug
      ));
      if (duplicate) {
        errors.push(`changes[${index}]: Slug "${nextSlug}" is already used by another campaign.`);
        return;
      }
      if (nextSlug !== campaignSlug) {
        warnings.push('Changing a campaign slug does not migrate existing pledge, stats, or inventory KV keys.');
      }
    }

    normalized.push({
      path,
      campaignSlug,
      label: schema.label,
      type: schema.type,
      value: normalizedValue.value
    });
  });

  return {
    ok: errors.length === 0,
    auth,
    changes: normalized,
    errors,
    warnings: normalized.length
      ? Array.from(new Set(['Publishing commits changes to GitHub and starts a deploy. Changes may take a few minutes to appear.', ...warnings]))
      : []
  };
}

async function handleAdminSettingsPreview(request, env, body = {}) {
  const result = await validateAdminSettingsChanges(request, env, body);
  if (!result.ok && result.response) return result.response;
  return privateJsonResponse({
    user: result.auth.user,
    dryRun: true,
    valid: result.errors.length === 0,
    changeCount: result.changes.length,
    changes: result.changes.map((change) => ({
      path: change.path,
      campaignSlug: change.campaignSlug,
      label: change.label
    })),
    errors: result.errors,
    warnings: result.warnings,
    writeBudget: adminReadBudget()
  }, result.errors.length ? 422 : 200, env);
}

function campaignNamesForAdminUser(user = {}, campaigns = []) {
  if (user.role === 'super_admin') return [];
  const campaignMap = new Map((campaigns || []).map((campaign) => [
    String(campaign?.slug || ''),
    String(campaign?.title || campaign?.slug || '').trim()
  ]));
  return (user.campaignSlugs || user.campaigns || [])
    .map((campaignSlug) => campaignMap.get(String(campaignSlug || '')) || String(campaignSlug || '').trim())
    .filter(Boolean);
}

async function notifyNewAdminUsers(env, users = [], previousUsers = [], campaigns = [], options = {}) {
  const previousEmails = new Set((previousUsers || [])
    .map((user) => String(user?.email || '').trim().toLowerCase())
    .filter(Boolean));
  const newUsers = (users || []).filter((user) => user?.email && !previousEmails.has(String(user.email).trim().toLowerCase()));
  const results = [];

  for (const user of newUsers) {
    const result = await sendAdminUserCreatedEmail(env, {
      email: user.email,
      name: user.name || '',
      role: user.role,
      campaignNames: campaignNamesForAdminUser(user, campaigns),
      createdBy: options.createdBy || '',
      lang: options.lang || 'en'
    });
    results.push({
      email: user.email,
      sent: result.sent !== false,
      reason: result.sent === false ? result.reason || 'Email unavailable' : undefined
    });
  }

  return {
    newUserEmails: newUsers.map((user) => user.email),
    sent: results.filter((result) => result.sent).map((result) => result.email),
    failed: results.filter((result) => !result.sent).map((result) => ({
      email: result.email,
      reason: result.reason
    }))
  };
}

async function handleAdminUsersSave(request, env, body = {}) {
  const auth = await requireAdminSession(request, env, 'settings:publish', { requireCsrf: true });
  if (!auth.ok) return auth.response;
  if (auth.user.role !== 'super_admin') {
    return privateJsonResponse({ error: 'Forbidden' }, 403, env);
  }

  const { campaigns } = await getCampaigns(env);
  const previousUsers = await getEffectiveAdminUsers(env);
  const normalized = normalizeAdminUsers(body.users ?? body.value ?? [], {
    label: 'Users',
    availableCampaignSlugs: (campaigns || []).map((campaign) => campaign?.slug),
    currentUserEmail: auth.user.email
  });
  if (!normalized.ok) {
    return privateJsonResponse({
      valid: false,
      errors: [normalized.error],
      writeBudget: adminReadBudget()
    }, 422, env);
  }

  const saved = await saveStoredAdminUsers(env, normalized.value, { updatedBy: auth.user.email });
  if (!saved.ok) {
    return privateJsonResponse({ error: saved.error }, saved.status || 500, env);
  }
  const notifications = await notifyNewAdminUsers(env, saved.users, previousUsers || [], campaigns || [], {
    createdBy: auth.user.email,
    lang: body.preferredLang
  });

  return privateJsonResponse({
    success: true,
    users: saved.users.map((user) => ({
      name: user.name || '',
      email: user.email,
      role: user.role === 'super_admin' ? 'super_admin' : 'campaign_user',
      campaigns: user.role === 'super_admin' ? [] : (user.campaignSlugs || [])
    })),
    notifications,
    writeBudget: adminWriteBudget({ readOnly: false, kvWritesExpected: 1 })
  }, 200, env);
}

function yamlAdminValue(value, type = 'string') {
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'number') return Number(value).toString();
  return yamlQuoteAdminString(value);
}

function yamlAdminInlineObject(entry = {}) {
  return `{ ${Object.entries(entry).map(([key, value]) => `${key}: ${yamlAdminValue(value, typeof value === 'number' ? 'number' : 'string')}`).join(', ')} }`;
}

function appendAdminShippingPackageYaml(lines, shipping, indent) {
  if (!shipping || typeof shipping !== 'object') return;
  lines.push(`${indent}shipping:`);
  for (const [field] of ADMIN_SHIPPING_PACKAGE_FIELDS) {
    yamlAdminMaybeLine(lines, field, shipping[field], `${indent}  `);
  }
}

function serializeAdminAddOnProductsYaml(products = [], indent = '  ') {
  if (!Array.isArray(products) || !products.length) return `${indent}products: []`;
  const lines = [`${indent}products:`];
  for (const product of products) {
    lines.push(`${indent}  - id: ${yamlQuoteAdminString(product.id)}`);
    lines.push(`${indent}    name: ${yamlQuoteAdminString(product.name)}`);
    lines.push(`${indent}    description: ${yamlQuoteAdminString(product.description || '')}`);
    lines.push(`${indent}    image_url: ${yamlQuoteAdminString(product.image_url || '')}`);
    lines.push(`${indent}    price: ${Number(product.price).toFixed(2)}`);
    lines.push(`${indent}    category: ${yamlQuoteAdminString(product.category || 'physical')}`);
    if (product.shipping_preset) lines.push(`${indent}    shipping_preset: ${yamlQuoteAdminString(product.shipping_preset)}`);
    appendAdminShippingPackageYaml(lines, product.shipping, `${indent}    `);
    if (product.inventory !== undefined) lines.push(`${indent}    inventory: ${Number(product.inventory)}`);
    if (product.source_url) lines.push(`${indent}    source_url: ${yamlQuoteAdminString(product.source_url)}`);
    if (product.variant_option_name) lines.push(`${indent}    variant_option_name: ${yamlQuoteAdminString(product.variant_option_name)}`);
    if (Array.isArray(product.variants) && product.variants.length) {
      lines.push(`${indent}    variants:`);
      for (const variant of product.variants) {
        const entry = { id: variant.id, label: variant.label };
        if (variant.inventory !== undefined) entry.inventory = Number(variant.inventory);
        lines.push(`${indent}      - ${yamlAdminInlineObject(entry)}`);
      }
    } else {
      lines.push(`${indent}    variants: []`);
    }
  }
  return lines.join('\n');
}

function serializeAdminCampaignAddOnsYaml(key, products = []) {
  return serializeAdminAddOnProductsYaml(products, '').replace(/^products:/, `${key}:`);
}

function replaceYamlBlockAtPath(source, path, replacement) {
  const parts = String(path || '').split('.').filter(Boolean);
  if (!parts.length) return { ok: false, error: 'Missing settings path.' };
  const lines = String(source || '').split(/\r?\n/);
  let start = 0;
  let end = lines.length;
  let indent = 0;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    const pattern = new RegExp(`^ {${indent}}${key}:\\s*(?:#.*)?$`);
    const sectionStart = lines.findIndex((line, lineIndex) => lineIndex >= start && lineIndex < end && pattern.test(line));
    if (sectionStart < 0) return { ok: false, error: `Missing settings section: ${parts.slice(0, index + 1).join('.')}` };
    start = sectionStart + 1;
    indent += 2;
    end = lines.findIndex((line, lineIndex) => (
      lineIndex >= start &&
      line.trim() &&
      !line.startsWith(' '.repeat(indent))
    ));
    if (end < 0) end = lines.length;
  }

  const key = parts[parts.length - 1];
  const keyPattern = new RegExp(`^ {${indent}}${key}:`);
  const lineIndex = lines.findIndex((line, index) => index >= start && index < end && keyPattern.test(line));
  const indentedReplacement = String(replacement || '')
    .split('\n')
    .map((line) => line ? `${' '.repeat(indent)}${line}` : line)
    .join('\n');
  if (lineIndex < 0) {
    lines.splice(end, 0, indentedReplacement);
    return { ok: true, content: lines.join('\n') };
  }
  let blockEnd = lineIndex + 1;
  while (blockEnd < lines.length && (!lines[blockEnd].trim() || lines[blockEnd].startsWith(' '.repeat(indent + 2)))) {
    blockEnd += 1;
  }
  lines.splice(lineIndex, blockEnd - lineIndex, indentedReplacement);
  return { ok: true, content: lines.join('\n') };
}

function replaceYamlScalarAtPath(source, path, value, type = 'string') {
  const parts = String(path || '').split('.').filter(Boolean);
  if (!parts.length) return source;
  const lines = String(source || '').split(/\r?\n/);
  let start = 0;
  let end = lines.length;
  let indent = 0;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    const pattern = new RegExp(`^ {${indent}}${key}:\\s*(?:#.*)?$`);
    const sectionStart = lines.findIndex((line, lineIndex) => lineIndex >= start && lineIndex < end && pattern.test(line));
    if (sectionStart < 0) return { ok: false, error: `Missing settings section: ${parts.slice(0, index + 1).join('.')}` };
    start = sectionStart + 1;
    indent += 2;
    end = lines.findIndex((line, lineIndex) => (
      lineIndex >= start &&
      line.trim() &&
      !line.startsWith(' '.repeat(indent))
    ));
    if (end < 0) end = lines.length;
  }

  const key = parts[parts.length - 1];
  const keyPattern = new RegExp(`^ {${indent}}${key}:`);
  const lineIndex = lines.findIndex((line, index) => index >= start && index < end && keyPattern.test(line));
  const replacement = `${' '.repeat(indent)}${key}: ${yamlAdminValue(value, type)}`;
  if (lineIndex >= 0) {
    lines[lineIndex] = replacement;
  } else {
    lines.splice(end, 0, replacement);
  }
  return { ok: true, content: lines.join('\n') };
}

function yamlAdminListLine(key, values = []) {
  if (!Array.isArray(values) || !values.length) return `${key}: []`;
  return `${key}:\n${values.map((value) => `  - ${yamlQuoteAdminString(value)}`).join('\n')}`;
}

function yamlAdminMaybeLine(lines, key, value, indent = '    ') {
  if (value === '' || value === undefined || value === null) return;
  lines.push(`${indent}${key}: ${yamlAdminValue(value, typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string')}`);
}

function yamlAdminBlockLine(lines, key, value, indent = '    ') {
  const text = String(value || '').trim();
  if (!text) return;
  lines.push(`${indent}${key}: |`);
  text.split(/\r?\n/).forEach((line) => lines.push(`${indent}  ${line}`));
}

function serializeAdminCampaignCollectionYaml(key, items = []) {
  if (!Array.isArray(items) || !items.length) return `${key}: []`;
  const lines = [`${key}:`];
  for (const item of items) {
    if (key === 'diary') {
      lines.push(`  - title: ${yamlQuoteAdminString(item.title)}`);
      yamlAdminMaybeLine(lines, 'date', item.date);
      yamlAdminMaybeLine(lines, 'phase', item.phase);
      if (Array.isArray(item.content) && item.content.length) {
        lines.push('    content:');
        item.content.forEach((block) => {
          serializeAdminContentBlockToYaml(block).split('\n').forEach((line) => {
            lines.push(`    ${line}`);
          });
        });
      } else {
        lines.push('    content:');
        lines.push('      - type: text');
        yamlAdminBlockLine(lines, 'body', item.body, '        ');
      }
      continue;
    }
    if (key === 'stretch_goals') {
      lines.push(`  - threshold: ${Number(item.threshold || 0)}`);
      yamlAdminMaybeLine(lines, 'title', item.title);
      yamlAdminMaybeLine(lines, 'description', item.description);
      yamlAdminMaybeLine(lines, 'status', item.status);
      continue;
    }
    if (key === 'ongoing_items') {
      lines.push(`  - label: ${yamlQuoteAdminString(item.label || '')}`);
      yamlAdminMaybeLine(lines, 'remaining', item.remaining);
      continue;
    }
    lines.push(`  - id: ${yamlQuoteAdminString(item.id)}`);
    if (key === 'tiers') {
      yamlAdminMaybeLine(lines, 'name', item.name);
      yamlAdminMaybeLine(lines, 'price', item.price);
      yamlAdminMaybeLine(lines, 'image', item.image);
      yamlAdminMaybeLine(lines, 'description', item.description);
      yamlAdminMaybeLine(lines, 'limit_total', item.limit_total);
      yamlAdminMaybeLine(lines, 'remaining', item.remaining);
      yamlAdminMaybeLine(lines, 'stackable', item.stackable);
      yamlAdminMaybeLine(lines, 'category', item.category);
      yamlAdminMaybeLine(lines, 'shipping_preset', item.shipping_preset);
      appendAdminShippingPackageYaml(lines, item.shipping, '    ');
      yamlAdminMaybeLine(lines, 'late_support', item.late_support);
      yamlAdminMaybeLine(lines, 'requires_threshold', item.requires_threshold);
      continue;
    }
    if (key === 'support_items') {
      yamlAdminMaybeLine(lines, 'label', item.label);
      yamlAdminMaybeLine(lines, 'need', item.need);
      yamlAdminMaybeLine(lines, 'target', item.target);
      yamlAdminMaybeLine(lines, 'category', item.category);
      yamlAdminMaybeLine(lines, 'shipping_preset', item.shipping_preset);
      yamlAdminMaybeLine(lines, 'late_support', item.late_support);
      continue;
    }
    if (key === 'decisions') {
      yamlAdminMaybeLine(lines, 'type', item.type);
      yamlAdminMaybeLine(lines, 'title', item.title);
      yamlAdminMaybeLine(lines, 'deadline', item.deadline);
      lines.push('    options:');
      for (const option of item.options || []) {
        if (option && typeof option === 'object') {
          lines.push(`      - label: ${yamlQuoteAdminString(option.label)}`);
          yamlAdminMaybeLine(lines, 'image', option.image, '        ');
        } else {
          lines.push(`      - ${yamlQuoteAdminString(option)}`);
        }
      }
      yamlAdminMaybeLine(lines, 'eligible', item.eligible);
      yamlAdminMaybeLine(lines, 'status', item.status);
    }
  }
  return lines.join('\n');
}

function applyAdminCampaignSettingsPatchToMarkdown(source, changes = []) {
  const match = String(source || '').match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n[\s\S]*)?$/);
  if (!match) {
    return { ok: false, error: 'Campaign Markdown must contain YAML front matter.' };
  }

  let frontMatter = match[1];
  changes.forEach((change) => {
    const replacement = change.type === 'campaign_collection'
      ? serializeAdminCampaignCollectionYaml(change.path, change.value)
      : change.type === 'add_on_products'
        ? serializeAdminCampaignAddOnsYaml(change.path, change.value)
      : change.type === 'list'
        ? yamlAdminListLine(change.path, change.value)
        : `${change.path}: ${yamlAdminValue(change.value, change.type)}`;
    frontMatter = replaceAdminFrontMatterBlock(frontMatter, change.path, replacement);
  });

  return {
    ok: true,
    content: `---\n${frontMatter.replace(/\s*$/, '')}\n---${match[2] || '\n'}`
  };
}

function adminUploadSlug(value, fallback = 'upload') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || fallback;
}

function adminUploadTimestamp() {
  return new Date().toISOString()
    .replace(/\.\d{3}Z$/, '')
    .replace(/[-:]/g, '')
    .replace('T', '-');
}

function normalizeAdminUploadCampaignSlug(value) {
  const slug = adminUploadSlug(value, '');
  return slug && isValidSlug(slug) ? slug : '';
}

function adminUploadBaseName(body = {}, extension = '') {
  const kind = String(body.kind || '').trim().toLowerCase();
  const fieldPath = String(body.fieldPath || '').trim();
  const collection = String(body.collection || '').trim();
  const contextName = body.filenameBase || body.contextName || body.name || body.title || body.label || '';
  const contextSlug = adminUploadSlug(contextName || body.filename || 'upload');
  const fieldMap = new Map([
    ['platform.logo_path', 'logo'],
    ['platform.footer_logo_path', 'footer-logo'],
    ['platform.favicon_path', 'favicon'],
    ['platform.default_social_image_path', 'default-social-image'],
    ['creator_image', 'creator'],
    ['hero_image', 'hero-square'],
    ['hero_image_wide', 'hero-wide'],
    ['hero_video', 'video'],
    ['campaign_background', 'background'],
    ['progress_background', 'progress']
  ]);
  if (fieldMap.has(fieldPath)) return fieldMap.get(fieldPath);
  if (kind === 'decision-option') return `decision-option-${contextSlug}`;
  if (kind === 'campaign-add-on') return `add-on-${contextSlug}`;
  if (kind === 'add-on') return `add-on-${contextSlug}`;
  if (kind === 'campaign-item' && collection === 'tiers') return `tier-${contextSlug}`;
  if (kind === 'campaign-item' && collection === 'support_items') return `support-${contextSlug}`;
  if (kind === 'campaign-item' && collection === 'diary') return `diary-${contextSlug}`;
  if (kind === 'campaign-item') return `${adminUploadSlug(collection || 'campaign')}-${contextSlug}`;
  if (kind.includes('video') && extension === 'webm') return `video-${contextSlug}`;
  return contextSlug;
}

function adminUploadDirectory(body = {}, options = {}) {
  const kind = String(body.kind || '').trim().toLowerCase();
  const contentType = String(body.contentType || '').trim().toLowerCase();
  const campaignSlug = normalizeAdminUploadCampaignSlug(body.campaignSlug);
  if (contentType.startsWith('video/')) {
    return campaignSlug ? `assets/videos/campaigns/${campaignSlug}` : 'assets/videos/defaults';
  }
  if (kind === 'add-on') {
    return campaignSlug ? 'assets/images/campaign-add-ons' : 'assets/images/add-ons';
  }
  if (kind === 'campaign-add-on') return 'assets/images/campaign-add-ons';
  if (campaignSlug && (kind.startsWith('campaign') || kind === 'decision-option')) {
    return `assets/images/campaigns/${campaignSlug}`;
  }
  if (kind === 'logo' || kind === 'admin') return 'assets/images/defaults';
  return String(options.directory || 'assets/images/defaults').replace(/\/+$/, '');
}

function adminUploadProcessingSummary(contentType, extension) {
  const isImage = String(contentType || '').startsWith('image/');
  const isVideo = String(contentType || '').startsWith('video/');
  return {
    imageOptimization: isImage ? 'source-preserved' : 'not-image',
    videoTranscoding: isVideo
      ? (extension === 'webm' ? 'already-webm' : 'source-preserved')
      : 'not-video'
  };
}

function normalizeAdminMediaUpload(body = {}, options = {}) {
  const label = options.label || 'Media upload';
  const filename = String(body.filename || options.defaultFilename || 'upload').trim().toLowerCase();
  const contentType = String(body.contentType || '').trim().toLowerCase();
  const content = String(body.content || body.dataBase64 || '').trim();
  const allowedTypes = options.allowedTypes || new Map();
  const extension = allowedTypes.get(contentType);
  if (!extension) {
    return { ok: false, error: options.typeError || `${label} uses an unsupported file type.` };
  }
  const dataUrlMatch = content.match(/^data:([^;]+);base64,/i);
  if (dataUrlMatch && dataUrlMatch[1].toLowerCase() !== contentType) {
    return { ok: false, error: `${label} content type does not match the uploaded file.` };
  }
  const base64 = content.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    return { ok: false, error: `${label} content must be base64 encoded.` };
  }
  const estimatedBytes = Math.floor((base64.length * 3) / 4);
  if (estimatedBytes <= 0) {
    return { ok: false, error: `${label} is empty.` };
  }
  if (estimatedBytes > options.maxFileBytes) {
    return { ok: false, error: options.sizeError || `${label} is too large.` };
  }
  const uploadBaseBody = options.forceDefaultFilename
    ? { ...body, filename, filenameBase: options.defaultFilename || filename }
    : { ...body, filename };
  const safeBase = adminUploadSlug(adminUploadBaseName(uploadBaseBody, extension), options.defaultFilename || 'upload');
  const directory = adminUploadDirectory({ ...body, contentType }, options);
  const filePath = `${directory}/${safeBase}-${adminUploadTimestamp()}.${extension}`;
  return {
    ok: true,
    base64,
    filePath,
    publicPath: `/${filePath}`,
    estimatedBytes,
    contentType,
    processing: adminUploadProcessingSummary(contentType, extension)
  };
}

async function handleAdminMediaUpload(request, env, options = {}) {
  const parsedBody = await parseJsonRequestBody(request, env, {
    maxBytes: options.maxBodyBytes || MAX_ADMIN_LOGO_UPLOAD_BODY_BYTES,
    privateResponse: true,
    emptyValue: {}
  });
  if (!parsedBody.ok) return parsedBody.response;

  const auth = await requireAdminSession(request, env, 'settings:publish', { requireCsrf: true });
  if (!auth.ok) return auth.response;

  const normalized = normalizeAdminMediaUpload(parsedBody.body || {}, options);
  if (!normalized.ok) {
    return privateJsonResponse({ error: normalized.error }, 400, env);
  }

  const uploaded = await putGitHubBase64File(
    env,
    normalized.filePath,
    normalized.base64,
    `Upload ${options.commitLabel || 'admin media'} ${normalized.filePath}`
  );
  if (!uploaded.ok) {
    return privateJsonResponse({
      error: uploaded.error || 'Unable to upload media',
      code: uploaded.code || 'github_upload_failed'
    }, uploaded.status || 502, env);
  }

  return privateJsonResponse({
    success: true,
    path: normalized.publicPath,
    githubPath: normalized.filePath,
    commitSha: uploaded.commitSha,
    commitUrl: uploaded.commitUrl,
    contentType: normalized.contentType,
    bytes: normalized.estimatedBytes,
    processing: normalized.processing,
    writeBudget: adminWriteBudget({ readOnly: false, kvWritesExpected: 0 })
  }, 200, env);
}

function handleAdminLogoUpload(request, env) {
  return handleAdminMediaUpload(request, env, {
    label: 'Logo upload',
    defaultFilename: 'logo',
    forceDefaultFilename: true,
    directory: 'assets/images/defaults',
    maxBodyBytes: MAX_ADMIN_LOGO_UPLOAD_BODY_BYTES,
    maxFileBytes: 512 * 1024,
    allowedTypes: new Map([
      ['image/png', 'png'],
      ['image/jpeg', 'jpg'],
      ['image/webp', 'webp']
    ]),
    typeError: 'Logo upload must be a PNG, JPEG, or WebP image.',
    sizeError: 'Logo upload must be 512 KB or smaller.',
    commitLabel: 'admin logo'
  });
}

function handleAdminImageUpload(request, env) {
  return handleAdminMediaUpload(request, env, {
    label: 'Image upload',
    defaultFilename: 'image',
    directory: 'assets/images/defaults',
    maxBodyBytes: MAX_ADMIN_IMAGE_UPLOAD_BODY_BYTES,
    maxFileBytes: 8 * 1024 * 1024,
    allowedTypes: new Map([
      ['image/png', 'png'],
      ['image/jpeg', 'jpg'],
      ['image/webp', 'webp'],
      ['image/gif', 'gif']
    ]),
    typeError: 'Image upload must be a PNG, JPEG, WebP, or GIF image.',
    sizeError: 'Image upload must be 8 MB or smaller.',
    commitLabel: 'admin image'
  });
}

function handleAdminVideoUpload(request, env) {
  return handleAdminMediaUpload(request, env, {
    label: 'Video upload',
    defaultFilename: 'hero-video',
    directory: 'assets/videos/defaults',
    maxBodyBytes: MAX_ADMIN_VIDEO_UPLOAD_BODY_BYTES,
    maxFileBytes: 100 * 1024 * 1024,
    allowedTypes: new Map([
      ['video/mp4', 'mp4'],
      ['video/webm', 'webm'],
      ['video/quicktime', 'mov']
    ]),
    typeError: 'Video upload must be an MP4, WebM, or MOV file.',
    sizeError: 'Video upload must be 100 MB or smaller.',
    commitLabel: 'admin video'
  });
}

async function handleAdminSettingsPublish(request, env) {
  const parsedBody = await parseJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
    privateResponse: true,
    emptyValue: {}
  });
  if (!parsedBody.ok) return parsedBody.response;

  const result = await validateAdminSettingsChanges(request, env, parsedBody.body || {}, { requireCsrf: true });
  if (!result.ok && result.response) return result.response;
  if (result.errors.length) {
    return privateJsonResponse({
      valid: false,
      errors: result.errors,
      warnings: result.warnings,
      writeBudget: adminReadBudget()
    }, 422, env);
  }
  if (!result.changes.length) {
    return privateJsonResponse({
      success: true,
      published: false,
      message: 'No settings changes to publish.',
      rebuild: { triggered: false, reason: 'No changes' },
      writeBudget: adminWriteBudget({ readOnly: false, kvWritesExpected: 0 })
    }, 200, env);
  }

  const commits = [];
  const platformChanges = result.changes.filter((change) => !change.campaignSlug);
  if (platformChanges.length) {
    const githubFile = await getGitHubTextFile(env, '_config.yml');
    if (!githubFile.ok) {
      return privateJsonResponse({ error: githubFile.error, code: githubFile.code || 'github_error' }, githubFile.status || 502, env);
    }
    let content = githubFile.content;
    for (const change of platformChanges) {
      const applied = change.type === 'add_on_products'
        ? replaceYamlBlockAtPath(content, change.path, serializeAdminAddOnProductsYaml(change.value, ''))
        : change.type === 'list'
          ? replaceYamlBlockAtPath(content, change.path, yamlAdminListLine(change.path.split('.').pop(), change.value))
        : replaceYamlScalarAtPath(content, change.path, change.value, change.type);
      if (!applied.ok) return privateJsonResponse({ error: applied.error }, 422, env);
      content = applied.content;
    }
    const saved = await putGitHubTextFile(env, '_config.yml', content, `Update admin platform settings (${platformChanges.length})`, githubFile.sha);
    if (!saved.ok) return privateJsonResponse({ error: saved.error, code: saved.code || 'github_error' }, saved.status || 502, env);
    commits.push(saved);
  }

  const campaignGroups = new Map();
  result.changes.filter((change) => change.campaignSlug).forEach((change) => {
    const group = campaignGroups.get(change.campaignSlug) || [];
    group.push(change);
    campaignGroups.set(change.campaignSlug, group);
  });
  for (const [campaignSlug, changes] of campaignGroups.entries()) {
    const filePath = getAdminCampaignMarkdownPath(campaignSlug);
    const githubFile = await getGitHubTextFile(env, filePath);
    if (!githubFile.ok) {
      return privateJsonResponse({ error: githubFile.error, code: githubFile.code || 'github_error' }, githubFile.status || 502, env);
    }
    const applied = applyAdminCampaignSettingsPatchToMarkdown(githubFile.content, changes);
    if (!applied.ok) return privateJsonResponse({ error: applied.error }, 422, env);
    const saved = await putGitHubTextFile(env, filePath, applied.content, `Update ${campaignSlug} admin settings (${changes.length})`, githubFile.sha);
    if (!saved.ok) return privateJsonResponse({ error: saved.error, code: saved.code || 'github_error' }, saved.status || 502, env);
    commits.push(saved);
  }

  const rebuild = await triggerSiteRebuild(env, 'admin-settings-publish');
  return privateJsonResponse({
    success: true,
    published: true,
    changeCount: result.changes.length,
    commits,
    rebuild,
    deployNotice: 'Publishing commits changes to GitHub and starts a deploy. Changes may take a few minutes to appear.',
    writeBudget: adminWriteBudget({ readOnly: false, kvWritesExpected: 0 })
  }, 200, env);
}

function adminWriteBudget({ readOnly = true, kvWritesExpected = 0, kvListExpected } = {}) {
  const budget = {
    readOnly: Boolean(readOnly),
    kvWritesExpected: Number(kvWritesExpected || 0)
  };
  if (kvListExpected !== undefined) {
    budget.kvListExpected = Number(kvListExpected || 0);
  }
  return budget;
}

function adminReadBudget({ kvListExpected = 0 } = {}) {
  return adminWriteBudget({ readOnly: true, kvWritesExpected: 0, kvListExpected });
}

function adminIndexRequiredResponse(env, {
  error = 'Campaign pledge index is required for this admin operation',
  campaignSlug = '',
  readOnly = true,
  kvListExpected = 0,
  extra = {}
} = {}) {
  return privateJsonResponse({
    error,
    code: 'campaign_index_required',
    campaignSlug,
    writeBudget: adminWriteBudget({ readOnly, kvWritesExpected: 0, kvListExpected }),
    ...extra
  }, 409, env);
}

function clampAdminPageLimit(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 25;
  return Math.min(parsed, 100);
}

function getPledgeDisplayName(pledge = {}) {
  return String(
    pledge?.shippingAddress?.name ||
    pledge?.billingAddress?.name ||
    ''
  ).trim();
}

function getPledgeStatusLabel(pledge = {}) {
  const rawStatus = String(pledge?.pledgeStatus || 'active').trim().toLowerCase();
  if (pledge?.charged === true) return 'charged';
  return rawStatus || 'active';
}

function hasPhysicalReward(pledge = {}) {
  if (pledge?.shippingAddress) return true;
  const addOns = Array.isArray(pledge?.bundleAddOns) ? pledge.bundleAddOns : [];
  return addOns.some((addOn) => String(addOn?.category || '').trim().toLowerCase() === 'physical');
}

function hasPlatformAddOns(pledge = {}) {
  const addOns = Array.isArray(pledge?.bundleAddOns) ? pledge.bundleAddOns : [];
  return addOns.some((addOn) => !isCampaignScopedBundleAddOn(addOn));
}

function pledgeMatchesAdminSupporterFilters(pledge = {}, filters = {}) {
  const status = getPledgeStatusLabel(pledge);
  if (filters.status && filters.status !== 'all' && status !== filters.status) {
    return false;
  }

  if (filters.fulfillment === 'physical' && !hasPhysicalReward(pledge)) {
    return false;
  }
  if (filters.fulfillment === 'digital' && hasPhysicalReward(pledge)) {
    return false;
  }
  if (filters.fulfillment === 'platform_addons' && !hasPlatformAddOns(pledge)) {
    return false;
  }

  if (filters.query) {
    const haystack = [
      pledge?.email,
      pledge?.orderId,
      getPledgeDisplayName(pledge)
    ].join(' ').toLowerCase();
    if (!haystack.includes(filters.query)) {
      return false;
    }
  }

  return true;
}

function publicAdminSupporterRecord(pledge = {}) {
  return {
    orderId: String(pledge?.orderId || ''),
    campaignSlug: String(pledge?.campaignSlug || ''),
    email: String(pledge?.email || ''),
    displayName: getPledgeDisplayName(pledge),
    pledgeStatus: getPledgeStatusLabel(pledge),
    amount: Number(pledge?.amount || 0),
    subtotal: Number(pledge?.subtotal || 0),
    tax: Number(pledge?.tax || 0),
    shipping: Number(pledge?.shipping || 0),
    tipAmount: Number(pledge?.tipAmount || 0),
    preferredLang: normalizePreferredLang(pledge?.preferredLang, DEFAULT_I18N_LANG),
    hasPhysicalReward: hasPhysicalReward(pledge),
    hasPlatformAddOns: hasPlatformAddOns(pledge),
    createdAt: pledge?.createdAt || null,
    updatedAt: pledge?.updatedAt || null,
    chargedAt: pledge?.chargedAt || null
  };
}

function emptyAdminAnalyticsTotals() {
  return {
    campaignCount: 0,
    indexedPledgeCount: 0,
    pledgeCount: 0,
    uniqueSupporters: 0,
    activePledgeCount: 0,
    chargedPledgeCount: 0,
    cancelledPledgeCount: 0,
    paymentFailedPledgeCount: 0,
    pledgedAmount: 0,
    chargedAmount: 0,
    paymentFailedAmount: 0,
    campaignRevenue: 0,
    campaignAddOnRevenue: 0,
    platformAddOnRevenue: 0,
    platformTipRevenue: 0,
    taxTotal: 0,
    shippingTotal: 0,
    estimatedStripeFeeAmount: 0,
    estimatedStripeFeePledgeCount: 0,
    physicalPledgeCount: 0,
    physicalPledgeAmount: 0,
    digitalPledgeCount: 0,
    digitalPledgeAmount: 0,
    platformAddOnPledgeCount: 0
  };
}

const ADMIN_STRIPE_FEE_ESTIMATE_BPS = 290;
const ADMIN_STRIPE_FEE_ESTIMATE_FIXED_CENTS = 30;

function estimateAdminStripeFeeCents(amountCents) {
  const amount = Number(amountCents || 0) || 0;
  if (amount <= 0) return 0;
  return Math.round((amount * ADMIN_STRIPE_FEE_ESTIMATE_BPS) / 10000) + ADMIN_STRIPE_FEE_ESTIMATE_FIXED_CENTS;
}

function incrementAdminAnalyticsBreakdown(map, key, amount = 0) {
  const normalizedKey = String(key || '').trim() || 'unknown';
  const current = map.get(normalizedKey) || { key: normalizedKey, count: 0, amount: 0 };
  current.count += 1;
  current.amount += Number(amount || 0);
  map.set(normalizedKey, current);
}

function mapAdminAnalyticsBreakdown(map) {
  return Array.from(map.values()).sort((a, b) => (
    b.count - a.count ||
    b.amount - a.amount ||
    a.key.localeCompare(b.key)
  ));
}

function getAdminReferralKey(pledge = {}) {
  const raw = String(
    pledge?.referralCode ||
    pledge?.referral ||
    pledge?.ref ||
    pledge?.attribution?.ref ||
    pledge?.marketing?.ref ||
    ''
  ).trim();
  return normalizeAdminReferralCode(raw) || 'direct';
}

function getAdminUtmSourceKey(pledge = {}) {
  return String(
    pledge?.utmSource ||
    pledge?.utm?.source ||
    pledge?.attribution?.utmSource ||
    pledge?.marketing?.utmSource ||
    ''
  ).trim() || 'none';
}

function applyPledgeToAdminAnalytics(analytics, campaign, pledge = {}, supporterEmails) {
  const campaignSlug = String(campaign?.slug || pledge?.campaignSlug || '');
  const status = getPledgeStatusLabel(pledge);
  const subtotal = Number(pledge?.subtotal || 0) || 0;
  const amount = Number(pledge?.amount || 0) || 0;
  const bundleAddOns = Array.isArray(pledge?.bundleAddOns) ? pledge.bundleAddOns : [];
  const platformAddOnRevenue = getPlatformBundleAddOnSubtotal(bundleAddOns);
  const campaignAddOnRevenue = getCampaignBundleAddOnSubtotal(bundleAddOns, campaignSlug);
  const campaignRevenue = Math.max(0, subtotal - platformAddOnRevenue);
  const isCancelled = status === 'cancelled';
  const countsTowardPledged = !isCancelled;
  const countsTowardStripeFeeEstimate = status === 'active' || status === 'charged';

  analytics.totals.pledgeCount += 1;
  if (countsTowardPledged) {
    analytics.totals.activePledgeCount += status === 'active' || status === 'charged' ? 1 : 0;
    analytics.totals.pledgedAmount += amount;
    analytics.totals.campaignRevenue += campaignRevenue;
    analytics.totals.campaignAddOnRevenue += campaignAddOnRevenue;
    analytics.totals.platformAddOnRevenue += platformAddOnRevenue;
    analytics.totals.platformTipRevenue += Number(pledge?.tipAmount || 0) || 0;
    analytics.totals.taxTotal += Number(pledge?.tax || 0) || 0;
    analytics.totals.shippingTotal += Number(pledge?.shipping || 0) || 0;
  } else {
    analytics.totals.cancelledPledgeCount += 1;
  }

  if (countsTowardStripeFeeEstimate) {
    analytics.totals.estimatedStripeFeePledgeCount += 1;
    analytics.totals.estimatedStripeFeeAmount += estimateAdminStripeFeeCents(amount);
  }

  if (status === 'charged') {
    analytics.totals.chargedPledgeCount += 1;
    analytics.totals.chargedAmount += amount;
  }
  if (status === 'payment_failed') {
    analytics.totals.paymentFailedPledgeCount += 1;
    analytics.totals.paymentFailedAmount += amount;
  }

  if (hasPhysicalReward(pledge)) {
    analytics.totals.physicalPledgeCount += 1;
    if (countsTowardPledged) analytics.totals.physicalPledgeAmount += amount;
  } else {
    analytics.totals.digitalPledgeCount += 1;
    if (countsTowardPledged) analytics.totals.digitalPledgeAmount += amount;
  }
  if (hasPlatformAddOns(pledge)) {
    analytics.totals.platformAddOnPledgeCount += 1;
  }

  const normalizedEmail = String(pledge?.email || '').trim().toLowerCase();
  if (normalizedEmail) {
    supporterEmails.add(normalizedEmail);
  }

  incrementAdminAnalyticsBreakdown(analytics.statusBreakdown, status, amount);
  incrementAdminAnalyticsBreakdown(
    analytics.languageBreakdown,
    normalizePreferredLang(pledge?.preferredLang, DEFAULT_I18N_LANG),
    amount
  );
  incrementAdminAnalyticsBreakdown(analytics.referralBreakdown, getAdminReferralKey(pledge), amount);
  incrementAdminAnalyticsBreakdown(analytics.utmSourceBreakdown, getAdminUtmSourceKey(pledge), amount);
}

async function buildAdminCampaignAnalytics(env, campaign) {
  const campaignSlug = String(campaign?.slug || '').trim();
  const orderIds = await getCampaignOrderIds(env, campaignSlug);
  const normalizedOrderIds = Array.isArray(orderIds) ? orderIds : [];

  const analytics = {
    slug: campaignSlug,
    title: campaign?.title || campaignSlug,
    state: campaign?.state || 'unknown',
    effectiveState: getEffectiveState(campaign) || campaign?.state || 'unknown',
    goalAmount: Number(campaign?.goal_amount || 0),
    indexedPledgeCount: normalizedOrderIds.length,
    totals: emptyAdminAnalyticsTotals(),
    statusBreakdown: new Map(),
    languageBreakdown: new Map(),
    referralBreakdown: new Map(),
    utmSourceBreakdown: new Map(),
    pledgeIndexPresent: Array.isArray(orderIds)
  };
  analytics.totals.campaignCount = 1;
  analytics.totals.indexedPledgeCount = normalizedOrderIds.length;

  const supporterEmails = new Set();
  for (const orderId of normalizedOrderIds) {
    const normalizedOrderId = String(orderId || '').trim();
    if (!normalizedOrderId) continue;
    const pledge = await env.PLEDGES.get(`pledge:${normalizedOrderId}`, { type: 'json' });
    if (!pledge || String(pledge?.campaignSlug || '') !== campaignSlug) continue;
    applyPledgeToAdminAnalytics(analytics, campaign, pledge, supporterEmails);
  }
  analytics.totals.uniqueSupporters = supporterEmails.size;

  return {
    ok: true,
    supporterEmails: Array.from(supporterEmails),
    analytics: {
      slug: analytics.slug,
      title: analytics.title,
      state: analytics.state,
      effectiveState: analytics.effectiveState,
      goalAmount: analytics.goalAmount,
      indexedPledgeCount: analytics.indexedPledgeCount,
      pledgeIndexPresent: analytics.pledgeIndexPresent,
      totals: analytics.totals,
      statusBreakdown: mapAdminAnalyticsBreakdown(analytics.statusBreakdown),
      languageBreakdown: mapAdminAnalyticsBreakdown(analytics.languageBreakdown),
      referralBreakdown: mapAdminAnalyticsBreakdown(analytics.referralBreakdown),
      utmSourceBreakdown: mapAdminAnalyticsBreakdown(analytics.utmSourceBreakdown)
    }
  };
}

function mergeAdminAnalyticsTotals(target, source) {
  for (const key of Object.keys(target)) {
    if (key === 'campaignCount' || key === 'uniqueSupporters') continue;
    target[key] += Number(source?.[key] || 0);
  }
}

function mergeAdminAnalyticsBreakdowns(target, rows) {
  for (const row of rows || []) {
    const current = target.get(row.key) || { key: row.key, count: 0, amount: 0 };
    current.count += Number(row.count || 0);
    current.amount += Number(row.amount || 0);
    target.set(row.key, current);
  }
}

function adminAnalyticsHasReferralCodes(campaignAnalytics = {}) {
  return (campaignAnalytics.referralBreakdown || []).some((row) => {
    const code = normalizeAdminReferralCode(row?.key);
    return code && code !== 'direct';
  });
}

async function readAdminAnalyticsReferralLabels(env, campaignAnalytics = []) {
  const labels = {};
  const conflicts = new Set();
  for (const campaign of campaignAnalytics || []) {
    const campaignSlug = String(campaign?.slug || '').trim();
    if (!campaignSlug || !adminAnalyticsHasReferralCodes(campaign)) continue;
    const referrals = await readAdminMarketingReferrals(env, campaignSlug);
    for (const row of referrals) {
      const code = normalizeAdminReferralCode(row?.code);
      const label = String(row?.referrer || row?.name || '').trim();
      if (!code || !label || conflicts.has(code)) continue;
      if (labels[code] && labels[code] !== label) {
        delete labels[code];
        conflicts.add(code);
        continue;
      }
      labels[code] = label;
    }
  }
  return labels;
}

async function handleAdminAnalytics(request, env) {
  const url = new URL(request.url);
  const requestedCampaignSlug = String(url.searchParams.get('campaignSlug') || '').trim();
  const allCampaignsRequested = !requestedCampaignSlug || requestedCampaignSlug.toLowerCase() === 'all';
  const auth = await requireAdminSession(request, env, 'campaign:read', {
    campaignSlug: allCampaignsRequested ? '' : requestedCampaignSlug
  });
  if (!auth.ok) return auth.response;

  const { campaigns } = await getCampaigns(env);
  const allowedCampaigns = (campaigns || []).filter((campaign) => (
    auth.user.role === 'super_admin' ||
    auth.user.campaignSlugs.includes(String(campaign?.slug || ''))
  ));
  const selectedCampaigns = allCampaignsRequested
    ? allowedCampaigns
    : requestedCampaignSlug
    ? allowedCampaigns.filter((campaign) => String(campaign?.slug || '') === requestedCampaignSlug)
    : allowedCampaigns;

  if (!allCampaignsRequested && selectedCampaigns.length === 0) {
    return privateJsonResponse({ error: 'Campaign not found' }, 404, env);
  }

  const campaignAnalytics = [];
  const supporterEmails = new Set();
  for (const campaign of selectedCampaigns) {
    const built = await buildAdminCampaignAnalytics(env, campaign);
    for (const email of built.supporterEmails || []) {
      supporterEmails.add(email);
    }
    campaignAnalytics.push(built.analytics);
  }
  const missingCampaigns = campaignAnalytics
    .filter((campaign) => campaign.pledgeIndexPresent === false)
    .map((campaign) => ({ slug: campaign.slug, title: campaign.title }));

  const totals = emptyAdminAnalyticsTotals();
  totals.campaignCount = campaignAnalytics.length;
  totals.uniqueSupporters = supporterEmails.size;
  const statusBreakdown = new Map();
  const languageBreakdown = new Map();
  const referralBreakdown = new Map();
  const utmSourceBreakdown = new Map();
  for (const campaign of campaignAnalytics) {
    mergeAdminAnalyticsTotals(totals, campaign.totals);
    mergeAdminAnalyticsBreakdowns(statusBreakdown, campaign.statusBreakdown);
    mergeAdminAnalyticsBreakdowns(languageBreakdown, campaign.languageBreakdown);
    mergeAdminAnalyticsBreakdowns(referralBreakdown, campaign.referralBreakdown);
    mergeAdminAnalyticsBreakdowns(utmSourceBreakdown, campaign.utmSourceBreakdown);
  }
  const referralLabels = await readAdminAnalyticsReferralLabels(env, campaignAnalytics);

  return privateJsonResponse({
    user: auth.user,
    scope: allCampaignsRequested ? 'portfolio' : 'campaign',
    campaignSlug: allCampaignsRequested ? null : requestedCampaignSlug,
    totals,
    campaigns: campaignAnalytics,
    missingCampaigns,
    statusBreakdown: mapAdminAnalyticsBreakdown(statusBreakdown),
    languageBreakdown: mapAdminAnalyticsBreakdown(languageBreakdown),
    referralBreakdown: mapAdminAnalyticsBreakdown(referralBreakdown),
    referralLabels,
    utmSourceBreakdown: mapAdminAnalyticsBreakdown(utmSourceBreakdown),
    writeBudget: adminReadBudget(),
    generatedAt: new Date().toISOString()
  }, 200, env);
}

function adminMarketingReferralKey(campaignSlug) {
  return `admin-marketing-referrals:${campaignSlug}`;
}

function normalizeAdminReferralCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function adminMarketingReferralAllowedOrigins(env) {
  return [env?.SITE_BASE, env?.CANONICAL_SITE_BASE]
    .map((value) => {
      try {
        return value ? new URL(String(value)).origin : '';
      } catch {
        return '';
      }
    })
    .filter(Boolean);
}

function normalizeAdminMarketingReferralUrl(value, env, campaignSlug) {
  const raw = String(value || '').trim().slice(0, 2048);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    const allowedOrigins = adminMarketingReferralAllowedOrigins(env);
    if (allowedOrigins.length > 0 && !allowedOrigins.includes(url.origin)) return '';
    const expectedPath = `/campaigns/${encodeURIComponent(campaignSlug)}/`;
    const expectedSpanishPath = `/es/campaigns/${encodeURIComponent(campaignSlug)}/`;
    if (url.pathname !== expectedPath && url.pathname !== expectedSpanishPath) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function publicAdminMarketingReferral(record = {}) {
  const referrer = String(record.referrer || record.name || '');
  return {
    code: String(record.code || ''),
    name: referrer,
    referrer,
    url: String(record.url || ''),
    campaignSlug: String(record.campaignSlug || ''),
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
    createdBy: String(record.createdBy || '')
  };
}

async function readAdminMarketingReferrals(env, campaignSlug) {
  const rows = await env.PLEDGES.get(adminMarketingReferralKey(campaignSlug), { type: 'json' });
  return Array.isArray(rows)
    ? rows.map(publicAdminMarketingReferral).filter((row) => row.code)
    : [];
}

async function handleAdminMarketingReferrals(request, env) {
  const url = new URL(request.url);
  const campaignSlug = String(url.searchParams.get('campaignSlug') || '').trim();
  const scoped = await getRoleScopedAdminCampaign(request, env, campaignSlug, 'campaign:read');
  if (!scoped.ok) return scoped.response;
  const referrals = await readAdminMarketingReferrals(env, campaignSlug);
  return privateJsonResponse({
    user: scoped.auth.user,
    campaignSlug,
    referrals,
    writeBudget: adminReadBudget()
  }, 200, env);
}

async function handleAdminMarketingReferralSave(request, env, body = {}) {
  const campaignSlug = String(body.campaignSlug || '').trim();
  const scoped = await getRoleScopedAdminCampaign(request, env, campaignSlug, 'marketing:send', { requireCsrf: true });
  if (!scoped.ok) return scoped.response;

  const code = normalizeAdminReferralCode(body.code);
  const originalCode = normalizeAdminReferralCode(body.originalCode);
  const normalizedReferrer = normalizeAdminPlainText(body.referrer || body.name || '', 'Referrer name', { maxLength: 120 });
  if (!normalizedReferrer.ok) {
    return privateJsonResponse({ error: normalizedReferrer.error }, 400, env);
  }
  const referrer = normalizedReferrer.value;
  const url = normalizeAdminMarketingReferralUrl(body.url, env, campaignSlug);
  if (!code || !referrer || !url) {
    return privateJsonResponse({ error: 'Referral code, referrer name, and campaign URL are required.' }, 400, env);
  }

  const now = new Date().toISOString();
  const referrals = await readAdminMarketingReferrals(env, campaignSlug);
  const originalIndex = originalCode ? referrals.findIndex((row) => row.code === originalCode) : -1;
  const codeIndex = referrals.findIndex((row) => row.code === code);
  if (originalIndex >= 0 && codeIndex >= 0 && codeIndex !== originalIndex) {
    return privateJsonResponse({ error: 'That referral code is already saved for this campaign.' }, 409, env);
  }
  const existingIndex = originalIndex >= 0 ? originalIndex : codeIndex;
  const nextRecord = {
    code,
    name: referrer,
    referrer,
    url,
    campaignSlug,
    createdAt: existingIndex >= 0 ? referrals[existingIndex].createdAt || now : now,
    updatedAt: now,
    createdBy: existingIndex >= 0 ? referrals[existingIndex].createdBy || scoped.auth.user.email : scoped.auth.user.email
  };
  if (existingIndex >= 0) {
    referrals[existingIndex] = nextRecord;
  } else {
    referrals.unshift(nextRecord);
  }
  referrals.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  await env.PLEDGES.put(adminMarketingReferralKey(campaignSlug), JSON.stringify(referrals.map(publicAdminMarketingReferral)));

  return privateJsonResponse({
    user: scoped.auth.user,
    campaignSlug,
    referral: publicAdminMarketingReferral(nextRecord),
    referrals: referrals.map(publicAdminMarketingReferral)
  }, 200, env);
}

async function handleAdminMarketingReferralDelete(request, env, body = {}) {
  const campaignSlug = String(body.campaignSlug || '').trim();
  const scoped = await getRoleScopedAdminCampaign(request, env, campaignSlug, 'marketing:send', { requireCsrf: true });
  if (!scoped.ok) return scoped.response;

  const code = normalizeAdminReferralCode(body.code);
  if (!code) {
    return privateJsonResponse({ error: 'Referral code is required.' }, 400, env);
  }

  const referrals = await readAdminMarketingReferrals(env, campaignSlug);
  const nextReferrals = referrals.filter((row) => row.code !== code);
  if (nextReferrals.length === referrals.length) {
    return privateJsonResponse({ error: 'Referral code not found.' }, 404, env);
  }
  if (nextReferrals.length === 0) {
    await env.PLEDGES.delete(adminMarketingReferralKey(campaignSlug));
  } else {
    await env.PLEDGES.put(adminMarketingReferralKey(campaignSlug), JSON.stringify(nextReferrals.map(publicAdminMarketingReferral)));
  }

  return privateJsonResponse({
    user: scoped.auth.user,
    campaignSlug,
    deletedCode: code,
    referrals: nextReferrals.map(publicAdminMarketingReferral)
  }, 200, env);
}

const ADMIN_CONTENT_ALLOWED_BLOCK_TYPES = new Set([
  'text',
  'video',
  'image',
  'gallery',
  'audio',
  'embed',
  'divider',
  'quote'
]);
const ADMIN_CONTENT_ALLOWED_EMBED_PROVIDERS = new Set(['spotify', 'youtube', 'vimeo']);
const ADMIN_CONTENT_ALLOWED_VIDEO_PROVIDERS = new Set(['youtube', 'vimeo', 'local']);
const ADMIN_CONTENT_ALLOWED_INLINE_TAGS = new Set(['b', 'br', 'em', 'i', 'strong', 'u']);
const ADMIN_CONTENT_ALLOWED_ALIGNMENTS = new Set(['left', 'center', 'right', 'justify']);
const ADMIN_CONTENT_ALLOWED_GALLERY_LAYOUTS = new Set(['grid', 'carousel']);
const ADMIN_CONTENT_ALLOWED_GALLERY_CAPTION_STYLES = new Set(['inline', 'overlay']);
const ADMIN_CONTENT_MAX_TEXT_LENGTH = 8000;
const ADMIN_CONTENT_MAX_BLOCKS = 40;
const ADMIN_CONTENT_MAX_GALLERY_IMAGES = 12;

function escapeAdminPreviewHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAdminPreviewAttribute(value) {
  return escapeAdminPreviewHtml(value).replace(/`/g, '&#96;');
}

function sanitizeAdminRichText(value, errors, fieldName) {
  const normalized = collectAdminRichTextErrors(value, fieldName, { maxLength: ADMIN_CONTENT_MAX_TEXT_LENGTH });
  errors.push(...normalized.errors);
  return normalized.text.replace(/<\s*\/?\s*([a-z0-9]+)(?:\s[^>]*)?>/ig, (match, tagName) => {
    const tag = String(tagName || '').toLowerCase();
    if (ADMIN_CONTENT_ALLOWED_INLINE_TAGS.has(tag)) {
      const closing = /^<\s*\//.test(match) ? '/' : '';
      return `__POOL_INLINE_${closing}${tag}__`;
    }
    return '';
  });
}

function restoreAdminPreviewInlineTags(value) {
  return String(value || '')
    .replace(/__POOL_INLINE_br__/g, '<br>')
    .replace(/__POOL_INLINE_em__/g, '<em>')
    .replace(/__POOL_INLINE_\/em__/g, '</em>')
    .replace(/__POOL_INLINE_strong__/g, '<strong>')
    .replace(/__POOL_INLINE_\/strong__/g, '</strong>')
    .replace(/__POOL_INLINE_i__/g, '<i>')
    .replace(/__POOL_INLINE_\/i__/g, '</i>')
    .replace(/__POOL_INLINE_b__/g, '<b>')
    .replace(/__POOL_INLINE_\/b__/g, '</b>')
    .replace(/__POOL_INLINE_u__/g, '<u>')
    .replace(/__POOL_INLINE_\/u__/g, '</u>');
}

function isAdminPreviewAllowedLink(href) {
  const normalized = String(href || '').trim();
  if (!normalized) return false;
  if (normalized.startsWith('../')) return false;
  if (normalized.startsWith('#') || normalized.startsWith('/') || normalized.startsWith('?') || normalized.startsWith('./')) {
    return true;
  }
  try {
    const parsed = new URL(normalized);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function renderAdminPreviewInlineMarkdown(value, errors, fieldName) {
  let html = escapeAdminPreviewHtml(sanitizeAdminRichText(value, errors, fieldName));
  html = restoreAdminPreviewInlineTags(html);
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  html = html.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
    const safeLabel = String(label || '');
    const safeHref = String(href || '').trim();
    if (!isAdminPreviewAllowedLink(safeHref)) {
      errors.push(`${fieldName} includes an unsafe link URL.`);
      return safeLabel;
    }
    let attrs = `href="${escapeAdminPreviewAttribute(safeHref)}"`;
    if (/^https?:\/\//i.test(safeHref)) {
      attrs += ' target="_blank" rel="noopener noreferrer"';
    }
    return `<a ${attrs}>${safeLabel}</a>`;
  });
  return html;
}

function renderAdminPreviewTextBlock(body, errors, fieldName) {
  const lines = String(body || '').split(/\r?\n/);
  const chunks = [];
  let paragraph = [];
  let listItems = [];
  let listTag = 'ul';
  function flushParagraph() {
    if (!paragraph.length) return;
    chunks.push(`<p>${renderAdminPreviewInlineMarkdown(paragraph.join(' '), errors, fieldName)}</p>`);
    paragraph = [];
  }
  function flushList() {
    if (!listItems.length) return;
    const items = listItems.map((item) => `<li>${renderAdminPreviewInlineMarkdown(item, errors, fieldName)}</li>`).join('');
    chunks.push(`<${listTag}>${items}</${listTag}>`);
    listItems = [];
    listTag = 'ul';
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = trimmed.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(4, Math.max(2, heading[1].length));
      chunks.push(`<h${level}>${renderAdminPreviewInlineMarkdown(heading[2], errors, fieldName)}</h${level}>`);
      continue;
    }
    const unorderedListItem = trimmed.match(/^[-*]\s+(.+)$/);
    if (unorderedListItem) {
      flushParagraph();
      if (listItems.length && listTag !== 'ul') flushList();
      listTag = 'ul';
      listItems.push(unorderedListItem[1]);
      continue;
    }
    const orderedListItem = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (orderedListItem) {
      flushParagraph();
      if (listItems.length && listTag !== 'ol') flushList();
      listTag = 'ol';
      listItems.push(orderedListItem[1]);
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }
  flushParagraph();
  flushList();
  return chunks.join('\n');
}

function normalizeAdminContentAlignment(value) {
  const align = String(value || '').trim().toLowerCase();
  return ADMIN_CONTENT_ALLOWED_ALIGNMENTS.has(align) ? align : 'left';
}

function normalizeAdminContentGalleryLayout(value) {
  const layout = String(value || '').trim().toLowerCase();
  return ADMIN_CONTENT_ALLOWED_GALLERY_LAYOUTS.has(layout) ? layout : 'grid';
}

function normalizeAdminContentGalleryCaptionStyle(value) {
  const style = String(value || '').trim().toLowerCase();
  return ADMIN_CONTENT_ALLOWED_GALLERY_CAPTION_STYLES.has(style) ? style : 'inline';
}

function normalizeAdminContentVideoProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  return ADMIN_CONTENT_ALLOWED_VIDEO_PROVIDERS.has(provider) ? provider : 'youtube';
}

function adminContentVideoType(src) {
  const path = String(src || '');
  if (/\.webm(?:[?#].*)?$/i.test(path)) return 'video/webm';
  if (/\.mp4(?:[?#].*)?$/i.test(path)) return 'video/mp4';
  if (/\.mov(?:[?#].*)?$/i.test(path)) return 'video/quicktime';
  return '';
}

function adminContentAlignClass(block) {
  return ` admin-content-preview__block--align-${normalizeAdminContentAlignment(block?.align)}`;
}

function normalizeAdminContentRichText(value, fieldName, errors, { required = false, maxLength = ADMIN_CONTENT_MAX_TEXT_LENGTH } = {}) {
  const normalized = normalizeAdminRichTextStorageValue(value, fieldName, { required, maxLength });
  if (!normalized.ok) {
    errors.push(normalized.error);
    return stripAdminControlCharacters(value, { allowNewlines: true }).trim();
  }
  return normalized.value;
}

function normalizeAdminContentPlainText(value, fieldName, errors, { required = false, maxLength = 500 } = {}) {
  const normalized = normalizeAdminPlainText(value, fieldName, { maxLength });
  if (!normalized.ok) {
    errors.push(normalized.error);
    return stripAdminControlCharacters(value).trim();
  }
  if (required && !normalized.value) errors.push(`${fieldName} is required.`);
  return normalized.value;
}

function normalizeAdminContentAsset(value, fieldName, errors, { required = false } = {}) {
  const normalized = normalizeAdminAssetReference(value, fieldName);
  if (!normalized.ok) {
    errors.push(normalized.error);
    return stripAdminControlCharacters(value).trim();
  }
  if (required && !normalized.value) errors.push(`${fieldName} is required.`);
  return normalized.value;
}

function isApprovedAdminEmbedSrc(provider, src) {
  try {
    const parsed = new URL(String(src || '').trim());
    if (parsed.protocol !== 'https:') return false;
    if (provider === 'spotify') return parsed.host === 'open.spotify.com' && parsed.pathname.startsWith('/embed/');
    if (provider === 'youtube') {
      return (parsed.host === 'www.youtube.com' || parsed.host === 'www.youtube-nocookie.com') && parsed.pathname.startsWith('/embed/');
    }
    if (provider === 'vimeo') return parsed.host === 'player.vimeo.com' && parsed.pathname.startsWith('/video/');
  } catch {
    return false;
  }
  return false;
}

function validateAdminContentBlock(block, index, errors, warnings) {
  const path = `longContent[${index}]`;
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    errors.push(`${path} must be an object.`);
    return null;
  }

  const type = String(block.type || '').trim();
  if (!ADMIN_CONTENT_ALLOWED_BLOCK_TYPES.has(type)) {
    errors.push(`${path}.type is not supported.`);
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(block, 'html')) {
    errors.push(`${path}.html is not allowed; use structured blocks instead.`);
  }

  if (type === 'text') {
    return {
      type,
      body: normalizeAdminContentRichText(block.body || '', `${path}.body`, errors, { required: true }),
      align: normalizeAdminContentAlignment(block.align)
    };
  }

  if (type === 'video') {
    const provider = String(block.provider || '').trim().toLowerCase();
    if (!ADMIN_CONTENT_ALLOWED_VIDEO_PROVIDERS.has(provider)) errors.push(`${path}.provider must be youtube, vimeo, or local.`);
    const normalizedProvider = normalizeAdminContentVideoProvider(provider);
    const videoId = normalizedProvider === 'local' ? '' : stripAdminControlCharacters(block.video_id || '').trim();
    if (normalizedProvider !== 'local' && !videoId) errors.push(`${path}.video_id is required.`);
    if (videoId && !/^[A-Za-z0-9_-]{3,128}$/.test(videoId)) errors.push(`${path}.video_id contains unsafe characters.`);
    const src = normalizedProvider === 'local'
      ? normalizeAdminContentAsset(block.src || '', `${path}.src`, errors, { required: true })
      : '';
    const poster = normalizedProvider === 'local' && block.poster
      ? normalizeAdminContentAsset(block.poster || '', `${path}.poster`, errors)
      : '';
    return {
      type,
      provider: normalizedProvider,
      ...(normalizedProvider === 'local' ? { src, ...(poster ? { poster } : {}) } : { video_id: videoId }),
      caption: normalizeAdminContentRichText(block.caption || '', `${path}.caption`, errors, { maxLength: 1000 }),
      align: normalizeAdminContentAlignment(block.align)
    };
  }

  if (type === 'image') {
    const src = normalizeAdminContentAsset(block.src || '', `${path}.src`, errors, { required: true });
    const alt = normalizeAdminContentPlainText(block.alt || '', `${path}.alt`, errors, { maxLength: 300 });
    if (!alt.trim()) warnings.push(`${path}.alt should describe the image.`);
    return {
      type,
      src,
      alt,
      caption: normalizeAdminContentRichText(block.caption || '', `${path}.caption`, errors, { maxLength: 1000 }),
      align: normalizeAdminContentAlignment(block.align)
    };
  }

  if (type === 'gallery') {
    const images = Array.isArray(block.images) ? block.images.slice(0, ADMIN_CONTENT_MAX_GALLERY_IMAGES) : [];
    if (!Array.isArray(block.images) || block.images.length === 0) errors.push(`${path}.images must include at least one image.`);
    if (Array.isArray(block.images) && block.images.length > ADMIN_CONTENT_MAX_GALLERY_IMAGES) warnings.push(`${path}.images was limited to ${ADMIN_CONTENT_MAX_GALLERY_IMAGES} images for preview.`);
    return {
      type,
      layout: normalizeAdminContentGalleryLayout(block.layout),
      caption_style: normalizeAdminContentGalleryCaptionStyle(block.caption_style),
      images: images.map((image, imageIndex) => ({
        src: normalizeAdminContentAsset(image?.src || '', `${path}.images[${imageIndex}].src`, errors, { required: true }),
        alt: normalizeAdminContentPlainText(image?.alt || '', `${path}.images[${imageIndex}].alt`, errors, { maxLength: 300 }),
        caption: normalizeAdminContentRichText(image?.caption || '', `${path}.images[${imageIndex}].caption`, errors, { maxLength: 1000 }),
        _fieldName: `${path}.images[${imageIndex}]`
      })),
      caption: normalizeAdminContentRichText(block.caption || '', `${path}.caption`, errors, { maxLength: 1000 }),
      align: normalizeAdminContentAlignment(block.align)
    };
  }

  if (type === 'audio') {
    const src = normalizeAdminContentAsset(block.src || '', `${path}.src`, errors, { required: true });
    const title = normalizeAdminContentPlainText(block.title || '', `${path}.title`, errors, { maxLength: 200 });
    if (!title.trim()) warnings.push(`${path}.title helps make audio previews accessible.`);
    return {
      type,
      src,
      title,
      caption: normalizeAdminContentRichText(block.caption || '', `${path}.caption`, errors, { maxLength: 1000 }),
      align: normalizeAdminContentAlignment(block.align)
    };
  }

  if (type === 'embed') {
    const provider = String(block.provider || '').trim().toLowerCase();
    if (!ADMIN_CONTENT_ALLOWED_EMBED_PROVIDERS.has(provider)) {
      errors.push(`${path}.provider is not approved.`);
    }
    if (!isApprovedAdminEmbedSrc(provider, block.src)) {
      errors.push(`${path}.src must be an approved ${provider || 'embed'} URL.`);
    }
    return {
      type,
      provider,
      src: String(block.src || '').trim(),
      title: normalizeAdminContentPlainText(block.title || '', `${path}.title`, errors, { maxLength: 200 }),
      caption: normalizeAdminContentRichText(block.caption || '', `${path}.caption`, errors, { maxLength: 1000 }),
      align: normalizeAdminContentAlignment(block.align)
    };
  }

  if (type === 'quote') {
    return {
      type,
      text: normalizeAdminContentRichText(block.text || '', `${path}.text`, errors, { required: true }),
      author: normalizeAdminContentPlainText(block.author || '', `${path}.author`, errors, { maxLength: 200 }),
      align: normalizeAdminContentAlignment(block.align)
    };
  }

  return { type, align: normalizeAdminContentAlignment(block.align) };
}

function renderAdminContentBlock(block, index, errors) {
  const path = `longContent[${index}]`;
  if (!block) return '';

  if (block.type === 'text') {
    return `<section class="admin-content-preview__block admin-content-preview__block--text${adminContentAlignClass(block)}">${renderAdminPreviewTextBlock(block.body, errors, `${path}.body`)}</section>`;
  }

  if (block.type === 'video') {
    const title = block.caption || `${block.provider} video`;
    const provider = normalizeAdminContentVideoProvider(block.provider);
    if (provider === 'local') {
      const type = adminContentVideoType(block.src);
      const typeAttr = type ? ` type="${escapeAdminPreviewAttribute(type)}"` : '';
      const posterAttr = block.poster ? ` poster="${escapeAdminPreviewAttribute(block.poster)}"` : '';
      const firstFrameAttr = block.poster ? '' : ' data-first-frame-poster="true"';
      return `<figure class="admin-content-preview__block admin-content-preview__block--video${adminContentAlignClass(block)}"><div class="video-embed video-embed--local"><video controls preload="none" playsinline${posterAttr}${firstFrameAttr}><source src="${escapeAdminPreviewAttribute(block.src)}"${typeAttr}>Video not supported.</video></div>${block.caption ? `<figcaption class="admin-content-preview__caption">${renderAdminPreviewInlineMarkdown(block.caption, errors, `${path}.caption`)}</figcaption>` : ''}</figure>`;
    }
    const src = provider === 'vimeo'
      ? `https://player.vimeo.com/video/${encodeURIComponent(block.video_id)}?dnt=1`
      : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(block.video_id)}`;
    const allow = provider === 'vimeo'
      ? 'autoplay; fullscreen; picture-in-picture'
      : 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    return `<figure class="admin-content-preview__block admin-content-preview__block--video${adminContentAlignClass(block)}"><div class="video-embed video-embed--${provider}"><iframe src="${escapeAdminPreviewAttribute(src)}" title="${escapeAdminPreviewAttribute(title)}" loading="lazy" allow="${escapeAdminPreviewAttribute(allow)}" allowfullscreen></iframe></div>${block.caption ? `<figcaption class="admin-content-preview__caption">${renderAdminPreviewInlineMarkdown(block.caption, errors, `${path}.caption`)}</figcaption>` : ''}</figure>`;
  }

  if (block.type === 'image') {
    return `<figure class="admin-content-preview__block admin-content-preview__block--image${adminContentAlignClass(block)}"><img src="${escapeAdminPreviewAttribute(block.src)}" alt="${escapeAdminPreviewAttribute(block.alt)}">${block.caption ? `<figcaption class="admin-content-preview__caption">${renderAdminPreviewInlineMarkdown(block.caption, errors, `${path}.caption`)}</figcaption>` : ''}</figure>`;
  }

  if (block.type === 'gallery') {
    const layout = normalizeAdminContentGalleryLayout(block.layout);
    const captionStyle = normalizeAdminContentGalleryCaptionStyle(block.caption_style);
    const containerAttrs = layout === 'carousel' ? ' tabindex="0" aria-label="Image gallery"' : '';
    const images = block.images.map((image, imageIndex) => {
      const itemAttrs = captionStyle === 'overlay' && image.caption ? ' tabindex="0"' : '';
      const caption = image.caption
        ? `<span class="gallery__item-caption"><span class="gallery__item-caption-text">${renderAdminPreviewInlineMarkdown(image.caption, errors, `${path}.images[${imageIndex}].caption`)}</span></span>`
        : '';
      return `<div class="gallery__item"${itemAttrs}><img src="${escapeAdminPreviewAttribute(image.src)}" alt="${escapeAdminPreviewAttribute(image.alt)}">${caption}</div>`;
    }).join('');
    return `<figure class="admin-content-preview__block admin-content-preview__block--gallery gallery--${layout} gallery--caption-${captionStyle}${adminContentAlignClass(block)}"><div class="gallery__container"${containerAttrs}>${images}</div>${block.caption ? `<figcaption class="admin-content-preview__caption">${renderAdminPreviewInlineMarkdown(block.caption, errors, `${path}.caption`)}</figcaption>` : ''}</figure>`;
  }

  if (block.type === 'audio') {
    return `<figure class="admin-content-preview__block admin-content-preview__block--audio${adminContentAlignClass(block)}"><p><strong>${escapeAdminPreviewHtml(block.title || 'Audio')}</strong></p><audio controls src="${escapeAdminPreviewAttribute(block.src)}"></audio>${block.caption ? `<figcaption class="admin-content-preview__caption">${renderAdminPreviewInlineMarkdown(block.caption, errors, `${path}.caption`)}</figcaption>` : ''}</figure>`;
  }

  if (block.type === 'embed') {
    return `<figure class="admin-content-preview__block admin-content-preview__block--embed${adminContentAlignClass(block)}"><iframe src="${escapeAdminPreviewAttribute(block.src)}" title="${escapeAdminPreviewAttribute(block.title || block.provider || 'Embedded content')}" loading="lazy"></iframe>${block.caption ? `<figcaption class="admin-content-preview__caption">${renderAdminPreviewInlineMarkdown(block.caption, errors, `${path}.caption`)}</figcaption>` : ''}</figure>`;
  }

  if (block.type === 'quote') {
    return `<blockquote class="admin-content-preview__block admin-content-preview__block--quote${adminContentAlignClass(block)}"><p>${renderAdminPreviewInlineMarkdown(block.text, errors, `${path}.text`)}</p>${block.author ? `<cite>— ${escapeAdminPreviewHtml(block.author)}</cite>` : ''}</blockquote>`;
  }

  if (block.type === 'divider') {
    return `<div class="admin-content-preview__divider${adminContentAlignClass(block)}" role="separator" aria-hidden="true"></div>`;
  }

  return '';
}

function normalizeAdminContentDraft(body = {}) {
  const draft = body.draft && typeof body.draft === 'object' ? body.draft : body;
  return {
    campaignSlug: String(body.campaignSlug || draft.campaignSlug || '').trim(),
    title: String(draft.title || '').trim(),
    shortBlurb: String(draft.shortBlurb ?? draft.short_blurb ?? ''),
    longContent: Array.isArray(draft.longContent)
      ? draft.longContent
      : Array.isArray(draft.long_content)
        ? draft.long_content
        : []
  };
}

function buildAdminContentPreview(draft, campaign) {
  const errors = [];
  const warnings = [];
  const title = draft.title || campaign?.title || '';
  if (!title.trim()) errors.push('title is required.');
  if (!draft.shortBlurb.trim()) warnings.push('shortBlurb is empty.');

  const blocks = draft.longContent.slice(0, ADMIN_CONTENT_MAX_BLOCKS).map((block, index) => validateAdminContentBlock(block, index, errors, warnings));
  if (draft.longContent.length > ADMIN_CONTENT_MAX_BLOCKS) {
    warnings.push(`longContent was limited to ${ADMIN_CONTENT_MAX_BLOCKS} blocks for preview.`);
  }
  if (!draft.longContent.length) {
    warnings.push('longContent is empty.');
  }

  const renderErrors = [];
  const shortBlurbHtml = `<p>${renderAdminPreviewInlineMarkdown(draft.shortBlurb, renderErrors, 'shortBlurb')}</p>`;
  const blocksHtml = blocks.map((block, index) => renderAdminContentBlock(block, index, renderErrors)).join('\n');
  errors.push(...renderErrors);

  const previewHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/assets/main.css">
</head>
<body class="admin-content-preview">
  <main>
    <h1>${escapeAdminPreviewHtml(title)}</h1>
    <div class="admin-content-preview__short-blurb">${shortBlurbHtml}</div>
    <div class="admin-content-preview__long-content">${blocksHtml}</div>
  </main>
</body>
</html>`;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalizedDraft: {
      title,
      shortBlurb: draft.shortBlurb,
      longContent: blocks.filter(Boolean)
    },
    preview: {
      title,
      shortBlurbHtml,
      longContentHtml: blocksHtml,
      html: previewHtml
    }
  };
}

async function getRoleScopedAdminCampaign(request, env, campaignSlug, permission = 'campaign:edit_content', options = {}) {
  const auth = await requireAdminSession(request, env, permission, { ...options, campaignSlug });
  if (!auth.ok) return { ok: false, response: auth.response };

  if (!isValidSlug(campaignSlug)) {
    return { ok: false, response: privateJsonResponse({ error: 'Invalid campaign slug' }, 400, env) };
  }

  const campaign = await getCampaign(env, campaignSlug);
  if (!campaign) {
    return { ok: false, response: privateJsonResponse({ error: 'Campaign not found' }, 404, env) };
  }

  return { ok: true, auth, campaign };
}

async function handleAdminContentCampaign(request, env) {
  const url = new URL(request.url);
  const campaignSlug = String(url.searchParams.get('campaignSlug') || '').trim();
  const scoped = await getRoleScopedAdminCampaign(request, env, campaignSlug);
  if (!scoped.ok) return scoped.response;

  const campaign = scoped.campaign;
  return privateJsonResponse({
    user: scoped.auth.user,
    campaign: {
      slug: campaign.slug,
      title: campaign.title || campaign.slug,
      shortBlurb: campaign.short_blurb || '',
      longContent: Array.isArray(campaign.long_content) ? campaign.long_content : [],
      diaryCount: Array.isArray(campaign.diary) ? campaign.diary.length : 0,
      tierCount: Array.isArray(campaign.tiers) ? campaign.tiers.length : 0,
      decisionCount: Array.isArray(campaign.decisions) ? campaign.decisions.length : 0
    },
    writeBudget: adminReadBudget()
  }, 200, env);
}

async function handleAdminContentPreview(request, env, body = {}) {
  const draft = normalizeAdminContentDraft(body);
  const scoped = await getRoleScopedAdminCampaign(request, env, draft.campaignSlug);
  if (!scoped.ok) return scoped.response;

  const preview = buildAdminContentPreview(draft, scoped.campaign);
  return privateJsonResponse({
    user: scoped.auth.user,
    campaignSlug: scoped.campaign.slug,
    dryRun: true,
    ...preview,
    writeBudget: adminReadBudget()
  }, preview.valid ? 200 : 422, env);
}

function yamlQuoteAdminString(value) {
  return JSON.stringify(String(value ?? ''));
}

function yamlBlockAdminString(value, indent = '  ') {
  const text = String(value ?? '');
  if (!text) return '""';
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  return `|\n${lines.map((line) => `${indent}${line}`).join('\n')}`;
}

function yamlAdminScalarLine(key, value) {
  return `${key}: ${yamlQuoteAdminString(value)}`;
}

function yamlAdminOptionalScalar(lines, key, value, indent) {
  const text = String(value ?? '');
  if (text) {
    lines.push(`${indent}${key}: ${yamlQuoteAdminString(text)}`);
  }
}

function yamlAdminOptionalAlignment(lines, block, indent) {
  const align = normalizeAdminContentAlignment(block?.align);
  if (align !== 'left') {
    lines.push(`${indent}align: ${yamlQuoteAdminString(align)}`);
  }
}

function serializeAdminContentBlockToYaml(block = {}) {
  const lines = [`  - type: ${yamlQuoteAdminString(block.type || '')}`];
  yamlAdminOptionalAlignment(lines, block, '    ');
  if (block.type === 'text') {
    lines.push(`    body: ${yamlBlockAdminString(block.body, '      ')}`);
  } else if (block.type === 'video') {
    lines.push(`    provider: ${yamlQuoteAdminString(block.provider || '')}`);
    if (normalizeAdminContentVideoProvider(block.provider) === 'local') {
      lines.push(`    src: ${yamlQuoteAdminString(block.src || '')}`);
      yamlAdminOptionalScalar(lines, 'poster', block.poster, '    ');
    } else {
      lines.push(`    video_id: ${yamlQuoteAdminString(block.video_id || '')}`);
    }
    yamlAdminOptionalScalar(lines, 'caption', block.caption, '    ');
  } else if (block.type === 'image') {
    lines.push(`    src: ${yamlQuoteAdminString(block.src || '')}`);
    lines.push(`    alt: ${yamlQuoteAdminString(block.alt || '')}`);
    yamlAdminOptionalScalar(lines, 'caption', block.caption, '    ');
  } else if (block.type === 'gallery') {
    const layout = normalizeAdminContentGalleryLayout(block.layout);
    const captionStyle = normalizeAdminContentGalleryCaptionStyle(block.caption_style);
    yamlAdminOptionalScalar(lines, 'layout', layout, '    ');
    if (captionStyle !== 'inline') yamlAdminOptionalScalar(lines, 'caption_style', captionStyle, '    ');
    lines.push('    images:');
    for (const image of block.images || []) {
      lines.push(`      - src: ${yamlQuoteAdminString(image.src || '')}`);
      lines.push(`        alt: ${yamlQuoteAdminString(image.alt || '')}`);
      yamlAdminOptionalScalar(lines, 'caption', image.caption, '        ');
    }
    yamlAdminOptionalScalar(lines, 'caption', block.caption, '    ');
  } else if (block.type === 'audio') {
    lines.push(`    src: ${yamlQuoteAdminString(block.src || '')}`);
    yamlAdminOptionalScalar(lines, 'title', block.title, '    ');
    yamlAdminOptionalScalar(lines, 'caption', block.caption, '    ');
  } else if (block.type === 'embed') {
    lines.push(`    provider: ${yamlQuoteAdminString(block.provider || '')}`);
    lines.push(`    src: ${yamlQuoteAdminString(block.src || '')}`);
    yamlAdminOptionalScalar(lines, 'title', block.title, '    ');
    yamlAdminOptionalScalar(lines, 'caption', block.caption, '    ');
  } else if (block.type === 'quote') {
    lines.push(`    text: ${yamlBlockAdminString(block.text, '      ')}`);
    yamlAdminOptionalScalar(lines, 'author', block.author, '    ');
  }
  return lines.join('\n');
}

function serializeAdminLongContentYaml(blocks = []) {
  if (!blocks.length) return 'long_content: []';
  return `long_content:\n${blocks.map(serializeAdminContentBlockToYaml).join('\n')}`;
}

function replaceAdminFrontMatterBlock(frontMatter, key, replacement) {
  const lines = String(frontMatter || '').split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^${key}:`).test(line));
  if (start < 0) {
    return `${frontMatter.replace(/\s*$/, '')}\n${replacement}`;
  }
  let end = start + 1;
  while (end < lines.length && !/^[A-Za-z0-9_-]+:/.test(lines[end])) {
    end += 1;
  }
  lines.splice(start, end - start, ...replacement.split('\n'));
  return lines.join('\n');
}

function applyAdminCampaignContentDraftToMarkdown(source, draft) {
  const match = String(source || '').match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n[\s\S]*)?$/);
  if (!match) {
    return { ok: false, error: 'Campaign Markdown must contain YAML front matter.' };
  }

  let frontMatter = match[1];
  frontMatter = replaceAdminFrontMatterBlock(frontMatter, 'title', yamlAdminScalarLine('title', draft.title));
  frontMatter = replaceAdminFrontMatterBlock(frontMatter, 'short_blurb', yamlAdminScalarLine('short_blurb', draft.shortBlurb));
  frontMatter = replaceAdminFrontMatterBlock(frontMatter, 'long_content', serializeAdminLongContentYaml(draft.longContent || []));

  return {
    ok: true,
    content: `---\n${frontMatter.replace(/\s*$/, '')}\n---${match[2] || '\n'}`
  };
}

function getAdminCampaignMarkdownPath(campaignSlug) {
  return `_campaigns/${String(campaignSlug || '').trim()}.md`;
}

async function handleAdminContentPublish(request, env) {
  const parsedBody = await parseJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
    privateResponse: true,
    emptyValue: {}
  });
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.body || {};
  const draft = normalizeAdminContentDraft(body);
  const scoped = await getRoleScopedAdminCampaign(request, env, draft.campaignSlug, 'campaign:edit_content', { requireCsrf: true });
  if (!scoped.ok) return scoped.response;

  if (body.intent !== 'publish') {
    return privateJsonResponse({ error: 'Missing publish intent' }, 400, env);
  }

  const preview = buildAdminContentPreview(draft, scoped.campaign);
  if (!preview.valid) {
    return privateJsonResponse({
      user: scoped.auth.user,
      campaignSlug: scoped.campaign.slug,
      dryRun: false,
      ...preview,
      writeBudget: adminWriteBudget({ readOnly: false, kvWritesExpected: 0, kvListExpected: 0 })
    }, 422, env);
  }

  const githubPath = getAdminCampaignMarkdownPath(scoped.campaign.slug);
  const existing = await getGitHubTextFile(env, githubPath);
  if (!existing.ok) {
    return privateJsonResponse({
      error: existing.error || 'Unable to load campaign Markdown from GitHub',
      code: existing.code || 'github_load_failed'
    }, existing.status || 502, env);
  }

  const nextMarkdown = applyAdminCampaignContentDraftToMarkdown(existing.content, preview.normalizedDraft);
  if (!nextMarkdown.ok) {
    return privateJsonResponse({ error: nextMarkdown.error }, 422, env);
  }

  const commitMessage = String(body.message || '').trim() || `Update ${scoped.campaign.slug} campaign content`;
  const committed = await putGitHubTextFile(env, githubPath, nextMarkdown.content, commitMessage, existing.sha);
  if (!committed.ok) {
    return privateJsonResponse({
      error: committed.error || 'Unable to publish campaign content',
      code: committed.code || 'github_commit_failed'
    }, committed.status || 502, env);
  }

  const rebuild = await triggerSiteRebuild(env, `admin-content-publish:${scoped.campaign.slug}`);
  const auditKey = await recordAdminAuditEvent(env, {
    action: 'campaign:publish_content',
    adminEmail: scoped.auth.user.email,
    campaignSlug: scoped.campaign.slug,
    githubPath,
    commitSha: committed.commitSha,
    rebuildTriggered: rebuild.triggered === true
  });

  return privateJsonResponse({
    success: true,
    campaignSlug: scoped.campaign.slug,
    githubPath,
    commitSha: committed.commitSha,
    commitUrl: committed.commitUrl,
    rebuild,
    auditKey,
    writeBudget: adminWriteBudget({ readOnly: false, kvWritesExpected: 1, kvListExpected: 0 })
  }, 200, env);
}

async function handleAdminSupporters(request, env) {
  const url = new URL(request.url);
  const requestedCampaignSlug = String(url.searchParams.get('campaignSlug') || '').trim();
  const allCampaignsRequested = !requestedCampaignSlug || requestedCampaignSlug === 'all';
  const auth = await requireAdminSession(request, env, 'supporters:read', {
    campaignSlug: allCampaignsRequested ? '' : requestedCampaignSlug
  });
  if (!auth.ok) return auth.response;

  const { campaigns } = await getCampaigns(env);
  const allowedCampaigns = (campaigns || []).filter((campaign) => (
    auth.user.role === 'super_admin' ||
    auth.user.campaignSlugs.includes(String(campaign?.slug || ''))
  ));
  const selectedCampaigns = allCampaignsRequested
    ? allowedCampaigns
    : allowedCampaigns.filter((campaign) => String(campaign?.slug || '') === requestedCampaignSlug);

  if (!allCampaignsRequested && selectedCampaigns.length === 0) {
    return privateJsonResponse({ error: 'Campaign not found' }, 404, env);
  }

  const indexedCampaigns = [];
  const missingCampaigns = [];
  let indexed = 0;
  for (const campaign of selectedCampaigns) {
    const campaignSlug = String(campaign?.slug || '').trim();
    const orderIds = await getCampaignOrderIds(env, campaignSlug);
    if (!Array.isArray(orderIds)) {
      missingCampaigns.push({
        slug: campaignSlug,
        title: campaign?.title || campaignSlug
      });
      continue;
    }
    indexed += orderIds.length;
    indexedCampaigns.push({ campaign, campaignSlug, orderIds });
  }

  if (!allCampaignsRequested && missingCampaigns.length > 0) {
    return adminIndexRequiredResponse(env, {
      error: 'Campaign pledge index is required for dashboard supporter reads',
      campaignSlug: allCampaignsRequested ? '' : requestedCampaignSlug,
      extra: { missingCampaigns }
    });
  }

  const limit = clampAdminPageLimit(url.searchParams.get('limit'));
  const cursor = Math.max(0, Number.parseInt(String(url.searchParams.get('cursor') || '0'), 10) || 0);
  const filters = {
    status: String(url.searchParams.get('status') || 'all').trim().toLowerCase(),
    fulfillment: String(url.searchParams.get('fulfillment') || 'all').trim().toLowerCase(),
    query: String(url.searchParams.get('q') || '').trim().toLowerCase()
  };

  const supporters = [];
  let matched = 0;
  let scanned = 0;

  for (const entry of indexedCampaigns) {
    for (let index = 0; index < entry.orderIds.length; index += 1) {
      const orderId = String(entry.orderIds[index] || '').trim();
      if (!orderId) continue;
      const pledge = await env.PLEDGES.get(`pledge:${orderId}`, { type: 'json' });
      scanned += 1;
      if (!pledge || String(pledge?.campaignSlug || '') !== entry.campaignSlug) continue;
      if (!pledgeMatchesAdminSupporterFilters(pledge, filters)) continue;

      if (matched >= cursor && supporters.length < limit) {
        supporters.push({
          ...publicAdminSupporterRecord(pledge),
          campaignTitle: entry.campaign?.title || entry.campaignSlug
        });
      }
      matched += 1;
    }
  }
  const nextCursor = matched > cursor + supporters.length ? cursor + supporters.length : null;

  return privateJsonResponse({
    user: auth.user,
    scope: allCampaignsRequested ? 'portfolio' : 'campaign',
    campaign: allCampaignsRequested ? null : {
      slug: selectedCampaigns[0]?.slug || requestedCampaignSlug,
      title: selectedCampaigns[0]?.title || requestedCampaignSlug,
      effectiveState: getEffectiveState(selectedCampaigns[0]) || selectedCampaigns[0]?.state || 'unknown'
    },
    campaigns: selectedCampaigns.map((campaign) => ({
      slug: campaign.slug,
      title: campaign.title || campaign.slug,
      effectiveState: getEffectiveState(campaign) || campaign?.state || 'unknown'
    })),
    supporters,
    missingCampaigns,
    page: {
      limit,
      cursor,
      nextCursor,
      returned: supporters.length,
      matched,
      indexed,
      scanned
    },
    filters,
    writeBudget: adminReadBudget(),
    generatedAt: new Date().toISOString()
  }, 200, env);
}

function getReportPreviewRows(report = {}, limit = Number.POSITIVE_INFINITY) {
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  return rows.slice(0, limit).map((row) => (
    Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : []
  ));
}

async function buildAdminCampaignRunnerSingleReportPayload(env, auth, campaign, reportType, reportDate = new Date()) {
  const campaignSlug = String(campaign?.slug || '').trim();
  const indexedPledges = await getIndexedCampaignReportPledges(env, campaignSlug);
  if (!indexedPledges.ok) {
    return {
      ok: false,
      error: indexedPledges.error,
      campaignSlug
    };
  }

  const reportDateKey = getMountainDateKey(reportDate);
  const reportDateLabel = formatCampaignRunnerReportDateLabel(reportDate);
  const reportKind = getCampaignRunnerReportKindLabel(reportType);
  const markerKey = getCampaignRunnerReportMarkerKey(reportType, campaignSlug, reportDateKey);
  const markerPayload = await env.PLEDGES?.get(markerKey, { type: 'json' });
  const pledges = indexedPledges.pledges || [];
  const report = reportType === 'fulfillment'
    ? buildFulfillmentReport(pledges, {
      campaign,
      platformFulfiller: getPlatformCompanyName(env)
    })
    : buildPledgeLedgerReport(pledges, { campaign });
  const fulfillerIndex = reportType === 'fulfillment'
    ? getFulfillmentReportColumnIndex(report, 'fulfiller')
    : -1;
  const campaignRowCount = reportType === 'fulfillment'
    ? filterFulfillmentReportRows(
      report,
      (row) => fulfillerIndex >= 0 && String(row[fulfillerIndex] || '').trim() === campaign.slug
    ).rows.length
    : report.rows.length;
  const platformRowCount = reportType === 'fulfillment'
    ? filterFulfillmentReportRows(
      report,
      (row) => fulfillerIndex >= 0 && String(row[fulfillerIndex] || '').trim() === getPlatformCompanyName(env)
    ).rows.length
    : 0;
  const summary = getCampaignRunnerIncludeStatsSummary(env)
    ? getCampaignRunnerStatsSummary(
      campaign,
      await getCampaignStats(env, campaignSlug),
      env,
      reportKind,
      pledges,
      reportDate
    )
    : [];

  return {
    ok: true,
    payload: {
      user: auth.user,
      dryRun: true,
      campaignSlug,
      campaignTitle: campaign.title || campaign.slug,
      reportType,
      reportKind,
      effectiveState: getEffectiveState(campaign) || campaign?.state || 'unknown',
      recipientCount: normalizeCampaignRunnerReportRecipients(campaign).length,
      platformRecipient: reportType === 'fulfillment' ? String(getSupportEmail(env) || '').trim().toLowerCase() || null : null,
      rowCount: campaignRowCount,
      campaignRowCount,
      platformRowCount,
      totalRowCount: Array.isArray(report.rows) ? report.rows.length : 0,
      csvFilename: `${campaignSlug}-${reportType === 'fulfillment' ? 'fulfillment-report' : 'pledge-report'}-${reportDateKey}.csv`,
      reportDateKey,
      reportDateLabel,
      includeStatsSummary: getCampaignRunnerIncludeStatsSummary(env),
      includeCsvAttachment: getCampaignRunnerIncludeCsvAttachment(env),
      alreadyMarked: Boolean(markerPayload),
      markerKey,
      indexedPledgeCount: indexedPledges.indexed || 0,
      header: Array.isArray(report.header) ? report.header : [],
      rows: Array.isArray(report.rows) ? report.rows : [],
      previewRows: getReportPreviewRows(report),
      csv: report.csv || '',
      statsSummary: summary,
      writeBudget: adminReadBudget(),
      generatedAt: new Date().toISOString()
    }
  };
}

async function buildAdminCampaignRunnerReportPayload(request, env) {
  const url = new URL(request.url);
  const requestedCampaignSlug = String(url.searchParams.get('campaignSlug') || '').trim();
  const allCampaignsRequested = !requestedCampaignSlug || requestedCampaignSlug.toLowerCase() === 'all';
  const reportType = normalizeCampaignRunnerReportType(url.searchParams.get('reportType'));

  if (!allCampaignsRequested) {
    const scoped = await getRoleScopedAdminCampaign(request, env, requestedCampaignSlug, 'reports:send');
    if (!scoped.ok) return { ok: false, response: scoped.response };
    const built = await buildAdminCampaignRunnerSingleReportPayload(env, scoped.auth, scoped.campaign, reportType);
    if (!built.ok) {
      return {
        ok: false,
        response: adminIndexRequiredResponse(env, {
          error: built.error,
          campaignSlug: requestedCampaignSlug
        })
      };
    }
    return built;
  }

  const auth = await requireAdminSession(request, env, 'reports:send', { campaignSlug: '' });
  if (!auth.ok) return { ok: false, response: auth.response };

  const { campaigns } = await getCampaigns(env);
  const allowedCampaigns = (campaigns || []).filter((campaign) => (
    auth.user.role === 'super_admin' ||
    auth.user.campaignSlugs.includes(String(campaign?.slug || ''))
  ));
  const reportDate = new Date();
  const reports = [];
  const missingCampaigns = [];

  for (const campaign of allowedCampaigns) {
    const built = await buildAdminCampaignRunnerSingleReportPayload(env, auth, campaign, reportType, reportDate);
    if (!built.ok) {
      missingCampaigns.push({ campaignSlug: campaign.slug, error: built.error });
      continue;
    }
    reports.push(built.payload);
  }

  const header = reports.find((report) => Array.isArray(report.header) && report.header.length)?.header || [];
  const rows = reports.flatMap((report) => Array.isArray(report.rows) ? report.rows : []);
  const csv = rebuildCsvReport({ header, rows }).csv;
  const reportDateKey = getMountainDateKey(reportDate);
  const reportKind = getCampaignRunnerReportKindLabel(reportType);
  const alreadyMarkedCount = reports.filter((report) => report.alreadyMarked).length;

  return {
    ok: true,
    payload: {
      user: auth.user,
      dryRun: true,
      scope: 'portfolio',
      campaignSlug: '',
      campaignTitle: 'All campaigns',
      campaigns: reports.map((report) => ({
        slug: report.campaignSlug,
        title: report.campaignTitle,
        rowCount: report.rowCount,
        recipientCount: report.recipientCount,
        alreadyMarked: report.alreadyMarked
      })),
      reportType,
      reportKind,
      effectiveState: 'multiple',
      recipientCount: reports.reduce((sum, report) => sum + Number(report.recipientCount || 0), 0),
      platformRecipient: reportType === 'fulfillment' ? String(getSupportEmail(env) || '').trim().toLowerCase() || null : null,
      rowCount: reports.reduce((sum, report) => sum + Number(report.rowCount || 0), 0),
      campaignRowCount: reports.reduce((sum, report) => sum + Number(report.campaignRowCount || 0), 0),
      platformRowCount: reports.reduce((sum, report) => sum + Number(report.platformRowCount || 0), 0),
      totalRowCount: reports.reduce((sum, report) => sum + Number(report.totalRowCount || 0), 0),
      csvFilename: `all-campaigns-${reportType === 'fulfillment' ? 'fulfillment-report' : 'pledge-report'}-${reportDateKey}.csv`,
      reportDateKey,
      reportDateLabel: formatCampaignRunnerReportDateLabel(reportDate),
      includeStatsSummary: getCampaignRunnerIncludeStatsSummary(env),
      includeCsvAttachment: getCampaignRunnerIncludeCsvAttachment(env),
      alreadyMarked: reports.length > 0 && alreadyMarkedCount === reports.length,
      alreadyMarkedCount,
      indexedPledgeCount: reports.reduce((sum, report) => sum + Number(report.indexedPledgeCount || 0), 0),
      missingCampaigns,
      header,
      rows,
      previewRows: getReportPreviewRows({ rows }),
      csv,
      statsSummary: [],
      writeBudget: adminReadBudget(),
      generatedAt: new Date().toISOString()
    }
  };
}

async function handleAdminCampaignRunnerReportPreview(request, env) {
  const built = await buildAdminCampaignRunnerReportPayload(request, env);
  if (!built.ok) return built.response;
  const { csv, ...payload } = built.payload;
  return privateJsonResponse(payload, 200, env);
}

function csvResponse(csv, filename, env = null) {
  const safeFilename = String(filename || 'campaign-runner-report.csv')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'campaign-runner-report.csv';
  return new Response(String(csv || ''), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeFilename}"`,
      'Cache-Control': PRIVATE_NO_STORE_CACHE_CONTROL,
      'Access-Control-Allow-Origin': getAllowedOrigin(env, false),
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key, x-pool-admin-csrf',
      'Access-Control-Expose-Headers': 'Content-Disposition',
      ...SECURITY_HEADERS
    }
  });
}

async function handleAdminCampaignRunnerReportCsv(request, env) {
  const built = await buildAdminCampaignRunnerReportPayload(request, env);
  if (!built.ok) return built.response;
  return csvResponse(built.payload.csv, built.payload.csvFilename, env);
}

function getAdminAuditEventKey(action, now = new Date()) {
  const dateKey = now.toISOString().slice(0, 10);
  const safeAction = String(action || 'admin_event')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'admin_event';
  const id = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `admin-audit:${dateKey}:${safeAction}:${id}`;
}

async function recordAdminAuditEvent(env, event = {}) {
  if (!env?.PLEDGES) return null;
  const now = new Date();
  const action = String(event.action || 'admin_event').trim() || 'admin_event';
  const key = getAdminAuditEventKey(action, now);
  await env.PLEDGES.put(key, JSON.stringify({
    ...event,
    action,
    createdAt: now.toISOString()
  }), { expirationTtl: ADMIN_AUDIT_EVENT_TTL_SECONDS });
  return key;
}

function flattenAdminAddOnInventory(snapshot = {}, catalog = {}) {
  const products = new Map((catalog.products || []).map((product) => [String(product?.id || ''), product]));
  const rows = [];

  for (const [productId, productState] of Object.entries(snapshot.products || {})) {
    const product = products.get(productId) || {};
    if (String(product?.scope || productState?.scope || 'platform') !== 'platform') {
      continue;
    }

    const variants = Array.isArray(product?.variants) ? product.variants : [];
    if (variants.length > 0) {
      for (const variant of variants) {
        const variantId = String(variant?.id || '');
        const variantState = productState.variants?.[variantId] || {};
        rows.push({
          productId,
          variantId,
          label: `${String(product?.name || productId)} (${String(variant?.label || variantId)})`,
          productName: String(product?.name || productId),
          variantLabel: String(variant?.label || variantId),
          category: String(product?.category || 'digital'),
          configuredInventory: variantState.configuredInventory ?? null,
          inventory: variantState.inventory ?? null,
          overrideInventory: variantState.overrideInventory ?? null,
          hasOverride: Boolean(variantState.hasOverride),
          sold: Number(variantState.sold || 0),
          remaining: variantState.remaining ?? null,
          soldOut: Boolean(variantState.soldOut)
        });
      }
      continue;
    }

    rows.push({
      productId,
      variantId: '',
      label: String(product?.name || productId),
      productName: String(product?.name || productId),
      variantLabel: '',
      category: String(product?.category || 'digital'),
      configuredInventory: productState.configuredInventory ?? null,
      inventory: productState.inventory ?? null,
      overrideInventory: productState.overrideInventory ?? null,
      hasOverride: Boolean(productState.hasOverride),
      sold: Number(productState.sold || 0),
      remaining: productState.remaining ?? null,
      soldOut: Boolean(productState.soldOut)
    });
  }

  rows.sort((a, b) => a.productName.localeCompare(b.productName) || a.variantLabel.localeCompare(b.variantLabel));
  return rows;
}

async function handleAdminAddOnInventory(request, env) {
  const auth = await requireAdminSession(request, env, 'platform_inventory:manage');
  if (!auth.ok) return auth.response;

  const [catalog, snapshot] = await Promise.all([
    getAddOns(env),
    getAddOnInventorySnapshot(env, { force: true })
  ]);

  return privateJsonResponse({
    rows: flattenAdminAddOnInventory(snapshot, catalog),
    lowStockThreshold: snapshot.lowStockThreshold ?? catalog.low_stock_threshold ?? 5,
    overridesUpdatedAt: snapshot.overridesUpdatedAt || null,
    updatedAt: snapshot.updatedAt,
    writeBudget: adminReadBudget({ kvListExpected: 1 })
  }, 200, env);
}

async function handleAdminAddOnInventoryMutation(request, env) {
  const parsedBody = await parseJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES,
    privateResponse: true,
    emptyValue: {}
  });
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.body || {};
  const auth = await requireAdminSession(request, env, 'platform_inventory:manage', {
    requireCsrf: true
  });
  if (!auth.ok) return auth.response;

  try {
    const mutation = await mutateAddOnInventoryOverride(env, {
      action: body.action,
      productId: body.productId,
      variantId: body.variantId,
      inventory: body.inventory,
      quantity: body.quantity
    });

    const auditKey = await recordAdminAuditEvent(env, {
      action: 'platform_inventory:manage',
      adminEmail: auth.user.email,
      adminRole: auth.user.role,
      productId: mutation.productId,
      variantId: mutation.variantId,
      inventoryAction: mutation.action,
      before: mutation.before,
      after: mutation.after
    });

    return privateJsonResponse({
      success: true,
      mutation,
      auditKey,
      writeBudget: adminWriteBudget({ readOnly: false, kvWritesExpected: mutation.storageWrite ? 2 : 1, kvListExpected: 2 })
    }, 200, env);
  } catch (error) {
    return privateJsonResponse({
      error: error instanceof Error ? error.message : String(error || 'Inventory mutation failed')
    }, 400, env);
  }
}

async function handleGetStats(campaignSlug, env) {
  if (!campaignSlug) {
    return jsonResponse({ error: 'Missing campaign slug' }, 400, env, true);
  }

  const campaign = await getCampaign(env, campaignSlug);
  if (!campaign) {
    return jsonResponse({ error: 'Campaign not found' }, 404, env, true);
  }

  const stats = await getCampaignStats(env, campaignSlug);
  if (!stats) {
    return jsonResponse({ error: 'Campaign stats not found' }, 404, env, true);
  }
  
  // Also get campaign data for context
  
  // SEC-004: Stats are public, use permissive CORS
  return cacheablePublicJsonResponse({
    campaignSlug,
    pledgedAmount: stats.pledgedAmount,
    pledgeCount: stats.pledgeCount,
    tierCounts: stats.tierCounts,
    supportItems: stats.supportItems || {},
    goalAmount: campaign?.goal_amount || 0,
    goalDeadline: campaign?.goal_deadline || null,
    state: campaign?.state || 'unknown',
    percentFunded: campaign?.goal_amount 
      ? Math.round((stats.pledgedAmount / (campaign.goal_amount * 100)) * 100) 
      : 0,
    updatedAt: stats.updatedAt
  }, 200, env);
}

async function handleGetLiveCampaign(campaignSlug, env) {
  if (!campaignSlug) {
    return jsonResponse({ error: 'Missing campaign slug' }, 400, env, true);
  }

  const [stats, inventorySnapshot, campaign] = await Promise.all([
    getCampaignStats(env, campaignSlug),
    buildTierAvailabilitySnapshot(env, campaignSlug),
    getCampaign(env, campaignSlug)
  ]);
  const inventory = inventorySnapshot?.inventory || {};
  const reservedCounts = inventorySnapshot?.reservedCounts || {};
  const goalAmount = campaign?.goal_amount || 0;
  const pledgedAmount = stats?.pledgedAmount || 0;
  const effectiveState = getEffectiveState(campaign) || campaign?.state || 'unknown';
  const isFunded = goalAmount > 0 ? pledgedAmount >= (goalAmount * 100) : false;

  const tiers = {};
  for (const tier of (campaign?.tiers || [])) {
    if (tier.limit_total) {
      const inv = inventory?.[tier.id] || { limit: tier.limit_total, claimed: 0 };
      const reserved = Number(reservedCounts?.[tier.id] || 0);
      tiers[tier.id] = {
        name: tier.name,
        limit: inv.limit,
        claimed: inv.claimed,
        reserved,
        remaining: Math.max(0, inv.limit - inv.claimed - reserved)
      };
    }
  }

  return cacheablePublicJsonResponse({
    campaignSlug,
    campaign: {
      slug: campaign?.slug || campaignSlug,
      url: campaign?.url || `/campaigns/${encodeURIComponent(campaignSlug)}/`,
      title: campaign?.title || campaignSlug,
      creatorName: campaign?.creator_name || null,
      category: campaign?.category || null,
      shortBlurb: campaign?.short_blurb || '',
      shortBlurbHtml: campaign?.short_blurb_html || '',
      heroImage: campaign?.hero_image || null,
      heroImageWide: campaign?.hero_image_wide || null,
      heroImageAlt: campaign?.hero_image_alt || campaign?.title || campaignSlug,
      heroVideo: campaign?.hero_video || null,
      progressBackground: campaign?.progress_background || null,
      startDate: campaign?.start_date || null,
      goalDeadline: campaign?.goal_deadline || null,
      goalAmount,
      state: campaign?.state || 'unknown',
      effectiveState,
      isFunded,
      stretchGoals: campaign?.stretch_goals || [],
      stretchHidden: campaign?.stretch_hidden !== false,
      hasDecisions: campaign?.has_decisions === true
    },
    stats: {
      campaignSlug,
      pledgedAmount,
      pledgeCount: stats?.pledgeCount || 0,
      tierCounts: stats?.tierCounts || {},
      supportItems: stats?.supportItems || {},
      goalAmount,
      goalDeadline: campaign?.goal_deadline || null,
      state: campaign?.state || 'unknown',
      effectiveState,
      isFunded,
      percentFunded: goalAmount
        ? Math.round((pledgedAmount / (goalAmount * 100)) * 100)
        : 0,
      updatedAt: stats?.updatedAt || null
    },
    inventory: {
      campaignSlug,
      tiers,
      raw: Object.fromEntries(
        Object.entries(inventory || {}).map(([tierId, inv]) => [
          tierId,
          {
            ...inv,
            reserved: Number(reservedCounts?.[tierId] || 0)
          }
        ])
      )
    }
  }, 200, env);
}

async function getCampaignShareCardContext(campaignSlug, request, env) {
  if (!campaignSlug) {
    return {
      ok: false,
      response: new Response('Missing campaign slug', { status: 400, headers: { ...SECURITY_HEADERS } })
    };
  }

  const [campaign, stats] = await Promise.all([
    getCampaign(env, campaignSlug),
    getCampaignStats(env, campaignSlug)
  ]);

  if (!campaign) {
    return {
      ok: false,
      response: new Response('Campaign not found', { status: 404, headers: { ...SECURITY_HEADERS } })
    };
  }

  const effectiveState = getEffectiveState(campaign) || campaign?.state || 'unknown';
  const pledgedAmount = Number(stats?.pledgedAmount || 0);
  const goalAmount = Number(campaign?.goal_amount || 0);
  const isFunded = goalAmount > 0 ? pledgedAmount >= (goalAmount * 100) : false;
  const requestUrl = new URL(request.url);
  const preferredLang = normalizePreferredLang(requestUrl.searchParams.get('lang'), DEFAULT_I18N_LANG);
  return {
    ok: true,
    campaign,
    stats,
    effectiveState,
    isFunded,
    preferredLang
  };
}

async function handleGetCampaignShareCard(campaignSlug, request, env) {
  const context = await getCampaignShareCardContext(campaignSlug, request, env);
  if (!context.ok) return context.response;
  const shareCardCacheControl = getAppMode(env) === 'test'
    ? PRIVATE_NO_STORE_CACHE_CONTROL
    : SHARE_CARD_CACHE_CONTROL;

  const isHeadRequest = request.method === 'HEAD';
  if (isHeadRequest) {
    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': shareCardCacheControl,
        ...SECURITY_HEADERS
      }
    });
  }

  const svg = await buildCampaignShareCardSvg({
    env,
    campaign: context.campaign,
    stats: context.stats,
    effectiveState: context.effectiveState,
    isFunded: context.isFunded,
    preferredLang: context.preferredLang
  });

  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': shareCardCacheControl,
      'Content-Length': String(new TextEncoder().encode(svg).byteLength),
      ...SECURITY_HEADERS
    }
  });
}

async function handleGetCampaignShareCardPng(campaignSlug, request, env) {
  const context = await getCampaignShareCardContext(campaignSlug, request, env);
  if (!context.ok) return context.response;
  const shareCardCacheControl = getAppMode(env) === 'test'
    ? PRIVATE_NO_STORE_CACHE_CONTROL
    : SHARE_CARD_CACHE_CONTROL;

  const isHeadRequest = request.method === 'HEAD';
  if (isHeadRequest) {
    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': shareCardCacheControl,
        ...SECURITY_HEADERS
      }
    });
  }

  const png = await buildCampaignShareCardPng({
    env,
    campaign: context.campaign,
    stats: context.stats,
    effectiveState: context.effectiveState,
    isFunded: context.isFunded,
    preferredLang: context.preferredLang
  });

  return new Response(png, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': shareCardCacheControl,
      'Content-Length': String(png.byteLength),
      ...SECURITY_HEADERS
    }
  });
}

async function handleRecalculateStats(request, campaignSlug, env) {
  // Require admin auth for recalculation (SEC-006)
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  if (!campaignSlug) {
    return jsonResponse({ error: 'Missing campaign slug' }, 400);
  }

  const stats = await recalculateStats(env, campaignSlug, { repairIndex: true });
  
  return jsonResponse({
    success: true,
    message: 'Stats recalculated',
    stats
  });
}

async function handleCheckStatsProjection(request, campaignSlug, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  if (!campaignSlug) {
    return jsonResponse({ error: 'Missing campaign slug' }, 400);
  }

  const campaign = await getCampaign(env, campaignSlug);
  if (!campaign) {
    return jsonResponse({ error: 'Campaign not found' }, 404);
  }

  const drift = await checkCampaignProjectionDrift(env, campaignSlug, campaign);
  return jsonResponse({
    success: true,
    campaignSlug,
    inSync: Boolean(drift?.inSync),
    drift
  });
}

async function handleGetInventory(campaignSlug, env) {
  if (!campaignSlug) {
    return jsonResponse({ error: 'Missing campaign slug' }, 400, env, true);
  }

  const campaign = await getCampaign(env, campaignSlug);
  const inventorySnapshot = await buildTierAvailabilitySnapshot(env, campaignSlug, campaign);
  const inventory = inventorySnapshot.inventory || {};
  const reservedCounts = inventorySnapshot.reservedCounts || {};
  
  // Merge inventory with tier data for complete picture
  const tiers = {};
  for (const tier of (campaign?.tiers || [])) {
    if (tier.limit_total) {
      const inv = inventory[tier.id] || { limit: tier.limit_total, claimed: 0 };
      const reserved = Number(reservedCounts?.[tier.id] || 0);
      tiers[tier.id] = {
        name: tier.name,
        limit: inv.limit,
        claimed: inv.claimed,
        reserved,
        remaining: Math.max(0, inv.limit - inv.claimed - reserved)
      };
    }
  }
  
  // SEC-004: Inventory is public, use permissive CORS
  return cacheablePublicJsonResponse({
    campaignSlug,
    tiers,
    raw: Object.fromEntries(
      Object.entries(inventory || {}).map(([tierId, inv]) => [
        tierId,
        {
          ...inv,
          reserved: Number(reservedCounts?.[tierId] || 0)
        }
      ])
    )
  }, 200, env);
}

async function handleRecalculateInventory(request, campaignSlug, env) {
  // Require admin auth for recalculation (SEC-006)
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  if (!campaignSlug) {
    return jsonResponse({ error: 'Missing campaign slug' }, 400);
  }

  const campaign = await getCampaign(env, campaignSlug);
  if (!campaign) {
    return jsonResponse({ error: 'Campaign not found' }, 404);
  }

  const inventory = await recalculateTierInventory(env, campaignSlug, campaign.tiers || [], { repairIndex: true });
  
  return jsonResponse({
    success: true,
    message: 'Tier inventory recalculated',
    inventory
  });
}

async function handleInitAllInventory(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const { campaigns } = await getCampaigns(env);
  const results = { initialized: [], skipped: [], errors: [] };

  for (const campaign of campaigns) {
    try {
      // Check if inventory already exists
      const existing = await getTierInventory(env, campaign.slug);
      
      if (Object.keys(existing).length > 0) {
        results.skipped.push({ slug: campaign.slug, reason: 'Already initialized' });
        continue;
      }

      // Get tiers with limits
      const tiersWithLimits = (campaign.tiers || []).filter(t => t.limit_total);
      
      if (tiersWithLimits.length === 0) {
        results.skipped.push({ slug: campaign.slug, reason: 'No limited tiers' });
        continue;
      }

      // Recalculate from existing pledges
      const inventory = await recalculateTierInventory(env, campaign.slug, campaign.tiers || []);
      results.initialized.push({ 
        slug: campaign.slug, 
        tiers: Object.keys(inventory).length,
        inventory 
      });
    } catch (err) {
      results.errors.push({ slug: campaign.slug, error: err.message });
    }
  }

  return jsonResponse({
    success: true,
    message: 'Tier inventory initialization complete',
    ...results
  });
}

async function handleCheckAllProjectionDrift(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const { campaigns } = await getCampaigns(env);
  const results = [];

  for (const campaign of campaigns || []) {
    const drift = await checkCampaignProjectionDrift(env, campaign.slug, campaign);
    results.push(drift);
  }

  const driftedCampaigns = results.filter((entry) => !entry?.inSync);

  return jsonResponse({
    success: true,
    inSync: driftedCampaigns.length === 0,
    checkedCampaigns: results.length,
    driftedCampaigns: driftedCampaigns.map((entry) => entry.campaignSlug),
    results
  });
}

/**
 * Admin: Recover a missed Stripe checkout session
 * 
 * Use this when a webhook was missed (e.g., local dev Worker wasn't running).
 * Fetches the checkout session from Stripe and creates the pledge if not exists.
 * 
 * POST /admin/recover-checkout
 * Body: { sessionId: "cs_test_..." } or { orderId: "pledge-..." }
 */
async function handleRecoverCheckout(request, env) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const parsedBody = await parseJsonRequestBody(request, env, {
    maxBytes: MAX_STANDARD_JSON_BODY_BYTES
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body || {};

  const { sessionId, orderId } = body;
  
  if (!sessionId && !orderId) {
    return jsonResponse({ error: 'Missing sessionId or orderId' }, 400);
  }

  const stripe = createStripeClient(getStripeKey(env));
  
  try {
    let session;
    
    if (sessionId) {
      // Fetch by session ID
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } else {
      // Search for session by orderId in metadata
      const sessions = await stripe.checkout.sessions.list({ limit: 100 });
      session = sessions.data.find(s => s.metadata?.orderId === orderId);
      if (!session) {
        return jsonResponse({ error: 'No checkout session found with that orderId' }, 404);
      }
    }

    if (session.status !== 'complete') {
      return jsonResponse({ 
        error: 'Checkout session is not complete',
        status: session.status,
        sessionId: session.id
      }, 400);
    }

    if (session.mode !== 'setup') {
      return jsonResponse({ error: 'Session is not a setup mode session' }, 400);
    }

    const metadata = session.metadata || {};
    const pledgeOrderId = metadata.orderId;
    
    if (!pledgeOrderId) {
      return jsonResponse({ error: 'No orderId in session metadata' }, 400);
    }

    // Check if pledge already exists
    if (env.PLEDGES) {
      const existing = await env.PLEDGES.get(`pledge:${pledgeOrderId}`, { type: 'json' });
      if (existing) {
        await clearTierReservation(env, metadata.campaignSlug, pledgeOrderId);
        return jsonResponse({ 
          error: 'Pledge already exists',
          orderId: pledgeOrderId,
          pledge: existing
        }, 409);
      }
    }

    // Get setup intent details
    const setupIntentId = session.setup_intent;
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    const paymentMethodId = setupIntent.payment_method;
    const customerId = session.customer;
    const email = session.customer_email || session.customer_details?.email;

    const campaignSlug = metadata.campaignSlug;
    const amountCents = parseInt(metadata.amountCents) || 0;
    const tierId = metadata.tierId || null;
    const tierName = metadata.tierName || null;
    const tierQty = parseInt(metadata.tierQty) || 1;

    const campaign = await getCampaign(env, campaignSlug);
    const campaignTitle = campaign?.title || campaignSlug;

    const tipPercent = metadata.tipPercent === undefined || metadata.tipPercent === null || metadata.tipPercent === ''
      ? 0
      : sanitizePlatformTipPercent(
        metadata.tipPercent,
        getDefaultPlatformTipPercent(env),
        getMaxPlatformTipPercent(env)
      );

    let additionalTiers = [];
    if (metadata.hasAdditionalTiers === 'true' && env.PLEDGES) {
      additionalTiers = await env.PLEDGES.get(`pending-tiers:${pledgeOrderId}`, { type: 'json' }) || [];
    }

    let supportItems = [];
    let customAmount = 0;
    if (metadata.hasExtras === 'true' && env.PLEDGES) {
      const extras = await env.PLEDGES.get(`pending-extras:${pledgeOrderId}`, { type: 'json' });
      if (extras) {
        supportItems = extras.supportItems || [];
        customAmount = extras.customAmount || 0;
      }
    }

    const tierSelection = buildTierSelectionFromStartRequest(campaign, {
      tierId,
      tierQty,
      additionalTiers
    });
    if (!tierSelection.valid) {
      return jsonResponse({ error: tierSelection.error }, 409);
    }

    const thresholdValidation = await validateTierThresholdSelection(
      env,
      campaignSlug,
      campaign,
      tierSelection.selectedTiers
    );
    if (!thresholdValidation.valid) {
      return jsonResponse({ error: thresholdValidation.error }, 409);
    }

    const desiredSupportItems = buildDesiredSupportItems(campaign, [], supportItems);
    if (!desiredSupportItems.valid) {
      return jsonResponse({ error: desiredSupportItems.error }, 409);
    }

    const canonicalContribution = await buildCanonicalContribution(env, campaign, {
      tierSelection,
      supportItems: desiredSupportItems.supportItems,
      customAmount,
      tipPercent,
      shippingOption: metadata.shippingOption || 'standard'
    });
    if (!canonicalContribution.valid) {
      return jsonResponse({ error: canonicalContribution.error }, 409);
    }

    const availability = await ensureTierAvailability(
      env,
      campaignSlug,
      campaign,
      canonicalContribution.selectedTiers,
      {},
      pledgeOrderId
    );
    if (!availability.valid) {
      return jsonResponse({ error: availability.error }, 409);
    }

    const pledge = {
      orderId: pledgeOrderId,
      email,
      campaignSlug,
      preferredLang: normalizePreferredLang(metadata.preferredLang, DEFAULT_I18N_LANG),
      tierId: canonicalContribution.tierId,
      tierName: canonicalContribution.tierName,
      tierQty: canonicalContribution.tierQty,
      additionalTiers: canonicalContribution.additionalTiers.length > 0 ? canonicalContribution.additionalTiers : undefined,
      supportItems: canonicalContribution.supportItems.length > 0 ? canonicalContribution.supportItems : undefined,
      customAmount: canonicalContribution.customAmount > 0 ? canonicalContribution.customAmount : undefined,
      shippingOption: canonicalContribution.shippingOption || 'standard',
      subtotal: canonicalContribution.totals.subtotal,
      tax: canonicalContribution.totals.tax,
      taxDetails: canonicalContribution.totals.taxDetails,
      shipping: canonicalContribution.totals.shipping,
      tipPercent: canonicalContribution.totals.tipPercent,
      tipAmount: canonicalContribution.totals.tipAmount,
      amount: canonicalContribution.totals.amount,
      stripeCustomerId: customerId,
      stripePaymentMethodId: paymentMethodId,
      stripeSetupIntentId: setupIntentId,
      pledgeStatus: 'active',
      charged: false,
      createdAt: new Date(session.created * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
      recoveredAt: new Date().toISOString()
    };

    if (env.PLEDGES) {
      const persisted = await persistNewPledge(env, {
        campaign,
        campaignSlug,
        pledgeData: pledge,
        supportItems: canonicalContribution.supportItems,
        selectedTiers: canonicalContribution.selectedTiers
      });
      if (!persisted.success) {
        return jsonResponse({ error: persisted.error }, 409);
      }
    }

    // Optionally send confirmation email
    const sendEmail = body.sendEmail !== false;
    if (sendEmail && email) {
      try {
        const token = await generateToken(env.MAGIC_LINK_SECRET, {
          orderId: pledgeOrderId,
          email,
          campaignSlug
        });
        
        const emailNonce = await consumeSupporterEmailNonce(env, pledgeOrderId);
        if (emailNonce.fresh) {
          const emailResult = await attemptSupporterEmailDelivery(env, {
            orderId: pledgeOrderId,
            payload: {
              email,
              campaignTitle,
              campaignSlug,
              preferredLang: pledge.preferredLang,
              subtotal: canonicalContribution.totals.subtotal,
              tax: canonicalContribution.totals.tax,
              taxDetails: canonicalContribution.totals.taxDetails,
              shipping: canonicalContribution.totals.shipping,
              tipAmount: canonicalContribution.totals.tipAmount,
              tipPercent: canonicalContribution.totals.tipPercent,
              token,
              instagramUrl: campaign?.instagram,
              hasDecisions: campaign?.has_decisions === true,
              pledgeItems: {
                tierName: canonicalContribution.tierName || null,
                tierQty: canonicalContribution.tierQty || 1,
                additionalTiers: canonicalContribution.additionalTiers.map(t => ({
                  ...t,
                  name: campaign?.tiers?.find(ct => ct.id === t.id)?.name || t.id
                })),
                supportItems: getSupportItemsWithLabels(campaign, canonicalContribution.supportItems),
                customAmount: canonicalContribution.customAmount
              }
            }
          });
          pledge.emailSent = emailResult.ok;
          pledge.emailError = emailResult.ok ? null : emailResult.error;
        }
      } catch (emailErr) {
        console.error('Failed to send recovery email:', emailErr.message);
        pledge.emailError = emailErr.message;
      }
    }

    return jsonResponse({
      success: true,
      message: 'Pledge recovered from Stripe checkout session',
      pledge,
      stripeSessionId: session.id
    });

  } catch (err) {
    console.error('Recovery error:', err);
    return jsonResponse({ 
      error: 'Failed to recover checkout session',
      details: err.message 
    }, 500);
  }
}

// SEC-004 & SEC-012: Response helpers use imported getAllowedOrigin and SECURITY_HEADERS from validation.js

const PUBLIC_READ_CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=300';

function jsonResponse(data, status = 200, env = null, isPublic = false, extraHeaders = {}) {
  const origin = getAllowedOrigin(env, isPublic);
  const credentialHeaders = origin && origin !== '*'
    ? { 'Access-Control-Allow-Credentials': 'true' }
    : {};
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key, x-pool-admin-csrf',
      ...credentialHeaders,
      ...extraHeaders,
      ...SECURITY_HEADERS
    }
  });
}

function privateJsonResponse(data, status = 200, env = null, extraHeaders = {}) {
  return jsonResponse(data, status, env, false, {
    'Cache-Control': PRIVATE_NO_STORE_CACHE_CONTROL,
    ...extraHeaders
  });
}

function cacheablePublicJsonResponse(data, status = 200, env = null) {
  return jsonResponse(data, status, env, true, {
    'Cache-Control': PUBLIC_READ_CACHE_CONTROL
  });
}

function corsResponse(env = null, isPublic = false) {
  const origin = getAllowedOrigin(env, isPublic);
  const credentialHeaders = origin && origin !== '*'
    ? { 'Access-Control-Allow-Credentials': 'true' }
    : {};
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key, x-pool-admin-csrf',
      ...credentialHeaders,
      ...SECURITY_HEADERS
    }
  });
}
