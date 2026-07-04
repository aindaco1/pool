# Email System

The Pool sends transactional and campaign-support email through Resend from the Cloudflare Worker. Templates live in `worker/src/email.js`, shared localized copy lives in `_data/i18n/*.yml`, and scheduling / audience selection lives mostly in `worker/src/index.js`.

The email system is Worker-owned so pledge state, localization, branding, magic links, campaign scope, and resend/retry behavior stay in one path.

## Source Files

- `worker/src/email.js` builds and sends email payloads.
- `worker/src/index.js` calls email helpers from checkout, pledge management, scheduler, admin, report, and Blast routes.
- `_data/i18n/en.yml` and `_data/i18n/es.yml` hold shared UI/runtime/email copy.
- `assets/i18n.json` is the generated catalog the Worker can fetch for localized email copy.
- `_config.yml` holds non-secret sender identity and email branding inputs.
- `worker/wrangler.toml` receives mirrored non-secret email vars.

## Senders

Current sender roles:

- `PLEDGES_EMAIL_FROM` sends pledge lifecycle email: confirmation, modification, cancellation, payment failure, and charge success.
- `UPDATES_EMAIL_FROM` sends updates and operational email: launch reminders, abandoned-checkout reminders, diary updates, milestones, Blast, admin access, campaign assignment, protected previews, and reports.
- `SUPPORT_EMAIL` becomes the default reply-to address when configured.

These values come from `_config.yml`:

```yml
platform:
  support_email: support@example.com
  pledges_email_from: "The Pool <pledges@pool.example.com>"
  updates_email_from: "The Pool <updates@pool.example.com>"
```

The sender domains must be authorized in Resend. For the live Dust Wave deployment, the sender domain is `pool.dustwave.xyz`, so `pledges@pool.dustwave.xyz` and `updates@pool.dustwave.xyz` require that Resend domain to be verified.

## Setup

### 1. Configure Sender Identity

Set the sender fields in `_config.yml`, then sync the Worker mirror:

```bash
npm run sync:worker-config
```

The main dev/test/deploy scripts run this sync automatically, but running it directly is useful after manual config edits.

### 2. Verify The Resend Domain

In Resend:

1. Add the exact sending domain used by `PLEDGES_EMAIL_FROM` and `UPDATES_EMAIL_FROM`.
2. Add the DNS records Resend provides.
3. Wait for verification.
4. Confirm the API key is allowed to send from that domain.

Authorizing `example.com` does not automatically authorize `pool.example.com`, and authorizing `pool.example.com` does not automatically authorize `example.com`.

### 3. Store The API Key

Local development:

```bash
npm run secrets:dev
```

Production:

```bash
wrangler secret put RESEND_API_KEY
```

Do not store `RESEND_API_KEY` in `_config.yml`, campaign front matter, dashboard drafts, or committed docs.

### 4. Configure Branding

Email branding uses a curated mirror of `platform.*` and `design.*`:

- `EMAIL_LOGO_PATH`
- `EMAIL_FONT_FAMILY`
- `EMAIL_HEADING_FONT_FAMILY`
- `EMAIL_COLOR_TEXT`
- `EMAIL_COLOR_MUTED`
- `EMAIL_COLOR_SURFACE`
- `EMAIL_COLOR_BORDER`
- `EMAIL_COLOR_PRIMARY`
- `EMAIL_BUTTON_RADIUS`

When `SITE_BASE` is localhost, embedded email images fall back to the public site asset base so inbox clients do not receive broken localhost image URLs.

## Email Types

### Admin Magic Link

Sent when an admin requests sign-in from `/admin/` or `/es/admin/`.

- Uses a short-lived login nonce.
- May require Cloudflare Turnstile before the email is sent.
- Local development can expose the login URL in the browser only for localhost/test paths.
- Sender values are normalized to avoid email-header injection.

### Admin User Created

Sent when a super admin creates a dashboard user and notification delivery is enabled for that action.

- Explains what access was added.
- Points the user to the dashboard sign-in page.
- Does not include a password.
- Uses Resend only when `RESEND_API_KEY` is configured.

### Campaign Assignment

Sent when campaign users are assigned during new campaign creation or related admin flows.

- Identifies the campaign access.
- Points to the admin dashboard.
- Uses the shared admin email path.

### Protected Campaign Preview

Sent when an authorized dashboard user invites reviewers to a protected campaign preview.

- Reviewer links are signed and expire after 24 hours.
- Preview access email addresses live only in short-lived Worker KV allowlists.
- Previewer emails are not committed to campaign Markdown, public JSON, sitemap output, or generated metadata.

### Pledge Confirmation

Sent after a setup-mode Stripe checkout session is confirmed and the Worker persists the pledge.

Includes:

- campaign title and pledge items
- subtotal, tip, tax, shipping, and total where applicable
- Manage Pledge magic link
- supporter community link when the campaign has decisions
- localized copy based on stored `preferredLang`

For bundled multi-campaign checkout, the Worker persists campaign-scoped pledges and sends campaign-specific supporter email.

### Pledge Modified

Sent when a supporter changes an active pledge.

Includes:

- previous and new pledge context
- cent-accurate deltas
- updated items
- Manage Pledge link

Same-price structural changes, such as add-on variant swaps, still count as real changes and can send an update email.

### Pledge Cancelled

Sent after an active pledge is cancelled before deadline.

Includes:

- confirmation that the saved card was not charged
- final pledge breakdown
- campaign link for re-pledging if the campaign remains live

Cancellation also removes the supporter from future campaign-update audiences when no active pledge remains for that email/campaign.

### Payment Failed

Sent when an off-session settlement PaymentIntent fails.

Includes:

- amount due
- campaign and pledge details
- Update Card call to action through Manage Pledge

Payment method updates remain available after the campaign deadline so supporters can recover failed cards.

### Charge Success

Sent when settlement successfully charges a pledge.

Includes:

- final amount charged
- campaign/tier breakdown
- tax, shipping, and tip where applicable

### Diary Update

Sent when new campaign diary entries are broadcast.

- Uses a plain-text excerpt generated from the diary content.
- Links back to the campaign diary.
- Tracks sent entries in KV so the same diary entry is not broadcast repeatedly.
- Updating existing diary metadata should not send a new email when the entry ID is stable.

### Milestone

Sent when a pledge pushes a campaign across configured milestone thresholds.

- Triggered from pledge persistence.
- Uses the shared Resend path.
- Keeps milestone copy short and campaign-scoped.

### Blast / Announcement

Sent from Campaigns -> Blast or the legacy announcement endpoint.

Current behavior:

- Campaign users can send only for assigned campaigns.
- Super admins can send for any campaign.
- Dry runs validate subject, content, CTA, and indexed audience before sending.
- Test sends go only to the signed-in admin.
- Live sends require a matching dry-run hash.
- Live sends write an admin audit event after dispatch.
- Sent history reads recent audit records.

Blast content supports email-safe WYSIWYG blocks:

- headings
- text
- quotes
- lists
- links
- campaign-hosted images from `/assets/images/...`
- existing campaign images selected from the media picker
- YouTube/Vimeo links rendered as email-safe links/buttons

Arbitrary remote image hotlinks, iframes, and embedded video players are omitted from email payloads.

### Launch Reminder

Sent once when an upcoming campaign becomes live, only to people who explicitly signed up.

Current behavior:

- Public signup forms can use Cloudflare Turnstile.
- Signups dedupe by campaign/email hash.
- Suppression markers are checked before send.
- Sent markers prevent duplicate delivery.
- Unsubscribe links are signed and campaign-scoped.
- The dispatch queue uses a queue-state marker so idle cron ticks skip namespace scans.

### Abandoned Checkout Reminder

Sent only when the supporter explicitly opts into one checkout reminder.

Current behavior:

- The Worker queues the reminder only after Stripe successfully creates a Checkout Session.
- Successful pledge persistence deletes the pending reminder for that order.
- Before sending, the Worker checks campaign pledge indexes to avoid emailing supporters who completed through another order.
- Reminder links use signed unsubscribe and resume tokens.
- Resume links restore a sanitized checkout/cart snapshot and start a fresh Stripe session.
- The snapshot never stores Stripe secrets in the URL.

`ABANDONED_CART_TOKEN_SECRET` is preferred for reminder signing and falls back to `MAGIC_LINK_SECRET` when omitted.

### Campaign Runner Reports

Sent on the configured schedule to campaign `runner_report_emails`.

Report types:

- daily campaign pledge ledger during live campaigns
- one-time post-deadline fulfillment export

Current behavior:

- Timing uses `platform.timezone`.
- CSV attachments are optional by config.
- Campaign-runner recipients receive campaign-fulfilled rows.
- `platform.support_email` can receive separate platform-fulfillment rows when platform add-ons need fulfillment.
- Dashboard Reports previews/downloads are read-only and do not send email or write sent markers.

## Delivery And Retry

`sendResendEmail` is the central delivery helper. It:

- posts to `https://api.resend.com/emails`
- uses `Authorization: Bearer ${RESEND_API_KEY}`
- includes HTML and plain-text bodies
- applies reply-to when `SUPPORT_EMAIL` is configured
- summarizes Resend provider errors
- throws on non-OK responses

Supporter confirmation failures enqueue:

- `supporter-email-retry:{orderId}`
- `supporter-email-retry-queue:v1`

The scheduler drains retry work only when due. Resend pacing is centralized as `RESEND_RATE_LIMIT_DELAY_MS` in `worker/src/email.js` and is reused by broadcasts, reports, launch reminders, abandoned-checkout reminders, and Blast.

## Copy And Localization

Human-facing copy should stay short, direct, and localizable.

Rules:

- Put shared email copy in `_data/i18n/en.yml` and `_data/i18n/es.yml`.
- Let `worker/src/email.js` keep fallback English strings for missing keys.
- Preserve `preferredLang` from checkout/signup flows where available.
- Use localized `/manage/` and `/community/:slug/` links when the locale route exists.
- Avoid adding long campaign-authored copy to translation YAML; campaign content belongs in campaign files.

## Content Safety

Email content has stricter constraints than campaign-page content:

- Strip control characters from configurable header values.
- Escape campaign/user-controlled text before rendering HTML.
- Generate plain text from HTML for clients that need it.
- Use only site-hosted images in Blast emails.
- Convert YouTube and Vimeo content to links/buttons, not embeds.
- Avoid SVG attachments and active-content attachment patterns.
- Keep tokenized links scoped, signed, and time-limited where possible.

## Testing

Focused unit coverage:

```bash
npm run test:unit -- \
  tests/unit/email-tip.test.ts \
  tests/unit/email-security.test.ts \
  tests/unit/email-broadcasts.test.ts \
  tests/unit/worker-ops-integrity.test.ts
```

Useful broader checks:

```bash
npm run test:unit
npm run test:i18n
npm run test:secrets
```

Manual smoke:

1. Start the Podman stack with `./scripts/dev.sh --podman`.
2. Complete a test checkout.
3. Confirm pledge persistence and supporter confirmation behavior.
4. Trigger a pledge modification and cancellation on a local test campaign.
5. Test Campaigns -> Blast dry-run and test-send from the dashboard.
6. Preview/download Reports and confirm no email is sent by dashboard downloads.
7. Review Resend dashboard errors if delivery fails.

## Troubleshooting

If email does not send:

- Confirm `RESEND_API_KEY` is set in the Worker runtime.
- Confirm the sender domain matches `PLEDGES_EMAIL_FROM` / `UPDATES_EMAIL_FROM`.
- Check Resend domain verification status.
- Check Worker logs for the summarized provider error.
- Confirm local development is not relying on a production-only secret.
- Run `npm run test:secrets` before committing local secret changes.

If images are broken in received email:

- Confirm the image path is site-hosted under `/assets/images/...`.
- Confirm the deployed public site can serve that path.
- Avoid localhost-only URLs in email payloads.

If localized copy is missing:

- Run `npm run test:i18n`.
- Check `_data/i18n/{lang}.yml` for the missing key.
- Confirm the Worker can fetch `SITE_BASE/assets/i18n.json` or has `I18N_CATALOG_JSON` in tests.

## Related Docs

- [PAYMENT_PROCESSOR.md](./PAYMENT_PROCESSOR.md)
- [WORKFLOWS.md](./WORKFLOWS.md)
- [CUSTOMIZATION.md](./CUSTOMIZATION.md)
- [DASHBOARD.md](./DASHBOARD.md)
- [SECURITY.md](./SECURITY.md)
- [TESTING.md](./TESTING.md)
- [worker/README.md](../worker/README.md)
