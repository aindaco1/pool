import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WORKER_BASE = 'https://worker.test';

async function expectNoAxeViolations(container: Element) {
  vi.useRealTimers();
  const axeModule = await import('axe-core');
  const axe = (axeModule as any).default || axeModule;
  try {
    const results = await axe.run(container, {
      rules: {
        'color-contrast': { enabled: false },
        region: { enabled: false }
      }
    });

    expect(results.violations, results.violations.map((violation: any) => `${violation.id}: ${violation.help}`).join('\n')).toEqual([]);
  } finally {
    vi.useFakeTimers();
  }
}

function renderManagePage() {
  document.body.innerHTML = `
    <a href="#main-content" class="skip-link">Skip to main content</a>
    <header></header>
    <main id="main-content">
      <div id="pledge-loading"></div>
      <div id="pledge-error" hidden></div>
      <p id="pledge-error-message"></p>
      <div id="pledges-list" hidden></div>
      <div id="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" aria-describedby="confirm-modal-message confirm-modal-details" hidden>
        <div class="modal__backdrop"></div>
        <h3 id="confirm-modal-title">Confirm Changes</h3>
        <div id="confirm-modal-message"></div>
        <div id="confirm-modal-details"></div>
        <button id="confirm-modal-cancel">Cancel</button>
        <button id="confirm-modal-confirm">Confirm</button>
      </div>
      <div id="payment-update-modal" role="dialog" aria-modal="true" aria-labelledby="payment-update-title" aria-describedby="payment-update-consent payment-update-error" hidden>
        <div class="modal__backdrop" data-payment-update-close></div>
        <h3 id="payment-update-title">Update Card</h3>
        <label for="payment-update-email">Email address *</label>
        <input id="payment-update-email" aria-describedby="payment-update-email-error">
        <p id="payment-update-email-error" hidden></p>
        <div id="payment-update-payment"></div>
        <p id="payment-update-consent">By providing your card information, you allow The Pool to charge your card if the campaign(s) you backed reaches its goal before its end date.</p>
        <p id="payment-update-error" hidden></p>
        <button id="payment-update-cancel" data-payment-update-close>Cancel</button>
        <button id="payment-update-confirm" disabled>Save payment method</button>
      </div>
    </main>
    <footer></footer>
    <script
      data-manage-page-script="true"
      data-worker-base="${WORKER_BASE}"
      data-platform-name="The Pool"
      data-live-stats-cache-ttl-seconds="300"
      data-live-inventory-cache-ttl-seconds="300"
      data-checkout-ui-mode="custom"></script>
  `;
}

function mockManageFetch() {
  const campaigns = [{
    slug: 'hand-relations',
    title: 'Hand Relations',
    state: 'live',
    single_tier_only: true,
    goal_amount: 2500,
    pledged_amount: 10,
    goal_deadline: '2026-12-31',
    tiers: [{ id: 'frame-slot', name: 'Buy 1 Frame', price: 10, category: 'digital', stackable: false }],
    support_items: []
  }];
  const pledges = [{
    orderId: 'pool-intent-123',
    email: 'supporter@example.com',
    campaignSlug: 'hand-relations',
    pledgeStatus: 'active',
    subtotal: 1000,
    tax: 79,
    amount: 1079,
    tierId: 'frame-slot',
    tierName: 'Buy 1 Frame',
    tierQty: 1,
    supportItems: [],
    customAmount: 0,
    canModify: true,
    canCancel: true,
    canUpdatePaymentMethod: true,
    deadlinePassed: false,
    tipPercent: 0,
    tipAmount: 0
  }];

  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || 'GET';

    if (url === '/api/campaigns.json') {
      return new Response(JSON.stringify({ campaigns }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === `${WORKER_BASE}/pledges?token=token-123`) {
      return new Response(JSON.stringify(pledges), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === `${WORKER_BASE}/live/hand-relations`) {
      return new Response(JSON.stringify({
        stats: { pledgedAmount: 1000, state: 'live', supportItems: {} },
        inventory: { tiers: { 'frame-slot': { remaining: 10 } } }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === `${WORKER_BASE}/inventory/hand-relations`) {
      return new Response(JSON.stringify({ tiers: { 'frame-slot': { remaining: 10 } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === `${WORKER_BASE}/stats/hand-relations`) {
      return new Response(JSON.stringify({ pledgedAmount: 1000, state: 'live', supportItems: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === `${WORKER_BASE}/pledge/payment-method/start` && method === 'POST') {
      return new Response(JSON.stringify({ url: window.location.href }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    throw new Error(`Unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;
}

describe('critical surface accessibility', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    delete (window as any).PoolStripeCheckoutSidecar;
    delete (window as any).PoolCartProvider;
    delete (window as any).POOL_CONFIG;
  });

  it('has no obvious axe violations in the open cart drawer', async () => {
    (window as any).POOL_CONFIG = {
      cartRuntime: 'first_party'
    };

    document.body.innerHTML = '<div data-pool-cart-root="true" hidden></div>';

    await import('../../assets/js/cart-provider.js');

    const provider = (window as any).PoolCartProvider;
    const readyApi = await provider.whenReady();
    await readyApi.api.cart.items.add({
      id: 'demo__drawer',
      name: 'Drawer Item',
      price: 18,
      quantity: 1,
      url: '/campaigns/demo/'
    });
    await readyApi.api.theme.cart.open();

    const panel = document.querySelector('.pool-first-party-cart__panel');
    expect(panel).toBeTruthy();
    await expectNoAxeViolations(panel as Element);
  });

  it('has no obvious axe violations in the confirm changes modal', async () => {
    renderManagePage();
    mockManageFetch();
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    const tipSlider = document.getElementById('tip-percent-0') as HTMLInputElement | null;
    if (!tipSlider) throw new Error('Missing tip slider');
    tipSlider.value = '5';
    tipSlider.dispatchEvent(new Event('input', { bubbles: true }));

    const saveButton = document.querySelector('[data-action="save"][data-index="0"]') as HTMLButtonElement | null;
    if (!saveButton) throw new Error('Missing save button');
    saveButton.click();

    const modal = document.getElementById('confirm-modal');
    expect(modal?.hidden).toBe(false);
    await expectNoAxeViolations(modal as Element);
  });

  it('has no obvious axe violations in the update card modal shell', async () => {
    renderManagePage();
    mockManageFetch();
    window.history.replaceState({}, '', '/manage/?t=token-123');

    (window as any).PoolStripeCheckoutSidecar = {
      ensureStripeJs: vi.fn(async () => (window as any).Stripe),
      mount: vi.fn(async ({ onChange }) => {
        if (typeof onChange === 'function') {
          onChange({ session: { canConfirm: true } });
        }
        return {
          supportsLinkAuthenticationElement: false,
          supportsShippingAddressElement: false,
          updateEmail: vi.fn(async () => ({})),
          confirm: vi.fn(async () => ({ type: 'success' })),
          unmount: vi.fn()
        };
      })
    };
    (window as any).Stripe = vi.fn();
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || 'GET';

      if (url === '/api/campaigns.json') {
        return new Response(JSON.stringify({
          campaigns: [{
            slug: 'hand-relations',
            title: 'Hand Relations',
            state: 'live',
            single_tier_only: true,
            goal_amount: 2500,
            pledged_amount: 10,
            goal_deadline: '2026-12-31',
            tiers: [{ id: 'frame-slot', name: 'Buy 1 Frame', price: 10, category: 'digital', stackable: false }],
            support_items: []
          }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === `${WORKER_BASE}/pledges?token=token-123`) {
        return new Response(JSON.stringify([{
          orderId: 'pool-intent-123',
          email: 'supporter@example.com',
          campaignSlug: 'hand-relations',
          pledgeStatus: 'active',
          subtotal: 1000,
          tax: 79,
          amount: 1079,
          tierId: 'frame-slot',
          tierName: 'Buy 1 Frame',
          tierQty: 1,
          supportItems: [],
          customAmount: 0,
          canModify: true,
          canCancel: true,
          canUpdatePaymentMethod: true,
          deadlinePassed: false,
          tipPercent: 0,
          tipAmount: 0
        }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === `${WORKER_BASE}/live/hand-relations`) {
        return new Response(JSON.stringify({
          stats: { pledgedAmount: 1000, state: 'live', supportItems: {} },
          inventory: { tiers: { 'frame-slot': { remaining: 10 } } }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === `${WORKER_BASE}/inventory/hand-relations`) {
        return new Response(JSON.stringify({ tiers: { 'frame-slot': { remaining: 10 } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === `${WORKER_BASE}/stats/hand-relations`) {
        return new Response(JSON.stringify({ pledgedAmount: 1000, state: 'live', supportItems: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === `${WORKER_BASE}/pledge/payment-method/start` && method === 'POST') {
        return new Response(JSON.stringify({
          checkoutUiMode: 'custom',
          publishableKey: 'pk_test_custom_123',
          clientSecret: 'seti_test_secret_123'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }) as typeof fetch;

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    const updateButton = document.querySelector('[data-action="payment"][data-index="0"]') as HTMLButtonElement | null;
    if (!updateButton) throw new Error('Missing update card button');
    updateButton.click();

    await vi.waitFor(() => {
      expect(document.getElementById('payment-update-modal')?.hidden).toBe(false);
    });

    const modal = document.getElementById('payment-update-modal');
    expect(modal).toBeTruthy();
    await expectNoAxeViolations(modal as Element);
  });
});
