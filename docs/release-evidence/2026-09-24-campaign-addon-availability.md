# Campaign add-on availability and dashboard state — September 24, 2026

## Reproduction and cause

The live Deinonychus page embedded all five campaign add-ons and the public
campaign API correctly reported `live` (September 15–October 16). Opening its
cart after adding the $5 tier showed only platform products. The production
inventory endpoint reported all five campaign products as sold out even though
their published `inventory` was `null`.

Worker and browser inventory readers coerced `null` and blank strings to zero.
The dashboard State row separately showed the saved `upcoming` field while its
existing effective-state calculation correctly resolved the campaign as live.

## Change and regression coverage

- Preserve blank, absent, and null product/variant inventory as unlimited in
  the Worker, shared browser helper, and cart/Manage fallback helpers.
- Preserve explicit zero and finite stock limits, including sold-count deltas.
- Keep unlimited quantity controls unbounded instead of clamping selections to
  one; retain finite limits and canonical Worker price/quantity validation.
- Version browser inventory caches to bypass incorrect pre-fix sold-out
  snapshots; confirmed pledges invalidate both old and current cache entries.
- Display effective campaign state using the existing platform-timezone helper.
  Start/deadline boundary tests exercise the role-scoped settings endpoint
  without changing the saved campaign or writing KV state.
- Test English/Spanish browser carts with serialized null inventory for simple
  products and variants, old cached stock, two-unit selection, and sold-out
  exclusion. Worker checkout tests distinguish null stock from explicit zero.

The targeted pre-fix runs reproduced 11 failures across inventory, cart and
state tests, plus two Manage failures. Their relevant suites pass after the fix.
Further release gate and production verification results are recorded below
when completed.

## Ethical risk review

The change corrects false scarcity and inaccurate campaign status for creators
and supporters. Canonical pricing, campaign ownership, finite stock limits,
private administration, and optional supporter selections remain enforced.
No new data collection, messaging, permission, charge, or public-content
mutation is introduced. Local provider calls use test fixtures and mocks;
live acceptance is limited to read-only inventory/status checks and a disposable
browser cart without entering payment or supporter information.
