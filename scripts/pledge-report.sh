#!/bin/bash
# Generate CSV report of pledges from Cloudflare KV
#
# Usage:
#   ./scripts/pledge-report.sh [campaign-slug] [--env dev|production]
#
# Examples:
#   ./scripts/pledge-report.sh                           # All pledges, production
#   ./scripts/pledge-report.sh worst-movie-ever          # Single campaign, production
#   ./scripts/pledge-report.sh --env dev                 # All pledges, dev/preview KV
#   ./scripts/pledge-report.sh hand-relations --env dev  # Single campaign, dev
#
# Output to file:
#   ./scripts/pledge-report.sh worst-movie-ever > pledges.csv

set -e

# Use Node 20 if available via nvm
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use 20 >/dev/null 2>&1 || true
fi

CAMPAIGN_FILTER=""
KV_FLAGS=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      if [[ "$2" == "dev" ]]; then
        KV_FLAGS="--env dev --preview"
      fi
      shift 2
      ;;
    --remote)
      # Use remote KV (production)
      KV_FLAGS=""
      shift
      ;;
    *)
      CAMPAIGN_FILTER="$1"
      shift
      ;;
  esac
done

cd "$(dirname "$0")/../worker"

echo "Fetching pledges from KV${KV_FLAGS:+ (dev preview)}..." >&2

# Get all pledge keys
KEYS=$(wrangler kv key list --binding PLEDGES --prefix "pledge:" $KV_FLAGS 2>/dev/null | \
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

if [[ -z "$KEYS" ]]; then
  echo "No pledges found." >&2
  exit 0
fi

KEY_COUNT=$(echo "$KEYS" | wc -l | tr -d ' ')
echo "Found $KEY_COUNT pledges. Fetching details..." >&2

# CSV header
echo "email,campaign,items,subtotal,tax,total,status,charged,created_at,order_id"

# Fetch each pledge and output as CSV row
PROCESSED=0
echo "$KEYS" | while read -r KEY; do
  if [[ -z "$KEY" ]]; then continue; fi
  
  PLEDGE=$(wrangler kv key get "$KEY" --binding PLEDGES $KV_FLAGS 2>/dev/null)
  
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

def build_items_str(tier_id, tier_qty, additional_tiers, is_negative=False):
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
    
    return '; '.join(items) if items else ''

def write_row(email, campaign, items_str, subtotal, tax, total, status, charged, timestamp, order_id):
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow([
        email, campaign, items_str,
        f'{subtotal:.2f}', f'{tax:.2f}', f'{total:.2f}',
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
        for entry in history:
            entry_type = entry.get('type', '')
            timestamp = entry.get('at', '')
            
            if entry_type == 'created':
                subtotal = entry.get('subtotal', 0) / 100
                tax = entry.get('tax', 0) / 100
                total = entry.get('amount', 0) / 100
                items_str = build_items_str(
                    entry.get('tierId'),
                    entry.get('tierQty', 1),
                    entry.get('additionalTiers')
                )
                prev_counts = get_tier_counts(entry)
                write_row(email, campaign, items_str, subtotal, tax, total, 'created', charged, timestamp, order_id)
            
            elif entry_type == 'modified':
                subtotal = entry.get('subtotalDelta', 0) / 100
                tax = entry.get('taxDelta', 0) / 100
                total = entry.get('amountDelta', 0) / 100
                new_counts = get_tier_counts(entry)
                items_str = build_diff_items_str(prev_counts, new_counts)
                if items_str:
                    items_str = f'(modified) {items_str}'
                else:
                    items_str = '(modified)'
                prev_counts = new_counts
                write_row(email, campaign, items_str, subtotal, tax, total, 'modified', charged, timestamp, order_id)
            
            elif entry_type == 'cancelled':
                subtotal = entry.get('subtotalDelta', 0) / 100
                tax = entry.get('taxDelta', 0) / 100
                total = entry.get('amountDelta', 0) / 100
                # Get items from the pledge itself (the cancelled items)
                items_str = build_items_str(
                    data.get('tierId'),
                    data.get('tierQty', 1),
                    data.get('additionalTiers'),
                    is_negative=True
                )
                write_row(email, campaign, items_str, subtotal, tax, total, 'cancelled', charged, timestamp, order_id)
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
        tax = sign * data.get('tax', 0) / 100
        total = sign * data.get('amount', 0) / 100
        
        items_str = build_items_str(
            data.get('tierId'),
            data.get('tierQty', 1),
            data.get('additionalTiers'),
            is_negative=is_cancelled
        )
        
        write_row(email, campaign, items_str, subtotal, tax, total, status, charged, data.get('createdAt', ''), order_id)

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
