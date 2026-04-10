const CHECKOUT_PROVIDERS = ['first_party'];
const CART_RUNTIMES = ['first_party'];
const CHECKOUT_UI_MODES = ['hosted', 'embedded', 'custom'];
const DEFAULT_SITE_BASE = 'https://pool.dustwave.xyz';
const DEFAULT_WORKER_BASE = 'https://pledge.dustwave.xyz';
const DEFAULT_PLATFORM_NAME = 'The Pool';
const DEFAULT_PLATFORM_COMPANY_NAME = 'Dust Wave';
const DEFAULT_SUPPORT_EMAIL = 'support@dustwave.xyz';
const DEFAULT_PLEDGES_EMAIL_FROM = 'The Pool <pledges@pool.dustwave.xyz>';
const DEFAULT_UPDATES_EMAIL_FROM = 'The Pool <updates@pool.dustwave.xyz>';
const DEFAULT_SALES_TAX_RATE = 0.07875;
const DEFAULT_FLAT_SHIPPING_RATE = 3;
const DEFAULT_PLATFORM_TIP_PERCENT = 5;
const MAX_PLATFORM_TIP_PERCENT = 15;

export {
  CART_RUNTIMES,
  CHECKOUT_PROVIDERS,
  CHECKOUT_UI_MODES,
  DEFAULT_PLATFORM_TIP_PERCENT,
  DEFAULT_PLEDGES_EMAIL_FROM,
  DEFAULT_PLATFORM_COMPANY_NAME,
  DEFAULT_PLATFORM_NAME,
  DEFAULT_SITE_BASE,
  DEFAULT_SUPPORT_EMAIL,
  DEFAULT_UPDATES_EMAIL_FROM,
  DEFAULT_WORKER_BASE,
  MAX_PLATFORM_TIP_PERCENT
};

export function getCheckoutProvider(env = {}) {
  return normalizeFlag(env.CHECKOUT_PROVIDER, CHECKOUT_PROVIDERS, 'first_party');
}

export function getCartRuntime(env = {}) {
  return normalizeFlag(env.CART_RUNTIME, CART_RUNTIMES, 'first_party');
}

export function getCheckoutUiMode(env = {}) {
  return normalizeFlag(env.CHECKOUT_UI_MODE, CHECKOUT_UI_MODES, 'custom');
}

export function isFirstPartyCheckoutEnabled(env = {}) {
  return getCheckoutProvider(env) === 'first_party';
}

export function isFirstPartyCartEnabled(env = {}) {
  return getCartRuntime(env) === 'first_party';
}

export function getSalesTaxRate(env = {}) {
  const parsed = Number(env.SALES_TAX_RATE);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_SALES_TAX_RATE;
}

export function getFlatShippingFeeCents(env = {}) {
  const parsed = Number(env.FLAT_SHIPPING_RATE);
  const amount = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_FLAT_SHIPPING_RATE;
  return Math.round(amount * 100);
}

export function getDefaultPlatformTipPercent(env = {}) {
  const parsed = Number(env.DEFAULT_PLATFORM_TIP_PERCENT);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= getMaxPlatformTipPercent(env)
    ? parsed
    : DEFAULT_PLATFORM_TIP_PERCENT;
}

export function getMaxPlatformTipPercent(env = {}) {
  const parsed = Number(env.MAX_PLATFORM_TIP_PERCENT);
  return Number.isInteger(parsed) && parsed >= 0
    ? parsed
    : MAX_PLATFORM_TIP_PERCENT;
}

export function getPlatformName(env = {}) {
  return normalizeString(env.PLATFORM_NAME, DEFAULT_PLATFORM_NAME);
}

export function getPlatformCompanyName(env = {}) {
  return normalizeString(env.PLATFORM_COMPANY_NAME || env.PLATFORM_AUTHOR, DEFAULT_PLATFORM_COMPANY_NAME);
}

export function getSupportEmail(env = {}) {
  return normalizeString(env.SUPPORT_EMAIL, DEFAULT_SUPPORT_EMAIL);
}

export function getPledgesEmailFrom(env = {}) {
  return normalizeString(env.PLEDGES_EMAIL_FROM, DEFAULT_PLEDGES_EMAIL_FROM);
}

export function getUpdatesEmailFrom(env = {}) {
  return normalizeString(env.UPDATES_EMAIL_FROM, DEFAULT_UPDATES_EMAIL_FROM);
}

export function getSiteBase(env = {}) {
  return getResolvedUrl(env.SITE_BASE, DEFAULT_SITE_BASE);
}

export function getWorkerBase(env = {}) {
  return getResolvedUrl(env.WORKER_BASE, DEFAULT_WORKER_BASE);
}

export function formatSalesTaxLabel(env = {}) {
  return `Sales tax (${(getSalesTaxRate(env) * 100).toFixed(3).replace(/\.?0+$/, '')}%)`;
}

function normalizeFlag(value, allowedValues, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  return allowedValues.includes(normalized) ? normalized : fallback;
}

function normalizeString(value, fallback) {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function getResolvedUrl(value, fallback) {
  try {
    return new URL(normalizeString(value, fallback)).toString();
  } catch {
    return fallback;
  }
}
