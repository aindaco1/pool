# Existing unassigned campaign users — 2026-09-09

[PR #41](https://github.com/aindaco1/pool/pull/41) deployed at
`5b478149d8957c9210fbab21b8a7d02e0e42dc1b`.

Saving other Users rows preserves an existing campaign user with no assignments.
The exception comes from stored membership; it cannot create a new unassigned
account, clear an existing assignment, or grant campaign access. Pool user saves
leave Store’s separate user key untouched. Current operator behavior is described
in [Dashboard](../DASHBOARD.md#users).

The [hosted Merge Smoke](https://github.com/aindaco1/pool/actions/runs/34424755013)
and all four dependency audits passed on PR head
`7ee265b75d81479eb91baff78b4cbdef4a4014aa`. The PR records 91 focused admin tests
and 943 full unit tests passing locally, with one skipped. The local full gate
stopped at Podman setup while another named VM was active; hosted validation
covered the complete gate.

[Deploy Production](https://github.com/aindaco1/pool/actions/runs/34425302222)
succeeded for Worker and Pages. Worker version:
`a9fa8d00-8c23-4039-a2ae-496a8f5c2789`. Cache purge, admin response security, and
the 16-URL crawl audit passed. The diary check returned HTTP 200 with no new
entries and zero messages sent.

These are source, automated-test, and deployment results. No actual account was
changed to verify this documentation update. Rollback reverts the code change
and redeploys Worker/Pages; it does not delete or rewrite runtime user records.
