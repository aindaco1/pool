# Campaign Content Model

Use this reference when changing campaign Markdown, schema validation, or the
campaign editor. Routine authoring belongs in the [dashboard](DASHBOARD.md);
creators can use the [launch checklist](../creator-campaign-checklist.md).
Preserve existing campaign, tier, product, variant, diary, and decision IDs.
The repository source and Worker validation remain authoritative.

Saved working copies use the same campaign format under `_campaign_drafts/`.
The internal `_pool_draft_base_hash` and `_pool_draft_saved_at` fields track the
public authoring baseline and last save; they are never promoted into the public
campaign. Draft files are excluded from site generation. See [Dashboard](DASHBOARD.md#protected-preview)
for Save, Preview, Publish, and browser recovery behavior.

## Campaign Fields

Each campaign lives in `_campaigns/<slug>.md`.

### Required Fields

```yaml
layout: campaign
title: "CAMPAIGN NAME"
slug: campaign-slug
start_date: 2025-01-15   # Campaign goes live at midnight in the platform timezone
goal_amount: 25000
goal_deadline: 2025-12-20  # Campaign ends at 11:59:59 PM in the platform timezone
charged: false
# pledged_amount not needed - live-stats.js fetches from KV and enables late support dynamically
hero_image: /assets/images/hero.jpg
short_blurb: "Brief description"
long_content:
  - type: text
    body: "Full description with **markdown**"
```

**State is computed automatically** from `start_date` and `goal_deadline`:
- Before `start_date` → `upcoming` (buttons disabled)
- Between dates → `live` (pledges accepted)
- After `goal_deadline` → `post` (campaign closed)

The `_plugins/campaign_state.rb` plugin sets state at build time. The Worker scheduler triggers a site rebuild when dates cross midnight in the configured platform timezone.

**Platform timezone enforcement**: The Jekyll plugin, browser countdowns, and Worker deadline logic all use `platform.timezone`, mirrored to the Worker as `PLATFORM_TIMEZONE`. It must be a supported IANA timezone and defaults to `America/Denver` for compatibility.

### Countdown Timer Timezone

The campaign page countdown timer uses the configured platform timezone with automatic DST handling:
- **Upcoming campaigns**: Count down to midnight (00:00:00) on the `start_date`
- **Live campaigns**: Count down to 11:59:59 PM on the `goal_deadline`

The timer uses `Intl.DateTimeFormat` with `platform.timezone` to convert date-only campaign boundaries into absolute instants. This works from any user timezone and follows the selected timezone's daylight saving rules without hardcoding transition dates.

The Worker (`worker/src/index.js` and `worker/src/campaigns.js`) uses the same `Intl`-based approach for deadline enforcement and settlement timing.

### Countdown Pre-Rendering

To avoid a flash of "00 00 00 00" before JavaScript loads:

**Campaign pages (`_layouts/campaign.html`):**
- Jekyll calculates initial countdown values at build time using Liquid filters
- Uses `date: '%s'` to get epoch timestamps, then `divided_by` and `modulo` for days/hours/mins/secs
- Values reflect build time; browser JavaScript refreshes them when the page loads

**Manage page (`_layouts/manage.html`):**
- The `renderCountdown()` function calculates values inline when generating HTML
- No "00" placeholders — values are computed before DOM insertion

Quote strings with special characters to avoid YAML parsing issues.

### Media Fields

- **`hero_image`** (required): Square/vertical image for home page card previews
- **`hero_image_wide`** (optional): Wide image for campaign detail page (falls back to `hero_image`)
- **`hero_video`** (optional): WebM video for campaign detail (uses hero image as poster)
- **`creator_image`** (optional): Square image for creator (48px circle in sidebar)
- **Tier `image`** (optional): Wide image shown above tier name

**Video requirements:** WebM is preferred for uploaded campaign videos, with 16:9 and max 1920x1080 recommended. The admin dashboard accepts hero video uploads up to 100 MB or YouTube/Vimeo URLs, and previews existing video files or embeds through the same content-security policy as the public campaign page. Local content video blocks may specify an optional `poster`; when omitted, public/admin editor views generate a transient poster from the video's first frame and keep the playable video lazy-loaded until play.

**Dashboard upload paths:** The dashboard writes uploaded assets into the current static asset model:

- campaign images/videos: `assets/images/campaigns/<slug>/` and `assets/videos/campaigns/<slug>/`
- tier/support/diary/decision images: the owning campaign asset directory unless a more specific existing path is already present
- platform add-ons: `assets/images/add-ons/`
- campaign add-ons: `assets/images/campaign-add-ons/`

Keep upload handling lossless where possible. Image optimization reduces bytes only when the optimized result is smaller and generates responsive WebP variants for public templates without rewriting source image references. The current public image derivative set is `320w`, `480w`, `640w`, `960w`, and `1600w`; generated responsive derivatives are skipped during source optimization so the pipeline does not recursively re-encode its own browser assets. Video conversion generates high-quality WebM derivatives beside the uploaded source file and rewrites literal campaign/config references to the WebM path after the derivative exists; source videos stay in the repository for rollback or future re-encoding.

### Featured Tier

- **`featured_tier_id`** (optional): Tier ID to highlight on home page card

### Character Limits

- `short_blurb`: Max 80 chars (2 lines on cards)
- `title`: Max 30 chars
- Featured tier name: Max 40 chars

### Long Content Blocks

```yaml
long_content:
  - type: text
    body: "Markdown text"
  - type: image
    src: /assets/images/photo.jpg
    alt: "Description"
  - type: video
    provider: youtube
    video_id: "abc123"
    caption: "Behind the scenes"
  - type: video
    provider: local
    src: /assets/videos/campaigns/example/proof.webm
    caption: "Proof of concept"
  - type: gallery
    layout: grid
    images:
      - src: /assets/images/photo1.jpg
        alt: "Still 1"
```

Long-content safety/behavior rules:
- Text blocks support Markdown.
- External Markdown links render with `target="_blank"` and `rel="noopener noreferrer"` automatically.
- A small inline HTML subset is preserved for compatibility: `<br>`, `<em>`, `<strong>`, `<i>`, `<b>`, `<u>`.
- Other raw HTML tags are escaped at render time and rejected by `scripts/audit-campaign-content.mjs`.

**Gallery layouts:**
- `grid` (default): 2-column grid, 4:3 aspect ratio (1 column on mobile)
- `logos`: 2-column grid, auto aspect ratio with `object-fit: contain` (max 200px height) — ideal for sponsor/partner logos
- `carousel`: Horizontal scroll with snap, 16:9 aspect ratio

### Stretch Goals

```yaml
stretch_goals:
  - threshold: 35000
    title: Extra Sound Design
    description: More Foley layers.
    status: locked
```

### Tiers

```yaml
tiers:
  - id: frame-slot
    name: Buy 1 Frame
    price: 5
    description: Sponsor a frame.
    category: physical       # physical | digital (default: digital)
    fields:
      - { name: "Preferred frame number", type: "text", required: true }

  - id: creature-cameo
    name: Creature Cameo
    price: 250
    description: Name the practical creature.
    requires_threshold: 35000  # Unlocks when pledged >= $35,000
```

**Tier gating**: Add `requires_threshold` (integer, dollars) to lock a tier until the campaign reaches that funding level. When live stats update and `pledgedAmount >= requires_threshold`, the tier animates to "Unlocked!" state with a badge. The animation respects `prefers-reduced-motion`.

**Physical tiers**: Set `category: physical` to trigger shipping address collection during the on-site Stripe payment step. The current shipping-calculator groundwork also supports:

- `shipping_preset` for common physical goods like `tshirt`, `poster`, `cd`, `vinyl`, `dvd`, `bluray`, and `signed_script`
- `shipping.weight_oz`, `shipping.packaging_weight_oz`, `shipping.length_in`, `shipping.width_in`, `shipping.height_in`, and `shipping.stack_height_in` for explicit per-tier overrides
- optional `shipping_fallback_flat_rate` at the campaign level when a specific campaign needs a different flat fallback than the global deployment default
- optional `shipping_options` at the campaign level for the limited backer-facing shipping policy set (`signature_required`, `adult_signature_required`)

In the admin dashboard, tier IDs are read-only for editors: legacy IDs are preserved, while new tier IDs derive from the name. `shipping_preset` hides for digital tiers. If a physical tier has no preset, explicit package weight/dimension fields are shown.

### Add-ons

Platform products live under `add_ons` in `_config.yml`; campaign products live
under `campaign_add_ons` in campaign front matter. They share the product
editor and variant model, but only campaign add-ons count toward campaign
progress. See [Add-on Products](ADD_ON_PRODUCTS.md) for the schema, historical
prices, inventory, accounting, and shipping boundaries.

### Support Items and Custom Support

`support_items` represent itemized campaign needs and use stable `id`, `label`,
`need`, and dollar `target` fields. Physical items also specify `category` and
the same shipping preset or explicit package fields as tiers. For example:

```yaml
support_items:
  - id: snack-run
    label: Snack Run
    need: coffee and meals
    target: 250
    late_support: true
```

Cart item IDs use `{campaignSlug}__support__{itemId}`. Custom support is
separate browser input persisted as `customAmount`; it is not a second product
catalog. After the deadline, funded campaigns expose only eligible late-support
items, with `late_support` on items/tiers and `custom_late_support` controlling
custom support. These flags do not make an unsuccessful ended campaign live.

### Production Phases

```yaml
phases:
  - name: Pre-Production
    registry:
      - id: location-scouting
        label: Location Scouting
        need: travel + permits
        target: 1000
        # current: 900  # Optional: live-stats.js fetches from KV
```

### Community Decisions (Supporter-Only)

```yaml
decisions:
  - id: poster
    type: vote              # vote | poll
    title: Official Poster
    options: [A, B]
    eligible: backers       # Submissions remain supporter-only
    status: open            # open | closed
```

`vote` and `poll` use the same supporter-only submission and tallying mechanics.
Use `vote` when the result decides an outcome and `poll` for advisory feedback
or preference-gathering. The distinction is semantic and display-facing; any
prospective divergence belongs in the [Roadmap](./ROADMAP.md).

### Production Diary

Diary entries support rich content blocks (same as `long_content`):

```yaml
diary:
  - date: 2026-01-15T09:00:00-07:00  # ISO 8601 with timezone offset
    title: "Day 14 — Principal Photography"
    phase: production  # fundraising | pre-production | production | post-production | distribution
    content:
      - type: text
        body: |
          Desert wrap. Wind, dust, and a miraculous sunset.

          **The footage looks unreal.**
      - type: image
        src: /assets/images/campaigns/my-film/bts-sunset.jpg
        alt: "Behind the scenes sunset shot"
      - type: quote
        text: "This is the one."
        author: "The Director"
```

**Date format:** Use ISO 8601 with timezone offset for proper sorting:
- Winter example: `2026-01-15T09:00:00-07:00`
- Summer example: `2025-10-15T14:00:00-06:00`

Entries without a time component (`2026-01-15`) display date only. Entries with time display "Jan 15, 2026 · 9:00 AM".

**Legacy format:** Plain `body` strings are still supported for backward compatibility:
```yaml
diary:
  - date: 2025-10-27
    title: "Quick update"
    phase: production
    body: "Simple text without rich content."
```

**Email broadcasts:** When diary entries are added and deployed, the GitHub Action triggers `/admin/diary/check` which sends update emails to all campaign supporters. The automatic check sends only entries that have not been broadcast before. Diary entries use stable `id` values for broadcast tracking; the dashboard preserves existing IDs, and the Worker derives title-based IDs for newly added entries. Legacy date markers are still recognized so edits to older entries do not resend. The email excerpt is auto-extracted from text blocks (first 200 chars, markdown stripped).

See [Email](EMAIL.md) for broadcast delivery and suppression, and
[Deployment](DEPLOYMENT.md#post-deploy-diary-check) for matching Action/Worker
credentials and edge-rule troubleshooting.

### Ongoing Funding (Post-Campaign)

```yaml
ongoing_items:
  - label: Color Grade
    remaining: 4500
  - label: Sound Mix
    remaining: 6000
```

Authoring examples use dollar amounts. Worker-persisted cent amounts and catalog
price limits follow [Payment Processor](PAYMENT_PROCESSOR.md) and
[Add-on Products](ADD_ON_PRODUCTS.md); do not apply an integer-dollar rule to
variant prices.

### Stackable vs Non-Stackable Tiers

Tiers can be marked as `stackable: false` to prevent quantity adjustments in the cart.

How it works:
1. Buy buttons carry the tier/cart metadata through `poolcart-*` hooks and item IDs like `{campaignSlug}__{tierId}`.
2. The first-party provider merges repeat adds only for stackable tiers.
3. Non-stackable enforcement happens in first-party cart state, not through hosted-cart DOM patches.

Files involved:
- `_includes/tier-card.html`
- `_includes/campaign-card.html`
- `_includes/support-items.html`
- `_includes/ongoing-funding.html`
- `_includes/production-phases.html`
