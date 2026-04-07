(function() {
  'use strict';

  var script = document.currentScript || document.querySelector('script[data-pool-config-script]');
  if (!script) return;

  var dataset = script.dataset || {};
  window.POOL_CONFIG = {
    workerBase: dataset.workerBase || '',
    platformName: dataset.platformName || 'The Pool',
    salesTaxRate: dataset.salesTaxRate || '0.07875',
    flatShippingRate: dataset.flatShippingRate || '3.00',
    cartRuntime: dataset.cartRuntime || 'first_party',
    checkoutProvider: dataset.checkoutProvider || 'first_party'
  };
})();
