# AGENTS

This document outlines who does what for the **pool.dustwave.xyz** project.

## Roles

### 1. Project Maintainer
- Owns repository settings, GitHub Pages, and environment secrets.
- Oversees updates to the campaign model and content strategy.
- Handles onboarding and handoffs.

### 2. Amp (Implementation Lead)
- Builds and maintains Jekyll templates and Sass styling (15 modular partials).
- Integrates Snipcart v3 and Dust Wave custom JS.
- Connects front-end pledge flow to the Worker `/start` endpoint.

### 3. Cloudflare Worker Maintainer
- Maintains `pledge.dustwave.xyz` Worker.
- Creates Stripe Checkout Sessions (setup mode) and handles Stripe webhooks.
- Stores pledges in Cloudflare KV (tiers, support items, custom amounts, Stripe IDs).
- Manages live stats, tier inventory, and support item tracking.
- Maintains Worker cron for auto-settle (charges pledges at midnight MT when funded).

### 4. GitHub Actions Maintainer
- Manages deploy workflow for GitHub Pages.
- Configures repository secrets for Worker deployment.
- Ensures `ADMIN_SECRET` is set for automated diary email broadcasts.

### 5. Content Editor
- Creates/edits `_campaigns/<slug>.md`.
- Updates goals, stretch goals, and tier info.
- Publishes Markdown updates and manages image assets.

### 6. Security/Compliance Steward
- Rotates and audits secrets (Stripe, Snipcart).
- Verifies webhook signing and domain allowlists.
- Reviews Terms & Creative Guidelines for compliance.

## Handoff Checklist
- [ ] Repo access and Pages enabled.
- [ ] CNAME set to `pool.dustwave.xyz`.
- [ ] Snipcart public key configured in `_includes/snipcart-foot.html`.
- [ ] Cloudflare Worker deployed (`pledge.dustwave.xyz`) with secrets set.
- [ ] Stripe webhook configured for Worker endpoint.
- [ ] GitHub Action secrets (`ADMIN_SECRET`) in place for diary broadcasts.
- [ ] Successful $1 test pledge end-to-end in Stripe test mode.
- [ ] Live stats updating correctly (`/stats/:slug`).
- [ ] Support items and custom amounts tracked in KV.
