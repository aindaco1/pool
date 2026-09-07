# Unpublished campaign preview investigation — 2026-09-07

Status: local verification complete; hosted gate and production rollout pending. Baseline:
`45f8c914cc5960f508f968948f58f5d080fb3af2`. Working branch:
`fix/campaign-preview-unpublished`.

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
- The complete pre-merge gate remains pending: its port-8787 cleanup would stop
  the active Film development Worker. That service was left running. Production
  deployment and authenticated live preview acceptance remain pending.

Build and browser harness: ignored `tmp/campaign-preview/`. Logs:
`/tmp/pool-preview-{before,focused,unit,build,minify,seo,performance,browser,generator-final}.log`.

## Ethical risk review

The affected boundary is private draft visibility. Unpublished documents stay
outside the public collection; static preview shells contain no campaign title,
draft body, reviewer identity, or access token. Existing Worker authentication,
24-hour reviewer access, no-store payload responses, iframe restrictions,
noindex metadata, and read-only pledge controls remain in use. No production
publication, account change, payment action, or email send was performed.
