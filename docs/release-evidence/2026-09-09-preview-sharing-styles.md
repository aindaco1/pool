# Protected preview frame sizing — 2026-09-09

Status: deployed through [PR #38](https://github.com/aindaco1/pool/pull/38)
at `7e239db876b121ee4a48e9974e8d167a0a5b1bb2`.

## Change

The protected preview layout omitted `assets/admin.css`, which owns its shell
and iframe sizing. Production therefore used the browser's approximately
300 × 150 pixel iframe default. The layout now loads the existing stylesheet
in both languages. Public campaign styles and Worker application code are unchanged.

The release gate also found GHSA-rgj7-g3m4-5g8c in the development-only
Wrangler → Miniflare → Sharp dependency chain. The Worker package overrides
Sharp to patched 0.35.4; the lockfile changes only Sharp and its native image
libraries. Wrangler, Miniflare, shared gitlinks, and production dependencies
retain their existing versions. No audit exception was added.

## Verification

- Local Jekyll build and 100 focused preview, dashboard, performance-loading,
  and SEO tests passed. A local Chromium fixture using the real built shell
  measured a 1280-pixel desktop frame and a 350-pixel frame at a 390-pixel mobile
  viewport without page overflow. The Spanish shell also passed.
- All four local dependency audits reported zero findings. Sharp PNG resize /
  WebP conversion passed. The real Worker-runtime and platform-pin suites passed
  all 14 tests after the dependency patch.
- [Hosted Merge Smoke](https://github.com/aindaco1/pool/actions/runs/34395491941)
  passed on final PR head `48a48e45fa7a151f85f7ac5feae6483fa16c842f`: all four
  dependency audits and the complete pre-merge gate, including full unit,
  security, build, Worker, Podman mutable-pledge, and headless browser checks.
- [Refresh Production Pages](https://github.com/aindaco1/pool/actions/runs/34396170410)
  deployed the merge commit successfully. Cache purge, admin-response security
  verification, and the 16-URL public crawl audit passed. The existing diary
  check returned HTTP 200 with no new entries and zero messages sent.
- The independent live cache-policy audit passed all 11 targets.
- Live English and Spanish preview shells load the new stylesheet and retain
  `noindex,nofollow,noarchive`. Desktop computed frame styles are width 100%,
  height 82vh, and minimum height 680px.

## Acceptance boundary

A separate campaign preview publication at 19:36 UTC superseded the supplied
reviewer link while checks were running. The old link now correctly shows the
localized unavailable-link notice with the frame hidden. Fresh protected
payload rendering after deployment requires the newest dashboard reviewer
link; no reviewer invitation or preview publication was performed for this
verification. The successful full-content layout checks above used a local
synthetic payload, not a newly authenticated production preview.

The saved Deinonychus source still has empty story, reward, and diary fields.
Styling does not publish browser drafts or recover missing campaign content.

## Privacy and scope

Token verification, reviewer scope and expiry, no-store payload responses,
noindex metadata, iframe sandboxing, and disabled pledge controls are retained.
This rollout used the Pages-only workflow and did not deploy the Worker.
No private preview token or reviewer address is retained in this record.
