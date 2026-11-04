# Weekly maintenance candidate — 2026-11-03

The empty cart button now includes its visible formatted total in its accessible
name, including before a provider or cached cart exists. The behavior belongs to
Platform Site Shell; Pool retains its translations and cart policy.

## Migration and validation

Pin Platform `782831f6b8fed8bb03488300446331222250efe9` (workspace 0.49.1,
Site Shell 0.6.1, Release Core 0.7.1) and exact `smol-toml` 1.9.1 together.
The Platform candidate is [PR 65](https://github.com/aindaco1/dust-wave-platform/pull/65).
It must land with this exact commit available before consumer release.

The new translated empty-cart regression failed on the previous Platform pin
and passes on the candidate. Existing provider, cached-cart and keyboard tests
remain in place. The cart and pin suites pass all 10 tests.

`npm run test:premerge` passes: 1,226 unit tests (one existing skip), security,
build artifacts, Worker and mutable-pledge smoke, and 178 browser tests (three
existing conditional skips). Logs: `/tmp/pool-premerge-logs.71BGj7`.
`npm run test:dependencies` reports zero vulnerabilities in all four root/Worker
production/full audit scopes. The prior media workflow failure was already fixed
on main by `61520abb29c7d48b4ce800f549140337ba9a709f`; no additional media edit is
part of this candidate.

## Independent rollback

A separate clean checkout of consumer `7300f816` with Platform
`d882c79c028cad982f49b4c4829b035717a5f552` (workspace 0.49.0, Site Shell 0.6.0,
Release Core 0.7.0) passed `npm ci` and all nine pre-migration cart/pin tests.
Restore this consumer's gitlink, version-contract test, package manifests and
lockfile together to return to exact `smol-toml` 1.9.0. Revert the new regression
with that rollback; it intentionally detects the old accessible-name defect.
Store can retain its candidate independently. No storage or data migration is
involved. This is source-level rollback evidence, not a production rollback.

No deployment, live payment, email send or production provider acceptance was
performed for this candidate.
