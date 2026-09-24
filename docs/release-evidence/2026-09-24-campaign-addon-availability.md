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

## Local verification

- Full unit suite: 1,054 passed, one existing skip. Security suite: 127 passed.
- Four new English/Spanish Chromium cases passed for simple products and
  variants, including two-unit selections and exclusion of explicit zero stock.
- Root and Worker dependency audits passed for both production and full scopes,
  with zero findings across all four audits.
- `npm run test:premerge` passed secret, template drift, syntax, focused/full
  unit, build, security, resource, Worker smoke, and Podman mutable-pledge phases.
  Its five-worker browser phase failed three existing cases and retried fourteen.
  The admin failure trace records `ERR_CONNECTION_RESET` while loading shared
  browser scripts and `admin-dashboard.js` from the local Python server.
  The full browser phase rerun with `PLAYWRIGHT_WORKERS=1` passed 138 tests,
  with no retries and three existing skips.
- The same-day baseline gate and hosted run for PR #62 passed on the unchanged
  Worker/browser implementation. Between that baseline and this repair's base
  `fda6c5b`, main only added campaign draft/public content and three image sources;
  those latest campaign assets are included in this repair's build verification.

## Merge and deployment

[PR #63](https://github.com/aindaco1/pool/pull/63) merged as
`7aa193197c3c2844f4c723939a678ffa0048930a` after
[Hosted Merge Smoke](https://github.com/aindaco1/pool/actions/runs/36058626724)
passed the entire premerge gate and all dependency audits for `bcd7769`.

[Deploy Production](https://github.com/aindaco1/pool/actions/runs/36059538085)
passed against that exact merged revision, deploying Worker version
`618f962a-1855-472b-8c78-737f7aea6d31`, publishing Pages, and purging the CDN.
Both localized admin security-policy checks and the 18-URL crawl audit passed.
The diary check found no new entries and sent no email.

## Production acceptance

At 21:14 UTC on September 24, the public campaign API reported `live`, with
start date September 15 and deadline October 16. The production inventory
endpoint reported all five campaign products available, with unlimited stock
represented by `null` and `soldOut: false`. Its response retained
`private, no-store, max-age=0`; deployed browser code uses the v2 inventory cache.

After reloading the existing browser session that reproduced the failure, the
cart visibly showed Drawing of YOU as a Dinosaur, Dino plushie, Cretaceous
Critters T-Shirt, Cretaceous Critters Keychain, and Deinonychus Stickers. Adding
two plushies produced a $100 add-on line and a $105 subtotal including the
$5 tier. Both temporary selections were removed and the cart was verified empty.
No checkout, pledge, payment, or supporter details were submitted.

The production admin tab required sign-in, so the authenticated State row was
not visually inspected in production. Its effective-state behavior is covered
by the role-scoped Worker tests and included in the verified deployed revision.
Campaign dates and saved content were not changed to mask the display defect.

## Ethical risk review

The change corrects false scarcity and inaccurate campaign status for creators
and supporters. Canonical pricing, campaign ownership, finite stock limits,
private administration, and optional supporter selections remain enforced.
No new data collection, messaging, permission, charge, or public-content
mutation is introduced. Local provider calls use test fixtures and mocks;
live acceptance is limited to read-only inventory/status checks and a disposable
browser cart without entering payment or supporter information.
