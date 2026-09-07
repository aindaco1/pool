# Unpublished campaign preview investigation — 2026-09-07

Status: deployed and verified in production on 2026-09-07. Baseline:
`45f8c914cc5960f508f968948f58f5d080fb3af2`; deployed fix:
`8ded6093e3b2e69547bf2f300422d72b990587fb`.

## Finding

Production returned HTTP 404 for both `/campaigns/deinonychus/preview/` and
`/es/campaigns/deinonychus/preview/`, while the Hand Relations preview shell
returned HTTP 200. The most recent
[Pages build and deployment](https://github.com/aindaco1/pool/actions/runs/34151022299)
had succeeded for the latest Deinonychus preview-publish commit.

Jekyll 4.4.1 removes documents marked `published: false` from a collection
during `Collection#read_document`. The preview generator iterated only that
filtered collection, so it could not generate shells for newly created,
unpublished campaigns. Repeated preview publication and successful rebuilds
could not produce the missing routes. The browser received a static-site 404
before it could request a protected payload from the Worker.

## Change

The existing preview generator reuses loaded campaign documents and Jekyll's
filtered collection entries/document reader to discover the omitted sources.
It passes those documents through the same localized generic-shell generator
without adding them to the public collection. Source exclusions and authored
slugs remain respected. No global unpublished-build option, campaign setting,
Worker endpoint, token format, or shared dependency changes are needed.

## Verification

- A real Jekyll fixture build failed before the fix because unpublished preview
  routes were missing. It passes afterward for public, unpublished, preview-only,
  and preview-enabled sources, including English and Spanish routes. It also
  checks excluded files, repeated generation, public collection preservation,
  generic metadata, and draft exclusion from public routes/catalogs/sitemaps.
- Five focused suites passed: 100 tests. The full unit suite passed: 907 tests,
  one existing skip. The generator test passed again after adding the plain
  unpublished fixture with no preview flags.
- A production-mode Jekyll build containing the current Deinonychus source
  succeeded. Both localized preview shells exist; its public campaign route
  remains absent. Generated asset minification and performance budgets passed.
- SEO audit passed for 54 HTML pages and 16 sitemap URLs. Ruby syntax, secret
  audit, pinned template drift, and `git diff --check` passed.
- Chromium opened both generated Deinonychus shells with HTTP 200. With mocked
  Worker responses, it verified payload rendering, token removal, locale,
  noindex metadata, and the unauthorized-access notice without page errors.
  This is browser fixture evidence, not authenticated production acceptance.
- The complete local gate was omitted because its port-8787 cleanup would stop
  the active Film development Worker. The complete hosted gate subsequently
  passed, as recorded below; the Film service was left running.

The temporary build/browser harness and diagnostic logs were moved to the
recoverable Trash folder recorded below after verification.

## Production rollout and cleanup

- [PR #36](https://github.com/aindaco1/pool/pull/36) merged at `8ded609`.
- [Hosted Merge Smoke](https://github.com/aindaco1/pool/actions/runs/34152208486)
  passed every pre-merge phase on PR head `e4bedba`: unit and security suites,
  build artifacts, Podman resource check, Worker smoke, mutable-pledge smoke,
  and the complete headless browser suite. All four root/Worker and
  production/full dependency audits passed with zero findings.
- [Refresh Production Pages](https://github.com/aindaco1/pool/actions/runs/34152682265)
  deployed `8ded609` and completed successfully at 18:44 UTC. Cache purge,
  admin-response policy, and public crawl verification passed. The existing
  post-deploy diary check returned HTTP 200 with zero new entries and zero
  emails sent. This change uses the normal Pages deployment path.
- Live English and Spanish Deinonychus preview shells returned HTTP 200 with
  generic content, noindex metadata, and no social metadata. Both public
  campaign routes still returned HTTP 404; the public campaign catalog and
  sitemap still excluded Deinonychus.
- A separate Chrome tab with the existing super-admin session rendered the
  actual protected Deinonychus payload in both languages. The support control
  remained disabled. No preview republish or new invitation was needed; the
  verification tab was closed afterward. Separate reviewer-token and expiry
  behavior remains covered by the automated suites rather than a new live send.
- The independent post-deploy cache-policy audit passed all 11 targets.
- Moved 284,312,774 bytes of generated preview output, Jekyll/Vitest caches,
  and Finder metadata into recoverable Trash:
  `~/.Trash/pool-preview-cleanup-20260907-123811/`. Diagnostic logs and the
  cleanup manifest are retained there with the generated output.
- Preserved root/Worker dependencies, `_config.local.yml`, `worker/.dev.vars`,
  and `worker/.wrangler/state`. Removed the merged fix branch locally and
  remotely; only `main` remains. No other stale branches or worktrees existed.

The rollout-evidence update changes only this maintainer document, which is
excluded from the public Jekyll artifact.

## Ethical risk review

The affected boundary is private draft visibility. Unpublished documents stay
outside the public collection; static preview shells contain no campaign title,
draft body, reviewer identity, or access token. Existing Worker authentication,
24-hour reviewer access, no-store payload responses, iframe restrictions,
noindex metadata, and read-only pledge controls remain in use. Verification
initiated no campaign content publication, account change, payment action, or
email send.
