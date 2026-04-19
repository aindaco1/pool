---
layout: default
title: What Is This?
lang: en
translation_key: about
description: Learn how The Pool works, from all-or-nothing pledging to magic-link supporter access.
---

# What Is The Pool?

**The Pool** is Dust Wave's crowdfunding platform for independent film and creative projects, built on open-source technology.

The current platform release milestone is **v0.9.2**. Dust Wave is reserving **v1.0** for the wider public launch once the remaining roadmap items are complete.

## All-or-Nothing Pledging

When you back a project on The Pool, your card is saved securely via Stripe — but you're **not charged until the campaign reaches its goal**. If the project doesn't hit its funding target by the deadline, your card is never charged.

This protects both backers and creators: you only pay for projects that can actually make their funding goal.

## No Account Required

Unlike other platforms, The Pool doesn't require you to create an account. When you pledge, you receive email links to:

- **Manage your pledge** — cancel, modify amount, or update your payment method
- **Access the supporter community** — vote on published creative decisions and see exclusive updates

If your checkout includes more than one campaign, you'll receive separate confirmation emails and manage links for each campaign. Just save those emails. They are your keys.

## How Email Magic Links Work

Instead of asking you to create a password, The Pool uses secure email links to prove that you control a pledge.

- **Each pledge gets its own link** — Your confirmation email includes a manage link for that specific campaign pledge.
- **Use the manage link to make changes** — From there you can review your pledge, adjust it while the campaign is still live, cancel it, or update your saved card.
- **Community links are supporter-only** — If a campaign has community voting enabled, the email also includes a supporter-community link for that campaign.
- **Save the email** — The link is the fastest way back to your pledge later. If you open the community page in a new browser or after your browser session resets, using the email link again is the safest way to get back in.

If you backed multiple campaigns in one checkout, you'll still manage them separately afterward.

For supporter-community access, The Pool keeps the verified supporter session in the current browser session rather than a long-lived access cookie. Reopening the email link is the safest way back in if that session expires.

## Umm, So How Does It Work Again?

1. **Browse** — Find a project you want to support
2. **Pledge** — Add one or more campaigns to your cart, optionally add a 0% to 15% tip for platform upkeep, and continue into The Pool's secure payment step powered by Stripe. Physical rewards can add Worker-calculated shipping during checkout, including USPS-backed quotes, configured fallback rates, or free-shipping overrides when a deployment enables them. Some deployments may also show a limited delivery-option selector for domestic signature upgrades.
   You may also see optional platform add-ons. Those support Dust Wave directly, do not count toward a campaign's funding goal, and can be digital or physical. When they are inventory-limited, stock reflects saved pledges rather than in-progress carts.
   Some campaigns may also offer campaign add-ons. Those use the same add-on card UI, but they count toward that campaign's funding total and follow that campaign's shipping rules.
3. **Save card** — Stripe securely saves your payment method inside that checkout flow (no charge yet)
4. **Wait** — Campaign runs until its deadline (all times in Mountain Time)
5. **Result** — If a campaign is funded, your pledge for that campaign is charged. If it isn't, nothing happens.

Multiple pledges from the same email are combined into a single charge when the same campaign succeeds. Optional platform tips and platform add-ons go to Dust Wave to help maintain The Pool and do not count toward a project's funding goal.

## For Creators

The Pool is designed for filmmakers and other creatives with features like:

- **0% platform fee for organizers** — Supporters can optionally add a 0% to 15% platform tip to help sustain the platform without reducing campaign funds
- **First-party checkout** — The Pool controls the cart, checkout sidecars, and pledge review flow while Stripe securely handles payment details
- **Physical & digital tiers** — Offer tangible rewards with checkout-time shipping address capture, USPS-backed quote support, fallback/free-shipping policy controls, limited delivery-option upgrades, and configurable sales tax
- **Optional platform add-ons** — Offer a small global merch catalog alongside campaign pledges, with per-variant inventory, low-stock awareness based on saved pledges, and shipping support for physical add-ons
- **Optional campaign add-ons** — Let a campaign offer campaign-owned merch through the same cart / Manage Pledge add-on UI while still counting that merch toward the campaign subtotal and using campaign-specific shipping rules
- **Embeddable live campaign widgets** — Give campaign owners a hosted embed builder that generates copy-paste iframe code for sharing live campaign progress on other sites
- **Production phases** — Break your budget into phases supporters can fund directly
- **Stretch goals** — Unlock additional creative possibilities as funding grows
- **Community decisions** — Let your backers vote on published creative choices
- **Production diary** — Keep your community engaged with updates
- **Ongoing support** — Accept contributions after your main campaign ends
- **No-account supporter access** — Backers manage pledges and join supporter-only community pages through email magic links instead of creating accounts
- **Locale-ready supporter flows** — Shared UI strings, pledge-result pages, `/manage/`, supporter community routes, and supporter emails can all follow the deployment's configured language model, with English as the default and additional locales layered in through config plus translated content
- **Safer rich content** — Campaign text and diary entries support Markdown and approved embeds, while unsafe raw HTML and dangerous link or embed schemes are blocked at render time
- **Accessibility-conscious UI** — Keyboard-friendly dialogs, tabs, sliders, supporter-community flows, and public campaign interactions are part of the platform baseline, with automated accessibility checks covering critical public pages, pledge-result states, and checkout flows

## The Technology

The Pool runs on a modern static architecture:

| Layer | Platform | Role |
|-------|----------|------|
| Frontend | [GitHub Pages](https://docs.github.com/en/pages) | Jekyll static site |
| Cart | The Pool | First-party cart, checkout sidecars, and pledge review |
| Payments | [Stripe](https://stripe.com) | Secure payment fields, saved cards, and off-session charges |
| Backend | [Cloudflare Workers](https://workers.cloudflare.com) | Canonical pricing, pledge storage, live stats, fulfillment data, settlement |
| Email | [Resend](https://resend.com) | Confirmations, updates, notifications |

The platform is built on services that all offer free tiers, and The Pool was designed from the start to operate effectively within those free tiers whenever possible.

For forks, that means static pages stay on GitHub Pages, public live reads are aggressively combined and browser-cached, and most Cloudflare Worker usage is reserved for the security-sensitive parts of the pledge lifecycle, while tax, shipping, SEO, and logging settings stay mirrored or bounded through config so local UI, checkout, reports, and emails all remain aligned.

Forks can also rebrand the public site, on-site checkout styling, and supporter emails through config without changing the underlying pledge mechanics. The goal is to let creators or studios adapt the presentation while keeping the all-or-nothing funding model and supporter access flow consistent.

That architecture also leaves room for accessibility hardening without sacrificing the platform's security model: the surrounding cart, checkout, and management flows use stronger dialog, focus, keyboard, and live-region semantics, while Stripe continues to own the sensitive payment fields inside its secure UI.

The public side is also intentionally crawl-friendly without exposing supporter-only access: public pages and campaign pages emit consistent metadata and conservative structured data, while private magic-link pages such as Manage Pledge and supporter community flows stay out of search indexing.

## Open Source

The Pool is open source. The entire platform — frontend, Worker, automation, and fork-facing customization surface — is available on GitHub.

**Source code:** [github.com/aindaco1/pool](https://github.com/aindaco1/pool)

---

*The Pool is created and maintained by [Dust Wave](https://dustwave.xyz).*
