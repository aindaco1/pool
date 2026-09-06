# Documentation

Use this index to find the guide that owns a task. The root
[README](../README.md) introduces The Pool; these guides describe its current
implementation and operating procedures.

## Start Here

| Task | Guide |
| --- | --- |
| Understand ownership, storage, and the pledge lifecycle | [Architecture](ARCHITECTURE.md) |
| Set up development and contribute changes | [Contributing](CONTRIBUTING.md) |
| Run the local site and Worker in containers | [Podman](PODMAN.md) |
| Configure a fork | [Customization](CUSTOMIZATION.md) |
| Prepare or release a deployment | [Deployment](DEPLOYMENT.md) |
| Find repository-wide operating rules | [AGENTS](../AGENTS.md) |

## Create and Operate Campaigns

| Task | Guide |
| --- | --- |
| Prepare creator copy, media, rewards, and fulfillment | [Creator checklist](../creator-campaign-checklist.md) / [Spanish](../es/creator-campaign-checklist.md) |
| Edit campaigns and manage platform operations | [Dashboard](DASHBOARD.md) |
| Understand campaign Markdown and structured fields | [Content model](CONTENT_MODEL.md) |
| Configure campaign/platform add-ons and variants | [Add-on products](ADD_ON_PRODUCTS.md) |
| Configure shipping, packing, and quote fallback | [Shipping](SHIPPING.md) |
| Configure tax providers and canonical quotes | [Tax calculator](TAX_CALCULATOR.md) |
| Operate checkout, Stripe webhooks, settlement, and payment recovery | [Payment processor](PAYMENT_PROCESSOR.md) |
| Configure senders, consent, suppression, and delivery | [Email](EMAIL.md) |
| Export pledge history and fulfillment rows | [Dashboard reports](DASHBOARD.md#reports) |
| Back up, restore, and reconcile durable state | [Backup and restore](BACKUP_RESTORE.md) |

## Develop and Verify

| Task | Guide |
| --- | --- |
| Work on Worker routes and request/response contracts | [Worker API](WORKER_API.md), [Worker entry point](../worker/README.md) |
| Run automated tests and local verification | [Testing](TESTING.md) |
| Complete operator checks and record release sign-off | [Merge smoke checklist](MERGE_SMOKE_CHECKLIST.md) |
| Prepare a pull request | [PR template](PULL_REQUEST_TEMPLATE.md) |
| Review security boundaries and credentials | [Security](SECURITY.md) |
| Review money, data, messaging, automation, and admin power | [Ethical risk](ETHICAL_RISK.md) |
| Maintain keyboard, assistive-technology, and responsive behavior | [Accessibility](ACCESSIBILITY.md) |
| Maintain translations and localized routes | [Internationalization](I18N.md) |
| Measure rendering, runtime, caching, and hosting capacity | [Performance](PERFORMANCE.md) |
| Maintain metadata, crawl rules, and share previews | [SEO](SEO.md) |
| Maintain hosted campaign widgets | [Embeds](EMBEDS.md) |
| Capture and render local product-demo media | [Product video workflow](PRODUCT_VIDEO_WORKFLOW.md) |

## History and Prospective Work

- [Changelog](../CHANGELOG.md): completed releases and changes under Unreleased.
- [Release evidence](release-evidence/): dated validation records with environment and provider limitations.
- [Roadmap](ROADMAP.md): prospective work, without implying implementation or release acceptance.

## Documentation Ownership

Keep detailed procedures in the guide that owns them. Other guides can explain
how a feature fits their audience's task and link to the authoritative procedure.
The root README and Worker README are entry points, not parallel runbooks.

Architecture owns system relationships; Content Model owns authoring fields;
Worker API owns endpoint contracts. Customization owns canonical settings and
mirrors. Provider setup belongs in Payment Processor, Tax Calculator, Shipping,
and Email. Deployment owns release wiring, Testing owns test execution, and
Merge Smoke owns operator sign-off.

Maintain links when moving sections, including heading anchors. Preserve
historical release evidence as history; put new proposals only in the roadmap.
README, LICENSE, AGENTS, and CHANGELOG stay at repository root. Component and
shared-submodule READMEs stay beside their code.

The root About, Terms, Admin, and creator-checklist Markdown files are Jekyll
page sources, with localized counterparts. Keep their public URL, locale, and
indexing contracts when editing them. Maintainer docs, AGENTS, and CHANGELOG
are excluded from the public Jekyll artifact in [_config.yml](../_config.yml).
