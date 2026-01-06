---
layout: campaign
title: "HAND RELATIONS"
slug: hand-relations
test_only: true
start_date: 2025-12-01
goal_deadline: 2026-01-31
goal_amount: 25000
charged: false
hero_image: /assets/images/defaults/dust-wave-square.png
hero_image_wide: /assets/images/campaigns/hand-relations/hand-relations-wide.png
hero_video: /assets/videos/defaults/hand-relations.webm
creator_image: /assets/images/defaults/dust-wave-square.png
creator_name: "Dust Wave"
category: "Feature Film"
short_blurb: "Elevated horror where a corporate empathy campaign consumes bureaucracy."
show_ongoing: false
single_tier_only: false
stretch_hidden: true
custom_late_support: true
long_content:
  - type: text
    body: |
      _HAND RELATIONS_ lets backers influence the film via limited, curated "creative control" rewards. We retain creative discretion for coherence & safety. See **[Terms](/terms/)**.

      When a corporate wellness initiative goes too far, the line between empathy and consumption blurs. What begins as a simple team-building exercise spirals into something far more sinister—a bureaucratic nightmare where human connection becomes a commodity.
  - type: video
    provider: youtube
    video_id: "dQw4w9WgXcQ"
    caption: "Concept teaser — final film will differ significantly"
  - type: text
    body: |
      ## The Vision

      We're crafting an elevated horror experience that critiques corporate culture's commodification of emotional labor. Think *Severance* meets *Society*—slick surfaces hiding visceral truths.
  - type: gallery
    layout: grid
    images:
      - src: /assets/images/defaults/dust-wave-square.png
        alt: "Concept art - office interior"
      - src: /assets/images/defaults/dust-wave-square.png
        alt: "Concept art - the ritual"
      - src: /assets/images/defaults/dust-wave-square.png
        alt: "Storyboard panel"
      - src: /assets/images/defaults/dust-wave-square.png
        alt: "Location scout"
    caption: "Early concept work and location scouting"
  - type: quote
    text: "The scariest thing about corporations isn't malice—it's indifference wrapped in the language of care."
    author: "Director's statement"
  - type: divider
  - type: text
    body: |
      ## Why Crowdfunding?

      Traditional financing wanted us to soften the satire. We refused. This film needs to bite, and that means finding an audience who *gets it* before we shoot a single frame.

      Your pledge isn't just funding—it's a vote for the kind of cinema that doesn't pull punches.
  - type: audio
    src: /assets/audio/score-sample.mp3
    title: "Score concept by Elena Voss"
    caption: "Early synth sketches for the main theme"
featured_tier_id: frame-slot
stretch_hidden: false

stretch_goals:
  - threshold: 35000
    title: Extra Sound Design Week
    description: More Foley & ambience layers.
    status: locked
  - threshold: 50000
    title: Practical Creature Insert
    description: 15s practical FX insert shot.
    status: locked

custom_late_support: true

support_items:
  - id: location-scouting
    label: Location Scouting
    need: travel + permits
    target: 1000
    late_support: true
  - id: casting
    label: Casting
    need: space + reader stipends
    target: 1000
    late_support: true

decisions:
  - id: poster
    type: vote
    title: Official Poster
    deadline: 2026-01-10
    options:
      - label: A
        image: https://images.unsplash.com/photo-1509248961048-6d4e6912c458?w=400
      - label: B
        image: https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=400
    eligible: backers
    status: open
  - id: festival
    type: poll
    title: First Festival Target
    deadline: 2026-01-25
    options:
      - Slamdance
      - Fantasia
      - Rotterdam
    eligible: backers
    status: open

diary:
  - title: "Campaign page live!"
    body: "We're officially launching the Hand Relations crowdfunding campaign."
    date: 2025-10-18
    phase: fundraising
  - title: "Day 14 — Principal Photography"
    body: "Desert wrap. Wind, dust, and a miraculous sunset. Footage looks unreal."
    date: 2025-10-27
    phase: production
  - title: "Day 7 — Equipment Woes"
    body: "Batteries mutinied. We borrowed from crew and kept rolling."
    date: 2025-10-20
    phase: production

ongoing_items:
  - label: Color Grade
    remaining: 4500
  - label: Sound Mix
    remaining: 6000
  - label: Regional Screenings
    remaining: 2800

tiers:
  - id: frame-slot
    name: Buy 1 Frame
    price: 5
    image: /assets/images/defaults/tier-frame.png
    description: Sponsor a frame; include a preferred frame number and an optional reference URL.
    limit_total: 1000
    remaining: 947
    stackable: true
    category: digital
    late_support: false

  - id: sfx-slot
    name: Submit a Sound Effect
    price: 10
    image: /assets/images/defaults/tier-sfx.png
    description: Provide a hosted link to your original SFX (MP3/WAV).
    limit_total: 500
    remaining: 490
    stackable: true
    category: digital
    late_support: false

  - id: direct-action
    name: Direct the Protagonist
    price: 100
    image: /assets/images/defaults/tier-direct.png
    description: Suggest an action. We retain creative discretion.
    limit_total: 25
    remaining: 21
    stackable: true
    category: digital
    late_support: false

  - id: creature-cameo
    name: Creature Cameo
    price: 250
    image: /assets/images/defaults/tier-creature.gif
    description: Name the practical creature from the stretch goal insert shot.
    limit_total: 1
    remaining: 1
    stackable: false
    category: digital
    late_support: false
    requires_threshold: 50000
---
