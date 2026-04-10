---
layout: default
title: Terms & Creative Guidelines
lang: en
translation_key: terms
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
- Sales tax is applied to pledges using the rate configured for this deployment.
- Physical product pledges include a flat shipping fee per campaign that contains physical items. Your shipping address is collected during checkout so physical rewards can be fulfilled.

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
- Physical rewards are shipped to the address collected during checkout. A flat shipping fee per physical campaign is included in your pledge total.

## Refunds & Cancellations

- **Before funding:** Cancel anytime via your pledge management link. Your card will not be charged.
- **After funding:** Once a campaign reaches its goal and charges are processed, refunds are handled on a case-by-case basis.
- Cancelled pledges are never charged.
- Contact us at support@dustwave.xyz for refund requests or issues.

## Privacy & Data

- We collect only the information necessary to process pledges and fulfill rewards: email, name, pledge/order details, and, for physical product tiers, a shipping address.
- Full card details are handled and stored by Stripe. The Pool does not store full card numbers or CVC values.
- Email addresses and any shipping details needed for fulfillment may be stored in our system for pledge management, campaign-specific confirmations, campaign updates, and reward fulfillment.
- Supporter-community access in the browser may be remembered for the current session as a convenience, but the emailed magic link remains the source of truth for access.
- We do not sell or share your information with third parties except as necessary for payment processing and email delivery.

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
