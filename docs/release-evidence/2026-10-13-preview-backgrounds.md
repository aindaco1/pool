# Protected preview backgrounds — 2026-10-13

## Change

The Worker full-page preview omitted `campaign_background` and
`progress_background` even though Save preserved both fields and the public
Jekyll templates rendered them. The preview now renders the saved campaign
background, funding-bar background, and support-item progress backgrounds using
the public templates' existing CSS classes. A small shared preview helper
resolves and escapes each asset URL and marks these images as decorative.
Campaign artwork loads eagerly; progress artwork retains lazy loading.

The saved working copy remains the source for Preview. Clearing a background
removes its image element on the next saved preview. Existing source/public
separation, disabled pledge controls, preview permissions, localized routes,
private caching, and sandbox/CSP behavior remain in place. Static asset delivery
is still required for newly uploaded image URLs.

## Verification

- Added English/Spanish API regressions through an assigned creator's Save and
  Preview flow. Both failed against the original renderer and pass with the fix.
  They cover all three image placements, absolute URL resolution, decorative
  accessibility attributes, private caching, removal, and unchanged public source.
- Full unit suite: 1,115 passed, one existing skipped test.
- Pre-merge secret audit, template drift, syntax, focused suites, release-command
  sanity, and Jekyll build/artifact checks passed.
- The complete pre-merge gate stopped before its security/runtime/browser phases
  because the existing development stack occupies port 8787. Its isolation guard
  was preserved. Full-gate completion is not claimed.
- Focused Chromium protected-preview suite: two passed, covering English/Spanish
  playback, opaque sandbox/CSP, token removal, and access loss.
- Rendered the actual updated Worker HTML in the built protected preview shell
  with a synthetic campaign and existing Sunder artwork. Inspected English at
  1440 px and Spanish at 390 px. All three backgrounds decoded, retained their
  existing opacity (0.1 campaign, 0.4 funding bar, 0.25 support item), and produced
  no horizontal overflow. Local screenshots and measurements are in ignored
  `tmp/preview-backgrounds/{en,es}.png` and `rendered.json`.
- Root and Worker production/full dependency audits: zero vulnerabilities.
- `git diff --check` passed.

## Risk and release boundary

This corrects a visual omission using existing saved image references and styles.
No new data collection, email, permission, payment, publication, or storage path
is introduced. Decorative images have empty alt text and are hidden from assistive
technology. Blank references do not emit broken images. No inline CSS, new script,
or weaker preview security policy is required.

Production changes through `6301e0c9b91b8a44f4795ff8cb37bcf7ddce9308` were
fast-forwarded into the local checkout before preparing this release. They
include the latest saved campaign content and uploaded media. The preview fix
does not alter those sources. The complete hosted Merge Smoke gate and the
production deployment are pending; deployment completion will be recorded here.
