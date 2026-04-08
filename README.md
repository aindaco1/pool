# The Pool

**Dust Wave's open-source crowdfunding platform** — [pool.dustwave.xyz](https://pool.dustwave.xyz)

A static Jekyll + first-party cart site for all-or-nothing creative crowdfunding. Backers build a pledge in The Pool’s browser-owned cart, the Cloudflare Worker canonicalizes the contribution via `/checkout-intent/start`, and Stripe collects card details in setup mode so cards are only charged after a successful campaign reaches its deadline. A single checkout can include items from multiple campaigns; after webhook confirmation, the Worker fans that bundle out into separate campaign-scoped pledge records. If funded, a Worker cron dispatches batched settlement and charges pledges off-session. Supporters can optionally add a platform tip, manage pledges through order-scoped magic links, and revisit a desktop-friendly Manage Pledge dashboard with Active / Closed sections.

## Features

- **No accounts required** — Backers manage pledges via email magic links
- **Server-verified checkout** — The Worker canonicalizes cart contents from first-party cart items instead of trusting browser-submitted totals
- **Multi-campaign checkout** — One checkout can include multiple campaigns, while storage, emails, reports, and management stay campaign-scoped after confirmation
- **All-or-nothing pledging** — Cards saved now, charged only if goal is met
- **Optional platform tip** — 0% to 15% tip (default 5%) included in totals but excluded from campaign progress
- **Tip-aware cart + checkout** — Shared pricing logic keeps subtotal, tip, tax, shipping, and total in sync across cart, checkout, Worker, reports, and emails
- **Configurable pricing settings** — `sales_tax_rate` and `flat_shipping_rate` live in `_config.yml` for site forks, with mirrored Worker env vars for server-side enforcement
- **Physical & digital tiers** — Physical items trigger Stripe shipping address collection + configurable flat shipping per campaign with physical rewards
- **Order-scoped magic links** — Each supporter link only manages its own pledge/order
- **Safer supporter sessions** — Community pages keep supporter access in browser session storage instead of a long-lived token cookie
- **Stretch goals** — Auto-unlock at funding thresholds
- **Campaign lifecycle** — `upcoming` → `live` → `post` states with automatic transitions + Cloudflare cache purge
- **Countdown timers** — Mountain Time (MST/MDT) with automatic DST detection, pre-rendered to avoid flash
- **Production phases & registry** — Tabbed interface for itemized funding needs
- **Community decisions** — Voting/polling for backer engagement with published option allowlists and closed-decision lockout
- **Sanitized campaign content blocks** — Long-form campaign and diary content accepts Markdown plus a tiny safe inline subset (`<br>`, `<em>`, `<strong>`, `<i>`, `<b>`, `<u>`), neutralizes unsafe Markdown link schemes, automatically opens external links in a new tab, and escapes or rejects other raw HTML
- **Strict structured embeds** — Approved `spotify`, `youtube`, and `vimeo` embeds are validated against exact trusted origins and embed paths instead of substring matching
- **Serialized limited-tier inventory** — Scarce reward claims are coordinated per campaign through a Durable Object so concurrent checkout completions cannot oversell limited tiers
- **Strict missing-pledge handling** — Magic-link pledge reads fail closed with `404` when the backing pledge record is missing
- **Production diary** — Rich content updates with auto-broadcast emails to supporters
- **Announcements** — Admin broadcast emails with custom CTA links to supporters
- **Instagram integration** — Optional social CTA in supporter emails
- **Ongoing funding** — Post-campaign support section
- **Manage Pledge dashboard** — Desktop-friendly Active / Closed sections with locked-state read-only controls after deadline
- **Tip-aware emails + reports** — Supporter emails, pledge reports, and fulfillment exports all include the platform tip when present
- **CMS Integration** — [Pages CMS](https://pagescms.org) for visual campaign editing

## Architecture

```
[Visitor] → GitHub Pages (Jekyll + first-party cart / checkout review UI)
          → Cloudflare Worker (Stripe SetupIntent + webhook + cron)
```

| Layer | Platform | Role |
|-------|----------|------|
| Frontend | GitHub Pages | Jekyll + Sass + first-party cart runtime |
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

Fork-friendly pricing settings live in:
- `sales_tax_rate` and `flat_shipping_rate` in [`_config.yml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/_config.yml)
- mirrored Worker env vars `SALES_TAX_RATE` and `FLAT_SHIPPING_RATE` in [`worker/wrangler.toml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/worker/wrangler.toml)

If you change those values locally, restart `./scripts/dev.sh` so the Worker uses the same math as the site.

For full local development with Jekyll, the Worker, Stripe CLI webhook forwarding, automatic local webhook-secret sync, and stale port cleanup on the standard local ports:
```bash
./scripts/dev.sh
```

For a lower-dependency local boot path, Podman mode now runs Jekyll and the Worker in rootless containers while keeping the same local ports and local Wrangler state:

```bash
./scripts/dev.sh --podman
```

Rebuild the Podman dev images after dependency or base-image changes with:

```bash
PODMAN_REBUILD=1 ./scripts/dev.sh --podman
```

See [docs/PODMAN.md](docs/PODMAN.md) for the current scope and limitations.

On this branch, the Podman path is host-validated on macOS. Linux and Windows are supported by design and have doctor/self-check coverage, but were not host-validated in this thread.

The checkout and E2E helper scripts also support that mode:

```bash
./scripts/test-checkout.sh --podman
./scripts/test-e2e.sh --podman
./scripts/test-worker.sh --podman
./scripts/smoke-pledge-management.sh --podman
./scripts/pledge-report.sh --podman --local
./scripts/fulfillment-report.sh --podman --local
npm run test:e2e:headless:podman
npm run podman:doctor
npm run podman:self-check
```

## Cloudflare Free-Plan Guidance For Forks

The Pool is intentionally shaped so most traffic stays cheap:

- GitHub Pages serves the static site, so normal page loads do not invoke the Worker
- public live data now prefers one combined `/live/:slug` request instead of separate stats + inventory calls
- campaign pages cache live stats and inventory in `localStorage` for `live_stats_cache_ttl_seconds` / `live_inventory_cache_ttl_seconds` (default `300`)
- background tabs stop refreshing until the page becomes visible again
- single-campaign reports, stats rebuilds, settlement helpers, and admin supporter enumeration prefer `campaign-pledges:{slug}` indexes before falling back to expensive namespace scans
- limited-tier availability checks now reuse `tier-reservation-counts:{slug}` aggregates instead of repeatedly listing reservation keys
- once a client is already over a rate limit window, repeated blocked requests no longer rewrite the same KV counter on every hit

Fork knobs worth knowing:

- site config: `live_stats_cache_ttl_seconds`, `live_inventory_cache_ttl_seconds`, `sales_tax_rate`, `flat_shipping_rate`
- Worker env: mirrored pricing values in [`worker/wrangler.toml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/worker/wrangler.toml)

### Practical Scalability Scenarios

These are rough planning scenarios, not guarantees. They assume the default 5-minute browser cache TTLs, mostly normal user behavior, and Cloudflare’s current published free-plan limits for Workers and KV.

| Scenario | Rough daily activity | Free-plan outlook |
|----------|----------------------|-------------------|
| Small collective launch | ~1,500 campaign-page visits, ~75 manage/supporter visits, ~20 checkout starts, ~10 completed pledges | Comfortable. Static pages absorb most traffic, and dynamic Worker usage should stay in the low thousands. |
| Busy launch week | ~8,000 campaign-page visits, ~250 manage/supporter visits, ~60 checkout starts, ~25 completed or modified pledges | Still plausible on free tier for read traffic. The first budget to watch is KV writes, not Worker requests. |
| Growing multi-project studio | ~20,000+ dynamic reads per day or many dozens of completed / modified / cancelled pledges per day | Start planning for the paid Workers plan before a major campaign push. Read traffic may still be fine, but mutation-heavy days can outgrow free KV writes first. |

As of April 7, 2026, Cloudflare documents the Workers Free plan at `100,000` requests per day, and Workers KV Free at `100,000` reads per day plus `1,000` writes per day and `1,000` list requests per day:

- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Workers KV limits](https://developers.cloudflare.com/kv/platform/limits/)

The practical takeaway for forks is simple: The Pool can handle a healthy amount of browsing traffic on the free plan, but completed pledges, pledge modifications, cancellations, and admin repair flows are the part to watch most closely because they spend the scarce KV write budget.

## Testing

```bash
npm run test:premerge  # Syntax + full/focused regressions + first-party build checks + local smoke + security + headless E2E
npm run test:secrets   # Secret exposure audit against local env files, tracked files, and git history
npm run test:unit      # Unit tests (Vitest)
npm run test:e2e       # E2E tests (Playwright) — automated + manual checkout coverage
npm run test:e2e:headless # CI-style automated browser suite
npm run test:security  # Security tests — pen testing the Worker API
npm test               # Run unit + e2e
```

Local reporting:
```bash
./scripts/pledge-report.sh --local
./scripts/fulfillment-report.sh --local
```

Podman-backed local testing:

```bash
./scripts/test-checkout.sh --podman  # Manual checkout helper against the Podman dev stack
./scripts/test-e2e.sh --podman       # Automated + manual browser helper against the Podman dev stack
./scripts/test-worker.sh --podman    # Site/Worker contract smoke against the Podman dev stack
./scripts/smoke-pledge-management.sh --podman  # Mutable-pledge smoke against the Podman dev stack
./scripts/pledge-report.sh --podman --local    # Local ledger CSV through the Worker container
./scripts/fulfillment-report.sh --podman --local # Local fulfillment CSV through the Worker container
npm run test:e2e:headless:podman     # Automated browser suite with Playwright in a container
```

When host Bundler/Jekyll gems are unavailable, the pre-merge gate now falls back to Podman for the Jekyll build and the local smoke/browser phases instead of failing early on host Ruby setup.

- `pledge-report.sh` is a ledger/history export, so modified pledges appear as deltas and mixed changes now keep tip-update context in the `items` column.
- `fulfillment-report.sh` is the merged current-state view per `email + campaign`, which is the better comparison point for repeat backers and non-stackable projects.

**Current full-suite baseline:**
- Pre-merge gate: passes locally and in the PR `Merge Smoke` workflow
- Unit, security, and headless E2E suites are green on this branch

**Test coverage includes:** live-stats functions, platform tip helpers, first-party checkout intent hashing and payload wiring, supporter email tip breakdowns, pledge-management flags, settlement totals, progress bars, tier unlocks, support items, countdown timers, cart flow, accessibility, campaign states, secret exposure auditing, campaign-content HTML/link/embed auditing, serialized tier-inventory coordination, and hardening around `/checkout-intent/start`, webhook handling, magic-link scope, settlement integrity, and paginated rebuild/backfill paths.

For local merge smoke on mutable pledges, use:

```bash
./scripts/smoke-pledge-management.sh
```

For the lighter site/Worker contract smoke, including removed-endpoint checks and malformed `/checkout-intent/start` coverage, use:

```bash
./scripts/test-worker.sh
```

See [TESTING.md](docs/TESTING.md) for full testing guide and [SECURITY.md](docs/SECURITY.md) for security architecture.

## Documentation

See [`docs/`](docs/) for full documentation:

- [CONTRIBUTING.md](docs/CONTRIBUTING.md) — Getting started, setup & contribution guide
- [PODMAN.md](docs/PODMAN.md) — Rootless Podman local dev path for Jekyll + Worker
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
  └── js/             # Client-side scripts
      ├── cart.js             # Pledge flow (tiers, support items, tip UI, shipping detection)
      ├── campaign.js         # Phase tabs, toasts
      ├── buy-buttons.js      # Button handlers
      ├── live-stats.js       # Real-time stats, inventory, tier unlocks, late support
      └── cart-provider.js    # First-party cart/runtime provider
worker/               # Cloudflare Worker (pledge.dustwave.xyz)
  └── src/            # Worker source (Stripe, email, voting, tokens, tip-aware totals)
scripts/              # Automation & reporting
  ├── dev.sh               # Start all dev services (host mode or Podman mode)
  ├── dev-podman.sh        # Rootless Podman launcher for Jekyll + Worker
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

Push `main` to deploy production:
```bash
git push origin main
```

That GitHub Actions workflow now deploys both:
- the GitHub Pages site
- the Cloudflare Worker from `worker/wrangler.toml`

Required GitHub repository secrets for automatic Worker deployment:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `ADMIN_SECRET` for the post-deploy diary check

Temporary fallback: the workflow also supports legacy Cloudflare auth via
- `CLOUDFLARE_EMAIL`
- `CLOUDFLARE_KEY`

The token + account ID path is still the recommended long-term setup.

Manual Worker fallback from the repo root:
```bash
npm run deploy:worker
```

The Worker powers:
- Stripe Checkout session creation in setup mode
- webhook processing and pledge persistence
- tip-aware total calculation
- supporter email delivery via Resend
- batched settlement and retry flows
- admin recovery and reporting endpoints

---

*🄯 Dust Wave*
