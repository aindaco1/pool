import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WORKER_BASE = 'https://worker.test';

function renderPreviewShell() {
  document.body.innerHTML = `
    <section
      data-campaign-preview
      data-campaign-preview-slug="demo"
      data-preview-loading="Loading protected preview..."
      data-preview-error="Preview unavailable."
      data-preview-access-title="Preview link unavailable"
      data-preview-access-body="Ask for another link.">
      <p data-campaign-preview-status role="status" aria-live="polite"></p>
      <div data-campaign-preview-notice role="alert" hidden>
        <h2 data-campaign-preview-notice-title></h2>
        <p data-campaign-preview-notice-body></p>
      </div>
      <iframe data-campaign-preview-frame hidden></iframe>
    </section>
  `;
  (window as any).POOL_CONFIG = {
    platform: { workerUrl: WORKER_BASE },
    i18n: { currentLang: 'en' }
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function persistedPageShowEvent() {
  const event = new Event('pageshow') as PageTransitionEvent;
  Object.defineProperty(event, 'persisted', {
    configurable: true,
    value: true
  });
  return event;
}

describe('campaign preview shell', () => {
  beforeEach(() => {
    vi.resetModules();
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/campaigns/demo/preview/');
    renderPreviewShell();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
    document.body.innerHTML = '';
    delete (window as any).POOL_CONFIG;
  });

  it('reuses the tab-scoped preview token when browser history restores the cleaned URL', async () => {
    window.history.replaceState({}, '', '/campaigns/demo/preview/?t=token-123');
    let requestCount = 0;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      expect(url).toBe(`${WORKER_BASE}/admin/campaign-preview/demo?t=token-123&lang=en`);
      requestCount += 1;
      return jsonResponse({ preview: { html: `<main>Preview ${requestCount}</main>` } });
    }) as typeof fetch;

    await import('../../assets/js/campaign-preview.js');

    const frame = document.querySelector<HTMLIFrameElement>('[data-campaign-preview-frame]');
    await vi.waitFor(() => {
      expect(frame?.srcdoc).toContain('Preview 1');
    });
    expect(window.location.search).toBe('');
    expect(window.sessionStorage.getItem('pool_campaign_preview_token:demo')).toBe('token-123');

    if (frame) {
      frame.srcdoc = '';
      frame.hidden = true;
    }
    window.dispatchEvent(persistedPageShowEvent());

    await vi.waitFor(() => {
      expect(frame?.srcdoc).toContain('Preview 2');
    });
    expect(frame?.hidden).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to the admin session path when a stored preview token is no longer accepted', async () => {
    window.sessionStorage.setItem('pool_campaign_preview_token:demo', 'expired-token');
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === `${WORKER_BASE}/admin/campaign-preview/demo?t=expired-token&lang=en`) {
        return jsonResponse({ error: 'Invalid or expired preview link' }, 401);
      }
      if (url === `${WORKER_BASE}/admin/campaign-preview/demo?lang=en`) {
        return jsonResponse({ preview: { html: '<main>Admin session preview</main>' } });
      }
      throw new Error('Unexpected fetch: ' + url);
    }) as typeof fetch;

    await import('../../assets/js/campaign-preview.js');

    const frame = document.querySelector<HTMLIFrameElement>('[data-campaign-preview-frame]');
    await vi.waitFor(() => {
      expect(frame?.srcdoc).toContain('Admin session preview');
    });
    expect(frame?.hidden).toBe(false);
    expect(window.sessionStorage.getItem('pool_campaign_preview_token:demo')).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
