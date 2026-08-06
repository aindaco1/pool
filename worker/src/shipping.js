import {
  getCampaignShippingFallbackFeeCents,
  getShippingFallbackFeeCents,
  getShippingDefaultOption,
  getShippingOriginCountry,
  getUspsApiBase,
  getUspsClientId,
  getUspsFailureCooldownMs,
  getUspsQuoteCacheTtlMs,
  getUspsRateLimitCooldownMs,
  getUspsTimeoutMs,
  isCampaignFreeShippingEnabled,
  isUspsEnabled
} from './provider-config.js';
import {
  SHIPPING_OPTION_STANDARD,
  buildFallbackShippingQuote as buildCoreFallbackShippingQuote,
  buildFreeShippingQuote as buildCoreFreeShippingQuote,
  buildManualDomesticRateQuote,
  buildStandardOnlyShippingOptions,
  getAddOnShippingProfile,
  getAvailableShippingOptions as getCoreAvailableShippingOptions,
  getSelectedShippingOptionDetails,
  getSupportItemShippingProfile,
  getTierShippingProfile,
  isShippingMetadataError,
  resolveSelectedShippingOption,
  summarizePhysicalSelectionWithoutMetadata,
  summarizeShipmentSelection
} from '../../shared/dust-wave-platform/packages/shipping-core/src/index.js';
import { createUspsRateClient } from '../../shared/dust-wave-platform/packages/shipping-core/src/usps.js';

const USPS_DOMESTIC_MAIL_CLASSES = ['USPS_GROUND_ADVANTAGE', 'PRIORITY_MAIL'];
const USPS_INTERNATIONAL_MAIL_CLASSES = [
  'FIRST-CLASS_PACKAGE_INTERNATIONAL_SERVICE',
  'PRIORITY_MAIL_INTERNATIONAL'
];
export {
  getAddOnShippingProfile,
  getSelectedShippingOptionDetails,
  getSupportItemShippingProfile,
  getTierShippingProfile,
  resolveSelectedShippingOption
};
const uspsRateClient = createUspsRateClient({
  resolveConfig: (env = {}) => ({
    enabled: isUspsEnabled(env),
    apiBase: getUspsApiBase(env),
    clientId: getUspsClientId(env),
    clientSecret: String(env.USPS_CLIENT_SECRET || '').trim(),
    originCountry: getShippingOriginCountry(env),
    originZip: String(env.SHIPPING_ORIGIN_ZIP || '').trim(),
    timeoutMs: getUspsTimeoutMs(env),
    quoteCacheTtlMs: getUspsQuoteCacheTtlMs(env),
    failureCooldownMs: getUspsFailureCooldownMs(env),
    rateLimitCooldownMs: getUspsRateLimitCooldownMs(env)
  }),
  domesticMailClasses: USPS_DOMESTIC_MAIL_CLASSES,
  internationalMailClasses: USPS_INTERNATIONAL_MAIL_CLASSES
});

export function __resetShippingRuntimeStateForTests() {
  uspsRateClient.reset();
}

export function normalizeShippingDestination(address = {}) {
  const country = String(address?.country || '')
    .trim()
    .toUpperCase();
  const postalCode = String(address?.postalCode || address?.postal_code || '')
    .trim()
    .toUpperCase();

  if (!country || !/^[A-Z]{2}$/.test(country)) {
    return { valid: false, error: 'Shipping country is required' };
  }

  if (!postalCode) {
    return { valid: false, error: 'Shipping postal code is required' };
  }

  return {
    valid: true,
    destination: {
      country,
      postalCode
    }
  };
}

export function summarizeShipmentFromTierSelection(
  tierSelection = { selectedTiers: [] },
  supportItems = [],
  campaign = null,
  bundleAddOns = []
) {
  return summarizeShipmentSelection(tierSelection, supportItems, campaign, bundleAddOns);
}

export function buildFallbackShippingQuote(env, destination, shipment, campaign = null) {
  const addOnOnlyShipment = shipment?.hasPhysical === true &&
    Number(shipment?.physicalAddOnCount || 0) > 0 &&
    Number(shipment?.physicalTierCount || 0) <= 0 &&
    Number(shipment?.physicalSupportItemCount || 0) <= 0;
  const usePlatformFallback = addOnOnlyShipment && !campaign;
  return buildCoreFallbackShippingQuote({
    originCountry: getShippingOriginCountry(env),
    fallbackFeeCents: usePlatformFallback
      ? getShippingFallbackFeeCents(env)
      : getCampaignShippingFallbackFeeCents(campaign, env)
  }, destination, shipment);
}

export function buildFreeShippingQuote(env, destination, shipment) {
  return buildCoreFreeShippingQuote({
    originCountry: getShippingOriginCountry(env)
  }, destination, shipment);
}

export function getAvailableShippingOptions(
  env,
  campaign = {},
  destination = {},
  shipment = { hasPhysical: false },
  baseShippingCents = 0
) {
  return getCoreAvailableShippingOptions({
    originCountry: getShippingOriginCountry(env),
    freeShipping: isCampaignFreeShippingEnabled(campaign, env),
    configuredOptions: campaign?.shipping_options
  }, destination, shipment, baseShippingCents);
}

export async function quoteCampaignShipment(
  env,
  campaign,
  tierSelection,
  destination,
  supportItems = [],
  selectedOption = SHIPPING_OPTION_STANDARD,
  bundleAddOns = []
) {
  const configuredDefaultOption = getShippingDefaultOption(env);
  const shipmentSummary = summarizeShipmentFromTierSelection(tierSelection, supportItems, campaign, bundleAddOns);
  if (!shipmentSummary.valid) {
    if (!isShippingMetadataError(shipmentSummary.error)) {
      return shipmentSummary;
    }

    const coarseShipmentSummary = summarizePhysicalSelectionWithoutMetadata(tierSelection, supportItems, campaign, bundleAddOns);
    if (!coarseShipmentSummary.valid) {
      return coarseShipmentSummary;
    }

    const shipment = coarseShipmentSummary.shipment;
    const fallbackQuote = buildFallbackShippingQuote(env, destination, shipment, campaign);
    const availableOptions = buildStandardOnlyShippingOptions(shipment, fallbackQuote.shippingCents);
    const resolvedOption = resolveSelectedShippingOption(availableOptions, selectedOption, configuredDefaultOption);
    const selectedOptionDetails = getSelectedShippingOptionDetails(availableOptions, resolvedOption, configuredDefaultOption);
    return {
      valid: true,
      campaignSlug: campaign?.slug || '',
      shipment,
      availableOptions,
      defaultOption: configuredDefaultOption,
      selectedOption: resolvedOption,
      selectedOptionDetails,
      quote: {
        ...fallbackQuote,
        source: 'fallback_missing_metadata',
        service: fallbackQuote.domestic ? 'domestic_metadata_fallback' : 'international_metadata_fallback',
        shippingCents: Math.max(0, Number(selectedOptionDetails?.shippingCents ?? fallbackQuote.shippingCents) || 0)
      }
    };
  }

  const shipment = shipmentSummary.shipment;
  if (isCampaignFreeShippingEnabled(campaign, env)) {
    const freeQuote = buildFreeShippingQuote(env, destination, shipment);
    const availableOptions = buildStandardOnlyShippingOptions(shipment, 0);
    const resolvedOption = resolveSelectedShippingOption(availableOptions, selectedOption, configuredDefaultOption);
    const selectedOptionDetails = getSelectedShippingOptionDetails(availableOptions, resolvedOption, configuredDefaultOption);
    return {
      valid: true,
      campaignSlug: campaign?.slug || '',
      shipment,
      availableOptions,
      defaultOption: configuredDefaultOption,
      selectedOption: resolvedOption,
      selectedOptionDetails,
      quote: {
        ...freeQuote,
        shippingCents: Math.max(0, Number(selectedOptionDetails?.shippingCents ?? freeQuote.shippingCents) || 0)
      }
    };
  }

  const fallbackQuote = buildFallbackShippingQuote(env, destination, shipment, campaign);
  const explicitCampaignFallbackRate = campaign?.shipping_fallback_flat_rate;
  const hasExplicitCampaignFallbackRate =
    explicitCampaignFallbackRate !== null &&
    explicitCampaignFallbackRate !== undefined &&
    String(explicitCampaignFallbackRate).trim() !== '' &&
    Number.isFinite(Number(explicitCampaignFallbackRate)) &&
    Number(explicitCampaignFallbackRate) >= 0;

  if (!shipment.hasPhysical) {
    return {
      valid: true,
      campaignSlug: campaign?.slug || '',
      shipment,
      availableOptions: [],
      defaultOption: configuredDefaultOption,
      selectedOption: SHIPPING_OPTION_STANDARD,
      selectedOptionDetails: null,
      quote: fallbackQuote
    };
  }

  if (hasExplicitCampaignFallbackRate) {
    const availableOptions = buildStandardOnlyShippingOptions(shipment, fallbackQuote.shippingCents);
    const resolvedOption = resolveSelectedShippingOption(availableOptions, selectedOption, configuredDefaultOption);
    const selectedOptionDetails = getSelectedShippingOptionDetails(availableOptions, resolvedOption, configuredDefaultOption);
    return {
      valid: true,
      campaignSlug: campaign?.slug || '',
      shipment,
      availableOptions,
      defaultOption: configuredDefaultOption,
      selectedOption: resolvedOption,
      selectedOptionDetails,
      quote: {
        ...fallbackQuote,
        shippingCents: Math.max(0, Number(selectedOptionDetails?.shippingCents ?? fallbackQuote.shippingCents) || 0)
      }
    };
  }

  const manualDomesticQuote = buildManualDomesticRateQuote(destination, shipment);
  if (manualDomesticQuote.valid) {
    const availableOptions = buildStandardOnlyShippingOptions(shipment, manualDomesticQuote.quote.shippingCents);
    const resolvedOption = resolveSelectedShippingOption(availableOptions, selectedOption, configuredDefaultOption);
    const selectedOptionDetails = getSelectedShippingOptionDetails(availableOptions, resolvedOption, configuredDefaultOption);
    return {
      valid: true,
      campaignSlug: campaign?.slug || '',
      shipment,
      availableOptions,
      defaultOption: configuredDefaultOption,
      selectedOption: resolvedOption,
      selectedOptionDetails,
      quote: {
        ...manualDomesticQuote.quote,
        shippingCents: Math.max(0, Number(selectedOptionDetails?.shippingCents ?? manualDomesticQuote.quote.shippingCents) || 0)
      }
    };
  }

  const liveQuote = await uspsRateClient.quote(env, destination, shipment);
  if (liveQuote.valid) {
    const availableOptions = getAvailableShippingOptions(
      env,
      campaign,
      destination,
      shipment,
      liveQuote.quote.shippingCents
    );
    const resolvedOption = resolveSelectedShippingOption(availableOptions, selectedOption, configuredDefaultOption);
    const selectedOptionDetails = getSelectedShippingOptionDetails(availableOptions, resolvedOption, configuredDefaultOption);
    return {
      valid: true,
      campaignSlug: campaign?.slug || '',
      shipment,
      availableOptions,
      defaultOption: configuredDefaultOption,
      selectedOption: resolvedOption,
      selectedOptionDetails,
      quote: {
        ...liveQuote.quote,
        shippingCents: Math.max(0, Number(selectedOptionDetails?.shippingCents ?? liveQuote.quote.shippingCents) || 0)
      }
    };
  }

  const availableOptions = buildStandardOnlyShippingOptions(shipment, fallbackQuote.shippingCents);
  const resolvedOption = resolveSelectedShippingOption(availableOptions, selectedOption, configuredDefaultOption);
  const selectedOptionDetails = getSelectedShippingOptionDetails(availableOptions, resolvedOption, configuredDefaultOption);
  return {
    valid: true,
    campaignSlug: campaign?.slug || '',
    shipment,
    availableOptions,
    defaultOption: configuredDefaultOption,
    selectedOption: resolvedOption,
    selectedOptionDetails,
    quote: {
      ...fallbackQuote,
      shippingCents: Math.max(0, Number(selectedOptionDetails?.shippingCents ?? fallbackQuote.shippingCents) || 0)
    }
  };
}
