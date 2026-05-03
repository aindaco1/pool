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
- Worker dev image based on Node 24, matching the GitHub Actions deployment runtime
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
- same structured config model, with `_config.local.yml` kept intentionally thin for machine-local overrides

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

More specifically, the self-check covers:

- `npm run podman:doctor`
- `./scripts/dev.sh --podman`
- `./scripts/test-worker.sh --podman`
- `npm run test:e2e:headless:podman`

The broader merge gate additionally runs `./scripts/smoke-pledge-management.sh --podman` so the mutable modify/cancel path still gets isolated stateful coverage even when host build phases succeed.

That mutable-pledge smoke now also stays compatible with provider-driven tax setups such as `tax.provider: nm_grt`: the Worker test fixture path seeds a billing address so `/test/setup` can build a real tax-aware pledge instead of assuming flat tax.

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
- Node/Wrangler runtime assumptions such as the Worker `compatibility_date`

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
npm run test:security:podman
npm run test:e2e:headless:podman
```

Remote production report exports can also run through the worker container. Create a Cloudflare user API token with **Account / Workers KV Storage / Read** access to the account that owns the `PLEDGES` KV namespace, then store it in an ignored local env file such as `worker/.dev.vars`:

```bash
CLOUDFLARE_API_TOKEN=your-token
```

Run:

```bash
./scripts/pledge-report.sh --podman --env production --remote > ~/Desktop/pool-pledge-report.csv
./scripts/fulfillment-report.sh --podman --env production --remote > ~/Desktop/pool-fulfillment-report.csv
```

The report wrappers load Cloudflare auth from `.env`, `.env.local`, `.env.cloudflare`, and `worker/.dev.vars`, pass it into `podman exec`, and print progress to stderr so redirected CSV files remain clean.

`./scripts/test-e2e.sh --podman` is now fully automated browser coverage. The dedicated `./scripts/test-checkout.sh --podman` helper remains the manual interactive path when you specifically want to drive a real checkout in your own browser. The automated headless browser suite runs in its own Playwright container and reuses the already-running site/Worker instead of trying to boot Jekyll inside the test container.

For host-side commands that need a Podman-backed site/Worker without assuming detached stack persistence, use [`scripts/podman-stack-run.sh`](../scripts/podman-stack-run.sh). `npm run test:security:podman` uses that wrapper to boot the stack, run the security suite, and tear the stack down in one invocation.

The Worker container defaults to `node:24-bookworm-slim`. If a local Podman image pull stalls but the Playwright image is already cached, the launcher can reuse `mcr.microsoft.com/playwright:v1.57.0-noble` as a Node 24 base so development still matches the GitHub Actions Node 24 runtime.

For the host-side headless browser path, Playwright now builds a clean static `_site` and serves it with a lightweight HTTP server instead of relying on `jekyll serve`. That keeps browser regressions closer to the real published asset shape and avoids some WEBrick instability during parallel runs.

## Cross-Platform First Run

If you are setting up a fresh fork, this is the shortest recommended sequence:

```bash
npm run podman:doctor
./scripts/dev.sh --podman
npm run test:e2e:headless:podman
```

If the doctor passes and the headless Podman suite is green, you are in a good place for normal local work.

Note that the generated static site now excludes repo-internal folders like `worker/`, `scripts/`, and `tests/`, so local static verification is closer to what a fork would actually publish.

Current confidence level:

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

If the broader merge gate fails specifically at `7b. Podman mutable-pledge smoke`, first confirm the stack itself is healthy with:

```bash
npm run podman:doctor
./scripts/dev.sh --podman
./scripts/smoke-pledge-management.sh --podman
```

That sequence now exercises the same location-aware test-fixture path the merge gate relies on.

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

The doctor and launcher now also do a short stability check after startup so they do not flash green on a machine that immediately falls back into a stale connection state.

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
- Node 24 in the Worker container, matching GitHub Actions
- the same Worker compatibility date used by deployment
- the same Worker env/dev config used by the host flow
- the same first-party cart and checkout path
- the same static-build browser path used by the host headless harness

## Next Likely Steps

The safest follow-up improvements are:

- containerized/manual browser coverage beyond the automated headless suite
- Podman-aware wrappers for any remaining local helper scripts that teams want to keep inside the same launcher model
- optional declarative pod spec for teams that prefer a checked-in local environment manifest
