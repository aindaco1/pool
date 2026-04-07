(function() {
  'use strict';

  var btn = document.getElementById('header-cart-btn');
  if (!btn) return;

  var priceEl = btn.querySelector('.site-header__cart-price');
  var countEl = btn.querySelector('.site-header__cart-count');
  var CACHE_KEY = 'pool_cart_cache';
  var providerSubscription = null;
  var providerClickBound = false;

  function formatMoney(amount) {
    return '$' + (amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  }

  function writeCache(total, count) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ total: total || 0, count: count || 0 }));
    } catch (_error) {}
  }

  function renderCartSummary(total, count) {
    if (priceEl) priceEl.textContent = formatMoney(total);
    if (countEl) countEl.textContent = count ? String(count) : '';
    btn.classList.add('is-loaded');
  }

  function getSummaryFromState(state) {
    return {
      total: Number(state?.cart?.total || 0),
      count: Number(state?.cart?.items?.count || 0)
    };
  }

  function updateFromState(state) {
    var summary = getSummaryFromState(state || {});
    renderCartSummary(summary.total, summary.count);
    writeCache(summary.total, summary.count);
  }

  function markLoaded() {
    btn.classList.add('is-loaded');
  }

  function bindProvider(provider) {
    if (!provider) return;
    if (providerSubscription) providerSubscription();
    updateFromState(provider.store?.getState?.());
    providerSubscription = provider.store?.subscribe?.(function(state) {
      updateFromState(state || provider.store?.getState?.());
    }) || null;

    if (provider.activeRuntime === 'first_party' && !providerClickBound) {
      btn.addEventListener('click', function(event) {
        event.preventDefault();
        provider.getApi?.()?.api?.theme?.cart?.open?.();
      });
      providerClickBound = true;
    }
  }

  function maybeBindProvider() {
    var provider = window.PoolCartProvider;
    if (!provider) return;
    bindProvider(provider);
  }

  try {
    var cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (cached && typeof cached.total === 'number') {
      renderCartSummary(cached.total, cached.count);
    }
  } catch (_error) {}

  maybeBindProvider();
  document.addEventListener('poolcart.provider.ready', maybeBindProvider);
  document.addEventListener('poolcart.ready', markLoaded);
})();
