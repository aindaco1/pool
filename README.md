# The Pool

**Dust Wave's open-source crowdfunding platform** — [pool.dustwave.xyz](https://pool.dustwave.xyz)

Current release milestone: **v1.0.8**. The v1.0.7 release shipped abandoned-checkout visibility, setup/deploy hardening, shared Marketing/Blast draft support, referral/UTM reporting, and a campaign-scoped WYSIWYG media picker. v1.0.8 focuses on Store-derived runtime hardening, lazy authenticated Marketing reads, remembered admin dashboard tab/subtab context, stronger locale completeness checks, generated-site SEO/crawl validation, and Pool-specific release evidence automation.

A static Jekyll + first-party cart site for all-or-nothing creative crowdfunding. Backers build a pledge in The Pool’s browser-owned cart, the Cloudflare Worker canonicalizes the contribution via `/checkout-intent/start`, and Stripe collects and saves card details through a secure on-site payment step so cards are only charged after a successful campaign reaches its deadline. A single checkout can include items from multiple campaigns; after webhook confirmation, the Worker fans that bundle out into separate campaign-scoped pledge records. If funded, the Worker scheduler dispatches batched settlement and charges pledges off-session. Supporters can optionally add a platform tip, manage pledges through order-scoped magic links, and revisit a desktop-friendly Manage Pledge dashboard with Active / Closed sections.

## Features

- **No accounts required** — Backers manage pledges via email magic links
- **Server-verified checkout** — The Worker canonicalizes cart contents from first-party cart items instead of trusting browser-submitted totals
- **Multi-campaign checkout** — One checkout can include multiple campaigns, while storage, emails, reports, and management stay campaign-scoped after confirmation
- **Lazy first-party cart runtime** — Public pages load a lightweight cart bootstrap first and defer the heavier cart stack until persisted cart state or clear supporter intent requires it
- **All-or-nothing pledging** — Cards saved now, charged only if goal is met
- **Optional platform tip** — 0% to 15% tip (default 5%) included in totals but excluded from campaign progress
- **Tip-aware cart + checkout** — Shared pricing logic keeps subtotal, tip, tax, shipping, and total in sync across cart, checkout, Worker, reports, and emails
- **USPS-backed shipping quotes with fallback guardrails** — Physical checkout and modify flows can quote USPS domestic/international shipping, use explicit flat/manual rates where configured, fall back safely to configured flat rates, and support optional domestic signature upgrades without pushing quote churn into KV
- **Platform add-ons with inventory awareness** — Bundle-level merch add-ons can be attached to a checkout, stay editable in Manage Pledge, support per-variant stock, and ride the same canonical shipping/reporting/email flow without counting toward campaign funding goals
- **Campaign add-ons with campaign-aware accounting** — Campaign markdown can also define campaign-scoped add-ons that render in the same cart / Manage UI, count toward that campaign’s funding subtotal, follow campaign shipping overrides, and disappear automatically when the owning campaign pledge leaves the cart
- **On-site Stripe payment step** — The existing second checkout sidecar hosts secure Stripe payment UI, and Manage Pledge uses the same pattern for `Update Card`
- **Configurable pricing and tax-provider settings** — `pricing.*` and `tax.*` live in `_config.yml`, and the mirrored Worker vars are auto-synced into `worker/wrangler.toml` so browser previews, provisional tax states, and server-side totals stay aligned
- **Physical & digital tiers** — Physical items trigger shipping address capture during checkout plus Worker-calculated USPS quotes, configured fallback rates, and optional domestic signature upgrades when enabled
- **Order-scoped magic links** — Each supporter link only manages its own pledge/order
- **Safer supporter sessions** — Community pages keep supporter access in browser session storage instead of a long-lived token cookie
- **Stretch goals** — Auto-unlock at funding thresholds
- **Campaign lifecycle** — `upcoming` → `live` → `post` states with automatic transitions + Cloudflare cache purge
- **Countdown timers** — configurable IANA platform timezone with automatic DST handling, pre-rendered to avoid flash
- **Launch reminders** — Upcoming campaign pages can collect explicit email opt-ins, verify Turnstile challenges, dedupe signups by campaign/email, send one Resend-powered launch email when the campaign goes live, and honor unsubscribe/suppression markers before sending
- **Consent-based checkout reminders** — Custom first-party checkout can collect an explicit one-reminder opt-in, queue a delayed abandoned-checkout email only after Stripe session creation succeeds, suppress it on completed pledges, honor signed unsubscribe links, and restore a sanitized checkout draft from signed reminder links
- **Stable campaign progress rendering** — Funding bars and milestone markers render their positions in static HTML/CSS so first load does not wait for JavaScript to avoid layout collapse
- **Production phases & registry** — Tabbed interface for itemized funding needs
- **Community decisions** — Voting/polling for backer engagement with published option allowlists and closed-decision lockout
- **Sanitized campaign content blocks** — Long-form campaign and diary content accepts Markdown plus a tiny safe inline subset (`<br>`, `<em>`, `<strong>`, `<i>`, `<b>`, `<u>`), supports local videos with optional posters, neutralizes unsafe Markdown link schemes, automatically opens external links in a new tab, and escapes or rejects other raw HTML
- **Strict structured embeds** — Approved `spotify`, `youtube`, and `vimeo` embeds are validated against exact trusted origins and embed paths instead of substring matching
- **Serialized limited-tier inventory** — Scarce rewards reserve through a per-campaign Durable Object at checkout start and confirm through that same coordinator at persistence time, so limited tiers do not oversell under concurrent demand
- **Serialized campaign settlement** — Scheduled and manual settlement routes use a per-campaign coordinator lock plus deterministic Stripe idempotency keys, so same-campaign charging cannot overlap while multi-campaign carts stay campaign-scoped
- **Strict missing-pledge handling** — Magic-link pledge reads fail closed with `404` when the backing pledge record is missing
- **Production diary** — Rich content updates with auto-broadcast emails to supporters
- **Supporter blasts** — Campaign admins can send scoped supporter email blasts with WYSIWYG content, campaign-hosted images, email-safe video links, automatic dry runs, and custom CTA links
- **Private admin dashboard** — Magic-link admin access for role-scoped settings, campaign editing, add-ons, supporters, reports, analytics, marketing/referral tools, users, and read-only secrets/diagnostics without exposing admin secrets in browser code; the browser remembers the last allowed dashboard tab and subtab context across reloads without writing Worker/KV state
- **Richer campaign marketing tools** — Campaigns -> Marketing can build tracked campaign links, save referral codes, preview/download campaign QR codes as PNG/SVG, and save shared drafts; Analytics reviews referral/UTM performance from indexed pledges; Campaigns -> Blast can draft supporter email blasts with the WYSIWYG content editor, save shared drafts explicitly, upload or select hosted campaign images through the shared media path, link YouTube/Vimeo videos instead of embedding remote players in email, automatically dry-run audiences before test/live sends, test-send to the signed-in admin, send to the campaign's indexed supporters, and show read-only sent blast history
- **Protected campaign previews** — Super admins and assigned campaign users can publish noindex, email-protected full-page previews for campaigns they can edit, with generic static shells, read-only pledge controls, dashboard-visible publisher links, optional invited reviewer links that expire in 24 hours, and preview access allowlists stored in short-lived Worker KV instead of campaign source.
- **New campaign creation** — Super admins can create a preview-only campaign from the dashboard with only a title, optionally selecting one or more existing campaign users or creating one or more new users with required name/email.
- **Campaign archiving** — Super admins can archive non-live campaigns from Campaigns -> Settings; local dev archives directly in the mounted repo, while production dispatches a validated GitHub Actions workflow that moves campaign source and campaign-owned media into `archive/campaigns/<slug>/` instead of deleting archived data.
- **Instagram integration** — Optional social CTA in supporter emails
- **Ongoing funding** — Post-campaign support section
- **Manage Pledge dashboard** — Desktop-friendly Active / Closed sections with locked-state read-only controls after deadline
- **Tip-aware emails + reports** — Supporter emails, pledge reports, and fulfillment exports all include the platform tip when present
- **Actual Stripe fee analytics foundation** — Newly charged pledges store Stripe balance transaction fee/net values when available, and dashboard analytics prefer those actual values while clearly labeling estimated fallback rows
- **Net revenue analytics** — Dashboard analytics keep gross Campaign revenue and Platform revenue visible while adding net campaign/platform values after each category's allocated share of actual or estimated processor fees
- **Provider plan usage visibility** — Super admins can open Settings -> Plan usage to see Cloudflare Workers/KV and Resend quota status from server-side provider calls without exposing tokens or writing KV state
- **Admin content-editor media uploads** — Campaign and diary content editors can stage image, video, and audio uploads with immediate previews, then publish them into the campaign asset directory with the content change; publish also removes same-campaign dashboard-owned media that is no longer referenced
- **Dashboard media optimization pipeline** — Dashboard-uploaded media stays source-preserving in the Worker, image/video uploads dispatch the repository optimizer with `scope=changed`, and repository tooling can losslessly compress images, generate responsive WebP browser variants including a `640w` mobile-friendly rung, and generate high-quality WebM derivatives for uploaded videos
- **Deferred remote video embeds** — YouTube campaign hero videos render with a local poster/play facade first and load the remote iframe only after supporter play intent
- **Generated asset minification** — Production Pages builds minify generated `_site` CSS/JS after Jekyll output while leaving source files readable and Cloudflare responsible for transfer compression
- **Campaign-runner reports** — Configurable campaign-scoped daily pledge-ledger emails and post-deadline fulfillment exports can go to each campaign’s configured runner recipients, while the dashboard previews/downloads pledge and fulfillment CSVs without sending email or writing sent markers
- **Projection drift diagnostics** — Read-only admin checks and a local CLI can compare stored stats, inventory, and campaign indexes against saved pledge truth before any repair path mutates data
- **Shared visual system** — Public pages, campaign surfaces, cart / checkout, and Manage Pledge all use the same calmer reusable typography, button, field, and card language
- **Responsive mobile polish** — Campaign pages, checkout/manage flows, community pages, and long-form content have shared small-screen spacing, safe-area-aware drawers, larger tap targets, and overflow fixes instead of a separate mobile-only UI
- **Accessibility baseline** — Public shells now keep skip links and stable main landmarks, while cart / checkout flows use stronger dialog semantics, live-region updates, and clearer accessible labels without moving payment fields out of Stripe-owned secure UI
- **Variable-first fork customization** — structured config now drives branding, pricing, Worker-synced settings, core brand assets, curated design variables, themed Stripe Elements, and branded supporter emails without requiring custom code for normal fork rebranding
- **Hosted live campaign embeds** — Campaign pages now link to a locale-aware embed builder that generates copy-paste iframe code with layout/theme/media/CTA options, live Worker-backed data, and auto-resize behavior
- **Campaign share links** — Campaign pages expose localized, icon-only share targets for Bluesky, X, Threads, Facebook, SMS, and email, with local image fallbacks and richer state-aware intent text where platforms allow it
- **English + Spanish i18n foundation** — `_config.yml` now drives supported languages, static locale routes, generated localized campaign routes, shared translation data, and a quieter footer language switcher, with Spanish live across home/about/terms, public campaign pages, embed pages, pledge-result pages, `/manage/`, `/community/`, supporter community routes, site-owned cart/community/Manage Pledge/embed runtime copy, campaign countdown/gallery/live-stats labels, cart-button summaries, checkout tax-location helper copy, hero video/community teaser/diary chrome, localized campaign dates, and localized Worker supporter emails
- **SEO fundamentals baseline** — Public pages and campaign pages now emit consistent titles, descriptions, canonicals, OG/Twitter tags, localized language metadata, honest JSON-LD, crawler-friendly Worker-generated PNG campaign share cards, and alternate-language metadata where supported, while `robots.txt`, `sitemap.xml`, a generated-site `npm run test:seo` audit, and explicit noindex rules keep private/tokenized flows out of search intent
- **Safe intent prefetching** — Public same-origin document links can prefetch on hover/focus/touch intent, with conservative route/query exclusions and admin-configurable defaults

## Architecture

```
[Visitor] → GitHub Pages (Jekyll + first-party cart / checkout sidecars)
          → Cloudflare Worker (on-site Stripe session bootstrap + webhook + cron)
```

| Layer | Platform | Role |
|-------|----------|------|
| Frontend | GitHub Pages | Jekyll + Sass + first-party cart runtime |
| Payments | Stripe | Secure payment fields, saved payment methods, off-session charges |
| API | Cloudflare Worker | Checkout-session bootstrap, webhook, tip-aware totals, stats, auto-settle, cache purge |
| Admin UI | Private dashboard | Role-scoped campaign editing, settings, add-ons, reports, analytics, supporters, marketing tools, and users |

## Quick Start

```bash
npm run setup:deploy -- --mode=local
npm run podman:doctor
./scripts/dev.sh --podman
# Visit http://127.0.0.1:4000
```

That is the recommended local development path. It boots Jekyll, the Worker, optional Stripe CLI forwarding, and the local support services together with the repo's current defaults.

The setup helper is dependency-free Node and works on macOS, Windows, and Linux. Use `npm run setup:deploy -- --mode=production --dry-run` to preview Cloudflare KV, Worker secret, GitHub secret, readiness, and deploy steps before applying them. It intentionally keeps production Worker secrets separate from ignored local `worker/.dev.vars` values, and the setup path is covered by fake-CLI unit tests so dry runs, KV reuse/create planning, generated local secrets, and production secret writes stay testable without live provider mutations.

The Worker dev container now runs on Node 24 to match GitHub Actions. Wrangler 4.87 also runs against the shared Worker `compatibility_date = "2026-05-03"` so local Miniflare/Workers behavior stays aligned with deployed runtime semantics.

If you want to rebuild the Podman dev images after dependency or base-image changes:
```bash
PODMAN_REBUILD=1 ./scripts/dev.sh --podman
```

Fork-friendly pricing settings live in:
- `pricing.sales_tax_rate`, `pricing.default_tip_percent`, and `pricing.max_tip_percent` in [`_config.yml`](_config.yml)
- auto-synced Worker vars `SALES_TAX_RATE`, `DEFAULT_PLATFORM_TIP_PERCENT`, and `MAX_PLATFORM_TIP_PERCENT` in [`worker/wrangler.toml`](worker/wrangler.toml)

Fork-friendly tax-engine settings live in:
- `tax.provider`, `tax.origin_country`, `tax.use_regional_origin`, `tax.nm_grt_api_base`, and `tax.zip_tax_api_base` in [`_config.yml`](_config.yml)
- mirrored Worker vars `TAX_PROVIDER`, `TAX_ORIGIN_COUNTRY`, `TAX_USE_REGIONAL_ORIGIN`, `NM_GRT_API_BASE`, and `ZIP_TAX_API_BASE` in [`worker/wrangler.toml`](worker/wrangler.toml)
- `tax.provider: flat` keeps the legacy configured-rate baseline from `pricing.sales_tax_rate`
- `tax.provider: offline_rules` uses vendored international VAT/GST rules plus state-level fallback behavior
- `tax.provider: nm_grt` uses the vendored New Mexico starter dataset first and can refine New Mexico street-address lookups against the free EDAC GRT API
- optional Worker secret `ZIP_TAX_API_KEY` when `tax.provider: zip_tax` is enabled for local/jurisdiction-level US tax lookups

Current checkout behavior is intentionally conservative: if the browser does not yet have enough destination data, the cart shows provisional tax as `--` and the final tax quote is resolved once the Worker has enough billing or shipping location detail.

Fork-friendly shipping settings live in:
- `shipping.origin_*`, `shipping.fallback_flat_rate`, `shipping.free_shipping_default`, and `shipping.usps.*` in [`_config.yml`](_config.yml)
- auto-synced Worker vars like `SHIPPING_ORIGIN_ZIP`, `SHIPPING_FALLBACK_FLAT_RATE`, `USPS_ENABLED`, `USPS_CLIENT_ID`, and the USPS timeout/cache/cooldown knobs in [`worker/wrangler.toml`](worker/wrangler.toml)

Keep `USPS_CLIENT_SECRET` out of site config. Set it as a Worker secret or in [`worker/.dev.vars`](worker/.dev.vars) for local development.

If you change those values locally, restart `./scripts/dev.sh --podman` so the Worker uses the same math as the site.

Fork-friendly global merch/add-on settings now also live in:
- `add_ons.enabled`, `add_ons.low_stock_threshold`, and `add_ons.products` in [`_config.yml`](_config.yml)
- product images, size-aware variants, per-product or per-variant inventory, and `shipping_preset` references for physical catalog items
- bundle-level add-ons can now be selected in the cart sidecar, anchored to a campaign in multi-campaign carts, and edited later from Manage Pledge
- low-stock messaging and sold-out variant filtering now come from the shared inventory-aware add-on product-state layer used by both cart and Manage Pledge
- configured add-on inventory is the starting baseline; remaining stock is derived from saved pledge state through the `add-on-inventory-sold:v1` projection, not unsaved cart or Manage drafts
- pledge and fulfillment reports now separate campaign pledge value from platform add-on value for easier operations

Fork-facing settings now use a structured config model in [`_config.yml`](_config.yml):

- `platform` for identity, URLs, and support contact
- `platform` also covers brand assets like logo, footer logo, favicon, and default social image
- `admin` for production admin URLs plus seed/recovery users mirrored into the Worker as `ADMIN_USERS_JSON`
- top-level `title` / `description` for Jekyll's site identity and default SEO copy
- `seo` for bounded SEO identity knobs like `x_handle`, `same_as`, `default_social_image_alt`, `og_locale_overrides`, and whether the public community hub should remain indexable
- `pricing` for the flat-rate compatibility baseline and platform-tip defaults
- `tax` for choosing the Worker tax engine and its non-secret lookup settings
- `shipping` for origin settings, USPS quote behavior, fallback policy, free-shipping defaults, shipping presets, and limited shipping-option policy
- `add_ons` for a small global merch catalog, fixed-price products, and simple variants like shirt sizes
- `reports` for campaign-runner report timing, attachments, summaries, subject-prefix behavior, and the split fulfillment-email workflow alongside `platform.support_email`
- `launch_reminders` for enabling upcoming-campaign reminder forms and setting the public Turnstile site key
- campaign front matter `campaign_add_ons` for campaign-scoped merch that should use the same card UI but count toward that campaign’s subtotal and shipping rules
- `i18n` for default/supported languages, language labels, and localized public-page routes
- `design` for curated typography, radius, layout-width, and theme-token overrides
- a small curated subset of `platform` / `design` is mirrored into the Worker so supporter emails stay aligned with fork branding too
- `debug` for browser and Worker console logging behavior
- `performance` for safe public intent prefetch controls
- `checkout` for truly variable checkout settings like the Stripe publishable key
- `cache` for live browser TTLs

[`_config.local.yml`](_config.local.yml) is now intentionally thin: it should only carry true local overrides like localhost URLs, `show_test_campaigns`, and local-only public Turnstile key blanks, not a second copy of the base config.

See [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md) for the supported no-code customization surface and which settings are automatically mirrored to the Worker.
See [docs/SEO.md](docs/SEO.md) for the current SEO fundamentals implementation and supported SEO surface.
See [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) for the current accessibility baseline and verified critical flows.
See [docs/I18N.md](docs/I18N.md) for the locale model, shared translation sources, and localized route behavior.
See [docs/PAYMENT_PROCESSOR.md](docs/PAYMENT_PROCESSOR.md) for the Stripe setup, checkout, webhook, settlement, and reconciliation model.
See [docs/EMAIL.md](docs/EMAIL.md) for the Resend sender setup, email types, localization, and delivery behavior.

Creators can use the public [Campaign Creator Checklist](creator-campaign-checklist.md) for launch prep. It covers recent creator-facing changes, including campaign add-ons, hosted embeds, QR/referral links, supporter Blast prep, share-link/social-preview planning, dashboard media uploads, tax/shipping expectations, free-shipping and fallback-rate decisions, report recipients, and fulfillment handoff; the Spanish route lives at `/es/creator-campaign-checklist/`.

For localization, the supported model is:

- shared UI/runtime/email copy lives in `_data/i18n/{lang}.yml`
- localized long-form pages still need localized source files under the locale prefix
- generated campaign pages and embed pages now participate in the locale model too, so `/campaigns/{slug}/` can switch cleanly to `/es/campaigns/{slug}/`
- the shared footer language switcher preserves the current query string and hash, so tokenized routes like `/manage/?t=...` can switch to `/es/manage/?t=...` without dropping pledge access

The main local/dev/test paths already call the existing sync script, [`scripts/sync-worker-config.rb`](scripts/sync-worker-config.rb), to keep those mirrored Worker values aligned. If you edit `_config.yml` / `_config.local.yml` directly and want to refresh the Worker config before restarting the stack, run:

```bash
npm run sync:worker-config
```

If you specifically need the host-only fallback instead:
```bash
bundle install
bundle exec jekyll serve --config _config.yml,_config.local.yml
```

For a full host-only stack, run the Worker separately with `cd worker && wrangler dev --env dev --port 8787`.

Local admin dashboard testing reads the bootstrap super-admin email from ignored `worker/.dev.vars` as `ADMIN_BOOTSTRAP_EMAILS`. `npm run secrets:dev` creates that file from `worker/.dev.vars.example`, where forks can replace the placeholder with their own local sign-in email. The committed dev Worker defaults still set `CORS_ALLOWED_ORIGIN=http://127.0.0.1:4000` and the two test-only campaigns `hand-relations,smoke-editable`. `_config.yml` `admin.users` is the production seed/recovery list mirrored into the deployed Worker as `ADMIN_USERS_JSON`; admin user edits made in the dashboard are saved directly to Worker KV under `admin-users:v1`, take effect immediately, and do not publish to GitHub. Machine-specific secrets and local bootstrap access belong in ignored `worker/.dev.vars`.

Admin email sign-in can also use Cloudflare Turnstile. Set the public widget key in `_config.yml` as `admin.turnstile_site_key`, and store the matching `TURNSTILE_SECRET_KEY` as a Worker secret. Local/test automation can use `ADMIN_TURNSTILE_BYPASS=true`, but that bypass should stay out of deployed Workers.

Launch reminder forms use `_config.yml` `launch_reminders.turnstile_site_key` and the same shared Turnstile verification helper in the Worker. `_config.local.yml` can blank that public key to hide the widget locally; deployments may reuse `TURNSTILE_SECRET_KEY` or set `LAUNCH_REMINDER_TURNSTILE_SECRET_KEY`. Local/test automation can use `LAUNCH_REMINDER_TURNSTILE_BYPASS=true` only in local/test Worker contexts.

Dashboard publish paths are intentionally split:

- Settings, Add-ons, Campaigns, and content publishes validate through the Worker and commit changes back to GitHub before the normal deploy flow.
- Campaign preview publishes set a GitHub-backed preview flag, store the invited reviewer email allowlist in a 24-hour KV record, send signed preview links, and record an audit event.
- Super-admin new campaign creation writes a preview-only `_campaigns/<slug>.md` file through local repo writes in dev or the GitHub publish path in production, saves any assigned/new campaign users to `admin-users:v1`, emails assigned users when present, and keeps the public campaign page hidden until launch.
- Super-admin campaign archive validates a non-live campaign in the Worker, records an audit event, and either archives locally in dev or dispatches `.github/workflows/archive-campaign.yml` in production to move campaign source and campaign-owned media into `archive/campaigns/<slug>/`.
- Settings -> Users saves directly to Worker KV and does not use the publish button.
- Marketing saved referral codes write one campaign-scoped KV record only when explicitly saved; QR previews, media-library picker reads, Analytics attribution loads, abandoned-checkout health reads, and local Blast drafts do not write KV. Shared Marketing/Blast draft saves write one 7-day campaign-scoped draft record only on explicit save, and stale saves fail on revision conflict. Live Blast sends write the required audit event, and sent history reads recent audit records only when the Blast subtab is opened. Abandoned-checkout reminder sends write one short-lived resume snapshot so signed reminder links can restore the same cart context without storing Stripe secrets in the URL.
- Reports, Analytics, Supporters, content loads/previews, local drafts, filters, sorting, and CSV downloads are read-only browsing flows.

To create or update local secrets safely, run:

```bash
npm run secrets:dev
```

That helper creates `worker/.dev.vars` from `worker/.dev.vars.example` when needed, locks it down with local-only file permissions, generates local signing secrets, keeps variables grouped by purpose, and prompts for optional provider keys without printing secret values back to the terminal. Keep those values separate from production secrets; `worker/.dev.vars` is for local development, not a backup of deployed credentials. The admin dashboard shows read-only **Secrets & credentials** and **Plan usage** sections, but it never stores secret values in `_config.yml`, KV, GitHub commits, or admin setting drafts.

To seed both admin test campaigns against a running local Worker:

```bash
./scripts/seed-admin-test-campaigns.sh
```

See [docs/PODMAN.md](docs/PODMAN.md) for the current scope and limitations.

The Podman path is host-validated on macOS. Linux and Windows are supported by design and have doctor/self-check coverage, but were not host-validated in this thread.

The checkout and E2E helper scripts also support that mode:

```bash
./scripts/test-checkout.sh --podman
./scripts/test-e2e.sh --podman
./scripts/test-worker.sh --podman
./scripts/smoke-pledge-management.sh --podman
./scripts/pledge-report.sh --podman --local
./scripts/fulfillment-report.sh --podman --local
./scripts/check-projections.sh --podman
npm run test:e2e:headless:podman
npm run podman:doctor
npm run podman:self-check
```

If you want to exercise the on-site Stripe checkout locally, add `STRIPE_PUBLISHABLE_KEY_TEST=pk_test_...` to [`worker/.dev.vars`](worker/.dev.vars) before starting the stack. The full Stripe setup and local webhook flow are documented in [docs/PAYMENT_PROCESSOR.md](docs/PAYMENT_PROCESSOR.md).

For production, use Cloudflare Worker secrets for runtime credentials and GitHub repository secrets for deploy credentials or GitHub Actions automation. GitHub repository secrets do not automatically become Worker runtime secrets, so scoped admin credentials such as `ADMIN_SETTLEMENT_SECRET` and `ADMIN_BROADCAST_SECRET` must be set in Cloudflare too when deployed routes should enforce them. Do not put Stripe secret keys, webhook secrets, Resend keys, Turnstile secrets, USPS client secrets, ZIP.TAX keys, admin secrets, or Cloudflare API tokens in `_config.yml`.

The cross-platform setup/deploy helper can drive the common production setup path:

```bash
npm run setup:deploy -- --mode=production --dry-run
npm run setup:deploy -- --mode=production
```

It checks `gh`, `wrangler`, and optional Stripe CLI authentication; runs config sync; performs read-only readiness checks where credentials are available; creates or reuses Cloudflare KV namespaces for `VOTES`, `PLEDGES`, and `RATELIMIT`; updates `worker/wrangler.toml` with returned namespace IDs; writes Worker secrets with `wrangler secret put`; writes GitHub repository secrets with `gh secret set`; and can run `wrangler deploy` when passed `--deploy`. Use `--skip-readiness` when you want a narrower dry run that avoids live provider probes.

Resend sender domains must match the configured sender addresses. For this deployment, pledge and update emails use `pool.dustwave.xyz` senders such as `The Pool <pledges@pool.dustwave.xyz>`, so the Resend API key must be authorized for `pool.dustwave.xyz`. See [docs/EMAIL.md](docs/EMAIL.md) for the full email setup and integration guide.

## Cloudflare Plan Guidance For Forks

The Pool is intentionally shaped so most traffic stays cheap:

- GitHub Pages serves the static site, so normal page loads do not invoke the Worker
- public live data now prefers one combined `/live/:slug` request instead of separate stats + inventory calls
- campaign pages cache live stats and inventory in `localStorage` for `cache.live_stats_ttl_seconds` / `cache.live_inventory_ttl_seconds` (default `300`)
- background tabs stop refreshing until the page becomes visible again
- dashboard reports, supporters, analytics, stats rebuilds, settlement helpers, and admin supporter enumeration prefer `campaign-pledges:{slug}` indexes before falling back to expensive namespace scans, and stats/inventory rebuilds now repair stale campaign indexes when they detect drift
- normal dashboard reads, protected preview rendering, content previews, report previews/downloads, supporter filters, analytics views, marketing URL building, media-library picker loads, abandoned-checkout health, and local editor drafts are designed to add zero KV writes
- protected preview publication writes one short-lived `campaign-preview-reviewers:{slug}` access allowlist plus one audit record, while GitHub-backed campaign Markdown stores no previewer email addresses
- campaign archive writes only the admin audit record in KV; the source/media move happens locally in dev and in GitHub Actions for production
- the new read-only drift checks make it easier to confirm when projections are stale before running a repair path
- limited-tier write paths now ask the coordinator for reservation-aware availability instead of rebuilding truth from KV reservation keys
- platform add-on inventory reads use a sold-count projection after the initial bootstrap, so normal inventory refreshes do not list all pledge keys
- launch reminder dispatch, supporter confirmation retry polling, and abandoned-checkout reminders use queue-state markers; idle cron ticks skip KV list scans, and idle queues get an hourly compatibility recheck instead of minute-level or 15-minute namespace polling
- public read paths stay intentionally permissive so a legitimately popular campaign does not hit artificial anti-DoS ceilings, while the expensive checkout / Manage / admin writes carry the tighter rate limits and request-size caps
- once a client is already over a rate limit window, repeated blocked requests no longer rewrite the same KV counter on every hit
- `POST /checkout-intent/abandon` uses an order-scoped retry bucket so unload/retry cleanup stays friendly to shared IPs without leaving the release path wide open
- the Worker config also sets `limits.cpu_ms = 100` for deployed Standard/Paid Workers, which is well above the current representative unit-harness timings (`6-28 ms`) while still dramatically below Cloudflare's default 30-second ceiling for paid deployments

Fork knobs worth knowing:

- site config: `cache.live_stats_ttl_seconds`, `cache.live_inventory_ttl_seconds`, `performance.intent_prefetch_*`, `pricing.sales_tax_rate`, `shipping.fallback_flat_rate`, `tax.*`
- Worker env: auto-synced pricing and tax-provider values in [`worker/wrangler.toml`](worker/wrangler.toml)

### Practical Scalability Scenarios

These are rough planning scenarios, not guarantees. They assume the default 5-minute browser cache TTLs, mostly normal user behavior, and Cloudflare’s current published Workers and KV pricing/limits.

| Scenario | Rough daily activity | Plan outlook |
|----------|----------------------|--------------|
| Small collective launch | ~1,500 campaign-page visits, ~75 manage/supporter visits, ~20 checkout starts, ~10 completed pledges | Free should still be viable. This is the operating shape The Pool is designed to handle cheaply. |
| Busy launch week | ~8,000 campaign-page visits, ~250 manage/supporter visits, ~60 checkout starts, ~25 completed or modified pledges | Often still plausible on Free if abuse stays low and admin repair flows are rare, but this is where Paid starts buying real margin. |
| Growing multi-project studio | ~20,000+ dynamic reads per day or many dozens of completed / modified / cancelled pledges per day | Start planning for Paid before a major push. Mutation-heavy days and abuse-path overhead become the part to watch first. |

As of April 18, 2026, Cloudflare documents the Workers Free plan at `100,000` requests per day. The Workers Paid plan starts at `$5/month` and includes `10 million` requests per month plus `30 million` CPU ms per month before overage pricing. Workers KV Free includes `100,000` reads/day plus only `1,000` writes/day and `1,000` list requests/day, while Workers KV on the Paid plan includes `10 million` reads/month and `1 million` writes/month before overages:

- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Workers KV pricing](https://developers.cloudflare.com/kv/platform/pricing/)
- [Cloudflare Workers KV limits](https://developers.cloudflare.com/kv/platform/limits/)

The practical takeaway for forks is simple: The Pool can still fit the Workers Free plan for its intended “small number of concurrent campaigns, modest backer volume, one-month run” shape, especially because public read traffic is cheap and most days have little mutation traffic. The reason to move to Paid is not that Free suddenly stopped working, but that Paid gives healthier headroom for flash spikes, abuse-path KV writes, heavier modify/cancel activity, and more operator tooling.

With the v1.0.3 list-budget hardening, a normal no-queue day is expected to use roughly `48-75` Workers KV list requests over 24 hours: about one hourly idle recheck each for launch reminder dispatch and supporter email retry queues, plus occasional projection bootstraps or operator repair paths. Active launch reminder jobs and due supporter email retries still list their bounded queues when real work is pending.

One deployment nuance: Cloudflare's configurable `limits` block is only enforced on the Standard Usage Model and only on deployed Workers, not in local development. That means the new `cpu_ms` guard is a denial-of-wallet backstop for Paid deployments, while Workers Free still relies on Cloudflare's built-in free-plan ceilings.

## Testing

```bash
npm run test:premerge  # Syntax + full/focused regressions + first-party build checks + local smoke + security + headless E2E
npm run test:secrets   # Secret exposure audit against local env files, tracked files, and git history
npm run release:smoke -- --evidence-file /tmp/pool-release-smoke.md # Release sign-off wrapper
npm run release:a11y-evidence # Focused campaign/cart accessibility evidence
npm run release:i18n-seo-evidence # Rendered i18n/SEO evidence over built _site
npm run release:pledge-evidence # Worker-backed pledge/report evidence
npm run release:providers -- --no-dev-vars # Read-only external provider readiness
npm run release:payment-smoke -- --no-dev-vars # Payment contract and no-send smoke evidence
npm run test:unit      # Unit tests (Vitest)
npm run test:e2e       # E2E tests (Playwright) — fully automated browser coverage
npm run test:e2e:headless # CI-style automated browser suite
npm run test:e2e:headless:podman -- tests/e2e/accessibility-public-pages.spec.ts --project=chromium # Podman-backed public accessibility slice
npx playwright test tests/e2e/admin-dashboard.spec.ts --project=chromium # Focused admin dashboard browser suite
npm run test:e2e:headless:podman -- tests/e2e/admin-dashboard.spec.ts --project=chromium # Podman-backed admin create/preview dashboard suite
node --check assets/js/admin-dashboard.js # Dashboard JavaScript syntax check
npm run test:security  # Security tests — pen testing the Worker API
npm run test:security:podman # Security tests with a Podman-backed local stack in one invocation
npm run assets:minify:check # Check built _site CSS/JS for remaining minification savings
npm run media:optimize:check # Check uploaded media for pending optimization/derivatives
npm run media:optimize:check:podman # Same media check inside the Podman toolchain
npm test               # Run unit + e2e
```

For production release sign-off, prefer `npm run release:smoke -- --evidence-file /tmp/pool-release-smoke.md`. It wraps the merge gate, setup/deploy readiness dry run, Podman E2E when available, focused accessibility evidence, rendered i18n/SEO evidence, pledge/report evidence, provider checks, and payment smoke readiness. Use the `--skip-*` flags only when the skipped item is covered by separate evidence in the release notes.

Local reporting:
```bash
./scripts/pledge-report.sh --local
./scripts/fulfillment-report.sh --local
./scripts/check-projections.sh
ADMIN_SECRET=... ./scripts/check-observability.sh --local
```

Remote production/dev reporting reads Cloudflare KV through Wrangler, so authenticate Wrangler first:
```bash
cd worker && npx wrangler login

# Or, for non-interactive shells and Podman-backed report runs:
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
./scripts/pledge-report.sh --env production --remote > ~/Desktop/pool-pledge-report.csv
./scripts/fulfillment-report.sh --env production --remote > ~/Desktop/pool-fulfillment-report.csv
```
For Podman-backed remote reports, prefer `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the host shell or an ignored local env file such as `.env.local`, `.env.cloudflare`, or `worker/.dev.vars`; the report wrappers pass those Cloudflare auth values into `podman exec`. Fork setup:

1. In Cloudflare, create a user API token from **My Profile -> API Tokens -> Create Token**.
2. Grant **Account / Workers KV Storage / Read** for the account that owns the `PLEDGES` KV namespace.
3. Add the token and account id to `worker/.dev.vars`:

```bash
CLOUDFLARE_API_TOKEN=your-token
CLOUDFLARE_ACCOUNT_ID=your-account-id
```

Then run the remote production exports through the Podman worker container:

```bash
./scripts/pledge-report.sh --podman --env production --remote > ~/Desktop/pool-pledge-report.csv
./scripts/fulfillment-report.sh --podman --env production --remote > ~/Desktop/pool-fulfillment-report.csv
```

Remote reports print pledge-fetch progress to stderr, so redirected CSV output stays clean.

Podman-backed local testing:

```bash
./scripts/test-checkout.sh --podman  # Manual interactive checkout helper against the Podman dev stack
./scripts/test-e2e.sh --podman       # Automated browser helper against the Podman dev stack
./scripts/test-worker.sh --podman    # Site/Worker contract smoke against the Podman dev stack
./scripts/smoke-pledge-management.sh --podman  # Mutable-pledge smoke against the Podman dev stack
./scripts/pledge-report.sh --podman --local    # Local ledger CSV through the Worker container
./scripts/fulfillment-report.sh --podman --local # Local fulfillment CSV through the Worker container
npm run test:e2e:headless:podman     # Automated browser suite with Playwright in a container
npm run test:security:podman         # Security suite against a one-shot Podman-backed local stack
```

The pre-merge gate now tries the host Bundler/Jekyll path first, including a one-time `bundle install` attempt when Bundler is present but gems are missing. It keeps the lighter host Worker smoke, but runs the mutable-pledge smoke through the Podman-backed stack so the stateful modify/cancel path uses isolated local service state even when the host build path succeeds. That mutable smoke also rotates its synthetic admin request IPs so the Worker's real admin rate limit does not create false failures during local projection rebuild checks. If the host Ruby path still cannot produce a clean build, the gate now falls back to the Podman-backed artifact build instead of failing early on host setup.

The headless browser harness now builds a clean static `_site` and serves it with a lightweight HTTP server rather than relying on `jekyll serve`, which keeps browser regressions closer to the actual published asset shape.

- `pledge-report.sh` is a ledger/history export, so modified pledges appear as deltas and mixed changes now keep tip-update context in the `items` column.
- `fulfillment-report.sh` is the merged current-state view per `email + campaign`, which is the better comparison point for repeat backers and non-stackable projects.
- `check-projections.sh` is the read-only operator check for stored `campaign-pledges:{slug}`, `stats:{slug}`, and `tier-inventory:{slug}` drift before you decide to repair anything.
- if the site ever drifts from the current-state fulfillment view, the admin stats/inventory recalc paths now self-heal stale `campaign-pledges:{slug}` indexes instead of trusting them forever.

**Current full-suite baseline:**
- Pre-merge gate: passes locally and in the PR `Merge Smoke` workflow
- Unit, security, and headless E2E suites are green on this branch

**Test coverage includes:** live-stats functions, platform tip helpers, first-party checkout intent hashing and payload wiring, supporter email tip breakdowns, launch reminder signup/unsubscribe/dispatch paths, abandoned-checkout opt-in/dispatch/suppression paths, pledge-management flags, settlement totals, progress bars, tier unlocks, support items, countdown timers, cart flow, accessibility (including axe-backed public-page checks across campaign, community, and pledge-result states, ARIA snapshots, and keyboard-only checkout/manage/community/public-control assertions), mobile viewport regressions for public pages and pledge flows, campaign states, secret exposure auditing, campaign-content HTML/link/embed auditing, serialized tier-inventory coordination, and hardening around `/checkout-intent/start`, webhook handling, magic-link scope, settlement integrity, and paginated rebuild/backfill paths.

For local merge smoke on mutable pledges, use:

```bash
./scripts/smoke-pledge-management.sh
```

For the lighter site/Worker contract smoke, including removed-endpoint checks and malformed `/checkout-intent/start` coverage, use:

```bash
./scripts/test-worker.sh
```

See [TESTING.md](docs/TESTING.md) for full testing guide and [SECURITY.md](docs/SECURITY.md) for security architecture.

## Documentation

See [`docs/`](docs/) for full documentation:

Good starting points after cloning a fork are [PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md), [CUSTOMIZATION.md](docs/CUSTOMIZATION.md), [PAYMENT_PROCESSOR.md](docs/PAYMENT_PROCESSOR.md), [EMAIL.md](docs/EMAIL.md), [SECURITY.md](docs/SECURITY.md), [ETHICAL_RISK.md](docs/ETHICAL_RISK.md), and [TESTING.md](docs/TESTING.md).

- [CONTRIBUTING.md](docs/CONTRIBUTING.md) — Getting started, setup & contribution guide
- [CHANGELOG.md](CHANGELOG.md) — Release notes
- [PODMAN.md](docs/PODMAN.md) — Rootless Podman local dev path for Jekyll + Worker
- [PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) — System architecture
- [WORKFLOWS.md](docs/WORKFLOWS.md) — Pledge lifecycle, magic links & charge flow
- [PAYMENT_PROCESSOR.md](docs/PAYMENT_PROCESSOR.md) — Stripe setup, checkout canonicalization, webhooks, settlement, and reconciliation
- [EMAIL.md](docs/EMAIL.md) — Resend sender setup, transactional/campaign email types, localization, and delivery behavior
- [DEV_NOTES.md](docs/DEV_NOTES.md) — Development notes, content model & FAQ
- [TESTING.md](docs/TESTING.md) — Full testing guide & secrets reference
- [SECURITY.md](docs/SECURITY.md) — Security architecture, rate limiting & pen testing
- [ETHICAL_RISK.md](docs/ETHICAL_RISK.md) — Ethical risk review prompts for data, money, messaging, admin, sharing, and automation changes
- [ACCESSIBILITY.md](docs/ACCESSIBILITY.md) — Accessibility standards, critical surfaces, and current coverage
- [CUSTOMIZATION.md](docs/CUSTOMIZATION.md) — Supported fork-facing branding, pricing, and design overrides
- [EMBEDS.md](docs/EMBEDS.md) — Hosted campaign widget routes, options, localization, and resize model
- [I18N.md](docs/I18N.md) — Current localization structure, routing model, and language-addition workflow
- [SHIPPING.md](docs/SHIPPING.md) — Current shipping model, USPS setup, and fallback policy
- [SEO.md](docs/SEO.md) — Current crawl, metadata, JSON-LD, and noindex model
- [PERFORMANCE.md](docs/PERFORMANCE.md) — Platform performance model, generated asset minification, Cloudflare compression, runtime loading, caching, media, deferred YouTube hero embeds, and safe public prefetching
- [ADD_ON_PRODUCTS.md](docs/ADD_ON_PRODUCTS.md) — Current global add-on catalog structure and initial merch import model
- [DASHBOARD.md](docs/DASHBOARD.md) — Private admin dashboard reference for campaign editing and operations
- [ROADMAP.md](docs/ROADMAP.md) — v1.0 release status and post-v1.0 follow-ups
- [Campaign Creator Checklist](creator-campaign-checklist.md) — Public creator launch-prep worksheet, with Spanish route at `/es/creator-campaign-checklist/`

## Key Directories

```
admin.md              # Private admin dashboard route
_campaigns/           # Markdown campaign files
_layouts/             # Page templates (campaign, community, manage, etc.)
_includes/            # Reusable components
  └── blocks/         # Content block renderers (text, image, video, gallery, etc.)
_plugins/             # Jekyll plugins (money filter, campaign state)
assets/
  ├── main.scss       # Sass entry point
  ├── partials/       # Modular Sass (14 focused partials)
  │   ├── _variables.scss     # Colors, spacing, typography tokens
  │   ├── _mixins.scss        # Breakpoints, button patterns
  │   ├── _base.scss          # Reset, typography, links
  │   ├── _layout.scss        # Page structure, grid, header
  │   ├── _buttons.scss       # Button variants
  │   ├── _forms.scss         # Form elements
  │   ├── _cards.scss         # Campaign cards, tier cards
  │   ├── _progress.scss      # Progress bars, stats
  │   ├── _modal.scss         # Modal dialogs
  │   ├── _campaign.scss      # Campaign page specifics
  │   ├── _community.scss     # Community/voting pages
  │   ├── _manage.scss        # Pledge management page
  │   ├── _content-blocks.scss # Rich content rendering
  │   ├── _utilities.scss     # Helper classes
  └── js/             # Client-side scripts
      ├── cart.js             # Pledge flow (tiers, support items, tip UI, shipping detection)
      ├── campaign.js         # Phase tabs, toasts
      ├── admin-dashboard.js  # Private dashboard UI, editors, tables, and publish flows
      ├── buy-buttons.js      # Button handlers
      ├── live-stats.js       # Real-time stats, inventory, tier unlocks, late support
      └── cart-provider.js    # First-party cart/runtime provider
worker/               # Cloudflare Worker (pledge.dustwave.xyz)
  └── src/            # Worker source (Stripe, email, voting, tokens, tip-aware totals)
scripts/              # Automation & reporting
  ├── dev.sh               # Start all dev services (host mode or Podman mode)
  ├── dev-podman.sh        # Rootless Podman launcher for Jekyll + Worker
  ├── setup-deploy.mjs     # Cross-platform local/production setup helper
  ├── pledge-report.sh     # Ledger-style CSV report (history entries incl. tip columns)
  ├── fulfillment-report.sh # Aggregated CSV report (current state by backer, total incl. tip)
  ├── smoke-pledge-management.sh # Local end-to-end modify/cancel smoke on the test-only campaign
  └── seed-all-campaigns.sh # Seed test pledges for all campaigns (local KV)
tests/                # Test suites
  ├── unit/               # Vitest unit tests (JS functions)
  ├── e2e/                # Playwright E2E tests (browser flows)
  └── security/           # Vitest security / abuse-path coverage for the Worker
```

## Deployment

Push `main` to deploy production:
```bash
git push origin main
```

That GitHub Actions workflow now deploys both:
- the GitHub Pages site
- the Cloudflare Worker from `worker/wrangler.toml`

The Pages build runs Jekyll first, then `npm run assets:minify` against generated `_site/assets/**/*.css` and `_site/assets/**/*.js` before uploading the artifact. Source files stay readable in the repository; Cloudflare still handles gzip/Brotli/Zstandard compression at the edge, so Cloudflare Auto Minify should stay disabled.

Required GitHub repository secrets for automatic Worker deployment:
- `CLOUDFLARE_API_TOKEN` from a **user API token** created under **My Profile -> API Tokens**, using the **Edit Cloudflare Workers** template and scoped to this account and the `dustwave.xyz` zone. Do not use an account-owned API token; Wrangler still calls user-scoped endpoints such as memberships during deploy.
- `CLOUDFLARE_ACCOUNT_ID`
- `ADMIN_SECRET` for the post-deploy diary check
- optional `ADMIN_BROADCAST_SECRET` for the post-deploy diary check when the Worker uses scoped broadcast credentials
- optional `CLOUDFLARE_CACHE_PURGE_TOKEN` with zone cache-purge permissions if you want cache purging to use a token narrower than the deploy token. This is recommended; otherwise the deploy token must also be allowed to purge cache.
- optional `CLOUDFLARE_DNS_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, and `CLOUDFLARE_ZONE` for the Release Provider Evidence workflow. The DNS token should be read-only with Zone / DNS / Read for the production zone.
- optional `DIARY_CHECK_BYPASS_SECRET` if Cloudflare WAF challenges the post-deploy diary check

For a guided first-time setup, run:

```bash
npm run setup:deploy -- --mode=production --dry-run
npm run setup:deploy -- --mode=production --deploy
```

Review the dry run before applying changes. The helper automates the repetitive setup but does not replace reviewing Cloudflare token scopes, GitHub repository permissions, Stripe webhook endpoints, Resend sender verification, Turnstile widgets, USPS/ZIP.TAX provider credentials, and the merge smoke checklist.

Set the matching `ADMIN_BROADCAST_SECRET` or `ADMIN_SETTLEMENT_SECRET` in Cloudflare Worker secrets before relying on scoped route enforcement in production. Add `ADMIN_SETTLEMENT_SECRET` to GitHub repository secrets only if a GitHub Actions or operator workflow actually calls settlement endpoints. Keep separate local-only values in `worker/.dev.vars`; do not copy production values there as a backup.

The workflow also needs GitHub Pages deployment permissions. Keep `pages: write` and `id-token: write` explicit on the Pages deploy job if you copy or refactor `.github/workflows/deploy.yml`.

Dashboard-uploaded media is source-preserving when it enters the repository. Image and video uploads dispatch the separate **Optimize dashboard media** workflow with `scope=changed` after the GitHub commit succeeds; audio uploads remain source-preserved because that workflow does not process `assets/audio`. Campaign Content, diary content, and Blast email image uploads all reuse this same campaign asset path, so email images are hosted on the site domain and optimized by the repository media workflow instead of being hotlinked from arbitrary external hosts. Image blocks can also select existing campaign images from a read-only media-library picker; super admins may choose shared/default images, while campaign users stay campaign-scoped. The workflow also runs on `main` for `assets/images/**`, `assets/videos/**`, `_campaigns/**`, and `_config.yml` changes; it compresses images when smaller output is available, generates responsive WebP variants for public image templates at `320w`, `480w`, `640w`, `960w`, and `1600w`, generates WebM derivatives for uploaded videos, rewrites literal video references after derivatives exist, and opens a pull request with those optimization changes instead of pushing directly to `main`. Use the manual `scope=all` workflow option when existing campaign media needs a full reprocess or non-dashboard media needs to be swept.

If the diary check logs an HTTP `403` Cloudflare challenge page, the request is being stopped before it reaches the Worker. Add a Cloudflare WAF custom rule that skips managed challenges for:

- host equals `pledge.dustwave.xyz`
- path equals `/admin/diary/check`
- method equals `POST`
- header `X-Pool-Diary-Check` equals the `DIARY_CHECK_BYPASS_SECRET` value

Suggested expression:

```text
(http.host eq "pledge.dustwave.xyz" and http.request.method eq "POST" and http.request.uri.path eq "/admin/diary/check" and any(http.request.headers["x-pool-diary-check"][*] eq "your-bypass-secret"))
```

The Worker still requires `Authorization: Bearer ADMIN_BROADCAST_SECRET` when scoped broadcast credentials are configured, otherwise `Authorization: Bearer ADMIN_SECRET`; the bypass header only lets the GitHub Actions automation reach that authenticated endpoint.

Manual Worker fallback from the repo root:
```bash
npm run deploy:worker
```

The Worker powers:
- on-site Stripe setup-mode session bootstrap for the first-party checkout sidecar and the Manage Pledge `Update Card` modal, with hosted fallback still available as a compatibility path
- webhook processing and pledge persistence
- tip-aware total calculation
- supporter email delivery via Resend
- upcoming-campaign launch reminder delivery through the shared Resend path
- consent-based abandoned-checkout reminder delivery through the shared Resend path
- Campaigns -> Blast supporter email delivery through the shared Resend path
- batched settlement and retry flows
- browser admin dashboard auth, read APIs, GitHub-backed publish APIs, protected campaign previews, new campaign creation, user management, marketing referral saves, and legacy shared-secret admin endpoints

---

*🄯 Dust Wave*
