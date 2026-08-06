import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('form control identity helper', () => {
  beforeEach(() => {
    vi.resetModules();
    document.head.innerHTML = `
      <script
        data-dustwave-form-control-identity="true"
        data-form-control-id-prefix="pool-form-control"
        data-identity-dataset-keys="contentAction,action,itemId,scrollTarget,campaignEmbedCopy">
      </script>
    `;
    document.body.innerHTML = `
      <button type="button" data-action="save">Save</button>
      <input type="text" aria-label="Search">
      <select id="existing-select"></select>
      <textarea name="existing-textarea"></textarea>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    delete (window as any).DustWaveFormControlIdentity;
  });

  it('adds ids to nameless first-party controls without changing named controls', async () => {
    await import('../../shared/dust-wave-platform/packages/site-shell/src/form-control-identity-browser.js');
    (window as any).DustWaveFormControlIdentity.start(document);

    const button = document.querySelector('button[data-action="save"]') as HTMLButtonElement;
    const input = document.querySelector('input[aria-label="Search"]') as HTMLInputElement;
    const select = document.getElementById('existing-select') as HTMLSelectElement;
    const textarea = document.querySelector('textarea[name="existing-textarea"]') as HTMLTextAreaElement;

    expect(button.id).toMatch(/^pool-form-control-save-/);
    expect(input.id).toMatch(/^pool-form-control-search-/);
    expect(button.getAttribute('name')).toBeNull();
    expect(input.getAttribute('name')).toBeNull();
    expect(select.id).toBe('existing-select');
    expect(textarea.id).toBe('');
    expect(textarea.name).toBe('existing-textarea');
  });

  it('observes controls inserted after startup', async () => {
    await import('../../shared/dust-wave-platform/packages/site-shell/src/form-control-identity-browser.js');
    (window as any).DustWaveFormControlIdentity.start(document);

    const late = document.createElement('button');
    late.type = 'button';
    late.dataset.contentAction = 'insert-block';
    late.textContent = '+';
    document.body.append(late);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(late.id).toMatch(/^pool-form-control-insert-block-/);
  });
});
