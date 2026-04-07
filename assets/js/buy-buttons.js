document.addEventListener('DOMContentLoaded', () => {
  const addButtons = document.querySelectorAll('.poolcart-add-item');
  const getCartProvider = () => window.PoolCartProvider || null;

  addButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      if (button.disabled) {
        e.preventDefault();
        console.log('Button is disabled (campaign not live)');
        return;
      }
      console.log('Adding item to cart:', button.dataset.itemName);
    });
  });

  getCartProvider()?.onReady?.((cartApi) => {
    cartApi?.events?.on('item.added', (item) => {
      console.log('Item added to cart:', item);
    });
  });
});
