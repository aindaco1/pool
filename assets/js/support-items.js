(function() {
  'use strict';

  var inputs = document.querySelectorAll('.support-item__input');
  inputs.forEach(function(input) {
    var supportItem = input.closest('.support-item');
    if (!supportItem) return;

    var button = supportItem.querySelector('.support-item__btn');
    if (!button) return;

    function updatePrice() {
      var val = parseInt(input.value, 10);
      if (val && val > 0) {
        button.setAttribute('data-item-price', String(val));
      }
    }

    input.addEventListener('input', updatePrice);
    input.addEventListener('change', updatePrice);
  });
})();
