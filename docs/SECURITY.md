# Security Guide

This document covers the security architecture, known risks, applied hardening measures, accepted tradeoffs, and penetration testing procedures for The Pool crowdfunding platform. Encrypted backup boundaries, quarantined session/rate-limit state, off-device handling, and production restore approvals are defined in [BACKUP_RESTORE.md](./BACKUP_RESTORE.md).

Use this alongside [ETHICAL_RISK.md](./ETHICAL_RISK.md) when a change creates new data use, supporter messaging, admin power, public sharing, automation, or engagement pressure. Security review covers not only credential compromise and code injection, but also realistic misuse by spammers, harassers, fraudsters, careless admins, and overly aggressive growth workflows.

## Security Architecture

### Authentication Mechanisms

| Mechanism | Endpoints | Description |
|-----------|-----------|-------------|
| **Magic Link Tokens** | `/pledge*`, `/pledges`, `/votes` | HMAC-SHA256 signed tokens with 90-day expiry |
| **Launch Reminder Unsubscribe Tokens** | `GET /launch-reminders/unsubscribe` | Scoped HMAC token that suppresses one campaign/email reminder signup |
| **Stripe Webhook Signature** | `/webhooks/stripe` | HMAC-SHA256 verification per Stripe spec |
| **Admin Dashboard Sessions** | Browser dashboard `/admin/*` APIs | Email magic-link sign-in, signed session cookie, CSRF header on mutations, role/campaign scoping |
| **Campaign Preview Reviewer Tokens** | `/campaigns/:slug/preview/` via `/admin/campaign-preview/:slug` | Short-lived signed reviewer tokens scoped to campaign slug and reviewer email, backed by a 24-hour KV allowlist |
| **Admin Sign-In Challenge** | `POST /admin/auth/start` | Optional Cloudflare Turnstile verification before admin magic-link issuance |
| **Launch Reminder Challenge** | `POST /launch-reminders` | Optional/expected Cloudflare Turnstile verification before reminder signup writes |
| **Admin Recovery Secret** | Automation and recovery `/admin/*` endpoints | `Authorization: Bearer <secret>` or `x-admin-key` header for script-driven operations |
| **Scoped Admin Secrets** | Settlement and broadcast automation endpoints | Optional `ADMIN_SETTLEMENT_SECRET` and `ADMIN_BROADCAST_SECRET`; when configured, the scoped route rejects the broader `ADMIN_SECRET` |
| **Podcast Benefit Bridge** | Outbound Pool grant/revoke events | Dedicated HMAC-SHA256 signature over `{timestamp}.{exact body}`, exact endpoint validation, five-minute receiver freshness window, stable event IDs, and a disabled-by-default Pool kill switch |
| **Test Mode Guard** | `/test/*` | `APP_MODE === 'test'` environment check |

### Data Storage (Cloudflare KV)

| Key Pattern | Namespace | Data | Sensitivity |
|-------------|-----------|------|-------------|
| `pledge:{orderId}` | PLEDGES | Email, amount, Stripe IDs, status | **High** - PII + payment data |
| `email:{email}` | PLEDGES | Array of order IDs | **Medium** - links email to pledges |
| `stats:{slug}` | PLEDGES | Aggregate totals | **Low** - public |
| `tier-inventory:{slug}` | PLEDGES | Tier claim counts | **Low** - public |
| `stripe-event:{id}` | PLEDGES | "processed" flag | **Low** - idempotency |
| `processor-event:v1:{time}:{id}` | PLEDGES | Redacted Stripe request/webhook IDs, status, intent, timing, idempotency, reconciliation state; 400-day TTL | **Medium** - payment operations metadata |
| `campaign-pledges:{slug}` | PLEDGES | Array of order IDs per campaign | **Low** - index |
| `campaign-charged:{slug}` | PLEDGES | Settlement completion timestamp | **Low** - flag |
| `settlement-job:{slug}` | PLEDGES | Settlement batch progress | **Low** - ephemeral |
| `settlement-group:v1:{slug}:{hash}` | PLEDGES | Durable pre-charge/submitted/result state and processor ID; 400-day TTL | **Medium** - payment operations metadata |
| `reconciliation-break:v1:{slug}:{kind}:{hash}` | PLEDGES | Open/resolved processor-vs-pledge differences and object/order IDs; 400-day TTL | **Medium** - payment operations metadata |
| `pending-extras:{orderId}` | PLEDGES | Temporary support item / custom amount checkout extras | **Low** - ephemeral |
| `pending-tiers:{orderId}` | PLEDGES | Temporary overflow tier metadata during checkout | **Low** - ephemeral |
| `cron:lastRun` | PLEDGES | Last persisted hourly cron execution timestamp | **Low** - monitoring |
| `admin-login:{hash}` | PLEDGES | One-time admin login nonce and email | **Medium** - ephemeral admin auth |
| `admin-session:{hash}` | PLEDGES | Admin email, role, campaign scope, CSRF token, expiry | **High** - admin auth |
| `admin-users:v1` | PLEDGES | Runtime admin users and campaign scopes | **High** - access control |
| `admin-marketing-referrals:{slug}` | PLEDGES | Saved referral code and QR source metadata | **Low** - admin-authored marketing data |
| `admin-marketing-draft:{slug}:{surface}` | PLEDGES | Explicit shared Marketing/Blast draft with short retention | **Medium** - admin-authored campaign email/link content |
| `campaign-preview-reviewers:{slug}` | PLEDGES | Normalized reviewer email allowlist for protected campaign previews, with 24-hour TTL | **Medium** - campaign-scoped email access list |
| `admin-audit:{date}:{action}:{id}` | PLEDGES | Recent admin mutation audit events | **Medium** - admin identity + operational metadata |
| `launch-reminder:{slug}:{emailHash}` | PLEDGES | Upcoming-campaign reminder email and opt-in metadata | **Medium** - campaign-scoped email |
| `launch-reminder-suppressed:{slug}:{emailHash}` | PLEDGES | Reminder suppression marker | **Medium** - campaign-scoped email hash |
| `launch-reminder-sent:{slug}:{emailHash}` | PLEDGES | Reminder send idempotency marker | **Low** - send state |
| `launch-reminder-dispatch:{slug}` | PLEDGES | Bounded reminder dispatch job cursor/progress | **Low** - operational state |
| `launch-reminder-dispatch-queue:v1` | PLEDGES | Reminder dispatch queue idle/pending marker | **Low** - operational state |
| `abandoned-cart:{orderId}` | PLEDGES | Explicitly opted-in checkout reminder email and campaign snapshot | **Medium** - campaign-scoped email |
| `abandoned-cart-resume:{orderId}` | PLEDGES | Short-lived signed-link checkout resume snapshot after a reminder sends | **Medium** - campaign-scoped email and sanitized cart snapshot |
| `abandoned-cart-sent:{emailHash}:{campaignSetHash}` | PLEDGES | Checkout reminder send idempotency marker | **Low** - send state |
| `abandoned-cart-suppressed:{emailHash}` | PLEDGES | Checkout reminder unsubscribe marker | **Medium** - supporter email hash |
| `abandoned-cart-suppressed-campaign:{slug}:{emailHash}` | PLEDGES | Admin-managed campaign-scoped checkout reminder suppression marker | **Medium** - supporter email hash |
| `abandoned-cart-queue:v1` | PLEDGES | Checkout reminder queue idle/pending marker | **Low** - operational state |
| `abandoned-cart-health:v1` | PLEDGES | Aggregate checkout reminder queue/outcome health counters | **Low** - operational aggregate |
| `supporter-email-retry:{orderId}` | PLEDGES | Queued supporter confirmation email retry payload | **Medium** - supporter email payload |
| `supporter-email-retry-queue:v1` | PLEDGES | Supporter email retry idle/pending and next-attempt marker | **Low** - operational state |
| `email-outbox:v1:{hash}` | PLEDGES | Frozen provider payload and recipient while delivery is pending; 30-day TTL | **High** - transient email content + PII |
| `email-delivery:v1:{hash}` | PLEDGES | Minimal provider ID, content hash, category, status, timing; 400-day TTL | **Low** - delivery evidence |
| `email-suppression:v1:{emailHash}` | PLEDGES | Hashed permanent-bounce/complaint/provider suppression; 400-day TTL | **Medium** - consent/deliverability metadata |
| `campaign-email-suppression:v1:{slug}:{emailHash}` | PLEDGES | Hashed one-click campaign update suppression | **Medium** - consent metadata |
| `resend-webhook:v1:{svixId}` | PLEDGES | Signed Resend event dedupe marker; 35-day TTL | **Low** - idempotency |
| `add-on-inventory-sold:v1` | PLEDGES | Platform add-on sold-count projection | **Low** - aggregate inventory state |
| `vote:{slug}:{decision}:{email}` | VOTES | Vote choice | **Medium** - links supporter to vote |
| `results:{slug}:{decision}` | VOTES | Vote tallies | **Low** - semi-public |
| `rl:{endpoint}:{ip}` | RATELIMIT | Request count + reset time | **Low** - ephemeral |

Scarce limited-tier reservation and committed-count truth lives in the per-campaign Durable Object coordinator rather than KV, while KV keeps only the public `tier-inventory:{slug}` projection.

Settlement serialization is also Durable Object-backed. The `SETTLEMENT_COORDINATOR` binding owns a short-lived lock per campaign slug so scheduled settlement, direct settlement, dispatch, and batch endpoints cannot charge the same campaign concurrently. Multi-campaign carts still work because checkout persistence creates separate campaign-scoped pledge records, and settlement locks are keyed by the campaign being charged.

---


## Applied Hardening Notes

### Ethical Abuse And Misuse Review

The Pool's highest-impact abuse cases often cross product, security, privacy, and trust boundaries. Run the [Ethical Risk review](./ETHICAL_RISK.md) before shipping features that change:

- public discoverability, embeds, social previews, SEO metadata, referral links, or QR codes
- supporter email, reminders, Blast, diary/milestone broadcasts, preview invitations, or report delivery
- checkout totals, tips, taxes, shipping, inventory scarcity, settlement, or pledge modification
- admin roles, campaign scope, protected previews, campaign creation/archive, media upload, or GitHub-backed publishing
- analytics, provider plan usage, exports, backups, restore behavior, or new third-party data flows

Security sign-off answers the same practical questions each time:

- What data becomes easier to collect, infer, export, or expose?
- Which private/tokenized state could accidentally become indexed, prefetched, shared, or emailed?
- How could a malicious actor use this surface for spam, harassment, fraud, doxxing, payment abuse, or misleading public claims?
- What explicit consent, scoping, rate limiting, audit logging, no-store/noindex behavior, dry-run validation, or recovery path keeps the risk bounded?

### Secret Storage Boundaries

Runtime credentials are intentionally separated from editable site configuration:

- Non-secret settings belong in `_config.yml`, `_config.local.yml`, or admin setting drafts.
- Local development secrets belong in ignored `worker/.dev.vars`; run `npm run secrets:dev` or `npm run setup:deploy -- --mode=local` to create/update that file safely. Use separate local-only values, not production backups.
- Production Worker credentials belong in Cloudflare Worker secrets through `wrangler secret put`.
- Deploy credentials such as `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_CACHE_PURGE_TOKEN`, `ADMIN_BROADCAST_SECRET`, and `DIARY_CHECK_BYPASS_SECRET` belong in GitHub repository secrets only when GitHub Actions or operator scripts need to call those routes. Add `ADMIN_SETTLEMENT_SECRET` there only when a workflow actually calls settlement endpoints.
- The admin plan usage tracker must use `CLOUDFLARE_USAGE_API_TOKEN` or `CLOUDFLARE_ANALYTICS_API_TOKEN` with read-only GraphQL Analytics scope, plus Billing Read if Workers plan auto-detection is enabled. Do not reuse the broader Wrangler deploy token for dashboard usage reads.
- `CLOUDFLARE_ACCOUNT_ID` is not sensitive by itself, but Settings -> Plan usage still needs it in the Worker runtime environment as a variable or secret. A GitHub repository secret with the same name does not automatically become a deployed Worker binding.
- Wrangler deploys require `CLOUDFLARE_API_TOKEN` to be a Cloudflare user API token created from **My Profile -> API Tokens** with the **Edit Cloudflare Workers** template. Account-owned API tokens are not sufficient because Wrangler still calls user-scoped endpoints during deploy.
- GitHub repository secrets are not Worker runtime secrets. Scoped admin route enforcement requires the matching `ADMIN_BROADCAST_SECRET` or `ADMIN_SETTLEMENT_SECRET` to be present in Cloudflare Worker secrets too.
- The admin dashboard may show Configured/Missing status for runtime credentials, but it must not expose, edit, serialize, or publish secret values.

This boundary prevents the admin dashboard from becoming a credential store and keeps forks from accidentally committing Stripe, Resend, USPS, ZIP.TAX, or Cloudflare tokens while still making missing setup visible to operators. See [PAYMENT_PROCESSOR.md](./PAYMENT_PROCESSOR.md) for Stripe and settlement setup, and [EMAIL.md](./EMAIL.md) for Resend setup.

### Admin Dashboard Input Security Model

The browser admin dashboard has a single server-side normalization boundary before data is written to GitHub-backed YAML or Worker KV. Client-side controls exist for usability only; the Worker remains authoritative.

Admin mutations use these common protections:

- Browser dashboard mutations require a valid admin session cookie and `x-pool-admin-csrf` header.
- When `TURNSTILE_SECRET_KEY` is configured, admin email sign-in requires a server-verified Cloudflare Turnstile token before rate-limit writes, login nonce writes, or magic-link email sends. `ADMIN_TURNSTILE_BYPASS=true` is accepted only in local/test mode or local URLs for automated testing.
- Launch reminder signups use the same shared Turnstile verifier with public-reminder-specific env gates. `LAUNCH_REMINDER_TURNSTILE_BYPASS=true` is accepted only in local/test mode or local URLs for automated testing.
- Campaign users can mutate only campaigns in their assigned scope; super admins can mutate platform settings and all campaigns.
- GitHub-backed settings are allowlisted through `ADMIN_PLATFORM_SETTING_SCHEMA` and `ADMIN_CAMPAIGN_SETTING_SCHEMA`. Unknown paths are rejected, and pseudo UI rows such as the campaign content editor cannot be mass-assigned through settings publishing.
- Admin media uploads are scoped server-side by upload kind. Campaign media uploads require a valid campaign slug plus `campaign:edit_content`; platform/default media uploads require the super-admin `settings:publish` path. The Worker validates file type, size, destination directory, and filename before committing an asset path.
- Publish-time media cleanup is derived server-side from the previously loaded campaign data and the normalized campaign draft being committed. It only deletes safe root-relative dashboard-owned files under the same campaign's `assets/images`, `assets/videos`, or `assets/audio` directories, and it preserves external URLs, shared/default assets, and files still referenced elsewhere in the campaign.
- Runtime-only admin users are saved only to KV at `admin-users:v1`; they are not serialized into `_config.yml`.
- Admin dashboard tab/subtab restoration stores only browser-local UI identifiers for the last allowed workspace. It is not sent to the Worker, does not write KV or GitHub state, and role/campaign authorization still controls what can be restored after sign-in.
- Marketing referral codes are saved only on explicit user action and are scoped to the campaign URL origin/path the admin account can access.
- Shared Marketing/Blast drafts are saved only on explicit user action, scoped to one campaign and surface, expire after 7 days, and use revision tokens so stale saves do not overwrite another admin's work.
- Analytics attribution reporting and abandoned-checkout health use campaign pledge indexes or aggregate health state instead of KV namespace scans; reminder health responses expose counters and recent outcomes, not reminder recipient lists.
- Campaign-scoped abandoned-checkout suppression controls require CSRF, store hashed email identifiers, and do not expose a retry-this-specific-cart action.
- Campaigns -> Blast sends are scoped to campaigns the admin account can edit. Blast dry runs require the campaign pledge index and add no KV writes or list operations; live sends require a matching dry-run hash and write one audit event after dispatch.
- New campaign creation is super-admin-only, writes a preview-only campaign Markdown file locally in dev or through the existing GitHub path in production, and keeps that campaign out of public route generation until launched. Creating new campaign users during that flow saves to `admin-users:v1` and emails assigned users through the shared admin email path when users are assigned.
- Protected preview publication is scoped to super admins and assigned campaign users. It commits only preview flags to campaign Markdown, stores the publishing admin plus optional reviewer emails in a short-lived `campaign-preview-reviewers:{slug}` KV allowlist, returns a signed 24-hour dashboard link for the publishing admin, sends signed 24-hour reviewer links when optional reviewers are added, and records an audit event. Previewer emails must not be persisted in GitHub-backed campaign source, public campaign JSON, sitemap output, or generated metadata.
- Campaign archiving is super-admin-only and unavailable for currently live campaigns. The Worker validates the CSRF token, role, slug, campaign existence, and effective state before moving files locally in dev or dispatching `.github/workflows/archive-campaign.yml` in production. Both archive paths validate the slug, move campaign source and campaign-owned media into `archive/campaigns/<slug>/`, skip media still referenced by other active campaigns, and write an `archive-manifest.json`.
- The static admin shell uses a restrictive meta CSP with no inline scripts, limited Worker/API connections, and sandboxed preview iframes that receive only Worker-rendered preview HTML. Preview iframes allow scripts but intentionally do not use `allow-same-origin`, avoiding the browser warning and escape risk that comes from combining both sandbox tokens. Admin editing and protected-preview surfaces render remote YouTube/Vimeo media as facades instead of loading live players on page load; the CSP allows static YouTube thumbnail images for those facades but still does not load YouTube player scripts in editor previews. Public campaign pages and copied public embeds can still render approved players. Framing protection must be delivered as an HTTP header, such as `Content-Security-Policy: frame-ancestors 'none'` or `X-Frame-Options: DENY`; browsers ignore `frame-ancestors` inside meta CSP.
- Admin magic-link emails use internally generated login URLs and strip email-header control characters from admin-configurable sender/subject values before sending.

### Protected Campaign Preview Boundary

Protected previews are private review surfaces for editable campaigns, not public campaign pages.

- Static preview shells live under `/campaigns/:slug/preview/` and localized equivalents for every campaign slug so preview links do not race a static-site rebuild. They use `noindex,nofollow,noarchive`, strict-origin referrer behavior for embedded media compatibility, no public social metadata, and no public JSON-LD.
- The shell is generic and does not embed campaign title, payload data, or preview access data at build time. It fetches a no-store full campaign page preview payload from `/admin/campaign-preview/:slug`, with pledge controls rendered read-only.
- Authenticated admins can fetch the payload only through the existing admin session, CSRF/origin protections where applicable, and role/campaign scope checks.
- Explicit reviewers use signed `t` tokens scoped to token type, campaign slug, reviewer email, and expiry. The Worker also checks the email against the 24-hour KV allowlist before returning a preview payload.
- Preview publish requests carry a GitHub base revision when available. Stale publishes return a conflict instead of overwriting another user's changes.
- Public campaign filters treat preview-only/unlaunched campaigns as invisible for public pages, localized routes, `/api/campaigns.json`, add-on catalogs, share cards, sitemap output, robots crawl intent, embeds, and public prefetch eligibility.

### Public Prefetch And Share-Link Boundaries

The public intent-prefetch runtime is deliberately narrow so speculative navigation cannot turn private flows into background traffic.

- Prefetching is loaded only on public page layouts.
- Eligible URLs must be same-origin public document routes from the allowlist.
- Admin, checkout, Manage Pledge, pledge-result, supporter-community, campaign preview, API, Worker, tokenized, and sensitive-query routes are rejected.
- The runtime respects explicit `data-no-prefetch`, `download`, `target`, `nofollow`, save-data, slow-network, and per-page limit guards.

Campaign share links follow the same privacy boundary. The client preserves only safe UTM/referral query params for public campaign URLs, leaves token/order/email/session params behind, and lets Open Graph metadata supply preview images instead of serializing image URLs into share intents.

Launch reminder forms are public but bounded: signups require explicit consent, are rate-limited by IP, write one deduped campaign/email-hash record, and can be reactivated only by another explicit signup. Reminder dispatch checks suppression and sent markers immediately before email delivery.

Admin field classes are normalized consistently:

- Plain text strips control characters, enforces length limits, and rejects raw HTML.
- Inline rich text allows Markdown plus a small HTML subset (`<br>`, `<em>`, `<strong>`, `<i>`, `<b>`, `<u>`), rejects scripts, iframes, inline event handlers, inline styles, unsafe Markdown links, and parent-relative links such as `../admin`.
- URLs and media references must be safe root-relative paths or absolute `http`/`https` URLs. Canonical site/Worker URLs and external API bases must be absolute `http`/`https` URLs. Embedded credentials, unsafe schemes such as `javascript:` and `data:`, path traversal, literal whitespace, and raw markup characters are rejected.
- CSS design inputs are narrowed to hex colors, simple font stacks, and simple length tokens so settings cannot smuggle CSS declarations or `url(...)` values.
- Numbers, booleans, enums, IDs, slugs, dates, shipping dimensions, and package weights are parsed into canonical types with per-field bounds.
- Structured collections such as tiers, add-ons, diary entries, decisions, and content blocks are normalized item-by-item instead of trusting raw JSON from the browser.

SQL injection is not a primary threat for the current Worker because the runtime does not use SQL. The relevant injection classes are stored XSS, YAML/front-matter injection, KV key/path manipulation, URL/CSS injection, and privilege escalation through mass assignment; the admin normalizers are designed around those risks.

### Runtime Request Protection

The current Worker request boundary has these enforced properties:

- `/test/*` routes return `404` outside `APP_MODE=test`; development vote
  tokens are accepted only in test mode.
- Public aggregate reads may use wildcard CORS. Credentialed, checkout, admin,
  and other protected responses use the normalized configured site origin.
- Shared JSON responses include `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, the legacy `X-XSS-Protection` compatibility
  header, and `Referrer-Policy: strict-origin-when-cross-origin`.
- Checkout bootstrap, checkout completion, payment-method, admin, preview, and
  other order-specific responses use private/no-store policy where applicable.
  Cross-site checkout and payment-method POSTs fail origin checks.
- Request parsers enforce body-size limits before expensive JSON, Stripe, or KV
  work. Slugs, emails, vote identifiers/options, integer-cent amounts, admin
  fields, catalog values, media paths, URLs, and structured collections are
  normalized and bounded at the Worker boundary.
- The removed hosted-cart webhook route is absent. The first-party checkout and
  signed Stripe webhook are the only supported payment ingress paths.
- Community bearer tokens stay in session storage; a missing backing pledge
  returns `404` even when a magic-link signature is valid.
- Scarce-tier claims and settlement serialization use their per-campaign
  Durable Object coordinators. KV exposes projections, not race-sensitive
  authority.
- Add-on catalog and historical prices remain within the canonical Worker
  amount ceiling, and browser-submitted prices are not authoritative.
- Abandoned-checkout reminders require explicit consent, signed
  unsubscribe/resume links, bounded retention, deduplication, and campaign-index
  checks before delivery.

### Stripe Webhook Failure Behavior

The Worker checks event mode before applying a Stripe webhook. A missing secret
for the selected mode is acknowledged with a skipped outcome so Stripe does not
retry indefinitely, but the event is neither parsed into pledge state nor
applied. Invalid signatures return `401`. Production posture treats a missing
live webhook secret as a deployment defect.

Webhook processing uses a lease, processed markers, bounded body size,
redacted observability, and idempotent payment operations. Canonical pledge
state does not roll back when an email or other notification side effect fails.

### Rate Limits And Denial-Of-Wallet Controls

`RATELIMIT` is required. A missing or unavailable binding fails closed with
`503`; repeated blocked requests in the same window do not rewrite the same
counter.

| Endpoint class | Limit | Window | Key |
| --- | ---: | ---: | --- |
| Checkout start | 40 | 60 seconds | IP |
| Shipping quote | 90 | 60 seconds | IP |
| Tax quote | 90 | 60 seconds | IP |
| Checkout completion | 12 | 60 seconds | Order |
| Checkout abandon | 12 | 60 seconds | Order |
| Launch reminder signup | 5 | 60 seconds | IP |
| Manage Pledge reads | 120 | 60 seconds | IP |
| Manage Pledge writes | 30 | 60 seconds | IP |
| Vote reads/writes | 45 | 60 seconds | IP |
| Admin operations | 5 | 60 seconds | IP |
| Film Stripe summary adapter | 30 | 60 seconds | IP |

Public `/live/:slug`, `/stats/:slug`, and `/inventory/:slug` reads remain
uncapped for legitimate campaign traffic. Stripe webhooks rely on signature
verification, idempotency, and body limits rather than a tight shared-IP cap.
Deployed Standard/Paid Workers also declare `limits.cpu_ms = 100` as a
denial-of-wallet ceiling; local development does not enforce that Cloudflare
limit.

Use `GET /admin/observability/webhooks`,
`GET /admin/observability/performance`, and
[`scripts/check-observability.sh`](../scripts/check-observability.sh) to review
bounded delivery and timing summaries without exposing raw request payloads.

### Credential Comparison And Scope

Admin bearer values, scoped admin secrets, CSRF tokens, checkout signatures,
magic-link signatures, and dry-run hashes use timing-safe comparison helpers.
Missing admin credentials fail closed. Scoped settlement, broadcast, and
maintenance routes prefer their dedicated credential and reject the broader
fallback when the scoped secret is configured.

### Dependency And Release Security

Both `npm audit --omit=dev --audit-level=moderate` and the full
`npm audit --audit-level=moderate` are release checks. Production findings
block release. Dev-only findings in build or release tooling require removal, a
clean supported pin, or an explicit scoped acceptance record. The current
Lighthouse pin is recorded in the lockfile; the changelog and release evidence,
not this guide, retain the version-specific resolution history.

`npm run test:dependencies` runs both scopes against both lockfiles with bounded
transient retries. Merge Smoke exposes all four audits independently from
dependency installation and application tests. Missing audit evidence is a
failed check, not an accepted risk or a clean result; an npm service outage must
not be waived as a dev-only finding. The automated threshold remains moderate,
and any lower-severity findings remain in the output for scoped review. See
[Testing Guide](./TESTING.md#dependency-audits) for deadlines and rerun commands.

### Accepted Risks

Two low-severity tradeoffs remain accepted:

- Magic links expire after 90 days so accountless supporters can return across
  long campaign timelines. Each link is scoped to one order and requires a real
  backing pledge.
- Magic-link entry uses a query parameter. Strict referrer behavior, route
  scoping, private cache policy, and exclusion from indexing/prefetching reduce
  leakage risk.

Prospective shorter-lived links and one-time URL token exchange are tracked in
the [Roadmap](./ROADMAP.md).


## Secrets Checklist

Before deploying to production, verify these secrets are set:

Payment-specific setup is documented in [PAYMENT_PROCESSOR.md](./PAYMENT_PROCESSOR.md). Email-specific setup is documented in [EMAIL.md](./EMAIL.md).

| Secret | Environment Variable | Min Length |
|--------|---------------------|------------|
| Stripe API Key | `STRIPE_SECRET_KEY_LIVE` | N/A |
| Stripe Webhook Secret | `STRIPE_WEBHOOK_SECRET_LIVE` | 32+ chars |
| Checkout Intent Secret | `CHECKOUT_INTENT_SECRET` | 32+ chars |
| Magic Link Secret | `MAGIC_LINK_SECRET` | 32+ chars |
| Launch Reminder Token Secret | `LAUNCH_REMINDER_TOKEN_SECRET` or `MAGIC_LINK_SECRET` fallback | 32+ chars |
| Abandoned Checkout Token Secret | `ABANDONED_CART_TOKEN_SECRET` or `MAGIC_LINK_SECRET` fallback for reminder unsubscribe/resume links | 32+ chars |
| Admin Session Secret | `ADMIN_SESSION_SECRET` | 32+ chars |
| Admin Secret | `ADMIN_SECRET` | 32+ chars |
| Settlement Admin Secret | `ADMIN_SETTLEMENT_SECRET` (optional, scoped) | 32+ chars |
| Broadcast Admin Secret | `ADMIN_BROADCAST_SECRET` (optional, scoped) | 32+ chars |
| Pool–Podcast Bridge Secret | `POOL_PODCAST_BRIDGE_SECRET` (required only when Podcast benefits are enabled) | 32+ chars |
| Turnstile Secret | `TURNSTILE_SECRET_KEY`, `ADMIN_TURNSTILE_SECRET_KEY`, or `LAUNCH_REMINDER_TURNSTILE_SECRET_KEY` | N/A |
| Resend API Key | `RESEND_API_KEY` | N/A |
| Cloudflare Usage Analytics Token | `CLOUDFLARE_USAGE_API_TOKEN` or `CLOUDFLARE_ANALYTICS_API_TOKEN` | GraphQL Analytics Read; optional Billing Read for plan detection |

When GitHub Actions or an operator script calls protected admin endpoints, add only the needed matching secret to GitHub repository secrets. The default deploy workflow uses `ADMIN_BROADCAST_SECRET` for the post-deploy diary check when configured. Settlement automation uses `ADMIN_SETTLEMENT_SECRET` rather than the broader fallback secret.

Generate secure secrets:
```bash
openssl rand -base64 32
```

---

## Penetration Testing

See [tests/security/README.md](../tests/security/README.md) for the pen test suite.

For product-abuse review, pair the security suite with the Ethical Risk checklist. Red-team at least one malicious or careless-operator scenario for any feature that can send messages, change money, expose data, publish public content, or alter admin permissions.

Run security tests:
```bash
npm run test:secrets            # Audit local secret exposure in files + history
npm run test:security           # Against local Worker
npm run test:security:staging   # Against a staging worker, if you maintain one
npm audit --omit=dev --audit-level=moderate
npm audit --audit-level=moderate
```

`npm run test:premerge` includes the secret audit, so local merge gating checks both security behavior and accidental credential exposure.
The command is a thin Pool policy adapter over the shared Dust Wave scanner:
it preserves the ignored `worker/.dev.vars` and test-fixture rules, scans
tracked credential forms plus exact local values in the worktree/history, and
never prints or partially masks a matched value.

For local runs, keep `CHECKOUT_INTENT_SECRET` configured if you want the live-worker checkout-start suite to exercise the real first-party signing path.

---

## Incident Response

### Token Compromise

If a magic link token is compromised:
1. The token is tied to a specific orderId/email/campaign
2. It can only access/modify that one authorized order
3. To invalidate: delete the pledge from KV (`GET /pledge` will then return `404` for that token)
4. Optionally: regenerate MAGIC_LINK_SECRET (invalidates ALL tokens)

### Admin Session Or Secret Compromise

1. Immediately rotate `ADMIN_SESSION_SECRET` and `ADMIN_SECRET` via `wrangler secret put`
2. Clear active `admin-session:*` keys from the Worker KV namespace
3. Review `admin-audit:*` events and GitHub commits for unauthorized admin actions
4. Re-check campaign stats, pledge data, settings, and admin user scopes

### Stripe Webhook Secret Compromise

1. Rotate the webhook secret in Stripe Dashboard → Webhooks
2. Update `STRIPE_WEBHOOK_SECRET_*` in Worker
3. Check for any suspicious pledges created during exposure window

### Missed Stripe Webhook (Development)

If the on-site payment step completes but the pledge doesn't appear yet (common in local dev when webhook forwarding is delayed or broken):

1. Check Stripe CLI output for webhook delivery status
2. The client will first try `/checkout-intent/complete` automatically for local recovery, but if the pledge still does not appear, use the admin recovery endpoint to manually create it:
   ```bash
   curl -X POST http://localhost:8787/admin/recover-checkout \
     -H 'Authorization: Bearer YOUR_ADMIN_SECRET' \
     -H 'Content-Type: application/json' \
     -d '{"sessionId": "cs_test_..."}'
   ```
3. The endpoint fetches the checkout session from Stripe and creates the pledge if it doesn't exist

See [PAYMENT_PROCESSOR.md](./PAYMENT_PROCESSOR.md) for the fuller webhook recovery and reconciliation runbook.

**Prevention:**
- Use `scripts/dev.sh` which runs the Worker with local KV simulation
- `scripts/dev.sh` starts a single Stripe listener, forwards events to `127.0.0.1:8787/webhooks/stripe`, writes that same listener's `whsec_...` secret into `worker/.dev.vars`, and clears stale local processes on the standard dev ports before startup
- If you start Stripe manually, use the same listener instance for forwarding and for the secret you copy into local config
- `./scripts/dev.sh --podman` is the easiest way to keep the local site/Worker boundary production-like without relying on host Ruby/Wrangler setup
- For testing with seeded data, run `./scripts/seed-all-campaigns.sh` after starting the worker

---

## Security Contacts

- **Primary:** [alonso@dustwave.xyz]
- **Stripe Security:** [stripe.com/docs/security](https://stripe.com/docs/security)
- **Cloudflare Status:** [cloudflarestatus.com](https://www.cloudflarestatus.com)
