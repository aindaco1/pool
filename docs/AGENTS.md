# AGENTS

This document is for people and LLMs working on forks of **The Pool**. It is a practical operator guide for making safe changes in this repo without drifting the site, the Worker, checkout math, or localized/public behavior out of sync.

Use this alongside:

- [README.md](../README.md) for the current product and architecture overview
- [docs/CUSTOMIZATION.md](./CUSTOMIZATION.md) for the supported fork-facing config surface
- [docs/TESTING.md](./TESTING.md) for local verification and merge-gate expectations
- [docs/I18N.md](./I18N.md) for locale routing and translation rules
- [docs/SEO.md](./SEO.md) for metadata, share cards, and indexing behavior
- [docs/EMBEDS.md](./EMBEDS.md) for the hosted campaign embed system

## Project Shape

The Pool is a split system:

- the static site is Jekyll + Sass + browser JavaScript, published from GitHub Pages
- the API/payment/runtime side is a Cloudflare Worker in `worker/`
- Stripe handles payment collection and saved payment methods
- content and campaign configuration mostly live in markdown/front matter under `_campaigns/`

The important boundary is:

- the site renders UI, campaign content, cart flows, localized pages, embeds, and SEO metadata
- the Worker is the canonical source for checkout validation, pledge persistence, live stats, emails, settlement, and share-card SVG generation

If a change affects pricing, campaign totals, availability, pledge state, email content, or live campaign status, assume the Worker is involved even if the first symptom is on the site.

## Source Of Truth

When you need to understand or change behavior, start here:

- [`_config.yml`](../_config.yml): canonical fork-facing configuration
- [`_config.local.yml`](../_config.local.yml): local overrides only
- [`_campaigns/`](../_campaigns): campaign content, tiers, goals, diary data, community hooks, campaign-scoped merch
- [`_data/i18n/`](../_data/i18n): shared UI/runtime/email copy by language
- [`_layouts/`](../_layouts) and [`_includes/`](../_includes): public pages, campaign pages, embeds, SEO, localized routing helpers
- [`assets/`](../assets): JS runtime, shared Sass partials, theme variables, generated i18n payload
- [`worker/src/`](../worker/src): checkout, webhooks, live stats, email sending, share previews, settlement, admin/report logic
- [`worker/wrangler.toml`](../worker/wrangler.toml): Worker env wiring mirrored from site config plus local/dev defaults
- [`tests/`](../tests): unit, security, and E2E expectations
- [`scripts/`](../scripts): local dev, merge gate, smoke tests, reports, and sync helpers

## Safe Workflow

For normal development, prefer:

```bash
npm run podman:doctor
./scripts/dev.sh --podman
```

That path keeps the site and Worker running together with the repo's expected defaults.

For final verification, use the narrowest command that proves the change, then run the broader gate before merge when the change is substantial:

```bash
./scripts/pre-merge-regression.sh
```

Useful focused checks:

- `bundle exec jekyll build --quiet`
- `npx vitest run <targeted test files>`
- `node --check <js file>`
- `./scripts/test-worker.sh --podman`
- `./scripts/test-e2e.sh --podman`

## Common Tasks

### Add or edit a campaign

Start with:

- [`_campaigns/<slug>.md`](../_campaigns)
- campaign assets under [`assets/images/campaigns/<slug>/`](../assets/images/campaigns)
- supporting docs in [docs/CMS.md](./CMS.md)

Check:

- funding goal and stretch-goal math
- tier inventory and limited quantities
- shipping settings for physical rewards
- localized/public routing if the campaign page should work cleanly under `/es/`
- embed/share-preview behavior if hero image, blurb, title, or live status changed

### Change branding or product settings

Start with:

- [`_config.yml`](../_config.yml)
- [docs/CUSTOMIZATION.md](./CUSTOMIZATION.md)

Do not put canonical fork settings in `_config.local.yml`. Keep that file for machine-local overrides like localhost URLs and local-only flags.

If you change values that are mirrored into the Worker, restart the local stack or run:

```bash
npm run sync:worker-config
```

### Change checkout, totals, or pledge-management behavior

Start with:

- site runtime in [`assets/js/`](../assets/js)
- campaign/cart/manage templates in [`_includes/`](../_includes) and [`_layouts/`](../_layouts)
- Worker checkout logic in [`worker/src/`](../worker/src)

Always assume there is a site-side piece and a Worker-side piece.

Things that must stay aligned:

- subtotal math
- tip math
- sales tax
- shipping
- add-ons
- campaign-goal contribution rules
- pledge/email/report totals

If only one side changes, you probably have a bug.

### Change emails or supporter communication

Start with:

- Worker mail logic in [`worker/src/`](../worker/src)
- translation copy in [`_data/i18n/`](../_data/i18n)
- contact/sender identity in [`_config.yml`](../_config.yml)

If you touch deliverability-sensitive behavior, also sanity-check:

- `from` domain alignment
- `reply_to`
- plain-text body generation
- transactional vs promotional content mixing

### Change embeds or rich previews

Start with:

- embed routes and layout in [`embed/`](../embed) and [`_layouts/campaign-embed.html`](../_layouts/campaign-embed.html)
- embed client/runtime in [`assets/js/campaign-embed.js`](../assets/js/campaign-embed.js)
- embed styles in [`assets/partials/_embed.scss`](../assets/partials/_embed.scss)
- Worker share cards in [`worker/src/`](../worker/src)
- SEO metadata in [`_includes/seo-meta.html`](../_includes/seo-meta.html)
- guidance in [docs/EMBEDS.md](./EMBEDS.md) and [docs/SEO.md](./SEO.md)

Keep embed state, share-preview state, and campaign-page metadata conceptually aligned even when the rendered surfaces differ.

### Add or extend a language

Start with:

- [`_config.yml`](../_config.yml) `i18n` block
- [`_data/i18n/<lang>.yml`](../_data/i18n)
- localized long-form pages like [`es/about.md`](../es/about.md) and [`es/terms.md`](../es/terms.md)
- locale helpers in [`_includes/localized-url.html`](../_includes/localized-url.html)
- generated localized campaign pages in [`_plugins/localized_campaign_pages.rb`](../_plugins/localized_campaign_pages.rb)

Shared system strings belong in `_data/i18n/{lang}.yml`.
Campaign content authored by creators should usually remain campaign content, not be moved into translation YAML.

## Invariants To Protect

These are the easiest places for forks or LLMs to accidentally cause drift.

### 1. `_config.yml` is canonical

Do not treat `_config.local.yml` as a second source of truth.

### 2. Worker-mirrored settings must stay in sync

If you change pricing, site URLs, sender identity, or other mirrored settings, make sure the Worker sees the same values.

### 3. Checkout totals are server-verified

The browser can suggest a cart state. The Worker decides the canonical totals and persisted pledge shape.

### 4. Campaign progress excludes some checkout dollars

Shipping, tax, and platform tip do not all count toward campaign funding totals. Be careful when changing display language or reports so you do not imply otherwise.

### 5. Localized routes are part of the public contract

If you add a new public page, embed route, or campaign-specific flow, check whether the locale helpers and footer language switcher need to know about it.

### 6. Tokenized/private flows should not become indexable

`/manage/`, pledge result pages, and token-bearing/private routes must stay out of search indexing and should preserve token/query behavior when switching languages.

### 7. Ended campaigns should not behave like live ones

Countdowns, pledge controls, and embed/share-preview state should respect the effective campaign state, especially after deadlines.

## Best Docs For Specific Work

- Fork config and branding: [docs/CUSTOMIZATION.md](./CUSTOMIZATION.md)
- Local dev and merge verification: [docs/TESTING.md](./TESTING.md)
- Podman setup and limits: [docs/PODMAN.md](./PODMAN.md)
- Localization model: [docs/I18N.md](./I18N.md)
- SEO and share metadata: [docs/SEO.md](./SEO.md)
- Campaign embeds: [docs/EMBEDS.md](./EMBEDS.md)
- Shipping and USPS behavior: [docs/SHIPPING.md](./SHIPPING.md)
- Add-on product model: [docs/ADD_ON_PRODUCTS.md](./ADD_ON_PRODUCTS.md)
- CMS/editor flow: [docs/CMS.md](./CMS.md)
- Security posture and guardrails: [docs/SECURITY.md](./SECURITY.md)
- Release/merge checklist mindset: [docs/MERGE_SMOKE_CHECKLIST.md](./MERGE_SMOKE_CHECKLIST.md)

## Good LLM Behavior In This Repo

If you are an LLM helping with this codebase:

- read the existing implementation before proposing structural changes
- prefer small, local edits that preserve established patterns
- update tests when behavior changes
- keep public-site, Worker, email, and i18n consequences in mind together
- avoid inventing new config surfaces when an existing one already fits
- prefer repo-relative documentation links, not machine-specific paths
- do not silently drop locale support, embed behavior, or share-preview behavior while changing campaign pages

When in doubt, make the smallest change that keeps the site and Worker aligned, then verify it with the narrowest meaningful test plus the broader gate when warranted.