(function() {
  'use strict';

  try {
    Object.keys(localStorage).forEach(function(key) {
      if (key.startsWith('pool_stats_') || key.startsWith('pool_inventory_') || key === 'pool_add_on_inventory') {
        localStorage.removeItem(key);
      }
    });
  } catch (_error) {}
})();
