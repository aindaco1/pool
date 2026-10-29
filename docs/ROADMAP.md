# Roadmap

## Prospective Product Work

### Tax Coverage and Reporting

Use [Tax Calculator](TAX_CALCULATOR.md#shared-us-postal-and-local-rate-data) as the implemented baseline. Extend the shared Platform tax-core data and adapters rather than duplicating them in Pool.

- [ ] Expand reviewed public U.S. local-rate coverage and jurisdiction diagnostics, including territory and special-district gaps. Keep missing or ambiguous coverage explicitly estimated. Use the existing weekly Platform candidate-refresh workflow and reviewed consumer pins; do not add a duplicate Pool rate watcher or make a paid provider mandatory.

- [ ] Expand and refresh the five-location New Mexico starter dataset in Platform. Keep its existing source/generation metadata, add effective-period and stale-data handling, and review changes against the address-provider path before adopting them.

- [ ] Define item-level tax categories and a shared tax-line contract for tiers, support, add-ons, and shipping before adding category-specific taxability. Preserve Worker authority, integer-cent totals, saved pledge prices, and historical tax evidence.

- [ ] Distinguish missing input, provider failure, and fallback consistently across checkout, Manage Pledge, and operator diagnostics. Build on existing estimate/coverage metadata and provider timeouts; add caching, bounded retries, or circuit breaking only with defined stale-data and failure behavior.

- [ ] Add tax-liability exports grouped by stored jurisdiction, source, rate, campaign/platform ownership, and modification or refund deltas. Define destination-data minimization and retention alongside fulfillment and accounting needs; do not recalculate old pledges from current rates.

International VAT/GST expansion, exemption certificates, VAT IDs, reverse charge, tax-inclusive pricing, and invoicing remain conditional on an operator-defined business scope and applicable obligations.

### Guided Terminal Setup

- [ ] Add a small terminal interface around [the existing setup CLI](../scripts/setup-deploy.mjs). Reuse its local/production modes, readiness checks, dry runs, and provider operations; preserve direct non-interactive use.

- [ ] Show planned changes, progress, skipped checks, retry options, and copyable fallback commands. Mask secrets and export only redacted setup evidence. Link to existing development and smoke-test commands instead of creating another test runner.

### Shared Inventory and POS

This remains a cross-project proposal. The [detailed design](proposals/shared-inventory-pos.md) preserves the mapping, pricing, inventory, security, and recovery requirements; provider behavior must be verified before implementing it.

- [ ] Run a Stripe test-mode investigation of Payment for Stripe catalog sales, refunds, cancellations, and delayed/offline events. Establish which verified line-item identities can safely produce inventory changes.

- [ ] Implement an opt-in, default-off shared stock coordinator for eligible finite Pool/Store items, with exact SKU/variant and separate test/live mappings. Seed a shared baseline once; keep online and in-person pricing independent after initial creation.

- [ ] Add atomic, idempotent reservations and deltas, attributable signed-webhook ingestion, and bounded reconciliation. Define failed-payment holds, refund/restock decisions, offline-sale deficits, safety buffers, and stale-service behavior before live activation; do not claim hard POS oversell prevention.

- [ ] Deliver scoped admin controls, audit history, read-only preflight, safe disable/unlink migrations, backup coverage, and cross-repo compatibility tests. Preserve existing pledge/order truth and refuse new or increased linked quantities when shared stock cannot be trusted.

## Validation Still Needed

- [ ] Record manual VoiceOver/NVDA checks for cart, checkout, Manage Pledge, community, and admin flows when a release includes that acceptance scope. Keep this separate from existing automated keyboard, axe, responsive, and locale coverage. See [Accessibility](ACCESSIBILITY.md#manual-checks).

- [ ] Validate rootless development on representative Linux and Windows physical hosts and record the results in [Podman](PODMAN.md). The existing Linux container CI and host-browser checkout helper are not evidence of every physical-host setup.

- [ ] Calibrate the advisory Jev supporter-message pilot with fluent English/Spanish review, separate calibration and held-out examples, and repeated-run stability before considering a CI gate. Keep payment math, permissions, and provider acceptance deterministic. See [Testing](TESTING.md#advisory-jev-pilot).

## Conditional Product Decisions

These need a concrete campaign or operator use case before implementation.

- [ ] Design shorter-lived supporter management links together with reissue and recovery. Evaluate a one-time exchange that removes the raw supporter token from the URL while preserving order scope. Do not duplicate the admin session or protected-preview flows.

- [ ] Add maintained translations of creator-authored campaign content where a campaign needs them. Add another interface language only with an owner, fluent review, and locale-specific release evidence; the English/Spanish interface already has its own maintenance workflow.

- [ ] Complete Podcast benefit mappings, entitlement duration, pledge selection, issuance/revocation, durable delivery, and supporter email around the existing signed bridge. Keep activation disabled until a controlled cross-service grant/revoke and recovery exercise passes.

- [ ] Differentiate advisory polls from binding supporter votes only if campaigns need distinct copy, reports, or outcome workflows. Preserve the existing supporter-only storage and tally contract.

Routine SEO checks, accessibility regressions, new-control localization, and release verification belong in the [testing](TESTING.md), [SEO](SEO.md), and [release](MERGE_SMOKE_CHECKLIST.md) guides. Campaign-specific distribution launches belong in the [creator checklist](../creator-campaign-checklist.md) and the campaign's operating plan.
