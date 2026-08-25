# Tax Calculator

This document covers The Pool's current tax-calculation model, including
provider selection, fork-facing configuration, browser behavior, Worker
endpoints, and the checks operators should run before shipping tax-related
changes.

Tax is a first-class Worker concern rather than one fixed configured rate
everywhere. A deployment can stay on a flat rate or switch to provider-backed
or vendored location-aware calculation without forking checkout math across
the browser, Worker, pledge management, emails, and reports.

## What The Tax Layer Owns

The tax layer keeps one consistent answer across:

- cart previews
- custom checkout UI
- final checkout canonicalization
- Manage Pledge recalculation
- stored pledge totals
- supporter emails
- reports and exports

The Worker remains the source of truth. The browser can request previews, but
persisted totals come from Worker-side calculation.

## Current Provider Modes

The supported operator-facing provider modes are:

| Provider | What it does | Best fit |
| --- | --- | --- |
| `flat` | Uses the configured `pricing.sales_tax_rate` | Simple deployments that want one configured rate |
| `offline_rules` | Uses vendored VAT/GST and state-level fallback rules | Forks that want location-aware behavior without a live local-jurisdiction request for every quote |
| `nm_grt` | Uses the vendored New Mexico starter dataset and can refine complete New Mexico addresses with the EDAC GRT API | New Mexico-focused deployments that need stronger local GRT accuracy |
| `zip_tax` | Uses ZIP.TAX for US and Canadian jurisdiction lookups and falls back to `offline_rules` for other countries | Deployments that want provider-backed local tax precision |

The Worker still accepts the legacy provider value `external` as an alias for
`zip_tax`, but new configuration and dashboard edits should use `zip_tax`.

## Configuration Surface

Fork-facing tax config lives in [`_config.yml`](../_config.yml) and is described
in [CUSTOMIZATION.md](./CUSTOMIZATION.md).

Current keys:

- `tax.provider`
- `tax.origin_country`
- `tax.use_regional_origin`
- `tax.nm_grt_api_base`
- `tax.zip_tax_api_base`

Example:

```yml
tax:
  provider: nm_grt
  origin_country: US
  use_regional_origin: false
  nm_grt_api_base: https://grt.edacnm.org
  zip_tax_api_base: https://api.zip-tax.com
```

The compatibility baseline remains available:

- `pricing.sales_tax_rate` is used by `flat`
- `SALES_TAX_RATE` mirrors that configured rate into the Worker

## Worker Mirror And Secrets

The non-secret tax settings mirror from site config into the Worker
environment:

- `TAX_PROVIDER`
- `TAX_ORIGIN_COUNTRY`
- `TAX_USE_REGIONAL_ORIGIN`
- `NM_GRT_API_BASE`
- `ZIP_TAX_API_BASE`
- `SALES_TAX_RATE` for `flat`

If you enable `zip_tax`, also set `ZIP_TAX_API_KEY`. Keep that key out of
`_config.yml`; set it as a Worker secret or in ignored `worker/.dev.vars` for
local work.

Refresh the vendored New Mexico starter dataset with:

```bash
node ./scripts/update-nm-grt-starter.mjs
```

## Browser And Checkout Behavior

The browser can show a provisional state before it has enough destination
detail.

Current behavior:

- cart and checkout can show tax as `--`
- the browser requests a preview through `POST /tax/quote`
- canonical checkout runs through `POST /checkout-intent/start`
- a location-aware provider can require billing or shipping destination detail
  before returning a quote
- `nm_grt` tries the EDAC API only when a New Mexico address includes a
  parseable street plus city and postal code; otherwise it uses the starter
  dataset or configured flat fallback

A tax preview can therefore remain incomplete early in checkout and resolve
once billing or shipping details are present.

## Main Endpoints

### `POST /tax/quote`

This endpoint returns a Worker-calculated tax preview for the first-party cart
and checkout UI.

Use it for:

- provisional cart display
- custom checkout summaries
- recalculation after destination changes

Operational rules:

- the request must come from the trusted site origin
- the route is rate limited and body-size limited
- the response is private and non-cacheable
- the route is for first-party UI previews, not third-party public use
- missing required destination detail returns an error instead of a guessed
  location-aware tax result

### `POST /checkout-intent/start`

This is the authoritative checkout bootstrap. It:

- canonicalizes the cart
- validates campaign and inventory state
- computes final checkout totals
- persists the signed checkout snapshot used by Stripe and the Worker

If browser tax looks wrong, determine whether the problem affects only
`/tax/quote` preview state or the canonical `/checkout-intent/start` result too.

## Local Development

For normal local work:

```bash
npm run podman:doctor
./scripts/dev.sh --podman
```

Important behavior:

- restart the local stack after changing `_config.yml` so the Worker mirror is
  refreshed
- mutable-pledge smoke coverage supports provider-driven setups such as
  `tax.provider: nm_grt`
- a fixture without enough billing or shipping detail can produce an expected
  provisional state rather than a product bug

See [PODMAN.md](./PODMAN.md), [TESTING.md](./TESTING.md), and the
[Worker README](../worker/README.md) for the surrounding runtime.

## Verification

When tax config, provider code, checkout destination handling, or pricing
display changes, verify:

- cart preview updates when destination detail changes
- provisional `--` behavior appears only when expected
- `POST /tax/quote` returns the expected shape for the configured provider
- `POST /checkout-intent/start` returns final totals that match deployment rules
- Manage Pledge keeps subtotal, tax, shipping, tip, and total coherent
- stored pledge totals, emails, and reports use the same tax answer
- localized tax helper copy remains correct
- `npx vitest run tests/unit/tax.test.ts` passes
- affected cart, Manage Pledge, Worker business-logic, and dashboard tests pass

## Troubleshooting

### Tax always looks flat

Check:

- `tax.provider` in `_config.yml`
- mirrored Worker values in `worker/wrangler.toml`
- whether the local stack was restarted after config changes

### Tax stays `--`

Check:

- whether the provider needs more destination detail
- whether the browser sends the billing or shipping fields the provider uses
- whether the issue affects preview only or canonical checkout too

### ZIP.TAX is unavailable

Check:

- `tax.provider: zip_tax`
- `tax.zip_tax_api_base`
- `ZIP_TAX_API_KEY`

### New Mexico results are too broad

Check:

- whether the destination includes a parseable street, city, and postal code
- whether the starter dataset needs a refresh
- whether `nm_grt` is the right provider for the deployment

## Related Documentation

- [CUSTOMIZATION.md](./CUSTOMIZATION.md)
- [PAYMENT_PROCESSOR.md](./PAYMENT_PROCESSOR.md)
- [TESTING.md](./TESTING.md)
- [PODMAN.md](./PODMAN.md)
- [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)
- [worker/README.md](../worker/README.md)
