# Daily pledge report scheduling and campaign add-on uploads

## Production diagnosis

Resend and production KV agree that Deinonychus reports were delivered on
September 21 and 22, but no reports were enqueued for September 23 or 24.
The minute cron was configured, report flags were enabled, the campaign was
live, and the authenticated report dry run resolved one assigned recipient.
The report heartbeat had expired and the outbox was empty.

Cloudflare scheduled-invocation analytics show the exact failure:

| Report date | Scheduled event (UTC) | Actual invocation (UTC) | Outcome |
| --- | --- | --- | --- |
| September 23 | 13:00:26 | 13:02:03 | success, report skipped |
| September 24 | 13:00:57 | 13:02:01 | success, report skipped |

The old scheduler compared wall-clock time with the exact 7:00 a.m. minute in
America/Denver. Both invocations arrived at 7:02 and skipped report creation.
Cloudflare's [scheduled handler contract](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/)
distinguishes scheduled time from invocation time. The deployed Worker before
repair was version `1344f9bc-5a1b-43e6-90ab-f3460bdc96bf`.

The reported add-on image error was a separate scope mismatch: the campaign
product editor emitted `kind: add-on`, which correctly requires platform
settings permission. Its product records also lacked individual campaign slugs.
The supplied screenshot shows the corresponding account/security error.
Published campaigns remain editable.

## Repair

- Reports remain due from the configured local minute until the day's pass
  completes. A two-day completion marker avoids repeated campaign/pledge reads.
- Failed campaigns stay retryable; empty catalog loads do not consume a day.
  Per-campaign failures appear in the existing cron error diagnostic.
- Stable report outbox identities protect retries after partial enqueue or a
  report-marker write failure. The queued payload remains frozen.
- Campaign add-on images inherit the owning editor's campaign slug and use
  the existing `campaign-add-on` permission path. Platform and other-campaign
  permissions are unchanged.

## Recovery

The user explicitly requested sending the missing reports. Dry runs preceded
both sends, and recipients were resolved from current campaign assignments.

- September 23: six pledges, seven ledger rows, $425 in campaign contributions.
  Existing pledge timestamps and histories established that none of the selected
  records changed after the 7:00 a.m. MDT cutoff. Later pledges were excluded.
  The shared ledger builder and report renderer produced the CSV and message;
  a narrowly scoped operator recovery enqueued it in the production outbox and
  wrote the September 23 marker. The email explicitly identifies recovery on
  September 24 and the historical cutoff. No pledge records were changed.
- Resend confirms the September 23 message delivered at 19:37:59 UTC on
  September 24, provider ID `01a0d4ec-b65a-754b-9b8a-282c35bdda86`, with the
  `deinonychus-pledge-report-2026-09-23.csv` attachment reference.
- September 24: the existing authenticated manual endpoint queued today's
  report with eight pledges, nine rows, and $455 in campaign contributions,
  then wrote its normal daily marker. Resend confirms delivery at 19:40:02 UTC,
  provider ID `01a0d4ee-966f-75f7-b0c2-4638bc2b5013`, with the
  `deinonychus-pledge-report-2026-09-24.csv` attachment reference.

## Regression evidence

- Seven new report timing/retry checks fail against the original Worker code.
- Focused Worker operations, outbox, and dashboard suites: 155 passed.
- Full local unit suite: 1,035 passed, one existing skip. Security: 127 passed.
- Browser regression: an assigned campaign user uploads photos for both an
  existing and a new add-on on a live campaign, saves the exact image paths,
  then publishes the saved revision. Worker tests also enforce assignment
  scope and reject platform uploads by campaign users.
- Root and Worker production/full dependency audits: zero findings in all four.
- The first full pre-merge attempt passed through the host Worker smoke, then
  Podman could not mount this isolated checkout's host dependency symlinks.
  The symlinks were replaced with local dependency directories before rerunning
  the gate. Hosted/deployment evidence follows after completion.

## Ethical risk review

The fixes restore existing operational mail and campaign-editor capabilities.
They add no audiences, tracking, payment changes, or broader admin authority.
Recovery uses the assigned recipient, omits later pledges from the historical
report, and separates enqueue markers from provider delivery. Daily retries
reuse existing outbox identities and do not automatically backfill older days.
Evidence excludes supporter identities, CSV contents, credentials, and tokens.
