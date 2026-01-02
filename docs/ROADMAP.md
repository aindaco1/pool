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
- [x] Supporter-only community page (`/community/:slug/`) with token + cookie auth
- [x] Community voting system with Cloudflare KV (no database)
- [x] Sass refactor (15 modular partials from single 3,500-line file)
- [x] Documentation consolidation (15 → 7 focused docs)
- [x] Non-stackable tier support (hide quantity controls for `stackable: false` tiers)
- [x] Mobile hamburger/Snipcart overlay z-index fix
- [x] Cloudflare Worker deployment (pledge storage, stats, inventory, emails)
- [x] Worker cron trigger for auto-settle (midnight MT)
- [x] Aggregated charging (one charge per supporter, not per pledge)
- [x] Mountain Time deadline handling
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

## In Progress

_(None currently)_

## Planned

- [ ] Admin dashboard page (read-only) from KV data
- [ ] Decap CMS config for editing campaigns via GitHub UI

## Known Issues

**Snipcart Custom Field Validation on Localhost**: Required custom fields may fail validation locally because Snipcart can't crawl `127.0.0.1`. Workaround: make fields optional for local testing, or test on deployed site.

**Credit Card Autofill**: CC number, expiry, and CVV fields are inside Stripe's iframe for PCI compliance — not accessible to our autofill scripts.
