(function() {
  'use strict';

  const panel = document.querySelector('[data-pledge-confirmation]');
  if (!panel) return;
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('orderId') || '';
  const workerBase = panel.dataset.workerBase;
  const retry = panel.querySelector('[data-pledge-confirmation-retry]');
  const reference = panel.querySelector('[data-pledge-confirmation-reference]');
  reference.textContent = orderId;
  let sessionId = params.get('session_id') || '';
  let checking = false;
  function readStored(key) {
    try {
      const entry = JSON.parse(sessionStorage.getItem(key) || 'null');
      return entry && Date.now() - entry.savedAt < 86400000 ? entry.value : '';
    } catch (_error) { return ''; }
  }
  if (!sessionId) {
    try {
      const pending = JSON.parse(readStored('pool_checkout_confirmation') || 'null');
      if (pending?.orderId === orderId) sessionId = pending.sessionId || '';
    } catch (_error) {}
  }
  if (sessionId && /^pool-intent-[a-zA-Z0-9-]+$/.test(orderId)) {
    try { sessionStorage.setItem('pool_checkout_confirmation', JSON.stringify({ value: JSON.stringify({ orderId, sessionId }), savedAt: Date.now() })); } catch (_error) {}
  }
  if (params.has('session_id')) {
    params.delete('session_id');
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
  }
  function confirmed() {
    panel.hidden = true;
    document.querySelector('[data-pledge-confirmed]').hidden = false;
    try { sessionStorage.removeItem('pool_checkout_confirmation'); } catch (_error) {}
    window.__poolPledgeConfirmedOrderId = orderId;
    window.dispatchEvent(new CustomEvent('pool:pledge-confirmed', { detail: { orderId } }));
    try {
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index) || '';
        if (key.startsWith('pool_stats_') || key.startsWith('pool_inventory_') || key.startsWith('pool_add_on_inventory')) localStorage.removeItem(key);
      }
    } catch (_error) {}
  }
  async function check() {
    if (checking || !/^pool-intent-[a-zA-Z0-9-]+$/.test(orderId) || !workerBase) return;
    checking = true;
    retry.disabled = true;
    try {
      if (readStored('pool_confirmed_pledge') === orderId) { confirmed(); return; }
      const response = await fetch(`${workerBase}/checkout-intent/summary?orderId=${encodeURIComponent(orderId)}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      const summary = response.ok ? await response.json() : null;
      if (summary?.persisted === true) { confirmed(); return; }
      if (sessionId) {
        const completion = await fetch(`${workerBase}/checkout-intent/complete`, {
          method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(8000),
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, sessionId })
        });
        const result = completion.ok ? await completion.json() : null;
        if (result?.persisted === true) { confirmed(); return; }
      }
    } catch (_error) {
      // Keep the explicit unconfirmed state and same-session retry available.
    } finally {
      checking = false;
      retry.disabled = false;
    }
  }
  retry.addEventListener('click', check);
  void check();
})();
