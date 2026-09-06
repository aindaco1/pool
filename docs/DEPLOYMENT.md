# Deployment

This guide owns first-time production wiring and the site/Worker release
workflow. Use [Podman](PODMAN.md) for local containers,
[Contributing](CONTRIBUTING.md) for development, and
[Merge Smoke](MERGE_SMOKE_CHECKLIST.md) for operator sign-off.

## Configure a Fork

1. Initialize the recorded submodules and install the locked dependencies as described in [Contributing](CONTRIBUTING.md).
2. Set identity, site/Worker URLs, admin seed users, and provider options in `_config.yml` using [Customization](CUSTOMIZATION.md). Keep `_config.local.yml` limited to local overrides.
3. Set the fork's Pages custom domain in `CNAME` and GitHub Pages settings, configure its DNS mapping to the GitHub Pages host, and enable HTTPS.
4. Preview the setup helper with `npm run setup:deploy -- --mode=production --dry-run`. Review its account, namespace, secret, repository, and deployment plan before applying it.
5. Configure payment and webhook credentials through [Payment Processor](PAYMENT_PROCESSOR.md), sender/domain verification through [Email](EMAIL.md), and any enabled shipping/tax provider through [Shipping](SHIPPING.md) and [Tax Calculator](TAX_CALCULATOR.md).
6. Verify [Security](SECURITY.md), [Backup and Restore](BACKUP_RESTORE.md), and the release evidence requirements before a live launch.

The setup helper lives in [`scripts/setup-deploy.mjs`](../scripts/setup-deploy.mjs).
It provides dependency-free Node setup for local and production modes. Its
fake-provider tests validate the helper's behavior; actual account provisioning
and provider readiness require separate evidence.

Worker runtime secrets belong in Cloudflare. GitHub repository secrets supply
Actions; they do not automatically become Worker secrets. Keep local signing
and provider values in ignored `worker/.dev.vars`, not a backup of production
credentials. Required KV bindings include `PLEDGES`, `VOTES`, and `RATELIMIT`;
write paths fail closed if rate-limit storage is unavailable.

## Release Workflow

Push reviewed changes to `main` to refresh the production GitHub Pages site:

```bash
git push origin main
```

Worker releases use the manually dispatched **Deploy Production** GitHub Actions
workflow with a reviewed branch, tag, or commit in its `ref` input. Both jobs
check out that input, so use an exact commit when the site and Worker must
reproduce the same immutable revision. That workflow deploys both:

- the GitHub Pages site
- the Cloudflare Worker from `worker/wrangler.toml`

Routine **Refresh Production Pages** runs, including scheduled campaign-state
refreshes, do not deploy the Worker. The manual Worker-only fallback from the
repository root is `npm run deploy:worker`.

The Pages build runs Jekyll first, then `npm run assets:minify` against generated `_site/assets` CSS/JavaScript and the generated copies of the pinned Site Shell browser scripts before uploading the artifact. The selected roots are explicit and traversal-safe; source files stay readable in the repository. Cloudflare still handles gzip/Brotli/Zstandard compression at the edge, so Cloudflare Auto Minify stays disabled.

GitHub repository credentials used by deployment and related workflows:

- `CLOUDFLARE_API_TOKEN` from a **user API token** created under **My Profile -> API Tokens**, using the **Edit Cloudflare Workers** template and scoped to this account and the `dustwave.xyz` zone. Do not use an account-owned API token; Wrangler still calls user-scoped endpoints such as memberships during deploy.
- `CLOUDFLARE_ACCOUNT_ID`
- `ADMIN_SECRET` for the post-deploy diary check
- optional `ADMIN_BROADCAST_SECRET` for the post-deploy diary check when the Worker uses scoped broadcast credentials
- optional `CLOUDFLARE_CACHE_PURGE_TOKEN` with zone cache-purge permissions if you want cache purging to use a token narrower than the deploy token. This is recommended; otherwise the deploy token must also be allowed to purge cache.
- optional `CLOUDFLARE_DNS_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, and `CLOUDFLARE_ZONE` for the Release Provider Evidence workflow. The DNS token uses read-only Zone / DNS / Read access for the production zone.
- `CLOUDFLARE_CACHE_RULES_API_TOKEN` plus `CLOUDFLARE_ZONE_ID` for applying/reconciling the path-scoped admin response rule. Use a dedicated token with Cache Rules Edit; public post-deploy verification does not need credentials.
- optional `DIARY_CHECK_BYPASS_SECRET` if Cloudflare WAF challenges the post-deploy diary check

For a guided first-time setup, run:

```bash
npm run setup:deploy -- --mode=production --dry-run
npm run setup:deploy -- --mode=production --deploy
```

Review the dry run before applying changes. The helper automates the repetitive setup but does not replace reviewing Cloudflare token scopes, GitHub repository permissions, Stripe webhook endpoints, Resend sender verification, Turnstile widgets, USPS/ZIP.TAX provider credentials, and the merge smoke checklist.

Set the matching `ADMIN_BROADCAST_SECRET` or `ADMIN_SETTLEMENT_SECRET` in Cloudflare Worker secrets before relying on scoped route enforcement in production. Add `ADMIN_SETTLEMENT_SECRET` to GitHub repository secrets only if a GitHub Actions or operator workflow actually calls settlement endpoints. Keep separate local-only values in `worker/.dev.vars`; do not copy production values there as a backup.

The workflow also needs GitHub Pages deployment permissions. Keep `pages: write` and `id-token: write` explicit on the Pages deploy job if you copy or refactor `.github/workflows/deploy.yml`.

Dashboard uploads request the separate **Optimize dashboard media** workflow.
Its optimization pull requests preserve source files; the workflow does not
deploy Worker code. See [Performance](PERFORMANCE.md#media-optimization) and
[Dashboard Media](DASHBOARD.md#media) for the media pipeline.

## Post-deploy Diary Check

If the diary check logs an HTTP `403` Cloudflare challenge page, the request is being stopped before it reaches the Worker. Add a Cloudflare WAF custom rule that skips managed challenges for:

- host equals `pledge.dustwave.xyz`
- path equals `/admin/diary/check`
- method equals `POST`
- header `X-Pool-Diary-Check` equals the `DIARY_CHECK_BYPASS_SECRET` value

Suggested expression:

```text
(http.host eq "pledge.dustwave.xyz" and http.request.method eq "POST" and http.request.uri.path eq "/admin/diary/check" and any(http.request.headers["x-pool-diary-check"][*] eq "your-bypass-secret"))
```

The Worker still requires `Authorization: Bearer ADMIN_BROADCAST_SECRET` when scoped broadcast credentials are configured, otherwise `Authorization: Bearer ADMIN_SECRET`; the bypass header only lets the GitHub Actions automation reach that authenticated endpoint.

## Verification and Artifact Boundary

Use [Testing](TESTING.md) for the local gate and
[Merge Smoke](MERGE_SMOKE_CHECKLIST.md) for the exact operator checklist and
sign-off template. Record environment, revision, required provider checks,
omissions, and results in [release evidence](release-evidence/). A local build
or workflow dispatch does not establish deployed/provider acceptance.

The public artifact excludes `docs/`, `AGENTS.md`, and `CHANGELOG.md`, alongside
README, LICENSE, tests, tooling, and generated temporary media. The root About,
Terms, Admin, and creator-checklist Markdown files remain site sources; their
localized URLs and indexing rules are verified separately from maintainer docs.
