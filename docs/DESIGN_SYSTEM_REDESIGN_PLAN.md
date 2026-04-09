# Typography, Elements, and Layouts Redesign Plan

This document turns the roadmap redesign item into an implementation plan with a strong bias toward reuse, composability, and low-regression rollout. The goal is not a one-off visual refresh. The goal is a cleaner design system that makes future campaign, checkout, community, and management work easier to maintain.

## Goals

- move the UI toward a calmer black / white / gray visual system
- improve clarity, hierarchy, and consistency across public pages and pledge flows
- reduce duplicated styling logic in Sass partials and component-specific overrides
- preserve the current accessibility gains and avoid security regressions
- make future layout and fork customization easier by relying on shared tokens and primitives

## Non-Goals

- replacing Stripe-owned secure fields with custom card inputs
- rebuilding major product flows or changing Worker behavior
- shipping i18n or mobile work as part of the first redesign slice
- introducing a new CMS or content model

## Current-State Findings

The current Sass system already has a useful modular structure, but a lot of the visual language is still encoded directly into page/component partials instead of a small set of reusable primitives.

### Existing Strengths

- partial-based Sass architecture is already in place
- spacing scale already exists on an 8px grid
- core layout mixins already exist
- buttons, cards, forms, modals, campaign, community, and manage flows are already separated by concern

### DRY Problems To Solve

The main duplication / drift hotspots today are:

1. Typography is split between token values and component-local overrides.
- `assets/main.scss` imports `Inter` and `gambado-sans`, but type hierarchy is still scattered across partials.
- headings, button labels, helper text, and card titles frequently redefine size and weight locally.

2. Button behavior is duplicated outside the shared button partial.
- `assets/partials/_buttons.scss` defines the base `.btn` system.
- `assets/partials/_forms.scss` reimplements button behavior for `.custom-amount__btn`.
- similar visual treatments are repeated again in checkout / modal contexts.

3. Card patterns drift by context.
- campaign cards, tier cards, custom amount blocks, support item blocks, modal sections, and sidecar sections all use related but separately-defined borders, padding, and hover treatments.

4. Layout rhythm is inconsistent across public pages and pledge flows.
- header, campaign page, sidebar modules, dialogs, and public content blocks use similar spacing ideas with different concrete values.

5. Page partials carry visual-system responsibilities they should not own.
- `assets/partials/_campaign.scss`, `assets/partials/_manage.scss`, `assets/partials/_community.scss`, and `assets/partials/_cart-ui.scss` currently do a lot of primitive styling that should move lower in the stack.

## Design Direction

The redesign should lean toward:

- neutral surfaces with black / charcoal / white / light gray hierarchy
- strong type contrast without decorative noise
- fewer tinted boxes and fewer “special case” colors in default states
- clearer section framing
- a consistent input, card, and button vocabulary across:
  - campaign pages
  - cart / checkout sidecars
  - supporter community
  - Manage Pledge

Typography should feel intentional and editorial, but still practical for long-form campaign content and UI-heavy pledge flows.

## DRY Strategy

The redesign should be implemented from the bottom up:

1. **Tokens first**
- expand `assets/partials/_variables.scss` into clearer semantic tokens:
  - text colors
  - border colors
  - surface colors
  - muted / subtle states
  - type scale
  - radius scale
  - elevation scale

2. **Primitives next**
- expand `assets/partials/_mixins.scss` with reusable primitives for:
  - section/card containers
  - field shells
  - label/helper/error text
  - small/medium/large button sizing
  - content-width wrappers

3. **Component families after that**
- refactor buttons, forms, cards, modals, and cart UI to consume the same primitives
- remove repeated border/padding/hover definitions from page partials where possible

4. **Page-specific restyling last**
- only after the primitives are stable, adjust campaign/community/manage/home layouts

This ordering is important. If we start page-by-page, we will duplicate the redesign instead of systematizing it.

## Proposed Phases

### Phase 1: Foundation Tokens and Type System

Files most likely involved:

- `assets/main.scss`
- `assets/partials/_variables.scss`
- `assets/partials/_mixins.scss`
- `assets/partials/_base.scss`
- `assets/partials/_utilities.scss`

Work:

- define a semantic neutral palette instead of relying on ad hoc `lighten()` usage
- define a clearer type scale and type-role mapping:
  - display
  - page title
  - section title
  - card title
  - body
  - label
  - helper/meta
- standardize line-height and letter-spacing rules by role
- decide whether to keep the current font pair or refine the balance between expressive display text and practical body/UI text

Acceptance criteria:

- typography rules for headings, body, labels, and helper text are defined centrally
- new semantic color tokens exist for default surfaces, borders, muted text, and emphasis
- no visible UX regressions on checkout/manage surfaces

### Phase 2: Shared Elements

Files most likely involved:

- `assets/partials/_buttons.scss`
- `assets/partials/_forms.scss`
- `assets/partials/_cards.scss`
- `assets/partials/_modal.scss`
- `assets/partials/_progress.scss`
- `assets/partials/_cart-ui.scss`

Work:

- unify button variants around a shared sizing and emphasis system
- unify input/select/textarea/range shells where possible
- define one shared “section card” pattern and one shared “interactive card” pattern
- standardize label/helper/error text styling
- standardize section headers inside cards and dialogs

Acceptance criteria:

- `.custom-amount__btn` and similar button variants stop restyling base button behavior from scratch
- card-like containers across checkout/manage/public pages use shared primitives
- range, input, and select styling feel related across surfaces

### Phase 3: Public Layout Refresh

Files most likely involved:

- `assets/partials/_layout.scss`
- `assets/partials/_campaign.scss`
- `assets/partials/_cards.scss`
- `assets/partials/_content-blocks.scss`
- `index.html`
- campaign layouts/includes as needed

Work:

- redesign home page sections and campaign cards for a cleaner, calmer hierarchy
- refine campaign header, hero, blurb, sidebar, and long-form content spacing
- reduce unnecessary tinting and hover noise
- make public content blocks feel more editorial and reusable

Acceptance criteria:

- campaign cards, campaign pages, and long-form content feel like part of one system
- support-item, custom-amount, and community teaser blocks use the same element language as the rest of the site
- no layout regressions on current campaign archetypes

### Phase 4: Pledge Flow Alignment

Files most likely involved:

- `assets/partials/_cart-ui.scss`
- `assets/partials/_modal.scss`
- `assets/partials/_manage.scss`
- `assets/js/cart-provider.js`
- `assets/js/manage-page.js`
- `_layouts/manage.html`

Work:

- align cart sidecar, checkout sidecar, and manage modals to the refined element system
- reduce bespoke visual rules where shared form/card primitives can be used
- keep the current on-site Stripe flow visually integrated without trying to over-style Stripe-owned internals

Acceptance criteria:

- cart, checkout, and `Update Card` feel like the same design system
- accessibility semantics remain intact
- no regressions in save/confirm/focus behavior

### Phase 5: Cleanup and Variable-First Prep

Files most likely involved:

- all Sass partials touched above
- docs if needed

Work:

- remove dead / superseded visual rules
- reduce page-level duplication
- document the new token/primitives model
- prepare the ground for the later “variable-first” roadmap item

Acceptance criteria:

- obvious duplicated visual rules are removed
- token and primitive structure is documented well enough for future contributors
- future theming/customization work becomes easier, not harder

## Regression Guardrails

The redesign must preserve:

- current accessibility semantics and keyboard behavior
- Stripe-owned secure payment fields and current checkout security boundaries
- current pledge flow structure
- current magic-link and community flows

We should specifically regression-test:

- cart / checkout sidecars
- `Update Card`
- Manage Pledge save / cancel / modify flows
- public campaign archetypes:
  - live
  - non-live
  - post
  - physical rewards
  - long-form community-heavy

## Testing Plan

For each phase, keep using:

- focused unit tests for affected JS behavior
- targeted Playwright browser slices for public pages and keyboard flows
- full `./scripts/pre-merge-regression.sh` before merging major redesign slices

Manual spot checks should prioritize:

- home page
- campaign page desktop + mobile
- cart / checkout sidecars
- Manage Pledge
- supporter community page

## Recommended First Implementation Slice

The best first implementation slice is:

1. establish semantic neutral tokens and the new type scale
2. refactor shared button / field / card primitives
3. apply them first to:
   - campaign cards
   - custom amount / support item blocks
   - cart / checkout section cards

That gives visible progress quickly while still building the redesign on reusable foundations.

## Success Criteria

This redesign is successful if:

- the UI feels calmer, clearer, and more cohesive
- contributors can style new sections with shared primitives instead of copying old rules
- checkout/manage/public pages visually align without becoming generic
- accessibility and security posture remain at least as strong as they are now

---

Last updated: Apr 9, 2026
