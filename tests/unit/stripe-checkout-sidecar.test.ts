import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('stripe checkout sidecar helper', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
    delete (window as any).PoolStripeCheckoutSidecar;
    delete (window as any).Stripe;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    delete (window as any).PoolStripeCheckoutSidecar;
    delete (window as any).Stripe;
  });

  it('mounts a payment element and optional shipping address element from Stripe custom checkout', async () => {
    const paymentMount = vi.fn();
    const paymentUnmount = vi.fn();
    const linkMount = vi.fn();
    const linkUnmount = vi.fn();
    const shippingMount = vi.fn();
    const shippingUnmount = vi.fn();
    const paymentElement = {
      mount: paymentMount,
      unmount: paymentUnmount
    };
    const linkElement = {
      mount: linkMount,
      unmount: linkUnmount,
      on: vi.fn()
    };
    const shippingElement = {
      mount: shippingMount,
      unmount: shippingUnmount
    };
    const actions = {
      getSession: vi.fn(() => ({ id: 'cs_test_123' })),
      updateEmail: vi.fn(async () => ({})),
      updateShippingAddress: vi.fn(async () => ({})),
      confirm: vi.fn(async () => ({ type: 'success' }))
    };
    const checkout = {
      loadActions: vi.fn(async () => ({ type: 'success', actions })),
      createPaymentElement: vi.fn(() => paymentElement),
      createLinkAuthenticationElement: vi.fn(() => linkElement),
      createShippingAddressElement: vi.fn(() => shippingElement),
      on: vi.fn((eventName, handler) => {
        if (eventName === 'change') {
          handler({ session: { canConfirm: true } });
        }
      })
    };
    const stripeInstance = {
      initCheckout: vi.fn(async () => checkout)
    };
    (window as any).Stripe = vi.fn(() => stripeInstance);

    await import('../../assets/js/stripe-checkout-sidecar.js');

    const paymentContainer = document.createElement('div');
    const linkContainer = document.createElement('div');
    const shippingContainer = document.createElement('div');
    document.body.append(paymentContainer, linkContainer, shippingContainer);

    const result = await (window as any).PoolStripeCheckoutSidecar.mount({
      publishableKey: 'pk_test_123',
      clientSecret: 'cs_test_secret_123',
      paymentContainer,
      linkAuthenticationContainer: linkContainer,
      shippingContainer,
      useShippingAddressElement: true,
      allowedCountries: ['US', 'CA', 'JP'],
      defaultCountry: 'US',
      onLinkChange: vi.fn(),
      onChange: vi.fn()
    });

    expect((window as any).Stripe).toHaveBeenCalledWith('pk_test_123');
    expect(stripeInstance.initCheckout).toHaveBeenCalledWith({
      clientSecret: 'cs_test_secret_123',
      elementsOptions: {
        syncAddressCheckbox: 'shipping',
        appearance: {
          theme: 'flat',
          labels: 'floating',
          variables: {
            colorPrimary: '#0f2742',
            colorText: '#111111',
            colorTextSecondary: '#6b7280',
            colorDanger: '#9f1239',
            colorBackground: '#f8faff',
            borderRadius: '10px',
            spacingUnit: '4px',
            fontFamily: 'Inter, sans-serif',
            fontSizeBase: '13px',
            fontWeightNormal: '400'
          },
          rules: {
            '.Block': {
              backgroundColor: '#ffffff',
              border: '1px solid #d7d6d3',
              boxShadow: 'none',
              borderRadius: '10px'
            },
            '.Input': {
              backgroundColor: '#ffffff',
              border: '1px solid #d7d6d3',
              boxShadow: 'none',
              color: '#111111',
              fontSize: '13px',
              fontWeight: '400',
              lineHeight: '1.4',
              padding: '10px 12px'
            },
            '.Input::placeholder': {
              color: '#6b7280'
            },
            '.Input:focus': {
              borderColor: '#0f2742',
              boxShadow: '0 0 0 1px #0f2742'
            },
            '.Label': {
              fontWeight: '700',
              color: '#111111',
              fontSize: '12px'
            },
            '.Tab': {
              backgroundColor: '#ffffff',
              border: '1px solid #d7d6d3',
              boxShadow: 'none',
              borderRadius: '10px',
              padding: '12px 14px'
            },
            '.Tab:hover': {
              borderColor: '#a9b4c2'
            },
            '.Tab--selected': {
              backgroundColor: '#f8fbff',
              border: '2px solid #0f2742',
              boxShadow: 'none'
            },
            '.TabLabel': {
              color: '#7b869a',
              fontWeight: '500',
              fontSize: '13px'
            },
            '.TabLabel--selected': {
              color: '#0f2742',
              fontWeight: '700'
            },
            '.TabIcon': {
              color: '#7b869a',
              fill: '#7b869a'
            },
            '.TabIcon--selected': {
              color: '#0f2742',
              fill: '#0f2742'
            }
          }
        }
      }
    });
    expect(checkout.loadActions).toHaveBeenCalledTimes(1);
    expect(checkout.on).toHaveBeenCalledWith('change', expect.any(Function));
    expect(checkout.createPaymentElement).toHaveBeenCalledWith({
      layout: {
        type: 'tabs'
      },
      paymentMethodOrder: ['card', 'link'],
      fields: {
        billingDetails: {
          name: 'never',
          email: 'never',
          address: 'never'
        }
      }
    });
    expect(paymentMount).toHaveBeenCalledWith(paymentContainer);
    expect(checkout.createLinkAuthenticationElement).toHaveBeenCalledTimes(1);
    expect(linkMount).toHaveBeenCalledWith(linkContainer);
    expect(checkout.createShippingAddressElement).toHaveBeenCalledTimes(1);
    expect(checkout.createShippingAddressElement).toHaveBeenCalledWith({
      allowedCountries: ['US', 'CA', 'JP'],
      defaultValues: {
        address: {
          country: 'US'
        }
      }
    });
    expect(shippingMount).toHaveBeenCalledWith(shippingContainer);
    expect(result.supportsLinkAuthenticationElement).toBe(true);
    expect(result.supportsShippingAddressElement).toBe(true);
    expect(result.session).toEqual({ id: 'cs_test_123' });
    await result.updateEmail('supporter@example.com');
    expect(actions.updateEmail).toHaveBeenCalledWith('supporter@example.com');
    await result.updateShippingAddress({
      name: 'Supporter',
      address: {
        line1: '123 Main',
        city: 'Albuquerque',
        state: 'NM',
        postal_code: '87101',
        country: 'US'
      }
    });
    expect(actions.updateShippingAddress).toHaveBeenCalledWith({
      name: 'Supporter',
      address: {
        line1: '123 Main',
        city: 'Albuquerque',
        state: 'NM',
        postal_code: '87101',
        country: 'US'
      }
    });
    await result.confirm();
    expect(actions.confirm).toHaveBeenCalledWith({ redirect: 'if_required' });

    result.unmount();
    expect(paymentUnmount).toHaveBeenCalledTimes(1);
    expect(linkUnmount).toHaveBeenCalledTimes(1);
    expect(shippingUnmount).toHaveBeenCalledTimes(1);
  });

  it('fails clearly when Stripe custom checkout actions do not load', async () => {
    const checkout = {
      loadActions: vi.fn(async () => ({
        type: 'error',
        error: { message: 'checkout unavailable' }
      })),
      createPaymentElement: vi.fn()
    };
    const stripeInstance = {
      initCheckout: vi.fn(async () => checkout)
    };
    (window as any).Stripe = vi.fn(() => stripeInstance);

    await import('../../assets/js/stripe-checkout-sidecar.js');

    const paymentContainer = document.createElement('div');
    document.body.append(paymentContainer);

    await expect((window as any).PoolStripeCheckoutSidecar.mount({
      publishableKey: 'pk_test_123',
      clientSecret: 'cs_test_secret_123',
      paymentContainer
    })).rejects.toThrow('checkout unavailable');
  });

  it('skips the Stripe shipping address element by default', async () => {
    const paymentElement = {
      mount: vi.fn(),
      unmount: vi.fn()
    };
    const checkout = {
      loadActions: vi.fn(async () => ({
        type: 'success',
        actions: {
          getSession: vi.fn(() => ({ id: 'cs_test_456' })),
          confirm: vi.fn(async () => ({ type: 'success' }))
        }
      })),
      createPaymentElement: vi.fn(() => paymentElement),
      createShippingAddressElement: vi.fn(() => ({
        mount: vi.fn(),
        unmount: vi.fn()
      })),
      on: vi.fn()
    };
    const stripeInstance = {
      initCheckout: vi.fn(async () => checkout)
    };
    (window as any).Stripe = vi.fn(() => stripeInstance);

    await import('../../assets/js/stripe-checkout-sidecar.js');

    const paymentContainer = document.createElement('div');
    const shippingContainer = document.createElement('div');
    document.body.append(paymentContainer, shippingContainer);

    const result = await (window as any).PoolStripeCheckoutSidecar.mount({
      publishableKey: 'pk_test_123',
      clientSecret: 'cs_test_secret_123',
      paymentContainer,
      shippingContainer
    });

    expect(checkout.createShippingAddressElement).not.toHaveBeenCalled();
    expect(result.supportsShippingAddressElement).toBe(false);
  });

  it('loads Stripe.js once when it is not already present', async () => {
    await import('../../assets/js/stripe-checkout-sidecar.js');

    const ensurePromise = (window as any).PoolStripeCheckoutSidecar.ensureStripeJs();
    const injectedScript = document.querySelector('script[data-pool-stripe-js="true"]') as HTMLScriptElement | null;

    expect(injectedScript).toBeTruthy();
    (window as any).Stripe = vi.fn();
    injectedScript?.dispatchEvent(new Event('load'));

    await expect(ensurePromise).resolves.toBe((window as any).Stripe);
  });
});
