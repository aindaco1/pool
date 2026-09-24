import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('assets/js/pledge-result.js', 'utf8');

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState(null, '', '/pledge-success/?orderId=pool-intent-result-test');
  document.body.innerHTML = '<section data-pledge-confirmation data-worker-base="https://worker.test"><p data-pledge-confirmation-reference></p><button data-pledge-confirmation-retry>Check status</button></section><div data-pledge-confirmed hidden>Saved</div>';
});

describe('pledge result persistence boundary', () => {
  it('keeps success hidden while persistence is pending and allows a same-order retry', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ persisted: false })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ persisted: true })));
    vi.stubGlobal('fetch', fetchMock);
    window.eval(source);
    await vi.waitFor(() => expect((document.querySelector('button') as HTMLButtonElement).disabled).toBe(false));
    expect((document.querySelector('[data-pledge-confirmed]') as HTMLElement).hidden).toBe(true);
    (document.querySelector('button') as HTMLButtonElement).click();
    await vi.waitFor(() => expect((document.querySelector('[data-pledge-confirmed]') as HTMLElement).hidden).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(fetchMock.mock.calls[1][0]);
  });

  it('invalidates old and versioned add-on inventory after a confirmed pledge', async () => {
    for (const key of ['pool_add_on_inventory', 'pool_add_on_inventory:v2', 'pool_stats_demo', 'pool_inventory_demo', 'campaign-draft']) {
      localStorage.setItem(key, 'saved');
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ persisted: true }))));
    window.eval(source);
    await vi.waitFor(() => expect((document.querySelector('[data-pledge-confirmed]') as HTMLElement).hidden).toBe(false));
    for (const key of ['pool_add_on_inventory', 'pool_add_on_inventory:v2', 'pool_stats_demo', 'pool_inventory_demo']) {
      expect(localStorage.getItem(key)).toBeNull();
    }
    expect(localStorage.getItem('campaign-draft')).toBe('saved');
  });

  it('recovers a Stripe redirect using its existing session and removes the session from the URL', async () => {
    window.history.replaceState(null, '', '/pledge-success/?orderId=pool-intent-result-test&session_id=cs_test_return');
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ persisted: false })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ persisted: true })));
    vi.stubGlobal('fetch', fetchMock);
    window.eval(source);
    await vi.waitFor(() => expect((document.querySelector('[data-pledge-confirmed]') as HTMLElement).hidden).toBe(false));
    expect(window.location.search).not.toContain('session_id');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ orderId: 'pool-intent-result-test', sessionId: 'cs_test_return' });
  });
});
