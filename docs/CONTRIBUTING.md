# Contributing to The Pool

This guide covers onboarding, the contribution workflow, and shared development
patterns. Start with [AGENTS](../AGENTS.md) and the
[documentation index](README.md) to identify the guide that owns your change.

## Development Setup

Use the Node version in [.nvmrc](../.nvmrc), Git, and Podman for the standard
local path. Host Jekyll additionally needs Ruby and Bundler; Stripe CLI is
optional for real test-mode webhook forwarding.

From the repository root:

```bash
git submodule update --init --recursive
npm ci
npm run setup:deploy -- --mode=local
npm run podman:doctor
./scripts/dev.sh --podman
```

See [Podman](PODMAN.md) for container setup, supported hosts, service supervision,
resource requirements, and logs. Use [Testing](TESTING.md) for fixture seeding,
manual checkout, and browser tests; the automated browser harness serves a
built static site.

`npm run secrets:dev` creates/updates ignored `worker/.dev.vars` from the example,
generates local signing/session secrets, and prompts for optional provider
keys without printing them. Local admin bootstrap access uses
`ADMIN_BOOTSTRAP_EMAILS`; the dashboard shows credential status only.
[Security](SECURITY.md) defines secret boundaries, and
[Deployment](DEPLOYMENT.md) owns hosted account/namespace setup.

Canonical settings belong in `_config.yml`. `_config.local.yml` carries only
local overrides. Supported dev/test scripts synchronize `worker/wrangler.toml`;
after direct configuration changes, restart the stack or run
`npm run sync:worker-config`. See [Customization](CUSTOMIZATION.md).

### Host Fallback

Install the locked host dependencies from the repository root:

```bash
bundle install
npm ci --prefix worker
```

Then use the existing launcher:

```bash
./scripts/dev.sh
```

For manual service startup, run these in separate terminals from the repository root:

```bash
bundle exec jekyll serve --config _config.yml,_config.local.yml --port 4000
```

```bash
npm --prefix worker run dev
```

Configure a single Stripe listener and its matching local webhook secret using
[Payment Processor](PAYMENT_PROCESSOR.md). Provider setup is optional for
fixture-based checks; real test-mode payments need the matching test credentials.
If styles are stale, `bundle exec jekyll clean` clears the generated site/cache.

## Contribution Workflow

1. Inspect `git status`; preserve unrelated edits and initialize the recorded shared dependencies.
2. Read the implementation, nearby tests, [Architecture](ARCHITECTURE.md), and the relevant domain guide before changing behavior.
3. Use the existing shared configuration, rendering, validation, and persistence paths.
4. Run the narrowest meaningful check, then the complete `npm run test:premerge` gate for substantial or release-facing changes. [Testing](TESTING.md) owns commands and [Merge Smoke](MERGE_SMOKE_CHECKLIST.md) owns operator sign-off.
5. Update the authoritative guide when behavior changes, record completed changes under Unreleased in the [Changelog](../CHANGELOG.md), and keep prospective work in the [Roadmap](ROADMAP.md).
6. Open a focused PR using the [PR template](PULL_REQUEST_TEMPLATE.md), with relevant validation and rollback information.

Use `feat/`, `fix/`, or `docs/` branch names and conventional commit prefixes
such as `feat`, `fix`, `docs`, `chore`, or `infra`. Link related issues.
Include rendered screenshots for UI changes, including desktop/tablet/mobile
and Spanish admin views when those surfaces change.

Review [Ethical Risk](ETHICAL_RISK.md) for changes to money, supporter data,
messaging, analytics, admin power, visibility, or automation. Dashboard work
also requires the relevant [Accessibility](ACCESSIBILITY.md), [I18N](I18N.md),
[Security](SECURITY.md), and [SEO](SEO.md) contracts.

## Development Patterns

Theme and email/checkout branding use the `design.*` / `platform.*` surface in
[Customization](CUSTOMIZATION.md). Jekyll compiles `assets/main.scss` and the
Pool partials under `assets/partials/` plus the pinned Platform design styles; add styles to the existing
component or page partial. Font stylesheets load from the document head.
Generated asset minification belongs to [Performance](PERFORMANCE.md).

### Liquid Includes and Collections

Inside an include, read passed values through `include`, for example
`{{ include.pledged }}` for `{% include progress.html pledged=campaign.pledged_amount %}`.
An empty YAML array is truthy in Liquid; use a size check:

```liquid
{% if page.support_items and page.support_items.size > 0 %}
  <!-- Render the collection -->
{% endif %}
```

Quote YAML strings containing special characters and guard division by zero
before computing progress. [Content Model](CONTENT_MODEL.md) owns campaign
field examples and countdown boundaries.

### Cart and Mobile Layers

Shared UI talks to `window.PoolCartProvider` through the existing cart runtime
includes and scripts. Stripe owns the payment iframe. Do not introduce a second
cart path or hosted-cart DOM patches.

The mobile menu toggle gains elevated stacking only while `.is-open`; its
closed state must remain underneath the cart overlay. Reuse `_includes/header.html` and the pinned Platform
`shared/dust-wave-platform/packages/design-core/styles/_layout.scss` pattern
when changing navigation or dialogs. Shared code upgrades follow the immutable
Platform boundary; do not patch the submodule in place.

### Accessibility and Localization Helpers

Use `.sr-only` for supporting text, labeled controls, decorative SVG state,
and the existing live regions/focus behavior. `_includes/a11y.html` supplies
`sr-text` and `external-link` patterns. Meaningful images require alt text;
intentional decorative images use the explicit decorative state.

Shared strings use `_includes/t.html`, with interpolation and locale fallback.
Public links use the locale helpers; token/query/hash preservation is part of
those helpers' contract. See [Accessibility](ACCESSIBILITY.md) and
[I18N](I18N.md) for the maintained behavior and verification requirements.
