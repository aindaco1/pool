import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('custom amount script', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = `
      <input id="custom-amount-input" type="number" value="" />
      <button id="custom-amount-btn" data-item-price="25" type="button"></button>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('updates the custom support button price from the input', async () => {
    await import('../../assets/js/custom-amount.js');

    const input = document.getElementById('custom-amount-input') as HTMLInputElement;
    const button = document.getElementById('custom-amount-btn') as HTMLButtonElement;

    input.value = '42';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(button.getAttribute('data-item-price')).toBe('42');
  });
});
