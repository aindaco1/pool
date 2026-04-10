(function() {
  'use strict';

  var toggle = document.getElementById('menu-toggle');
  var nav = document.getElementById('mobile-nav');
  if (!toggle || !nav) return;
  var openLabel = toggle.getAttribute('data-open-label') || 'Open menu';
  var closeLabel = toggle.getAttribute('data-close-label') || 'Close menu';
  var langLinks = document.querySelectorAll('[data-lang-switcher-link="true"]');

  if (langLinks.length > 0 && (window.location.search || window.location.hash)) {
    langLinks.forEach(function(link) {
      if (!(link instanceof HTMLAnchorElement)) return;
      var rawHref = link.getAttribute('href') || '';
      if (!rawHref || rawHref.indexOf('?') !== -1 || rawHref.indexOf('#') !== -1) return;
      link.setAttribute('href', rawHref + window.location.search + window.location.hash);
    });
  }

  function closeMenu() {
    nav.classList.remove('is-open');
    toggle.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', openLabel);
  }

  toggle.addEventListener('click', function() {
    var isOpen = nav.classList.toggle('is-open');
    toggle.classList.toggle('is-open', isOpen);
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    toggle.setAttribute('aria-label', isOpen ? closeLabel : openLabel);
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
