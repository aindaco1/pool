# The Pool Pledge Worker

The Worker owns canonical checkout, Stripe integration, pledge persistence,
order-scoped supporter access, email delivery, live data, administration, and
scheduled campaign settlement.

## Development

Run the complete local stack from the repository root:

```bash
npm run podman:doctor
./scripts/dev.sh --podman
```

For a Worker-only host session, run from this directory:

```bash
npm ci
npm run dev
```

The Worker npm scripts synchronize the config mirror first. Canonical settings
live in the root `_config.yml`; local differences live in `_config.local.yml`.
Local credentials and bootstrap access use ignored `.dev.vars` in this
directory. Follow [Contributing](../docs/CONTRIBUTING.md) and
[Podman](../docs/PODMAN.md) for setup and supported runtime requirements.

## Ownership and Reference

The Worker consumes immutable Platform packages for shared mechanics. Pool
retains every route, request schema, campaign/pledge model, storage policy,
credential, provider side effect, deployment, and rollback decision. The
Jekyll Template is source-upgrade tooling and is not imported by this Worker.

- [Architecture](../docs/ARCHITECTURE.md): ownership, persistence, supporter access, and scheduling.
- [Worker API](../docs/WORKER_API.md): endpoint contracts and request/response examples.
- [Customization](../docs/CUSTOMIZATION.md): site-to-Worker settings and mirrors.
- [Payment Processor](../docs/PAYMENT_PROCESSOR.md): checkout, webhooks, settlement, and reconciliation.
- [Email](../docs/EMAIL.md): sender setup, outbox, reminders, and suppression.
- [Tax](../docs/TAX_CALCULATOR.md) and [Shipping](../docs/SHIPPING.md): provider-specific configuration and quote behavior.
- [Dashboard](../docs/DASHBOARD.md): admin access, editing, reports, diagnostics, and runtime overrides.
- [Security](../docs/SECURITY.md), [Ethical Risk](../docs/ETHICAL_RISK.md), and [Backup and Restore](../docs/BACKUP_RESTORE.md): trust and recovery boundaries.
- [Testing](../docs/TESTING.md): focused checks, fixtures, and the complete gate.

## Deployment

Use the manually dispatched **Deploy Production** workflow for a coordinated
site and Worker release. Routine pushes to `main` refresh Pages through
**Refresh Production Pages** and do not deploy the Worker.
[Deployment](../docs/DEPLOYMENT.md) owns credentials, release steps, and
post-deploy diary checks. The manual Worker-only fallback, run from this
directory, is `npm run deploy`.
