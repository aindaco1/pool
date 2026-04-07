# AGENTS

This document outlines the major responsibilities for the **pool.dustwave.xyz** project. Treat these as role descriptions rather than assignments to any one specific person or tool.

## Roles

### 1. Project Maintainer
- Owns repository settings, GitHub Pages, and environment secrets.
- Oversees updates to the campaign model and content strategy.
- Handles onboarding and handoffs.

### 2. Implementation Lead
- Builds and maintains Jekyll templates and Sass styling (15 modular partials).
- Maintains the first-party cart runtime and Dust Wave custom JS.
- Connects front-end pledge flow to the Worker `/checkout-intent/start` endpoint.
- Maintains cart, checkout, and manage-page UX for tip-aware totals and locked pledge states.

### 3. Cloudflare Worker Maintainer
- Maintains `pledge.dustwave.xyz` Worker.
- Creates Stripe Checkout Sessions (setup mode) and handles Stripe webhooks.
- Stores pledges in Cloudflare KV (tiers, support items, custom amounts, tip data, Stripe IDs).
- Manages live stats, tier inventory, and support item tracking.
- Maintains Worker cron for auto-settle (charges pledges at midnight MT when funded).
- Owns pledge emails, recovery flows, report data, and tip-inclusive settlement totals.

### 4. GitHub Actions Maintainer
- Manages deploy workflow for GitHub Pages.
- Configures repository secrets for Worker deployment.
- Ensures `ADMIN_SECRET` is set for automated diary email broadcasts.

### 5. Content Editor
- Creates/edits campaigns via [Pages CMS](https://app.pagescms.org) or directly in `_campaigns/<slug>.md`.
- Updates goals, stretch goals, tiers, diary entries, and community decisions.
- Uploads images to `assets/images/campaigns/<slug>/`.
- Keeps public-facing copy current across campaign pages, Terms, About, and supporter communications.
- See [CMS.md](CMS.md) for the visual editing guide.

### 6. Security/Compliance Steward
- Rotates and audits secrets (Stripe, Worker signing, admin, email).
- Verifies webhook signing and domain allowlists.
- Reviews Terms & Creative Guidelines for compliance.

## Handoff Checklist
- [ ] Repo access and Pages enabled.
- [ ] CNAME set to `pool.dustwave.xyz`.
- [ ] First-party cart runtime loads and opens from campaign pages without console errors.
- [ ] Cloudflare Worker deployed (`pledge.dustwave.xyz`) with secrets set.
- [ ] Stripe webhook configured for Worker endpoint.
- [ ] GitHub Action secrets (`ADMIN_SECRET`) in place for diary broadcasts.
- [ ] Successful $1 test pledge end-to-end in Stripe test mode.
- [ ] Live stats updating correctly (`/stats/:slug`).
- [ ] Support items, custom amounts, and platform tips tracked correctly in KV.
- [ ] Pages CMS access granted (via [app.pagescms.org](https://app.pagescms.org)).
