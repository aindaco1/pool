#!/bin/bash
# Seed test pledges for ALL campaigns into local KV simulation
#
# Campaign scenarios:
# - beneath-static: Past deadline, NOT funded ($5,000 of $8,000 goal)
# - common-ground: Past deadline, EXCEEDED goal ($15,000 of $12,000 goal)
# - hand-relations: Live, partial funding ($8,000 of $25,000 goal)
# - night-work: Upcoming, NO pledges
# - worst-movie-ever: Live, partial funding ($1,200 of $2,500 goal)
#
# Usage: ./scripts/seed-all-campaigns.sh
#
# ⚠️  This writes to LOCAL KV simulation only (used by wrangler dev without --remote)

set -e

# Use Node 20 if available via nvm
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use 20 >/dev/null 2>&1 || true
fi

cd "$(dirname "$0")/../worker"

TAX_RATE="0.07875"

echo "🧹 Clearing existing pledge data from local KV..."

# Delete all existing pledge keys
KEYS=$(wrangler kv key list --binding PLEDGES --local --preview 2>/dev/null | \
  python3 -c "import sys,json; [print(k['name']) for k in json.load(sys.stdin) if k['name'].startswith('pledge:')]" 2>/dev/null || echo "")
COUNT=0
for KEY in $KEYS; do
  if [[ -n "$KEY" ]]; then
    echo "y" | wrangler kv key delete "$KEY" --binding PLEDGES --local --preview >/dev/null 2>&1
    COUNT=$((COUNT + 1))
  fi
done
echo "   Deleted $COUNT existing pledges"

# Delete stats keys
for slug in beneath-static common-ground hand-relations night-work worst-movie-ever; do
  echo "y" | wrangler kv key delete "stats:$slug" --binding PLEDGES --local --preview >/dev/null 2>&1
done
echo "   Deleted stats keys"

# Delete inventory keys  
for slug in beneath-static common-ground hand-relations night-work worst-movie-ever; do
  echo "y" | wrangler kv key delete "inventory:$slug" --binding PLEDGES --local --preview >/dev/null 2>&1
done
echo "   Deleted inventory keys"

echo ""
echo "🌱 Seeding test pledges for all campaigns..."
echo ""

# Function to create a pledge
create_pledge() {
  local ORDER_ID="$1"
  local EMAIL="$2"
  local CAMPAIGN="$3"
  local TIER_ID="$4"
  local TIER_NAME="$5"
  local TIER_QTY="$6"
  local SUBTOTAL="$7"  # in cents
  local STATUS="$8"
  local CHARGED="$9"
  local CREATED_AT="${10}"

  # Calculate tax and total
  local TAX=$(python3 -c "import math; print(round($SUBTOTAL * $TAX_RATE))")
  local TOTAL=$((SUBTOTAL + TAX))

  local JSON=$(cat <<EOF
{
  "orderId": "$ORDER_ID",
  "email": "$EMAIL",
  "campaignSlug": "$CAMPAIGN",
  "tierId": "$TIER_ID",
  "tierName": "$TIER_NAME",
  "tierQty": $TIER_QTY,
  "subtotal": $SUBTOTAL,
  "tax": $TAX,
  "amount": $TOTAL,
  "stripeCustomerId": "cus_test_$(echo $ORDER_ID | md5 | cut -c1-10)",
  "stripePaymentMethodId": "pm_test_$(echo $ORDER_ID | md5 | cut -c1-10)",
  "stripeSetupIntentId": "seti_test_$(echo $ORDER_ID | md5 | cut -c1-10)",
  "pledgeStatus": "$STATUS",
  "charged": $CHARGED,
  "createdAt": "$CREATED_AT",
  "updatedAt": "$CREATED_AT",
  "history": [{"type": "created", "subtotal": $SUBTOTAL, "tax": $TAX, "amount": $TOTAL, "tierId": "$TIER_ID", "tierQty": $TIER_QTY, "at": "$CREATED_AT"}]
}
EOF
)

  local TMPFILE=$(mktemp)
  echo "$JSON" > "$TMPFILE"
  wrangler kv key put "pledge:$ORDER_ID" --binding PLEDGES --local --preview --path "$TMPFILE" >/dev/null 2>&1
  rm -f "$TMPFILE"
}

# Function to create a cancelled pledge (with proper cancellation history)
create_cancelled_pledge() {
  local ORDER_ID="$1"
  local EMAIL="$2"
  local CAMPAIGN="$3"
  local TIER_ID="$4"
  local TIER_NAME="$5"
  local TIER_QTY="$6"
  local SUBTOTAL="$7"  # in cents
  local CREATED_AT="$8"
  local CANCELLED_AT="$9"

  # Calculate tax and total
  local TAX=$(python3 -c "import math; print(round($SUBTOTAL * $TAX_RATE))")
  local TOTAL=$((SUBTOTAL + TAX))

  local JSON=$(cat <<EOF
{
  "orderId": "$ORDER_ID",
  "email": "$EMAIL",
  "campaignSlug": "$CAMPAIGN",
  "tierId": "$TIER_ID",
  "tierName": "$TIER_NAME",
  "tierQty": $TIER_QTY,
  "subtotal": $SUBTOTAL,
  "tax": $TAX,
  "amount": $TOTAL,
  "stripeCustomerId": "cus_test_$(echo $ORDER_ID | md5 | cut -c1-10)",
  "stripePaymentMethodId": "pm_test_$(echo $ORDER_ID | md5 | cut -c1-10)",
  "stripeSetupIntentId": "seti_test_$(echo $ORDER_ID | md5 | cut -c1-10)",
  "pledgeStatus": "cancelled",
  "charged": false,
  "createdAt": "$CREATED_AT",
  "cancelledAt": "$CANCELLED_AT",
  "updatedAt": "$CANCELLED_AT",
  "history": [
    {"type": "created", "subtotal": $SUBTOTAL, "tax": $TAX, "amount": $TOTAL, "tierId": "$TIER_ID", "tierQty": $TIER_QTY, "at": "$CREATED_AT"},
    {"type": "cancelled", "subtotalDelta": -$SUBTOTAL, "taxDelta": -$TAX, "amountDelta": -$TOTAL, "at": "$CANCELLED_AT"}
  ]
}
EOF
)

  local TMPFILE=$(mktemp)
  echo "$JSON" > "$TMPFILE"
  wrangler kv key put "pledge:$ORDER_ID" --binding PLEDGES --local --preview --path "$TMPFILE" >/dev/null 2>&1
  rm -f "$TMPFILE"
}

# Function to create a modified pledge (with upgrade/downgrade history)
create_modified_pledge() {
  local ORDER_ID="$1"
  local EMAIL="$2"
  local CAMPAIGN="$3"
  # Original tier
  local ORIG_TIER_ID="$4"
  local ORIG_TIER_QTY="$5"
  local ORIG_SUBTOTAL="$6"
  local CREATED_AT="$7"
  # New tier (after modification)
  local NEW_TIER_ID="$8"
  local NEW_TIER_NAME="$9"
  local NEW_TIER_QTY="${10}"
  local NEW_SUBTOTAL="${11}"
  local MODIFIED_AT="${12}"
  local STATUS="${13:-active}"
  local CHARGED="${14:-false}"

  # Calculate taxes
  local ORIG_TAX=$(python3 -c "import math; print(round($ORIG_SUBTOTAL * $TAX_RATE))")
  local ORIG_TOTAL=$((ORIG_SUBTOTAL + ORIG_TAX))
  local NEW_TAX=$(python3 -c "import math; print(round($NEW_SUBTOTAL * $TAX_RATE))")
  local NEW_TOTAL=$((NEW_SUBTOTAL + NEW_TAX))
  
  # Calculate deltas
  local SUBTOTAL_DELTA=$((NEW_SUBTOTAL - ORIG_SUBTOTAL))
  local TAX_DELTA=$((NEW_TAX - ORIG_TAX))
  local AMOUNT_DELTA=$((NEW_TOTAL - ORIG_TOTAL))

  local JSON=$(cat <<EOF
{
  "orderId": "$ORDER_ID",
  "email": "$EMAIL",
  "campaignSlug": "$CAMPAIGN",
  "tierId": "$NEW_TIER_ID",
  "tierName": "$NEW_TIER_NAME",
  "tierQty": $NEW_TIER_QTY,
  "subtotal": $NEW_SUBTOTAL,
  "tax": $NEW_TAX,
  "amount": $NEW_TOTAL,
  "stripeCustomerId": "cus_test_$(echo $ORDER_ID | md5 | cut -c1-10)",
  "stripePaymentMethodId": "pm_test_$(echo $ORDER_ID | md5 | cut -c1-10)",
  "stripeSetupIntentId": "seti_test_$(echo $ORDER_ID | md5 | cut -c1-10)",
  "pledgeStatus": "$STATUS",
  "charged": $CHARGED,
  "createdAt": "$CREATED_AT",
  "modifiedAt": "$MODIFIED_AT",
  "updatedAt": "$MODIFIED_AT",
  "history": [
    {"type": "created", "subtotal": $ORIG_SUBTOTAL, "tax": $ORIG_TAX, "amount": $ORIG_TOTAL, "tierId": "$ORIG_TIER_ID", "tierQty": $ORIG_TIER_QTY, "at": "$CREATED_AT"},
    {"type": "modified", "subtotalDelta": $SUBTOTAL_DELTA, "taxDelta": $TAX_DELTA, "amountDelta": $AMOUNT_DELTA, "tierId": "$NEW_TIER_ID", "tierQty": $NEW_TIER_QTY, "at": "$MODIFIED_AT"}
  ]
}
EOF
)

  local TMPFILE=$(mktemp)
  echo "$JSON" > "$TMPFILE"
  wrangler kv key put "pledge:$ORDER_ID" --binding PLEDGES --local --preview --path "$TMPFILE" >/dev/null 2>&1
  rm -f "$TMPFILE"
}

# ============================================
# BENEATH STATIC - Past, NOT funded ($5,000 of $8,000)
# ============================================
echo "📽️  beneath-static (past, not funded: \$5,000 / \$8,000)"

# digital-copy: $25, producer-credit: $100
create_pledge "pledge-bs-001" "alex@example.com" "beneath-static" "digital-copy" "Digital Copy" 1 2500 "active" "false" "2025-10-15T10:00:00Z"
create_pledge "pledge-bs-002" "beth@example.com" "beneath-static" "digital-copy" "Digital Copy" 1 2500 "active" "false" "2025-10-20T14:00:00Z"
create_pledge "pledge-bs-003" "carl@example.com" "beneath-static" "producer-credit" "Producer Credit" 1 10000 "active" "false" "2025-10-25T09:00:00Z"
create_pledge "pledge-bs-004" "dana@example.com" "beneath-static" "producer-credit" "Producer Credit" 2 20000 "active" "false" "2025-11-01T11:00:00Z"
create_pledge "pledge-bs-005" "evan@example.com" "beneath-static" "producer-credit" "Producer Credit" 1 10000 "active" "false" "2025-11-10T16:00:00Z"
create_pledge "pledge-bs-006" "fran@example.com" "beneath-static" "digital-copy" "Digital Copy" 2 5000 "active" "false" "2025-11-15T12:00:00Z"
# Total: $500 (5000 cents) - Wait, need more...
# Let me recalculate: 2500 + 2500 + 10000 + 20000 + 10000 + 5000 = 50000 cents = $500
# Need $5000 = 500000 cents. Adding more:
create_pledge "pledge-bs-007" "gary@example.com" "beneath-static" "producer-credit" "Producer Credit" 10 100000 "active" "false" "2025-11-18T10:00:00Z"
create_pledge "pledge-bs-008" "holly@example.com" "beneath-static" "producer-credit" "Producer Credit" 20 200000 "active" "false" "2025-11-20T14:00:00Z"
create_pledge "pledge-bs-009" "ivan@example.com" "beneath-static" "producer-credit" "Producer Credit" 10 100000 "active" "false" "2025-11-25T09:00:00Z"
# Cancelled pledge (doesn't count toward total)
create_cancelled_pledge "pledge-bs-010" "jay@cancelled.com" "beneath-static" "producer-credit" "Producer Credit" 5 50000 "2025-11-25T11:00:00Z" "2025-11-28T14:00:00Z"
# Modified pledge: alex upgraded from digital-copy to producer-credit
create_modified_pledge "pledge-bs-011" "alex@example.com" "beneath-static" \
  "digital-copy" 1 2500 "2025-10-16T10:00:00Z" \
  "producer-credit" "Producer Credit" 1 10000 "2025-10-20T15:00:00Z"
echo "  ✓ 11 pledges (1 cancelled, 1 modified)"

# ============================================
# COMMON GROUND - Past, EXCEEDED goal ($15,000 of $12,000)
# ============================================
echo "📽️  common-ground (past, exceeded: \$15,000 / \$12,000)"

# screening-ticket: $50, production-photo: $150
create_pledge "pledge-cg-001" "anna@example.com" "common-ground" "screening-ticket" "Screening Ticket" 2 10000 "charged" "true" "2025-08-10T10:00:00Z"
create_pledge "pledge-cg-002" "bob@example.com" "common-ground" "production-photo" "Production Photo" 1 15000 "charged" "true" "2025-08-15T14:00:00Z"
create_pledge "pledge-cg-003" "cathy@example.com" "common-ground" "screening-ticket" "Screening Ticket" 4 20000 "charged" "true" "2025-08-20T09:00:00Z"
create_pledge "pledge-cg-004" "david@example.com" "common-ground" "production-photo" "Production Photo" 2 30000 "charged" "true" "2025-08-25T11:00:00Z"
create_pledge "pledge-cg-005" "emma@example.com" "common-ground" "production-photo" "Production Photo" 5 75000 "charged" "true" "2025-09-01T16:00:00Z"
create_pledge "pledge-cg-006" "frank@example.com" "common-ground" "screening-ticket" "Screening Ticket" 10 50000 "charged" "true" "2025-09-05T12:00:00Z"
create_pledge "pledge-cg-007" "grace@example.com" "common-ground" "production-photo" "Production Photo" 10 150000 "charged" "true" "2025-09-10T10:00:00Z"
create_pledge "pledge-cg-008" "henry@example.com" "common-ground" "production-photo" "Production Photo" 20 300000 "charged" "true" "2025-09-15T14:00:00Z"
create_pledge "pledge-cg-009" "iris@example.com" "common-ground" "production-photo" "Production Photo" 30 450000 "charged" "true" "2025-09-20T09:00:00Z"
create_pledge "pledge-cg-010" "jack@example.com" "common-ground" "screening-ticket" "Screening Ticket" 20 100000 "charged" "true" "2025-09-25T11:00:00Z"
create_pledge "pledge-cg-011" "kate@example.com" "common-ground" "production-photo" "Production Photo" 20 300000 "charged" "true" "2025-09-28T16:00:00Z"
# Modified pledge: bob upgraded from screening-ticket to production-photo (charged after modification)
create_modified_pledge "pledge-cg-012" "bob@example.com" "common-ground" \
  "screening-ticket" 2 10000 "2025-08-12T10:00:00Z" \
  "production-photo" "Production Photo" 1 15000 "2025-08-18T11:00:00Z" \
  "charged" "true"
# Total: 10000+15000+20000+30000+75000+50000+150000+300000+450000+100000+300000+15000 = 1515000 cents = $15,150
echo "  ✓ 12 pledges (all charged, 1 modified)"

# ============================================
# HAND RELATIONS - Live, partial ($8,000 of $25,000)
# ============================================
echo "📽️  hand-relations (live, partial: \$8,000 / \$25,000)"

# frame-slot: $5, sfx-slot: $25, direct-action: $150, creature-cameo: $500
create_pledge "pledge-hr-001" "mike@example.com" "hand-relations" "frame-slot" "Frame Slot" 10 5000 "active" "false" "2025-12-05T10:00:00Z"
create_pledge "pledge-hr-002" "nina@example.com" "hand-relations" "sfx-slot" "SFX Slot" 5 12500 "active" "false" "2025-12-10T14:00:00Z"
create_pledge "pledge-hr-003" "oscar@example.com" "hand-relations" "direct-action" "Direct Action" 2 30000 "active" "false" "2025-12-15T09:00:00Z"
create_pledge "pledge-hr-004" "pat@example.com" "hand-relations" "creature-cameo" "Creature Cameo" 1 50000 "active" "false" "2025-12-20T11:00:00Z"
create_pledge "pledge-hr-005" "quinn@example.com" "hand-relations" "creature-cameo" "Creature Cameo" 2 100000 "active" "false" "2025-12-25T16:00:00Z"
create_pledge "pledge-hr-006" "rose@example.com" "hand-relations" "direct-action" "Direct Action" 5 75000 "active" "false" "2025-12-28T12:00:00Z"
create_pledge "pledge-hr-007" "sam@example.com" "hand-relations" "creature-cameo" "Creature Cameo" 3 150000 "active" "false" "2025-12-30T10:00:00Z"
create_pledge "pledge-hr-008" "tina@example.com" "hand-relations" "creature-cameo" "Creature Cameo" 3 150000 "active" "false" "2026-01-02T14:00:00Z"
create_pledge "pledge-hr-009" "uma@example.com" "hand-relations" "sfx-slot" "SFX Slot" 20 50000 "active" "false" "2026-01-05T09:00:00Z"
create_pledge "pledge-hr-010" "vic@example.com" "hand-relations" "direct-action" "Direct Action" 8 120000 "active" "false" "2026-01-08T11:00:00Z"
# Cancelled pledges
create_cancelled_pledge "pledge-hr-011" "walt@cancelled.com" "hand-relations" "creature-cameo" "Creature Cameo" 2 100000 "2026-01-08T10:00:00Z" "2026-01-10T16:00:00Z"
# Payment failed
create_pledge "pledge-hr-012" "xena@failed.com" "hand-relations" "creature-cameo" "Creature Cameo" 1 50000 "payment_failed" "false" "2026-01-12T12:00:00Z"
# Subtotal for active: 5000+12500+30000+50000+100000+75000+150000+150000+50000+120000 = 742500 cents
# Need $8000 = 800000 cents. Close enough with some additional:
create_pledge "pledge-hr-013" "yara@example.com" "hand-relations" "sfx-slot" "SFX Slot" 3 7500 "active" "false" "2026-01-15T10:00:00Z"
# Total active: 750000 = $7,500. Let's add one more:
create_pledge "pledge-hr-014" "zack@example.com" "hand-relations" "direct-action" "Direct Action" 3 45000 "active" "false" "2026-01-18T14:00:00Z"
# Modified pledge: nina upgraded from sfx-slot to direct-action
create_modified_pledge "pledge-hr-015" "nina@example.com" "hand-relations" \
  "sfx-slot" 2 5000 "2025-12-08T10:00:00Z" \
  "direct-action" "Direct Action" 1 15000 "2025-12-12T16:00:00Z"
# Modified pledge: oscar downgraded from creature-cameo to sfx-slot
create_modified_pledge "pledge-hr-016" "oscar@example.com" "hand-relations" \
  "creature-cameo" 1 50000 "2025-12-14T09:00:00Z" \
  "sfx-slot" "SFX Slot" 5 12500 "2025-12-16T11:00:00Z"
echo "  ✓ 16 pledges (1 cancelled, 1 failed, 2 modified)"

# ============================================
# NIGHT WORK - Upcoming, NO pledges
# ============================================
echo "📽️  night-work (upcoming, no pledges)"
echo "  ✓ 0 pledges"

# ============================================
# WORST MOVIE EVER - Live, partial ($1,200 of $2,500)
# ============================================
echo "📽️  worst-movie-ever (live, partial: \$1,200 / \$2,500)"

# frame: $1, writer-credit: $5, sound-effect: $20, dialogue: $50, prop: $100
create_pledge "pledge-wme-001" "alice@example.com" "worst-movie-ever" "frame" "One Frame" 50 5000 "active" "false" "2025-12-05T10:00:00Z"
create_pledge "pledge-wme-002" "brian@example.com" "worst-movie-ever" "writer-credit" "Writer Credit" 10 5000 "active" "false" "2025-12-10T14:00:00Z"
create_pledge "pledge-wme-003" "claire@example.com" "worst-movie-ever" "sound-effect" "Sound Effect" 5 10000 "active" "false" "2025-12-15T09:00:00Z"
create_pledge "pledge-wme-004" "derek@example.com" "worst-movie-ever" "dialogue" "Line of Dialogue" 2 10000 "active" "false" "2025-12-20T11:00:00Z"
create_pledge "pledge-wme-005" "elena@example.com" "worst-movie-ever" "prop" "Handheld Prop" 1 10000 "active" "false" "2025-12-25T16:00:00Z"
create_pledge "pledge-wme-006" "felix@example.com" "worst-movie-ever" "prop" "Handheld Prop" 3 30000 "active" "false" "2025-12-28T12:00:00Z"
create_pledge "pledge-wme-007" "gina@example.com" "worst-movie-ever" "dialogue" "Line of Dialogue" 5 25000 "active" "false" "2025-12-30T10:00:00Z"
create_pledge "pledge-wme-008" "hank@example.com" "worst-movie-ever" "sound-effect" "Sound Effect" 10 20000 "active" "false" "2026-01-02T14:00:00Z"
# Cancelled
create_cancelled_pledge "pledge-wme-009" "ivy@cancelled.com" "worst-movie-ever" "prop" "Handheld Prop" 2 20000 "2026-01-02T09:00:00Z" "2026-01-05T14:00:00Z"
# Total active: 5000+5000+10000+10000+10000+30000+25000+20000 = 115000 cents = $1,150
# Need $1,200 = 120000. Add one more small one:
create_pledge "pledge-wme-010" "jake@example.com" "worst-movie-ever" "writer-credit" "Writer Credit" 10 5000 "active" "false" "2026-01-08T11:00:00Z"
# Modified pledge: brian upgraded from writer-credit to dialogue
create_modified_pledge "pledge-wme-011" "brian@example.com" "worst-movie-ever" \
  "writer-credit" 5 2500 "2025-12-08T10:00:00Z" \
  "dialogue" "Line of Dialogue" 1 5000 "2025-12-12T14:00:00Z"
# Modified pledge: claire downgraded from prop to sound-effect
create_modified_pledge "pledge-wme-012" "claire@example.com" "worst-movie-ever" \
  "prop" 1 10000 "2025-12-10T09:00:00Z" \
  "sound-effect" "Sound Effect" 2 4000 "2025-12-14T11:00:00Z"
# Total with modifications: 120000 + 5000 + 4000 = 129000 = $1,290 (modified pledges add to total)
echo "  ✓ 12 pledges (1 cancelled, 2 modified)"

echo ""
echo "✅ Seeded pledges for all campaigns"
echo ""
echo "📊 Summary (approximate - includes modified pledge values):"
echo "   beneath-static:    ~\$4,600 / \$8,000 (not funded, past deadline)"
echo "   common-ground:     ~\$15,150 / \$12,000 (exceeded, past deadline)"
echo "   hand-relations:    ~\$8,200 / \$25,000 (partial, live)"
echo "   night-work:        \$0 / \$15,000 (upcoming)"
echo "   worst-movie-ever:  ~\$1,290 / \$2,500 (partial, live)"
echo ""
echo "🔄 Recalculating stats for each campaign..."

# Recalculate stats using the test endpoint (or admin endpoint)
ADMIN_SECRET=$(grep "^ADMIN_SECRET=" .dev.vars 2>/dev/null | sed 's/^ADMIN_SECRET=//')

for slug in beneath-static common-ground hand-relations worst-movie-ever; do
  RESULT=$(curl -s -X POST "http://localhost:8787/stats/$slug/recalculate" \
    -H "Authorization: Bearer $ADMIN_SECRET" 2>/dev/null)
  if echo "$RESULT" | grep -q '"pledgedAmount"'; then
    PLEDGED=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('stats',{}).get('pledgedAmount', 0) / 100)" 2>/dev/null)
    echo "   $slug: \$$PLEDGED"
  else
    echo "   $slug: (could not recalculate - is worker running?)"
  fi
done

echo ""
echo "🔄 Recalculating tier inventory..."

for slug in beneath-static common-ground hand-relations worst-movie-ever; do
  RESULT=$(curl -s -X POST "http://localhost:8787/inventory/$slug/recalculate" \
    -H "Authorization: Bearer $ADMIN_SECRET" 2>/dev/null)
  if echo "$RESULT" | grep -q '"success"'; then
    echo "   $slug: ✓"
  else
    echo "   $slug: (could not recalculate)"
  fi
done

echo ""
echo "Done! View at http://127.0.0.1:4000"
