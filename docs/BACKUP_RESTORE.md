# Pool Backup, Restore, and Recovery

This is the canonical operator runbook for Pool-owned state that cannot be recreated by a normal deploy. It covers Git history, Cloudflare KV, provider metadata, restore ordering, retention, and recovery evidence. It never treats secret values as backup content.

## Recovery policy

Pool uses these approved objectives:

| State | RPO | RTO | Notes |
| --- | --- | --- | --- |
| Git-backed campaign/config/media history | Every release | 1 hour | Git bundle plus commit/dirty-state evidence |
| Pledges, votes, admin configuration, idempotency, and operational state | 4 hours | 4 hours | Encrypted captured-value snapshot required |
| Pre-change recovery point | Immediately before a risky operation | 1 hour | Required before bulk repair, production restore, inventory reset, settlement recovery, or provider migration |

Retention is 7 daily, 5 weekly, 12 monthly, and every release snapshot. Keep at least one encrypted copy outside the primary account or device. Verify encryption and checksums before counting a snapshot as recoverable.

The machine-readable classification and policy live in [`config/pool-data-inventory.json`](../config/pool-data-inventory.json). Audit it after any new KV prefix, Durable Object, queue, idempotency marker, or payment workflow:

```bash
npm run backup:inventory:audit
```

## State boundaries

- Git is authoritative for campaigns, platform configuration, templates, media, workflows, and this runbook.
- `PLEDGES` contains pledge truth, admin configuration, campaign indexes, projections, queues, audit events, and payment/idempotency markers.
- `VOTES` contains supporter votes and published result projections.
- `RATELIMIT` and browser login/session/preview state are quarantined and are not restored normally. Privacy-minimized `admin-login-history:*` is incident evidence, not an active session, and is restored only when an incident requires it.
- Stripe remains authoritative for payment-provider objects. A Pool snapshot records identifiers and compares them read-only; it does not replace Stripe records.
- Durable Object storage is never imported. Checkout intent, scarce-tier inventory, and settlement coordination must be revalidated or rebuilt from pledge truth, campaign configuration, Stripe state, and projection checks.
- Secrets are inventory only: snapshot evidence may include configured secret names and missing/configured status, never values.

## Readiness and snapshot commands

Run the non-mutating readiness check first:

```bash
npm run backup:readiness
npm run backup:plan
```

Create a metadata-only snapshot for local evidence:

```bash
node scripts/pool-backup.mjs --output=/secure/path/pool-backup --skip-build
```

Create the production-grade encrypted captured-value snapshot:

```bash
export POOL_BACKUP_ENCRYPTION_RECIPIENT='age1...'
export POOL_BACKUP_AGE_IDENTITY='/secure/age-identity.txt'
node scripts/pool-backup.mjs \
  --output=/secure/path/pool-backup \
  --remote \
  --kv-values \
  --acknowledge-sensitive=POOL_SENSITIVE_BACKUP \
  --encryption-recipient="$POOL_BACKUP_ENCRYPTION_RECIPIENT" \
  --encryption-backend=age
```

Add `--release-snapshot` for a release recovery point. GPG is supported as an alternative encryption backend. The output path must not be inside the repository or reachable through a symlink into it.

A successful snapshot includes:

- Git commit/status/diff and a Git bundle;
- selected configuration and documentation files;
- isolated Jekyll/Worker build evidence unless explicitly skipped;
- Cloudflare deployment/resource and secret-name inventory;
- authenticated Stripe CLI endpoint metadata when available;
- KV key inventory and, only with the sensitive acknowledgement, approved family values;
- a manifest and SHA-256 checksums;
- an encrypted archive whose decryptability was verified before plaintext removal;
- a receipt that contains no credentials or customer data.

Do not commit snapshot directories, decrypted archives, manifests containing captured values, identities, or recovery credentials.

## Off-device copies and retention

Copy a verified encrypted snapshot to a separately mounted destination:

```bash
POOL_BACKUP_AGE_IDENTITY=/secure/age-identity.txt \
node scripts/pool-backup-offsite-copy.mjs \
  --source=/secure/path/pool-backup \
  --destination=/Volumes/Recovery/Pool \
  --acknowledge=POOL_BACKUP_OFF_DEVICE_COPY
```

The copy is append-only by default, rejects unsafe paths, rechecks checksums, and verifies decryption. A different filesystem is required unless an operator explicitly chooses a documented exception.

Preview retention decisions before pruning:

```bash
npm run backup:retention -- --root=/secure/path/pool-snapshots --dry-run
```

Apply only after reviewing the keep/delete set:

```bash
npm run backup:retention -- \
  --root=/secure/path/pool-snapshots \
  --acknowledge=POOL_BACKUP_RETENTION_PRUNE
```

Retention pruning operates only on checksum-valid snapshot directories under the supplied root and follows the approved 7/5/12/release policy.

### Configured off-account R2 archive

Pool's protected recovery workflow uses the private `pool-recovery-archive` bucket in a Cloudflare account separate from the production `dustwave.xyz` account. The bucket uses Standard storage and the S3-compatible endpoint configured in `POOL_RECOVERY_ARCHIVE_S3_ENDPOINT`; it has no public development URL or custom domain.

GitHub's `production-recovery` environment holds the bucket-scoped Object Read & Write credentials and `s3://pool-recovery-archive/pool-recovery` archive URI. The repository variable `POOL_RECOVERY_ARCHIVE_REGION=auto` selects R2's S3 region. Do not broaden the token to bucket-administration permissions or additional buckets.

An enabled `pool-recovery-400d` bucket-lock rule covers the `pool-recovery/` prefix for 400 days. This immutable window is deliberately longer than the 12-month minimum and prevents overwrite or deletion; it does not choose which snapshots satisfy the 7-daily/5-weekly/12-monthly/release schedule. Retention selection remains the job of Pool's snapshot/retention tooling, and every remote archive must use a unique run or release prefix.

The initial 2026-07-12 bootstrap check passed encrypted upload, list, byte-identical readback, decryption, plaintext comparison, and lock-enforced deletion rejection. That connectivity check does not replace the first encrypted captured-value release snapshot or a quarterly protected drill.

## Restore order

Use this order to minimize double-charge, duplicate-send, and projection risk:

1. Declare maintenance and stop money-affecting automation. Pause Stripe-facing settlement and scheduled settlement dispatch.
2. Capture and independently verify a pre-restore encrypted snapshot.
3. Restore or check out Git campaign/config/media history and build it.
4. Verify the snapshot manifest and checksum plan without writing provider state.
5. Restore admin configuration, then authoritative pledge truth.
6. Restore votes separately.
7. Restore approved idempotency and send-control families only after duplicate-charge/send review.
8. Rebuild campaign email/index, stats, tier inventory, add-on inventory, and result projections from authoritative truth.
9. Do not import session, login, preview-reviewer, rate-limit, pending checkout scratch, resume-token, or cron-health records.
10. Reconcile Pool pledge/payment state against Stripe with read-only credentials.
11. Verify reports, projections, admin views, checkout smoke, and observability before resuming automation.

## Planning and preview restore

Always begin with a plan:

```bash
npm run restore:plan -- --snapshot=/secure/decrypted/pool-snapshot --target=preview
```

Execute into isolated preview KV bindings, verify readback, then remove only keys owned by that snapshot:

```bash
node scripts/pool-restore.mjs --snapshot=/secure/decrypted/pool-snapshot --target=preview --execute
node scripts/pool-restore.mjs --snapshot=/secure/decrypted/pool-snapshot --target=preview --verify
node scripts/pool-restore.mjs \
  --snapshot=/secure/decrypted/pool-snapshot \
  --target=preview \
  --cleanup-preview \
  --acknowledge-preview-cleanup=POOL_PREVIEW_RESTORE_CLEANUP
```

The restore planner validates pledge keys/order IDs/statuses/campaign ownership, admin roles/emails, and vote records. Derived families become rebuild actions. Quarantined families are skipped. Admin audit and privacy-minimized login history are also skipped unless an incident-specific plan adds `--include-incident-evidence`. Durable Objects are never imported. Provider writes stop on the first failure, and verification reads back restored values in bounded batches.

## Stripe reconciliation

Use a restricted, read-only Stripe key that matches the snapshot mode:

```bash
STRIPE_SECRET_KEY="$STRIPE_RECOVERY_READ_KEY" \
npm run recovery:reconcile -- \
  --snapshot=/secure/decrypted/pool-snapshot \
  --stripe-mode=live \
  --output=/secure/evidence/pool-reconciliation.json
```

The reconciliation performs GET-only PaymentIntent reads in bounded batches. Evidence contains aggregate reason/count categories, not PaymentIntent IDs or customer data. Investigate amount, status, missing-object, or mode mismatches before any production restore or settlement resume.

## Production restore gates

A production restore is intentionally difficult. Do not proceed unless all of these are true:

- maintenance mode is active;
- Stripe-facing operations are paused;
- settlement dispatch is paused;
- inventory/projection impact was reviewed;
- the explicit overwrite conflict policy was reviewed and accepted for this snapshot;
- an independently verified, distinct pre-restore snapshot exists;
- the same snapshot passed a preview restore and readback verification;
- Stripe reconciliation was reviewed;
- the Pool owner/operator approved the recovery window.

The restore script requires the exact production acknowledgement `POOL_PRODUCTION_RESTORE` in addition to those gates. Never bypass a gate by editing the script during an incident; record the exception and create a reviewed recovery change instead.

## Automated evidence

- `.github/workflows/recovery-readiness.yml` runs weekly synthetic readiness and restore rehearsal. It contains synthetic data only and is safe to keep active.
- `.github/workflows/recovery-operations.yml` runs the quarterly low-traffic preflight. The captured-production protected drill remains disabled unless `RECOVERY_DRILL_ENABLED=true` and the `production-recovery` environment provides the age, Stripe, Cloudflare, and restricted S3-compatible archive credentials.
- GitHub-hosted Ubuntu runners provide AWS CLI v2. The protected job installs `age` through apt and verifies the hosted `aws` binary with `aws --version`; do not request the unavailable/obsolete apt `awscli` package on that runner image.
- The protected drill uploads the encrypted archive and manifest to off-account storage, downloads both, proves byte equality, decrypts, reconciles Stripe, restores to preview, verifies, and cleans up exact snapshot-owned keys.
- Escrow the age identity separately from GitHub and the archive provider before enabling captured-data drills. A private identity that exists only as a GitHub environment secret is sufficient for automation but is not an independent disaster-recovery copy.
- No workflow performs a production restore.

Generate a local synthetic rehearsal at any time:

```bash
npm run restore:rehearse -- --output=/secure/evidence/pool-restore-rehearsal.json
```

## Post-restore verification

At minimum run:

```bash
npm run backup:inventory:audit
npm run test:premerge
npm run release:pledge-evidence
npm run release:payment-smoke
./scripts/check-projections.sh
./scripts/check-observability.sh
```

Then review Campaigns, Analytics, Reports, Supporters, Users, Marketing, media, add-ons, session review, and audit search as the appropriate admin roles. Confirm no settlement or supporter-message job resumed before the restored data and provider comparison were accepted.

## Incident evidence

Record snapshot receipt hash, source commit, restore target, start/end time, operator/approver, traffic preflight, reconciliation counts, preview verification, production gate decisions, keys/families restored or rebuilt, residual mismatches, and the exact time automation resumed. Evidence must not contain secret values, full backup contents, raw provider payloads, or unnecessary customer data.
