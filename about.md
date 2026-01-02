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

Unlike other platforms, The Pool doesn't require you to create an account. When you pledge, you receive an email with magic links to:

- **Manage your pledge** — cancel, modify amount, or update your payment method
- **Access the supporter community** — vote on creative decisions and see exclusive updates

Just save that email. Those links are your keys.

## How It Works

1. **Browse** — Find a project you want to support
2. **Pledge** — Add tiers to your cart and complete checkout
3. **Save card** — Stripe securely saves your payment method (no charge yet)
4. **Wait** — Campaign runs until its deadline (all times in Mountain Time)
5. **Result** — If funded, you're charged. If not, nothing happens.

Multiple pledges from the same email are combined into a single charge when the campaign succeeds.

## For Creators

The Pool is designed for filmmakers and creative projects with features like:

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
| Payments | Stripe | Card storage + off-session charges |
| Backend | Cloudflare Worker | Pledge storage, stats, settlement |
| Email | Resend | Confirmations, updates, notifications |

No database servers. No monthly hosting fees. Version-controlled and transparent.

## Open Source

The Pool is open source. The entire platform — frontend, worker, automation — is available on GitHub.

**Source code:** [github.com/aindaco1/pool](https://github.com/aindaco1/pool)

---

*The Pool is created and maintained by [Dust Wave](https://dustwave.xyz).*
