#!/bin/bash
# Generate CSV report of pledges from Cloudflare KV
#
# Usage:
#   ./scripts/pledge-report.sh [campaign-slug] [--env dev|production] [--local]
#
# Examples:
#   ./scripts/pledge-report.sh                           # All pledges, production
#   ./scripts/pledge-report.sh worst-movie-ever          # Single campaign, production
#   ./scripts/pledge-report.sh --env dev                 # All pledges, dev/preview KV
#   ./scripts/pledge-report.sh --local                   # All pledges from local Wrangler KV
#   ./scripts/pledge-report.sh hand-relations --local    # Single campaign, local KV
#
# Output to file:
#   ./scripts/pledge-report.sh worst-movie-ever > pledges.csv

set -e

USE_PODMAN=false
PODMAN_REPORT_INTERNAL="${PODMAN_REPORT_INTERNAL:-0}"
PODMAN_STARTED_BY_SCRIPT=false
ORIGINAL_ARGS=()

for arg in "$@"; do
  if [[ "$arg" == "--podman" ]]; then
    USE_PODMAN=true
    continue
  fi
  ORIGINAL_ARGS+=("$arg")
done

set -- "${ORIGINAL_ARGS[@]}"

prefer_podman_path() {
  local candidate=""
  for candidate in \
    "/opt/podman/bin" \
    "/usr/local/podman/bin" \
    "/opt/homebrew/bin" \
    "/usr/local/bin"
  do
    if [[ -x "$candidate/podman" ]]; then
      export PATH="$candidate:$PATH"
      return 0
    fi
  done
  return 1
}

cleanup() {
  if [[ "$PODMAN_STARTED_BY_SCRIPT" == "true" && -n "${DEV_PID:-}" ]]; then
    kill "$DEV_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

if [[ "$USE_PODMAN" == "true" && "$PODMAN_REPORT_INTERNAL" != "1" ]]; then
  prefer_podman_path || true

  if ! podman exec pool-dev-worker true >/dev/null 2>&1; then
    echo "📦 Starting shared Podman dev stack..." >&2
    PODMAN_REPORT_LOG="${PODMAN_REPORT_LOG:-/tmp/pool-pledge-report-podman.log}"
    ./scripts/dev.sh --podman > "$PODMAN_REPORT_LOG" 2>&1 &
    DEV_PID=$!
    PODMAN_STARTED_BY_SCRIPT=true

    echo "⏳ Waiting for Podman-backed worker..." >&2
    for _ in {1..60}; do
      if podman exec pool-dev-worker true >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done

    if ! podman exec pool-dev-worker true >/dev/null 2>&1; then
      echo "❌ Podman worker did not become ready within 60 seconds" >&2
      exit 1
    fi
  fi

  QUOTED_ARGS=""
  for arg in "${ORIGINAL_ARGS[@]}"; do
    QUOTED_ARGS+=" $(printf '%q' "$arg")"
  done

  exec podman exec pool-dev-worker bash -lc "cd /workspace && PODMAN_REPORT_INTERNAL=1 ./scripts/pledge-report.sh${QUOTED_ARGS}"
fi

# Use Node 20 if available via nvm
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use 20 >/dev/null 2>&1 || true
fi

CAMPAIGN_FILTER=""
KV_SCOPE_FLAGS=""
WRANGLER_ENV_FLAGS=""
LOCAL_PERSIST_FLAGS=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      if [[ "$2" == "dev" ]]; then
        WRANGLER_ENV_FLAGS="--env dev"
        KV_SCOPE_FLAGS="--preview"
      fi
      shift 2
      ;;
    --remote)
      KV_SCOPE_FLAGS=""
      shift
      ;;
    --local)
      KV_SCOPE_FLAGS="--local"
      LOCAL_PERSIST_FLAGS="--persist-to .wrangler/state"
      shift
      ;;
    *)
      CAMPAIGN_FILTER="$1"
      shift
      ;;
  esac
done

cd "$(dirname "$0")/../worker"

if [[ -n "${WRANGLER_BIN:-}" ]]; then
  WRANGLER_CMD=(${WRANGLER_BIN})
elif [[ -n "${MOCK_WRANGLER_DATA:-}" ]] && command -v wrangler >/dev/null 2>&1; then
  WRANGLER_CMD=(wrangler)
else
  WRANGLER_CMD=(npx wrangler)
fi

if [[ "$KV_SCOPE_FLAGS" == *"--local"* ]]; then
  echo "Fetching pledges from local Wrangler KV..." >&2
else
  echo "Fetching pledges from KV${WRANGLER_ENV_FLAGS:+ (dev preview)}..." >&2
fi

# CSV header
echo "email,campaign,items,subtotal,tip_percent,tip,tax,shipping,total,status,charged,created_at,order_id"

if [[ "$KV_SCOPE_FLAGS" == *"--local"* ]]; then
  python3 -c "
import sys, json, csv, sqlite3
from io import StringIO
from pathlib import Path

campaign_filter = '$CAMPAIGN_FILTER'
root = Path('.wrangler/state/v3')
db_paths = sorted((root / 'kv' / 'miniflare-KVNamespaceObject').glob('*.sqlite'))
blob_dirs = sorted((root / 'kv').glob('*/blobs'))

def resolve_entries():
    for db_path in db_paths:
        try:
            conn = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
        except Exception:
            continue

        def match_blob_dir(blob_id):
            for blob_dir in blob_dirs:
                if (blob_dir / blob_id).exists():
                    return blob_dir
            return None

        rows = []
        matched_blob_dir = None

        if campaign_filter:
            index_row = conn.execute(\"select blob_id from _mf_entries where key = ?\", (f'campaign-pledges:{campaign_filter}',)).fetchone()
            if index_row:
                matched_blob_dir = match_blob_dir(index_row[0])
                if matched_blob_dir is not None:
                    try:
                        order_ids = json.loads((matched_blob_dir / index_row[0]).read_text())
                    except Exception:
                        order_ids = []
                    pledge_keys = [f'pledge:{order_id}' for order_id in (order_ids or [])]
                    if pledge_keys:
                        placeholders = ','.join('?' for _ in pledge_keys)
                        rows = conn.execute(f\"select key, blob_id from _mf_entries where key in ({placeholders})\", pledge_keys).fetchall()

        if not rows:
            rows = conn.execute(\"select key, blob_id from _mf_entries where key like 'pledge:%'\").fetchall()
            if rows:
                matched_blob_dir = match_blob_dir(rows[0][1])

        conn.close()

        if not rows or matched_blob_dir is None:
            continue

        return rows, matched_blob_dir
    return [], None

rows, blob_dir = resolve_entries()
if not rows or blob_dir is None:
    print('No pledges found.', file=sys.stderr)
    sys.exit(0)

print(f'Found {len(rows)} pledges. Fetching details...', file=sys.stderr)

# Tier ID to human-readable name mapping
TIER_NAMES = {
    'frame': 'One Frame',
    'writer-credit': 'Writer Credit',
    'sound-effect': 'Sound Effect',
    'dialogue': 'Line of Dialogue',
    'prop': 'Handheld Prop',
    'costume': 'Costume',
    'character': 'Add a Character',
    'jack-does': 'Jack Does Whatever You Write',
    'language': 'Scene in Another Language',
    'act': 'Act in the Movie',
}

def get_tier_name(tier_id, fallback=''):
    return TIER_NAMES.get(tier_id, fallback or tier_id or '')

def build_items_str(tier_id, tier_qty, additional_tiers, is_negative=False, custom_amount=0):
    items = []
    tier_name = get_tier_name(tier_id)
    if tier_name:
        prefix = '-' if is_negative else ''
        if tier_qty and tier_qty > 1:
            items.append(f'{prefix}{tier_name} x{tier_qty}')
        else:
            items.append(f'{prefix}{tier_name}')
    for add_tier in (additional_tiers or []):
        add_id = add_tier.get('id', '')
        add_name = get_tier_name(add_id, add_tier.get('name'))
        add_qty = add_tier.get('qty', 1)
        if add_name:
            prefix = '-' if is_negative else ''
            if add_qty > 1:
                items.append(f'{prefix}{add_name} x{add_qty}')
            else:
                items.append(f'{prefix}{add_name}')
    if custom_amount and custom_amount > 0:
        items.append(f'Custom Support \${custom_amount:.2f}')
    return '; '.join(items) if items else ''

def write_row(email, campaign, items_str, subtotal, tip_percent, tip, tax, shipping, total, status, charged, timestamp, order_id):
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow([
        email, campaign, items_str,
        f'{subtotal:.2f}', str(tip_percent), f'{tip:.2f}', f'{tax:.2f}', f'{shipping:.2f}', f'{total:.2f}',
        status, 'yes' if charged else 'no', timestamp, order_id
    ])
    print(output.getvalue().strip())

def get_tier_counts(entry):
    counts = {}
    tier_id = entry.get('tierId')
    if tier_id:
        tier_name = get_tier_name(tier_id)
        counts[tier_name] = entry.get('tierQty', 1) or 1
    for add_tier in (entry.get('additionalTiers') or []):
        add_id = add_tier.get('id', '')
        add_name = get_tier_name(add_id, add_tier.get('name'))
        if add_name:
            counts[add_name] = add_tier.get('qty', 1) or 1
    return counts

def build_diff_items_str(old_counts, new_counts):
    items = []
    all_tiers = set(old_counts.keys()) | set(new_counts.keys())
    for tier_name in sorted(all_tiers):
        old_qty = old_counts.get(tier_name, 0)
        new_qty = new_counts.get(tier_name, 0)
        diff = new_qty - old_qty
        if diff > 0:
            items.append(f'+{tier_name} x{diff}' if diff > 1 else f'+{tier_name}')
        elif diff < 0:
            items.append(f'-{tier_name} x{abs(diff)}' if diff < -1 else f'-{tier_name}')
    return '; '.join(items) if items else ''

for key, blob_id in rows:
    blob_path = blob_dir / blob_id
    if not blob_path.exists():
        continue
    try:
        data = json.loads(blob_path.read_text())
    except Exception:
        continue

    campaign = data.get('campaignSlug', '')
    if campaign_filter and campaign != campaign_filter:
        continue

    email = data.get('email', '')
    order_id = data.get('orderId', '')
    charged = data.get('charged', False)
    history = data.get('history', [])

    if history:
        prev_counts = {}
        prev_custom = 0
        for entry in history:
            entry_type = entry.get('type', '')
            timestamp = entry.get('at', '')
            if entry_type == 'created':
                subtotal = entry.get('subtotal', 0) / 100
                tip_percent = entry.get('tipPercent', data.get('tipPercent', 0) or 0)
                tip = entry.get('tipAmount', data.get('tipAmount', 0) or 0) / 100
                tax = entry.get('tax', 0) / 100
                shipping = entry.get('shipping', 0) / 100
                total = entry.get('amount', 0) / 100
                custom_amt = entry.get('customAmount', 0) or 0
                items_str = build_items_str(entry.get('tierId'), entry.get('tierQty', 1), entry.get('additionalTiers'), custom_amount=custom_amt)
                prev_counts = get_tier_counts(entry)
                prev_custom = custom_amt
                write_row(email, campaign, items_str, subtotal, tip_percent, tip, tax, shipping, total, 'created', charged, timestamp, order_id)
            elif entry_type == 'modified':
                subtotal = entry.get('subtotalDelta', 0) / 100
                tip_percent = entry.get('tipPercent', data.get('tipPercent', 0) or 0)
                tip = entry.get('tipAmountDelta', 0) / 100
                tax = entry.get('taxDelta', 0) / 100
                shipping_delta = entry.get('shippingDelta', 0) / 100
                total = entry.get('amountDelta', 0) / 100
                new_counts = get_tier_counts(entry)
                new_custom = entry.get('customAmount', 0) or 0
                items_str = build_diff_items_str(prev_counts, new_counts)
                if new_custom != prev_custom:
                    custom_diff = new_custom - prev_custom
                    custom_str = f'+Custom Support \${custom_diff:.2f}' if custom_diff > 0 else f'-Custom Support \${abs(custom_diff):.2f}'
                    items_str = f'{items_str}; {custom_str}' if items_str else custom_str
                tip_changed = tip != 0
                tip_only_change = tip_changed and subtotal == 0 and tax == 0 and shipping_delta == 0
                if items_str:
                    if tip_changed:
                        items_str = f'(modified) {items_str}; tip updated to {tip_percent}%'
                    else:
                        items_str = f'(modified) {items_str}'
                else:
                    items_str = f'(tip updated to {tip_percent}%)' if tip_only_change else '(modified)'
                prev_counts = new_counts
                prev_custom = new_custom
                write_row(email, campaign, items_str, subtotal, tip_percent, tip, tax, shipping_delta, total, 'modified', charged, timestamp, order_id)
            elif entry_type == 'cancelled':
                subtotal = entry.get('subtotalDelta', 0) / 100
                tip_percent = entry.get('tipPercent', data.get('tipPercent', 0) or 0)
                tip = entry.get('tipAmountDelta', 0) / 100
                tax = entry.get('taxDelta', 0) / 100
                shipping_delta = entry.get('shippingDelta', 0) / 100
                total = entry.get('amountDelta', 0) / 100
                items_str = build_items_str(data.get('tierId'), data.get('tierQty', 1), data.get('additionalTiers'), is_negative=True, custom_amount=data.get('customAmount', 0) or 0)
                write_row(email, campaign, items_str, subtotal, tip_percent, tip, tax, shipping_delta, total, 'cancelled', charged, timestamp, order_id)
    else:
        pledge_status = data.get('pledgeStatus', 'unknown')
        if charged:
            status = 'charged'
        elif pledge_status == 'cancelled':
            status = 'cancelled'
        elif pledge_status == 'payment_failed':
            status = 'failed'
        elif pledge_status == 'active':
            status = 'active'
        else:
            status = pledge_status
        is_cancelled = status == 'cancelled'
        sign = -1 if is_cancelled else 1
        subtotal = sign * data.get('subtotal', data.get('amount', 0)) / 100
        tip_percent = data.get('tipPercent', 0) or 0
        tip = sign * (data.get('tipAmount', 0) or 0) / 100
        tax = sign * data.get('tax', 0) / 100
        shipping = sign * data.get('shipping', 0) / 100
        total = sign * data.get('amount', 0) / 100
        items_str = build_items_str(data.get('tierId'), data.get('tierQty', 1), data.get('additionalTiers'), is_negative=is_cancelled, custom_amount=data.get('customAmount', 0) or 0)
        write_row(email, campaign, items_str, subtotal, tip_percent, tip, tax, shipping, total, status, charged, data.get('createdAt', ''), order_id)
" 2>/dev/null
  exit 0
fi

KEYS=""

if [[ -n "$CAMPAIGN_FILTER" ]]; then
  INDEX_OUTPUT=$("${WRANGLER_CMD[@]}" kv key get "campaign-pledges:$CAMPAIGN_FILTER" --binding PLEDGES $WRANGLER_ENV_FLAGS $KV_SCOPE_FLAGS $LOCAL_PERSIST_FLAGS 2>/dev/null || true)
  if [[ -n "$INDEX_OUTPUT" ]]; then
    KEYS=$(printf "%s" "$INDEX_OUTPUT" | \
      python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for order_id in (data or []):
        print(f'pledge:{order_id}')
except Exception as e:
    print(f'Error parsing campaign index: {e}', file=sys.stderr)
    sys.exit(1)
")
  fi
fi

if [[ -z "$KEYS" ]]; then
  # Get all pledge keys
  KEY_LIST_OUTPUT=$("${WRANGLER_CMD[@]}" kv key list --binding PLEDGES --prefix "pledge:" $WRANGLER_ENV_FLAGS $KV_SCOPE_FLAGS $LOCAL_PERSIST_FLAGS 2>&1) || {
    echo "$KEY_LIST_OUTPUT" >&2
    exit 1
  }

  KEYS=$(printf "%s" "$KEY_LIST_OUTPUT" | \
    python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for item in data:
        print(item.get('name', ''))
except Exception as e:
    print(f'Error parsing keys: {e}', file=sys.stderr)
    sys.exit(1)
")
fi

if [[ -z "$KEYS" ]]; then
  echo "No pledges found." >&2
  exit 0
fi

KEY_COUNT=$(echo "$KEYS" | wc -l | tr -d ' ')
echo "Found $KEY_COUNT pledges. Fetching details..." >&2

# Fetch each pledge and output as CSV row
PROCESSED=0
echo "$KEYS" | while read -r KEY; do
  if [[ -z "$KEY" ]]; then continue; fi

  PLEDGE=$("${WRANGLER_CMD[@]}" kv key get "$KEY" --binding PLEDGES $WRANGLER_ENV_FLAGS $KV_SCOPE_FLAGS $LOCAL_PERSIST_FLAGS 2>/dev/null)

  if [[ -z "$PLEDGE" ]]; then continue; fi

  # Parse JSON and output CSV rows (one per history entry, or single row for legacy)
  echo "$PLEDGE" | python3 -c "
import sys, json, csv
from io import StringIO

# Tier ID to human-readable name mapping
TIER_NAMES = {
    'frame': 'One Frame',
    'writer-credit': 'Writer Credit',
    'sound-effect': 'Sound Effect',
    'dialogue': 'Line of Dialogue',
    'prop': 'Handheld Prop',
    'costume': 'Costume',
    'character': 'Add a Character',
    'jack-does': 'Jack Does Whatever You Write',
    'language': 'Scene in Another Language',
    'act': 'Act in the Movie',
}

def get_tier_name(tier_id, fallback=''):
    return TIER_NAMES.get(tier_id, fallback or tier_id or '')

def build_items_str(tier_id, tier_qty, additional_tiers, is_negative=False, custom_amount=0):
    items = []
    tier_name = get_tier_name(tier_id)
    if tier_name:
        prefix = '-' if is_negative else ''
        if tier_qty and tier_qty > 1:
            items.append(f'{prefix}{tier_name} x{tier_qty}')
        else:
            items.append(f'{prefix}{tier_name}')
    
    for add_tier in (additional_tiers or []):
        add_id = add_tier.get('id', '')
        add_name = get_tier_name(add_id, add_tier.get('name'))
        add_qty = add_tier.get('qty', 1)
        if add_name:
            prefix = '-' if is_negative else ''
            if add_qty > 1:
                items.append(f'{prefix}{add_name} x{add_qty}')
            else:
                items.append(f'{prefix}{add_name}')
    
    if custom_amount and custom_amount > 0:
        items.append(f'Custom Support \${custom_amount:.2f}')
    
    return '; '.join(items) if items else ''

def write_row(email, campaign, items_str, subtotal, tip_percent, tip, tax, shipping, total, status, charged, timestamp, order_id):
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow([
        email, campaign, items_str,
        f'{subtotal:.2f}', str(tip_percent), f'{tip:.2f}', f'{tax:.2f}', f'{shipping:.2f}', f'{total:.2f}',
        status, 'yes' if charged else 'no', timestamp, order_id
    ])
    print(output.getvalue().strip())

def get_tier_counts(entry):
    counts = {}
    tier_id = entry.get('tierId')
    if tier_id:
        tier_name = get_tier_name(tier_id)
        counts[tier_name] = entry.get('tierQty', 1) or 1
    for add_tier in (entry.get('additionalTiers') or []):
        add_id = add_tier.get('id', '')
        add_name = get_tier_name(add_id, add_tier.get('name'))
        if add_name:
            counts[add_name] = add_tier.get('qty', 1) or 1
    return counts

def build_diff_items_str(old_counts, new_counts):
    items = []
    all_tiers = set(old_counts.keys()) | set(new_counts.keys())
    for tier_name in sorted(all_tiers):
        old_qty = old_counts.get(tier_name, 0)
        new_qty = new_counts.get(tier_name, 0)
        diff = new_qty - old_qty
        if diff > 0:
            if diff > 1:
                items.append(f'+{tier_name} x{diff}')
            else:
                items.append(f'+{tier_name}')
        elif diff < 0:
            if diff < -1:
                items.append(f'-{tier_name} x{abs(diff)}')
            else:
                items.append(f'-{tier_name}')
    return '; '.join(items) if items else ''

try:
    data = json.load(sys.stdin)
    campaign = data.get('campaignSlug', '')
    
    # Filter by campaign if specified
    campaign_filter = '$CAMPAIGN_FILTER'
    if campaign_filter and campaign != campaign_filter:
        sys.exit(0)
    
    email = data.get('email', '')
    order_id = data.get('orderId', '')
    charged = data.get('charged', False)
    history = data.get('history', [])

    if history:
        # Output one row per history entry
        prev_counts = {}
        prev_custom = 0
        for entry in history:
            entry_type = entry.get('type', '')
            timestamp = entry.get('at', '')
            
            if entry_type == 'created':
                subtotal = entry.get('subtotal', 0) / 100
                tip_percent = entry.get('tipPercent', data.get('tipPercent', 0) or 0)
                tip = entry.get('tipAmount', data.get('tipAmount', 0) or 0) / 100
                tax = entry.get('tax', 0) / 100
                shipping = entry.get('shipping', 0) / 100
                total = entry.get('amount', 0) / 100
                # Only show customAmount on created if it's in the entry itself
                # (not from current pledge state which may have been added later)
                custom_amt = entry.get('customAmount', 0) or 0
                items_str = build_items_str(
                    entry.get('tierId'),
                    entry.get('tierQty', 1),
                    entry.get('additionalTiers'),
                    custom_amount=custom_amt
                )
                prev_counts = get_tier_counts(entry)
                prev_custom = custom_amt
                write_row(email, campaign, items_str, subtotal, tip_percent, tip, tax, shipping, total, 'created', charged, timestamp, order_id)
            
            elif entry_type == 'modified':
                subtotal = entry.get('subtotalDelta', 0) / 100
                tip_percent = entry.get('tipPercent', data.get('tipPercent', 0) or 0)
                tip = entry.get('tipAmountDelta', 0) / 100
                tax = entry.get('taxDelta', 0) / 100
                shipping_delta = entry.get('shippingDelta', 0) / 100
                total = entry.get('amountDelta', 0) / 100
                new_counts = get_tier_counts(entry)
                new_custom = entry.get('customAmount', 0) or 0
                items_str = build_diff_items_str(prev_counts, new_counts)
                
                # Add custom amount change if present
                if new_custom != prev_custom:
                    custom_diff = new_custom - prev_custom
                    if custom_diff > 0:
                        custom_str = f'+Custom Support \${custom_diff:.2f}'
                    else:
                        custom_str = f'-Custom Support \${abs(custom_diff):.2f}'
                    items_str = f'{items_str}; {custom_str}' if items_str else custom_str
                
                tip_changed = tip != 0
                tip_only_change = tip_changed and subtotal == 0 and tax == 0 and shipping_delta == 0
                if items_str:
                    if tip_changed:
                        items_str = f'(modified) {items_str}; tip updated to {tip_percent}%'
                    else:
                        items_str = f'(modified) {items_str}'
                else:
                    items_str = f'(tip updated to {tip_percent}%)' if tip_only_change else '(modified)'
                prev_counts = new_counts
                prev_custom = new_custom
                write_row(email, campaign, items_str, subtotal, tip_percent, tip, tax, shipping_delta, total, 'modified', charged, timestamp, order_id)
            
            elif entry_type == 'cancelled':
                subtotal = entry.get('subtotalDelta', 0) / 100
                tip_percent = entry.get('tipPercent', data.get('tipPercent', 0) or 0)
                tip = entry.get('tipAmountDelta', 0) / 100
                tax = entry.get('taxDelta', 0) / 100
                shipping_delta = entry.get('shippingDelta', 0) / 100
                total = entry.get('amountDelta', 0) / 100
                # Get items from the pledge itself (the cancelled items)
                items_str = build_items_str(
                    data.get('tierId'),
                    data.get('tierQty', 1),
                    data.get('additionalTiers'),
                    is_negative=True,
                    custom_amount=data.get('customAmount', 0) or 0
                )
                write_row(email, campaign, items_str, subtotal, tip_percent, tip, tax, shipping_delta, total, 'cancelled', charged, timestamp, order_id)
    else:
        # Legacy pledge without history - output single row with current state
        pledge_status = data.get('pledgeStatus', 'unknown')
        if charged:
            status = 'charged'
        elif pledge_status == 'cancelled':
            status = 'cancelled'
        elif pledge_status == 'payment_failed':
            status = 'failed'
        elif pledge_status == 'active':
            status = 'active'
        else:
            status = pledge_status
        
        is_cancelled = status == 'cancelled'
        sign = -1 if is_cancelled else 1
        
        subtotal = sign * data.get('subtotal', data.get('amount', 0)) / 100
        tip_percent = data.get('tipPercent', 0) or 0
        tip = sign * (data.get('tipAmount', 0) or 0) / 100
        tax = sign * data.get('tax', 0) / 100
        shipping = sign * data.get('shipping', 0) / 100
        total = sign * data.get('amount', 0) / 100
        
        items_str = build_items_str(
            data.get('tierId'),
            data.get('tierQty', 1),
            data.get('additionalTiers'),
            is_negative=is_cancelled,
            custom_amount=data.get('customAmount', 0) or 0
        )
        
        write_row(email, campaign, items_str, subtotal, tip_percent, tip, tax, shipping, total, status, charged, data.get('createdAt', ''), order_id)

except json.JSONDecodeError:
    pass
except Exception as e:
    print(f'Error parsing pledge: {e}', file=sys.stderr)
"
  PROCESSED=$((PROCESSED + 1))
  
  # Progress indicator every 10 pledges
  if (( PROCESSED % 10 == 0 )); then
    echo "  Processed $PROCESSED/$KEY_COUNT..." >&2
  fi
done

echo "Done." >&2
