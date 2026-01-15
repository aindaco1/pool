#!/bin/bash
# Generate fulfillment report - current pledge state aggregated by email + campaign
#
# Unlike pledge-report.sh (which shows history/ledger), this shows the FINAL state
# of each pledge for fulfillment purposes.
#
# Usage:
#   ./scripts/fulfillment-report.sh [campaign-slug] [--env dev]
#
# Examples:
#   ./scripts/fulfillment-report.sh                           # All, production
#   ./scripts/fulfillment-report.sh worst-movie-ever          # Single campaign
#   ./scripts/fulfillment-report.sh --env dev                 # Dev preview KV
#   ./scripts/fulfillment-report.sh worst-movie-ever --env dev
#
# Output to file:
#   ./scripts/fulfillment-report.sh worst-movie-ever > fulfillment.csv

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

echo "Fetching pledges for fulfillment report..." >&2

# Get all pledge keys
KEYS=$(wrangler kv key list --binding PLEDGES --prefix "pledge:" --remote $KV_FLAGS 2>/dev/null | \
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
echo "Found $KEY_COUNT pledges. Processing..." >&2

# Collect all pledge data - use a temp file to avoid subshell issues
TMPFILE=$(mktemp)
trap "rm -f $TMPFILE" EXIT

while read -r KEY; do
  if [[ -z "$KEY" ]]; then continue; fi
  wrangler kv key get "$KEY" --binding PLEDGES --remote $KV_FLAGS 2>/dev/null >> "$TMPFILE"
  echo "" >> "$TMPFILE"  # Ensure newline after JSON
  echo "---PLEDGE_DELIMITER---" >> "$TMPFILE"
done <<< "$KEYS"

# Aggregate in Python
cat "$TMPFILE" | python3 -c "
import sys
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

campaign_filter = '$CAMPAIGN_FILTER'

# Aggregate by (email, campaign)
# Structure: { (email, campaign): { 'subtotal': 0, 'tax': 0, 'total': 0, 'items': { tier_name: qty } } }
aggregated = defaultdict(lambda: {'subtotal': 0.0, 'tax': 0.0, 'total': 0.0, 'items': defaultdict(int)})

# Read pledges separated by delimiter
pledge_data = ''
for line in sys.stdin:
    if line.strip() == '---PLEDGE_DELIMITER---':
        if pledge_data.strip():
            try:
                # Clean up any newlines within the JSON (corrupted data)
                cleaned = pledge_data.replace('\\n', '').strip()
                # Also handle literal newlines that break JSON
                cleaned = ' '.join(cleaned.split())
                data = json.loads(cleaned)
                campaign = data.get('campaignSlug', '')
                
                # Filter by campaign if specified
                if campaign_filter and campaign != campaign_filter:
                    pledge_data = ''
                    continue
                
                # Skip cancelled pledges
                if data.get('pledgeStatus') == 'cancelled':
                    pledge_data = ''
                    continue
                
                email = data.get('email', '')
                key = (email, campaign)
                
                # Add current amounts
                subtotal = (data.get('subtotal') or data.get('amount') or 0) / 100
                tax = (data.get('tax') or 0) / 100
                total = (data.get('amount') or 0) / 100
                
                aggregated[key]['subtotal'] += subtotal
                aggregated[key]['tax'] += tax
                aggregated[key]['total'] += total
                
                # Add current tier
                tier_id = data.get('tierId')
                if tier_id:
                    tier_name = get_tier_name(tier_id, data.get('tierName'))
                    tier_qty = data.get('tierQty', 1) or 1
                    aggregated[key]['items'][tier_name] += tier_qty
                
                # Add additional tiers
                for add_tier in data.get('additionalTiers', []) or []:
                    add_id = add_tier.get('id', '')
                    add_name = get_tier_name(add_id, add_tier.get('name'))
                    add_qty = add_tier.get('qty', 1) or 1
                    if add_name:
                        aggregated[key]['items'][add_name] += add_qty
                
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
writer.writerow(['email', 'campaign', 'items', 'subtotal', 'tax', 'total'])

for (email, campaign), data in sorted(aggregated.items()):
    # Skip if no items or zero total
    if not data['items'] or data['total'] <= 0:
        continue
    
    # Build items string
    items_list = []
    for item_name, qty in sorted(data['items'].items()):
        if qty > 0:
            if qty > 1:
                items_list.append(f'{item_name} x{qty}')
            else:
                items_list.append(item_name)
    
    items_str = '; '.join(items_list)
    
    writer.writerow([
        email,
        campaign,
        items_str,
        f\"{data['subtotal']:.2f}\",
        f\"{data['tax']:.2f}\",
        f\"{data['total']:.2f}\"
    ])

print(output.getvalue().strip())
"

echo "Done." >&2
