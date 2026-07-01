---
layout: default
title: Terms & Creative Guidelines
lang: en
translation_key: terms
description: Review pledge terms, payment processing, fulfillment, and privacy details for The Pool.
---

# Terms & Creative Guidelines

These terms reflect The Pool platform release milestone **v1.0.8**.

## Pledge Terms

- All pledges are **all-or-nothing**. Your card is saved securely but charged **only if** the campaign reaches its goal by the deadline.
- If a campaign does not reach its funding goal, your card will not be charged.
- You can modify or cancel your pledge anytime before the campaign ends using the magic link in your confirmation email.
- **No account required** — manage your pledge entirely via email links.
- Where this deployment offers additional languages, those emailed pledge links and supporter-community links may use localized routes while still authorizing the same pledge.
- A single checkout may include more than one campaign, but each campaign is stored and managed as its own pledge after checkout.
- Upcoming campaign launch reminders are optional and separate from pledging. If you opt in, The Pool sends one reminder when that campaign goes live and includes an unsubscribe link.
- Abandoned-checkout reminders are optional and separate from pledging. If you explicitly opt in during first-party checkout, The Pool may send one reminder for an unfinished checkout and includes an unsubscribe link.
- Some campaigns may be shared privately before launch through protected preview links. Reviewer preview links are invitation-only, campaign-scoped, and expire after 24 hours.
- All campaign deadlines use this deployment's configured platform timezone. This deployment defaults to `America/Denver` unless platform administrators change it.
- Community votes are limited to the published options on a campaign's supporter page, and closed decisions do not accept new votes.
- If a manage link points to a pledge that no longer exists, The Pool treats it as unavailable instead of reconstructing placeholder pledge access.
- Public campaign pages may include share links for external platforms, SMS, and email. Those links are for public campaign URLs only and do not include pledge-management, checkout, supporter-community, admin, or magic-link tokens.

## Payment Processing

- Your card details are handled by **Stripe's secure payment fields** embedded in The Pool checkout. We do not store full card numbers or CVC values. No charge is made until the campaign succeeds.
- If a campaign is funded, all pledges from the same email for that campaign are combined into a single charge.
- If one checkout includes more than one funded campaign, each funded campaign may produce its own charge because pledges and settlement are campaign-scoped.
- You may add an **optional platform tip** from 0% to 15% during checkout. The default tip is 5%.
- Optional platform tips support maintenance of The Pool and are included in your pledge total, but **do not count toward a campaign's funding goal**.
- This deployment may also offer **optional platform add-ons** alongside a pledge. Platform add-ons support maintenance of The Pool, are included in your pledge total, and **do not count toward a campaign's funding goal**.
- A campaign may also offer **optional campaign add-ons** alongside its pledge tiers. Campaign add-ons are included in your pledge total, **do count toward that campaign's funding goal**, and remain associated with that campaign for reporting and fulfillment.
- Sales tax is applied according to the tax rules configured for this deployment. Depending on the deployment, that may be a flat configured rate or a location-aware tax calculation based on the billing or shipping destination you provide during checkout or later pledge changes.
- Physical product pledges, physical campaign add-ons, or physical platform add-ons may include deployment-configured shipping charges. Depending on this deployment and campaign settings, shipping may be quoted from USPS, use a configured fallback rate, include free-shipping overrides, or offer limited domestic signature-upgrade options. Campaign add-ons follow the owning campaign's shipping rules; physical platform add-ons may be charged as a separate platform shipment. Your shipping address is collected during checkout so physical rewards can be fulfilled.
- For some digital-only or mixed carts, The Pool may also ask for enough billing location information to calculate tax before finalizing the pledge total. If a precise tax result is not yet available, the cart may show tax as an estimate until checkout has enough destination detail.
- If a delivery option is available for your shipment and you change it in checkout or Manage Pledge, the stored shipping total and pledge total are recalculated from the saved pledge state before the change is persisted.
- If you modify a pledge, The Pool recalculates totals from the saved pledge state and the campaign or add-on definitions in effect for that deployment, rather than trusting browser-submitted money fields.
- Transactional emails and supporter access links may reflect this deployment's configured branding and localized route structure, but each emailed manage link still authorizes only the pledge tied to that specific order.
- Scheduled campaign-runner reports, campaign state changes, and settlement checks use the same configured platform timezone as campaign deadlines. Settlement checks are serialized by campaign to avoid duplicate campaign charging.

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
- Contact us at info@dustwave.xyz for refund requests or issues.

## Privacy & Data

- We collect only the information necessary to process pledges and fulfill rewards: email, name, pledge/order details, and, for physical rewards, physical campaign add-ons, or physical platform add-ons, a shipping address.
- Full card details are handled and stored by Stripe. The Pool does not store full card numbers or CVC values.
- Email addresses and any shipping details needed for fulfillment may be stored in our system for pledge management, campaign-specific confirmations, campaign updates, and reward fulfillment.
- If you sign up for an upcoming campaign launch reminder, your email is stored in campaign-scoped reminder records so The Pool can send that one reminder, avoid duplicate sends, and honor unsubscribes for that campaign. Reminder signups may use Cloudflare Turnstile to reduce abuse.
- If you opt into an abandoned-checkout reminder, your email and a limited checkout reminder record may be stored briefly so The Pool can send one follow-up, avoid duplicate sends, restore the unfinished checkout context from a signed reminder link, delete the reminder after a completed pledge, and honor unsubscribe requests.
- Authorized campaign operators may view aggregate abandoned-checkout reminder health for campaigns they manage and may set campaign-scoped suppression records. Those controls use hashed email identifiers and aggregate counters instead of exposing reminder recipient lists.
- Authorized campaign operators may send campaign-scoped supporter blasts to supporters of campaigns they are allowed to manage. Blast emails use the shared transactional email system, may include hosted campaign images and ordinary campaign links, and should not expose unrelated campaign supporter data.
- Authorized campaign operators may explicitly save shared Marketing or Blast drafts for campaigns they manage. These drafts are campaign-scoped, expire after a short retention window, and may include draft subject lines, campaign links, CTA text, and campaign-hosted media references.
- Campaign organizers may receive campaign-scoped reports or fulfillment exports containing supporter/order details needed to run that specific campaign, coordinate delivery, or send production-related updates. Those reports stay limited to the campaign a supporter backed rather than exposing unrelated campaign pledges.
- Authorized campaign operators may also view campaign-scoped supporter rows, reports, analytics, fulfillment data, and campaign content through The Pool's private admin dashboard. Dashboard access is role-scoped: campaign users see only assigned campaigns, while platform administrators may see platform-wide operational data needed to run The Pool.
- Authorized campaign operators may use protected previews to review draft campaign pages before launch. Explicit reviewer email allowlists are stored only for the short preview window and are not intended for public campaign pages.
- If a campaign is archived by an authorized platform administrator, campaign source data and campaign-owned uploaded media may be retained in the repository archive for operational records instead of being deleted.
- When a pledge includes platform-fulfilled add-on items, platform operators may separately receive platform-only fulfillment exports limited to the items they must deliver.
- Platform administrators may use the dashboard to manage campaign configuration, platform settings, add-ons, referral links, shared marketing drafts, and authorized dashboard users. Secret values are kept in deployment secret stores or ignored local files, not in campaign content or dashboard drafts.
- Inventory-limited platform add-ons use saved pledge state, not in-progress cart drafts, to determine remaining stock.
- Inventory-limited campaign add-ons also use saved pledge state, not in-progress cart drafts, to determine remaining stock.
- Supporter-community access in the browser may be remembered for the current session as a convenience, but the emailed magic link remains the source of truth for access.
- Public pages may prefetch eligible same-origin public pages after hover, focus, or touch intent to make normal navigation faster. This prefetch behavior excludes admin, checkout, Manage Pledge, supporter-community, tokenized, external, and sensitive-query links.
- Protected preview pages are private review surfaces. They are excluded from public sitemap, social-preview, and indexing intent until a campaign is launched publicly.
- Public campaign pages may defer selected third-party media embeds, such as YouTube hero videos, until you choose to play them. Until then, the page may show a local poster image instead of contacting that third-party embed provider.
- Campaign share links may preserve safe public referral or UTM query parameters so campaign runners can understand public promotion sources. They do not preserve token, order, email, session, or other sensitive query parameters.
- Authorized platform operators may load Cloudflare and Resend plan-usage status in the private admin dashboard. Those provider checks use server-side credentials and do not send pledge details, supporter emails, shipping addresses, or payment data to the usage endpoints.
- The private admin dashboard may remember an authorized operator's last tab/subtab workspace in that browser. This UI preference is local to the browser and is not used to grant access beyond the signed-in admin role.
- We do not sell your information. We share it only as necessary for payment processing, transactional email delivery, abuse prevention, shipping quote calculation, and reward fulfillment.

## Platform & Technology

The Pool is an [open-source crowdfunding platform](https://github.com/aindaco1/pool) built with:

- **Jekyll on [GitHub Pages](https://docs.github.com/en/pages)** — Static site generation
- **The Pool cart runtime** — First-party cart management, checkout sidecars, pledge review, and lazy public-page loading until cart state or supporter intent requires the full cart stack
- **[Stripe](https://stripe.com)** — Secure payment fields, saved payment methods, and payment processing
- **[Cloudflare Workers](https://workers.cloudflare.com)** — Backend API for canonical pledge validation, pledge storage, live stats, and automated campaign settlement
- **Private admin dashboard** — Role-scoped campaign editing, protected previews, new campaign creation, reports, analytics, supporter views, marketing links, user management, and platform operations
- **[Resend](https://resend.com)** — Transactional emails (confirmations, launch reminders, checkout reminders, campaign blasts, updates, charge notifications)

Pledge data is stored in Cloudflare KV. This architecture means lower overhead costs and more of your pledge goes directly to the project, with optional platform tips helping cover maintenance of The Pool itself. Production builds also minify generated CSS/JS assets after static site generation, generate responsive image variants for public pages, and let Cloudflare handle transfer compression at the edge. Campaign lifecycle automation uses the configured platform timezone so deadlines, countdowns, reports, and settlement checks stay aligned.

## Questions

For questions about these terms or your pledge, email us at info@dustwave.xyz.

---

_Last updated: June 19, 2026_
