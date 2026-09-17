# Campaign runner defaults and Deinonychus delivery repair

## Cause

On September 17, 2026, the production daily-report heartbeat recorded a run at
13:00:42 UTC (7:00 a.m. MDT). Deinonychus was live and had pledge data, but its
published `runner_report_emails` list was empty. The saved working copy also
had an empty list. The deployed behavior did not subscribe assigned campaign
users to runner reports.

The authenticated production report dry run returned zero recipients, four
pledges totaling $350 in campaign contributions, five ledger rows, and no
September 17 sent marker. September 16 and 17 report markers were absent in
production KV. Recent Resend records showed other mail delivered to Chelsea
but no daily report during that period. The failure happened before delivery
queue creation, not as a provider rejection.

## Repair

- Resolve assigned campaign users as default recipients using the existing
  effective admin-user store. No campaign-specific hard-coded recipient fix
  is needed; campaign content and saved working copies remain unchanged.
- Combine these defaults with existing explicit recipients, normalize and
  deduplicate addresses, and honor saved campaign exclusions.
- Add checked-by-default assigned-user checkboxes to campaign settings, using
  the existing checkbox-list control and Save/Publish lifecycle. Retain
  explicit additional recipients and remember opt-outs across reassignment.
- Use the same recipient resolution in the scheduler, manual sends, report
  previews, and dashboard status. Super-admin access alone is not an assignment.
- Document behavior in [Email](../EMAIL.md#campaign-runner-reports), campaign
  authoring/dashboard guides, and both localized creator checklists.

The configured schedule is 7:00 a.m. in `America/Denver`. An after-window
repair takes effect at the next scheduled run; it does not
backfill prior days automatically. A same-day catch-up uses the existing
manual report endpoint after an explicit send instruction.

## Verification

- 146 focused recipient, Worker operations, and admin tests passed, covering
  assignment scope, opt-outs, duplicates, reassignment, read-only previews,
  scheduled delivery, input validation, and opt-out Save/Publish/re-enable.
- Final unit suite: 1,022 passed, one existing skip. Security: 127 passed.
  All four root/Worker production/full dependency audits reported zero findings.
- Browser checks verify checked defaults, unchecking and re-enabling a user,
  preservation of hidden opt-outs, dirty-state controls, and saving the exact
  exclusions before publishing the saved revision. The first test iteration
  checked the text editor's Save draft control instead of the campaign Save
  control; the corrected campaign Save/Publish checks pass.
- The pre-change baseline passed 1,015 unit tests (one skipped), 127 security
  tests, build checks, and Worker/pledge smoke. Its five-worker browser run
  failed one dashboard timing budget and retried nine flaky tests; the final
  gate runs with one browser worker.
- The final local pre-merge gate passed all phases. Chromium: 132 passed on the
  first attempt, one existing Manage Pledge case passed on retry, three skipped.
  All new recipient/opt-out cases passed on the first attempt.
- [Hosted Merge Smoke](https://github.com/aindaco1/pool/actions/runs/35243599164)
  passed the complete gate and all four dependency audits on `6c36dde`.
  [PR #59](https://github.com/aindaco1/pool/pull/59) merged as
  `44614f453041235f4d3a34b1a2caeb9788afa5b1`.

## Production verification and catch-up

- [Deploy Production](https://github.com/aindaco1/pool/actions/runs/35244406889)
  deployed the exact merged revision to the Worker and GitHub Pages. Worker
  version: `6d17c8c7-f6e4-46e0-b4f8-0d66f3bd21ae`. Public admin security policy
  and all 18 sitemap crawl URLs passed. The separate
  [Cloudflare DNS evidence run](https://github.com/aindaco1/pool/actions/runs/35244396402)
  also passed with the required credentials injected; this is not a complete
  audit of every payment, shipping, tax, or email provider.
- The deployed dashboard JavaScript includes the recipient checkbox behavior.
  Public campaign data retains an empty explicit recipient list and no
  exclusions. An authenticated production dry run selects exactly one assigned
  recipient, Chelsea, with four pledges totaling $350 and five ledger rows.
  The campaign is live and the September 17 marker was initially absent.
- The approved one-time send returned HTTP 200 with one queued report and
  `markedAsSent: true`. KV records the September 17 daily marker at
  `2026-09-17T16:10:16.243Z`, `sent: 1`, `source: admin_manual`.
  The outbox heartbeat advanced at `16:10:53.211Z` and its queue state became
  empty after processing. The live send request was made once.
- Resend reports **delivered** for `[The Pool] Daily pledge report | Deinonychus`,
  sent at `2026-09-17T16:10:53.699Z` to Chelsea's approved address.
  Provider ID: `01a0b022-9cc9-741d-af49-e24d84cdfa52`. Retrieved message details
  contain the expected $350.00 summary and
  `deinonychus-pledge-report-2026-09-17.csv` attachment reference.
  Provider delivery is verified; opening/reading the message is not claimed.
- The independent production cache-policy audit passed all 11 targets.
  Normal scheduled report delivery resumes at 7:00 a.m. `America/Denver`;
  future scheduled delivery has not yet occurred at the time of this record.

## Ethical risk review

The requested default subscriptions apply only to users explicitly assigned
to a campaign, who already have access to its reports. No dashboard permissions,
report scope, or payment state changes. Defaults are resolved at runtime rather
than copied into public campaign recipient lists. Opt-outs use the established
Git-backed campaign authoring boundary, require the existing campaign scope,
CSRF, and revision checks, and can be reversed in the dashboard. Additional
recipient compatibility and platform fulfillment separation are preserved.
Report contents remain handled by the existing outbox and provider pipeline;
this change does not introduce automatic catch-up or immediate assignment mail.
Investigation evidence omits supporter identities, report CSV contents, and
credentials. The user explicitly approved today's one-time catch-up to Chelsea.
