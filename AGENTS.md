# AGENTS

This is the operating guide for people and coding agents working on **The Pool**. Use it to make safe changes without drifting the static site, Cloudflare Worker, checkout math, private administration, or localized behavior out of sync.

Read it alongside:

- [README.md](./README.md) for the product and architecture overview
- [docs/CUSTOMIZATION.md](./docs/CUSTOMIZATION.md) for the supported fork-facing configuration surface
- [docs/PAYMENT_PROCESSOR.md](./docs/PAYMENT_PROCESSOR.md) for Stripe, canonical checkout, webhooks, settlement, and reconciliation
- [docs/ADD_ON_PRODUCTS.md](./docs/ADD_ON_PRODUCTS.md) for platform, campaign, and variant-specific add-on pricing
- [docs/DASHBOARD.md](./docs/DASHBOARD.md) for private administration and editing
- [docs/PERFORMANCE.md](./docs/PERFORMANCE.md) for budgets, Lighthouse, caching, and runtime observability
- [docs/SECURITY.md](./docs/SECURITY.md) for security boundaries and release checks
- [docs/BACKUP_RESTORE.md](./docs/BACKUP_RESTORE.md) for backup, restore, and disaster recovery
- [docs/TESTING.md](./docs/TESTING.md) for local verification and merge gates
- [docs/ROADMAP.md](./docs/ROADMAP.md) for planned and completed work

## Project shape

The Pool is a split system:

- Jekyll, Sass, and browser JavaScript build the static site published through GitHub Pages.
- The Cloudflare Worker in `worker/` owns APIs, canonical checkout validation, pledge persistence, emails, live statistics, settlement, share cards, and privileged administration.
- Stripe collects payments and stores payment methods.
- Campaign configuration lives primarily in `_campaigns/`; platform settings and products live in `_config.yml`.
- The private dashboard is the supported browser surface for settings, add-ons, campaigns, reports, analytics, supporters, marketing links, diagnostics, and users.

If a change affects pricing, availability, campaign progress, pledge state, email content, or live campaign status, assume both the site and Worker are involved even when the symptom appears on only one side.

## Sources of truth

- [`_config.yml`](./_config.yml): canonical fork-facing platform configuration
- [`_config.local.yml`](./_config.local.yml): machine-local overrides only
- [`_campaigns/`](./_campaigns): campaign content, tiers, goals, diary data, and campaign add-ons
- [`_data/i18n/`](./_data/i18n): shared localized UI, runtime, and email copy
- [`_layouts/`](./_layouts) and [`_includes/`](./_includes): public pages, campaign pages, embeds, SEO, and locale helpers
- [`assets/`](./assets): browser runtime, Sass, themes, and generated localized assets
- [`worker/src/`](./worker/src): authoritative checkout, webhooks, statistics, emails, settlement, administration, and reports
- [`worker/wrangler.toml`](./worker/wrangler.toml): Worker environment wiring and mirrored defaults
- [`config/performance-budgets.json`](./config/performance-budgets.json): executable public and runtime performance thresholds
- [`config/pool-data-inventory.json`](./config/pool-data-inventory.json): data classification, retention, and recovery inventory
- [`tests/`](./tests): unit, security, accessibility, and end-to-end contracts
- [`scripts/`](./scripts): local development, release gates, smoke tests, audits, and synchronization
- [`docs/release-evidence/`](./docs/release-evidence): release-specific verification records

## Safe workflow

Inspect `git status` before editing. Existing changes belong to the user unless the task explicitly includes them; do not overwrite, discard, or silently include them in a commit.

For normal local development:

```bash
npm run podman:doctor
./scripts/dev.sh --podman
```

Use the narrowest focused test that proves a change, then run the complete pre-merge gate for a substantial or release-facing change:

```bash
npm run test:premerge
```

Useful focused checks include:

- `bundle exec jekyll build --quiet`
- `npx vitest run <targeted test files>`
- `node --check <changed JavaScript file>`
- `npx playwright test tests/e2e/admin-dashboard.spec.ts --project=chromium`
- `npm run test:performance:budgets`
- `npm run test:performance:lighthouse`
- `npm run test:performance:runtime -- --input=<redacted-observability.json>`
- `npm run test:cache-policy`
- `npm run production:posture -- --no-dev-vars`
- `npm run release:smoke -- --evidence-file <path>`

Production posture, cache, and release-smoke results are only complete when their required provider credentials and secrets were available. Record omissions explicitly in release evidence.

## Common change paths

### Campaigns

Use the dashboard **Campaigns** tab for normal edits. The underlying sources are `_campaigns/<slug>.md` and `assets/images/campaigns/<slug>/`.

Verify funding and stretch-goal math, tier inventory, physical-reward shipping, localized routing, embeds, and share previews.

### Branding, settings, and products

Use dashboard **Settings** and **Add-ons** for normal edits. Published settings and platform add-ons ultimately write back to `_config.yml` through the Worker-controlled GitHub path. Admin users and saved marketing referral codes are runtime exceptions stored in Worker KV.

When mirrored settings change, restart the local stack or run:

```bash
npm run sync:worker-config
```

Product-level add-on price is the default. A variant may inherit it or publish its own override between `$0` and the canonical `$1,000,000` ceiling. Keep dashboard normalization, public cart display, Worker validation, and documentation aligned.

### Checkout and pledge management

Start with browser code in `assets/js/`, templates in `_includes/` and `_layouts/`, Worker code in `worker/src/`, and [docs/PAYMENT_PROCESSOR.md](./docs/PAYMENT_PROCESSOR.md).

Keep subtotal, variant price overrides, tips, tax, shipping, campaign contribution, persisted pledge data, emails, and reports aligned. The browser proposes state; the Worker resolves products and prices and decides canonical totals.

### Email and supporter communication

Check Worker mail logic, `_data/i18n/`, sender configuration, and [docs/EMAIL.md](./docs/EMAIL.md). Preserve domain alignment, `reply_to`, plain-text output, hosted media URLs, and the boundary between transactional and promotional content.

### Embeds, SEO, and share cards

Check `embed/`, `_layouts/campaign-embed.html`, `assets/js/campaign-embed.js`, `assets/partials/_embed.scss`, Worker share-card code, `_includes/seo-meta.html`, and the embed/SEO docs. Keep campaign-page, embed, and preview state conceptually aligned.

### Localization

Shared system strings belong in `_data/i18n/<lang>.yml`; creator-authored campaign content normally remains campaign content. New public routes and flows must account for locale helpers, localized campaign generation, and the footer language switcher.

## Invariants to protect

1. **`_config.yml` is canonical.** Do not create a second product source of truth in local config or browser state.
2. **Worker-mirrored settings stay synchronized.** Pricing, URLs, sender identity, and other mirrored values must match the site.
3. **Checkout totals are server-verified.** New or changed product/variant selections use current catalog pricing; an unchanged saved product/variant may preserve its historical `unitPrice`. Catalog and persisted cent amounts must remain within the Worker amount limit.
4. **Campaign progress has a precise boundary.** Tiers, direct campaign support, custom campaign amounts, and campaign add-ons count. Platform add-ons, platform tip, tax, and shipping do not.
5. **Localized routes are a public contract.** Preserve locale routing and token/query behavior.
6. **Private flows stay private.** Management, pledge result, protected preview, authenticated admin, and performance-observability responses must remain non-indexable and use private/no-store cache controls where applicable. Preview allowlists belong only in short-lived Worker KV.
7. **Ended campaigns do not behave as live.** Countdown, pledge, embed, and preview behavior must use effective campaign state.
8. **Performance thresholds are executable.** A value in configuration is not a gate until a test or audit consumes it. Distinguish measured baseline from the release threshold, use route-specific public budgets, and keep authenticated runtime evidence free of secrets and personal data.
9. **Dependency findings are scoped and resolved deliberately.** Run the production audit and the full audit. Pin or replace vulnerable release tooling when a safe supported version exists; document any accepted dev-only finding.
10. **Ethical review travels with product changes.** Review money, data, messaging, analytics, automation, admin power, visibility, and shareability while the implementation is still easy to change.

## Documentation map

- Fork configuration: [docs/CUSTOMIZATION.md](./docs/CUSTOMIZATION.md)
- Payments and settlement: [docs/PAYMENT_PROCESSOR.md](./docs/PAYMENT_PROCESSOR.md)
- Add-on products and variant pricing: [docs/ADD_ON_PRODUCTS.md](./docs/ADD_ON_PRODUCTS.md)
- Email: [docs/EMAIL.md](./docs/EMAIL.md)
- Testing: [docs/TESTING.md](./docs/TESTING.md)
- Podman: [docs/PODMAN.md](./docs/PODMAN.md)
- Localization: [docs/I18N.md](./docs/I18N.md)
- SEO and previews: [docs/SEO.md](./docs/SEO.md)
- Campaign embeds: [docs/EMBEDS.md](./docs/EMBEDS.md)
- Shipping: [docs/SHIPPING.md](./docs/SHIPPING.md)
- Dashboard: [docs/DASHBOARD.md](./docs/DASHBOARD.md)
- Performance: [docs/PERFORMANCE.md](./docs/PERFORMANCE.md)
- Security: [docs/SECURITY.md](./docs/SECURITY.md)
- Backup and recovery: [docs/BACKUP_RESTORE.md](./docs/BACKUP_RESTORE.md)
- Ethical risk: [docs/ETHICAL_RISK.md](./docs/ETHICAL_RISK.md)
- Merge and release checks: [docs/MERGE_SMOKE_CHECKLIST.md](./docs/MERGE_SMOKE_CHECKLIST.md)

## Working style for coding agents

- Read the implementation and nearby tests before proposing structural changes.
- Prefer small, local edits that preserve established patterns and stay DRY.
- Update tests and operator docs whenever behavior or release expectations change.
- Consider public site, Worker, email, localization, accessibility, security, performance, and recovery consequences together.
- Reuse an existing configuration surface or helper before inventing another.
- Never silently drop locale, embed, share-preview, private-cache, or historical-price behavior.
- Preserve unrelated user changes and stage only files in scope.

When uncertain, make the smallest change that keeps the site and Worker aligned, prove it with the narrowest meaningful test, and run the broader gate when warranted.
