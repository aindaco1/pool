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
- Complete local pre-merge gate passed on `7860efc`: 117 browser cases passed,
  7 passed on retry, and 3 were skipped. The new confirmation/recovery scenarios
  passed, including pending and confirmed accessibility checks in both languages.
- [Hosted Merge Smoke and all four dependency audits](https://github.com/aindaco1/pool/actions/runs/35141504287)
  passed on the same code commit.

## Production verification

- [PR #54](https://github.com/aindaco1/pool/pull/54) merged as
  `d8c5a757687ee8ac1fc7a7374e1b91624f7e7a1e`.
- [Deploy Production](https://github.com/aindaco1/pool/actions/runs/35142218111)
  deployed that exact revision to both the Worker and GitHub Pages successfully.
  Worker version `c18bf5b7-c615-4d3e-94a5-6157b2dd68bc` received 100% of traffic.
  Public admin security policy and crawl endpoint checks passed.
- [Release Provider Evidence](https://github.com/aindaco1/pool/actions/runs/35142198870)
  passed. This does not claim a complete audit of every payment, email, shipping,
  and tax provider.
- Public English/Spanish result HTML contains the pending panel, hides success
  until confirmation, and retains `noindex`; deployed cart/result scripts contain
  recovery logic. A production browser showed pending on an unconfirmed result
  page and success only after reading the recovered pledge from the server.
- The reporting supporter's latest already-approved setup session was recovered
  through the supported same-session completion endpoint at approximately
  19:47 UTC. It returned HTTP 200 with `persisted: true`. Direct production KV
  verification and the private/no-store summary both confirmed one active pledge:
  $150.00 campaign contribution, $3.00 shipping, $22.50 tip, and $175.50 total.
  Shipping details and existing Stripe customer/payment-method/setup references
  are present; the pledge is uncharged. The earlier repeat attempt has no pledge.
- The normal transactional confirmation passed through the durable email outbox.
  Its delivery record subsequently reached `delivered` with a provider receipt,
  and the pending outbox payload was removed. This establishes provider-reported
  delivery, not that the supporter opened the message.

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

Local tests use synthetic Stripe responses and local storage. Production deployment,
same-session recovery, canonical pledge persistence, duplicate avoidance, and the
rendered confirmation were verified separately above. No new live-card checkout or
charge was created for testing. Provider-reported email delivery was verified
separately; inbox placement and reading the message were not checked.
