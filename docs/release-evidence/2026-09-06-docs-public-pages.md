# Documentation and public-page release validation

Local verification recorded on September 6, 2026, before publication.
Hosted gate and deployment results are recorded by the
[Merge Smoke](https://github.com/aindaco1/pool/actions/workflows/merge-smoke.yml)
and [Refresh Production Pages](https://github.com/aindaco1/pool/actions/workflows/deploy.yml)
workflows for the published revision.

## Scope

- Consolidated maintainer guides and introduced a task-based documentation index.
- Excluded maintainer documentation from the generated public site while retaining
  English and Spanish About, Terms, Admin, and creator-checklist routes.
- Preserved the caller's Ruby/Bundler and Node toolchain in pre-merge host phases.
- Aligned English and Spanish About and Terms copy with saved add-on prices,
  cancellation deadlines, failed-payment retries, email preferences, access-link
  scope, and pledge persistence independent of email delivery.

No Worker runtime, dependency, shared gitlink, pricing configuration, payment
provider, or production data changes are included.

## Local results

- Pre-merge phases 1–5 passed: secret audit, template drift, syntax, focused
  regressions, full unit suite, release-command sanity, and build artifacts.
- Full unit suite: 97 files passed; 896 tests passed and one test was skipped.
- New toolchain regression passed for both host and Podman build dispatch.
- Production asset budgets and rendered localization/SEO checks passed.
- All four public pages passed desktop and mobile browser checks: eight route
  and viewport combinations, including language switching and policy anchors.
- The browser checks found no horizontal overflow or axe violations with the
  existing suite's color-contrast exclusion. Rendered screenshots were reviewed.
- Maintainer documents were absent from `_site`; public and private route
  metadata retained their respective indexing rules.

The complete service-dependent gate was not run on this Mac because Film's
development Worker occupied port 8787. Hosted Merge Smoke supplies the isolated
environment for that gate. Local checks do not establish hosted acceptance.

## Review boundaries

The copy review covered payment expectations, privacy, messaging preferences,
and private-link disclosure. Existing fulfillment remedies, intellectual-property
terms, liability provisions, and statutory-rights protections were retained.
English and Spanish changes were checked for matching meaning; no independent
human translation review is claimed.

This documentation and Pages release does not include a live payment, provider
reconfiguration, email send, settlement, restore, or authenticated runtime
performance test. Local validation is not evidence of those operations.
