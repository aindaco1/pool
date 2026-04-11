import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('config boot scripts', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    delete (window as any).POOL_CONFIG;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    delete (window as any).POOL_CONFIG;
  });

  it('hydrates POOL_CONFIG from script data attributes', async () => {
    document.body.innerHTML = `
      <script
        data-pool-config-script="true"
        data-current-lang="es"
        data-runtime-messages='{"cart":{"checkout":"Pagar"},"manage":{"saved":"Guardado"}}'
        data-site-url="https://pool.test"
        data-worker-base="https://worker.test"
        data-platform-name="Fork Pool"
        data-platform-company-name="Fork Studio"
        data-platform-support-email="support@fork.test"
        data-default-creator-name="Fork Studio"
        data-sales-tax-rate="0.07875"
        data-flat-shipping-rate="3.00"
        data-shipping-origin-zip="80205"
        data-shipping-origin-country="US"
        data-shipping-fallback-flat-rate="3.00"
        data-shipping-free-shipping-default="false"
        data-shipping-presets='{"poster":{"weight_oz":5,"length_in":18,"width_in":3,"height_in":3}}'
        data-default-tip-percent="5"
        data-max-tip-percent="15"
        data-live-stats-cache-ttl-seconds="300"
        data-live-inventory-cache-ttl-seconds="300"
        data-stripe-publishable-key="pk_test_pool"></script>
    `;

    await import('../../assets/js/pool-config.js');

    expect((window as any).POOL_CONFIG).toEqual({
      i18n: {
        currentLang: 'es',
        messages: {
          cart: {
            checkout: 'Pagar'
          },
          manage: {
            saved: 'Guardado'
          }
        }
      },
      platform: {
        name: 'Fork Pool',
        companyName: 'Fork Studio',
        supportEmail: 'support@fork.test',
        siteUrl: 'https://pool.test',
        workerUrl: 'https://worker.test',
        defaultCreatorName: 'Fork Studio'
      },
      pricing: {
        salesTaxRate: '0.07875',
        flatShippingRate: '3.00',
        defaultTipPercent: '5',
        maxTipPercent: '15'
      },
      shipping: {
        originZip: '80205',
        originCountry: 'US',
        fallbackFlatRate: '3.00',
        freeShippingDefault: 'false',
        presets: {
          poster: {
            weight_oz: 5,
            length_in: 18,
            width_in: 3,
            height_in: 3
          }
        }
      },
      cache: {
        liveStatsTtlSeconds: '300',
        liveInventoryTtlSeconds: '300'
      },
      checkout: {
        cartRuntime: 'first_party',
        provider: 'first_party',
        uiMode: 'custom',
        stripePublishableKey: 'pk_test_pool'
      },
      siteUrl: 'https://pool.test',
      workerBase: 'https://worker.test',
      platformName: 'Fork Pool',
      platformCompanyName: 'Fork Studio',
      supportEmail: 'support@fork.test',
      defaultCreatorName: 'Fork Studio',
      salesTaxRate: '0.07875',
      flatShippingRate: '3.00',
      shippingOriginZip: '80205',
      shippingOriginCountry: 'US',
      shippingFallbackFlatRate: '3.00',
      shippingFreeShippingDefault: 'false',
      defaultTipPercent: '5',
      maxTipPercent: '15',
      liveStatsCacheTtlSeconds: '300',
      liveInventoryCacheTtlSeconds: '300',
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'custom',
      stripePublishableKey: 'pk_test_pool'
    });
  });
});
