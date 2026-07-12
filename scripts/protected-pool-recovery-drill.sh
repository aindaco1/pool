#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

required_names=(
  CLOUDFLARE_ACCOUNT_ID
  CLOUDFLARE_API_TOKEN
  POOL_BACKUP_ENCRYPTION_RECIPIENT
  POOL_BACKUP_AGE_IDENTITY
  STRIPE_RECOVERY_READ_KEY
  POOL_RECOVERY_ARCHIVE_S3_URI
)
for name in "${required_names[@]}"; do
  if [ -z "${!name:-}" ]; then
    echo "Required protected recovery input is unavailable: ${name}" >&2
    exit 1
  fi
done

if [ -z "${POOL_RECOVERY_TRAFFIC_EVIDENCE:-}" ] || [ ! -f "$POOL_RECOVERY_TRAFFIC_EVIDENCE" ]; then
  echo "Protected recovery requires a current traffic preflight artifact." >&2
  exit 1
fi
node -e '
  const fs = require("node:fs");
  const evidence = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (evidence?.traffic?.lowTraffic !== true) throw new Error("Recent production traffic exceeds the recovery threshold.");
' "$POOL_RECOVERY_TRAFFIC_EVIDENCE"

command -v age >/dev/null 2>&1 || { echo "age is required." >&2; exit 1; }
command -v aws >/dev/null 2>&1 || { echo "An S3-compatible AWS CLI client is required." >&2; exit 1; }

ARCHIVE_ACCESS_KEY_ID="${POOL_RECOVERY_ARCHIVE_ACCESS_KEY_ID:-${AWS_ACCESS_KEY_ID:-}}"
ARCHIVE_SECRET_ACCESS_KEY="${POOL_RECOVERY_ARCHIVE_SECRET_ACCESS_KEY:-${AWS_SECRET_ACCESS_KEY:-}}"
ARCHIVE_REGION="${POOL_RECOVERY_ARCHIVE_REGION:-${AWS_REGION:-us-east-1}}"
ARCHIVE_ENDPOINT="${POOL_RECOVERY_ARCHIVE_S3_ENDPOINT:-${AWS_ENDPOINT_URL:-}}"
if [ -z "$ARCHIVE_ACCESS_KEY_ID" ] || [ -z "$ARCHIVE_SECRET_ACCESS_KEY" ]; then
  echo "Protected recovery requires restricted S3-compatible archive credentials." >&2
  exit 1
fi
export AWS_ACCESS_KEY_ID="$ARCHIVE_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$ARCHIVE_SECRET_ACCESS_KEY"
export AWS_REGION="$ARCHIVE_REGION"

node -e '
  const value = String(process.argv[1] || "").trim();
  if (!/^s3:\/\/[a-z0-9][a-z0-9.-]{1,61}[a-z0-9](?:\/[A-Za-z0-9._\/-]+)?$/.test(value) || value.includes("..")) {
    throw new Error("POOL_RECOVERY_ARCHIVE_S3_URI must be a bounded S3 bucket/prefix URI.");
  }
' "$POOL_RECOVERY_ARCHIVE_S3_URI"

archive_cli_args=()
if [ -n "$ARCHIVE_ENDPOINT" ]; then
  node -e '
    const url = new URL(String(process.argv[1] || ""));
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      throw new Error("POOL_RECOVERY_ARCHIVE_S3_ENDPOINT must be a credential-free HTTPS origin.");
    }
  ' "$ARCHIVE_ENDPOINT"
  archive_cli_args+=(--endpoint-url "$ARCHIVE_ENDPOINT")
fi

WORK_DIR="$(mktemp -d "${RUNNER_TEMP:-/tmp}/pool-protected-recovery.XXXXXX")"
IDENTITY_FILE="${WORK_DIR}/age-identity.txt"
ENCRYPTED_DIR="${POOL_RECOVERY_ENCRYPTED_DIR:-${WORK_DIR}/encrypted}"
DECRYPTED_ARCHIVE="${WORK_DIR}/pool-backup.tar.gz"
SNAPSHOT_DIR="${WORK_DIR}/snapshot"
EVIDENCE_DIR="${POOL_RECOVERY_DRILL_EVIDENCE_DIR:-${WORK_DIR}/evidence}"
RESTORE_JSON="${WORK_DIR}/restore.json"
VERIFY_JSON="${WORK_DIR}/verify.json"
CLEANUP_JSON="${WORK_DIR}/cleanup.json"
RECONCILIATION_JSON="${EVIDENCE_DIR}/reconciliation.json"
PREVIEW_STARTED=false

cleanup() {
  status=$?
  if [ "$PREVIEW_STARTED" = true ] && [ -f "${SNAPSHOT_DIR}/manifest.json" ]; then
    node scripts/pool-restore.mjs --snapshot="$SNAPSHOT_DIR" --target=preview --cleanup-preview \
      --acknowledge-preview-cleanup=POOL_PREVIEW_RESTORE_CLEANUP >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK_DIR" "${ENCRYPTED_DIR}.staging-"*
  return "$status"
}
trap cleanup EXIT

mkdir -p "$SNAPSHOT_DIR" "$EVIDENCE_DIR"
printf '%s\n' "$POOL_BACKUP_AGE_IDENTITY" > "$IDENTITY_FILE"
chmod 600 "$IDENTITY_FILE"
started_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
started_epoch="$(date +%s)"

POOL_BACKUP_AGE_IDENTITY="$IDENTITY_FILE" node scripts/pool-backup.mjs \
  --output="$ENCRYPTED_DIR" --remote --kv-values --release-snapshot --skip-build \
  --acknowledge-sensitive=POOL_SENSITIVE_BACKUP \
  --encryption-recipient="$POOL_BACKUP_ENCRYPTION_RECIPIENT" --encryption-backend=age

archive_key="${GITHUB_RUN_ID:-manual}-${started_at//[:]/-}"
archive_uri="${POOL_RECOVERY_ARCHIVE_S3_URI%/}/${archive_key}"
aws "${archive_cli_args[@]}" s3 cp "${ENCRYPTED_DIR}/pool-backup.tar.gz.age" "${archive_uri}/pool-backup.tar.gz.age" --only-show-errors
aws "${archive_cli_args[@]}" s3 cp "${ENCRYPTED_DIR}/manifest.json" "${archive_uri}/manifest.json" --only-show-errors
aws "${archive_cli_args[@]}" s3 ls "${archive_uri}/pool-backup.tar.gz.age" >/dev/null
aws "${archive_cli_args[@]}" s3 ls "${archive_uri}/manifest.json" >/dev/null
aws "${archive_cli_args[@]}" s3 cp "${archive_uri}/pool-backup.tar.gz.age" "${WORK_DIR}/off-account-readback.tar.gz.age" --only-show-errors
aws "${archive_cli_args[@]}" s3 cp "${archive_uri}/manifest.json" "${WORK_DIR}/off-account-readback-manifest.json" --only-show-errors
cmp --silent "${ENCRYPTED_DIR}/pool-backup.tar.gz.age" "${WORK_DIR}/off-account-readback.tar.gz.age" || {
  echo "Off-account encrypted archive readback did not match the uploaded snapshot." >&2
  exit 1
}
cmp --silent "${ENCRYPTED_DIR}/manifest.json" "${WORK_DIR}/off-account-readback-manifest.json" || {
  echo "Off-account manifest readback did not match the uploaded receipt." >&2
  exit 1
}

age --decrypt --identity "$IDENTITY_FILE" --output "$DECRYPTED_ARCHIVE" "${ENCRYPTED_DIR}/pool-backup.tar.gz.age"
tar -xzf "$DECRYPTED_ARCHIVE" -C "$SNAPSHOT_DIR"

STRIPE_SECRET_KEY="$STRIPE_RECOVERY_READ_KEY" node scripts/pool-recovery-reconciliation.mjs \
  --snapshot="$SNAPSHOT_DIR" --stripe-mode=live --output="$RECONCILIATION_JSON"

PREVIEW_STARTED=true
node scripts/pool-restore.mjs --snapshot="$SNAPSHOT_DIR" --target=preview --execute > "$RESTORE_JSON"
node scripts/pool-restore.mjs --snapshot="$SNAPSHOT_DIR" --target=preview --verify > "$VERIFY_JSON"
node scripts/pool-restore.mjs --snapshot="$SNAPSHOT_DIR" --target=preview --cleanup-preview \
  --acknowledge-preview-cleanup=POOL_PREVIEW_RESTORE_CLEANUP > "$CLEANUP_JSON"
PREVIEW_STARTED=false

completed_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
completed_epoch="$(date +%s)"
node -e '
  const fs = require("node:fs");
  const receipt = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const reconciliation = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const evidence = {
    schemaVersion: 1,
    startedAt: process.argv[3], completedAt: process.argv[4], durationSeconds: Number(process.argv[5]),
    target: "preview", productionWrites: false,
    sourceArchiveSha256: receipt.archiveSha256 || "",
    stripeProviderComparisonOk: reconciliation.ok === true,
    stripeMismatchCounts: reconciliation.mismatches || {},
    restoredPledgesCompared: reconciliation.snapshot?.pledgeCount || 0,
    offAccountArchiveVerified: true, offAccountReadbackVerified: true,
    containsCredentials: false, containsCustomerData: false
  };
  fs.writeFileSync(process.argv[6], `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
' "${ENCRYPTED_DIR}/manifest.json" "$RECONCILIATION_JSON" "$started_at" "$completed_at" \
  "$((completed_epoch - started_epoch))" "${EVIDENCE_DIR}/recovery-drill.json"

echo "Protected Pool recovery drill completed against isolated preview KV targets."
