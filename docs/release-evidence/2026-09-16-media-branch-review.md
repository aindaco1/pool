# Media branch review — 2026-09-16

## Reviewed output

Eight remaining media bot branches were compared with current campaign sources.
Every source blob still matched the parent of its generated branch. The seven
image branches contribute 28 responsive WebP files and four losslessly compressed
source images. All variants decode, have their named widths, and are smaller
than their source. Decoded RGBA hashes of all four compressed sources match the
originals; source compression saves 9,235 bytes. Representative hero, content,
and progress variants were visually inspected.

The video branch is rejected: its VP9 WebM is 62,284,168 bytes versus the existing
24,249,508-byte MP4. Both decode at 1276 × 720, but the derivative increases
transfer size by 157%. The original MP4 and its campaign reference remain intact.
The rejected derivative is retained in a local recovery archive.

The deterministic media manifest is rebuilt from the current repository with the
existing Podman media tooling. Old branch manifests and campaign configuration
are not copied over current state. No campaign wording, pricing, visibility,
customer data, or permissions change.

Accepted branch tips:

- `3f4159489645a16ca59b7e97fc2636737d84e5be`
- `683a5dfa427ae817f431e26f025a0d36aedd3fab`
- `2daf54ad8d36c9b0bfc3fc5626c5ca5e523440f6`
- `272875f69b8e31342b5b52a684530fb9a6c85120`
- `c4b4d04d17615a7c4cdec3f368ee8a86e601ee3a`
- `d62b141df39ca17512b9b8a3600be7b499448333`
- `48e4627ff1737622ad9dec6d1716a751b2703fdc`

Rejected video tip: `7715059382f09d9f7fd30d75ab31c5e02f9d45d0`.

## Verification and rollback

Focused media and Platform-pin suites pass all 14 tests. Revert this consumer
commit to restore the previous media and manifest; the MP4 and all source files
remain available. Branch refs are removed only after accepted output is merged,
with the original branch tips retained in a verified Git bundle.

## Completed release acceptance

- [PR 57](https://github.com/aindaco1/pool/pull/57) merged at
  `443ce6c504db012885210f3b9e64d60dda9627e0`.
- Local pre-merge checks passed 1,013 unit tests (one existing skip), 127 security
  tests, builds, metadata checks, and the mutable-pledge smoke test. The first
  browser run had 124 passes, five retry passes, one failure, and three skips.
  All six timing-sensitive cases passed an isolated single-worker rerun without
  code changes. The initial traces are retained locally for diagnosis.
- The [hosted Merge Smoke gate](https://github.com/aindaco1/pool/actions/runs/35152084933)
  passed, including dependency audits.
- [Production Pages refresh](https://github.com/aindaco1/pool/actions/runs/35152799425)
  passed, including cache purge, admin response policy, and public crawl checks.
  [Provider evidence](https://github.com/aindaco1/pool/actions/runs/35152799391)
  also completed successfully.
- A fresh browser reload of the public Deinonychus campaign confirmed that the
  content image renders from the new `cf9b1fc2-960.webp` derivative and that the
  video still uses `video-20260916-144404-dfbc1cf8.mp4`. The published hero and
  campaign layout were visually checked.
- The post-merge [media workflow](https://github.com/aindaco1/pool/actions/runs/35152799413)
  reported zero changes and created no replacement bot branch. A local manifest
  check likewise reported zero drift.
- All eight reviewed bot refs were archived in a verified Git bundle and removed
  with exact expected-SHA guards after accepted files were verified against
  merged main. The merged review branch was also removed.

Generated build and test output was moved to a local recovery folder in Trash.
Development dependencies, local configuration, Worker state, fixtures, and
Podman images and volumes remain available. The Podman client was updated from
6.1.1 to 6.1.2 to match the running VM; `podman:doctor` passed without restarting
the VM.
