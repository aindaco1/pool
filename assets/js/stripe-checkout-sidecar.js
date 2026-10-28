(function() {
  'use strict';

  const STRIPE_JS_URL = 'https://js.stripe.com/clover/stripe.js';


  function readThemeVar(name, fallback) {
    try {
      const computed = window.getComputedStyle(document.documentElement).getPropertyValue(name);
      const normalized = String(computed || '').trim();
      return normalized || fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function buildStripeAppearance() {
    const radiusMd = readThemeVar('--pool-radius-md', '10px');
    const colorPrimary = readThemeVar('--pool-color-primary', '#101215');
    const colorPrimaryHover = readThemeVar('--pool-color-primary-hover', colorPrimary);
    const colorText = readThemeVar('--pool-ink-default', '#252930');
    const colorTextStrong = readThemeVar('--pool-ink-strong', '#101215');
    const colorTextMuted = readThemeVar('--pool-ink-muted', '#5d6573');
    const colorTextSoft = readThemeVar('--pool-ink-soft', '#7b8494');
    const colorSurfaceBase = readThemeVar('--pool-surface-base', '#ffffff');
    const colorSurfaceSubtle = readThemeVar('--pool-surface-subtle', '#f0f1ed');
    const colorSurfacePage = readThemeVar('--pool-surface-page', '#f5f5f2');
    const colorBorder = readThemeVar('--pool-border-default', '#d2d7df');
    const colorBorderStrong = readThemeVar('--pool-border-strong', '#9ea7b5');
    const fontFamily = readThemeVar('--pool-font-body', 'Inter, sans-serif');

    return {
      theme: 'flat',
      labels: 'floating',
      variables: {
        colorPrimary: colorPrimary,
        colorText: colorText,
        colorTextSecondary: colorTextMuted,
        colorDanger: '#9f1239',
        colorBackground: colorSurfaceSubtle,
        borderRadius: radiusMd,
        spacingUnit: '4px',
        fontFamily: fontFamily,
        fontSizeBase: '16px',
        fontWeightNormal: '400'
      },
      rules: {
        '.Block': {
          backgroundColor: colorSurfaceBase,
          border: '1px solid ' + colorBorder,
          boxShadow: 'none',
          borderRadius: radiusMd
        },
        '.Input': {
          backgroundColor: colorSurfaceBase,
          border: '1px solid ' + colorBorder,
          boxShadow: 'none',
          color: colorText,
          fontSize: 'var(--fontSizeBase)',
          fontWeight: '400',
          lineHeight: '1.4',
          padding: '10px 12px'
        },
        '.Input::placeholder': {
          color: colorTextMuted
        },
        '.Input:focus': {
          borderColor: colorPrimary,
          boxShadow: '0 0 0 1px ' + colorPrimary
        },
        '.Label': {
          fontWeight: '700',
          color: colorTextStrong,
          fontSize: '12px'
        },
        '.Tab': {
          backgroundColor: colorSurfaceBase,
          border: '1px solid ' + colorBorder,
          boxShadow: 'none',
          borderRadius: radiusMd,
          padding: '12px 14px'
        },
        '.Tab:hover': {
          borderColor: colorBorderStrong
        },
        '.Tab--selected': {
          backgroundColor: colorSurfacePage,
          border: '2px solid ' + colorPrimary,
          boxShadow: 'none'
        },
        '.TabLabel': {
          color: colorTextSoft,
          fontWeight: '500',
          fontSize: '13px'
        },
        '.TabLabel--selected': {
          color: colorPrimaryHover,
          fontWeight: '700'
        },
        '.TabIcon': {
          color: colorTextSoft,
          fill: colorTextSoft
        },
        '.TabIcon--selected': {
          color: colorPrimaryHover,
          fill: colorPrimaryHover
        }
      }
    };
  }

  function isMountableContainer(value) {
    return value instanceof HTMLElement;
  }

  const ensureStripeJs = globalThis.DustWaveScriptLoader.createScriptLoader({
    document: document, src: STRIPE_JS_URL,
    selector: 'script[data-pool-stripe-js="true"]',
    mark: script => { script.dataset.poolStripeJs = 'true'; },
    getValue: () => typeof window.Stripe === 'function' ? window.Stripe : null,
    missingValueError: 'Stripe.js loaded without exposing Stripe.',
    loadError: 'Failed to load Stripe.js.'
  });

  const loadStripeInstance = globalThis.DustWaveScriptLoader.createInstanceLoader({
    load: ensureStripeJs, create: (Stripe, key, options) => Stripe(key, options)
  });

  function stripeConfig({ publishableKey, locale } = {}) {
    return {
      publishableKey: String(publishableKey || ''),
      locale: String(locale || document.documentElement.lang || 'en').trim().toLowerCase() || 'en'
    };
  }

  async function prepareStripe(options) {
    const { publishableKey, locale } = stripeConfig(options);
    if (!publishableKey) throw new Error('Missing Stripe publishable key.');
    return loadStripeInstance(publishableKey, { locale });
  }

  const checkoutPreparations = new Map();

  function checkoutPreparation(options) {
    const config = stripeConfig(options);
    const key = JSON.stringify(config);
    if (!checkoutPreparations.has(key)) {
      let provideSecret;
      // Stripe accepts a future secret. This warms its Checkout SDK without
      // requesting a server session or mounting speculative payment fields.
      const clientSecret = new Promise(resolve => { provideSecret = resolve; });
      const ready = prepareStripe(config).then(async stripe => {
        if (typeof stripe?.initCheckout !== 'function') throw new Error('Stripe custom checkout is unavailable.');
        const checkout = await stripe.initCheckout({ clientSecret,
          elementsOptions: { syncAddressCheckbox: 'shipping', appearance: buildStripeAppearance() }
        });
        return { stripe, checkout };
      });
      const preparation = { key, ready, provideSecret };
      checkoutPreparations.set(key, preparation);
      ready.catch(() => {
        if (checkoutPreparations.get(key) === preparation) checkoutPreparations.delete(key);
      });
    }
    return checkoutPreparations.get(key);
  }

  function prepareCheckout(options) {
    return checkoutPreparation(options).ready.then(() => undefined);
  }

  async function mountCustomCheckout(options) {
    const publishableKey = String(options?.publishableKey || '');
    const clientSecret = String(options?.clientSecret || '');
    const paymentContainer = options?.paymentContainer;
    const linkAuthenticationContainer = options?.linkAuthenticationContainer;
    const shippingContainer = options?.shippingContainer;
    const useShippingAddressElement = options?.useShippingAddressElement === true;
    const locale = String(options?.locale || document.documentElement.lang || 'en').trim().toLowerCase();

    if (!publishableKey) {
      throw new Error('Missing Stripe publishable key.');
    }

    if (!clientSecret) {
      throw new Error('Missing Stripe client secret.');
    }

    if (!isMountableContainer(paymentContainer)) {
      throw new Error('Missing Payment Element container.');
    }

    const preparation = checkoutPreparation({ publishableKey, locale });
    checkoutPreparations.delete(preparation.key);
    preparation.provideSecret(clientSecret);
    const { stripe, checkout } = await preparation.ready;
    if (!checkout || typeof checkout.loadActions !== 'function') {
      throw new Error('Stripe custom checkout did not initialize correctly.');
    }

    // Mount immediately so Stripe can download/render the fields while session
    // actions load. Confirmation still waits for actions and the ready event.
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
    if (typeof paymentElement.on === 'function' && typeof options?.onReady === 'function') paymentElement.on('ready', options.onReady);
    if (typeof paymentElement.on === 'function' && typeof options?.onLoadError === 'function') paymentElement.on('loaderror', options.onLoadError);
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

    function unmountElements() {
      for (const element of [paymentElement, linkAuthenticationElement, shippingAddressElement]) {
        if (typeof element?.unmount === 'function') element.unmount();
      }
    }

    let loadActionsResult;
    try {
      loadActionsResult = await checkout.loadActions();
      if (loadActionsResult?.type !== 'success' || !loadActionsResult.actions) {
        throw new Error(loadActionsResult?.error?.message || 'Stripe checkout actions failed to load.');
      }
    } catch (error) {
      try { unmountElements(); } catch (_error) {}
      throw error;
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
        // Stripe locks emails supplied at session creation, including saved customers.
        // Read the current session so an unchanged address never becomes an update.
        const session = typeof loadActionsResult.actions.getSession === 'function'
          ? loadActionsResult.actions.getSession()
          : null;
        if (email && session?.email === email) {
          return Promise.resolve({});
        }
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
      unmount: unmountElements
    };
  }

  window.PoolStripeCheckoutSidecar = {
    ensureStripeJs,
    prepareStripe,
    prepareCheckout,
    mount: mountCustomCheckout
  };
})();
