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
        data-platform-author="Fork Studio"
        data-platform-support-email="support@fork.test"
        data-default-creator-name="Fork Studio"
        data-sales-tax-rate="0.07875"
        data-flat-shipping-rate="3.00"
        data-shipping-origin-zip="80205"
        data-shipping-origin-country="US"
        data-shipping-fallback-flat-rate="3.00"
        data-shipping-free-shipping-default="false"
        data-shipping-countries='[{"value":"US","label":"United States"},{"value":"CA","label":"Canada"}]'
        data-shipping-presets='{"poster":{"weight_oz":5,"length_in":18,"width_in":3,"height_in":3}}'
        data-add-ons='{"enabled":true,"low_stock_threshold":5,"products":[{"id":"dust-wave-sticker","name":"DUST WAVE Sticker","image_url":"https://shop.dustwave.xyz/assets/images/sticker-glove.png","price":3,"inventory":50,"category":"physical","shipping_preset":"sticker","variants":[]},{"id":"dust-wave-tshirt","name":"DUST WAVE T-Shirt","image_url":"https://shop.dustwave.xyz/assets/images/dustwave-tshirt.png","price":25,"category":"physical","shipping_preset":"tshirt","variant_option_name":"Size","variants":[{"id":"s","label":"S","inventory":2},{"id":"m","label":"M","inventory":4}]}]}'
        data-default-tip-percent="5"
        data-max-tip-percent="15"
        data-live-stats-cache-ttl-seconds="300"
        data-live-inventory-cache-ttl-seconds="300"
        data-seo-x-handle="dustwave"
        data-seo-index-public-community-hub="true"
        data-debug-console-logging-enabled="true"
        data-debug-verbose-console-logging="false"
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
        author: 'Fork Studio',
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
        countries: [
          { value: 'US', label: 'United States' },
          { value: 'CA', label: 'Canada' }
        ],
        presets: {
          poster: {
            weight_oz: 5,
            length_in: 18,
            width_in: 3,
            height_in: 3
          }
        }
      },
      addOns: {
        enabled: true,
        low_stock_threshold: 5,
        products: [
        {
          id: 'dust-wave-sticker',
          name: 'DUST WAVE Sticker',
          image_url: 'https://shop.dustwave.xyz/assets/images/sticker-glove.png',
          price: 3,
          inventory: 50,
          category: 'physical',
          shipping_preset: 'sticker',
            variants: []
          },
        {
          id: 'dust-wave-tshirt',
          name: 'DUST WAVE T-Shirt',
          image_url: 'https://shop.dustwave.xyz/assets/images/dustwave-tshirt.png',
          price: 25,
            category: 'physical',
            shipping_preset: 'tshirt',
            variant_option_name: 'Size',
            variants: [
              { id: 's', label: 'S', inventory: 2 },
              { id: 'm', label: 'M', inventory: 4 }
            ]
          }
        ]
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
      seo: {
        xHandle: 'dustwave',
        indexPublicCommunityHub: 'true'
      },
      debug: {
        consoleLoggingEnabled: 'true',
        verboseConsoleLogging: 'false'
      },
      siteUrl: 'https://pool.test',
      workerBase: 'https://worker.test',
      platformName: 'Fork Pool',
      platformCompanyName: 'Fork Studio',
      platformAuthor: 'Fork Studio',
      supportEmail: 'support@fork.test',
      defaultCreatorName: 'Fork Studio',
      salesTaxRate: '0.07875',
      flatShippingRate: '3.00',
      shippingOriginZip: '80205',
      shippingOriginCountry: 'US',
      shippingFallbackFlatRate: '3.00',
      shippingFreeShippingDefault: 'false',
      shippingCountries: [
        { value: 'US', label: 'United States' },
        { value: 'CA', label: 'Canada' }
      ],
      defaultTipPercent: '5',
      maxTipPercent: '15',
      liveStatsCacheTtlSeconds: '300',
      liveInventoryCacheTtlSeconds: '300',
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'custom',
      stripePublishableKey: 'pk_test_pool',
      seoXHandle: 'dustwave',
      seoIndexPublicCommunityHub: 'true',
      debugConsoleLoggingEnabled: 'true',
      debugVerboseConsoleLogging: 'false'
    });
  });
});
