import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('diary tabs script', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = `
      <button class="diary-tab" aria-selected="true" data-tab="fundraising" type="button">Fundraising</button>
      <button class="diary-tab" aria-selected="false" data-tab="production" type="button">Production</button>
      <div id="diary-fundraising" class="diary-panel"></div>
      <div id="diary-production" class="diary-panel hidden"></div>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('switches selected tabs and visible panels', async () => {
    await import('../../assets/js/diary-tabs.js');

    const tabs = document.querySelectorAll('.diary-tab');
    const productionTab = tabs[1] as HTMLButtonElement;
    const fundraisingPanel = document.getElementById('diary-fundraising') as HTMLElement;
    const productionPanel = document.getElementById('diary-production') as HTMLElement;

    productionTab.click();

    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    expect(productionTab.getAttribute('aria-selected')).toBe('true');
    expect(fundraisingPanel.classList.contains('hidden')).toBe(true);
    expect(productionPanel.classList.contains('hidden')).toBe(false);
  });
});
