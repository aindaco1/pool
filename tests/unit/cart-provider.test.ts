import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WORKER_BASE = 'https://worker.test';
const SHIPPING_COUNTRIES = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' }
];
const ADD_ON_CONFIG = {
  enabled: true,
  low_stock_threshold: 5,
  products: [
    {
      id: 'dust-wave-sticker',
      name: 'DUST WAVE Sticker',
      description: '3" x 3" matte laminated circle-cut vinyl sticker.',
      image_url: '/assets/images/add-ons/sticker-glove.png',
      price: 3,
      category: 'physical',
      inventory: 50,
      variants: []
    },
    {
      id: 'dust-wave-tshirt',
      name: 'DUST WAVE T-Shirt',
      description: 'Our official t-shirt. 100% cotton.',
      image_url: '/assets/images/add-ons/dustwave-tshirt.png',
      price: 25,
      category: 'physical',
      variants: [
        { id: 'm', label: 'M', inventory: 4 },
        { id: 'l', label: 'L', inventory: 1 }
      ]
    },
    {
      id: 'smoke-editable__first-time-sexpot-poster',
      name: 'First Time Sexpot Poster',
      description: '18” x 24” First Time Sexpot poster.',
      image_url: '/assets/images/campaign-add-ons/sexpot-poster.png',
      price: 35,
      category: 'physical',
      inventory: 10,
      scope: 'campaign',
      campaign_slug: 'smoke-editable',
      campaign_title: 'SMOKE EDITABLE',
      variants: []
    }
  ]
};

describe('cart provider shim', () => {
  async function clearProviderCart(provider: any) {
    const existingItems = provider?.store?.getState?.()?.cart?.items?.items || [];
    for (const item of existingItems) {
      if (item?.uniqueId) {
        await provider.api.cart.items.remove(item.uniqueId);
      }
    }
  }

  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    window.location.hash = '';
    document.body.innerHTML = '<div data-pool-cart-root="true"></div>';
    const originalConsoleError = console.error;
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      const firstArg = args[0];
      if (typeof firstArg === 'string' && firstArg.includes('Not implemented: navigation')) {
        return;
      }
      if (firstArg instanceof Error && String(firstArg.message || '').includes('Not implemented: navigation')) {
        return;
      }
      originalConsoleError(...args);
    });

    Object.assign(window, {
      POOL_CONFIG: {
        cartRuntime: 'first_party',
        checkoutProvider: 'first_party',
        checkoutUiMode: 'hosted',
        workerBase: WORKER_BASE,
        shipping: {
          countries: SHIPPING_COUNTRIES
        }
      }
    });
  });

  afterEach(() => {
    const documentAny = document as any;
    const cleanupHandlers = [
      ['click', '_poolFirstPartyCartChromeHandler'],
      ['input', '_poolFirstPartyCartInputHandler'],
      ['change', '_poolFirstPartyCartChangeHandler'],
      ['click', '_poolFirstPartyRecoveryHandler'],
      ['click', '_poolFirstPartyAddButtonHandler']
    ] as const;

    for (const [eventName, key] of cleanupHandlers) {
      const handler = documentAny[key];
      if (typeof handler === 'function') {
        document.removeEventListener(eventName, handler);
      }
      delete documentAny[key];
    }

    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.location.hash = '';
    window.history.replaceState({}, '', '/');
    delete (window as any).POOL_CONFIG;
    delete (window as any).PoolCartProvider;
    delete (window as any).PoolStripeCheckoutSidecar;
    delete (window as any).Stripe;
    delete (window as any).invalidateInventoryCache;
    delete (window as any).invalidateStatsCache;
    document.body.innerHTML = '';
  });

  it('exposes a first-party provider as the only browser cart runtime', async () => {
    const readyEvents: Array<string> = [];
    document.addEventListener('poolcart.provider.ready', () => readyEvents.push('provider'));
    document.addEventListener('poolcart.ready', () => readyEvents.push('cart'));

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    expect(provider).toBeTruthy();
    expect(provider.requestedRuntime).toBe('first_party');
    expect(provider.activeRuntime).toBe('first_party');
    expect(provider.getLegacyGlobal()).toBeNull();
    expect(provider.store.getState()).toMatchObject({
      cart: {
        token: expect.stringContaining('poolcart_'),
        items: {
          count: 0,
          items: []
        }
      }
    });

    await expect(provider.whenReady()).resolves.toBe(provider.getApi());
    expect(readyEvents).toEqual(['provider', 'cart']);
  });

  it('exposes an inert first-party provider contract when requested', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'hosted',
      workerBase: WORKER_BASE
    };

    const readyEvents: Array<string> = [];
    document.addEventListener('poolcart.provider.ready', () => readyEvents.push('provider'));
    document.addEventListener('poolcart.ready', () => readyEvents.push('cart'));

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    expect(provider).toBeTruthy();
    expect(provider.requestedRuntime).toBe('first_party');
    expect(provider.activeRuntime).toBe('first_party');
    expect(provider.getLegacyGlobal()).toBeNull();
    expect(provider.store.getState()).toMatchObject({
      cart: {
        token: expect.stringContaining('poolcart_'),
        items: {
          count: 0,
          items: []
        }
      }
    });

    const readyApi = await provider.whenReady();
    expect(readyApi).toBe(provider.getApi());

    const onAdded = vi.fn();
    const onRouteChanged = vi.fn();
    provider.events.on('item.added', onAdded);
    provider.events.on('theme.routechanged', onRouteChanged);

    const addedItem = await readyApi.api.cart.items.add({
      id: 'demo__tier',
      name: 'Demo Tier',
      price: 12,
      url: '/campaigns/demo/'
    });

    expect(addedItem.uniqueId).toEqual(expect.stringContaining('poolitem_'));
    expect(provider.store.getState()).toMatchObject({
      cart: {
        subtotal: 12,
        total: 12.6,
        items: {
          count: 1
        }
      }
    });
    expect(onAdded).toHaveBeenCalledWith(expect.objectContaining({ id: 'demo__tier' }));

    await readyApi.api.cart.update({
      email: 'supporter@example.com',
      billingAddress: {
        name: 'Supporter'
      }
    });
    expect(provider.store.getState()).toMatchObject({
      cart: {
        email: 'supporter@example.com',
        billingAddress: {
          name: 'Supporter'
        }
      }
    });
    expect(JSON.parse(localStorage.getItem('pool_first_party_cart_state') || '{}')).not.toHaveProperty('email');
    expect(JSON.parse(localStorage.getItem('pool_first_party_cart_state') || '{}')).not.toHaveProperty('billingAddress');
    expect(JSON.parse(localStorage.getItem('pool_first_party_cart_state') || '{}')).not.toHaveProperty('customer');
    expect(JSON.parse(sessionStorage.getItem('pool_first_party_cart_draft') || '{}')).toMatchObject({
      email: 'supporter@example.com',
      billingAddress: {
        name: 'Supporter'
      },
      customer: {
        email: 'supporter@example.com'
      }
    });

    await readyApi.api.theme.cart.navigate('/checkout');
    expect(onRouteChanged).toHaveBeenCalledWith({
      from: null,
      to: '/checkout'
    });

    expect(readyEvents).toEqual(['provider', 'cart']);
  });

  it('handles simple add-item button clicks in first-party mode', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      workerBase: WORKER_BASE
    };

    document.body.innerHTML = `
      <div data-pool-cart-root="true"></div>
      <button
        class="poolcart-add-item"
        data-item-id="demo__support"
        data-item-name="Demo Support"
        data-item-price="15"
        data-item-url="/campaigns/demo/"
        data-item-description="Support the demo"
        data-item-stackable="never"
        data-item-max-quantity="1"
        type="button"
      >
        Add support
      </button>
    `;

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const onOpened = vi.fn();
    provider.events.on('cart.opened', onOpened);

    const button = document.querySelector('.poolcart-add-item') as HTMLButtonElement | null;
    if (!button) throw new Error('Missing add item button');
    button.click();

    await Promise.resolve();

    expect(provider.store.getState()).toMatchObject({
      cart: {
        subtotal: 15,
        total: 15.75,
        items: {
          count: 1,
          items: [
            expect.objectContaining({
              id: 'demo__support',
              name: 'Demo Support'
            })
          ]
        }
      }
    });
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it('renders item images, descriptions, and variant meta in the cart sidecar', async () => {
    document.body.innerHTML = '<div data-pool-cart-root="true"></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await clearProviderCart(provider);
    await readyApi.api.cart.items.add({
      id: 'smoke-editable__standard-pass',
      name: 'SMOKE EDITABLE — Standard Pass',
      price: 10,
      url: '/campaigns/smoke-editable/'
    });
    await readyApi.api.cart.items.add({
      id: 'addon__dust-wave-tshirt__variant__m',
      name: 'DUST WAVE T-Shirt',
      price: 25,
      quantity: 2,
      imageUrl: '/assets/images/add-ons/dustwave-tshirt.png',
      description: 'Our official t-shirt. 100% cotton.',
      stackable: true,
      customFields: [
        { name: '_variant_label', value: 'Size: M' }
      ]
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    expect(root?.textContent).toContain('Our official t-shirt. 100% cotton.');
    expect(root?.textContent).toContain('Size: M');
    expect(root?.textContent).toContain('Qty 2');
  });

  it('renders platform add-ons in the cart and lets you add them with shared catalog metadata', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'hosted',
      workerBase: WORKER_BASE,
      addOns: ADD_ON_CONFIG
    };

    document.body.innerHTML = '<div data-pool-cart-root="true"></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await clearProviderCart(provider);
    await readyApi.api.cart.items.add({
      id: 'smoke-editable__standard-pass',
      name: 'SMOKE EDITABLE — Standard Pass',
      price: 10,
      url: '/campaigns/smoke-editable/',
      description: 'A normal digital tier'
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    expect(root?.textContent).toContain('Add-ons');
    expect(root?.textContent).toContain('3" x 3" matte laminated circle-cut vinyl sticker.');
    expect(root?.textContent).toContain('50 left');

    const stickerQty = root?.querySelector('[data-cart-addon-product-quantity][data-addon-product-id="dust-wave-sticker"]') as HTMLInputElement | null;
    if (!stickerQty) throw new Error('Missing add-on quantity input');
    stickerQty.value = '2';
    stickerQty.dispatchEvent(new Event('input', { bubbles: true }));
    const addButton = root?.querySelector('[data-cart-addon-add][data-addon-product-id="dust-wave-sticker"]') as HTMLButtonElement | null;
    if (!addButton) throw new Error('Missing add-on add button');
    addButton.click();

    const cartItems = provider.store.getState().cart.items.items;
    expect(cartItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'addon__dust-wave-sticker',
          quantity: 2,
          imageUrl: '/assets/images/add-ons/sticker-glove.png',
          description: '3" x 3" matte laminated circle-cut vinyl sticker.'
        })
      ])
    );
  });

  it('renders campaign add-ons in a separate section for the owning campaign and removes them when that campaign leaves the cart', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'hosted',
      workerBase: WORKER_BASE,
      addOns: ADD_ON_CONFIG,
      i18n: {
        currentLang: 'es',
        messages: {
          cart: {
            campaignAddOns: 'Complementos de la campaña'
          }
        }
      }
    };

    document.body.innerHTML = '<div data-pool-cart-root="true"></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await clearProviderCart(provider);
    await readyApi.api.cart.items.add({
      id: 'smoke-editable__standard-pass',
      name: 'SMOKE EDITABLE — Standard Pass',
      price: 10,
      url: '/campaigns/smoke-editable/',
      description: 'A normal digital tier'
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    expect(root?.textContent).toContain('Complementos de la campaña');
    expect(root?.textContent).toContain('First Time Sexpot Poster');

    const addButton = root?.querySelector('[data-cart-addon-add][data-addon-product-id="smoke-editable__first-time-sexpot-poster"]') as HTMLButtonElement | null;
    if (!addButton) throw new Error('Missing campaign add-on add button');
    addButton.click();

    expect(provider.store.getState().cart.items.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'addon__smoke-editable__first-time-sexpot-poster'
        })
      ])
    );

    const campaignItem = provider.store.getState().cart.items.items.find((item: any) => item.id === 'smoke-editable__standard-pass');
    await readyApi.api.cart.items.remove(campaignItem?.uniqueId);

    expect(provider.store.getState().cart.items.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'addon__smoke-editable__first-time-sexpot-poster'
        })
      ])
    );
  });

  it('localizes hosted checkout next-step copy from runtime messages', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'hosted',
      workerBase: WORKER_BASE,
      i18n: {
        currentLang: 'es',
        messages: {
          cart: {
            nextStep: 'Próximo paso',
            hostedCheckoutNote: 'Continúa al pago seguro para terminar tu aporte.'
          }
        }
      }
    };

    document.body.innerHTML = '<button id="cart-opener" type="button">Open cart</button><div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await clearProviderCart(provider);
    await readyApi.api.cart.items.add({
      id: 'demo__drawer-item',
      name: 'Drawer Item',
      price: 20,
      quantity: 1,
      url: '/campaigns/demo/'
    });

    const opener = document.getElementById('cart-opener') as HTMLButtonElement | null;
    if (!opener) throw new Error('Missing cart opener');
    await readyApi.api.theme.cart.open(opener);

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    const continueButton = root?.querySelector('[data-cart-continue]') as HTMLButtonElement | null;
    if (!continueButton) throw new Error('Missing continue button');
    continueButton.click();

    await vi.waitFor(() => {
      expect(root?.textContent).toContain('Próximo paso');
      expect(root?.textContent).toContain('Continúa al pago seguro para terminar tu aporte.');
    });
  });

  it('updates add-on stock messaging when the selected variant changes and keeps the card compact', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'hosted',
      workerBase: WORKER_BASE,
      addOns: ADD_ON_CONFIG
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === `${WORKER_BASE}/add-ons/inventory`) {
        return new Response(JSON.stringify({
          lowStockThreshold: 5,
          products: {
            'dust-wave-tshirt': {
              inventory: 8,
              sold: 3,
              remaining: 5,
              available: true,
              soldOut: false,
              variants: {
                m: { inventory: 4, sold: 0, remaining: 4, available: true, soldOut: false },
                l: { inventory: 4, sold: 3, remaining: 1, available: true, soldOut: false }
              }
            }
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    document.body.innerHTML = '<div data-pool-cart-root="true"></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'smoke-editable__standard-pass',
      name: 'SMOKE EDITABLE — Standard Pass',
      price: 10,
      url: '/campaigns/smoke-editable/'
    });
    await readyApi.api.theme.cart.open();

    await vi.waitFor(() => {
      const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
      expect(root?.textContent).toContain('Only 4 left');
      expect(root?.textContent).not.toContain('Variation');
      expect(root?.textContent).not.toContain('Quantity for');
    });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(`${WORKER_BASE}/add-ons/inventory`);
    });

    let variantSelect = document.querySelector('[data-cart-addon-variant][data-addon-product-id="dust-wave-tshirt"]') as HTMLSelectElement | null;
    if (!variantSelect) throw new Error('Missing variant selector');
    await vi.waitFor(() => {
      variantSelect = document.querySelector('[data-cart-addon-variant][data-addon-product-id="dust-wave-tshirt"]') as HTMLSelectElement | null;
      const lowStockOption = Array.from(variantSelect?.options || []).find((option) => option.value === 'l');
      expect(lowStockOption?.getAttribute('data-max-quantity')).toBe('1');
    });
    if (!variantSelect) throw new Error('Missing refreshed variant selector');
    variantSelect.value = 'l';
    variantSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const delegatedChangeHandler = (document as any)._poolFirstPartyCartChangeHandler;
    if (typeof delegatedChangeHandler === 'function') {
      delegatedChangeHandler({ target: variantSelect });
    }

    await vi.waitFor(() => {
      const quantityInput = document.querySelector('[data-cart-addon-product-quantity][data-addon-product-id="dust-wave-tshirt"]') as HTMLInputElement | null;
      expect(variantSelect.value).toBe('l');
      expect(quantityInput?.max).toBe('1');
      expect(quantityInput?.value).toBe('1');
    });

  });

  it('recalculates checkout shipping totals when a physical add-on is added to the cart', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'custom',
      workerBase: WORKER_BASE,
      addOns: ADD_ON_CONFIG
    };

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url === `${WORKER_BASE}/tax/quote`) {
        const body = JSON.parse(String(init?.body || '{}'));
        expect(body).toMatchObject({
          subtotalCents: 1300,
          shippingAddress: {
            country: 'US',
            postalCode: '87101'
          }
        });

        return new Response(JSON.stringify({
          subtotalCents: 1300,
          shippingCents: 300,
          taxCents: 102,
          taxDetails: {
            effectiveRate: 0.07875,
            destination: {
              country: 'US',
              postalCode: '87101'
            }
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url === `${WORKER_BASE}/shipping/quote`) {
        expect(JSON.parse(String(init?.body || '{}'))).toMatchObject({
          campaignSlug: 'demo',
          items: [
            { id: 'demo__featured-tier', quantity: 1 },
            { id: 'addon__dust-wave-sticker', quantity: 1 }
          ],
          bundleAddOnAnchorCampaignSlug: 'demo',
          shippingAddress: {
            country: 'US',
            postalCode: '87101'
          }
        });

        return new Response(JSON.stringify({
          totalShippingCents: 300,
          quotes: [
            {
              campaignSlug: 'demo',
              shippingCents: 300,
              source: 'fallback_flat_rate',
              carrier: 'fallback',
              service: 'flat_rate',
              domestic: true,
              availableOptions: [
                { id: 'standard', label: 'Standard', domesticOnly: false, priceDeltaCents: 0, shippingCents: 300 }
              ],
              defaultOption: 'standard',
              selectedOption: 'standard'
            }
          ]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }));
    (window as any).PoolStripeCheckoutSidecar = {
      mount: vi.fn(async () => ({
        supportsLinkAuthenticationElement: false,
        supportsShippingAddressElement: false,
        updateEmail: vi.fn(async () => ({})),
        updateShippingAddress: vi.fn(async () => ({})),
        confirm: vi.fn(async () => ({ type: 'success' })),
        unmount: vi.fn()
      })),
      ensureStripeJs: vi.fn(async () => (window as any).Stripe)
    };
    (window as any).Stripe = vi.fn();
    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'demo__featured-tier',
      name: 'Demo Featured Tier',
      price: 10,
      quantity: 1,
      url: '/campaigns/demo/'
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    const quantityField = root?.querySelector('[data-cart-addon-product-quantity][data-addon-product-id="dust-wave-sticker"]') as HTMLInputElement | null;
    const addButton = root?.querySelector('[data-cart-addon-add][data-addon-product-id="dust-wave-sticker"]') as HTMLButtonElement | null;
    if (!quantityField || !addButton) throw new Error('Missing add-on controls');
    quantityField.value = '1';
    quantityField.dispatchEvent(new Event('input', { bubbles: true }));
    addButton.click();

    const continueButton = root?.querySelector('[data-cart-continue]') as HTMLButtonElement | null;
    if (!continueButton) throw new Error('Missing continue button');
    continueButton.click();

    await vi.waitFor(() => {
      expect(root?.textContent).toContain('Contact & Shipping address');
    });

    const shippingName = root?.querySelector('[data-cart-custom-shipping-field="name"]') as HTMLInputElement | null;
    const shippingLine1 = root?.querySelector('[data-cart-custom-shipping-field="line1"]') as HTMLInputElement | null;
    const shippingCity = root?.querySelector('[data-cart-custom-shipping-field="city"]') as HTMLInputElement | null;
    const shippingState = root?.querySelector('[data-cart-custom-shipping-field="state"]') as HTMLInputElement | null;
    const shippingPostalCode = root?.querySelector('[data-cart-custom-shipping-field="postal_code"]') as HTMLInputElement | null;
    const shippingCountry = root?.querySelector('[data-cart-custom-shipping-field="country"]') as HTMLSelectElement | null;
    if (!shippingName || !shippingLine1 || !shippingCity || !shippingState || !shippingPostalCode || !shippingCountry) {
      throw new Error('Missing custom checkout shipping fields');
    }

    shippingName.value = 'Supporter Example';
    shippingLine1.value = '123 Main Street';
    shippingCity.value = 'Albuquerque';
    shippingState.value = 'NM';
    shippingPostalCode.value = '87101';
    shippingCountry.value = 'US';
    shippingPostalCode.dispatchEvent(new Event('input', { bubbles: true }));
    shippingPostalCode.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      const fetchMock = global.fetch as any;
      expect(fetchMock).toHaveBeenCalledWith(`${WORKER_BASE}/shipping/quote`, expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith(`${WORKER_BASE}/tax/quote`, expect.any(Object));
    });

    await vi.waitFor(() => {
      const shippingLabel = root?.querySelector('[data-cart-checkout-summary-shipping-label]');
      const taxAmount = root?.querySelector('[data-cart-checkout-summary-tax]');
      const shippingAmount = root?.querySelector('[data-cart-checkout-summary-shipping]');
      const totalAmount = root?.querySelector('[data-cart-checkout-summary-total]');
      expect(shippingLabel?.textContent || '').toContain('Shipping');
      expect(taxAmount?.textContent).toBe('$1.02');
      expect(shippingAmount?.textContent).toBe('$3.00');
      expect(totalAmount?.textContent).toBe('$17.67');
    });
  });

  it('keeps New Mexico mixed-cart tax visible after physical custom checkout bootstraps', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'custom',
      workerBase: WORKER_BASE,
      addOns: ADD_ON_CONFIG
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url === `${WORKER_BASE}/checkout-intent/start`) {
        return new Response(JSON.stringify({
          checkoutUiMode: 'custom',
          sessionId: 'cs_test_nm_mixed_123',
          clientSecret: 'cs_test_nm_mixed_secret_123',
          publishableKey: 'pk_test_nm_mixed_123',
          orderId: 'pool-intent-nm-mixed-123'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url === `${WORKER_BASE}/tax/quote`) {
        const body = JSON.parse(String(init?.body || '{}'));
        expect(body).toMatchObject({
          subtotalCents: 1300,
          shippingCents: 190,
          shippingAddress: {
            country: 'US',
            postalCode: '87048',
            state: 'NM',
            city: 'Corrales',
            line1: '1228 W La Entrada'
          }
        });

        return new Response(JSON.stringify({
          subtotalCents: 1300,
          shippingCents: 190,
          taxCents: 98,
          taxDetails: {
            provider: 'nm_grt',
            effectiveRate: 0.075625,
            destination: {
              country: 'US',
              postalCode: '87048',
              state: 'NM',
              city: 'Corrales',
              line1: '1228 W La Entrada'
            }
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url === `${WORKER_BASE}/shipping/quote`) {
        expect(JSON.parse(String(init?.body || '{}'))).toMatchObject({
          campaignSlug: 'demo',
          items: [
            { id: 'demo__featured-tier', quantity: 1 },
            { id: 'addon__dust-wave-sticker', quantity: 1 }
          ],
          bundleAddOnAnchorCampaignSlug: 'demo',
          shippingAddress: {
            country: 'US',
            postalCode: '87048'
          }
        });

        return new Response(JSON.stringify({
          totalShippingCents: 190,
          quotes: [
            {
              campaignSlug: 'demo',
              shippingCents: 190,
              source: 'usps_live',
              carrier: 'usps',
              service: 'usps_ground_advantage',
              domestic: true,
              availableOptions: [
                { id: 'standard', label: 'Standard', domesticOnly: false, priceDeltaCents: 0, shippingCents: 190 }
              ],
              defaultOption: 'standard',
              selectedOption: 'standard'
            }
          ]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    (window as any).PoolStripeCheckoutSidecar = {
      ensureStripeJs: vi.fn(async () => (window as any).Stripe),
      mount: vi.fn(async ({ onChange }) => {
        if (typeof onChange === 'function') {
          onChange({ session: { canConfirm: true } });
        }
        return {
          supportsLinkAuthenticationElement: false,
          supportsShippingAddressElement: false,
          updateEmail: vi.fn(async () => ({})),
          updateShippingAddress: vi.fn(async () => ({})),
          confirm: vi.fn(async () => ({ type: 'success' })),
          unmount: vi.fn()
        };
      })
    };
    (window as any).Stripe = vi.fn();
    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'demo__featured-tier',
      name: 'Demo Featured Tier',
      price: 10,
      quantity: 1,
      url: '/campaigns/demo/'
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    const quantityField = root?.querySelector('[data-cart-addon-product-quantity][data-addon-product-id="dust-wave-sticker"]') as HTMLInputElement | null;
    const addButton = root?.querySelector('[data-cart-addon-add][data-addon-product-id="dust-wave-sticker"]') as HTMLButtonElement | null;
    if (!quantityField || !addButton) throw new Error('Missing add-on controls');
    quantityField.value = '1';
    quantityField.dispatchEvent(new Event('input', { bubbles: true }));
    addButton.click();

    const continueButton = root?.querySelector('[data-cart-continue]') as HTMLButtonElement | null;
    if (!continueButton) throw new Error('Missing continue button');
    continueButton.click();

    await vi.waitFor(() => {
      expect(root?.textContent).toContain('Contact & Shipping address');
    });

    const shippingName = root?.querySelector('[data-cart-custom-shipping-field="name"]') as HTMLInputElement | null;
    const shippingLine1 = root?.querySelector('[data-cart-custom-shipping-field="line1"]') as HTMLInputElement | null;
    const shippingCity = root?.querySelector('[data-cart-custom-shipping-field="city"]') as HTMLInputElement | null;
    const shippingState = root?.querySelector('[data-cart-custom-shipping-field="state"]') as HTMLInputElement | null;
    const shippingPostalCode = root?.querySelector('[data-cart-custom-shipping-field="postal_code"]') as HTMLInputElement | null;
    const shippingCountry = root?.querySelector('[data-cart-custom-shipping-field="country"]') as HTMLSelectElement | null;
    const emailField = root?.querySelector('[data-cart-custom-checkout-email]') as HTMLInputElement | null;
    if (!shippingName || !shippingLine1 || !shippingCity || !shippingState || !shippingPostalCode || !shippingCountry || !emailField) {
      throw new Error('Missing custom checkout fields');
    }

    shippingName.value = 'Test Test';
    emailField.value = 'alonso@hey.com';
    shippingLine1.value = '1228 W La Entrada';
    shippingCity.value = 'Corrales';
    shippingState.value = 'NM';
    shippingPostalCode.value = '87048';
    shippingCountry.value = 'US';
    shippingPostalCode.dispatchEvent(new Event('input', { bubbles: true }));
    shippingPostalCode.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(`${WORKER_BASE}/shipping/quote`, expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith(`${WORKER_BASE}/tax/quote`, expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith(`${WORKER_BASE}/checkout-intent/start`, expect.any(Object));
    });

    await vi.waitFor(() => {
      expect(root?.querySelector('[data-cart-checkout-summary-tax]')?.textContent).toBe('$0.98');
      expect(root?.querySelector('[data-cart-checkout-summary-shipping]')?.textContent).toBe('$1.90');
      expect(root?.querySelector('[data-cart-checkout-summary-total]')?.textContent).toBe('$16.53');
      expect(root?.querySelector('[data-cart-confirm-custom-checkout]')).toBeTruthy();
    });
  });

  it('keeps add-on-only physical carts in estimate mode until a ZIP is entered', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'custom',
      workerBase: WORKER_BASE,
      shipping: {
        fallback_flat_rate: 3
      },
      addOns: ADD_ON_CONFIG
    };

    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL) => {
      throw new Error('No shipping quote expected before address completion');
    }));
    (window as any).PoolStripeCheckoutSidecar = {
      mount: vi.fn(async () => ({
        supportsLinkAuthenticationElement: false,
        supportsShippingAddressElement: false,
        updateEmail: vi.fn(async () => ({})),
        updateShippingAddress: vi.fn(async () => ({})),
        confirm: vi.fn(async () => ({ type: 'success' })),
        unmount: vi.fn()
      })),
      ensureStripeJs: vi.fn(async () => (window as any).Stripe)
    };
    (window as any).Stripe = vi.fn();
    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'demo__digital-tier',
      name: 'Demo Digital Tier',
      price: 10,
      quantity: 1,
      url: '/campaigns/demo/',
      shippable: false,
      campaignShippingFallbackCents: 1200
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    const quantityField = root?.querySelector('[data-cart-addon-product-quantity][data-addon-product-id="dust-wave-sticker"]') as HTMLInputElement | null;
    const addButton = root?.querySelector('[data-cart-addon-add][data-addon-product-id="dust-wave-sticker"]') as HTMLButtonElement | null;
    if (!quantityField || !addButton) throw new Error('Missing add-on controls');
    quantityField.value = '1';
    quantityField.dispatchEvent(new Event('input', { bubbles: true }));
    addButton.click();

    const continueButton = root?.querySelector('[data-cart-continue]') as HTMLButtonElement | null;
    if (!continueButton) throw new Error('Missing continue button');
    continueButton.click();

    await vi.waitFor(() => {
      const shippingLabel = root?.querySelector('[data-cart-checkout-summary-shipping-label]');
      const shippingAmount = root?.querySelector('[data-cart-checkout-summary-shipping]');
      expect(root?.textContent || '').toContain('Estimated total');
      expect(shippingLabel?.textContent || '').toContain('Estimated shipping');
      expect(shippingAmount?.textContent).toBe('--');
    });
  });

  it('keeps checkout in estimate mode when a physical global add-on is present alongside a flat-rate campaign shipment', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'custom',
      workerBase: WORKER_BASE,
      shipping: {
        fallback_flat_rate: 3
      },
      addOns: ADD_ON_CONFIG
    };

    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL) => {
      throw new Error('No shipping quote expected before address completion');
    }));
    (window as any).PoolStripeCheckoutSidecar = {
      mount: vi.fn(async () => ({
        supportsLinkAuthenticationElement: false,
        supportsShippingAddressElement: false,
        updateEmail: vi.fn(async () => ({})),
        updateShippingAddress: vi.fn(async () => ({})),
        confirm: vi.fn(async () => ({ type: 'success' })),
        unmount: vi.fn()
      })),
      ensureStripeJs: vi.fn(async () => (window as any).Stripe)
    };
    (window as any).Stripe = vi.fn();
    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'demo__physical-tier',
      name: 'Demo Physical Tier',
      price: 10,
      quantity: 1,
      url: '/campaigns/demo/',
      shippable: true,
      campaignShippingFallbackCents: 1200
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    const quantityField = root?.querySelector('[data-cart-addon-product-quantity][data-addon-product-id="dust-wave-sticker"]') as HTMLInputElement | null;
    const addButton = root?.querySelector('[data-cart-addon-add][data-addon-product-id="dust-wave-sticker"]') as HTMLButtonElement | null;
    if (!quantityField || !addButton) throw new Error('Missing add-on controls');
    quantityField.value = '1';
    quantityField.dispatchEvent(new Event('input', { bubbles: true }));
    addButton.click();

    const continueButton = root?.querySelector('[data-cart-continue]') as HTMLButtonElement | null;
    if (!continueButton) throw new Error('Missing continue button');
    continueButton.click();

    await vi.waitFor(() => {
      const shippingLabel = root?.querySelector('[data-cart-checkout-summary-shipping-label]');
      const shippingAmount = root?.querySelector('[data-cart-checkout-summary-shipping]');
      expect(root?.textContent || '').toContain('Estimated total');
      expect(shippingLabel?.textContent || '').toContain('Estimated shipping');
      expect(shippingAmount?.textContent).toBe('--');
    });
  });

  it('uses the campaign shipping override for physical campaign add-ons in digital-only carts', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'custom',
      workerBase: WORKER_BASE,
      shipping: {
        fallback_flat_rate: 3
      },
      addOns: ADD_ON_CONFIG
    };

    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL) => {
      throw new Error('No shipping quote expected before address completion');
    }));
    (window as any).PoolStripeCheckoutSidecar = {
      mount: vi.fn(async () => ({
        supportsLinkAuthenticationElement: false,
        supportsShippingAddressElement: false,
        updateEmail: vi.fn(async () => ({})),
        updateShippingAddress: vi.fn(async () => ({})),
        confirm: vi.fn(async () => ({ type: 'success' })),
        unmount: vi.fn()
      })),
      ensureStripeJs: vi.fn(async () => (window as any).Stripe)
    };
    (window as any).Stripe = vi.fn();
    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'smoke-editable__standard-pass',
      name: 'SMOKE EDITABLE — Standard Pass',
      price: 10,
      quantity: 1,
      url: '/campaigns/smoke-editable/',
      campaignShippingFallbackCents: 1200
    });
    await readyApi.api.cart.items.add({
      id: 'addon__smoke-editable__first-time-sexpot-poster',
      name: 'First Time Sexpot Poster',
      price: 35,
      quantity: 1,
      url: '/campaigns/smoke-editable/',
      shippable: true,
      customFields: [
        { name: '_category', value: 'physical' },
        { name: '_addon_scope', value: 'campaign' },
        { name: '_addon_campaign_slug', value: 'smoke-editable' },
        { name: '_addon_campaign_title', value: 'SMOKE EDITABLE' }
      ]
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    await vi.waitFor(() => {
      const shippingLabel = root?.querySelector('[data-cart-summary-shipping-label]');
      const shippingAmount = root?.querySelector('[data-cart-summary-shipping]');
      expect(shippingLabel?.textContent || '').toContain('Shipping');
      expect(shippingAmount?.textContent).toBe('$12.00');
    });
  });

  it('restores checkout shipping when a physical add-on is re-added after removal', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'custom',
      workerBase: WORKER_BASE,
      addOns: ADD_ON_CONFIG
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url === `${WORKER_BASE}/shipping/quote`) {
        const payload = JSON.parse(String(init?.body || '{}'));
        const hasPhysicalAddOn = Array.isArray(payload?.items) &&
          payload.items.some((item: any) => item?.id === 'addon__dust-wave-sticker');

        return new Response(JSON.stringify({
          totalShippingCents: hasPhysicalAddOn ? 300 : 0,
          quotes: hasPhysicalAddOn ? [
            {
              campaignSlug: 'demo',
              shippingCents: 300,
              source: 'fallback_flat_rate',
              carrier: 'fallback',
              service: 'flat_rate',
              domestic: true,
              availableOptions: [
                { id: 'standard', label: 'Standard', domesticOnly: false, priceDeltaCents: 0, shippingCents: 300 }
              ],
              defaultOption: 'standard',
              selectedOption: 'standard'
            }
          ] : []
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url === `${WORKER_BASE}/checkout-intent/start`) {
        return new Response(JSON.stringify({
          checkoutUiMode: 'custom',
          sessionId: 'cs_test_restore_shipping',
          clientSecret: 'cs_test_restore_shipping_secret',
          publishableKey: 'pk_test_restore_shipping',
          orderId: 'pool-intent-restore-shipping'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    (window as any).PoolStripeCheckoutSidecar = {
      ensureStripeJs: vi.fn(async () => (window as any).Stripe),
      mount: vi.fn(async ({ onChange }) => {
        if (typeof onChange === 'function') {
          onChange({ session: { canConfirm: true } });
        }
        return {
          supportsLinkAuthenticationElement: false,
          supportsShippingAddressElement: false,
          updateEmail: vi.fn(async () => ({})),
          updateShippingAddress: vi.fn(async () => ({})),
          confirm: vi.fn(async () => ({ type: 'success' })),
          unmount: vi.fn()
        };
      })
    };
    (window as any).Stripe = vi.fn();
    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'demo__digital-tier',
      name: 'Demo Digital Tier',
      price: 10,
      quantity: 1,
      url: '/campaigns/demo/',
      shippable: false
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    const quantityField = root?.querySelector('[data-cart-addon-product-quantity][data-addon-product-id="dust-wave-sticker"]') as HTMLInputElement | null;
    const addButton = root?.querySelector('[data-cart-addon-add][data-addon-product-id="dust-wave-sticker"]') as HTMLButtonElement | null;
    if (!quantityField || !addButton) throw new Error('Missing add-on controls');
    quantityField.value = '1';
    quantityField.dispatchEvent(new Event('input', { bubbles: true }));
    addButton.click();

    const continueButton = root?.querySelector('[data-cart-continue]') as HTMLButtonElement | null;
    if (!continueButton) throw new Error('Missing continue button');
    continueButton.click();

    await vi.waitFor(() => {
      expect(root?.textContent).toContain('Contact & Shipping address');
    });

    const shippingName = root?.querySelector('[data-cart-custom-shipping-field="name"]') as HTMLInputElement | null;
    const shippingLine1 = root?.querySelector('[data-cart-custom-shipping-field="line1"]') as HTMLInputElement | null;
    const shippingCity = root?.querySelector('[data-cart-custom-shipping-field="city"]') as HTMLInputElement | null;
    const shippingState = root?.querySelector('[data-cart-custom-shipping-field="state"]') as HTMLInputElement | null;
    const shippingPostalCode = root?.querySelector('[data-cart-custom-shipping-field="postal_code"]') as HTMLInputElement | null;
    const shippingCountry = root?.querySelector('[data-cart-custom-shipping-field="country"]') as HTMLSelectElement | null;
    if (!shippingName || !shippingLine1 || !shippingCity || !shippingState || !shippingPostalCode || !shippingCountry) {
      throw new Error('Missing custom checkout shipping fields');
    }

    shippingName.value = 'Supporter Example';
    shippingLine1.value = '123 Main Street';
    shippingCity.value = 'Albuquerque';
    shippingState.value = 'NM';
    shippingPostalCode.value = '87101';
    shippingCountry.value = 'US';
    shippingPostalCode.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      const shippingAmount = root?.querySelector('[data-cart-checkout-summary-shipping]');
      expect(['$3.00', '--']).toContain(shippingAmount?.textContent || '');
    });

    const cartApi = provider.getApi();
    const stickerItem = provider.store.getState().cart.items.items.find((item: any) => item.id === 'addon__dust-wave-sticker');
    await cartApi.api.cart.items.remove(stickerItem.uniqueId);

    await vi.waitFor(() => {
      const shippingLabel = root?.querySelector('[data-cart-checkout-summary-shipping-label]') as HTMLElement | null;
      const shippingAmount = root?.querySelector('[data-cart-checkout-summary-shipping]') as HTMLElement | null;
      expect(Boolean(shippingLabel) || Boolean(shippingAmount)).toBe(false);
    });

    const backButton = root?.querySelector('[data-cart-back]') as HTMLButtonElement | null;
    if (!backButton) throw new Error('Missing back button');
    backButton.click();

    await vi.waitFor(() => {
      expect(root?.textContent).toContain('Your cart');
    });

    const restoredQtyField = root?.querySelector('[data-cart-addon-product-quantity][data-addon-product-id="dust-wave-sticker"]') as HTMLInputElement | null;
    const restoredAddButton = root?.querySelector('[data-cart-addon-add][data-addon-product-id="dust-wave-sticker"]') as HTMLButtonElement | null;
    if (!restoredQtyField || !restoredAddButton) throw new Error('Missing restored add-on controls');
    restoredQtyField.value = '1';
    restoredQtyField.dispatchEvent(new Event('input', { bubbles: true }));
    restoredAddButton.click();

    const returnToCheckoutButton = root?.querySelector('[data-cart-continue]') as HTMLButtonElement | null;
    if (!returnToCheckoutButton) throw new Error('Missing return-to-checkout button');
    returnToCheckoutButton.click();

    await vi.waitFor(() => {
      expect(root?.textContent).toContain('Contact & Shipping address');
    });

    const restoredShippingPostalCode = root?.querySelector('[data-cart-custom-shipping-field="postal_code"]') as HTMLInputElement | null;
    if (!restoredShippingPostalCode) throw new Error('Missing restored shipping postal field');
    restoredShippingPostalCode.value = '87101';
    restoredShippingPostalCode.dispatchEvent(new Event('input', { bubbles: true }));
    restoredShippingPostalCode.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      const shippingLabel = root?.querySelector('[data-cart-checkout-summary-shipping-label]');
      const shippingAmount = root?.querySelector('[data-cart-checkout-summary-shipping]');
      expect((shippingLabel?.textContent || '').trim().length).toBeGreaterThan(0);
      expect(['$3.00', '--']).toContain(shippingAmount?.textContent || '');
    });
  });

  it('keeps physical custom checkout in address-first mode before shipping details are complete', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'custom',
      workerBase: WORKER_BASE,
      addOns: ADD_ON_CONFIG
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url === `${WORKER_BASE}/checkout-intent/start`) {
        expect(JSON.parse(String(init?.body || '{}'))).toMatchObject({
          campaignSlug: 'demo',
          items: [
            { id: 'demo__featured-tier', quantity: 1 },
            { id: 'addon__dust-wave-sticker', quantity: 1 }
          ],
          bundleAddOnAnchorCampaignSlug: 'demo',
          preferredLang: 'en'
        });

        return new Response(JSON.stringify({
          checkoutUiMode: 'custom',
          sessionId: 'cs_test_addon_custom_123',
          clientSecret: 'cs_test_addon_secret_123',
          publishableKey: 'pk_test_addon_123',
          orderId: 'pool-intent-addon-custom-123'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url === `${WORKER_BASE}/shipping/quote`) {
        return new Response(JSON.stringify({
          totalShippingCents: 300,
          quotes: [
            {
              campaignSlug: 'demo',
              shippingCents: 300,
              source: 'fallback_flat_rate',
              carrier: 'fallback',
              service: 'flat_rate',
              domestic: true,
              availableOptions: [
                { id: 'standard', label: 'Standard', domesticOnly: false, priceDeltaCents: 0, shippingCents: 300 }
              ],
              defaultOption: 'standard',
              selectedOption: 'standard'
            }
          ]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    (window as any).PoolStripeCheckoutSidecar = {
      ensureStripeJs: vi.fn(async () => (window as any).Stripe),
      mount: vi.fn(async ({ onChange }) => {
        if (typeof onChange === 'function') {
          onChange({ session: { canConfirm: true } });
        }

        return {
          supportsLinkAuthenticationElement: false,
          supportsShippingAddressElement: false,
          updateEmail: vi.fn(async () => ({})),
          updateShippingAddress: vi.fn(async () => ({})),
          confirm: vi.fn(async () => ({ type: 'success' })),
          unmount: vi.fn()
        };
      })
    };
    (window as any).Stripe = vi.fn();
    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'demo__featured-tier',
      name: 'Demo Featured Tier',
      price: 10,
      quantity: 1,
      url: '/campaigns/demo/'
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    const quantityField = root?.querySelector('[data-cart-addon-product-quantity][data-addon-product-id="dust-wave-sticker"]') as HTMLInputElement | null;
    const addButton = root?.querySelector('[data-cart-addon-add][data-addon-product-id="dust-wave-sticker"]') as HTMLButtonElement | null;
    if (!quantityField || !addButton) throw new Error('Missing add-on controls');
    quantityField.value = '1';
    quantityField.dispatchEvent(new Event('input', { bubbles: true }));
    addButton.click();

    const continueButton = root?.querySelector('[data-cart-continue]') as HTMLButtonElement | null;
    if (!continueButton) throw new Error('Missing continue button');
    continueButton.click();

    await vi.waitFor(() => {
      expect(root?.textContent).toContain('Contact & Shipping address');
      expect(root?.querySelector('[data-cart-start-checkout]')).toBeTruthy();
      expect(root?.querySelector('[data-cart-confirm-custom-checkout]')).toBeNull();
    });

    expect(fetchMock).not.toHaveBeenCalledWith(`${WORKER_BASE}/checkout-intent/start`, expect.any(Object));
    expect((window as any).PoolStripeCheckoutSidecar.mount).not.toHaveBeenCalled();
  });

  it('lets a multi-campaign cart choose an add-on anchor campaign', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'hosted',
      workerBase: WORKER_BASE,
      addOns: ADD_ON_CONFIG
    };

    document.body.innerHTML = '<div data-pool-cart-root="true"></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'smoke-editable__standard-pass',
      name: 'Smoke Editable — Standard Pass',
      price: 10,
      url: '/campaigns/smoke-editable/'
    });
    await readyApi.api.cart.items.add({
      id: 'hand-relations__frame-slot',
      name: 'Hand Relations — Buy 1 Frame',
      price: 10,
      url: '/campaigns/hand-relations/'
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    const anchorSelect = root?.querySelector('[data-cart-addon-anchor]') as HTMLSelectElement | null;
    if (!anchorSelect) throw new Error('Missing add-on anchor select');

    expect(Array.from(anchorSelect.options).map((option) => option.value)).toEqual([
      'smoke-editable',
      'hand-relations'
    ]);

    anchorSelect.value = 'hand-relations';
    anchorSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const shirtQty = root?.querySelector('[data-addon-product-id="dust-wave-tshirt"]') as HTMLInputElement | null;
    if (!shirtQty) throw new Error('Missing t-shirt quantity input');
    shirtQty.value = '1';
    shirtQty.dispatchEvent(new Event('input', { bubbles: true }));

    expect(provider.store.getState().cart.bundleAddOnAnchorCampaignSlug).toBe('hand-relations');
  });

  it('persists the first-party cart across page reloads', async () => {
    document.body.innerHTML = `
      <div data-pool-cart-root="true"></div>
      <button
        class="poolcart-add-item"
        data-item-id="smoke-editable__standard-pass"
        data-item-name="SMOKE EDITABLE — Standard Pass"
        data-item-price="10"
        data-item-url="/campaigns/smoke-editable/"
        data-item-description="A normal digital tier"
        data-item-stackable="always"
        data-item-max-quantity="99"
        type="button"
      >
        Add item
      </button>
    `;

    await import('../../assets/js/cart-provider.js');

    const firstProvider = (window as any).PoolCartProvider;
    const button = document.querySelector('.poolcart-add-item') as HTMLButtonElement | null;
    if (!button) throw new Error('Missing add item button');
    button.click();
    await Promise.resolve();

    expect(firstProvider.store.getState().cart.items.items).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem('pool_first_party_cart_state') || '{}')).toMatchObject({
      items: [
        expect.objectContaining({
          id: 'smoke-editable__standard-pass'
        })
      ]
    });

    vi.resetModules();
    delete (window as any).PoolCartProvider;
    document.body.innerHTML = '<div data-pool-cart-root="true"></div>';

    await import('../../assets/js/cart-provider.js');

    const secondProvider = (window as any).PoolCartProvider;
    expect(secondProvider.store.getState()).toMatchObject({
      cart: {
        items: {
          count: 1,
          items: [
            expect.objectContaining({
              id: 'smoke-editable__standard-pass',
              name: 'SMOKE EDITABLE — Standard Pass'
            })
          ]
        }
      }
    });
  });

  it('merges repeat stackable adds into quantity updates in first-party mode', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      workerBase: WORKER_BASE
    };

    document.body.innerHTML = `
      <div data-pool-cart-root="true"></div>
      <button
        class="poolcart-add-item"
        data-item-id="demo__stackable"
        data-item-name="Demo Stackable"
        data-item-price="7"
        data-item-url="/campaigns/demo/"
        data-item-description="Stackable support"
        data-item-stackable="always"
        data-item-max-quantity="2"
        type="button"
      >
        Add stackable
      </button>
    `;

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const onUpdated = vi.fn();
    provider.events.on('item.updated', onUpdated);

    const button = document.querySelector('.poolcart-add-item') as HTMLButtonElement | null;
    if (!button) throw new Error('Missing stackable add item button');

    button.click();
    button.click();
    button.click();

    await Promise.resolve();

    expect(provider.store.getState()).toMatchObject({
      cart: {
        subtotal: 14,
        total: 14.7,
        items: {
          count: 1,
          items: [
            expect.objectContaining({
              id: 'demo__stackable',
              quantity: 2,
              maxQuantity: 2
            })
          ]
        }
      }
    });
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({
      id: 'demo__stackable',
      quantity: 2
    }));
  });

  it('stores pendingCartItem and redirects for redirect buttons in first-party mode', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      workerBase: WORKER_BASE
    };

    document.body.innerHTML = `
      <div data-pool-cart-root="true"></div>
      <button
        class="poolcart-add-item"
        data-item-id="demo__featured-tier"
        data-item-name="Demo Featured Tier"
        data-item-price="25"
        data-item-url="/campaigns/demo/#tier-featured"
        data-item-description="Featured support tier"
        data-item-stackable="always"
        data-item-shippable="false"
        data-item-max-quantity="99"
        data-item-custom1-name="_category"
        data-item-custom1-type="hidden"
        data-item-custom1-value="physical"
        data-redirect-url="#campaign-demo"
        type="button"
      >
        View and add
      </button>
    `;

    await import('../../assets/js/cart-provider.js');

    const button = document.querySelector('.poolcart-add-item') as HTMLButtonElement | null;
    if (!button) throw new Error('Missing redirect add item button');
    button.click();

    const pendingItem = JSON.parse(localStorage.getItem('pendingCartItem') || '{}');
    expect(pendingItem).toEqual({
      id: 'demo__featured-tier',
      name: 'Demo Featured Tier',
      price: 25,
      url: '/campaigns/demo/#tier-featured',
      description: 'Featured support tier',
      stackable: true,
      shippable: false,
      maxQuantity: 99,
      customFields: [
        {
          name: '_category',
          type: 'hidden',
          value: 'physical',
          placeholder: '',
          required: false
        }
      ]
    });
    expect(window.location.hash).toBe('#campaign-demo');
  });

  it('supports item updates and removals in first-party mode', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      workerBase: WORKER_BASE
    };

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    const onUpdated = vi.fn();
    const onRemoved = vi.fn();
    provider.events.on('item.updated', onUpdated);
    provider.events.on('item.removed', onRemoved);

    const addedItem = await readyApi.api.cart.items.add({
      id: 'demo__removable',
      name: 'Demo Removable',
      price: 9,
      quantity: 1,
      maxQuantity: 3,
      url: '/campaigns/demo/'
    });

    await readyApi.api.cart.items.update(addedItem.uniqueId, { quantity: 3 });
    expect(provider.store.getState()).toMatchObject({
      cart: {
        subtotal: 27,
        total: 28.35,
        items: {
          count: 1,
          items: [
            expect.objectContaining({
              uniqueId: addedItem.uniqueId,
              quantity: 3
            })
          ]
        }
      }
    });
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({
      uniqueId: addedItem.uniqueId,
      quantity: 3
    }));

    await readyApi.api.cart.items.remove(addedItem.uniqueId);
    expect(provider.store.getState()).toMatchObject({
      cart: {
        subtotal: 0,
        total: 0,
        items: {
          count: 0,
          items: []
        }
      }
    });
    expect(onRemoved).toHaveBeenCalledWith(expect.objectContaining({
      uniqueId: addedItem.uniqueId
    }));
  });

  it('renders a first-party cart drawer with close and remove controls', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutUiMode: 'hosted'
    };

    document.body.innerHTML = '<button id="cart-opener" type="button">Open cart</button><div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    const onRouteChanged = vi.fn();
    const onSummaryCheckout = vi.fn();
    provider.events.on('theme.routechanged', onRouteChanged);
    provider.events.on('summary.checkout_clicked', onSummaryCheckout);

    const addedItem = await readyApi.api.cart.items.add({
      id: 'demo__drawer',
      name: 'Drawer Item',
      price: 18,
      quantity: 1,
      url: '/campaigns/demo/'
    });

    const opener = document.getElementById('cart-opener') as HTMLButtonElement | null;
    if (!opener) throw new Error('Missing cart opener');
    opener.focus();

    await readyApi.api.theme.cart.open(opener);

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    expect(root?.hidden).toBe(false);
    const panel = root?.querySelector('.pool-first-party-cart__panel') as HTMLElement | null;
    expect(panel).toBeTruthy();
    expect(panel?.getAttribute('role')).toBe('dialog');
    expect(panel?.getAttribute('aria-modal')).toBe('true');
    expect(panel?.getAttribute('aria-labelledby')).toBe('pool-first-party-cart-title');
    expect(root?.textContent).toContain('Drawer Item');
    expect(root?.textContent).toContain('$18.00');
    expect(root?.textContent).toContain('Pledge total');
    expect(root?.textContent).toContain('Tip The Pool for platform maintenance.');
    expect(root?.textContent).toContain('Tax');
    expect(root?.querySelector('[data-cart-summary-tax]')?.textContent).toBe('--');
    expect(root?.textContent).toContain('Pledge total');
    const cartTipSlider = root?.querySelector('[data-cart-tip]') as HTMLInputElement | null;
    expect(cartTipSlider).toBeTruthy();
    const closeButton = root?.querySelector('.pool-first-party-cart__close') as HTMLButtonElement | null;
    expect(closeButton?.textContent).toBe('X');
    expect(document.activeElement).toBe(closeButton);

    if (!cartTipSlider) throw new Error('Missing cart tip slider');
    expect(cartTipSlider.getAttribute('aria-labelledby')).toBe('pool-cart-tip-label');
    expect(cartTipSlider.getAttribute('aria-describedby')).toBe('pool-cart-tip-copy pool-cart-tip-percent');
    expect(cartTipSlider.getAttribute('aria-valuetext')).toBe('5% tip, $0.90');

    cartTipSlider.value = '6';
    cartTipSlider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cartTipSlider.isConnected).toBe(true);
    expect(root?.textContent).toContain('The Pool tip (6%)');
    expect(cartTipSlider.getAttribute('aria-valuetext')).toBe('6% tip, $1.08');

    cartTipSlider.value = '7';
    cartTipSlider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cartTipSlider.isConnected).toBe(true);
    expect(root?.textContent).toContain('The Pool tip (7%)');
    expect(cartTipSlider.getAttribute('aria-valuetext')).toBe('7% tip, $1.26');
    cartTipSlider.dispatchEvent(new Event('change', { bubbles: true }));
    cartTipSlider.focus();
    cartTipSlider.dispatchEvent(new Event('input', { bubbles: true }));
    cartTipSlider.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.activeElement).toBe(cartTipSlider);
    expect(cartTipSlider.isConnected).toBe(true);

    const continueButton = root?.querySelector('[data-cart-continue]') as HTMLButtonElement | null;
    if (!continueButton) throw new Error('Missing continue button');
    continueButton.click();

    expect(onSummaryCheckout).toHaveBeenCalledTimes(1);
    expect(onRouteChanged).toHaveBeenCalledWith({
      from: '/cart',
      to: '/checkout'
    });
    expect(root?.textContent).toContain('Checkout');
    expect(root?.textContent).not.toContain('Review your pledge');
    expect(root?.textContent).not.toContain('Checkout preview');
    expect(root?.textContent).toContain('Next step');
    expect(root?.textContent).toContain("Continue to Stripe's secure payment platform to enter your payment information and email address -- this finalizes your pledge.");
    expect(root?.textContent).not.toContain('What happens next');
    expect(root?.textContent).toContain('Pledge summary');
    expect(root?.textContent).toContain('Drawer Item');
    expect(root?.textContent).not.toContain('This cart appears digital-only');
    expect(root?.textContent).not.toContain('Tax and shipping use the same flat estimate shown in your cart and will be finalized in Stripe if needed.');
    expect(root?.querySelector('[data-cart-tip]')).toBeNull();
    expect(root?.querySelector('[data-cart-email]')).toBeNull();

    const backButton = root?.querySelector('[data-cart-back]') as HTMLButtonElement | null;
    if (!backButton) throw new Error('Missing back button');
    backButton.click();

    expect(onRouteChanged).toHaveBeenCalledWith({
      from: '/checkout',
      to: '/cart'
    });
    expect(root?.textContent).toContain('Drawer Item');

    const removeButton = root?.querySelector(`[data-remove-item="${addedItem.uniqueId}"]`) as HTMLButtonElement | null;
    if (!removeButton) throw new Error('Missing remove button');
    removeButton.click();

    expect(provider.store.getState()).toMatchObject({
      cart: {
        items: {
          count: 0,
          items: []
        }
      }
    });
    expect(root?.textContent).toContain('Your cart is empty.');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    await vi.waitFor(() => {
    expect(root?.innerHTML).toBe('');
      expect(root?.getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('uses nested config settings for platform naming and tip defaults', async () => {
    (window as any).POOL_CONFIG = {
      checkout: {
        cartRuntime: 'first_party',
        provider: 'first_party',
        uiMode: 'hosted'
      },
      platform: {
        name: 'Fork Pool',
        workerUrl: WORKER_BASE
      },
      pricing: {
        salesTaxRate: '0.05',
        flatShippingRate: '4.00',
        defaultTipPercent: '9',
        maxTipPercent: '20'
      }
    };

    document.body.innerHTML = '<button id="cart-opener" type="button">Open cart</button><div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'demo__fork-tier',
      name: 'Fork Tier',
      price: 20,
      quantity: 1,
      url: '/campaigns/demo/'
    });

    const opener = document.getElementById('cart-opener') as HTMLButtonElement | null;
    if (!opener) throw new Error('Missing cart opener');
    await readyApi.api.theme.cart.open(opener);

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    const cartTipSlider = root?.querySelector('[data-cart-tip]') as HTMLInputElement | null;
    if (!cartTipSlider) throw new Error('Missing cart tip slider');

    expect(root?.textContent).toContain('Tip Fork Pool for platform maintenance.');
    expect(root?.textContent).toContain('Tax');
    expect(root?.querySelector('[data-cart-summary-tax]')?.textContent).toBe('--');
    expect(cartTipSlider.value).toBe('9');
    expect(cartTipSlider.getAttribute('max')).toBe('20');
    expect(cartTipSlider.getAttribute('aria-valuetext')).toBe('9% tip, $1.80');
  });

  it('starts first-party checkout from the drawer preview when enabled', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'hosted',
      workerBase: WORKER_BASE
    };

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url !== `${WORKER_BASE}/checkout-intent/start`) {
        throw new Error(`Unexpected fetch: ${url}`);
      }

      return new Response(JSON.stringify({ url: '#stripe-checkout' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }));

    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();

    await readyApi.api.cart.items.add({
      id: 'demo__featured-tier',
      name: 'Demo Featured Tier',
      price: 25,
      quantity: 2,
      url: '/campaigns/demo/'
    });
    await readyApi.api.cart.items.add({
      id: 'demo__support__travel',
      name: 'Travel Support',
      price: 10,
      quantity: 1,
      url: '/campaigns/demo/'
    });
    await readyApi.api.cart.items.add({
      id: 'demo__custom-support',
      name: 'Custom Support',
      price: 7,
      quantity: 1,
      url: '/campaigns/demo/'
    });
    await readyApi.api.cart.items.add({
      id: 'demo__postcard',
      name: 'Physical Postcard',
      price: 12,
      quantity: 1,
      url: '/campaigns/demo/',
      shippable: true
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    const tipSlider = root?.querySelector('[data-cart-tip]') as HTMLInputElement | null;
    if (!tipSlider) throw new Error('Missing cart tip slider');
    tipSlider.value = '6';
    tipSlider.dispatchEvent(new Event('input', { bubbles: true }));

    const refreshedContinueButton = root?.querySelector('[data-cart-continue]') as HTMLButtonElement | null;
    if (!refreshedContinueButton) throw new Error('Missing continue button');
    refreshedContinueButton.click();
    await vi.waitFor(() => {
      expect(root?.querySelector('[data-cart-start-checkout]')).toBeTruthy();
    });

    const startCheckoutButton = root?.querySelector('[data-cart-start-checkout]') as HTMLButtonElement | null;
    if (!startCheckoutButton) throw new Error('Missing checkout start button');
    startCheckoutButton.click();

    await vi.waitFor(() => {
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
      expect(fetchMock).toHaveBeenCalledWith(
        `${WORKER_BASE}/checkout-intent/start`,
        expect.objectContaining({
          method: 'POST',
          cache: 'no-store'
        })
      );
    });
    const pendingPledge = sessionStorage.getItem('pool_pending_pledge');
    if (pendingPledge) {
      expect(pendingPledge).toContain('"value":"true"');
    }

    expect(provider.store.getState()).toMatchObject({
      cart: {
        tipPercent: 6
      }
    });
    expect(root?.querySelector('[data-cart-tip]')).toBeNull();
    expect(root?.querySelector('[data-cart-email]')).toBeNull();
    expect(root?.textContent).toContain('Estimated total');
    expect(root?.textContent).toContain('The Pool tip (6%)');
    expect(root?.textContent).toContain('Tax');
    expect(root?.querySelector('[data-cart-checkout-summary-tax]')?.textContent).toBe('--');
    expect(root?.textContent).not.toContain('Shipping');
    expect(root?.textContent).toContain('Physical Postcard');

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${WORKER_BASE}/checkout-intent/start`);
    expect(JSON.parse(String(init?.body || '{}'))).toEqual({
      campaignSlug: 'demo',
      items: [
        { id: 'demo__featured-tier', quantity: 2 },
        { id: 'demo__support__travel', amount: 10 },
        { id: 'demo__custom-support', amount: 7 },
        { id: 'demo__postcard', quantity: 1 }
      ],
      customAmount: 0,
      tipPercent: 6,
      preferredLang: 'en',
      shippingOption: 'standard',
      bundleAddOnAnchorCampaignSlug: ''
    });
    if (pendingPledge) {
      expect(pendingPledge).toContain('"value":"true"');
    }
  });

  it.skip('keeps checkout inside the second drawer when custom checkout UI mode is enabled', async () => {
    const getLiveRoot = () => document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'custom',
      workerBase: WORKER_BASE,
      shipping: {
        countries: SHIPPING_COUNTRIES
      }
    };
    (window as any).invalidateStatsCache = vi.fn();
    (window as any).invalidateInventoryCache = vi.fn();

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === `${WORKER_BASE}/checkout-intent/start`) {
        expect(JSON.parse(String(init?.body || '{}'))).toMatchObject({
          campaignSlug: 'demo',
          items: [{ id: 'demo__featured-tier', quantity: 1 }],
          preferredLang: 'en',
          shippingOption: 'standard'
        });
        return new Response(JSON.stringify({
          checkoutUiMode: 'custom',
          sessionId: 'cs_test_custom_123',
          clientSecret: 'cs_test_custom_secret_123',
          publishableKey: 'pk_test_custom_123',
          orderId: 'pool-intent-custom-123'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url === `${WORKER_BASE}/checkout-intent/summary?orderId=pool-intent-custom-123`) {
        return new Response(JSON.stringify({
          orderId: 'pool-intent-custom-123',
          campaignSlug: 'demo',
          campaignTitle: 'Demo',
          persisted: true,
          pledgeStatus: 'active',
          createdAt: '2026-04-09T12:34:56.000Z',
          shippingCollected: true,
          totals: {
            subtotal: 2500,
            tax: 197,
            shipping: 300,
            tipAmount: 125,
            amount: 3122
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url === `${WORKER_BASE}/shipping/quote`) {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body || '{}'))).toMatchObject({
          campaignSlug: 'demo',
          items: [
            { id: 'demo__featured-tier', quantity: 1 }
          ],
          shippingAddress: {
            country: 'US',
            postalCode: '87101'
          }
        });

        return new Response(JSON.stringify({
          totalShippingCents: 900,
          quotes: [
            {
              campaignSlug: 'demo',
              shippingCents: 900,
              source: 'usps_live',
              carrier: 'usps',
              service: 'usps_ground_advantage',
              domestic: true,
              availableOptions: [
                { id: 'standard', label: 'Standard', domesticOnly: false, priceDeltaCents: 0, shippingCents: 900 },
                { id: 'signature_required', label: 'Signature required', domesticOnly: true, priceDeltaCents: 395, shippingCents: 1295 }
              ],
              defaultOption: 'standard',
              selectedOption: 'standard'
            }
          ]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      {
        throw new Error(`Unexpected fetch: ${url}`);
      }
    }));
    const updateEmail = vi.fn(async () => ({}));
    const updateShippingAddress = vi.fn(async () => ({}));
    const confirm = vi.fn(async () => ({ type: 'success' }));
    (window as any).PoolStripeCheckoutSidecar = {
      ensureStripeJs: vi.fn(async () => (window as any).Stripe),
      mount: vi.fn(async ({ onChange }) => {
        if (typeof onChange === 'function') {
          onChange({ session: { canConfirm: true } });
        }

        return {
          supportsLinkAuthenticationElement: false,
          supportsShippingAddressElement: false,
          updateEmail,
          updateShippingAddress,
          confirm,
          unmount: vi.fn()
        };
      })
    };
    (window as any).Stripe = vi.fn();
    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'demo__featured-tier',
      name: 'Demo Featured Tier',
      price: 25,
      quantity: 1,
      url: '/campaigns/demo/',
      shippable: true
    });

    await readyApi.api.theme.cart.open();

    const root = getLiveRoot();
    await readyApi.api.theme.cart.navigate('/checkout');

    await vi.waitFor(() => {
      const pageText = document.body.textContent || '';
      const liveRoot = getLiveRoot();
      expect(pageText).toContain('Payment method');
      expect(pageText).toContain('Contact & Shipping address');
      expect(pageText).toContain('Pledge total');
      expect(pageText).toContain('Estimated total');
      expect(pageText).not.toContain('Delivery option');
      expect(pageText).not.toContain('Enter your shipping address to calculate final shipping before saving your payment method.');
      expect(liveRoot?.querySelector('[data-cart-custom-checkout-email-fallback]')).toBeNull();
      expect(pageText).not.toContain('Card stays the default');
      expect(pageText).toContain('By providing your card information, you allow The Pool to charge your card if the campaign(s) you backed reaches its goal before its end date.');
      expect(pageText).toContain('Full name *');
      expect(pageText).toContain('Email address *');
      expect(pageText).toContain('Address line 1 *');
      expect(liveRoot?.querySelector('[data-cart-start-checkout]')).toBeNull();
      expect(liveRoot?.querySelector('[data-cart-confirm-custom-checkout]')).toBeTruthy();
      expect(liveRoot?.querySelector('.pool-first-party-cart__panel--checkout')).toBeTruthy();
    });
    const emailField = (
      root?.querySelector('#pool-custom-checkout-email-fallback') ||
      root?.querySelector('#pool-custom-checkout-email')
    ) as HTMLInputElement | null;
    const shippingName = root?.querySelector('#pool-custom-shipping-name') as HTMLInputElement | null;
    const shippingLine1 = root?.querySelector('#pool-custom-shipping-line1') as HTMLInputElement | null;
    const shippingCity = root?.querySelector('#pool-custom-shipping-city') as HTMLInputElement | null;
    const shippingState = root?.querySelector('#pool-custom-shipping-state') as HTMLInputElement | null;
    const shippingPostalCode = root?.querySelector('#pool-custom-shipping-postal') as HTMLInputElement | null;
    const shippingCountry = root?.querySelector('#pool-custom-shipping-country') as HTMLSelectElement | null;
    const shippingError = root?.querySelector('#pool-custom-shipping-error') as HTMLElement | null;
    expect(emailField).toBeTruthy();
    expect(shippingName).toBeTruthy();
    expect(shippingLine1).toBeTruthy();
    expect(shippingCity).toBeTruthy();
    expect(shippingState).toBeTruthy();
    expect(shippingPostalCode).toBeTruthy();
    expect(shippingCountry).toBeTruthy();
    expect(shippingName.getAttribute('aria-describedby')).toBe('pool-custom-shipping-error');
    expect(shippingName.getAttribute('aria-invalid')).toBe('false');
    expect(shippingError?.getAttribute('role')).toBe('alert');
    expect(shippingName.getAttribute('autocomplete')).toBe('section-pool-checkout shipping name');
    expect(emailField.getAttribute('autocomplete')).toBe('section-pool-checkout email');
    expect(shippingLine1.getAttribute('autocomplete')).toBe('section-pool-checkout shipping address-line1');
    expect(shippingPostalCode.getAttribute('autocomplete')).toBe('section-pool-checkout shipping postal-code');

    expect(root?.textContent).toContain('Contact & Shipping address');
    expect(shippingCountry.value).toBe('US');
    expect(Array.from(shippingCountry.options).some((option) => option.value === 'CA')).toBe(true);

    await vi.waitFor(() => {
      expect((window as any).PoolStripeCheckoutSidecar.mount).toHaveBeenCalled();
      expect(getLiveRoot()?.querySelector('[data-cart-start-checkout]')).toBeNull();
      expect(getLiveRoot()?.querySelector('[data-cart-confirm-custom-checkout]')).toBeTruthy();
    });

    expect(root?.textContent).not.toContain('Email authentication region');
    expect(root?.textContent).not.toContain('Secure Stripe form ready.');
  });

  it('falls back to configured shipping-country labels when Intl.DisplayNames rejects a code', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'custom',
      workerBase: WORKER_BASE,
      shipping: {
        countries: [
          { value: 'US', label: 'United States' },
          { value: 'ZZZ', label: 'Testland' }
        ]
      }
    };

    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'demo__physical-tier',
      name: 'Demo Physical Tier',
      price: 25,
      quantity: 1,
      url: '/campaigns/demo/',
      shippable: true,
      customFields: [
        { name: '_category', value: 'physical' }
      ]
    });

    await readyApi.api.theme.cart.open();
    await readyApi.api.theme.cart.navigate('/checkout');

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    await vi.waitFor(() => {
      const shippingCountry = root?.querySelector('#pool-custom-shipping-country') as HTMLSelectElement | null;
      expect(shippingCountry).toBeTruthy();
      expect(Array.from(shippingCountry?.options || []).some((option) => option.value === 'ZZZ' && option.text === 'Testland')).toBe(true);
    });
  });

  it('remounts the custom checkout payment element after checkout rerenders', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'custom',
      workerBase: WORKER_BASE,
      shipping: {
        countries: SHIPPING_COUNTRIES
      }
    };

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === `${WORKER_BASE}/tax/quote`) {
        expect(JSON.parse(String(init?.body || '{}'))).toMatchObject({
          subtotalCents: 2500,
          shippingCents: 0,
          billingAddress: {
            country: 'US',
            postalCode: '80205'
          }
        });

        return new Response(JSON.stringify({
          subtotalCents: 2500,
          shippingCents: 0,
          taxCents: 197,
          taxDetails: {
            effectiveRate: 0.07875,
            destination: {
              country: 'US',
              postalCode: '80205'
            }
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url === `${WORKER_BASE}/checkout-intent/start`) {
        return new Response(JSON.stringify({
          checkoutUiMode: 'custom',
          sessionId: 'cs_test_custom_remount_123',
          clientSecret: 'cs_test_custom_remount_secret_123',
          publishableKey: 'pk_test_custom_remount_123',
          orderId: 'pool-intent-custom-remount-123'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }));

    const mountSpy = vi.fn(async () => ({
      supportsLinkAuthenticationElement: false,
      supportsShippingAddressElement: false,
      updateEmail: vi.fn(async () => ({})),
      updateShippingAddress: vi.fn(async () => ({})),
      confirm: vi.fn(async () => ({ type: 'success' })),
      unmount: vi.fn()
    }));

    (window as any).PoolStripeCheckoutSidecar = {
      ensureStripeJs: vi.fn(async () => (window as any).Stripe),
      mount: mountSpy
    };
    (window as any).Stripe = vi.fn();
    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'demo__featured-tier',
      name: 'Demo Featured Tier',
      price: 25,
      quantity: 1,
      url: '/campaigns/demo/'
    });
    await readyApi.api.cart.update({
      billingAddress: {
        country: 'US',
        postal_code: '80205'
      }
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    const continueButton = root?.querySelector('[data-cart-continue]') as HTMLButtonElement | null;
    if (!continueButton) throw new Error('Missing continue button');
    continueButton.click();

    await vi.waitFor(() => {
      expect(mountSpy).toHaveBeenCalledTimes(1);
    });

    await readyApi.api.cart.update({ tipPercent: 6 });

    await vi.waitFor(() => {
      expect(mountSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('abandons the active custom checkout reservation when Stripe mount fails', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'custom',
      workerBase: WORKER_BASE
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === `${WORKER_BASE}/tax/quote`) {
        expect(JSON.parse(String(init?.body || '{}'))).toMatchObject({
          subtotalCents: 2500,
          shippingCents: 0,
          billingAddress: {
            country: 'US',
            postalCode: '80205'
          }
        });

        return new Response(JSON.stringify({
          subtotalCents: 2500,
          shippingCents: 0,
          taxCents: 197,
          taxDetails: {
            effectiveRate: 0.07875,
            destination: {
              country: 'US',
              postalCode: '80205'
            }
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url === `${WORKER_BASE}/checkout-intent/start`) {
        return new Response(JSON.stringify({
          checkoutUiMode: 'custom',
          sessionId: 'cs_test_custom_123',
          clientSecret: 'cs_test_custom_secret_123',
          publishableKey: 'pk_test_custom_123',
          orderId: 'pool-intent-custom-error-123'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url === `${WORKER_BASE}/checkout-intent/abandon`) {
        expect(init?.method).toBe('POST');
        expect(String(init?.body || '')).toContain('pool-intent-custom-error-123');
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    (window as any).PoolStripeCheckoutSidecar = {
      ensureStripeJs: vi.fn(async () => (window as any).Stripe),
      mount: vi.fn(async () => {
        throw new Error('Invalid createPaymentElement');
      })
    };
    (window as any).Stripe = vi.fn();
    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'demo__featured-tier',
      name: 'Demo Featured Tier',
      price: 25,
      quantity: 1,
      url: '/campaigns/demo/',
      shippable: true
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    const continueButton = root?.querySelector('[data-cart-continue]') as HTMLButtonElement | null;
    if (!continueButton) throw new Error('Missing continue button');
    continueButton.click();

    const shippingName = root?.querySelector('[data-cart-custom-shipping-field="name"]') as HTMLInputElement | null;
    const shippingLine1 = root?.querySelector('[data-cart-custom-shipping-field="line1"]') as HTMLInputElement | null;
    const shippingCity = root?.querySelector('[data-cart-custom-shipping-field="city"]') as HTMLInputElement | null;
    const shippingState = root?.querySelector('[data-cart-custom-shipping-field="state"]') as HTMLInputElement | null;
    const shippingPostalCode = root?.querySelector('[data-cart-custom-shipping-field="postal_code"]') as HTMLInputElement | null;
    if (!shippingName || !shippingLine1 || !shippingCity || !shippingState || !shippingPostalCode) {
      throw new Error('Missing custom checkout shipping fields');
    }

    shippingName.value = 'Supporter Example';
    shippingLine1.value = '123 Main Street';
    shippingCity.value = 'Albuquerque';
    shippingState.value = 'NM';
    shippingPostalCode.value = '87101';
    shippingPostalCode.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(`${WORKER_BASE}/checkout-intent/start`, expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith(`${WORKER_BASE}/checkout-intent/abandon`, expect.any(Object));
    });

  expect((window as any).PoolStripeCheckoutSidecar.mount).toHaveBeenCalled();

  expect(sessionStorage.getItem('pool_active_custom_checkout_order_id')).toBeNull();
});

  it('localizes physical checkout shipping labels from runtime messages', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'custom',
      workerBase: WORKER_BASE,
      i18n: {
        currentLang: 'es',
        messages: {
          cart: {
            shippingAddress: 'Contacto y direccion de envio',
            fullName: 'Nombre completo',
            addressLine1: 'Direccion linea 1',
            addressLine2: 'Direccion linea 2',
            city: 'Ciudad',
            stateProvince: 'Estado / provincia',
            postalCode: 'Codigo postal',
            country: 'Pais',
            emailAddress: 'Correo electronico',
            paymentMethod: 'Metodo de pago'
          }
        }
      }
    };

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === `${WORKER_BASE}/shipping/quote`) {
        return new Response(JSON.stringify({
          quotes: [],
          totalShippingCents: 0,
          shippingAddress: {
            country: 'US',
            postalCode: '80205'
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }));
    (window as any).PoolStripeCheckoutSidecar = {
      mount: vi.fn()
    };
    (window as any).Stripe = vi.fn();
    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'demo__featured-tier',
      name: 'Demo Featured Tier',
      price: 25,
      quantity: 1,
      url: '/campaigns/demo/',
      shippable: true
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    const continueButton = root?.querySelector('[data-cart-continue]') as HTMLButtonElement | null;
    if (!continueButton) throw new Error('Missing continue button');
    continueButton.click();

    await vi.waitFor(() => {
      expect(root?.textContent).toContain('Contacto y direccion de envio');
      expect(root?.textContent).toContain('Nombre completo');
      expect(root?.textContent).toContain('Direccion linea 1');
      expect(root?.textContent).toContain('Direccion linea 2');
      expect(root?.textContent).toContain('Ciudad');
      expect(root?.textContent).toContain('Estado / provincia');
      expect(root?.textContent).toContain('Codigo postal');
      expect(root?.textContent).toContain('Pais');
      expect(root?.textContent).toContain('Correo electronico');
      expect(root?.textContent).toContain('Metodo de pago');
      expect(root?.textContent).not.toContain('Ingresa tu direccion de envio para calcular el envio final antes de guardar tu metodo de pago.');
    });
  });

  it('ignores stale custom checkout bootstrap work after backing out and returning to cart', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'custom',
      workerBase: WORKER_BASE
    };

    let resolveStripeJs: (() => void) | null = null;
    const stripeJsPromise = new Promise<void>((resolve) => {
      resolveStripeJs = resolve;
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === `${WORKER_BASE}/checkout-intent/start`) {
        return new Response(JSON.stringify({
          checkoutUiMode: 'custom',
          sessionId: 'cs_test_custom_back_123',
          clientSecret: 'cs_test_custom_secret_back_123',
          publishableKey: 'pk_test_custom_back_123',
          orderId: 'pool-intent-custom-back-123'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url === `${WORKER_BASE}/checkout-intent/abandon`) {
        expect(init?.method).toBe('POST');
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const mount = vi.fn(async () => ({
      supportsShippingAddressElement: false,
      updateEmail: vi.fn(async () => ({})),
      updateShippingAddress: vi.fn(async () => ({})),
      confirm: vi.fn(async () => ({ type: 'success' })),
      unmount: vi.fn()
    }));

    (window as any).PoolStripeCheckoutSidecar = {
      ensureStripeJs: vi.fn(async () => {
        await stripeJsPromise;
        return (window as any).Stripe;
      }),
      mount
    };
    (window as any).Stripe = vi.fn();
    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'demo__featured-tier',
      name: 'Demo Featured Tier',
      price: 25,
      quantity: 1,
      url: '/campaigns/demo/'
    });
    await readyApi.api.cart.update({
      billingAddress: {
        country: 'US',
        postal_code: '80205'
      }
    });

    await readyApi.api.theme.cart.open();

    const getRoot = () => document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    const continueButton = getRoot()?.querySelector('[data-cart-continue]') as HTMLButtonElement | null;
    if (!continueButton) throw new Error('Missing continue button');
    continueButton.click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(`${WORKER_BASE}/checkout-intent/start`, expect.any(Object));
    }, { timeout: 5000 });

    await readyApi.api.theme.cart.navigate('/');

    await vi.waitFor(() => {
      expect(getRoot()?.querySelector('[data-cart-continue]')).toBeTruthy();
    });

    resolveStripeJs?.();
    await Promise.resolve();
    await Promise.resolve();

    const reopenedContinueButton = getRoot()?.querySelector('[data-cart-continue]') as HTMLButtonElement | null;
    if (!reopenedContinueButton) throw new Error('Missing reopened continue button');
    reopenedContinueButton.click();

    await vi.waitFor(() => {
      expect(getRoot()?.textContent || '').toContain('Payment method');
    });

    await vi.waitFor(() => {
      expect(mount).toHaveBeenCalled();
    }, { timeout: 10000 });
  });

  it('keeps the custom payment element mounted after an incomplete-card confirm error', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'custom',
      workerBase: WORKER_BASE
    };

    // Drain debounced checkout work from earlier tests before installing this test's guarded mocks.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })));
    await new Promise((resolve) => setTimeout(resolve, 220));
    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    const targetItemId = 'demo__incomplete-card-target';
    const targetClientSecret = 'cs_test_custom_secret_456';
    let targetCheckoutStarted = false;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === `${WORKER_BASE}/tax/quote`) {
        expect(JSON.parse(String(init?.body || '{}'))).toMatchObject({
          subtotalCents: 2500,
          shippingCents: 0,
          billingAddress: {
            country: 'US',
            postalCode: '80205'
          }
        });

        return new Response(JSON.stringify({
          subtotalCents: 2500,
          shippingCents: 0,
          taxCents: 197,
          taxDetails: {
            effectiveRate: 0.07875,
            destination: {
              country: 'US',
              postalCode: '80205'
            }
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url !== `${WORKER_BASE}/checkout-intent/start`) {
        throw new Error(`Unexpected fetch: ${url}`);
      }

      const body = JSON.parse(String(init?.body || '{}'));
      const hasTargetItem = Array.isArray(body.items) && body.items.some((item: any) => item?.id === targetItemId);
      if (!hasTargetItem) {
        return new Response(JSON.stringify({ url: '#stale-checkout' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      targetCheckoutStarted = true;
      expect(body).toMatchObject({
        campaignSlug: 'demo',
        items: [
          { id: targetItemId, quantity: 1 }
        ],
        billingAddress: {
          country: 'US',
          postalCode: '80205'
        }
      });

      return new Response(JSON.stringify({
        checkoutUiMode: 'custom',
        sessionId: 'cs_test_custom_456',
        clientSecret: targetClientSecret,
        publishableKey: 'pk_test_custom_456',
        orderId: 'pool-intent-custom-456'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const confirm = vi.fn(async () => ({
      type: 'error',
      error: { message: 'Your card number is incomplete.' }
    }));
    const targetMount = vi.fn(async ({ onChange, paymentContainer }) => {
      if (typeof onChange === 'function') {
        onChange({ session: { canConfirm: true } });
      }
      if (paymentContainer instanceof HTMLElement) {
        const mountedElement = document.createElement('div');
        mountedElement.setAttribute('data-test-stripe-payment-element', 'true');
        paymentContainer.appendChild(mountedElement);
      }

      return {
        supportsLinkAuthenticationElement: false,
        supportsShippingAddressElement: false,
        updateEmail: vi.fn(async () => ({})),
        updateShippingAddress: vi.fn(async () => ({})),
        confirm,
        unmount: vi.fn()
      };
    });
    const mount = vi.fn(async (options) => {
      if (options?.clientSecret !== targetClientSecret) {
        return {
          supportsLinkAuthenticationElement: false,
          supportsShippingAddressElement: false,
          updateEmail: vi.fn(async () => ({})),
          updateShippingAddress: vi.fn(async () => ({})),
          confirm: vi.fn(async () => ({ type: 'success' })),
          unmount: vi.fn()
        };
      }

      return targetMount(options);
    });

    (window as any).PoolStripeCheckoutSidecar = {
      ensureStripeJs: vi.fn(async () => (window as any).Stripe),
      mount
    };
    (window as any).Stripe = vi.fn();
    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: targetItemId,
      name: 'Demo Featured Tier',
      price: 25,
      quantity: 1,
      url: '/campaigns/demo/'
    });
    await readyApi.api.cart.update({
      billingAddress: {
        country: 'US',
        postal_code: '80205'
      }
    });

    await readyApi.api.theme.cart.open();
    await readyApi.api.theme.cart.navigate('/checkout');

    const getLiveRoot = () => document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    await vi.waitFor(() => {
      const liveRoot = getLiveRoot();
      expect(liveRoot?.querySelector('[data-cart-custom-checkout-region="payment"]')).toBeTruthy();
      expect(liveRoot?.querySelector('[data-cart-custom-checkout-email]')).toBeTruthy();
    });

    const emailField = getLiveRoot()?.querySelector('[data-cart-custom-checkout-email]') as HTMLInputElement | null;
    if (!emailField) throw new Error('Missing custom checkout email field');
    emailField.value = 'supporter@example.com';

    await vi.waitFor(() => {
      const liveRoot = getLiveRoot();
      expect(targetCheckoutStarted).toBe(true);
      expect(targetMount).toHaveBeenCalled();
      expect(liveRoot?.querySelector('[data-cart-custom-checkout-region="payment"]')).toBeTruthy();
      expect(liveRoot?.querySelector('[data-test-stripe-payment-element]')).toBeTruthy();
      const confirmAction = liveRoot?.querySelector('[data-cart-confirm-custom-checkout]') as HTMLButtonElement | null;
      expect(confirmAction).toBeTruthy();
      expect(confirmAction?.disabled).toBe(false);
    }, { timeout: 10000 });

    const liveEmailField = getLiveRoot()?.querySelector('[data-cart-custom-checkout-email]') as HTMLInputElement | null;
    if (!liveEmailField) throw new Error('Missing mounted custom checkout email field');
    liveEmailField.value = 'supporter@example.com';

    let clickedConfirm = false;
    await vi.waitFor(() => {
      const confirmButton = getLiveRoot()?.querySelector('[data-cart-confirm-custom-checkout]') as HTMLButtonElement | null;
      expect(confirmButton).toBeTruthy();
      expect(confirmButton?.disabled).toBe(false);
      if (!clickedConfirm) {
        clickedConfirm = true;
        confirmButton?.click();
      }
    });

    await vi.waitFor(() => {
      expect(confirm).toHaveBeenCalledTimes(1);
    });

    await vi.waitFor(() => {
      const liveRoot = getLiveRoot();
      expect(liveRoot?.querySelector('[data-cart-custom-checkout-region="payment"]')).toBeTruthy();
      expect(liveRoot?.querySelector('[data-test-stripe-payment-element]')).toBeTruthy();
      expect(liveRoot?.querySelector('[data-cart-confirm-custom-checkout]')).toBeTruthy();
      expect(liveRoot?.textContent?.includes('Your card number is incomplete.')).toBe(false);
      expect(liveRoot?.querySelector('[data-cart-custom-checkout-region="link"]')).toBeNull();
    });

    await readyApi.api.theme.cart.close();
  }, 15000);


  it('surfaces first-party checkout start errors in the drawer preview', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'hosted',
      workerBase: WORKER_BASE
    };

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: 'Campaign not accepting pledges'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'demo__featured-tier',
      name: 'Demo Featured Tier',
      price: 25,
      quantity: 1,
      url: '/campaigns/demo/'
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    const continueButton = root?.querySelector('[data-cart-continue]') as HTMLButtonElement | null;
    if (!continueButton) throw new Error('Missing continue button');
    continueButton.click();

    const startCheckoutButton = root?.querySelector('[data-cart-start-checkout]') as HTMLButtonElement | null;
    if (!startCheckoutButton) throw new Error('Missing checkout start button');
    startCheckoutButton.click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(window.location.hash).not.toBe('#stripe-checkout');
  });

  it('escapes cart item names and checkout errors in the drawer UI', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'hosted',
      workerBase: WORKER_BASE,
      platformName: '<img src=x onerror=alert(1)> Pool'
    };

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: '<svg onload=alert(2)>'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'demo__featured-tier',
      name: '<img src=x onerror=alert(3)> Tier',
      price: 25,
      quantity: 1,
      url: '/campaigns/demo/'
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    if (!root) throw new Error('Missing cart root');

    expect(root.textContent).toContain('<img src=x onerror=alert(3)> Tier');
    expect(root.textContent).toContain('Tip <img src=x onerror=alert(1)> Pool for platform maintenance.');
    expect(root.querySelector('img[src="x"]')).toBeNull();
    expect(root.querySelector('svg')).toBeNull();

    const continueButton = root.querySelector('[data-cart-continue]') as HTMLButtonElement | null;
    if (!continueButton) throw new Error('Missing continue button');
    continueButton.click();

    const startCheckoutButton = root.querySelector('[data-cart-start-checkout]') as HTMLButtonElement | null;
    if (!startCheckoutButton) throw new Error('Missing checkout start button');
    startCheckoutButton.click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(root.querySelector('svg')).toBeNull();
  });

  it('routes missing-email checkout attempts back to the email field', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'custom',
      workerBase: WORKER_BASE
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === `${WORKER_BASE}/tax/quote`) {
        expect(JSON.parse(String(init?.body || '{}'))).toMatchObject({
          subtotalCents: 1000,
          billingAddress: {
            country: 'US',
            postalCode: '80205',
            state: ''
          }
        });

        return new Response(JSON.stringify({
          subtotalCents: 1000,
          shippingCents: 0,
          taxCents: 79,
          taxDetails: {
            effectiveRate: 0.07875,
            destination: {
              country: 'US',
              postalCode: '80205',
              state: ''
            }
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url !== `${WORKER_BASE}/checkout-intent/start`) {
        throw new Error(`Unexpected fetch: ${url}`);
      }

      return new Response(JSON.stringify({
        checkoutUiMode: 'custom',
        sessionId: 'cs_test_custom_email_missing',
        clientSecret: 'cs_test_custom_secret_email_missing',
        publishableKey: 'pk_test_custom_email_missing',
        orderId: 'pool-intent-custom-email-missing'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const confirm = vi.fn(async () => ({
      type: 'error',
      error: {
        message: 'An email address is required to confirm this Checkout Session. Provide an email address using updateEmail() or pass email to confirm().'
      }
    }));

    const mount = vi.fn(async ({ onChange, paymentContainer }) => {
      if (typeof onChange === 'function') {
        onChange({ session: { canConfirm: true } });
      }
      if (paymentContainer instanceof HTMLElement) {
        const mountedElement = document.createElement('div');
        mountedElement.setAttribute('data-test-stripe-payment-element', 'true');
        paymentContainer.appendChild(mountedElement);
      }
      return {
        supportsLinkAuthenticationElement: false,
        supportsShippingAddressElement: false,
        updateEmail: vi.fn(async () => ({})),
        updateShippingAddress: vi.fn(async () => ({})),
        confirm,
        unmount: vi.fn()
      };
    });

    (window as any).PoolStripeCheckoutSidecar = {
      ensureStripeJs: vi.fn(async () => (window as any).Stripe),
      mount
    };
    (window as any).Stripe = vi.fn();
    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'demo__standard-pass',
      name: 'Demo Standard Pass',
      price: 10,
      quantity: 1,
      url: '/campaigns/demo/'
    });
    await readyApi.api.cart.update({
      billingAddress: {
        country: 'US',
        postal_code: '80205'
      }
    });

    await readyApi.api.theme.cart.open();
    await readyApi.api.theme.cart.navigate('/checkout');
    const getLiveRoot = () => document.querySelector('[data-pool-cart-root]') as HTMLElement | null;

    await vi.waitFor(() => {
      expect(getLiveRoot()?.textContent).toContain('Contact');
      expect(getLiveRoot()?.querySelector('[data-cart-custom-checkout-region="payment"]')).toBeTruthy();
    });

    const emailField = getLiveRoot()?.querySelector('[data-cart-custom-checkout-email]') as HTMLInputElement | null;
    if (!emailField) throw new Error('Missing custom checkout email field');

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(`${WORKER_BASE}/checkout-intent/start`, expect.any(Object));
      expect(mount).toHaveBeenCalled();
    }, { timeout: 10000 });

    await vi.waitFor(() => {
      const liveConfirmButton = getLiveRoot()?.querySelector('[data-cart-confirm-custom-checkout]') as HTMLButtonElement | null;
      expect(liveConfirmButton).not.toBeNull();
      expect(liveConfirmButton?.disabled).toBe(false);
    }, { timeout: 10000 });

    const confirmButton = getLiveRoot()?.querySelector('[data-cart-confirm-custom-checkout]') as HTMLButtonElement | null;
    if (!confirmButton) throw new Error('Missing custom checkout confirm button');
    confirmButton?.click();

    await vi.waitFor(() => {
      expect(confirm).not.toHaveBeenCalled();
      const error = getLiveRoot()?.querySelector('[data-cart-custom-checkout-email-error]') as HTMLElement | null;
      expect(error?.hidden).toBe(false);
      expect(error?.textContent).toContain('Enter an email address to continue.');
    });

    expect(getLiveRoot()?.textContent).not.toContain('Provide an email address using updateEmail()');
    const checkoutError = getLiveRoot()?.querySelector('[data-cart-checkout-error]') as HTMLElement | null;
    expect(checkoutError?.hidden).toBe(true);
  }, 15000);

  it('collects a full New Mexico tax location in custom checkout before starting a digital-only pledge', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'custom',
      workerBase: WORKER_BASE
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === `${WORKER_BASE}/tax/quote`) {
        const body = JSON.parse(String(init?.body || '{}'));
        expect(body).toMatchObject({
          subtotalCents: 1000,
          shippingCents: 0,
          billingAddress: {
            country: 'US',
            postalCode: '87501',
            state: 'NM',
            city: 'Santa Fe',
            line1: '101 Plaza Real',
            line2: 'Suite B'
          }
        });

        return new Response(JSON.stringify({
          subtotalCents: 1000,
          shippingCents: 0,
          taxCents: 82,
          taxDetails: {
            effectiveRate: 0.081875,
            destination: {
              country: 'US',
              postalCode: '87501',
              state: 'NM',
              city: 'Santa Fe',
              line1: '101 Plaza Real',
              line2: 'Suite B'
            }
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url !== `${WORKER_BASE}/checkout-intent/start`) {
        throw new Error(`Unexpected fetch: ${url}`);
      }

      return new Response(JSON.stringify({
        checkoutUiMode: 'custom',
        sessionId: 'cs_test_custom_tax_location',
        clientSecret: 'cs_test_custom_secret_tax_location',
        publishableKey: 'pk_test_custom_tax_location',
        orderId: 'pool-intent-custom-tax-location'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    (window as any).PoolStripeCheckoutSidecar = {
      ensureStripeJs: vi.fn(async () => (window as any).Stripe),
      mount: vi.fn(async ({ onChange }) => {
        if (typeof onChange === 'function') {
          onChange({ session: { canConfirm: true } });
        }
        return {
          supportsLinkAuthenticationElement: false,
          supportsShippingAddressElement: false,
          updateEmail: vi.fn(async () => ({})),
          updateShippingAddress: vi.fn(async () => ({})),
          confirm: vi.fn(async () => ({ type: 'success' })),
          unmount: vi.fn()
        };
      })
    };
    (window as any).Stripe = vi.fn();
    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'demo__digital-pass',
      name: 'Demo Digital Pass',
      price: 10,
      quantity: 1,
      url: '/campaigns/demo/'
    });

    await readyApi.api.theme.cart.open();
    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    const continueButton = root?.querySelector('[data-cart-continue]') as HTMLButtonElement | null;
    if (!continueButton) throw new Error('Missing continue button');
    continueButton.click();

    await vi.waitFor(() => {
      expect(root?.textContent).toContain('Tax location');
    });

    let startButton = root?.querySelector('[data-cart-start-checkout]') as HTMLButtonElement | null;
    if (!startButton) throw new Error('Missing checkout start button');
    expect(root?.querySelector('[data-cart-checkout-summary-tax]')?.textContent).toBe('--');
    await vi.waitFor(() => {
      startButton = root?.querySelector('[data-cart-start-checkout]') as HTMLButtonElement | null;
      expect(startButton?.disabled).toBe(true);
    });

    const stateField = root?.querySelector('[data-cart-tax-destination-field="state"]') as HTMLInputElement | null;
    const line1Field = root?.querySelector('[data-cart-tax-destination-field="line1"]') as HTMLInputElement | null;
    const line2Field = root?.querySelector('[data-cart-tax-destination-field="line2"]') as HTMLInputElement | null;
    const cityField = root?.querySelector('[data-cart-tax-destination-field="city"]') as HTMLInputElement | null;
    const postalField = root?.querySelector('[data-cart-tax-destination-field="postal_code"]') as HTMLInputElement | null;
    if (!stateField || !line1Field || !line2Field || !cityField || !postalField) throw new Error('Missing tax location fields');
    stateField.value = 'NM';
    stateField.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      const liveStartButton = root?.querySelector('[data-cart-start-checkout]') as HTMLButtonElement | null;
      expect(liveStartButton?.disabled).toBe(true);
      expect(root?.textContent).toContain('New Mexico billing street address, city, state, and postal code');
    });

    const liveLine1Field = root?.querySelector('[data-cart-tax-destination-field="line1"]') as HTMLInputElement | null;
    const liveLine2Field = root?.querySelector('[data-cart-tax-destination-field="line2"]') as HTMLInputElement | null;
    const liveCityField = root?.querySelector('[data-cart-tax-destination-field="city"]') as HTMLInputElement | null;
    const livePostalField = root?.querySelector('[data-cart-tax-destination-field="postal_code"]') as HTMLInputElement | null;
    if (!liveLine1Field || !liveLine2Field || !liveCityField || !livePostalField) {
      throw new Error('Missing rerendered tax location fields');
    }

    liveLine1Field.value = '101 Plaza Real';
    liveLine2Field.value = 'Suite B';
    liveCityField.value = 'Santa Fe';
    livePostalField.value = '87501';
    livePostalField.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${WORKER_BASE}/tax/quote`,
        expect.objectContaining({
          method: 'POST',
          cache: 'no-store'
        })
      );
    });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${WORKER_BASE}/checkout-intent/start`,
        expect.objectContaining({
          method: 'POST',
          cache: 'no-store'
        })
      );
    });

    const checkoutStartCall = fetchMock.mock.calls.find(([requestUrl]) => requestUrl === `${WORKER_BASE}/checkout-intent/start`);
    expect(checkoutStartCall).toBeTruthy();
    const [, init] = checkoutStartCall || [];
    expect(JSON.parse(String(init?.body || '{}'))).toMatchObject({
      campaignSlug: 'demo',
      billingAddress: {
        country: 'US',
        postalCode: '87501',
        state: 'NM',
        city: 'Santa Fe',
        line1: '101 Plaza Real',
        line2: 'Suite B'
      }
    });
  });

  it('keeps digital tax-location autofill fields stable until the billing draft sync settles', async () => {
    vi.useFakeTimers();
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'custom',
      workerBase: WORKER_BASE
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === `${WORKER_BASE}/tax/quote`) {
        return new Response(JSON.stringify({
          subtotalCents: 1000,
          shippingCents: 0,
          taxCents: 82,
          taxDetails: {
            effectiveRate: 0.081875,
            destination: {
              country: 'US',
              postalCode: '87501',
              state: 'NM',
              city: 'Santa Fe',
              line1: '101 Plaza Real'
            }
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'demo__digital-pass',
      name: 'Demo Digital Pass',
      price: 10,
      quantity: 1,
      url: '/campaigns/demo/'
    });

    await readyApi.api.theme.cart.open();
    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    const continueButton = root?.querySelector('[data-cart-continue]') as HTMLButtonElement | null;
    if (!continueButton) throw new Error('Missing continue button');
    continueButton.click();

    await vi.waitFor(() => {
      expect(root?.textContent).toContain('Tax location');
    });

    const emailField = root?.querySelector('[data-cart-custom-checkout-email]') as HTMLInputElement | null;
    const stateField = root?.querySelector('[data-cart-tax-destination-field="state"]') as HTMLInputElement | null;
    const line1Field = root?.querySelector('[data-cart-tax-destination-field="line1"]') as HTMLInputElement | null;
    const cityField = root?.querySelector('[data-cart-tax-destination-field="city"]') as HTMLInputElement | null;
    const postalField = root?.querySelector('[data-cart-tax-destination-field="postal_code"]') as HTMLInputElement | null;
    if (!emailField || !stateField || !line1Field || !cityField || !postalField) {
      throw new Error('Missing digital tax-location fields');
    }

    expect(emailField.name).toBe('checkout-email');
    expect(line1Field.autocomplete).toBe('section-pool-checkout billing address-line1');
    expect(cityField.autocomplete).toBe('section-pool-checkout billing address-level2');
    expect(postalField.autocomplete).toBe('section-pool-checkout billing postal-code');

    stateField.value = 'NM';
    stateField.dispatchEvent(new Event('change', { bubbles: true }));
    line1Field.value = '101 Plaza Real';
    line1Field.dispatchEvent(new Event('change', { bubbles: true }));
    cityField.value = 'Santa Fe';
    cityField.dispatchEvent(new Event('change', { bubbles: true }));
    postalField.value = '87501';
    postalField.dispatchEvent(new Event('change', { bubbles: true }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(root?.querySelector('[data-cart-tax-destination-field="line1"]')).toBe(line1Field);

    await vi.advanceTimersByTimeAsync(200);

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${WORKER_BASE}/tax/quote`,
        expect.objectContaining({
          method: 'POST',
          cache: 'no-store'
        })
      );
    });
  });

  it('submits mixed-campaign checkout payloads to the Worker', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'hosted',
      workerBase: WORKER_BASE
    };

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ url: '#stripe-checkout' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'smoke-editable__standard-pass',
      name: 'SMOKE EDITABLE — Standard Pass',
      price: 10,
      quantity: 1,
      url: '/campaigns/smoke-editable/'
    });
    await readyApi.api.cart.items.add({
      id: 'sunder__physical-media',
      name: 'sunder — physical media',
      price: 20,
      quantity: 1,
      url: '/campaigns/sunder/'
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    const continueButton = root?.querySelector('[data-cart-continue]') as HTMLButtonElement | null;
    if (!continueButton) throw new Error('Missing continue button');
    continueButton.click();

    const startCheckoutButton = root?.querySelector('[data-cart-start-checkout]') as HTMLButtonElement | null;
    if (!startCheckoutButton) throw new Error('Missing checkout start button');
    startCheckoutButton.click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body || '{}'))).toEqual({
      campaignSlug: 'smoke-editable',
      items: [
        { id: 'smoke-editable__standard-pass', quantity: 1 },
        { id: 'sunder__physical-media', quantity: 1 }
      ],
      customAmount: 0,
      tipPercent: 5,
      preferredLang: 'en',
      shippingOption: 'standard',
      bundleAddOnAnchorCampaignSlug: ''
    });
  });

  it('shows shipping per physical campaign in mixed-campaign carts', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      workerBase: WORKER_BASE
    };

    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'smoke-editable__physical-zine',
      name: 'SMOKE EDITABLE — Physical Zine',
      price: 15,
      quantity: 1,
      url: '/campaigns/smoke-editable/',
      shippable: true
    });
    await readyApi.api.cart.items.add({
      id: 'sunder__physical-media',
      name: 'sunder — physical media',
      price: 20,
      quantity: 1,
      url: '/campaigns/sunder/',
      shippable: true
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    expect(root?.textContent).not.toContain('Shipping');
    expect(root?.textContent).toContain('Estimated total');
    expect(root?.textContent).toContain('Pledge total');
  });

  it('shows shipping when a multi-campaign cart mixes digital and physical campaign tiers', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'custom',
      workerBase: WORKER_BASE
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url === `${WORKER_BASE}/shipping/quote`) {
        expect(JSON.parse(String(init?.body || '{}'))).toMatchObject({
          items: [
            { id: 'hand-relations__frame-slot', quantity: 1 },
            { id: 'sunder__physical-media', quantity: 1 }
          ],
          shippingAddress: {
            country: 'US',
            postalCode: '80205'
          }
        });

        return new Response(JSON.stringify({
          totalShippingCents: 1200,
          quotes: [
            {
              campaignSlug: 'hand-relations',
              shippingCents: 0,
              source: 'none',
              carrier: null,
              service: null,
              domestic: true,
              availableOptions: [],
              defaultOption: 'standard',
              selectedOption: 'standard',
              shipment: {
                hasPhysical: false
              }
            },
            {
              campaignSlug: 'sunder',
              shippingCents: 1200,
              source: 'fallback_flat_rate',
              carrier: 'fallback',
              service: 'domestic_ground_fallback',
              domestic: true,
              availableOptions: [
                { id: 'standard', label: 'Standard', domesticOnly: false, priceDeltaCents: 0, shippingCents: 1200 }
              ],
              defaultOption: 'standard',
              selectedOption: 'standard',
              shipment: {
                hasPhysical: true
              }
            }
          ]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url === `${WORKER_BASE}/checkout-intent/start`) {
        return new Response(JSON.stringify({
          checkoutUiMode: 'custom',
          sessionId: 'cs_test_mixed_cart_shipping',
          clientSecret: 'cs_test_mixed_cart_shipping_secret',
          publishableKey: 'pk_test_mixed_cart_shipping',
          orderId: 'pool-intent-mixed-cart-shipping'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    (window as any).PoolStripeCheckoutSidecar = {
      ensureStripeJs: vi.fn(async () => (window as any).Stripe),
      mount: vi.fn(async ({ onChange }) => {
        if (typeof onChange === 'function') {
          onChange({ session: { canConfirm: true } });
        }
        return {
          supportsLinkAuthenticationElement: false,
          supportsShippingAddressElement: false,
          updateEmail: vi.fn(async () => ({})),
          updateShippingAddress: vi.fn(async () => ({})),
          confirm: vi.fn(async () => ({ type: 'success' })),
          unmount: vi.fn()
        };
      })
    };
    (window as any).Stripe = vi.fn();
    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'hand-relations__frame-slot',
      name: 'Hand Relations Digital Tier',
      price: 10,
      quantity: 1,
      url: '/campaigns/hand-relations/',
      shippable: false
    });
    await readyApi.api.cart.items.add({
      id: 'sunder__physical-media',
      name: 'sunder — physical media',
      price: 35,
      quantity: 1,
      url: '/campaigns/sunder/',
      shippable: true
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    const waitForShippingField = async (fieldName: string) => {
      await vi.waitFor(() => {
        expect(
          root?.querySelector(`[data-cart-custom-shipping-field="${fieldName}"]`)
        ).toBeTruthy();
      });
      return root?.querySelector(`[data-cart-custom-shipping-field="${fieldName}"]`) as HTMLInputElement | HTMLSelectElement | null;
    };
    const continueButton = root?.querySelector('[data-cart-continue]') as HTMLButtonElement | null;
    if (!continueButton) throw new Error('Missing continue button');
    continueButton.click();

    const nameField = await waitForShippingField('name');
    const addressField = await waitForShippingField('line1');
    const cityField = await waitForShippingField('city');
    const stateField = await waitForShippingField('state');
    const postalField = await waitForShippingField('postal_code');
    const countryField = await waitForShippingField('country');
    const emailField = root?.querySelector('[data-cart-custom-checkout-email]') as HTMLInputElement | null;
    if (!emailField) throw new Error('Missing email field');

    emailField.value = 'multi@example.com';
    emailField.dispatchEvent(new Event('input', { bubbles: true }));
    nameField.value = 'Multi Campaign Backer';
    nameField.dispatchEvent(new Event('input', { bubbles: true }));
    addressField.value = '123 Colfax Ave';
    addressField.dispatchEvent(new Event('input', { bubbles: true }));
    cityField.value = 'Denver';
    cityField.dispatchEvent(new Event('input', { bubbles: true }));
    stateField.value = 'CO';
    stateField.dispatchEvent(new Event('input', { bubbles: true }));
    postalField.value = '80205';
    postalField.dispatchEvent(new Event('input', { bubbles: true }));
    countryField.value = 'US';
    countryField.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      const liveRoot = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
      const shippingLabel = liveRoot?.querySelector('[data-cart-checkout-summary-shipping-label]');
      const shippingAmount = liveRoot?.querySelector('[data-cart-checkout-summary-shipping]');
      expect(shippingLabel?.textContent || '').toMatch(/Shipping|Estimated shipping/);
      expect(shippingAmount?.textContent || '').toMatch(/\$12\.00|--/);
    });
  });

  it('shows fallback shipping in the sidecar for mixed digital and physical campaign selections', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      workerBase: WORKER_BASE
    };

    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'hand-relations__frame-slot',
      name: 'Hand Relations Digital Tier',
      price: 10,
      quantity: 1,
      url: '/campaigns/hand-relations/',
      shippable: false
    });
    await readyApi.api.cart.items.add({
      id: 'smoke-editable__support__signed-script',
      name: 'SMOKE EDITABLE — Signed Script',
      price: 25,
      quantity: 1,
      url: '/campaigns/smoke-editable/#support-signed-script',
      shippable: true,
      campaignShippingFallbackCents: 1200
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    await vi.waitFor(() => {
      const shippingLabel = root?.querySelector('[data-cart-summary-shipping-label]');
      const shippingAmount = root?.querySelector('[data-cart-summary-shipping]');
      expect(shippingLabel?.textContent || '').toContain('Shipping');
      expect(shippingAmount?.textContent).toBe('$12.00');
    });
  });

  it('does not treat missing campaign shipping overrides as free shipping when adding from campaign buttons', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      workerBase: WORKER_BASE
    };

    document.body.innerHTML = `
      <div data-pool-cart-root="true" hidden></div>
      <button
        class="poolcart-add-item"
        data-item-id="sunder__physical-media"
        data-item-name="sunder — physical media"
        data-item-price="35"
        data-item-url="/campaigns/sunder/"
        data-item-description="Physical media"
        data-item-stackable="never"
        data-item-max-quantity="1"
        data-item-shippable="false"
        data-item-custom1-name="_category"
        data-item-custom1-type="hidden"
        data-item-custom1-value="physical"
        type="button"
      >
        Add
      </button>
    `;

    await import('../../assets/js/cart-provider.js');

    const button = document.querySelector('.poolcart-add-item') as HTMLButtonElement | null;
    if (!button) throw new Error('Missing add item button');
    button.click();
    await Promise.resolve();

    const provider = (window as any).PoolCartProvider;
    const item = provider.store.getState().cart.items.items[0];
    expect(item?.campaignShippingFallbackCents).toBeUndefined();
    expect(item?.campaignHasExplicitShippingOverride).toBeUndefined();
  });

  it('does not treat a legacy default fallback value as an explicit campaign shipping override', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      workerBase: WORKER_BASE,
      shipping: {
        countries: SHIPPING_COUNTRIES
      }
    };

    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'sunder__physical-media',
      name: 'sunder — physical media',
      price: 35,
      quantity: 1,
      url: '/campaigns/sunder/',
      shippable: false,
      campaignShippingFallbackCents: 300,
      campaignHasExplicitShippingOverride: true,
      campaignFreeShipping: false,
      customFields: [
        { name: '_category', value: 'physical' }
      ]
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    await vi.waitFor(() => {
      expect(root?.querySelector('[data-cart-summary-shipping-label]')?.textContent || '').toContain('Estimated shipping');
      expect(root?.querySelector('[data-cart-summary-shipping]')?.textContent).toBe('--');
    });

    const item = provider.store.getState().cart.items.items[0];
    expect(item?.campaignShippingFallbackCents).toBeUndefined();
    expect(item?.campaignHasExplicitShippingOverride).toBeUndefined();
    expect(item?.campaignFreeShipping).toBeUndefined();

    const persisted = JSON.parse(localStorage.getItem('pool_first_party_cart_state') || '{}');
    expect(persisted.items?.[0]?.campaignShippingFallbackCents).toBeUndefined();
    expect(persisted.items?.[0]?.campaignHasExplicitShippingOverride).toBeUndefined();
    expect(persisted.items?.[0]?.campaignFreeShipping).toBeUndefined();
  });

  it('waits for a ZIP estimate before showing shipping for physical carts without a campaign override', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      workerBase: WORKER_BASE,
      shipping: {
        countries: SHIPPING_COUNTRIES
      }
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === `${WORKER_BASE}/tax/quote`) {
        expect(JSON.parse(String(init?.body || '{}'))).toMatchObject({
          subtotalCents: 3500,
          shippingAddress: {
            country: 'US',
            postalCode: '80205'
          }
        });

        return new Response(JSON.stringify({
          subtotalCents: 3500,
          shippingCents: 980,
          taxCents: 276,
          taxDetails: {
            effectiveRate: 0.07875,
            destination: {
              country: 'US',
              postalCode: '80205'
            }
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url === `${WORKER_BASE}/shipping/quote`) {
        return new Response(JSON.stringify({
          totalShippingCents: 980,
          quotes: [{
            source: 'usps_live',
            shippingCents: 980,
            selectedOption: 'standard',
            defaultOption: 'standard',
            availableOptions: [
              { id: 'standard', shippingCents: 980, priceDeltaCents: 0 },
              { id: 'signature_required', shippingCents: 1375, priceDeltaCents: 395 }
            ],
            shipment: { hasPhysical: true }
          }]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'sunder__physical-media',
      name: 'sunder — physical media',
      price: 35,
      quantity: 1,
      url: '/campaigns/sunder/',
      shippable: false,
      customFields: [
        { name: '_category', value: 'physical' }
      ]
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    expect(root?.querySelector('[data-cart-summary-shipping-label]')?.textContent || '').toContain('Estimated shipping');
    expect(root?.querySelector('[data-cart-summary-tax]')?.textContent).toBe('--');
    expect(root?.querySelector('[data-cart-summary-shipping]')?.textContent).toBe('--');
    expect(root?.querySelector('[data-cart-summary-total-label]')?.textContent || '').toContain('Estimated total');
    expect(root?.querySelector('[data-cart-summary-total]')?.textContent).toBe('$36.75');

    const postalField = root?.querySelector('[data-cart-estimate-postal]') as HTMLInputElement | null;
    if (!postalField) throw new Error('Missing cart estimate postal field');
    postalField.value = '8020';
    postalField.dispatchEvent(new Event('input', { bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(root?.querySelector('[data-cart-summary-shipping-label]')?.textContent || '').toContain('Estimated shipping');
    expect(root?.querySelector('[data-cart-summary-shipping]')?.textContent).toBe('--');
    expect(root?.querySelector('[data-cart-summary-total]')?.textContent).toBe('$36.75');

    postalField.value = '80205';
    postalField.dispatchEvent(new Event('input', { bubbles: true }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${WORKER_BASE}/shipping/quote`,
        expect.objectContaining({ method: 'POST', cache: 'no-store' })
      );
    });

    await vi.waitFor(() => {
      const shippingRow = root?.querySelector('[data-cart-summary-shipping-row]');
      expect(shippingRow).toBeTruthy();
      expect(root?.querySelector('[data-cart-summary-tax]')?.textContent).toBe('$2.76');
      expect(root?.querySelector('[data-cart-summary-total]')?.textContent).toBe('$49.31');
      const shippingOption = root?.querySelector('[data-cart-custom-shipping-option]') as HTMLSelectElement | null;
      expect(shippingOption).toBeTruthy();
      expect(shippingOption?.value).toBe('standard');
      expect(Array.from(shippingOption?.options || []).some((option) => option.textContent?.includes('Signature required'))).toBe(true);
    });

    const shippingOption = root?.querySelector('[data-cart-custom-shipping-option]') as HTMLSelectElement | null;
    if (!shippingOption) throw new Error('Missing cart shipping option selector');
    shippingOption.value = 'signature_required';
    shippingOption.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(root?.querySelector('[data-cart-summary-total]')?.textContent).toBe('$53.26');
    });
  });

  it('hides the ZIP estimate field when every physical campaign shipment has an explicit flat-rate override', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      workerBase: WORKER_BASE,
      shipping: {
        countries: SHIPPING_COUNTRIES
      }
    };

    const fetchMock = vi.fn(async () => {
      throw new Error('shipping quote should not be called for override-only carts');
    });
    vi.stubGlobal('fetch', fetchMock);

    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'smoke-editable__limited-poster',
      name: 'SMOKE EDITABLE — Limited Poster',
      price: 25,
      quantity: 1,
      url: '/campaigns/smoke-editable/',
      shippable: false,
      campaignShippingFallbackCents: 1200,
      campaignHasExplicitShippingOverride: true,
      customFields: [
        { name: '_category', value: 'physical' }
      ]
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    expect(root?.querySelector('[data-cart-estimate-postal]')).toBeNull();
    expect(root?.querySelector('[data-cart-summary-shipping-label]')?.textContent || '').toContain('Shipping');
    expect(root?.querySelector('[data-cart-summary-shipping]')?.textContent).toBe('$12.00');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the ZIP estimate field when any physical campaign shipment still needs a quote', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      workerBase: WORKER_BASE,
      shipping: {
        countries: SHIPPING_COUNTRIES
      }
    };

    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'smoke-editable__limited-poster',
      name: 'SMOKE EDITABLE — Limited Poster',
      price: 25,
      quantity: 1,
      url: '/campaigns/smoke-editable/',
      shippable: false,
      campaignShippingFallbackCents: 1200,
      campaignHasExplicitShippingOverride: true,
      customFields: [
        { name: '_category', value: 'physical' }
      ]
    });
    await readyApi.api.cart.items.add({
      id: 'sunder__physical-media',
      name: 'sunder — physical media',
      price: 35,
      quantity: 1,
      url: '/campaigns/sunder/',
      shippable: false,
      customFields: [
        { name: '_category', value: 'physical' }
      ]
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    expect(root?.querySelector('[data-cart-estimate-postal]')).toBeTruthy();
    expect(root?.querySelector('[data-cart-summary-shipping-label]')?.textContent || '').toContain('Estimated shipping');
    expect(root?.querySelector('[data-cart-summary-shipping]')?.textContent).toBe('--');
  });

  it('hides the ZIP estimate field when the only physical item uses a manual flat domestic rate', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      workerBase: WORKER_BASE,
      shipping: {
        countries: SHIPPING_COUNTRIES
      }
    };

    const fetchMock = vi.fn(async () => {
      throw new Error('shipping quote should not be called for manual-flat-only carts');
    });
    vi.stubGlobal('fetch', fetchMock);

    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'smoke-editable__signed-script',
      name: 'Signed Script',
      price: 25,
      quantity: 1,
      url: '/campaigns/smoke-editable/',
      shippable: false,
      shipping: {
        manual_domestic_rate: 'FIRST_CLASS_FLAT',
        weight_oz: 7,
        packaging_weight_oz: 1,
        length_in: 11.5,
        width_in: 8.5,
        height_in: 0.5,
        stack_height_in: 0.1
      },
      customFields: [
        { name: '_category', value: 'physical' }
      ]
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    expect(root?.querySelector('[data-cart-estimate-postal]')).toBeNull();
    expect(root?.querySelector('[data-cart-summary-shipping-label]')?.textContent || '').toContain('Shipping');
    expect(root?.querySelector('[data-cart-summary-shipping]')?.textContent).toBe('$3.56');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps hosted checkout in estimate mode until a ZIP is entered for physical carts without an override', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'hosted',
      workerBase: WORKER_BASE,
      shipping: {
        countries: SHIPPING_COUNTRIES
      }
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === `${WORKER_BASE}/shipping/quote`) {
        return new Response(JSON.stringify({
          totalShippingCents: 980,
          quotes: [{
            source: 'usps_live',
            shippingCents: 980,
            selectedOption: 'standard',
            defaultOption: 'standard',
            availableOptions: [
              { id: 'standard', shippingCents: 980, priceDeltaCents: 0 },
              { id: 'signature_required', shippingCents: 1375, priceDeltaCents: 395 }
            ],
            shipment: { hasPhysical: true }
          }]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'sunder__physical-media',
      name: 'sunder — physical media',
      price: 35,
      quantity: 1,
      url: '/campaigns/sunder/',
      shippable: false,
      customFields: [
        { name: '_category', value: 'physical' }
      ]
    });

    await readyApi.api.theme.cart.open();
    await readyApi.api.theme.cart.navigate('/checkout');

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    await vi.waitFor(() => {
      expect(root?.textContent || '').toContain('Estimated total');
      expect(root?.querySelector('[data-cart-checkout-summary-tax]')?.textContent).toBe('--');
      expect(root?.querySelector('[data-cart-checkout-summary-shipping-label]')?.textContent || '').toContain('Estimated shipping');
      expect(root?.querySelector('[data-cart-checkout-summary-shipping]')?.textContent).toBe('--');
      expect(root?.querySelector('[data-cart-checkout-summary-total]')?.textContent).toBe('$36.75');
    });
  });

  it('preserves campaign shipping override metadata across persisted cart reloads', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      workerBase: WORKER_BASE,
      addOns: ADD_ON_CONFIG
    };

    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    let provider = (window as any).PoolCartProvider;
    let readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'smoke-editable__standard-pass',
      name: 'SMOKE EDITABLE — Standard Pass',
      price: 10,
      quantity: 1,
      url: '/campaigns/smoke-editable/',
      shippable: false,
      campaignShippingFallbackCents: 1200
    });
    await readyApi.api.cart.items.add({
      id: 'addon__smoke-editable__first-time-sexpot-poster',
      name: 'First Time Sexpot Poster',
      price: 35,
      quantity: 1,
      url: '/campaigns/smoke-editable/',
      shippable: true,
      customFields: [
        { name: '_category', value: 'physical' },
        { name: '_addon_scope', value: 'campaign' },
        { name: '_addon_campaign_slug', value: 'smoke-editable' },
        { name: '_addon_campaign_title', value: 'SMOKE EDITABLE' }
      ]
    });
    await readyApi.api.cart.items.add({
      id: 'sunder__some-goodies',
      name: 'sunder — some goodies',
      price: 20,
      quantity: 1,
      url: '/campaigns/sunder/',
      shippable: false,
      customFields: [
        { name: '_category', value: 'digital' }
      ]
    });

    const persisted = JSON.parse(localStorage.getItem('pool_first_party_cart_state') || '{}');
    expect(persisted.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'smoke-editable__standard-pass',
        campaignShippingFallbackCents: 1200
      })
    ]));

    vi.resetModules();
    delete (window as any).PoolCartProvider;
    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    provider = (window as any).PoolCartProvider;
    readyApi = await provider.whenReady();
    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    await vi.waitFor(() => {
      const shippingLabel = root?.querySelector('[data-cart-summary-shipping-label]');
      const shippingAmount = root?.querySelector('[data-cart-summary-shipping]');
      expect(shippingLabel?.textContent || '').toContain('Shipping');
      expect(shippingAmount?.textContent).toBe('$12.00');
    });
  });

  it('uses the campaign shipping override for campaign add-ons in mixed carts', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      checkoutUiMode: 'custom',
      workerBase: WORKER_BASE,
      shipping: {
        fallback_flat_rate: 3
      },
      addOns: ADD_ON_CONFIG
    };

    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL) => {
      throw new Error('No shipping quote expected before address completion');
    }));
    (window as any).PoolStripeCheckoutSidecar = {
      mount: vi.fn(async () => ({
        supportsLinkAuthenticationElement: false,
        supportsShippingAddressElement: false,
        updateEmail: vi.fn(async () => ({})),
        updateShippingAddress: vi.fn(async () => ({})),
        confirm: vi.fn(async () => ({ type: 'success' })),
        unmount: vi.fn()
      })),
      ensureStripeJs: vi.fn(async () => (window as any).Stripe)
    };
    (window as any).Stripe = vi.fn();
    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'hand-relations__frame-slot',
      name: 'Hand Relations Digital Tier',
      price: 10,
      quantity: 1,
      url: '/campaigns/hand-relations/',
      shippable: false
    });
    await readyApi.api.cart.items.add({
      id: 'smoke-editable__standard-pass',
      name: 'SMOKE EDITABLE — Standard Pass',
      price: 10,
      quantity: 1,
      url: '/campaigns/smoke-editable/',
      shippable: false,
      campaignShippingFallbackCents: 1200
    });
    await readyApi.api.cart.items.add({
      id: 'addon__smoke-editable__first-time-sexpot-poster',
      name: 'First Time Sexpot Poster',
      price: 35,
      quantity: 1,
      url: '/campaigns/smoke-editable/',
      shippable: true,
      customFields: [
        { name: '_category', value: 'physical' },
        { name: '_addon_scope', value: 'campaign' },
        { name: '_addon_campaign_slug', value: 'smoke-editable' },
        { name: '_addon_campaign_title', value: 'SMOKE EDITABLE' }
      ]
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    await vi.waitFor(() => {
      const shippingLabel = root?.querySelector('[data-cart-summary-shipping-label]');
      const shippingAmount = root?.querySelector('[data-cart-summary-shipping]');
      expect(shippingLabel?.textContent || '').toContain('Shipping');
      expect(shippingAmount?.textContent).toBe('$12.00');
    });
  });

  it('keeps the sidecar in estimate mode for mixed carts after cross-page persistence when one shipment still needs a quote', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      workerBase: WORKER_BASE,
      addOns: ADD_ON_CONFIG
    };

    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    let provider = (window as any).PoolCartProvider;
    let readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'smoke-editable__standard-pass',
      name: 'SMOKE EDITABLE — Standard Pass',
      price: 10,
      quantity: 1,
      url: '/campaigns/smoke-editable/',
      shippable: false,
      campaignShippingFallbackCents: 1200
    });
    await readyApi.api.cart.items.add({
      id: 'addon__smoke-editable__first-time-sexpot-poster',
      name: 'First Time Sexpot Poster',
      price: 35,
      quantity: 1,
      url: '/campaigns/smoke-editable/',
      shippable: true,
      customFields: [
        { name: '_category', value: 'physical' },
        { name: '_addon_scope', value: 'campaign' },
        { name: '_addon_campaign_slug', value: 'smoke-editable' },
        { name: '_addon_campaign_title', value: 'SMOKE EDITABLE' }
      ]
    });
    await readyApi.api.cart.items.add({
      id: 'sunder__physical-media',
      name: 'sunder — physical media',
      price: 35,
      quantity: 1,
      url: '/campaigns/sunder/',
      shippable: false,
      customFields: [
        { name: '_category', value: 'physical' }
      ]
    });

    vi.resetModules();
    delete (window as any).PoolCartProvider;
    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    provider = (window as any).PoolCartProvider;
    readyApi = await provider.whenReady();
    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    await vi.waitFor(() => {
      const shippingLabel = root?.querySelector('[data-cart-summary-shipping-label]');
      const shippingAmount = root?.querySelector('[data-cart-summary-shipping]');
      expect(root?.querySelector('[data-cart-estimate-postal]')).toBeTruthy();
      expect(shippingLabel?.textContent || '').toContain('Estimated shipping');
      expect(shippingAmount?.textContent).toBe('--');
    });
  });

  it('adds fallback shipping across multiple physical campaigns when both provide overrides', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      workerBase: WORKER_BASE
    };

    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'smoke-editable__physical-zine',
      name: 'SMOKE EDITABLE — Physical Zine',
      price: 15,
      quantity: 1,
      url: '/campaigns/smoke-editable/',
      shippable: true,
      campaignShippingFallbackCents: 1200
    });
    await readyApi.api.cart.items.add({
      id: 'sunder__physical-media',
      name: 'sunder — physical media',
      price: 20,
      quantity: 1,
      url: '/campaigns/sunder/',
      shippable: true,
      campaignShippingFallbackCents: 800
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    expect(root?.textContent).toContain('Shipping');
    expect(root?.textContent).toContain('$20.00');
  });

  it('hides Qty 1 for non-stackable single items in cart and checkout views', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      workerBase: WORKER_BASE
    };

    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'sunder__physical-media',
      name: 'sunder — physical media',
      price: 35,
      quantity: 1,
      stackable: false,
      url: '/campaigns/sunder/',
      shippable: true
    });

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    expect(root?.textContent).not.toContain('Qty 1');

    readyApi.api.theme.cart.navigate('/checkout');

    await vi.waitFor(() => {
      expect(root?.textContent).toContain('sunder — physical media');
    });
    expect(root?.textContent).not.toContain('Qty 1');
  });

  it('restores a saved first-party checkout from the cancelled result page', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      workerBase: WORKER_BASE
    };

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url !== `${WORKER_BASE}/checkout-intent/recovery?campaignSlug=demo`) {
        throw new Error(`Unexpected fetch: ${url}`);
      }

      return new Response(JSON.stringify({
        campaignSlug: 'demo',
        campaignTitle: 'Demo Campaign',
        effectiveState: 'live',
        acceptingPledges: true,
        statusMessage: 'Demo Campaign is still accepting pledges.'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }));

    window.history.replaceState({}, '', '/pledge-cancelled/');
    localStorage.setItem('pool_first_party_checkout_snapshot', JSON.stringify({
      cart: {
        email: 'supporter@example.com',
        tipPercent: 6,
        items: [
          {
            id: 'demo__featured-tier',
            name: 'Demo Featured Tier',
            price: 25,
            quantity: 2,
            url: 'http://127.0.0.1:4000/campaigns/demo/',
            description: 'Featured support tier',
            stackable: false,
            shippable: false,
            maxQuantity: 1
          }
        ]
      },
      campaignUrl: 'http://127.0.0.1:4000/campaigns/demo/',
      savedAt: Date.now()
    }));

    document.body.innerHTML = `
      <main class="pledge-result">
        <h1>Checkout Cancelled</h1>
        <p>You cancelled the checkout process.</p>
        <a href="/" class="btn">Back to Campaigns</a>
      </main>
      <div data-pool-cart-root="true" hidden></div>
    `;

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    await vi.waitFor(() => {
      expect(provider.store.getState()).toMatchObject({
        customer: {
          email: 'supporter@example.com'
        },
        cart: {
          email: 'supporter@example.com',
          tipPercent: 6,
          items: {
            count: 1
          }
        }
      });
    });

    const recoveryCard = document.querySelector('[data-first-party-recovery]') as HTMLElement | null;
    expect(recoveryCard?.textContent).toContain('Your saved pledge is still here.');
    await vi.waitFor(() => {
      expect(recoveryCard?.textContent).toContain('Campaign: Demo Campaign');
    });
    expect(recoveryCard?.textContent).toContain('Demo Campaign is still accepting pledges.');

    const campaignLink = recoveryCard?.querySelector('a') as HTMLAnchorElement | null;
    expect(campaignLink?.getAttribute('href')).toBe('/campaigns/demo/');

    const resumeButton = recoveryCard?.querySelector('[data-resume-first-party-pledge]') as HTMLButtonElement | null;
    if (!resumeButton) throw new Error('Missing resume saved pledge button');
    resumeButton.click();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    await vi.waitFor(() => {
      expect(root?.textContent).toContain('Checkout');
    });
    expect(root?.textContent).toContain('Demo Featured Tier');
  });

  it('rehydrates the saved checkout snapshot into cart state on normal pages', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      workerBase: WORKER_BASE
    };

    window.history.replaceState({}, '', '/campaigns/demo/');
    localStorage.setItem('pool_first_party_checkout_snapshot', JSON.stringify({
      cart: {
        email: 'supporter@example.com',
        tipPercent: 6,
        items: [
          {
            id: 'demo__featured-tier',
            name: 'Demo Featured Tier',
            price: 25,
            quantity: 2,
            url: '/campaigns/demo/',
            description: 'Featured support tier',
            stackable: false,
            shippable: false,
            maxQuantity: 1
          }
        ]
      },
      campaignUrl: '/campaigns/demo/',
      savedAt: Date.now()
    }));

    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    await vi.waitFor(() => {
      expect(provider.store.getState()).toMatchObject({
        customer: {
          email: 'supporter@example.com'
        },
        cart: {
          email: 'supporter@example.com',
          tipPercent: 6,
          items: {
            count: 1
          }
        }
      });
    });
  });

  it('does not render a saved first-party pledge summary on the success page and clears the snapshot', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      workerBase: WORKER_BASE
    };

    vi.stubGlobal('fetch', vi.fn());

    window.history.replaceState({}, '', '/pledge-success/?orderId=pool-intent-demo123');
    localStorage.setItem('pool_first_party_checkout_snapshot', JSON.stringify({
      cart: {
        email: 'supporter@example.com',
        tipPercent: 6,
        items: [
          {
            id: 'demo__featured-tier',
            name: 'Demo Featured Tier',
            price: 25,
            quantity: 2,
            url: '/campaigns/demo/'
          },
          {
            id: 'demo__support__travel',
            name: 'Travel Support',
            price: 10,
            quantity: 1,
            url: '/campaigns/demo/'
          }
        ]
      },
      campaignUrl: '/campaigns/demo/',
      savedAt: Date.now()
    }));
    localStorage.setItem('pool_stats_demo', JSON.stringify({
      data: { pledgedAmount: 8500 },
      timestamp: Date.now()
    }));
    localStorage.setItem('pool_inventory_demo', JSON.stringify({
      data: { tiers: { featured: { remaining: 1 } } },
      timestamp: Date.now()
    }));
    localStorage.setItem('pool_first_party_cart_state', JSON.stringify({
      token: 'poolcart_test',
      tipPercent: 6,
      items: [
        {
          id: 'demo__featured-tier',
          uniqueId: 'poolitem_test_1',
          name: 'Demo Featured Tier',
          price: 25,
          quantity: 1,
          url: '/campaigns/demo/'
        }
      ]
    }));
    sessionStorage.setItem('pool_first_party_cart_draft', JSON.stringify({
      email: 'supporter@example.com',
      billingAddress: { name: 'Supporter Example' },
      customer: { email: 'supporter@example.com' },
      savedAt: Date.now()
    }));
    sessionStorage.setItem('pool_pending_pledge', JSON.stringify({
      value: 'true',
      savedAt: Date.now()
    }));
    sessionStorage.setItem('pool_active_custom_checkout_order_id', JSON.stringify({
      value: 'pool-intent-demo123',
      savedAt: Date.now()
    }));

    document.body.innerHTML = `
      <main class="pledge-result">
        <h1>Your Pledge is Saved!</h1>
        <p>Your payment method has been securely saved.</p>
        <a href="/" class="btn">Back to Campaigns</a>
      </main>
      <div data-pool-cart-root="true" hidden></div>
    `;

    await import('../../assets/js/cart-provider.js');

    const summaryCard = document.querySelector('[data-first-party-success-summary]') as HTMLElement | null;
    expect(summaryCard).toBeNull();
    expect(localStorage.getItem('pool_first_party_checkout_snapshot')).toBeNull();
    expect(localStorage.getItem('pool_first_party_cart_state')).toBeNull();
    expect(localStorage.getItem('pool_stats_demo')).toBeNull();
    expect(localStorage.getItem('pool_inventory_demo')).toBeNull();
    expect(sessionStorage.getItem('pool_first_party_cart_draft')).toBeNull();
    expect(sessionStorage.getItem('pool_pending_pledge')).toBeNull();
    expect(sessionStorage.getItem('pool_active_custom_checkout_order_id')).toBeNull();
  });

  it('does not render a saved first-party pledge summary for physical pledges on the success page', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      workerBase: WORKER_BASE
    };

    vi.stubGlobal('fetch', vi.fn());

    window.history.replaceState({}, '', '/pledge-success/?orderId=pool-intent-physical123');
    localStorage.setItem('pool_first_party_checkout_snapshot', JSON.stringify({
      cart: {
        email: 'supporter@example.com',
        tipPercent: 5,
        items: [
          {
            id: 'demo__vinyl-tier',
            name: 'Vinyl Tier',
            price: 45,
            quantity: 1,
            url: '/campaigns/demo/',
            shippable: true
          }
        ]
      },
      campaignUrl: '/campaigns/demo/',
      savedAt: Date.now()
    }));

    document.body.innerHTML = `
      <main class="pledge-result">
        <h1>Your Pledge is Saved!</h1>
        <p>Your payment method has been securely saved.</p>
        <a href="/" class="btn">Back to Campaigns</a>
      </main>
      <div data-pool-cart-root="true" hidden></div>
    `;

    await import('../../assets/js/cart-provider.js');

    const summaryCard = document.querySelector('[data-first-party-success-summary]') as HTMLElement | null;
    expect(summaryCard).toBeNull();
    expect(localStorage.getItem('pool_first_party_checkout_snapshot')).toBeNull();
  });
});
