# The Pool

**Dust Wave's Snipcart-powered crowdfunding platform** — [pool.dustwave.xyz](https://pool.dustwave.xyz)

A static Jekyll + Snipcart v3 site for all-or-nothing creative crowdfunding. Backers build a pledge in Snipcart, the Cloudflare Worker re-verifies the checkout session and creates a Stripe setup-mode Checkout session, and cards are only charged after a successful campaign reaches its deadline. If funded, a Worker cron dispatches batched settlement and charges pledges off-session. Supporters can optionally add a Dust Wave platform tip, manage pledges through order-scoped magic links, and revisit a desktop-friendly Manage Pledge dashboard with Active / Closed sections.

## Features

- **No accounts required** — Backers manage pledges via email magic links
- **Server-verified checkout** — The Worker rebuilds pledge shape from the verified Snipcart payment session instead of trusting browser-submitted totals
- **All-or-nothing pledging** — Cards saved now, charged only if goal is met
- **Optional platform tip** — 0% to 15% Dust Wave tip (default 5%) included in totals but excluded from campaign progress
- **Tip-aware cart + checkout** — Shared pricing logic keeps subtotal, tip, tax, shipping, and total in sync across cart, checkout, Worker, reports, and emails
- **Checkout autofill** — Auto-selects country, enables password manager autofill for address fields
- **Physical & digital tiers** — Physical items trigger Stripe shipping address collection + $3 flat USPS fee
- **Order-scoped magic links** — Each supporter link only manages its own pledge/order
- **Stretch goals** — Auto-unlock at funding thresholds
- **Campaign lifecycle** — `upcoming` → `live` → `post` states with automatic transitions + Cloudflare cache purge
- **Countdown timers** — Mountain Time (MST/MDT) with automatic DST detection, pre-rendered to avoid flash
- **Production phases & registry** — Tabbed interface for itemized funding needs
- **Community decisions** — Voting/polling for backer engagement
- **Production diary** — Rich content updates with auto-broadcast emails to supporters
- **Announcements** — Admin broadcast emails with custom CTA links to supporters
- **Instagram integration** — Optional social CTA in supporter emails
- **Ongoing funding** — Post-campaign support section
- **Manage Pledge dashboard** — Desktop-friendly Active / Closed sections with locked-state read-only controls after deadline
- **Tip-aware emails + reports** — Supporter emails, pledge reports, and fulfillment exports all include the platform tip when present
- **CMS Integration** — [Pages CMS](https://pagescms.org) for visual campaign editing

## Architecture

```
[Visitor] → GitHub Pages (Jekyll + Snipcart v3 cart / checkout UI)
          → Cloudflare Worker (Stripe SetupIntent + webhook + cron)
```

| Layer | Platform | Role |
|-------|----------|------|
| Frontend | GitHub Pages | Jekyll + Sass + Snipcart v3 |
| Payments | Stripe | SetupIntents + off-session charges |
| API | Cloudflare Worker | Stripe checkout, webhook, tip-aware totals, stats, auto-settle, cache purge |
| CMS | Pages CMS | Visual campaign editing (commits to GitHub) |

## Quick Start

```bash
bundle install
bundle exec jekyll serve
# Visit http://localhost:4000
```

For development with local URL overrides:
```bash
bundle exec jekyll serve --config _config.yml,_config.local.yml
```

For full local development with Jekyll, the Worker, Stripe CLI webhook forwarding, automatic local webhook-secret sync, and stale port cleanup on the standard local ports:
```bash
./scripts/dev.sh
```

## Testing

```bash
npm run test:premerge  # Syntax + focused regressions + local smoke + full unit + security + headless E2E
npm run test:secrets   # Secret exposure audit against local env files, tracked files, and git history
npm run test:unit      # Unit tests (Vitest) — currently 203 tests
npm run test:e2e       # E2E tests (Playwright) — automated + manual checkout coverage
npm run test:e2e:headless # CI-style automated browser suite
npm run test:security  # Security tests — pen testing the Worker API
npm test               # Run unit + e2e
```

**Current full-suite baseline:**
- Pre-merge gate: passes locally and in the PR `Merge Smoke` workflow
- Unit tests: 203 passed
- Headless E2E: 35 passed, 5 skipped
- Security tests: 128 passed

**Test coverage includes:** live-stats functions, platform tip helpers, Snipcart cart parsing, supporter email tip breakdowns, pledge-management flags, settlement totals, progress bars, tier unlocks, support items, countdown timers, cart flow, accessibility, campaign states, secret exposure auditing, and hardening around `/start`, webhook handling, magic-link scope, settlement integrity, and paginated rebuild/backfill paths.

For local merge smoke on mutable pledges, use:

```bash
./scripts/smoke-pledge-management.sh
```

For the lighter site/Worker contract smoke, including `/start` fail-closed checks without a real Snipcart session, use:

```bash
./scripts/test-worker.sh
```

See [TESTING.md](docs/TESTING.md) for full testing guide and [SECURITY.md](docs/SECURITY.md) for security architecture.

## Documentation

See [`docs/`](docs/) for full documentation:

- [CONTRIBUTING.md](docs/CONTRIBUTING.md) — Getting started, setup & contribution guide
- [PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) — System architecture
- [WORKFLOWS.md](docs/WORKFLOWS.md) — Pledge lifecycle, magic links & charge flow
- [DEV_NOTES.md](docs/DEV_NOTES.md) — Development notes, content model & FAQ
- [TESTING.md](docs/TESTING.md) — Full testing guide & secrets reference
- [SECURITY.md](docs/SECURITY.md) — Security architecture, rate limiting & pen testing
- [ROADMAP.md](docs/ROADMAP.md) — Planned features
- [CMS.md](docs/CMS.md) — Pages CMS setup & campaign editing guide

## Key Directories

```
.pages.yml            # Pages CMS configuration
_campaigns/           # Markdown campaign files
_layouts/             # Page templates (campaign, community, manage, etc.)
_includes/            # Reusable components
  └── blocks/         # Content block renderers (text, image, video, gallery, etc.)
_plugins/             # Jekyll plugins (money filter, campaign state)
assets/
  ├── main.scss       # Sass entry point
  ├── partials/       # Modular Sass (15 focused partials)
  │   ├── _variables.scss     # Colors, spacing, typography tokens
  │   ├── _mixins.scss        # Breakpoints, button patterns
  │   ├── _base.scss          # Reset, typography, links
  │   ├── _layout.scss        # Page structure, grid, header
  │   ├── _buttons.scss       # Button variants
  │   ├── _forms.scss         # Form elements
  │   ├── _cards.scss         # Campaign cards, tier cards
  │   ├── _progress.scss      # Progress bars, stats
  │   ├── _modal.scss         # Modal dialogs
  │   ├── _campaign.scss      # Campaign page specifics
  │   ├── _community.scss     # Community/voting pages
  │   ├── _manage.scss        # Pledge management page
  │   ├── _content-blocks.scss # Rich content rendering
  │   ├── _utilities.scss     # Helper classes
  │   └── _snipcart-overrides.scss # Cart customization
  └── js/             # Client-side scripts
      ├── cart.js             # Snipcart pledge flow (tiers, support items, tip UI, shipping detection)
      ├── campaign.js         # Phase tabs, toasts
      ├── buy-buttons.js      # Button handlers
      ├── checkout-autofill.js # Country/state autofill
      ├── live-stats.js       # Real-time stats, inventory, tier unlocks, late support
      └── snipcart-debug.js   # Debug utilities
worker/               # Cloudflare Worker (pledge.dustwave.xyz)
  └── src/            # Worker source (Stripe, email, voting, tokens, tip-aware totals)
scripts/              # Automation & reporting
  ├── dev.sh               # Start all dev services (Jekyll, Worker, Stripe CLI with matched webhook secret)
  ├── pledge-report.sh     # Ledger-style CSV report (history entries incl. tip columns)
  ├── fulfillment-report.sh # Aggregated CSV report (current state by backer, total incl. tip)
  ├── smoke-pledge-management.sh # Local end-to-end modify/cancel smoke on the test-only campaign
  └── seed-all-campaigns.sh # Seed test pledges for all campaigns (local KV)
tests/                # Test suites
  ├── unit/               # Vitest unit tests (JS functions)
  ├── e2e/                # Playwright E2E tests (browser flows)
  └── security/           # Vitest security / abuse-path coverage for the Worker
```

## Deployment

Push the site to GitHub Pages:
```bash
git push origin main
```

Deploy the Worker from the repo's production Wrangler config:
```bash
cd worker
wrangler deploy
```

The Worker powers:
- Stripe Checkout session creation in setup mode
- webhook processing and pledge persistence
- tip-aware total calculation
- supporter email delivery via Resend
- batched settlement and retry flows
- admin recovery and reporting endpoints

---

*© Dust Wave*
