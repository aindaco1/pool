# Developer Notes

## Stack

- **GitHub Pages** — Jekyll 4.4.1 + Sass static site
- **First-party cart runtime** — Browser-owned cart, checkout review, and on-site Stripe payment flow
- **Cloudflare Worker** — Backend API, pledge storage (KV), email sending
- **Stripe** — Checkout Sessions in setup mode for the on-site payment step, plus PaymentIntents for later charging
- **Resend** — Transactional emails (supporter confirmation, milestones, failures)
- **Pages CMS** — Visual campaign editing via [app.pagescms.org](https://app.pagescms.org)

### Fork-Friendly Free-Plan Knobs

If you are trying to keep a fork comfortable on the Cloudflare Workers free plan, the safest knobs to tune first are:

- `cache.live_stats_ttl_seconds`
- `cache.live_inventory_ttl_seconds`
- `pricing.sales_tax_rate`
- `pricing.flat_shipping_rate`

The first two live in Jekyll config and shape browser read behavior. The pricing values are auto-mirrored into the Worker env so checkout, emails, reports, and settlement math stay aligned.

The config now uses a structured settings model in [`_config.yml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/_config.yml):

- `platform`
- `pricing`
- `design`
- `checkout`
- `cache`

The sync target is [`worker/wrangler.toml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/worker/wrangler.toml), and the repo’s supported dev/test entry points keep it aligned automatically.

See [CUSTOMIZATION.md](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/docs/CUSTOMIZATION.md) for the supported no-code fork surface, including which settings are site-only and which are auto-mirrored to the Worker.

Current mirrored Worker values worth treating as part of the supported customization surface:

- `PLATFORM_NAME`
- `PLATFORM_COMPANY_NAME`
- `SUPPORT_EMAIL`
- `PLEDGES_EMAIL_FROM`
- `UPDATES_EMAIL_FROM`
- `SALES_TAX_RATE`
- `FLAT_SHIPPING_RATE`
- `DEFAULT_PLATFORM_TIP_PERCENT`
- `MAX_PLATFORM_TIP_PERCENT`

The repo now includes `npm run sync:worker-config`, which syncs those mirrored values from `_config.yml` / `_config.local.yml` into `worker/wrangler.toml`. The main local dev, test, Worker-only, and pre-merge paths call it automatically.

The merge gate now deliberately splits its local smoke paths:

- `scripts/test-worker.sh` stays a lighter host-level contract smoke
- `scripts/smoke-pledge-management.sh` runs through the Podman-backed stack during merge gating so the mutable modify/cancel path uses isolated local service state

Note: first-party cart/runtime and the custom on-site checkout UI are now treated as built-in platform behavior, not fork-facing config choices. The `checkout` config namespace is now mainly for truly variable settings like the Stripe publishable key.

## Design System

Matches **dust-wave-shop** styling:
- **Colors**: Black primary (`#000000`), dark gray text (`#3a3a3a`), light blue-tinted background (`#f8faff`)
- **Fonts**: Inter (body), Gambado Sans (headings) via Google Fonts + Adobe Typekit
- **Spacing**: 8px base unit grid system
- **Breakpoints**: 724px (xsm), 1000px (sm/ms)

## Sass Structure

```
assets/
├── main.scss              # Entry point with font imports
├── partials/              # 14 active modular partials
│   ├── _variables.scss    # Colors, spacing, typography tokens
│   ├── _mixins.scss       # Breakpoints, button patterns
│   ├── _base.scss         # Reset, typography, links
│   ├── _layout.scss       # Page structure, grid, header
│   ├── _buttons.scss      # Button variants
│   ├── _forms.scss        # Form elements
│   ├── _cards.scss        # Campaign cards, tier cards
│   ├── _progress.scss     # Progress bars, stats
│   ├── _modal.scss        # Modal dialogs
│   ├── _campaign.scss     # Campaign page specifics
│   ├── _community.scss    # Community/voting pages
│   ├── _manage.scss       # Pledge management page
│   ├── _content-blocks.scss # Rich content rendering
│   ├── _utilities.scss    # Helper classes
└── js/
    ├── cart.js            # Pledge flow integration (tip UI, shipping/tax totals, checkout summary preview)
    ├── buy-buttons.js     # Button event handlers
    ├── campaign.js        # Phase tabs, toasts, interactive elements
    ├── live-stats.js      # Real-time stats, inventory, tier unlocks, late support
    └── cart-provider.js   # First-party cart/runtime provider
```

Jekyll compiles `main.scss` → `main.css` automatically.

## Jekyll Include Gotcha

**IMPORTANT**: Always use `include.` prefix when accessing parameters in includes!

❌ **Wrong**:
```liquid
{% include progress.html pledged=campaign.pledged_amount %}
<!-- In progress.html: -->
{{ pledged }}  <!-- Will be empty! -->
```

✅ **Correct**:
```liquid
{% include progress.html pledged=campaign.pledged_amount %}
<!-- In progress.html: -->
{{ include.pledged }}  <!-- Works! -->
```

This applies to ALL include parameters. Without `include.`, Jekyll can't properly resolve the variables.

## Liquid Empty Array Gotcha

**IMPORTANT**: In Jekyll, an empty YAML array `[]` is truthy! Always add a `.size > 0` check.

❌ **Wrong**:
```liquid
{% if page.support_items %}
  <!-- Renders even when support_items: [] -->
{% endif %}
```

✅ **Correct**:
```liquid
{% if page.support_items and page.support_items.size > 0 %}
  <!-- Only renders when there are actual items -->
{% endif %}
```

This applies to `support_items`, `decisions`, `stretch_goals`, `diary`, and any other array field.

## Pages CMS Configuration

The CMS is configured in `.pages.yml` at the repo root. It defines:

- **Media paths** — Where uploads go (`assets/images/campaigns/`)
- **Collections** — Content types (campaigns, pages)
- **Fields** — Form fields for each content type

### Adding a New Campaign Field

1. Edit `.pages.yml`
2. Find the `campaigns` collection
3. Add a new field to the `fields` array:

```yaml
- name: my_new_field
  label: My New Field
  type: string
  description: "Help text for editors"
```

4. Commit and push — Pages CMS will reload the config

### Field Types

| Type | Use For |
|------|---------|
| `string` | Short text |
| `number` | Integers or decimals |
| `boolean` | Toggles (true/false) |
| `date` | Date picker |
| `select` | Dropdown with options |
| `image` | Image upload |
| `rich-text` | Markdown editor |
| `object` | Nested fields |
| `object` + `list: true` | Repeatable items (tiers, diary entries) |

### Per-Field Media Paths

Override the global media path for specific fields:

```yaml
- name: hero_image
  type: image
  media:
    input: assets/images/campaigns
    output: /assets/images/campaigns
```

See [CMS.md](CMS.md) for the full editing guide.

## Campaign Content Model

Each campaign lives in `_campaigns/<slug>.md`.

### Required Fields

```yaml
layout: campaign
title: "CAMPAIGN NAME"
slug: campaign-slug
start_date: 2025-01-15   # Campaign goes live at midnight MT on this date
goal_amount: 25000
goal_deadline: 2025-12-20  # Campaign ends at 11:59 PM MT on this date
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

The `_plugins/campaign_state.rb` plugin sets state at build time. The Worker cron triggers a site rebuild when dates cross midnight MT.

**Mountain Time enforcement**: The Jekyll plugin converts UTC to Mountain Time before comparing dates, so campaigns don't end early on UTC-based CI servers. The Worker cron and GitHub Actions cron both run at 7 AM UTC (midnight MT) to trigger state transitions.

### Countdown Timer Timezone

The campaign page countdown timer uses **Mountain Time (MT)** with automatic DST detection:
- **Upcoming campaigns**: Count down to midnight MT (00:00:00) on the `start_date`
- **Live campaigns**: Count down to 11:59:59 PM MT on the `goal_deadline`

The timer uses `Intl.DateTimeFormat` with `timeZone: 'America/Denver'` and `timeZoneName: 'short'` to detect whether each date falls in MST (UTC-7) or MDT (UTC-6), then applies the correct offset. This approach works from any user timezone and automatically follows US DST rules without hardcoding transition dates.

The Worker (`worker/src/index.js` and `worker/src/campaigns.js`) uses the same `Intl`-based approach for deadline enforcement and settlement timing.

### Countdown Pre-Rendering

To avoid a flash of "00 00 00 00" before JavaScript loads:

**Campaign pages (`_layouts/campaign.html`):**
- Jekyll calculates initial countdown values at build time using Liquid filters
- Uses `date: '%s'` to get epoch timestamps, then `divided_by` and `modulo` for days/hours/mins/secs
- Values are slightly stale (off by seconds since build) but JS corrects them immediately

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

**Video requirements:** WebM, 16:9, max 1920x1080

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

**Physical tiers**: Set `category: physical` to trigger shipping address collection during the on-site Stripe payment step and add a $3 shipping fee for each campaign that contains physical rewards. The first-party cart carries that category through the checkout-intent payload.

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
    eligible: backers       # backers | public
    status: open            # open | closed
```

### Production Diary

Diary entries support rich content blocks (same as `long_content`):

```yaml
diary:
  - date: 2026-01-15T09:00:00-07:00  # ISO 8601 with timezone (MT)
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
- MST (winter): `2026-01-15T09:00:00-07:00`
- MDT (summer): `2025-10-15T14:00:00-06:00`

Entries without a time component (`2026-01-15`) display date only. Entries with time display "Jan 15, 2026 · 9:00 AM".

**Legacy format:** Plain `body` strings are still supported for backward compatibility:
```yaml
diary:
  - date: 2025-10-27
    title: "Quick update"
    phase: production
    body: "Simple text without rich content."
```

**Email broadcasts:** When diary entries are added and deployed, the GitHub Action triggers `/admin/diary/check` which sends update emails to all campaign supporters. The email excerpt is auto-extracted from text blocks (first 200 chars, markdown stripped).

**Required setup:** Add `ADMIN_SECRET` as a GitHub repository secret (Settings → Secrets → Actions). This must match the Worker's `ADMIN_SECRET`. Without it, diary email broadcasts will silently fail.

### Ongoing Funding (Post-Campaign)

```yaml
ongoing_items:
  - label: Color Grade
    remaining: 4500
  - label: Sound Mix
    remaining: 6000
```

All money values must be integers (no cents).

## First-Party Cart Integration

### Cart Runtime

The site now uses a first-party cart runtime exposed through `window.PoolCartProvider`. Shared UI code talks to that provider instead of depending on a separate hosted-cart helper.

Key files:
- `assets/js/cart-provider.js` — browser-owned cart state, drawer rendering, checkout preview, success/cancel recovery
- `assets/js/cart.js` — shared pledge flow bootstrapping and page-level cart behaviors
- `_includes/cart-runtime-head.html` / `_includes/cart-runtime-foot.html` — first-party runtime boot

### Stackable vs Non-Stackable Tiers

Tiers can be marked as `stackable: false` to prevent quantity adjustments in the cart.

How it works now:
1. Buy buttons carry the tier/cart metadata through `poolcart-*` hooks and item IDs like `{campaignSlug}__{tierId}`.
2. The first-party provider merges repeat adds only for stackable tiers.
3. Non-stackable enforcement happens in first-party cart state, not through hosted-cart DOM patches.

Files involved:
- `_includes/tier-card.html`
- `_includes/campaign-card.html`
- `_includes/support-items.html`
- `_includes/ongoing-funding.html`
- `_includes/production-phases.html`

## Pledge Flow

The pledge flow is now first-party end to end until Stripe:

1. **User adds tier to cart** → first-party cart drawer opens
2. **User reviews pledge** → drawer shows tiers, support items, custom support, tip, and immediate pricing
3. **User clicks "Checkout"** → `cart-provider.js` posts canonical cart items to Worker `/checkout-intent/start`
4. **Worker creates a Stripe setup session** → the second checkout sidecar mounts secure Stripe payment UI on-site and saves the card without charging
5. **User completes the on-site payment step** → the client waits for persisted backend confirmation before treating the pledge as successful
6. **Stripe webhook fires** → Worker stores one pledge per campaign in KV, updates stats, sends supporter email(s)

Key points:
- hosted-cart orders are not part of the runtime anymore
- order IDs are Worker-issued `pool-intent-*` values tied to the checkout nonce
- Stripe collects real payment and shipping details
- tax is calculated server-side from the configured `pricing.sales_tax_rate` in `_config.yml` and mirrored Worker env
- optional The Pool tip defaults to 5%, can be set from 0% to 15%, and is included in final charge totals but excluded from campaign funding progress
- checkout preview totals are rendered immediately from shared pricing logic

### Support Items & Custom Amounts

The cart can include:
- **Tiers** — `{campaignSlug}__{tierId}`
- **Support items** — `{campaignSlug}__support__{itemId}`
- **Custom amount** — browser-owned custom support state that becomes `customAmount`

Data flow:
1. `cart-provider.js` builds the first-party cart payload and POSTs it to `/checkout-intent/start`
2. Worker canonicalizes the contribution and stores overflow metadata in temp KV (`pending-extras:{orderId}`, `pending-tiers:{orderId}`)
3. Worker stores `tipPercent` and integrity metadata in Stripe session metadata
4. On webhook, Worker fetches extras from temp KV and merges them into the final pledge
5. Worker calls `updateSupportItemStats()` to update live stats for support items

Manage page display:
- During **live** campaigns: all support items are shown for modification
- During **post** campaigns: only items with `late_support: true` are shown (and only if funded)
- Pledge summary shows subtotal, optional The Pool tip, tax, shipping, and total
- Modifying tiers dynamically recalculates shipping based on tier `category`
- Active pledges are grouped separately from Closed pledges; deadline-passed active pledges render as locked and become read-only except for "Update Card"

## Local Development

### Prerequisites

Required accounts:
- [Stripe](https://dashboard.stripe.com) — payment processing (test mode)
- [Cloudflare](https://dash.cloudflare.com) — Worker + KV storage
- [Resend](https://resend.com) — transactional email (free tier goes a long way)

Required tools:
```bash
ruby --version   # 3.x recommended
node --version   # 20.x recommended
npm install -g wrangler
wrangler login
brew install stripe/stripe-cli/stripe
stripe login
```

### 1. Install Dependencies

```bash
bundle install
npm install
```

### 2. Configure Worker Secrets

Create `worker/.dev.vars` for local development:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY_TEST=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
CHECKOUT_INTENT_SECRET=random-32-char-string-for-hmac
MAGIC_LINK_SECRET=random-32-char-string-for-hmac
RESEND_API_KEY=re_...
ADMIN_SECRET=local-admin-secret
```

Generate secrets:
```bash
openssl rand -base64 32
```

### 3. Set Up KV Namespaces

If you haven't created KV namespaces yet:

```bash
cd worker
wrangler kv:namespace create "VOTES"
wrangler kv:namespace create "VOTES" --preview
wrangler kv:namespace create "PLEDGES"
wrangler kv:namespace create "PLEDGES" --preview
```

Update `worker/wrangler.toml` with the returned IDs.

### 5. Start Development

**Option A: Podman-first local stack (recommended)**

```bash
npm run podman:doctor
./scripts/dev.sh --podman
```

This starts:
- **Jekyll** at http://127.0.0.1:4000 (with `_config.local.yml` overrides)
- **Worker** at http://127.0.0.1:8787
- **Stripe CLI** forwarding webhooks to the local Worker when available
- local containerized dependencies for the supported Podman dev/test path

The script auto-updates `worker/.dev.vars` with the Stripe CLI webhook secret when Stripe CLI is available.
It uses the same Stripe listener instance for both forwarding and secret capture, which avoids the local webhook mismatch that can happen if you start one listener to print a secret and another to forward events.
It also clears stale listeners on the standard local ports before starting, so the local stack matches the automated smoke/test harness.

> **Note:** Local KV simulation is used by default for fast iteration and compatibility with `scripts/seed-all-campaigns.sh`. KV data resets when the worker restarts. Use `--remote` if you need persistent data or to see real pledges.

**Option B: Host tools only (manual start)**

```bash
# Terminal 1: Jekyll
bundle exec jekyll serve --config _config.yml,_config.local.yml --port 4000

# Terminal 2: Worker (local KV simulation)
cd worker && npx wrangler dev --env dev --port 8787

# Terminal 3: Stripe webhooks
stripe listen --forward-to 127.0.0.1:8787/webhooks/stripe
```

**Troubleshooting: Missing Pledges**

If a Stripe checkout completes but the pledge doesn't appear:
1. Check Stripe CLI output — did it forward the webhook?
2. Use the recovery endpoint to manually create the pledge:
   ```bash
   curl -X POST http://127.0.0.1:8787/admin/recover-checkout \
     -H 'Authorization: Bearer YOUR_ADMIN_SECRET' \
     -H 'Content-Type: application/json' \
     -d '{"sessionId": "cs_test_..."}'
   ```

**Useful local checks after startup**

```bash
npm run test:secrets
./scripts/test-worker.sh --podman
./scripts/smoke-pledge-management.sh --podman
./scripts/test-e2e.sh --podman
```

**Troubleshooting: Stripe Webhook Errors (Mode Mismatch)**

If Stripe shows webhook failures ("other errors") for the production endpoint:
- The production Worker receives **test mode** webhooks but can't verify them (different signing secrets)
- The Worker now performs **early mode detection** — it parses the event's `livemode` field before signature verification
- Test events sent to a live Worker (or vice versa) are acknowledged with `200 OK` and skipped, preventing signature errors
- No configuration needed; this is handled automatically

### 6. Test the Pledge Flow

1. Visit http://127.0.0.1:4000
2. Click a campaign → Add a tier to cart
3. Review the first-party checkout preview → Click "Checkout"
4. Complete the on-site Stripe payment step with test card: `4242 4242 4242 4242`
5. Check Worker logs for pledge confirmation
6. Check email (if Resend configured)

### Stripe Test Cards

| Card | Scenario |
|------|----------|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 3220` | 3D Secure required |
| `4000 0000 0000 9995` | Declined (insufficient funds) |

### Clear Cache

If styles don't update:
```bash
bundle exec jekyll clean
```

## Test Data Seeding

Seed test pledges into local KV for testing:

```bash
./scripts/seed-all-campaigns.sh
```

**What it does:**
1. Clears existing pledge data from local KV before seeding
2. Seeds pledges for all campaigns with realistic scenarios:
   - **beneath-static**: Past deadline, not funded (~$4,600 / $8,000)
   - **common-ground**: Past deadline, exceeded goal (~$15,150 / $12,000, all charged)
   - **hand-relations**: Live, partial funding (~$8,200 / $25,000)
   - **night-work**: Upcoming, no pledges
   - **worst-movie-ever**: Live, partial funding (~$1,290 / $2,500)
3. Includes diverse pledge states:
   - Active pledges
   - Charged pledges (for funded campaigns)
   - Cancelled pledges (with proper cancellation history and negative deltas)
   - Payment failed pledges
   - Modified pledges (upgrades/downgrades with history tracking deltas)
4. Recalculates campaign stats and tier inventory via the Worker API

**Requirements:**
- Worker must be running locally (`wrangler dev --env dev` on port 8787)
- `worker/.dev.vars` must have `ADMIN_SECRET` set
- Local KV resets when worker restarts, so re-run this script after restart

**Pledge history format:**
Pledges include a `history` array tracking all changes:

```json
{
  "history": [
    { "type": "created", "subtotal": 10000, "tax": 788, "amount": 10788, "tierId": "prop", "tierQty": 1, "customAmount": 5, "at": "..." },
    { "type": "modified", "subtotalDelta": -5000, "taxDelta": -394, "amountDelta": -5394, "tierId": "dialogue", "tierQty": 1, "customAmount": 10, "at": "..." }
  ]
}
```

History entry fields:
- `type` — Event type: `created`, `modified`, or `cancelled`
- `subtotal` / `subtotalDelta` — Pre-tax amount (full for created, delta for modified/cancelled)
- `tax` / `taxDelta` — Tax amount (full or delta)
- `amount` / `amountDelta` — Total with tax (full or delta)
- `tierId` — Current tier ID after this event
- `tierQty` — Current tier quantity after this event
- `additionalTiers` — Array of additional tiers (multi-tier mode)
- `customAmount` — Custom support amount in dollars (if present)
- `at` — ISO timestamp

History types:
- `created` — Initial pledge with full amounts
- `modified` — Tier/amount changes with delta values (positive for upgrades, negative for downgrades)
- `cancelled` — Cancellation with negative amounts (subtracts from campaign total)

## Pledge Reports

Generate CSV reports of pledges from Cloudflare KV:

```bash
# All pledges, production KV
./scripts/pledge-report.sh

# Single campaign
./scripts/pledge-report.sh worst-movie-ever

# Dev/preview KV
./scripts/pledge-report.sh --env dev

# Save to file
./scripts/pledge-report.sh worst-movie-ever > pledges.csv
```

**Output format:** One row per history entry (ledger-style). This means:
- New pledges: 1 row (created)
- Modified pledges: 2+ rows (created + modification deltas)
- Cancelled pledges: 2 rows (created + cancellation with negative amounts)

**Output columns:** email, campaign, items, subtotal, tip_percent, tip, tax, shipping, total, status, charged, created_at, order_id

**Status values:**
- `created` — Initial pledge creation (items show full tier list)
- `modified` — Pledge tier/amount change (items show diff: `+Added Tier`, `-Removed Tier`)
- `cancelled` — Pledge cancelled (shows negative amounts)
- `active` — Legacy pledge without history
- `charged` — Legacy charged pledge without history
- `failed` — Legacy failed pledge without history

**Modified row items format:**
```
(modified) +Line of Dialogue; -Writer Credit x2; +Custom Support $5.00
```
- `+Tier` or `+Tier xN` — Tier was added (or quantity increased)
- `-Tier` or `-Tier xN` — Tier was removed (or quantity decreased)
- `+Custom Support $X` or `-Custom Support $X` — Custom support was added/removed
- `; tip updated to N%` — Tip changed during the same modification, even if other pledge fields changed too
- Unchanged tiers don't appear in the diff

**Custom Support in items:**
When a pledge includes custom support, it appears as `Custom Support $X.XX` in the items column (e.g., `Line of Dialogue; Custom Support $25.00`).

**Cancelled row format:**
Cancelled rows show negative amounts (subtotal, tip, tax, shipping, total) so that summing all rows gives the correct campaign total. Items are prefixed with `-` to indicate removal.

**Tier name mapping:**
The report converts tier IDs to human-readable names (e.g., `frame` → `One Frame`, `dialogue` → `Line of Dialogue`).

**Summing subtotals** gives you the campaign-progress amount (modifications and cancellations are reflected as deltas). **Summing totals** gives the tip-inclusive amount that will actually be charged.

## Fulfillment Reports

Generate aggregated reports showing the **current state** of each backer's pledge (for fulfillment purposes):

```bash
# All pledges, production KV
./scripts/fulfillment-report.sh

# Single campaign
./scripts/fulfillment-report.sh worst-movie-ever

# Dev/preview KV
./scripts/fulfillment-report.sh --env dev

# Save to file
./scripts/fulfillment-report.sh worst-movie-ever > fulfillment.csv
```

**Output format:** One row per unique email + campaign combination. Multiple pledges from the same backer are aggregated.

**Output columns:** email, campaign, items, subtotal, tip_percent, tip, tax, shipping, total, shipping_address

**Key differences from pledge-report.sh:**
- Shows **current tier state** (not history)
- **Aggregates** multiple pledges per backer into one row
- **Excludes** cancelled pledges
- **Excludes** custom support (only shows deliverable items)
- **No** status, created_at, or order_id columns
- Items show final quantities (e.g., if backer modified from frame→dialogue, only dialogue appears)
- Includes `shipping_address` for physical tier fulfillment
- `total` is the final charge amount including optional The Pool tip

**Use cases:**
- Fulfillment spreadsheets (what rewards to deliver to each backer)
- Backer counts by tier
- Deliverable tracking

## Legacy Browser Path

The branch no longer ships the old hosted-cart helper assets as separate browser files. The browser path now boots only the first-party cart runtime.

**Limitations:**
- Credit card fields (number, expiry, CVV) are in Stripe's iframe — not accessible for security reasons

## Worker Architecture

The Cloudflare Worker (`worker/src/`) is the backend for The Pool:

```
worker/src/
├── index.js              # Route handlers (main entry point)
├── campaigns.js          # Fetch/validate campaigns from Jekyll API
├── checkout-intent.js    # Checkout snapshot hashing/signing helpers
├── checkout-intent-do.js # Durable Object nonce coordinator
├── tier-inventory-do.js  # Durable Object coordinator for scarce tier claims
├── email.js              # Resend email templates
├── github.js             # Trigger GitHub Pages rebuilds
├── provider-config.js    # Runtime/provider flags
├── stats.js              # KV-based stats + inventory cache, milestones
├── stripe.js             # Stripe API client + webhook signature verification
├── token.js              # HMAC magic link token generation/verification
└── routes/
    └── votes.js          # Community voting endpoints
```

### Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /checkout-intent/start` | Create the Stripe setup session used by the on-site payment step |
| `POST /webhooks/stripe` | Handle Stripe events, store pledge, send emails |
| `GET /pledge?token=...` | Get pledge details for manage page |
| `POST /pledge/cancel` | Cancel an active pledge |
| `POST /pledge/modify` | Change tier/amount |
| `GET /stats/:slug` | Live pledge totals for a campaign |
| `POST /admin/settle/:slug` | Manually charge all funded pledges |

### Cron Trigger (Auto-Settle)

The Worker has a scheduled trigger that runs daily at **7:00 AM UTC** (midnight Mountain Standard Time):

```toml
# wrangler.toml
[triggers]
crons = ["0 7 * * *"]
```

**What it does:**
1. Lists all campaigns with a `goal_deadline` and `goal_amount`
2. For each campaign where the deadline has passed (in MT) and the goal is met:
   - Checks if there are any uncharged active pledges
   - If so, runs the same settle logic as `/admin/settle/:slug`
3. Aggregates pledges by email within each campaign so each supporter gets ONE charge per campaign
4. Sends charge-success / payment-failed emails as appropriate

**Timezone note:** During daylight saving time (MDT), the cron runs at 1:00 AM MT instead of midnight.

### Token Module

```js
import { generateToken, verifyToken } from './token.js';

const token = await generateToken(env.MAGIC_LINK_SECRET, {
  orderId: 'pledge-123',
  email: 'backer@example.com',
  campaignSlug: 'hand-relations'
}, 90); // 90 days expiry

const payload = await verifyToken(env.MAGIC_LINK_SECRET, token);
// null if invalid/expired
```

## Security

Secrets live in Cloudflare Worker environment variables. Never commit:

| Secret | Purpose |
|--------|---------|
| `STRIPE_SECRET_KEY` | Stripe API (or `_TEST`/`_LIVE` variants) |
| `STRIPE_WEBHOOK_SECRET` | Verify Stripe webhook signatures |
| `CHECKOUT_INTENT_SECRET` | Sign first-party checkout snapshots |
| `MAGIC_LINK_SECRET` | HMAC signing for pledge management tokens |
| `RESEND_API_KEY` | Send supporter/milestone/failed emails |
| `ADMIN_SECRET` | Protect admin endpoints (settle, rebuild, etc.) |

## Email Best Practices

### Image Hosting

**Always host email images on your own domain** (e.g., `pool.dustwave.xyz/assets/images/`). Third-party CDNs trigger Gmail spam filters and cause images to be blocked with "images below are from unknown senders" warnings.

The Instagram CTA icon is hosted at `/assets/images/instagram-white.png`.
In local dev, email templates still resolve embedded image assets against the public `https://pool.dustwave.xyz` base instead of `127.0.0.1`, so inbox previews do not break on localhost-only URLs.

### Inline SVG

Gmail does not render inline SVG in emails. Use PNG/JPEG images instead.

## Mobile UI Patterns

### Hamburger Menu vs Cart Overlay

The mobile hamburger menu toggle needs careful z-index handling to avoid overlapping with the cart drawer/modal.

**Pattern**: Only apply elevated z-index when the menu is actually open:

```scss
// In _layout.scss
&__menu-toggle {
  @include xsm {
    position: relative;
    // No z-index here — cart overlay covers it naturally
  }
}

// Only elevate when menu is open
&__menu-toggle.is-open {
  z-index: 101; // Above nav overlay (z-index: 100)
}
```

**Why this works:**
- When menu is closed: No z-index, so the cart overlay covers the button
- When menu is open: z-index: 101 puts the button above the nav overlay for the X icon

**Files involved:**
- `assets/partials/_layout.scss` — Hamburger button styling
- `_includes/header.html` — Toggle script adds `.is-open` class

---

## FAQ

**Why do we need a Worker if the site is static?**  
Stripe SetupIntents + webhooks require server-side secrets and an HTTPS endpoint. The Worker also stores pledge data in Cloudflare KV and sends emails via Resend.

**Can we skip the Worker?**  
No. The Worker handles Stripe checkout sessions, webhook processing, pledge storage (KV), live stats, tier inventory, milestone emails, and campaign settlement. It's the core backend.

**Where is pledge data stored?**  
Cloudflare KV. Key patterns:
- `pledge:{orderId}` — Full pledge data (email, amount, tier, Stripe IDs, status)
- `email:{email}` — Array of order IDs for that email
- `stats:{campaignSlug}` — Aggregated totals (pledgedAmount, pledgeCount, tierCounts)
- `tier-inventory:{campaignSlug}` — Tier claim counts for limited tiers

**What role does the browser cart play?**  
The first-party cart provides pledge review and checkout handoff state in the browser. Final pledge data is stored in KV after Stripe webhook confirmation.

**Does this store PII?**  
Email addresses are stored in KV for pledge management. Stripe stores card data; we store Stripe customer/payment method IDs.

**How do stretch goals unlock tiers?**  
Use `requires_threshold` on the tier; the template hides it until `pledged_amount >= threshold`.

**What about long campaign durations?**  
Stripe SetupIntents (saved payment methods) don't expire like 7-day card holds, which is why we use them.

**How are campaigns charged when funded?**  
The Worker automatically settles campaigns via a daily cron trigger (runs at midnight MT). When a campaign's deadline passes and it has met its goal, the Worker:
1. Aggregates all active pledges **by email within a campaign** (one charge per supporter per campaign, not per pledge row)
2. Uses the most recently updated payment method for each supporter
3. Creates one Stripe PaymentIntent per supporter for their campaign total amount
4. Sends one charge email per supporter for that campaign
5. Marks all underlying pledges as `charged`

Cancelled pledges are never charged. You can also manually trigger settlement via `POST /admin/settle/:slug`.

**What timezone are deadlines in?**  
All deadlines use **Mountain Time (MST/MDT)**. A campaign with `goal_deadline: 2025-12-20` ends at 11:59:59 PM MST on that date. The cron trigger runs at 7:00 AM UTC (midnight MST). The countdown timer on campaign pages automatically detects DST and uses -06:00 (MDT) during summer months and -07:00 (MST) the rest of the year.

---

## Accessibility (a11y)

The site includes accessibility infrastructure for WCAG 2.1 AA compliance.

### Utilities

**Screen reader only text:**
```html
<span class="sr-only">Opens in new tab</span>
```

**Skip link** (automatic in `default.html`):
```html
<a href="#main-content" class="skip-link">Skip to main content</a>
```

**Accessible loading indicator:**
```html
<div class="loading" role="status" aria-live="polite">
  <span class="sr-only">Loading...</span>
  <span class="loading__spinner" aria-hidden="true"></span>
</div>
```

### ARIA Landmarks

The default layout includes proper landmarks:
- `<header role="banner">` - Site header
- `<main role="main" id="main-content">` - Main content
- `<nav role="navigation" aria-label="...">` - Navigation
- `<footer role="contentinfo">` - Site footer
- `<div aria-live="polite">` - Live region for announcements

### Focus States

All interactive elements have visible `:focus-visible` states:
- Links: 2px outline with offset
- Buttons: 3px outline with subtle shadow
- Form inputs: Border color change

### Best Practices

**Buttons:**
```html
<button type="button" aria-label="Close menu" aria-expanded="false">
  <svg aria-hidden="true">...</svg>
</button>
```

**Form inputs:**
```html
<label for="amount" class="sr-only">Amount in dollars</label>
<input id="amount" type="number" aria-describedby="amount-help">
<p id="amount-help">Enter any amount from $1 to $10,000</p>
```

**Images:**
```html
<!-- Decorative (hidden from screen readers) -->
<img src="logo.png" alt="" aria-hidden="true">

<!-- Informative -->
<img src="chart.png" alt="Funding progress: 75% of $25,000 goal">
```

**Icons:**
```html
<!-- Icon-only button -->
<button aria-label="Add to cart">
  <svg aria-hidden="true" focusable="false">...</svg>
</button>

<!-- Icon with visible text (icon is decorative) -->
<button>
  <svg aria-hidden="true">...</svg>
  Add to cart
</button>
```

### Motion & Contrast

- `prefers-reduced-motion` is respected (animations disabled)
- `forced-colors` mode (high contrast) is supported
- Disabled states have 0.6 opacity (sufficient contrast)

### Include Helper

Use `_includes/a11y.html` for common patterns:

```liquid
{% include a11y.html type="sr-text" text="Opens in new tab" %}
{% include a11y.html type="external-link" href="https://..." text="Documentation" %}
```

---

## Internationalization (i18n)

The site has i18n scaffolding for future multi-language support.

### Structure

```
_data/
└── i18n/
    └── en.yml     # English translations (default)
```

### Usage

Use the `t.html` include to look up translations:

```liquid
{% include t.html key="buttons.pledge" %}
{% include t.html key="states.opens" date="Jan 15" %}
{% include t.html key="progress.of_goal" goal="$25,000" %}
```

The helper supports interpolation with `%{variable}` placeholders:

```yaml
# In _data/i18n/en.yml
states:
  opens: "Opens %{date}"
```

### Adding a Language

1. Copy `_data/i18n/en.yml` to `_data/i18n/{lang}.yml`
2. Translate all values
3. Set `lang: {lang}` in `_config.yml` (or create a multi-language structure)

### Translation Categories

- `nav` - Navigation labels
- `buttons` - Button text (pledge, cancel, vote, etc.)
- `states` - Campaign states (live, ended, upcoming)
- `progress` - Funding progress labels
- `pledge` - Pledge flow copy
- `manage` - Manage pledge page
- `status` - Status labels
- `community` - Voting/community page
- `tiers` - Tier-related labels
- `dates` - Date formats
- `misc` - Common words

---

## Testing

The project uses a two-tier testing approach:

### Unit Tests (Vitest)

Fast, isolated tests for JS functions. Located in `tests/unit/`.

```bash
npm run test:unit          # Run once
npm run test:unit:watch    # Watch mode
npm run test:unit:coverage # With coverage report
```

**Test coverage includes:**
- `formatMoney()` - Currency formatting with k suffix
- `updateProgressBar()` - Progress bar width and text updates
- `updateMarkerState()` - Milestone/goal marker CSS classes
- `checkTierUnlocks()` - Gated tier unlocking when thresholds met
- `checkLateSupport()` - Late support enabling post-funding
- `updateSupportItems()` - Support item progress and "Funded" states
- `updateTierInventory()` - Inventory display and "Sold Out" states
- API fetch mocking - Stats and inventory endpoint handling

### E2E Tests (Playwright)

Browser-based tests for full user flows. Located in `tests/e2e/`.

```bash
npm run test:e2e           # Full suite (starts Jekyll server)
npm run test:e2e:quick     # Headed mode (requires running server)
npm run test:e2e:headless  # CI mode
npm run test:e2e:ui        # Interactive UI mode
```

**Test coverage includes:**
- Campaign navigation and tier buttons
- Custom amount input → first-party cart price sync
- Support item input → first-party cart price sync
- Disabled states on non-live campaigns
- first-party cart/runtime integration

### Running All Tests

```bash
npm test  # Runs unit tests, then E2E tests
```

### Adding Tests

**Unit tests:** Add to `tests/unit/` with `.test.ts` extension. Tests should be fast (no network, no real DOM).

**E2E tests:** Add to `tests/e2e/` with `.spec.ts` extension. Use Playwright's `expect()` for assertions.

---

## Clearing KV Data (Debugging)

When debugging pledge flows, you may need to clear Worker KV data.

### Local KV (wrangler dev)

```bash
# Nuclear option - delete all local KV state
rm -rf worker/.wrangler/state/

# Or list/delete specific keys
cd worker
npx wrangler kv key list --binding PLEDGES --local
npx wrangler kv key delete --binding PLEDGES --local "pledge:example-key"
```

### Preview KV (remote dev namespace)

```bash
cd worker

# List all keys
npx wrangler kv key list --binding PLEDGES --preview

# Delete all preview pledges
npx wrangler kv key list --binding PLEDGES --preview | jq -r '.[].name' | while read key; do
  yes | npx wrangler kv key delete --binding PLEDGES --preview "$key"
done
```

### KV Bindings

| Binding | Purpose |
|---------|---------|
| `PLEDGES` | Pledge records, stats, email mappings |
| `VOTES` | Community voting data (keyed by email to prevent multi-pledge vote abuse) |
| `RATELIMIT` | Rate limiting counters |

**Vote KV Keys:**
- `vote:{campaignSlug}:{decisionId}:{email}` — User's vote choice
- `results:{campaignSlug}:{decisionId}` — Aggregate vote tallies

## Settlement Architecture

The settlement flow uses **self-chaining batched invocations** to stay within Cloudflare Worker's 50 subrequest limit:

1. **Cron** (`scheduled()`) runs daily at midnight MT, dispatches to `/admin/settle-dispatch/:slug`
2. **Dispatch** reads campaign pledge index, processes 6 pledges per batch via `/admin/settle-batch`
3. **Each batch** is a separate Worker invocation with its own subrequest budget
4. **Self-chains** until all pledges are processed, then sets `campaign-charged:{slug}` marker

**KV keys used by settlement:**

| Key | Purpose |
|-----|---------|
| `campaign-pledges:{slug}` | Per-campaign array of order IDs (maintained on create/cancel) |
| `settlement-job:{slug}` | Batch progress tracking (cursor, totals) |
| `campaign-charged:{slug}` | Settlement completion marker (prevents re-settle) |
| `cron:lastRun` | Heartbeat — last cron execution timestamp |
| `cron:lastError` | Last cron error details (7-day TTL) |

**Admin endpoints for settlement:**

| Endpoint | Purpose |
|----------|---------|
| `POST /admin/settle-dispatch/:slug` | Start/resume batched settlement |
| `POST /admin/settle-batch` | Charge specific pledges (max 6 per call) |
| `POST /admin/settle/:slug` | Legacy monolithic settle (may hit subrequest limits) |
| `POST /admin/campaign-index/rebuild/:slug` | Rebuild campaign pledge index from KV |
| `POST /admin/backfill-customers/:slug` | Create Stripe customers for pledges missing them |
| `GET /admin/cron/status` | Check cron heartbeat |

**Checking cron health:**
```bash
curl -s https://pledge.dustwave.xyz/admin/cron/status \
  -H 'Authorization: Bearer YOUR_ADMIN_SECRET'
```

---

_Last updated: Apr 9, 2026_
