# Diary links, email formatting, and publishing progress — 2026-10-09

## Behavior

Diary emails use stable entry IDs from the campaign feed. English and Spanish
links open the correct phase and scroll to the entry; legacy entries without
IDs retain phase links. Existing date-based broadcast markers are recognized
when IDs become available, preventing a repeat notification.

Email excerpts use the shared editor Markdown parser, retain bold/italic/
underline, and truncate after 200 visible characters with balanced safe tags.
The plain-text alternative remains free of formatting markers. Unsupported
HTML and unsafe links cannot become active email markup.

Campaign Save and Publish use the Store-style progress treatment: media upload,
Saved, Deploying, and Live, with elapsed time, an indeterminate progress bar,
and the GitHub run link. Saved copies remain available after failures; Publish
can retry. Live requires a successful workflow for the published commit.
Local publishing reports that the local site rebuilds automatically.

The private campaign-scoped status endpoint reads bounded GitHub responses.
The Pages workflow accepts an immutable revision and records it in the run
title, so a moving branch cannot cause an unrelated run to report success.

## Verification

- Focused Worker, email, authorization, Diary-tab, and recovery suites: 312
  passing tests. The existing GitHub runtime suite also passed.
- Chromium at 1280px and 390px: actual polling states, failed deployment,
  retry without another Save, and success. The existing full content editor
  flow passed after correcting sticky-header scroll clearance.
- English and Spanish entry links passed against the local built campaign
  feed and pages, including the published “Update from Sabrina” entry.
- Rendered the actual Sabrina update through the email template in capture
  mode and inspected its HTML preview. No preview email was sent.
- JavaScript syntax and diff whitespace checks passed.
- Spanish Save/Publish labels and states, the authenticated shell axe check,
  and fixture-based entry links passed in a further four-test browser run.
- Local secret audit passed before pushing.

The accompanying PR runs the complete hosted `npm run test:premerge` gate
and root/Worker production/full dependency audits. Its Actions receipts record
the final tested revision and outcomes; local fixture results do not establish
production deployment or email-provider delivery.

## Boundaries and rollback

No authored campaign, supporter, payment, or suppression data is changed.
Production notification remains on the durable outbox; the existing-entry
idempotency checks remain in force. Status polling cannot publish, send email,
or write campaign data. New strings are localized in English and Spanish.

Revert the implementation commit and redeploy both site and Worker to roll
back. The entry IDs are existing campaign data and require no migration.
