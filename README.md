# The Pool

**Dust Wave's Snipcart-powered crowdfunding platform** — [pool.dustwave.xyz](https://pool.dustwave.xyz)

A static Jekyll + Snipcart v3 site for all-or-nothing creative crowdfunding. Backers pledge through Snipcart, then save their card via Stripe (handled by a Cloudflare Worker). Cards aren't charged until the campaign deadline — if funded, a GitHub Action charges all pledges off-session.

## Features

- **No accounts required** — Backers manage pledges via email magic links
- **All-or-nothing pledging** — Cards saved now, charged only if goal is met
- **Checkout autofill** — Auto-selects country, enables password manager autofill for address fields
- **Stretch goals** — Auto-unlock at funding thresholds
- **Campaign lifecycle** — `pre` → `live` → `post` states with automatic transitions
- **Countdown timers** — Mountain Time (MST/MDT) with automatic DST detection, pre-rendered to avoid flash
- **Production phases & registry** — Tabbed interface for itemized funding needs
- **Community decisions** — Voting/polling for backer engagement
- **Production diary** — Creator update log
- **Ongoing funding** — Post-campaign support section

## Architecture

```
[Visitor] → GitHub Pages (Jekyll + Snipcart v3)
          → Cloudflare Worker (Stripe SetupIntent + webhook + cron)
```

| Layer | Platform | Role |
|-------|----------|------|
| Frontend | GitHub Pages | Jekyll + Sass + Snipcart v3 |
| Payments | Stripe | SetupIntents + off-session charges |
| API | Cloudflare Worker | Stripe checkout, webhook, stats, auto-settle |

## Quick Start

```bash
bundle install
bundle exec jekyll serve
# Visit http://localhost:4000
```

For development with local URL overrides:
```bash
bundle exec jekyll serve --config _config.yml,_config_development.yml
```

## Testing

```bash
npm run test:unit      # Unit tests (Vitest) — 37 tests, ~700ms
npm run test:e2e       # E2E tests (Playwright) — 33 tests + 1 manual
npm run test:security  # Security tests — pen testing the Worker API
npm test               # Run unit + e2e
```

**Test coverage includes:** live-stats functions, progress bars, tier unlocks, support items, countdown timers, cart flow, accessibility, and campaign states.

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

## Key Directories

```
_campaigns/           # Markdown campaign files
_layouts/             # Page templates (campaign, community, manage, etc.)
_includes/            # Reusable components
  └── blocks/         # Content block renderers (text, image, video, gallery, etc.)
_plugins/             # Jekyll plugins (money filter)
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
      ├── cart.js             # Snipcart pledge flow (extracts tiers, support items, custom amounts)
      ├── campaign.js         # Phase tabs, toasts
      ├── buy-buttons.js      # Button handlers
      ├── checkout-autofill.js # Country/state autofill
      ├── live-stats.js       # Real-time stats, inventory, tier unlocks, late support
      └── snipcart-debug.js   # Debug utilities
worker/               # Cloudflare Worker (pledge.dustwave.xyz)
  └── src/            # Worker source (Stripe, email, voting, tokens)
scripts/              # Automation & reporting
  ├── dev.sh               # Start all dev services (Jekyll, Worker, Stripe CLI)
  ├── pledge-report.sh     # Ledger-style CSV report (history entries)
  ├── fulfillment-report.sh # Aggregated CSV report (current state by backer)
  └── seed-all-campaigns.sh # Seed test pledges for all campaigns (local KV)
tests/                # Test suites
  ├── unit/               # Vitest unit tests (JS functions)
  └── e2e/                # Playwright E2E tests (browser flows)
```

---

*© Dust Wave*
