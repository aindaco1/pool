function initBuyButtons() {
  if (window.__PoolBuyButtonsLoaded) return;
  window.__PoolBuyButtonsLoaded = true;

  const addButtons = document.querySelectorAll('.poolcart-add-item');
  const getCartProvider = () => window.PoolCartProvider || null;
  const logger = window.PoolLogger?.createLogger('buy-buttons') || {
    debug() {},
    info() {},
    warn() {},
    error() {}
  };

  addButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      if (button.disabled) {
        e.preventDefault();
        logger.debug('Button is disabled (campaign not live)');
        return;
      }
      logger.debug('Adding item to cart:', button.dataset.itemName);
    });
  });

  getCartProvider()?.onReady?.((cartApi) => {
    cartApi?.events?.on('item.added', (item) => {
      logger.debug('Item added to cart:', item);
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBuyButtons, { once: true });
} else {
  initBuyButtons();
}
