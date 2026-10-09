# Diary phases and rich-text paste — 2026-10-09

## Behavior

The dashboard offers Post-Production between Production and Fulfillment, with
English and Spanish labels. It stores the existing `post-production` phase used
by the public diary and protected preview.

Google Docs' normal-weight `<b>` clipboard wrapper no longer makes the entire
paste bold. Explicit clipboard font weights override semantic tag defaults;
the handler reads the source attribute because the dashboard CSP can prevent
CSSOM access to pasted styles. Supported bold, italic, list, and link content
remains intact.

Paste events from text nested inside a paragraph resolve to the enclosing
content editor. This retains block-mode paragraph boundaries instead of
flattening the update into inline text. Saved Markdown renders those paragraphs
separately when reopened.

## Verification

- Inspected the supplied Google Doc's actual clipboard markup and reproduced
  the normal-weight wrapper failure before the fix.
- Reproduced the screenshot's missing paragraph breaks with a paste event
  originating in a nested paragraph; the same regression passes after the fix.
- Focused Worker/editor/draft-recovery unit suites: 149 tests passed.
- Chromium dashboard regressions: five passed, covering nested and root paste,
  saved Markdown, re-rendered paragraph geometry, inline rich text, broader
  content editing, and Diary project Save.
- English and Spanish phase selection, ordering, and persistence passed in the
  preceding focused browser run; translation completeness and JavaScript syntax
  checks also passed.
- The local Jekyll/Worker stack serves the final handler. The user confirmed
  the initial bold-formatting correction before reporting the paragraph issue.

The hosted Merge Smoke workflow runs the full `npm run test:premerge` gate plus
root/Worker production and full dependency audits for the accompanying PR.
Hosted gate and deployment outcomes are recorded with that PR's Actions receipts;
local checks alone do not establish deployment or provider acceptance.

## Ethical and release boundaries

These are authoring controls and formatting corrections. No additional data,
permissions, communications, provider calls, or payment behavior is introduced.
Paste sanitization and the dashboard CSP remain in force. Existing campaign
content is not rewritten: creators re-paste any previously flattened text.

The Worker already accepts the phase, so its runtime source is unchanged.
Deployment follows the repository's production workflow. No live charge,
supporter mutation, or manual broadcast is needed to verify these changes.

Rollback reverts the diary/editor change commit and republishes the site.
Existing `post-production` entries remain valid in the content model.
