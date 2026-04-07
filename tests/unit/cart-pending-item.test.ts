import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('first-party pending cart handoff', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.clear();

    document.body.innerHTML = `
      <div data-pool-cart-root="true"></div>
      <span class="poolcart-total-price"></span>
    `;

    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      platformName: 'The Pool'
    };

    localStorage.setItem('pendingCartItem', JSON.stringify({
      id: 'demo__featured-tier',
      name: 'Demo Featured Tier',
      price: 25,
      url: '/campaigns/demo/#tier-featured',
      description: 'Featured support tier',
      stackable: false,
      shippable: false,
      maxQuantity: 1,
      customFields: [
        {
          name: '_category',
          type: 'hidden',
          value: 'physical',
          placeholder: '',
          required: false
        }
      ]
    }));

    (globalThis as any).requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
    delete (window as any).POOL_CONFIG;
    delete (window as any).PoolCartProvider;
    delete (globalThis as any).requestAnimationFrame;
    document.body.innerHTML = '';
  });

  it('consumes pendingCartItem through cart.js when first-party runtime boots', async () => {
    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    const onOpened = vi.fn();
    provider.events.on('cart.opened', onOpened);

    await import('../../assets/js/cart.js');
    await vi.runAllTimersAsync();

    expect(localStorage.getItem('pendingCartItem')).toBeNull();
    expect(provider.store.getState()).toMatchObject({
      cart: {
        subtotal: 25,
        total: 31.22,
        items: {
          count: 1,
          items: [
            expect.objectContaining({
              id: 'demo__featured-tier',
              name: 'Demo Featured Tier'
            })
          ]
        }
      }
    });
    await readyApi.api.theme.cart.open();
    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    expect(root?.textContent).toContain('Shipping');
    expect(root?.textContent).toContain('$3.00');
    expect(onOpened).toHaveBeenCalled();
  });

  it('preserves physical-item metadata when cart.js handles redirect add buttons', async () => {
    document.body.innerHTML = `
      <div data-pool-cart-root="true"></div>
      <span class="poolcart-total-price"></span>
      <button
        class="poolcart-add-item"
        data-item-id="sunder__physical-media"
        data-item-name="sunder — physical media"
        data-item-price="35"
        data-item-url="/campaigns/sunder/"
        data-item-description="Physical item"
        data-item-stackable="never"
        data-item-shippable="true"
        data-item-max-quantity="1"
        data-item-custom1-name="_category"
        data-item-custom1-type="hidden"
        data-item-custom1-value="physical"
        data-redirect-url="#campaign-sunder"
        type="button"
      >
        View and add
      </button>
    `;
    localStorage.removeItem('pendingCartItem');

    await import('../../assets/js/cart-provider.js');
    await import('../../assets/js/cart.js');

    const button = document.querySelector('.poolcart-add-item') as HTMLButtonElement | null;
    if (!button) throw new Error('Missing redirect add item button');
    button.click();

    const pendingItem = JSON.parse(localStorage.getItem('pendingCartItem') || '{}');
    expect(pendingItem).toMatchObject({
      id: 'sunder__physical-media',
      name: 'sunder — physical media',
      shippable: true,
      maxQuantity: 1,
      customFields: [
        expect.objectContaining({
          name: '_category',
          value: 'physical'
        })
      ]
    });
    expect(window.location.hash).toBe('#campaign-sunder');
  });
});
