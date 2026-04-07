(function() {
  'use strict';

  var input = document.getElementById('custom-amount-input');
  var btn = document.getElementById('custom-amount-btn');
  if (!input || !btn) return;

  function updatePrice() {
    var val = parseInt(input.value, 10);
    if (val && val > 0) {
      btn.setAttribute('data-item-price', String(val));
    }
  }

  input.addEventListener('input', updatePrice);
  input.addEventListener('change', updatePrice);
})();
