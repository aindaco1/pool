import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WORKER_BASE = 'https://worker.test';

describe('cart provider shim', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    window.location.hash = '';
    document.body.innerHTML = '<div data-pool-cart-root="true"></div>';

    Object.assign(window, {
      POOL_CONFIG: {
        cartRuntime: 'first_party',
        checkoutProvider: 'first_party',
        workerBase: WORKER_BASE
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    window.location.hash = '';
    window.history.replaceState({}, '', '/');
    delete (window as any).POOL_CONFIG;
    delete (window as any).PoolCartProvider;
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
        total: 13.55,
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
        total: 16.93,
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
        total: 15.8,
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
        total: 30.48,
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
      cartRuntime: 'first_party'
    };

    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

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

    await readyApi.api.theme.cart.open();

    const root = document.querySelector('[data-pool-cart-root]') as HTMLElement | null;
    expect(root?.hidden).toBe(false);
    expect(root?.querySelector('.pool-first-party-cart__panel')).toBeTruthy();
    expect(root?.textContent).toContain('Drawer Item');
    expect(root?.textContent).toContain('$18.00');
    expect(root?.textContent).toContain('Pledge total');
    expect(root?.textContent).toContain('Tip The Pool for platform maintenance.');
    expect(root?.textContent).toContain('Sales tax (7.875%)');
    expect(root?.textContent).toContain('Pledge total');
    const cartTipSlider = root?.querySelector('[data-cart-tip]') as HTMLInputElement | null;
    expect(cartTipSlider).toBeTruthy();
    expect((root?.querySelector('.pool-first-party-cart__close') as HTMLButtonElement | null)?.textContent).toBe('X');

    if (!cartTipSlider) throw new Error('Missing cart tip slider');
    cartTipSlider.value = '6';
    cartTipSlider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cartTipSlider.isConnected).toBe(true);
    expect(root?.textContent).toContain('The Pool tip (6%)');

    cartTipSlider.value = '7';
    cartTipSlider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cartTipSlider.isConnected).toBe(true);
    expect(root?.textContent).toContain('The Pool tip (7%)');
    cartTipSlider.dispatchEvent(new Event('change', { bubbles: true }));

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

    const closeButton = root?.querySelector('[data-cart-close]') as HTMLButtonElement | null;
    if (!closeButton) throw new Error('Missing close button');
    closeButton.click();

    expect(root?.innerHTML).toBe('');
    expect(root?.getAttribute('aria-hidden')).toBe('true');
  });

  it('starts first-party checkout from the drawer preview when enabled', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
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
      expect(localStorage.getItem('pool_pending_pledge')).toBe('true');
    });

    expect(provider.store.getState()).toMatchObject({
      cart: {
        tipPercent: 6
      }
    });
    expect(root?.querySelector('[data-cart-tip]')).toBeNull();
    expect(root?.querySelector('[data-cart-email]')).toBeNull();
    expect(root?.textContent).toContain('Pledge total');
    expect(root?.textContent).toContain('The Pool tip (6%)');
    expect(root?.textContent).toContain('Sales tax (7.875%)');
    expect(root?.textContent).toContain('Shipping');
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
      tipPercent: 6
    });
    expect(localStorage.getItem('pool_pending_pledge')).toBe('true');
    expect(window.location.hash).toBe('#stripe-checkout');
  });

  it('surfaces first-party checkout start errors in the drawer preview', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
      workerBase: WORKER_BASE
    };

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'Campaign not accepting pledges'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })));

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
      expect(root?.textContent).toContain('Campaign not accepting pledges');
    });
    expect(window.location.hash).not.toBe('#stripe-checkout');
  });

  it('submits mixed-campaign checkout payloads to the Worker', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party',
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
      tipPercent: 5
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
    expect(root?.textContent).toContain('Shipping');
    expect(root?.textContent).toContain('$6.00');
    expect(root?.textContent).toContain('Pledge total');
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
