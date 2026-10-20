# Human Error content replacement investigation — 2026-10-20

Status: the shared working copy was restored on October 20 without publishing.
A reproducible conflict-bypass defect has been fixed on the prevention branch;
application release verification is recorded below. The creator's original
browser was not inspected.

## Report and context

The creator reported that recent work in Content appears briefly after refresh
and is then replaced with older content. Reviewed the documentation index,
README, architecture, campaign content model, dashboard Save/Preview/Publish
and browser recovery contracts, Worker API, deployment and testing guidance,
ethical-risk guidance, and the September draft-recovery/project-save evidence.
Traced browser hydration, server content loading, project Save, Worker revision
checks, Git history, and the production campaign audit record.

The local checkout was behind current GitHub content. Remote file reads and
commit history, rather than the local campaign file, establish current state.
The pre-existing untracked October 13 video-upload investigation was preserved.

## Confirmed findings

- The saved working copy at
  [`cdab71d`](https://github.com/aindaco1/pool/commit/cdab71d48f5d0ed5fc060de39c796e5a1fead8e7)
  contains 17 long-content blocks: story, creator statement, team/crew images,
  biographies, budget explanation, and proof-of-concept video. Its saved time
  is October 14 at 00:50:36 America/Denver (06:50:36 UTC).
- The current working copy at
  [`18a610c`](https://github.com/aindaco1/pool/commit/18a610ce3d6e87f973be72362ac421f49a629ad3)
  replaces those 17 blocks with one follow-along paragraph and revises the short
  description. Its saved time is October 17 at 23:34:18 America/Denver
  (October 18 at 05:34:18 UTC). Other campaign settings, tiers, media references,
  and unpublished state are unchanged by that commit.
- A bounded read of the October 18 production audit keys found a
  `campaign:save` at 05:34:19 UTC with that exact commit SHA, followed by
  `campaign:publish_preview` at 05:34:28 UTC from the same collaborator account.
  Personal account details are omitted from this repository record. This
  identifies the authenticated session, not the person's intention or exact
  browser interaction. Preview normally saves current project edits first.
- The older source remains intact in Git history. The campaign remains
  unpublished. Recovery therefore does not depend on browser forensics for
  these 17 blocks.

## Why the content flashes

`hydrateContentDraft()` first displays the browser's saved content.
`loadContentCampaign()` then reads the current shared working copy. When the
browser draft equals its previously saved `publishedSnapshot`, the loader
replaces that cached copy with the server version. Despite its historical name,
that snapshot also tracks successful project Save, not just public publication.

This deliberately prevents an already-saved cache from silently replacing a
newer shared revision. With the confirmed 17-to-1 server replacement, it explains
the reported flash. Loading does not rewrite Local Storage. Browser work that
differs from its saved baseline follows the separate recovery/conflict path.

This differs from the September incident, whose old loader overwrote both the
editor and the browser backup. It does not establish how the October 17 session
ended up submitting the shorter content: intentional editing, stale editor
state, and a separate editor defect remain unproven. No blame or claim that the
creator's newest browser-only work has been recovered is warranted.

## Verification

- Downloaded production `/assets/js/admin-dashboard.js` and compared it with
  the repository's actual iterative minification helper: byte-for-byte equal,
  325,005 bytes, SHA-256
  `b60dfddda016ceb481b8fb1e02ae9e4db13d55a7e7aa11c974aca9ee2aa4264f`.
- A local JSDOM reproduction using that downloaded production asset and the
  historical/current campaign content, with every request mocked, showed 17
  blocks immediately after hydration and one after the server response. The
  original browser-storage value remained byte-for-byte unchanged.
- A separate reproduction with additional unsaved browser text retained all
  18 blocks after the server response, with unchanged storage.
- All six image URLs referenced by the earlier content returned HTTP 200 to
  read-only HEAD requests. The YouTube video was preserved by reference; its
  playback was not tested.
- `npx vitest run tests/unit/admin-content-draft-recovery.test.ts
  tests/unit/campaign-browser-draft-export.test.ts`: 28 tests passed across two
  files. No broad release gate was run for an investigation with no application
  code changes.
- The local restoration candidate parses as YAML and contains the exact 17
  previous blocks followed by the latest paragraph. Every field other than
  `long_content` matches current remote source; `published: false` is retained.

## Recovery preparation

Ignored local artifacts under `tmp/human-error-investigation/` contain the exact
old and current source snapshots, an 18-block merged recovery candidate,
readable recovered content, downloaded production script, and the reproduction.
These files are local investigation materials, not published campaign sources.

Before changing the shared working copy, preserve any newer work from the
creator's original browser and compare the recovered content with the intended
version. Do not clear site data or overwrite the reverted editor. If necessary,
export the campaign's English/Spanish primary keys and `:recovery-v1` copies
using the scoped procedure in [Dashboard](../DASHBOARD.md#recover-a-missing-browser-draft).

Apply only the reviewed content through the current project Save revision,
keeping the newer short description/settings and leaving Publish untouched.
Recheck the current remote revision before applying: another collaborator may
have saved since this investigation. Confirm both collaborators subsequently
see the restored shared version and compare any preserved local drafts.

At the end of the initial investigation, recovery was prepared but not applied.
No messages or invitations were sent, no
preview links were changed, and no authentication or personal browser data was
exported. The review protects creator work, collaborative revision checks,
unpublished visibility, and unrelated changes.


## Authorized restoration

The user approved restoration while retaining the newer description and
follow-along paragraph, without publishing. A fresh remote read confirmed the
working file still had blob SHA `b6e010b88f5d692389817fe67a8e99c35352aaa5`.
A SHA-conditional GitHub Contents API update restored the 17 historical blocks
followed by the latest paragraph, retaining every other field except the saved
timestamp. This was a direct Git-backed recovery, not a dashboard Save event.

[Restore commit c3090c8](https://github.com/aindaco1/pool/commit/c3090c89a76aa525485b901fa3eaaa6c2a67f74d)
was saved October 20 at 15:30:51 America/Denver (21:30:51 UTC).
Remote readback verified all 18 blocks, the newer description, and
`published: false`. The public campaign source retained its exact prior blob
SHA `5062a823b56962354da793e2a40529c51fc99b09`. No Publish, deployment dispatch,
preview invitation, or email action was performed. Draft-only changes are
excluded from the Pages push trigger.

## Reproduced overwrite path and prevention

The October 17 browser session is not available, so its exact clicks remain
unconfirmed. The current production source nevertheless has a deterministic
conflict-bypass defect consistent with the reported collaborative overwrite:

1. Creator A has browser-only edits based on an older campaign revision.
2. Creator B saves different content to the shared working copy.
3. A reload restores A's edits and retains A's old revision, but replaces the
   in-memory `contentPublishedSnapshot` with B's new server baseline.
4. Loading again, or typing and then refreshing, treats that new baseline as
   evidence that only metadata changed. It assigns the current shared revision
   to A's old content without merging B's work.
5. Save (including the save performed by Preview) submits the stale content
   with a valid current revision. The Worker correctly validates the supplied
   revision, so it accepts the destructive replacement.

Two new tests failed against the unchanged source: another content load, and a
description edit followed by a fresh page. Both submitted the collaborator's
revision instead of the original revision. The fix keeps the original revision
and content baseline together. Working-copy revisions must match exactly,
including for older browser data that already contains a mismatched snapshot or
no revision. The limited same-content public-preview metadata compatibility
path remains available when no shared working copy exists.

English/Spanish status text now identifies a restored-draft conflict on load.
The fix preserves local/recovery storage, pending edits, the Worker revision
check, campaign scope, and unpublished state. It changes no checkout, payment,
email, analytics, permissions, or Worker persistence contract. Old open
dashboards need the corrected application asset before this client-side
protection applies.

### Prevention verification

- Focused browser-draft/export and Worker administration suites: 156 tests passed.
- New coverage includes repeated loads, editing and refreshing, already
  contaminated baseline/revision pairs, and missing revisions.
- JavaScript syntax, i18n completeness for English/Spanish, and whitespace
  checks passed.
- The local Chromium dashboard run passed 38 tests; the remaining login test
  exposed a pre-existing fixture URL fixed to port 4000. The fixture now uses
  the configured site origin. That test and the English/Spanish conflict cases
  then passed together (three tests), against the minified build on port 4317.
- Jekyll build, minification, executable performance budgets, and secret audit
  passed. No local credentials were loaded into the isolated worktree.
- The complete pre-merge gate runs in GitHub's isolated environment because
  local ports 4000 and 8787 belong to an existing Podman stack.
- Complete hosted pre-merge results are recorded after completion.

Synthetic conflict-state screenshots:
[desktop](2026-10-20-draft-conflict-en-1280.png),
[tablet](2026-10-20-draft-conflict-en-834.png),
[mobile](2026-10-20-draft-conflict-en-390.png), and
[Spanish mobile](2026-10-20-draft-conflict-es-390.png).
