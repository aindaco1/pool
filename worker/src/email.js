/**
 * Resend Email Integration for The Pool
 *
 * Sends supporter access emails with magic links for:
 * - /manage/ — Pledge management (cancel, modify, update payment)
 * - /community/:slug/ — Supporter-only voting/decisions
 */

import {
  DEFAULT_SITE_BASE,
  getSalesTaxRate,
  getPlatformCompanyName,
  getPlatformName,
  getPledgesEmailFrom,
  getSiteBase,
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

// Instagram CTA block for emails (when campaign has instagram field)
function getInstagramCTA(instagramUrl, siteBase = FALLBACK_SITE_BASE, t = (_key, fallback) => fallback) {
  const safeInstagramHref = safeInstagramUrl(instagramUrl);
  if (!safeInstagramHref) return '';
  
  // Instagram logo hosted on our own domain (third-party URLs trigger Gmail spam filters)
  const instagramIcon = `<img src="${safeSiteUrl('/assets/images/instagram-white.png', getEmailAssetBase(siteBase))}" alt="Instagram" width="20" height="20" style="vertical-align: middle; margin-right: 8px;">`;
  
  return `
  <div style="background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); border-radius: 8px; padding: 16px 20px; margin: 24px 0; text-align: center;">
    <a href="${safeInstagramHref}" style="color: #fff; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; justify-content: center;">
      ${instagramIcon}
      <span>${escapeHtml(t('common.instagram_share', 'Share to your Story!'))}</span>
    </a>
    <p style="margin: 8px 0 0 0; font-size: 13px; color: rgba(255,255,255,0.9);">${escapeHtml(t('common.instagram_help', 'Help spread the word on Instagram'))}</p>
  </div>`;
}

// Render pledge items (tiers, support items, custom amount) for email display
function renderPledgeItems({ tierName, tierQty, additionalTiers = [], supportItems = [], addOns = [], customAmount = 0 }, t = (_key, fallback) => fallback) {
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
  
  if (items.length === 0) return '';
  
  return `
  <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e5e5;">
    <p style="margin: 0 0 8px 0; font-weight: 600; font-size: 14px;">${escapeHtml(t('common.pledge_includes', 'Your pledge includes:'))}</p>
    <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #555;">
      ${items.join('\n      ')}
    </ul>
  </div>`;
}

function renderAmountBreakdown(env, { subtotal = 0, tax = 0, shipping = 0, tipAmount = 0, tipPercent = 0, totalLabel, totalAmount }, t = (_key, fallback) => fallback) {
  const resolvedTotal = totalAmount ?? (subtotal + tax + shipping + tipAmount);
  const salesTaxRate = (getSalesTaxRate(env) * 100).toFixed(3).replace(/\.?0+$/, '');
  const salesTaxLabel = escapeHtml(t('common.sales_tax_label', 'Sales tax (%{rate}%)', { rate: salesTaxRate }));
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
    <p style="margin: 0 0 4px 0;">${salesTaxLabel}: $${(tax / 100).toFixed(2)}</p>
    ${shipping > 0 ? `<p style="margin: 0 0 4px 0;">${shippingLabel}: $${(shipping / 100).toFixed(2)}</p>` : ''}
    <p style="margin: 0 0 8px 0;"><strong>${safeTotalLabel}: $${(resolvedTotal / 100).toFixed(2)}</strong></p>
  `.trim();
}

/**
 * Send supporter confirmation email after successful pledge
 */
export async function sendSupporterEmail(env, { email, campaignSlug, campaignTitle, subtotal, tax = 0, shipping = 0, tipAmount = 0, tipPercent = 0, token, instagramUrl, pledgeItems, hasDecisions, preferredLang }) {
  configureEmailLogging(env);
  const { t } = await getEmailTranslator(env, preferredLang);
  const manageUrl = safeSiteUrl(`${getLocalizedPath('/manage/', preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const communityUrl = safeSiteUrl(`${getLocalizedPath(`/community/${encodeURIComponent(campaignSlug)}/`, preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const siteHomeUrl = getSiteRootUrl(env.SITE_BASE);
  const platformName = escapeHtml(getPlatformName(env));
  const instagramCTA = getInstagramCTA(instagramUrl, env.SITE_BASE, t);
  const pledgeItemsHtml = pledgeItems ? renderPledgeItems(pledgeItems, t) : '';
  const amountBreakdownHtml = renderAmountBreakdown(env, {
    subtotal,
    tax,
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
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="margin: 0; font-size: 24px;">${escapeHtml(t('supporter.thanks_heading', 'Thanks for backing %{campaign}!', { campaign: campaignTitle }))}</h1>
  </div>
  
  <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    ${amountBreakdownHtml}
    ${pledgeItemsHtml}
    <p style="margin: 12px 0 0 0; color: #666; font-size: 14px;">
      <strong>${escapeHtml(t('common.remember', 'Remember:'))}</strong> ${escapeHtml(t('supporter.card_saved_notice', "Your card is saved but won't be charged unless this campaign reaches its goal."))}
    </p>
  </div>
  
  <div style="margin-bottom: 32px;">
    <h2 style="font-size: 18px; margin: 0 0 16px 0;">${escapeHtml(t('common.your_supporter_access', 'Your Supporter Access'))}</h2>
    <p style="margin: 0 0 16px 0;">${escapeHtml(t('common.no_account_needed_keys', 'No account needed — these links are your keys:'))}</p>
    
    <div style="margin-bottom: 12px;">
      <a href="${manageUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        ${escapeHtml(t('common.manage_your_pledge', 'Manage Your Pledge'))}
      </a>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #666;">${escapeHtml(t('common.manage_your_pledge_desc', 'Cancel, modify amount, or update payment method'))}</p>
    </div>
    
    ${hasDecisions !== false ? `<div style="margin-bottom: 12px;">
      <a href="${communityUrl}" style="display: inline-block; background: #fff; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; border: 1px solid #000;">
        ${escapeHtml(t('common.supporter_community', 'Supporter Community'))}
      </a>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #666;">${escapeHtml(t('common.supporter_community_vote_desc', 'Vote on creative decisions for this project'))}</p>
    </div>` : ''}
  </div>
  
  ${instagramCTA}
  
  <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #666;">
    <p style="margin: 0 0 8px 0;"><strong>${escapeHtml(t('common.save_this_email', 'Save this email!'))}</strong> ${escapeHtml(t('supporter.save_links_notice', "You'll need these links to manage your pledge."))}</p>
    <p style="margin: 0;">${escapeHtml(t('common.questions_prefix', 'Questions? Reply to this email or visit'))} <a href="${siteHomeUrl}" style="color: #000;">${platformName}</a>.</p>
  </div>
</body>
</html>
  `.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: getPledgesEmailFrom(env),
      to: email,
      subject: t('subjects.pledge_confirmed', 'Your pledge to %{campaign}', { campaign: campaignTitle }),
      html
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Resend error:', error);
    throw new Error(`Failed to send email: ${response.status}`);
  }

  return response.json();
}

/**
 * Send pledge modification confirmation email
 */
export async function sendPledgeModifiedEmail(env, { email, campaignSlug, campaignTitle, previousSubtotal, previousTax = 0, previousShipping = 0, previousTipAmount = 0, newSubtotal, tax = 0, shipping = 0, tipAmount = 0, tipPercent = 0, token, instagramUrl, pledgeItems, preferredLang }) {
  configureEmailLogging(env);
  const { t } = await getEmailTranslator(env, preferredLang);
  const manageUrl = safeSiteUrl(`${getLocalizedPath('/manage/', preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const siteHomeUrl = getSiteRootUrl(env.SITE_BASE);
  const platformName = escapeHtml(getPlatformName(env));
  const previousTotal = previousSubtotal + previousTax + previousShipping + previousTipAmount;
  const newTotal = newSubtotal + tax + shipping + tipAmount;
  const increased = newTotal > previousTotal;
  const diff = Math.abs(newTotal - previousTotal);
  const tipChanged = Number(previousTipAmount || 0) !== Number(tipAmount || 0);
  const tipDelta = Number(tipAmount || 0) - Number(previousTipAmount || 0);
  const instagramCTA = getInstagramCTA(instagramUrl, env.SITE_BASE, t);
  const pledgeItemsHtml = pledgeItems ? renderPledgeItems(pledgeItems, t) : '';
  const amountBreakdownHtml = renderAmountBreakdown(env, {
    subtotal: newSubtotal,
    tax,
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
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="margin: 0; font-size: 24px;">${escapeHtml(t('modified.heading', 'Pledge Updated'))}</h1>
  </div>
  
  <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <p style="margin: 0 0 8px 0;"><strong>${escapeHtml(t('common.campaign_label', 'Campaign:'))}</strong> ${escapeHtml(campaignTitle)}</p>
    <p style="margin: 0 0 8px 0;"><strong>${escapeHtml(t('common.previous_total_if_funded', 'Previous total (if funded):'))}</strong> $${(previousTotal / 100).toFixed(2)}</p>
    <p style="margin: 0 0 8px 0;"><strong>${escapeHtml(t('common.updated_total_if_funded', 'Updated total (if funded):'))}</strong> $${(newTotal / 100).toFixed(2)} (${increased ? '+' : '-'}$${(diff / 100).toFixed(2)})</p>
    ${tipChangeHtml}
    ${amountBreakdownHtml}
    ${pledgeItemsHtml}
    <p style="margin: 12px 0 0 0; color: #666; font-size: 14px;">
      <strong>${escapeHtml(t('common.remember', 'Remember:'))}</strong> ${escapeHtml(t('supporter.card_saved_notice', "Your card is saved but won't be charged unless this campaign reaches its goal."))}
    </p>
  </div>
  
  <div style="margin-bottom: 32px;">
    <p style="margin: 0 0 16px 0;">${escapeHtml(t('modified.success_body', 'Your pledge has been successfully updated. You can manage your pledge anytime using the link below:'))}</p>
    
    <div style="margin-bottom: 12px;">
      <a href="${manageUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        ${escapeHtml(t('common.manage_your_pledge', 'Manage Your Pledge'))}
      </a>
    </div>
  </div>
  
  ${instagramCTA}
  
  <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #666;">
    <p style="margin: 0;">${escapeHtml(t('common.questions_prefix', 'Questions? Reply to this email or visit'))} <a href="${siteHomeUrl}" style="color: #000;">${platformName}</a>.</p>
  </div>
</body>
</html>
  `.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: getPledgesEmailFrom(env),
      to: email,
      subject: t('subjects.pledge_updated', 'Pledge updated for %{campaign}', { campaign: campaignTitle }),
      html
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Resend error:', error);
    throw new Error(`Failed to send email: ${response.status}`);
  }

  return response.json();
}

/**
 * Send payment failure notification
 */
export async function sendPaymentFailedEmail(env, { email, campaignSlug, campaignTitle, subtotal, tax, shipping = 0, tipAmount = 0, tipPercent = 0, amount, token, pledgeItems, preferredLang }) {
  configureEmailLogging(env);
  const { t } = await getEmailTranslator(env, preferredLang);
  const manageUrl = safeSiteUrl(`${getLocalizedPath('/manage/', preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const pledgeItemsHtml = pledgeItems ? renderPledgeItems(pledgeItems, t) : '';
  const amountBreakdownHtml = renderAmountBreakdown(env, {
    subtotal,
    tax,
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
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="margin: 0; font-size: 24px; color: #dc3545;">${escapeHtml(t('payment_failed.heading', 'Action Required'))}</h1>
  </div>
  
  <div style="background: #fff3cd; border-radius: 8px; padding: 20px; margin-bottom: 24px; border: 1px solid #ffc107;">
    <p style="margin: 0 0 12px 0;">
      ${escapeHtml(t('payment_failed.intro', 'We tried to charge your card for your pledge to %{campaign}, but the payment failed.', { campaign: campaignTitle }))}
    </p>
    ${amountBreakdownHtml}
    ${pledgeItemsHtml}
  </div>
  
  <p>${escapeHtml(t('payment_failed.processing_body', "The campaign has been funded and we're processing charges. Please update your payment method to complete your pledge:"))}</p>
  
  <div style="text-align: center; margin: 24px 0;">
    <a href="${manageUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
      ${escapeHtml(t('common.update_payment_method', 'Update Payment Method'))}
    </a>
  </div>
  
  <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #666;">
    <p style="margin: 0;">${escapeHtml(t('payment_failed.footer', 'If you have questions, reply to this email.'))}</p>
  </div>
</body>
</html>
  `.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: getPledgesEmailFrom(env),
      to: email,
      subject: t('subjects.payment_failed', 'Action needed: Update payment for %{campaign}', { campaign: campaignTitle }),
      html
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Resend error:', error);
    throw new Error(`Failed to send email: ${response.status}`);
  }

  return response.json();
}

/**
 * Send charge success email after campaign settlement
 */
export async function sendChargeSuccessEmail(env, { email, campaignSlug, campaignTitle, subtotal, tax, shipping = 0, tipAmount = 0, tipPercent = 0, amount, token, pledgeItems, hasDecisions, preferredLang }) {
  configureEmailLogging(env);
  const { t } = await getEmailTranslator(env, preferredLang);
  const manageUrl = safeSiteUrl(`${getLocalizedPath('/manage/', preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const communityUrl = safeSiteUrl(`${getLocalizedPath(`/community/${encodeURIComponent(campaignSlug)}/`, preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const siteHomeUrl = getSiteRootUrl(env.SITE_BASE);
  const platformName = escapeHtml(getPlatformName(env));
  const pledgeItemsHtml = pledgeItems ? renderPledgeItems(pledgeItems, t) : '';
  const amountBreakdownHtml = renderAmountBreakdown(env, {
    subtotal,
    tax,
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
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="margin: 0; font-size: 24px; color: #059669;">${escapeHtml(t('charge_success.heading', 'Payment Successful!'))}</h1>
  </div>
  
  <div style="background: #f0fdf4; border-radius: 8px; padding: 20px; margin-bottom: 24px; border: 1px solid #bbf7d0;">
    <p style="margin: 0 0 12px 0;">${escapeHtml(t('charge_success.funded_intro', '%{campaign} has been fully funded!', { campaign: campaignTitle }))}</p>
    ${amountBreakdownHtml}
    ${pledgeItemsHtml}
  </div>
  
  <p>${escapeHtml(t('charge_success.success_body', 'Your pledge has been successfully charged. Thank you for helping make this project happen!'))}</p>
  
  <div style="margin-bottom: 32px;">
    ${hasDecisions !== false ? `<div style="margin-bottom: 12px;">
      <a href="${communityUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        ${escapeHtml(t('common.supporter_community', 'Supporter Community'))}
      </a>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #666;">${escapeHtml(t('common.supporter_community_stay_connected_desc', 'Stay connected and vote on project decisions'))}</p>
    </div>` : ''}
    
    <div style="margin-bottom: 12px;">
      <a href="${manageUrl}" style="display: inline-block; background: #fff; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; border: 1px solid #000;">
        ${escapeHtml(t('common.view_your_pledge', 'View Your Pledge'))}
      </a>
    </div>
  </div>
  
  <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #666;">
    <p style="margin: 0;">${escapeHtml(t('common.questions_prefix', 'Questions? Reply to this email or visit'))} <a href="${siteHomeUrl}" style="color: #000;">${platformName}</a>.</p>
  </div>
</body>
</html>
  `.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: getPledgesEmailFrom(env),
      to: email,
      subject: t('subjects.charge_success', 'Payment confirmed for %{campaign}', { campaign: campaignTitle }),
      html
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Resend error:', error);
    throw new Error(`Failed to send email: ${response.status}`);
  }

  return response.json();
}

/**
 * Send diary update notification to supporters
 */
export async function sendDiaryUpdateEmail(env, { email, campaignSlug, campaignTitle, diaryTitle, diaryExcerpt, diaryPhase, token, instagramUrl, hasDecisions, preferredLang }) {
  configureEmailLogging(env);
  const { t } = await getEmailTranslator(env, preferredLang);
  const communityUrl = safeSiteUrl(`${getLocalizedPath(`/community/${encodeURIComponent(campaignSlug)}/`, preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const diaryAnchor = diaryPhase ? `#diary-${diaryPhase}` : '#diary';
  const campaignUrl = safeSiteUrl(`/campaigns/${encodeURIComponent(campaignSlug)}/${diaryAnchor}`, env.SITE_BASE);
  const manageUrl = safeSiteUrl(`${getLocalizedPath('/manage/', preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const instagramCTA = getInstagramCTA(instagramUrl, env.SITE_BASE, t);
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="margin: 0; font-size: 24px;">${escapeHtml(t('diary.heading', 'New Update: %{campaign}', { campaign: campaignTitle }))}</h1>
  </div>
  
  <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 12px 0; font-size: 18px;">${escapeHtml(diaryTitle)}</h2>
    ${diaryExcerpt ? `<p style="margin: 0; color: #666;">${formatEmailText(diaryExcerpt)}</p>` : ''}
  </div>
  
  <div style="text-align: center; margin-bottom: 32px;">
    <a href="${campaignUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
      ${escapeHtml(t('common.read_full_update', 'Read Full Update'))}
    </a>
  </div>
  
  <div style="margin-bottom: 32px;">
    <h2 style="font-size: 18px; margin: 0 0 16px 0;">${escapeHtml(t('common.your_supporter_access', 'Your Supporter Access'))}</h2>
    
    ${hasDecisions !== false ? `<div style="margin-bottom: 12px;">
      <a href="${communityUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        ${escapeHtml(t('common.supporter_community', 'Supporter Community'))}
      </a>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #666;">${escapeHtml(t('common.supporter_community_vote_desc', 'Vote on creative decisions for this project'))}</p>
    </div>` : ''}
    
    <div style="margin-bottom: 12px;">
      <a href="${manageUrl}" style="display: inline-block; background: #fff; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; border: 1px solid #000;">
        ${escapeHtml(t('common.manage_your_pledge', 'Manage Your Pledge'))}
      </a>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #666;">${escapeHtml(t('common.manage_your_pledge_desc', 'Cancel, modify amount, or update payment method'))}</p>
    </div>
  </div>
  
  ${instagramCTA}
  
  <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #666;">
    <p style="margin: 0;">${escapeHtml(t('common.because_you_backed', "You're receiving this because you backed %{campaign}.", { campaign: campaignTitle }))}</p>
  </div>
</body>
</html>
  `.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: getUpdatesEmailFrom(env),
      to: email,
      subject: t('subjects.diary_update', '📝 %{title} — %{campaign}', { title: diaryTitle, campaign: campaignTitle }),
      html
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Resend error (diary):', error);
    throw new Error(`Failed to send diary email: ${response.status}`);
  }

  return response.json();
}

/**
 * Send pledge cancellation confirmation email
 */
export async function sendPledgeCancelledEmail(env, { email, campaignSlug, campaignTitle, subtotal = 0, tax = 0, shipping = 0, tipAmount = 0, tipPercent = 0, amount, preferredLang }) {
  configureEmailLogging(env);
  const { t } = await getEmailTranslator(env, preferredLang);
  const campaignUrl = safeSiteUrl(`/campaigns/${encodeURIComponent(campaignSlug)}/`, env.SITE_BASE);
  const amountBreakdownHtml = renderAmountBreakdown(env, {
    subtotal,
    tax,
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
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="margin: 0; font-size: 24px;">${escapeHtml(t('cancelled.heading', 'Pledge Cancelled'))}</h1>
  </div>
  
  <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <p style="margin: 0 0 8px 0;"><strong>${escapeHtml(t('common.campaign_label', 'Campaign:'))}</strong> ${escapeHtml(campaignTitle)}</p>
    ${amountBreakdownHtml}
    <p style="margin: 0; color: #666; font-size: 14px;">
      ${escapeHtml(t('cancelled.never_charged', 'Your card was never charged — this was just a pledge hold.'))}
    </p>
  </div>
  
  <p style="margin-bottom: 24px;">${escapeHtml(t('cancelled.body', "Your pledge has been cancelled and you won't be charged. If you change your mind, you can always make a new pledge while the campaign is still live."))}</p>
  
  <div style="text-align: center; margin-bottom: 32px;">
    <a href="${campaignUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
      ${escapeHtml(t('common.view_campaign', 'View Campaign'))}
    </a>
  </div>
  
  <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #666;">
    <p style="margin: 0;">${escapeHtml(t('cancelled.footer', "You've been removed from supporter updates for this campaign. Make a new pledge to rejoin."))}</p>
  </div>
</body>
</html>
  `.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: getPledgesEmailFrom(env),
      to: email,
      subject: t('subjects.pledge_cancelled', 'Pledge cancelled for %{campaign}', { campaign: campaignTitle }),
      html
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Resend error (cancelled):', error);
    throw new Error(`Failed to send cancellation email: ${response.status}`);
  }

  return response.json();
}

/**
 * Send goal milestone notification to supporters
 * @param {string} milestone - 'one-third' | 'two-thirds' | 'goal' | 'stretch'
 */
export async function sendMilestoneEmail(env, { email, campaignSlug, campaignTitle, milestone, pledgedAmount, goalAmount, stretchGoalName, token, instagramUrl, preferredLang }) {
  configureEmailLogging(env);
  const { t } = await getEmailTranslator(env, preferredLang);
  const campaignUrl = safeSiteUrl(`/campaigns/${encodeURIComponent(campaignSlug)}/`, env.SITE_BASE);
  const manageUrl = safeSiteUrl(`${getLocalizedPath('/manage/', preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const instagramCTA = getInstagramCTA(instagramUrl, env.SITE_BASE, t);
  
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
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <div style="font-size: 48px; margin-bottom: 16px;">${config.emoji}</div>
    <h1 style="margin: 0; font-size: 24px;">${escapeHtml(config.heading)}</h1>
  </div>
  
  <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 24px; text-align: center;">
    <div style="font-size: 36px; font-weight: bold; margin-bottom: 8px;">${percentFunded}%</div>
    <p style="margin: 0; color: #666;">${escapeHtml(t('milestone.progress', '$%{pledged} of $%{goal} goal', { pledged: (pledgedAmount / 100).toLocaleString(), goal: (goalAmount / 100).toLocaleString() }))}</p>
  </div>
  
  <p style="margin-bottom: 24px;">${escapeHtml(config.message)}</p>
  
  <div style="text-align: center; margin-bottom: 32px;">
    <a href="${campaignUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
      ${escapeHtml(t('common.view_campaign', 'View Campaign'))}
    </a>
  </div>
  
  ${instagramCTA}
  
  <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #666;">
    <p style="margin: 0 0 8px 0;">${escapeHtml(t('common.because_you_backed', "You're receiving this because you backed %{campaign}.", { campaign: campaignTitle }))}</p>
    <a href="${manageUrl}" style="color: #666;">${escapeHtml(t('common.manage_your_pledge', 'Manage Your Pledge'))}</a>
  </div>
</body>
</html>
  `.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: getUpdatesEmailFrom(env),
      to: email,
      subject: t('subjects.milestone', '%{emoji} %{heading} — %{campaign}', { emoji: config.emoji, heading: config.heading, campaign: campaignTitle }),
      html
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Resend error (milestone):', error);
    throw new Error(`Failed to send milestone email: ${response.status}`);
  }

  return response.json();
}

/**
 * Send announcement email to supporters with optional highlighted CTA link
 */
export async function sendAnnouncementEmail(env, { email, campaignSlug, campaignTitle, subject, heading, body, ctaLabel, ctaUrl, token, instagramUrl, hasDecisions, preferredLang }) {
  configureEmailLogging(env);
  const { t } = await getEmailTranslator(env, preferredLang);
  const communityUrl = safeSiteUrl(`${getLocalizedPath(`/community/${encodeURIComponent(campaignSlug)}/`, preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const manageUrl = safeSiteUrl(`${getLocalizedPath('/manage/', preferredLang)}?t=${encodeURIComponent(token)}`, env.SITE_BASE);
  const instagramCTA = getInstagramCTA(instagramUrl, env.SITE_BASE, t);
  const safeCtaHref = safeExternalUrl(ctaUrl, env.SITE_BASE);
  
  const ctaBlock = ctaLabel && safeCtaHref ? `
  <div style="text-align: center; margin: 24px 0 32px 0;">
    <a href="${safeCtaHref}" style="display: inline-block; background: #000; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
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
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="margin: 0; font-size: 24px;">${escapeHtml(heading || subject)}</h1>
  </div>
  
  <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <p style="margin: 0; font-size: 15px; color: #333;">${formatEmailText(body)}</p>
  </div>
  
  ${ctaBlock}
  
  <div style="margin-bottom: 32px;">
    <h2 style="font-size: 18px; margin: 0 0 16px 0;">${escapeHtml(t('common.your_supporter_access', 'Your Supporter Access'))}</h2>
    
    ${hasDecisions !== false ? `<div style="margin-bottom: 12px;">
      <a href="${communityUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        ${escapeHtml(t('common.supporter_community', 'Supporter Community'))}
      </a>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #666;">${escapeHtml(t('common.supporter_community_vote_desc', 'Vote on creative decisions for this project'))}</p>
    </div>` : ''}
    
    <div style="margin-bottom: 12px;">
      <a href="${manageUrl}" style="display: inline-block; background: #fff; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; border: 1px solid #000;">
        ${escapeHtml(t('common.manage_your_pledge', 'Manage Your Pledge'))}
      </a>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #666;">${escapeHtml(t('common.manage_your_pledge_desc', 'Cancel, modify amount, or update payment method'))}</p>
    </div>
  </div>
  
  ${instagramCTA}
  
  <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #666;">
    <p style="margin: 0;">${escapeHtml(t('common.because_you_backed', "You're receiving this because you backed %{campaign}.", { campaign: campaignTitle }))}</p>
  </div>
</body>
</html>
  `.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: getUpdatesEmailFrom(env),
      to: email,
      subject: t('subjects.announcement', '📢 %{subject} — %{campaign}', { subject, campaign: campaignTitle }),
      html
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Resend error (announcement):', error);
    throw new Error(`Failed to send announcement email: ${response.status}`);
  }

  return response.json();
}
