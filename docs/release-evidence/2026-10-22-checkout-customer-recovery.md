# Checkout customer identity and settlement recovery

The browser checkout completion and Stripe webhook previously created customers
with different idempotency keys, then raced to attach the same payment method.
An attachment error was swallowed, allowing a pledge with a null customer ID.
Settlement skipped that pledge before attempting payment or sending a failure email.

Both paths now resolve the payment method's existing customer or use identical
customer-creation parameters and keys. Unresolved attachment conflicts fail
retryably before persistence. Webhook failures release their processing lease.

The existing admin backfill accepts a campaign-scoped order list and an
existing-only mode. It verifies saved Stripe attachments and preserves other raw
pledge fields under the settlement lock. Settlement batches re-read pledge state
under the lock, reject duplicate order IDs, exclude paid/cancelled records, and
queue the existing localized failure email through the outbox.

## Verification

- Focused customer, checkout, and operational tests passed (160 tests before the
  final lock-race regression; the full suite includes that additional test).
- Full unit suite: 1,168 passed, one existing skipped test, 117 files.
- Secret audit, template drift, syntax, build artifacts, and security suite passed.
- Root and Worker dependency audits, production and full: zero vulnerabilities.
- Local pre-merge stopped at the Podman resource check because its engine was
  unreachable. The GitHub Merge Smoke gate supplies the remaining release check;
  deployment requires a successful run on the reviewed commit.
- Read-only production posture used the actual deployed secret-name inventory;
  provider readiness was not supplied to that report and remains a warning.

## Ethical risk review

Affected users are supporters with saved payment methods and campaign operators.
The relevant risks are duplicate charges, misleading payment status, and private
payment data exposure. The repair only restores verified customer links; normal
settlement retains its durable intent journal and deterministic provider keys.
Regression coverage includes a paid 100,000-cent order and a separate unpaid
50,300-cent order for the same supporter, repeat settlement, and a lock/read race.
No pricing, consent, localization, or public indexing contract changes. Failure
notifications use the existing transactional template and outbox. Customer
identifiers and operational before/after records remain outside the repository.
