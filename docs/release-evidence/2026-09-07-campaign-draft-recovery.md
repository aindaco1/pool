# Campaign draft loss investigation — 2026-09-07

Status: local fix and automated verification complete; not deployed. Baseline:
`9129bed9714f74bb664d9878a9006fadf19cd6e5`. Recovery of the creator's original
browser data is pending access to that browser/profile.

## Incident and evidence

The reported campaign name matches repository campaign `deinonychus`
(Deinonychus). The user places the refresh after the preview fix deployed
today. The creator used Chrome; the original profile/device has not been inspected.

The live GitHub file history was checked through the GitHub API and agrees
with the local checkout. Its four revisions are:

- `b4cb976`, 16:54:02 UTC: creates the preview-only campaign with empty
  `long_content`, tiers, and other content collections.
- `5702c13`, 18:03:03 UTC: enables preview access and records its timestamp.
- `6b1fac8`, 18:05:54 UTC: updates only the preview timestamp.
- `45f8c91`, 18:17:14 UTC: updates only the preview timestamp.

No revision contains the missing authored content. The existing super-admin
dashboard on this Mac also shows an empty content editor. This is not the
creator's original browser and does not establish the contents of her storage.

The prior preview fix `e4bedba`, deployed through merge `8ded609`, changes
Jekyll preview-shell generation. It does not change the dashboard's save/load
code. The reported refresh is consistent with triggering an existing bug after
the deployment; there is no evidence that the deployment deleted server content.

## Reproduced failure

`writeContentDraft` writes the Content editor to browser Local Storage under
`pool-admin-content-draft:<language>:<slug>`. The dashboard can hydrate that
draft, but `loadContentCampaign` then unconditionally replaces the fields with
the server copy and calls `writeContentDraft` again. For a newly created
campaign, the empty server content replaces both the editor and its stored
browser draft.

Save draft also resets the same dirty baseline used by Publish and the shared
beforeunload guard. Saving locally therefore disables Publish and suppresses
the warning even though the content has not been published. Storage exceptions
are swallowed, so a failed browser write can still show a successful save.

Four regression tests failed against the original source and passed after the
fix: fresh-page recovery, Publish/warning after Save draft, failed storage, and
read-only campaign loading.

## Local fix

- Restore local drafts without writing server loads or preview rendering into
  browser storage; ignore late responses for a different campaign and preserve
  typing/staged files while a load is pending.
- Track local-save and server-publication baselines separately. Keep Publish
  and the leave-page warning active for unpublished content after Save draft.
- Verify local write/readback, preserve unreadable data and detected changes
  from another tab, and surface save failures.
- Explain in English and Spanish that selected media files are still in memory
  until upload. Saving text cannot claim those files were saved.
- Preserve revision checks for unpublished content. Refresh the revision when
  the server content still matches the original baseline, allowing preview-only
  metadata updates without a spurious content conflict. Do not restore a cache
  of already-published content over a newer server version.
- Keep edits made while publication is in flight marked as unpublished.

No Worker storage, public visibility, campaign content, email, or payment
mutation is part of this fix.

## Verification

- Final full unit suite: 920 passed, one existing skip, across 100 files.
  Includes 13 draft-recovery regressions.
- Complete Chromium dashboard suite: 15 passed, including the actual browser
  beforeunload dialog followed by a reload that restores the saved content.
- Jekyll build and generated-asset minification passed. Asset budgets passed:
  691,555 JavaScript bytes and 235,830 CSS bytes.
- The refresh-recovery and staged-media browser cases passed again against the
  final minified build (two tests).
- The campaign-scoped Chrome console export has four passing regression tests
  covering exact raw values, matching editor text, empty/error results, origin
  restriction, and absence of storage/network mutations. The export and draft
  recovery suites passed together (17 tests).
- All four dependency audits (root/Worker, production/full) passed with zero
  findings. Locale completeness, secret audit, pinned-template drift, JavaScript
  syntax, and diff whitespace checks passed.
- The full `test:premerge` wrapper was not run: it unconditionally kills the
  listener on port 8787, currently owned by the independent Film development
  Worker. The dashboard tests used mocked Pool endpoints and a separate static
  server; they did not call or stop Film. Hosted/full merge-gate verification
  and production deployment remain outstanding.

## Recovery status and next step

The missing content has not been recovered. Content-preview requests only
validate/render, and preview-reviewer KV records retain access information,
not authored page text. GitHub has no saved content revision for this campaign.

Inspect the creator's original browser profile and site origin before any
further admin reload or edits. Export both candidate keys verbatim:

- `pool-admin-content-draft:en:deinonychus`
- `pool-admin-content-draft:es:deinonychus`

The reviewed [Chrome console export](../../scripts/export-campaign-browser-draft.js)
downloads those raw values and matching open-editor text without changing
storage or sending network requests. It is an extraction aid, not an undo for
overwritten browser database records.

Preserve any still-open editor text and the original media files. If those keys
were overwritten, a profile/device backup from before the refresh or forensic
work on a preserved profile copy may be the remaining recovery path; success
is not guaranteed. Do not request or export unrelated browser data or tokens.
The operator procedure lives in [Dashboard](../DASHBOARD.md#recover-a-missing-browser-draft).

## Ethical risk review

The affected users are campaign creators who depend on saved work. The main
risks are misleading save status, destructive refresh behavior, and exposing
private drafts during recovery. The fix preserves the existing browser-local
storage boundary, adds truthful status and warnings, and keeps server revision
checks. Recovery exports must be limited to this campaign's draft keys. Selected
files still require upload, browser storage can still be cleared or fail, and
browser warnings are not a substitute for a durable server backup. No additional
tracking, server draft collection, public publication, or invitation send is
introduced.
