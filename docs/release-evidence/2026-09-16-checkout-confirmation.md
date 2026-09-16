# Checkout confirmation incident — 2026-09-16

## Observed production failure

Read-only Stripe and Cloudflare inspection found two recent successful setup-mode
sessions for the reporting supporter, but neither corresponding canonical pledge
existed. Stripe webhook observations recorded repeated HTTP 409 conflicts. Setup
sessions did not create PaymentIntents or charges. No payment credentials, addresses,
email addresses, session IDs, or private links are retained in this report.

The stored quote hash matched Stripe metadata. Checkout start discarded shipping
address detail before tax normalization; webhook completion recalculated the quote
from the fuller Stripe address and rejected the changed integrity hash. Recovery
read only the old `shipping_details` field, leaving location-aware tax calculation
without an address. The current Stripe representation of the affected setup session
omitted shipping; retrieving that same object with the webhook API version exposed
its saved address. The browser hid these failures behind a processing timeout,
re-enabled card confirmation, and deleted recovery material when checkout closed.

Stripe documents the shipping-field move in its
[Basil changelog](https://docs.stripe.com/changelog/basil/2025-03-31/checkout-session-remove-shipping-details).
The observed legacy-only custom-session address is an additional provider
compatibility case verified directly in this incident.

## Change

- Webhook and browser recovery share the hash-verified, accepted Worker quote.
  Completion preserves amounts instead of requoting after card setup. New quotes
  retain the complete supplied shipping address and tax destination.
- Read both Stripe address formats, with a bounded same-session legacy retrieval
  for the observed custom-setup compatibility case.
- Serialize completion per order using the existing `CHECKOUT_INTENTS` binding;
  preserve a short-lived completion result and retry failed/interrupted work.
- Use the successful persistence response directly rather than rejecting success
  because a subsequent KV read is stale.
- Retain expiring quotes after drawer close, preserve tab-scoped recovery references,
  and retry the existing order without confirming Stripe again or creating a new
  session. Show an explicit unconfirmed state, reference, and support contact.
- Keep English/Spanish result-page success content hidden and retain the cart until
  persistence is established, including Stripe redirect recovery.
- Fail closed for missing/expired first-party manifests. Do not blindly reconstruct
  old repeat attempts or create charges as a recovery operation.

## Local verification

- Reproduced the physical checkout failure in Worker tests before changing the code.
- Focused final tests: 168 passed, 1 pre-existing skipped test.
- Full unit suite: 1,000 passed, 1 pre-existing skipped test.
- Security suite: 127 passed.
- Secret audit, syntax, Jekyll/template checks, build/minification/SEO checks,
  release-command checks, host Worker smoke, and Podman mutable-pledge smoke passed.
- English/Spanish completeness and storage-inventory audit passed.
- Browser coverage includes ordinary confirmation, stale summary after a successful
  completion response, retry/reload without a second Stripe confirmation or session,
  and result-page cart retention until server confirmation.
- Final full browser gate and deployment evidence are recorded below when complete.

## Ethical risk review

Affected users are supporters and campaign operators. Relevant risks are financial
consent, uncertainty after a successful provider operation, duplicate attempts, and
retention of checkout data. The change preserves the accepted amount, does not create
charges, keeps pending state truthful, serializes duplicate completion, and offers
reference-based recourse. Recovery stores only order/session references in the same
tab; the existing restricted checkout quote retains its existing 24-hour TTL.
New completion Durable Objects expire by alarm and are never backup/restored as
pledge truth. Transactional delivery continues through the existing outbox.

## Acceptance boundary

Local tests use synthetic Stripe responses and local storage. They do not establish
production deployment, a new live-card checkout, provider email delivery, or the
reporting supporter's final pledge status. Those require separate production evidence.
