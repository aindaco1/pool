// Paste this entire script into Chrome's Console on pool.dustwave.xyz.
// Preserve the original editor tab: do not reload or navigate it first.
(() => {
  'use strict';
  const slug = 'deinonychus';
  if (location.origin !== 'https://pool.dustwave.xyz') {
    throw new Error('Run this on https://pool.dustwave.xyz in the Chrome profile used to edit the campaign.');
  }
  const drafts = ['en', 'es'].map(language => {
    const key = `pool-admin-content-draft:${language}:${slug}`;
    try {
      return { key, raw: localStorage.getItem(key) };
    } catch (error) {
      return { key, raw: null, error: String(error.message || error) };
    }
  });
  const value = id => document.getElementById(id)?.value || '';
  const blocks = document.getElementById('admin-content-blocks');
  const ownEditor = value('admin-content-campaign') === slug && blocks?.dataset.contentCampaignSlug === slug;
  const editor = ownEditor ? {
    title: value('admin-content-title-field'),
    shortBlurb: value('admin-content-short-blurb'),
    longContentJSON: value('admin-content-long-content'),
    visibleText: blocks.innerText || blocks.textContent || ''
  } : null;
  const report = { campaignSlug: slug, origin: location.origin, exportedAt: new Date().toISOString(), drafts, editor };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `deinonychus-recovery-${Date.now()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  console.table(drafts.map(draft => ({ key: draft.key, storedCharacters: draft.raw?.length || 0, error: draft.error || '' })));
  console.info('Recovery export downloaded. Keep this file for review. It preserves surviving data; it cannot undo an overwritten draft.');
  return report;
})();
