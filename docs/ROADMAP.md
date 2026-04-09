# Roadmap

## Completed

- [x] Sass-based design system (8px grid, dust-wave-shop styling)
- [x] Branding update ("The Pool" platform, "Dust Wave" company)
- [x] Money formatting plugin (`$3,800` style)
- [x] Campaign card uniformity with featured tier preview
- [x] Campaign sorting (active by deadline, completed by recency)
- [x] Two-column campaign layout with sidebar
- [x] Hero image variants (`hero_image`, `hero_image_wide`, `hero_video`)
- [x] Production phases with registry items (tabbed UI)
- [x] Community decisions (voting/polling)
- [x] Production diary section
- [x] Ongoing funding section
- [x] Pledge UX clarification ("Pledge $X" buttons, notice explaining all-or-nothing)
- [x] Cart icon with total in header
- [x] Tier images and creator images support
- [x] Checkout autofill (auto-select country, password manager state/address support)
- [x] No-account pledge management architecture (magic links, Worker API design)
- [x] Pledge management page (`/manage/`)
- [x] Pledge success/cancel pages
- [x] Supporter-only community page (`/community/:slug/`) with Worker verification and session-scoped supporter token storage
- [x] Community voting system with Cloudflare KV (no database)
- [x] Sass refactor (modular partial architecture extracted from a single 3,500-line file)
- [x] Documentation consolidation (15 → 7 focused docs)
- [x] Non-stackable tier support (hide quantity controls for `stackable: false` tiers)
- [x] Mobile hamburger/cart overlay z-index fix
- [x] Cloudflare Worker deployment (pledge storage, stats, inventory, emails)
- [x] Worker cron trigger for auto-settle (midnight MT)
- [x] Aggregated charging (one charge per supporter per campaign, not per pledge row)
- [x] Mountain Time deadline handling (DST-aware via `Intl.DateTimeFormat` across frontend + Worker)
- [x] Physical tier shipping ($3 per campaign with physical rewards, address capture during checkout)
- [x] First-party physical-item detection (`category: physical` / `shippable` cart metadata)
- [x] Tip Jar / platform tip feature (0% to 15%, default 5%, excluded from campaign progress)
- [x] Email templates with full breakdown (subtotal, optional tip, tax, shipping, total)
- [x] Shipping in pledge reports (fulfillment + ledger CSVs)
- [x] Live stats API (`/stats/:slug`)
- [x] Tier inventory tracking (limited tiers)
- [x] Milestone email notifications (1/3, 2/3, goal, stretch goals)
- [x] Pledge history tracking (created, modified, cancelled events)
- [x] Pledge reports (ledger-style and fulfillment CSV exports)
- [x] Auto state transitions (`start_date` → live, `goal_deadline` → post)
- [x] i18n scaffolding (translation helper, en.yml, example templates)
- [x] Accessibility infrastructure (skip link, ARIA landmarks, focus states, sr-only)
- [x] Tier gating by stretch goal with visual "Unlocked!" animations
- [x] Unit test suite (Vitest) for live-stats.js functions
- [x] E2E test suite (Playwright) for checkout flows
- [x] Support items and custom amounts data flow (cart → Worker → KV → stats)
- [x] Live support item stats tracking (`updateSupportItemStats()`)
- [x] Countdown timer pre-rendering (Jekyll build-time calculation to avoid "00 00 00 00" flash)
- [x] Manage page support items display (all items during live, late_support only during post)
- [x] Multi-tier pledge support (`additionalTiers` in pledge records)
- [x] Stats recalculation fix for `additionalTiers`
- [x] Production campaign launch (Hand Relations)
- [x] Podman-backed local dev/testing path
  - rootless Jekyll + Worker containers via `./scripts/dev.sh --podman`
  - containerized automated Playwright via `npm run test:e2e:headless:podman`
  - Podman-aware smoke/report helpers and `npm run podman:doctor` / `npm run podman:self-check`
- [x] More explicit inventory overselling protection
  - scarce limited-tier reservations and committed claims now flow through a per-campaign Durable Object coordinator
  - `tier-inventory:{slug}` remains a KV projection for public reads, not the source of truth
  - coordinator calls stay on write/admin paths so the design remains compatible with Workers Free-plan usage
- [x] Replace hosted Stripe Checkout with a native first-party Stripe flow
  - the existing second checkout sidecar now hosts Stripe-powered on-site payment UI instead of forcing a full-page handoff
  - `Update Card` on `/manage/` now uses the same secure payment pattern
  - checkout E2E coverage is now fully automated, with the old manual Stripe handoff cases removed
  - successful checkout now invalidates live stats/inventory caches and leaves a short-lived refresh marker so campaign totals refresh reliably after pledge persistence
  - recent hardening trimmed long-lived browser PII, tightened sensitive Worker response caching, added origin checks, and added a dedicated retry budget for checkout completion recovery
- [x] Pages CMS integration for visual campaign editing
  - Block-based content editing (text, image, quote, gallery, divider)
  - Polymorphic fields with `type: block` and `blockKey`
  - Datetime picker for diary entries
  - Full campaign schema (tiers, stretch goals, support items, diary, decisions)
- [x] Accessibility compliance
  - dialog, tab, tip-slider, and critical error/live-region semantics are now meaningfully stronger
  - axe-backed unit coverage exists for the cart drawer, Manage Pledge dialogs, and campaign-page semantics
  - broader browser accessibility coverage now includes public campaign, community, and pledge-result states, the About and Terms pages, and keyboard-only checkout/manage/community/public-control assertions
  - the remaining manual assistive-technology review is follow-up polish, not a blocker for the current accessibility milestone
- [x] Typography, elements, and layouts redesign
  - shared tokens, typography, buttons, fields, and surface primitives now underpin the active Sass system
  - public pages, campaign surfaces, cart / checkout, and Manage Pledge now share the same calmer visual vocabulary
  - stale parallel styling was removed so new visual work can continue from one active design system instead of multiple competing ones

## In Progress

_(None currently)_

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
- [ ] Make the platform variable-first for maximum customizability for forks
- [ ] Mobile responsiveness pass
- [ ] Developer FAQ based on internal documentation
- [ ] Marketing landing page for the platform on a different domain
- [ ] i18n completion with a Spanish language translation available

## Known Issues

**Credit Card Autofill**: CC number, expiry, and CVV fields are inside Stripe's iframe for PCI compliance — not accessible to our autofill scripts.
