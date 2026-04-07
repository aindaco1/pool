const CHECKOUT_PROVIDERS = ['first_party'];
const CART_RUNTIMES = ['first_party'];
const DEFAULT_SALES_TAX_RATE = 0.07875;
const DEFAULT_FLAT_SHIPPING_RATE = 3;

export { CHECKOUT_PROVIDERS, CART_RUNTIMES };

export function getCheckoutProvider(env = {}) {
  return normalizeFlag(env.CHECKOUT_PROVIDER, CHECKOUT_PROVIDERS, 'first_party');
}

export function getCartRuntime(env = {}) {
  return normalizeFlag(env.CART_RUNTIME, CART_RUNTIMES, 'first_party');
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

export function formatSalesTaxLabel(env = {}) {
  return `Sales tax (${(getSalesTaxRate(env) * 100).toFixed(3).replace(/\.?0+$/, '')}%)`;
}

function normalizeFlag(value, allowedValues, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  return allowedValues.includes(normalized) ? normalized : fallback;
}
