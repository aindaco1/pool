import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const root = path.resolve(__dirname, '../..');
const key = 'pool-admin-content-draft:en:deinonychus';
const windows: JSDOM[] = [];

function editor(storage: Record<string, string> = {}, projectSave = false) {
  const dom = new JSDOM(`
    <script data-admin-dashboard-script="true"></script>
    ${projectSave ? `<button id="admin-campaign-save">Save</button>
      <div id="admin-campaign-settings-results">
        <input data-settings-path="creator_name" data-settings-campaign="deinonychus" data-settings-original="Creator" value="Creator">
        <input data-settings-path="creator_name" data-settings-campaign="other" data-settings-original="Other" value="Other">
      </div>` : ''}
    <select id="admin-content-campaign"><option value="deinonychus">Deinonychus</option><option value="other">Other</option></select>
    <button id="admin-content-load">Load</button>
    <button id="admin-content-publish">Publish</button>
    <form id="admin-content-editor">
      <input id="admin-content-title-field">
      <textarea id="admin-content-short-blurb"></textarea>
      <textarea id="admin-content-long-content"></textarea>
      <div id="admin-content-blocks"></div>
      <button type="button" id="admin-content-save-draft">Save draft</button>
    </form><p id="admin-content-status"></p>
  `, { url: 'https://pool.test/admin/', runScripts: 'outside-only' });
  windows.push(dom);
  const w = dom.window;
  Object.entries(storage).forEach(([name, value]) => w.localStorage.setItem(name, value));
  w.POOL_CONFIG = { platform: { workerUrl: 'https://worker.test' }, i18n: { currentLang: 'en' } };
  w.confirm = vi.fn(() => true);
  let savedCampaign = { slug: 'deinonychus', title: 'Deinonychus', shortBlurb: '', longContent: [], baseRevision: projectSave ? 'live:server-sha' : 'server-sha', hasWorkingCopy: false, hasUnpublishedChanges: false };
  w.fetch = vi.fn(async (url: string, options?: any) => {
    let result: any = {};
    if (url.includes('/admin/campaigns/draft') && options?.method === 'POST') {
      const body = JSON.parse(options.body);
      if (body.baseRevision !== savedCampaign.baseRevision) return new Response(JSON.stringify({ error: 'Project changed; edits kept.' }), { status: 409 });
      if (body.intent === 'save') savedCampaign = { ...savedCampaign, ...body.draft, baseRevision: 'draft:saved-sha', hasWorkingCopy: true, hasUnpublishedChanges: true };
      else savedCampaign.hasUnpublishedChanges = false;
      result = { success: true, ...savedCampaign };
    } else if (url.includes('/admin/content/campaign') || url.includes('/admin/campaigns/draft')) {
      result = { campaign: { ...savedCampaign, slug: new URL(url).searchParams.get('campaignSlug') } };
    } else if (url.includes('/admin/content/publish')) result = { success: true, contentSha: 'published-sha' };
    return new Response(JSON.stringify(result), { status: url.endsWith('/admin/session') ? 401 : 200 });
  });
  for (const file of [
    'shared/dust-wave-platform/packages/admin-shell/src/dirty-controls-browser.js',
    'shared/dust-wave-platform/packages/admin-shell/src/unsaved-changes-browser.js',
    'assets/js/admin-dashboard.js'
  ]) w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  const get = (id: string) => w.document.getElementById('admin-content-' + id) as any;
  const load = async () => {
    get('load').click();
    await vi.waitFor(() => expect(get('status').textContent).not.toContain('Loading campaign'));
  };
  const edit = (body: string) => {
    get('long-content').value = JSON.stringify([{ type: 'text', body }]);
    get('long-content').dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  const warns = () => {
    const event = new w.Event('beforeunload', { cancelable: true });
    w.dispatchEvent(event);
    return event.defaultPrevented;
  };
  return { w, get, load, edit, warns, save: () => w.document.getElementById('admin-campaign-save') as HTMLButtonElement };
}

afterEach(() => { windows.splice(0).forEach(dom => dom.window.close()); });

describe('campaign draft recovery', () => {
  it('restores a saved draft after a fresh page loads an empty server campaign', async () => {
    const first = editor();
    await first.load();
    first.edit('The entire campaign story');
    first.get('save-draft').click();
    const saved = first.w.localStorage.getItem(key)!;
    const refreshed = editor({ [key]: saved });
    await refreshed.load();
    expect(refreshed.get('long-content').value).toContain('The entire campaign story');
    expect(refreshed.w.localStorage.getItem(key)).toBe(saved);
  });

  it('keeps Publish and the refresh warning active after Save draft, until publication', async () => {
    const e = editor();
    await e.load();
    e.edit('Locally saved story');
    e.get('save-draft').click();
    expect(e.get('save-draft').disabled).toBe(true);
    expect(e.get('publish').disabled).toBe(false);
    expect(e.warns()).toBe(true);
    e.get('publish').click();
    await vi.waitFor(() => expect(e.get('status').textContent).toContain('Content published'));
    expect(e.warns()).toBe(false);
    expect(e.get('publish').disabled).toBe(true);
  });

  it('reports storage failure instead of claiming a successful save', async () => {
    const e = editor();
    await e.load();
    e.edit('Do not lose this');
    e.w.Storage.prototype.setItem = () => { throw new Error('Quota exceeded'); };
    e.get('save-draft').click();
    expect(e.get('status').textContent).toContain('Unable to save');
    expect(e.get('save-draft').disabled).toBe(false);
    expect(e.warns()).toBe(true);
  });

  it('does not write server content into browser storage while loading', async () => {
    const e = editor();
    await e.load();
    expect(e.w.localStorage.getItem(key)).toBeNull();
    expect(e.warns()).toBe(false);
  });

  it('keeps unreadable saved data untouched and warns before leaving', async () => {
    const e = editor({ [key]: '{broken recovery data' });
    await e.load();
    expect(e.get('status').textContent).toContain('left untouched');
    e.edit('New text');
    e.get('save-draft').click();
    expect(e.w.localStorage.getItem(key)).toBe('{broken recovery data');
    expect(e.get('status').textContent).toContain('Unable to save');
    expect(e.warns()).toBe(true);
  });

  it('does not overwrite a draft changed in another tab', async () => {
    const e = editor();
    await e.load();
    e.edit('This tab');
    const other = JSON.stringify({ campaignSlug: 'deinonychus', longContent: [{ type: 'text', body: 'Other tab' }] });
    e.w.localStorage.setItem(key, other);
    e.edit('This tab again');
    e.get('save-draft').click();
    expect(e.w.localStorage.getItem(key)).toBe(other);
    expect(e.get('long-content').value).toContain('This tab again');
    expect(e.warns()).toBe(true);
  });

  it('keeps typing entered while the server load is pending, even if storage fails', async () => {
    const e = editor();
    let finish: (value: Response) => void = () => {};
    e.w.fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    e.get('load').click();
    e.w.Storage.prototype.setItem = () => { throw new Error('Quota exceeded'); };
    e.edit('Typed during loading');
    finish(new Response(JSON.stringify({ campaign: { slug: 'deinonychus', title: 'Server', longContent: [], baseRevision: 'server-sha' } })));
    await vi.waitFor(() => expect(e.get('status').textContent).not.toContain('Loading campaign'));
    expect(e.get('long-content').value).toContain('Typed during loading');
    expect(e.warns()).toBe(true);
  });

  it('ignores a response for a campaign that is no longer selected', async () => {
    const e = editor();
    let finish: (value: Response) => void = () => {};
    e.w.fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    e.get('load').click();
    const firstResponse = finish;
    e.get('campaign').value = 'other';
    e.get('campaign').dispatchEvent(new e.w.Event('change'));
    finish(new Response(JSON.stringify({ campaign: { slug: 'other', title: 'Other', longContent: [{ type: 'text', body: 'Other campaign' }] } })));
    await vi.waitFor(() => expect(e.get('long-content').value).toContain('Other campaign'));
    firstResponse(new Response(JSON.stringify({ campaign: { slug: 'deinonychus', title: 'Late response', longContent: [] } })));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(e.get('long-content').value).toContain('Other campaign');
    expect(e.w.localStorage.getItem('pool-admin-content-draft:en:other')).toBeNull();
  });

  it('keeps the original revision of an unpublished draft so stale publishing fails closed', async () => {
    const e = editor({ [key]: JSON.stringify({ campaignSlug: 'deinonychus', title: 'Deinonychus', longContent: [{ type: 'text', body: 'Older local work' }], baseRevision: 'older-sha' }) });
    await e.load();
    e.get('publish').click();
    await vi.waitFor(() => expect(e.get('status').textContent).toContain('Content published'));
    const request = e.w.fetch.mock.calls.find(([url]: [string]) => url.includes('/admin/content/publish'));
    expect(JSON.parse(request[1].body).baseRevision).toBe('older-sha');
  });

  it('does not restore a previously published cache over newer server content', async () => {
    const first = editor();
    await first.load();
    first.edit('Previously published story');
    first.get('publish').click();
    await vi.waitFor(() => expect(first.get('status').textContent).toContain('Content published'));
    const refreshed = editor({ [key]: first.w.localStorage.getItem(key)! });
    await refreshed.load();
    expect(refreshed.get('long-content').value).not.toContain('Previously published story');
    expect(refreshed.warns()).toBe(false);
  });

  it('uses the latest revision when only preview flags changed on the server', async () => {
    const first = editor();
    await first.load();
    first.edit('Story saved before creating a preview link');
    const saved = JSON.parse(first.w.localStorage.getItem(key)!);
    saved.baseRevision = 'before-preview-sha';
    const refreshed = editor({ [key]: JSON.stringify(saved) });
    await refreshed.load();
    refreshed.get('publish').click();
    await vi.waitFor(() => expect(refreshed.get('status').textContent).toContain('Content published'));
    const request = refreshed.w.fetch.mock.calls.find(([url]: [string]) => url.includes('/admin/content/publish'));
    expect(JSON.parse(request[1].body).baseRevision).toBe('server-sha');
  });

  it('keeps the warning and does not claim selected media was saved', async () => {
    const e = editor();
    await e.load();
    e.edit('Story with media');
    e.get('blocks').__contentBlocks[0]._pendingUpload = { name: 'clip.mp4', size: 10 };
    e.get('save-draft').click();
    expect(e.get('status').textContent).toContain('Selected media files are not saved yet');
    expect(e.get('save-draft').disabled).toBe(false);
    expect(e.warns()).toBe(true);
    await e.load();
    e.get('save-draft').click();
    expect(e.get('status').textContent).toContain('Selected media files are not saved yet');
  });

  it('keeps changes made during a publish request unpublished', async () => {
    const e = editor();
    await e.load();
    e.edit('Submitted story');
    let finish: (value: Response) => void = () => {};
    e.w.fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    e.get('publish').click();
    await vi.waitFor(() => expect(e.w.fetch).toHaveBeenCalled());
    e.edit('Newer unsent changes');
    finish(new Response(JSON.stringify({ success: true, contentSha: 'next-sha' })));
    await vi.waitFor(() => expect(e.get('status').textContent).toContain('Content published'));
    expect(e.warns()).toBe(true);
    expect(e.get('publish').disabled).toBe(false);
    expect(e.get('long-content').value).toContain('Newer unsent changes');
  });
});


describe('project Save and existing browser drafts', () => {
  it('restores a legacy browser draft and preserves its exact bytes before writing', async () => {
    const legacy = editor();
    await legacy.load();
    legacy.edit('Existing creator story');
    legacy.get('save-draft').click();
    const original = legacy.w.localStorage.getItem(key)!;
    const upgraded = editor({ [key]: original }, true);
    await upgraded.load();
    expect(upgraded.get('long-content').value).toContain('Existing creator story');
    expect(upgraded.w.localStorage.getItem(key)).toBe(original);
    expect(upgraded.save().disabled).toBe(false);
    upgraded.get('save-draft').click();
    expect(upgraded.save().disabled).toBe(false);
    expect(upgraded.w.localStorage.getItem(key)).toBe(original);
    upgraded.save().click();
    await vi.waitFor(() => expect(upgraded.get('status').textContent).toContain('Project saved'));
    expect(upgraded.save().disabled).toBe(true);
    expect(upgraded.get('publish').disabled).toBe(false);
    const request = upgraded.w.fetch.mock.calls.find(([url, options]: any) => url.includes('/admin/campaigns/draft') && options?.method === 'POST');
    expect(JSON.parse(request[1].body).draft.longContent[0].body).toBe('Existing creator story');
    expect(upgraded.w.localStorage.getItem(key + ':recovery-v1')).toBe(original);
    expect(upgraded.warns()).toBe(false);
  });

  it.each(['server-sha', 'older-sha'])('preserves pre-snapshot drafts and upgrades only a matching legacy revision (%s)', async revision => {
    const original = JSON.stringify({ campaignSlug: 'deinonychus', title: 'Deinonychus', shortBlurb: '', longContent: [{ type: 'text', body: 'Older creator draft' }], baseRevision: revision });
    const e = editor({ [key]: original }, true);
    await e.load();
    expect(e.w.localStorage.getItem(key)).toBe(original);
    expect(e.get('long-content').value).toContain('Older creator draft');
    e.save().click();
    await vi.waitFor(() => expect(e.get('status').textContent).toContain(revision === 'server-sha' ? 'Project saved' : 'Project changed'));
    expect(e.get('long-content').value).toContain('Older creator draft');
    expect(e.w.localStorage.getItem(key + ':recovery-v1')).toBe(original);
    expect(e.save().disabled).toBe(revision === 'server-sha');
  });

  it('saves selected-project settings and keeps changes made during the request dirty', async () => {
    const e = editor({}, true);
    await e.load();
    e.edit('Submitted story');
    const field = e.w.document.querySelector('[data-settings-campaign="deinonychus"]') as HTMLInputElement;
    const other = e.w.document.querySelector('[data-settings-campaign="other"]') as HTMLInputElement;
    field.value = 'Submitted creator';
    other.value = 'Unrelated edits';
    let finish: (value: Response) => void = () => {};
    e.w.fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    e.save().click();
    await vi.waitFor(() => expect(e.w.fetch).toHaveBeenCalled());
    const sent = JSON.parse(e.w.fetch.mock.calls[0][1].body);
    expect(sent.changes).toEqual([{ path: 'creator_name', campaignSlug: 'deinonychus', type: 'string', value: 'Submitted creator', original: 'Creator' }]);
    field.value = 'New unsent creator';
    e.edit('New unsent story');
    finish(new Response(JSON.stringify({ success: true, baseRevision: 'draft:next-sha', hasWorkingCopy: true, hasUnpublishedChanges: true })));
    await vi.waitFor(() => expect(e.get('status').textContent).toContain('Project saved'));
    expect(e.save().disabled).toBe(false);
    expect(field.dataset.settingsOriginal).toBe('Submitted creator');
    expect(other.dataset.settingsOriginal).toBe('Other');
    expect(e.get('long-content').value).toContain('New unsent story');
    expect(e.warns()).toBe(true);
  });

  it('leaves unreadable browser data untouched during an attempted upgrade save', async () => {
    const original = '{unreadable creator backup';
    const e = editor({ [key]: original }, true);
    await e.load();
    e.edit('New edits retained in the editor');
    e.get('save-draft').click();
    expect(e.w.localStorage.getItem(key)).toBe(original);
    expect(e.get('long-content').value).toContain('New edits retained');
    expect(e.warns()).toBe(true);
  });

  it('keeps browser and editor data after a rejected server save', async () => {
    const e = editor({}, true);
    await e.load();
    e.edit('Keep all of this');
    e.get('save-draft').click();
    const backup = e.w.localStorage.getItem(key);
    e.w.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'Project changed elsewhere', code: 'campaign_revision_conflict' }), { status: 409 }));
    e.save().click();
    await vi.waitFor(() => expect(e.get('status').textContent).toContain('Project changed elsewhere'));
    expect(e.w.localStorage.getItem(key)).toBe(backup);
    expect(e.get('long-content').value).toContain('Keep all of this');
    expect(e.save().disabled).toBe(false);
  });

  it('does not overwrite another tab after a delayed load while keeping this editor intact', async () => {
    const e = editor({}, true);
    await e.load();
    e.edit('My unsaved story');
    let finish: (value: Response) => void = () => {};
    e.w.fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    e.get('load').click();
    const other = JSON.stringify({ campaignSlug: 'deinonychus', title: 'Deinonychus', longContent: [{ type: 'text', body: 'Other tab story' }] });
    e.w.localStorage.setItem(key, other);
    finish(new Response(JSON.stringify({ campaign: { slug: 'deinonychus', title: 'Deinonychus', longContent: [], baseRevision: 'live:latest' } })));
    await vi.waitFor(() => expect(e.get('status').textContent).not.toContain('Loading campaign'));
    expect(e.get('long-content').value).toContain('My unsaved story');
    e.edit('My next edit');
    e.get('save-draft').click();
    expect(e.w.localStorage.getItem(key)).toBe(other);
    expect(e.get('long-content').value).toContain('My next edit');
    expect(e.warns()).toBe(true);
  });

  it('keeps a replacement file selected while an earlier upload finishes', async () => {
    const e = editor({}, true);
    await e.load();
    e.get('long-content').value = JSON.stringify([{ type: 'image', src: '', alt: 'Still' }]);
    e.get('long-content').dispatchEvent(new e.w.Event('change', { bubbles: true }));
    const block = e.get('blocks').__contentBlocks[0];
    block._pendingUpload = { file: new e.w.File(['first'], 'first.png', { type: 'image/png' }), name: 'first.png', kind: 'image' };
    let finish: (value: Response) => void = () => {};
    e.w.fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    e.save().disabled = false;
    e.save().click();
    await vi.waitFor(() => expect(e.w.fetch).toHaveBeenCalled());
    const replacement = { file: new e.w.File(['second'], 'second.png', { type: 'image/png' }), name: 'second.png', kind: 'image' };
    block._pendingUpload = replacement;
    finish(new Response(JSON.stringify({ path: '/assets/images/campaigns/deinonychus/first.png' })));
    await vi.waitFor(() => expect(e.get('status').textContent).toContain('Selected media changed'));
    expect(block._pendingUpload).toBe(replacement);
    expect(block.src).toBe('');
    expect(e.w.fetch).toHaveBeenCalledTimes(1);
    expect(e.save().disabled).toBe(false);
  });

  it('publishes a saved draft and enables Save again for the next revision', async () => {
    const e = editor({}, true);
    await e.load();
    e.edit('Ready to publish');
    e.save().click();
    await vi.waitFor(() => expect(e.get('status').textContent).toContain('Project saved'));
    e.get('publish').click();
    await vi.waitFor(() => expect(e.get('status').textContent).toContain('Project published'));
    expect(e.save().disabled).toBe(true);
    expect(e.get('publish').disabled).toBe(true);
    e.edit('Unpublished next revision');
    e.get('save-draft').click();
    expect(e.save().disabled).toBe(false);
    expect(e.get('publish').disabled).toBe(false);
  });
});
