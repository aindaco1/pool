# Campaign Embeds

This document describes The Pool's hosted campaign embed feature and how it relates to the newer campaign rich-preview/share-card work.

## What The Feature Is

The Pool ships a hosted embeddable campaign widget that creators can paste into another site as an `iframe`.

The builder lives on:

- `/embed/campaign/`
- `/es/embed/campaign/`

Campaign pages link into that builder through the campaign sidebar, and the builder generates a copy-paste snippet for the current campaign. The private admin dashboard also embeds the same builder UI in the **Marketing** tab so admins can build referral/UTM links and campaign embed snippets from one workspace without duplicating embed logic.

## What It Is Not

The embed is not the same thing as a social rich preview.

- the embed is a live interactive `iframe` surface meant for websites and any host that allows pasted HTML
- the social preview is a metadata + image surface used by platforms like X, Slack, Discord, iMessage, and similar unfurl targets

Those platforms will not render the full embed widget. They use page metadata and the Worker-generated campaign share-card SVG instead.

## Current URL Contract

The hosted builder route is:

- `/embed/campaign/?slug={campaign-slug}`
- `/es/embed/campaign/?slug={campaign-slug}`

The generated iframe can also carry presentation options as query params:

- `layout=full|compact`
- `theme=default|warm|ocean`
- `media=show|hide`
- `cta=show|hide`

## Resize Model

The copied snippet includes the iframe plus a tiny resize listener.

The widget posts a `pool-campaign-embed:resize` message, and the pasted helper listens for it and updates the iframe height. That keeps creators from needing to wire custom resize logic by hand.

## Live Data Model

The widget is not a static card. It pulls live campaign state from the public Worker-backed campaign snapshot and reflects:

- effective state (`upcoming`, `live`, `funded`, `ended`)
- live pledged total
- funded/not-funded status
- countdown state for live campaigns
- progress markers and stretch-goal presentation
- creator/category/title/blurb/media metadata

That keeps embeds aligned with the same live campaign truth used elsewhere on the site.

## Localization Behavior

The embed surface follows the site locale model:

- `/es/embed/campaign/` renders the Spanish builder shell
- builder/runtime strings come from the shared locale catalog
- the close `X` and widget CTA return to the localized campaign route when applicable
- copied iframe URLs preserve the current locale path

Localized campaign routes are generated as:

- `/campaigns/{slug}/`
- `/es/campaigns/{slug}/`

## Relationship To Rich Previews

To keep shared links aligned with the embed’s visual language, campaign pages also emit:

- state-aware campaign title/description metadata
- localized alternate-language metadata
- a crawler-friendly static `social_image` for `og:image` when configured
- a Worker-generated share-card SVG route at `/share/campaign/{slug}.svg?lang={lang}` for live embed/share-card previews

That share card is the live preview companion to the embed, not a replacement for a static Open Graph image.

## Main Implementation Files

- `_layouts/campaign-embed.html`
- `embed/campaign/index.html`
- `es/embed/campaign/index.html`
- `_includes/campaign-embed-builder.html`
- `_layouts/admin.html`
- `assets/js/campaign-embed.js`
- `assets/js/admin-dashboard.js`
- `assets/partials/_embed.scss`
- `worker/src/index.js`

## Validation Checklist

When validating the embed manually:

- the campaign sidebar button opens the correct locale builder
- the copied iframe snippet preserves locale and selected options
- the Marketing tab renders the same builder controls below saved referral codes
- the widget auto-resizes after paste
- the widget CTA and close `X` point back to the correct localized campaign page
- compact/full and media-hidden states still render cleanly on mobile
- the widget reflects live campaign totals and state changes
