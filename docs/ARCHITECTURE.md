# Architecture

This guide is for contributors tracing how The Pool's site, Worker, providers,
and repository state fit together. Endpoint contracts live in
[Worker API](WORKER_API.md); provider operations live in the linked runbooks.

## Ownership and Sources of Truth

| Boundary | Owner |
| --- | --- |
| Public pages, localized routes, templates, and browser cart | Jekyll sources and `assets/` |
| Platform identity, catalog, and supported fork settings | `_config.yml`; `_config.local.yml` holds local overrides |
| Published campaign copy, tiers, goals, diary, and campaign add-ons | `_campaigns/` and repository media |
| Saved campaign working copies | `_campaign_drafts/`, excluded from public builds; same Markdown model and Git history |
| Prices, permissions, inventory decisions, pledge persistence, and settlement | Cloudflare Worker |
| Card data, payment methods, and charge processing | Stripe |
| Pledge records, projections, admin users, and operational markers | Worker KV, with serialized coordinators for critical mutations |
| Publication and source history | GitHub-backed commits and Actions, or the local repo helper in development |

The browser proposes state. The Worker resolves the current campaign/catalog,
validates availability, and computes authoritative totals. Normal creator edits
use the [dashboard](DASHBOARD.md); publishable changes write back to Git instead
of creating a second content catalog in KV. Save writes a working copy; Publish promotes its authoring fields to the canonical campaign. Public APIs and checkout never read working copies.

### Shared Foundations

Immutable gitlinks pin Dust Wave Platform and Dust Wave Jekyll Template.
Platform supplies characterized Worker, admin, browser, design, build, release,
shipping, tax, inventory, media, test, and local product-video mechanics.
Jekyll Template supplies manifest-bound source-upgrade files whose runtime
copies remain checked into Pool. Neither dependency follows a moving branch
at build time.

Pool owns campaign and pledge models, routes, storage policies, content,
localization, credentials, provider decisions, deployment, and rollback. The
Jekyll Template is excluded from the public build and is never imported by the
Worker. See [Testing](TESTING.md) for pin and template-drift checks.

## Campaign and Pledge Lifecycle

Campaign state is `upcoming` → `live` → `post`. Jekyll computes the initial
state from campaign dates; browser and Worker paths enforce effective state
using the configured IANA `platform.timezone` / `PLATFORM_TIMEZONE`, including
DST. Upcoming campaigns offer launch reminders. Live campaigns accept pledges.
Post-campaign behavior uses the funding outcome and explicit late-support
rules; it must not display an ended campaign as live.

1. The supporter selects tiers, support items, custom support, or add-ons in the first-party cart.
2. `/checkout-intent/start` resolves canonical prices, tax, shipping, campaign state, and limited-tier reservations, then creates a setup-mode Stripe session.
3. The on-site payment sidecar saves a card. A hosted fallback remains available when required by the checkout configuration.
4. Webhook persistence, with a bounded completion/recovery path, creates one pledge per campaign. The browser waits for persistence before showing success and invalidates cached campaign totals afterward.
5. Order-scoped magic links let supporters manage active pledges. Deadline-passed pledges become read-only apart from eligible card updates.
6. After a funded campaign's deadline, Worker scheduling dispatches campaign-scoped settlement and records charge outcomes. Failed-payment recovery uses the existing payment-method update flow.

### Money and Inventory

Campaign progress includes tiers, campaign support/custom amounts, and campaign
add-ons. Platform add-ons, platform tip, tax, and shipping are excluded.
Stored charge totals include subtotal, tip, tax, and shipping. Tax is resolved
through the configured [tax provider](TAX_CALCULATOR.md), and physical items use
the shared [shipping calculator](SHIPPING.md).

New or changed product/variant selections use current catalog prices. An
unchanged saved product/variant can retain its historical `unitPrice` through
quantity edits. Keep the amount bounds and campaign/platform split described
in [Add-on Products](ADD_ON_PRODUCTS.md) and
[Payment Processor](PAYMENT_PROCESSOR.md).

Limited-tier reservations and claims are serialized through a per-campaign
Durable Object; public inventory remains a KV projection. Settlement uses a
campaign coordinator lock, persisted intent, and deterministic Stripe
idempotency keys. Recovery must reconcile ambiguous old work before resuming;
pledge flags alone do not establish that a charge can safely be retried.

## Storage

| State | Role |
| --- | --- |
| `pledge:{orderId}` in `PLEDGES` | Canonical saved campaign pledge, item selections, totals, status, and history |
| Campaign index, stats, and inventory keys | Repairable projections for bounded reads and public display |
| Per-campaign Durable Objects | Reservation/claim serialization and settlement locks |
| `VOTES` | Supporter decisions, keyed by campaign, decision, and email so multiple pledges do not grant extra votes |
| `RATELIMIT` | Required abuse-protection counters |
| Admin users, drafts, preview access, and mail/job markers | Runtime state with feature-specific scope and retention |

The [payment data model](PAYMENT_PROCESSOR.md#data-model) owns pledge fields,
item units, history semantics, and Stripe financial metadata.
[`config/pool-data-inventory.json`](../config/pool-data-inventory.json) is the
machine-readable key-family, classification, retention, and recovery inventory.
Use [Backup and Restore](BACKUP_RESTORE.md) when adding a durable state family.

Normal reads prefer `campaign-pledges:{slug}` over full namespace scans.
Stats and inventory recalculation can repair a stale campaign index; read-only
projection checks let operators inspect drift before choosing repair. Those
projections must not replace underlying pledge/payment truth.

## Supporter Access

Magic links carry an HMAC-signed order, email, campaign, and expiry payload.
Every protected read verifies the signature and expiry, then checks the real
pledge in KV. A valid token authorizes only its own order; a missing pledge
returns `404`. Token format, lifetime, revocation, admin sessions, and abuse
protection are owned by [Security](SECURITY.md).

## Front-End Pages

### `/campaigns/:slug/`
Campaign detail with tier buttons → first-party cart drawer

### `/campaigns/:slug/pledge-success/`
Post-persistence success page with confirmation + manage link

### `/campaigns/:slug/pledge-cancel/`
User left the payment step before completion (not the pledge itself)

### `/manage/`
Magic link landing page for pledge management:
- Reads `?t=...` token
- Fetches pledge details from Worker
- Shows pledge cards with state-dependent UI
- Groups projects into **Active** and **Closed** sections
- Sorts active cards with the most recent campaigns first
- Displays full breakdown: subtotal, optional The Pool tip, Worker-calculated tax, and stored shipping amount for the pledge, plus total
- Reads pricing labels and rates from shared config so cart UI, Worker totals, emails, and reports stay aligned for forks

**Pledge card states:**

| Status | UI Treatment |
|--------|-------------|
| `active` | Full edit controls (tier selection, support items, cancel button) |
| `active` + deadline passed | Locked badge + locked notice, read-only pledge controls, "Update Card" only |
| `charged` | Muted card, "✓ Successfully charged on {date}" notice |
| `payment_failed` | Warning notice with "Update Payment Method" button |
| `cancelled` | "This pledge has been cancelled" notice |

**Shipping in modify flow:** When a supporter changes tiers or physical support items, the manage page dynamically recalculates shipping. Physical selections can use USPS-backed live quotes, configured fallback rates, free-shipping overrides, and limited domestic signature-option upgrades. The confirmation modal shows the updated shipping and total before the user confirms.

**Tip in modify flow:** The manage page exposes the same 0% to 15% tip slider. During live campaigns, supporters can adjust it and see subtotal / tip / tax / shipping / total update immediately. Once the deadline passes, the tip slider becomes read-only along with the rest of the pledge controls.

**Dev mode:** Add `?dev` to URL for mock pledge data testing

### `/community/:slug/`
Supporter-only community page:
- Always verifies with Worker API (doesn't trust cookies alone)
- On success: Sets a non-sensitive `supporter_{slug}` cookie for UX optimization and stores the raw bearer token only in `sessionStorage`
- On failure (cancelled pledge, expired token): Clears session token state, shows access denied CTA
- Shows voting/polling decisions exclusive to backers
- `/votes` API returns 403 for cancelled pledges (double-checks access)
- `/votes` only accepts campaign-defined decision IDs and campaign-defined option values
- Closed decisions stay readable but reject new votes
- Votes are keyed by **email** (not orderId) — supporters with multiple pledges still get one vote per decision

---

## Scheduling, Delivery, and Recovery

The Worker has a minute-level scheduled handler. It drains bounded email and
reminder work, checks campaign-runner reports, and gates daily campaign
lifecycle work to the configured platform timezone. Idle queue-state markers
avoid repeated namespace scans; heartbeat and job markers support diagnostics.
The scheduler triggers Pages rebuilds for campaign state transitions.

Funded campaigns use self-chaining settlement batches with a per-campaign
coordinator lock and campaign/supporter charge grouping. Manual settlement
uses the same payment machinery. The exact protocol, failure handling,
reconciliation, and retry rules belong in
[Payment Processor](PAYMENT_PROCESSOR.md#settlement).

GitHub Actions builds and publishes static pages and performs post-deploy
diary checks. The **Deploy Production** workflow also deploys the Worker;
routine **Refresh Production Pages** runs do not. See [Deployment](DEPLOYMENT.md).

Production notification side effects use the shared durable email outbox.
Rendering freezes on the first attempt; provider failures retry independently
of canonical pledge state. Admin login and explicit test sends remain
immediate. Campaign mail checks consent/suppression before delivery. See
[Email](EMAIL.md) for the provider and outbox contract.

The repository asset tree remains the media source of truth. Dashboard upload
and editing paths reuse the repository optimizer and read-only media picker.
[Performance](PERFORMANCE.md) owns optimization and caching;
[Backup and Restore](BACKUP_RESTORE.md) owns state classification, retention,
restore ordering, and payment reconciliation before recovery resumes.

## Code Map

| Location | Responsibility |
| --- | --- |
| `_campaigns/` | Campaign source; see [Content Model](CONTENT_MODEL.md) |
| `_layouts/`, `_includes/`, `_plugins/` | Jekyll pages, shared rendering, localization, campaign state, and generated APIs |
| `_data/i18n/` | Shared UI, runtime, and email copy |
| `assets/main.scss`, `assets/partials/` | Theme variables and shared/page-specific Sass |
| `assets/js/cart-provider.js`, `assets/js/cart.js`, `assets/js/cart-runtime-loader.js` | First-party cart state, lazy loading, and checkout handoff |
| `assets/js/live-stats.js` | Live totals, inventory, tier gates, and campaign refresh |
| `assets/js/admin-dashboard.js` | Private dashboard editors and operating flows |
| `worker/src/index.js` | Worker routes and scheduler |
| `worker/src/campaigns.js`, `checkout-intent.js`, `stripe.js` | Campaign validation, checkout integrity, and payment adapter |
| `worker/src/checkout-intent-do.js`, `tier-inventory-do.js`, `settlement-do.js` | Serialized checkout, inventory, and settlement coordination |
| `worker/src/email.js`, `email-outbox.js`, `launch-reminders.js` | Templates, durable delivery, and reminder jobs |
| `worker/src/stats.js`, `reports.js` | Projections and shared pledge/fulfillment exports |
| `worker/src/token.js`, `routes/votes.js` | Supporter access and voting |
| `scripts/`, `tests/`, `.github/workflows/` | Development, audits, verification, and deployment |

For changes involving money, data, messaging, automation, visibility, or admin
power, use [Ethical Risk](ETHICAL_RISK.md) alongside the relevant technical guide.
