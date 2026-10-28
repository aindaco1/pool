# Shared checkout migration — 2026-10-28

## Follow-up: early Stripe SDK loading across Pool and Store

Platform 0.46.0 / Site Shell 0.6.0 is pinned at
`68b9b3073e0f4dc167dc638f56003f6bfcf49f8e` in both consumers. It adds injected,
key/options-specific SDK instance loading with shared pending promises and retry
on failure. Store now uses the shared script loader too. URLs, public keys,
locales, warmup timing and all payment/session policy remain consumer-owned.

Both apps start immediately on cart intent and also handle direct checkout route
entry. Pool additionally initializes the Checkout SDK with a pending secret;
canonical setup consumes it once. Warmup alone mounts no fields and requests no
server payment session. Store retains PaymentIntents; Pool retains Checkout
Session setup and later campaign settlement. Payment Element downloads still
wait for a valid session/intent, so the earlier network/CDN delay is not claimed
fully resolved. Ordinary catalog browsing stays free of Stripe initialization.

Rollback this follow-up's loader, sidecar/caller changes and version contracts
with the gitlink to `a2c684ceecbbf485c5ae8715a59d25bcf2bb3d53`. Leave canonical
orders/pledges and previous checkout/tax changes intact. The Platform commit is
local and must be published before consumer releases can fetch this pin.
No production deployment or payment confirmation was performed.

Early-loading verification: Platform `npm test` passed 390 tests and both
recipe checks. Focused consumer regressions cover one shared initialization,
failed-warmup recovery, no speculative server session or payment fields,
address/email edits, and slow fields that must not trigger a second mount.
A real Pool cart-only probe observed Stripe.js start at 398 ms, its controller
at 1,311 ms, and the Checkout SDK at 1,315 ms after opening the cart, with zero
payment-session requests during the 12-second observation. This proves overlap
with detail entry, not a fixed latency guarantee for Stripe's later field assets.

Pool verification: 1,196 unit tests passed (one intentional skip), plus 127
security tests, build checks, Worker smoke and mutable-pledge smoke. The full
unit phase used `--maxWorkers=2`: an unrelated Ruby/Jekyll catalog test exceeded
its 30-second timeout at default concurrency and passed when run alone and
with the lower-concurrency full suite. No test timeout or assertion was relaxed.
The complete gate then passed, including 178 browser tests (three existing
conditional skips). Logs: `/tmp/pool-premerge-logs.tg6HJv`.


## Follow-up: Stripe download path and overlapping session loading

Pool waited for `checkout.loadActions()` before creating/mounting the Payment
Element. It now mounts immediately, overlapping Stripe's field downloads with
session-action loading. Save still requires both completed mounting/contact sync
and the rendered event. Both returned action errors and rejected promises unmount
the elements and continue through the existing release/retry path.

The production sidecar uses the same Clover Stripe.js CDN as local Pool and still
contains the sequential wait. Read-only downloads of the same payment-UI asset
from fresh local/production browser contexts took 2.14 and 14.50 seconds,
respectively. No production checkout was created. This demonstrates that the
download delay is not exclusive to localhost; it does not establish customer-wide
latency or whether the cause is the local network, ISP routing, or Stripe's CDN.

Two real test-mode runs with cart `90210` → checkout `87048` verified the overlap
and correct button readiness. Cold readiness still took 50.5 and 65.9 seconds:
canonical setup took 13.8/14.3 seconds, and the payment-UI download took 35.2/48.8
seconds. The latter was Brotli-compressed (578,981 bytes), HTTP/2, with the first
byte after 0.32 seconds and most time spent receiving the response. Subsequent
ZIP edits to `10467` reached ready in 1.54/1.55 seconds. All test preparations were
abandoned successfully; no card was entered/saved and no pledge was confirmed.
These variable measurements are not a before/after speed guarantee.

Command-line compressed downloads also varied: the same asset took 17.7 seconds
over HTTP/1.1 and 6.4 seconds over HTTP/2. The earlier 45-second curl timeout used
an uncompressed response and is not directly comparable to browser timings.
System proxies and listed VPN connections were inactive during the check. No
network settings, Stripe version, or fraud controls were changed. The unresolved
cold-download issue needs a different-network comparison or CDN investigation;
loading-order changes cannot eliminate external transfer latency.

Regression checks: 70 unit tests passed (one existing skip), plus 21 browser edit
tests across the complete 20-test run and the additional stale-action case. The
three new sidecar cases failed before the fix. Syntax/diff checks and the watched
local build passed. Logs: `/tmp/pool-stripe-parallel-unit.log`,
`/tmp/pool-stripe-parallel-browser.log`, `/tmp/pool-stripe-parallel-stale.log`,
`/tmp/pool-stripe-overlap-live.log`, `/tmp/pool-stripe-network-detail.log`.
Changes remain local and have not been deployed.

## Follow-up: rendered payment readiness after cart ZIP changes

The user's Helium path was cart ZIP `90210` → checkout ZIP `87048`. Two browser
regressions failed before the fix: Save became enabled after mount returned but
before Stripe rendered, and a store update restarted an unfinished initialization
because the payment container was still empty. Readiness now requires the current
Payment Element's `ready` event as well as completed mounting/contact sync. The
drawer and button show localized loading feedback until then. Late callbacks from
old setups are ignored; `loaderror` uses the existing release/retry flow.

Stripe initializes when the cart opens and its instance is reused per public
key/locale. The local static page's live publishable key differed from its test
Worker; the ignored `_config.local.yml` override now matches the Worker test key.
Production keys and payment/pledge policy were not changed.

The final real-service `90210` → `87048` run showed the button becoming enabled
at the rendered event, never before it. It still took about 60 seconds on a cold
browser: the canonical setup request took 10.8 seconds, and a Stripe payment-UI
JavaScript download took 36.3 seconds. This confirms the readiness fix, not a
resolution of external download latency. The test preparation was abandoned;
no card was saved and no pledge/payment was confirmed. This real run used
Chromium; Helium acceptance remains a separate user check.
A separate command-line fetch of the same public Stripe asset received HTTP 200
and its first byte in 0.54 seconds, but still had not finished after 45 seconds
(1.47 MB transferred). This also reproduced slow transfer outside the browser;
it does not identify the network/provider cause.

Focused checks: 68 unit tests passed (one existing skip); 76 campaign/checkout
browser tests passed (three existing fixture skips), followed by all 19 checkout
edit tests including two additional late-event/load-error cases. There are 78
distinct passing browser cases across these runs. Syntax/diff checks and the
watched local build passed. Logs: `/tmp/pool-payment-ready-before.log`,
`/tmp/pool-payment-ready-unit.log`, `/tmp/pool-payment-ready-browser.log`,
`/tmp/pool-payment-ready-final.log`, `/tmp/pool-payment-ready-live.log`.

API contracts checked against Stripe's [rendered event](https://docs.stripe.com/js/element/events/on_ready)
and [instance reuse guidance](https://docs.stripe.com/js/initializing).

## Follow-up: payment refresh latency

ZIP/state edits previously waited for preview shipping/tax before preparing a
replacement setup, with another blocking tax preview during preparation. Local
timing captured an eight-second tax preview before the setup request even began.
Previews and canonical setup now run concurrently after reservation release.
Identical pending preview requests share one fetch, without caching completed
rates or failures. Confirmation remains disabled while current previews update.

The held-preview billing and shipping browser regressions failed before the fix
and passed afterward. Coverage also verifies that an old delayed tax response
cannot overwrite a newer ZIP/state, fields/scroll stay intact, and failed release
still blocks replacement. Focused results: 74 browser tests passed, three existing
fixture skips; 66 unit tests passed, one existing skip. Syntax, diff and watched
Jekyll rebuild checks passed. These are focused follow-up checks; the earlier full
premerge results below predate this latency change.

Real test-mode checks kept Stripe and tax services active: New York payment ready
in about 1.7 seconds, returning to New Mexico about 8.2 seconds (about 6.8 seconds
in the canonical setup request). A cold Stripe load was also variable and slower;
these observations are not latency guarantees. External tax/Stripe latency still
applies. Test preparations were abandoned without saving a card or confirming a
pledge. Local Pool remains available on port 4000. No production deployment.

Logs: `/tmp/pool-checkout-latency-before.log`,
`/tmp/pool-checkout-latency-browser.log`, `/tmp/pool-checkout-latency-stale.log`,
`/tmp/pool-checkout-latency-unit.log`.

Local implementation and verification; no production deployment or live payment
acceptance is claimed. Platform commit `a2c684ceecbbf485c5ae8715a59d25bcf2bb3d53`
is on local branch `codex/shared-checkout-behavior` and must be published before
consumer commits using that gitlink can be cloned elsewhere.

## Shared boundary

- Site Shell 0.5.0: common email/ZIP validity, debounced preparation, latest lookup
  generation, detail signature and one-time drawer scrolling.
- Tax Core 0.4.0: attributed GeoNames postal consistency, conservative OpenSalesTax
  snapshot/resolver and explicit-output refresh utilities. The weekly candidate
  refresh belongs to Platform; consumers adopt reviewed pins independently.
- Design Core 0.3.1: mobile form inputs remain at least 16px without disabling zoom.
- Each app retains markup/localization, routes, canonical totals, reservations,
  storage and Stripe lifecycle. Reference JSON is excluded from static output.

Platform `npm test`: 388 tests plus both clean-checkout recipe checks passed.
Source licenses/NOTICE were preserved verbatim, including their trailing blank
lines. No customer data or new storage key family was added to Platform.

## Payment and interaction invariants

Store keeps immediate PaymentIntents, inventory holds, free orders and fulfillment.
Pool keeps Checkout Session setup and later campaign settlement. Edits never
confirm payment/pledges, stale work cannot mount, and failed release blocks new
preparation. Fields remain mounted; only the payment slot and summaries update.
City corrections are optional. Missing local tax coverage stays explicitly
estimated, as requested; the shared data is not nationwide street-level tax accuracy.

## Rollback

Roll back this consumer's adapters, loader, tests and gitlink together, independently
of the other consumer. A pin-only rollback is incompatible with the new imports.
Keep canonical persisted orders/pledges and their stored totals; do not reprice
existing records or retry ambiguous payment confirmation. Store's tool dependency
lock must travel with its release-core pin. The pre-extraction local submodule
changes were preserved in named Git stashes before selecting the immutable commit.

Previous Pool Platform pin: `57cc033e248f92835c4c5ee29c823cadbb5050a2`.

## Consumer verification

Full unit gate: 1188 passed, one existing skip. Security: 127 passed. Build,
pin/template checks, Worker smoke and mutable-pledge smoke passed. The earlier
checkout browser run passed 65 cases with three fixture-dependent skips; the
new edit/retry suite passed seven cases before adding overlay coverage. A first
concurrent unit run timed out in the unrelated Ruby product-page generator;
the complete unit rerun passed. The final sidecar/cart focused rerun passed
66 tests with one existing skip. Logs: `/tmp/pool-premerge-logs.syQMuS`.
Complete premerge gate passed, including 163 browser tests with three existing
fixture-dependent skips. The browser/API integration test reports an unavailable
Worker during that stage; actual Worker availability was verified separately by
the passing Worker and mutable-pledge smoke phases.

Final visual review corrected the reminder-consent label to reuse Pool's existing
checkbox layout. The final eight checkout browser tests (including bounds checks
for that text, actual mobile input sizes and overlay interaction) passed; the
final cart/sidecar/signed-contribution unit run passed 77 tests with one existing
skip. Screenshots were reviewed at desktop and mobile sizes. The final Jekyll
build passed and excludes both reference databases from static output.

Browser card-entry fixtures mock Stripe; no production charge, physical Safari
acceptance or Proton Pass/Helium acceptance is claimed by these automated tests.

## Follow-up: editable checkout release and shipping display

Local testing exposed a CORS mismatch on `/checkout-intent/abandon`: successful
release returned the default production origin instead of the configured origin.
The browser could not read that response, so address edits stopped at “Failed to
fetch.” Release success, missing-order validation and throttling now use the
configured CORS origin and private/no-store responses. Reservation handling is
unchanged. The shipping summary now retains the full selected shipping price
when the delivery-option selector is shown, in both cart and checkout.

The new local/fork origin tests failed before the fix. A browser regression uses
the real Worker release handler over a separate HTTP origin and verifies payment
repreparation after ZIP/state edits without replacing inputs or moving scroll.
Desktop/mobile regressions verify shipping prices, option surcharges and totals.

Focused verification: 179 unit tests passed (one existing skip); 70 campaign and
checkout browser tests passed (three existing fixture skips). The local Jekyll
rebuild and syntax/diff checks passed. The served release endpoint was checked for
both success and validation responses, and shipping screenshots were reviewed at
1280px and 390px. Logs: `/tmp/pool-checkout-fix-final-unit.log` and
`/tmp/pool-checkout-fix-final-browser.log`. The full premerge gate above predates
this small follow-up and was not rerun. Local Pool and Store remain running; no
production deployment was performed.

## Follow-up: compact summary layout

Cart and checkout now share a two-column label/amount layout at every viewport.
The desktop shipping row inserts a compact selector before its right-aligned
price; mobile puts the selector below the label. The total has a subtle divider.
Controls retain a 44px minimum tap target and mobile text of at least 16px.

Verified the rendered cart/checkout summaries at 1280px, 390px and 320px. Layout
regressions assert aligned price edges, labels beside amounts, compact selector
width, touch size and desktop/mobile placement. All 12 checkout edit/browser
tests and 59 cart unit tests passed (one existing unit skip). Local Jekyll rebuilt
successfully; syntax and diff checks passed. Logs: `/tmp/pool-summary-layout.log`
and `/tmp/pool-summary-layout-unit.log`; screenshots: `/tmp/pool-summary-layout-results`.


## Follow-up: Store regression and comparative real-provider checks

Store's later warning was traced to a local test-storage reset colliding with
an existing Stripe test idempotency key; its regression storage is now separate
from preview storage. No Pool storage or payment lifecycle change was needed.
A browser-only comparison using the earlier HEAD Pool sidecar plus a readiness
measurement listener loaded real Stripe test fields in 2.56 seconds after
completing details for 10467; the current early-loading adapter took 2.29 seconds.
Changing the prepared checkout from 10467 to 87048 took 6.53 seconds, including
5.27 seconds in canonical server setup and about 0.51 seconds from mount to ready.
The synthetic NM address exercised the external GRT lookup, not production tax
accuracy. No card was entered, payment method saved, or pledge confirmed.

These observations do not prove every earlier intermittent stall was caused by
a CDN, nor do they guarantee production latency. Pool already prepares payment
without serially awaiting its tax preview. Store's redundant submit preview was
removed, and its canonical payment totals now govern its prepared summary. The
shared Platform loader and Pool's separate setup/later-settlement flow remain
unchanged by this follow-up. No production deployment was performed.
