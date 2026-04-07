import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('cart icon provider integration', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    delete (window as any).PoolCartProvider;
    document.body.innerHTML = '';
  });

  it('renders from first-party cart state and opens the provider cart on click', async () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    document.body.innerHTML = `
      <button class="site-header__cart poolcart-checkout" id="header-cart-btn">
        <span class="site-header__cart-icon-wrap">
          <span class="poolcart-items-count site-header__cart-count"></span>
        </span>
        <span class="poolcart-total-price site-header__cart-price">$0</span>
      </button>
    `;

    const state = {
      cart: {
        total: 12,
        items: {
          count: 1
        }
      }
    };
    const subscribers = new Set<(state: any) => void>();
    const open = vi.fn();

    (window as any).PoolCartProvider = {
      activeRuntime: 'first_party',
      getApi: () => ({
        api: {
          theme: {
            cart: {
              open
            }
          }
        }
      }),
      store: {
        getState: () => state,
        subscribe: (handler: (state: any) => void) => {
          subscribers.add(handler);
          return () => subscribers.delete(handler);
        }
      }
    };

    await import('../../assets/js/cart-icon.js');

    const priceEl = document.querySelector('.site-header__cart-price');
    const countEl = document.querySelector('.site-header__cart-count');
    const button = document.getElementById('header-cart-btn') as HTMLButtonElement | null;

    expect(priceEl?.textContent).toBe('$12.00');
    expect(countEl?.textContent).toBe('1');

    state.cart.total = 19;
    state.cart.items.count = 3;
    subscribers.forEach((handler) => handler(state));

    expect(priceEl?.textContent).toBe('$19.00');
    expect(countEl?.textContent).toBe('3');
    expect(JSON.parse(localStorage.getItem('pool_cart_cache') || '{}')).toEqual({
      total: 19,
      count: 3
    });

    button?.click();
    expect(open).toHaveBeenCalledTimes(1);
  });
});
