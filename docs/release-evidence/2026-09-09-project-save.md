# Campaign Save, Preview, and Publish — 2026-09-09

Status: deployed at `43792c91a3e0a32a106d05591247a3521ef0b8f0`.

## Behavior and data preservation

[PR #39](https://github.com/aindaco1/pool/pull/39) adds project-wide Save for new
and already-published campaigns. The existing Markdown schemas, validators,
media uploads, and preview renderer handle one saved working copy. Save does
not change canonical public campaign content or checkout. Preview saves first;
Publish explicitly promotes the saved authoring fields and clears hidden flags.
Fundraising remains governed by campaign dates.

Content's browser-local Save draft remains independent of project Save. The
storage key and format remain compatible; loading does not rewrite data. Before
an existing draft is overwritten, the editor stores its exact original bytes at
the same key with `:recovery-v1` appended. Recovery copies are retained.
Pre-snapshot drafts with a raw Git SHA can Save when that exact public revision
still matches; stale revisions fail without deleting the browser work.

Tests cover delayed responses, another tab writing during a load, unreadable or
full storage, typing during Save, and replacing a selected file during upload.
Pending files remain in the open editor until upload; browser-local Save draft
does not persist file bytes across closing/reloading the page.

Campaign media replacements use new URLs so unpublished edits cannot replace a
live asset. Saved copies and their media references survive archive operations
and legacy cleanup. New asset availability still follows the existing Pages and
media-processing deployment path.

## Verification

- Focused Worker, browser recovery, and atomic local-write suites: 113 passed.
- Local complete Chromium dashboard suite: 20 passed, including Save/Preview/
  Publish, staged Content and Diary media, local draft recovery, and responsive
  English/Spanish controls. The final older-format compatibility change also
  passed all 22 browser-recovery unit tests.
- Real Jekyll regression proves a working-copy sentinel cannot enter generated
  site output, even with `published: true` in its draft front matter. Generic
  localized protected-preview shells remain available.
- Syntax, i18n, and all four root/Worker production/full dependency audits passed;
  audits reported zero vulnerabilities.
- Local `npm run test:premerge` passed its source, unit, build, and security phases
  but stopped when the macOS Podman VM would not start. No VM reset or destructive
  repair was attempted.
- [Clean-main hosted baseline](https://github.com/aindaco1/pool/actions/runs/34417368538)
  passed at `d13331983febb1064e4aa4beb70d8b526b52f78a`.
- Final [hosted Merge Smoke](https://github.com/aindaco1/pool/actions/runs/34418487306)
  passed at `a375cd032881da782870f57a9fde9de13edec9d1`, including all four
  dependency audits and every pre-merge phase: full units, security, build
  artifacts, host Worker, Podman mutable-pledge, and headless E2E.

Responsive screenshots use synthetic campaign-user fixtures:
[desktop](./2026-09-09-project-save-desktop.png),
[tablet](./2026-09-09-project-save-tablet.png),
[mobile](./2026-09-09-project-save-mobile.png), and
[Spanish mobile](./2026-09-09-project-save-mobile-es.png).

## Deployment and acceptance boundary

[Deploy Production](https://github.com/aindaco1/pool/actions/runs/34419044608)
succeeded for the merge commit. Worker version:
`b66760a0-2ca3-4c89-9d6b-5ed2daafb082`. Worker deployment, Pages deployment,
cache purge, admin response-security verification, and the 16-URL crawl audit
passed. The diary check returned HTTP 200 with no new entries and zero messages.

Independent live checks at 2026-09-10 00:00 UTC (September 9 locally) passed:
English and Spanish admin pages contain the new Save control and use no-store;
the deployed script includes the draft endpoint and legacy recovery backup;
the protected preview shell retains its stylesheet and noindex metadata;
unauthenticated draft reads return HTTP 401 with no-store. Public campaign JSON
contains no working-copy metadata. The four-campaign catalog matched its exact
normalized pre-deployment contents, confirming this feature deployment did not
publish project content.

The automatic media optimizer completed processing but its pull-request step
[failed](https://github.com/aindaco1/pool/actions/runs/34418992857) while staging a
nonexistent `assets/audio` directory. The follow-up staging repair skips absent
untracked paths and still stages tracked deletions. Its actual shell command
passed a temporary Git-repository check covering absent directories, new audio,
removed audio, and preservation of unrelated untracked files. Original asset
uploads and the application deployment were unaffected by that optional step.
The repository also restricts Actions-created pull requests. That explicit policy
rejection leaves the generated review branch and a maintainer comparison link;
other PR-creation errors still fail. Repository permissions are unchanged.

[PR #40](https://github.com/aindaco1/pool/pull/40) merged that repair at
`4556f576b24c5d0e85a6ee7afec19e1ec6a5f364`. Its
[full hosted gate](https://github.com/aindaco1/pool/actions/runs/34419739479),
[first optimization run on main](https://github.com/aindaco1/pool/actions/runs/34420326910),
and [Pages refresh](https://github.com/aindaco1/pool/actions/runs/34420326877)
passed. The optimization run exercised the maintainer review-link fallback.

No actual user's browser storage was opened, migrated, or cleared during this
release. Draft compatibility was verified with legacy-format fixtures. No real
campaign Save/Publish, reviewer invitation, or fresh protected link was created
as a production test. The separate preview flag update already on main was
preserved in the merge.

## Security, ethical review, and rollback

Reviewed `docs/ETHICAL_RISK.md`. Save grants no reviewer access, extends no expiry,
and sends no invitations. Signed previews retain their no-store/noindex boundary
and disabled pledge controls. Editor roles, CSRF, optimistic concurrency, public
checkout, and runtime/settlement ownership remain enforced. Working copies use
the existing Git/media access model: a protected preview does not make a public
repository or known asset URLs confidential.

Rollback reverts the implementation and redeploys Worker plus Pages. Preserve
`_campaign_drafts/`, source media, browser draft keys, and recovery copies;
canonical `_campaigns/` files remain the published source throughout.
