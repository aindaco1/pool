---
layout: campaign
title: "SMOKE EDITABLE"
slug: smoke-editable
test_only: true
start_date: 2026-01-01
goal_deadline: 2028-12-31
goal_amount: 10000
charged: false
hero_image: /assets/images/defaults/dust-wave-square.png
hero_image_wide: /assets/images/defaults/dust-wave-square.png
hero_video: /assets/videos/defaults/hand-relations.webm
creator_image: /assets/images/defaults/dust-wave-square.png
creator_name: "Dust Wave"
category: "Smoke Test"
short_blurb: "Local-only campaign for modify/cancel, limited inventory, and checkout smoke testing."
show_ongoing: false
single_tier_only: false
stretch_hidden: true
custom_late_support: true
shipping_fallback_flat_rate: 12
shipping_options:
  - signature_required
  - adult_signature_required
featured_tier_id: standard-pass

long_content:
  - type: text
    body: |
      This campaign exists only for local smoke testing.

      It is marked `test_only: true`, so production excludes it from the homepage and `/api/campaigns.json`. Local development includes it through `_config.local.yml`.
  - type: text
    body: |
      Use this campaign when you need a live, editable pledge target that is safe to exercise with `/test/setup`, modify, cancel, limited inventory, and support-item flows.

support_items:
  - id: snack-run
    label: Snack Run
    need: coffee + crafty
    target: 250
    late_support: true
  - id: signed-script
    label: Signed Script
    need: physical add-on shipping smoke test
    target: 25
    category: physical
    shipping_preset: signed_script
    late_support: true

tiers:
  - id: standard-pass
    name: Standard Pass
    price: 10
    image: /assets/images/defaults/tier-frame.png
    description: A normal digital tier for modify/cancel smoke tests.
    stackable: true
    category: digital
    late_support: true

  - id: limited-poster
    name: Limited Poster
    price: 25
    image: /assets/images/defaults/tier-sfx.png
    description: A limited physical tier for local inventory and shipping checks.
    limit_total: 5
    remaining: 5
    stackable: false
    category: physical
    shipping_preset: poster
    late_support: true
---
