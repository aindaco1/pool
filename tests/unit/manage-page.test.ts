import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WORKER_BASE = 'https://worker.test';

function renderManagePage() {
  document.body.innerHTML = `
    <div id="pledge-loading"></div>
    <div id="pledge-error" hidden></div>
    <p id="pledge-error-message"></p>
    <div id="pledges-list" hidden></div>
    <div id="confirm-modal" hidden>
      <div class="modal__backdrop"></div>
      <div id="confirm-modal-message"></div>
      <div id="confirm-modal-details"></div>
      <button id="confirm-modal-cancel"></button>
      <button id="confirm-modal-confirm"></button>
    </div>
    <script
      data-manage-page-script="true"
      data-worker-base="${WORKER_BASE}"
      data-platform-name="The Pool"></script>
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
  paymentStartStatus?: number;
  modifyStatus?: number;
  cancelStatus?: number;
}) {
  const {
    campaigns = [baseCampaign],
    pledges = [basePledge],
    paymentStartUrl = window.location.href,
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
      return jsonResponse({ url: paymentStartUrl }, paymentStartStatus);
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
    mockManageFetch();
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/campaigns.json');
    expect(global.fetch).toHaveBeenCalledWith(`${WORKER_BASE}/pledges?token=token-123`);
    expect(global.fetch).toHaveBeenCalledWith(`${WORKER_BASE}/inventory/hand-relations`);
    expect(global.fetch).toHaveBeenCalledWith(`${WORKER_BASE}/stats/hand-relations`);
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
  });

  it('posts a pledge modify request after confirmation', async () => {
    const fetchMock = mockManageFetch();
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    const tipSlider = getInput('#tip-percent-0');
    tipSlider.value = '5';
    tipSlider.dispatchEvent(new Event('input', { bubbles: true }));

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
