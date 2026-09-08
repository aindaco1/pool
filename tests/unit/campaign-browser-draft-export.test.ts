import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../../scripts/export-campaign-browser-draft.js'), 'utf8');
const windows: JSDOM[] = [];

function fixture(origin = 'https://pool.dustwave.xyz') {
  const dom = new JSDOM('<body></body>', { url: origin + '/admin/?admin_login=secret-not-for-export', runScripts: 'outside-only' });
  windows.push(dom);
  const w = dom.window;
  w.URL.createObjectURL = vi.fn(() => 'blob:recovery');
  w.URL.revokeObjectURL = vi.fn();
  w.HTMLAnchorElement.prototype.click = vi.fn();
  w.console.table = vi.fn();
  w.console.info = vi.fn();
  w.fetch = vi.fn(() => { throw new Error('No network access allowed'); });
  w.localStorage.setItem('unrelated-secret', 'must-not-be-exported');
  const set = vi.spyOn(w.Storage.prototype, 'setItem');
  const remove = vi.spyOn(w.Storage.prototype, 'removeItem');
  const clear = vi.spyOn(w.Storage.prototype, 'clear');
  return { w, set, remove, clear };
}

afterEach(() => windows.splice(0).forEach(dom => dom.window.close()));

describe('campaign browser draft export', () => {
  it('exports both language keys verbatim without storage or network mutations', () => {
    const e = fixture();
    const en = JSON.stringify({ campaignSlug: 'deinonychus', longContent: [{ type: 'text', body: 'Surviving story' }] });
    e.w.localStorage.setItem('pool-admin-content-draft:en:deinonychus', en);
    e.w.localStorage.setItem('pool-admin-content-draft:es:deinonychus', '{malformed but preserved');
    e.set.mockClear();
    const report = e.w.eval(source);
    expect(report.drafts.map((draft: any) => draft.raw)).toEqual([en, '{malformed but preserved']);
    expect(JSON.stringify(report)).not.toMatch(/must-not-be-exported|secret-not-for-export/);
    expect(e.set).not.toHaveBeenCalled();
    expect(e.remove).not.toHaveBeenCalled();
    expect(e.clear).not.toHaveBeenCalled();
    expect(e.w.fetch).not.toHaveBeenCalled();
    expect(e.w.HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(report.editor).toBeNull();
  });

  it('preserves only the matching campaign editor and never edits it', () => {
    const e = fixture();
    e.w.document.body.innerHTML = `<select id="admin-content-campaign"><option>deinonychus</option></select>
      <input id="admin-content-title-field" value="Deinonychus">
      <textarea id="admin-content-long-content">[{"type":"text","body":"Still open"}]</textarea>
      <div id="admin-content-blocks" data-content-campaign-slug="deinonychus">Still visible</div>`;
    const before = e.w.document.body.innerHTML;
    const report = e.w.eval(source);
    expect(report.editor.longContentJSON).toContain('Still open');
    expect(report.editor.visibleText).toBe('Still visible');
    expect(e.w.document.body.innerHTML).toBe(before);
    e.w.document.getElementById('admin-content-blocks')!.dataset.contentCampaignSlug = 'other';
    expect(e.w.eval(source).editor).toBeNull();
  });

  it('exports an honest empty result or storage error without suggesting recovery succeeded', () => {
    const e = fixture();
    expect(e.w.eval(source).drafts.every((draft: any) => draft.raw === null)).toBe(true);
    e.w.Storage.prototype.getItem = () => { throw new Error('Storage unavailable'); };
    expect(e.w.eval(source).drafts[0].error).toBe('Storage unavailable');
  });

  it('refuses another origin before reading storage', () => {
    const e = fixture('https://other.test');
    const read = vi.spyOn(e.w.Storage.prototype, 'getItem');
    expect(() => e.w.eval(source)).toThrow('Run this on https://pool.dustwave.xyz');
    expect(read).not.toHaveBeenCalled();
    expect(e.w.URL.createObjectURL).not.toHaveBeenCalled();
  });
});
