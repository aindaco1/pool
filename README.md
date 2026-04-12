# The Pool

**Dust Wave's open-source crowdfunding platform** — [pool.dustwave.xyz](https://pool.dustwave.xyz)

A static Jekyll + first-party cart site for all-or-nothing creative crowdfunding. Backers build a pledge in The Pool’s browser-owned cart, the Cloudflare Worker canonicalizes the contribution via `/checkout-intent/start`, and Stripe collects and saves card details through a secure on-site payment step so cards are only charged after a successful campaign reaches its deadline. A single checkout can include items from multiple campaigns; after webhook confirmation, the Worker fans that bundle out into separate campaign-scoped pledge records. If funded, a Worker cron dispatches batched settlement and charges pledges off-session. Supporters can optionally add a platform tip, manage pledges through order-scoped magic links, and revisit a desktop-friendly Manage Pledge dashboard with Active / Closed sections.

## Features

- **No accounts required** — Backers manage pledges via email magic links
- **Server-verified checkout** — The Worker canonicalizes cart contents from first-party cart items instead of trusting browser-submitted totals
- **Multi-campaign checkout** — One checkout can include multiple campaigns, while storage, emails, reports, and management stay campaign-scoped after confirmation
- **All-or-nothing pledging** — Cards saved now, charged only if goal is met
- **Optional platform tip** — 0% to 15% tip (default 5%) included in totals but excluded from campaign progress
- **Tip-aware cart + checkout** — Shared pricing logic keeps subtotal, tip, tax, shipping, and total in sync across cart, checkout, Worker, reports, and emails
- **USPS-backed shipping quotes with fallback guardrails** — Physical checkout and modify flows can quote USPS domestic/international shipping, fall back safely to configured flat rates, and support optional domestic signature upgrades without pushing quote churn into KV
- **On-site Stripe payment step** — The existing second checkout sidecar hosts secure Stripe payment UI, and Manage Pledge uses the same pattern for `Update Card`
- **Configurable pricing settings** — `pricing.sales_tax_rate`, `pricing.default_tip_percent`, and `pricing.max_tip_percent` live in `_config.yml`, and the required Worker vars are auto-synced into `worker/wrangler.toml` for server-side enforcement
- **Physical & digital tiers** — Physical items trigger shipping address capture during checkout plus Worker-calculated USPS quotes, configured fallback rates, and optional domestic signature upgrades when enabled
- **Order-scoped magic links** — Each supporter link only manages its own pledge/order
- **Safer supporter sessions** — Community pages keep supporter access in browser session storage instead of a long-lived token cookie
- **Stretch goals** — Auto-unlock at funding thresholds
- **Campaign lifecycle** — `upcoming` → `live` → `post` states with automatic transitions + Cloudflare cache purge
- **Countdown timers** — Mountain Time (MST/MDT) with automatic DST detection, pre-rendered to avoid flash
- **Production phases & registry** — Tabbed interface for itemized funding needs
- **Community decisions** — Voting/polling for backer engagement with published option allowlists and closed-decision lockout
- **Sanitized campaign content blocks** — Long-form campaign and diary content accepts Markdown plus a tiny safe inline subset (`<br>`, `<em>`, `<strong>`, `<i>`, `<b>`, `<u>`), neutralizes unsafe Markdown link schemes, automatically opens external links in a new tab, and escapes or rejects other raw HTML
- **Strict structured embeds** — Approved `spotify`, `youtube`, and `vimeo` embeds are validated against exact trusted origins and embed paths instead of substring matching
- **Serialized limited-tier inventory** — Scarce rewards reserve through a per-campaign Durable Object at checkout start and confirm through that same coordinator at persistence time, so limited tiers do not oversell under concurrent demand
- **Strict missing-pledge handling** — Magic-link pledge reads fail closed with `404` when the backing pledge record is missing
- **Production diary** — Rich content updates with auto-broadcast emails to supporters
- **Announcements** — Admin broadcast emails with custom CTA links to supporters
- **Instagram integration** — Optional social CTA in supporter emails
- **Ongoing funding** — Post-campaign support section
- **Manage Pledge dashboard** — Desktop-friendly Active / Closed sections with locked-state read-only controls after deadline
- **Tip-aware emails + reports** — Supporter emails, pledge reports, and fulfillment exports all include the platform tip when present
- **Shared visual system** — Public pages, campaign surfaces, cart / checkout, and Manage Pledge all use the same calmer reusable typography, button, field, and card language
- **Responsive mobile polish** — Campaign pages, checkout/manage flows, community pages, and long-form content have shared small-screen spacing, stacking, and overflow fixes instead of a separate mobile-only UI
- **Variable-first fork customization** — structured config now drives branding, pricing, Worker-synced settings, core brand assets, and curated design variables without requiring custom code for normal fork rebranding
- **English + Spanish i18n foundation** — `_config.yml` now drives supported languages, static locale routes, shared translation data, and a quieter footer language switcher, with Spanish live across home/about/terms, pledge-result pages, `/manage/`, `/community/`, supporter community routes, site-owned cart/community/Manage Pledge runtime copy, campaign countdown/gallery/live-stats labels, and localized Worker supporter emails
- **SEO fundamentals baseline** — Public pages and campaign pages now emit consistent titles, descriptions, canonicals, OG/Twitter tags, and honest JSON-LD, while `robots.txt`, `sitemap.xml`, and explicit noindex rules keep private/tokenized flows out of search intent
- **CMS Integration** — [Pages CMS](https://pagescms.org) for visual campaign editing

## Architecture

```
[Visitor] → GitHub Pages (Jekyll + first-party cart / checkout sidecars)
          → Cloudflare Worker (on-site Stripe session bootstrap + webhook + cron)
```

| Layer | Platform | Role |
|-------|----------|------|
| Frontend | GitHub Pages | Jekyll + Sass + first-party cart runtime |
| Payments | Stripe | Secure payment fields, saved payment methods, off-session charges |
| API | Cloudflare Worker | Checkout-session bootstrap, webhook, tip-aware totals, stats, auto-settle, cache purge |
| CMS | Pages CMS | Visual campaign editing (commits to GitHub) |

## Quick Start

```bash
npm run podman:doctor
./scripts/dev.sh --podman
# Visit http://127.0.0.1:4000
```

That is the recommended local development path. It boots Jekyll, the Worker, optional Stripe CLI forwarding, and the local support services together with the repo's current defaults.

If you want to rebuild the Podman dev images after dependency or base-image changes:
```bash
PODMAN_REBUILD=1 ./scripts/dev.sh --podman
```

Fork-friendly pricing settings live in:
- `pricing.sales_tax_rate`, `pricing.default_tip_percent`, and `pricing.max_tip_percent` in [`_config.yml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/_config.yml)
- auto-synced Worker vars `SALES_TAX_RATE`, `DEFAULT_PLATFORM_TIP_PERCENT`, and `MAX_PLATFORM_TIP_PERCENT` in [`worker/wrangler.toml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/worker/wrangler.toml)

Fork-friendly shipping settings live in:
- `shipping.origin_*`, `shipping.fallback_flat_rate`, `shipping.free_shipping_default`, and `shipping.usps.*` in [`_config.yml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/_config.yml)
- auto-synced Worker vars like `SHIPPING_ORIGIN_ZIP`, `SHIPPING_FALLBACK_FLAT_RATE`, `USPS_ENABLED`, `USPS_CLIENT_ID`, and the USPS timeout/cache/cooldown knobs in [`worker/wrangler.toml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/worker/wrangler.toml)

Keep `USPS_CLIENT_SECRET` out of site config. Set it as a Worker secret or in [`worker/.dev.vars`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/worker/.dev.vars) for local development.

If you change those values locally, restart `./scripts/dev.sh --podman` so the Worker uses the same math as the site.

Fork-facing settings now use a structured config model in [`_config.yml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/_config.yml):

- `platform` for identity, URLs, and support contact
- `platform` also covers brand assets like logo, footer logo, favicon, and default social image
- top-level `title` / `description` for Jekyll's site identity and default SEO copy
- `seo` for bounded SEO identity knobs like `x_handle`, `same_as`, and whether the public community hub should remain indexable
- `pricing` for tax, the legacy flat-shipping compatibility baseline, and platform-tip defaults
- `shipping` for origin settings, USPS quote behavior, fallback policy, free-shipping defaults, shipping presets, and limited shipping-option policy
- `i18n` for default/supported languages, language labels, and localized public-page routes
- `design` for curated typography, radius, layout-width, and theme-token overrides
- `debug` for browser and Worker console logging behavior
- `checkout` for truly variable checkout settings like the Stripe publishable key
- `cache` for live browser TTLs

[`_config.local.yml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/_config.local.yml) is now intentionally thin: it should only carry true local overrides like localhost URLs and `show_test_campaigns`, not a second copy of the base config.

See [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md) for the supported no-code customization surface and which settings are automatically mirrored to the Worker.
See [docs/SEO.md](docs/SEO.md) for the current SEO fundamentals implementation and supported SEO surface.

For localization, the supported model is:

- shared UI/runtime/email copy lives in `_data/i18n/{lang}.yml`
- localized long-form pages still need localized source files under the locale prefix
- the shared footer language switcher preserves the current query string and hash, so tokenized routes like `/manage/?t=...` can switch to `/es/manage/?t=...` without dropping pledge access

The main local/dev/test paths already sync those mirrored Worker values automatically. If you want to refresh the Worker config directly, run:

```bash
npm run sync:worker-config
```

If you specifically need the host-only fallback instead:
```bash
bundle install
bundle exec jekyll serve --config _config.yml,_config.local.yml
```

For a full host-only stack, run the Worker separately with `cd worker && wrangler dev --env dev --port 8787`.

See [docs/PODMAN.md](docs/PODMAN.md) for the current scope and limitations.

The Podman path is host-validated on macOS. Linux and Windows are supported by design and have doctor/self-check coverage, but were not host-validated in this thread.

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

If you want to exercise the on-site Stripe checkout locally, add `STRIPE_PUBLISHABLE_KEY_TEST=pk_test_...` to [`worker/.dev.vars`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/worker/.dev.vars) before starting the stack.

## Cloudflare Free-Plan Guidance For Forks

The Pool is intentionally shaped so most traffic stays cheap:

- GitHub Pages serves the static site, so normal page loads do not invoke the Worker
- public live data now prefers one combined `/live/:slug` request instead of separate stats + inventory calls
- campaign pages cache live stats and inventory in `localStorage` for `cache.live_stats_ttl_seconds` / `cache.live_inventory_ttl_seconds` (default `300`)
- background tabs stop refreshing until the page becomes visible again
- single-campaign reports, stats rebuilds, settlement helpers, and admin supporter enumeration prefer `campaign-pledges:{slug}` indexes before falling back to expensive namespace scans, and stats/inventory rebuilds now repair stale campaign indexes when they detect drift
- limited-tier write paths now ask the coordinator for reservation-aware availability instead of rebuilding truth from KV reservation keys
- once a client is already over a rate limit window, repeated blocked requests no longer rewrite the same KV counter on every hit

Fork knobs worth knowing:

- site config: `cache.live_stats_ttl_seconds`, `cache.live_inventory_ttl_seconds`, `pricing.sales_tax_rate`, `pricing.flat_shipping_rate`
- Worker env: auto-synced pricing values in [`worker/wrangler.toml`](/Users/aindaco1/Library/Mobile%20Documents/com~apple~CloudDocs/pool/worker/wrangler.toml)

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
npm run test:e2e       # E2E tests (Playwright) — fully automated browser coverage
npm run test:e2e:headless # CI-style automated browser suite
npm run test:security  # Security tests — pen testing the Worker API
npm run test:security:podman # Security tests with a Podman-backed local stack in one invocation
npm test               # Run unit + e2e
```

Local reporting:
```bash
./scripts/pledge-report.sh --local
./scripts/fulfillment-report.sh --local
```

Podman-backed local testing:

```bash
./scripts/test-checkout.sh --podman  # Manual interactive checkout helper against the Podman dev stack
./scripts/test-e2e.sh --podman       # Automated browser helper against the Podman dev stack
./scripts/test-worker.sh --podman    # Site/Worker contract smoke against the Podman dev stack
./scripts/smoke-pledge-management.sh --podman  # Mutable-pledge smoke against the Podman dev stack
./scripts/pledge-report.sh --podman --local    # Local ledger CSV through the Worker container
./scripts/fulfillment-report.sh --podman --local # Local fulfillment CSV through the Worker container
npm run test:e2e:headless:podman     # Automated browser suite with Playwright in a container
npm run test:security:podman         # Security suite against a one-shot Podman-backed local stack
```

The pre-merge gate now tries the host Bundler/Jekyll path first, including a one-time `bundle install` attempt when Bundler is present but gems are missing. It keeps the lighter host Worker smoke, but runs the mutable-pledge smoke through the Podman-backed stack so the stateful modify/cancel path uses isolated local service state even when the host build path succeeds. If the host Ruby path still cannot produce a clean build, the gate now falls back to the Podman-backed artifact build instead of failing early on host setup.

The headless browser harness now builds a clean static `_site` and serves it with a lightweight HTTP server rather than relying on `jekyll serve`, which keeps browser regressions closer to the actual published asset shape.

- `pledge-report.sh` is a ledger/history export, so modified pledges appear as deltas and mixed changes now keep tip-update context in the `items` column.
- `fulfillment-report.sh` is the merged current-state view per `email + campaign`, which is the better comparison point for repeat backers and non-stackable projects.
- if the site ever drifts from the current-state fulfillment view, the admin stats/inventory recalc paths now self-heal stale `campaign-pledges:{slug}` indexes instead of trusting them forever.

**Current full-suite baseline:**
- Pre-merge gate: passes locally and in the PR `Merge Smoke` workflow
- Unit, security, and headless E2E suites are green on this branch

**Test coverage includes:** live-stats functions, platform tip helpers, first-party checkout intent hashing and payload wiring, supporter email tip breakdowns, pledge-management flags, settlement totals, progress bars, tier unlocks, support items, countdown timers, cart flow, accessibility (including axe-backed public-page checks across campaign, community, and pledge-result states, ARIA snapshots, and keyboard-only checkout/manage/community/public-control assertions), mobile viewport regressions for public pages and pledge flows, campaign states, secret exposure auditing, campaign-content HTML/link/embed auditing, serialized tier-inventory coordination, and hardening around `/checkout-intent/start`, webhook handling, magic-link scope, settlement integrity, and paginated rebuild/backfill paths.

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
- [ACCESSIBILITY.md](docs/ACCESSIBILITY.md) — Accessibility standards, critical surfaces, and current coverage
- [CUSTOMIZATION.md](docs/CUSTOMIZATION.md) — Supported fork-facing branding, pricing, and design overrides
- [I18N.md](docs/I18N.md) — Current localization structure, routing model, and language-addition workflow
- [SHIPPING.md](docs/SHIPPING.md) — Current shipping model, USPS setup, and fallback policy
- [SEO.md](docs/SEO.md) — Current crawl, metadata, JSON-LD, and noindex model
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
  ├── partials/       # Modular Sass (14 focused partials)
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
- on-site Stripe setup-mode session bootstrap for the first-party checkout sidecar and the Manage Pledge `Update Card` modal, with hosted fallback still available as a compatibility path
- webhook processing and pledge persistence
- tip-aware total calculation
- supporter email delivery via Resend
- batched settlement and retry flows
- admin recovery and reporting endpoints

---

*🄯 Dust Wave*
