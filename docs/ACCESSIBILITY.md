# Accessibility

This document describes The Pool's current accessibility baseline, the
higher-risk interaction surfaces covered by automated or manual verification,
and the constraints applied to interface changes.

## Current Priorities

The current accessibility priorities are:

- preserve the site's established UI patterns and visual language
- improve ARIA semantics and keyboard behavior on interactive surfaces
- avoid introducing security regressions, especially around the on-site Stripe checkout flow
- add automated checks for critical journeys instead of relying only on manual review
- review how changes affect different user groups, including localized users, keyboard-only users, screen-reader users, mobile users, and supporters under time or money pressure

## Current Baseline

The site already includes:

- skip-link support
- ARIA landmarks (`main`, `contentinfo`, live regions where appropriate)
- visible focus states through the existing design system
- screen-reader helper utilities
- stable `main-content` anchors on the main public shells so skip links and keyboard focus land consistently
- cart trigger labeling that reflects both item count and displayed total for assistive technology instead of exposing only icon chrome

The current interface includes:

- dialog semantics, Escape handling, focus trapping, and focus restore attempts for:
  - the cart / checkout sidecar
  - the Manage Pledge confirm modal
  - the `Update Card` modal
- better field-to-error relationships in the on-site checkout and `Update Card` flows
- APG-style keyboard tab behavior for:
  - production diary tabs
  - production phase tabs
- hash-linked diary panels activate their matching tab before scrolling, so links into hidden diary phases remain reachable for keyboard and assistive-technology users
- keyboard-friendly carousel gallery behavior on public campaign pages:
  - focusable scroll regions
  - ArrowLeft / ArrowRight navigation
  - Home / End scroll shortcuts
- stronger slider semantics for platform tip controls:
  - descriptive labels
  - `aria-describedby`
  - dynamic `aria-valuetext`
- live-region and alert semantics for key status/error surfaces
- safer small-screen affordances for mobile-heavy flows:
  - larger close/remove tap targets in the cart sidecar
  - safe-area-aware cart and nav overlays
  - better wrapping behavior for localized action text and summary rows
- campaign-page semantics and keyboard polish for:
  - focus handoff from the mobile support CTA into the tiers section
  - screen-reader countdown status text that mirrors the visual timer state
  - clearer hero-video grouping and loading semantics
  - icon-only campaign share links with localized accessible names, hidden decorative icon images, below-blurb placement on mobile/tablet, and sidebar placement on desktop
  - upcoming-campaign launch reminder forms with real email labels, keyboard-friendly submit behavior, Turnstile rendered only when configured, and polite status announcements
  - safer small-screen wrapping for countdown tiles, creator metadata, and community teaser actions
- admin-dashboard semantics and keyboard polish for:
  - shared field labels whose help buttons are not nested inside labels
  - field help text connected to editable controls with `aria-describedby`
  - legend-backed checkbox groups for shipping options and admin campaign access
  - APG-style top-level, settings-section, campaign, and campaign-subtab navigation
  - WYSIWYG content-editor chrome that is only keyboard-reachable when the relevant block is active
  - content-editor media upload controls with labeled native file inputs, visible focus on the styled upload button, upload status regions, and browser-local previews before publish
  - gallery image caption settings that reuse the shared label/help pattern and expose the hover-caption editor as a labeled rich-text textbox
  - media-library search plus image/video/audio filters implemented as an accessible tablist, with selected state, keyboard-reachable metadata/reference details, and named repair/replace actions
  - required alt text for meaningful content images and an explicit decorative-image control that disables and clears alt text instead of treating a blank field as an authoring shortcut
  - Settings -> Plan usage provider headings that reuse the shared admin label/help pattern, polite loading status, accessible progressbar text, and responsive metric cards
  - Create new campaign and protected Preview dialogs that reuse the shared admin label/help/info-button pattern, native fields, email-list token input, dialog focus handling, and polite status messaging
  - sortable data tables that expose `aria-sort` state and sort buttons
  - reload restoration for the last allowed top-level tab, Settings section, selected Campaigns campaign, and Campaigns subtab while keeping APG tab roles, `aria-selected`, and roving `tabindex` in sync

## Critical Surfaces

The most important accessibility-sensitive UI in the app is:

1. Cart / checkout sidecar
2. Manage Pledge confirm modal
3. Manage Pledge `Update Card` modal
4. Campaign phase tabs and diary tabs
5. Platform tip sliders
6. Public campaign-page media and long-form content blocks
7. Upcoming-campaign launch reminder forms
8. Admin dashboard settings, campaign editors, content editors, reports, analytics, supporters, and marketing tools

These surfaces matter most because they combine custom UI, dynamic state changes, and high-value user actions.

## Guardrails

Accessibility changes must preserve these constraints:

- do not move payment fields out of Stripe-owned secure UI just to gain styling or semantics control
- do not add long-lived browser persistence for accessibility state
- do not weaken CSP or checkout hardening to support convenience behavior
- prefer native elements and low-risk semantic improvements over custom widgets
- avoid interaction patterns that pressure users into pledging, tipping, accepting reminders, or sharing before they understand cost, consent, and state

## Admin Dashboard Model

The admin dashboard has enough custom UI that it needs its own accessibility rules:

- Use the shared admin label/help pattern for new fields. Help buttons must sit beside labels, not inside labels, and the editable control references the help tooltip with `aria-describedby`.
- Use native controls for text, date/time, select menus, file uploads, checkboxes, and buttons unless a custom control is clearly necessary.
- Checkbox groups must have a real `legend`; visually repeated labels can use `sr-only` legends when the visible label already appears above the group.
- Top-level tabs, Settings sidebar tabs, Campaign sidebar tabs, and Campaign subtabs keep `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `aria-controls`, and roving `tabindex` behavior in sync.
- Content-editor blocks expose editable text as `role="textbox"` with clear labels, `aria-multiline` where appropriate, and formatting buttons with `aria-pressed` when they represent toggle state.
- Hidden content-editor chrome must not remain in the keyboard tab order. A block's toolbar becomes reachable only after that block is active.
- Media settings panels expose expanded/collapsed state from the gear button and a labeled group for the revealed settings.
- Content-editor media uploads use the shared upload control pattern so the native file input has an accessible name, an upload-status description, and the same focus treatment as other dashboard upload buttons.
- Gallery block settings and individual gallery-image settings stay visually and semantically distinct, while both reuse the shared admin field label/help components.
- Generated derivatives do not appear as duplicate picker choices; source cards expose derivative status in text so assistive-technology users receive the same optimization context as thumbnail users.
- Sortable admin tables use real buttons in column headers, maintain `aria-sort`, and keep export buttons outside horizontally scrollable table regions.
- Save/Publish status messages use polite status regions; validation or blocking errors remain near the relevant field or workflow.
- Create/Preview modal fields use the same shared admin info-button/help implementation as Settings and Campaign fields; one-off inline help can clip against modal edges and is not used.
- Keyboard focus outlines use the shared black focus token, including admin modal fields and email-list inputs.

## Automated Coverage

Current automated accessibility-related coverage includes:

- unit coverage for dialog semantics and keyboard handling in:
  - `tests/unit/cart-provider.test.ts`
  - `tests/unit/manage-page.test.ts`
- unit coverage for public-shell skip links and main landmarks in:
  - `tests/unit/layout-accessibility.test.ts`
- unit coverage for cart-trigger accessible labels and expanded state in:
  - `tests/unit/cart-icon.test.ts`
- unit coverage for keyboard tabs in:
  - `tests/unit/diary-tabs.test.ts`
  - `tests/unit/campaign-tabs.test.ts`
- axe-backed critical-surface checks in:
  - `tests/unit/accessibility-critical-surfaces.test.ts`
- campaign-page semantics checks in:
  - `tests/unit/campaign-page.test.ts`
  - this includes launch reminder submission/status behavior and campaign-page share/control semantics
- broader public-page axe coverage in:
  - `tests/e2e/accessibility-public-pages.spec.ts`
  - this currently covers:
    - the home page
    - a live campaign page
    - a non-live campaign page
    - a post campaign page
    - a physical-item campaign page
    - a long-form community-heavy campaign page
    - the About page
    - the Terms page
    - the pledge-success page
    - the pledge-cancelled page
    - the community index page
    - the supporter-community denied page
    - the supporter-community content page
  - the Podman-backed public-page accessibility sweep is the preferred final check when branches change public content, docs-backed public pages, or campaign-page chrome without needing host Bundler/Jekyll
- ARIA snapshot coverage in Playwright for:
  - key public-page main regions
  - the cart / checkout dialog during keyboard-only flows
  - these assertions help lock in the accessibility tree structure that assistive technologies consume
- keyboard-only checkout assertions in:
  - `tests/e2e/campaign-checkout.spec.ts`
  - these verify the first-party checkout path can be advanced by keyboard through the on-site save step
- keyboard-only manage-flow assertions in:
  - `tests/e2e/manage-flows.spec.ts`
  - these verify pledge modification, cancellation, and payment-method update remain usable without pointer input
- keyboard-only supporter-community assertions in:
  - `tests/e2e/community-flows.spec.ts`
  - these verify the denied-state CTA, supporter back navigation, and voting remain usable without pointer input
- keyboard-only secondary public-page control assertions in:
  - `tests/e2e/public-page-controls.spec.ts`
  - these verify diary-tab navigation, carousel-gallery navigation, custom-amount entry, support-item entry, and supporter-community teaser activation remain usable without pointer input
- admin-dashboard keyboard, axe, and semantics assertions in:
  - `tests/e2e/admin-dashboard.spec.ts`
  - this covers admin sign-in, role-gated tabs, settings-section tabs, campaign subtabs, shared field help, create/preview dialogs, user campaign checkbox groups, WYSIWYG editor chrome, media settings panels, staged media-upload status/ARIA, gallery caption help, sortable data surfaces, and Spanish admin route loading

Run the focused accessibility slice with:

```bash
./node_modules/.bin/vitest run \
  tests/unit/accessibility-critical-surfaces.test.ts \
  tests/unit/cart-provider.test.ts \
  tests/unit/manage-page.test.ts \
  tests/unit/campaign-page.test.ts \
  tests/unit/diary-tabs.test.ts \
  tests/unit/campaign-tabs.test.ts
```

For the broader local gate, use:

```bash
./scripts/pre-merge-regression.sh
```

For the broader browser accessibility slice, use:

```bash
./scripts/podman-playwright-run.sh npx playwright test \
  tests/e2e/accessibility-public-pages.spec.ts \
  tests/e2e/manage-flows.spec.ts \
  tests/e2e/community-flows.spec.ts \
  tests/e2e/public-page-controls.spec.ts \
  tests/e2e/campaign-checkout.spec.ts \
  --project=chromium \
  --grep "Public Page Accessibility|keyboard-only|Community Flows|Public Page Keyboard Controls"
```

For the narrower Podman-backed public-page accessibility sweep that avoids host Bundler/Jekyll setup, use:

```bash
npm run test:e2e:headless:podman -- tests/e2e/accessibility-public-pages.spec.ts --project=chromium
```

For the Podman-backed admin-dashboard accessibility and interaction sweep, use:

```bash
npm run test:e2e:headless:podman -- tests/e2e/admin-dashboard.spec.ts --project=chromium
```

For the recommended local-dev stack, prefer:

```bash
npm run podman:doctor
./scripts/dev.sh --podman
```

## Manual Checks

Automated accessibility, locale, and rendered-page checks are release gates.
Manual VoiceOver/NVDA evidence remains optional unless a release explicitly
requires it; when performed, use these checks for meaningful UI changes:

- cart drawer can be opened, navigated, and closed with keyboard only
- cart trigger announces a useful label and expanded/collapsed state to assistive technology
- checkout sidecar keeps focus behavior stable while Stripe mounts and validates fields
- `Update Card` modal is usable with keyboard only
- tabbed campaign interfaces respond correctly to keyboard navigation
- secondary campaign-page controls like diary tabs and carousel galleries remain usable with keyboard only
- public campaign widgets like custom amounts, support items, and supporter-community teasers remain usable with keyboard only
- launch reminder email fields, submit buttons, Turnstile widgets, and status messages remain usable without pointer-only assumptions
- campaign share links have useful accessible names even though the visible UI is icon-only
- carousel galleries remain keyboard-focusable and scroll correctly with arrow keys and Home / End
- tip sliders remain usable with repeated arrow-key adjustments
- community voting remains operable with keyboard-only interaction
- error messages are understandable and appear near the right fields
- admin dashboard tabs, Settings sidebars, Campaign sidebars, and Campaign subtabs can be traversed with keyboard only
- admin dashboard help buttons announce useful field descriptions without interfering with the field's visible label
- Create new campaign and Preview dialog fields expose the same reusable info-button/help behavior and do not clip help text against modal edges
- Settings -> Plan usage announces loading status, exposes provider help, and keeps usage progress bars understandable when a provider returns only limits or unlimited quotas
- WYSIWYG editor block controls are not reachable while hidden and become reachable after the block is focused or activated
- admin dashboard table sorting and CSV export flows are operable with keyboard only

## Accepted Limits

Some accessibility limits are inherent to the security model:

- credit-card fields are rendered inside Stripe-owned secure UI
- browser autofill and field-level semantics inside Stripe iframes are partly controlled by Stripe, not The Pool
- we can improve the surrounding labels, flow, and error handling, but we cannot directly rewrite Stripe's internal DOM

Prospective accessibility work is tracked in the [Roadmap](./ROADMAP.md).
