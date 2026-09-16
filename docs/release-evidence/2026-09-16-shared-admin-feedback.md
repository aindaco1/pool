# Shared admin previews and readable feedback

Date: 2026-09-16.

## Scope and ownership

Pool adopts Platform `v0.39.0`, commit
`6b82237e926137b6062f9dd454bd6598280e7353`, from
[Platform PR #44](https://github.com/aindaco1/dust-wave-platform/pull/44).
Admin Shell 0.12.0 owns the shared editor codec, image-preview cache and sandbox
thumbnail substitution, blank-placeholder detection, advisory alt-description
normalization, and English/Spanish feedback defaults. Design Core 0.3.0 owns
opt-in editor containment, wrapping, stacking, spacing, and responsive media mixins.
Pool owns campaign field labels, routes, uploads, URL policy, and publication.

Newly uploaded hero images stay visible before deployment. Saved editor images
retain their local preview through Save; mobile previews use bounded thumbnails.
Canonical repository paths are the only media references sent in save payloads.
Nested bold/italic list text renders consistently in editor, Worker preview, and
public inline fields. Validation paths become localized field names and actionable
messages; original diagnostics remain available on the error object. Missing alt
text cannot block saving or publishing.

## Verification

- Platform `npm run check`: 338 package tests, secret/dependency checks, and both
  clean-checkout consumer recipes passed. CI also passed on Node 22/24 and the
  Jekyll recipe: [run 35130574429](https://github.com/aindaco1/dust-wave-platform/actions/runs/35130574429).
- Pool focused Worker/editor/recovery/public-filter checks pass. Full unit suite:
  992 passed, one existing skipped test. Security suite: 127 passed.
- Six focused Chromium cases pass in English/Spanish: upload success/rejection
  with preview preservation; canonical Save payloads; nested Markdown; technical
  validation messages; and image/settings panel geometry at 1280, 820, and 390px.
- Full premerge, WebKit, and production verification are recorded in the consumer
  PR after completion. Local results are not production acceptance.

Local browser screenshots: `tmp/shared-hero-preview-{en,es}.png`,
`tmp/shared-nested-markdown-{en,es}.png`, and `tmp/editor-media-panel-*.png`.
The tests use synthetic campaigns and mocked authenticated APIs; no creator
content, sessions, or real publication state are modified.

## Rollback and operational limits

Revert the Pool change, including its adapters and submodule pointer, to restore
Platform `da7bd21ad77e936342d7d67948da88a25f56782c` (Admin Shell 0.11.0,
Design Core 0.2.0), then redeploy Worker and Pages together. No content/storage
migration is required. Other consumers retain independent pins and deployments.

Image previews remain tab-local and are cleared on logout. Reloading before the
asset reaches the public deployment loses that local preview cache. Save campaign
edits before reloading the dashboard to load the new release.
