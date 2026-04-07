(function() {
  'use strict';

  try {
    Object.keys(localStorage).forEach(function(key) {
      if (key.startsWith('pool_stats_') || key.startsWith('pool_inventory_')) {
        localStorage.removeItem(key);
      }
    });
  } catch (_error) {}
})();
