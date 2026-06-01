---
layout: default
title: What Is This?
lang: en
translation_key: about
description: Learn how The Pool works, from all-or-nothing pledging to magic-link supporter access.
---

# What Is The Pool?

**The Pool** is Dust Wave's crowdfunding platform for independent film and creative projects, built on open-source technology.

The current platform release milestone is **v1.0.3**. The v1.0 feature set and launch hardening pass are complete, and the latest release focuses on configurable platform timezone handling plus opt-in launch reminders for upcoming campaigns.

## All-or-Nothing Pledging

When you back a project on The Pool, your card is saved securely via Stripe — but you're **not charged until the campaign reaches its goal**. If the project doesn't hit its funding target by the deadline, your card is never charged.

This protects both backers and creators: you only pay for projects that can actually make their funding goal.

## No Account Required

Unlike other platforms, The Pool doesn't require you to create an account. When you pledge, you receive email links to:

- **Manage your pledge** — cancel, modify amount, or update your payment method
- **Access the supporter community** — vote on published creative decisions and see exclusive updates

If your checkout includes more than one campaign, you'll receive separate confirmation emails and manage links for each campaign. Just save those emails. They are your keys.

For campaigns that have not launched yet, you can also sign up for a one-time launch reminder without creating an account or starting a pledge.

## How Email Magic Links Work

Instead of asking you to create a password, The Pool uses secure email links to prove that you control a pledge.

- **Each pledge gets its own link** — Your confirmation email includes a manage link for that specific campaign pledge.
- **Use the manage link to make changes** — From there you can review your pledge, adjust it while the campaign is still live, cancel it, or update your saved card.
- **Community links are supporter-only** — If a campaign has community voting enabled, the email also includes a supporter-community link for that campaign.
- **Launch reminders are separate** — If you opt into a reminder for an upcoming campaign, The Pool sends one launch email when that campaign goes live and includes an unsubscribe link.
- **Save the email** — The link is the fastest way back to your pledge later. If you open the community page in a new browser or after your browser session resets, using the email link again is the safest way to get back in.

If you backed multiple campaigns in one checkout, you'll still manage them separately afterward.

For supporter-community access, The Pool keeps the verified supporter session in the current browser session rather than a long-lived access cookie. Reopening the email link is the safest way back in if that session expires.

## Umm, So How Does It Work Again?

1. **Browse** — Find a campaign you want to help bring to life.
2. **Build your pledge** — Add one or more campaigns to your cart, choose any rewards or add-ons you want, and decide whether to include an optional platform tip. If your pledge includes physical items, checkout shows shipping and tax details as soon as it has enough information to calculate them.
3. **Save your payment method** — Enter payment details through Stripe. Your card is saved securely, but you are not charged when you pledge.
4. **Follow the campaign** — The campaign stays open until its deadline, shown in the configured platform timezone.
5. **See the result** — If the campaign reaches its goal, your pledge is charged after the campaign ends. If it does not reach its goal, you are not charged.

Some checkouts may include platform add-ons, campaign add-ons, delivery upgrades, shipping fees, taxes, or an optional platform tip. The checkout explains what counts toward the campaign's goal and what supports the platform separately.

Multiple pledges from the same email are combined into one charge when the same campaign succeeds. Optional platform tips and platform add-ons support the team operating the platform and do not count toward a project's funding goal.

## Sharing and Performance

Campaign pages are designed to be easy to share without turning private supporter flows into public links.

- **Built-in share links** — Campaign pages include share targets for Bluesky, X, Threads, Facebook, SMS, and email. Those links use the public campaign URL and state-aware copy where the destination supports message text.
- **Rich previews** — Public campaign links emit Open Graph and Twitter metadata, plus crawler-friendly campaign share-card images, so social platforms can show a useful preview.
- **Private links stay private** — Manage Pledge, supporter-community, checkout, admin, and tokenized links stay out of public sharing and indexing intent.
- **Faster first load** — Campaign progress bars and milestones render stable positions before JavaScript finishes, generated CSS/JS is minified for production, and the full cart runtime waits until there is cart state or supporter intent.
- **Conservative prefetching** — Public pages can prefetch likely same-origin public navigation after hover, focus, or touch intent, but private, checkout, admin, supporter, external, and sensitive-query links are excluded.

## For Creators

The Pool is designed for filmmakers and creative teams that need a campaign they can run without sending supporters through a maze of accounts, plugins, or disconnected tools.

- **No organizer platform fee** — Campaign funds stay with the project. Supporters can choose an optional 0% to 15% platform tip that helps sustain The Pool without reducing campaign funding.
- **Built-in pledge checkout** — Supporters pledge through The Pool's cart and review flow, while Stripe securely handles payment details for any later campaign charge.
- **Reward tiers that fit the project** — Offer digital or physical tiers, collect shipping details when needed, set quantity limits, and use the campaign's configured tax and shipping rules.
- **Optional platform add-ons** — Offer platform merch alongside pledges when enabled, with separate inventory and shipping handling that does not count toward a campaign's funding goal.
- **Campaign add-ons** — Sell campaign-specific merch or extras in the same pledge flow while keeping revenue, inventory, and shipping tied to that campaign.
- **Private admin dashboard** — Give trusted team members a focused workspace for campaign settings, page content, rewards, updates, decisions, reports, supporters, analytics, and marketing links.
- **Configurable platform timezone** — Super admins can choose the IANA timezone used for campaign deadlines, countdowns, scheduled reports, and lifecycle automation.
- **Dashboard media uploads** — Stage campaign and diary images, video, and audio with previews, then publish them into campaign asset paths through the normal reviewable workflow.
- **Reports when you need them** — Preview and download pledge or fulfillment CSVs from the dashboard, with optional campaign-runner emails during active campaigns.
- **Upcoming-campaign reminders** — Let potential supporters opt into one launch email before a campaign opens, without creating accounts or mailing-list dependencies.
- **Embeds for promotion** — Generate live campaign widgets for partner sites, press pages, creator portfolios, or sponsor pages.
- **Share links and social previews** — Give supporters clear platform share targets while keeping social preview images and descriptions aligned with the campaign's current state.
- **Production phases** — Show supporters which parts of the budget they can help fund.
- **Stretch goals** — Make additional creative milestones visible as support grows.
- **Community decisions** — Invite backers to vote on selected creative choices.
- **Production diary** — Share updates that keep supporters engaged from launch through fulfillment.
- **Ongoing support** — Keep accepting support after the main campaign ends, when the campaign is configured for it.
- **No-account supporter access** — Backers manage pledges and visit supporter-only pages through secure email links instead of creating another password.
- **Multilingual-ready supporter flows** — Start with English and add translated supporter pages, emails, campaign content, and management screens when a deployment needs more languages.
- **Safer rich content** — Write campaign pages and diary posts with Markdown and approved media embeds, with unsafe HTML and dangerous links blocked at render time.
- **Accessibility-minded experience** — Campaign pages, checkout, dialogs, tabs, sliders, and supporter flows are built and tested for keyboard and screen-reader use.

## The Technology

The Pool is a static-first crowdfunding stack. Public pages are generated ahead of time, while trusted server work stays behind Cloudflare Workers for pricing, pledges, admin access, fulfillment data, and settlement.

| Area | What runs it | Why it matters for forks |
|------|--------------|--------------------------|
| Public site | [GitHub Pages](https://docs.github.com/en/pages) and Jekyll | Campaign pages, docs, translated content, and public metadata stay easy to host and review in Git. |
| Pledge experience | The Pool cart runtime | The cart, reward selection, add-ons, pledge review, and magic-link management stay first-party. |
| Payments | [Stripe](https://stripe.com) | Stripe owns the sensitive payment fields, saved payment methods, and later charges. |
| Backend | [Cloudflare Workers](https://workers.cloudflare.com) and KV | The Worker validates totals, stores pledges, serves live stats, powers admin APIs, and handles fulfillment/settlement state. |
| Admin dashboard | The Pool private dashboard | Authorized users can manage campaigns, content, reports, supporters, analytics, marketing links, add-ons, and users without editing files directly. |
| Email | [Resend](https://resend.com) | Confirmation emails, supporter links, launch reminders, campaign updates, and charge notifications use one transactional email path. |

The stack is designed to be practical for small teams and forks. Each major service has a free tier, and the platform avoids unnecessary dynamic work wherever possible. Public campaign pages are static, public live data is combined and browser-cached, and the Worker is reserved for operations that need server-side trust.

The public page performance model stays static-first. The site minifies generated build artifacts, lets Cloudflare handle transfer compression, reserves stable space for campaign progress and media, and delays heavier first-party cart code until it is actually needed.

The admin dashboard follows the same cost discipline. Browsing, filtering, previews, analytics, reports, and local drafts avoid KV writes. Durable writes happen only when an admin explicitly saves dashboard-only state or publishes a campaign/platform change.

Customization is mostly configuration-driven. Tax, shipping, SEO, localization, platform timezone, logging, email identity, dashboard settings, public branding, checkout styling, and supporter email presentation are kept aligned through config so a fork can change the presentation without rewriting the pledge model.

For developers, the boundaries are intentionally clear: static content belongs in the site, trusted pledge math belongs in the Worker, payment details belong in Stripe, transactional email belongs in Resend, and role-scoped operations belong in the admin dashboard.

The same architecture supports accessibility and SEO without weakening security. Public pages emit crawlable metadata and conservative structured data, while private magic-link pages such as Manage Pledge, supporter community pages, and the admin dashboard stay out of search indexing. Checkout and management flows add keyboard, focus, dialog, live-region, and landmark behavior around Stripe's secure payment UI rather than replacing it.

## Open Source

The Pool is open source. The entire platform — frontend, Worker, automation, and fork-facing customization surface — is available on GitHub.

**Source code:** [github.com/aindaco1/pool](https://github.com/aindaco1/pool)

---

*The Pool is created and maintained by [Dust Wave](https://dustwave.xyz).*

_Last updated: June 1, 2026_
