# Manage Pledge tax confirmation — 2026-09-16

## Findings and change

The reported confirmation showed $184.57: $156.00 subtotal, $23.40 tip,
$0.00 tax, and $5.17 shipping. The page showed $196.47 with $11.90 estimated
tax. Two defects combined:

- The page used `taxQuote.taxCents || newTax`, replacing a quoted zero with
  its local estimate. The modal retained zero. Related rate fallbacks treated
  an explicit zero rate as missing.
- An incomplete historical quote destination took precedence over the complete
  saved shipping address in preview requests and Worker modification totals.
  Missing state caused the New Mexico provider to use the offline zero result.

Both displays now retain validated quoted amounts, including zero, and use the
same existing fallback for malformed or failed quotes. A delayed tax response
cannot replace a newer selection. New preview and modification quotes select
the normalized billing address, then shipping address, then historical quote
destination. Legacy shipping aliases remain supported. Rate labels retain up
to four decimal places. Accepted historical totals and quote history are preserved.

## Address-specific rate verification

A live EDAC lookup for the supporter-supplied address returned location `29-504`
and a 7.5625% rate (`nm_grt_api_intuit`). The published
[July 2026–June 2027 New Mexico GRT dataset](https://rgis.unm.edu/rgis6/dataset.html?uuid=9c374cf7-70a3-434d-af2a-a7f84547315b),
linked by the [New Mexico Taxation and Revenue Department](https://www.tax.newmexico.gov/businesses/geographic-information-system-gis/data-download/),
independently lists Corrales, Sandoval County, location `29-504`, at 7.5625%.
The downloaded dataset's CSV row was checked directly.

Under the existing taxable-subtotal contract, $156.00 × 7.5625% rounds to
$11.80 tax. With $23.40 tip and $5.17 shipping, the preview total is $196.37.
No personal street address, management token, or order identifier is recorded here.

## Regression verification

The new browser and Worker destination tests failed against the old selection
logic: the provider received a country/postal-only destination and returned the
wrong source/rate. They pass with the fix. Synthetic fixture addresses are used.

- Focused Manage Pledge, Worker business logic, and tax suites: 147 passed.
- Worker modification coverage checks billing precedence, complete legacy shipping
  fields, historical-only fallback, and invalid billing fallback. It verifies
  canonical persisted tax and retained original history.
- English/Spanish browser cases compare page and modal totals at zero tax,
  7.625%, and 7.5625%, verify the complete outgoing destination, and preserve
  the exact four-decimal label. No modification is sent by preview checks.
- Display regressions cover zero-rate fallbacks, malformed quote amounts,
  cached reuse, and responses arriving after a newer edit.

The local full pre-merge run passed every non-browser phase: 1,012 unit tests
(one existing skip), 127 security tests, secret/template/syntax checks,
production build/minification/SEO, release-command checks, host Worker smoke,
and isolated Podman pledge modification/cancellation smoke.

The browser phase passed all six new tax cases and 126 cases immediately,
with three existing cases passing on retry, three skipped, and one unrelated
Spanish admin layout case failing. All four affected existing cases passed
on an isolated single-worker rerun (4/4), without code changes. The 7.5625%
confirmation screenshot was visually inspected and showed $196.37.

[Hosted Merge Smoke](https://github.com/aindaco1/pool/actions/runs/35146503793)
passed the complete pre-merge gate, including the full browser phase, and all
four root/Worker production/full dependency audits passed on `cdd6c2b`.
[PR #55](https://github.com/aindaco1/pool/pull/55) merged as
`c8df219985cd1c02262d49342665789eb709d1ca`. The merge-triggered
[Release Provider Evidence](https://github.com/aindaco1/pool/actions/runs/35147351053)
workflow also passed; this is distinct from the address-specific lookup above.

## Ethical review and acceptance boundary

Supporters are reviewing a financial commitment. Inconsistent totals or a stale
address can misstate that commitment. The fix uses existing saved address data,
keeps the canonical Worker calculation aligned with the preview, preserves
historical accepted quotes, and retains the supporter confirmation step. It
collects no new data and changes no permission, indexing, localization routing,
or payment authority. Production verification does not submit a pledge update.


## Production runtime follow-up

The first [deployment](https://github.com/aindaco1/pool/actions/runs/35147362880)
successfully published the page/Worker address-selection fix and passed its
public security/crawl checks. The live preview then exposed an additional
provider transport defect: Cloudflare rejects `fetch` with `redirect: 'error'`
before making the request. The shared provider caught that error and Pool
silently used the configured 7.625% fallback (`nm_grt_fallback_flat`).

An isolated remote Worker using the production compatibility date and flags
reproduced that exact exception. Tax Core 0.3.1 switches to `redirect: 'manual'`
and explicitly rejects every 3xx response before reading a body or following
the redirect. The same remote Worker then returned the EDAC 7.5625% rate and
location `29-504` for the supplied address. The probe uses no production
bindings and persists no pledge data.

Provider regressions reproduce Cloudflare's supported redirect modes and reject
300–399 responses without following them or exposing request credentials.
A Pool adapter regression checks that the $156 subtotal returns $11.80 tax
through the live provider path, rather than $11.90 through the configured
fallback. Platform's security, dependency, package, and recipe checks passed.

Pool pins Platform 0.39.1 / Tax Core 0.3.1 at `51f552d02fe0f888ffdefcc556a4059067f0f3d4`.
The prior independent rollback pin is
`6b82237e926137b6062f9dd454bd6598280e7353`; reverting it also restores the runtime
defect. Other consumers retain their existing immutable pins.


## Final production verification

- [Platform PR #45](https://github.com/aindaco1/dust-wave-platform/pull/45)
  merged after Node 22/24 security and test jobs and the Jekyll recipe job passed.
  Local Platform checks passed 340 package tests plus consumer recipe checks.
- [Pool PR #56](https://github.com/aindaco1/pool/pull/56) merged as
  `565400ddfd7379af2165a1ad18c2250b2075c35f` after the complete
  [hosted Merge Smoke gate and four dependency audits](https://github.com/aindaco1/pool/actions/runs/35148548101)
  passed. The final focused Pool suites passed 155 tests.
- [Deploy Production](https://github.com/aindaco1/pool/actions/runs/35149305374)
  successfully deployed that exact revision to the Worker and GitHub Pages.
  Worker version: `a7ef698c-b74b-4eee-8479-7a3068c371db`. Public admin security
  policy and the 18-URL crawl audit passed.
- A production `POST /tax/quote` for the supplied address returned HTTP 200,
  `nm_grt_api_intuit`, location `29-504`, rate `0.075625`, and `taxCents: 1180`.
  The response retained `private, no-store, max-age=0` cache policy.
- A fresh production browser recreated the original two-sticker selection:
  $150.00 tier + $6.00 add-ons = $156.00 subtotal, $23.40 tip, $11.80 tax,
  $5.17 shipping, and $196.37 total. The page and confirmation modal both
  showed those values and the exact 7.5625% label. The modal was visually
  inspected and left open for the supporter; Confirm Changes was not clicked.
- Read-only production storage verification retained the original active,
  uncharged pledge at $175.50, with no saved platform add-ons. No pledge update
  or payment was performed by this verification.
