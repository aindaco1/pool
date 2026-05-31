import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('buy-buttons provider integration', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (window as any).__PoolBuyButtonsLoaded;
    document.body.innerHTML = '<button class="poolcart-add-item" data-item-name="VIP Pass">Buy</button>';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).PoolCartProvider;
    delete (window as any).__PoolBuyButtonsLoaded;
    document.body.innerHTML = '';
  });

  it('subscribes through PoolCartProvider when available', async () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    const onItemAdded = vi.fn();
    const onReady = vi.fn(async (handler: (api: any) => void) => {
      handler({
        events: {
          on: onItemAdded
        }
      });
    });

    (window as any).PoolCartProvider = {
      onReady
    };

    await import('../../assets/js/buy-buttons.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onItemAdded).toHaveBeenCalledTimes(1);
    expect(onItemAdded).toHaveBeenCalledWith('item.added', expect.any(Function));
  });
});
