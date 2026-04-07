(function() {
  'use strict';

  var toggle = document.getElementById('menu-toggle');
  var nav = document.getElementById('mobile-nav');
  if (!toggle || !nav) return;

  function closeMenu() {
    nav.classList.remove('is-open');
    toggle.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
  }

  toggle.addEventListener('click', function() {
    var isOpen = nav.classList.toggle('is-open');
    toggle.classList.toggle('is-open', isOpen);
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
  });

  nav.addEventListener('click', function(event) {
    if (event.target.tagName === 'A') {
      closeMenu();
    }
  });

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) {
      closeMenu();
      toggle.focus();
    }
  });
})();
