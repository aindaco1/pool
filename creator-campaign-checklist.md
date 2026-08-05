---
layout: default
title: Campaign Creator Checklist
description: A complete prep checklist for creators launching a campaign on The Pool, including dashboard handoff, protected previews, media-library review, copy, tiers, add-ons, optional Shopping pages, promotion, shipping, policies, and fulfillment.
permalink: /creator-campaign-checklist/
lang: en
indexable: false
translation_key: creator_campaign_checklist
last_modified_at: 2026-08-04
---

<div class="creator-checklist-layout">
<article class="creator-checklist-article" markdown="1">

# Campaign Creator Checklist

This page is a practical handoff guide for creators preparing a campaign for **The Pool**.

It is designed to answer one simple question:

> What do we need from a creator to launch a campaign that feels complete, trustworthy, and exciting?

This checklist covers:

- required campaign fields
- image and video deliverables
- copy and word-count guidance
- tier and reward strategy
- campaign and platform add-on planning
- physical reward and shipping requirements
- tax, free-shipping, and fallback expectations
- promotion, share links, embeds, reporting, and fulfillment handoff
- QR/referral links and supporter Blast prep
- dashboard access, drafts, and publishing expectations
- optional materials that make a campaign feel richer and more persuasive

## Current Platform Notes

This checklist reflects the creator-facing platform behavior in the current release, **v1.1.2**:

- creators and campaign teams can use campaign-specific dashboard access for normal campaign setup, edits, previews, reports, analytics, marketing links, and supporter Blast work instead of direct repository access
- super admins bootstrap preview-only campaigns, assign or create campaign users, and handle platform-only controls, while assigned campaign users own day-to-day campaign prep
- super admins can archive non-live campaigns without deleting their source or campaign-owned media
- the dashboard media library can search and filter campaign images, video, and audio; show dimensions, duration, file size, references, optimization state, missing derivatives, and placement warnings; and safely replace same-campaign source files without changing their public path
- meaningful content images require alt text, while purely decorative images must be marked decorative explicitly
- campaign add-ons can be attached to one campaign and count toward that campaign's goal
- add-on variants can inherit the product's base price or use an explicit per-variant price override, including a valid `$0` override; the Worker still verifies current prices and preserves valid historical prices for unchanged saved selections
- campaign-runner report recipients can receive daily pledge ledgers and post-deadline fulfillment exports
- hosted embeds give creators a live widget for websites and HTML-friendly partner pages
- campaign pages include built-in share links for Bluesky, X, Threads, Facebook, SMS, and email
- share intents use the campaign's current state, title, blurb, and public URL where each platform supports message text
- upcoming campaigns can collect one-time launch reminder signups before pledging opens
- campaign launch/deadline timing follows the deployment's configured platform timezone
- campaign analytics now keep gross campaign revenue visible while also showing net campaign revenue after allocated processor fees
- platform operators can monitor Cloudflare and Resend plan usage from the admin dashboard without exposing provider tokens in browser code
- campaign teams can use protected preview links to review draft campaigns privately before public launch
- campaign teams can build tracked campaign URLs, save referral codes, generate browser-local QR previews/downloads, save explicit shared Marketing drafts, and review referral/UTM performance from Analytics
- Campaigns -> Blast can save explicit shared drafts and send supporter email blasts with hosted campaign images, selected existing campaign images, and email-safe YouTube/Vimeo links
- production campaign updates use durable delivery with bounded retries; diary, milestone, and live announcement messages include a campaign-scoped one-click unsubscribe, while pledge and payment messages remain transactional
- dashboard reloads return campaign teams to their last allowed tab, selected campaign, and Campaigns subtab so repeated content, Marketing, and Blast work resumes in place
- custom checkout can collect explicit consent for one abandoned-checkout reminder, which is separate from launch reminders and ordinary campaign blasts; campaign teams can review aggregate reminder health and use scoped suppression controls without retrying individual carts
- a campaign can optionally publish a localized, indexable product page for its featured physical tier only after the reward has a positive price, image, description, and exact expected availability date; this does not by itself create Merchant Center or Google Shopping placement
- the public Terms now state the default final-sale/no-returns policy, the process for damaged, defective, incorrect, or missing items, and the creator's responsibility to communicate material production or fulfillment changes
- public performance and SEO work make campaign progress, share links, localized metadata, generated share cards, deferred YouTube hero embeds, responsive image delivery, and the lightweight first load more reliable, but creators still need to provide optimized media and concise copy

## The Short Version

If a creator only reads one section, it should be this one.

### Required at launch

- campaign title
- slug, or approval of the dashboard-derived slug before public links are shared
- creator name
- category
- funding goal
- start date
- deadline
- short blurb
- square hero image
- wide hero image or campaign video
- at least one tier
- tier name, price, and description for each tier
- report recipient email addresses, if the campaign runner wants automatic reports
- dashboard editor email addresses, if the creator or team should edit the campaign directly
- optional preview reviewer email addresses for people who should see the private draft before launch
- a launch reminder decision for upcoming campaigns: enabled public form, no form, or launch without a pre-launch signup period

### Strongly recommended

- creator image
- long-form campaign description
- 3 to 6 tiers total
- 1 to 3 support items, if relevant
- campaign add-ons, if the campaign has fixed-price merch or extras
- 1 campaign pitch video
- 3 to 8 additional stills or gallery images
- a launch promotion plan that includes the campaign embed code
- QR/referral link destinations for print, venues, partners, and social bios
- a first supporter Blast plan for launch or final-push messaging
- launch-week share captions for upcoming, live, final-push, funded, and ended states

### Required if anything is physical

- identify the reward as physical
- provide a shipping preset or explicit shipping metadata
- decide whether shipping is free, carrier-rated, manually flat-rated, or allowed to use the platform fallback
- provide inventory counts
- provide variation details, if applicable
- provide a realistic expected availability or delivery window
- confirm that sizing, fit, final-sale, and fulfillment-problem copy agrees with the public Terms
- provide fulfillment owner and any packing/handling notes

If the optional Shopping product page will be enabled, the featured physical tier also needs a positive price, image, description, and exact expected availability date.

<figure class="creator-checklist-screenshot creator-checklist-screenshot--narrow">
  <img src="/assets/images/checklists/creator-campaign-checklist/campaign-card.png" alt="A campaign card showing title, blurb, progress, and featured tier." loading="lazy">
  <figcaption>A finished campaign card needs a readable image, crisp blurb, progress context, and one clear next action.</figcaption>
</figure>

## What Makes a Campaign Feel Complete

A complete campaign on The Pool usually has four things working together:

1. a clear premise
2. a strong visual identity
3. a persuasive pitch video or hero visual
4. rewards that are easy to understand and genuinely appealing

The best campaigns do not overwhelm people with information. They make it easy to understand:

- what the project is
- why it matters
- why this creator is the right person to make it
- what a supporter gets
- why someone should join now

<figure class="creator-checklist-screenshot">
  <img src="/assets/images/checklists/creator-campaign-checklist/campaign-hero-progress.png" alt="Campaign hero media with progress and goal markers beneath it." loading="lazy">
  <figcaption>The campaign hero should make the project feel real before the supporter reaches the tier list.</figcaption>
</figure>

## Core Campaign Information

These are the foundational fields every campaign should have.

| Item | Required | Guidance |
|------|----------|----------|
| Campaign title | Yes | Aim for 2 to 8 words. Short, memorable, readable at card size. |
| Slug | Yes by launch | Lowercase, hyphenated, stable. The dashboard can derive it from the title for preview-only creation, but approve it before public links are shared. Example: `midnight-picnic`. |
| Creator name | Yes | Public-facing display name. |
| Category | Yes | Short and legible. Example: `Short Film`, `Feature Film`, `Album`, `Zine`. |
| Funding goal | Yes | Whole-dollar amount. |
| Start date | Yes | Real public launch date. |
| Goal deadline | Yes | Real end date. |
| Short blurb | Yes | One clear sentence, ideally 12 to 24 words. |
| Featured tier | Recommended | Choose the clearest entry-point tier. |
| Runner report emails | Recommended | One or more campaign-runner recipients for pledge and fulfillment reports. |
| Fulfillment owner | Recommended | Who is responsible for campaign rewards after a successful charge. |
| Dashboard editors | Recommended | Authorized creator/team emails that should receive campaign-specific admin access. |
| Preview reviewers | Optional | Trusted emails that should receive a protected preview link before public launch. |
| Launch reminders | Optional | If the campaign has a pre-launch period, decide whether to collect one-time email reminders before pledging opens. |
| Featured reward Shopping page | Optional | Keep it disabled unless the featured tier is physical and its price, image, description, shipping treatment, policy copy, and exact expected availability date are complete. |

<figure class="creator-checklist-screenshot creator-checklist-screenshot--compact">
  <img src="/assets/images/checklists/creator-campaign-checklist/creator-facts.png" alt="Creator facts panel showing creator image, name, category, and embed link." loading="lazy">
  <figcaption>The creator facts panel pulls from the core metadata, so missing basics become visible on the public page.</figcaption>
</figure>

## Admin Dashboard Handoff

The Pool now uses a private admin dashboard for normal campaign editing and operations. Campaign creators do not need direct repository access for supported edits, and assigned campaign users should treat the dashboard as their working space for launch prep.

The dashboard can manage:

- campaign settings, dates, blurbs, images, video, shipping options, and optional featured-reward Shopping fields
- long-form campaign content through the WYSIWYG block editor
- tiers, support items, campaign add-ons, stretch goals, diary entries, and decisions
- report previews, supporter lists, analytics, marketing/referral links, and embed-builder shortcuts
- campaign QR downloads and saved referral links for promotion channels
- supporter Blast drafting, test sends, live sends, and read-only sent history
- share-link copy and social-preview inputs through the same title, blurb, hero image, and campaign-state fields shown on the public page
- protected preview links for trusted reviewers before the campaign is public
- a manifest-backed media library with search, type filters, optimization/reference details, placement warnings, and safe same-campaign replacement

Before launch, confirm:

- which creator or team emails should have campaign-specific dashboard access
- which external reviewers, if any, should receive protected preview links
- who on the creator team owns publishing campaign changes from the dashboard
- whether platform review is required before launch, especially for pricing, tax, shipping, inventory, or provider-sensitive changes
- which fields should be treated as final once public links are shared, especially slug, URL, prices, inventory, shipping, and tax expectations
- whether the optional Shopping page stays disabled or has a complete, confirmed featured physical reward and availability date

Operational notes:

- A super admin can create a preview-only campaign with only a title, then assign existing campaign users or create new campaign users. From there, assigned campaign users can complete the campaign in the dashboard. The campaign remains hidden from public campaign routes, embeds, share cards, sitemap output, and prefetching until launched.
- Super admins can archive non-live campaigns. Archiving moves campaign source and campaign-owned media into the archive path instead of deleting the work.
- New tier, support item, add-on, decision, and variant IDs can be derived from names/labels in the dashboard; legacy IDs should stay stable.
- Content editor drafts are local until saved/published, so creators should not treat unsaved browser drafts as the source of truth.
- Publishing campaign or settings changes commits through the platform workflow and may take time to deploy.
- Protected preview links expire after 24 hours, can be regenerated by an authorized campaign user, and do not make a preview-only campaign visible on public campaign routes.
- User management is separate from publishing: dashboard users save to Worker KV and do not create GitHub commits.
- Admin sign-in may include a Cloudflare Turnstile challenge before the email magic link is sent.
- Upcoming campaign launch reminder forms may also use Cloudflare Turnstile; platform operators configure those keys and secrets, not campaign creators.
- Campaign launch and deadline dates are interpreted in the platform timezone configured by a super admin, so confirm that timezone before publishing time-sensitive campaign copy.
- Analytics distinguish gross campaign revenue from net campaign revenue after allocated processor fees, which helps creators reconcile campaign totals without hiding the public funding math.
- Marketing and Blast shared drafts are explicit Load / Save / Clear actions with short-lived campaign-scoped storage; ordinary editor drafts stay browser-local.
- Blast images upload to the campaign asset path before automatic dry-run validation, while YouTube and Vimeo blocks become email-safe links instead of embedded players.
- Media-library warnings are advisory launch checks. Resolve broken references and missing derivatives, and review file-size or aspect-ratio warnings before publishing.
- Replacing an existing source file keeps its public path but is limited to the same campaign and media type; stale edits fail rather than overwriting a newer file.
- Shopping publishing fails closed when the featured reward or expected availability date is incomplete, so leave the switch off until every required fact has been confirmed.

### Short Blurb Guidance

Think of the short blurb as the project’s logline, not its full pitch.

- **Ideal length:** `12 to 24 words`
- **Maximum target:** `30 words`
- **Best use:** premise + format + tone

Good pattern:

> A haunted community-access broadcast returns as a 14-minute sci-fi short.

## Image Deliverables

The Pool leans heavily on visuals. Even a simple campaign feels much more convincing when the images are intentional, clean, and consistent.

These copied examples come from existing campaigns, but they live in this checklist’s own image folder so forks can delete or replace campaign media without breaking this guide.

<div class="creator-checklist-example-grid">
  <figure class="creator-checklist-example creator-checklist-example--square">
    <img src="/assets/images/checklists/creator-campaign-checklist/examples/square-hero-example.webp" alt="A centered revolver illustration on a pale background." loading="lazy">
    <figcaption><strong>Square hero:</strong> centered subject, strong contrast, readable at card size.</figcaption>
  </figure>
  <figure class="creator-checklist-example creator-checklist-example--wide">
    <img src="/assets/images/checklists/creator-campaign-checklist/examples/wide-hero-example.webp" alt="A wide illustrated scene with a large white hand and office objects." loading="lazy">
    <figcaption><strong>Wide hero:</strong> cinematic composition with room for responsive cropping.</figcaption>
  </figure>
  <figure class="creator-checklist-example creator-checklist-example--square">
    <img src="/assets/images/checklists/creator-campaign-checklist/examples/creator-image-example.webp" alt="A clean red circular Maiz production company mark." loading="lazy">
    <figcaption><strong>Creator image:</strong> simple mark that still reads in a small sidebar.</figcaption>
  </figure>
  <figure class="creator-checklist-example creator-checklist-example--square">
    <img src="/assets/images/checklists/creator-campaign-checklist/examples/tier-image-example.webp" alt="A black campaign T-shirt product mockup." loading="lazy">
    <figcaption><strong>Tier image:</strong> actual reward imagery beats a vague mood image.</figcaption>
  </figure>
  <figure class="creator-checklist-example creator-checklist-example--wide">
    <img src="/assets/images/checklists/creator-campaign-checklist/examples/gallery-still-example.webp" alt="A warm low-angle film still of a person lying in bed." loading="lazy">
    <figcaption><strong>Gallery still:</strong> specific, tonal, and useful for communicating the finished work.</figcaption>
  </figure>
</div>

### 1. Square Hero Image

This is the most important still image in the package.

- **Use:** campaign cards, fallback hero image, share cards, social/share contexts
- **Recommended dimensions:** `1200 × 1200 px`
- **Minimum dimensions:** `1000 × 1000 px`
- **Aspect ratio:** `1:1`
- **Recommended formats:** `WebP`, `JPG`, `PNG`
- **Recommended file size:** ideally under `500 KB`

Best practices:

- keep the main subject centered
- avoid dense text baked into the image
- make sure it still reads well at small sizes
- prioritize mood, clarity, and strong contrast
- remember that the generated share card uses this image, so it should still read when cropped into a social preview

### 2. Wide Hero Image

This is the main fallback visual at the top of the campaign page and the poster frame for self-hosted video.

- **Use:** campaign hero, video poster, social/share fallback
- **Recommended dimensions:** `1600 × 900 px`
- **Minimum dimensions:** `1400 × 788 px`
- **Aspect ratio:** `16:9`
- **Recommended formats:** `WebP`, `JPG`, `PNG`
- **Recommended file size:** ideally under `700 KB`

Best practices:

- leave breathing room near the edges
- avoid placing critical details in the extreme corners
- treat it like a cinematic banner, not a stretched poster

### 3. Creator Image

Optional, but strongly recommended for creator-led campaigns.

- **Use:** creator card in the campaign sidebar
- **Recommended dimensions:** `800 × 800 px`
- **Minimum dimensions:** `400 × 400 px`
- **Aspect ratio:** `1:1`
- **Recommended formats:** `WebP`, `JPG`, `PNG`
- **Recommended file size:** ideally under `300 KB`

Best practices:

- use a clear portrait or project-appropriate studio image
- keep the face or main subject readable at smaller sizes
- avoid text overlays

### 4. Tier Images

Optional, but useful for premium, physical, or highly visual rewards.

- **Use:** individual tier cards
- **Recommended dimensions:** `1200 × 1200 px`
- **Minimum dimensions:** `1000 × 1000 px`
- **Aspect ratio:** `1:1` source master
- **Recommended formats:** `WebP`, `JPG`, `PNG`
- **Recommended file size:** ideally under `500 KB`

Best practices:

- show the actual reward when possible
- otherwise use the clearest visual shorthand
- keep the image simple enough that the tier name and price still do the real work
- keep the subject centered and leave safe space because campaign cards and focused product pages may crop the source differently

### 5. Long-Form Content and Gallery Images

Use these for concept art, stills, behind-the-scenes images, moodboards, process images, or reward previews.

- **Recommended quantity:** `3 to 8`
- **Recommended width:** `1600 px` on the long edge
- **Minimum width:** `1200 px`
- **Aspect ratio:** flexible, though a consistent set often looks better
- **Recommended formats:** `WebP`, `JPG`, `PNG`
- **Recommended file size:** ideally under `500 to 600 KB` each

The dashboard preserves original uploads. Image and video uploads request the repository media workflow after the GitHub commit succeeds; that workflow can optimize source images, generate `320w`, `480w`, `640w`, `960w`, and `1600w` WebP variants for public pages, and create WebM video derivatives. Audio uploads remain source-preserved. The media library reports optimization state, missing derivatives, known references, broken references, and placement-specific size/aspect warnings from the checked-in media manifest. Creators should still export images near the recommended dimensions and crops before upload and resolve launch-blocking media issues before publishing.

Each meaningful public-facing image should also include:

- alt text
- optional caption

A purely decorative image may use empty alt text only when the editor's **Decorative image** control is selected. Do not mark an image decorative merely to skip writing a description.

#### Alt Text Guidance

- **Ideal length:** `6 to 18 words`
- describe what matters most
- do not use filler like “image of”
- do not repeat nearby copy unless the repetition is necessary to understand the image

Good example:

> Lead actor standing in an empty grocery aisle under green fluorescent light.

## Campaign Pitch Video

The campaign video is not just a fundraising tool. It is the fastest way to build trust, tone, and momentum.

You do not need expensive gear or a huge budget. You do need:

- clarity
- authenticity
- visual care
- a compelling reason to join

The best pitch videos answer three things:

- **Who** are you and the team?
- **What** is the project?
- **Why** this project, why now, and why should we care?

### Pitch Video Goals

A strong pitch video should:

- communicate the project’s tone quickly
- make the creator feel real and trustworthy
- explain why the campaign exists
- show what the finished work could feel like
- end with a clear call to action

### Recommended Video Specs

- **Recommended resolution:** `1920 × 1080`
- **Minimum resolution:** `1280 × 720`
- **Aspect ratio:** `16:9`
- **Best runtime:** `2:00 to 3:30`
- **Hard max target:** `5:00`

If self-hosting:

- **Preferred format in this repo:** `.webm`
- **Poster image:** use the wide hero image
- **Compression target:** web-friendly, fast-loading
- **Optimization:** dashboard uploads preserve source files, image/video uploads request the repository media pipeline after publish, and the pipeline can generate compressed images and WebM derivatives before launch

### Video Best Practices

#### 1. The first 15 seconds matter most

Start with the **feeling** of the project.

- if it is comedy, make the opening playful or funny
- if it is horror, make the opening unsettling
- if it is drama, make us feel the stakes immediately
- if it is music- or performance-based, let us hear or see that energy fast

People decide very quickly whether to keep watching. The opening should show the audience the thing they are most likely to get excited about first.

#### 2. Lead with tone, then context

Once the viewer is hooked, explain:

- what the project is
- who it is about
- what is at stake
- why this creator is making it now

#### 3. Show, don’t just tell

Talking directly to the camera can help build trust, but an uninterrupted talking head is rarely the strongest approach.

Use visual variety:

- test footage
- concept footage
- stills
- rehearsal or workshop footage
- storyboards
- location scouts
- past work
- graphics
- text cards
- props
- behind-the-scenes material

The pitch video should feel like a tiny piece of storytelling, not just an explanation.

#### 4. Be on camera if you can

Audiences back people, not just projects.

It helps to see the creator or team on camera, even briefly. That said, no one needs to “perform” if that does not suit the project. A simple, grounded presence is often more convincing than something over-rehearsed.

If a creator truly does not want to appear on camera, the video should still feel personal in some other clear way.

#### 5. A pitch video is not just a trailer

A trailer sells the finished work.

A pitch video needs to do more:

- sell the project
- sell the creator’s ability to make it
- explain the campaign
- build trust
- create urgency to join now

#### 6. End with a clear ask

Do not end vaguely.

Tell the audience what to do next:

- pledge
- join
- share
- follow along

### Pitch Video Starter Structure

This is a useful default structure, even if the final video becomes more inventive than this.

| Time | Purpose |
|------|---------|
| `00:00–00:15` | Hook us with footage, tone, energy, or world |
| `00:15–00:45` | Explain the story or project clearly |
| `00:45–01:10` | Introduce the creator/team and why they are the right people for it |
| `01:10–01:30` | Explain why support matters now |
| `01:30–end` | Call to action and strong closing image or moment |

### Low-Budget Production Tips

#### Sound

Audio quality matters more than camera prestige. A simple microphone setup or clean phone-recorded audio can work well if it is close to the speaker and captured clearly.

#### Picture

Good natural light can do most of the work. A clean frame, decent exposure, and intentional background matter more than expensive gear.

#### Energy

Supporters take emotional cues from the video. Calm conviction works better than flatness. If someone is uncomfortable on camera, keep their part brief and specific.

## Campaign Copy

The strongest campaign copy works in layers:

- short blurb
- long-form campaign description
- tier copy
- optional support item, stretch goal, and diary copy

### Best Practice Examples

These examples are culled from existing campaigns and shortened where needed. The point is not to copy the voice, but to notice what each example does quickly.

<div class="creator-checklist-copy-examples">
  <section class="creator-checklist-copy-example">
    <h4>Short Blurb</h4>
    <blockquote>
      <p>In 1873, a witch marks a family for death.</p>
    </blockquote>
    <p>Works because it gives period, threat, and genre in one sentence.</p>
  </section>
  <section class="creator-checklist-copy-example">
    <h4>Project Premise</h4>
    <blockquote>
      <p>mina's not a bad person, but when it really counted, she made a terrible choice.</p>
    </blockquote>
    <p>Works because it opens with character conflict instead of production logistics.</p>
  </section>
  <section class="creator-checklist-copy-example">
    <h4>Why Support Matters</h4>
    <blockquote>
      <p>Principal photography on TECOLOTE is wrapped -- but that doesn't mean it can get out into the world without you.</p>
    </blockquote>
    <p>Works because it explains the campaign gap: the film exists, but finishing and release still need support.</p>
  </section>
  <section class="creator-checklist-copy-example">
    <h4>Creator Voice</h4>
    <blockquote>
      <p>Traditional financing wanted us to soften the satire. We refused.</p>
    </blockquote>
    <p>Works because it gives the campaign a point of view, not just a budget request.</p>
  </section>
</div>

<figure class="creator-checklist-example creator-checklist-example--wide creator-checklist-example--standalone">
  <img src="/assets/images/checklists/creator-campaign-checklist/examples/gallery-still-example.webp" alt="A warm low-angle film still of a person lying in bed." loading="lazy">
  <figcaption>Strong campaign copy gets easier when the next image reinforces the same tone, stakes, or world.</figcaption>
</figure>

### 1. Campaign Title

- **Ideal length:** `2 to 8 words`
- **Maximum target:** about `60 characters`

### 2. Long-Form Campaign Description

This is the main body of the campaign page.

- **Ideal total length:** `300 to 900 words`
- **Short minimum:** about `200 words`
- **Upper comfort zone:** about `1200 words`

Good sections include:

- what the project is
- why it matters
- what funding supports
- what the audience can expect
- where the project currently stands

Strong section headings:

- `The Project`
- `Why We’re Making It`
- `What Funding Supports`
- `The Visual Approach`
- `Where We Are Now`

### 3. Content Blocks

The long-form campaign body can include rich blocks.

#### Text blocks

- **Ideal length:** `80 to 250 words`
- most blocks should be `1 to 4 short paragraphs`

#### Quote blocks

- **Ideal length:** `10 to 35 words`

#### Image blocks

Provide:

- image file
- alt text
- optional caption

#### Gallery blocks

Provide:

- `3 to 8 images`
- alt text for each image
- optional caption

#### Video blocks

Provide:

- video file or approved video URL
- poster image, if available
- title
- optional caption

#### Audio blocks

Provide:

- audio file
- title
- optional caption

#### Embed blocks

Provide:

- exact approved embed URL
- title
- optional caption

Approved structured embeds must use exact trusted `https://` URLs from supported providers: YouTube, Vimeo, or Spotify. Instagram can be used as a social/profile link or email CTA where configured, but it is not a structured embed provider. If a creator wants to include a different embed provider, flag it before launch so it can be reviewed for security, layout, and mobile behavior.

## Reward and Tier Strategy

Rewards are one of the clearest opportunities to turn a campaign from pure fundraising into audience-building.

Good incentives should feel:

- specific
- easy to understand
- aligned with the project
- worth sharing

<figure class="creator-checklist-screenshot creator-checklist-screenshot--compact">
  <img src="/assets/images/checklists/creator-campaign-checklist/tier-card.png" alt="A campaign tier card with a reward image, tier name, price, description, and disabled ended-state button." loading="lazy">
  <figcaption>Tier cards work best when the name, price, image, and description can be understood at a glance.</figcaption>
</figure>

### Supporter Psychology

Supporters usually want some mix of the following:

- to feel special
- to feel included
- to feel recognized
- to avoid complicated fulfillment

That means strong rewards often:

- feel personal
- feel limited or exclusive
- are easy to deliver
- make the supporter feel like part of the project

### How Many Tiers?

For most campaigns:

- **Ideal total:** `5 to 7 tiers`
- **Minimum strong range:** `4 tiers`

Too many options can create decision fatigue. A focused set usually performs better than a huge menu.

### Useful Price Anchors

These are not hard rules, but they are useful planning anchors:

- `$10 to $20` entry-level support
- `$25` high-priority tier to get right
- `$50`
- `$100`
- `$250`
- `$500+`

### The $25 Tier Matters

The $25 range is often the most common support amount. It is worth treating as a strategy tier, not an afterthought.

For many campaigns, the strongest $25 tier is:

- digital
- specific
- on-brand
- visually appealing
- easy to share

For some projects, that might be:

- early access
- a digital zine
- a themed download bundle
- a personalized graphic
- a supporter-only digital extra

### Tier Deliverables

For each tier, provide:

- tier ID
- tier name
- tier price
- tier description
- whether it is digital or physical
- whether it is limited
- whether it is stackable
- whether it stays available in late support
- optional image
- optional unlock threshold

### Tier Copy Guidance

#### Tier name

- **Ideal length:** `2 to 6 words`
- **Maximum target:** about `40 characters`

#### Tier description

- **Ideal length:** `8 to 25 words`
- **Maximum target:** about `35 words`

Each description should answer:

- what the supporter gets
- when relevant, when or how they get it

Good example:

> DRM-free download and supporter-only production updates when the film is complete.

### Tier Image Guidance

If a tier has its own image:

- keep it visually distinct
- keep it on-brand with the campaign
- use original graphics or clear reward imagery when possible

## Support Items

Support items are optional, but useful when the creator wants supporters to fund specific needs directly.

For each support item, provide:

- ID
- label
- target amount
- short explanation of what it funds
- whether it remains available in late support
- whether it is digital or physical

### Support Item Copy Guidance

#### Label

- **Ideal length:** `2 to 5 words`

#### Need / explanation

- **Ideal length:** `4 to 14 words`

Good examples:

- `Festival submission fees`
- `Studio time + session musicians`
- `Archival footage licensing`

## Add-On Products

Add-ons are best for fixed-price extras, merch, or optional upgrades that should use a product-card UI instead of becoming a pledge tier.

The platform supports two add-on scopes:

- **Campaign add-ons** belong to one campaign and count toward that campaign's funding subtotal.
- **Platform add-ons** belong to The Pool operator and do not count toward any campaign goal.

Campaign creators usually only need to define campaign add-ons. Platform add-ons are useful when The Pool itself is selling global merch alongside pledges.

### When to use a campaign add-on

Use a campaign add-on when:

- the item is fixed-price
- the item is campaign-owned
- supporters may want it in addition to a tier
- it should appear in cart and Manage Pledge as a product card
- it should count toward the campaign's funding progress

Examples:

- poster
- soundtrack download
- zine
- sticker pack
- signed script
- prop replica
- extra ticket

<figure class="creator-checklist-example creator-checklist-example--square creator-checklist-example--standalone">
  <img src="/assets/images/checklists/creator-campaign-checklist/examples/tier-image-example.webp" alt="A black campaign T-shirt product mockup." loading="lazy">
  <figcaption>Add-on images should show the actual item or the clearest possible product mockup.</figcaption>
</figure>

### Campaign add-on deliverables

For each campaign add-on, provide:

- add-on ID
- name
- description
- price
- category: `digital` or `physical`
- image
- inventory count, if limited
- variant list, if applicable
- per-variant inventory, if applicable
- the base price each variant should inherit, plus an explicit price override for any variant that should cost a different amount
- shipping preset or explicit shipping metadata, if physical
- fulfillment owner

### Add-on copy guidance

#### Add-on name

- **Ideal length:** `2 to 6 words`
- **Maximum target:** about `45 characters`

#### Add-on description

- **Ideal length:** `8 to 22 words`
- explain what the supporter receives
- mention format, size, or delivery method if that affects expectations

### Add-on accounting and fulfillment notes

- campaign add-ons count toward the campaign subtotal and funding progress
- platform add-ons stay separate as platform merch
- physical campaign add-ons ship with the owning campaign's shipment rules
- physical platform add-ons combine into a separate platform shipment
- a blank variant price inherits the product base price; an explicit `$0` override is a real free variant, not a blank value
- selecting a different variant uses its current catalog price, while an unchanged variant on an existing pledge can keep its valid saved historical unit price
- price changes are not a safe way to rewrite already-saved supporter expectations; review public copy, inventory, and fulfillment implications before publishing them
- fulfillment reports separate campaign rows from platform rows so the right person receives the right work

## Optional Featured Reward Shopping Page

The Pool can publish a focused, localized product page for one campaign reward. This is optional and should be used only for a fully specified physical reward that is suitable for product search.

The page reuses the campaign's existing featured tier rather than creating a second product catalog. Before enabling it, confirm:

- the featured tier is physical
- the tier has a positive price
- the tier has a clear product image and description
- the exact expected availability date is on or after the campaign deadline and within one year of the site build date
- the visible campaign timeline, manufacturing plan, shipping treatment, and availability date agree
- the reward copy does not promise returns or exchanges that conflict with The Pool's default final-sale policy
- size, format, materials, included items, and other purchase-critical details are unambiguous

While the campaign is live, the focused page describes the reward as a preorder. Outside the live window it is shown as out of stock. The page includes the price, seller/brand, expected availability, shipping treatment, final-sale disclosure, and links to the public shipping and fulfillment-problem policies.

Enabling this page can make the reward eligible for product-search features, but it does not guarantee Google Shopping placement. Merchant Center verification, a matching product feed, shipping/return settings, destination approval, and platform-operator review are separate work. Keep **Shopping product enabled** off until the creator has supplied the complete facts and the operator is ready to maintain the same values everywhere.

## Stretch Goals

Optional, but most effective when they represent meaningful, real upgrades.

For each stretch goal, provide:

- threshold amount
- title
- short description

### Stretch Goal Copy Guidance

#### Title

- **Ideal length:** `2 to 6 words`

#### Description

- **Ideal length:** `8 to 25 words`

Good examples:

<div class="creator-checklist-guidance-examples">
  <section class="creator-checklist-guidance-example">
    <h4>Meaningful Upgrade</h4>
    <blockquote>
      <p><strong>Extra Sound Design Week:</strong> More Foley and ambience layers.</p>
    </blockquote>
    <p>Works because the extra money buys a clear improvement to the finished work.</p>
  </section>
  <section class="creator-checklist-guidance-example">
    <h4>Audience Participation</h4>
    <blockquote>
      <p><strong>Silly Accent:</strong> Directors must give all notes in a supporter-chosen accent for one scene.</p>
    </blockquote>
    <p>Works because the reward is specific, playful, and easy for supporters to picture.</p>
  </section>
</div>

## Community Decisions

Optional. Best used for questions that are fun, specific, and genuinely flexible.

For each decision, provide:

- decision ID
- title
- 2 to 5 options
- eligibility rule
- starting status

### Decision Copy Guidance

- **Decision title:** `4 to 10 words`
- **Option length:** `1 to 5 words`

Good example:

<div class="creator-checklist-guidance-examples">
  <section class="creator-checklist-guidance-example">
    <h4>Main Villain's Name</h4>
    <blockquote>
      <p>Options: Dr. Badguy McEvilface, The Dark Inconvenience, Susan</p>
    </blockquote>
    <p>Works because the choice is low-risk, funny, and meaningfully tied to the project’s tone.</p>
  </section>
</div>

Good decisions are:

- concrete
- low-friction
- creatively flexible

<figure class="creator-checklist-screenshot creator-checklist-screenshot--medium">
  <img src="/assets/images/checklists/creator-campaign-checklist/community-decision.png" alt="A supporter community decision card with poll options and a submit vote button." loading="lazy">
  <figcaption>Community decisions should be specific enough that supporters can vote quickly without needing extra context.</figcaption>
</figure>

Bad decisions are:

- vague
- overly technical
- essential to the integrity of the project in a way that should not be crowdsourced

## Production Diary

Optional at launch, but very useful once a campaign is active.

For each diary entry, provide:

- title
- date
- phase
- content blocks

### Diary Copy Guidance

#### Entry title

- **Ideal length:** `3 to 10 words`

#### Entry body

- **Ideal length:** `60 to 250 words`

Diary entries should feel like real updates, not press releases.

Use diary or announcement updates to disclose material changes to the schedule, creative plan, reward specifications, availability, or fulfillment approach. Keep stable entry IDs when editing an existing update so a metadata correction is not treated as a new broadcast.

Good examples:

<div class="creator-checklist-guidance-examples">
  <section class="creator-checklist-guidance-example">
    <h4>Milestone Update</h4>
    <blockquote>
      <p><strong>We hit $1K!</strong> Thanks to all our backers for your support.</p>
    </blockquote>
    <p>Works because it celebrates progress, thanks supporters, and creates momentum for the next share.</p>
  </section>
  <section class="creator-checklist-guidance-example">
    <h4>Final Stretch Update</h4>
    <blockquote>
      <p>We have reached the final week of our fundraiser, and we only need $400 left to go.</p>
    </blockquote>
    <p>Works because it gives supporters a concrete number and a reason to act now.</p>
  </section>
  <section class="creator-checklist-guidance-example">
    <h4>Next-Step Update</h4>
    <blockquote>
      <p>Now comes the fun part -- YOUR part. If you backed a reward tier, it's time to submit your materials.</p>
    </blockquote>
    <p>Works because it turns campaign success into a clear supporter action.</p>
  </section>
</div>

## Promotion and Embeds

Creators should plan promotion before launch, not after the page is live.

The Pool includes a hosted campaign embed builder at:

- `/embed/campaign/?slug=your-campaign-slug`
- `/es/embed/campaign/?slug=your-campaign-slug`, for Spanish-language pages

The embed is a live `iframe` widget for websites that allow pasted HTML. It reflects current campaign state, pledged total, countdown/progress, media settings, and the campaign call to action. The same builder also appears inside the dashboard Marketing tab alongside saved referral-code, UTM-link, and downloadable QR-code tools.

<figure class="creator-checklist-screenshot">
  <img src="/assets/images/checklists/creator-campaign-checklist/embed-builder.png" alt="The campaign embed builder with layout, theme, media, call-to-action controls, embed code, and preview area." loading="lazy">
  <figcaption>The embed builder turns promotion planning into concrete choices: layout, theme, media visibility, CTA, and destinations.</figcaption>
</figure>

### Promotion materials to prepare

Creators should provide or confirm:

- primary campaign URL
- embed-code destinations, such as personal site, venue site, newsletter page, partner blog, or press page
- QR-code destinations, such as posters, table cards, venue signage, programs, postcards, or QR-friendly social bios
- referral-code names for partners, press, venues, cast/crew, or campaign-runner channels
- preferred embed mode: full or compact
- preferred embed theme: default, warm, or ocean
- whether the embed should show campaign media
- whether the embed should show the campaign call to action
- launch-day social copy
- 3 to 5 short share captions
- state-specific share copy:
  - upcoming: invite people to watch for launch
  - live: ask people to pledge now
  - final push: name the remaining gap or deadline
  - funded: thank supporters and point to next steps
  - ended: describe the result and where people should follow updates
- 1 short email/newsletter blurb
- 1 short Blast subject and body for launch or final-push supporters
- CTA Button Label and CTA Button URL for any Blast that needs a clear next action
- press or partner contacts, if relevant

Good examples:

<div class="creator-checklist-guidance-examples">
  <section class="creator-checklist-guidance-example">
    <h4>Share Caption</h4>
    <blockquote>
      <p>Every share counts. Let's bring this thing home.</p>
    </blockquote>
    <p>Works because it is short, direct, and easy to paste into a launch-week post.</p>
  </section>
  <section class="creator-checklist-guidance-example">
    <h4>Email Blurb</h4>
    <blockquote>
      <p>Principal photography is wrapped, but finishing the film and getting it in front of audiences still needs support.</p>
    </blockquote>
    <p>Works because it explains why the campaign exists after production is already underway.</p>
  </section>
</div>

### Embed expectations

- the embed is for websites and HTML-friendly hosts
- social platforms use rich previews instead of rendering the iframe
- campaign pages generate share-card metadata for social previews
- campaign share buttons use the public campaign URL and state-aware text where supported, but Facebook and other preview-first destinations mostly use the Open Graph image/title/description
- creators should test the embed on mobile wherever they paste it
- QR codes should be tested from a real phone camera before printing or sharing broadly
- QR previews and PNG/SVG downloads are browser-local; saving a referral code is the explicit persistence step
- if a host strips iframe code, use a normal campaign link plus the share-card preview instead
- Blast copy should be concise, image-light, and linked to hosted campaign/media URLs rather than remote image hotlinks
- shared Marketing and Blast drafts are not autosave; use the explicit shared-draft buttons when multiple admins need the same campaign draft
- production Blast/announcement, diary, and milestone messages include campaign-scoped one-click unsubscribe; do not describe these as mandatory transactional mail
- production bulk mail is queued for durable, bounded delivery, so a successful live-send action may mean the message is accepted for delivery rather than already present in every inbox
- teams running their own fork should rehearse `npm run setup:deploy -- --mode=production --dry-run` before launch so provider readiness, KV namespace reuse, secrets, and deploy steps are reviewed before supporters arrive

## Physical Rewards and Shipping

Physical rewards can work well, but only when they are intentional.

They add:

- inventory management
- shipping complexity
- fulfillment overhead
- real cost risk

### When physical rewards make sense

They usually make the most sense when:

- demand is real
- the item is truly on-brand
- the creator has budgeted for production and shipping
- the physical object actually adds meaning, not just clutter

### For any physical tier or add-on, provide:

- physical/digital category
- shipping preset, if it fits an existing preset
- or explicit shipping metadata:
  - weight
  - dimensions
  - any handling notes
- inventory count
- variant list, if applicable
- per-variant inventory, if applicable
- realistic expected availability and delivery timing
- whether the item is eligible for free shipping
- whether it needs a campaign-specific flat shipping override
- whether it can use the deployment fallback shipping rate if USPS is unavailable
- whether domestic signature or adult-signature delivery options should be offered
- fulfillment owner and shipping-from constraints
- accurate sizing, fit, materials, included-item, final-sale, and fulfillment-problem copy

### Physical reward guidance

- lower-cost physical rewards should be simple and inexpensive to fulfill
- envelope-friendly items are much easier to justify than bulky items
- shipping and manufacturing cost must be priced in
- physical tiers work best when paired with a digital reward layer so supporters receive something sooner
- charged rewards are final sale by default, with no returns or exchanges for change of mind, preference, fit, or sizing
- damaged, defective, incorrect, or missing items still require a real remedy process; supporters are asked to report problems promptly and ordinarily within seven calendar days after carrier-marked delivery
- delivery and availability dates are good-faith estimates, not guarantees, but material schedule or fulfillment changes must be communicated honestly

### Shipping model creators should understand

Shipping is calculated by the Worker, not by hand in the browser.

The current platform can support:

- USPS-backed live shipping quotes
- configured fallback flat rates when USPS is unavailable or returns no usable rate
- campaign-specific flat-rate overrides
- manual preset rates for simple envelope-friendly items
- deployment-wide free-shipping defaults
- item-level or campaign-level free-shipping decisions
- domestic delivery upgrades when configured, such as signature-required options

The important planning rule:

> Do not promise a shipping price in campaign copy unless the campaign configuration actually enforces it.

If a creator wants free shipping, that should be explicit during setup. If the campaign should use carrier-rated shipping, the item weights, dimensions, origin, and destination assumptions need to be complete enough for a reliable quote.

Review the public [Shipping policy](/terms/#shipping-policy) and [No returns, fulfillment problems, and refunds policy](/terms/#returns-refunds) before finalizing campaign copy. Campaign-specific terms may add detail, but they should not contradict the platform policy or promise remedies the fulfillment team cannot provide.

### Mixed carts and add-on shipping

In multi-item carts:

- campaign tiers and campaign add-ons follow the owning campaign's shipping rules
- physical platform add-ons use a separate platform shipment
- digital rewards and digital add-ons do not affect shipping
- saved pledge totals, Manage Pledge, emails, reports, and fulfillment exports all use the stored Worker-calculated shipping amount

## Tax and Checkout Expectations

The Pool's checkout is server-verified. The Worker rebuilds cart contents, shipping, tax, tips, add-ons, and totals before starting the Stripe payment step.

Creators do not need to calculate sales tax themselves, but they should avoid campaign copy that promises tax-inclusive pricing unless that has been configured deliberately.

Campaign copy should describe the all-or-nothing flow accurately:

- making a pledge saves a payment method; it does not charge the campaign amount immediately
- if the campaign does not reach its goal by the deadline, the campaign pledge is not charged
- if the campaign reaches its goal, the saved payment method may be charged after the campaign ends; a failed or expired card can still prevent collection
- tiers, direct/custom campaign support, support items, and campaign add-ons count toward campaign progress
- tax, shipping, platform add-ons, and optional platform tips do not count toward campaign progress
- The Pool does not deduct a platform commission from campaign funding, but Stripe processing fees and campaign expenses can still reduce the creator's net proceeds

Do not write that every pledged dollar is already collected, that supporters are charged immediately, or that the creator receives the public gross total with no processing costs.

Current tax behavior can include:

- a configured flat sales tax rate
- offline rules for broader fallback handling
- New Mexico GRT lookup support
- optional ZIP.TAX local lookup support for forks
- provisional browser display when the cart does not yet have enough destination detail

In practice:

- the cart may show tax as `--` until there is enough address information
- final checkout totals are recalculated by the Worker
- physical rewards should collect enough address detail for shipping and tax calculation
- fulfillment reports include the saved tax and shipping totals, so operators can reconcile what supporters actually paid

## Campaign Reports and Fulfillment Handoff

Campaign-runner reports help operators and creators keep pledge and fulfillment work aligned.

Creators should provide:

- campaign-runner report recipient emails
- the person or team responsible for fulfillment
- whether any platform-operated add-ons are present
- any special fulfillment notes for physical tiers or add-ons
- expected delivery timing or delivery windows
- a process and contact owner for damaged, defective, incorrect, missing, delayed, or unfulfillable rewards
- whether rewards should be grouped, split, or handled in a particular order

Report behavior to understand:

- pledge reports are a ledger/history export
- fulfillment reports are a merged current-state view per supporter and campaign
- the dashboard can preview and download pledge or fulfillment CSVs without sending email
- campaign add-ons stay with the campaign fulfillment slice
- platform add-ons are sent to the platform fulfillment slice
- modified and canceled pledge rows may appear in pledge history, while fulfillment uses current supporter state
- saved add-on variant and historical unit-price details remain part of the fulfillment record, so fulfill from the report rather than today's catalog display

## Recommended Asset Bundle for a Strong Campaign

If a creator wants a simple target package, this is a strong one:

- `1` square hero image
- `1` wide hero image
- `1` creator image
- `1` campaign pitch video
- `3 to 8` gallery or inline images
- `1` short blurb
- `1` long-form campaign description of `300 to 900 words`
- `5 to 7` tiers
- `0 to 3` support items
- `0 to 5` campaign add-ons, if fixed-price extras make sense
- `0 to 3` stretch goals
- `0 to 2` launch-ready community decisions
- report recipient emails and fulfillment owner
- expected delivery windows and a fulfillment-problem contact/process for physical rewards
- dashboard editor emails, if creators need direct campaign access
- optional preview reviewer emails for pre-launch private review
- embed/promotion destinations for launch week
- QR/referral destinations and any partner codes needed before launch
- Blast subject/body/CTA copy for the first campaign supporter email
- an explicit decision to leave the featured-reward Shopping page disabled or supply its complete physical-product and availability facts

## Delivery Recommendations

To keep implementation clean, creators should ideally deliver:

- final copy in a shared document or markdown file
- web-ready exported images
- one folder per campaign
- consistent file naming

Suggested naming patterns:

- `project-square.webp`
- `project-wide.webp`
- `creator-headshot.webp`
- `tier-poster-wide.webp`
- `gallery-01.webp`
- `gallery-02.webp`
- `campaign-pitch.webm`
- `addon-poster.webp`
- `addon-shirt.webp`

## Readiness Checklist

A campaign is usually ready when:

- the title is clear
- the short blurb is strong
- the hero visuals are clean and correctly sized
- the long-form page explains the project well
- the pitch video is concise and persuasive
- every tier is understandable at a glance
- any add-ons are clearly scoped as campaign add-ons or platform add-ons
- variant price inheritance and any per-variant overrides have been checked in the cart-facing UI
- the reward mix feels intentional
- any physical reward or add-on has shipping, inventory, variants, and fulfillment data
- physical reward timing, sizing, final-sale, and fulfillment-problem copy agrees with the public Terms
- free shipping, flat fallback, USPS quote, and campaign override expectations are explicit
- tax wording does not overpromise beyond configured checkout behavior
- campaign copy accurately explains all-or-nothing charging, campaign-progress inclusions/exclusions, and the difference between no platform commission and remaining processor/production costs
- report recipients and fulfillment owners are set
- dashboard editor access and publishing responsibility are confirmed
- preview-only campaign visibility, protected preview reviewers, and any archive/cancel decision are understood before launch
- the campaign embed has been checked for launch-promotion destinations
- QR codes download correctly and scan to the expected campaign/referral URL
- any launch or final-push Blast copy has a subject, concise body, CTA Button Label, and CTA Button URL
- share captions and the generated social preview feel appropriate for upcoming, live, funded, and ended states
- every meaningful image has useful alt text, decorative images are explicitly marked, and media-library reference/optimization warnings have been reviewed
- the featured-reward Shopping switch is off, or the selected physical tier and exact availability date pass every Shopping requirement and match campaign copy
- no section feels like placeholder copy

## Fast Creator Worksheet

If someone needs the shortest possible prep version, send them this:

### Required

- campaign title
- slug, or approval of the dashboard-derived slug before public links are shared
- creator name
- category
- funding goal
- campaign start date
- campaign end date
- short blurb
- square hero image
- wide hero image or campaign video
- at least one tier
- report recipient emails, if the creator wants campaign-runner reports
- dashboard editor emails, if the creator/team should edit directly

### Strongly recommended

- creator image
- long-form campaign description
- 5 to 7 tiers
- tier images for premium or physical rewards
- support items
- campaign add-ons for fixed-price extras or campaign merch
- stretch goals
- 3 to 8 gallery images
- campaign pitch video
- embed destinations and launch-promotion copy
- QR/referral destinations
- supporter Blast copy for launch or final-push updates
- share captions for the campaign's major states

### If anything is physical

- mark it as physical
- provide shipping preset or explicit size/weight metadata
- decide whether it is free-shipping, carrier-rated, manually flat-rated, or fallback-eligible
- provide inventory
- provide variants and per-variant inventory if relevant
- provide base/override pricing for add-on variants if relevant
- provide realistic availability and delivery timing
- confirm final-sale, sizing, and fulfillment-problem copy
- provide fulfillment owner and delivery notes
- if enabling the optional Shopping page, provide a complete featured physical tier and exact expected availability date

---

This checklist is meant to help creators deliver everything needed for a campaign that feels polished, legible, and ready to support on **The Pool**.

</article>

<nav class="creator-checklist-toc" aria-labelledby="creator-checklist-toc-title">
  <h2 id="creator-checklist-toc-title">Contents</h2>
  <ol>
    <li><a href="#current-platform-notes">Current Platform Notes</a></li>
    <li><a href="#the-short-version">The Short Version</a></li>
    <li><a href="#what-makes-a-campaign-feel-complete">What Makes a Campaign Feel Complete</a></li>
    <li><a href="#core-campaign-information">Core Campaign Information</a></li>
    <li><a href="#admin-dashboard-handoff">Admin Dashboard Handoff</a></li>
    <li><a href="#image-deliverables">Image Deliverables</a></li>
    <li><a href="#campaign-pitch-video">Campaign Pitch Video</a></li>
    <li><a href="#campaign-copy">Campaign Copy</a></li>
    <li><a href="#reward-and-tier-strategy">Reward and Tier Strategy</a></li>
    <li><a href="#support-items">Support Items</a></li>
    <li><a href="#add-on-products">Add-On Products</a></li>
    <li><a href="#optional-featured-reward-shopping-page">Optional Featured Reward Shopping Page</a></li>
    <li><a href="#stretch-goals">Stretch Goals</a></li>
    <li><a href="#community-decisions">Community Decisions</a></li>
    <li><a href="#production-diary">Production Diary</a></li>
    <li><a href="#promotion-and-embeds">Promotion and Embeds</a></li>
    <li><a href="#physical-rewards-and-shipping">Physical Rewards and Shipping</a></li>
    <li><a href="#tax-and-checkout-expectations">Tax and Checkout Expectations</a></li>
    <li><a href="#campaign-reports-and-fulfillment-handoff">Reports and Fulfillment</a></li>
    <li><a href="#recommended-asset-bundle-for-a-strong-campaign">Recommended Asset Bundle</a></li>
    <li><a href="#delivery-recommendations">Delivery Recommendations</a></li>
    <li><a href="#readiness-checklist">Readiness Checklist</a></li>
    <li><a href="#fast-creator-worksheet">Fast Creator Worksheet</a></li>
  </ol>
</nav>
</div>
