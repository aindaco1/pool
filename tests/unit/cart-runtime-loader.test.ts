import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeScriptKeys = [
  'add-on-utils',
  'shipping-option-utils',
  'stripe-checkout-sidecar',
  'cart-provider',
  'cart',
  'buy-buttons'
];

function installLoaderScript(version = '123') {
  document.head.innerHTML = `
    <script
      src="https://pool.test/assets/js/cart-runtime-loader.js?v=${version}"
      data-pool-cart-runtime-loader="true"
      data-asset-version="${version}">
    </script>
  `;
}

function installRuntimeScriptHarness(providerClick = vi.fn()) {
  const appended: string[] = [];
  const provider = {
    activeRuntime: 'first_party',
    whenReady: vi.fn(async () => (window as any).PoolCartProvider),
    getApi: () => ({
      api: {
        theme: {
          cart: {
            open: vi.fn()
          }
        }
      }
    })
  };

  const originalAppendChild = Element.prototype.appendChild;
  const appendSpy = vi.spyOn(Element.prototype, 'appendChild').mockImplementation(function(child: Node) {
    const result = originalAppendChild.call(this, child);
    const script = child instanceof HTMLScriptElement ? child : null;
    if (!script?.dataset.poolCartRuntimeScript) {
      return result;
    }

    appended.push(script.dataset.poolCartRuntimeScript);
    queueMicrotask(() => {
      switch (script.dataset.poolCartRuntimeScript) {
        case 'add-on-utils':
          (window as any).PoolAddOnUtils = {};
          break;
        case 'shipping-option-utils':
          (window as any).DustWaveShippingOptionUtils = {};
          break;
        case 'stripe-checkout-sidecar':
          (window as any).PoolStripeCheckoutSidecar = {};
          break;
        case 'cart-provider':
          (window as any).PoolCartProvider = provider;
          document.addEventListener('click', (event) => {
            if ((event.target as Element | null)?.closest?.('.poolcart-add-item')) {
              providerClick();
            }
          });
          document.dispatchEvent(new CustomEvent('poolcart.provider.ready', {
            detail: { activeRuntime: 'first_party' }
          }));
          break;
        case 'cart':
          (window as any).__PoolCartRuntimeCartUiLoaded = true;
          break;
        case 'buy-buttons':
          (window as any).__PoolBuyButtonsLoaded = true;
          break;
        default:
          break;
      }

      script.dispatchEvent(new Event('load'));
    });

    return result;
  });

  return {
    appended,
    appendSpy,
    provider,
    providerClick
  };
}

async function flushAsyncWork() {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('cart runtime loader', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    delete (window as any).PoolCartRuntime;
    delete (window as any).PoolCartProvider;
    delete (window as any).PoolAddOnUtils;
    delete (window as any).DustWaveShippingOptionUtils;
    delete (window as any).PoolStripeCheckoutSidecar;
    delete (window as any).__PoolCartRuntimeCartUiLoaded;
    delete (window as any).__PoolBuyButtonsLoaded;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    delete (window as any).PoolCartRuntime;
    delete (window as any).PoolCartProvider;
    delete (window as any).PoolAddOnUtils;
    delete (window as any).DustWaveShippingOptionUtils;
    delete (window as any).PoolStripeCheckoutSidecar;
    delete (window as any).__PoolCartRuntimeCartUiLoaded;
    delete (window as any).__PoolBuyButtonsLoaded;
  });

  it('loads the cart provider stack once with the page asset version', async () => {
    installLoaderScript('456');
    const harness = installRuntimeScriptHarness();

    await import('../../assets/js/cart-runtime-loader.js');

    const runtime = (window as any).PoolCartRuntime;
    await expect(runtime.load('unit-test')).resolves.toBe(harness.provider);
    await expect(runtime.load('second-call')).resolves.toBe(harness.provider);

    expect(harness.appended).toEqual(runtimeScriptKeys);
    expect(harness.appended).toHaveLength(runtimeScriptKeys.length);

    const scriptVersions = Array.from(document.querySelectorAll<HTMLScriptElement>('script[data-pool-cart-runtime-script]'))
      .map((script) => new URL(script.src).searchParams.get('v'));
    expect(scriptVersions).toEqual(runtimeScriptKeys.map(() => '456'));
    expect(new URL(document.querySelector<HTMLScriptElement>(
      'script[data-pool-cart-runtime-script="shipping-option-utils"]'
    )?.src || '').pathname).toBe(
      '/shared/dust-wave-platform/packages/site-shell/src/shipping-option-utils-browser.js'
    );
  });

  it('loads the runtime and replays the original add button click', async () => {
    installLoaderScript();
    const providerClick = vi.fn();
    const harness = installRuntimeScriptHarness(providerClick);
    document.body.innerHTML = `
      <button class="poolcart-add-item" data-item-id="demo__standard" type="button">
        Add
      </button>
    `;

    await import('../../assets/js/cart-runtime-loader.js');

    const button = document.querySelector<HTMLButtonElement>('.poolcart-add-item');
    button?.click();
    await flushAsyncWork();

    expect(harness.appended).toEqual(runtimeScriptKeys);
    expect(providerClick).toHaveBeenCalledTimes(1);
  });

  it('autoloads for stored cart work and recovery routes', async () => {
    installLoaderScript();
    installRuntimeScriptHarness();
    localStorage.setItem('pool_first_party_cart_state', JSON.stringify({
      items: [{ id: 'demo__standard' }]
    }));

    await import('../../assets/js/cart-runtime-loader.js');

    expect((window as any).PoolCartRuntime.shouldAutoload()).toBe(true);

    localStorage.clear();
    window.history.replaceState({}, '', '/pledge-success/?orderId=pool-intent-demo123');
    expect((window as any).PoolCartRuntime.shouldAutoload()).toBe(true);
  });
});
