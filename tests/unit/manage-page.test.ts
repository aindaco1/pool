import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WORKER_BASE = 'https://worker.test';
const ADD_ON_CONFIG = {
  enabled: true,
  low_stock_threshold: 5,
  products: [
    {
      id: 'dust-wave-sticker',
      name: 'DUST WAVE Sticker',
      description: '3" x 3" matte laminated circle-cut vinyl sticker.',
      image_url: '/assets/images/add-ons/sticker-glove.png',
      price: 3,
      category: 'physical',
      inventory: 50,
      variants: []
    },
    {
      id: 'hand-relations__first-time-sexpot-poster',
      name: 'First Time Sexpot Poster',
      description: '18” x 24” First Time Sexpot poster.',
      image_url: '/assets/images/campaign-add-ons/sexpot-poster.png',
      price: 35,
      category: 'physical',
      inventory: 10,
      scope: 'campaign',
      campaign_slug: 'hand-relations',
      campaign_title: 'Hand Relations',
      variants: []
    }
  ]
};

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
  support_items: [],
  campaign_add_ons: []
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
  shippingQuotePayload?: Record<string, unknown> | null;
  shippingQuoteStatus?: number;
  addOnsInventory?: Record<string, unknown> | null;
  modifyStatus?: number;
  cancelStatus?: number;
}) {
  const {
    campaigns = [baseCampaign],
    pledges = [basePledge],
    paymentStartUrl = window.location.href,
    paymentStartPayload = null,
    paymentStartStatus = 200,
    shippingQuotePayload = null,
    shippingQuoteStatus = 200,
    addOnsInventory = {
      lowStockThreshold: 5,
      products: {
        'dust-wave-sticker': {
          inventory: 50,
          sold: 0,
          remaining: 50,
          available: true,
          soldOut: false,
          variants: {}
        },
        'hand-relations__first-time-sexpot-poster': {
          inventory: 10,
          sold: 0,
          remaining: 10,
          available: true,
          soldOut: false,
          variants: {}
        }
      }
    },
    modifyStatus = 200,
    cancelStatus = 200
  } = options || {};

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || 'GET';
    const primaryCampaignSlug = String(campaigns[0]?.slug || 'hand-relations');

    if (url === '/api/campaigns.json') {
      return jsonResponse({ campaigns });
    }

    if (url === `${WORKER_BASE}/pledges?token=token-123`) {
      return jsonResponse(pledges);
    }

    if (url === `${WORKER_BASE}/live/${primaryCampaignSlug}`) {
      return jsonResponse({
        stats: {
          pledgedAmount: Number(pledges[0]?.subtotal || 1000),
          state: 'live',
          supportItems: {}
        },
        inventory: {
          tiers: {
            [String(campaigns[0]?.tiers?.[0]?.id || 'frame-slot')]: { remaining: 10 }
          }
        }
      });
    }

    if (url === `${WORKER_BASE}/inventory/${primaryCampaignSlug}`) {
      return jsonResponse({
        tiers: {
          [String(campaigns[0]?.tiers?.[0]?.id || 'frame-slot')]: { remaining: 10 }
        }
      });
    }

    if (url === `${WORKER_BASE}/stats/${primaryCampaignSlug}`) {
      return jsonResponse({
        pledgedAmount: Number(pledges[0]?.subtotal || 1000),
        state: 'live',
        supportItems: {}
      });
    }

    if (url === `${WORKER_BASE}/pledge/payment-method/start` && method === 'POST') {
      return jsonResponse(paymentStartPayload || { url: paymentStartUrl }, paymentStartStatus);
    }

    if (url === `${WORKER_BASE}/shipping/quote` && method === 'POST') {
      return jsonResponse(shippingQuotePayload || { quotes: [], totalShippingCents: 0 }, shippingQuoteStatus);
    }

    if (url === `${WORKER_BASE}/add-ons/inventory`) {
      return jsonResponse(addOnsInventory || {
        lowStockThreshold: 5,
        products: {}
      });
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
    delete (window as any).POOL_CONFIG;
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

  it('uses runtime i18n messages for manage loading and action copy', async () => {
    (window as any).POOL_CONFIG = {
      i18n: {
        currentLang: 'es',
        messages: {
          manage: {
            noPledgeTokenProvided: 'No se proporcionó ningún token de aporte.',
            updateCard: 'Actualizar tarjeta',
            noChanges: 'Sin cambios'
          }
        }
      }
    };
    mockManageFetch();
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    expect(getButton('[data-action="payment"][data-index="0"]').textContent).toContain('Actualizar tarjeta');
    expect(getButton('[data-action="save"][data-index="0"]').textContent).toBe('Sin cambios');
  });

  it('updates physical-pledge shipping preview from the quote endpoint', async () => {
    const physicalCampaign = {
      ...baseCampaign,
      slug: 'sunder',
      title: 'Sunder',
      tiers: [
        {
          id: 'blu-ray',
          name: 'Blu-ray',
          price: 35,
          category: 'physical',
          stackable: false
        }
      ]
    };
    const physicalPledge = {
      ...basePledge,
      campaignSlug: 'sunder',
      subtotal: 3500,
      tax: 276,
      shipping: 300,
      amount: 4076,
      tierId: 'blu-ray',
      tierName: 'Blu-ray',
      shippingAddress: {
        postalCode: '80205',
        country: 'US'
      }
    };

    mockManageFetch({
      campaigns: [physicalCampaign],
      pledges: [physicalPledge],
      shippingQuotePayload: {
        quotes: [
          {
            campaignSlug: 'sunder',
            shippingCents: 675,
            source: 'usps_live',
            carrier: 'usps',
            service: 'usps_ground_advantage',
            domestic: true
          }
        ],
        totalShippingCents: 675,
        shippingAddress: {
          country: 'US',
          postalCode: '80205'
        }
      }
    });
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    const tipInput = getInput('#tip-percent-0');
    tipInput.value = '5';
    tipInput.dispatchEvent(new Event('input', { bubbles: true }));

    await vi.waitFor(() => {
      expect(document.getElementById('shipping-0')?.textContent).toBe('$6.75');
      expect(document.getElementById('amount-0')?.textContent).toBe('$46.26');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      `${WORKER_BASE}/shipping/quote`,
      expect.objectContaining({
        method: 'POST'
      })
    );
  });

  it('keeps shipping rows hidden for pledges with no shipping', async () => {
    mockManageFetch({
      campaigns: [baseCampaign],
      pledges: [basePledge]
    });
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    expect(document.getElementById('shipping-row-0')?.hidden).toBe(true);
    expect(document.getElementById('shipping-option-row-0')?.hidden).toBe(true);
    expect((document.getElementById('shipping-option-0') as HTMLSelectElement | null)?.options.length || 0).toBe(0);
  });

  it('does not show delivery options for fallback shipping quotes', async () => {
    const physicalCampaign = {
      ...baseCampaign,
      slug: 'sunder',
      title: 'Sunder',
      tiers: [
        {
          id: 'blu-ray',
          name: 'Blu-ray',
          price: 35,
          category: 'physical',
          stackable: false
        }
      ]
    };
    const physicalPledge = {
      ...basePledge,
      campaignSlug: 'sunder',
      subtotal: 3500,
      tax: 276,
      shipping: 300,
      amount: 4076,
      tierId: 'blu-ray',
      tierName: 'Blu-ray',
      shippingAddress: {
        postalCode: '80205',
        country: 'US'
      }
    };

    mockManageFetch({
      campaigns: [physicalCampaign],
      pledges: [physicalPledge],
      shippingQuotePayload: {
        quotes: [
          {
            campaignSlug: 'sunder',
            shippingCents: 300,
            source: 'fallback_flat_rate',
            defaultOption: 'standard',
            selectedOption: 'standard',
            availableOptions: [
              {
                id: 'standard',
                shippingCents: 300,
                priceDeltaCents: 0
              },
              {
                id: 'signature_required',
                shippingCents: 695,
                priceDeltaCents: 395
              }
            ]
          }
        ],
        totalShippingCents: 300,
        shippingAddress: {
          country: 'US',
          postalCode: '80205'
        }
      }
    });
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    const tipInput = getInput('#tip-percent-0');
    tipInput.value = '5';
    tipInput.dispatchEvent(new Event('input', { bubbles: true }));

    await vi.waitFor(() => {
      expect(document.getElementById('shipping-row-0')?.hidden).toBe(false);
      expect(document.getElementById('shipping-0')?.textContent).toBe('$3.00');
      expect(document.getElementById('shipping-option-row-0')?.hidden).toBe(true);
      expect((document.getElementById('shipping-option-0') as HTMLSelectElement | null)?.options.length || 0).toBe(0);
    });
  });

  it('persists a selected shipping option for physical support-item changes', async () => {
    const physicalCampaign = {
      ...baseCampaign,
      support_items: [
        {
          id: 'signed-script',
          label: 'Signed Script',
          need: 'physical add-on',
          target: 25,
          current: 0,
          category: 'physical',
          shipping_preset: 'signed_script',
          shipping: {
            weight_oz: 7,
            length_in: 11,
            width_in: 8.5,
            height_in: 0.5
          },
          late_support: true
        }
      ]
    };
    const physicalPledge = {
      ...basePledge,
      subtotal: 1000,
      tax: 79,
      shipping: 300,
      amount: 1379,
      shippingAddress: {
        postalCode: '80205',
        country: 'US'
      }
    };

    const fetchMock = mockManageFetch({
      campaigns: [physicalCampaign],
      pledges: [physicalPledge],
      shippingQuotePayload: {
        quotes: [
          {
            campaignSlug: 'hand-relations',
            shippingCents: 675,
            source: 'usps_live',
            carrier: 'usps',
            service: 'usps_ground_advantage',
            domestic: true,
            defaultOption: 'standard',
            selectedOption: 'standard',
            availableOptions: [
              {
                id: 'standard',
                shippingCents: 675,
                priceDeltaCents: 0
              },
              {
                id: 'signature_required',
                shippingCents: 1070,
                priceDeltaCents: 395
              }
            ]
          }
        ],
        totalShippingCents: 675,
        shippingAddress: {
          country: 'US',
          postalCode: '80205'
        }
      }
    });
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    const supportInput = document.querySelector('input[data-support-id="signed-script"]') as HTMLInputElement | null;
    expect(supportInput).not.toBeNull();
    supportInput!.value = '25';
    supportInput!.dispatchEvent(new Event('input', { bubbles: true }));

    await vi.waitFor(() => {
      const shippingSelect = document.getElementById('shipping-option-0') as HTMLSelectElement | null;
      expect(shippingSelect?.options.length).toBe(2);
      expect(shippingSelect?.value).toBe('standard');
      expect(document.getElementById('shipping-0')?.textContent).toBe('$6.75');
    });

    const shippingSelect = document.getElementById('shipping-option-0') as HTMLSelectElement | null;
    expect(shippingSelect).not.toBeNull();
    shippingSelect!.value = 'signature_required';
    shippingSelect!.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(document.getElementById('shipping-0')?.textContent).toBe('$10.70');
      expect(document.getElementById('amount-0')?.textContent).toBe('$48.46');
    });

    const saveButton = getButton('[data-action="save"][data-index="0"]');
    expect(saveButton.disabled).toBe(false);
    saveButton.click();

    await vi.waitFor(() => {
      expect(document.getElementById('confirm-modal')?.hidden).toBe(false);
      expect(document.getElementById('confirm-modal-details')?.textContent).toContain(
        'Delivery option: Signature required'
      );
    });

    getButton('#confirm-modal-confirm').click();

    await vi.waitFor(() => {
      const modifyCall = fetchMock.mock.calls.find(
        ([url]) => url === `${WORKER_BASE}/pledge/modify`
      );
      expect(modifyCall).toBeTruthy();
      const [, requestInit] = modifyCall!;
      expect(requestInit?.method).toBe('POST');
      expect(JSON.parse(String(requestInit?.body || '{}'))).toMatchObject({
        token: 'token-123',
        orderId: 'pool-intent-123',
        preferredLang: 'en',
        newTierId: 'frame-slot',
        newTierQty: 1,
        addTiers: null,
        supportItems: [{ id: 'signed-script', amount: 25 }],
        customAmount: null,
        tipPercent: null,
        shippingOption: 'signature_required'
      });
    });
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
          body: JSON.stringify({ token: 'token-123', preferredLang: 'en' })
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
          body: JSON.stringify({ token: 'token-123', preferredLang: 'en' })
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
          body: JSON.stringify({ token: 'token-123', orderId: 'pool-intent-123', preferredLang: 'en' })
        })
      );
    });

    await vi.waitFor(() => {
      expect(localStorage.getItem('pool_stats_hand-relations')).toBeNull();
      expect(localStorage.getItem('pool_inventory_hand-relations')).toBeNull();
    });

    expect(JSON.parse(localStorage.getItem('pool_live_refresh_needed') || '{}')).toMatchObject({
      campaignSlugs: ['hand-relations']
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
    await vi.waitFor(() => {
      expect(document.getElementById('confirm-modal')?.hidden).toBe(false);
    });

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
            preferredLang: 'en',
            newTierId: 'frame-slot',
            newTierQty: 1,
            addTiers: null,
            supportItems: null,
            bundleAddOns: null,
            customAmount: null,
            tipPercent: 5,
            shippingOption: null
          })
        })
      );
    });

    await vi.waitFor(() => {
      expect(saveButton.textContent).toBe('Saved');
    });

    await vi.waitFor(() => {
      expect(localStorage.getItem('pool_stats_hand-relations')).toBeNull();
      expect(localStorage.getItem('pool_inventory_hand-relations')).toBeNull();
    });

    expect(JSON.parse(localStorage.getItem('pool_live_refresh_needed') || '{}')).toMatchObject({
      campaignSlugs: ['hand-relations']
    });
  });

  it('lets Manage Pledge add bundle add-ons without duplicating selection rules', async () => {
    (window as any).POOL_CONFIG = {
      addOns: ADD_ON_CONFIG
    };
    const fetchMock = mockManageFetch();
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    const addOnInput = getInput('[data-manage-addon-quantity][data-addon-product-id="dust-wave-sticker"]');
    addOnInput.value = '2';
    addOnInput.dispatchEvent(new Event('input', { bubbles: true }));
    const addButton = getButton('[data-manage-addon-add][data-addon-product-id="dust-wave-sticker"]');
    addButton.click();

    const saveButton = getButton('[data-action="save"][data-index="0"]');
    expect(saveButton.disabled).toBe(false);
    saveButton.click();

    await vi.waitFor(() => {
      expect(document.getElementById('confirm-modal')?.hidden).toBe(false);
    });

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
            preferredLang: 'en',
            newTierId: 'frame-slot',
            newTierQty: 1,
            addTiers: null,
            supportItems: null,
            bundleAddOns: [
              {
                productId: 'dust-wave-sticker',
                variantId: '',
                quantity: 2
              }
            ],
            customAmount: null,
            tipPercent: null,
            shippingOption: null
          })
        })
      );
    });
  });

  it('renders campaign add-ons in a separate Manage section for the current pledge campaign', async () => {
    (window as any).POOL_CONFIG = {
      addOns: ADD_ON_CONFIG,
      i18n: {
        currentLang: 'es',
        messages: {
          manage: {
            campaignAddOns: 'Complementos de la campaña'
          }
        }
      }
    };
    mockManageFetch({
      campaigns: [
        {
          ...baseCampaign,
          campaign_add_ons: [
            {
              id: 'hand-relations__first-time-sexpot-poster',
              name: 'First Time Sexpot Poster',
              description: '18” x 24” First Time Sexpot poster.',
              image_url: '/assets/images/campaign-add-ons/sexpot-poster.png',
              price: 35,
              category: 'physical',
              inventory: 10,
              variants: []
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

    expect(document.body.textContent).toContain('Complementos de la campaña');
    expect(document.body.textContent).toContain('First Time Sexpot Poster');
    expect(document.querySelector('[data-manage-addon-add][data-addon-product-id="hand-relations__first-time-sexpot-poster"]')).not.toBeNull();
  });

  it('lets Manage Pledge edit and remove already-selected bundle add-ons', async () => {
    (window as any).POOL_CONFIG = {
      addOns: ADD_ON_CONFIG
    };
    const fetchMock = mockManageFetch({
      pledges: [
        {
          ...basePledge,
          bundleAddOns: [
            {
              productId: 'dust-wave-sticker',
              variantId: '',
              quantity: 2
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

    expect(document.querySelector('[data-manage-selected-addon-quantity][data-addon-product-id="dust-wave-sticker"]')).not.toBeNull();
    expect(document.querySelector('[data-manage-addon-add][data-addon-product-id="dust-wave-sticker"]')).toBeNull();
    const selectedImage = document.querySelector('[data-manage-selected-addon] .support-option-item__media img') as HTMLImageElement | null;
    expect(selectedImage?.getAttribute('src')).toBe('/assets/images/add-ons/sticker-glove.png');
    expect(document.querySelector('[data-manage-selected-addon]')?.textContent).toContain('50 left');
    expect(document.querySelector('[data-manage-selected-addon] .qty-btn.qty-minus')).not.toBeNull();
    expect(document.querySelector('[data-manage-selected-addon] .qty-btn.qty-plus')).not.toBeNull();

    const selectedQtyInput = getInput('[data-manage-selected-addon-quantity][data-addon-product-id="dust-wave-sticker"]');
    selectedQtyInput.value = '3';
    selectedQtyInput.dispatchEvent(new Event('input', { bubbles: true }));

    const saveButton = getButton('[data-action="save"][data-index="0"]');
    expect(saveButton.disabled).toBe(false);
    saveButton.click();

    await vi.waitFor(() => {
      expect(document.getElementById('confirm-modal')?.hidden).toBe(false);
    });

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
            preferredLang: 'en',
            newTierId: 'frame-slot',
            newTierQty: 1,
            addTiers: null,
            supportItems: null,
            bundleAddOns: [
              {
                productId: 'dust-wave-sticker',
                variantId: '',
                quantity: 3
              }
            ],
            customAmount: null,
            tipPercent: null,
            shippingOption: null
          })
        })
      );
    });
  });

  it('enables save when an add-on variant changes without changing subtotal', async () => {
    (window as any).POOL_CONFIG = {
      addOns: {
        ...ADD_ON_CONFIG,
        products: [
          {
            id: 'dust-wave-tshirt',
            name: 'DUST WAVE T-Shirt',
            description: 'Our official t-shirt. 100% cotton.',
            image_url: '/assets/images/add-ons/dustwave-tshirt.png',
            price: 25,
            category: 'physical',
            shipping_preset: 'tshirt',
            variant_option_name: 'Size',
            variants: [
              { id: 'm', label: 'M', inventory: 4 },
              { id: 'l', label: 'L', inventory: 4 }
            ]
          }
        ]
      }
    };
    window.history.replaceState({}, '', '/manage/?t=token-123');
    mockManageFetch({
      pledges: [
        {
          ...basePledge,
          bundleAddOns: [
            {
              productId: 'dust-wave-tshirt',
              variantId: 'm',
              variantLabel: 'M',
              quantity: 1
            }
          ]
        }
      ],
      addOnsInventory: {
        lowStockThreshold: 5,
        products: {
          'dust-wave-tshirt': {
            inventory: 8,
            sold: 1,
            remaining: 7,
            available: true,
            soldOut: false,
            variants: {
              m: {
                inventory: 4,
                sold: 1,
                remaining: 3,
                available: true,
                soldOut: false
              },
              l: {
                inventory: 4,
                sold: 0,
                remaining: 4,
                available: true,
                soldOut: false
              }
            }
          }
        }
      }
    });

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    const saveButton = getButton('[data-action="save"][data-index="0"]');
    expect(saveButton.disabled).toBe(true);

    const variantSelect = document.querySelector('[data-manage-selected-addon-variant][data-addon-product-id="dust-wave-tshirt"]') as HTMLSelectElement | null;
    expect(variantSelect).not.toBeNull();
    variantSelect!.value = 'l';
    variantSelect!.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(saveButton.disabled).toBe(false);
      expect(saveButton.textContent).toBe('Save Changes');
    });
  });

  it('uses net add-on changes in the Manage confirm modal totals', async () => {
    (window as any).POOL_CONFIG = {
      addOns: {
        ...ADD_ON_CONFIG,
        products: [
          ...ADD_ON_CONFIG.products,
          {
            id: 'dust-wave-butterfingers',
            name: 'DUST WAVE Butterfingers T-Shirt',
            description: 'Our alternate t-shirt. 100% cotton.',
            image_url: '/assets/images/add-ons/butterfingers-tshirt.png',
            price: 25,
            category: 'physical',
            shipping_preset: 'tshirt',
            shipping: {
              weight_oz: 8,
              length_in: 10,
              width_in: 8,
              height_in: 1
            },
            variant_option_name: 'Size',
            variants: [
              { id: 'xs', label: 'XS', inventory: 2 }
            ]
          }
        ]
      }
    };
    mockManageFetch({
      pledges: [
        {
          ...basePledge,
          subtotal: 1300,
          tax: 102,
          shipping: 300,
          amount: 1793,
          customAmount: 0,
          tipPercent: 7,
          tipAmount: 91,
          bundleAddOns: [
            {
              productId: 'dust-wave-sticker',
              variantId: '',
              quantity: 1
            }
          ],
          shippingAddress: {
            postalCode: '80205',
            country: 'US'
          }
        }
      ],
      addOnsInventory: {
        lowStockThreshold: 5,
        products: {
          'dust-wave-sticker': {
            inventory: 50,
            sold: 0,
            remaining: 50,
            available: true,
            soldOut: false,
            variants: {}
          },
          'dust-wave-butterfingers': {
            inventory: 2,
            sold: 0,
            remaining: 2,
            available: true,
            soldOut: false,
            variants: {
              xs: {
                inventory: 2,
                sold: 0,
                remaining: 2,
                available: true,
                soldOut: false
              }
            }
          }
        }
      },
      shippingQuotePayload: {
        quotes: [
          {
            campaignSlug: 'hand-relations',
            shippingCents: 300,
            source: 'fallback_flat_rate',
            defaultOption: 'standard',
            selectedOption: 'standard',
            availableOptions: [
              {
                id: 'standard',
                shippingCents: 300,
                priceDeltaCents: 0
              }
            ]
          }
        ],
        totalShippingCents: 300,
        shippingAddress: {
          country: 'US',
          postalCode: '80205'
        }
      }
    });
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    getButton('[data-manage-selected-addon-remove][data-addon-product-id="dust-wave-sticker"]').click();
    getButton('[data-manage-addon-add][data-addon-product-id="dust-wave-butterfingers"]').click();

    const saveButton = getButton('[data-action="save"][data-index="0"]');
    saveButton.click();

    await vi.waitFor(() => {
      expect(document.getElementById('confirm-modal')?.hidden).toBe(false);
    });

    const confirmDetails = document.getElementById('confirm-modal-details')?.textContent || '';
    expect(confirmDetails).toContain('DUST WAVE Sticker: 1 → 0 (-1)');
    expect(confirmDetails).toContain('DUST WAVE Butterfingers T-Shirt (XS): 0 → 1 (+1)');
    expect(confirmDetails).toContain('The Pool tip change');
    expect(confirmDetails).toContain('$0.91 → $2.45 (+$1.54, 7%)');
    expect(confirmDetails).toContain('Subtotal: $35.00');
    expect(confirmDetails).toContain('Shipping: $3.00');
    expect(confirmDetails).toContain('Total: $43.21');
  });

  it('restores fallback shipping when a physical Manage add-on is removed and re-added', async () => {
    (window as any).POOL_CONFIG = {
      addOns: ADD_ON_CONFIG
    };
    mockManageFetch({
      pledges: [
        {
          ...basePledge,
          shippingAddress: {
            postalCode: '80205',
            country: 'US'
          }
        }
      ],
      shippingQuotePayload: {
        quotes: [],
        totalShippingCents: 0
      }
    });
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    const addButton = getButton('[data-manage-addon-add][data-addon-product-id="dust-wave-sticker"]');
    addButton.click();

    await vi.waitFor(() => {
      expect(document.getElementById('shipping-row-0')?.hidden).toBe(false);
      expect(document.getElementById('shipping-0')?.textContent).toBe('$3.00');
    });

    const removeButton = getButton('[data-manage-selected-addon-remove][data-addon-product-id="dust-wave-sticker"]');
    removeButton.click();

    await vi.waitFor(() => {
      expect(document.getElementById('shipping-row-0')?.hidden).toBe(true);
    });

    const reAddButton = getButton('[data-manage-addon-add][data-addon-product-id="dust-wave-sticker"]');
    reAddButton.click();

    await vi.waitFor(() => {
      expect(document.getElementById('shipping-row-0')?.hidden).toBe(false);
      expect(document.getElementById('shipping-0')?.textContent).toBe('$3.00');
    });
  });

  it('clamps Manage add-on quantity inputs to available inventory', async () => {
    (window as any).POOL_CONFIG = {
      addOns: ADD_ON_CONFIG
    };
    mockManageFetch({
      pledges: [basePledge],
      addOnsInventory: {
        lowStockThreshold: 5,
        products: {
          'dust-wave-sticker': {
            inventory: 50,
            sold: 48,
            remaining: 2,
            available: true,
            soldOut: false,
            variants: {}
          }
        }
      }
    });
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    const addOnInput = getInput('[data-manage-addon-quantity][data-addon-product-id="dust-wave-sticker"]');
    addOnInput.value = '999';
    addOnInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(addOnInput.max).toBe('2');
    expect(addOnInput.value).toBe('2');
  });

  it('does not let selected Manage add-ons exceed true remaining inventory', async () => {
    (window as any).POOL_CONFIG = {
      addOns: ADD_ON_CONFIG
    };
    mockManageFetch({
      pledges: [
        {
          ...basePledge,
          bundleAddOns: [
            {
              productId: 'dust-wave-sticker',
              variantId: '',
              quantity: 1
            }
          ]
        }
      ],
      addOnsInventory: {
        lowStockThreshold: 5,
        products: {
          'dust-wave-sticker': {
            inventory: 50,
            sold: 48,
            remaining: 2,
            available: true,
            soldOut: false,
            variants: {}
          }
        }
      }
    });
    window.history.replaceState({}, '', '/manage/?t=token-123');

    await import('../../assets/js/manage-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('pledges-list')?.hidden).toBe(false);
    });

    const selectedQtyInput = getInput('[data-manage-selected-addon-quantity][data-addon-product-id="dust-wave-sticker"]');
    expect(selectedQtyInput.max).toBe('2');
    expect(document.querySelector('[data-manage-selected-addon]')?.textContent).toContain('Only 2 left');

    const plusButton = getButton('[data-manage-selected-addon-adjust="1"][data-addon-product-id="dust-wave-sticker"]');
    plusButton.click();
    plusButton.click();

    await vi.waitFor(() => {
      expect(selectedQtyInput.value).toBe('2');
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
          body: JSON.stringify({ token: 'token-123', preferredLang: 'en' })
        })
      );
    });
  });
});
