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
- The local pre-merge gate stopped before its security/runtime/browser phases
  because the existing development stack occupies port 8787. Its isolation guard
  was preserved. Hosted verification subsequently completed the full gate.
- [Merge Smoke run 38480517980](https://github.com/aindaco1/pool/actions/runs/38480517980)
  passed on the production-synchronized fix. Every pre-merge phase passed,
  including security, Worker smoke, mutable-pledge smoke, and the complete
  headless E2E suite. All four hosted dependency audits passed.
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
does not alter those sources.

[PR 88](https://github.com/aindaco1/pool/pull/88) merged as
`18ff5dfbc200ce99617bdd05c7d23741150958ff` after all checks passed. The manual
[Deploy Production run 38481470777](https://github.com/aindaco1/pool/actions/runs/38481470777)
targets that exact revision for both Pages and the Worker. The redundant
Pages-only run for the same merge was cancelled in favor of this combined
deployment. The combined deployment completed successfully on October 13, 2026.

## Production verification

- Both the Worker and GitHub Pages deployment jobs succeeded, followed by cache
  purge, current admin response-security policy verification, and crawl-endpoint
  verification.
- Cloudflare confirmed deployment `d18aec2b-4d3c-4b37-b4ab-d1b8492cc15c`, created
  at 23:03:30 UTC, serving Worker version
  `38dc9c0c-bf3b-4a5a-b633-ccda6641b6a5` at 100% of traffic.
- The post-deploy cache audit passed all 11 targets at 23:04:27 UTC, including
  the homepage, campaign data/page/embed, generated assets, preview shell,
  management shell, private admin HTML, and unauthenticated admin session.
- An unauthenticated request to the Human Error campaign-preview API returned
  HTTP 401 with `private, no-store, max-age=0`.
- HEAD requests for Human Error's saved campaign and progress background images
  returned HTTP 200 with `image/png`. The later uploaded 11,761,223-byte MP4 also
  returned HTTP 200 with `video/mp4`; this is not evidence about the earlier
  reported 85 MB upload failure.

Authenticated visual acceptance is the local English/Spanish desktop/mobile
rendering recorded above. No live creator fields were modified for this release,
and no live payment or provider-delivery smoke was performed. Payment and email
behavior did not change. This final evidence update is documentation only;
the deployed application revision remains `18ff5df`.
