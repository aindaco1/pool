# Merge Smoke Checklist

Use this checklist before merging branches that change checkout, webhook persistence, pledge management, inventory, settlement, or supporter broadcasts.

This version is tuned for the current checkout and Worker business-logic behavior on `main`.

## Scope For This Branch

These behaviors changed intentionally and should **not** be treated as regressions during smoke testing:

- Magic links are order-scoped instead of email-scoped.
- `/checkout-intent/start` now reserves scarce limited inventory before payment confirmation, and successful persistence confirms that reservation.
- Legacy `GET /checkout` is disabled.
- Settlement only marks a campaign fully settled when no active pledges were skipped.

## Environment

Set these for the operator shell before starting:

```bash
export STAGING_SITE_URL="https://pool-staging.example.com"
export STAGING_WORKER_URL="https://pledge-staging.dustwave.xyz"
export ADMIN_SECRET="..."
```

If the staging site and Worker share the same domain pattern in your setup, use the real staging URLs instead of the placeholders above.

If no staging environment exists, point these variables at local dev instead:

```bash
export STAGING_SITE_URL="http://127.0.0.1:4000"
export STAGING_WORKER_URL="http://127.0.0.1:8787"
export ADMIN_SECRET="..."
```

In that case, run `./scripts/dev.sh --podman` first and record in the sign-off that merge relied on the automated gate plus local smoke coverage because no staging environment exists.

## Local Rehearsal

Before a staging pass, or instead of one when no staging exists, you can rehearse most of the flow locally with:

```bash
./scripts/dev.sh --podman
```

That script starts:

- Jekyll on `http://127.0.0.1:4000`
- the Worker on `http://127.0.0.1:8787`
- Stripe CLI webhook forwarding to the local Worker

Use local rehearsal to sanity-check checkout, webhook delivery, manage-link behavior, and admin endpoints before running the same flow against staging.

For dashboard-heavy branches, open the local dashboard at `http://127.0.0.1:4000/admin/`. The dev stack seeds the bootstrap admin defaults documented in `README.md` and `worker/README.md`; user-management changes made in the dashboard save to local Worker KV and are reset with local KV state.

For local-only pledge management checks, use the `smoke-editable` campaign. It is defined as `test_only: true`, so it shows up in local development when `_config.local.yml` enables `show_test_campaigns`, while staying excluded from the production homepage and production `/api/campaigns.json`.

Recommended local setup for modify/cancel smoke:

```bash
curl -s -X POST http://127.0.0.1:8787/test/setup \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke-local@example.com","campaignSlug":"smoke-editable"}' | jq
```

Or run the end-to-end local mutate/cancel check directly:

```bash
./scripts/smoke-pledge-management.sh
```

## Test Data Setup

Prepare or identify:

1. One live staging campaign with:
   - at least one standard tier
   - one limited tier
   - one threshold-gated tier if available
   - at least one support item if available
2. One supporter email inbox you can receive mail in.
3. One second supporter email inbox for multi-pledge and inventory checks.
4. Seeded pledges for settlement testing:
   - one active pledge with valid Stripe customer/payment method
   - one active pledge intentionally missing `stripeCustomerId`
5. A campaign with enough supporters to cross pagination boundaries, if available.

## Pass / Fail Rule

Treat any of these as merge blockers:

- checkout succeeds but persists the wrong pledge shape
- modify/cancel breaks pledge totals, stats, or tier inventory
- a single magic link can still enumerate or modify another order
- settlement marks a campaign complete while active pledges still need attention
- milestone, diary, or announcement sends miss supporters or duplicate unexpectedly

## Checklist

### 1. Checkout Start

1. Open a live staging campaign page.
2. Add a normal tier and proceed to checkout.
3. Confirm the browser reaches the on-site Stripe payment step successfully, or the hosted fallback path if that mode is intentionally enabled.
4. Expected result:
   - no console errors on the campaign page
   - the checkout summary matches the selected tier, support items, custom amount, and tip
   - if the selected tier is scarce and near exhaustion, checkout start can hold it immediately

### 2. Checkout Completion

1. Complete a real staging/test checkout for a single pledge.
2. Verify the success page loads.
3. Verify the pledge exists in the Worker-backed data and the supporter can open the manage link from email.
4. Expected result:
   - webhook persists the pledge once
   - stored tier/add-on/custom amount match the actual checkout session
   - stats endpoint reflects the new subtotal

Helpful checks:

```bash
curl -s "$STAGING_WORKER_URL/stats/<campaign-slug>" | jq
curl -s "$STAGING_WORKER_URL/inventory/<campaign-slug>" | jq
```

### 3. Magic Link Scope

1. Create or identify two pledges for the same supporter email.
2. Open the manage link from the first pledge email.
3. Attempt to view or act on the second pledge from that same session/link.
4. Expected result:
   - the link can manage only its own order
   - other pledges on the same email are not listed or modifiable through that token

### 4. Modify Flow

1. Modify an uncharged pledge:
   - change the base tier if allowed
   - adjust quantity if allowed
   - add or remove support items
   - add or remove custom support
2. Verify the updated totals in the manage UI and in stored data.
3. Expected result:
   - subtotal, tax, tip, and final amount update coherently
   - pledge history records the modification
   - stats and inventory reflect the new pledge state

### 5. Cancel Flow

1. Cancel an uncharged pledge through its own manage link.
2. Re-check stats and inventory.
3. Expected result:
   - pledge moves to cancelled state
   - subtotal is removed from campaign stats
   - limited inventory is released

### 6. Limited Inventory Behavior

1. Start checkout for a limited tier but do **not** complete payment.
2. From a second browser/profile, start checkout for the same last-unit limited tier.
3. Expected result:
   - the second checkout is blocked or sold out while the first reservation is still active
   - public inventory remains the projection of committed claims, so the user-facing sold-out behavior may lead the public claimed count briefly
   - successful webhook persistence confirms the held reservation instead of re-claiming against a separate truth source

### 7. Threshold-Gated Tier Behavior

1. Try to purchase a threshold-gated tier before the threshold is met.
2. If possible, repeat after seeding enough support to cross the threshold.
3. Expected result:
   - before threshold: selection is rejected/disabled
   - after threshold: selection succeeds normally

### 8. Settlement Dry Run

1. Run a settlement dry run for a funded test campaign.
2. Verify the response shows supporters and skipped records accurately.
3. Expected result:
   - active pledges missing Stripe customer data are surfaced as skipped/needing attention
   - no completion marker is created by dry run

Example:

```bash
curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":true}' \
  "$STAGING_WORKER_URL/admin/settle/<campaign-slug>" | jq
```

### 9. Settlement Live Run

1. Run live settlement on seeded staging data or a dedicated test campaign.
2. Inspect the response and follow-up status.
3. Expected result:
   - campaigns with skipped active pledges do **not** get a final `campaign-charged` marker
   - campaigns with no unresolved work do mark as settled
   - successful charges send the expected post-charge emails

Preferred endpoint for larger campaigns:

```bash
curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  "$STAGING_WORKER_URL/admin/settle-dispatch/<campaign-slug>" | jq
```

### 10. Customer Backfill

1. Run customer backfill for a campaign with known missing `stripeCustomerId` values.
2. Expected result:
   - all qualifying pledges across KV pagination are updated
   - rerunning settlement after backfill reduces or clears skipped customer records

```bash
curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "$STAGING_WORKER_URL/admin/backfill-customers/<campaign-slug>" | jq
```

### 11. Broadcast and Pagination Checks

Run these against a campaign with enough supporters to test pagination if possible.

1. Announcement dry run.
2. Diary check or diary broadcast.
3. Milestone check or milestone broadcast.
4. Expected result:
   - recipient counts include the full supporter set
   - no obvious truncation to a first page of results
   - no duplicate milestone send from a repeated or overlapping check

Examples:

```bash
curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"campaignSlug":"<campaign-slug>","subject":"Smoke Test","body":"Dry run","dryRun":true}' \
  "$STAGING_WORKER_URL/admin/broadcast/announcement" | jq

curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  "$STAGING_WORKER_URL/admin/milestone-check/<campaign-slug>" | jq
```

### 12. Admin Dashboard Smoke

Run this section when the branch changes dashboard UI, admin Worker routes, campaign configuration, add-ons, uploads, reporting, analytics, supporters, marketing tools, or user management.

1. Sign in to `/admin/` with an authorized admin email.
2. Verify the main tabs render without horizontal overflow at desktop, tablet, and mobile widths.
3. In **Settings**, confirm publishable sections show a disabled `Publish` button until a real change is made. Confirm **Users**, **Secrets & credentials**, and **Runtime diagnostics** do not show an unused publish action.
4. In **Settings -> Users**, create or edit a campaign user, save, and confirm the change takes effect without a GitHub publish flow.
5. In **Campaigns**, switch campaign subtabs and verify content, tiers, campaign add-ons, diary entries, and decisions load for the selected campaign only.
6. In **Content** and **Diary Entries**, add/edit a content block, verify WYSIWYG preview behavior, and confirm `Save Draft` only enables when the local draft differs from the saved value.
7. In **Add-ons** and campaign **Add-Ons**, verify physical products show shipping preset / package fields, digital products hide shipping fields, and product/variant IDs derive from names/labels for new entries.
8. In **Analytics**, **Reports**, and **Supporters**, verify the default `All` view only shows campaigns available to the current admin, dollar amounts show exact cents where applicable, and CSV export matches the visible rows.
9. In **Marketing**, save/edit/delete a referral code, verify the URL builder clears after save/refresh, and confirm the embedded campaign builder still works.
10. For `/es/admin/`, verify translated tab labels and tablet/mobile navigation do not overflow.

## Sign-Off Template

Record the smoke result in the PR or release notes:

```md
Smoke completed on <date> in <staging|local>.

- Checkout start/completion: pass
- Magic link scope: pass
- Modify/cancel: pass
- Limited inventory behavior: pass
- Threshold gating: pass
- Settlement dry/live: pass
- Backfill: pass
- Broadcast pagination/milestones: pass
- Admin dashboard smoke, if relevant: pass

Notes:
- <any intentional behavior observed>
- <any non-blocking staging caveats>
- <note that no staging environment exists, if applicable>
```
