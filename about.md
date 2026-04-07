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
- **Access the supporter community** — vote on creative decisions and see exclusive updates

If your checkout includes more than one campaign, you may receive separate confirmation emails and manage links for each campaign. Just save those emails. They are your keys.

## How It Works

1. **Browse** — Find a project you want to support
2. **Pledge** — Add one or more campaigns to your cart, optionally add a 0% to 15% tip for platform upkeep, and continue into Stripe's secure checkout. Physical rewards add a flat shipping fee per campaign that includes physical items.
3. **Save card** — Stripe securely saves your payment method (no charge yet)
4. **Wait** — Campaign runs until its deadline (all times in Mountain Time)
5. **Result** — If a campaign is funded, your pledge for that campaign is charged. If it isn't, nothing happens.

Multiple pledges from the same email are combined into a single charge when the same campaign succeeds. Optional platform tips go to Dust Wave to help maintain The Pool and do not count toward a project's funding goal.

## For Creators

The Pool is designed for filmmakers and creative projects with features like:

- **Physical & digital tiers** — Offer tangible rewards with automatic shipping address collection and configurable flat-rate shipping
- **Production phases** — Break your budget into phases supporters can fund directly
- **Stretch goals** — Unlock additional creative possibilities as funding grows
- **Community decisions** — Let your backers vote on creative choices
- **Production diary** — Keep your community engaged with updates
- **Ongoing support** — Accept contributions after your main campaign ends

## The Technology

The Pool runs on a modern static architecture:

| Layer | Platform | Role |
|-------|----------|------|
| Frontend | GitHub Pages | Jekyll static site |
| Cart | The Pool cart runtime | First-party cart, pledge review, and checkout handoff |
| Payments | Stripe | Card storage, off-session charges, shipping address collection |
| Backend | Cloudflare Worker | Canonical pricing, pledge storage, live stats, fulfillment data, settlement |
| Email | Resend | Confirmations, updates, notifications |

No database servers. No monthly hosting fees. Version-controlled and transparent.

For teams forking The Pool, tax and shipping settings live in site config and mirrored Worker env so local UI, checkout, reports, and emails all stay aligned.

## Open Source

The Pool is open source. The entire platform — frontend, worker, automation — is available on GitHub.

**Source code:** [github.com/aindaco1/pool](https://github.com/aindaco1/pool)

---

*The Pool is created and maintained by [Dust Wave](https://dustwave.xyz).*
