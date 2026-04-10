(function() {
  'use strict';

  var script = document.currentScript || document.querySelector('script[data-pool-config-script]');
  if (!script) return;

  var dataset = script.dataset || {};
  var currentLang = dataset.currentLang || 'en';
  var platformName = dataset.platformName || 'The Pool';
  var platformCompanyName = dataset.platformCompanyName || platformName;
  var supportEmail = dataset.platformSupportEmail || '';
  var siteUrl = dataset.siteUrl || '';
  var workerBase = dataset.workerBase || '';
  var defaultCreatorName = dataset.defaultCreatorName || platformCompanyName;
  var salesTaxRate = dataset.salesTaxRate || '0.07875';
  var flatShippingRate = dataset.flatShippingRate || '3.00';
  var defaultTipPercent = dataset.defaultTipPercent || '5';
  var maxTipPercent = dataset.maxTipPercent || '15';
  var liveStatsCacheTtlSeconds = dataset.liveStatsCacheTtlSeconds || '300';
  var liveInventoryCacheTtlSeconds = dataset.liveInventoryCacheTtlSeconds || '300';
  var cartRuntime = 'first_party';
  var checkoutProvider = 'first_party';
  var checkoutUiMode = 'custom';
  var stripePublishableKey = dataset.stripePublishableKey || '';
  var runtimeMessages = {};

  if (dataset.runtimeMessages) {
    try {
      runtimeMessages = JSON.parse(dataset.runtimeMessages);
    } catch (_error) {
      runtimeMessages = {};
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
    siteUrl: siteUrl,
    workerBase: workerBase,
    platformName: platformName,
    platformCompanyName: platformCompanyName,
    supportEmail: supportEmail,
    defaultCreatorName: defaultCreatorName,
    salesTaxRate: salesTaxRate,
    flatShippingRate: flatShippingRate,
    defaultTipPercent: defaultTipPercent,
    maxTipPercent: maxTipPercent,
    liveStatsCacheTtlSeconds: liveStatsCacheTtlSeconds,
    liveInventoryCacheTtlSeconds: liveInventoryCacheTtlSeconds,
    cartRuntime: cartRuntime,
    checkoutProvider: checkoutProvider,
    checkoutUiMode: checkoutUiMode,
    stripePublishableKey: stripePublishableKey
  };
})();
