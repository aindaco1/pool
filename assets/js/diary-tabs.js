(function() {
  'use strict';

  var tabs = document.querySelectorAll('.diary-tab');
  var panels = document.querySelectorAll('.diary-panel');
  if (!tabs.length || !panels.length) return;

  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      var targetId = 'diary-' + this.dataset.tab;

      tabs.forEach(function(currentTab) {
        currentTab.setAttribute('aria-selected', 'false');
      });
      panels.forEach(function(panel) {
        panel.classList.add('hidden');
      });

      this.setAttribute('aria-selected', 'true');
      var targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.remove('hidden');
      }
    });
  });
})();
