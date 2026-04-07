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
        data-worker-base="https://worker.test"
        data-platform-name="The Pool"
        data-sales-tax-rate="0.07875"
        data-flat-shipping-rate="3.00"
        data-live-stats-cache-ttl-seconds="300"
        data-live-inventory-cache-ttl-seconds="300"
        data-cart-runtime="first_party"
        data-checkout-provider="first_party"></script>
    `;

    await import('../../assets/js/pool-config.js');

    expect((window as any).POOL_CONFIG).toEqual({
      workerBase: 'https://worker.test',
      platformName: 'The Pool',
      salesTaxRate: '0.07875',
      flatShippingRate: '3.00',
      liveStatsCacheTtlSeconds: '300',
      liveInventoryCacheTtlSeconds: '300',
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party'
    });
  });
});
