#!/bin/bash
# Generate fulfillment report - current pledge state aggregated by email + campaign
#
# Unlike pledge-report.sh (which shows history/ledger), this shows the FINAL state
# of each pledge for fulfillment purposes.
#
# Usage:
#   ./scripts/fulfillment-report.sh [campaign-slug] [--env dev] [--local]
#
# Examples:
#   ./scripts/fulfillment-report.sh                           # All, production
#   ./scripts/fulfillment-report.sh worst-movie-ever          # Single campaign
#   ./scripts/fulfillment-report.sh --env dev                 # Dev preview KV
#   ./scripts/fulfillment-report.sh --local                   # Local Wrangler KV
#   ./scripts/fulfillment-report.sh worst-movie-ever --local
#
# Output to file:
#   ./scripts/fulfillment-report.sh worst-movie-ever > fulfillment.csv

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
  if [[ "$PODMAN_STARTED_BY_SCRIPT" == "true" ]]; then
    podman rm -f pool-dev-site pool-dev-worker >/dev/null 2>&1 || true
    podman pod rm -f pool-dev-pod >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

if [[ "$USE_PODMAN" == "true" && "$PODMAN_REPORT_INTERNAL" != "1" ]]; then
  prefer_podman_path || true

  if ! podman exec pool-dev-worker true >/dev/null 2>&1; then
    echo "📦 Starting shared Podman dev stack..." >&2
    PODMAN_REPORT_LOG="${PODMAN_REPORT_LOG:-/tmp/pool-fulfillment-report-podman.log}"
    PODMAN_DETACH=true SKIP_STRIPE=true ./scripts/dev.sh --podman > "$PODMAN_REPORT_LOG" 2>&1
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

  exec podman exec pool-dev-worker bash -lc "cd /workspace && PODMAN_REPORT_INTERNAL=1 ./scripts/fulfillment-report.sh${QUOTED_ARGS}"
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

SITE_AUTHOR=$(
  python3 - <<'PY'
from pathlib import Path

config_path = Path('../_config.yml')
author = ''
try:
    for raw_line in config_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#'):
            continue
        if line.startswith('author:'):
            author = line.split(':', 1)[1].strip().strip('"').strip("'")
            break
except Exception:
    author = ''

print(author)
PY
)
export SITE_AUTHOR

if [[ -n "${WRANGLER_BIN:-}" ]]; then
  WRANGLER_CMD=(${WRANGLER_BIN})
elif [[ -n "${MOCK_WRANGLER_DATA:-}" ]] && command -v wrangler >/dev/null 2>&1; then
  WRANGLER_CMD=(wrangler)
else
  WRANGLER_CMD=(npx wrangler)
fi

if [[ "$KV_SCOPE_FLAGS" == *"--local"* ]]; then
  echo "Fetching pledges for fulfillment report from local Wrangler KV..." >&2
else
  echo "Fetching pledges for fulfillment report..." >&2
fi
echo "Report mode: fulfillment-report is the merged current-state view per supporter and campaign. Compare it against pledge-report when debugging projection drift." >&2

if [[ "$KV_SCOPE_FLAGS" == *"--local"* ]]; then
  python3 -c "
import sys
import os
import json
import csv
import sqlite3
from collections import defaultdict
from io import StringIO
from pathlib import Path

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

def get_add_on_label(add_on):
    name = str(add_on.get('name') or add_on.get('productId') or 'Platform add-on').strip()
    variant = str(add_on.get('variantLabel') or '').strip()
    return f'{name} ({variant})' if variant else name

def is_campaign_add_on(add_on, campaign_slug=''):
    scope = str(add_on.get('scope') or '').strip().lower()
    add_on_campaign = str(add_on.get('campaignSlug') or add_on.get('campaign_slug') or '').strip()
    normalized_campaign = str(campaign_slug or '').strip()
    if scope != 'campaign':
        return False
    if not normalized_campaign:
        return True
    return add_on_campaign == normalized_campaign

def get_add_on_subtotal_cents(add_ons, campaign_slug='', scope='all'):
    total_cents = 0
    normalized_scope = str(scope or 'all').strip().lower()
    for add_on in (add_ons or []):
        line_total = (add_on.get('unitPrice', 0) or 0) * (add_on.get('quantity', 0) or 0)
        if normalized_scope == 'campaign':
            if not is_campaign_add_on(add_on, campaign_slug):
                continue
        elif normalized_scope == 'platform':
            if is_campaign_add_on(add_on, campaign_slug):
                continue
        total_cents += line_total
    return total_cents

def get_campaign_subtotal_cents(data):
    if data.get('goalTrackingSubtotal') is not None:
        return data.get('goalTrackingSubtotal') or 0
    subtotal_cents = data.get('subtotal') or data.get('amount') or 0
    return subtotal_cents - get_add_on_subtotal_cents(data.get('bundleAddOns') or [], data.get('campaignSlug', ''), 'platform')

def build_count_items_str(counts):
    items = []
    for item_name in sorted(counts.keys()):
        qty = counts.get(item_name, 0)
        if qty <= 0:
            continue
        items.append(f'{item_name} x{qty}' if qty > 1 else item_name)
    return '; '.join(items)

def allocate_cents(total_cents, bucket_cents):
    if total_cents <= 0 or not bucket_cents:
        return [0 for _ in bucket_cents]
    total_bucket_cents = sum(bucket_cents)
    if total_bucket_cents <= 0:
        return [0 for _ in bucket_cents]
    allocations = []
    consumed = 0
    for index, bucket in enumerate(bucket_cents):
        if index == len(bucket_cents) - 1:
            allocation = total_cents - consumed
        else:
            allocation = (total_cents * bucket) // total_bucket_cents
            consumed += allocation
        allocations.append(allocation)
    return allocations

def get_shipping_address_str(addr):
    if not addr:
        return ''
    parts = [addr.get('name', ''), addr.get('address1', ''), addr.get('address2', ''),
             addr.get('city', ''), addr.get('province', ''), addr.get('postalCode', ''),
             addr.get('country', '')]
    return ', '.join(p for p in parts if p)

campaign_filter = '$CAMPAIGN_FILTER'
site_author = os.environ.get('SITE_AUTHOR', '').strip()

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

print(f'Found {len(rows)} pledges. Processing...', file=sys.stderr)

# Aggregate by (email, campaign, fulfiller)
aggregated = defaultdict(lambda: {
    'campaign_subtotal': 0,
    'add_on_subtotal': 0,
    'subtotal': 0,
    'tip': 0,
    'tip_percent': 0,
    'tax': 0,
    'shipping': 0,
    'total': 0,
    'items': defaultdict(int),
    'add_on_items': defaultdict(int),
    'shipping_address': ''
})

for _, blob_id in rows:
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
    if data.get('pledgeStatus') == 'cancelled':
        continue

    email = data.get('email', '')
    shipping_address = get_shipping_address_str(data.get('shippingAddress'))
    subtotal_cents = data.get('subtotal') or data.get('amount') or 0
    campaign_subtotal_cents = get_campaign_subtotal_cents(data)
    platform_add_on_subtotal_cents = get_add_on_subtotal_cents(data.get('bundleAddOns') or [], campaign, 'platform')
    tip_cents = data.get('tipAmount') or 0
    tax_cents = data.get('tax') or 0
    shipping_cents = data.get('shipping') or 0

    tier_id = data.get('tierId')
    campaign_items = defaultdict(int)
    if tier_id:
        tier_name = get_tier_name(tier_id, data.get('tierName'))
        tier_qty = data.get('tierQty', 1) or 1
        campaign_items[tier_name] += tier_qty

    for add_tier in data.get('additionalTiers', []) or []:
        add_id = add_tier.get('id', '')
        add_name = get_tier_name(add_id, add_tier.get('name'))
        add_qty = add_tier.get('qty', 1) or 1
        if add_name:
            campaign_items[add_name] += add_qty

    campaign_add_on_items = defaultdict(int)
    platform_add_on_items = defaultdict(int)
    for add_on in data.get('bundleAddOns', []) or []:
        add_on_name = get_add_on_label(add_on)
        add_on_qty = add_on.get('quantity', 1) or 1
        if add_on_name:
            if is_campaign_add_on(add_on, campaign):
                campaign_add_on_items[add_on_name] += add_on_qty
            else:
                platform_add_on_items[add_on_name] += add_on_qty

    row_specs = []
    if campaign_subtotal_cents > 0 or campaign_items or campaign_add_on_items:
        row_specs.append({
            'campaign': campaign,
            'fulfiller': campaign,
            'campaign_subtotal': campaign_subtotal_cents,
            'add_on_subtotal': 0,
            'subtotal': campaign_subtotal_cents,
            'items': campaign_items,
            'add_on_items': campaign_add_on_items
        })

    if platform_add_on_subtotal_cents > 0 or platform_add_on_items:
        row_specs.append({
            'campaign': '',
            'fulfiller': site_author,
            'campaign_subtotal': 0,
            'add_on_subtotal': platform_add_on_subtotal_cents,
            'subtotal': platform_add_on_subtotal_cents,
            'items': defaultdict(int),
            'add_on_items': platform_add_on_items
        })

    if not row_specs:
        continue

    subtotal_allocations = [spec['subtotal'] for spec in row_specs]
    tip_allocations = allocate_cents(tip_cents, subtotal_allocations)
    tax_allocations = allocate_cents(tax_cents, subtotal_allocations)
    shipping_allocations = allocate_cents(shipping_cents, subtotal_allocations)

    for index, spec in enumerate(row_specs):
        key = (email, spec['campaign'], spec['fulfiller'])
        aggregated[key]['campaign_subtotal'] += spec['campaign_subtotal']
        aggregated[key]['add_on_subtotal'] += spec['add_on_subtotal']
        aggregated[key]['subtotal'] += spec['subtotal']
        aggregated[key]['tip'] += tip_allocations[index]
        aggregated[key]['tax'] += tax_allocations[index]
        aggregated[key]['shipping'] += shipping_allocations[index]
        aggregated[key]['total'] += spec['subtotal'] + tip_allocations[index] + tax_allocations[index] + shipping_allocations[index]
        if aggregated[key]['subtotal'] > 0 and aggregated[key]['tip'] > 0:
            aggregated[key]['tip_percent'] = round((aggregated[key]['tip'] / aggregated[key]['subtotal']) * 100)
        if shipping_address and not aggregated[key]['shipping_address']:
            aggregated[key]['shipping_address'] = shipping_address
        for item_name, qty in spec['items'].items():
            aggregated[key]['items'][item_name] += qty
        for item_name, qty in spec['add_on_items'].items():
            aggregated[key]['add_on_items'][item_name] += qty

# Output aggregated CSV
output = StringIO()
writer = csv.writer(output)
writer.writerow(['email', 'campaign', 'fulfiller', 'items', 'add_on_items', 'campaign_subtotal', 'platform_add_on_subtotal', 'subtotal', 'tip_percent', 'tip', 'tax', 'shipping', 'total', 'shipping_address'])

for (email, campaign, fulfiller), data in sorted(aggregated.items()):
    if (not data['items'] and not data['add_on_items']) or data['total'] <= 0:
        continue
    
    items_str = build_count_items_str(data['items'])
    add_on_items_str = build_count_items_str(data['add_on_items'])
    
    writer.writerow([
        email,
        campaign,
        fulfiller,
        items_str,
        add_on_items_str,
        f\"{data['campaign_subtotal'] / 100:.2f}\",
        f\"{data['add_on_subtotal'] / 100:.2f}\",
        f\"{data['subtotal'] / 100:.2f}\",
        str(data['tip_percent']),
        f\"{data['tip'] / 100:.2f}\",
        f\"{data['tax'] / 100:.2f}\",
        f\"{data['shipping'] / 100:.2f}\",
        f\"{data['total'] / 100:.2f}\",
        data['shipping_address']
    ])

print(output.getvalue().strip())
"
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
echo "Found $KEY_COUNT pledges. Processing..." >&2

# Collect all pledge data - use a temp file to avoid subshell issues
TMPFILE=$(mktemp)
trap "rm -f $TMPFILE" EXIT

while read -r KEY; do
  if [[ -z "$KEY" ]]; then continue; fi
  "${WRANGLER_CMD[@]}" kv key get "$KEY" --binding PLEDGES $WRANGLER_ENV_FLAGS $KV_SCOPE_FLAGS $LOCAL_PERSIST_FLAGS 2>/dev/null >> "$TMPFILE"
  echo "" >> "$TMPFILE"  # Ensure newline after JSON
  echo "---PLEDGE_DELIMITER---" >> "$TMPFILE"
done <<< "$KEYS"

# Aggregate in Python
cat "$TMPFILE" | python3 -c "
import sys
import os
import json
import csv
from collections import defaultdict
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

def get_add_on_label(add_on):
    name = str(add_on.get('name') or add_on.get('productId') or 'Platform add-on').strip()
    variant = str(add_on.get('variantLabel') or '').strip()
    return f'{name} ({variant})' if variant else name

def is_campaign_add_on(add_on, campaign_slug=''):
    scope = str(add_on.get('scope') or '').strip().lower()
    add_on_campaign = str(add_on.get('campaignSlug') or add_on.get('campaign_slug') or '').strip()
    normalized_campaign = str(campaign_slug or '').strip()
    if scope != 'campaign':
        return False
    if not normalized_campaign:
        return True
    return add_on_campaign == normalized_campaign

def get_add_on_subtotal_cents(add_ons, campaign_slug='', scope='all'):
    total_cents = 0
    normalized_scope = str(scope or 'all').strip().lower()
    for add_on in (add_ons or []):
        line_total = (add_on.get('unitPrice', 0) or 0) * (add_on.get('quantity', 0) or 0)
        if normalized_scope == 'campaign':
            if not is_campaign_add_on(add_on, campaign_slug):
                continue
        elif normalized_scope == 'platform':
            if is_campaign_add_on(add_on, campaign_slug):
                continue
        total_cents += line_total
    return total_cents

def get_campaign_subtotal_cents(data):
    if data.get('goalTrackingSubtotal') is not None:
        return data.get('goalTrackingSubtotal') or 0
    subtotal_cents = data.get('subtotal') or data.get('amount') or 0
    return subtotal_cents - get_add_on_subtotal_cents(data.get('bundleAddOns') or [], data.get('campaignSlug', ''), 'platform')

def build_count_items_str(counts):
    items = []
    for item_name in sorted(counts.keys()):
        qty = counts.get(item_name, 0)
        if qty <= 0:
            continue
        items.append(f'{item_name} x{qty}' if qty > 1 else item_name)
    return '; '.join(items)

def allocate_cents(total_cents, bucket_cents):
    if total_cents <= 0 or not bucket_cents:
        return [0 for _ in bucket_cents]
    total_bucket_cents = sum(bucket_cents)
    if total_bucket_cents <= 0:
        return [0 for _ in bucket_cents]
    allocations = []
    consumed = 0
    for index, bucket in enumerate(bucket_cents):
        if index == len(bucket_cents) - 1:
            allocation = total_cents - consumed
        else:
            allocation = (total_cents * bucket) // total_bucket_cents
            consumed += allocation
        allocations.append(allocation)
    return allocations

def get_shipping_address_str(addr):
    if not addr:
        return ''
    parts = [addr.get('name', ''), addr.get('address1', ''), addr.get('address2', ''),
             addr.get('city', ''), addr.get('province', ''), addr.get('postalCode', ''),
             addr.get('country', '')]
    return ', '.join(p for p in parts if p)

campaign_filter = '$CAMPAIGN_FILTER'
site_author = os.environ.get('SITE_AUTHOR', '').strip()

# Aggregate by (email, campaign, fulfiller)
aggregated = defaultdict(lambda: {
    'campaign_subtotal': 0,
    'add_on_subtotal': 0,
    'subtotal': 0,
    'tip': 0,
    'tip_percent': 0,
    'tax': 0,
    'shipping': 0,
    'total': 0,
    'items': defaultdict(int),
    'add_on_items': defaultdict(int),
    'shipping_address': ''
})

# Read pledges separated by delimiter
pledge_data = ''
for line in sys.stdin:
    if line.strip() == '---PLEDGE_DELIMITER---':
        if pledge_data.strip():
            try:
                cleaned = pledge_data.replace('\\n', '').strip()
                cleaned = ' '.join(cleaned.split())
                data = json.loads(cleaned)
                campaign = data.get('campaignSlug', '')
                if campaign_filter and campaign != campaign_filter:
                    pledge_data = ''
                    continue
                if data.get('pledgeStatus') == 'cancelled':
                    pledge_data = ''
                    continue
                email = data.get('email', '')
                shipping_address = get_shipping_address_str(data.get('shippingAddress'))
                subtotal_cents = data.get('subtotal') or data.get('amount') or 0
                campaign_subtotal_cents = get_campaign_subtotal_cents(data)
                platform_add_on_subtotal_cents = get_add_on_subtotal_cents(data.get('bundleAddOns') or [], campaign, 'platform')
                tip_cents = data.get('tipAmount') or 0
                tax_cents = data.get('tax') or 0
                shipping_cents = data.get('shipping') or 0
                tier_id = data.get('tierId')
                campaign_items = defaultdict(int)
                if tier_id:
                    tier_name = get_tier_name(tier_id, data.get('tierName'))
                    tier_qty = data.get('tierQty', 1) or 1
                    campaign_items[tier_name] += tier_qty
                for add_tier in data.get('additionalTiers', []) or []:
                    add_id = add_tier.get('id', '')
                    add_name = get_tier_name(add_id, add_tier.get('name'))
                    add_qty = add_tier.get('qty', 1) or 1
                    if add_name:
                        campaign_items[add_name] += add_qty
                campaign_add_on_items = defaultdict(int)
                platform_add_on_items = defaultdict(int)
                for add_on in data.get('bundleAddOns', []) or []:
                    add_on_name = get_add_on_label(add_on)
                    add_on_qty = add_on.get('quantity', 1) or 1
                    if add_on_name:
                        if is_campaign_add_on(add_on, campaign):
                            campaign_add_on_items[add_on_name] += add_on_qty
                        else:
                            platform_add_on_items[add_on_name] += add_on_qty
                row_specs = []
                if campaign_subtotal_cents > 0 or campaign_items or campaign_add_on_items:
                    row_specs.append({
                        'campaign': campaign,
                        'fulfiller': campaign,
                        'campaign_subtotal': campaign_subtotal_cents,
                        'add_on_subtotal': 0,
                        'subtotal': campaign_subtotal_cents,
                        'items': campaign_items,
                        'add_on_items': campaign_add_on_items
                    })
                if platform_add_on_subtotal_cents > 0 or platform_add_on_items:
                    row_specs.append({
                        'campaign': '',
                        'fulfiller': site_author,
                        'campaign_subtotal': 0,
                        'add_on_subtotal': platform_add_on_subtotal_cents,
                        'subtotal': platform_add_on_subtotal_cents,
                        'items': defaultdict(int),
                        'add_on_items': platform_add_on_items
                    })
                if not row_specs:
                    pledge_data = ''
                    continue
                subtotal_allocations = [spec['subtotal'] for spec in row_specs]
                tip_allocations = allocate_cents(tip_cents, subtotal_allocations)
                tax_allocations = allocate_cents(tax_cents, subtotal_allocations)
                shipping_allocations = allocate_cents(shipping_cents, subtotal_allocations)
                for index, spec in enumerate(row_specs):
                    key = (email, spec['campaign'], spec['fulfiller'])
                    aggregated[key]['campaign_subtotal'] += spec['campaign_subtotal']
                    aggregated[key]['add_on_subtotal'] += spec['add_on_subtotal']
                    aggregated[key]['subtotal'] += spec['subtotal']
                    aggregated[key]['tip'] += tip_allocations[index]
                    aggregated[key]['tax'] += tax_allocations[index]
                    aggregated[key]['shipping'] += shipping_allocations[index]
                    aggregated[key]['total'] += spec['subtotal'] + tip_allocations[index] + tax_allocations[index] + shipping_allocations[index]
                    if aggregated[key]['subtotal'] > 0 and aggregated[key]['tip'] > 0:
                        aggregated[key]['tip_percent'] = round((aggregated[key]['tip'] / aggregated[key]['subtotal']) * 100)
                    if shipping_address and not aggregated[key]['shipping_address']:
                        aggregated[key]['shipping_address'] = shipping_address
                    for item_name, qty in spec['items'].items():
                        aggregated[key]['items'][item_name] += qty
                    for item_name, qty in spec['add_on_items'].items():
                        aggregated[key]['add_on_items'][item_name] += qty
            except json.JSONDecodeError:
                pass
            except Exception as e:
                print(f'Error parsing pledge: {e}', file=sys.stderr)
        pledge_data = ''
    else:
        pledge_data += line

# Output aggregated CSV
output = StringIO()
writer = csv.writer(output)
writer.writerow(['email', 'campaign', 'fulfiller', 'items', 'add_on_items', 'campaign_subtotal', 'platform_add_on_subtotal', 'subtotal', 'tip_percent', 'tip', 'tax', 'shipping', 'total', 'shipping_address'])

for (email, campaign, fulfiller), data in sorted(aggregated.items()):
    if (not data['items'] and not data['add_on_items']) or data['total'] <= 0:
        continue
    items_str = build_count_items_str(data['items'])
    add_on_items_str = build_count_items_str(data['add_on_items'])
    writer.writerow([
        email,
        campaign,
        fulfiller,
        items_str,
        add_on_items_str,
        f\"{data['campaign_subtotal'] / 100:.2f}\",
        f\"{data['add_on_subtotal'] / 100:.2f}\",
        f\"{data['subtotal'] / 100:.2f}\",
        str(data['tip_percent']),
        f\"{data['tip'] / 100:.2f}\",
        f\"{data['tax'] / 100:.2f}\",
        f\"{data['shipping'] / 100:.2f}\",
        f\"{data['total'] / 100:.2f}\",
        data['shipping_address']
    ])

print(output.getvalue().strip())
"
echo "Done." >&2
