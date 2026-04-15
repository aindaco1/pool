---
layout: default
title: Terms & Creative Guidelines
lang: en
translation_key: terms
description: Review pledge terms, payment processing, fulfillment, and privacy details for The Pool.
---

# Terms & Creative Guidelines

## Pledge Terms

- All pledges are **all-or-nothing**. Your card is saved securely but charged **only if** the campaign reaches its goal by the deadline.
- If a campaign does not reach its funding goal, your card will not be charged.
- You can modify or cancel your pledge anytime before the campaign ends using the magic link in your confirmation email.
- **No account required** — manage your pledge entirely via email links.
- Where this deployment offers additional languages, those emailed pledge links and supporter-community links may use localized routes while still authorizing the same pledge.
- A single checkout may include more than one campaign, but each campaign is stored and managed as its own pledge after checkout.
- All campaign deadlines use Mountain Time (MST/MDT).
- Community votes are limited to the published options on a campaign's supporter page, and closed decisions do not accept new votes.
- If a manage link points to a pledge that no longer exists, The Pool treats it as unavailable instead of reconstructing placeholder pledge access.

## Payment Processing

- Your card details are handled by **Stripe's secure payment fields** embedded in The Pool checkout. We do not store full card numbers or CVC values. No charge is made until the campaign succeeds.
- If a campaign is funded, all pledges from the same email for that campaign are combined into a single charge.
- You may add an **optional platform tip** from 0% to 15% during checkout. The default tip is 5%.
- Optional platform tips support maintenance of The Pool and are included in your pledge total, but **do not count toward a campaign's funding goal**.
- This deployment may also offer **optional platform add-ons** alongside a pledge. Platform add-ons support maintenance of The Pool, are included in your pledge total, and **do not count toward a campaign's funding goal**.
- A campaign may also offer **optional campaign add-ons** alongside its pledge tiers. Campaign add-ons are included in your pledge total, **do count toward that campaign's funding goal**, and remain associated with that campaign for reporting and fulfillment.
- Sales tax is applied to pledges using the rate configured for this deployment.
- Physical product pledges, physical campaign add-ons, or physical platform add-ons may include deployment-configured shipping charges. Depending on this deployment and campaign settings, shipping may be quoted from USPS, use a configured fallback rate, include free-shipping overrides, or offer limited domestic signature-upgrade options. Campaign add-ons follow the owning campaign's shipping rules; physical platform add-ons may be charged as a separate platform shipment. Your shipping address is collected during checkout so physical rewards can be fulfilled.
- If a delivery option is available for your shipment and you change it in checkout or Manage Pledge, the stored shipping total and pledge total are recalculated from the saved pledge state before the change is persisted.
- If you modify a pledge, The Pool recalculates totals from the saved pledge state and the campaign or add-on definitions in effect for that deployment, rather than trusting browser-submitted money fields.

## Creative Control & Submissions

This section applies only to campaigns that explicitly solicit creative submissions (e.g., naming rights, story ideas, custom messages). If a campaign does not include submission-based tiers, this section does not apply to your pledge.

- You grant us a broad, irrevocable license to use submitted media/text in the production.
- We retain creative discretion; unsafe, illegal, defamatory or unworkable instructions will be rejected.
- Submissions must comply with our content guidelines (no hate speech, harassment, or illegal content).
- We reserve the right to adapt or modify submissions to fit the creative vision and production constraints.

## Fulfillment

- Fulfillment timing may adjust with production realities.
- We will provide regular updates on production progress and delivery timelines.
- Digital rewards will be delivered via email to the address provided during pledge.
- Physical rewards, physical campaign add-ons, and physical platform add-ons are shipped to the address collected during checkout. Any shipping charge shown during checkout is stored with the pledge and included in your pledge total.

## Refunds & Cancellations

- **Before funding:** Cancel anytime via your pledge management link. Your card will not be charged.
- **After funding:** Once a campaign reaches its goal and charges are processed, refunds are handled on a case-by-case basis.
- Cancelled pledges are never charged.
- Contact us at support@dustwave.xyz for refund requests or issues.

## Privacy & Data

- We collect only the information necessary to process pledges and fulfill rewards: email, name, pledge/order details, and, for physical rewards, physical campaign add-ons, or physical platform add-ons, a shipping address.
- Full card details are handled and stored by Stripe. The Pool does not store full card numbers or CVC values.
- Email addresses and any shipping details needed for fulfillment may be stored in our system for pledge management, campaign-specific confirmations, campaign updates, and reward fulfillment.
- Inventory-limited platform add-ons use saved pledge state, not in-progress cart drafts, to determine remaining stock.
- Inventory-limited campaign add-ons also use saved pledge state, not in-progress cart drafts, to determine remaining stock.
- Supporter-community access in the browser may be remembered for the current session as a convenience, but the emailed magic link remains the source of truth for access.
- We do not sell your information. We share it only as necessary for payment processing, transactional email delivery, shipping quote calculation, and reward fulfillment.

## Platform & Technology

The Pool is an [open-source crowdfunding platform](https://github.com/aindaco1/pool) built with:

- **Jekyll on [GitHub Pages](https://docs.github.com/en/pages)** — Static site generation
- **The Pool cart runtime** — First-party cart management, checkout sidecars, and pledge review
- **[Stripe](https://stripe.com)** — Secure payment fields, saved payment methods, and payment processing
- **[Cloudflare Workers](https://workers.cloudflare.com)** — Backend API for canonical pledge validation, pledge storage, live stats, and automated campaign settlement
- **[Resend](https://resend.com)** — Transactional emails (confirmations, updates, charge notifications)

Pledge data is stored in Cloudflare KV. This architecture means lower overhead costs and more of your pledge goes directly to the project, with optional platform tips helping cover maintenance of The Pool itself.

## Questions

For questions about these terms or your pledge, email us at support@dustwave.xyz.

---

_Last updated: April 2026_
