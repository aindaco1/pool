const CHECKOUT_INTENT_SCOPE = 'checkout_start';
const CHECKOUT_INTENT_VERSION = 1;
const DEFAULT_CHECKOUT_INTENT_TTL_SECONDS = 600;

export {
  CHECKOUT_INTENT_SCOPE,
  CHECKOUT_INTENT_VERSION,
  DEFAULT_CHECKOUT_INTENT_TTL_SECONDS
};

export function normalizeCheckoutContribution(input = {}) {
  const selectedTiers = Array.isArray(input.selectedTiers)
    ? input.selectedTiers
        .map((tier) => ({
          id: String(tier?.id || ''),
          qty: toNonNegativeInteger(tier?.qty)
        }))
        .filter((tier) => tier.id && tier.qty > 0)
        .sort(compareTierEntries)
    : [];

  const supportItems = Array.isArray(input.supportItems)
    ? input.supportItems
        .map((item) => ({
          id: String(item?.id || ''),
          amount: toNonNegativeInteger(item?.amount)
        }))
        .filter((item) => item.id && item.amount > 0)
        .sort(compareSupportEntries)
    : [];

  return {
    campaignSlug: String(input.campaignSlug || ''),
    selectedTiers,
    supportItems,
    customAmount: toNonNegativeInteger(input.customAmount),
    tipPercent: toNonNegativeInteger(input.tipPercent),
    shippingOption: String(input.shippingOption || 'standard'),
    hasPhysical: input.hasPhysical === true,
    subtotal: toNonNegativeInteger(input.subtotal),
    shipping: toNonNegativeInteger(input.shipping),
    tax: toNonNegativeInteger(input.tax),
    taxDetails: normalizeTaxDetails(input.taxDetails),
    total: toNonNegativeInteger(input.total)
  };
}

function normalizeTaxDetails(input = {}) {
  if (!input || typeof input !== 'object') return null;

  return {
    provider: String(input.provider || ''),
    source: String(input.source || ''),
    effectiveRate: toDecimalNumber(input.effectiveRate),
    destination: normalizeTaxAddress(input.destination),
    jurisdiction: normalizeTaxAddress(input.jurisdiction),
    taxableSubtotalCents: toNonNegativeInteger(input.taxableSubtotalCents),
    taxableShippingCents: toNonNegativeInteger(input.taxableShippingCents),
    shippingTaxed: input.shippingTaxed === true,
    shippingCents: toNonNegativeInteger(input.shippingCents),
    breakdown: Array.isArray(input.breakdown)
      ? input.breakdown.map((entry) => ({
          label: String(entry?.label || ''),
          rate: toDecimalNumber(entry?.rate),
          taxableSubtotalCents: toNonNegativeInteger(entry?.taxableSubtotalCents),
          taxableShippingCents: toNonNegativeInteger(entry?.taxableShippingCents),
          taxCents: toNonNegativeInteger(entry?.taxCents)
        }))
      : []
  };
}

function normalizeTaxAddress(input = {}) {
  if (!input || typeof input !== 'object') return null;
  return {
    country: String(input.country || '').trim().toUpperCase(),
    state: String(input.state || '').trim().toUpperCase(),
    postalCode: String(input.postalCode || input.postal_code || '').trim()
  };
}

function normalizeBundleAddOn(input = {}) {
  return {
    productId: String(input.productId || ''),
    variantId: String(input.variantId || ''),
    quantity: toNonNegativeInteger(input.quantity),
    unitPrice: toNonNegativeInteger(input.unitPrice),
    category: String(input.category || '')
  };
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return '[' + value.map((entry) => stableStringify(entry)).join(',') + ']';
  }

  const keys = Object.keys(value).sort();
  const parts = keys.map((key) => JSON.stringify(key) + ':' + stableStringify(value[key]));
  return '{' + parts.join(',') + '}';
}

export async function hashCheckoutContribution(input = {}) {
  const normalized = normalizeCheckoutContribution(input);
  return sha256Hex(stableStringify(normalized));
}

export async function hashCheckoutBundle(input = {}) {
  const normalized = {
    bundleAddOnAnchorCampaignSlug: String(input.bundleAddOnAnchorCampaignSlug || ''),
    bundleAddOns: Array.isArray(input.bundleAddOns)
      ? input.bundleAddOns
          .map((entry) => normalizeBundleAddOn(entry))
          .filter((entry) => entry.productId && entry.quantity > 0)
          .sort((a, b) => (
            a.productId.localeCompare(b.productId) ||
            a.variantId.localeCompare(b.variantId) ||
            a.quantity - b.quantity
          ))
      : [],
    contributions: Array.isArray(input.contributions)
      ? input.contributions
          .map((entry) => normalizeCheckoutContribution(entry))
          .sort((a, b) => a.campaignSlug.localeCompare(b.campaignSlug))
      : []
  };
  return sha256Hex(stableStringify(normalized));
}

export function buildCheckoutIntentPayload(
  { nonce, cartHash, campaignSlug, tipPercent = 0, email = '' },
  options = {}
) {
  const nowEpochSeconds = options.nowEpochSeconds || Math.floor(Date.now() / 1000);
  const ttlSeconds = options.ttlSeconds || DEFAULT_CHECKOUT_INTENT_TTL_SECONDS;

  return {
    scope: CHECKOUT_INTENT_SCOPE,
    version: CHECKOUT_INTENT_VERSION,
    nonce: String(nonce || ''),
    campaignSlug: String(campaignSlug || ''),
    cartHash: String(cartHash || ''),
    tipPercent: toNonNegativeInteger(tipPercent),
    email: String(email || ''),
    issuedAt: nowEpochSeconds,
    exp: nowEpochSeconds + ttlSeconds
  };
}

export function buildCheckoutHashInput({ campaignSlug, canonicalContribution, tipPercent }) {
  return {
    campaignSlug: String(campaignSlug || ''),
    selectedTiers: canonicalContribution?.selectedTiers || [],
    supportItems: canonicalContribution?.supportItems || [],
    customAmount: canonicalContribution?.customAmount || 0,
    tipPercent: toNonNegativeInteger(tipPercent),
    shippingOption: String(canonicalContribution?.shippingOption || 'standard'),
    hasPhysical: canonicalContribution?.hasPhysical === true,
    subtotal: canonicalContribution?.totals?.subtotal || 0,
    shipping: canonicalContribution?.totals?.shipping || 0,
    tax: canonicalContribution?.totals?.tax || 0,
    taxDetails: canonicalContribution?.totals?.taxDetails || null,
    total: canonicalContribution?.totals?.amount || 0
  };
}

export function buildCheckoutBundleHashInput({
  contributions = [],
  bundleAddOns = [],
  bundleAddOnAnchorCampaignSlug = ''
} = {}) {
  return {
    bundleAddOnAnchorCampaignSlug: String(bundleAddOnAnchorCampaignSlug || ''),
    bundleAddOns: bundleAddOns.map((entry) => ({
      productId: String(entry?.productId || ''),
      variantId: String(entry?.variantId || ''),
      quantity: toNonNegativeInteger(entry?.quantity),
      unitPrice: toNonNegativeInteger(entry?.unitPrice),
      category: String(entry?.category || '')
    })),
    contributions: contributions.map((entry) => buildCheckoutHashInput(entry))
  };
}

export async function createCheckoutIntentToken(secret, payload, options = {}) {
  const normalizedPayload = {
    ...buildCheckoutIntentPayload(payload, options)
  };

  const payloadStr = JSON.stringify(normalizedPayload);
  const payloadB64 = base64urlEncode(payloadStr);
  const signature = await hmacSign(secret, payloadB64);
  const signatureB64 = base64urlEncode(signature);
  return `${payloadB64}.${signatureB64}`;
}

export async function verifyCheckoutIntentToken(secret, token, options = {}) {
  try {
    const [payloadB64, signatureB64] = String(token || '').split('.');
    if (!payloadB64 || !signatureB64) return null;

    const expectedSig = await hmacSign(secret, payloadB64);
    const expectedSigB64 = base64urlEncode(expectedSig);
    if (!timingSafeEqual(signatureB64, expectedSigB64)) {
      return null;
    }

    const payload = JSON.parse(base64urlDecode(payloadB64));
    const expectedScope = options.expectedScope || CHECKOUT_INTENT_SCOPE;
    const nowEpochSeconds = options.nowEpochSeconds || Math.floor(Date.now() / 1000);

    if (payload.scope !== expectedScope) return null;
    if (payload.version !== CHECKOUT_INTENT_VERSION) return null;
    if (!payload.nonce || !payload.cartHash || !payload.campaignSlug) return null;
    if (!payload.exp || payload.exp < nowEpochSeconds) return null;

    return payload;
  } catch (_err) {
    return null;
  }
}

async function sha256Hex(input) {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSign(secret, data) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return new Uint8Array(signature);
}

function base64urlEncode(input) {
  let encoded;
  if (typeof input === 'string') {
    encoded = btoa(input);
  } else {
    encoded = btoa(String.fromCharCode(...input));
  }
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  let normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) normalized += '=';
  return atob(normalized);
}

function timingSafeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index++) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

function toNonNegativeInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed);
}

function toDecimalNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function compareTierEntries(a, b) {
  return a.id.localeCompare(b.id) || a.qty - b.qty;
}

function compareSupportEntries(a, b) {
  return a.id.localeCompare(b.id) || a.amount - b.amount;
}
