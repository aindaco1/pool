# Testing Guide

This guide covers the automated test suites, local test infrastructure, and manual verification paths. Weekly synthetic recovery, protected preview drills, and post-restore verification are documented in [BACKUP_RESTORE.md](./BACKUP_RESTORE.md).

`npm run jekyll-template:check` verifies that the 17 locally built Jekyll
integration files still match the exact pinned golden-project template. The
pre-merge gate runs this check before builds and also rejects the template
submodule from generated site output. `npm run jekyll-template:sync` is an
explicit upgrade-branch operation, not a build step.

The repository records Platform and Jekyll Template revisions as exact gitlinks.
After cloning, switching branches, or reviewing a shared dependency upgrade,
initialize the recorded commits and run the narrow pin/drift contract before
broader tests. Use `git submodule status` to inspect the current recorded
versions instead of copying them into another guide:

```bash
git submodule update --init --recursive
npx vitest run tests/unit/platform-pin.test.ts tests/unit/jekyll-template-pin.test.ts
npm run jekyll-template:check
```

The root `esbuild` and `smol-toml` dependencies are exact pins matching the
reviewed Platform Build Core and Release Core manifests. Upgrade them together
with the Platform gitlink, not independently in a routine dependency PR. The pin
test checks both root manifests and the installed-version entries in the lockfile.
Dependabot defers their routine version updates while keeping security updates
eligible. A security fix still requires a reviewed compatible Platform upgrade;
do not weaken the pin test to bypass it. Continue running both dependency audits
described in [SECURITY.md](./SECURITY.md#dependency-and-release-security).

The local-only product-video adapter has a bounded real-interface smoke path:

```bash
npm run test:product-video
```

It builds with the tracked `_config.test.yml`, captures the `smoke-editable`
campaign/tier/add-on/checkout-preview path through the pinned Platform engine,
and writes only ignored output below `tmp/product-video`. See
[PRODUCT_VIDEO_WORKFLOW.md](./PRODUCT_VIDEO_WORKFLOW.md) for render formats,
host requirements, and cleanup boundaries.

If a host-only Worker suddenly returns `503` while the Podman-backed smoke path
passes, stop the host dev stack and inspect the ignored local
`worker/.wrangler/state` directory for a Cloud Drive conflict copy such as
`v3 2`. Move only that duplicate local-development directory aside and restart
the Worker; do not change `wrangler.toml`, remote namespaces, or tracked data.
The Podman wrappers use isolated state and reset it for reproducible runtime
checks.

The pre-merge gate also owns every Worker and Jekyll process it starts. Cleanup
signals the complete child tree, waits only for a bounded grace period, then
force-stops any survivor. A focused regression uses a deliberately stubborn
child process to ensure a fully passing gate cannot hang until the CI job
timeout after printing its phase summary.

## Dependency audits

`npm run test:dependencies` audits the root and Worker lockfiles, each with
production-only and full dependency scopes. It needs Node/npm and initialized
submodules, but no dependency installation. To repeat one check:

```bash
npm run test:dependencies -- --target=worker --scope=full
```

Merge Smoke runs these four checks as independent matrix jobs with fail-fast
disabled. Its installation steps use `--no-audit`; successful installation and
tests are not audit evidence. Require all four audit checks and the smoke check
to pass before merging. Repository branch-protection settings are managed
separately from the workflow.

Each audit has at most three attempts, a 30-second npm request timeout, a
45-second process deadline, and 5/10-second retry delays (at most 150 seconds
per check, excluding job setup). Only recognized transient network/service
failures are retried. Findings and configuration/authentication errors are not.
A valid report with moderate-or-higher findings exits 1; unavailable, malformed,
or incomplete evidence exits 2. Below-threshold findings remain visible for
review. An exhausted outage never passes or waives the release audit: rerun the
failed checks after the service recovers. The helper does not run `audit fix` or
modify either lockfile.

## Quick Reference

```bash
npm run test:unit          # Unit tests (Vitest)
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
npm run test:dependencies  # Production + full npm audits for root and Worker
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

`./scripts/test-e2e.sh --podman` is the fully automated browser path. Use `./scripts/test-checkout.sh --podman` when you specifically want to drive the checkout manually in a real browser.

The local Worker test path prefers Node 24, matching GitHub Actions. Run `nvm use` from the repository root to select the supported Node 24.15 baseline. The host scripts fall back to Node 22.22.2 or newer if a fork has that installed; unsupported odd-numbered Node releases are rejected by npm so jsdom and the test runner do not silently run outside their declared engine ranges.

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

The scheduled production-posture audit also requires `preview_urls = false` to be explicit in `worker/wrangler.toml`. Missing or enabled Worker preview URLs are a release-blocking configuration drift finding.

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

Unit and focused integration tests in `tests/unit/`.

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
| `campaign-preview-pages` | Real Jekyll generation from unpublished sources, localized shells, duplicate-route prevention, and draft exclusion from public routes, catalogs, and sitemaps |
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
    The script rotates its synthetic admin request IPs during those rebuild/check calls so the real admin rate limiter does not create a false negative in local merge gating.
- Full unit suite via `npm run test:unit`
- Security suite via `npm run test:security` against an auto-started local Worker
- Podman-backed security suite via `npm run test:security:podman` when you want the site/Worker stack booted and exercised in the same invocation
- First-party build artifact checks that run Jekyll, minify generated `_site` CSS/JS assets, verify the minified output has no remaining savings, and run `npm run test:seo` against generated crawl/metadata output
- Public-page performance and sharing regressions through unit coverage for intent prefetching, lazy cart-runtime loading, generated asset minification, and campaign share-link behavior
- Playwright headless E2E via `npm run test:e2e:headless`

The pre-merge script auto-starts Jekyll with `_config.yml,_config.local.yml` when needed so the local-only `smoke-editable` campaign is available during merge gating, and the Playwright harness uses the same combined config locally.
That gate tries the host Bundler/Jekyll path first, including a one-time `bundle install` attempt when Bundler is present but gems are missing. It keeps the lighter host Worker smoke, but runs the mutable-pledge smoke through the Podman-backed stack so the stateful modify/cancel path uses isolated local service state even when the host build path succeeds. If the host Ruby path still cannot build cleanly, it falls back to a Podman-backed Jekyll build plus the remaining Podman-aware smoke/browser helpers instead of failing on host setup alone.

Host phases inherit the caller's `PATH`, including any selected rbenv Ruby and
Node tools. They do not start a login shell: on macOS, login startup files can
replace that path with system Ruby after the host dependency check has passed.
If a host build unexpectedly falls back to Podman, inspect the phase log and
compare `command -v ruby`, `ruby -v`, `command -v bundle`, and `bundle check`
in the shell launching the gate. The toolchain regression exercises both build
dispatch paths with a simulated login-shell path reset:

```bash
npx vitest run tests/unit/premerge-toolchain.test.ts
```
Both Jekyll helpers fail immediately when their build command fails, so minification and artifact validation cannot accidentally reuse stale `_site` output.
For headless browser runs, Playwright builds a static `_site` and serves that output with a lightweight HTTP server instead of using `jekyll serve`, which keeps automated browser checks closer to the real published asset layout.

The repository defaults to the first-party cart/runtime path in both `_config.yml` and `_config.local.yml`; the browser path does not support the old hosted-cart runtime.

Current security coverage in the gate includes:

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

The local Worker defaults in [worker/wrangler.toml](../worker/wrangler.toml) match that first-party setup. `./scripts/dev.sh --podman` auto-generates a local `CHECKOUT_INTENT_SECRET` in `worker/.dev.vars` if it is missing, so fresh local checkout starts do not fail closed on an uninitialized dev secret.

When the merge gate or local security suite uses the placeholder `STRIPE_SECRET_KEY=sk_test_smoke`, `/test/setup` seeds deterministic synthetic Stripe customer IDs instead of calling Stripe. Use a real Stripe test key only when you specifically need payment-method-update smoke coverage against Stripe's API.

For local work, prefer `./scripts/dev.sh --podman`. It starts Jekyll and the Worker in rootless Podman containers while preserving the same ports and local Wrangler state.

[`_config.local.yml`](../_config.local.yml) is an override-only layer, not a second base config. When you change or add fork-facing settings, prefer [`_config.yml`](../_config.yml) unless the value differs only on your local machine.

The browser helper scripts support the same mode:

```bash
./scripts/test-checkout.sh --podman
./scripts/test-e2e.sh --podman
./scripts/test-worker.sh --podman
./scripts/smoke-pledge-management.sh --podman
./scripts/pledge-report.sh --podman --local
./scripts/fulfillment-report.sh --podman --local
```

Those helpers run Playwright and shell smoke logic on the host, but they boot the site and Worker through the shared Podman-backed local stack first. The report scripts can run directly through the Worker container as well. That keeps local testing and exports closer to production-like service boundaries without forcing host Ruby or host Wrangler setup.

For host-side commands that need the Podman-backed stack without depending on detached stack persistence across separate shells, use [`scripts/podman-stack-run.sh`](../scripts/podman-stack-run.sh). `npm run test:security:podman` uses that wrapper.

For a mostly host-independent browser path, `npm run test:e2e:headless:podman` runs the automated Playwright suite inside a dedicated Podman container on the same local pod network as the site and Worker.

Browser coverage also includes dedicated mobile viewport assertions for:

- campaign pages and secondary public controls
- cart / checkout drawers on small phone sizes
- Manage Pledge and Update Card reachability on short mobile viewports
- no-horizontal-overflow checks on the main public and pledge-management paths

Public-page coverage also protects localized campaign chrome, including:

- hero video play/loading states
- supporter-community teaser copy
- diary tab labels and empty states
- production-phase labels and CTA copy
- gallery accessibility labels

The content-safety filter suite in `tests/unit/content-safety-filter.test.ts` also falls back to Podman when host Bundler/Jekyll gems are unavailable. On macOS, it can start the Podman machine as part of that fallback.

The current Podman scope is intentionally narrow:

- included: Jekyll, Worker, local `worker/.dev.vars`, local Wrangler state, optional host Stripe CLI forwarding, Podman-aware `test-checkout.sh`, `test-e2e.sh`, `test-worker.sh`, `smoke-pledge-management.sh`, `pledge-report.sh`, and `fulfillment-report.sh`
- included too: containerized headless Playwright for the automated browser suite
- current boundary: interactive manual checkout uses the host browser; a containerized alternative is tracked in the [roadmap](./ROADMAP.md)

Use [docs/PODMAN.md](./PODMAN.md) for the exact setup and current limitations.

If you change `pricing.sales_tax_rate` or `shipping.fallback_flat_rate` in the Jekyll config, the repo auto-syncs the mirrored Worker values in [worker/wrangler.toml](../worker/wrangler.toml) through the main dev/test paths. Restart `./scripts/dev.sh --podman` before testing checkout math so both services pick up the new values.

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

The merge gate writes one log file per phase and prints a final PASS/FAIL summary with log paths. If a late Podman-backed phase fails, start with the log directory printed at the end of the run instead of scrolling through the whole transcript.

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

Use [Merge Smoke](MERGE_SMOKE_CHECKLIST.md) for the maintained operator steps,
expected results, failure rule, and sign-off template. Record the tested
revision/environment and any missing provider evidence. Repeat the relevant
manual flow when automated coverage does not prove the changed behavior.

### Intentional Behavior Changes

When reviewing results, do not flag these as regressions:

- Magic links are order-scoped instead of email-scoped.
- `/checkout-intent/start` reserves scarce limited inventory before payment confirmation, and successful persistence confirms that reservation.
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

## Manual Test Setup

Use [Contributing](CONTRIBUTING.md#development-setup) to install dependencies and
configure local credentials, and [Podman](PODMAN.md) to start the full stack.
Provider-specific setup has one owner:

- [Payment Processor](PAYMENT_PROCESSOR.md): test keys, Stripe CLI forwarding, the matching webhook secret, and payment recovery.
- [Email](EMAIL.md): sender/domain verification, test sends, and signed delivery-event verification.
- [Deployment](DEPLOYMENT.md): hosted Worker bindings, runtime versus Actions secrets, and production wiring.

Use Stripe test mode and an inbox you control for manual payment/email checks.
Start the local stack with `./scripts/dev.sh --podman`, or use the documented
host fallback. The local webhook signing secret must come from the same
listener that forwards events; avoid two independently started listeners.

## Local Test Data

Against a running local test Worker, seed the dashboard fixtures with:

```bash
./scripts/seed-admin-test-campaigns.sh
```

The helper defaults to `hand-relations,smoke-editable`, calls `/test/setup`, and
prints the resulting fixture/manage links. `/manage/?dev` provides browser mock
data and does not prove Worker persistence.

For the broader synthetic dataset, `./scripts/seed-all-campaigns.sh` clears
existing local pledge data and seeds scenarios with active, charged, cancelled,
failed, and modified pledges, then recalculates projections. Use disposable
local state and the configured local admin credential; inspect
[`scripts/seed-all-campaigns.mjs`](../scripts/seed-all-campaigns.mjs) for the fixture
amounts rather than treating campaign dates or sample totals as current status.
Local persistence depends on the launcher/state directory; a Worker restart is
not a guarantee that all KV data was erased. Podman smoke paths use isolated
state and reset it for reproducibility.

For a targeted local inspection, run from `worker/`:

```bash
npx wrangler kv key list --binding PLEDGES --env dev --local
```

Stop the local Worker before resetting its state; move an unwanted local state
directory aside so it remains recoverable. Remote/preview resets follow
[Backup and Restore](BACKUP_RESTORE.md) and require an explicit environment and
scope, not an unfiltered namespace deletion loop.

## Full End-to-End Test

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

4. **Check email**: Confirm receipt of the supporter email(s) with magic links

5. **Test community access**:
   - Click the community link in the email
   - Or use: http://127.0.0.1:4000/community/hand-relations/?dev=1

6. **Test voting**:
   - Vote on a decision
   - Refresh page - the vote persists

### Stripe Test Cards

| Card Number | Scenario |
|-------------|----------|
| `4242 4242 4242 4242` | Successful save/setup |
| `4000 0000 0000 3220` | 3D Secure required |
| `4000 0000 0000 9995` | Declined (insufficient funds) |
| `4000 0000 0000 0002` | Declined (generic) |

---

## Testing Individual Components

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

## Troubleshooting

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

## Testing Worker Enhancements

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

4. **Test invalid signature (expected failure):**
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
   - Retry cancel: confirm a clean error response

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

## Release and Credential References

[Merge Smoke](MERGE_SMOKE_CHECKLIST.md) owns the operator checklist and sign-off
template. [Deployment](DEPLOYMENT.md) owns production wiring.
[Security](SECURITY.md#secrets-checklist) owns signing/admin credential
requirements; payment, email, tax, and shipping provider credentials are covered
in their dedicated runbooks. Record provider omissions explicitly; local unit,
fixture, or browser success is not external acceptance.
