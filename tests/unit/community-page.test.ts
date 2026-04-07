import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function renderCommunityPage() {
  document.body.innerHTML = `
    <div id="community-loading"></div>
    <div id="community-denied" hidden></div>
    <div id="community-content" hidden></div>
    <script
      data-community-page-script="true"
      data-worker-base="https://worker.test"
      data-campaign-slug="demo"></script>
  `;
}

function renderCommunityPageWithDecision() {
  document.body.innerHTML = `
    <div id="community-loading"></div>
    <div id="community-denied" hidden></div>
    <div id="community-content" hidden>
      <div class="decision-card" data-decision-id="color-palette" data-status="open">
        <div class="decision-voting" data-view="voting">
          <label><input type="radio" name="decision-color-palette" value="Blue">Blue</label>
        </div>
        <div class="decision-results" data-view="results" hidden>
          <div class="result-bar" data-option="Blue">
            <div class="result-bar__label">
              <span class="result-bar__option">Blue</span>
              <span class="result-bar__percent">0%</span>
            </div>
            <div class="result-bar__track">
              <div class="result-bar__fill"></div>
            </div>
            <span class="result-bar__count">0 votes</span>
          </div>
          <div class="decision-card__footer">
            <span class="decision-card__voted">✓ You voted: <strong data-user-choice></strong></span>
            <span class="decision-card__total"><span data-total-votes>0</span> total votes</span>
          </div>
        </div>
      </div>
    </div>
    <script
      data-community-page-script="true"
      data-worker-base="https://worker.test"
      data-campaign-slug="demo"></script>
  `;
}

function renderCommunityPageWithClosedDecision() {
  document.body.innerHTML = `
    <div id="community-loading"></div>
    <div id="community-denied" hidden></div>
    <div id="community-content" hidden>
      <div class="decision-card decision-card--closed" data-decision-id="villain-name" data-status="closed">
        <div class="decision-closed">
          <div class="decision-closed__results" data-decision-id="villain-name"></div>
        </div>
      </div>
    </div>
    <script
      data-community-page-script="true"
      data-worker-base="https://worker.test"
      data-campaign-slug="demo"></script>
  `;
}

describe('community page script', () => {
  beforeEach(() => {
    vi.resetModules();
    document.cookie = 'supporter_demo=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/community/');
    renderCommunityPage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    document.cookie = 'supporter_demo=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    window.sessionStorage.clear();
  });

  it('shows denied state when there is no supporter token', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('../../assets/js/community-page.js');

    expect(document.getElementById('community-loading')?.hidden).toBe(true);
    expect(document.getElementById('community-denied')?.hidden).toBe(false);
    expect(document.getElementById('community-content')?.hidden).toBe(true);

    consoleError.mockRestore();
  });

  it('verifies token access and shows supporter content', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    window.history.replaceState({}, '', '/community/?t=token-123');
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://worker.test/pledge?token=token-123') {
        return new Response(JSON.stringify({
          campaignSlug: 'demo',
          pledgeStatus: 'active'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url === 'https://worker.test/votes?token=token-123&decisions=') {
        return new Response(JSON.stringify({ decisions: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error('Unexpected fetch: ' + url);
    }) as typeof fetch;

    await import('../../assets/js/community-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('community-loading')?.hidden).toBe(true);
      expect(document.getElementById('community-content')?.hidden).toBe(false);
    });
    expect(document.getElementById('community-denied')?.hidden).toBe(true);
    expect(window.location.search).toBe('');
    expect(window.sessionStorage.getItem('supporter_token_demo')).toBe('token-123');
    expect(document.cookie).not.toContain('supporter_token_demo=');

    consoleLog.mockRestore();
    consoleError.mockRestore();
  });

  it('reuses the stored session token on a same-tab revisit without a query param', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    window.sessionStorage.setItem('supporter_token_demo', 'token-stored');
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://worker.test/pledge?token=token-stored') {
        return new Response(JSON.stringify({
          campaignSlug: 'demo',
          pledgeStatus: 'active'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url === 'https://worker.test/votes?token=token-stored&decisions=') {
        return new Response(JSON.stringify({ decisions: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error('Unexpected fetch: ' + url);
    }) as typeof fetch;

    await import('../../assets/js/community-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('community-content')?.hidden).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledWith('https://worker.test/pledge?token=token-stored');
    expect(document.cookie).not.toContain('supporter_token_demo=');

    consoleLog.mockRestore();
    consoleError.mockRestore();
  });

  it('renders vote results with width classes instead of inline styles', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    window.history.replaceState({}, '', '/community/?t=token-456');
    renderCommunityPageWithDecision();

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://worker.test/pledge?token=token-456') {
        return new Response(JSON.stringify({
          campaignSlug: 'demo',
          pledgeStatus: 'active'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url === 'https://worker.test/votes?token=token-456&decisions=color-palette') {
        return new Response(JSON.stringify({
          decisions: {
            'color-palette': {
              hasVoted: true,
              userChoice: 'Blue',
              totalVotes: 4,
              results: { Blue: 3 }
            }
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error('Unexpected fetch: ' + url);
    }) as typeof fetch;

    await import('../../assets/js/community-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('community-content')?.hidden).toBe(false);
      expect((document.querySelector('[data-view="results"]') as HTMLElement).hidden).toBe(false);
    });

    const fill = document.querySelector('.result-bar__fill') as HTMLElement;
    expect(fill.classList.contains('result-bar__fill--w-75')).toBe(true);
    expect(fill.style.width).toBe('');

    consoleLog.mockRestore();
    consoleError.mockRestore();
  });

  it('renders closed results without interpreting option labels as HTML', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    window.history.replaceState({}, '', '/community/?t=token-789');
    renderCommunityPageWithClosedDecision();

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://worker.test/pledge?token=token-789') {
        return new Response(JSON.stringify({
          campaignSlug: 'demo',
          pledgeStatus: 'active'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url === 'https://worker.test/votes?token=token-789&decisions=villain-name') {
        return new Response(JSON.stringify({
          decisions: {
            'villain-name': {
              hasVoted: false,
              userChoice: null,
              totalVotes: 1,
              results: { '<img src=x onerror=alert(1)>': 1 }
            }
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error('Unexpected fetch: ' + url);
    }) as typeof fetch;

    await import('../../assets/js/community-page.js');

    await vi.waitFor(() => {
      expect(document.getElementById('community-content')?.hidden).toBe(false);
      expect(document.querySelector('.closed-result__option')?.textContent).toBe('<img src=x onerror=alert(1)>');
    });

    expect(document.querySelector('.decision-closed__results img')).toBeNull();
    expect(document.querySelector('.decision-closed__results .closed-results__total')?.textContent).toBe('1 total votes');

    consoleLog.mockRestore();
    consoleError.mockRestore();
  });
});
