# Diary Publish validation repair — 2026-10-09

## Cause and recovery

Publish first saves current edits. A save of an italic-only Diary revision
returned 422 with `Featured tier must be one of the saved project tiers.`
The campaign reader stopped at an indented continuation of a plain YAML tier
description. It silently returned a partial tier list. Publishing the working
copy then serialized that partial list into the public campaign source.

The saved sunder draft retains all six tiers. This repair restores only its
`tiers` block to the public source, preserving all Diary content and other
published fields. The restored tiers match both the intact working copy and
the standard YAML reader, including prices, images, and shipping data. The
saved draft and public source now differ only in publication/preview metadata.

## Behavior and verification

- The Worker folds indented plain-text continuations before reading subsequent
  fields or entries. Blank lines retain paragraph separation; comment lines do
  not terminate the document.
- Incomplete parses fail before any save or publish write. Existing source and
  browser edits remain available. Validation still requires a real featured tier.
- The action bar explains missing featured tiers and unreadable saved sources
  in English and Spanish instead of replacing them with a generic settings error.
- Regression tests save and publish an italic Diary edit with wrapped tier
  descriptions, preserve the featured tier and later fields, and save again.
  They cover equal saved/live data with an old base hash, malformed-source
  rejection without writes, and browser edit/recovery retention after a 422.
- All current published and saved campaign sources parse completely. The focused
  Worker and editor recovery suites passed 146 tests; the Chromium saved-copy
  refresh check passed. Syntax and whitespace checks passed.

The PR runs the full hosted pre-merge gate and root/Worker production/full
package audits. Actions and PR receipts record the tested and deployed revision.
No manual broadcast or test email is sent. Existing-entry notification
idempotency remains unchanged. The user's pending italic changes remain in the
open editor for their retry after deployment.

## Rollback

Retain the restored sunder tiers if reverting the implementation. Reverting the
parser reintroduces the truncation risk; pause campaign publication until the
reader is repaired. Saved copies and browser recovery data are retained.
