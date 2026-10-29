---
layout: default
title: What Is This?
lang: en
translation_key: about
description: Learn how The Pool handles all-or-nothing pledges, physical rewards, supporter access, privacy, and independent creative campaigns.
last_modified_at: 2026-10-28
---
{% assign operator_name = site.platform.company_name | default: site.author %}
{% assign support_email = site.platform.support_email %}

# What Is The Pool?

**The Pool** is {{ operator_name }}'s open-source crowdfunding platform for independent film and creative projects. It gives small teams a focused place to raise money, offer rewards, communicate with supporters, and manage fulfillment without requiring every supporter to create an account.

## All-or-nothing pledges

When you support a campaign, Stripe securely saves your payment method, but you are **not charged when you make the pledge**. The campaign must reach its goal by its deadline. If it does not, your card is not charged.

Checkout keeps your contact and address fields available while payment fields load. Changing your email or destination refreshes payment setup and the tax and shipping summary. Preparing those fields does not confirm a pledge or charge your card; you still need to complete the final confirmation.

Before a campaign ends, you can use the secure link in your confirmation email to review, change, or cancel your pledge, even if the campaign has already reached its goal. Once the deadline passes, changes and cancellation through that link close. If one checkout includes several campaigns, each campaign remains a separate pledge and is settled separately.

If payment fails after a successful campaign ends, updating your card can trigger an immediate retry of the saved pledge amount.

## No account required

Your confirmation email contains the secure links you need to manage your pledge and, when offered, enter that campaign's supporter community. Each management link authorizes access to its particular pledge. Save the email and keep the links private.

A pledge can be saved even if its confirmation email is delayed or cannot be delivered. If you are unsure whether it went through, contact [{{ support_email }}](mailto:{{ support_email }}) before making another pledge.

Launch reminders and abandoned-checkout reminders are optional. Each is limited to the purpose described when you opt in and includes a way to unsubscribe.

Campaign diary, milestone, and announcement emails also include a campaign unsubscribe option. Unsubscribing from those updates does not cancel your pledge or opt you out of essential pledge and payment notices.

## Where the money goes

Reward tiers, direct campaign support, custom campaign amounts, and campaign add-ons count toward the campaign goal. Shipping, tax, platform add-ons, and the optional platform tip do not.

The Pool does not deduct a platform commission from campaign funding. Supporters can choose an optional platform tip during checkout to help {{ operator_name }} operate the service. Stripe processing fees and other campaign expenses may still apply.

Prices are in U.S. dollars. New add-on selections use current product and variant prices. When you edit a pledge, an existing add-on keeps its saved unit price if you keep the same product and variant, even when you change the quantity.

Tax and shipping update as you enter your destination. Tax may remain an estimate even with a complete address: bundled U.S. ZIP-based rates have partial coverage, and a state-only fallback may omit local taxes. Checkout labels those estimates. Known U.S. ZIP/state conflicts must be corrected before continuing; suggested city names are optional and do not verify street-level deliverability. Campaign settlement uses the saved pledge amount.

## Physical rewards and store policies

Physical rewards are part of a crowdfunding pledge, not ordinary in-stock retail orders. Campaign pages show the reward, price, shipping treatment, and expected timing available at the time of the pledge. Production and carrier delays can occur.

Charged rewards are final sale by default, with no returns or exchanges for change of mind, preference, or sizing. Damaged, defective, incorrect, or missing items remain covered by the fulfillment-problem process in our [no-returns and fulfillment policy]({% include localized-url.html lang=page.lang translation_key='terms' %}#returns-refunds). Shipping details are in the [shipping policy]({% include localized-url.html lang=page.lang translation_key='terms' %}#shipping-policy).

When a campaign explicitly enables a focused product page for its featured physical tier, The Pool can publish accurate product and preorder information for search. It does not publish product data until required facts, including an exact expected availability date, are present.

## For creators

Campaign teams can configure all-or-nothing funding, digital and physical reward tiers, campaign add-ons, production phases, stretch goals, supporter decisions, diary updates, protected previews, campaign embeds, and late support when appropriate.

A private, role-scoped dashboard supports campaign content, rewards, reports, supporters, fulfillment, analytics, marketing links, and authorized users. Sensitive pricing and totals are verified by the server rather than trusted from the browser.

Teams can save a shared working copy, review it through a protected preview, then publish it explicitly. Saving does not change the public campaign. The dashboard tracks publication through deployment and reports Live only when the saved revision is deployed. Browser-local drafts remain separate recovery copies, and conflicting edits must be resolved before replacing a newer shared working copy.

## Privacy, access, and safety

Stripe handles full payment-card details. The Pool stores the information needed to manage pledges, communicate about campaigns, calculate applicable tax and shipping, prevent abuse, and fulfill rewards. Authorized campaign operators only receive the supporter and fulfillment information needed for campaigns they manage. We do not sell supporter information.

Public campaign, About, Terms, and eligible reward pages are designed for search and sharing. Pledge-management pages, supporter-only pages, protected previews, checkout results, and the private dashboard ask search engines not to index them. Keep private access links out of public posts and shared screenshots.

## Open source

The public site, Cloudflare Worker, automation, localization, and dashboard are available at [github.com/aindaco1/pool](https://github.com/aindaco1/pool). Forks can change their identity through configuration while keeping payment, localization, privacy, and indexing boundaries aligned.

Questions? Email [{{ support_email }}](mailto:{{ support_email }}).

---

_Last updated: October 28, 2026_
