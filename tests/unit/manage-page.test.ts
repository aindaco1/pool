import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WORKER_BASE = 'https://worker.test';

function renderManagePage() {
  document.body.innerHTML = `
    <a href="#main-content" class="skip-link">Skip to main content</a>
    <header></header>
    <main id="main-content">
      <div id="pledge-loading"></div>
      <div id="pledge-error" role="alert" hidden></div>
      <p id="pledge-error-message"></p>
      <div id="pledges-list" hidden></div>
      <div id="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" aria-describedby="confirm-modal-message confirm-modal-details" hidden>
        <div class="modal__backdrop"></div>
        <h3 id="confirm-modal-title">Confirm Changes</h3>
        <div id="confirm-modal-message"></div>
        <div id="confirm-modal-details"></div>
        <button id="confirm-modal-cancel"></button>
        <button id="confirm-modal-confirm"></button>
      </div>
      <div id="payment-update-modal" role="dialog" aria-modal="true" aria-labelledby="payment-update-title" aria-describedby="payment-update-consent payment-update-error" hidden>
        <div class="modal__backdrop" data-payment-update-close></div>
        <h3 id="payment-update-title">Update Card</h3>
        <label for="payment-update-email">Email address *</label>
        <input id="payment-update-email" aria-describedby="payment-update-email-error">
        <p id="payment-update-email-error" hidden></p>
        <div id="payment-update-payment"></div>
        <p id="payment-update-consent">By providing your card information, you allow The Pool to charge your card if the campaign(s) you backed reaches its goal before its end date.</p>
        <p id="payment-update-error" role="alert" hidden></p>
        <button id="payment-update-cancel" data-payment-update-close></button>
        <button id="payment-update-confirm" disabled></button>
      </div>
    </main>
    <footer></footer>
    <script
      data-manage-page-script="true"
      data-worker-base="${WORKER_BASE}"
      data-platform-name="The Pool"
      data-live-stats-cache-ttl-seconds="300"
      data-live-inventory-cache-ttl-seconds="300"
      data-checkout-ui-mode="hosted"></script>
  `;
}

const baseCampaign = {
  slug: 'hand-relations',
  title: 'Hand Relations',
  state: 'live',
  single_tier_only: true,
  goal_amount: 2500,
  pledged_amount: 10,
  goal_deadline: '2026-12-31',
  tiers: [
    {
      id: 'frame-slot',
      name: 'Buy 1 Frame',
      price: 10,
      category: 'digital',
      stackable: false
    }
  ],
  support_items: []
};

const basePledge = {
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
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function mockManageFetch(options?: {
  campaigns?: Array<Record<string, unknown>>;
  pledges?: Array<Record<string, unknown>>;
  paymentStartUrl?: string;
  paymentStartPayload?: Record<string, unknown> | null;
  paymentStartStatus?: number;
  modifyStatus?: number;
  cancelStatus?: number;
}) {
  const {
    campaigns = [baseCampaign],
    pledges = [basePledge],
    paymentStartUrl = window.location.href,
    paymentStartPayload = null,
    paymentStartStatus = 200,
    modifyStatus = 200,
    cancelStatus = 200
  } = options || {};

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || 'GET';

    if (url === '/api/campaigns.json') {
      return jsonResponse({ campaigns });
    }

    if (url === `${WORKER_BASE}/pledges?token=token-123`) {
      return jsonResponse(pledges);
    }

    if (url === `${WORKER_BASE}/live/hand-relations`) {
      return jsonResponse({
        stats: {
          pledgedAmount: 1000,
          state: 'live',
          supportItems: {}
        },
        inventory: {
          tiers: {
            'frame-slot': { remaining: 10 }
          }
        }
      });
    }

    if (url === `${WORKER_BASE}/inventory/hand-relations`) {
      return jsonResponse({
        tiers: {
          'frame-slot': { remaining: 10 }
        }
      });
    }

    if (url === `${WORKER_BASE}/stats/hand-relations`) {
      return jsonResponse({
        pledgedAmount: 1000,
        state: 'live',
        supportItems: {}
      });
    }

    if (url === `${WORKER_BASE}/pledge/payment-method/start` && method === 'POST') {
      return jsonResponse(paymentStartPayload || { url: paymentStartUrl }, paymentStartStatus);
    }

    if (url === `${WORKER_BASE}/pledge/cancel` && method === 'POST') {
      return jsonResponse({ ok: true }, cancelStatus);
    }

    if (url === `${WORKER_BASE}/pledge/modify` && method === 'POST') {
      return jsonResponse({ ok: true }, modifyStatus);
    }

    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });

  global.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

function getButton(selector: string) {
  const button = document.querySelector(selector) as HTMLButtonElement | null;
  if (!button) {
    throw new Error(`Missing button for selector: ${selector}`);
  }
  return button;
}

function getInput(selector: string) {
  const input = document.querySelector(selector) as HTMLInputElement | null;
  if (!input) {
    throw new Error(`Missing input for selector: ${selector}`);
  }
  return input;
}

describe('manage page script', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.clear();
    window.history.replaceState({}, '', '/manage/');
    renderManagePage();
    mockManageFetch({ campaigns: [] });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    const originalConsoleError = console.error;
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      const firstArg = args[0];
      if (typeof firstArg === 'string' && firstArg.includes('Not implemented: navigation')) {
        return;
      }
      originalConsoleError(...args);
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    localStorage.clear();
    delete (window as any).PoolStripeCheckoutSidecar;
  });

  it('shows an error when no pledge token is provided', async () => {
    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledge-loading')?.hidden).toBe(true);
      expect(document.getElementById('pledge-error')?.hidden).toBe(false);
    });

    expect(document.getElementById('pledge-error-message')?.textContent).toBe(
      'No pledge token provided.'
    );
    expect(document.getElementById('pledges-list')?.hidden).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith('/api/campaigns.json');
  });

  it('loads and renders a pledge from the worker token endpoint', async () => {
    const fetchMock = mockManageFetch();
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(`${WORKER_BASE}/live/hand-relations`);
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/campaigns.json');
    expect(global.fetch).toHaveBeenCalledWith(`${WORKER_BASE}/pledges?token=token-123`);
    expect(global.fetch).toHaveBeenCalledWith(`${WORKER_BASE}/live/hand-relations`);
    expect(fetchMock).not.toHaveBeenCalledWith(`${WORKER_BASE}/inventory/hand-relations`);
    expect(fetchMock).not.toHaveBeenCalledWith(`${WORKER_BASE}/stats/hand-relations`);
    expect(document.querySelector('.pledge-card__campaign')?.textContent).toContain('Hand Relations');
    expect(document.querySelector('.pledge-card__status')?.textContent).toContain('active');
    expect(getButton('[data-action="payment"][data-index="0"]').textContent).toContain('Update Card');
    expect(getButton('[data-action="save"][data-index="0"]').disabled).toBe(true);

    const progressFill = document.querySelector('.progress-bar span');
    const goalMarker = document.querySelector('.progress-marker--goal');
    expect(progressFill?.getAttribute('style')).toBeNull();
    expect(progressFill?.className).toContain('u-width-pct-');
    expect(goalMarker?.getAttribute('style')).toBeNull();
    expect(goalMarker?.className).toContain('u-left-pct-');
  });

  it('reuses cached stats and inventory on manage page without refetching them', async () => {
    localStorage.setItem('pool_stats_hand-relations', JSON.stringify({
      data: {
        pledgedAmount: 1000,
        state: 'live',
        supportItems: {}
      },
      timestamp: Date.now()
    }));
    localStorage.setItem('pool_inventory_hand-relations', JSON.stringify({
      data: {
        tiers: {
          'frame-slot': { remaining: 10 }
        }
      },
      timestamp: Date.now()
    }));

    const fetchMock = mockManageFetch();
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/campaigns.json');
    expect(fetchMock).toHaveBeenCalledWith(`${WORKER_BASE}/pledges?token=token-123`);
    expect(fetchMock).not.toHaveBeenCalledWith(`${WORKER_BASE}/inventory/hand-relations`);
    expect(fetchMock).not.toHaveBeenCalledWith(`${WORKER_BASE}/stats/hand-relations`);
    expect(fetchMock).not.toHaveBeenCalledWith(`${WORKER_BASE}/live/hand-relations`);
  });

  it('coalesces uncached live stats and inventory into one combined worker request', async () => {
    const fetchMock = mockManageFetch();
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(`${WORKER_BASE}/live/hand-relations`);
    });

    expect(fetchMock.mock.calls.filter(([url]) => url === `${WORKER_BASE}/live/hand-relations`)).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalledWith(`${WORKER_BASE}/inventory/hand-relations`);
    expect(fetchMock).not.toHaveBeenCalledWith(`${WORKER_BASE}/stats/hand-relations`);
  });

  it('starts the payment-method update flow from an active pledge', async () => {
    const fetchMock = mockManageFetch({
      paymentStartUrl: '#payment-update'
    });
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    getButton('[data-action="payment"][data-index="0"]').click();
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${WORKER_BASE}/pledge/payment-method/start`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: 'token-123' })
        })
      );
    });
  });

  it('opens an in-page custom payment update modal when custom checkout mode is returned', async () => {
    const updateEmail = vi.fn(async () => ({}));
    const confirm = vi.fn(async () => ({ type: 'success' }));
    (window as any).PoolStripeCheckoutSidecar = {
      ensureStripeJs: vi.fn(async () => (window as any).Stripe),
      mount: vi.fn(async ({ onChange }) => {
        if (typeof onChange === 'function') {
          onChange({ session: { canConfirm: true } });
        }

        return {
          supportsShippingAddressElement: false,
          updateEmail,
          confirm,
          unmount: vi.fn()
        };
      })
    };

    const fetchMock = mockManageFetch({
      paymentStartPayload: {
        checkoutUiMode: 'custom',
        sessionId: 'cs_test_update_123',
        clientSecret: 'cs_test_update_secret_123',
        publishableKey: 'pk_test_update_123'
      }
    });
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    getButton('[data-action="payment"][data-index="0"]').click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${WORKER_BASE}/pledge/payment-method/start`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: 'token-123' })
        })
      );
      expect(document.getElementById('payment-update-modal')?.hidden).toBe(false);
      expect(document.body.textContent).toContain('Email address *');
      expect(document.body.textContent).toContain('By providing your card information, you allow The Pool to charge your card if the campaign(s) you backed reaches its goal before its end date.');
    });

    const emailInput = getInput('#payment-update-email');
    expect(emailInput.value).toBe('supporter@example.com');
    emailInput.value = 'updated@example.com';
    emailInput.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(updateEmail).toHaveBeenCalledWith('updated@example.com');
    });

    const confirmButton = getButton('#payment-update-confirm');
    expect(confirmButton.disabled).toBe(false);
    confirmButton.click();

    await vi.waitFor(() => {
      expect(confirm).toHaveBeenCalledTimes(1);
    });

    expect(confirmButton.textContent).toContain('Saved');

    expect(localStorage.getItem('pool_first_party_cart_state')).toBeNull();
  });

  it('opens the payment update modal with dialog semantics and restores focus on escape', async () => {
    (window as any).PoolStripeCheckoutSidecar = {
      ensureStripeJs: vi.fn(async () => (window as any).Stripe),
      mount: vi.fn(async ({ onChange }) => {
        if (typeof onChange === 'function') {
          onChange({ session: { canConfirm: true } });
        }

        return {
          supportsShippingAddressElement: false,
          updateEmail: vi.fn(async () => ({})),
          confirm: vi.fn(async () => ({ type: 'success' })),
          unmount: vi.fn()
        };
      })
    };

    mockManageFetch({
      paymentStartPayload: {
        checkoutUiMode: 'custom',
        sessionId: 'cs_test_update_123',
        clientSecret: 'cs_test_update_secret_123',
        publishableKey: 'pk_test_update_123'
      }
    });
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    const paymentButton = getButton('[data-action="payment"][data-index="0"]');
    paymentButton.focus();
    paymentButton.click();

    await vi.waitFor(() => {
      const modal = document.getElementById('payment-update-modal');
      expect(modal?.hidden).toBe(false);
      expect(modal?.getAttribute('role')).toBe('dialog');
      expect(modal?.getAttribute('aria-modal')).toBe('true');
    });

    expect(document.activeElement).toBe(getInput('#payment-update-email'));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    vi.advanceTimersByTime(0);

    await vi.waitFor(() => {
      expect(document.getElementById('payment-update-modal')?.hidden).toBe(true);
    });
  });

  it('escapes campaign-authored content in pledge cards and confirm modal details', async () => {
    mockManageFetch({
      campaigns: [
        {
          ...baseCampaign,
          title: '<img src=x onerror=alert(1)> Campaign',
          tiers: [
            {
              id: 'frame-slot',
              name: '<svg onload=alert(1)>Tier',
              description: '<img src=x onerror=alert(2)>',
              price: 10,
              category: 'digital',
              stackable: false
            }
          ],
          support_items: [
            {
              id: 'lab',
              label: '<img src=x onerror=alert(3)> Lab',
              need: '<svg onload=alert(4)>',
              current: 0,
              target: 100,
              late_support: false
            }
          ]
        }
      ]
    });
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    expect(document.querySelector('.pledge-card__campaign')?.textContent).toContain('<img src=x onerror=alert(1)> Campaign');
    expect(document.querySelector('.tier-option__desc')?.textContent).toBe('<img src=x onerror=alert(2)>');
    expect(document.querySelector('.support-option-item__desc')?.textContent).toBe('<svg onload=alert(4)>');
    expect(document.querySelector('.pledge-card img[src="x"]')).toBeNull();
    expect(document.querySelector('.pledge-card svg')).toBeNull();

    const supportInput = getInput('input[name="support-amount-0"]');
    supportInput.value = '5';
    supportInput.dispatchEvent(new Event('input', { bubbles: true }));

    await vi.waitFor(() => {
      expect(getButton('[data-action="save"][data-index="0"]').disabled).toBe(false);
    });

    getButton('[data-action="save"][data-index="0"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById('confirm-modal')?.hidden).toBe(false);
      expect(document.getElementById('confirm-modal-details')?.textContent).toContain('<img src=x onerror=alert(3)> Lab');
    });

    expect(document.querySelector('#confirm-modal-details img')).toBeNull();
    expect(document.querySelector('#confirm-modal-details svg')).toBeNull();
  });

  it('escapes stretch goal titles in compact progress rendering', async () => {
    mockManageFetch({
      campaigns: [
        {
          ...baseCampaign,
          stretch_goals: [
            { threshold: 5000, title: '<img src=x onerror=alert(1)>' }
          ],
          stretch_hidden: false
        }
      ]
    });
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
      expect(document.querySelector('.progress-marker--stretch .progress-marker__desc')?.textContent).toBe('<img src=x onerror=alert(1)>');
    });

    expect(document.querySelector('.progress-marker--stretch img')).toBeNull();
  });

  it('cancels a pledge after confirmation', async () => {
    const fetchMock = mockManageFetch();
    window.history.replaceState({}, '', '/manage/?t=token-123');
    localStorage.setItem('pool_stats_hand-relations', JSON.stringify({
      data: { pledgedAmount: 1000 },
      timestamp: Date.now()
    }));
    localStorage.setItem('pool_inventory_hand-relations', JSON.stringify({
      data: { tiers: { 'frame-slot': { remaining: 10 } } },
      timestamp: Date.now()
    }));

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    getButton('[data-action="cancel"][data-index="0"]').click();
    expect(document.getElementById('cancel-section-0')?.hidden).toBe(false);

    getButton('[data-action="cancel-confirm"][data-index="0"]').click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${WORKER_BASE}/pledge/cancel`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: 'token-123', orderId: 'pool-intent-123' })
        })
      );
    });

    await vi.waitFor(() => {
      expect(localStorage.getItem('pool_stats_hand-relations')).toBeNull();
      expect(localStorage.getItem('pool_inventory_hand-relations')).toBeNull();
    });
  });

  it('posts a pledge modify request after confirmation', async () => {
    const fetchMock = mockManageFetch();
    window.history.replaceState({}, '', '/manage/?t=token-123');
    localStorage.setItem('pool_stats_hand-relations', JSON.stringify({
      data: { pledgedAmount: 1000 },
      timestamp: Date.now()
    }));
    localStorage.setItem('pool_inventory_hand-relations', JSON.stringify({
      data: { tiers: { 'frame-slot': { remaining: 10 } } },
      timestamp: Date.now()
    }));

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    const tipSlider = getInput('#tip-percent-0');
    expect(tipSlider.getAttribute('aria-labelledby')).toBe('tip-heading-0');
    expect(tipSlider.getAttribute('aria-describedby')).toBe('tip-copy-0 tip-percent-label-0');
    expect(tipSlider.getAttribute('aria-valuetext')).toBe('0% tip, $0.00');
    tipSlider.value = '5';
    tipSlider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(tipSlider.getAttribute('aria-valuetext')).toBe('5% tip, $0.50');

    const saveButton = getButton('[data-action="save"][data-index="0"]');
    expect(saveButton.disabled).toBe(false);
    expect(saveButton.textContent).toBe('Save Changes');

    saveButton.click();
    expect(document.getElementById('confirm-modal')?.hidden).toBe(false);

    getButton('#confirm-modal-confirm').click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${WORKER_BASE}/pledge/modify`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: 'token-123',
            orderId: 'pool-intent-123',
            newTierId: 'frame-slot',
            newTierQty: 1,
            addTiers: null,
            supportItems: null,
            customAmount: null,
            tipPercent: 5
          })
        })
      );
    });

    await vi.waitFor(() => {
      expect(saveButton.textContent).toBe('Saved!');
    });

    await vi.waitFor(() => {
      expect(localStorage.getItem('pool_stats_hand-relations')).toBeNull();
      expect(localStorage.getItem('pool_inventory_hand-relations')).toBeNull();
    });
  });

  it('opens the confirm modal with dialog semantics and restores focus on escape', async () => {
    mockManageFetch();
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    const tipSlider = getInput('#tip-percent-0');
    tipSlider.value = '5';
    tipSlider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(tipSlider.getAttribute('aria-valuetext')).toBe('5% tip, $0.50');

    const saveButton = getButton('[data-action="save"][data-index="0"]');
    saveButton.focus();
    saveButton.click();

    await vi.waitFor(() => {
      const modal = document.getElementById('confirm-modal');
      expect(modal?.hidden).toBe(false);
      expect(modal?.getAttribute('role')).toBe('dialog');
      expect(modal?.getAttribute('aria-modal')).toBe('true');
    });

    expect(document.activeElement).toBe(getButton('#confirm-modal-cancel'));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    vi.advanceTimersByTime(0);

    await vi.waitFor(() => {
      expect(document.getElementById('confirm-modal')?.hidden).toBe(true);
    });
  });

  it('starts payment recovery for a payment-failed pledge', async () => {
    const fetchMock = mockManageFetch({
      pledges: [
        {
          ...basePledge,
          orderId: 'pool-intent-failed',
          pledgeStatus: 'payment_failed',
          canModify: false,
          canCancel: false,
          deadlinePassed: true,
          lastPaymentError: 'Card declined.'
        }
      ],
      paymentStartUrl: '#retry-payment'
    });
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    getButton('.pledge-card__payment-failed [data-action="payment"]').click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${WORKER_BASE}/pledge/payment-method/start`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: 'token-123' })
        })
      );
    });
  });
});
