(function() {
  'use strict';

  var tabs = document.querySelectorAll('.diary-tab');
  var panels = document.querySelectorAll('.diary-panel');
  if (!tabs.length || !panels.length) return;

  function tabForPanel(panelId) {
    return Array.prototype.find.call(tabs, function(tab) {
      return tab.getAttribute('aria-controls') === panelId;
    }) || null;
  }

  function hashTarget() {
    var hash = window.location.hash ? window.location.hash.slice(1) : '';
    if (!hash) return null;
    try {
      hash = decodeURIComponent(hash);
    } catch (_error) {
    }
    var target = document.getElementById(hash);
    return target instanceof HTMLElement ? target : null;
  }

  function activateTab(nextTab, shouldFocus) {
    if (!nextTab) return;
    var targetId = nextTab.getAttribute('aria-controls') || ('diary-' + nextTab.dataset.tab);

    tabs.forEach(function(currentTab) {
      var isSelected = currentTab === nextTab;
      currentTab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      currentTab.setAttribute('tabindex', isSelected ? '0' : '-1');
    });

    panels.forEach(function(panel) {
      var isTarget = panel.id === targetId;
      panel.classList.toggle('hidden', !isTarget);
      panel.hidden = !isTarget;
    });

    if (shouldFocus) {
      nextTab.focus();
    }
  }

  function scrollToHashTarget(target) {
    if (!target || typeof target.scrollIntoView !== 'function') return;
    var schedule = window.requestAnimationFrame || function(callback) {
      return window.setTimeout(callback, 0);
    };
    schedule(function() {
      target.scrollIntoView({ block: 'start' });
    });
  }

  function activateHashTarget(shouldScroll) {
    var target = hashTarget();
    if (!target) return false;

    var panel = target.classList.contains('diary-panel')
      ? target
      : target.classList.contains('diary-tab')
        ? document.getElementById(target.getAttribute('aria-controls') || '')
        : null;
    if (!(panel instanceof HTMLElement)) return false;

    var tab = tabForPanel(panel.id);
    if (!tab) return false;

    activateTab(tab, false);

    if (shouldScroll) {
      scrollToHashTarget(target);
      if (document.readyState !== 'complete') {
        window.addEventListener('load', function() {
          if (hashTarget() === target) scrollToHashTarget(target);
        }, { once: true });
      }
    }

    return true;
  }

  function moveTabFocus(currentTab, direction) {
    var currentIndex = Array.prototype.indexOf.call(tabs, currentTab);
    if (currentIndex === -1) return;
    var nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
    activateTab(tabs[nextIndex], true);
  }

  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      activateTab(this, false);
    });

    tab.addEventListener('keydown', function(event) {
      switch (event.key) {
        case 'ArrowRight':
        case 'Right':
          event.preventDefault();
          moveTabFocus(this, 1);
          break;
        case 'ArrowLeft':
        case 'Left':
          event.preventDefault();
          moveTabFocus(this, -1);
          break;
        case 'Home':
          event.preventDefault();
          activateTab(tabs[0], true);
          break;
        case 'End':
          event.preventDefault();
          activateTab(tabs[tabs.length - 1], true);
          break;
        default:
          break;
      }
    });
  });

  activateHashTarget(true);
  window.addEventListener('hashchange', function() {
    activateHashTarget(true);
  });
})();
