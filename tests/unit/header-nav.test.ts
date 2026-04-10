import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('header nav script', () => {
  beforeEach(() => {
    vi.resetModules();
    window.history.replaceState({}, '', '/manage/?t=token-123#section');
    document.body.innerHTML = `
      <nav id="mobile-nav" class="site-header__nav">
        <a href="/about/">About</a>
      </nav>
      <a href="/es/manage/" data-lang-switcher-link="true">Español</a>
      <button
        id="menu-toggle"
        aria-expanded="false"
        aria-label="Abrir menú"
        data-open-label="Abrir menú"
        data-close-label="Cerrar menú"
        type="button"></button>
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
    expect(toggle.getAttribute('aria-label')).toBe('Cerrar menú');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(nav.classList.contains('is-open')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Abrir menú');
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('preserves the current query string and hash on language switcher links', async () => {
    await import('../../assets/js/header-nav.js');

    const langLink = document.querySelector('[data-lang-switcher-link="true"]') as HTMLAnchorElement;
    expect(langLink.getAttribute('href')).toBe('/es/manage/?t=token-123#section');
  });
});
