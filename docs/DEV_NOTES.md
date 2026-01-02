# Developer Notes

## Stack

- **GitHub Pages** — Jekyll 4.4.1 + Sass static site
- **Snipcart v3** — Cart UI only (no payment processing)
- **Cloudflare Worker** — Backend API, pledge storage (KV), email sending
- **Stripe** — SetupIntents (save card), PaymentIntents (charge later)
- **Resend** — Transactional emails (supporter confirmation, milestones, failures)

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
├── partials/              # 15 modular partials
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
│   └── _snipcart-overrides.scss  # Cart customization
└── js/
    ├── cart.js            # Pledge flow integration
    ├── checkout-autofill.js  # Country/state autofill for password managers
    ├── buy-buttons.js     # Button event handlers
    ├── campaign.js        # Phase tabs, toasts, interactive elements
    └── snipcart-debug.js  # Debug utilities
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

### Countdown Timer Timezone

The campaign page countdown timer uses **Mountain Time (MT)** with automatic DST detection:
- **Upcoming campaigns**: Count down to midnight MT (00:00:00) on the `start_date`
- **Live campaigns**: Count down to 11:59:59 PM MT on the `goal_deadline`

The timer automatically uses:
- **MST (UTC-7)**: November → March
- **MDT (UTC-6)**: March → November

DST transitions are calculated based on US rules (2nd Sunday in March, 1st Sunday in November).

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
    fields:
      - { name: "Preferred frame number", type: "text", required: true }

  - id: creature-cameo
    name: Creature Cameo
    price: 250
    description: Name the practical creature.
    requires_threshold: 35000  # Unlocks when pledged >= $35,000
```

**Tier gating**: Add `requires_threshold` (integer, dollars) to lock a tier until the campaign reaches that funding level. When live stats update and `pledgedAmount >= requires_threshold`, the tier animates to "Unlocked!" state with a badge. The animation respects `prefers-reduced-motion`.

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

```yaml
diary_entries:
  - title: "Day 14 — Principal Photography"
    body: "Desert wrap. Wind, dust, and a miraculous sunset."
    date: 2025-10-27
```

### Ongoing Funding (Post-Campaign)

```yaml
ongoing_items:
  - label: Color Grade
    remaining: 4500
  - label: Sound Mix
    remaining: 6000
```

All money values must be integers (no cents).

## Snipcart Integration

### Stackable vs Non-Stackable Tiers

Tiers can be marked as `stackable: false` to prevent quantity adjustments in the cart (e.g., one-time credits, unique rewards).

**How it works:**

1. **Frontend data attribute**: All buy buttons include a hidden `_stackable` custom field:
   ```html
   data-item-custom1-name="_stackable"
   data-item-custom1-type="hidden"
   data-item-custom1-value="{{ tier.stackable | default: true }}"
   ```

2. **JavaScript detection** (`snipcart-foot.html`): On cart changes, reads `_stackable` from item custom fields and sets `data-stackable="false"` on the `.snipcart-item-line` element.

3. **CSS override** (`_snipcart-overrides.scss`): Hides quantity controls for non-stackable items:
   ```scss
   .snipcart-item-line[data-stackable="false"] {
     .snipcart-item-quantity__label,
     .snipcart-item-quantity__quantity {
       display: none !important;
     }
   }
   ```

**Files involved:**
- `_includes/tier-card.html` — Tier buy buttons
- `_includes/campaign-card.html` — Featured tier on home page
- `_includes/support-items.html`, `_includes/ongoing-funding.html`, `_includes/production-phases.html` — Other buy buttons
- `_includes/snipcart-foot.html` — JS to mark items
- `assets/partials/_snipcart-overrides.scss` — CSS to hide controls

Include in layout:

```html
<div hidden id="snipcart" data-api-key="YOUR_PUBLIC_KEY">
  <payment section="top">
    <div>
      <snipcart-checkbox name="agree-terms" required></snipcart-checkbox>
      <snipcart-label for="agree-terms">
        I agree to <a href="/terms/">Terms</a>
      </snipcart-label>
    </div>
  </payment>
</div>
<script async src="https://cdn.snipcart.com/themes/v3.6.0/default/snipcart.js"></script>
```

## Pledge Flow

The pledge flow bypasses Snipcart's payment processing entirely:

1. **User adds tier to cart** → Snipcart handles cart UI
2. **User fills billing info** → Snipcart collects name, email, address
3. **User clicks "Continue to payment"** → Custom JS intercepts (see `assets/js/cart.js`)
4. **JS calls Worker `/start`** → Sends cart data, billing info, generates temp order ID
5. **Worker creates Stripe Checkout (setup mode)** → Saves card without charging
6. **User completes Stripe Checkout** → Redirected to `/pledge-success/`
7. **Stripe webhook fires** → Worker stores pledge in KV, updates stats, sends email

Key points:
- Snipcart orders are never created (cart is cleared after redirect)
- Order IDs are generated client-side: `pledge-{timestamp}-{random}`
- Billing info from Snipcart is passed to Stripe to pre-fill checkout
- Tax is calculated server-side (ABQ rate: 7.875%)

### Support Items & Custom Amounts

The cart can include:
- **Tiers** — Main pledge items with `{campaignSlug}__{tierId}` IDs
- **Support items** — Production phase contributions with `{campaignSlug}__support__{itemId}` IDs
- **Custom amount** — "No reward" pledge with `{campaignSlug}__custom` ID

**Data flow:**
1. `cart.js` extracts these from Snipcart cart items and sends to `/start`
2. Worker stores `supportItems` and `customAmount` in temp KV (`pending-extras:{orderId}`)
3. Worker sets `hasExtras: true` in Stripe Checkout metadata
4. On webhook, Worker fetches extras from temp KV and merges into final pledge
5. Worker calls `updateSupportItemStats()` to update live stats for support items

**Manage page display:**
- During **live** campaigns: ALL support items are shown for modification
- During **post** campaigns: Only items with `late_support: true` are shown (and only if funded)

## Local Development

### Prerequisites

**Required accounts:**
- [Stripe](https://dashboard.stripe.com) — For payment processing (use test mode)
- [Snipcart](https://app.snipcart.com) — For cart UI (use test mode)
- [Cloudflare](https://dash.cloudflare.com) — For Worker + KV storage
- [Resend](https://resend.com) — For transactional emails (free tier: 3k/month)

**Required tools:**
```bash
# Ruby + Bundler (for Jekyll)
ruby --version  # 3.x recommended

# Node.js (for Wrangler + Playwright tests)
node --version  # 20.x recommended

# Wrangler CLI (Cloudflare Workers)
npm install -g wrangler
wrangler login

# Stripe CLI (webhook testing)
brew install stripe/stripe-cli/stripe
stripe login

# Optional: ngrok (for Snipcart product crawling)
brew install ngrok
```

### 1. Install Dependencies

```bash
# Jekyll dependencies
bundle install

# Node dependencies (for Playwright tests)
npm install
```

### 2. Configure Snipcart

1. Go to [Snipcart Dashboard](https://app.snipcart.com) → **Account** → **API Keys**
2. Copy your **Public Test API Key**
3. Go to **Domains & URLs** → Add allowed domains:
   - `127.0.0.1:4000` (local dev)
   - Your ngrok URL (if using)
   - `pool.dustwave.xyz` (production)

Update `_config.local.yml` with your test key:
```yaml
snipcart_test_key: "YOUR_PUBLIC_TEST_API_KEY"
```

### 3. Configure Worker Secrets

Create `worker/.dev.vars` for local development:

```bash
# worker/.dev.vars (gitignored)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...  # From Stripe CLI
SNIPCART_SECRET=your_snipcart_secret_api_key
MAGIC_LINK_SECRET=random-32-char-string-for-hmac
RESEND_API_KEY=re_...
ADMIN_SECRET=local-admin-secret
```

Generate a random MAGIC_LINK_SECRET:
```bash
openssl rand -base64 32
```

### 4. Set Up KV Namespaces

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

**Option A: All-in-one script**

```bash
./scripts/dev.sh
```

This starts:
- **Jekyll** at http://127.0.0.1:4000 (with `_config.local.yml` overrides)
- **Worker** at http://127.0.0.1:8787 (via `wrangler dev --env dev` with local KV simulation)
- **Stripe CLI** forwarding webhooks to the local Worker
- **ngrok** tunnel (if installed) for Snipcart product validation

The script auto-updates `worker/.dev.vars` with the Stripe CLI webhook secret.

> **Note:** Local KV simulation is used by default for fast iteration and compatibility with `scripts/seed-all-campaigns.sh`. KV data resets when the worker restarts. Use `--remote` if you need persistent data or to see real pledges.

**Option B: Manual start (separate terminals)**

```bash
# Terminal 1: Jekyll
bundle exec jekyll serve --config _config.yml,_config.local.yml

# Terminal 2: Worker (local KV simulation)
cd worker && wrangler dev --env dev

# Terminal 3: Stripe webhooks
stripe listen --forward-to localhost:8787/webhooks/stripe
```

**Troubleshooting: Missing Pledges**

If a Stripe checkout completes but the pledge doesn't appear:
1. Check Stripe CLI output — did it forward the webhook?
2. Use the recovery endpoint to manually create the pledge:
   ```bash
   curl -X POST http://localhost:8787/admin/recover-checkout \
     -H 'Authorization: Bearer YOUR_ADMIN_SECRET' \
     -H 'Content-Type: application/json' \
     -d '{"sessionId": "cs_test_..."}'
   ```

### 6. Test the Pledge Flow

1. Visit http://127.0.0.1:4000
2. Click a campaign → Add a tier to cart
3. Fill billing info → Click "Continue to payment"
4. Complete Stripe Checkout with test card: `4242 4242 4242 4242`
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

### ngrok for Snipcart Product Crawling

Snipcart validates products by crawling your site. For this to work locally:

```bash
ngrok http 4000
```

Then update `_config.local.yml`:
```yaml
url: https://your-subdomain.ngrok-free.dev
```

Restart Jekyll to apply the URL change.

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
    { "type": "created", "subtotal": 10000, "tax": 788, "amount": 10788, "tierId": "prop", "tierQty": 1, "at": "..." },
    { "type": "modified", "subtotalDelta": -5000, "taxDelta": -394, "amountDelta": -5394, "tierId": "dialogue", "tierQty": 1, "at": "..." }
  ]
}
```

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

**Output columns:** email, campaign, items, subtotal, tax, total, status, charged, created_at, order_id

**Status values:**
- `created` — Initial pledge creation (items show full tier list)
- `modified` — Pledge tier/amount change (items show diff: `+Added Tier`, `-Removed Tier`)
- `cancelled` — Pledge cancelled (shows negative amounts)
- `active` — Legacy pledge without history
- `charged` — Legacy charged pledge without history
- `failed` — Legacy failed pledge without history

**Modified row items format:**
```
(modified) +Line of Dialogue; -Writer Credit x2
```
- `+Tier` or `+Tier xN` — Tier was added (or quantity increased)
- `-Tier` or `-Tier xN` — Tier was removed (or quantity decreased)
- Unchanged tiers don't appear in the diff

**Cancelled row format:**
Cancelled rows show negative amounts (subtotal, tax, total) so that summing all rows gives the correct campaign total. Items are prefixed with `-` to indicate removal.

**Tier name mapping:**
The report converts tier IDs to human-readable names (e.g., `frame` → `One Frame`, `dialogue` → `Line of Dialogue`).

**Summing subtotals** gives you the current pledged amount (modifications and cancellations are reflected as deltas).

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

**Output columns:** email, campaign, items, subtotal, tax, total

**Key differences from pledge-report.sh:**
- Shows **current tier state** (not history)
- **Aggregates** multiple pledges per backer into one row
- **Excludes** cancelled pledges
- **No** status, created_at, or order_id columns
- Items show final quantities (e.g., if backer modified from frame→dialogue, only dialogue appears)

**Use cases:**
- Fulfillment spreadsheets (what to send each backer)
- Backer counts by tier
- Revenue summaries

## Checkout Autofill

`checkout-autofill.js` improves password manager compatibility:

1. **Auto-selects United States** — Triggers on checkout route, finds country label, types "United States", clicks dropdown option
2. **State/Province proxy input** — Creates a hidden input with `autocomplete="address-level1"` that password managers can fill
3. **State abbreviation conversion** — Converts "CA" → "California" automatically
4. **Fallback polling** — Checks every 500ms for password managers that don't fire events

**How it works:**
- Proxy input is briefly visible (500ms) for password manager detection
- When filled, it transfers the value to Snipcart's typeahead and clicks the matching option
- Works with Bitwarden, 1Password, Proton Pass, browser autofill

**Limitations:**
- Credit card fields (number, expiry, CVV) are in Stripe's iframe — not accessible for security reasons

## Worker Architecture

The Cloudflare Worker (`worker/src/`) is the backend for The Pool:

```
worker/src/
├── index.js        # Route handlers (main entry point)
├── campaigns.js    # Fetch/validate campaigns from Jekyll API
├── email.js        # Resend email templates (supporter, milestone, failed, etc.)
├── github.js       # Trigger GitHub Pages rebuilds
├── snipcart.js     # Snipcart API client (used for order verification only)
├── stats.js        # KV-based stats, inventory, milestones
├── stripe.js       # Stripe API client + webhook signature verification
├── token.js        # HMAC magic link token generation/verification
└── routes/
    └── votes.js    # Community voting endpoints
```

### Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /start` | Create Stripe Checkout (setup mode) for new pledge |
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
3. Aggregates pledges by email so each supporter gets ONE charge
4. Sends confirmation emails

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
| `SNIPCART_SECRET` | Snipcart API (order verification, optional) |
| `MAGIC_LINK_SECRET` | HMAC signing for pledge management tokens |
| `RESEND_API_KEY` | Send supporter/milestone/failed emails |
| `ADMIN_SECRET` | Protect admin endpoints (settle, rebuild, etc.) |

Snipcart public API keys are domain-restricted (visible in source is fine).

## Mobile UI Patterns

### Hamburger Menu vs Snipcart Overlay

The mobile hamburger menu toggle needs careful z-index handling to avoid overlapping with the Snipcart cart modal.

**Pattern**: Only apply elevated z-index when the menu is actually open:

```scss
// In _layout.scss
&__menu-toggle {
  @include xsm {
    position: relative;
    // No z-index here — Snipcart overlay (~10000+) covers it naturally
  }
}

// Only elevate when menu is open
&__menu-toggle.is-open {
  z-index: 101; // Above nav overlay (z-index: 100)
}
```

**Why this works:**
- When menu is closed: No z-index, so Snipcart's high z-index overlay covers the button
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
Cloudflare KV (not Snipcart). Key patterns:
- `pledge:{orderId}` — Full pledge data (email, amount, tier, Stripe IDs, status)
- `email:{email}` — Array of order IDs for that email
- `stats:{campaignSlug}` — Aggregated totals (pledgedAmount, pledgeCount, tierCounts)
- `inventory:{campaignSlug}` — Tier claim counts for limited tiers

**What role does Snipcart play?**  
Cart UI only. Snipcart provides the shopping cart experience and collects billing info, but pledge data is stored in KV, not Snipcart order metadata.

**Does this store PII?**  
Email addresses are stored in KV for pledge management. Stripe stores card data; we store Stripe customer/payment method IDs.

**How do stretch goals unlock tiers?**  
Use `requires_threshold` on the tier; the template hides it until `pledged_amount >= threshold`.

**What about long campaign durations?**  
Stripe SetupIntents (saved payment methods) don't expire like 7-day card holds, which is why we use them.

**How are campaigns charged when funded?**  
The Worker automatically settles campaigns via a daily cron trigger (runs at midnight MT). When a campaign's deadline passes and it has met its goal, the Worker:
1. Aggregates all active pledges **by email** (one charge per supporter, not per order)
2. Uses the most recently updated payment method for each supporter
3. Creates one Stripe PaymentIntent per supporter for their total amount
4. Sends one confirmation email per supporter
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
- Custom amount input → Snipcart price sync
- Support item input → Snipcart price sync
- Disabled states on non-live campaigns
- Snipcart integration (attributes, script loading)

### Running All Tests

```bash
npm test  # Runs unit tests, then E2E tests
```

### Adding Tests

**Unit tests:** Add to `tests/unit/` with `.test.ts` extension. Tests should be fast (no network, no real DOM).

**E2E tests:** Add to `tests/e2e/` with `.spec.ts` extension. Use Playwright's `expect()` for assertions.

---

_Last updated: Jan 2026_
