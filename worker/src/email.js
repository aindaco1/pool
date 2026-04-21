/**
 * Resend Email Integration for The Pool
 *
 * Sends supporter access emails with magic links for:
 * - /manage/ — Pledge management (cancel, modify, update payment)
 * - /community/:slug/ — Supporter-only voting/decisions
 */

import {
  DEFAULT_SITE_BASE,
  getEmailBorderColor,
  getEmailButtonRadius,
  getEmailFontFamily,
  getEmailHeadingFontFamily,
  getEmailLogoPath,
  getEmailMutedTextColor,
  getEmailPrimaryColor,
  getEmailSurfaceColor,
  getEmailTextColor,
  getCampaignRunnerEmailSubjectPrefix,
  getPlatformCompanyName,
  getPlatformName,
  getPledgesEmailFrom,
  getSiteBase,
  getSupportEmail,
  getUpdatesEmailFrom
} from './provider-config.js';
import { getScopedConsole } from './logger.js';

const FALLBACK_SITE_BASE = DEFAULT_SITE_BASE;
const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const SAFE_INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com']);
const DEFAULT_I18N_LANG = 'en';
const EMAIL_I18N_CACHE = new Map();
let console = globalThis.console;

function configureEmailLogging(env) {
  console = getScopedConsole(env, 'email');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatEmailText(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function decodeHtmlEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function buildPlainTextFromHtml(html) {
  return decodeHtmlEntities(
    String(html ?? '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href, text) => {
        const label = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return label ? `${label} (${href})` : href;
      })
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<(br|\/p|\/div|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  );
}

function normalizeLang(value, fallback = DEFAULT_I18N_LANG) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(normalized) ? normalized : fallback;
}

function interpolateTemplate(template, replacements = {}) {
  let result = String(template || '');
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`%{${key}}`, String(value ?? ''));
  }
  return result;
}

function getNestedValue(source, key) {
  return String(key || '')
    .split('.')
    .reduce((value, segment) => (value && typeof value === 'object' ? value[segment] : undefined), source);
}

async function loadEmailCatalog(env = {}) {
  if (env.I18N_CATALOG && typeof env.I18N_CATALOG === 'object') {
    return env.I18N_CATALOG;
  }

  if (env.I18N_CATALOG_JSON) {
    const cacheKey = `json:${env.I18N_CATALOG_JSON}`;
    if (!EMAIL_I18N_CACHE.has(cacheKey)) {
      EMAIL_I18N_CACHE.set(cacheKey, Promise.resolve().then(() => JSON.parse(String(env.I18N_CATALOG_JSON || '{}'))).catch(() => ({})));
    }
    return EMAIL_I18N_CACHE.get(cacheKey);
  }

  const siteBase = getResolvedSiteBase(env);
  const cacheKey = `site:${siteBase}`;
  if (!EMAIL_I18N_CACHE.has(cacheKey)) {
    EMAIL_I18N_CACHE.set(cacheKey, (async () => {
      try {
        const response = await fetch(safeSiteUrl('/assets/i18n.json', siteBase));
        if (!response.ok) return {};
        return await response.json();
      } catch (_error) {
        return {};
      }
    })());
  }
  return EMAIL_I18N_CACHE.get(cacheKey);
}

async function getEmailTranslator(env, preferredLang) {
  const lang = normalizeLang(preferredLang);
  const catalog = await loadEmailCatalog(env);

  return {
    lang,
    t(key, fallback, replacements = {}) {
      const localized = getNestedValue(catalog?.[lang]?.email, key);
      const defaultValue = getNestedValue(catalog?.[DEFAULT_I18N_LANG]?.email, key);
      return interpolateTemplate(localized ?? defaultValue ?? fallback ?? key, replacements);
    }
  };
}

function getLocalizedPath(path, preferredLang = DEFAULT_I18N_LANG) {
  const lang = normalizeLang(preferredLang);
  const normalizedPath = String(path || '/').startsWith('/') ? String(path || '/') : `/${String(path || '')}`;
  return lang === DEFAULT_I18N_LANG ? normalizedPath : `/${lang}${normalizedPath}`;
}

function getResolvedSiteBase(siteBaseOrEnv) {
  const siteBase = typeof siteBaseOrEnv === 'string'
    ? siteBaseOrEnv
    : getSiteBase(siteBaseOrEnv || {});
  try {
    return new URL(siteBase || FALLBACK_SITE_BASE).toString();
  } catch (_error) {
    return FALLBACK_SITE_BASE;
  }
}

function getEmailAssetBase(siteBase) {
  try {
    const resolved = new URL(getResolvedSiteBase(siteBase));
    const hostname = resolved.hostname.toLowerCase();
    const isLocalHost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1';

    if (resolved.protocol !== 'https:' || isLocalHost) {
      return FALLBACK_SITE_BASE;
    }

    return resolved.toString();
  } catch (_error) {
    return FALLBACK_SITE_BASE;
  }
}

function getSiteRootUrl(siteBase) {
  return getResolvedSiteBase(siteBase);
}

function safeSiteUrl(pathOrUrl, siteBase) {
  const base = getResolvedSiteBase(siteBase);
  try {
    const baseUrl = new URL(base);
    const resolved = new URL(pathOrUrl || '/', baseUrl);
    if (!SAFE_LINK_PROTOCOLS.has(resolved.protocol)) {
      return base;
    }
    if (resolved.origin !== baseUrl.origin) {
      return base;
    }
    return resolved.toString();
  } catch (_error) {
    return base;
  }
}

function safeExternalUrl(pathOrUrl, siteBase) {
  if (!pathOrUrl) return '';
  try {
    const resolved = new URL(pathOrUrl, getResolvedSiteBase(siteBase));
    if (!SAFE_LINK_PROTOCOLS.has(resolved.protocol)) {
      return '';
    }
    return resolved.toString();
  } catch (_error) {
    return '';
  }
}

function safeInstagramUrl(instagramUrl) {
  if (!instagramUrl) return '';
  try {
    const resolved = new URL(instagramUrl);
    if (resolved.protocol !== 'https:') {
      return '';
    }
    const hostname = resolved.hostname.toLowerCase();
    if (!SAFE_INSTAGRAM_HOSTS.has(hostname)) {
      return '';
    }
    return resolved.toString();
  } catch (_error) {
    return '';
  }
}

function parseHexColor(value) {
  const normalized = String(value || '').trim();
  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    return normalized
      .slice(1)
      .split('')
      .map((char) => parseInt(char + char, 16));
  }
  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return [
      parseInt(normalized.slice(1, 3), 16),
      parseInt(normalized.slice(3, 5), 16),
      parseInt(normalized.slice(5, 7), 16)
    ];
  }
  return null;
}

function getAccessibleButtonTextColor(backgroundColor, fallback = '#ffffff') {
  const channels = parseHexColor(backgroundColor);
  if (!channels) return fallback;
  const [red, green, blue] = channels.map((channel) => channel / 255);
  const linear = [red, green, blue].map((channel) => (
    channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  ));
  const luminance = (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
  return luminance > 0.5 ? '#111111' : '#ffffff';
}

function getEmailTheme(env = {}) {
  const primaryColor = getEmailPrimaryColor(env);
  const siteBase = getResolvedSiteBase(env);
  const logoPath = getEmailLogoPath(env);
  const resolvedLogoUrl = logoPath ? safeSiteUrl(logoPath, getEmailAssetBase(siteBase)) : '';
  const siteHomeUrl = getSiteRootUrl(siteBase);

  return {
    siteHomeUrl,
    logoUrl: resolvedLogoUrl && resolvedLogoUrl !== siteHomeUrl ? resolvedLogoUrl : '',
    platformName: escapeHtml(getPlatformName(env)),
    fontFamily: escapeHtml(getEmailFontFamily(env)),
    headingFontFamily: escapeHtml(getEmailHeadingFontFamily(env)),
    textColor: escapeHtml(getEmailTextColor(env)),
    mutedTextColor: escapeHtml(getEmailMutedTextColor(env)),
    surfaceColor: escapeHtml(getEmailSurfaceColor(env)),
    borderColor: escapeHtml(getEmailBorderColor(env)),
    primaryColor: escapeHtml(primaryColor),
    buttonRadius: escapeHtml(getEmailButtonRadius(env)),
    primaryTextColor: getAccessibleButtonTextColor(primaryColor)
  };
}

function renderEmailHeader(theme, heading, { emoji = '', headingColor = '' } = {}) {
  const logoBlock = theme.logoUrl ? `
    <p style="margin: 0 0 16px 0;">
      <a href="${theme.siteHomeUrl}" style="text-decoration: none;">
        <img src="${theme.logoUrl}" alt="${theme.platformName}" style="display: inline-block; max-width: 88px; max-height: 88px; width: auto; height: auto;">
      </a>
    </p>
  ` : '';
  const emojiBlock = emoji ? `<div style="font-size: 48px; margin-bottom: 16px;">${emoji}</div>` : '';
  const resolvedHeadingColor = headingColor ? ` color: ${headingColor};` : '';
  return `
  <div style="text-align: center; margin-bottom: 32px;">
    ${logoBlock}
    ${emojiBlock}
    <h1 style="margin: 0; font-size: 24px; font-family: ${theme.headingFontFamily};${resolvedHeadingColor}">${heading}</h1>
  </div>`;
}

function getEmailBodyStyle(theme) {
  return `font-family: ${theme.fontFamily}; line-height: 1.6; color: ${theme.textColor}; max-width: 600px; margin: 0 auto; padding: 20px;`;
}

function getEmailCardStyle(theme, extras = '') {
  return `background: ${theme.surfaceColor}; border-radius: 8px; padding: 20px; margin-bottom: 24px;${extras ? ` ${extras}` : ''}`;
}

function getEmailPrimaryButtonStyle(theme, extras = '') {
  return `display: inline-block; background: ${theme.primaryColor}; color: ${theme.primaryTextColor}; padding: 12px 24px; text-decoration: none; border-radius: ${theme.buttonRadius}; font-weight: 600;${extras ? ` ${extras}` : ''}`;
}

function getEmailSecondaryButtonStyle(theme, extras = '') {
  return `display: inline-block; background: #fff; color: ${theme.primaryColor}; padding: 12px 24px; text-decoration: none; border-radius: ${theme.buttonRadius}; font-weight: 600; border: 1px solid ${theme.primaryColor};${extras ? ` ${extras}` : ''}`;
}

function getEmailFooterStyle(theme) {
  return `border-top: 1px solid ${theme.borderColor}; padding-top: 20px; font-size: 12px; color: ${theme.mutedTextColor};`;
}

function buildResendPayload(env, payload) {
  const replyTo = String(getSupportEmail(env) || '').trim();
  return {
    ...payload,
    ...(replyTo ? { reply_to: replyTo } : {}),
    text: payload.text || buildPlainTextFromHtml(payload.html)
  };
}

async function sendResendEmail(env, payload, { errorLabel = 'Resend error', failureLabel = 'Failed to send email' } = {}) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(buildResendPayload(env, payload))
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`${errorLabel}:`, error);
    throw new Error(`${failureLabel}: ${response.status}`);
  }

  return response.json();
}

// Instagram CTA block for emails (when campaign has instagram field)
function getInstagramCTA(instagramUrl, siteBase = FALLBACK_SITE_BASE, t = (_key, fallback) => fallback, { variant = 'prominent', theme = null } = {}) {
  const safeInstagramHref = safeInstagramUrl(instagramUrl);
  if (!safeInstagramHref) return '';
  const borderColor = theme?.borderColor || '#eee';
  const mutedTextColor = theme?.mutedTextColor || '#666';
  const linkColor = theme?.primaryColor || '#000';

  if (variant === 'subtle') {
    return `
  <div style="margin: 24px 0 0 0; padding-top: 16px; border-top: 1px solid ${borderColor}; font-size: 13px; color: ${mutedTextColor};">
    <p style="margin: 0 0 8px 0;">${escapeHtml(t('common.instagram_optional', 'Optional: help spread the word on Instagram.'))}</p>
    <a href="${safeInstagramHref}" style="color: ${linkColor}; text-decoration: underline;">${escapeHtml(t('common.instagram_share_secondary', 'Share this campaign on Instagram'))}</a>
  </div>`;
  }

  // Instagram logo hosted on our own domain (third-party URLs trigger Gmail spam filters)
  const instagramIcon = `<img src="${safeSiteUrl('/assets/images/instagram-white.png', getEmailAssetBase(siteBase))}" alt="Instagram" width="20" height="20" style="vertical-align: middle; margin-right: 8px;">`;

  return `
  <div style="background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); border-radius: 8px; padding: 16px 20px; margin: 24px 0; text-align: center;">
    <a href="${safeInstagramHref}" style="color: #fff; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; justify-content: center;">
      ${instagramIcon}
      <span>${escapeHtml(t('common.instagram_share', 'Share this campaign on Instagram'))}</span>
    </a>
    <p style="margin: 8px 0 0 0; font-size: 13px; color: rgba(255,255,255,0.9);">${escapeHtml(t('common.instagram_help', 'Help spread the word on Instagram'))}</p>
  </div>`;
}

// Render pledge items (tiers, support items, custom amount) for email display
function getShippingOptionEmailLabel(optionId, t = (_key, fallback) => fallback) {
  const normalized = String(optionId || 'standard').trim().toLowerCase() || 'standard';
  switch (normalized) {
    case 'signature_required':
      return t('common.shipping_option_signature_required', 'Signature required');
    case 'adult_signature_required':
      return t('common.shipping_option_adult_signature_required', 'Adult signature required');
    case 'standard':
    default:
      return t('common.shipping_option_standard', 'Standard');
  }
}

function renderPledgeItems(
  { tierName, tierQty, additionalTiers = [], supportItems = [], addOns = [], customAmount = 0, shippingOption = '' },
  t = (_key, fallback) => fallback,
  theme = { borderColor: '#e5e5e5', mutedTextColor: '#555555', textColor: '#333333' }
) {
  const items = [];
  
  // Main tier
  if (tierName) {
    const qtyText = tierQty > 1 ? ` × ${tierQty}` : '';
    items.push(`<li style="margin: 4px 0;">${escapeHtml(tierName)}${qtyText}</li>`);
  }
  
  // Additional tiers
  for (const tier of additionalTiers) {
    if (tier.name) {
      const qtyText = tier.qty > 1 ? ` × ${tier.qty}` : '';
      items.push(`<li style="margin: 4px 0;">${escapeHtml(tier.name)}${qtyText}</li>`);
    }
  }
  
  // Support items
  for (const item of supportItems) {
    if (item.label && item.amount > 0) {
      items.push(`<li style="margin: 4px 0;">${escapeHtml(item.label)}: $${item.amount.toFixed(2)}</li>`);
    }
  }

  for (const addOn of addOns) {
    if (!addOn.label && !addOn.name) continue;
    const label = addOn.label || addOn.name;
    const qty = Number(addOn.qty || addOn.quantity || 1);
    const variantLabel = addOn.variantLabel ? ` (${addOn.variantLabel})` : '';
    const qtyText = qty > 1 ? ` × ${qty}` : '';
    items.push(`<li style="margin: 4px 0;">${escapeHtml(label)}${escapeHtml(variantLabel)}${qtyText}</li>`);
  }
  
  // Custom amount
  if (customAmount > 0) {
    items.push(`<li style="margin: 4px 0;">${escapeHtml(t('common.additional_support', 'Additional support'))}: $${customAmount.toFixed(2)}</li>`);
  }

  if (shippingOption) {
    items.push(
      `<li style="margin: 4px 0;">${escapeHtml(t('common.delivery_option', 'Delivery option'))}: ${escapeHtml(getShippingOptionEmailLabel(shippingOption, t))}</li>`
    );
  }
  
  if (items.length === 0) return '';
  
  return `
  <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid ${theme.borderColor};">
    <p style="margin: 0 0 8px 0; font-weight: 600; font-size: 14px; color: ${theme.textColor};">${escapeHtml(t('common.pledge_includes', 'Your pledge includes:'))}</p>
    <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: ${theme.mutedTextColor};">
      ${items.join('\n      ')}
    </ul>
  </div>`;
}

function formatTaxRatePercent(rate) {
  return (Math.max(0, Number(rate) || 0) * 100).toFixed(3).replace(/\.?0+$/, '');
}

function renderTaxLabel(taxDetails, t = (_key, fallback) => fallback) {
  const effectiveRate = Math.max(0, Number(taxDetails?.effectiveRate) || 0);
  const country = String(
    taxDetails?.destination?.country ||
    taxDetails?.jurisdiction?.country ||
    ''
  ).trim().toUpperCase();

  if (effectiveRate > 0 && country === 'US') {
    return escapeHtml(t('common.sales_tax_label', 'Sales tax (%{rate}%)', {
      rate: formatTaxRatePercent(effectiveRate)
    }));
  }

  if (effectiveRate > 0) {
    return escapeHtml(t('common.tax_label_with_rate', 'Tax (%{rate}%)', {
      rate: formatTaxRatePercent(effectiveRate)
    }));
  }

  return escapeHtml(t('common.tax_label', 'Tax'));
}

function renderAmountBreakdown(env, { subtotal = 0, tax = 0, taxDetails = null, shipping = 0, tipAmount = 0, tipPercent = 0, totalLabel, totalAmount }, t = (_key, fallback) => fallback) {
  const resolvedTotal = totalAmount ?? (subtotal + tax + shipping + tipAmount);
  const taxLabel = renderTaxLabel(taxDetails, t);
  const safeTotalLabel = escapeHtml(totalLabel);
  const subtotalLabel = escapeHtml(t('common.subtotal', 'Subtotal'));
  const shippingLabel = escapeHtml(t('common.shipping', 'Shipping'));
  const tipLabel = tipPercent > 0
    ? escapeHtml(t('common.tip_with_percent', '%{platform} tip (%{percent}%): $%{amount}', {
        platform: getPlatformCompanyName(env),
        percent: tipPercent,
        amount: (tipAmount / 100).toFixed(2)
      }))
    : escapeHtml(t('common.tip_without_percent', '%{platform} tip: $%{amount}', {
        platform: getPlatformCompanyName(env),
        amount: (tipAmount / 100).toFixed(2)
      }));
  return `
    <p style="margin: 0 0 4px 0;">${subtotalLabel}: $${(subtotal / 100).toFixed(2)}</p>
    ${tipAmount > 0 ? `<p style="margin: 0 0 4px 0;">${tipLabel}</p>` : ''}
    <p style="margin: 0 0 4px 0;">${taxLabel}: $${(tax / 100).toFixed(2)}</p>
    ${shipping > 0 ? `<p style="margin: 0 0 4px 0;">${shippingLabel}: $${(shipping / 100).toFixed(2)}</p>` : ''}
    <p style="margin: 0 0 8px 0;"><strong>${safeTotalLabel}: $${(resolvedTotal / 100).toFixed(2)}</strong></p>
  `.trim();
}

/**
 * Send supporter confirmation email after successful pledge
 */
export async function sendSupporterEmail(env, { email, campaignSlug, campaignTitle, subtotal, tax = 0, taxDetails = null, shipping = 0, tipAmount = 0, tipPercent = 0, token, instagramUrl, pledgeItems, hasDecisions, preferredLang }) {
  configureEmailLogging(env);
  const { t } = await getEmailTranslator(env, preferredLang);
  const theme = getEmailTheme(env);
  const manageUrl = safeSiteUrl(`${getLocalizedPath('/manage/', preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const communityUrl = safeSiteUrl(`${getLocalizedPath(`/community/${encodeURIComponent(campaignSlug)}/`, preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const siteHomeUrl = theme.siteHomeUrl;
  const platformName = theme.platformName;
  const instagramCTA = getInstagramCTA(instagramUrl, env.SITE_BASE, t, { variant: 'subtle', theme });
  const pledgeItemsHtml = pledgeItems ? renderPledgeItems(pledgeItems, t, theme) : '';
  const amountBreakdownHtml = renderAmountBreakdown(env, {
    subtotal,
    tax,
    taxDetails,
    shipping,
    tipAmount,
    tipPercent,
    totalLabel: t('common.total_if_funded', 'Total (if funded)')
  }, t);
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="${getEmailBodyStyle(theme)}">
  ${renderEmailHeader(theme, escapeHtml(t('supporter.thanks_heading', 'Thanks for backing %{campaign}!', { campaign: campaignTitle })))}
  
  <div style="${getEmailCardStyle(theme)}">
    ${amountBreakdownHtml}
    ${pledgeItemsHtml}
    <p style="margin: 12px 0 0 0; color: ${theme.mutedTextColor}; font-size: 14px;">
      <strong>${escapeHtml(t('common.remember', 'Remember:'))}</strong> ${escapeHtml(t('supporter.card_saved_notice', "Your card is saved but won't be charged unless this campaign reaches its goal."))}
    </p>
  </div>
  
  <div style="margin-bottom: 32px;">
    <h2 style="font-size: 18px; margin: 0 0 16px 0;">${escapeHtml(t('common.your_supporter_access', 'Your Supporter Access'))}</h2>
    <p style="margin: 0 0 16px 0;">${escapeHtml(t('common.no_account_needed_keys', 'No account needed — these links are your keys:'))}</p>
    
    <div style="margin-bottom: 12px;">
      <a href="${manageUrl}" style="${getEmailPrimaryButtonStyle(theme)}">
        ${escapeHtml(t('common.manage_your_pledge', 'Manage Your Pledge'))}
      </a>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: ${theme.mutedTextColor};">${escapeHtml(t('common.manage_your_pledge_desc', 'Cancel, modify amount, or update payment method'))}</p>
    </div>
    
    ${hasDecisions !== false ? `<div style="margin-bottom: 12px;">
      <a href="${communityUrl}" style="${getEmailSecondaryButtonStyle(theme)}">
        ${escapeHtml(t('common.supporter_community', 'Supporter Community'))}
      </a>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: ${theme.mutedTextColor};">${escapeHtml(t('common.supporter_community_vote_desc', 'Vote on creative decisions for this project'))}</p>
    </div>` : ''}
  </div>
  
  ${instagramCTA}
  
  <div style="${getEmailFooterStyle(theme)}">
    <p style="margin: 0 0 8px 0;"><strong>${escapeHtml(t('common.save_this_email', 'Save this email!'))}</strong> ${escapeHtml(t('supporter.save_links_notice', "You'll need these links to manage your pledge."))}</p>
    <p style="margin: 0;">${escapeHtml(t('common.questions_prefix', 'Questions? Reply to this email or visit'))} <a href="${siteHomeUrl}" style="color: ${theme.primaryColor};">${platformName}</a>.</p>
  </div>
</body>
</html>
  `.trim();

  return sendResendEmail(env, {
    from: getPledgesEmailFrom(env),
    to: email,
    subject: t('subjects.pledge_confirmed', 'Your pledge to %{campaign}', { campaign: campaignTitle }),
    html
  });
}

/**
 * Send pledge modification confirmation email
 */
export async function sendPledgeModifiedEmail(env, { email, campaignSlug, campaignTitle, previousSubtotal, previousTax = 0, previousShipping = 0, previousTipAmount = 0, newSubtotal, tax = 0, taxDetails = null, shipping = 0, tipAmount = 0, tipPercent = 0, token, instagramUrl, pledgeItems, preferredLang }) {
  configureEmailLogging(env);
  const { t } = await getEmailTranslator(env, preferredLang);
  const theme = getEmailTheme(env);
  const manageUrl = safeSiteUrl(`${getLocalizedPath('/manage/', preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const siteHomeUrl = theme.siteHomeUrl;
  const platformName = theme.platformName;
  const previousTotal = previousSubtotal + previousTax + previousShipping + previousTipAmount;
  const newTotal = newSubtotal + tax + shipping + tipAmount;
  const increased = newTotal > previousTotal;
  const diff = Math.abs(newTotal - previousTotal);
  const tipChanged = Number(previousTipAmount || 0) !== Number(tipAmount || 0);
  const tipDelta = Number(tipAmount || 0) - Number(previousTipAmount || 0);
  const instagramCTA = getInstagramCTA(instagramUrl, env.SITE_BASE, t, { variant: 'subtle', theme });
  const pledgeItemsHtml = pledgeItems ? renderPledgeItems(pledgeItems, t, theme) : '';
  const amountBreakdownHtml = renderAmountBreakdown(env, {
    subtotal: newSubtotal,
    tax,
    taxDetails,
    shipping,
    tipAmount,
    tipPercent,
    totalLabel: t('common.new_total_if_funded', 'New total (if funded)'),
    totalAmount: newTotal
  }, t);
  const tipChangeHtml = tipChanged ? `
    <p style="margin: 0 0 8px 0;"><strong>${escapeHtml(t('modified.tip_changed', '%{platform} tip changed:', {
      platform: getPlatformCompanyName(env)
    }))}</strong> $${(previousTipAmount / 100).toFixed(2)} → $${(tipAmount / 100).toFixed(2)} (${tipDelta >= 0 ? '+' : '-'}$${(Math.abs(tipDelta) / 100).toFixed(2)}, ${escapeHtml(String(tipPercent))}%)</p>
  ` : '';
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="${getEmailBodyStyle(theme)}">
  ${renderEmailHeader(theme, escapeHtml(t('modified.heading', 'Pledge Updated')))}
  
  <div style="${getEmailCardStyle(theme)}">
    <p style="margin: 0 0 8px 0;"><strong>${escapeHtml(t('common.campaign_label', 'Campaign:'))}</strong> ${escapeHtml(campaignTitle)}</p>
    <p style="margin: 0 0 8px 0;"><strong>${escapeHtml(t('common.previous_total_if_funded', 'Previous total (if funded):'))}</strong> $${(previousTotal / 100).toFixed(2)}</p>
    <p style="margin: 0 0 8px 0;"><strong>${escapeHtml(t('common.updated_total_if_funded', 'Updated total (if funded):'))}</strong> $${(newTotal / 100).toFixed(2)} (${increased ? '+' : '-'}$${(diff / 100).toFixed(2)})</p>
    ${tipChangeHtml}
    ${amountBreakdownHtml}
    ${pledgeItemsHtml}
    <p style="margin: 12px 0 0 0; color: ${theme.mutedTextColor}; font-size: 14px;">
      <strong>${escapeHtml(t('common.remember', 'Remember:'))}</strong> ${escapeHtml(t('supporter.card_saved_notice', "Your card is saved but won't be charged unless this campaign reaches its goal."))}
    </p>
  </div>
  
  <div style="margin-bottom: 32px;">
    <p style="margin: 0 0 16px 0;">${escapeHtml(t('modified.success_body', 'Your pledge has been successfully updated. You can manage your pledge anytime using the link below:'))}</p>
    
    <div style="margin-bottom: 12px;">
      <a href="${manageUrl}" style="${getEmailPrimaryButtonStyle(theme)}">
        ${escapeHtml(t('common.manage_your_pledge', 'Manage Your Pledge'))}
      </a>
    </div>
  </div>
  
  ${instagramCTA}
  
  <div style="${getEmailFooterStyle(theme)}">
    <p style="margin: 0;">${escapeHtml(t('common.questions_prefix', 'Questions? Reply to this email or visit'))} <a href="${siteHomeUrl}" style="color: ${theme.primaryColor};">${platformName}</a>.</p>
  </div>
</body>
</html>
  `.trim();

  return sendResendEmail(env, {
    from: getPledgesEmailFrom(env),
    to: email,
    subject: t('subjects.pledge_updated', 'Pledge updated for %{campaign}', { campaign: campaignTitle }),
    html
  });
}

/**
 * Send payment failure notification
 */
export async function sendPaymentFailedEmail(env, { email, campaignSlug, campaignTitle, subtotal, tax, taxDetails = null, shipping = 0, tipAmount = 0, tipPercent = 0, amount, token, pledgeItems, preferredLang }) {
  configureEmailLogging(env);
  const { t } = await getEmailTranslator(env, preferredLang);
  const theme = getEmailTheme(env);
  const manageUrl = safeSiteUrl(`${getLocalizedPath('/manage/', preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const pledgeItemsHtml = pledgeItems ? renderPledgeItems(pledgeItems, t, theme) : '';
  const amountBreakdownHtml = renderAmountBreakdown(env, {
    subtotal,
    tax,
    taxDetails,
    shipping,
    tipAmount,
    tipPercent,
    totalLabel: t('common.amount_due', 'Amount due'),
    totalAmount: amount
  }, t);
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="${getEmailBodyStyle(theme)}">
  ${renderEmailHeader(theme, escapeHtml(t('payment_failed.heading', 'Action Required')), { headingColor: '#dc3545' })}
  
  <div style="background: #fff3cd; border-radius: 8px; padding: 20px; margin-bottom: 24px; border: 1px solid #ffc107;">
    <p style="margin: 0 0 12px 0;">
      ${escapeHtml(t('payment_failed.intro', 'We tried to charge your card for your pledge to %{campaign}, but the payment failed.', { campaign: campaignTitle }))}
    </p>
    ${amountBreakdownHtml}
    ${pledgeItemsHtml}
  </div>
  
  <p>${escapeHtml(t('payment_failed.processing_body', "The campaign has been funded and we're processing charges. Please update your payment method to complete your pledge:"))}</p>
  
  <div style="text-align: center; margin: 24px 0;">
    <a href="${manageUrl}" style="${getEmailPrimaryButtonStyle(theme)}">
      ${escapeHtml(t('common.update_payment_method', 'Update Payment Method'))}
    </a>
  </div>
  
  <div style="${getEmailFooterStyle(theme)}">
    <p style="margin: 0;">${escapeHtml(t('payment_failed.footer', 'If you have questions, reply to this email.'))}</p>
  </div>
</body>
</html>
  `.trim();

  return sendResendEmail(env, {
    from: getPledgesEmailFrom(env),
    to: email,
    subject: t('subjects.payment_failed', 'Action needed: Update payment for %{campaign}', { campaign: campaignTitle }),
    html
  });
}

/**
 * Send charge success email after campaign settlement
 */
export async function sendChargeSuccessEmail(env, { email, campaignSlug, campaignTitle, subtotal, tax, taxDetails = null, shipping = 0, tipAmount = 0, tipPercent = 0, amount, token, pledgeItems, hasDecisions, preferredLang }) {
  configureEmailLogging(env);
  const { t } = await getEmailTranslator(env, preferredLang);
  const theme = getEmailTheme(env);
  const manageUrl = safeSiteUrl(`${getLocalizedPath('/manage/', preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const communityUrl = safeSiteUrl(`${getLocalizedPath(`/community/${encodeURIComponent(campaignSlug)}/`, preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const siteHomeUrl = theme.siteHomeUrl;
  const platformName = theme.platformName;
  const pledgeItemsHtml = pledgeItems ? renderPledgeItems(pledgeItems, t, theme) : '';
  const amountBreakdownHtml = renderAmountBreakdown(env, {
    subtotal,
    tax,
    taxDetails,
    shipping,
    tipAmount,
    tipPercent,
    totalLabel: t('common.amount_charged', 'Amount charged'),
    totalAmount: amount
  }, t);
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="${getEmailBodyStyle(theme)}">
  ${renderEmailHeader(theme, escapeHtml(t('charge_success.heading', 'Payment Successful!')), { headingColor: '#059669' })}
  
  <div style="background: #f0fdf4; border-radius: 8px; padding: 20px; margin-bottom: 24px; border: 1px solid #bbf7d0;">
    <p style="margin: 0 0 12px 0;">${escapeHtml(t('charge_success.funded_intro', '%{campaign} has been fully funded!', { campaign: campaignTitle }))}</p>
    ${amountBreakdownHtml}
    ${pledgeItemsHtml}
  </div>
  
  <p>${escapeHtml(t('charge_success.success_body', 'Your pledge has been successfully charged. Thank you for helping make this project happen!'))}</p>
  
  <div style="margin-bottom: 32px;">
    ${hasDecisions !== false ? `<div style="margin-bottom: 12px;">
      <a href="${communityUrl}" style="${getEmailPrimaryButtonStyle(theme)}">
        ${escapeHtml(t('common.supporter_community', 'Supporter Community'))}
      </a>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: ${theme.mutedTextColor};">${escapeHtml(t('common.supporter_community_stay_connected_desc', 'Stay connected and vote on project decisions'))}</p>
    </div>` : ''}
    
    <div style="margin-bottom: 12px;">
      <a href="${manageUrl}" style="${getEmailSecondaryButtonStyle(theme)}">
        ${escapeHtml(t('common.view_your_pledge', 'View Your Pledge'))}
      </a>
    </div>
  </div>
  
  <div style="${getEmailFooterStyle(theme)}">
    <p style="margin: 0;">${escapeHtml(t('common.questions_prefix', 'Questions? Reply to this email or visit'))} <a href="${siteHomeUrl}" style="color: ${theme.primaryColor};">${platformName}</a>.</p>
  </div>
</body>
</html>
  `.trim();

  return sendResendEmail(env, {
    from: getPledgesEmailFrom(env),
    to: email,
    subject: t('subjects.charge_success', 'Payment confirmed for %{campaign}', { campaign: campaignTitle }),
    html
  });
}

/**
 * Send diary update notification to supporters
 */
export async function sendDiaryUpdateEmail(env, { email, campaignSlug, campaignTitle, diaryTitle, diaryExcerpt, diaryPhase, token, instagramUrl, hasDecisions, preferredLang }) {
  configureEmailLogging(env);
  const { t } = await getEmailTranslator(env, preferredLang);
  const theme = getEmailTheme(env);
  const communityUrl = safeSiteUrl(`${getLocalizedPath(`/community/${encodeURIComponent(campaignSlug)}/`, preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const diaryAnchor = diaryPhase ? `#diary-${diaryPhase}` : '#diary';
  const campaignUrl = safeSiteUrl(`/campaigns/${encodeURIComponent(campaignSlug)}/${diaryAnchor}`, env.SITE_BASE);
  const manageUrl = safeSiteUrl(`${getLocalizedPath('/manage/', preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const instagramCTA = getInstagramCTA(instagramUrl, env.SITE_BASE, t, { theme });
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="${getEmailBodyStyle(theme)}">
  ${renderEmailHeader(theme, escapeHtml(t('diary.heading', 'New Update: %{campaign}', { campaign: campaignTitle })))}
  
  <div style="${getEmailCardStyle(theme)}">
    <h2 style="margin: 0 0 12px 0; font-size: 18px; font-family: ${theme.headingFontFamily};">${escapeHtml(diaryTitle)}</h2>
    ${diaryExcerpt ? `<p style="margin: 0; color: ${theme.mutedTextColor};">${formatEmailText(diaryExcerpt)}</p>` : ''}
  </div>
  
  <div style="text-align: center; margin-bottom: 32px;">
    <a href="${campaignUrl}" style="${getEmailPrimaryButtonStyle(theme)}">
      ${escapeHtml(t('common.read_full_update', 'Read Full Update'))}
    </a>
  </div>
  
  <div style="margin-bottom: 32px;">
    <h2 style="font-size: 18px; margin: 0 0 16px 0;">${escapeHtml(t('common.your_supporter_access', 'Your Supporter Access'))}</h2>
    
    ${hasDecisions !== false ? `<div style="margin-bottom: 12px;">
      <a href="${communityUrl}" style="${getEmailPrimaryButtonStyle(theme)}">
        ${escapeHtml(t('common.supporter_community', 'Supporter Community'))}
      </a>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: ${theme.mutedTextColor};">${escapeHtml(t('common.supporter_community_vote_desc', 'Vote on creative decisions for this project'))}</p>
    </div>` : ''}
    
    <div style="margin-bottom: 12px;">
      <a href="${manageUrl}" style="${getEmailSecondaryButtonStyle(theme)}">
        ${escapeHtml(t('common.manage_your_pledge', 'Manage Your Pledge'))}
      </a>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: ${theme.mutedTextColor};">${escapeHtml(t('common.manage_your_pledge_desc', 'Cancel, modify amount, or update payment method'))}</p>
    </div>
  </div>
  
  ${instagramCTA}
  
  <div style="${getEmailFooterStyle(theme)}">
    <p style="margin: 0;">${escapeHtml(t('common.because_you_backed', "You're receiving this because you backed %{campaign}.", { campaign: campaignTitle }))}</p>
  </div>
</body>
</html>
  `.trim();

  return sendResendEmail(env, {
    from: getUpdatesEmailFrom(env),
    to: email,
    subject: t('subjects.diary_update', '📝 %{title} — %{campaign}', { title: diaryTitle, campaign: campaignTitle }),
    html
  }, {
    errorLabel: 'Resend error (diary)',
    failureLabel: 'Failed to send diary email'
  });
}

/**
 * Send pledge cancellation confirmation email
 */
export async function sendPledgeCancelledEmail(env, { email, campaignSlug, campaignTitle, subtotal = 0, tax = 0, taxDetails = null, shipping = 0, tipAmount = 0, tipPercent = 0, amount, preferredLang }) {
  configureEmailLogging(env);
  const { t } = await getEmailTranslator(env, preferredLang);
  const theme = getEmailTheme(env);
  const campaignUrl = safeSiteUrl(`/campaigns/${encodeURIComponent(campaignSlug)}/`, env.SITE_BASE);
  const amountBreakdownHtml = renderAmountBreakdown(env, {
    subtotal,
    tax,
    taxDetails,
    shipping,
    tipAmount,
    tipPercent,
    totalLabel: t('common.released_total', 'Released total'),
    totalAmount: amount
  }, t);
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="${getEmailBodyStyle(theme)}">
  ${renderEmailHeader(theme, escapeHtml(t('cancelled.heading', 'Pledge Cancelled')))}
  
  <div style="${getEmailCardStyle(theme)}">
    <p style="margin: 0 0 8px 0;"><strong>${escapeHtml(t('common.campaign_label', 'Campaign:'))}</strong> ${escapeHtml(campaignTitle)}</p>
    ${amountBreakdownHtml}
    <p style="margin: 0; color: ${theme.mutedTextColor}; font-size: 14px;">
      ${escapeHtml(t('cancelled.never_charged', 'Your card was never charged — this was just a pledge hold.'))}
    </p>
  </div>
  
  <p style="margin-bottom: 24px;">${escapeHtml(t('cancelled.body', "Your pledge has been cancelled and you won't be charged. If you change your mind, you can always make a new pledge while the campaign is still live."))}</p>
  
  <div style="text-align: center; margin-bottom: 32px;">
    <a href="${campaignUrl}" style="${getEmailPrimaryButtonStyle(theme)}">
      ${escapeHtml(t('common.view_campaign', 'View Campaign'))}
    </a>
  </div>
  
  <div style="${getEmailFooterStyle(theme)}">
    <p style="margin: 0;">${escapeHtml(t('cancelled.footer', "You've been removed from supporter updates for this campaign. Make a new pledge to rejoin."))}</p>
  </div>
</body>
</html>
  `.trim();

  return sendResendEmail(env, {
    from: getPledgesEmailFrom(env),
    to: email,
    subject: t('subjects.pledge_cancelled', 'Pledge cancelled for %{campaign}', { campaign: campaignTitle }),
    html
  }, {
    errorLabel: 'Resend error (cancelled)',
    failureLabel: 'Failed to send cancellation email'
  });
}

/**
 * Send goal milestone notification to supporters
 * @param {string} milestone - 'one-third' | 'two-thirds' | 'goal' | 'stretch'
 */
export async function sendMilestoneEmail(env, { email, campaignSlug, campaignTitle, milestone, pledgedAmount, goalAmount, stretchGoalName, token, instagramUrl, preferredLang }) {
  configureEmailLogging(env);
  const { t } = await getEmailTranslator(env, preferredLang);
  const theme = getEmailTheme(env);
  const campaignUrl = safeSiteUrl(`/campaigns/${encodeURIComponent(campaignSlug)}/`, env.SITE_BASE);
  const manageUrl = safeSiteUrl(`${getLocalizedPath('/manage/', preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const instagramCTA = getInstagramCTA(instagramUrl, env.SITE_BASE, t, { theme });
  
  const milestoneConfig = {
    'one-third': {
      emoji: '🚀',
      heading: t('milestone.one_third_heading', "We're 1/3 of the way there!"),
      message: t('milestone.one_third_message', '%{campaign} has reached 33% of its funding goal. Thanks for being part of this journey!', { campaign: campaignTitle })
    },
    'two-thirds': {
      emoji: '🔥',
      heading: t('milestone.two_thirds_heading', "We're 2/3 funded!"),
      message: t('milestone.two_thirds_message', '%{campaign} is at 66% of its goal. The finish line is in sight!', { campaign: campaignTitle })
    },
    'goal': {
      emoji: '🎉',
      heading: t('milestone.goal_heading', 'Goal Reached!'),
      message: t('milestone.goal_message', '%{campaign} has hit its funding goal! This project is happening. Your pledge will be charged soon.', { campaign: campaignTitle })
    },
    'stretch': {
      emoji: '⭐',
      heading: t('milestone.stretch_heading', 'Stretch Goal Unlocked: %{stretch}', { stretch: stretchGoalName || t('milestone.default_stretch_name', 'New Reward') }),
      message: t('milestone.stretch_message', '%{campaign} keeps growing! A new stretch goal has been unlocked.', { campaign: campaignTitle })
    }
  };
  
  const config = milestoneConfig[milestone] || milestoneConfig['goal'];
  const percentFunded = Math.round((pledgedAmount / goalAmount) * 100);
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="${getEmailBodyStyle(theme)}">
  ${renderEmailHeader(theme, escapeHtml(config.heading), { emoji: config.emoji })}
  
  <div style="${getEmailCardStyle(theme, 'text-align: center;')}">
    <div style="font-size: 36px; font-weight: bold; margin-bottom: 8px;">${percentFunded}%</div>
    <p style="margin: 0; color: ${theme.mutedTextColor};">${escapeHtml(t('milestone.progress', '$%{pledged} of $%{goal} goal', { pledged: (pledgedAmount / 100).toLocaleString(), goal: (goalAmount / 100).toLocaleString() }))}</p>
  </div>
  
  <p style="margin-bottom: 24px;">${escapeHtml(config.message)}</p>
  
  <div style="text-align: center; margin-bottom: 32px;">
    <a href="${campaignUrl}" style="${getEmailPrimaryButtonStyle(theme)}">
      ${escapeHtml(t('common.view_campaign', 'View Campaign'))}
    </a>
  </div>
  
  ${instagramCTA}
  
  <div style="${getEmailFooterStyle(theme)}">
    <p style="margin: 0 0 8px 0;">${escapeHtml(t('common.because_you_backed', "You're receiving this because you backed %{campaign}.", { campaign: campaignTitle }))}</p>
    <a href="${manageUrl}" style="color: ${theme.primaryColor};">${escapeHtml(t('common.manage_your_pledge', 'Manage Your Pledge'))}</a>
  </div>
</body>
</html>
  `.trim();

  return sendResendEmail(env, {
    from: getUpdatesEmailFrom(env),
    to: email,
    subject: t('subjects.milestone', '%{emoji} %{heading} — %{campaign}', { emoji: config.emoji, heading: config.heading, campaign: campaignTitle }),
    html
  }, {
    errorLabel: 'Resend error (milestone)',
    failureLabel: 'Failed to send milestone email'
  });
}

/**
 * Send announcement email to supporters with optional highlighted CTA link
 */
export async function sendAnnouncementEmail(env, { email, campaignSlug, campaignTitle, subject, heading, body, ctaLabel, ctaUrl, token, instagramUrl, hasDecisions, preferredLang }) {
  configureEmailLogging(env);
  const { t } = await getEmailTranslator(env, preferredLang);
  const theme = getEmailTheme(env);
  const communityUrl = safeSiteUrl(`${getLocalizedPath(`/community/${encodeURIComponent(campaignSlug)}/`, preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const manageUrl = safeSiteUrl(`${getLocalizedPath('/manage/', preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const instagramCTA = getInstagramCTA(instagramUrl, env.SITE_BASE, t, { theme });
  const safeCtaHref = safeExternalUrl(ctaUrl, env.SITE_BASE);
  
  const ctaBlock = ctaLabel && safeCtaHref ? `
  <div style="text-align: center; margin: 24px 0 32px 0;">
    <a href="${safeCtaHref}" style="${getEmailPrimaryButtonStyle(theme, 'padding: 14px 28px; font-size: 16px;')}">
      ${escapeHtml(ctaLabel)}
    </a>
  </div>` : '';
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="${getEmailBodyStyle(theme)}">
  ${renderEmailHeader(theme, escapeHtml(heading || subject))}
  
  <div style="${getEmailCardStyle(theme)}">
    <p style="margin: 0; font-size: 15px; color: ${theme.textColor};">${formatEmailText(body)}</p>
  </div>
  
  ${ctaBlock}
  
  <div style="margin-bottom: 32px;">
    <h2 style="font-size: 18px; margin: 0 0 16px 0;">${escapeHtml(t('common.your_supporter_access', 'Your Supporter Access'))}</h2>
    
    ${hasDecisions !== false ? `<div style="margin-bottom: 12px;">
      <a href="${communityUrl}" style="${getEmailPrimaryButtonStyle(theme)}">
        ${escapeHtml(t('common.supporter_community', 'Supporter Community'))}
      </a>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: ${theme.mutedTextColor};">${escapeHtml(t('common.supporter_community_vote_desc', 'Vote on creative decisions for this project'))}</p>
    </div>` : ''}
    
    <div style="margin-bottom: 12px;">
      <a href="${manageUrl}" style="${getEmailSecondaryButtonStyle(theme)}">
        ${escapeHtml(t('common.manage_your_pledge', 'Manage Your Pledge'))}
      </a>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: ${theme.mutedTextColor};">${escapeHtml(t('common.manage_your_pledge_desc', 'Cancel, modify amount, or update payment method'))}</p>
    </div>
  </div>
  
  ${instagramCTA}
  
  <div style="${getEmailFooterStyle(theme)}">
    <p style="margin: 0;">${escapeHtml(t('common.because_you_backed', "You're receiving this because you backed %{campaign}.", { campaign: campaignTitle }))}</p>
  </div>
</body>
</html>
  `.trim();

  return sendResendEmail(env, {
    from: getUpdatesEmailFrom(env),
    to: email,
    subject: t('subjects.announcement', '📢 %{subject} — %{campaign}', { subject, campaign: campaignTitle }),
    html
  }, {
    errorLabel: 'Resend error (announcement)',
    failureLabel: 'Failed to send announcement email'
  });
}

export async function sendCampaignRunnerReportEmail(
  env,
  {
    email,
    campaignSlug,
    campaignTitle,
    reportKind,
    reportDateLabel,
    statsSummary = [],
    csvFilename,
    csvContent,
    includeCsvAttachment = true
  }
) {
  configureEmailLogging(env);

  const theme = getEmailTheme(env);
  const normalizedReportKind = String(reportKind || 'campaign report').trim();
  const subjectPrefix = String(getCampaignRunnerEmailSubjectPrefix(env) || '').trim();
  const subjectBase = `${normalizedReportKind} for ${campaignTitle}`;
  const subject = subjectPrefix ? `${subjectPrefix} ${subjectBase}` : subjectBase;
  const statsRows = Array.isArray(statsSummary)
    ? statsSummary.filter((line) => String(line || '').trim())
    : [];
  const statsMarkup = statsRows.length
    ? `
  <div style="${getEmailCardStyle(theme)}">
    <h2 style="margin: 0 0 12px 0; font-size: 18px; font-family: ${theme.headingFontFamily};">Summary</h2>
    <ul style="margin: 0; padding-left: 18px;">
      ${statsRows.map((line) => `<li style="margin: 0 0 8px 0;">${escapeHtml(line)}</li>`).join('')}
    </ul>
  </div>`
    : '';
  const attachmentNote = includeCsvAttachment && csvFilename
    ? `<p style="margin: 0;">Attached: <strong>${escapeHtml(csvFilename)}</strong></p>`
    : '<p style="margin: 0;">CSV attachment disabled for this deployment.</p>';

  const html = `
  <div style="${getEmailBodyStyle(theme)}">
    ${renderEmailHeader(theme, escapeHtml(`${campaignTitle} report`), { emoji: '📊' })}

    <div style="${getEmailCardStyle(theme)}">
      <p style="margin: 0 0 12px 0;">Campaign: <strong>${escapeHtml(campaignTitle)}</strong></p>
      <p style="margin: 0 0 12px 0;">Report type: <strong>${escapeHtml(normalizedReportKind)}</strong></p>
      <p style="margin: 0;">Report date: <strong>${escapeHtml(reportDateLabel)}</strong></p>
    </div>

    ${statsMarkup}

    <div style="${getEmailCardStyle(theme)}">
      <p style="margin: 0 0 12px 0;">This report is for <code>${escapeHtml(campaignSlug)}</code> only.</p>
      ${attachmentNote}
    </div>

    <div style="${getEmailFooterStyle(theme)}">
      <p style="margin: 0;">Sent by <a href="${theme.siteHomeUrl}" style="color: ${theme.primaryColor};">${theme.platformName}</a>.</p>
    </div>
  </div>`;

  const attachments = includeCsvAttachment && csvFilename && csvContent
    ? [{
      filename: csvFilename,
      content: Buffer.from(String(csvContent), 'utf8').toString('base64')
    }]
    : undefined;

  return sendResendEmail(env, {
    from: getUpdatesEmailFrom(env),
    to: email,
    subject,
    html,
    ...(attachments ? { attachments } : {})
  }, {
    errorLabel: `Resend error (${normalizedReportKind})`,
    failureLabel: `Failed to send ${normalizedReportKind}`
  });
}
