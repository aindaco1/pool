# Add-On Products

This document describes the current structure for platform-wide add-on products. The goal is to support a small, fork-friendly global merch catalog that can be attached to pledges without treating platform merch as campaign-scoped support items.

Current anchor model:

- add-ons live at the bundle level in the cart and checkout payload
- multi-campaign carts stay supported
- pending checkout manifests can point those bundle add-ons at a designated anchor campaign
- bundle add-on revenue is intended to support platform admins and should not count toward the anchor campaign's funding goal
- cart sidecar and Manage Pledge now both use the same catalog/selection rules for adding, removing, and editing add-ons
- anchor-bound add-ons now flow through canonical checkout totals, pledge persistence, shipping, and supporter emails without counting toward campaign goals

## Principles

- keep the catalog fork-facing and variable-first
- support fixed-price products and simple variants like shirt sizes
- reuse existing cart, shipping, reporting, and fulfillment foundations where possible
- avoid forcing global merch into the older campaign-scoped, amount-based support-item model

## Current Catalog Surface

Global add-on products live in [/_config.yml](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/_config.yml) under `add_ons`.

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

Physical vs. digital add-ons:

- `category: digital` means the add-on never affects shipping
- `category: physical` means the add-on participates in the same Worker-side shipping calculator as physical tiers and physical support items
- for physical add-ons, forks can either:
  - reference a shared `shipping_preset` like `tshirt` or `sticker`
  - or provide explicit `shipping` metadata inline

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

These are imported as global add-on definitions, not as campaign support items.

Current inventory defaults:

- each T-shirt design starts with `15` total units distributed across sizes
- stickers start with `50`
- the low-stock threshold defaults to `5` and is fork-facing in config

## Inventory and Scarcity

The current add-on flow is intentionally inventory-aware:

- product and variant inventory live in `add_ons`
- the Worker exposes a current inventory snapshot at [/add-ons/inventory](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/worker/src/index.js)
- cart and Manage Pledge both consume the same shared inventory-aware product-state helper
- low-stock messaging appears when remaining quantity is at or below `low_stock_threshold`
- sold-out variants are removed from the shared product-state surface unless they are already selected on an existing pledge
- add-on inventory is counted from persisted pledge records, but add-on revenue still does not count toward campaign goals

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
- multi-campaign carts expose an anchor-campaign selector, but only when more than one campaign is present
- the add-on section explicitly tells supporters that the merch supports the platform admin and does not increase campaign funding totals

## Shipping Model

Add-on products reuse the same shipping model as physical tiers and physical support items.

Current presets relevant to the first wave:

- `tshirt`
- `sticker`

That means:

- preset-based physical add-ons can inherit shipping dimensions from `shipping.presets`
- explicitly modeled physical add-ons can define `shipping.weight_oz`, `shipping.packaging_weight_oz`, `shipping.length_in`, `shipping.width_in`, `shipping.height_in`, and `shipping.stack_height_in`
- digital add-ons stay out of shipping totals entirely

## Runtime Contract

The current catalog is exposed to browser runtime config through [assets/js/pool-config.js](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/assets/js/pool-config.js) and the shared runtime boot include [/_includes/cart-runtime-foot.html](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/_includes/cart-runtime-foot.html).

That means cart-side and Manage Pledge UI can read one stable `POOL_CONFIG.addOns` source of truth instead of duplicating product data in multiple templates or scripts.

The Worker now also has a matching static catalog source at [/api/add-ons.json](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/api/add-ons.json), and pending checkout manifests can carry:

- `bundleAddOns`
- `bundleAddOnAnchorCampaignSlug`
- `bundleAddOnTotals`

Anchor-bound add-ons now also persist on the pledge record itself so:

- canonical subtotal and shipping math includes them
- campaign goal tracking still excludes them
- supporter emails can render them
- Manage Pledge can add or subtract them later
- pledge and fulfillment reports can separate campaign pledge value from platform merch value

## Why Not Use Support Items?

Campaign support items are currently:

- campaign-scoped
- amount-based
- optimized for funding buckets and simple physical add-ons

That works well for campaign-specific extras, but it is a poor long-term fit for:

- platform-wide merch
- fixed-price catalog items
- structured variants like shirt sizes

The add-on product catalog is meant to sit beside that system, not replace it.

## Remaining Follow-Up

The biggest remaining slices are:

- decide what a more explicit platform-merch reporting/admin surface should look like
- add broader browser/manual coverage once the cart-side add-on flow is a little fuller
- keep accessibility, mobile responsiveness, and i18n support at the same standard as the rest of the platform
