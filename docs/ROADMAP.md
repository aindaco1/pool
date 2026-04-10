# Roadmap

## Completed

**Platform foundation**

- [x] Core branding, formatting, and internationalization scaffolding
  - The Pool / Dust Wave platform branding
  - money formatting plugin
  - translation helper, `en.yml`, and example templates
- [x] Cloudflare Worker backend and lifecycle automation
  - pledge storage, stats, inventory, and emails
  - auto-settle cron
  - aggregated supporter charging
  - DST-aware Mountain Time deadline handling across frontend + Worker
  - automatic campaign state transitions
- [x] Podman-backed local development and testing
  - `./scripts/dev.sh --podman`
  - containerized headless Playwright
  - Podman-aware smoke/report helpers plus `podman:doctor` and `podman:self-check`

**Campaign and public experience**

- [x] Public campaign presentation system
  - campaign sorting
  - uniform campaign cards with featured-tier preview
  - two-column campaign layout
  - hero image / wide image / video variants
  - countdown pre-rendering
  - tier images and creator images
- [x] Funding and supporter features on campaign pages
  - production phases with registry items
  - community decisions / voting
  - production diary
  - ongoing funding
  - stretch-goal-gated tiers with unlock animations
  - Hand Relations production launch

**Pledging and supporter management**

- [x] No-account supporter management flow
  - magic-link architecture
  - pledge success / cancelled pages
  - `/manage/` dashboard
  - supporter-only `/community/:slug/` access with session-scoped supporter tokens
  - pledge history tracking
- [x] Flexible pledge composition
  - support items and custom amounts flowing cart → Worker → KV → stats
  - live support-item stats tracking
  - multi-tier pledge support via `additionalTiers`
  - non-stackable tier support
  - post/live Manage Pledge support-item display rules
- [x] Physical reward fulfillment basics
  - first-party physical-item detection
  - physical-tier shipping
  - checkout autofill and shipping-address support

**Payments, inventory, and reporting**

- [x] First-party Stripe checkout and payment-method updates
  - native on-site Stripe payment step in the second checkout sidecar
  - `Update Card` using the same secure pattern
  - fully automated checkout E2E coverage
  - post-persistence live-stats/inventory refresh handling
  - checkout hardening around storage, caching, origin checks, and recovery retries
- [x] Inventory integrity and campaign accounting
  - live stats API
  - limited-tier inventory tracking
  - Durable-Object-backed oversell protection for scarce tiers
  - stats recalculation support for `additionalTiers`
- [x] Reporting and supporter communications
  - milestone notifications
  - tip-aware emails with full subtotal/tip/tax/shipping breakdowns
  - ledger-style pledge reports and fulfillment CSV exports
  - shipping included in reporting

**Creator tooling and content**

- [x] Pages CMS integration for campaign editing
  - block-based content editing
  - polymorphic block schema
  - datetime picker for diary entries
  - full campaign schema for tiers, stretch goals, support items, diary, and decisions
- [x] Documentation consolidation and internal runbooks

**Quality, accessibility, and design system**

- [x] Automated quality baseline
  - Vitest unit coverage
  - Playwright E2E coverage
  - stronger merge gate and local smoke coverage
- [x] Accessibility compliance milestone
  - stronger dialog, tab, tip-slider, error, and live-region semantics
  - axe-backed critical-surface coverage
  - broader browser accessibility coverage across campaign, community, pledge-result, About, and Terms states
- [x] Typography, elements, and layouts redesign
  - shared tokens, typography, buttons, fields, and surfaces
  - aligned public pages, campaign pages, cart / checkout, and Manage Pledge styling
  - removal of stale parallel styling
- [x] Mobile responsiveness pass
  - focused audit-and-polish work rather than a redesign
  - shared responsive fixes across campaign pages, cart / checkout, Manage Pledge, Update Card, community pages, and long-form content
  - mobile browser regressions for overflow, scrollability, and reachable primary actions
- [x] Variable-first customization for forks
  - canonical `platform`, `pricing`, `design`, `checkout`, and `cache` settings
  - auto-synced Worker mirroring from `_config.yml` / `_config.local.yml` into `worker/wrangler.toml`
  - curated CSS theme-variable bridge via `assets/theme-vars.css`
  - configurable core brand assets and documented no-code customization surface

## Planned

- [ ] Admin dashboard page (read-only) from KV data
  - Super admin and per-campaign users
  - Magic link auth
  - Variable customizability
- [ ] Replace Pages CMS with dedicated content editor and per-campaign permissions
  - Review Pages CMS GitHub repo for a starting place
  - Super admin and per-campaign users
  - Magic link auth
  - Block-based with the ability to preview campaign content
- [ ] Shipping calculator to replace flat rate
  - Support USA, Europe, Canada, Australia, Mexico, other countries in the Americas, Japan, South Korea
- [ ] Non-Stripe tax calculator to replace flat rate sales tax
  - Support USA, Europe, Canada, Australia, Mexico, other countries in the Americas, Japan, South Korea
- [ ] Developer FAQ based on internal documentation
- [ ] Marketing landing page for the platform on a different domain
- [ ] i18n completion with a Spanish language translation available
- [ ] Platform-wide add-on products for backer upsells

## Known Issues

**Credit Card Autofill**: CC number, expiry, and CVV fields are inside Stripe's iframe for PCI compliance — not accessible to our autofill scripts.
