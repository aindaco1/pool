(function() {
  'use strict';

  const STRIPE_JS_URL = 'https://js.stripe.com/clover/stripe.js';
  const STRIPE_APPEARANCE = {
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
  };
  let stripeJsPromise = null;

  function isMountableContainer(value) {
    return value instanceof HTMLElement;
  }

  function ensureStripeJs() {
    if (typeof window.Stripe === 'function') {
      return Promise.resolve(window.Stripe);
    }

    if (stripeJsPromise) return stripeJsPromise;

    stripeJsPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[data-pool-stripe-js="true"]');
      const handleLoad = function() {
        if (typeof window.Stripe === 'function') {
          resolve(window.Stripe);
          return;
        }

        stripeJsPromise = null;
        reject(new Error('Stripe.js loaded without exposing Stripe.'));
      };
      const handleError = function() {
        stripeJsPromise = null;
        reject(new Error('Failed to load Stripe.js.'));
      };

      if (existingScript) {
        existingScript.addEventListener('load', handleLoad, { once: true });
        existingScript.addEventListener('error', handleError, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = STRIPE_JS_URL;
      script.async = true;
      script.dataset.poolStripeJs = 'true';
      script.addEventListener('load', handleLoad, { once: true });
      script.addEventListener('error', handleError, { once: true });
      document.head.appendChild(script);
    });

    return stripeJsPromise;
  }

  async function mountCustomCheckout(options) {
    const publishableKey = String(options?.publishableKey || '');
    const clientSecret = String(options?.clientSecret || '');
    const paymentContainer = options?.paymentContainer;
    const linkAuthenticationContainer = options?.linkAuthenticationContainer;
    const shippingContainer = options?.shippingContainer;
    const useShippingAddressElement = options?.useShippingAddressElement === true;

    if (!publishableKey) {
      throw new Error('Missing Stripe publishable key.');
    }

    if (!clientSecret) {
      throw new Error('Missing Stripe client secret.');
    }

    if (!isMountableContainer(paymentContainer)) {
      throw new Error('Missing Payment Element container.');
    }

    await ensureStripeJs();

    const stripe = window.Stripe(publishableKey);
    if (!stripe || typeof stripe.initCheckout !== 'function') {
      throw new Error('Stripe custom checkout is unavailable.');
    }

    const checkout = await stripe.initCheckout({
      clientSecret,
      elementsOptions: {
        syncAddressCheckbox: 'shipping',
        appearance: STRIPE_APPEARANCE
      }
    });
    if (!checkout || typeof checkout.loadActions !== 'function') {
      throw new Error('Stripe custom checkout did not initialize correctly.');
    }

    const loadActionsResult = await checkout.loadActions();
    if (loadActionsResult?.type !== 'success' || !loadActionsResult.actions) {
      throw new Error(loadActionsResult?.error?.message || 'Stripe checkout actions failed to load.');
    }

    paymentContainer.innerHTML = '';
    const paymentElement = checkout.createPaymentElement({
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
    paymentElement.mount(paymentContainer);

    let linkAuthenticationElement = null;
    if (isMountableContainer(linkAuthenticationContainer) && typeof checkout.createLinkAuthenticationElement === 'function') {
      try {
        linkAuthenticationContainer.innerHTML = '';
        linkAuthenticationElement = checkout.createLinkAuthenticationElement();
        if (typeof linkAuthenticationElement?.on === 'function' && typeof options?.onLinkChange === 'function') {
          linkAuthenticationElement.on('change', options.onLinkChange);
        }
        linkAuthenticationElement.mount(linkAuthenticationContainer);
      } catch (_error) {
        linkAuthenticationElement = null;
      }
    }

    let shippingAddressElement = null;
    if (useShippingAddressElement &&
      isMountableContainer(shippingContainer) &&
      typeof checkout.createShippingAddressElement === 'function') {
      try {
        shippingContainer.innerHTML = '';
        const shippingOptions = {};
        if (Array.isArray(options?.allowedCountries) && options.allowedCountries.length > 0) {
          shippingOptions.allowedCountries = options.allowedCountries;
        }
        if (options?.defaultCountry) {
          shippingOptions.defaultValues = {
            address: {
              country: String(options.defaultCountry).toUpperCase()
            }
          };
        }
        shippingAddressElement = checkout.createShippingAddressElement(shippingOptions);
        shippingAddressElement.mount(shippingContainer);
      } catch (_error) {
        shippingAddressElement = null;
      }
    }

    if (typeof checkout.on === 'function' && typeof options?.onChange === 'function') {
      checkout.on('change', options.onChange);
    }

    return {
      stripe,
      checkout,
      actions: loadActionsResult.actions,
      session: typeof loadActionsResult.actions.getSession === 'function'
        ? loadActionsResult.actions.getSession()
        : null,
      supportsLinkAuthenticationElement: Boolean(linkAuthenticationElement),
      supportsShippingAddressElement: Boolean(shippingAddressElement),
      updateEmail: function(email) {
        if (typeof loadActionsResult.actions.updateEmail !== 'function') {
          return Promise.resolve({});
        }
        return loadActionsResult.actions.updateEmail(email);
      },
      updateShippingAddress: function(shippingDetails) {
        if (typeof loadActionsResult.actions.updateShippingAddress !== 'function') {
          return Promise.resolve({});
        }
        return loadActionsResult.actions.updateShippingAddress(shippingDetails);
      },
      confirm: function(params) {
        return loadActionsResult.actions.confirm({
          redirect: 'if_required',
          ...(params || {})
        });
      },
      unmount: function() {
        if (typeof paymentElement?.unmount === 'function') {
          paymentElement.unmount();
        }

        if (typeof linkAuthenticationElement?.unmount === 'function') {
          linkAuthenticationElement.unmount();
        }

        if (typeof shippingAddressElement?.unmount === 'function') {
          shippingAddressElement.unmount();
        }
      }
    };
  }

  window.PoolStripeCheckoutSidecar = {
    ensureStripeJs,
    mount: mountCustomCheckout
  };
})();
