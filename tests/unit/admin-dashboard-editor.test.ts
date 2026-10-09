import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function setupAdminContentEditorDom() {
  document.body.innerHTML = `
    <script data-admin-dashboard-script="true"></script>
    <textarea id="admin-content-long-content"></textarea>
    <div id="admin-content-blocks"></div>
  `;
}

describe('admin dashboard content editor serialization', () => {
  beforeEach(async () => {
    vi.resetModules();
    setupAdminContentEditorDom();
    await import('../../shared/dust-wave-platform/packages/admin-shell/src/editor-codec.js');
    await import('../../shared/dust-wave-platform/packages/admin-shell/src/editor-media.js');
    await import('../../shared/dust-wave-platform/packages/admin-shell/src/feedback.js');
    (window as unknown as { POOL_CONFIG?: unknown }).POOL_CONFIG = {
      i18n: { currentLang: 'en', messages: { admin: {} } },
      platform: { siteUrl: 'https://pool.test', workerUrl: '' }
    };
    global.fetch = vi.fn(async () => jsonResponse({}, 401)) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, 'execCommand');
    document.body.innerHTML = '';
    localStorage.clear();
    delete (window as unknown as { POOL_CONFIG?: unknown }).POOL_CONFIG;
  });

  it.each([
    { weight: 'normal', target: 'body' },
    { weight: '400', target: 'body' },
    { weight: 'normal', target: 'nested' },
    { weight: '400', target: 'nested' }
  ])('honors Google Docs formatting with font-weight: $weight when pasting into $target', async ({ weight, target }) => {
    await import('../../assets/js/admin-dashboard.js');
    const editor = document.querySelector('[data-content-field="body"]') as HTMLElement;
    const field = document.getElementById('admin-content-long-content') as HTMLTextAreaElement;
    Object.defineProperty(editor, 'isContentEditable', { configurable: true, value: true });
    editor.setAttribute('contenteditable', 'true');
    editor.innerHTML = '<p><strong>Replace this text.</strong></p>';
    const pasteTarget = target === 'nested' ? editor.querySelector('strong')! : editor;
    document.execCommand = vi.fn((_command, _showUi, html) => {
      editor.innerHTML = html || '';
      return true;
    });
    const html = `<b style="font-weight:${weight}" id="docs-internal-guid-fixture">`
      + '<p><span style="font-weight:400">Normal text.</span></p>'
      + '<p><span style="font-weight:700">Bold</span> and <span style="font-weight:400;font-style:italic">italic</span>'
      + ' with <span style="font-weight:700;font-style:italic">both</span>.</p>'
      + '<p><b>Semantic bold</b> and <strong style="font-weight:400">normal override</strong>.</p></b>';
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { getData: (type: string) => type === 'text/html' ? html : '' } });
    pasteTarget.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('insertHTML', false,
      '<p>Normal text.</p><p><strong>Bold</strong> and <em>italic</em> with <strong><em>both</em></strong>.</p><p><strong>Semantic bold</strong> and normal override.</p>');
    expect(JSON.parse(field.value)[0].body).toBe('Normal text.\n\n**Bold** and *italic* with ***both***.\n\n**Semantic bold** and normal override.');
  });

  it('keeps boundary spaces outside Markdown emphasis markers', async () => {
    await import('../../assets/js/admin-dashboard.js');

    const editor = document.querySelector('[data-content-field="body"]') as HTMLElement;
    const field = document.getElementById('admin-content-long-content') as HTMLTextAreaElement;
    Object.defineProperty(editor, 'isContentEditable', { configurable: true, value: true });
    editor.innerHTML = '<p><strong>it came out great. </strong>Three very long, <strong>15-hour days </strong>with <em>behind-the-scenes pics </em>from here.</p>';

    editor.dispatchEvent(new Event('input', { bubbles: true }));

    const blocks = JSON.parse(field.value);
    expect(blocks[0].body).toBe('**it came out great.** Three very long, **15-hour days** with *behind-the-scenes pics* from here.');
  });

  it('loads and preserves nested emphasis in campaign list items', async () => {
    const field = document.getElementById('admin-content-long-content') as HTMLTextAreaElement;
    await import('../../assets/js/admin-dashboard.js');
    field.value = JSON.stringify([{ type: 'text', body: '- **Dinosaurs ... *enough said***' }]);
    field.dispatchEvent(new Event('change', { bubbles: true }));
    const editor = document.querySelector('[data-content-field="body"]') as HTMLElement;
    expect(editor.querySelector('li strong em')?.textContent).toBe('enough said');
    expect(editor.textContent).not.toContain('*');
    Object.defineProperty(editor, 'isContentEditable', { configurable: true, value: true });
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    expect(JSON.parse(field.value)[0].body).toBe('- **Dinosaurs ... *enough said***');
  });

  it('keeps leading spaces outside Markdown emphasis markers', async () => {
    await import('../../assets/js/admin-dashboard.js');

    const editor = document.querySelector('[data-content-field="body"]') as HTMLElement;
    const field = document.getElementById('admin-content-long-content') as HTMLTextAreaElement;
    Object.defineProperty(editor, 'isContentEditable', { configurable: true, value: true });
    editor.innerHTML = '<p>choice.<strong> blake, her brother, is gone,</strong> and flesh.<em> ooey, gooey flesh…</em> yuck. this film will be<strong> FIRE, HEAT, GAS,</strong> and<strong> SEVERAL OTHER INFERNAL-THEMED ATTRIBUTES.</strong></p>';

    editor.dispatchEvent(new Event('input', { bubbles: true }));

    const blocks = JSON.parse(field.value);
    expect(blocks[0].body).toBe('choice. **blake, her brother, is gone,** and flesh. *ooey, gooey flesh…* yuck. this film will be **FIRE, HEAT, GAS,** and **SEVERAL OTHER INFERNAL-THEMED ATTRIBUTES.**');
  });

  it('serializes nested bold and italic without leaving unmatched markers', async () => {
    await import('../../assets/js/admin-dashboard.js');

    const editor = document.querySelector('[data-content-field="body"]') as HTMLElement;
    const field = document.getElementById('admin-content-long-content') as HTMLTextAreaElement;
    Object.defineProperty(editor, 'isContentEditable', { configurable: true, value: true });
    editor.innerHTML = '<p><strong>3am yesterday, we wrapped <em>sunder</em></strong>!</p>';

    editor.dispatchEvent(new Event('input', { bubbles: true }));

    const blocks = JSON.parse(field.value);
    expect(blocks[0].body).toBe('**3am yesterday, we wrapped *sunder***!');
  });
});
