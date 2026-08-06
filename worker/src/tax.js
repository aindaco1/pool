import SalesTax from 'sales-tax';

import { getSalesTaxRate, getShippingOriginCountry } from './provider-config.js';
import { NM_GRT_STARTER_LOCATIONS } from '../../shared/dust-wave-platform/packages/tax-core/src/nm-grt-starter.js';
import {
  buildZipTaxAddress,
  lookupNewMexicoGrt,
  lookupZipTax,
  normalizeTaxProviderSource,
  parseNewMexicoStreetAddress
} from '../../shared/dust-wave-platform/packages/tax-core/src/provider.js';

const TAX_PROVIDERS = ['flat', 'offline_rules', 'external', 'zip_tax', 'nm_grt'];

export function getTaxProvider(env = {}) {
  const configured = String(env.TAX_PROVIDER || 'flat').trim().toLowerCase();
  if (configured === 'external') {
    return 'zip_tax';
  }
  return TAX_PROVIDERS.includes(configured) ? configured : 'flat';
}

export function normalizeTaxDestination(value) {
  if (!value || typeof value !== 'object') {
    return {
      valid: false,
      destination: null,
      error: 'Billing address is incomplete'
    };
  }

  const destination = {
    country: String(value.country || value.countryCode || '').trim().toUpperCase(),
    postalCode: String(value.postalCode || value.postal_code || '').trim(),
    state: String(value.state || value.province || value.region || value.stateCode || '').trim().toUpperCase(),
    city: String(value.city || '').trim(),
    line1: String(value.line1 || value.address1 || value.street || '').trim(),
    line2: String(value.line2 || value.address2 || '').trim()
  };

  if (!destination.country) {
    return {
      valid: false,
      destination: null,
      error: 'Billing country is required'
    };
  }

  if (!destination.postalCode) {
    return {
      valid: false,
      destination: null,
      error: 'Billing postal code is required'
    };
  }

  return {
    valid: true,
    destination
  };
}

export async function quoteTax(env = {}, {
  subtotalCents = 0,
  shippingCents = 0,
  destination = null
} = {}) {
  const normalizedSubtotal = Math.max(0, Number(subtotalCents) || 0);
  const normalizedShipping = Math.max(0, Number(shippingCents) || 0);
  const normalizedDestination = destination
    ? normalizeTaxDestination(destination)
    : { valid: false, destination: null };
  const provider = getTaxProvider(env);

  if (provider === 'flat') {
    return buildFlatRateQuote(env, {
      subtotalCents: normalizedSubtotal,
      shippingCents: normalizedShipping,
      destination: normalizedDestination.valid ? normalizedDestination.destination : null
    });
  }

  if (!normalizedDestination.valid) {
    throw new Error('Billing address is required to calculate tax');
  }

  if (provider === 'offline_rules') {
    return quoteOfflineRulesTax(env, {
      subtotalCents: normalizedSubtotal,
      shippingCents: normalizedShipping,
      destination: normalizedDestination.destination
    });
  }

  if (provider === 'nm_grt') {
    return quoteNewMexicoGrossReceiptsTax(env, {
      subtotalCents: normalizedSubtotal,
      shippingCents: normalizedShipping,
      destination: normalizedDestination.destination
    });
  }

  return quoteZipTax(env, {
    subtotalCents: normalizedSubtotal,
    shippingCents: normalizedShipping,
    destination: normalizedDestination.destination
  });
}

function buildFlatRateQuote(env = {}, {
  subtotalCents = 0,
  shippingCents = 0,
  destination = null
} = {}) {
  const normalizedSubtotal = Math.max(0, Number(subtotalCents) || 0);
  const normalizedShipping = Math.max(0, Number(shippingCents) || 0);
  const effectiveRate = getSalesTaxRate(env);
  const taxCents = Math.round(normalizedSubtotal * effectiveRate);
  const normalizedDestination = normalizeJurisdictionDestination(destination);

  return {
    provider: 'flat',
    source: 'flat_rate',
    taxCents,
    effectiveRate,
    taxableSubtotalCents: normalizedSubtotal,
    taxableShippingCents: 0,
    shippingTaxed: false,
    destination: normalizedDestination,
    jurisdiction: normalizedDestination
      ? {
          country: normalizedDestination.country,
          state: normalizedDestination.state || '',
          postalCode: normalizedDestination.postalCode || ''
        }
      : null,
    shippingCents: normalizedShipping,
    breakdown: [{
      label: 'sales_tax',
      rate: effectiveRate,
      taxableSubtotalCents: normalizedSubtotal,
      taxableShippingCents: 0,
      taxCents
    }]
  };
}

async function quoteOfflineRulesTax(env = {}, {
  subtotalCents = 0,
  shippingCents = 0,
  destination
} = {}) {
  const normalizedDestination = normalizeJurisdictionDestination(destination);
  const originCountry = String(env.TAX_ORIGIN_COUNTRY || getShippingOriginCountry(env) || 'US').trim().toUpperCase();
  const useRegionalOrigin = normalizeBooleanish(env.TAX_USE_REGIONAL_ORIGIN) === true;

  SalesTax.setTaxOriginCountry(originCountry, useRegionalOrigin);
  const result = await SalesTax.getSalesTax(
    normalizedDestination.country,
    normalizedDestination.state || undefined
  );

  const directCharge = result?.charge?.direct !== false;
  const effectiveRate = directCharge ? Math.max(0, Number(result?.rate) || 0) : 0;
  const shippingTaxed = false;
  const taxableShippingCents = shippingTaxed ? Math.max(0, Number(shippingCents) || 0) : 0;
  const taxableSubtotalCents = Math.max(0, Number(subtotalCents) || 0);
  const taxBaseCents = taxableSubtotalCents + taxableShippingCents;
  const taxCents = Math.round(taxBaseCents * effectiveRate);

  return {
    provider: 'offline_rules',
    source: 'offline_rules',
    taxCents,
    effectiveRate,
    taxableSubtotalCents,
    taxableShippingCents,
    shippingTaxed,
    destination: normalizedDestination,
    jurisdiction: buildOfflineJurisdiction(result, normalizedDestination),
    shippingCents: Math.max(0, Number(shippingCents) || 0),
    breakdown: Array.isArray(result?.details) && result.details.length > 0
      ? result.details.map((detail) => ({
          label: String(detail?.type || result?.type || 'tax').trim().toLowerCase() || 'tax',
          rate: Math.max(0, Number(detail?.rate ?? effectiveRate) || 0),
          taxableSubtotalCents,
          taxableShippingCents,
          taxCents: Math.round(taxBaseCents * (Math.max(0, Number(detail?.rate ?? effectiveRate) || 0)))
        }))
      : [{
          label: String(result?.type || 'tax').trim().toLowerCase() || 'tax',
          rate: effectiveRate,
          taxableSubtotalCents,
          taxableShippingCents,
          taxCents
        }]
  };
}

async function quoteZipTax(env = {}, {
  subtotalCents = 0,
  shippingCents = 0,
  destination
} = {}) {
  const normalizedDestination = normalizeJurisdictionDestination(destination);

  if (normalizedDestination.country !== 'US' && normalizedDestination.country !== 'CA') {
    return quoteOfflineRulesTax(env, {
      subtotalCents,
      shippingCents,
      destination: normalizedDestination
    });
  }

  const apiKey = String(env.ZIP_TAX_API_KEY || env.TAX_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('ZIP_TAX_API_KEY is required when TAX_PROVIDER=zip_tax');
  }

  const payload = await lookupZipTax({
    apiKey,
    address: buildZipTaxAddress(normalizedDestination),
    ...(env.ZIP_TAX_API_BASE ? { apiBase: env.ZIP_TAX_API_BASE } : {})
  });

  const salesSummary = Array.isArray(payload?.taxSummaries)
    ? payload.taxSummaries.find((summary) => String(summary?.taxType || '').trim().toUpperCase() === 'SALES_TAX')
    : null;
  const effectiveRate = Math.max(0, Number(salesSummary?.rate) || 0);
  const shippingTaxed = String(payload?.shipping?.taxable || '').trim().toUpperCase() === 'Y';
  const taxableSubtotalCents = Math.max(0, Number(subtotalCents) || 0);
  const taxableShippingCents = shippingTaxed ? Math.max(0, Number(shippingCents) || 0) : 0;
  const taxBaseCents = taxableSubtotalCents + taxableShippingCents;
  const taxCents = Math.round(taxBaseCents * effectiveRate);

  return {
    provider: 'zip_tax',
    source: 'zip_tax_v60',
    taxCents,
    effectiveRate,
    taxableSubtotalCents,
    taxableShippingCents,
    shippingTaxed,
    destination: normalizedDestination,
    jurisdiction: buildZipTaxJurisdiction(payload, normalizedDestination),
    shippingCents: Math.max(0, Number(shippingCents) || 0),
    breakdown: Array.isArray(salesSummary?.displayRates) && salesSummary.displayRates.length > 0
      ? salesSummary.displayRates.map((entry) => ({
          label: String(entry?.name || 'tax').trim().toLowerCase() || 'tax',
          rate: Math.max(0, Number(entry?.rate) || 0),
          taxableSubtotalCents,
          taxableShippingCents,
          taxCents: Math.round(taxBaseCents * (Math.max(0, Number(entry?.rate) || 0)))
        }))
      : [{
          label: 'sales_tax',
          rate: effectiveRate,
          taxableSubtotalCents,
          taxableShippingCents,
          taxCents
        }]
  };
}

async function quoteNewMexicoGrossReceiptsTax(env = {}, {
  subtotalCents = 0,
  shippingCents = 0,
  destination
} = {}) {
  const normalizedDestination = normalizeJurisdictionDestination(destination);
  if (normalizedDestination?.country !== 'US' || normalizedDestination?.state !== 'NM') {
    return quoteOfflineRulesTax(env, {
      subtotalCents,
      shippingCents,
      destination: normalizedDestination
    });
  }

  const starterMatch = findNmStarterLocation(normalizedDestination);
  const parsedStreet = parseNewMexicoStreetAddress(normalizedDestination?.line1 || '');
  if (parsedStreet && normalizedDestination.city && normalizedDestination.postalCode) {
    try {
      return await quoteNmGrtApi(env, {
        subtotalCents,
        shippingCents,
        destination: normalizedDestination,
        parsedStreet,
        starterMatch
      });
    } catch (_error) {
      if (starterMatch) {
        return buildNmStarterQuote({
          subtotalCents,
          shippingCents,
          destination: normalizedDestination,
          starterMatch
        });
      }
    }
  }

  if (starterMatch) {
    return buildNmStarterQuote({
      subtotalCents,
      shippingCents,
      destination: normalizedDestination,
      starterMatch
    });
  }

  return buildNmFallbackFlatQuote(env, {
    subtotalCents,
    shippingCents,
    destination: normalizedDestination
  });
}

async function quoteNmGrtApi(env = {}, {
  subtotalCents = 0,
  shippingCents = 0,
  destination,
  parsedStreet,
  starterMatch = null
} = {}) {
  const result = await lookupNewMexicoGrt({
    street: parsedStreet,
    city: destination.city,
    postalCode: destination.postalCode,
    county: starterMatch?.county || '',
    ...(env.NM_GRT_API_BASE ? { apiBase: env.NM_GRT_API_BASE } : {})
  });

  const effectiveRate = Math.max(0, Number(result.tax_rate) || 0) / 100;
  const taxableSubtotalCents = Math.max(0, Number(subtotalCents) || 0);
  const taxCents = Math.round(taxableSubtotalCents * effectiveRate);

  return {
    provider: 'nm_grt',
    source: `nm_grt_api_${normalizeTaxProviderSource(result.source || 'free_api')}`,
    taxCents,
    effectiveRate,
    taxableSubtotalCents,
    taxableShippingCents: 0,
    shippingTaxed: false,
    locationCode: String(result.location_code || '').trim() || null,
    destination,
    jurisdiction: {
      country: 'US',
      state: 'NM',
      postalCode: destination.postalCode || '',
      county: String(result.county || starterMatch?.county || '').trim(),
      city: destination.city || '',
      locationCode: String(result.location_code || '').trim() || null
    },
    shippingCents: Math.max(0, Number(shippingCents) || 0),
    breakdown: [{
      label: 'nm_gross_receipts_tax',
      rate: effectiveRate,
      taxableSubtotalCents,
      taxableShippingCents: 0,
      taxCents
    }]
  };
}

function buildNmStarterQuote({
  subtotalCents = 0,
  shippingCents = 0,
  destination,
  starterMatch
} = {}) {
  const taxableSubtotalCents = Math.max(0, Number(subtotalCents) || 0);
  const effectiveRate = Math.max(0, Number(starterMatch?.effectiveRate) || 0);
  const taxCents = Math.round(taxableSubtotalCents * effectiveRate);

  return {
    provider: 'nm_grt',
    source: 'nm_grt_starter_dataset',
    taxCents,
    effectiveRate,
    taxableSubtotalCents,
    taxableShippingCents: 0,
    shippingTaxed: false,
    locationCode: starterMatch?.locationCode || null,
    destination,
    jurisdiction: {
      country: 'US',
      state: 'NM',
      postalCode: destination?.postalCode || '',
      county: starterMatch?.county || '',
      city: starterMatch?.city || destination?.city || '',
      locationCode: starterMatch?.locationCode || null
    },
    shippingCents: Math.max(0, Number(shippingCents) || 0),
    breakdown: [{
      label: 'nm_gross_receipts_tax',
      rate: effectiveRate,
      taxableSubtotalCents,
      taxableShippingCents: 0,
      taxCents
    }]
  };
}

function buildNmFallbackFlatQuote(env = {}, {
  subtotalCents = 0,
  shippingCents = 0,
  destination = null
} = {}) {
  const flatQuote = buildFlatRateQuote(env, { subtotalCents, shippingCents, destination });
  return {
    ...flatQuote,
    provider: 'nm_grt',
    source: 'nm_grt_fallback_flat'
  };
}

function buildOfflineJurisdiction(result, destination) {
  return {
    country: destination?.country || '',
    state: destination?.state || '',
    postalCode: destination?.postalCode || '',
    type: String(result?.area || '').trim().toLowerCase() || 'national'
  };
}

function buildZipTaxJurisdiction(payload, destination) {
  const address = payload?.addressDetail?.address || {};
  return {
    country: destination?.country || String(address.countryCode || '').trim().toUpperCase(),
    state: String(address.stateCode || destination?.state || '').trim().toUpperCase(),
    postalCode: String(address.postalCode || destination?.postalCode || '').trim(),
    county: String(address.county || '').trim(),
    city: String(address.city || '').trim(),
    incorporated: String(payload?.addressDetail?.incorporated || '').trim().toLowerCase() === 'true'
  };
}

function normalizeJurisdictionDestination(destination) {
  if (!destination || typeof destination !== 'object') {
    return null;
  }

  return {
    country: String(destination.country || '').trim().toUpperCase(),
    postalCode: String(destination.postalCode || destination.postal_code || '').trim(),
    state: String(destination.state || destination.province || '').trim().toUpperCase(),
    city: String(destination.city || '').trim(),
    line1: String(destination.line1 || destination.address1 || '').trim(),
    line2: String(destination.line2 || destination.address2 || '').trim()
  };
}

function normalizeBooleanish(value) {
  if (value === true || value === false) return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

function findNmStarterLocation(destination) {
  const normalizedCity = normalizeNmCityName(destination?.city || '');
  const normalizedPostalCode = String(destination?.postalCode || '').trim();

  const exactCityMatch = NM_GRT_STARTER_LOCATIONS.find((entry) => {
    const aliases = Array.isArray(entry.cityAliases) ? entry.cityAliases : [];
    return entry.postalCodes.includes(normalizedPostalCode) &&
      (aliases.includes(normalizedCity) || normalizeNmCityName(entry.city) === normalizedCity);
  });
  if (exactCityMatch) return exactCityMatch;

  const postalMatches = NM_GRT_STARTER_LOCATIONS.filter((entry) => entry.postalCodes.includes(normalizedPostalCode));
  return postalMatches.length === 1 ? postalMatches[0] : null;
}

function normalizeNmCityName(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}
