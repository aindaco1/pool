import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('diary tabs script', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = `
      <div class="diary-tabs" role="tablist" aria-label="Diary phases">
        <button class="diary-tab" id="diary-tab-fundraising" aria-selected="true" aria-controls="diary-fundraising" tabindex="0" data-tab="fundraising" type="button">Fundraising</button>
        <button class="diary-tab" id="diary-tab-production" aria-selected="false" aria-controls="diary-production" tabindex="-1" data-tab="production" type="button">Production</button>
      </div>
      <div id="diary-fundraising" class="diary-panel" role="tabpanel" aria-labelledby="diary-tab-fundraising"></div>
      <div id="diary-production" class="diary-panel hidden" role="tabpanel" aria-labelledby="diary-tab-production" hidden></div>
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
    expect(tabs[0].getAttribute('tabindex')).toBe('-1');
    expect(productionTab.getAttribute('aria-selected')).toBe('true');
    expect(productionTab.getAttribute('tabindex')).toBe('0');
    expect(fundraisingPanel.classList.contains('hidden')).toBe(true);
    expect(fundraisingPanel.hidden).toBe(true);
    expect(productionPanel.classList.contains('hidden')).toBe(false);
    expect(productionPanel.hidden).toBe(false);
  });

  it('supports arrow and Home/End keyboard navigation', async () => {
    await import('../../assets/js/diary-tabs.js');

    const tabs = document.querySelectorAll('.diary-tab');
    const fundraisingTab = tabs[0] as HTMLButtonElement;
    const productionTab = tabs[1] as HTMLButtonElement;

    fundraisingTab.focus();
    fundraisingTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(productionTab);
    expect(productionTab.getAttribute('aria-selected')).toBe('true');

    productionTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(fundraisingTab);
    expect(fundraisingTab.getAttribute('aria-selected')).toBe('true');

    fundraisingTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(productionTab);
    expect(productionTab.getAttribute('aria-selected')).toBe('true');
  });
});
