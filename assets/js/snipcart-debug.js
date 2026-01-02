document.addEventListener('snipcart.ready', () => {
  console.log('Snipcart version:', Snipcart.api?.version || Snipcart.version);
  
  // Log cart state
  Snipcart.events.on('cart.opened', () => {
    console.log('Cart opened');
    const state = Snipcart.store.getState();
    console.log('Cart state:', state.cart);
    console.log('Cart items:', state.cart.items);
    
    // Log custom fields for each item
    state.cart.items.forEach((item, i) => {
      console.log(`Item ${i} (${item.name}):`, {
        customFields: item.customFields,
        hasRequiredFields: item.customFields?.some(f => f.required),
        allFieldsFilled: item.customFields?.every(f => !f.required || f.value)
      });
    });
  });
  
  Snipcart.events.on('item.adding', (item) => {
    console.log('Adding item:', item);
    console.log('Custom fields:', item.customFields);
  });
  
  Snipcart.events.on('item.added', (item) => {
    console.log('Item added successfully:', item);
    console.log('Item custom fields after add:', item.customFields);
  });
  
  Snipcart.events.on('cart.confirmed', (response) => {
    console.log('Cart confirmed:', response);
  });
  
  // Log validation errors
  Snipcart.events.on('cart.confirm.error', (error) => {
    console.error('Cart confirm error:', error);
  });
  
  // Log when user tries to proceed
  Snipcart.events.on('order.started', (order) => {
    console.log('Order started:', order);
  });
});
