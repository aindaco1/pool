# Testing Guide

This guide covers the automated test suites, local test infrastructure, and manual verification paths. Weekly synthetic recovery, protected preview drills, and post-restore verification are documented in [BACKUP_RESTORE.md](./BACKUP_RESTORE.md).

`npm run jekyll-template:check` verifies that the 17 locally built Jekyll
integration files still match the exact pinned golden-project template. The
pre-merge gate runs this check before builds and also rejects the template
submodule from generated site output. `npm run jekyll-template:sync` is an
explicit upgrade-branch operation, not a build step.

## Quick Reference

```bash
npm run test:unit          # Unit tests (Vitest) — ~700ms
npm run test:unit:watch    # Watch mode
npm run test:unit:coverage # With coverage report
npm run test:i18n          # Supported locale catalog completeness check
npm run test:seo           # Generated-site SEO/crawl audit; build _site first
npm run test:crawl-endpoints -- --base=https://pool.dustwave.xyz  # Live sitemap/robots/URL fetch audit
npm run test:performance:budgets  # Generated JS/CSS release ceilings
npm run test:performance:lighthouse # Core-route Lighthouse evidence in Podman
npm run test:performance:runtime # Authenticated/redacted Worker p95 evidence; requires input or token
npm run test:cache-policy  # Deployed public/private cache-header evidence
npm run test:secrets       # Secret exposure audit for local env files
npm run test:premerge      # Merge-readiness checks for changed Worker logic
npm run release:smoke -- --evidence-file /tmp/pool-release-smoke.md  # Release sign-off wrapper
npm run release:a11y-evidence   # Focused campaign/cart accessibility evidence
npm run release:i18n-seo-evidence  # Rendered i18n/SEO evidence over built _site
npm run release:pledge-evidence # Worker-backed pledge/report evidence
npm run release:providers -- --no-dev-vars  # Read-only external provider readiness
npm run release:payment-smoke -- --no-dev-vars  # Payment contract and no-send smoke evidence
npm run test:e2e           # E2E tests (Playwright) — fully automated browser coverage
npm run test:e2e:headless  # CI mode
npm run test:e2e:headless:podman  # Automated browser suite with Playwright in Podman
npm run test:e2e:parity    # First-party critical-path browser flows
npx playwright test tests/e2e/admin-dashboard.spec.ts --project=chromium  # Focused admin dashboard browser suite
npm run test:e2e:headless:podman -- tests/e2e/admin-dashboard.spec.ts --project=chromium  # Podman-backed admin create/preview/browser suite
npm run podman:doctor      # Cross-platform Podman readiness check
npm run test:security      # Security pen tests (Worker must be running)
npm run test:security:podman  # Security pen tests with a one-shot Podman-backed stack
npm run test:security:staging  # Security tests against a staging worker, if you maintain one
npm run media:optimize:check   # Check dashboard-uploaded media for pending optimization/responsive variants/derivatives
npm run media:optimize:check:podman  # Same media check inside the Podman toolchain
./scripts/test-checkout.sh --podman  # Manual checkout helper against the Podman stack
./scripts/test-e2e.sh --podman       # Automated browser helper against the Podman stack
npm run test:usps          # Live USPS credential + quote sanity check
npm test                   # Run all tests
```

`./scripts/test-e2e.sh --podman` is now the fully automated browser path. Use `./scripts/test-checkout.sh --podman` when you specifically want to drive the checkout manually in a real browser.

The local Worker test path now prefers Node 24, matching GitHub Actions. Run `nvm use` from the repository root to select the supported Node 24.15 baseline. The host scripts fall back to Node 22.22.2 or newer if a fork has that installed; unsupported odd-numbered Node releases are rejected by npm so jsdom and the test runner do not silently run outside their declared engine ranges.

For the accessibility-focused browser slice, use:

```bash
./scripts/podman-playwright-run.sh npx playwright test \
  tests/e2e/accessibility-public-pages.spec.ts \
  tests/e2e/manage-flows.spec.ts \
  tests/e2e/community-flows.spec.ts \
  tests/e2e/public-page-controls.spec.ts \
  tests/e2e/campaign-checkout.spec.ts \
  --project=chromium \
  --grep "Public Page Accessibility|keyboard-only|Community Flows|Public Page Keyboard Controls"
```

If you want just the public accessibility regression sweep and do not want to depend on host Ruby/Bundler, prefer the Podman-backed path:

```bash
npm run test:e2e:headless:podman -- tests/e2e/accessibility-public-pages.spec.ts --project=chromium
```

## Release Evidence

Use the release wrapper before production sign-off:

```bash
npm run release:smoke -- --evidence-file /tmp/pool-release-smoke.md
```

The wrapper runs the merge gate, setup/deploy production readiness dry run, Podman headless E2E when Podman is available, focused accessibility evidence, rendered i18n/SEO evidence, Worker-backed pledge/report evidence, read-only provider checks, and payment smoke readiness. Optional screen-reader transcript evidence is available with `--screen-reader-evidence` when local VoiceOver/Whisper capture is prepared.

The focused commands are useful when one slice needs to be rerun:

```bash
npm run release:a11y-evidence
npm run release:i18n-seo-evidence
npm run release:pledge-evidence
npm run release:providers -- --no-dev-vars
npm run release:payment-smoke -- --no-dev-vars
npm run test:performance:budgets
npm run test:performance:lighthouse
npm run test:performance:runtime -- --input=/path/to/redacted-performance-observability.json
npm run test:cache-policy
```

Lighthouse, deployed cache-policy, and authenticated Worker timing checks follow the Store release-evidence model and are not required on every pull request. Their pure evaluators remain covered by the unit suite, while dashboard readiness/tab/table limits are exercised by the admin browser suite. Human VoiceOver, NVDA, and native-Spanish reviews are optional release evidence; automated accessibility, i18n completeness, and rendered SEO checks remain required.

Provider checks are read-only and use shell credentials first. In CI, the Release Provider Evidence workflow runs `npm run release:providers -- --cloudflare-dns-only --strict --no-dev-vars` with `CLOUDFLARE_DNS_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, and `CLOUDFLARE_ZONE`.

Set `POOL_EMAIL_DRY_RUN=true` or `RESEND_EMAIL_DRY_RUN=true` for no-send email evidence during local mutation smoke. The payment smoke keeps pledge mutation evidence opt-in through `--local-mutation` / `PAYMENT_SMOKE_ALLOW_MUTATION=1` and refuses production hosts unless explicitly overridden.

## Ethical Risk Review

Automated tests cannot prove that a product change is ethically safe. For features that touch money, supporter data, messaging, analytics, automation, public sharing, or admin power, include a short [Ethical Risk review](./ETHICAL_RISK.md) in the PR or release notes.

Useful evidence includes:

- consent and opt-out behavior for reminders, Blast, previews, and supporter communications
- dry-run/no-send evidence before bulk email or report delivery
- noindex, sitemap, social-preview, and prefetch checks for private/tokenized surfaces
- Worker-canonical total checks for campaign progress, add-ons, tips, tax, shipping, inventory, and settlement
- accessibility and i18n checks for affected user-facing flows
- an abuse-path note for how the feature could be used for spam, harassment, fraud, doxxing, misleading claims, or excessive engagement pressure

Treat new hidden tracking, unbounded notifications, misleading public metadata, browser-trusted money logic, or public exposure of private/tokenized state as release blockers until mitigated.

---

## Unit Tests (Vitest)

Fast, isolated tests for JS functions in `tests/unit/`.

### Coverage

| Module | Functions Tested |
|--------|-----------------|
| `live-stats.js` | `formatMoney`, `updateProgressBar`, `updateMarkerState`, `checkTierUnlocks`, `checkLateSupport`, `updateSupportItems`, `updateTierInventory` |
| `platform-tip` | Tip sanitization, tip percent derivation, tip amount calculation |
| `pledge-management` | DST-aware deadline enforcement through the configured platform timezone, cancel/modify/payment-method validation, pledge status transitions, multi-campaign independence, shipping in pledge records, API response shape |
| `settlement` / `stripe-client` | Charge aggregation, deterministic settlement, Stripe API version/idempotency/error normalization, payment success/failure, retry flow, batched dispatch, stale/resume state, campaign pledge index, and cron heartbeat |
| `email-broadcasts` | Diary excerpt extraction (with ellipsis truncation), diary/milestone tracking helpers, milestone checking logic, rate limiting |
| `email-tip` | Tip-aware supporter email breakdowns across confirmation / modified / cancelled / failed / charged emails, plus launch reminder and abandoned-checkout email routing through the shared updates sender |
| `email-outbox` | Durable enqueue dedupe, frozen payload/idempotency, provider retry timing, campaign/global suppression, Resend webhook signature verification, and delivery evidence |
| `votes` | Email-based vote storage/dedup, vote status retrieval, campaign results, result aggregation |
| `admin-dashboard` | Dashboard dirty-state tracking, settings serialization, content/editor normalization, staged media uploads/media picker, actual Stripe fee analytics/backfill, Analytics attribution reporting, marketing shared drafts, abandoned-checkout health/suppression, referral URL helpers, responsive/i18n support utilities |
| `i18n-completeness` | Supported locale catalogs stay aligned with the English nested key surface |
| `campaign-page` | Share-link URL construction, safe query preservation, state-aware share text, launch reminder form submission, public campaign controls, and SEO-sensitive campaign-page behavior |
| `page-prefetch` | Same-origin public-route allowlisting, sensitive-query exclusions, network guards, delay/limit handling, and document prefetch hint creation |
| `cart-runtime-loader` | Lazy cart-runtime boot, persisted/recovery cart detection, idempotent loading, and user-intent triggers |
| `site-asset-minification` | Generated `_site` CSS/JS minification behavior and check-mode failure cases |
| `media-optimization-script` | Changed-file selection, source/derived classification, deterministic manifests, placement budgets, lossless image optimization decisions, video derivative naming, and source-to-WebM reference rewrites |

### Running

```bash
npm run test:unit          # Run once
npm run test:unit:watch    # Watch mode for development
npm run test:unit:coverage # Generate coverage report
```

---

## Pre-Merge Regression Runbook

Use this before merging branches that touch checkout, Worker business logic, fulfillment, or broadcast flows.

### Automated Gate

```bash
npm run test:premerge
```

This runs:

- `npm run test:secrets` to verify local env files stay ignored and their secret values do not appear in tracked files or git history
- `node --check` for the changed Worker entrypoints
- Release evidence command sanity checks: release script syntax, `release:smoke -- --help`, `release:providers -- --help`, and `release:payment-smoke -- --no-dev-vars`
- Focused regression suites:
  - `tests/unit/worker-business-logic.test.ts`
  - `tests/unit/worker-ops-integrity.test.ts`
  - `tests/unit/stats-pagination.test.ts`
  - `tests/unit/setup-deploy-script.test.ts`
- Worker suites cover launch reminder signup validation, abandoned-checkout opt-in/dispatch/suppression, signed checkout resume links, campaign-scoped suppression, aggregate health counters, unsubscribe suppression, queued dispatch idempotency, and the shared Resend send path.
- Setup-helper tests run the deployment CLI in temporary repo copies with fake `npm`, `npx`/Wrangler, `gh`, `stripe`, and `ruby` commands. They cover help/error handling, dry-run no-write behavior, KV namespace reuse/create planning, non-interactive local secret generation, generated production Worker secrets, and read-only readiness probes without live provider mutations.
- Content safety filter regressions in `tests/unit/content-safety-filter.test.ts`, including unsafe Markdown link schemes, dashboard-authored emphasis spacing, and strict structured-embed URL validation
- Campaign-content audit coverage in `tests/unit/campaign-content-security.test.ts`, including the allowed inline HTML subset and rejection of disallowed raw tags
- Durable Object tier-inventory serialization coverage in `tests/unit/tier-inventory-do.test.ts`
- Local smoke scripts against the test-only mutable campaign:
  - `scripts/test-worker.sh` for site/Worker contract checks and malformed `/checkout-intent/start` verification
  - `scripts/smoke-pledge-management.sh` for successful modify/cancel coverage on the local-only mutable campaign, using admin rebuild responses plus read-only projection drift checks as the authoritative stats/inventory source during the smoke
    The script now rotates its synthetic admin request IPs during those rebuild/check calls so the real admin rate limiter does not create a false negative in local merge gating.
- Full unit suite via `npm run test:unit`
- Security suite via `npm run test:security` against an auto-started local Worker
- Podman-backed security suite via `npm run test:security:podman` when you want the site/Worker stack booted and exercised in the same invocation
- First-party build artifact checks that run Jekyll, minify generated `_site` CSS/JS assets, verify the minified output has no remaining savings, and run `npm run test:seo` against generated crawl/metadata output
- Public-page performance and sharing regressions through unit coverage for intent prefetching, lazy cart-runtime loading, generated asset minification, and campaign share-link behavior
- Playwright headless E2E via `npm run test:e2e:headless`

The pre-merge script now auto-starts Jekyll with `_config.yml,_config.local.yml` when needed so the local-only `smoke-editable` campaign is available during merge gating, and the Playwright harness uses the same combined config locally.
That gate now tries the host Bundler/Jekyll path first, including a one-time `bundle install` attempt when Bundler is present but gems are missing. It keeps the lighter host Worker smoke, but runs the mutable-pledge smoke through the Podman-backed stack so the stateful modify/cancel path uses isolated local service state even when the host build path succeeds. If the host Ruby path still cannot build cleanly, it falls back to a Podman-backed Jekyll build plus the remaining Podman-aware smoke/browser helpers instead of failing on host setup alone.
Both Jekyll helpers fail immediately when their build command fails, so minification and artifact validation cannot accidentally reuse stale `_site` output.
For headless browser runs, Playwright now builds a static `_site` and serves that output with a lightweight HTTP server instead of using `jekyll serve`, which keeps automated browser checks closer to the real published asset layout.

This branch now defaults to the first-party cart/runtime path in both `_config.yml` and `_config.local.yml`, and the browser path no longer supports the old hosted-cart runtime.

Recent security hardening that the gate now covers includes:

- fail-closed `GET /pledge` behavior when a magic-link token exists but the pledge row does not
- Markdown link-scheme neutralization in long-form content
- exact-origin validation for structured embeds (`spotify`, `youtube`, `vimeo`)
- serialized limited-tier inventory reservations at checkout start and confirmation at successful persistence time
- launch reminder Turnstile verification, deduped signup storage, scoped unsubscribe suppression, and idempotent dispatch

Media optimization is intentionally separate from the pre-merge gate because it depends on native tools such as FFmpeg and image optimizers. Dashboard image/video uploads request the optimizer after commit, but when a branch includes manually-added media or you need to verify generated variants before merge, run:

```bash
npm run media:optimize:check
npm run media:optimize:check:podman # use when host-native media tools are missing
```

The local Worker defaults in [worker/wrangler.toml](../worker/wrangler.toml) now match that first-party setup. `./scripts/dev.sh --podman` now auto-generates a local `CHECKOUT_INTENT_SECRET` in `worker/.dev.vars` if it is missing, so fresh local checkout starts do not fail closed on an uninitialized dev secret.

When the merge gate or local security suite uses the placeholder `STRIPE_SECRET_KEY=sk_test_smoke`, `/test/setup` seeds deterministic synthetic Stripe customer IDs instead of calling Stripe. Use a real Stripe test key only when you specifically need payment-method-update smoke coverage against Stripe's API.

For local work, prefer `./scripts/dev.sh --podman`. It starts Jekyll and the Worker in rootless Podman containers while preserving the same ports and local Wrangler state.

[`_config.local.yml`](../_config.local.yml) is now an override-only layer, not a second base config. When you change or add fork-facing settings, prefer [`_config.yml`](../_config.yml) unless the value should truly differ only on your local machine.

The browser helper scripts support the same mode:

```bash
./scripts/test-checkout.sh --podman
./scripts/test-e2e.sh --podman
./scripts/test-worker.sh --podman
./scripts/smoke-pledge-management.sh --podman
./scripts/pledge-report.sh --podman --local
./scripts/fulfillment-report.sh --podman --local
```

Those helpers still run Playwright and shell smoke logic on the host for now, but they boot the site and Worker through the shared Podman-backed local stack first. The report scripts can now run directly through the Worker container as well. That keeps local testing and exports closer to production-like service boundaries without forcing host Ruby or host Wrangler setup.

For host-side commands that need the Podman-backed stack but should not depend on detached stack persistence across separate shells, use [`scripts/podman-stack-run.sh`](../scripts/podman-stack-run.sh). `npm run test:security:podman` uses that wrapper.

For a mostly host-independent browser path, `npm run test:e2e:headless:podman` now runs the automated Playwright suite inside a dedicated Podman container on the same local pod network as the site and Worker.

Recent browser coverage also includes dedicated mobile viewport assertions for:

- campaign pages and secondary public controls
- cart / checkout drawers on small phone sizes
- Manage Pledge and Update Card reachability on short mobile viewports
- no-horizontal-overflow checks on the main public and pledge-management paths

Recent public-page coverage also now protects more localized campaign chrome, including:

- hero video play/loading states
- supporter-community teaser copy
- diary tab labels and empty states
- production-phase labels and CTA copy
- gallery accessibility labels

The content-safety filter suite in `tests/unit/content-safety-filter.test.ts` also falls back to Podman when host Bundler/Jekyll gems are unavailable. On macOS, it can start the Podman machine as part of that fallback.

The current Podman scope is intentionally narrow:

- included: Jekyll, Worker, local `worker/.dev.vars`, local Wrangler state, optional host Stripe CLI forwarding, Podman-aware `test-checkout.sh`, `test-e2e.sh`, `test-worker.sh`, `smoke-pledge-management.sh`, `pledge-report.sh`, and `fulfillment-report.sh`
- included too: containerized headless Playwright for the automated browser suite
- not yet included: a containerized interactive manual checkout browser step

Use [docs/PODMAN.md](./PODMAN.md) for the exact setup and current limitations.

If you change `pricing.sales_tax_rate` or `shipping.fallback_flat_rate` in the Jekyll config, the repo now auto-syncs the mirrored Worker values in [worker/wrangler.toml](../worker/wrangler.toml) through the main dev/test paths. Restart `./scripts/dev.sh --podman` before testing checkout math so both services pick up the new values.

If you tune free-plan read behavior, keep these in sync too:

- `cache.live_stats_ttl_seconds`
- `cache.live_inventory_ttl_seconds`
- `performance.intent_prefetch_enabled`
- `performance.intent_prefetch_delay_ms`
- `performance.intent_prefetch_limit`

After changing those cache or performance knobs locally, restart `./scripts/dev.sh --podman` and rerun:

```bash
npx vitest run tests/unit/live-stats.test.ts tests/unit/manage-page.test.ts tests/unit/config-boot.test.ts
```

Those suites protect the combined `/live/:slug` read path, the browser cache behavior, and the config boot wiring that forks rely on.

For the public prefetch, share-link, and lazy cart-runtime surfaces, use:

```bash
npx vitest run \
  tests/unit/page-prefetch.test.ts \
  tests/unit/cart-runtime-loader.test.ts \
  tests/unit/campaign-page.test.ts \
  tests/unit/seo-layouts.test.ts \
  tests/unit/site-asset-minification.test.ts
```

For generated crawl and structured metadata output, build and minify the site first, then run:

```bash
SKIP_TESTS=1 bundle exec jekyll build --config _config.yml,_config.local.yml --quiet
npm run assets:minify
npm run test:seo
```

The SEO audit checks the built pages, `robots.txt`, `sitemap.xml`, the matching one-URL-per-line diagnostic `sitemap.txt`, canonical URLs, authored freshness hints, hreflang alternates, Open Graph/Twitter metadata, and JSON-LD. Local test-only campaigns can be built for smoke coverage but remain intentionally absent from either sitemap format.

After a production deploy, verify the actual origin-facing crawl surface:

```bash
npm run test:crawl-endpoints -- --base=https://pool.dustwave.xyz --attempts=6 --retry-delay-ms=5000
```

This dependency-free audit is safe to run in the deploy job after the root build dependencies are gone. It compares ordinary and Google Inspection bodies for the XML and text sitemaps, requires their ordered public URL lists to match, enforces XML/text/robots MIME types, checks the canonical XML sitemap advertisement, and fetches every submitted page. A normal Cloudflare JavaScript-detection injection in an otherwise complete HTML page is permitted; an interstitial without the page's canonical link and main content fails. Bounded retries cover normal propagation without turning a persistent crawl defect into a warning.

On GitHub, the same gate runs automatically in the `Merge Smoke` workflow for pull requests targeting `main`.

The merge gate now writes one log file per phase and prints a final PASS/FAIL summary with log paths. If a late Podman-backed phase fails, start with the log directory printed at the end of the run instead of scrolling through the whole transcript.

### Secret Audit

Run this before pushing when local secrets have changed, or let `npm run test:premerge` run it automatically:

```bash
npm run test:secrets
```

The audit checks:

- `worker/.dev.vars` remains gitignored and untracked
- non-allowlisted secret values from local env files do not appear in tracked or untracked repo files
- those values do not appear in git history

CI remains safe when `worker/.dev.vars` does not exist; in that case the audit still verifies ignore rules and skips the local value scan.

### Main Branch Comparison

Run the same automated gate on `main` in a clean worktree so the baseline and the patch branch are directly comparable. If `main` predates `test:premerge`, run the equivalent syntax, unit, security, and E2E commands manually there.

```bash
git worktree add ../pool-main-check main
ln -s "$(pwd)/node_modules" ../pool-main-check/node_modules
cd ../pool-main-check
npm run test:premerge
```

If you create the temporary worktree, remove it after comparison:

```bash
cd -
git worktree remove ../pool-main-check
```

### Manual Smoke Checklist

Run these against staging before merge when a staging environment exists. If no staging environment exists for The Pool, run the same checklist locally with `./scripts/dev.sh --podman` and record that exception in the PR/release notes.

1. Start a new checkout on a live test campaign and confirm `/checkout-intent/start` returns a custom-session bootstrap when the matching Stripe publishable key is configured, or a hosted URL when hosted fallback is intentionally used.
2. Complete a pledge and verify the webhook stores the pledge, stats update, and confirmation email path stays healthy.
3. Modify a pledge with tier/support/custom amount changes and verify totals, history, and inventory update correctly.
4. Cancel an uncharged pledge and verify stats and inventory are released correctly.
5. Run settlement dry-run and live-run on seeded pledges, confirming campaigns only mark settled when nothing needs attention.
6. Trigger diary, announcement, and milestone broadcasts on a campaign large enough to cross pagination boundaries.
7. Trigger a fulfillment report on a campaign with both campaign and platform items, confirming that runner recipients receive only campaign rows and `support_email` receives the platform-only attachment.

For checkout or Worker business-logic changes, a smoke pass is still required before merge:

- Prefer staging when available.
- If no staging exists, use the stronger local path:
  - `./scripts/dev.sh --podman`
  - `./scripts/smoke-pledge-management.sh`
  - the operator checklist in [docs/MERGE_SMOKE_CHECKLIST.md](./MERGE_SMOKE_CHECKLIST.md)
  - a PR note explicitly stating that no staging environment exists

For an operator-ready version with exact commands and expected results, use [docs/MERGE_SMOKE_CHECKLIST.md](./MERGE_SMOKE_CHECKLIST.md).

For local rehearsal of pledge management, prefer the `smoke-editable` campaign. It is local-only via `test_only: true`, stays live well past the normal smoke window, and gives `/test/setup` a stable target for modify/cancel coverage.

You can exercise that path end to end with:

```bash
./scripts/smoke-pledge-management.sh
```

When `ADMIN_SECRET` is available, that smoke path now also verifies that the campaign remains projection-clean after setup, modify, and cancel by calling the read-only `POST /stats/:slug/check` endpoint between mutation phases.

For local CSV verification against your actual local Worker state, use:

```bash
./scripts/pledge-report.sh --local
./scripts/fulfillment-report.sh --local
```

Use `pledge-report.sh` when you want the full ledger, including modify/cancel deltas and tip-change annotations. Use `fulfillment-report.sh` when you want the merged current state for a backer within a campaign.

If the merged fulfillment view and the public site ever disagree for a campaign, treat that as a likely stale stats/inventory projection issue first, not a reporting bug by default. The admin stats and inventory recalc endpoints now repair stale `campaign-pledges:{slug}` indexes while rebuilding the campaign projection state.

Before you repair a projection, you can now check for drift explicitly:

```bash
./scripts/check-projections.sh                 # Check all campaigns
./scripts/check-projections.sh hand-relations  # Check one campaign
./scripts/check-projections.sh --podman        # Reuse/start the Podman dev stack first
```

That script calls the read-only admin drift-check endpoints and exits nonzero when stored `campaign-pledges:{slug}`, `stats:{slug}`, or `tier-inventory:{slug}` projections no longer match active pledge truth.

### Intentional Behavior Changes

When reviewing results, do not flag these as regressions:

- Magic links are now order-scoped instead of email-scoped.
- `/checkout-intent/start` now reserves scarce limited inventory before payment confirmation, and successful persistence confirms that reservation.
- Legacy `GET /checkout` is intentionally disabled.

### Adding Tests

Create files in `tests/unit/` with `.test.ts` extension:

```typescript
import { describe, it, expect } from 'vitest';

describe('myFunction', () => {
  it('does something', () => {
    expect(myFunction()).toBe(expected);
  });
});
```

---

## E2E Tests (Playwright)

Browser-based tests for full user flows in `tests/e2e/`.

### Coverage

**Campaign Page Structure:**
- Required page elements (hero, sidebar, progress bar)
- Progress bar data attributes for live-stats.js
- Milestone markers (1/3, 2/3, goal)
- Stretch goal markers

**Tier Cards:**
- First-party cart item attributes and hooks
- Inventory display for limited tiers
- Gated tier locked state and unlock badge
- Disabled states on non-live campaigns

**Physical Products & Shipping:**
- `_category` custom field (physical/digital) on tier buttons
- Physical tiers trigger first-party shipping expectation state before Stripe collection
- Digital-only campaigns have no physical category tiers

**Support Items:**
- Structure (amount, progress, input, button)
- Input → first-party cart price sync
- Late support data attributes

**Custom Amount:**
- Structure and data attributes
- Input → first-party cart price sync
- Late support attributes

**Homepage & Campaign Cards:**
- Card display and required elements
- Valid campaign links
- Featured tier button attributes

**Cart Runtime Integration:**
- Runtime bootstrap and neutral cart root
- POOL_CONFIG for live-stats.js
- Global functions (refreshLiveStats, getTierInventory)

**Cart Flow:**
- Navigation and add-to-cart
- Cart state via PoolCartProvider
- Billing auto-fill / provider-driven checkout state
- Tip slider updates cart totals immediately
- Single-tier campaigns replace the previous tier immediately when a new tier is selected
- First-party checkout preview posts canonical payloads to `/checkout-intent/start`
- First-party cancelled/success result pages restore or hydrate saved pledge state

**Manage Flow:**
- Token-backed pledge loading on `/manage/`
- Payment-method update start for active and `payment_failed` pledges
- Cancel confirmation posts to `/pledge/cancel`
- Modify confirmation posts to `/pledge/modify`

**Accessibility:**
- Skip link
- Main content landmark
- Accessible button labels
- Form input labels

**Countdown Timers:**
- Pre-rendered values (no "00 00 00 00" flash)
- Timer updates every second

**Campaign States:**
- Live campaign enabled tiers
- Upcoming campaign disabled tiers
- State indicators in progress meta

**Checkout Coverage Highlights:**
- Full pledge flow: cart runtime → pledge review → on-site Stripe payment step → success page
- Verify checkout order summary preview appears immediately and resolves to tip-aware totals
- Worker API integration test coverage for live stats and checkout bootstrap

**Admin Dashboard Coverage Highlights:**
- Magic-link sign-in, role-scoped tabs, and campaign-user access restrictions
- Settings, Add-ons, Campaigns, Analytics, Reports, Supporters, and Marketing tab behavior
- Super-admin Create new campaign flow, including multiple existing/new campaign users and assignment email behavior
- Protected Preview publish flow, including current-user dashboard link creation, optional reviewer email input UX, base-revision conflict handling, 24-hour reviewer links, and zero previewer-email persistence in campaign Markdown
- Super-admin Archive campaign flow, including non-live visibility, live-campaign rejection, campaign-user rejection, local archive moves, GitHub Action dispatch body, and audit-event write budget
- Settings -> Plan usage automatic loading, provider help text, localized provider links, and zero-write read budget
- Gross campaign/platform revenue, net campaign/platform revenue after allocated processor fees, and exact-cent analytics presentation
- Content editor WYSIWYG block editing, link/media settings, diary editor reuse, draft state, publish state, and mobile preview
- Saved marketing referral codes, campaign URL builder, QR download behavior, Blast dry-run/test/live-send flows, sent Blast history, CSV exports, sorting, and zero-write read flows
- Desktop/tablet/mobile responsiveness, including compact Spanish tablet menus
- Axe checks for the authenticated dashboard shell

### Running

```bash
npm run test:e2e           # Full suite (auto-starts Jekyll)
npm run test:e2e:quick     # Headed mode (requires running server)
npm run test:e2e:headless  # CI mode (headless)
npm run test:e2e:parity    # Critical cart/manage browser regressions
npm run test:e2e:ui        # Interactive UI mode
npx playwright test tests/e2e/admin-dashboard.spec.ts --project=chromium
```

### Adding Tests

Create files in `tests/e2e/` with `.spec.ts` extension:

```typescript
import { test, expect } from '@playwright/test';

test('user can do something', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.element')).toBeVisible();
});
```

---

## Security Tests (Vitest)

Penetration tests for the Worker API. Located in `tests/security/`.

### Coverage

| Category | Tests |
|----------|-------|
| Auth Bypass | Dev-token bypass, token validation, expiry, tampering |
| Webhook Security | Stripe signature verification, duplicate-event handling, shipping address injection, removed legacy webhook handling |
| Authorization | Admin endpoints, cross-user access, test endpoint guards |
| Input Validation | XSS, injection, overflow, malformed input, dashboard field normalization, hasPhysical flag abuse, shipping fee manipulation, additionalTiers/supportItems injection |
| Rate Limiting | Burst requests, DoS resilience |

### Running

```bash
# Start local Worker first
cd worker && wrangler dev

# In another terminal:
npm run test:security                # Against localhost:8787

# Against staging, if you maintain one:
npm run test:security:staging

# Against production (read-only tests):
WORKER_URL=https://pledge.dustwave.xyz PROD_MODE=true npm run test:security
```

### Prerequisites

- Worker running locally (`wrangler dev`) or accessible staging/prod URL
- For full test coverage, set environment variables:
  - `WORKER_URL` — Base URL (default: `http://localhost:8787`)
  - `PROD_MODE` — Skip destructive tests (default: `false`)
  - `ADMIN_SECRET` — For admin auth tests
  - `ADMIN_SETTLEMENT_SECRET` — Optional scoped secret for settlement auth tests or staging checks
  - `ADMIN_BROADCAST_SECRET` — Optional scoped secret for broadcast/diary auth tests or staging checks
  - `TEST_TOKEN` — Valid magic link token

See [tests/security/README.md](../tests/security/README.md) for details.

---

## Manual Testing Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install -g wrangler`)
- [Stripe CLI](https://stripe.com/docs/stripe-cli) for webhook testing
- Stripe account (test mode)
- Resend account (free tier: 3,000 emails/month)

---

## 1. Cloudflare Worker Setup

### Create KV Namespaces

```bash
wrangler login
wrangler kv:namespace create "VOTES"
wrangler kv:namespace create "VOTES" --preview
wrangler kv:namespace create "PLEDGES"
wrangler kv:namespace create "PLEDGES" --preview
```

### Set Secrets

```bash
cd worker
openssl rand -base64 32

wrangler secret put STRIPE_SECRET_KEY
wrangler secret put MAGIC_LINK_SECRET
wrangler secret put CHECKOUT_INTENT_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put ADMIN_SECRET
wrangler secret put ADMIN_SETTLEMENT_SECRET
wrangler secret put ADMIN_BROADCAST_SECRET
```

### Run Worker Locally

Preferred:

```bash
./scripts/dev.sh --podman
```

Manual fallback:

```bash
cd worker
npx wrangler dev --env dev --port 8787
```

## 2. Resend Setup

Use [EMAIL.md](./EMAIL.md) as the full email setup and integration reference. This section is the short manual testing path.

### Create Account & API Key

1. Sign up at [resend.com](https://resend.com)
2. Go to **API Keys** → **Create API Key**
3. Name: "The Pool Dev"
4. Permission: "Sending access"
5. Copy the key (starts with `re_`)

### Verify Domain (for production)

1. Go to **Domains** → **Add Domain**
2. Add the exact sender domain used by `PLEDGES_EMAIL_FROM` / `UPDATES_EMAIL_FROM` (for this deployment, `pool.dustwave.xyz`)
3. Add the DNS records Resend provides
4. Wait for verification

### Test Mode (no domain needed)

For testing, you can send to your own email without domain verification:
- Resend allows sending from `onboarding@resend.dev` in test mode
- Or use your verified personal email

### Test Email Sending

```bash
curl -X POST 'https://api.resend.com/emails' \
  -H 'Authorization: Bearer re_YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "onboarding@resend.dev",
    "to": "your-email@example.com",
    "subject": "Test from The Pool",
    "html": "<p>Magic link test!</p>"
  }'
```

For production delivery evidence, also create `https://pledge.dustwave.xyz/webhooks/resend`, subscribe to delivered/bounced/complained/failed/suppressed events, and store its signing secret as `RESEND_WEBHOOK_SECRET`. Unit tests synthesize signed events; they do not call live Resend.

---

## 3. Stripe Setup (Test Mode)

Use [PAYMENT_PROCESSOR.md](./PAYMENT_PROCESSOR.md) as the full Stripe setup, webhook, settlement, and reconciliation reference. This section is the short local test-mode path.

### Get Test Keys

1. Login to [dashboard.stripe.com](https://dashboard.stripe.com)
2. Toggle to **Test mode** (top right)
3. Go to **Developers** → **API keys**
4. Copy **Secret key** (`sk_test_...`)

### Install Stripe CLI

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Login
stripe login
```

### Forward Webhooks to Local Worker

Preferred option for local end-to-end testing:

```bash
./scripts/dev.sh --podman
```

This starts Jekyll, the Worker, Stripe CLI forwarding, and writes the matching `STRIPE_WEBHOOK_SECRET` into `worker/.dev.vars`.
It also clears stale processes on ports `4000`, `8787`, and `4040` so the local stack matches the automated smoke/test harness.

Manual fallback:

```bash
# Forward Stripe webhooks to your local Worker
stripe listen --forward-to 127.0.0.1:8787/webhooks/stripe
# Note the webhook signing secret it outputs (whsec_...)
```

Add the webhook secret to your local Worker config:
```bash
printf '\nSTRIPE_WEBHOOK_SECRET=whsec_...\n' >> worker/.dev.vars
# Or edit worker/.dev.vars and replace the existing STRIPE_WEBHOOK_SECRET value
```

---

## 4. Full End-to-End Test

### Start All Services

Preferred:

```bash
./scripts/dev.sh --podman
```

Manual fallback:

Terminal 1 - Jekyll:
```bash
bundle exec jekyll serve --config _config.yml,_config.local.yml --port 4000
# Site at http://127.0.0.1:4000
```

Terminal 2 - Worker:
```bash
cd worker
npx wrangler dev --env dev --port 8787
# Worker at http://127.0.0.1:8787
```

Terminal 3 - Stripe CLI:
```bash
stripe listen --forward-to 127.0.0.1:8787/webhooks/stripe
```

### Test the Flow

1. **Add to cart**: Go to http://127.0.0.1:4000/campaigns/hand-relations/
   - Click "Pledge $5" on a tier
   - Cart opens with item

2. **Checkout**: Click "Continue to Pledge" in the first-party cart review
   - Verify the review shows subtotal + tip + tax + shipping immediately
   - Use Stripe test card: `4242 4242 4242 4242`
   - Any future expiry, any CVC

3. **Stripe Setup**: The second checkout sidecar keeps you on-site and mounts Stripe's secure payment UI
   - Card is saved (not charged)
   - The client waits for pledge persistence confirmation before treating the flow as successful
   - You are then sent to the success page

4. **Check email**: You should receive the supporter email(s) with magic links

5. **Test community access**:
   - Click the community link in the email
   - Or use: http://127.0.0.1:4000/community/hand-relations/?dev=1

6. **Test voting**:
   - Vote on a decision
   - Refresh page - your vote should persist

### Stripe Test Cards

| Card Number | Scenario |
|-------------|----------|
| `4242 4242 4242 4242` | Successful save/setup |
| `4000 0000 0000 3220` | 3D Secure required |
| `4000 0000 0000 9995` | Declined (insufficient funds) |
| `4000 0000 0000 0002` | Declined (generic) |

---

## 5. Testing Individual Components

### Test Magic Link Token

```js
// In browser console on any page with the Worker running
const token = 'YOUR_TOKEN';
fetch(`http://localhost:8787/pledge?token=${token}`)
  .then(r => r.json())
  .then(console.log);
```

### Test Vote API

```bash
# Get vote status
curl "http://localhost:8787/votes?token=YOUR_TOKEN&decisions=poster,festival"

# Cast vote
curl -X POST http://localhost:8787/votes \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR_TOKEN","decisionId":"poster","option":"A"}'
```

### Test KV Locally

```bash
# List keys
wrangler kv:key list --binding VOTES --preview

# Get a value
wrangler kv:key get "results:hand-relations:poster" --binding VOTES --preview
```

---

## 6. Troubleshooting

### Checkout start fails closed
- Verify `CHECKOUT_INTENT_SECRET` exists in `worker/.dev.vars`
- Confirm the cart payload uses valid first-party item IDs like `{campaignSlug}__{tierId}`

### Webhook not received
- Check Stripe CLI is running and forwarding
- Check Worker logs: `wrangler tail`
- Verify webhook secret is set

### Email not sent
- Check Resend dashboard for errors
- Verify API key is correct
- Check "from" address is verified or use `onboarding@resend.dev`

### Community page shows "Access Denied"
- Use `?dev=1` for local testing without Worker
- Check session storage key: `supporter_token_hand-relations`

### Votes not persisting
- Check KV binding in wrangler.toml
- Use `--preview` namespace for local dev
- Check Worker logs for errors

---

## 7. Testing Worker Enhancements

### Test Campaign Validation

1. **Build Jekyll to generate campaigns.json:**
   ```bash
   bundle exec jekyll build
   cat _site/api/campaigns.json  # Verify it exists
   ```

2. **Test malformed first-party checkout start:**
   ```bash
   curl -X POST http://localhost:8787/checkout-intent/start \
     -H "Content-Type: application/json" \
     -d '{"campaignSlug":"hand-relations","items":[{"id":"bad-item","quantity":1}],"email":"test@example.com"}'
   ```
   Expected: Returns a fail-closed validation error such as `Invalid cart item id`

### Test Stripe Webhook Signature Verification

1. **Ensure Stripe CLI is forwarding webhooks:**
   ```bash
   ./scripts/dev.sh --podman
   # Or, manually: stripe listen --forward-to localhost:8787/webhooks/stripe
   ```

2. **Set the webhook secret:**
   ```bash
   # scripts/dev.sh --podman does this automatically for worker/.dev.vars
   # Manual setup only if you are not using the main Podman dev script
   ```

3. **Trigger a test webhook:**
   ```bash
   stripe trigger checkout.session.completed
   ```
   Check Worker logs for "Pledge confirmed" message.

4. **Test invalid signature (should fail):**
   ```bash
   curl -X POST http://localhost:8787/webhooks/stripe \
     -H "stripe-signature: invalid" \
     -d '{"type":"test"}'
   ```
   Expected: `{"error":"Invalid signature"}`

### Test Stored Pledge Metadata

After completing a pledge flow:

1. **Check Worker-backed pledge data** through `/pledge?token=...`
2. **Verify data contains:**
   - `stripeCustomerId`
   - `stripePaymentMethodId`
   - `pledgeStatus: "active"`
   - `charged: false`

### Test Pledge Management Endpoints

1. **Get pledge details (requires valid token):**
   ```bash
   # Use token from supporter email
   curl "http://localhost:8787/pledge?token=YOUR_TOKEN"
   ```
   Expected: Returns order details with `canModify`, `canCancel` flags.

2. **Cancel pledge:**
   ```bash
   curl -X POST http://localhost:8787/pledge/cancel \
     -H "Content-Type: application/json" \
     -d '{"token":"YOUR_TOKEN"}'
   ```
   Expected: `{"success":true,"message":"Pledge cancelled"}`

3. **Verify cancellation:**
   - Check the pledge now reports `pledgeStatus: "cancelled"`
   - Retry cancel: should get a clean error response

### Test Update Payment Method

```bash
curl -X POST http://localhost:8787/pledge/payment-method/start \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR_TOKEN"}'
```
Expected: Returns a custom-session bootstrap for on-site `Update Card`, or a hosted URL in fallback mode.

### Test Live Stats Endpoint

1. **Get live stats for a campaign:**
   ```bash
   curl http://localhost:8787/stats/hand-relations
   ```
   Expected: Returns `{ pledgedAmount, pledgeCount, tierCounts, goalAmount, ... }`

2. **Verify stats update after pledge:**
   - Make a test pledge
   - Call stats endpoint again
   - Confirm `pledgedAmount` increased

3. **Recalculate stats (admin):**
   ```bash
   curl -X POST http://localhost:8787/stats/hand-relations/recalculate \
     -H "Authorization: Bearer YOUR_ADMIN_SECRET"
   ```

### Test Admin Rebuild Trigger

```bash
curl -X POST http://localhost:8787/admin/rebuild \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"reason":"test-rebuild"}'
```
Expected: Returns `{ success: true }` and triggers GitHub workflow.

---

## 8. Production Checklist

- [ ] Switch Stripe to live keys
- [ ] Review [PAYMENT_PROCESSOR.md](./PAYMENT_PROCESSOR.md) for Stripe live keys, webhook secrets, settlement credentials, and reconciliation checks
- [ ] Verify the Resend sender domain used by `PLEDGES_EMAIL_FROM` and `UPDATES_EMAIL_FROM` (for this deployment, `pool.dustwave.xyz`); see [EMAIL.md](./EMAIL.md)
- [ ] If launch reminders or admin Turnstile widgets are enabled, verify the public site keys and matching Worker Turnstile secrets are set
- [ ] Deploy Worker: `wrangler deploy`
- [ ] Set up Stripe webhook in dashboard → `https://pledge.dustwave.xyz/webhooks/stripe`
- [ ] Set up Resend delivery webhook → `https://pledge.dustwave.xyz/webhooks/resend` and set `RESEND_WEBHOOK_SECRET`
- [ ] Confirm `EMAIL_OUTBOX_ENABLED=true` and `PAYMENT_RECONCILIATION_ENABLED=true` in the live Worker
- [ ] Run media manifest/optimization check and inspect dashboard broken-reference warnings
- [ ] Test with a real $1 pledge

## 9. Secrets Reference

### GitHub Actions (Repo → Settings → Secrets)
- `STRIPE_SECRET_KEY` — Stripe live secret (sk_...)
- `CHECKOUT_INTENT_SECRET` — HMAC secret for checkout intent signing
- Uses `GITHUB_TOKEN` auto-provided for commits

### Cloudflare Worker (wrangler or dashboard → Variables)
- `STRIPE_SECRET_KEY` — same as above
- `SITE_BASE` — `https://pool.dustwave.xyz`
- `WORKER_BASE` — `https://pledge.dustwave.xyz`
- `APP_MODE` — `live` or `test`
- `CHECKOUT_INTENT_SECRET` — Random 32+ char string for checkout signing
- `MAGIC_LINK_SECRET` — Random 32+ char string for HMAC token signing
- `CAMPAIGN_PREVIEW_SECRET` — Optional dedicated preview reviewer-link signing secret; if omitted, the Worker falls back to existing signing secrets
- `RESEND_API_KEY` — Resend API key for supporter emails (re_...)
- `RESEND_WEBHOOK_SECRET` — Resend/Svix signing secret for delivery and suppression events (whsec_...)
- `ADMIN_SECRET` — Random string for admin API endpoints
- `ADMIN_SETTLEMENT_SECRET` — Optional scoped admin secret for settlement endpoints; use a separate local-only value in `worker/.dev.vars`
- `ADMIN_BROADCAST_SECRET` — Optional scoped admin secret for diary, milestone, and announcement endpoints; also add it to GitHub repository secrets for the post-deploy diary check when enabled
- `CLOUDFLARE_API_TOKEN` — For GitHub deploys, use a Cloudflare user API token created from **My Profile -> API Tokens** with the **Edit Cloudflare Workers** template. For local report exports, use a separate read-only Workers KV token when possible.
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account id for Wrangler deploys, non-interactive local report/export scripts, and the Worker runtime Settings -> Plan usage endpoint
- `CLOUDFLARE_USAGE_API_TOKEN` — Optional read-only GraphQL Analytics token for the admin Settings -> Plan usage tracker; add Billing Read for Workers plan auto-detection and keep it separate from deploy tokens.
- `TURNSTILE_SECRET_KEY` — Shared Cloudflare Turnstile secret when admin sign-in or launch reminder widgets are enabled
- `LAUNCH_REMINDER_TURNSTILE_SECRET_KEY` — Optional reminder-specific Turnstile secret if not using the shared secret
- `LAUNCH_REMINDER_TOKEN_SECRET` — Optional reminder unsubscribe-token secret; falls back to `MAGIC_LINK_SECRET`
- `ABANDONED_CART_TOKEN_SECRET` — Optional abandoned-checkout reminder token secret for unsubscribe and resume links; falls back to `MAGIC_LINK_SECRET`
- `GITHUB_TOKEN` — GitHub PAT with repo/workflow access for dashboard publish actions and rebuild triggers; optional only when you are not testing GitHub-backed publishing
- `ADMIN_BOOTSTRAP_EMAILS` — Optional local/recovery super-admin email list for dashboard sign-in; local dev reads this from `worker/.dev.vars`
- `ADMIN_USERS_JSON` — Optional seed/recovery admin user list mirrored from `_config.yml`; dashboard Users edits save to KV at `admin-users:v1`
- `CORS_ALLOWED_ORIGIN` — Must match the site origin for browser dashboard requests; local Podman derives this for `http://127.0.0.1:4000`

### Cloudflare KV
- **Namespace**: `PLEDGES` — Stores pledge data and aggregated stats
  - Keys: `pledge:{orderId}` → pledge JSON
  - Keys: `email:{email}` → array of order IDs
  - Keys: `stats:{campaignSlug}` → `{ pledgedAmount, pledgeCount, tierCounts }`
  - Keys: `campaign-preview-reviewers:{campaignSlug}` → 24-hour protected-preview reviewer email allowlist
- **Namespace**: `VOTES` — Stores community votes
  - Keys: `vote:{campaignSlug}:{decisionId}:{orderId}` → option string
  - Keys: `results:{campaignSlug}:{decisionId}` → JSON `{optionA: count, ...}`

### Stripe Dashboard
- Webhook endpoint = `https://pledge.dustwave.xyz/webhooks/stripe`
  - Events: `checkout.session.completed`
- Product catalog not required; amounts come from Worker-canonicalized first-party cart items

### Resend Dashboard
- **Domain**: Verify the domain portion of the sender addresses configured in `_config.yml` / Worker env. For this deployment, `PLEDGES_EMAIL_FROM` is `The Pool <pledges@pool.dustwave.xyz>`, so Resend must authorize `pool.dustwave.xyz`.
- **API Key**: Create key with "Sending access" permission
- Used for: All supporter-facing pledge email (confirmation, manage/community access, launch reminders, abandoned-checkout reminders, diary updates, Blast/announcement emails, reports, charge success, payment failure, cancellations)
- Local dev note: even when `SITE_BASE` points at `127.0.0.1`, embedded email images still use the public `https://pool.dustwave.xyz` asset base so inbox previews do not show broken localhost image URLs.
