# Customization Guide

This guide covers the supported no-code customization surface for forks of The Pool as it exists now.

The goal is to let forks rebrand, restyle, and reconfigure the platform through config, while keeping checkout, reports, emails, and the Worker aligned.

The structured config model in [`_config.yml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/_config.yml) is now the canonical fork-facing surface.

## Start Here

For most forks, the main customization files are:

- [`_config.yml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/_config.yml)
- [`_config.local.yml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/_config.local.yml)
- [`worker/wrangler.toml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/worker/wrangler.toml)

Use `./scripts/dev.sh --podman` for local verification after config changes.

Treat [`_config.local.yml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/_config.local.yml) as an override-only file. Keep canonical fork settings in [`_config.yml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/_config.yml), and use the local file only for things that should differ on your machine, like localhost URLs or local-only campaign visibility.

The normal local path is now localhost-based:

- site: `http://127.0.0.1:4000`
- Worker: `http://127.0.0.1:8787`

The generated static site also now excludes repo-internal folders like `worker/`, `scripts/`, and `tests/`, so static verification more closely matches what a fork would actually publish.

## Supported Config Areas

The site config is organized around these fork-facing sections:

- `platform`
- `pricing`
- `design`
- `checkout`
- `cache`

### `platform`

Use `platform` for identity, URLs, and brand assets.

Supported keys:

- `name`
- `company_name`
- `support_email`
- `pledges_email_from`
- `updates_email_from`
- `site_url`
- `worker_url`
- `default_creator_name`
- `logo_path`
- `footer_logo_path`
- `favicon_path`
- `default_social_image_path`

These values feed:

- header / footer branding
- page titles and meta tags
- campaign creator fallback copy
- checkout / Manage Pledge UI copy and bootstrapped client config
- Worker email branding when mirrored

Notes:

- `platform.*` is the primary branding surface.
- top-level `title` / `author` still exist in Jekyll, but treat them as general site metadata / fallback rather than the main fork-customization interface.

Example:

```yml
platform:
  name: My Fork
  company_name: Example Studio
  support_email: support@example.com
  pledges_email_from: "My Fork <pledges@example.com>"
  updates_email_from: "My Fork <updates@example.com>"
  site_url: https://crowdfund.example.com
  worker_url: https://pledge.example.com
  default_creator_name: Example Studio
  logo_path: /assets/images/brand/logo-square.png
  footer_logo_path: /assets/images/brand/logo-footer.png
  favicon_path: /assets/images/brand/favicon.png
  default_social_image_path: /assets/images/brand/social-card.png
```

### `pricing`

Use `pricing` for the shared math that must stay consistent across the site and Worker.

Supported keys:

- `sales_tax_rate`
- `flat_shipping_rate`
- `default_tip_percent`
- `max_tip_percent`

Example:

```yml
pricing:
  sales_tax_rate: 0.0825
  flat_shipping_rate: 4.50
  default_tip_percent: 5
  max_tip_percent: 15
```

### `design`

Use `design` for curated design-system overrides that do not require Sass edits.

These values are emitted into the generated stylesheet [assets/theme-vars.css](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/assets/theme-vars.css), which keeps the design-variable bridge compatible with the site’s strict CSP. Forks do not need to edit Sass just to change supported tokens.

Current supported keys:

- typography:
  - `font_body`
  - `font_display`
- layout:
  - `layout_max_width`
- radius:
  - `radius_sm`
  - `radius_chip`
  - `radius_md`
  - `radius_lg`
  - `radius_xl`
- text:
  - `color_text`
  - `color_text_strong`
  - `color_text_muted`
  - `color_text_soft`
- surfaces:
  - `color_page_background`
  - `color_surface_base`
  - `color_surface_subtle`
  - `color_surface_soft`
  - `color_surface_strong`
  - `color_page_background_overlay`
  - `color_surface_base_overlay`
  - `color_surface_subtle_overlay`
- borders:
  - `color_border`
  - `color_border_strong`
  - `color_border_soft`
- primary / emphasis:
  - `color_primary`
  - `color_primary_soft`
  - `color_primary_border`
  - `color_primary_hover`
  - `color_primary_focus_ring`
  - `color_progress`
- feedback / tints:
  - `color_success`
  - `color_danger_soft`
  - `color_danger_softer`
  - `surface_tint_softer`
  - `surface_tint_soft`
  - `surface_tint_medium`
  - `surface_tint_hover`
  - `surface_tint_strong`

Example:

```yml
design:
  font_body: '"Source Sans 3", sans-serif'
  font_display: '"Space Grotesk", sans-serif'
  layout_max_width: 1080px
  radius_md: 12px
  radius_xl: 18px
  color_text: "#1f2430"
  color_page_background: "#f6f3ee"
  color_surface_base: "#ffffff"
  color_border: "#d9d2c7"
  color_primary: "#111111"
  color_primary_hover: "#000000"
  color_progress: "#111111"
```

### `checkout`

The `checkout` section is intentionally narrow.

Supported key today:

- `stripe_publishable_key`

The first-party cart runtime and on-site custom checkout flow are treated as built-in platform behavior, not as fork-facing mode switches.

### `cache`

Use `cache` to tune public live-read browser caching.

Supported keys:

- `live_stats_ttl_seconds`
- `live_inventory_ttl_seconds`

## Site-Only vs Worker-Mirrored Settings

Some settings only affect the Jekyll build and browser-owned UI. Others are also reflected into the Worker env automatically.

### Safe Site-Only Changes

These can be changed in `_config.yml` without changing Worker config or worrying about the sync step:

- `design.*`
- `checkout.stripe_publishable_key`
- `platform.default_creator_name`
- `platform.logo_path`
- `platform.footer_logo_path`
- `platform.favicon_path`
- `platform.default_social_image_path`
- `cache.*`

These are the safest “restyle/rebrand without Worker-side math or email impact” knobs. They change the generated site, browser boot payload, or theme layer, but they do not need to be mirrored into Worker env.

### Auto-Mirrored To Worker

These site-config values are also reflected into the Worker env values in [`worker/wrangler.toml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/worker/wrangler.toml):

- `platform.name` -> `PLATFORM_NAME`
- `platform.company_name` -> `PLATFORM_COMPANY_NAME`
- `platform.support_email` -> `SUPPORT_EMAIL`
- `platform.pledges_email_from` -> `PLEDGES_EMAIL_FROM`
- `platform.updates_email_from` -> `UPDATES_EMAIL_FROM`
- `platform.site_url` -> `SITE_BASE`
- `platform.worker_url` -> `WORKER_BASE`
- `pricing.sales_tax_rate` -> `SALES_TAX_RATE`
- `pricing.flat_shipping_rate` -> `FLAT_SHIPPING_RATE`
- `pricing.default_tip_percent` -> `DEFAULT_PLATFORM_TIP_PERCENT`
- `pricing.max_tip_percent` -> `MAX_PLATFORM_TIP_PERCENT`

The repo keeps those values aligned automatically through the main local/dev/test paths. After changing them, restart the local stack so the site and Worker both pick up the new values:

```bash
./scripts/dev.sh --podman
```

For convenience, the repo now includes:

```bash
npm run sync:worker-config
```

That command syncs the Worker-mirrored values in [`worker/wrangler.toml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/worker/wrangler.toml) from `_config.yml` and `_config.local.yml`.

The main local/dev validation paths already call that sync automatically:

- `./scripts/dev.sh --podman`
- `./scripts/dev.sh`
- `./scripts/test-worker.sh`
- `./scripts/test-checkout.sh`
- `cd worker && npm run dev`
- `cd worker && npm run deploy`
- `npm run test:premerge`

## What Still Requires Code

The platform now supports major customization without custom code, but not everything is intentionally configurable yet.

Still code-level today:

- adding new payment providers or checkout modes
- changing supported embed providers
- expanding CSP allowlists for arbitrary external hosts
- changing Stripe-owned field styling beyond Stripe’s supported appearance API
- introducing brand-new layout structures, page templates, or content blocks
- changing font hosting/CSP behavior beyond the currently supported font stacks

Also note:

- not every Sass token is exposed on purpose
- not every Worker env var belongs in `_config.yml`
- the supported surface is curated to avoid security and maintenance regressions

## Safe Workflow For Forks

1. Update `_config.yml`.
2. Run `npm run sync:worker-config` if you are editing config outside the normal entry points and want to refresh `worker/wrangler.toml` immediately.
3. Run:

```bash
npm run podman:doctor
./scripts/dev.sh --podman
```

4. Verify:

- header/footer branding
- meta image / favicon
- campaign creator fallback
- CSP-sensitive pages still load without console CSP violations
- cart / checkout totals
- Manage Pledge
- supporter emails

5. Run the relevant checks:

```bash
npx vitest run tests/unit/config-boot.test.ts tests/unit/cart-provider.test.ts tests/unit/manage-page.test.ts tests/unit/worker-business-logic.test.ts
./scripts/podman-self-check.sh
```

## Guidance For Future Additions

When adding new customization knobs, prefer this order:

1. put the site-facing value in `_config.yml`
2. mirror it to Worker env only if checkout, reports, or emails need it
3. document it here
4. keep the supported surface curated instead of exposing every implementation detail

That keeps customization flexible without turning the platform into an unstable free-form theme engine.
