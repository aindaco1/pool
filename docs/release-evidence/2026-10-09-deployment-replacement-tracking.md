# Follow replacement campaign deployments — 2026-10-09

## Incident

Publish saved the Diary edit in commit `bf222f1965d3653e94467b0928b3a4b28163e2b7`.
The dashboard tracked run `38006120230`, which GitHub cancelled before starting
any jobs. Draft-save, publish-push, explicit publish, and media-check triggers
competed in the shared production concurrency group. GitHub replaces pending
runs even when `cancel-in-progress` is false. The tracker stayed pinned to the
cancelled run and incorrectly described it as a deployment failure.

Replacement run `38006235210` publishes the same revision. The live campaign
feed contains the user's latest italic Diary edit and all six reward tiers.
No content repair, republishing through the editor, or manual email send is
needed for this incident.

## Repair

The read-only Worker tracker searches for a matching replacement when its run
is cancelled, and ignores cancelled duplicates during initial discovery. The
replacement must match the same immutable source and configured Pages workflow,
within the original request window. Unrelated workflow runs or saved revisions
cannot produce a Live state. A 30-second grace period accounts for GitHub
listing the cancellation before its replacement; actual cancellation remains
terminal after that period. Build failures remain terminal immediately.

The dashboard distinguishes cancellation from build failure. Draft-only pushes
no longer start public Pages builds. Saved data, publication permissions,
private cache policy, and notification idempotency are unchanged.

## Verification and release

Regression cases cover replacement discovery, locked-run replacement, delayed
listing, deliberate cancellation, unrelated revisions/workflows, actual build
failure, and browser polling through a changed run ID without another Publish.
The PR records focused results, full pre-merge and dependency audit receipts,
and the production deployment revision. Deployment is separate from email
provider delivery; no manual broadcast is part of this repair.

Reference: [GitHub workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
