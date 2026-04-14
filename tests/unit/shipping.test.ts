import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetShippingRuntimeStateForTests,
  buildFallbackShippingQuote,
  getAvailableShippingOptions,
  normalizeShippingDestination,
  quoteCampaignShipment,
  summarizeShipmentFromTierSelection
} from '../../worker/src/shipping.js';

afterEach(() => {
  vi.restoreAllMocks();
  __resetShippingRuntimeStateForTests();
});

describe('shipping utilities', () => {
  it('normalizes shipping destination input', () => {
    expect(normalizeShippingDestination({ country: 'us', postalCode: '80205 ' })).toEqual({
      valid: true,
      destination: {
        country: 'US',
        postalCode: '80205'
      }
    });
  });

  it('aggregates quantity-aware shipment measurements for physical tiers', () => {
    const result = summarizeShipmentFromTierSelection({
      selectedTiers: [
        {
          qty: 2,
          tier: {
            id: 'poster',
            category: 'physical',
            shipping: {
              weight_oz: 5,
              length_in: 18,
              width_in: 3,
              height_in: 3
            }
          }
        },
        {
          qty: 1,
          tier: {
            id: 'digital-pass',
            category: 'digital'
          }
        }
      ]
    });

    expect(result).toEqual({
      valid: true,
      shipment: {
        hasPhysical: true,
        physicalTierCount: 1,
        physicalSupportItemCount: 0,
        physicalAddOnCount: 0,
        physicalUnitCount: 2,
        weightOz: 10,
        lengthIn: 18,
        widthIn: 3,
        heightIn: 6,
        tierIds: ['poster'],
        supportItemIds: [],
        addOnIds: []
      }
    });
  });

  it('applies packaging weight and stack-height hints from shipping metadata', () => {
    const result = summarizeShipmentFromTierSelection({
      selectedTiers: [
        {
          qty: 2,
          tier: {
            id: 'poster',
            category: 'physical',
            shipping: {
              weight_oz: 5,
              packaging_weight_oz: 3,
              length_in: 18,
              width_in: 3,
              height_in: 3,
              stack_height_in: 0.5
            }
          }
        }
      ]
    });

    expect(result).toEqual({
      valid: true,
      shipment: {
        hasPhysical: true,
        physicalTierCount: 1,
        physicalSupportItemCount: 0,
        physicalAddOnCount: 0,
        physicalUnitCount: 2,
        weightOz: 13,
        lengthIn: 18,
        widthIn: 3,
        heightIn: 3.5,
        tierIds: ['poster'],
        supportItemIds: [],
        addOnIds: []
      }
    });
  });

  it('includes physical support items in shipment aggregation', () => {
    const result = summarizeShipmentFromTierSelection(
      {
        selectedTiers: []
      },
      [
        { id: 'signed-script', amount: 25 },
        { id: 'festival-fund', amount: 10 }
      ],
      {
        support_items: [
          {
            id: 'signed-script',
            category: 'physical',
            shipping: {
              weight_oz: 7,
              packaging_weight_oz: 2,
              length_in: 11,
              width_in: 8.5,
              height_in: 0.5
            }
          },
          {
            id: 'festival-fund',
            category: 'digital'
          }
        ]
      }
    );

    expect(result).toEqual({
      valid: true,
      shipment: {
        hasPhysical: true,
        physicalTierCount: 0,
        physicalSupportItemCount: 1,
        physicalAddOnCount: 0,
        physicalUnitCount: 1,
        weightOz: 9,
        lengthIn: 11,
        widthIn: 8.5,
        heightIn: 0.5,
        tierIds: [],
        supportItemIds: ['signed-script'],
        addOnIds: []
      }
    });
  });

  it('fails when a physical tier is missing shipping metadata', () => {
    expect(summarizeShipmentFromTierSelection({
      selectedTiers: [
        {
          qty: 1,
          tier: {
            id: 'vinyl',
            category: 'physical'
          }
        }
      ]
    })).toEqual({
      valid: false,
      error: 'Physical tier "vinyl" is missing shipping metadata'
    });
  });

  it('falls back cleanly when a physical tier is missing shipping metadata', async () => {
    const result = await quoteCampaignShipment(
      { SHIPPING_ORIGIN_COUNTRY: 'US', SHIPPING_FALLBACK_FLAT_RATE: '10.00' },
      {
        slug: 'tecolote',
        shipping_options: ['signature_required']
      },
      {
        selectedTiers: [
          {
            qty: 1,
            tier: {
              id: 'owl-sticker',
              category: 'physical'
            }
          }
        ]
      },
      { country: 'US', postalCode: '80205' }
    );

    expect(result).toEqual({
      valid: true,
      campaignSlug: 'tecolote',
      shipment: {
        hasPhysical: true,
        physicalTierCount: 1,
        physicalSupportItemCount: 0,
        physicalAddOnCount: 0,
        physicalUnitCount: 1,
        weightOz: 0,
        lengthIn: 0,
        widthIn: 0,
        heightIn: 0,
        tierIds: ['owl-sticker'],
        supportItemIds: [],
        addOnIds: [],
        metadataIncomplete: true
      },
      availableOptions: [
        { id: 'standard', label: 'Standard', domesticOnly: false, priceDeltaCents: 0, shippingCents: 1000 }
      ],
      defaultOption: 'standard',
      selectedOption: 'standard',
      selectedOptionDetails: {
        id: 'standard',
        label: 'Standard',
        domesticOnly: false,
        priceDeltaCents: 0,
        shippingCents: 1000
      },
      quote: {
        shippingCents: 1000,
        source: 'fallback_missing_metadata',
        carrier: 'fallback',
        service: 'domestic_metadata_fallback',
        domestic: true
      }
    });
  });

  it('builds a domestic fallback quote when USPS is not yet configured', () => {
    expect(buildFallbackShippingQuote(
      { SHIPPING_ORIGIN_COUNTRY: 'US', SHIPPING_FALLBACK_FLAT_RATE: '10.00' },
      { country: 'US', postalCode: '80205' },
      { hasPhysical: true }
    )).toEqual({
      shippingCents: 1000,
      source: 'fallback_flat_rate',
      carrier: 'fallback',
      service: 'domestic_ground_fallback',
      domestic: true
    });
  });

  it('returns standard plus domestic signature options only for domestic physical shipments', () => {
    expect(getAvailableShippingOptions(
      { SHIPPING_ORIGIN_COUNTRY: 'US' },
      { shipping_options: ['signature_required', 'adult_signature_required'] },
      { country: 'US', postalCode: '80205' },
      { hasPhysical: true }
    )).toEqual([
      { id: 'standard', label: 'Standard', domesticOnly: false, priceDeltaCents: 0, shippingCents: 0 },
      { id: 'signature_required', label: 'Signature required', domesticOnly: true, priceDeltaCents: 395, shippingCents: 395 },
      { id: 'adult_signature_required', label: 'Adult signature required', domesticOnly: true, priceDeltaCents: 970, shippingCents: 970 }
    ]);
  });

  it('keeps only standard shipping for international physical shipments', () => {
    expect(getAvailableShippingOptions(
      { SHIPPING_ORIGIN_COUNTRY: 'US' },
      { shipping_options: ['signature_required', 'adult_signature_required'] },
      { country: 'CA', postalCode: 'M5V 2T6' },
      { hasPhysical: true }
    )).toEqual([
      { id: 'standard', label: 'Standard', domesticOnly: false, priceDeltaCents: 0, shippingCents: 0 }
    ]);
  });

  it('returns a free-shipping quote when the deployment default enables free shipping', async () => {
    const result = await quoteCampaignShipment(
      {
        SHIPPING_ORIGIN_COUNTRY: 'US',
        SHIPPING_FALLBACK_FLAT_RATE: '10.00',
        FREE_SHIPPING_DEFAULT: 'true'
      },
      { slug: 'smoke-editable', shipping_options: ['signature_required'] },
      {
        selectedTiers: [
          {
            qty: 1,
            tier: {
              id: 'poster',
              category: 'physical',
              shipping: {
                weight_oz: 5,
                length_in: 18,
                width_in: 3,
                height_in: 3
              }
            }
          }
        ]
      },
      { country: 'US', postalCode: '80205' }
    );

    expect(result.quote).toEqual({
      shippingCents: 0,
      source: 'free_shipping',
      carrier: null,
      service: 'free_shipping',
      domestic: true
    });
    expect(result.selectedOption).toBe('standard');
    expect(result.availableOptions).toEqual([
      { id: 'standard', label: 'Standard', domesticOnly: false, priceDeltaCents: 0, shippingCents: 0 }
    ]);
  });

  it('allows a campaign to force paid shipping even when the deployment default is free shipping', () => {
    expect(buildFallbackShippingQuote(
      {
        SHIPPING_ORIGIN_COUNTRY: 'US',
        SHIPPING_FALLBACK_FLAT_RATE: '10.00',
        FREE_SHIPPING_DEFAULT: 'true'
      },
      { country: 'US', postalCode: '80205' },
      { hasPhysical: true },
      { free_shipping: 'false', shipping_fallback_flat_rate: 12 }
    )).toEqual({
      shippingCents: 1200,
      source: 'fallback_flat_rate',
      carrier: 'fallback',
      service: 'domestic_ground_fallback',
      domestic: true
    });
  });

  it('prefers a campaign-specific fallback shipping rate when present', () => {
    expect(buildFallbackShippingQuote(
      { SHIPPING_ORIGIN_COUNTRY: 'US', SHIPPING_FALLBACK_FLAT_RATE: '10.00' },
      { country: 'CA', postalCode: 'M5V 2T6' },
      { hasPhysical: true },
      { shipping_fallback_flat_rate: 12 }
    )).toEqual({
      shippingCents: 1200,
      source: 'fallback_flat_rate',
      carrier: 'fallback',
      service: 'international_ground_fallback',
      domestic: false
    });
  });

  it('uses the global fallback rate when a campaign does not set an override', () => {
    expect(buildFallbackShippingQuote(
      { SHIPPING_ORIGIN_COUNTRY: 'US', SHIPPING_FALLBACK_FLAT_RATE: '10.00' },
      { country: 'US', postalCode: '80205' },
      { hasPhysical: true },
      { shipping_fallback_flat_rate: null }
    )).toEqual({
      shippingCents: 1000,
      source: 'fallback_flat_rate',
      carrier: 'fallback',
      service: 'domestic_ground_fallback',
      domestic: true
    });
  });

  it('uses the global fallback rate for add-on-only platform shipments', () => {
    expect(buildFallbackShippingQuote(
      { SHIPPING_ORIGIN_COUNTRY: 'US', SHIPPING_FALLBACK_FLAT_RATE: '3.00' },
      { country: 'US', postalCode: '80205' },
      {
        hasPhysical: true,
        physicalTierCount: 0,
        physicalSupportItemCount: 0,
        physicalAddOnCount: 1
      },
      null
    )).toEqual({
      shippingCents: 300,
      source: 'fallback_flat_rate',
      carrier: 'fallback',
      service: 'domestic_ground_fallback',
      domestic: true
    });
  });

  it('uses the campaign override for add-on-only campaign shipments', () => {
    expect(buildFallbackShippingQuote(
      { SHIPPING_ORIGIN_COUNTRY: 'US', SHIPPING_FALLBACK_FLAT_RATE: '3.00' },
      { country: 'US', postalCode: '80205' },
      {
        hasPhysical: true,
        physicalTierCount: 0,
        physicalSupportItemCount: 0,
        physicalAddOnCount: 1
      },
      { shipping_fallback_flat_rate: 12 }
    )).toEqual({
      shippingCents: 1200,
      source: 'fallback_flat_rate',
      carrier: 'fallback',
      service: 'domestic_ground_fallback',
      domestic: true
    });
  });

  it('quotes international fallback shipping with the same canonical contract', async () => {
    const result = await quoteCampaignShipment(
      { SHIPPING_ORIGIN_COUNTRY: 'US', SHIPPING_FALLBACK_FLAT_RATE: '10.00' },
      { slug: 'smoke-editable' },
      {
        selectedTiers: [
          {
            qty: 1,
            tier: {
              id: 'poster',
              category: 'physical',
              shipping: {
                weight_oz: 5,
                length_in: 18,
                width_in: 3,
                height_in: 3
              }
            }
          }
        ]
      },
      { country: 'CA', postalCode: 'M5V 2T6' }
    );

    expect(result).toEqual({
      valid: true,
      campaignSlug: 'smoke-editable',
      shipment: {
        hasPhysical: true,
        physicalTierCount: 1,
        physicalSupportItemCount: 0,
        physicalAddOnCount: 0,
        physicalUnitCount: 1,
        weightOz: 5,
        lengthIn: 18,
        widthIn: 3,
        heightIn: 3,
        tierIds: ['poster'],
        supportItemIds: [],
        addOnIds: []
      },
      availableOptions: [
        { id: 'standard', label: 'Standard', domesticOnly: false, priceDeltaCents: 0, shippingCents: 1000 }
      ],
      defaultOption: 'standard',
      selectedOption: 'standard',
      selectedOptionDetails: { id: 'standard', label: 'Standard', domesticOnly: false, priceDeltaCents: 0, shippingCents: 1000 },
      quote: {
        shippingCents: 1000,
        source: 'fallback_flat_rate',
        carrier: 'fallback',
        service: 'international_ground_fallback',
        domestic: false
      }
    });
  });

  it('uses USPS live rates when credentials are available and USPS responds', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://apis-live.usps.test/oauth2/v3/token') {
        return new Response(JSON.stringify({
          access_token: 'token_123',
          expires_in: 3600
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === 'https://apis-live.usps.test/prices/v3/base-rates/search') {
        return new Response(JSON.stringify({
          totalBasePrice: 6.75,
          rates: [
            {
              mailClass: 'USPS_GROUND_ADVANTAGE',
              description: 'USPS Ground Advantage'
            }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await quoteCampaignShipment(
      {
        APP_MODE: 'test',
        USPS_API_BASE: 'https://apis-live.usps.test',
        SHIPPING_ORIGIN_ZIP: '80205',
        SHIPPING_ORIGIN_COUNTRY: 'US',
        SHIPPING_FALLBACK_FLAT_RATE: '10.00',
        USPS_CLIENT_ID: 'client',
        USPS_CLIENT_SECRET: 'secret'
      },
      {
        slug: 'smoke-editable',
        shipping_options: ['signature_required', 'adult_signature_required']
      },
      {
        selectedTiers: [
          {
            qty: 1,
            tier: {
              id: 'poster',
              category: 'physical',
              shipping: {
                weight_oz: 5,
                length_in: 18,
                width_in: 3,
                height_in: 3
              }
            }
          }
        ]
      },
      { country: 'US', postalCode: '80205' }
    );

    expect(result).toEqual({
      valid: true,
      campaignSlug: 'smoke-editable',
      shipment: {
        hasPhysical: true,
        physicalTierCount: 1,
        physicalSupportItemCount: 0,
        physicalAddOnCount: 0,
        physicalUnitCount: 1,
        weightOz: 5,
        lengthIn: 18,
        widthIn: 3,
        heightIn: 3,
        tierIds: ['poster'],
        supportItemIds: [],
        addOnIds: []
      },
      availableOptions: [
        { id: 'standard', label: 'Standard', domesticOnly: false, priceDeltaCents: 0, shippingCents: 675 },
        { id: 'signature_required', label: 'Signature required', domesticOnly: true, priceDeltaCents: 395, shippingCents: 1070 },
        { id: 'adult_signature_required', label: 'Adult signature required', domesticOnly: true, priceDeltaCents: 970, shippingCents: 1645 }
      ],
      defaultOption: 'standard',
      selectedOption: 'standard',
      selectedOptionDetails: { id: 'standard', label: 'Standard', domesticOnly: false, priceDeltaCents: 0, shippingCents: 675 },
      quote: {
        shippingCents: 675,
        source: 'usps_live',
        carrier: 'usps',
        service: 'usps_ground_advantage',
        domestic: true
      }
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reuses a recent USPS quote for the same shipment instead of calling USPS again', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://apis-live.usps.test/oauth2/v3/token') {
        return new Response(JSON.stringify({
          access_token: 'token_123',
          expires_in: 3600
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === 'https://apis-live.usps.test/prices/v3/base-rates/search') {
        return new Response(JSON.stringify({
          totalBasePrice: 6.75,
          rates: [
            {
              mailClass: 'USPS_GROUND_ADVANTAGE',
              description: 'USPS Ground Advantage'
            }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const env = {
      APP_MODE: 'test',
      USPS_ENABLED: 'true',
      USPS_API_BASE: 'https://apis-live.usps.test',
      USPS_QUOTE_CACHE_TTL_SECONDS: '600',
      SHIPPING_ORIGIN_ZIP: '80205',
      SHIPPING_ORIGIN_COUNTRY: 'US',
      SHIPPING_FALLBACK_FLAT_RATE: '10.00',
      USPS_CLIENT_ID: 'client',
      USPS_CLIENT_SECRET: 'secret'
    };
    const campaign = { slug: 'smoke-editable' };
    const tierSelection = {
      selectedTiers: [
        {
          qty: 1,
          tier: {
            id: 'poster',
            category: 'physical',
            shipping: {
              weight_oz: 5,
              length_in: 18,
              width_in: 3,
              height_in: 3
            }
          }
        }
      ]
    };
    const destination = { country: 'US', postalCode: '80205' };

    const firstQuote = await quoteCampaignShipment(env, campaign, tierSelection, destination);
    const secondQuote = await quoteCampaignShipment(env, campaign, tierSelection, destination);

    expect(firstQuote.quote.shippingCents).toBe(675);
    expect(secondQuote.quote.shippingCents).toBe(675);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to the configured flat rate when USPS pricing fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://apis-fallback.usps.test/oauth2/v3/token') {
        return new Response(JSON.stringify({
          access_token: 'token_123',
          expires_in: 3600
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === 'https://apis-fallback.usps.test/international-prices/v3/base-rates/search') {
        return new Response(JSON.stringify({ error: 'service unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await quoteCampaignShipment(
      {
        APP_MODE: 'test',
        USPS_API_BASE: 'https://apis-fallback.usps.test',
        SHIPPING_ORIGIN_ZIP: '80205',
        SHIPPING_ORIGIN_COUNTRY: 'US',
        SHIPPING_FALLBACK_FLAT_RATE: '10.00',
        USPS_CLIENT_ID: 'client',
        USPS_CLIENT_SECRET: 'secret'
      },
      {
        slug: 'smoke-editable',
        shipping_options: ['signature_required', 'adult_signature_required']
      },
      {
        selectedTiers: [
          {
            qty: 1,
            tier: {
              id: 'poster',
              category: 'physical',
              shipping: {
                weight_oz: 5,
                length_in: 18,
                width_in: 3,
                height_in: 3
              }
            }
          }
        ]
      },
      { country: 'CA', postalCode: 'M5V 2T6' }
    );

    expect(result).toEqual({
      valid: true,
      campaignSlug: 'smoke-editable',
      shipment: {
        hasPhysical: true,
        physicalTierCount: 1,
        physicalSupportItemCount: 0,
        physicalAddOnCount: 0,
        physicalUnitCount: 1,
        weightOz: 5,
        lengthIn: 18,
        widthIn: 3,
        heightIn: 3,
        tierIds: ['poster'],
        supportItemIds: [],
        addOnIds: []
      },
      availableOptions: [
        { id: 'standard', label: 'Standard', domesticOnly: false, priceDeltaCents: 0, shippingCents: 1000 }
      ],
      defaultOption: 'standard',
      selectedOption: 'standard',
      selectedOptionDetails: { id: 'standard', label: 'Standard', domesticOnly: false, priceDeltaCents: 0, shippingCents: 1000 },
      quote: {
        shippingCents: 1000,
        source: 'fallback_flat_rate',
        carrier: 'fallback',
        service: 'international_ground_fallback',
        domestic: false
      }
    });
  });

  it('backs off after a USPS rate-limit response and falls back without re-calling USPS immediately', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://apis-fallback.usps.test/oauth2/v3/token') {
        return new Response(JSON.stringify({
          access_token: 'token_123',
          expires_in: 3600
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === 'https://apis-fallback.usps.test/international-prices/v3/base-rates/search') {
        return new Response(JSON.stringify({ error: 'rate limited' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const env = {
      APP_MODE: 'test',
      USPS_ENABLED: 'true',
      USPS_API_BASE: 'https://apis-fallback.usps.test',
      USPS_RATE_LIMIT_COOLDOWN_SECONDS: '1800',
      SHIPPING_ORIGIN_ZIP: '80205',
      SHIPPING_ORIGIN_COUNTRY: 'US',
      SHIPPING_FALLBACK_FLAT_RATE: '10.00',
      USPS_CLIENT_ID: 'client',
      USPS_CLIENT_SECRET: 'secret'
    };
    const campaign = { slug: 'smoke-editable' };
    const tierSelection = {
      selectedTiers: [
        {
          qty: 1,
          tier: {
            id: 'poster',
            category: 'physical',
            shipping: {
              weight_oz: 5,
              length_in: 18,
              width_in: 3,
              height_in: 3
            }
          }
        }
      ]
    };
    const destination = { country: 'CA', postalCode: 'M5V 2T6' };

    const firstQuote = await quoteCampaignShipment(env, campaign, tierSelection, destination);
    const secondQuote = await quoteCampaignShipment(env, campaign, tierSelection, destination);

    expect(firstQuote.quote.source).toBe('fallback_flat_rate');
    expect(secondQuote.quote.source).toBe('fallback_flat_rate');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('applies a selected domestic signature option to the quoted shipping total', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://apis-live.usps.test/oauth2/v3/token') {
        return new Response(JSON.stringify({
          access_token: 'token_123',
          expires_in: 3600
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === 'https://apis-live.usps.test/prices/v3/base-rates/search') {
        return new Response(JSON.stringify({
          totalBasePrice: 6.75,
          rates: [
            {
              mailClass: 'USPS_GROUND_ADVANTAGE',
              description: 'USPS Ground Advantage'
            }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await quoteCampaignShipment(
      {
        APP_MODE: 'test',
        USPS_API_BASE: 'https://apis-live.usps.test',
        SHIPPING_ORIGIN_ZIP: '80205',
        SHIPPING_ORIGIN_COUNTRY: 'US',
        SHIPPING_FALLBACK_FLAT_RATE: '10.00',
        USPS_CLIENT_ID: 'client',
        USPS_CLIENT_SECRET: 'secret'
      },
      {
        slug: 'smoke-editable',
        shipping_options: ['signature_required', 'adult_signature_required']
      },
      {
        selectedTiers: [
          {
            qty: 1,
            tier: {
              id: 'poster',
              category: 'physical',
              shipping: {
                weight_oz: 5,
                length_in: 18,
                width_in: 3,
                height_in: 3
              }
            }
          }
        ]
      },
      { country: 'US', postalCode: '80205' },
      [],
      'signature_required'
    );

    expect(result.selectedOption).toBe('signature_required');
    expect(result.selectedOptionDetails).toEqual({
      id: 'signature_required',
      label: 'Signature required',
      domesticOnly: true,
      priceDeltaCents: 395,
      shippingCents: 1070
    });
    expect(result.quote.shippingCents).toBe(1070);
  });
});
