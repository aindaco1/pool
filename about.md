---
layout: default
title: What Is This?
---

# What Is The Pool?

**The Pool** is Dust Wave's crowdfunding platform for independent film and creative projects, built on open-source technology.

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
2. **Pledge** — Add one or more campaigns to your cart, optionally add a 0% to 15% tip for platform upkeep, and continue into The Pool's secure payment step powered by Stripe. Physical rewards add a flat shipping fee per campaign that includes physical items.
3. **Save card** — Stripe securely saves your payment method inside that checkout flow (no charge yet)
4. **Wait** — Campaign runs until its deadline (all times in Mountain Time)
5. **Result** — If a campaign is funded, your pledge for that campaign is charged. If it isn't, nothing happens.

Multiple pledges from the same email are combined into a single charge when the same campaign succeeds. Optional platform tips go to Dust Wave to help maintain The Pool and do not count toward a project's funding goal.

## For Creators

The Pool is designed for filmmakers and other creatives with features like:

- **0% platform fee for organizers** — Supporters can optionally add a 0% to 15% platform tip to help sustain the platform without reducing campaign funds
- **First-party checkout** — The Pool controls the cart, checkout sidecars, and pledge review flow while Stripe securely handles payment details
- **Physical & digital tiers** — Offer tangible rewards with checkout-time shipping address capture and configurable sales tax and flat-rate shipping
- **Production phases** — Break your budget into phases supporters can fund directly
- **Stretch goals** — Unlock additional creative possibilities as funding grows
- **Community decisions** — Let your backers vote on published creative choices
- **Production diary** — Keep your community engaged with updates
- **Ongoing support** — Accept contributions after your main campaign ends
- **No-account supporter access** — Backers manage pledges and join supporter-only community pages through email magic links instead of creating accounts
- **Safer rich content** — Campaign text and diary entries support Markdown and approved embeds, while unsafe raw HTML and dangerous link or embed schemes are blocked at render time

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

For forks, that means static pages stay on GitHub Pages, public live reads are aggressively combined and browser-cached, and most Cloudflare Worker usage is reserved for the security-sensitive parts of the pledge lifecycle, while tax and shipping settings stay mirrored between site config and Worker env so local UI, checkout, reports, and emails all remain aligned.

## Open Source

The Pool is open source. The entire platform — frontend, worker, automation — is available on GitHub.

**Source code:** [github.com/aindaco1/pool](https://github.com/aindaco1/pool)

---

*The Pool is created and maintained by [Dust Wave](https://dustwave.xyz).*
