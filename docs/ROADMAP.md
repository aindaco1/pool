# Roadmap

## Prospective Product Work

### Tax Coverage and Reporting

Extend the shared Platform tax data and adapters described in [Tax Calculator](TAX_CALCULATOR.md#shared-us-postal-and-local-rate-data).

- [ ] Expand reviewed public U.S. local-rate coverage and jurisdiction diagnostics, including territory and special-district gaps. Keep missing or ambiguous coverage explicitly estimated. Use the existing weekly Platform candidate-refresh workflow and reviewed consumer pins; do not add a duplicate Pool rate watcher or make a paid provider mandatory.

- [ ] Expand and refresh the five-location New Mexico starter dataset in Platform. Keep its existing source/generation metadata, add effective-period and stale-data handling, and review changes against the address-provider path before adopting them.

- [ ] Define item-level tax categories and a shared tax-line contract for tiers, support, add-ons, and shipping before adding category-specific taxability. Preserve Worker authority, integer-cent totals, saved pledge prices, and historical tax evidence.

- [ ] Make missing-input, provider-failure, and fallback explanations consistent across checkout, Manage Pledge, and operator diagnostics. Reuse the existing typed provider errors, estimate metadata, and deadlines that cover response bodies; define any new caching or retry policy separately.

- [ ] Add tax-liability exports grouped by stored jurisdiction, source, rate, campaign/platform ownership, and modification or refund deltas. Existing pledge exports cover Stripe fees, not this jurisdiction-level accounting. Define destination-data minimization and retention; do not recalculate old pledges from current rates.

International VAT/GST expansion, exemption certificates, VAT IDs, reverse charge, tax-inclusive pricing, and invoicing remain conditional on an operator-defined business scope and applicable obligations.

### Shared Inventory and POS

Pool already reserves finite rewards through its inventory Durable Object and shared inventory mechanics. The remaining proposal is a stock authority across Pool, Store, and in-person sales. The [detailed design](proposals/shared-inventory-pos.md) defines mapping, pricing, security, and recovery requirements.

- [ ] Run a Stripe test-mode investigation of Payment for Stripe catalog sales, refunds, cancellations, and delayed/offline events. Establish which verified line-item identities can safely produce inventory changes.

- [ ] Implement an opt-in, default-off shared stock coordinator for eligible finite Pool/Store items, with exact SKU/variant and separate test/live mappings. Seed a shared baseline once; keep online and in-person pricing independent after initial creation.

- [ ] Extend reservation and delta handling across channels with attributable signed-webhook ingestion and bounded reconciliation. Define failed-payment holds, refund/restock decisions, offline-sale deficits, safety buffers, and stale-service behavior before live activation; do not claim hard POS oversell prevention.

- [ ] Deliver scoped admin controls, audit history, read-only preflight, safe disable/unlink migrations, backup coverage, and cross-repo compatibility tests. Preserve existing pledge/order truth and refuse new or increased linked quantities when shared stock cannot be trusted.

## Conditional Product Decisions

These need a concrete campaign or operator use case before implementation.

- [ ] Add a terminal interface if onboarding needs more guidance than [the existing setup CLI](../scripts/setup-deploy.mjs). Reuse its local/production modes, readiness checks, dry runs, and provider operations. Preserve non-interactive use, mask secrets, and expose planned changes, progress, retries, and fallback commands without creating another test runner.

- [ ] Design shorter-lived supporter management links together with reissue and recovery. Evaluate a one-time exchange that removes the raw supporter token from the URL while preserving order scope. Do not duplicate the admin session or protected-preview flows.

- [ ] Add maintained translations of creator-authored campaign content where a campaign needs them. Add another interface language only with an owner, fluent review, and locale-specific release evidence; the English/Spanish interface already has its own maintenance workflow.

- [ ] Complete Podcast benefit mappings, entitlement duration, pledge selection, issuance/revocation, durable delivery, and supporter email around the existing signed bridge. Keep activation disabled until a controlled cross-service grant/revoke and recovery exercise passes.

- [ ] Differentiate advisory polls from binding supporter votes only if campaigns need distinct copy, reports, or outcome workflows. Preserve the existing supporter-only storage and tally contract.

Manual assistive-technology acceptance, physical-host coverage, and Jev calibration are tracked in [Accessibility](ACCESSIBILITY.md#manual-checks), [Podman](PODMAN.md#support-matrix), and [Testing](TESTING.md#advisory-jev-pilot). Campaign-specific launches belong in the [creator checklist](../creator-campaign-checklist.md).
