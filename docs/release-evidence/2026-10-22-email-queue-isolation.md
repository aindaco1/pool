# Pool email queue isolation

Production inspection confirmed Pool's PLEDGES binding and Store's STORE_STATE
binding use the same KV namespace. Both schedulers previously read
`email-outbox:v1:*` and `email-outbox-queue:v1`. Store tried to render Pool's
`charge_success` jobs with its Store-only template map, then deferred the shared
queue. Four successful settlements therefore had pending receipts even though
their payment state was correct.

Pool now owns `pool:email-outbox:v1:*` and `pool:email-outbox-queue:v1`.
Existing deterministic job IDs, Resend idempotency keys, delivery evidence,
and suppression records are unchanged. The email guide documents exact-job
migration after checking provider evidence; no automatic legacy queue adoption
can capture another product's mail. The backup inventory, security guide,
performance guide, and settlement queue assertions match the new keys.

## Verification

- Focused outbox and Worker operations suites: 53 tests passed.
- Shared-KV regression delivers a charge receipt with tax, shipping, and tip,
  preserves the other product's pending job and idle/future queue marker, and
  checks the unchanged Resend idempotency key and no second send on another tick.
- Data inventory audit and diff whitespace check passed.
- Merge Smoke supplies the complete pre-merge and dependency release gate.

## Ethical risk review

This changes queue ownership only. Payment records and provider charge calls are
outside this change. Recovery preserves receipt content and identity, checks
provider acceptance before moving records, and keeps private audit snapshots
outside the repository. No audience, consent, pricing, locale, tracking, or
marketing behavior changes.
