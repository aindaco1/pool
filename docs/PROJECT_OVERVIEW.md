# Project Overview — The Pool (Dust Wave Crowdfund)

**Goal:**  
Enable creative crowdfunding with true *all-or-nothing* logic using static hosting.  
Creators define campaigns in Markdown; backers pledge through Snipcart; cards are charged automatically only if the campaign is funded.

**Branding:**  
- Platform name: **The Pool**
- Company name: **Dust Wave** (two words, not "DustWave")
- Design system: Matches dust-wave-shop (minimalist black/white, 8px grid, Inter + Gambado Sans)

---

## System Summary

| Layer | Platform | Role |
|-------|-----------|------|
| **Frontend** | GitHub Pages (Jekyll + Sass + Snipcart v3) | Campaign pages, cart, UX |
| **Payments** | Stripe (Setup Intents + off-session charges) | Store then charge cards |
| **API/Glue** | Cloudflare Worker (`pledge.dustwave.xyz`) | Handles Stripe checkout + webhook |
| **Automation** | GitHub Action (cron) | Flips states & triggers charges |
| **Storage** | Markdown / YAML | Campaign definitions & state |
| **Styling** | Sass (15 modular partials) | Design system matching dust-wave-shop |

All code is versioned and auditable — no external DB or CMS needed.

---

## Funding Flow

1. **Visitor pledges** through Snipcart → Worker launches Stripe Checkout in “setup” mode.  
2. **Stripe** saves a card, returning IDs to the Worker.  
3. Worker writes Stripe IDs into the **Snipcart order metadata**.  
4. **Cron Action** runs daily:  
   - Moves `live` → `post` when `goal_deadline` passes.  
   - If funded, charges each pledge off-session using saved payment methods.  
   - Commits updates (`charged: true`, etc.) back into `_campaigns/`.

---

## Campaign Lifecycle

| State | Meaning | Visible UX |
|--------|----------|------------|
| `pre` | Scheduled / not yet live | Buttons disabled, “coming soon” message |
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
│   ├── partials/         # 15 modular Sass partials (variables, mixins, components)
│   └── js/               # Cart, campaign, checkout-autofill scripts
├── worker/               # Cloudflare Worker (pledge.dustwave.xyz)
│   └── src/              # Stripe setup, webhooks, email, voting, tokens
├── scripts/charge.js     # Cron logic for charging pledges
├── tests/e2e/            # Playwright end-to-end tests
└── .github/workflows/    # Deploy action
```

---

## Deployment Checklist

1. ✅ Domain: `pool.dustwave.xyz` (CNAME to GitHub Pages).  
2. ✅ Snipcart domain allowlisted; public key in `snipcart-foot.html`.  
3. ✅ Cloudflare Worker deployed (`pledge.dustwave.xyz`) with Stripe + Snipcart secrets.  
4. ✅ Stripe webhook configured → Worker `/webhooks/stripe`.  
5. ✅ Repo secrets set: `STRIPE_SECRET_KEY`, `SNIPCART_SECRET`.  
6. ✅ Hourly cron Action enabled.  
7. ✅ Test campaign runs end-to-end in Stripe test mode.

---

## Philosophy

- **Static first:** GitHub Pages provides transparency and version control for every campaign state.  
- **Minimal backend:** Cloudflare Worker replaces a full app server.  
- **Automation over ops:** GitHub Actions perform all time-based events.  
- **Open handoff:** Everything editable as Markdown — safe for future collaborators.
- **Design consistency:** Uses the same visual language as dust-wave-shop for brand coherence.

## Critical Learnings

1. **Jekyll includes require `include.` prefix**: When passing parameters to includes, always access them with `{{ include.param }}` not `{{ param }}`.
2. **YAML strings**: Quote strings with special characters (colons, quotes) to avoid parsing errors.
3. **Division by zero**: Always check denominators before division in Liquid templates.
4. **Sass compilation**: Jekyll compiles `.scss` files automatically when `sass:` is configured in `_config.yml`.

---

_Last updated: Jan 2026_
