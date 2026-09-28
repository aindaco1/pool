# Pending media branch review — September 27, 2026

## Scope and origin

The dashboard media workflow generated two image branches after September 24
uploads and a manifest-only branch after the v1.2.21 configuration update. Its
logs report that repository policy prevents the Actions token from opening a
pull request; the output therefore remained on review branches.

Reviewed branch tips:

- `bot/media-optimization-36056288473` at
  `807180181e988b57798be89fed219e2ed3dba2a3`: Drawing of YOU as a Dinosaur add-on.
- `bot/media-optimization-36056836254` at
  `a693182de393bbb8d30b90c43ba21c628940c61e`: Deinonychus antirrhopus tier image.
- `bot/media-optimization-36359830325` at
  `5ad40e5a7a0f0cbb0aef22879553bd7f28ad02fc`: media manifest only.

Each image branch's original JPEG blob still matches main at
`4345f1edfcfa01c02fa4e76f269deed4d9c3cd5c`. The reviewed output is applied to
that current revision. Campaign content, prices, settings, runtime code, and
source paths are unchanged.

## Asset validation

Both compressed JPEGs decode to exactly the same RGBA pixels and dimensions as
their originals. Combined source compression saves 36,252 bytes.

| Image | Original JPEG | Compressed JPEG | Dimensions | 960w WebP |
| --- | ---: | ---: | --- | ---: |
| Drawing add-on | 395,874 bytes | 373,372 bytes | 1542 × 2048 | 88,494 bytes |
| Deinonychus tier | 112,304 bytes | 98,554 bytes | 1290 × 964 | 29,004 bytes |

All eight WebP derivatives decode, match their named widths of 320, 480, 640,
and 960 pixels, and are smaller than their original JPEGs. Both 960w previews
were visually inspected. Git retains the original source bytes for rollback.

The manifest is rebuilt from current assets instead of copied from a historical
branch. It incorporates both optimized images and the previously uploaded plushie
image, and removes generated-manifest self-references. Pending derivative warnings
remain truthful until the automatic pipeline completes them.

## Automatic publication

The updated workflow uses existing Actions permissions and requires no bot PRs.
It validates image-only output, checks lossless source preservation and derivative
size/dimensions/timing, then runs the reusable full Merge Smoke gate and all four
dependency audits. It publishes only the exact tested child of current main;
concurrent creator edits cause a fresh run. It dispatches Pages explicitly and
removes its temporary candidate branch even when validation fails. Run artifacts
retain reports and a recoverable patch for 14 days.

Pending-image detection uses source hashes and missing derivatives across the
asset tree, preserving intentional skips tied to an unchanged source hash.
Image automation cannot rewrite campaign content or video references. Local video
transcoding remains available for normal review. No Worker deployment is required.

## Verification and acceptance

Focused regression tests cover pending uploads after later content saves,
intentional size skips, repeatable manifests, restricted output, source content,
derivative geometry and animation, and main advancing before/during publication.
Workflow changes require a feature-branch dispatch exercising native optimization,
the full reusable gate, and cleanup without publishing. The PR also requires the
normal complete hosted gate. Final results, exact commits, and workflow links are
recorded in the pull request; post-merge Pages publication is checked separately.

Ethical review: automated write authority is limited to validated repository
images and rebuildable metadata. Creator content and concurrent edits are protected,
source appearance is preserved, and failed gates leave main unchanged. There are
no payment, messaging, data-collection, or campaign-permission changes.

## Branch cleanup and rollback

The three original tips are retained in a verified local Git bundle before their
refs are removed. Removal occurs only after accepted source/derivative bytes and
current manifest entries are verified on merged main, with exact remote-tip
guards. Reverting the consolidated commit restores the prior JPEGs and manifest
and removes these eight variants. No Worker deployment or state migration is
required.
