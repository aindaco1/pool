# The Pool

**Dust Wave's open-source crowdfunding platform** — [pool.dustwave.xyz](https://pool.dustwave.xyz)

The current release is **v1.2.20**. Changes after that tag are recorded under
**Unreleased** in the [Changelog](CHANGELOG.md); prospective work belongs in the
[Roadmap](docs/ROADMAP.md).

The Pool combines a static Jekyll site, a first-party browser cart, and a
Cloudflare Worker for all-or-nothing creative crowdfunding. Supporters save a
card through an on-site Stripe payment step. Funded campaigns charge after
their deadline; unsuccessful campaigns do not charge. A checkout can include
multiple campaigns, each persisted and settled as a separate campaign pledge.

## Features

- Accountless pledging and order-scoped magic links to manage, cancel, or update a card.
- Worker-verified pricing, tax, shipping, optional platform tips, and limited-reward inventory.
- Physical and digital tiers, campaign and platform add-ons, variant prices, and fulfillment reports.
- Campaign timelines, stretch goals, production diaries, and supporter-only decisions.
- A private, role-scoped dashboard for campaigns, settings, products, reports, supporters, analytics, marketing, and users.
- [Project Save, protected Preview, and explicit Publish](docs/DASHBOARD.md#saving-and-publishing) for new campaigns and unpublished revisions of live campaigns.
- Localized English and Spanish public pages, supporter flows, dashboard controls, and emails.
- Consent-based launch and checkout reminders, campaign updates, and durable email delivery through Resend.
- Campaign embeds, social share cards, source-preserving media optimization, and configurable branding.
- Batched settlement, payment reconciliation, encrypted backup/recovery tooling, and executable release checks.

## Architecture

| Layer | Responsibility |
| --- | --- |
| Jekyll / GitHub Pages | Static public pages, localized routes, campaign content, and browser assets |
| Cloudflare Worker | Canonical checkout, pledge persistence, live statistics, administration, email, and scheduled settlement |
| Stripe | Secure payment fields, saved payment methods, and off-session charges |
| Git / YAML / Markdown | Reviewable platform configuration, campaigns, and media source |

The recorded gitlinks pin immutable Dust Wave Platform and Jekyll Template
revisions. Pool retains its product models, routes, storage, content,
localization, credentials, provider policy, deployment, and rollback.
See [Architecture](docs/ARCHITECTURE.md) for ownership and lifecycle details.

## Quick Start

Run from the repository root with the Node version in [.nvmrc](.nvmrc) and Podman:

```bash
git submodule update --init --recursive
npm run setup:deploy -- --mode=local
npm run podman:doctor
./scripts/dev.sh --podman
```

The site runs at `http://127.0.0.1:4000`; the Worker runs at
`http://127.0.0.1:8787`. [Podman setup](docs/PODMAN.md) covers prerequisites,
platform support, containers, and troubleshooting.
[Contributing](docs/CONTRIBUTING.md) covers dependency installation, the host
fallback, development patterns, and the contribution workflow.

Canonical fork settings live in [_config.yml](_config.yml).
[_config.local.yml](_config.local.yml) contains machine-local overrides;
Worker credentials belong in ignored `worker/.dev.vars` locally and in
Cloudflare Worker secrets when deployed. Follow
[Customization](docs/CUSTOMIZATION.md) and the provider runbooks linked there.

## Verification and Deployment

Use the narrowest relevant check while developing. The complete pre-merge gate is:

```bash
npm run test:premerge
```

[Testing](docs/TESTING.md) covers suites and local verification;
[Merge Smoke](docs/MERGE_SMOKE_CHECKLIST.md) owns operator sign-off.

Pushing reviewed changes to `main` refreshes GitHub Pages. Worker releases use
the manually dispatched **Deploy Production** workflow, which deploys both
services from the selected revision. Follow [Deployment](docs/DEPLOYMENT.md)
for setup, credentials, release steps, and post-deploy checks.

## Documentation

Start with the [documentation index](docs/README.md), organized by task and audience.
Creators preparing a launch can use the
[Campaign Creator Checklist](creator-campaign-checklist.md), also available
[in Spanish](es/creator-campaign-checklist.md).

Repository-wide change guidance lives in [AGENTS.md](AGENTS.md).
The project uses the [MIT license](LICENSE).

*🄯 Dust Wave*
