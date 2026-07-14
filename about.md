---
layout: default
title: What Is This?
lang: en
translation_key: about
description: Learn how The Pool handles all-or-nothing pledges, physical rewards, supporter access, privacy, and independent creative campaigns.
last_modified_at: 2026-07-13
---
{% assign operator_name = site.platform.company_name | default: site.author %}
{% assign support_email = site.platform.support_email %}

# What Is The Pool?

**The Pool** is {{ operator_name }}'s open-source crowdfunding platform for independent film and creative projects. It gives small teams a focused place to raise money, offer rewards, communicate with supporters, and manage fulfillment without requiring every supporter to create an account.

## All-or-nothing pledges

When you support a campaign, Stripe securely saves your payment method, but you are **not charged when you make the pledge**. The campaign must reach its goal by its deadline. If it does not, your card is not charged.

Before a campaign ends, you can use the secure link in your confirmation email to review, change, or cancel your pledge. If one checkout includes several campaigns, each campaign remains a separate pledge and is settled separately.

## No account required

Your confirmation email contains the secure links you need to manage your pledge and, when offered, enter that campaign's supporter community. Save the email: it is the simplest way to return without maintaining another password.

Launch reminders and abandoned-checkout reminders are optional. Each is limited to the purpose described when you opt in and includes a way to unsubscribe.

## Where the money goes

Reward tiers, direct campaign support, custom campaign amounts, and campaign add-ons count toward the campaign goal. Shipping, tax, platform add-ons, and the optional platform tip do not.

The Pool does not deduct a platform commission from campaign funding. Supporters can choose an optional platform tip during checkout to help {{ operator_name }} operate the service. Stripe processing fees and other campaign expenses may still apply.

## Physical rewards and store policies

Physical rewards are part of a crowdfunding pledge, not ordinary in-stock retail orders. Campaign pages show the reward, price, shipping treatment, and expected timing available at the time of the pledge. Production and carrier delays can occur.

Charged rewards are final sale by default, with no returns or exchanges for change of mind, preference, or sizing. Damaged, defective, incorrect, or missing items remain covered by the fulfillment-problem process in our [no-returns and fulfillment policy]({% include localized-url.html lang=page.lang translation_key='terms' %}#returns-refunds). Shipping details are in the [shipping policy]({% include localized-url.html lang=page.lang translation_key='terms' %}#shipping-policy).

When a campaign explicitly enables a focused product page for its featured physical tier, The Pool can publish accurate product and preorder information for search. It does not publish product data until required facts, including an exact expected availability date, are present.

## For creators

Campaign teams can configure all-or-nothing funding, digital and physical reward tiers, campaign add-ons, production phases, stretch goals, supporter decisions, diary updates, protected previews, campaign embeds, and late support when appropriate.

A private, role-scoped dashboard supports campaign content, rewards, reports, supporters, fulfillment, analytics, marketing links, and authorized users. Sensitive pricing and totals are verified by the server rather than trusted from the browser.

## Privacy, access, and safety

Stripe handles full payment-card details. The Pool stores the information needed to manage pledges, communicate about campaigns, calculate applicable tax and shipping, prevent abuse, and fulfill rewards. Authorized campaign operators only receive the supporter and fulfillment information needed for campaigns they manage. We do not sell supporter information.

Public campaign, About, Terms, and eligible reward pages are designed for search and sharing. Pledge-management links, supporter-only pages, protected previews, checkout results, and the private dashboard remain outside public indexing and sharing intent.

## Open source

The public site, Cloudflare Worker, automation, localization, and dashboard are available at [github.com/aindaco1/pool](https://github.com/aindaco1/pool). Forks can change their identity through configuration while keeping payment, localization, privacy, and indexing boundaries aligned.

Questions? Email [{{ support_email }}](mailto:{{ support_email }}).

---

_Last updated: July 13, 2026_
