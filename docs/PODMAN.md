# Podman Local Dev

This repo now includes a rootless Podman-backed local development path for the two services that usually create the most host setup churn:

- Jekyll site
- Cloudflare Worker local dev server

The goal is to make local bootstrapping easier for forks while preserving security and production-like boundaries.

## Current Scope

Included today:

- rootless Podman containers for Jekyll and the Worker
- the same local ports as the host flow:
  - `http://127.0.0.1:4000`
  - `http://127.0.0.1:8787`
- bind-mounted repo source for fast iteration without image rebuilds on normal code changes
- local Wrangler state persisted in the repo worktree
- local `worker/.dev.vars` usage, including auto-generation of `CHECKOUT_INTENT_SECRET`
- optional host Stripe CLI forwarding to the local Worker
- automatic Stripe CLI discovery from common macOS/Homebrew install paths
- automated headless Playwright execution in a dedicated Podman container
- Podman-aware checkout, E2E, worker, mutable-pledge, and local report helper scripts
- pre-merge fallback support for Jekyll build and local smoke/browser phases on machines without a working host Bundler/Jekyll toolchain

Not included yet:

- a containerized manual checkout browser step
- true host-validation for Linux and Windows in this repo thread

That is intentional. The first slice is meant to improve onboarding and local parity without risking application regressions.

## Why This Path Exists

Podman mode is designed around three priorities:

1. Security
- rootless containers only
- no privileged containers
- secrets stay in local env files, not baked into images

2. Parity
- same ports as the current host flow
- same local Worker state model via `wrangler dev`
- same local Jekyll config overlay via `_config.yml,_config.local.yml`

3. Forkability
- no host Ruby required for the happy-path app boot
- no host Wrangler required for the happy-path app boot
- source is bind-mounted, so normal code changes do not require image rebuilds

## Prerequisites

- [Podman](https://podman.io/docs/installation)
- optional: [Stripe CLI](https://stripe.com/docs/stripe-cli) if you want local webhook forwarding

## Support Matrix

| Host OS | Podman model | Current status |
|---------|--------------|----------------|
| macOS | `podman machine` VM | Host-validated on this branch. Prefer `libkrun` if `applehv` is unstable. |
| Linux | native rootless Podman | Supported by the launcher logic and self-check flow, but not host-validated in this thread. |
| Windows | `podman machine` VM | Supported by the launcher logic and self-check flow when running from a bash-capable shell, but not host-validated in this thread. |

On macOS and Windows, `./scripts/dev.sh --podman` will initialize/start the default `podman machine` when needed. On Linux, the launcher skips machine management and talks directly to the local rootless Podman engine.

If Podman on macOS comes up on the older `applehv` backend and machine startup is unstable, prefer `libkrun` in `~/.config/containers/containers.conf`:

```toml
[machine]
provider = "libkrun"
```

## Start Local Dev

Run the doctor first if you want a quick readiness check:

```bash
npm run podman:doctor
npm run podman:self-check
```

`npm run podman:self-check` is the strongest automated confidence pass on this branch. It runs the doctor, boots the Podman-backed stack, runs the worker smoke, and runs the automated Playwright suite in a container.

From the repo root:

```bash
./scripts/dev.sh --podman
```

That will:

- ensure Podman is available and rootless
- build the Jekyll and Worker dev images if needed
- create a Podman pod with the standard local ports
- mount the repo into both containers
- auto-generate `worker/.dev.vars` secrets if needed
- optionally start Stripe webhook forwarding from the host

## Rebuild Images

Normal code changes do not need an image rebuild because the repo is bind-mounted.

Rebuild when you change:

- `Containerfile.dev`
- `worker/Containerfile.dev`
- system package requirements
- dependency bootstrap assumptions

Use:

```bash
PODMAN_REBUILD=1 ./scripts/dev.sh --podman
```

## Browser Testing

The browser helper scripts can now boot against the Podman-backed stack:

```bash
./scripts/test-checkout.sh --podman
./scripts/test-e2e.sh --podman
./scripts/test-worker.sh --podman
./scripts/smoke-pledge-management.sh --podman
./scripts/pledge-report.sh --podman --local
./scripts/fulfillment-report.sh --podman --local
npm run test:e2e:headless:podman
```

`./scripts/test-e2e.sh --podman` is now fully automated browser coverage. The dedicated `./scripts/test-checkout.sh --podman` helper remains the manual interactive path when you specifically want to drive a real checkout in your own browser. The automated headless browser suite runs in its own Playwright container and reuses the already-running site/Worker instead of trying to boot Jekyll inside the test container.

## Cross-Platform First Run

If you are setting up a fresh fork, this is the shortest recommended sequence:

```bash
npm run podman:doctor
./scripts/dev.sh --podman
npm run test:e2e:headless:podman
```

If the doctor passes and the headless Podman suite is green, you are in a good place for normal local work.

Be explicit about the current confidence level:

- macOS: host-validated in this branch work
- Linux: prepared and self-checkable, but not host-validated here
- Windows: prepared and self-checkable from a bash-capable shell, but not host-validated here

The content-safety filter unit tests also know how to fall back to Podman when host Bundler/Jekyll gems are unavailable, so a missing host Ruby setup no longer breaks that part of the suite on a machine where Podman is healthy.

## Logs

If the pod is already running, inspect logs with:

```bash
podman logs -f pool-dev-site
podman logs -f pool-dev-worker
```

If `./scripts/dev.sh --podman` never gets past Podman startup, check the machine first:

```bash
podman machine inspect
podman machine stop
podman machine start
```

If the machine booted into emergency mode or got wedged during first boot, the fastest recovery is:

```bash
podman machine rm -f podman-machine-default
podman machine init --now
```

On macOS, the launcher uses the machine's forwarded Unix API socket directly once the VM is up. That avoids a class of flaky default-connection issues we saw with the packaged CLI.

On Linux, if `podman info` fails, fix the local rootless Podman session first and then rerun the doctor:

```bash
podman info
npm run podman:doctor
```

On Windows, if `podman machine` exists but the VM is stopped, use:

```bash
podman machine start podman-machine-default
npm run podman:doctor
```

## Security Notes

- Podman mode is rootless by design.
- The Worker still reads secrets from `worker/.dev.vars`; nothing secret is copied into an image.
- Stripe forwarding remains a host-side process so the browser auth flow stays familiar and explicit.

## Production-Parity Notes

Podman mode is not meant to perfectly clone Cloudflare production, but it does preserve the most important local assumptions:

- separate site and Worker processes
- local Wrangler simulation for KV / Durable Objects
- the same Worker env/dev config used by the host flow
- the same first-party cart and checkout path

## Next Likely Steps

The safest follow-up improvements are:

- containerized/manual browser coverage beyond the automated headless suite
- Podman-aware wrappers for any remaining local helper scripts that teams want to keep inside the same launcher model
- optional declarative pod spec for teams that prefer a checked-in local environment manifest
