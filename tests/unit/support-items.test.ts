import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('support items script', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = `
      <div class="support-item">
        <input class="support-item__input" type="number" value="" />
        <button class="support-item__btn" data-item-price="100" type="button"></button>
      </div>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('updates a support item button price from its input', async () => {
    await import('../../assets/js/support-items.js');

    const input = document.querySelector('.support-item__input') as HTMLInputElement;
    const button = document.querySelector('.support-item__btn') as HTMLButtonElement;

    input.value = '17';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(button.getAttribute('data-item-price')).toBe('17');
  });
});
