# Campaign creation investigation — 2026-09-07

Status: deployed to production on 2026-09-07. Baseline: `a554698`; deployed
runtime revision: `ca73a2a6b7bc3c595f53b035efeebf536baaac60`.

## Findings

Two independent failures reproduce from the reported creation flows.

1. **GitHub requests fail before network access.** The pinned shared GitHub
   client supplies `redirect: 'error'`. The installed Cloudflare runtime
   (`workerd` 1.20260828.1), using Pool's `2026-05-03` compatibility date,
   rejects that option. Its exception is caught and returned as HTTP 502,
   `github_request_failed`, with `Unable to reach GitHub`. This is reproducible
   without contacting GitHub and does not establish a bad token or an outage.
   Reads, writes, and workflow dispatches use the same adapter.
2. **Unselected users block assignment.** Creation adds the new campaign to
   selected users, then validates the entire user list. An unrelated existing
   campaign user with no assignments causes HTTP 422 before the campaign file
   is written. The error therefore names a user who was not selected. Creating
   without assignments skips that validation and reaches the GitHub failure.

The old mocked-fetch tests did not exercise Worker-native request construction.
The old assignment fixture selected every existing campaign user, so it never
tested an unrelated empty assignment list. Updated regressions fail before the
fix and pass afterward.

## Changes

- Pool's existing GitHub policy adapter uses `manual` redirect handling and
  rejects 3xx responses without following them or retrying writes. The shared
  Platform gitlink and package versions stay pinned. This uses the client's
  existing injected-fetch interface, retaining its timeouts, response bounds,
  and provider error handling.
- Creation preserves existing unselected users with no campaigns while adding
  assignments to selected users. The exception is derived from stored users;
  explicit **Settings -> Users** edits still require an assignment. Existing
  assigned and archived campaign slugs are preserved.
- Dashboard and API documentation clarify that campaign assignment is optional.

Cloudflare documents manual redirect handling as the way to enforce redirect
policy without forwarding credentials to another destination; see the
[Request API caution](https://developers.cloudflare.com/workers/runtime-apis/request/#properties).
The actual runtime test, rather than the documentation's list of redirect
values, establishes the compatibility failure above.

## Verification

Node 24.15.0; providers are mocked for mutation tests. No real campaign was
created and no production accounts or emails were changed.

| Check | Result |
| --- | --- |
| Focused dashboard and real Worker-runtime suites | 89 passed |
| Full unit suite | 906 passed, 1 skipped |
| Secret audit, pinned template drift, syntax | Passed |
| Site build, generated artifact, SEO, and performance budget checks | Passed |
| Security suite against local Worker | 127 passed |
| Dashboard browser suite, host Chromium | 14 passed |
| Root production/full and Worker production/full dependency audits | All passed, zero findings |
| Local complete pre-merge gate | Stopped at the Podman resource/startup check |
| Hosted complete pre-merge gate | Passed; see production rollout below |

The runtime tests cover source reads, campaign file creation, rebuild dispatch,
301/302/303/307/308 rejection, and distinct GitHub permission errors. Route
tests cover unassigned/assigned/new users, preservation of unrelated users,
strict explicit user edits, and failed GitHub writes leaving accounts unchanged
without sending email or dispatching a rebuild. Browser coverage includes
responsive layout, accessibility, role restrictions, and Spanish admin routes;
it uses mocked dashboard endpoints, not production GitHub writes.

The full gate passed through security, then Pool's default Podman VM could not
start because `record-release-gate` was already active on the Apple hypervisor.
The gate's subsequent smoke and full browser phases did not run. The focused
dashboard browser suite ran separately on the host. The omitted phases passed
subsequently in the hosted gate. Live campaign creation with production GitHub
write credentials was not attempted as part of this verification.

The pre-merge script stopped an existing Film development Worker occupying port
8787. Film's normal development stack was restarted afterward; both its Worker
health endpoint and web UI returned HTTP 200. The temporary Pool static server
was stopped after browser verification.

Local logs: `/tmp/pool-campaign-regression-before.log`,
`/tmp/pool-campaign-regression-after.log`, `/tmp/pool-campaign-dependencies.log`,
`/tmp/pool-campaign-browser.log`, `/tmp/pool-campaign-premerge.log`, and
`/tmp/pool-premerge-logs.xnou1G/`.

## Production rollout and cleanup

- [PR #35](https://github.com/aindaco1/pool/pull/35) merged at `ca73a2a`.
- [Hosted Merge Smoke](https://github.com/aindaco1/pool/actions/runs/34144446638)
  passed every pre-merge phase, including the Podman resource check, mutable
  pledge smoke, and complete headless browser suite. All four dependency audit
  jobs also passed. The tested PR head was `872372c`.
- [Deploy Production](https://github.com/aindaco1/pool/actions/runs/34144962735)
  deployed both Worker and Pages from the exact merged revision and completed
  successfully at 16:53 UTC. Worker version:
  `3f460654-8567-4c18-9adc-e33c782e2a4a`.
- Deployment verified admin response security and crawl endpoints (16 sitemap
  URLs). Its existing diary check returned HTTP 200 with zero new entries and
  zero emails sent.
- The independent post-deploy cache audit passed all 11 targets. The live
  campaign endpoint returned HTTP 200; unauthenticated admin-session access
  returned HTTP 401 with private/no-store caching. The authenticated dashboard
  and existing campaign content loaded in a separate browser tab without edits.
- During rollout, the operator's
  [Deinonychus creation commit](https://github.com/aindaco1/pool/commit/b4cb976f26fce04e597e7f7f81dbfe4b21ac9805)
  appeared on `main`, confirming a live campaign-file write through GitHub.
  That campaign source was preserved and synchronized into the local checkout.
  Assignment persistence and notification delivery were not independently read.
- Moved 284,113,318 bytes of generated site output, Jekyll/Vitest caches, test
  results, empty Wrangler temporary output, and Finder metadata into the
  recoverable local Trash folder `pool-cleanup-20260907-104339`.
- Preserved root/Worker dependencies, `_config.local.yml`, `worker/.dev.vars`,
  and `worker/.wrangler/state`. The merged fix branch was removed locally and
  remotely; only `main` remained. There were no older stale branches.

Deployment logs and the cache audit are recorded locally in
`/tmp/pool-campaign-production-full.log` and
`/tmp/pool-campaign-cache-after.json`. This verification initiated no campaign
creation, production user mutation, or assignment-email smoke. No schema
migration was required. The subsequent evidence-only commit does not change
the deployed Worker code.

## Ethical risk review

The relevant risks are accidental account access, credential forwarding, and
unwanted notifications. Creation keeps its super-admin and CSRF checks; the
exception grants no campaign access to unrelated users. Redirect responses do
not forward authorization to another destination. Failed file writes do not
change accounts or send notifications. Preview-only visibility, private cache
controls, existing consent/notification behavior, and localized UI stay intact.
No new data collection, public exposure, or payment behavior is introduced.
