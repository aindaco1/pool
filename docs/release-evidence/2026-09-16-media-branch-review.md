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

Focused media and Platform-pin suites pass all 14 tests. Full release checks
and published acceptance are recorded below when completed. Revert this consumer
commit to restore the previous media and manifest; the MP4 and all source files
remain available. Branch refs are removed only after accepted output is merged,
with the original branch tips retained in a verified Git bundle.
