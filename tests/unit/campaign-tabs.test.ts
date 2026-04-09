import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('campaign phase tabs', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = `
      <div class="phase-tabs" role="tablist" aria-label="Production phases">
        <button class="phase-tab" id="phase-tab-prep" role="tab" aria-selected="true" aria-controls="tab-prep" tabindex="0" data-tab="prep" type="button">Prep</button>
        <button class="phase-tab" id="phase-tab-production" role="tab" aria-selected="false" aria-controls="tab-production" tabindex="-1" data-tab="production" type="button">Production</button>
      </div>
      <div id="tab-prep" class="phase-panel" role="tabpanel" aria-labelledby="phase-tab-prep"></div>
      <div id="tab-production" class="phase-panel hidden" role="tabpanel" aria-labelledby="phase-tab-production" hidden></div>
    `;
    (window as any).POOL_CONFIG = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).POOL_CONFIG;
    delete (window as any).PoolCartProvider;
    document.body.innerHTML = '';
  });

  it('switches selected tabs and visible panels with keyboard navigation', async () => {
    await import('../../assets/js/campaign.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const tabs = document.querySelectorAll('.phase-tab');
    const prepTab = tabs[0] as HTMLButtonElement;
    const productionTab = tabs[1] as HTMLButtonElement;
    const prepPanel = document.getElementById('tab-prep') as HTMLElement;
    const productionPanel = document.getElementById('tab-production') as HTMLElement;

    prepTab.focus();
    prepTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(productionTab);
    expect(prepTab.getAttribute('aria-selected')).toBe('false');
    expect(prepTab.getAttribute('tabindex')).toBe('-1');
    expect(productionTab.getAttribute('aria-selected')).toBe('true');
    expect(productionTab.getAttribute('tabindex')).toBe('0');
    expect(prepPanel.hidden).toBe(true);
    expect(productionPanel.hidden).toBe(false);

    productionTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(prepTab);
    expect(prepTab.getAttribute('aria-selected')).toBe('true');
    expect(productionPanel.hidden).toBe(true);

    prepTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(productionTab);
    expect(productionTab.getAttribute('aria-selected')).toBe('true');
  });
});
