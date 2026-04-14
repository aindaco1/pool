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

- top-level `title` / `description`
- `seo`
- `platform`
- `pricing`
- `shipping`
- `i18n`
- `design`
- `debug`
- `checkout`
- `cache`

### Top-level `title` / `description`

Use the top-level Jekyll metadata for the site's default search/social identity.

Supported keys:

- `title`
- `description`

These values feed:

- default HTML `<title>` fallback
- default meta description fallback
- site-wide `WebSite` JSON-LD fallback description

`platform.name` is still the primary visible brand surface. Treat top-level `title` / `description` as the fork-facing SEO baseline rather than the main UI-branding interface.

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
- default social-card image
- campaign creator fallback copy
- checkout / Manage Pledge UI copy and bootstrapped client config
- Worker email branding when mirrored

Notes:

- `platform.*` is the primary branding surface.
- top-level `title` / `author` still exist in Jekyll, but treat them as general site metadata / fallback rather than the main fork-customization interface.
- `platform.default_social_image_path` is the supported default for OG/Twitter cards when a page or campaign does not provide a more specific image.

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

Use `pricing` for the shared tax/tip math that must stay consistent across the site and Worker.

Supported keys:

- `sales_tax_rate`
- `flat_shipping_rate` (legacy compatibility baseline; use `shipping.*` for the current carrier/fallback model)
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

### `i18n`

Use `i18n` for the supported locale model on the static site.

Supported keys:

- `default_lang`
- `supported_langs`
- `language_labels`
- `pages`

`pages` is the public-page route map used by the shared locale helpers. It lets forks add a new language by config plus translated content instead of editing navigation logic by hand.

Example:

```yml
i18n:
  default_lang: en
  supported_langs:
    - en
    - es
  language_labels:
    en: English
    es: Español
  pages:
    home:
      en: /
      es: /es/
    about:
      en: /about/
      es: /es/about/
    terms:
      en: /terms/
      es: /es/terms/
```

Current supported pattern:

- shared UI/system copy lives in `_data/i18n/{lang}.yml`
- non-default public pages live under a locale prefix like `/es/`
- shared runtime/browser messages are emitted through `assets/i18n.json`
- Worker supporter emails reuse that shared locale catalog plus persisted `preferredLang`
- campaign chrome such as the hero video button/loading text, supporter-community teaser copy, diary tabs, production-phase controls, and gallery accessibility labels also now comes from `_data/i18n/{lang}.yml`
- the shared footer language switcher is automatic when more than one language is configured
- long-form pages such as `about` and `terms` should use localized source pages rather than trying to store every paragraph in YAML

What this means in practice:

- changing `i18n.default_lang` only changes the default locale the site resolves against
- adding a new `_data/i18n/{lang}.yml` file is enough for shared chrome, runtime UI, and Worker supporter-email copy
- it is not enough for a fully translated site by itself
- full language support also needs:
  - the new language added to `i18n.supported_langs`
  - its label added to `i18n.language_labels`
  - localized routes added to `i18n.pages`
  - localized source pages for long-form content you actually want translated
- tokenized pledge-management routes keep working across locales because the shared language switcher preserves the current query string and hash

Recommended fork workflow:

1. Copy `_data/i18n/en.yml` to `_data/i18n/{lang}.yml`
2. Add the language to the `i18n` block in `_config.yml`
3. Add localized source pages for long-form routes such as `/about/` and `/terms/`
4. Build locally and verify both the shared UI copy and the localized routes

### SEO surface

Current SEO fundamentals are intentionally bounded. Forks should treat these as the supported knobs:

- top-level `title`
- top-level `description`
- `seo.x_handle`
- `seo.same_as`
- `seo.index_public_community_hub`
- `seo.default_social_image_alt`
- `seo.og_locale_overrides`
- `platform.name`
- `platform.site_url`
- `platform.default_social_image_path`
- localized page `title` / `description` front matter on public pages
- campaign `title`, `short_blurb`, and hero images

That surface currently controls:

- canonical URLs
- meta descriptions
- Open Graph and Twitter previews
- sitemap URL generation
- site-wide `Organization` / `WebSite` JSON-LD
- campaign `CreativeWork` / breadcrumb JSON-LD
- fallback social-image alt text
- Open Graph locale strings

The implementation is deliberately narrow:

- private/tokenized/supporter-only flows are marked `noindex`
- `robots.txt` and `sitemap.xml` only advertise the public surface
- there is no giant per-page SEO settings matrix beyond the content fields the site already supports

Example:

```yml
seo:
  x_handle: dustwave
  same_as:
    - https://www.instagram.com/dustwave
    - https://www.youtube.com/@dustwave
  index_public_community_hub: true
  default_social_image_alt: "Dust Wave on The Pool"
  og_locale_overrides:
    en: en_US
    es: es_ES
```

### `debug`

Use `debug` for shared browser-runtime and Worker console logging.

Supported keys:

- `console_logging_enabled`
- `verbose_console_logging`

What they do:

- `console_logging_enabled: false` suppresses browser and Worker `console` output across the shared cart, campaign, community, live-stats, Manage Pledge, webhook, admin, and scheduled-task runtimes
- `verbose_console_logging: false` keeps the logger active but suppresses lower-severity debug/info/log noise while still allowing warnings and errors

These defaults are intentionally `true` in `_config.yml`, so forks start with full diagnostics available and can turn logging down later without code changes.

When enabled, the shared loggers now emit:

- ISO timestamps
- consistent browser / Worker scope prefixes
- severity labels like `LOG`, `WARN`, and `ERROR`
- normalized `Error` payloads
- browser capture for uncaught errors and unhandled promise rejections

### `shipping`

Use `shipping` for origin and fallback shipping settings plus the preset catalog for common physical goods.

Supported keys today:

- `origin_zip`
- `origin_country`
- `fallback_flat_rate`
- `free_shipping_default`
- `default_option`
- `usps.enabled`
- `usps.client_id`
- `usps.api_base`
- `usps.timeout_ms`
- `usps.quote_cache_ttl_seconds`
- `usps.failure_cooldown_seconds`
- `usps.rate_limit_cooldown_seconds`
- `presets`

Campaigns can also optionally set `shipping_fallback_flat_rate` in front matter. When present, that campaign-specific fallback overrides the global `shipping.fallback_flat_rate` if USPS quoting is unavailable.

Campaigns can also optionally set `shipping_options` in front matter to opt into the limited backer-facing shipping policy set:

- `signature_required`
- `adult_signature_required`

`standard` is always available implicitly and does not need to be listed.

Important secret boundary:

- keep `shipping.usps.client_id` in `_config.yml`
- keep the companion `USPS_CLIENT_SECRET` in Worker secrets or `worker/.dev.vars`
- do not commit the secret into Jekyll config

Example:

```yml
shipping:
  origin_zip: "80205"
  origin_country: "US"
  fallback_flat_rate: 3.00
  free_shipping_default: false
  default_option: standard
  usps:
    enabled: true
    client_id: "your-usps-client-id"
    api_base: ""
    timeout_ms: 5000
    quote_cache_ttl_seconds: 600
    failure_cooldown_seconds: 300
    rate_limit_cooldown_seconds: 1800
  presets:
    poster:
      weight_oz: 5
      packaging_weight_oz: 3
      length_in: 18
      width_in: 3
      height_in: 3
      stack_height_in: 0.5
    vinyl:
      weight_oz: 18
      packaging_weight_oz: 4
      length_in: 13
      width_in: 13
      height_in: 1
```

What this enables:

- a deployment-level USPS shipping origin
- a deployment-level free-shipping default that campaigns can still override
- a configured fallback rate if live carrier quoting is unavailable
- a fork-facing USPS quote policy surface for timeouts, short-lived quote reuse, and temporary cooldowns after repeated failures or rate limiting
- reusable `shipping_preset` names in campaign tiers so forks do not need to repeat common merch dimensions

Preset and override metadata can include:

- `weight_oz`
- `packaging_weight_oz`
- `length_in`
- `width_in`
- `height_in`
- `stack_height_in`

`weight_oz` is the item weight. `packaging_weight_oz` is a one-time packing allowance for that line item, and `stack_height_in` lets multi-quantity physical tiers stack more realistically than simple `height * qty`.

### `add_ons`

Use `add_ons` for a global, platform-level merch or upsell catalog that is not tied to a single campaign's `support_items`.

The current Worker path treats these as bundle-level selections. Pending checkout manifests can also store an anchor campaign so multi-campaign carts remain supported while later settlement and management flows stay campaign-compatible.

Supported keys today:

- `enabled`
- `low_stock_threshold`
- `products`

Each product currently supports:

- `id`
- `name`
- `description`
- `image_url`
- `price`
- `category`
- `inventory`
- `shipping_preset`
- `shipping`
- `source_url`
- `variant_option_name`
- `variants`

Example:

```yml
add_ons:
  enabled: true
  low_stock_threshold: 5
  products:
    - id: dust-wave-tshirt
      name: "DUST WAVE T-Shirt"
      description: "Our official t-shirt. 100% cotton."
      price: 25.00
      category: physical
      shipping_preset: tshirt
      source_url: "https://shop.dustwave.xyz/"
      variant_option_name: Size
      variants:
        - { id: xs, label: XS, inventory: 1 }
        - { id: s, label: S, inventory: 2 }
        - { id: m, label: M, inventory: 4 }
```

This is meant for fixed-price catalog items and simple variants like shirt sizes. It is separate from campaign `support_items`, which remain campaign-scoped and amount-based.

Add-on shipping behavior:

- `category: digital` means the add-on never contributes to shipping
- `category: physical` means the add-on participates in the same shipping calculator used for physical tiers and physical support items
- physical add-ons can either:
  - reference a shared `shipping_preset`
  - or provide explicit `shipping.weight_oz`, `shipping.packaging_weight_oz`, `shipping.length_in`, `shipping.width_in`, `shipping.height_in`, and `shipping.stack_height_in`

Current add-on inventory behavior:

- `inventory` can live on the product itself or on each variant
- `low_stock_threshold` controls when the shared cart/manage UI shows scarcity messaging
- sold-out variants are removed from the shared product-state surface unless the supporter already owns that exact variant on an existing pledge
- the cart and Manage Pledge both use the same shared add-on product-card model, so forks do not need to style or configure two different merch systems
- the add-on section heading and support note are localized through the normal runtime i18n files, and the support note interpolates the configured site author name automatically

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

- `i18n.*`
- `design.*`
- `checkout.stripe_publishable_key`
- `platform.default_creator_name`
- `platform.logo_path`
- `platform.footer_logo_path`
- `platform.favicon_path`
- `platform.default_social_image_path`
- `cache.*`

These are the safest “site generation / branding / localization without Worker-side math or email impact” knobs. They change the generated site, browser boot payload, or theme layer, but they do not need to be mirrored into Worker env.

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
- `shipping.origin_zip` -> `SHIPPING_ORIGIN_ZIP`
- `shipping.origin_country` -> `SHIPPING_ORIGIN_COUNTRY`
- `shipping.fallback_flat_rate` -> `SHIPPING_FALLBACK_FLAT_RATE`
- `shipping.free_shipping_default` -> `FREE_SHIPPING_DEFAULT`
- `shipping.usps.enabled` -> `USPS_ENABLED`
- `shipping.usps.client_id` -> `USPS_CLIENT_ID`
- `shipping.usps.api_base` -> `USPS_API_BASE`
- `shipping.usps.timeout_ms` -> `USPS_TIMEOUT_MS`
- `shipping.usps.quote_cache_ttl_seconds` -> `USPS_QUOTE_CACHE_TTL_SECONDS`
- `shipping.usps.failure_cooldown_seconds` -> `USPS_FAILURE_COOLDOWN_SECONDS`
- `shipping.usps.rate_limit_cooldown_seconds` -> `USPS_RATE_LIMIT_COOLDOWN_SECONDS`

The repo keeps those values aligned automatically through the main local/dev/test paths. After changing them, restart the local stack so the site and Worker both pick up the new values:

```bash
./scripts/dev.sh --podman
```

For convenience, the repo now includes:

```bash
npm run sync:worker-config
```

That command syncs the Worker-mirrored values in [`worker/wrangler.toml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/worker/wrangler.toml) from `_config.yml` and `_config.local.yml`.

It does not write Worker secrets. USPS OAuth secrets still belong in `wrangler secret` or `worker/.dev.vars`.

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
