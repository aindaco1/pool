import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('shared shipping option browser utilities', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (window as any).DustWaveShippingOptionUtils;
  });

  afterEach(() => {
    delete (window as any).DustWaveShippingOptionUtils;
  });

  it('preserves Pool selection, live-option visibility, and surcharge labels', async () => {
    await import('../../shared/dust-wave-platform/packages/site-shell/src/shipping-option-utils-browser.js');
    const shipping = (window as any).DustWaveShippingOptionUtils;
    const options = [
      { id: 'standard', shippingCents: 500, priceDeltaCents: 0 },
      { id: 'priority', shippingCents: 850, priceDeltaCents: 350 }
    ];

    expect(shipping.normalizeSelection(options, ' PRIORITY ', 'standard')).toBe('priority');
    expect(shipping.resolveQuote({
      totalShippingCents: 500,
      quotes: [{
        source: 'usps_live',
        shippingCents: 500,
        shipment: { hasPhysical: true },
        availableOptions: options,
        defaultOption: 'standard'
      }]
    }, 'priority', 300)).toMatchObject({
      shippingCents: 850,
      source: 'usps_live',
      selectedOption: 'priority'
    });
    expect(shipping.shouldShowOptions({
      source: 'usps_live',
      shippingCents: 500,
      availableOptions: options
    })).toBe(true);
    expect(shipping.formatChoice(options[1], (id: string) => id, (cents: number) => `$${(cents / 100).toFixed(2)}`))
      .toBe('priority (+$3.50)');
  });
});
