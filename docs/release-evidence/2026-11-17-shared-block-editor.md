# Shared block editor migration — 2026-11-17

Runtime source: `cee38d48714fafc50366fb3a2a716f23b24c3c7d`, based on
`f8cdae989f35a26bdbff1de2078a99032ee2ae6a`. Platform:
`fa363d72d3e5c15dbdb6f9596bb80c41ebbbda8d` (0.50.0; Admin Shell 0.15.0).

The shared composer owns the block model, toolbar, ordering, type/alignment
changes, slash splitting, accessibility and event routing. Pool retains media
fields and upload lifetime, URL/clipboard policy, undo, paired revision/draft
recovery, context switching, email restrictions, preview, save and publish.
No campaign content, storage schema or Worker implementation changed.

## Acceptance

- Node 26.12.1 on macOS; current lockfiles; isolated checkout and local test state.
- Three before/after dashboard characterizations pass: all eight blocks and
  gallery metadata survive reorder, text/quote conversion preserves words and
  alignment, and insertion/deletion/slash actions preserve editor behavior.
- Same-input JSDOM comparison found identical DOM attributes, hierarchy, text
  and saved JSON before/after migration, including after moving a gallery.
- The 36 existing editor and draft-recovery tests pass unchanged apart from
  loading the shared script in their fixtures.
- `npm run test:premerge` passes: 1,252 unit tests (one skipped), 127 security
  tests, build/performance checks, Worker/pledge smoke and 178 browser tests
  (three existing fixture-dependent skips).
- A separate real Chromium fixture exercised rich-text input, gallery insertion
  and slash-created quotes using the actual dashboard source and built CSS at
  1280px and 390px. Screenshots were inspected; no script errors occurred.
  These fixtures and the automated browser suite simulate provider responses;
  they are not evidence of live payments, publishing or email delivery.
- Platform's 401 tests and clean-checkout recipe checks pass on the pinned SHA.

## Approved development dependency exception

On November 17, 2026, the repository owner explicitly authorized: “Approve a
scoped development-only exception and deploy.” This approval is limited to
this shared block editor release and its existing locked picomatch 4.0.7
Vite/Vitest development dependency chain, covering
[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf).
It expires December 1, 2026. Subsequent releases must recheck for a supported
fix; this is not a standing waiver or permission for later dependency changes.

Both root production audits and full Worker audits are clean. The refactor
changes no dependency versions. The affected package is development tooling,
not deployed application code, and authored content does not supply its glob
patterns. The remaining risk is tooling denial of service from malicious glob
patterns. The advisory currently lists no patched release.

The full root audit remains a failed check and must remain visible. Its CI job,
threshold and classification are unchanged. The owner's approval authorizes
this specific exception to the normal all-audits-pass release rule. Deployment
still requires the remaining smoke checks to pass. No live payment, email or
content mutation is part of the release validation.

Rollback: revert the consumer migration, including its Platform gitlink and
adapter, together. No data rollback or migration is needed. Original user
checkouts and their unrelated local work were left intact.
