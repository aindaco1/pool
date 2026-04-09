# Contributing to The Pool

## Getting Started

### Prerequisites
- Podman for the recommended local path, or:
- Ruby + Bundler (for host Jekyll)
- Node.js (for Worker + scripts)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (for host Worker development)
- optional: [Stripe CLI](https://stripe.com/docs/stripe-cli) (for webhook testing)

### Local Development

```bash
npm run podman:doctor
./scripts/dev.sh --podman
```

That is the default local development path. It keeps the standard local ports and local state files, but runs Jekyll and Wrangler inside containers so new forks do not need host Ruby or host Wrangler just to boot the app.

If you need the host-only path instead:

```bash
bundle install
bundle exec jekyll serve --config _config.yml,_config.local.yml
```

If you want to run the checkout helper or browser suite against the same Podman-backed stack:

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

`./scripts/test-e2e.sh --podman` is now fully automated browser coverage. `./scripts/test-checkout.sh --podman` remains the manual interactive helper when you want to step through a real checkout in your own browser.

Clear cache if styles don't update:
```bash
bundle exec jekyll clean
```

### Read the Docs (in order)

1. Root `README.md` — High-level purpose & architecture
2. `docs/PROJECT_OVERVIEW.md` — How all parts fit together
3. `docs/WORKFLOWS.md` — Pledge lifecycle, magic links & charge flow
4. `docs/DEV_NOTES.md` — Integration notes, content model & gotchas
5. `docs/TESTING.md` — Full testing guide (includes secrets setup)
6. `docs/ROADMAP.md` — Planned features
7. `docs/CMS.md` — Pages CMS setup & campaign editing

### GitHub Pages Setup

1. Create repo and add files
2. Add CNAME file: `pool.dustwave.xyz`
3. DNS (Cloudflare):

| Type | Name | Value |
|------|------|--------|
| CNAME | pool | `<username>.github.io` |

4. Enable HTTPS in repo settings
5. Verify the first-party cart loads and campaigns render
6. Verify Worker-backed checkout boot config is present

---

## Current Status (Apr 2026)

✅ **Completed:**
- Jekyll + first-party cart site structure
- Sass styling system (15 modular partials, 8px grid)
- Money formatting plugin (`$3,800` style)
- Campaign cards, two-column layout, hero variants
- Production phases, community decisions, production diary
- Pledge UX, cart icon, first-party checkout review
- Native first-party Stripe payment flow in the existing checkout sidecar
- No-account pledge management (magic links, `/manage/` page)
- On-site `Update Card` flow in `/manage/`
- Supporter-only community page with voting
- Non-stackable tier support (hide quantity controls in cart)
- Mobile hamburger/cart overlay handling
- Cloudflare Worker (pledge storage, stats, inventory, emails)
- Worker cron trigger for auto-settle (midnight MT)
- Aggregated charging (one charge per supporter per campaign)
- Support items and custom amounts data flow (cart → Worker → KV → stats)
- Countdown timer pre-rendering (no "00 00 00 00" flash)
- Multi-tier pledge support (`additionalTiers`)
- Unit tests (Vitest) and E2E tests (Playwright)
- Fully automated checkout E2E coverage
- Production campaign launch (Hand Relations)
- Podman-backed local dev/testing path
- More explicit inventory overselling protection via Durable Object coordination
- Pages CMS integration for visual campaign editing

🚧 **In Progress:**
_(None currently)_

---

## Branching & PRs

### Branch Naming
- Feature branches: `feat/<short-name>` (e.g., `feat/pledge-hook`)
- Fix branches: `fix/<short-name>`
- Docs branches: `docs/<short-name>`

### Commit Style
- Conventional prefixes: `feat`, `fix`, `docs`, `chore`, `infra`

### Pull Requests
- Keep PRs focused and under ~300 lines when possible
- Fill out the PR template, include screenshots for UI changes
- Link issues with `Closes #123`

### Labels
- `feature`, `bug`, `task`, `infra`, `docs`, `security`

---

## First Contribution Checklist

- [ ] Clone repo, run `npm run podman:doctor`
- [ ] Start local dev with `./scripts/dev.sh --podman`
- [ ] Only use the host-only Jekyll/Wrangler path if you intentionally need it
- [ ] Skim `_layouts/` & `_includes/` to see first-party cart integration
- [ ] Review `assets/js/` cart & pledge scripts
- [ ] Read `worker/src/` to understand the backend (pledge storage, stats, charging)
- [ ] Verify `CNAME` is set to `pool.dustwave.xyz`

---

## Secrets & Config (Test Mode First)

- **GitHub Actions**: Add test `STRIPE_SECRET_KEY` + `CHECKOUT_INTENT_SECRET`
- **Cloudflare Worker**: Same secrets as env vars; set `SITE_BASE`
- **Stripe**: For hosted environments, create a webhook to `https://pledge.dustwave.xyz/webhooks/stripe`
- **Local custom checkout**: add `STRIPE_PUBLISHABLE_KEY_TEST` to `worker/.dev.vars`

See [TESTING.md](TESTING.md) for full secrets reference.

---

## Security Notes

- Secrets live only in GitHub Actions + Cloudflare vars; never in repo
- Validate Stripe webhook signatures
- Never commit API keys or tokens

---

## Glossary

| Term | Definition |
|------|------------|
| **Pledge** | Order placed with no immediate charge; card saved via Stripe SetupIntent |
| **All-or-Nothing** | Cards charged only if `pledged_amount >= goal_amount` at deadline |
| **SetupIntent** | Stripe object to save a payment method for later off-session charges |
| **Magic Link** | HMAC-signed URL sent via email for accountless pledge management |
| **The Pool** | Platform name for the crowdfunding site |
| **Dust Wave** | Company name (two words, not "DustWave") |

---

## Contact & Ownership

Use the project docs and existing git history for context, and keep changes scoped and well-tested before opening a PR.

---

_Last updated: April 2026_
