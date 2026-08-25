# Contributing to The Pool

## Getting Started

### Prerequisites
- Podman for the recommended local path, or:
- Ruby + Bundler (for host Jekyll)
- Node.js 24 preferred, Node.js 22 minimum for Wrangler 4 (for Worker + scripts)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (for host Worker development)
- optional: [Stripe CLI](https://stripe.com/docs/stripe-cli) (for webhook testing)

### Local Development

```bash
npm run podman:doctor
./scripts/dev.sh --podman
```

That is the default local development path. It keeps the standard local ports and local state files, but runs Jekyll and Wrangler inside containers so new forks do not need host Ruby or host Wrangler just to boot the app.

The Podman Worker container runs Node 24, matching GitHub Actions. Host-only Worker development uses Node 24 when possible; Node 22 is the minimum supported runtime for Wrangler 4.

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

`./scripts/test-e2e.sh --podman` is fully automated browser coverage. `./scripts/test-checkout.sh --podman` remains the manual interactive helper when you want to step through a real checkout in your own browser.

Clear cache if styles don't update:
```bash
bundle exec jekyll clean
```

### Read the Docs (in order)

1. Root `README.md` — High-level purpose & architecture
2. `docs/PROJECT_OVERVIEW.md` — How all parts fit together
3. `docs/WORKFLOWS.md` — Pledge lifecycle, magic links & charge flow
4. `docs/PAYMENT_PROCESSOR.md` — Stripe setup, checkout, webhooks, settlement, and reconciliation
5. `docs/EMAIL.md` — Resend setup, email types, localization, and delivery behavior
6. `docs/ETHICAL_RISK.md` — Ethical risk review prompts for data, money, messaging, automation, public sharing, and admin power
7. `docs/DEV_NOTES.md` — Integration notes, content model & gotchas
8. `docs/TESTING.md` — Full testing guide (includes secrets setup)
9. `docs/ROADMAP.md` — Prospective work only
10. `docs/DASHBOARD.md` — Admin dashboard editing and operations

For dashboard UI changes, also skim `docs/ACCESSIBILITY.md`, `docs/I18N.md`, `docs/SECURITY.md`, and `docs/SEO.md`; the admin shell has explicit requirements for keyboard access, Spanish strings, input normalization, and `noindex`.

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

## Current Project State

The [README](../README.md) describes the current user-facing and operational
baseline. The [Changelog](../CHANGELOG.md) records completed and unreleased
changes, while the [Roadmap](./ROADMAP.md) contains prospective work. Do not
maintain a second dated capability or active-focus list in this guide.

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
- Fill out the PR template, include screenshots for UI changes, and include desktop/tablet/mobile screenshots for admin dashboard layout changes
- Include an Ethical Risk review when a PR changes money, data collection, supporter messaging, admin access, public sharing, automation, analytics, or engagement mechanics
- Link issues with `Closes #123`

### Labels
- `feature`, `bug`, `task`, `infra`, `docs`, `security`

---

## First Contribution Checklist

- [ ] Clone repo, run `npm run podman:doctor`
- [ ] Start local dev with `./scripts/dev.sh --podman`
- [ ] Confirm Worker local dev is running on Node 24 through the Podman path
- [ ] Only use the host-only Jekyll/Wrangler path if you intentionally need it
- [ ] Skim `_layouts/` & `_includes/` to see first-party cart integration
- [ ] Review `assets/js/` cart & pledge scripts
- [ ] Read `worker/src/` to understand the backend (pledge storage, stats, charging)
- [ ] Open `/admin/` locally with the default dev admin email path and understand the dashboard publish vs KV-save split
- [ ] Read `docs/ETHICAL_RISK.md` before changing checkout, emails, analytics, admin power, public visibility, or data retention
- [ ] Verify `CNAME` is set to `pool.dustwave.xyz`

---

## Secrets & Config (Test Mode First)

- **GitHub Actions**: Add test `STRIPE_SECRET_KEY` + `CHECKOUT_INTENT_SECRET`
- **Cloudflare Worker**: Same secrets as env vars; set `SITE_BASE`
- **Stripe**: For hosted environments, create a webhook to `https://pledge.dustwave.xyz/webhooks/stripe`
- **Local custom checkout**: add `STRIPE_PUBLISHABLE_KEY_TEST` to `worker/.dev.vars`
- **Admin dashboard**: local dev grants bootstrap super-admin access through `ADMIN_BOOTSTRAP_EMAILS` in ignored `worker/.dev.vars`; fork admins put production access in `_config.yml` `admin.users`, `ADMIN_USERS_JSON`, or the dashboard Users screen. The Users screen saves to KV, not GitHub.

See [PAYMENT_PROCESSOR.md](PAYMENT_PROCESSOR.md), [EMAIL.md](EMAIL.md), and [TESTING.md](TESTING.md) for the full payment, email, and secrets references.

---

## Security Notes

- Secrets live only in GitHub Actions + Cloudflare vars; never in repo
- The dashboard **Secrets & credentials** section is read-only status. Do not add secret editing or secret persistence to `_config.yml`, campaign YAML, KV user records, or dashboard drafts.
- Validate Stripe webhook signatures
- Keep Resend sender domains aligned with `PLEDGES_EMAIL_FROM` and `UPDATES_EMAIL_FROM`
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
