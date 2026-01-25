# Contributing to The Pool

## Getting Started

### Prerequisites
- Ruby + Bundler (for Jekyll)
- Node.js (for Worker + scripts)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (for Cloudflare Worker)
- [Stripe CLI](https://stripe.com/docs/stripe-cli) (for webhook testing)

### Local Development

```bash
bundle install
bundle exec jekyll serve
# Visit http://localhost:4000
```

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
5. Snipcart dashboard: allow domain and set Public API key
6. Verify cart loads and campaigns render

---

## Current Status (Jan 2026)

✅ **Completed:**
- Jekyll + Snipcart v3 site structure
- Sass styling system (15 modular partials, 8px grid)
- Money formatting plugin (`$3,800` style)
- Campaign cards, two-column layout, hero variants
- Production phases, community decisions, production diary
- Pledge UX, cart icon, checkout autofill
- No-account pledge management (magic links, `/manage/` page)
- Supporter-only community page with voting
- Non-stackable tier support (hide quantity controls in cart)
- Mobile hamburger/Snipcart overlay z-index handling
- Cloudflare Worker (pledge storage, stats, inventory, emails)
- Worker cron trigger for auto-settle (midnight MT)
- Aggregated charging (one charge per supporter)
- Support items and custom amounts data flow (cart → Worker → KV → stats)
- Countdown timer pre-rendering (no "00 00 00 00" flash)
- Multi-tier pledge support (`additionalTiers`)
- Unit tests (Vitest) and E2E tests (Playwright)
- Production campaign launch (Hand Relations)
- Pages CMS integration for visual campaign editing

🚧 **In Progress:**
_(None currently)_

---

## Branching & PRs

### Branch Naming
- Feature branches: `amp/<short-name>` (e.g., `amp/pledge-hook`)

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

- [ ] Clone repo, run `bundle exec jekyll serve` to preview
- [ ] Skim `_layouts/` & `_includes/` to see Snipcart integration
- [ ] Review `assets/js/` cart & pledge scripts
- [ ] Read `worker/src/` to understand the backend (pledge storage, stats, charging)
- [ ] Verify `CNAME` is set to `pool.dustwave.xyz`

---

## Secrets & Config (Test Mode First)

- **GitHub Actions**: Add test `STRIPE_SECRET_KEY` + `SNIPCART_SECRET`
- **Cloudflare Worker**: Same secrets as env vars; set `SITE_BASE`
- **Snipcart dashboard**: Allow `pool.dustwave.xyz` + localhost for testing
- **Stripe**: Create webhook to `https://pledge.dustwave.xyz/webhooks/stripe`

See [TESTING.md](TESTING.md) for full secrets reference.

---

## Security Notes

- Secrets live only in GitHub Actions + Cloudflare vars; never in repo
- Validate Stripe webhook signatures
- Restrict Snipcart allowed domains to `pool.dustwave.xyz`
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

See [AGENTS.md](AGENTS.md) for roles and responsibilities.

---

_Last updated: Jan 2026_
