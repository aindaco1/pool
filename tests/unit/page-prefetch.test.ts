import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function installScript(delay = '90', limit = '3') {
  document.head.innerHTML = `
    <script
      src="${window.location.origin}/assets/js/page-prefetch.js"
      data-pool-page-prefetch="true"
      data-prefetch-delay-ms="${delay}"
      data-prefetch-limit="${limit}">
    </script>
  `;
}

function makeLink(href: string, attrs: Record<string, string> = {}) {
  const link = document.createElement('a');
  link.href = href;
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === '') {
      link.setAttribute(key, '');
    } else {
      link.setAttribute(key, value);
    }
  });
  link.textContent = href;
  document.body.appendChild(link);
  return link;
}

function prefetches() {
  return Array.from(document.querySelectorAll<HTMLLinkElement>('link[data-pool-page-prefetch="true"]'))
    .map((link) => link.href);
}

describe('intent-based page prefetching', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible'
    });
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: {
        saveData: false,
        effectiveType: '4g'
      }
    });

    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string, options?: ElementCreationOptions) => {
      const element = createElement(tagName, options);
      if (tagName.toLowerCase() === 'link' && element instanceof HTMLLinkElement) {
        Object.defineProperty(element.relList, 'supports', {
          configurable: true,
          value: () => true
        });
      }
      return element;
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    delete (window as any).PoolPagePrefetch;
  });

  it('prefetches eligible same-origin public links only after pointer intent', async () => {
    installScript('90', '3');
    const link = makeLink('/campaigns/demo/');

    await import('../../assets/js/page-prefetch.js');

    link.dispatchEvent(new Event('pointerover', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(89);
    expect(prefetches()).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(prefetches()).toEqual([`${window.location.origin}/campaigns/demo/`]);
    expect((window as any).PoolPagePrefetch.getPrefetchedUrls()).toEqual([
      `${window.location.origin}/campaigns/demo/`
    ]);
  });

  it('rejects private, tokenized, external, and non-default navigation links', async () => {
    installScript();
    await import('../../assets/js/page-prefetch.js');

    const rejected = [
      makeLink('/admin/'),
      makeLink('/es/manage/'),
      makeLink('/community/'),
      makeLink('/checkout/'),
      makeLink('/pledge-success/?orderId=pool-intent-1'),
      makeLink('/campaigns/demo/?token=secret'),
      makeLink('/campaigns/demo/?publicToken=secret'),
      makeLink('/campaigns/demo/preview/?t=secret'),
      makeLink('/#main-content'),
      makeLink('https://example.com/campaigns/demo/'),
      makeLink('/campaigns/demo/', { target: '_blank' }),
      makeLink('/campaigns/demo/', { rel: 'nofollow' }),
      makeLink('/campaigns/demo/', { download: '' }),
      makeLink('/campaigns/demo/', { 'data-no-prefetch': 'true' })
    ];

    const runtime = (window as any).PoolPagePrefetch;
    rejected.forEach((link) => {
      expect(runtime.getEligibleUrl(link)).toBeNull();
      expect(runtime.prefetch(link)).toBe(false);
    });
    expect(prefetches()).toEqual([]);
  });

  it('deduplicates URLs and caps prefetches per page view', async () => {
    installScript('0', '2');
    const first = makeLink('/campaigns/demo/');
    const duplicate = makeLink('/campaigns/demo/#tiers');
    const second = makeLink('/about/');
    const third = makeLink('/terms/');

    await import('../../assets/js/page-prefetch.js');

    const runtime = (window as any).PoolPagePrefetch;
    expect(runtime.prefetch(first)).toBe(true);
    expect(runtime.prefetch(duplicate)).toBe(false);
    expect(runtime.prefetch(second)).toBe(true);
    expect(runtime.prefetch(third)).toBe(false);
    expect(prefetches()).toEqual([
      `${window.location.origin}/campaigns/demo/`,
      `${window.location.origin}/about/`
    ]);
  });

  it('does not prefetch on save-data or slow connections', async () => {
    installScript();
    const link = makeLink('/campaigns/demo/');
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: {
        saveData: true,
        effectiveType: '4g'
      }
    });

    await import('../../assets/js/page-prefetch.js');

    const runtime = (window as any).PoolPagePrefetch;
    expect(runtime.canUseNetworkForPrefetch()).toBe(false);
    expect(runtime.prefetch(link)).toBe(false);

    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: {
        saveData: false,
        effectiveType: '2g'
      }
    });
    expect(runtime.canUseNetworkForPrefetch()).toBe(false);
    expect(runtime.prefetch(link)).toBe(false);
    expect(prefetches()).toEqual([]);
  });
});
