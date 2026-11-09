# November 8 maintenance

Base: `5c72260d5795a6cc3c7d6bf5e8a9d525f29b28a0`.

## Changes

Consolidate dependency PRs #104–#110 with their required companions: Vitest and
coverage both 5.0.5, Playwright and its container both 1.64.1, axe 4.14.0,
Lighthouse 13.6.0, Vite 8.3.5, and Worker Wrangler 4.156.0. Retain exact reviewed
Actions commit pins. The dependency security gate remains unchanged.

The reported JPEG optimization failure reproduces with jpegtran: the decoded
pixel SHA-256 is identical but sample-aspect evidence changes from `0/1` to
`1/1`. Keep the source instead of weakening the validator. The existing
inspection code now lives in one consumer-owned module used before replacement
and by the final validator. Smaller candidates with different evidence are
removed with a skip reason; decoder failures fail closed and remove the
candidate. Responsive derivatives remain available.

Platform's rational normalization is unchanged: unspecified and square aspect
ratios are not universally equivalent. Filesystem decoding, optimizer choice,
and source-publication policy remain Pool-owned.

## Validation

- `npm ci` at root and Worker, plus `npm run test:dependencies`: pass, zero vulnerabilities in production and full audits.
- `npm run test:premerge`: pass. Full unit suite: 1,230 passed, one existing skip. Browser suite: 178 passed, three existing content-dependent skips. Security, build artifacts, host Worker, and Podman mutable-pledge smoke pass.
- The exact reported JPEG candidate is rejected before replacement while retaining the original bytes. Focused regressions cover accepted write/check modes, evidence mismatch, failed decoding, and candidate cleanup.
- An isolated checkout ran the optimizer and final validator on the reported JPEG: original bytes retained, four responsive derivatives validated, manifest consistency passed. Its generated artifacts are rehearsal evidence, not published assets.
- No campaign assets, settings, provider state, Platform pin, or production deployment changed.

## Rollback

Revert the maintenance commit as a unit, including package/lock pairs and the
Playwright container. The previous media behavior would again let metadata-changing
candidates reach the final fail-closed validator. No data migration is involved.
