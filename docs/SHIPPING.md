# Shipping

This document describes the current shipping model in The Pool, including its Worker-first pricing flow, fork-facing config surface, USPS integration boundary, and remaining follow-up work.

Note: live USPS credentialed manual verification is still pending. Local fallback-path testing and automated coverage are in place, but a real USPS-backed smoke pass remains planned follow-up work.

## Recommended Scope

Current implemented scope:

- USPS live rating for **US domestic**
- USPS live rating for **international**
- a configurable **flat fallback shipping rate** when USPS is unavailable or returns no usable rate
- campaign-tier and support-item shipping metadata
- a shared preset catalog for common physical items

For The Pool, the fallback rate is **$3.00**.

## Goals

- replace the old flat per-campaign physical shipping fee with more realistic carrier-based pricing
- keep the Worker as the canonical source of shipping totals
- preserve checkout, pledge-modification, reporting, and email consistency
- stay safe on USPS quota usage and Cloudflare KV usage
- make the shipping model configurable and fork-friendly
- preserve the current security, accessibility, and localization baselines while doing so

## Non-Goals

- no user-facing carrier/service selector in v1
- no custom packing engine
- no browser-side shipping calculation from stored USPS tables
- no label purchasing in v1
- no multi-carrier abstraction in v1
- no attempt to solve non-US tax rules as part of shipping

## Guardrails

### Security

The shipping calculator must comply with the current security model:

- shipping totals stay Worker-calculated and canonical
- the browser never becomes the source of truth for shipping math
- destination/shipment inputs are validated and normalized before quoting
- no insecure direct browser calls to USPS
- no long-lived client storage of sensitive shipping quote state beyond what the current checkout flow already needs
- USPS failures must degrade to the configured fallback rate rather than creating an unsafe bypass or a broken checkout state
- any new Worker responses that contain shipping quote internals should follow the current no-store / private response posture where appropriate

### Accessibility

The shipping feature must preserve the current accessibility baseline:

- shipping-related address, quote, and fallback states must be understandable with keyboard-only interaction
- any new errors or notices must be tied to the relevant fields and live regions appropriately
- shipping summary updates in checkout and Manage Pledge must remain screen-reader understandable
- no regressions to the existing dialog/focus/error semantics in checkout or `Update Card`
- browser-level accessibility coverage should be expanded if new shipping UI states are introduced

### Internationalization

The shipping feature must fit the current i18n model:

- site-owned shipping labels, fallback messaging, and summary text should come from locale catalogs
- Worker supporter emails should use localized shipping labels/breakdowns where they already include shipping totals
- no hardcoded English-only copy should be introduced in checkout, Manage Pledge, result pages, or emails
- the feature should work correctly on localized routes such as `/es/manage/` and localized checkout entry paths

## Why This Scope Fits

### USPS risk

USPS pricing APIs appear usable without obvious per-call billing for the basic pricing access, but they are quota-limited and can require manual quota-increase requests.

That means the main operational risk is:

- quota / throttling

not obviously:

- direct USPS per-request charges

### KV risk

The current checkout flow already uses Worker/KV for:

- checkout bundle manifests
- pledge persistence
- stats updates
- limited-tier reservations

Shipping should not add a large new KV footprint. The safe design is:

- quote shipping only at high-intent points
- avoid per-quote KV writes
- persist only the final shipping amount on the pledge

## High-Level Design

### 1. Worker-calculated shipping

Shipping must stay server-calculated, not browser-calculated.

That means:

- `/checkout-intent/start` calculates shipping from canonical item data plus destination
- `/pledge/modify` recalculates shipping only when shipping-relevant inputs change
- the final shipping amount is stored in the pledge record and included in all downstream math

### 2. Fallback behavior

If USPS is unavailable, times out, or returns no usable rate:

- use the configured fallback flat shipping rate

For The Pool:

- `shipping.fallback_flat_rate: 3.00`
- optional campaign-level `shipping_fallback_flat_rate` overrides for special cases

That keeps checkout resilient and avoids shipping becoming a hard blocker.

### 3. Service selection

Keep the option set intentionally narrow:

- `Standard`
  - default
  - chooses the cheapest eligible USPS service
- `Signature required`
  - optional
  - domestic only
  - only shown when the campaign enables it
- `Adult signature required`
  - optional
  - domestic only
  - only shown when the campaign explicitly enables it

Do not expose speed-based service choices in v1. Crowdfunding rewards often ship long after the pledge date, so delivery speed is not the meaningful customer choice here; delivery confirmation is.

## Config Surface

Add a structured `shipping` section to [`_config.yml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/_config.yml), for example:

```yml
shipping:
  origin_zip: "87120"
  origin_country: "US"
  fallback_flat_rate: 3.00
  default_option: standard
  quote_timeout_ms: 2500
  presets:
    sticker:
      weight_oz: 1
      packaging_weight_oz: 0.5
      length_in: 11.5
      width_in: 6.125
      height_in: 0.2
      stack_height_in: 0.05
      manual_domestic_rate: FIRST_CLASS_FLAT
      usps_domestic:
        processing_category: NON_MACHINABLE
        rate_indicator: SP
        mail_classes:
          - USPS_GROUND_ADVANTAGE
          - PRIORITY_MAIL
    tshirt:
      weight_oz: 6.5
      packaging_weight_oz: 1
      length_in: 12
      width_in: 10
      height_in: 1.5
      stack_height_in: 0.5
    poster:
      weight_oz: 5
      packaging_weight_oz: 3
      length_in: 18
      width_in: 3
      height_in: 3
      stack_height_in: 0.5
    cd:
      weight_oz: 4
      packaging_weight_oz: 2
      length_in: 6.25
      width_in: 6.25
      height_in: 1
      stack_height_in: 0.25
      usps_domestic:
        processing_category: MACHINABLE
        rate_indicator: SP
        mail_classes:
          - MEDIA_MAIL
          - USPS_GROUND_ADVANTAGE
          - PRIORITY_MAIL
    vinyl:
      weight_oz: 18
      length_in: 13
      width_in: 13
      height_in: 1
    dvd:
      weight_oz: 4
      packaging_weight_oz: 2
      length_in: 8
      width_in: 6
      height_in: 1
      stack_height_in: 0.2
      usps_domestic:
        processing_category: MACHINABLE
        rate_indicator: SP
        mail_classes:
          - MEDIA_MAIL
          - USPS_GROUND_ADVANTAGE
          - PRIORITY_MAIL
    bluray:
      weight_oz: 4
      packaging_weight_oz: 2
      length_in: 7.25
      width_in: 5.75
      height_in: 0.9
      stack_height_in: 0.2
      usps_domestic:
        processing_category: MACHINABLE
        rate_indicator: SP
        mail_classes:
          - MEDIA_MAIL
          - USPS_GROUND_ADVANTAGE
          - PRIORITY_MAIL
    signed_script:
      weight_oz: 7
      packaging_weight_oz: 1
      length_in: 11.5
      width_in: 8.5
      height_in: 0.5
      stack_height_in: 0.1
      manual_domestic_rate: FIRST_CLASS_FLAT
      usps_domestic:
        processing_category: NON_MACHINABLE
        rate_indicator: SP
        mail_classes:
          - MEDIA_MAIL
          - USPS_GROUND_ADVANTAGE
          - PRIORITY_MAIL
```

That config should stay site-driven and auto-mirror any Worker-required values into [`worker/wrangler.toml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/worker/wrangler.toml).

Optional preset-level shipping hints can live inside preset metadata too. The current implementation supports:

- `manual_domestic_rate`
- `usps_domestic.processing_category`
- `usps_domestic.rate_indicator`
- `usps_domestic.destination_entry_facility_type`
- `usps_domestic.price_type`
- `usps_domestic.mail_classes`

`manual_domestic_rate` is currently domestic-only and supports `FIRST_CLASS_FLAT`, using USPS Notice 123 retail First-Class Mail Large Envelope (Flat) pricing. It only applies when the whole shipment still qualifies for flat mail by weight and dimensions; otherwise the system falls through to the live USPS path.

The USPS-specific hints only apply when the whole physical shipment resolves to the same preset-style USPS profile; mixed shipments fall back to the default parcel quote model.

That means you can encode a conservative “cheapest valid class first” order per preset without trying to infer it on the fly from raw dimensions alone. The current site uses that pattern in two places:

- `sticker`
  - uses the manual `FIRST_CLASS_FLAT` domestic rate when the shipment still qualifies
  - otherwise falls through to a cheaper single-piece USPS parcel profile
- `signed_script`
  - uses the manual `FIRST_CLASS_FLAT` domestic rate when the shipment still qualifies
  - otherwise falls through to `MEDIA_MAIL`, then `USPS_GROUND_ADVANTAGE`, then `PRIORITY_MAIL`
- `cd`, `dvd`, and `bluray`
  - try `MEDIA_MAIL` first
  - then fall through to `USPS_GROUND_ADVANTAGE`
  - then `PRIORITY_MAIL`

We intentionally do not apply true “letter” or “flat” logic automatically. The current USPS Prices API path we use does not expose domestic First-Class letter/flat rating directly, so flat-mail pricing is handled as an explicit manual table, not a live USPS quote.

## Content Model Changes

### Tiers

Add optional shipping metadata to physical tiers:

```yml
tiers:
  - id: tshirt
    category: physical
    shipping_preset: tshirt
```

Or explicit overrides:

```yml
tiers:
  - id: deluxe-box
    category: physical
    shipping:
      weight_oz: 32
      packaging_weight_oz: 4
      length_in: 12
      width_in: 10
      height_in: 4
      stack_height_in: 1
```

### Support items

Allow the same shipping metadata on physical support items if we support physical add-ons there.

## Packing Strategy

Do not build full cartonization in v1.

Use a simpler heuristic:

- sum item weights across physical items and quantities
- add any one-time `packaging_weight_oz` allowance from the selected tier/support-item profiles
- use the largest selected `length_in` / `width_in`
- use `height_in + stack_height_in * (qty - 1)` for multi-quantity physical tiers
- pass the resulting parcel to USPS rating

This is approximate, but much more realistic than the current flat fee and far smaller than building a real packing engine.

## USPS Usage Strategy

### USPS Credentials How-To

As of April 11, 2026, USPS's official onboarding flow is:

1. Create or sign into a USPS Business Account through the USPS Customer Onboarding Portal (COP).
2. In COP, open `My Apps` and create an app.
3. In that app's `Credentials` section, copy the:
   - `Consumer Key`
   - `Consumer Secret`
4. Use those as OAuth client credentials:
   - `Consumer Key` -> `client_id`
   - `Consumer Secret` -> `client_secret`

In this repo, that maps to:

- [`_config.yml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/_config.yml)
  - `shipping.usps.client_id`
  - optional USPS behavior knobs like `timeout_ms`, `quote_cache_ttl_seconds`, and cooldown settings
- Worker secrets / local Worker env
  - `USPS_CLIENT_SECRET`

Do **not** commit the USPS client secret into Jekyll config.

For local testing:

- set `shipping.usps.client_id` in [`_config.yml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/_config.yml) or your local override path
- set `USPS_CLIENT_SECRET=...` in [`worker/.dev.vars`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/worker/.dev.vars)
- run:

```bash
npm run sync:worker-config
./scripts/dev.sh --podman
```

For a quick live USPS credential and quote sanity check without booting the whole stack, run:

```bash
npm run test:usps
```

That helper exercises the real Worker shipping module against a small smoke matrix:

- domestic physical tier
- domestic signature-required option
- international physical tier
- campaign add-on only shipment
- platform add-on only shipment

USPS also says you can test with your production credentials against the Testing Environment for Mailers by switching the base URL from `apis.usps.com` to `apis-tem.usps.com`.

The default USPS app product currently includes the APIs this feature needs:

- OAuth
- Domestic Pricing
- International Pricing
- Shipping Options

If you need additional access or a quota increase, USPS directs developers to submit a service request through their `Email Us` support flow.

Practical operational note for this platform:

- USPS documents `429` as an exceeded hourly quota condition
- this shipping implementation therefore uses:
  - Worker-only USPS calls
  - short in-memory quote reuse
  - temporary cooldowns after `429`, timeout, or repeated USPS failures
  - flat fallback shipping when USPS is unavailable

That keeps the platform aligned with USPS's quota model without turning shipping quotes into a KV-heavy subsystem.

Only call USPS at high-intent moments:

- checkout start
- pledge modification when physical selections or destination changed

Do not call USPS:

- on public campaign page loads
- on every cart render
- on every quantity/tip keystroke in the browser

### Caching

Avoid KV-backed quote-history caching in v1.

If needed, use a short-lived in-memory / platform-cache style cache keyed by:

- origin ZIP
- origin country
- destination postal code
- destination country
- package weight
- package dimensions

The important rule is:

- do not turn shipping quotes into a high-write KV subsystem

The checkout country selector is now fed from [`_data/shipping_countries.yml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/_data/shipping_countries.yml), which keeps USPS destination maintenance in a dedicated source instead of burying it in browser runtime code.

## Worker and Frontend Touchpoints

### Worker

Main logic seams already exist in:

- [worker/src/index.js](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/worker/src/index.js)
- [worker/src/provider-config.js](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/worker/src/provider-config.js)

The current shipping flow now:

- detects physical items
- builds a shipment estimate
- requests a USPS quote
- falls back to `shipping.fallback_flat_rate` if needed

### Frontend

The cart/manage UI can stay structurally similar:

- show shipping in summary rows
- continue collecting shipping address for physical orders
- no new user-facing carrier UI in v1

## Testing Strategy

Current automated coverage includes:

- unit coverage for shipment-shape aggregation
- unit coverage for USPS fallback behavior
- unit coverage for quantity-sensitive physical shipping math
- Worker contract tests for checkout start / modify with:
  - domestic success
  - international success
  - USPS timeout/failure fallback
- E2E coverage for:
  - physical checkout quote path
  - modify-pledge shipping recalculation
- accessibility regression coverage for any new shipping-only UI states
- localized-path coverage to ensure shipping summaries and errors stay translated on seeded locales

## Documentation and Policy Updates

Current docs that should stay aligned with shipping behavior:

- [README.md](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/README.md)
- [docs/CUSTOMIZATION.md](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/docs/CUSTOMIZATION.md)
- [docs/DEV_NOTES.md](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/docs/DEV_NOTES.md)
- [docs/TESTING.md](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/docs/TESTING.md)
- [terms.md](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/terms.md)

Terms should stop promising a flat physical shipping fee and instead describe deployment-configured shipping rules, including carrier-rated quotes and fallback rates where applicable.

Privacy wording may also need a small update if destination details are sent to USPS for quote calculation.

## Current Acceptance State

The shipping implementation is in good shape when:

- domestic and international physical pledges can use USPS live rating through the Worker
- the system falls back cleanly to the configured flat rate when USPS is unavailable
- physical tiers and support items can declare shipping metadata directly or through presets
- quantity changes affect shipment math correctly
- checkout, Manage Pledge, emails, reports, and fulfillment exports stay aligned on the stored shipping amount
- no security regressions are introduced into checkout or pledge modification
- no accessibility regressions are introduced into shipping-related checkout/manage states
- no new English-only site-owned shipping copy is introduced on localized routes

## Recommended Implementation Phases

### Phase 1: Config and content model

- add `shipping.*` config
- add preset catalog support
- extend CMS/content schema for physical shipping metadata
- add Worker mirror for any required shipping env values

### Phase 2: Worker quote engine

- add USPS quote client
- add fallback flat-rate logic
- replace flat-fee shipping inside canonical contribution building

### Phase 3: Modify/manage parity

- recalculate shipping on shipping-relevant pledge modifications
- keep Manage Pledge summaries and confirmations aligned

### Phase 4: docs, tests, and policy

- tests
- docs
- terms/privacy wording

## Recommended First Slice

The best first slice is:

1. add `shipping.origin_zip`, `shipping.origin_country`, and `shipping.fallback_flat_rate`
2. add shipping presets plus tier-level `shipping_preset` / `shipping.*`
3. implement USPS domestic + international quoting in the Worker with fallback flat rate
4. wire that into `/checkout-intent/start`

That gives us the highest product value quickly while keeping quota and KV risk under control.
