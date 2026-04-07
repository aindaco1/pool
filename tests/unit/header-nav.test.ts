import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('header nav script', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = `
      <nav id="mobile-nav" class="site-header__nav">
        <a href="/about/">About</a>
      </nav>
      <button id="menu-toggle" aria-expanded="false" aria-label="Open menu" type="button"></button>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('toggles and closes the mobile nav accessibly', async () => {
    await import('../../assets/js/header-nav.js');

    const toggle = document.getElementById('menu-toggle') as HTMLButtonElement;
    const nav = document.getElementById('mobile-nav') as HTMLElement;
    const focusSpy = vi.spyOn(toggle, 'focus').mockImplementation(() => {});

    toggle.click();
    expect(nav.classList.contains('is-open')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Close menu');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(nav.classList.contains('is-open')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Open menu');
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });
});
