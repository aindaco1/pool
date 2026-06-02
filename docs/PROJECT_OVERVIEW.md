# Project Overview — The Pool (Dust Wave Crowdfund)

**Goal:**  
Enable creative crowdfunding with true *all-or-nothing* logic using static hosting.  
Creators define campaigns in Markdown; backers pledge through The Pool’s first-party cart and an on-site Stripe setup-mode payment step; cards are charged automatically only if the campaign is funded. Backers can optionally add a 0% to 15% Dust Wave platform tip (default 5%) that is included in the final charge but excluded from campaign progress.

**Branding:**  
- Platform name: **The Pool**
- Company name: **Dust Wave** (two words, not "DustWave")
- Default theme: Dust Wave's calmer editorial styling
- Fork customization: `_config.yml` now drives a curated branding/token surface that reaches public pages, on-site Stripe Elements, and supporter emails

---

## System Summary

| Layer | Platform | Role |
|-------|-----------|------|
| **Frontend** | GitHub Pages (Jekyll + Sass + cart runtime) | Campaign pages, cart, UX |
| **Payments** | Stripe (Checkout Sessions in setup mode + off-session charges) | Secure payment fields, saved payment methods, then charge cards later |
| **API/Glue** | Cloudflare Worker (`pledge.dustwave.xyz`) | Handles checkout bootstrap, webhooks, tip-aware totals, recovery, and reporting data |
| **Admin UI** | Private dashboard (`/admin/`, `/es/admin/`) | Role-scoped settings, campaigns, add-ons, analytics, reports, supporters, marketing tools, and users |
| **Automation** | Worker scheduler + GitHub Action | Auto-settle (batched) + state transitions |
| **Storage** | Markdown / YAML | Campaign definitions & state |
| **Styling** | Sass + generated theme vars | Shared design system for public pages, checkout, pledge management, and branded checkout/email surfaces |

All code is versioned and auditable. Campaign editing now flows through the private admin dashboard or direct repo edits, with publishable changes still committed back to the repo through the Worker-controlled GitHub path.

## Plan Efficiency Notes For Forks

The current architecture is deliberately optimized so Cloudflare deployments spend their budget on pledge mutations rather than casual browsing:

- campaign pages and the manage page prefer one combined `/live/:slug` read instead of separate stats + inventory requests
- the browser caches live stats and inventory in `localStorage` for the configured TTLs, and hidden tabs stop refreshing until visible again
- dashboard reports, supporters, analytics, settlement helpers, admin broadcast audience lookups, and stats / inventory reconciliation all prefer the `campaign-pledges:{slug}` index and avoid expensive namespace scans on normal read paths
- dashboard content loads/previews, report previews/downloads, supporter filters, analytics views, and marketing referral lists are designed to add zero KV writes
- limited-tier write paths now ask the per-campaign coordinator for reservation-aware availability, while public inventory stays in KV as a projection
- platform add-on inventory uses a sold-count projection after bootstrap instead of rebuilding from pledge namespace scans on normal reads
- launch reminder dispatch and supporter confirmation retry polling use queue-state markers, so idle scheduled ticks skip KV list scans and fall back to hourly compatibility checks
- rate limiting still fails closed, but repeated blocked requests inside the same window no longer rewrite the same KV counter on every hit

That means the real ceiling for most forks is usually **KV writes from successful pledge activity**, not public read traffic or idle list polling. `RATELIMIT` is now a hard requirement for supported deployments, but that does not by itself make the Free plan non-viable for the project's intended small-scale crowdfunding shape.

## Local Development Shape

The recommended low-friction local path now uses Podman:

- `./scripts/dev.sh --podman` boots Jekyll and the Worker in rootless containers
- `npm run podman:doctor` checks host readiness first
- `./scripts/test-e2e.sh --podman` now runs the browser suite in a fully automated way

The host-based Ruby/Wrangler path still exists, but Podman is the easiest way to get a production-like local environment without hand-installing every dependency.

For deployed Standard/Paid Workers, the repo now also declares `limits.cpu_ms = 100` in `worker/wrangler.toml` as a denial-of-wallet backstop. That cap is intentionally conservative, but it only applies on Cloudflare's deployed network, not during local development.

### Rough Planning Scenarios

These scenarios are intentionally approximate. They assume the default 5-minute browser TTLs, one combined live read on cold campaign loads, and Cloudflare’s published free-plan limits as of April 7, 2026.

| Scenario | What it feels like operationally | Planning takeaway |
|----------|----------------------------------|-------------------|
| First launch | One or two live campaigns, a few thousand campaign-page visits over several days, and a handful of completed pledges per day | Free should still be a reasonable starting point. |
| Strong week-one traction | Several thousand dynamic Worker reads per day and a couple dozen pledge mutations across live campaigns | Often still workable on Free, but this is where Paid starts reducing operational anxiety. |
| Established community platform | Frequent pledge mutations every day across multiple live campaigns, plus more regular admin repair/reporting flows | Paid becomes the more comfortable long-term choice; keep monitoring mutation and abuse-path costs. |

For current Cloudflare limits, see:

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Workers KV limits](https://developers.cloudflare.com/kv/platform/limits/)

---

## Funding Flow

1. **Visitor pledges** through the first-party cart → Worker creates a setup-mode Stripe Checkout Session, and the existing second checkout sidecar mounts secure Stripe payment UI on-site. One checkout can include items from multiple campaigns. Cart and checkout show subtotal, shipping, sales tax, and optional Dust Wave tip from a shared pricing model.
2. **Stripe** saves a card through that on-site payment step, returning IDs to the Worker.
3. Worker stores pledge data in **Cloudflare KV** (tiers, support items, custom amounts, shipping address, tip percent/amount, Stripe IDs), fanning a bundled checkout out into one campaign-scoped pledge per campaign. The client does not treat checkout as successful until persistence is confirmed.
4. **Worker scheduler** runs daily lifecycle work after midnight in the configured platform timezone:
   - Records an hourly heartbeat (`cron:lastRun` in KV) for monitoring without turning the minute-level scheduler into steady KV write churn.
   - Triggers site rebuild when `goal_deadline` passes (`live` → `post`).
   - If funded, dispatches batched settlement via self-chaining `/admin/settle-dispatch`.
   - Each batch (6 pledges) runs in a separate Worker invocation to stay within subrequest limits.
   - Charges are aggregated by email within each campaign — one charge per supporter per campaign.
   - Updates pledge status to `charged` or `payment_failed` in KV.
   - Triggers GitHub Pages rebuild and Cloudflare cache purge on state transitions.
5. **Reports and fulfillment exports** use the same campaign-runner report builders:
   - The admin dashboard previews pledge and fulfillment reports for campaigns the admin can access and downloads the visible report as CSV.
   - Dashboard report previews/downloads do not send email and do not write sent markers.
   - Scheduled or script-driven fulfillment automation can still use the Worker report paths where configured.

**Pricing rules:**
- Campaign progress uses subtotal only.
- Dust Wave platform tips are optional, default to 5%, and are capped at 15%.
- Sales tax uses the configured deployment tax rate.
- Physical shipping is Worker-calculated from deployment/campaign shipping rules, including USPS live quotes when enabled plus configured fallback or free-shipping behavior.
- Final stored / charged totals are `subtotal + shipping + tax + tip`.

**Checkout hardening notes:**
- Sensitive checkout bootstrap/completion responses are served `private, no-store`.
- Browser POSTs for checkout start/complete and payment-method start are origin-checked against `SITE_BASE`.
- Long-lived browser storage keeps cart structure and pricing inputs; contact/address drafts stay session-scoped.
- After successful persistence, the client invalidates cached live stats/inventory immediately and leaves a short-lived refresh marker so restored campaign pages fetch fresh totals.

---

## Campaign Lifecycle

| State | Meaning | Visible UX |
|--------|----------|------------|
| `upcoming` | Scheduled / not yet live | Buttons disabled, “coming soon” message |
| `live` | Accepting pledges | Cart active, progress bar updating |
| `post` | Finished | Displays funded or not-funded outcome |
| `charged` | (flag) | True after successful billing |

---

## Stretch Goals

- Declared directly in each campaign’s front matter.  
- Automatically marked *achieved* when `pledged_amount >= threshold`.  
- Optional `requires_threshold` attribute on tiers to reveal new perks once unlocked.

---

## Code Map

```
.
├── _campaigns/           # Markdown campaign data
├── _layouts/             # Page templates (campaign, community, manage, etc.)
├── _includes/            # Reusable components
│   └── blocks/           # Content block renderers (text, image, video, gallery, etc.)
├── _plugins/             # Jekyll plugins (money filter)
├── assets/
│   ├── main.scss         # Sass entry point
│   ├── partials/         # 14 active modular Sass partials (tokens, primitives, page surfaces)
│   └── js/               # Cart, campaign, and runtime scripts
├── worker/               # Cloudflare Worker (pledge.dustwave.xyz)
│   └── src/              # Stripe setup, webhooks, email, votes, tokens, tip-aware totals
├── admin.md              # Private admin dashboard route
├── scripts/              # Automation & reporting scripts
├── tests/e2e/            # Playwright end-to-end tests
└── .github/workflows/    # Deploy action
```

---

## Deployment Checklist

1. ✅ Domain: `pool.dustwave.xyz` (CNAME to GitHub Pages).  
2. ✅ First-party cart runtime enabled in site config and local build.  
3. ✅ Cloudflare Worker deployed (`pledge.dustwave.xyz`) with Stripe + Worker signing secrets.  
4. ✅ Stripe webhook configured → Worker `/webhooks/stripe`.  
5. ✅ Repo secrets set: `STRIPE_SECRET_KEY`, `CHECKOUT_INTENT_SECRET`, and admin/email secrets.  
6. ✅ Minute-level Worker scheduler enabled with platform-timezone daily gates — check via `GET /admin/cron/status`.
7. ✅ Cloudflare cache purge configured (preferred: API token/account ID; legacy email/key auth still works if explicitly configured).  
8. ✅ Test campaign runs end-to-end in Stripe test mode.
9. ✅ Long-form content sanitizes Markdown link schemes and only renders structured embeds from exact approved origins.
10. ✅ Missing-pledge magic-link reads fail closed with `404`.
11. ✅ Private admin dashboard emits `noindex`, uses magic-link auth, and keeps user/referral KV mutations separate from GitHub-backed publish flows.

---

## Philosophy

- **Static first:** GitHub Pages provides transparency and version control for every campaign state.  
- **Minimal backend:** Cloudflare Worker replaces a full app server.  
- **Automation over ops:** GitHub Actions perform all time-based events.  
- **Open handoff:** Campaign and platform state remains reviewable as Markdown/YAML, even when routine edits happen through the dashboard.
- **Design consistency:** Uses the same visual language as dust-wave-shop for brand coherence.

## Critical Learnings

1. **Jekyll includes require `include.` prefix**: When passing parameters to includes, always access them with `{{ include.param }}` not `{{ param }}`.
2. **YAML strings**: Quote strings with special characters (colons, quotes) to avoid parsing errors.
3. **Division by zero**: Always check denominators before division in Liquid templates.
4. **Sass compilation**: Jekyll compiles `.scss` files automatically when `sass:` is configured in `_config.yml`.
5. **Countdown pre-rendering**: Calculate initial values at build time (Jekyll) or render time (JS) to avoid "00 00 00 00" flash.
6. **Support items data flow**: Cart.js extracts support items → Worker stores in temp KV → Webhook merges into final pledge.
7. **DST-aware timezone handling**: All deadline logic (frontend countdown, Worker settlement, campaign state transitions) uses `platform.timezone` / `PLATFORM_TIMEZONE` with `Intl.DateTimeFormat`; the default is `America/Denver`.
8. **Content safety must hold at render time**: authoring audits help, but the real protection comes from runtime Markdown-link sanitization and exact-origin embed validation.
9. **Magic links must require real pledge rows**: token validity alone is insufficient; missing pledge records should fail closed.
10. **Localized chrome should stay shared**: campaign-page controls and status copy that belong to the platform, not the creator, should flow through the shared locale catalog so public templates, runtime UI, and supporter emails do not drift apart.
11. **Performance work should stay static-first**: prefer stable Jekyll output, generated asset minification, lazy runtime loading, and conservative public-only prefetching before adding client complexity.

---

_Last updated: June 1, 2026_
