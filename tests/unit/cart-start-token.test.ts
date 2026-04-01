import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WORKER_BASE = 'https://worker.test';

function createSnipcartState() {
  return {
    cart: {
      token: 'cart_live_123',
      paymentSession: {
        publicToken: null
      },
      subtotal: 10,
      total: 10,
      email: '',
      billingAddress: {},
      items: {
        count: 1,
        items: [
          {
            id: 'smoke-editable__standard-pass',
            name: 'SMOKE EDITABLE — Standard Pass',
            price: 10,
            quantity: 1,
            url: 'http://127.0.0.1:4000/campaigns/smoke-editable/',
            customFields: [
              { name: '_category', value: 'digital' }
            ]
          }
        ]
      }
    },
    customer: {}
  };
}

describe('cart.js pledge start token handling', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="snipcart"></div>';

    const state = createSnipcartState();
    const eventHandlers = new Map<string, Array<(...args: any[]) => void>>();
    const subscribe = vi.fn(() => () => {});

    const snipcart = {
      ready: true,
      store: {
        getState: () => state,
        subscribe
      },
      events: {
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          const handlers = eventHandlers.get(event) || [];
          handlers.push(handler);
          eventHandlers.set(event, handlers);
        })
      },
      api: {
        cart: {
          update: vi.fn(async () => {})
        },
        theme: {
          cart: {
            navigate: vi.fn(),
            open: vi.fn()
          }
        }
      }
    };

    Object.assign(window, {
      POOL_CONFIG: {
        workerBase: WORKER_BASE,
        platformName: 'Dust Wave'
      },
      Snipcart: snipcart
    });
    (globalThis as any).Snipcart = snipcart;

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === `${WORKER_BASE}/start`) {
        return new Response(JSON.stringify({ url: '#pledge-started' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw new Error(`Unexpected fetch: ${url} ${JSON.stringify(init || {})}`);
    }));
    vi.stubGlobal('alert', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (window as any).POOL_CONFIG;
    delete (window as any).Snipcart;
    delete (globalThis as any).Snipcart;
    document.body.innerHTML = '';
  });

  it('sends cartToken when Snipcart has no custom-gateway publicToken', async () => {
    await import('../../assets/js/cart.js');

    const host = document.getElementById('snipcart');
    if (!host) throw new Error('Missing snipcart host');

    host.insertAdjacentHTML('beforeend', `
      <div class="snipcart-payment">
        <input type="checkbox" name="agree-terms" checked />
        <button type="button" id="pool-pledge-button">Save Card &amp; Pledge</button>
      </div>
    `);

    await new Promise(resolve => setTimeout(resolve, 0));

    const pledgeButton = document.getElementById('pool-pledge-button') as HTMLButtonElement | null;
    if (!pledgeButton) throw new Error('Missing pledge button');
    pledgeButton.click();

    await new Promise(resolve => setTimeout(resolve, 0));

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${WORKER_BASE}/start`);

    const payload = JSON.parse(String(init?.body || '{}'));
    expect(payload.publicToken ?? null).toBeNull();
    expect(payload.cartToken).toBe('cart_live_123');
    expect(payload.campaignSlug).toBe('smoke-editable');
    expect(payload.tipPercent).toBe(5);
  });
});
