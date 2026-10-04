# Actions and admin media review — October 4, 2026

## Scope and current fixes

Reviewed all 1,697 available Actions runs at the start of this review, including
72 failures: 38 media, 21 Merge Smoke, 7 deployment, 5 Podman E2E, and 1 Pages
refresh. Historical failed records remain in GitHub; later successful runs are
recorded below instead of rerunning old source or deployment revisions. Logs that
GitHub no longer serves cannot establish an exact historical cause.

- **Media:** lossless optipng output keeps the decoded pixels but reduces PNG
  density aspect ratios such as `11811/11811` to `1/1`. Hashing the raw FFmpeg
  framehash text falsely rejected this. The shared media helper reduces only
  equivalent sample-aspect-ratio fractions. Pixel hashes, geometry, timing,
  frame count, and different aspect ratios remain protected. Real optipng
  reproductions of all three PNG paths reported since September 30 pass.
- **Podman E2E:** the physical-shipping fixture left tax quotes connected to the
  real Worker despite mocking pledge/shipping data. It now supplies a matching
  deterministic tax quote. The admin mobile-preview containment assertion waits
  for the iframe stylesheet to settle while retaining the same size bounds.
  Fixture-driven cart tests initialize the runtime before inspecting content.
  Direct Playwright startup now uses Jekyll without watching; the prior Python
  server reproduced intermittent `ERR_CONNECTION_RESET` for cart scripts in both
  the primary and a fresh checkout.
- **Dependency PRs:** [#72](https://github.com/aindaco1/pool/pull/72) now pairs
  Playwright 1.63 with its container image. [#73](https://github.com/aindaco1/pool/pull/73)
  and [#74](https://github.com/aindaco1/pool/pull/74) each update Vitest and its
  coverage provider together to 5.0.2, with matching-version assertions and a
  Dependabot group to keep future major updates together. These two PRs now
  carry the same paired update; merge only one, then close the redundant PR.
  All five original open PRs (#70–#74) have passing hosted Merge Smoke and
  production/full root/Worker audits. #70 and #71 needed no changes.
- **Admin images:** all scalar, product, tier, decision, and content image
  controls can clear their reference. Staged replacements are discarded; late
  scalar upload responses cannot restore removed images. Content and gallery
  fields can remain empty through Save/Preview/Publish. Captions and entries
  survive; empty image elements are omitted from public and protected output.
  The control does not delete repository files; existing publication cleanup
  policies remain in effect. English and Spanish labels are included.

## Shared package adoption

[Platform PR #53](https://github.com/aindaco1/dust-wave-platform/pull/53) adds
`@dustwave/media-core/frame-hash` in media-core 0.5.0 and reusable
`createMediaRemovalControl` in admin-shell 0.13.0 / workspace 0.43.0.
Pool uses the shared removal control for scalar fields and Content/Diary/Blast
blocks, including gallery items and posters. The control owns button state and
upload invalidation; Pool adapters retain labels, field updates, pending-preview
cleanup, undo history, focus, and Save/Publish. Existing consumers opt in without
changing their editor or storage contracts.
Pool pins commit `e28d2773f3060700f9483a44705038fc436570d1`, upgrading from
`60d439b887f1244f82ff232c849d74152b28c776` (workspace 0.40.0). Other projects
can import the same bounded, dependency-free normalizer. Source inspection,
Git publication, and Pool's validation decisions remain consumer-owned.
The shared Node 22/24, Jekyll, native, desktop, and Qt CI matrix passes.

Rollback the gitlink, validator and admin adapters, and pin/version assertions together;
restoring just the old gitlink leaves an unresolved import. No storage or content
migration is introduced. This is a source review, not production acceptance.

## Validation

- `npm run test:premerge` passes at Pool `debf852302accfef64b142dabe8810bd0a730f97`
  in a fresh managed checkout: 1,075 unit tests pass (one skipped), all 127
  security tests pass, and 143 browser tests pass (three skipped). Secret audit,
  shared-template drift, syntax, focused regressions, release-command sanity,
  build artifacts, host Worker smoke, and Podman mutable-pledge smoke pass.
  The latter proves create/modify/cancel totals and inventory coherence.
- The original CloudDocs checkout encountered `pread: Input/output error` and
  stale-file-handle errors in local Wrangler state. No existing state was
  deleted. Repeating the entire gate with fresh state outside iCloud passes.
- Focused Worker regressions prove empty image references survive Git-backed
  Save, reload, protected Preview, and Publish. Browser cases cover English and
  Spanish scalar fields, tiers, products, decisions, staged Content images,
  gallery slots, posters, Diary and Blast editor state, and clearing during a
  delayed logo upload. Blast tests use mocked requests and send no email.
- All 18 repeated Markdown/cart inventory browser cases pass without retries
  after the fixture/server correction.
- Shared package tests and the [platform CI matrix](https://github.com/aindaco1/dust-wave-platform/actions/runs/37215618677)
  pass at `e28d2773f3060700f9483a44705038fc436570d1`.
- Pool [Merge Smoke and four dependency audits](https://github.com/aindaco1/pool/actions/runs/37215926824)
  pass with the shared control adopted. Root/Worker production and full audits
  also pass on `debf8523` in [37216628939](https://github.com/aindaco1/pool/actions/runs/37216628939).
- [Feature Podman dispatch](https://github.com/aindaco1/pool/actions/runs/37215028533)
  passes; its one retried cart fixture prompted the additional correction.
  [37216643670](https://github.com/aindaco1/pool/actions/runs/37216643670) reruns
  the complete Podman suite with that correction and the final shared control.
- [Feature media dispatch](https://github.com/aindaco1/pool/actions/runs/37214980809)
  passes optimization and image validation: 37 sources checked and 192 image
  changes validated, plus the manifest. The complete optimize job took 29m54s,
  within the former 30-minute limit; the limit is now 45 minutes to leave room
  for runner variation during backlog repair, with all image checks retained.
  The artifact preserves the JSON reports
  and binary patch. This dispatch uses `5203c2a`, with the same media validator
  and shared framehash implementation as the final Pool branch. The generated
  candidate runs the full merge gate; feature dispatches skip production
  publication and clean up their temporary branch.

The removal control uses existing admin permissions, local draft recovery,
and explicit Save/Publish boundaries. It does not add a new data store,
notification, payment operation, or publication action. These checks use local
or hosted test fixtures; they do not establish live provider delivery or a
production deployment. Both implementation PRs were unmerged at the end of
the initial investigation; subsequent release evidence is in [v1.2.23](v1.2.23.md).

## Historical failure inventory

The latest successful production deployment is
[36365986822](https://github.com/aindaco1/pool/actions/runs/36365986822), and
Pages refresh is [37204027098](https://github.com/aindaco1/pool/actions/runs/37204027098).
The earlier Podman browser-install failures are superseded by
[34865107846](https://github.com/aindaco1/pool/actions/runs/34865107846);
the two September shipping failures are covered by today's fixture correction.
Earlier media fixes are verified by [36666940709](https://github.com/aindaco1/pool/actions/runs/36666940709).
Current PR smoke gates supersede the closed/released historical branch failures.

| Run | Date | Workflow | Finding / disposition |
| --- | --- | --- | --- |
| [37162191246](https://github.com/aindaco1/pool/actions/runs/37162191246) | 2026-10-03 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [37162190810](https://github.com/aindaco1/pool/actions/runs/37162190810) | 2026-10-03 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [37158868161](https://github.com/aindaco1/pool/actions/runs/37158868161) | 2026-10-03 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [37158867603](https://github.com/aindaco1/pool/actions/runs/37158867603) | 2026-10-03 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [36967182716](https://github.com/aindaco1/pool/actions/runs/36967182716) | 2026-10-02 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [36964927746](https://github.com/aindaco1/pool/actions/runs/36964927746) | 2026-10-02 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [36964926988](https://github.com/aindaco1/pool/actions/runs/36964926988) | 2026-10-02 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [36928848512](https://github.com/aindaco1/pool/actions/runs/36928848512) | 2026-10-01 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [36926807107](https://github.com/aindaco1/pool/actions/runs/36926807107) | 2026-10-01 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [36909642913](https://github.com/aindaco1/pool/actions/runs/36909642913) | 2026-10-01 | Merge Smoke | Vitest/coverage peer mismatch; repaired on original PR. |
| [36909629331](https://github.com/aindaco1/pool/actions/runs/36909629331) | 2026-10-01 | Merge Smoke | Vitest/coverage peer mismatch; repaired on original PR. |
| [36909603789](https://github.com/aindaco1/pool/actions/runs/36909603789) | 2026-10-01 | Merge Smoke | Playwright/container pin mismatch; repaired on original PR. |
| [36684276672](https://github.com/aindaco1/pool/actions/runs/36684276672) | 2026-09-30 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [36683980900](https://github.com/aindaco1/pool/actions/runs/36683980900) | 2026-09-30 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [36682292074](https://github.com/aindaco1/pool/actions/runs/36682292074) | 2026-09-30 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [36681593009](https://github.com/aindaco1/pool/actions/runs/36681593009) | 2026-09-30 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [36680768388](https://github.com/aindaco1/pool/actions/runs/36680768388) | 2026-09-30 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [36677282350](https://github.com/aindaco1/pool/actions/runs/36677282350) | 2026-09-30 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [36676346845](https://github.com/aindaco1/pool/actions/runs/36676346845) | 2026-09-30 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [36676346404](https://github.com/aindaco1/pool/actions/runs/36676346404) | 2026-09-30 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [36671498385](https://github.com/aindaco1/pool/actions/runs/36671498385) | 2026-09-30 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [36671497632](https://github.com/aindaco1/pool/actions/runs/36671497632) | 2026-09-30 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [36669715312](https://github.com/aindaco1/pool/actions/runs/36669715312) | 2026-09-30 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [36669715140](https://github.com/aindaco1/pool/actions/runs/36669715140) | 2026-09-30 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [36667590304](https://github.com/aindaco1/pool/actions/runs/36667590304) | 2026-09-30 | Optimize dashboard media | Equivalent PNG aspect ratio; fixed by shared normalization. |
| [36603658497](https://github.com/aindaco1/pool/actions/runs/36603658497) | 2026-09-29 | Optimize dashboard media | Full dependency audit; superseded by the Undici 7.29.1 override on main. |
| [36459618860](https://github.com/aindaco1/pool/actions/runs/36459618860) | 2026-09-28 | Podman E2E | Mocked shipping with unmocked tax; fixture corrected. |
| [36362045762](https://github.com/aindaco1/pool/actions/runs/36362045762) | 2026-09-28 | Optimize dashboard media | Earlier JPEG metadata handling; superseded by the v1.2.22 media fix. |
| [35621995777](https://github.com/aindaco1/pool/actions/runs/35621995777) | 2026-09-21 | Podman E2E | Mocked shipping with unmocked tax; fixture corrected. |
| [35242784488](https://github.com/aindaco1/pool/actions/runs/35242784488) | 2026-09-17 | Merge Smoke | Admin button-enabled browser assertion; superseded by later smoke runs. |
| [35113402640](https://github.com/aindaco1/pool/actions/runs/35113402640) | 2026-09-16 | Merge Smoke | Podman script source assertion drift; superseded by current passing script tests. |
| [35107210935](https://github.com/aindaco1/pool/actions/runs/35107210935) | 2026-09-16 | Deploy Production | Historical deployment/refresh failure; later same-workflow production success. |
| [34418992857](https://github.com/aindaco1/pool/actions/runs/34418992857) | 2026-09-09 | Optimize dashboard media | Missing assets/audio path in staging; current image-only workflow supersedes it. |
| [34398167999](https://github.com/aindaco1/pool/actions/runs/34398167999) | 2026-09-09 | Optimize dashboard media | Missing assets/audio path in staging; current image-only workflow supersedes it. |
| [34396041608](https://github.com/aindaco1/pool/actions/runs/34396041608) | 2026-09-09 | Optimize dashboard media | Missing assets/audio path in staging; current image-only workflow supersedes it. |
| [34391902976](https://github.com/aindaco1/pool/actions/runs/34391902976) | 2026-09-09 | Optimize dashboard media | Missing assets/audio path in staging; current image-only workflow supersedes it. |
| [34391750732](https://github.com/aindaco1/pool/actions/runs/34391750732) | 2026-09-09 | Optimize dashboard media | Missing assets/audio path in staging; current image-only workflow supersedes it. |
| [34151022268](https://github.com/aindaco1/pool/actions/runs/34151022268) | 2026-09-07 | Optimize dashboard media | Missing assets/audio path in staging; current image-only workflow supersedes it. |
| [34150262230](https://github.com/aindaco1/pool/actions/runs/34150262230) | 2026-09-07 | Optimize dashboard media | Missing assets/audio path in staging; current image-only workflow supersedes it. |
| [34150068070](https://github.com/aindaco1/pool/actions/runs/34150068070) | 2026-09-07 | Optimize dashboard media | Missing assets/audio path in staging; current image-only workflow supersedes it. |
| [34145324016](https://github.com/aindaco1/pool/actions/runs/34145324016) | 2026-09-07 | Optimize dashboard media | Missing assets/audio path in staging; current image-only workflow supersedes it. |
| [33546084124](https://github.com/aindaco1/pool/actions/runs/33546084124) | 2026-09-01 | Merge Smoke | Shared tooling version expectation drift; superseded by current locked dependency/pin tests. |
| [31122289903](https://github.com/aindaco1/pool/actions/runs/31122289903) | 2026-08-06 | Optimize dashboard media | Historical logs unavailable; later same-workflow success, exact cause unverified. |
| [31122289825](https://github.com/aindaco1/pool/actions/runs/31122289825) | 2026-08-06 | Refresh Production Pages | Historical deployment/refresh failure; later same-workflow production success. |
| [31065209285](https://github.com/aindaco1/pool/actions/runs/31065209285) | 2026-08-06 | Merge Smoke | Secret-comparison timing assertion; superseded by current passing security gates. |
| [30814197034](https://github.com/aindaco1/pool/actions/runs/30814197034) | 2026-08-03 | Podman E2E | Playwright container missing the required browser; superseded by matched image pin. |
| [30713321679](https://github.com/aindaco1/pool/actions/runs/30713321679) | 2026-08-01 | Merge Smoke | Date-sensitive preorder fixture; superseded by current passing unit gates. |
| [30713318487](https://github.com/aindaco1/pool/actions/runs/30713318487) | 2026-08-01 | Merge Smoke | Date-sensitive preorder fixture; superseded by current passing unit gates. |
| [30713312995](https://github.com/aindaco1/pool/actions/runs/30713312995) | 2026-08-01 | Merge Smoke | Date-sensitive preorder fixture; superseded by current passing unit gates. |
| [30713306964](https://github.com/aindaco1/pool/actions/runs/30713306964) | 2026-08-01 | Merge Smoke | Date-sensitive preorder fixture; superseded by current passing unit gates. |
| [30713303216](https://github.com/aindaco1/pool/actions/runs/30713303216) | 2026-08-01 | Merge Smoke | Date-sensitive preorder fixture; superseded by current passing unit gates. |
| [30266611844](https://github.com/aindaco1/pool/actions/runs/30266611844) | 2026-07-27 | Podman E2E | Playwright container missing the required browser; superseded by matched image pin. |
| [30240082931](https://github.com/aindaco1/pool/actions/runs/30240082931) | 2026-07-27 | Merge Smoke | Date-sensitive preorder fixture; superseded by current passing unit gates. |
| [29243015429](https://github.com/aindaco1/pool/actions/runs/29243015429) | 2026-07-13 | Merge Smoke | npm lock/install mismatch; superseded by current npm ci gates. |
| [29206868827](https://github.com/aindaco1/pool/actions/runs/29206868827) | 2026-07-12 | Podman E2E | Historical runner/setup failure; superseded by current same-workflow checks. |
| [29206308017](https://github.com/aindaco1/pool/actions/runs/29206308017) | 2026-07-12 | Merge Smoke | Missing rg in runner; current gate has grep fallback. |
| [29206134551](https://github.com/aindaco1/pool/actions/runs/29206134551) | 2026-07-12 | Merge Smoke | Historical runner/setup failure; superseded by current same-workflow checks. |
| [29205949560](https://github.com/aindaco1/pool/actions/runs/29205949560) | 2026-07-12 | Merge Smoke | Missing Jekyll executable; current setup installs and verifies gems. |
| [29205850512](https://github.com/aindaco1/pool/actions/runs/29205850512) | 2026-07-12 | Merge Smoke | Subprocess dependency checks returned null; superseded by current installed-tool gates. |
| [29205805771](https://github.com/aindaco1/pool/actions/runs/29205805771) | 2026-07-12 | Merge Smoke | npm lock/install mismatch; superseded by current npm ci gates. |
| [29011221774](https://github.com/aindaco1/pool/actions/runs/29011221774) | 2026-07-09 | Deploy Production | Historical deployment/refresh failure; later same-workflow production success. |
| [26743260400](https://github.com/aindaco1/pool/actions/runs/26743260400) | 2026-06-01 | Optimize dashboard media | Historical logs unavailable; later same-workflow success, exact cause unverified. |
| [26723673941](https://github.com/aindaco1/pool/actions/runs/26723673941) | 2026-05-31 | Optimize dashboard media | Historical logs unavailable; later same-workflow success, exact cause unverified. |
| [26633247795](https://github.com/aindaco1/pool/actions/runs/26633247795) | 2026-05-29 | Optimize dashboard media | Historical logs unavailable; later same-workflow success, exact cause unverified. |
| [26629318887](https://github.com/aindaco1/pool/actions/runs/26629318887) | 2026-05-29 | Optimize dashboard media | Historical logs unavailable; later same-workflow success, exact cause unverified. |
| [26441218469](https://github.com/aindaco1/pool/actions/runs/26441218469) | 2026-05-26 | Deploy Production | Historical deployment/refresh failure; later same-workflow production success. |
| [25907181083](https://github.com/aindaco1/pool/actions/runs/25907181083) | 2026-05-15 | Deploy Production | Historical deployment/refresh failure; later same-workflow production success. |
| [25259548938](https://github.com/aindaco1/pool/actions/runs/25259548938) | 2026-05-02 | Deploy Production | Historical deployment/refresh failure; later same-workflow production success. |
| [25258955109](https://github.com/aindaco1/pool/actions/runs/25258955109) | 2026-05-02 | Deploy Production | Historical deployment/refresh failure; later same-workflow production success. |
| [25258879510](https://github.com/aindaco1/pool/actions/runs/25258879510) | 2026-05-02 | Deploy Production | Historical deployment/refresh failure; later same-workflow production success. |
| [23826287949](https://github.com/aindaco1/pool/actions/runs/23826287949) | 2026-04-01 | Merge Smoke | Webhook security fixture failures; superseded by current security gates. |
| [23825037625](https://github.com/aindaco1/pool/actions/runs/23825037625) | 2026-03-31 | Merge Smoke | Historical logs unavailable; later same-workflow success, exact cause unverified. |
