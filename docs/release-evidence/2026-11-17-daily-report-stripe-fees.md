# Daily pledge report Stripe fees

Production source was fast-forwarded to `e36abc41ebd983c3a6c7b2031fd9a8f33dd934cf`
before applying this change. Campaign, media, and dependency updates from main
are retained. No data migration or configuration change is required.

## Behavior and review

Daily pledge email summaries, private report previews, and pledge CSVs reuse
Analytics' current-pledge financial calculation. Recorded fees take precedence;
the existing 2.9% + $0.30 planning estimate supplies the fallback. Summaries label
actual, estimated, and mixed results. The fee-basis note is indented by 18px and
uses 0.875em text. CSV snapshots appear only on each pledge's final ledger row
so modifications do not double-count fees. The detailed contract belongs to
[Dashboard](../DASHBOARD.md#daily-pledge-summary).

The extracted formulas and allocation branches were compared with the original
implementation and match after naming changes. Gross progress, payment and
settlement behavior, recipients, suppression, outbox identity, and fulfillment
exports retain their existing contracts. Previews remain read-only and private;
no Stripe calls or financial backfills are introduced.

Ethical review: estimates remain explicitly identified, and net campaign amounts
are planning figures rather than guaranteed payouts. No new personal data,
audience, tracking, or administrative power is introduced. Failed-payment and
cancelled-pledge behavior matches Analytics and is documented.

## Verification

- Before the production pull, the complete isolated premerge gate passed:
  1,234 unit tests, 127 security tests, and 178 browser tests; one unit and three
  browser tests were skipped. Build budgets, local Worker smoke, and Podman
  mutable-pledge smoke passed. This run preceded the note's cosmetic styling.
- After the pull, fresh lockfile installs and all 212 tests in the five affected
  report, dashboard, email, and scheduler suites passed. Syntax and diff checks
  passed. No package manifests or lockfiles are changed by this release.
- The email was rendered through the real Worker report route with fictional
  in-memory pledges, capture enabled, and all external requests blocked. HTML,
  plain text, and the attached CSV were inspected; the user approved the preview
  and smaller, indented note. No live email was sent.
- Final main-baseline and release CI results, immutable deployment revision,
  and post-deployment checks are recorded on the associated pull request.

## Existing development dependency finding

The post-pull audit passed for root production, Worker production, and Worker
full dependencies, with zero findings. Root full reported six high findings
from one advisory, [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf),
through picomatch and the Vitest/Vite dependency chain. On November 17, the
registry's latest picomatch was 4.0.7 and the advisory listed no patched release.
The suggested major tooling downgrades do not establish that this advisory is
fixed and are outside this report change.

This pre-existing development-only finding is accepted for this release under
the [merge checklist's explicit-rationale rule](../MERGE_SMOKE_CHECKLIST.md#pass--fail-rule):
the affected matcher consumes repository-defined test/build globs, not supporter
or report input, and it is absent from production dependencies. The report
change does not introduce a new path to that matcher. The remaining risk is
denial of service when running tooling against malicious glob patterns; do not
feed untrusted patterns to this tooling. Revisit the advisory during dependency
maintenance when an upstream fix is available. The audit remains visibly failing;
no thresholds, checks, or workflow controls are disabled or weakened.

## Rollback

Revert the report change and redeploy that reviewed revision using Deploy
Production with `skip_diary_check=true`. No persisted data needs rollback.
