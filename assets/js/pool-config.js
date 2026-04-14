(function() {
  'use strict';

  var script = document.currentScript || document.querySelector('script[data-pool-config-script]');
  if (!script) return;

  var dataset = script.dataset || {};
  var currentLang = dataset.currentLang || 'en';
  var platformName = dataset.platformName || 'The Pool';
  var platformCompanyName = dataset.platformCompanyName || platformName;
  var platformAuthor = dataset.platformAuthor || platformCompanyName;
  var supportEmail = dataset.platformSupportEmail || '';
  var siteUrl = dataset.siteUrl || '';
  var workerBase = dataset.workerBase || '';
  var defaultCreatorName = dataset.defaultCreatorName || platformCompanyName;
  var salesTaxRate = dataset.salesTaxRate || '0.07875';
  var flatShippingRate = dataset.flatShippingRate || '3.00';
  var shippingOriginZip = dataset.shippingOriginZip || '';
  var shippingOriginCountry = dataset.shippingOriginCountry || 'US';
  var shippingFallbackFlatRate = dataset.shippingFallbackFlatRate || '3.00';
  var shippingFreeShippingDefault = dataset.shippingFreeShippingDefault || 'false';
  var shippingCountries = [];
  var defaultTipPercent = dataset.defaultTipPercent || '5';
  var maxTipPercent = dataset.maxTipPercent || '15';
  var liveStatsCacheTtlSeconds = dataset.liveStatsCacheTtlSeconds || '300';
  var liveInventoryCacheTtlSeconds = dataset.liveInventoryCacheTtlSeconds || '300';
  var cartRuntime = 'first_party';
  var checkoutProvider = 'first_party';
  var checkoutUiMode = 'custom';
  var stripePublishableKey = dataset.stripePublishableKey || '';
  var seoXHandle = dataset.seoXHandle || '';
  var seoIndexPublicCommunityHub = dataset.seoIndexPublicCommunityHub || 'true';
  var debugConsoleLoggingEnabled = dataset.debugConsoleLoggingEnabled || 'true';
  var debugVerboseConsoleLogging = dataset.debugVerboseConsoleLogging || 'true';
  var runtimeMessages = {};
  var shippingPresets = {};
  var addOns = {};

  if (dataset.runtimeMessages) {
    try {
      runtimeMessages = JSON.parse(dataset.runtimeMessages);
    } catch (_error) {
      runtimeMessages = {};
    }
  }

  if (dataset.shippingPresets) {
    try {
      shippingPresets = JSON.parse(dataset.shippingPresets);
    } catch (_error) {
      shippingPresets = {};
    }
  }

  if (dataset.addOns) {
    try {
      addOns = JSON.parse(dataset.addOns);
    } catch (_error) {
      addOns = {};
    }
  }

  if (dataset.shippingCountries) {
    try {
      shippingCountries = JSON.parse(dataset.shippingCountries);
    } catch (_error) {
      shippingCountries = [];
    }
  }

  window.POOL_CONFIG = {
    i18n: {
      currentLang: currentLang,
      messages: runtimeMessages
    },
    platform: {
      name: platformName,
      companyName: platformCompanyName,
      author: platformAuthor,
      supportEmail: supportEmail,
      siteUrl: siteUrl,
      workerUrl: workerBase,
      defaultCreatorName: defaultCreatorName
    },
    pricing: {
      salesTaxRate: salesTaxRate,
      flatShippingRate: flatShippingRate,
      defaultTipPercent: defaultTipPercent,
      maxTipPercent: maxTipPercent
    },
    shipping: {
      originZip: shippingOriginZip,
      originCountry: shippingOriginCountry,
      fallbackFlatRate: shippingFallbackFlatRate,
      freeShippingDefault: shippingFreeShippingDefault,
      countries: shippingCountries,
      presets: shippingPresets
    },
    addOns: addOns,
    cache: {
      liveStatsTtlSeconds: liveStatsCacheTtlSeconds,
      liveInventoryTtlSeconds: liveInventoryCacheTtlSeconds
    },
    checkout: {
      cartRuntime: cartRuntime,
      provider: checkoutProvider,
      uiMode: checkoutUiMode,
      stripePublishableKey: stripePublishableKey
    },
    seo: {
      xHandle: seoXHandle,
      indexPublicCommunityHub: seoIndexPublicCommunityHub
    },
    debug: {
      consoleLoggingEnabled: debugConsoleLoggingEnabled,
      verboseConsoleLogging: debugVerboseConsoleLogging
    },
    siteUrl: siteUrl,
    workerBase: workerBase,
    platformName: platformName,
    platformCompanyName: platformCompanyName,
    platformAuthor: platformAuthor,
    supportEmail: supportEmail,
    defaultCreatorName: defaultCreatorName,
    salesTaxRate: salesTaxRate,
    flatShippingRate: flatShippingRate,
    shippingOriginZip: shippingOriginZip,
    shippingOriginCountry: shippingOriginCountry,
    shippingFallbackFlatRate: shippingFallbackFlatRate,
    shippingFreeShippingDefault: shippingFreeShippingDefault,
    shippingCountries: shippingCountries,
    defaultTipPercent: defaultTipPercent,
    maxTipPercent: maxTipPercent,
    liveStatsCacheTtlSeconds: liveStatsCacheTtlSeconds,
    liveInventoryCacheTtlSeconds: liveInventoryCacheTtlSeconds,
    cartRuntime: cartRuntime,
    checkoutProvider: checkoutProvider,
    checkoutUiMode: checkoutUiMode,
    stripePublishableKey: stripePublishableKey,
    seoXHandle: seoXHandle,
    seoIndexPublicCommunityHub: seoIndexPublicCommunityHub,
    debugConsoleLoggingEnabled: debugConsoleLoggingEnabled,
    debugVerboseConsoleLogging: debugVerboseConsoleLogging
  };
})();
