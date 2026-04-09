# AGENTS

This document outlines the major responsibilities for the **pool.dustwave.xyz** project. Treat these as role descriptions rather than assignments to any one specific person or tool.

Current project context:

- The Pool now uses an on-site Stripe payment step inside the existing second checkout sidecar.
- `/manage/` uses the same secure pattern for `Update Card`.
- Podman-backed local development and testing are first-class, with `./scripts/dev.sh --podman` as the easiest local boot path.
- Checkout/browser coverage is now fully automated in the normal E2E suite.

## Roles

### 1. Project Maintainer
- Owns repository settings, GitHub Pages, and environment secrets.
- Oversees updates to the campaign model and content strategy.
- Handles onboarding and handoffs.

### 2. Implementation Lead
- Builds and maintains Jekyll templates and the shared Sass design system.
- Maintains the first-party cart runtime and Dust Wave custom JS.
- Connects front-end pledge flow to the Worker `/checkout-intent/start` endpoint.
- Maintains cart, checkout sidecars, and manage-page UX for tip-aware totals, secure on-site payment flows, and locked pledge states.

### 3. Cloudflare Worker Maintainer
- Maintains `pledge.dustwave.xyz` Worker.
- Creates setup-mode Stripe Checkout Sessions for the on-site payment flow and handles Stripe webhooks.
- Stores pledges in Cloudflare KV (tiers, support items, custom amounts, tip data, Stripe IDs).
- Manages live stats, tier inventory, support item tracking, and post-pledge cache refresh behavior.
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
- Reviews browser storage, origin checks, cache headers, and recovery/rate-limit behavior for the on-site checkout flow.
- Reviews Terms & Creative Guidelines for compliance.

## Handoff Checklist
- [ ] Repo access and Pages enabled.
- [ ] CNAME set to `pool.dustwave.xyz`.
- [ ] `npm run podman:doctor` passes, or host Jekyll/Worker tooling is installed deliberately.
- [ ] First-party cart runtime loads and opens from campaign pages without console errors.
- [ ] Cloudflare Worker deployed (`pledge.dustwave.xyz`) with secrets set.
- [ ] Stripe webhook configured for Worker endpoint.
- [ ] `STRIPE_PUBLISHABLE_KEY_TEST` is available for local custom checkout testing.
- [ ] GitHub Action secrets (`ADMIN_SECRET`) in place for diary broadcasts.
- [ ] Successful $1 test pledge end-to-end in Stripe test mode.
- [ ] Live stats updating correctly (`/stats/:slug`).
- [ ] Support items, custom amounts, and platform tips tracked correctly in KV.
- [ ] Pages CMS access granted (via [app.pagescms.org](https://app.pagescms.org)).
