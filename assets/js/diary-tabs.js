(function() {
  'use strict';

  var tabs = document.querySelectorAll('.diary-tab');
  var panels = document.querySelectorAll('.diary-panel');
  if (!tabs.length || !panels.length) return;

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
})();
