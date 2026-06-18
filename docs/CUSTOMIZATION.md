# Customization Guide

This guide covers the supported no-code customization surface for forks of The Pool as it exists now.

The goal is to let forks rebrand, restyle, and reconfigure the platform through config, while keeping checkout, reports, emails, and the Worker aligned.

The structured config model in [`_config.yml`](../_config.yml) is now the canonical fork-facing surface.

## Start Here

For most forks, the main customization files are:

- [`_config.yml`](../_config.yml)
- [`_config.local.yml`](../_config.local.yml)
- [`worker/wrangler.toml`](../worker/wrangler.toml)

Use `./scripts/dev.sh --podman` for local verification after config changes.

For normal operator edits, use the private admin dashboard at `/admin/` or `/es/admin/`:

- **Settings** edits platform-wide configuration and runtime admin tools for super admins.
- **Add-ons** edits platform add-on products for super admins.
- **Campaigns** edits campaign settings, page content, tiers, support items, campaign add-ons, stretch goals, ongoing items, diary entries, and decisions.
- **Campaigns** also lets super admins create preview-only campaigns from a title plus one or more campaign users; those campaigns stay out of public routes until launched.
- **Preview** publishes a protected campaign preview for authorized admins and explicitly invited reviewers without adding previewer emails to campaign source.
- **Settings -> Users** is runtime-only and saves directly to Worker KV at `admin-users:v1`; it does not publish to GitHub.
- **Secrets & credentials** is read-only status. Secret values still belong in Worker secrets, GitHub repository secrets, or ignored local env files.

Treat [`_config.local.yml`](../_config.local.yml) as an override-only file. Keep canonical fork settings in [`_config.yml`](../_config.yml), and use the local file only for things that should differ on your machine, like localhost URLs or local-only campaign visibility.

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
- `tax`
- `shipping`
- `reports`
- `i18n`
- `design`
- `debug`
- `performance`
- `launch_reminders`
- `add_ons`
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
- `version`
- `release_label`
- `company_name`
- `support_email`
- `pledges_email_from`
- `updates_email_from`
- `site_url`
- `worker_url`
- `default_creator_name`
- `timezone`
- `logo_path`
- `footer_logo_path`
- `favicon_path`
- `default_social_image_path`

These values feed:

- header / footer branding
- release metadata for docs/public copy when a fork wants to surface its current milestone
- page titles and meta tags
- app-title metadata for mobile/share surfaces
- default social-card image
- campaign creator fallback copy
- campaign deadline/countdown behavior and Worker scheduled lifecycle windows
- checkout / Manage Pledge UI copy and bootstrapped client config
- Worker email branding when mirrored

Notes:

- `platform.*` is the primary branding surface.
- `platform.version` should be the canonical machine-readable product version for the site, while `platform.release_label` can stay friendlier for public-facing copy such as `v1.0.6`.
- `platform.timezone` must be a supported IANA timezone. It defaults to `America/Denver` so existing forks keep the old lifecycle behavior until they change it.
- top-level `title` / `author` still exist in Jekyll, but treat them as general site metadata / fallback rather than the main fork-customization interface.
- `platform.default_social_image_path` is the supported default for OG/Twitter cards when a page or campaign does not provide a more specific image.
- `platform.logo_path` is also the mirrored brand mark used in supporter emails.
- The domain in `platform.pledges_email_from` and `platform.updates_email_from` must be authorized by the configured email provider. With Resend, authorizing `pool.example.com` does not authorize `example.com`, and vice versa.

Example:

```yml
platform:
  name: My Fork
  version: 1.0.6
  release_label: v1.0.6
  company_name: Example Studio
  support_email: support@example.com
  pledges_email_from: "My Fork <pledges@pool.example.com>"
  updates_email_from: "My Fork <updates@pool.example.com>"
  site_url: https://crowdfund.example.com
  worker_url: https://pledge.example.com
  default_creator_name: Example Studio
  timezone: America/Denver
  logo_path: /assets/images/brand/logo-square.png
  footer_logo_path: /assets/images/brand/logo-footer.png
  favicon_path: /assets/images/brand/favicon.png
  default_social_image_path: /assets/images/brand/social-card.png
```

### `pricing`

Use `pricing` for tax and platform-tip defaults that must stay consistent across the site and Worker. Shipping fallback fees live under `shipping`.

Supported keys:

- `sales_tax_rate`
- `default_tip_percent`
- `max_tip_percent`

Example:

```yml
pricing:
  sales_tax_rate: 0.0825
  default_tip_percent: 5
  max_tip_percent: 15
```

### `tax`

Use `tax` for the Worker-side tax engine selection and its non-secret lookup settings.

Supported keys:

- `provider`
- `origin_country`
- `use_regional_origin`
- `nm_grt_api_base`
- `zip_tax_api_base`

Current provider values:

- `flat` keeps the legacy configured `pricing.sales_tax_rate`
- `offline_rules` uses vendored rules for international VAT/GST and state-level fallback handling
- `nm_grt` uses a vendored New Mexico starter dataset and can refine full NM street-address lookups against the free EDAC GRT API
- `zip_tax` uses ZIP.TAX for local / jurisdiction-level US tax lookups and falls back to `offline_rules` for non-US/CA destinations

Current UX note:

- cart and checkout can display provisional tax as `--` until the browser has enough destination detail for the configured provider
- `nm_grt` is currently the most complete built-in local-data path for US jurisdictional tax and generally needs full New Mexico street-level destination data before it can return a precise result

Example:

```yml
tax:
  provider: nm_grt
  origin_country: US
  use_regional_origin: false
  nm_grt_api_base: https://grt.edacnm.org
  zip_tax_api_base: https://api.zip-tax.com
```

If you enable `zip_tax`, also set the Worker secret `ZIP_TAX_API_KEY`. Keep that secret out of `_config.yml`.

The vendored New Mexico starter file lives in [`worker/src/tax-data/nm-grt-starter.js`](../worker/src/tax-data/nm-grt-starter.js). Refresh it with:

```bash
node ./scripts/update-nm-grt-starter.mjs
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
- campaign chrome such as the hero video button/loading text, supporter-community teaser copy, diary tabs, production-phase controls, gallery accessibility labels, cart-button summaries, and checkout tax-location helper copy also now comes from `_data/i18n/{lang}.yml`
- the shared footer language switcher is automatic when more than one language is configured
- long-form pages such as `about` and `terms` should use localized source pages rather than trying to store every paragraph in YAML
- public metadata and structured-data language hints also follow the same locale model, so localized public pages do not need a second SEO-only translation system

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

When a pledge qualifies for multiple delivery options, the shared cart and Manage Pledge UIs render the same localized selector and the Worker persists the selected option as part of the canonical shipping total.

Important secret boundary:

- keep `shipping.usps.client_id` in `_config.yml`
- keep the companion `USPS_CLIENT_SECRET` in Worker secrets or `worker/.dev.vars`
- do not commit the secret into Jekyll config

The checkout destination list is intentionally separate from those knobs now. Maintain the currently allowed shipping countries in [`_data/shipping_countries.yml`](../_data/shipping_countries.yml) instead of editing browser runtime code.

Example:

```yml
shipping:
  origin_zip: "87120"
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
- a shared delivery-option selector surface in cart and Manage Pledge without opening up arbitrary carrier-speed choices
- reusable `shipping_preset` names in campaign tiers so forks do not need to repeat common merch dimensions
- optional preset-level USPS profile hints for item types that need a different domestic quote shape
- optional preset-level domestic mail-class ordering for products that qualify for cheaper USPS classes like Media Mail

Preset and override metadata can include:

- `weight_oz`
- `packaging_weight_oz`
- `length_in`
- `width_in`
- `height_in`
- `stack_height_in`
- `manual_domestic_rate`
- `usps_domestic.processing_category`
- `usps_domestic.rate_indicator`
- `usps_domestic.destination_entry_facility_type`
- `usps_domestic.price_type`
- `usps_domestic.mail_classes`

`weight_oz` is the item weight. `packaging_weight_oz` is a one-time packing allowance for that line item, and `stack_height_in` lets multi-quantity physical tiers stack more realistically than simple `height * qty`.

The safest pattern is to encode a deliberate cheapest-valid order per preset instead of trying to infer “letter” or “flat” eligibility from raw dimensions at runtime. The current site now uses:

- `sticker`
  - `manual_domestic_rate: FIRST_CLASS_FLAT`
  - then a cheaper single-piece domestic USPS profile if the shipment no longer qualifies for flats
- `signed_script`
  - `manual_domestic_rate: FIRST_CLASS_FLAT`
  - then `MEDIA_MAIL`
  - then `USPS_GROUND_ADVANTAGE`
  - then `PRIORITY_MAIL`
- `cd`, `dvd`, `bluray`
  - `MEDIA_MAIL`
  - `USPS_GROUND_ADVANTAGE`
  - `PRIORITY_MAIL`

If a product does not reliably qualify for a cheaper class, leave it on the default parcel path. Also note that the current USPS Prices API path does not expose domestic First-Class letter/flat rating directly, so “large envelope” logic is implemented here as an explicit manual table (`FIRST_CLASS_FLAT`), not as a live USPS API quote.

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

In the admin dashboard, platform add-ons live in the top-level **Add-ons** tab, while campaign-scoped add-ons live in the owning campaign's **Add-Ons** subtab. Legacy IDs are preserved. New product IDs derive from the product name, and new variant IDs derive from the variant label, so editors do not need to type slug values by hand.

Add-on shipping behavior:

- `category: digital` means the add-on never contributes to shipping
- `category: physical` means the add-on participates in the same shipping calculator used for physical tiers and physical support items
- physical add-ons can either:
  - reference a shared `shipping_preset`
  - or provide explicit `shipping.weight_oz`, `shipping.packaging_weight_oz`, `shipping.length_in`, `shipping.width_in`, `shipping.height_in`, and `shipping.stack_height_in`
- in the dashboard, those explicit weight/dimension fields appear only for physical add-ons when the shipping preset is `none`

Current add-on inventory behavior:

- `inventory` can live on the product itself or on each variant
- `low_stock_threshold` controls when the shared cart/manage UI shows scarcity messaging
- sold-out variants are removed from the shared product-state surface unless the supporter already owns that exact variant on an existing pledge
- saved add-on sold counts live in `add-on-inventory-sold:v1` after the first projection bootstrap, and pledge create, modify, and cancel paths keep the projection current
- the cart and Manage Pledge both use the same shared add-on product-card model, so forks do not need to style or configure two different merch systems
- the add-on section heading and support note are localized through the normal runtime i18n files, and the support note interpolates the configured site author name automatically

Campaigns can also define campaign-scoped add-ons directly in campaign front matter under `campaign_add_ons`.

That campaign-owned catalog uses the same product shape as the global `add_ons.products` entries, but behaves differently in two important ways:

- campaign add-ons render under a separate `Campaign Add-ons` section in cart and Manage Pledge
- campaign add-ons count toward the owning campaign subtotal / funding progress and follow that campaign’s shipping rules

By contrast, global `add_ons.products` remain platform merch:

- they render under the normal `Add-ons` section
- they do not count toward campaign funding totals
- physical global add-ons combine into one separate platform shipment / shipping charge

### `reports`

Use `reports` for campaign-runner report behavior that must stay aligned with Worker scheduling and dashboard report generation.

Supported keys today:

- `campaign_runner.enabled`
- `campaign_runner.daily_pledge_report_enabled`
- `campaign_runner.fulfillment_report_enabled`
- `campaign_runner.send_hour`
- `campaign_runner.send_minute`
- `campaign_runner.include_stats_summary`
- `campaign_runner.include_csv_attachment`
- `campaign_runner.email_subject_prefix`

Current behavior:

- campaign-level recipients live in campaign front matter as `runner_report_emails`
- if that campaign field is missing or empty, no campaign-runner emails are sent for that campaign
- the send window is interpreted in `platform.timezone` so report timing stays aligned with the rest of the campaign lifecycle model
- `email_subject_prefix` can be set to an empty string to disable the prefix entirely
- when the prefix is omitted at runtime, the Worker falls back to `[platform.name]`
- report subjects stay concise and deliverability-oriented: no emoji, short report labels, and a consistent prefix + report-kind + campaign-title pattern
- daily pledge emails use a campaign-only summary with total pledges, new pledges in the previous 24 hours, pledged total, goal progress, and deadline countdown/passed time
- fulfillment sends are split by fulfiller:
  - campaign-runner recipients receive only the campaign-fulfilled rows
  - `platform.support_email` receives a separate platform-fulfillment email when platform add-on rows exist
- fulfillment summaries are intentionally concise and fulfillment-oriented; they do not reuse the daily pledge-report body summary
- both report types can include a short guidance note in the body so runners get campaign-stage-specific encouragement or fulfillment communication reminders alongside the CSV

Example:

```yml
reports:
  campaign_runner:
    enabled: true
    daily_pledge_report_enabled: true
    fulfillment_report_enabled: true
    send_hour: 7
    send_minute: 0
    include_stats_summary: true
    include_csv_attachment: true
    email_subject_prefix: "[My Fork]"
```

What this enables:

- daily campaign-scoped pledge-ledger emails during live campaigns
- one-time fulfillment exports after a campaign deadline passes
- separate campaign-runner and platform fulfillment emails when both campaign and platform items need delivery
- optional body summaries and optional CSV attachments without changing campaign content files
- a consistent subject prefix, which defaults to `"[The Pool]"` in this repo and falls back to `[platform.name]` if omitted at runtime

Per-campaign recipient example:

```yml
runner_report_emails:
  - producer@example.com
  - ops@example.com
```

### `design`

Use `design` for curated design-system overrides that do not require Sass edits.

These values are emitted into the generated stylesheet [assets/main.css](../assets/main.scss), which keeps the design-variable bridge compatible with the site’s strict CSP. [assets/theme-vars.css](../assets/theme-vars.css) remains as a compatibility artifact, but public layouts do not request it separately. Forks do not need to edit Sass just to change supported tokens.

The same generated CSS variables also now theme the on-site Stripe Elements sidecar, so supported typography/color/radius overrides carry through the custom checkout payment UI without adding a separate checkout-only config layer.

A deliberately smaller subset of the same branding surface is mirrored into the Worker so supporter emails can reuse the configured logo, font stacks, primary color, border/surface colors, and button radius.

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

### `performance`

Use `performance` for public-page performance knobs that a fork may need to tune without code changes.

Supported keys:

- `intent_prefetch_enabled`
- `intent_prefetch_delay_ms`
- `intent_prefetch_limit`

These control the safe same-origin document prefetch runtime loaded on public pages. The default is enabled, with conservative route/query exclusions and a low per-page limit. Private app surfaces such as admin, checkout, Manage Pledge, and supporter-community routes do not load the public prefetch runtime.

Super admins can edit these fields in the dashboard under **Settings -> Advanced performance**. Published changes update `_config.yml`, mirror the Worker-facing `INTENT_PREFETCH_*` values, and take effect on static pages after the normal rebuild/deploy path.

### `launch_reminders`

Use `launch_reminders` for the public one-time reminder form shown on upcoming campaign pages.

Supported keys:

- `enabled`
- `turnstile_site_key`

Current behavior:

- the form only renders for campaigns whose effective state is `upcoming`
- the public site key can be blanked in `_config.local.yml` to hide the widget locally
- the matching secret belongs in Worker secrets as `TURNSTILE_SECRET_KEY` or `LAUNCH_REMINDER_TURNSTILE_SECRET_KEY`
- reminder signup, unsubscribe, and dispatch logic lives in the Worker and reuses the existing Resend email module

Example:

```yml
launch_reminders:
  enabled: true
  turnstile_site_key: "0x..."
```

## Site-Only vs Worker-Mirrored Settings

Some settings only affect the Jekyll build and browser-owned UI. Others are also reflected into the Worker env automatically.

### Not Mirrored By The Sync Script

These can be changed in `_config.yml` without adding new Worker env entries:

- `i18n.*`
- `platform.version`
- `platform.release_label`
- `admin.production_site_url`
- `admin.production_worker_url`
- `shipping.presets`
- `add_ons.*`
- campaign front matter, including `campaign_add_ons`, content blocks, diary entries, tiers, support items, stretch goals, and decisions
- design/layout tokens that are only consumed by the generated site CSS and not by supporter emails

These values still matter to the generated site and, in some cases, to Worker-fetched static API payloads. They are simply not written into `worker/wrangler.toml` by `scripts/sync-worker-config.rb`.

### Auto-Mirrored To Worker

These site-config values are also reflected into the Worker env values in [`worker/wrangler.toml`](../worker/wrangler.toml):

- `title` -> `SITE_TITLE`
- `description` -> `SITE_DESCRIPTION`
- `author` -> `PLATFORM_AUTHOR`
- `platform.name` -> `PLATFORM_NAME`
- `platform.company_name` -> `PLATFORM_COMPANY_NAME`
- `platform.default_creator_name` -> `PLATFORM_DEFAULT_CREATOR_NAME`
- `platform.support_email` -> `SUPPORT_EMAIL`
- `platform.pledges_email_from` -> `PLEDGES_EMAIL_FROM`
- `platform.updates_email_from` -> `UPDATES_EMAIL_FROM`
- `platform.logo_path` -> `EMAIL_LOGO_PATH`
- `platform.footer_logo_path` -> `PLATFORM_FOOTER_LOGO_PATH`
- `platform.favicon_path` -> `PLATFORM_FAVICON_PATH`
- `platform.default_social_image_path` -> `PLATFORM_DEFAULT_SOCIAL_IMAGE_PATH`
- `platform.site_url` -> `SITE_BASE` and `CORS_ALLOWED_ORIGIN`
- `platform.worker_url` -> `WORKER_BASE`
- `seo.default_social_image_alt` -> `SEO_DEFAULT_SOCIAL_IMAGE_ALT`
- `seo.x_handle` -> `SEO_X_HANDLE`
- `seo.same_as` -> `SEO_SAME_AS`
- `seo.index_public_community_hub` -> `SEO_INDEX_PUBLIC_COMMUNITY_HUB`
- `admin.users` -> `ADMIN_USERS_JSON`
- `admin.local_test_campaigns` -> `ADMIN_TEST_CAMPAIGNS` in the dev env
- `checkout.stripe_publishable_key` -> `STRIPE_PUBLISHABLE_KEY`
- `design.font_body` -> `EMAIL_FONT_FAMILY`
- `design.font_display` -> `EMAIL_HEADING_FONT_FAMILY`
- `design.color_text` -> `EMAIL_COLOR_TEXT`
- `design.color_text_muted` -> `EMAIL_COLOR_MUTED`
- `design.color_surface_subtle` -> `EMAIL_COLOR_SURFACE`
- `design.color_border` -> `EMAIL_COLOR_BORDER`
- `design.color_primary` -> `EMAIL_COLOR_PRIMARY`
- `design.radius_lg` -> `EMAIL_BUTTON_RADIUS`
- `pricing.sales_tax_rate` -> `SALES_TAX_RATE`
- `tax.provider` -> `TAX_PROVIDER`
- `tax.origin_country` -> `TAX_ORIGIN_COUNTRY`
- `tax.use_regional_origin` -> `TAX_USE_REGIONAL_ORIGIN`
- `tax.nm_grt_api_base` -> `NM_GRT_API_BASE`
- `tax.zip_tax_api_base` -> `ZIP_TAX_API_BASE`
- `pricing.flat_shipping_rate` -> `FLAT_SHIPPING_RATE` (legacy compatibility only; prefer `shipping.fallback_flat_rate`)
- `pricing.default_tip_percent` -> `DEFAULT_PLATFORM_TIP_PERCENT`
- `pricing.max_tip_percent` -> `MAX_PLATFORM_TIP_PERCENT`
- `shipping.origin_zip` -> `SHIPPING_ORIGIN_ZIP`
- `shipping.origin_country` -> `SHIPPING_ORIGIN_COUNTRY`
- `shipping.fallback_flat_rate` -> `SHIPPING_FALLBACK_FLAT_RATE`
- `shipping.free_shipping_default` -> `FREE_SHIPPING_DEFAULT`
- `shipping.default_option` -> `SHIPPING_DEFAULT_OPTION`
- `shipping.usps.enabled` -> `USPS_ENABLED`
- `shipping.usps.client_id` -> `USPS_CLIENT_ID`
- `shipping.usps.api_base` -> `USPS_API_BASE`
- `shipping.usps.timeout_ms` -> `USPS_TIMEOUT_MS`
- `shipping.usps.quote_cache_ttl_seconds` -> `USPS_QUOTE_CACHE_TTL_SECONDS`
- `shipping.usps.failure_cooldown_seconds` -> `USPS_FAILURE_COOLDOWN_SECONDS`
- `shipping.usps.rate_limit_cooldown_seconds` -> `USPS_RATE_LIMIT_COOLDOWN_SECONDS`
- `platform.timezone` -> `PLATFORM_TIMEZONE`
- `reports.campaign_runner.enabled` -> `CAMPAIGN_RUNNER_REPORTS_ENABLED`
- `reports.campaign_runner.daily_pledge_report_enabled` -> `CAMPAIGN_RUNNER_DAILY_PLEDGE_REPORT_ENABLED`
- `reports.campaign_runner.fulfillment_report_enabled` -> `CAMPAIGN_RUNNER_FULFILLMENT_REPORT_ENABLED`
- `reports.campaign_runner.send_hour` -> `CAMPAIGN_RUNNER_REPORT_HOUR`
- `reports.campaign_runner.send_minute` -> `CAMPAIGN_RUNNER_REPORT_MINUTE`
- `reports.campaign_runner.include_stats_summary` -> `CAMPAIGN_RUNNER_INCLUDE_STATS_SUMMARY`
- `reports.campaign_runner.include_csv_attachment` -> `CAMPAIGN_RUNNER_INCLUDE_CSV_ATTACHMENT`
- `reports.campaign_runner.email_subject_prefix` -> `CAMPAIGN_RUNNER_EMAIL_SUBJECT_PREFIX`
- `launch_reminders.enabled` -> `LAUNCH_REMINDERS_ENABLED`
- `debug.console_logging_enabled` -> `DEBUG_CONSOLE_LOGGING_ENABLED`
- `debug.verbose_console_logging` -> `DEBUG_VERBOSE_CONSOLE_LOGGING`
- `performance.intent_prefetch_enabled` -> `INTENT_PREFETCH_ENABLED`
- `performance.intent_prefetch_delay_ms` -> `INTENT_PREFETCH_DELAY_MS`
- `performance.intent_prefetch_limit` -> `INTENT_PREFETCH_LIMIT`
- `cache.live_stats_ttl_seconds` -> `LIVE_STATS_CACHE_TTL_SECONDS`
- `cache.live_inventory_ttl_seconds` -> `LIVE_INVENTORY_CACHE_TTL_SECONDS`

Local bootstrap super-admin emails are intentionally not mirrored from `_config.yml`. Put them in ignored `worker/.dev.vars` as `ADMIN_BOOTSTRAP_EMAILS`; `npm run secrets:dev` seeds that value from `worker/.dev.vars.example` when missing.

The sync script also writes derived URL values:

- production `[vars]` gets `CANONICAL_SITE_BASE` / `CANONICAL_WORKER_BASE` from the production `platform.site_url` / `platform.worker_url`
- dev `[env.dev.vars]` gets local `SITE_BASE` / `WORKER_BASE` from `_config.local.yml`, while `CANONICAL_SITE_BASE` / `CANONICAL_WORKER_BASE` stay pinned to the production values from `_config.yml`

The browser dashboard **Reports** tab previews and downloads pledge/fulfillment CSVs for campaigns the admin can access. It does not send report emails and does not write “sent” markers.

The repo keeps those values aligned automatically through the main local/dev/test paths. After changing them, restart the local stack so the site and Worker both pick up the new values:

```bash
./scripts/dev.sh --podman
```

For convenience, the repo now includes:

```bash
npm run sync:worker-config
```

That command syncs the Worker-mirrored values in [`worker/wrangler.toml`](../worker/wrangler.toml) from `_config.yml` and `_config.local.yml`.

It does not write Worker secrets, media files, or generated optimization outputs. USPS OAuth secrets, Stripe secret keys, Resend keys, ZIP.TAX keys, Turnstile secrets, GitHub tokens, and Cloudflare deploy credentials still belong in Worker secrets, GitHub repository secrets, or ignored local env files.

Launch reminders have one public setting and one secret boundary:

- `_config.yml` `launch_reminders.enabled` controls whether upcoming campaign pages render the reminder form.
- `_config.yml` `launch_reminders.turnstile_site_key` is the public Cloudflare Turnstile site key used by that form.
- `_config.local.yml` may override `launch_reminders.turnstile_site_key` with an empty string to hide the widget in local development, matching the local admin sign-in Turnstile override.
- The matching Turnstile secret belongs in Worker secrets as `TURNSTILE_SECRET_KEY` or `LAUNCH_REMINDER_TURNSTILE_SECRET_KEY`.
- Reminder emails use the existing Resend-backed Worker email module and the configured `platform.updates_email_from` sender.

Dashboard-uploaded media also does not add new sync-script config. Uploads commit source files into the existing asset directories; image/video uploads request the **Optimize dashboard media** workflow after the commit succeeds. `npm run media:optimize` / `npm run media:optimize:check`, the Podman-backed variants for machines without native optimizers, and the same workflow handle image compression, responsive WebP variants at `320w`, `480w`, `640w`, `960w`, and `1600w`, and WebM derivatives outside the Worker.

Generated CSS/JS minification is also outside the Worker and dashboard save path. Production deploys run `npm run assets:minify` only after Jekyll writes `_site`, so forks should keep source assets readable in `assets/` and let the deploy artifact step handle minified output. Cloudflare edge compression should stay enabled, but Cloudflare Auto Minify should stay disabled to avoid a second rewriting layer.

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
- changing Stripe-owned field styling beyond the supported design-token bridge and Stripe’s appearance API
- introducing brand-new layout structures, page templates, or content block types
- changing font hosting/CSP behavior beyond the currently supported font stacks
- changing the protected preview authorization model, reviewer-link expiry, or preview-only public filtering rules

Also note:

- not every Sass token is exposed on purpose
- not every Worker env var belongs in `_config.yml`
- the supported surface is curated to avoid security and maintenance regressions
- dashboard uploads commit files into the existing asset directories and update config/campaign fields; image/video uploads request the external media pipeline after commit, publish removes same-campaign dashboard-owned media that is no longer referenced, and adding a new upload category or storage backend is still code-level work

## Safe Workflow For Forks

1. Prefer the admin dashboard for supported settings/campaign/add-on edits. Use direct file edits when reviewing generated changes, changing unsupported fields, or working without the Worker.
2. If editing files directly, update `_config.yml` or the relevant `_campaigns/*.md`.
3. Run `npm run sync:worker-config` if you are editing config outside the normal entry points and want to refresh `worker/wrangler.toml` immediately.
4. Run:

```bash
npm run podman:doctor
./scripts/dev.sh --podman
```

5. Verify:

- header/footer branding
- meta image / favicon
- campaign creator fallback
- CSP-sensitive pages still load without console CSP violations
- cart / checkout totals
- Stripe payment UI styling
- Manage Pledge
- supporter emails
- admin dashboard publish/preview state, read-only secrets status, protected preview access emails, new campaign assignment emails, and role-scoped campaign visibility when dashboard fields changed

6. Run the relevant checks:

```bash
npx vitest run tests/unit/config-boot.test.ts tests/unit/cart-provider.test.ts tests/unit/manage-page.test.ts tests/unit/worker-business-logic.test.ts
./scripts/podman-self-check.sh
```

## Guidance For Future Additions

When adding new customization knobs, prefer this order:

1. put the site-facing value in `_config.yml`
2. mirror it to Worker env only if checkout, reports, or emails need it
3. if it needs Worker env, update `scripts/sync-worker-config.rb` in `TOP_LEVEL_ORDER`, `DEV_ENV_ORDER`, and `build_mirror_values`
4. document it here
5. keep the supported surface curated instead of exposing every implementation detail

That keeps customization flexible without turning the platform into an unstable free-form theme engine.
