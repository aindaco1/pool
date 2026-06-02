# Add-On Products

This document describes the current add-on product system as it actually ships now.

The platform supports two add-on scopes that intentionally share the same card UX while behaving differently in accounting, shipping, and fulfillment:

- **Platform add-ons** live in the global catalog under `add_ons` in [/_config.yml](../_config.yml)
- **Campaign add-ons** live in campaign front matter under `campaign_add_ons`

Both scopes:

- use the same cart and Manage Pledge card UI
- support fixed-price items and simple variants
- participate in canonical Worker-side totals, persistence, and inventory tracking
- derive scarcity from saved pledge state rather than unsaved cart drafts

The important difference is intent:

- platform add-ons are platform merch and do **not** count toward campaign funding
- campaign add-ons are campaign-owned merch and **do** count toward the owning campaign subtotal / funding progress

## Principles

- keep the catalog fork-facing and variable-first
- support fixed-price products and simple variants like shirt sizes
- reuse existing cart, shipping, reporting, and fulfillment foundations where possible
- avoid forcing merch into the older amount-based support-item model when a fixed-price catalog item is a better fit

## Scope Model

### 1. Platform add-ons

Platform add-ons are configured globally and are meant to support the site operator.

They:

- render under the normal `Add-ons` section
- support multi-campaign carts
- do **not** count toward any campaign funding goal
- are fulfilled as platform merch rather than campaign merch
- use one combined platform shipment when any physical global add-ons are present in the cart

### 2. Campaign add-ons

Campaign add-ons are defined on a specific campaign and are meant to behave like campaign-owned merch with the same UI as platform add-ons.

They:

- render under a separate `Campaign Add-ons` section in cart and Manage Pledge
- only appear when the owning campaign is present
- are automatically removed if the owning campaign pledge leaves the cart
- count toward the owning campaign subtotal / funding progress
- follow the owning campaign’s shipping rules and overrides
- remain associated with the campaign in reporting and fulfillment

## Current Catalog Surface

Global add-on products live in [/_config.yml](../_config.yml) under `add_ons`.

Current top-level keys:

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

The private admin dashboard exposes platform add-ons under **Add-ons** and campaign add-ons under each campaign's **Add-Ons** subtab. The dashboard keeps legacy product and variant IDs intact, but new products and variants derive read-only IDs from their name/label so forks do not need to hand-author slugs. Product images uploaded through the dashboard are committed into the relevant asset directory:

- platform add-ons: `assets/images/add-ons/`
- campaign add-ons: `assets/images/campaign-add-ons/`

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

Campaign add-ons use the same product shape, but they live in campaign front matter:

```yml
campaign_add_ons:
  - id: smoke-editable__first-time-sexpot-poster
    name: "First Time Sexpot Poster"
    description: "18” x 24” First Time Sexpot poster."
    image_url: /assets/images/campaign-add-ons/sexpot-poster.png
    price: 35.00
    category: physical
    inventory: 10
```

Physical vs. digital add-ons:

- `category: digital` means the add-on never affects shipping
- `category: physical` means the add-on participates in the same Worker-side shipping calculator as physical tiers and physical support items
- for physical add-ons, forks can either:
  - reference a shared `shipping_preset` like `tshirt` or `sticker`
  - or provide explicit `shipping` metadata inline
- when a physical add-on has no shipping preset, the admin dashboard exposes explicit weight and package-dimension fields on the row below the preset selector

Example explicit shipping metadata:

```yml
add_ons:
  products:
    - id: enamel-pin
      name: "Enamel Pin"
      price: 12.00
      category: physical
      shipping:
        weight_oz: 2
        packaging_weight_oz: 0.5
        length_in: 2
        width_in: 2
        height_in: 0.5
        stack_height_in: 0.2
```

## Initial Dust Wave Import

The current first-wave catalog is based on the live Dust Wave shop at [shop.dustwave.xyz](https://shop.dustwave.xyz/):

- `DUST WAVE T-Shirt` — `$25`, size variants `XS` through `3XL`
- `DUST WAVE Sticker` — `$3`, no variants
- `DUST WAVE Butterfingers T-Shirt` — `$25`, size variants `XS` through `3XL`
- `First Time Sexpot Condom Pack` — campaign add-on on `smoke-editable`
- `First Time Sexpot Poster` — campaign add-on on `smoke-editable`

The first three are global platform add-ons. The last two are campaign-scoped add-ons on Smoke Editable and are treated as campaign merch, not platform merch.

Current inventory defaults:

- each T-shirt design starts with `15` total units distributed across sizes
- stickers start with `50`
- the low-stock threshold defaults to `5` and is fork-facing in config

## Inventory and Scarcity

The current add-on flow is intentionally inventory-aware:

- inventory can live on the product itself or on each variant
- global add-ons read inventory from `add_ons`
- campaign add-ons read inventory from `campaign_add_ons`
- the Worker exposes a current inventory snapshot at [/add-ons/inventory](../worker/src/index.js)
- cart and Manage Pledge both consume the same shared inventory-aware product-state helper
- low-stock messaging appears when remaining quantity is at or below `low_stock_threshold`
- sold-out variants are removed from the shared product-state surface unless they are already selected on an existing pledge
- add-on inventory is counted from persisted pledge records, not in-progress cart drafts
- sold counts are stored in `add-on-inventory-sold:v1` after the first projection bootstrap, and pledge create, modify, and cancel paths keep that projection current so normal inventory reads do not list all pledge keys
- super admins can set platform add-on inventory overrides in the dashboard without editing `_config.yml`; those overrides are stored separately from the configured baseline

## UI Model

The current UI model is intentionally simple and shared:

- one card per product, not one card per variant
- each card can show:
  - image
  - title
  - description
  - variation selector when variants exist
  - quantity input
  - one-click add/remove action
- the cart and Manage Pledge both use the same product-state normalization rules
- the platform `Add-ons` section explicitly tells supporters that the merch supports the platform admin and does not increase campaign funding totals
- the `Campaign Add-ons` section uses the same cards without that platform-support note
- in multi-campaign carts there is one combined `Campaign Add-ons` section, even when more than one campaign contributes campaign add-ons

## Shipping Model

Add-on products reuse the same shipping model as physical tiers and physical support items.

Current presets relevant to the first wave:

- `tshirt`
- `sticker`

That means:

- preset-based physical add-ons can inherit shipping dimensions from `shipping.presets`
- explicitly modeled physical add-ons can define `shipping.weight_oz`, `shipping.packaging_weight_oz`, `shipping.length_in`, `shipping.width_in`, `shipping.height_in`, and `shipping.stack_height_in`
- digital add-ons stay out of shipping totals entirely

The current shipping split is:

- **campaign add-ons** follow the owning campaign’s shipping rules and overrides
- **physical platform add-ons** do not inherit campaign shipping; they combine into one separate platform shipment and one separate platform shipping charge
- **digital platform add-ons** do not affect shipping

## Runtime Contract

The current catalog is exposed to browser runtime config through [assets/js/pool-config.js](../assets/js/pool-config.js) and the shared runtime boot include [/_includes/cart-runtime-foot.html](../_includes/cart-runtime-foot.html).

That means cart-side and Manage Pledge UI can read one stable `POOL_CONFIG.addOns` source of truth instead of duplicating product data in multiple templates or scripts.

The Worker now also has a matching static catalog source at [/api/add-ons.json](../api/add-ons.json), and pending checkout manifests can carry:

- `bundleAddOns`
- `bundleAddOnAnchorCampaignSlug`
- `bundleAddOnTotals`

Add-ons also persist on the pledge record itself so:

- canonical subtotal and shipping math includes them
- supporter emails can render them
- Manage Pledge can add or subtract them later
- pledge and fulfillment reports can separate campaign pledge value from platform merch value where needed

Current accounting behavior:

- platform add-ons do **not** count toward campaign `goalTrackingSubtotal`
- campaign add-ons **do** count toward campaign `goalTrackingSubtotal`

## Why Not Use Support Items?

Campaign support items are currently:

- campaign-scoped
- amount-based
- optimized for funding buckets rather than fixed-price merch catalogs

That works well for campaign-specific monetary extras, but it is a poor long-term fit for:

- platform-wide merch
- fixed-price catalog items
- structured variants like shirt sizes
- campaign-owned merch that should share the same product-card UI as platform merch

The add-on product catalog is meant to sit beside that system, not replace it.

## Reporting and Fulfillment

Reports now distinguish between platform and campaign add-ons intentionally.

In `pledge-report`:

- campaign add-ons count toward `campaign_subtotal`
- platform add-ons stay separated as `platform_add_on_subtotal`

In `fulfillment-report`:

- platform add-ons are fulfilled by the platform operator (`site.author`)
- campaign add-ons stay attached to the campaign and use the campaign as fulfiller

This keeps operational ownership clear without changing the supporter-facing add-on UI.

## Remaining Follow-Up

The biggest remaining slices are:

- support different prices per add-on variation
- keep accessibility, mobile responsiveness, and i18n support at the same standard as the rest of the platform as the catalog grows
