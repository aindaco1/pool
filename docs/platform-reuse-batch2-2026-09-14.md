# Platform reuse batch 2 — September 14, 2026

## Scope

Release Core 0.4.0 now owns retention selection, evidence-age classification and read-only receipt inspection. The scripts retain file discovery, deletion/copy execution, acknowledgement checks, product configuration and recovery. Site Shell 0.3.0 owns video poster observation, preview/canvas lifecycle and cleanup. Consumer markup supplies its global/cache names and URL policy.

Pool retains document-base and opaque-origin preview behavior, including the Worker-rendered preview script.

The old poster file is removed; layouts load the pinned shared entry directly. Starter recipe sources are excluded from public Jekyll output and the build gate checks that exclusion.

## Immutable source and validation

- Previous consumer release source: `f28c04fb1b4e42ebba3a2c816e3b5b24e464b88f`.
- Characterization-only commit: `3f67f8f6b78d013ca02d445deeaead4652275df1`.
- Previous Platform pin: `30b1cf9c1154b6f38e3da34fc7b2ed3b6d312088`.
- New Platform v0.38.0 pin: `8609b10348da42f20e51b5a9048e074a3a3ae5e2`.

Before extraction: 13 backup tests and 4 poster tests passed. After extraction: the same 17 tests passed. Real Chromium 151 decoded synthetic WebM and produced a 128x72 JPEG with no page errors before and after migration; cross-origin requests were rejected and explicit posters retained. The full merge smoke gate is required before merging, including build, security, Worker smoke and browser coverage.

Local consumer tests: 952 passed; 1 existing skip. Hosted merge smoke remains required.

Platform release checks establish the shared contract separately. Consumer CI,
deployment versions and live checks are recorded in this migration's pull request;
a source pin is not a claim of production acceptance.

## Independent rollback

The characterization commit retains the previous implementation and Platform pin.
Reverting the following migration commit restores the old source, gitlink,
package/version expectations and lockfile together while retaining the behavior
tests. Initialize submodules, run npm ci (also in worker for this project's Worker
subdirectory if present), run the complete release gate, and redeploy this consumer's
reviewed prior release. The rollback does not change another consumer.

No storage/schema migration is introduced. Do not roll back only the gitlink:
the adapters and shared script paths must move with it. Retain the previous
production deployment version for immediate rollback while source checks run.
