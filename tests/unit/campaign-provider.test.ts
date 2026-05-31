import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('campaign cart provider integration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    document.body.innerHTML = `
      <button
        class="poolcart-add-item"
        data-item-id="demo__standard"
        data-item-name="Demo Standard"
        data-item-price="10"
        data-item-url="/campaigns/demo/"
        data-item-description="Demo tier"
        data-item-stackable="always"
        data-item-max-quantity="5"
        type="button"
      >
        Add
      </button>
    `;
    window.history.replaceState({}, '', '/campaigns/demo/?addTiers=standard:1');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as any).PoolCartProvider;
    delete (window as any).PoolCartRuntime;
    delete (window as any).POOL_CONFIG;
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/');
  });

  it('uses PoolCartProvider for addTiers flows and opens the cart through the provider API', async () => {
    const whenReady = vi.fn(async () => {});
    const open = vi.fn();
    const addButton = document.querySelector('.poolcart-add-item') as HTMLButtonElement | null;
    if (!addButton) throw new Error('Missing tier button');
    const clickSpy = vi.spyOn(addButton, 'click');

    (window as any).POOL_CONFIG = {
      workerBase: 'https://worker.test',
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party'
    };
    (window as any).PoolCartProvider = {
      whenReady,
      getApi: () => ({
        api: {
          theme: {
            cart: {
              open
            }
          }
        }
      })
    };

    await import('../../assets/js/campaign.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.runAllTimersAsync();

    expect(whenReady).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('loads the cart runtime for addTiers flows when the provider is lazy', async () => {
    const whenReady = vi.fn(async () => {});
    const open = vi.fn();
    const addButton = document.querySelector('.poolcart-add-item') as HTMLButtonElement | null;
    if (!addButton) throw new Error('Missing tier button');
    const clickSpy = vi.spyOn(addButton, 'click');
    const provider = {
      whenReady,
      getApi: () => ({
        api: {
          theme: {
            cart: {
              open
            }
          }
        }
      })
    };
    const load = vi.fn(async () => provider);

    (window as any).POOL_CONFIG = {
      workerBase: 'https://worker.test',
      cartRuntime: 'first_party',
      checkoutProvider: 'first_party'
    };
    (window as any).PoolCartRuntime = {
      load
    };

    await import('../../assets/js/campaign.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.runAllTimersAsync();

    expect(load).toHaveBeenCalledWith('add-tiers-flow');
    expect(whenReady).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);
  });
});
