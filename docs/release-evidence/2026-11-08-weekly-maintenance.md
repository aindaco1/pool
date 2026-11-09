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

The scheduled Podman failure came from Playwright importing `sales-tax` through
Worker source without the Worker's dependency volume. Adopt Store's existing
read-only mount pattern, discover the mounted volume from the running Worker,
and fail if absent. Include the locked Playwright version in the image tag and
use `npm ci` to keep container dependencies reproducible.

Hosted container testing exposed slow cold static-file delivery after the missing
dependency was repaired. The unchanged three-second dashboard gate failed in two
workflow attempts; a keyboard checkout test also timed out. The trace shows most
dashboard time before the mocked API requests. Six local repetitions of the
originally affected cases passed with retries disabled. CI now passes its existing
mode to the Jekyll container and serves a fixed build with `--no-watch`, matching
the host Playwright configuration; normal editing retains polling. This removes
unneeded filesystem polling during CI without loosening any timing gate. Final
hosted verification is recorded on the pull request.

## Validation

- `npm ci` at root and Worker, plus `npm run test:dependencies`: pass, zero vulnerabilities in production and full audits.
- `npm run test:premerge`: pass. Full unit suite: 1,230 passed, one existing skip. Browser suite: 178 passed, three existing content-dependent skips. Security, build artifacts, host Worker, and Podman mutable-pledge smoke pass.
- The exact reported JPEG candidate is rejected before replacement while retaining the original bytes. Focused regressions cover accepted write/check modes, evidence mismatch, failed decoding, and candidate cleanup.
- An isolated checkout ran the optimizer and final validator on the reported JPEG: original bytes retained, four responsive derivatives validated, manifest consistency passed. Its generated artifacts are rehearsal evidence, not published assets.
- Container follow-up: regression fixtures failed before the mount change and pass afterward (20 focused wrapper/tooling tests). All 22 checkout-edit cases pass through the real Podman wrapper with the Worker dependency volume mounted read-only. The full premerge result above precedes this shell-only follow-up; hosted CI validates the final revision.
- Fixed-build CI serving: three new shell cases fail before the change; all 16 site/wrapper/connection tests pass afterward. Fifteen repeated real Podman dashboard and keyboard-flow checks pass with browser retries disabled. The three-second dashboard budget is unchanged.
- No campaign assets, settings, provider state, Platform pin, or production deployment changed.

## Rollback

Revert the maintenance commit as a unit, including package/lock pairs and the
Playwright container. The previous media behavior would again let metadata-changing
candidates reach the final fail-closed validator. No data migration is involved.
