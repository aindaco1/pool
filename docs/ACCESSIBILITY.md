# Accessibility

This document tracks The Pool's current accessibility baseline, the higher-risk interaction surfaces we actively verify, and the remaining follow-up work needed to move from "strong accessibility posture" toward fuller accessibility compliance.

## Current Priorities

The current accessibility priorities are:

- preserve the site's established UI patterns and visual language
- improve ARIA semantics and keyboard behavior on interactive surfaces
- avoid introducing security regressions, especially around the on-site Stripe checkout flow
- add automated checks for critical journeys instead of relying only on manual review

## Current Baseline

The site already includes:

- skip-link support
- ARIA landmarks (`main`, `contentinfo`, live regions where appropriate)
- visible focus states through the existing design system
- screen-reader helper utilities
- stable `main-content` anchors on the main public shells so skip links and keyboard focus land consistently
- cart trigger labeling that reflects both item count and displayed total for assistive technology instead of exposing only icon chrome

The recent accessibility hardening pass added:

- dialog semantics, Escape handling, focus trapping, and focus restore attempts for:
  - the cart / checkout sidecar
  - the Manage Pledge confirm modal
  - the `Update Card` modal
- better field-to-error relationships in the on-site checkout and `Update Card` flows
- APG-style keyboard tab behavior for:
  - production diary tabs
  - production phase tabs
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
  - safer small-screen wrapping for countdown tiles, creator metadata, and community teaser actions

## Critical Surfaces

The most important accessibility-sensitive UI in the app right now is:

1. Cart / checkout sidecar
2. Manage Pledge confirm modal
3. Manage Pledge `Update Card` modal
4. Campaign phase tabs and diary tabs
5. Platform tip sliders
6. Public campaign-page media and long-form content blocks

These surfaces matter most because they combine custom UI, dynamic state changes, and high-value user actions.

## Guardrails

Accessibility changes should preserve these constraints:

- do not move payment fields out of Stripe-owned secure UI just to gain styling or semantics control
- do not add long-lived browser persistence for accessibility state
- do not weaken CSP or checkout hardening to support convenience behavior
- prefer native elements and low-risk semantic improvements over custom widgets

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

For the recommended local-dev stack, prefer:

```bash
npm run podman:doctor
./scripts/dev.sh --podman
```

## Manual Checks

Automated checks help, but these manual accessibility checks are still important before merge for meaningful UI changes:

- cart drawer can be opened, navigated, and closed with keyboard only
- cart trigger announces a useful label and expanded/collapsed state to assistive technology
- checkout sidecar keeps focus behavior stable while Stripe mounts and validates fields
- `Update Card` modal is usable with keyboard only
- tabbed campaign interfaces respond correctly to keyboard navigation
- secondary campaign-page controls like diary tabs and carousel galleries remain usable with keyboard only
- public campaign widgets like custom amounts, support items, and supporter-community teasers remain usable with keyboard only
- carousel galleries remain keyboard-focusable and scroll correctly with arrow keys and Home / End
- tip sliders remain usable with repeated arrow-key adjustments
- community voting remains operable with keyboard-only interaction
- error messages are understandable and appear near the right fields

## Accepted Limits

Some accessibility limits are inherent to the security model:

- credit-card fields are rendered inside Stripe-owned secure UI
- browser autofill and field-level semantics inside Stripe iframes are partly controlled by Stripe, not The Pool
- we can improve the surrounding labels, flow, and error handling, but we cannot directly rewrite Stripe's internal DOM

## Follow-Up Candidates

Good next accessibility improvements include:

- manual screen-reader verification pass across cart, checkout, manage, and supporter-community flows
- keeping the public-page axe/ARIA coverage current as new top-level pages and campaign archetypes are added
- adding keyboard-only assertions alongside any new public interactive widgets as they are introduced
- keeping the i18n-aware accessibility review current as more localized public or supporter-facing copy is added

---

_Last updated: Apr 21, 2026_
