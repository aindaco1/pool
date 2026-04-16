#!/bin/bash
# Seed local KV with representative pledge data for the current campaign catalog.
#
# Campaign scenarios:
# - hand-relations: Ended, partial funding (~$8,200 / $25,000 goal)
# - sunder: Live, early funding (~$650 / $2,500 goal)
# - tecolote: Ended, partial funding (~$1,550 / $2,000 goal)
# - worst-movie-ever: Ended, partial funding (~$1,290 / $2,500 goal)
#
# Usage: ./scripts/seed-all-campaigns.sh
#
# ⚠️  This writes to LOCAL KV simulation only (used by wrangler dev without --remote)

set -e

if [ -f "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use 20 >/dev/null 2>&1 || true
fi

cd "$(dirname "$0")/../worker"

TAX_RATE="0.07875"
CAMPAIGNS=("hand-relations" "sunder" "tecolote" "worst-movie-ever")

echo "🧹 Clearing existing pledge data from local KV..."

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

for slug in "${CAMPAIGNS[@]}"; do
  echo "y" | wrangler kv key delete "stats:$slug" --binding PLEDGES --local --preview >/dev/null 2>&1
  echo "y" | wrangler kv key delete "inventory:$slug" --binding PLEDGES --local --preview >/dev/null 2>&1
done
echo "   Deleted stats and inventory keys"

echo ""
echo "🌱 Seeding test pledges for current campaigns..."
echo ""

create_pledge() {
  local ORDER_ID="$1"
  local EMAIL="$2"
  local CAMPAIGN="$3"
  local TIER_ID="$4"
  local TIER_NAME="$5"
  local TIER_QTY="$6"
  local SUBTOTAL="$7"
  local STATUS="$8"
  local CHARGED="$9"
  local CREATED_AT="${10}"

  local TAX
  TAX=$(python3 -c "import math; print(round($SUBTOTAL * $TAX_RATE))")
  local TOTAL=$((SUBTOTAL + TAX))

  local JSON
  JSON=$(cat <<EOF
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

  local TMPFILE
  TMPFILE=$(mktemp)
  echo "$JSON" > "$TMPFILE"
  wrangler kv key put "pledge:$ORDER_ID" --binding PLEDGES --local --preview --path "$TMPFILE" >/dev/null 2>&1
  rm -f "$TMPFILE"
}

create_cancelled_pledge() {
  local ORDER_ID="$1"
  local EMAIL="$2"
  local CAMPAIGN="$3"
  local TIER_ID="$4"
  local TIER_NAME="$5"
  local TIER_QTY="$6"
  local SUBTOTAL="$7"
  local CREATED_AT="$8"
  local CANCELLED_AT="$9"

  local TAX
  TAX=$(python3 -c "import math; print(round($SUBTOTAL * $TAX_RATE))")
  local TOTAL=$((SUBTOTAL + TAX))

  local JSON
  JSON=$(cat <<EOF
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

  local TMPFILE
  TMPFILE=$(mktemp)
  echo "$JSON" > "$TMPFILE"
  wrangler kv key put "pledge:$ORDER_ID" --binding PLEDGES --local --preview --path "$TMPFILE" >/dev/null 2>&1
  rm -f "$TMPFILE"
}

create_modified_pledge() {
  local ORDER_ID="$1"
  local EMAIL="$2"
  local CAMPAIGN="$3"
  local ORIG_TIER_ID="$4"
  local ORIG_TIER_QTY="$5"
  local ORIG_SUBTOTAL="$6"
  local CREATED_AT="$7"
  local NEW_TIER_ID="$8"
  local NEW_TIER_NAME="$9"
  local NEW_TIER_QTY="${10}"
  local NEW_SUBTOTAL="${11}"
  local MODIFIED_AT="${12}"
  local STATUS="${13:-active}"
  local CHARGED="${14:-false}"

  local ORIG_TAX
  ORIG_TAX=$(python3 -c "import math; print(round($ORIG_SUBTOTAL * $TAX_RATE))")
  local ORIG_TOTAL=$((ORIG_SUBTOTAL + ORIG_TAX))
  local NEW_TAX
  NEW_TAX=$(python3 -c "import math; print(round($NEW_SUBTOTAL * $TAX_RATE))")
  local NEW_TOTAL=$((NEW_SUBTOTAL + NEW_TAX))

  local SUBTOTAL_DELTA=$((NEW_SUBTOTAL - ORIG_SUBTOTAL))
  local TAX_DELTA=$((NEW_TAX - ORIG_TAX))
  local AMOUNT_DELTA=$((NEW_TOTAL - ORIG_TOTAL))

  local JSON
  JSON=$(cat <<EOF
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

  local TMPFILE
  TMPFILE=$(mktemp)
  echo "$JSON" > "$TMPFILE"
  wrangler kv key put "pledge:$ORDER_ID" --binding PLEDGES --local --preview --path "$TMPFILE" >/dev/null 2>&1
  rm -f "$TMPFILE"
}

echo "📽️  hand-relations (ended, partial: \$8,200 / \$25,000)"
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
create_cancelled_pledge "pledge-hr-011" "walt@cancelled.com" "hand-relations" "creature-cameo" "Creature Cameo" 2 100000 "2026-01-08T10:00:00Z" "2026-01-10T16:00:00Z"
create_pledge "pledge-hr-012" "xena@failed.com" "hand-relations" "creature-cameo" "Creature Cameo" 1 50000 "payment_failed" "false" "2026-01-12T12:00:00Z"
create_pledge "pledge-hr-013" "yara@example.com" "hand-relations" "sfx-slot" "SFX Slot" 3 7500 "active" "false" "2026-01-15T10:00:00Z"
create_pledge "pledge-hr-014" "zack@example.com" "hand-relations" "direct-action" "Direct Action" 3 45000 "active" "false" "2026-01-18T14:00:00Z"
create_modified_pledge "pledge-hr-015" "nina@example.com" "hand-relations" \
  "sfx-slot" 2 5000 "2025-12-08T10:00:00Z" \
  "direct-action" "Direct Action" 1 15000 "2025-12-12T16:00:00Z"
create_modified_pledge "pledge-hr-016" "oscar@example.com" "hand-relations" \
  "creature-cameo" 1 50000 "2025-12-14T09:00:00Z" \
  "sfx-slot" "SFX Slot" 5 12500 "2025-12-16T11:00:00Z"
echo "  ✓ 16 pledges (1 cancelled, 1 failed, 2 modified)"

echo "📽️  sunder (live, early: \$650 / \$2,500)"
create_pledge "pledge-su-001" "mina@example.com" "sunder" "screw-goodies" "screw goodies!" 5 5000 "active" "false" "2026-04-02T10:00:00Z"
create_pledge "pledge-su-002" "blake@example.com" "sunder" "some-goodies" "some goodies" 4 8000 "active" "false" "2026-04-03T15:00:00Z"
create_pledge "pledge-su-003" "sabrina@example.com" "sunder" "physical-media" "physical media" 3 10500 "active" "false" "2026-04-05T09:00:00Z"
create_pledge "pledge-su-004" "aidan@example.com" "sunder" "fan" "fan" 2 11000 "active" "false" "2026-04-06T12:00:00Z"
create_pledge "pledge-su-005" "darling@example.com" "sunder" "special-thanks" "special thanks" 1 50000 "active" "false" "2026-04-08T18:00:00Z"
echo "  ✓ 5 pledges"

echo "📽️  tecolote (ended, partial: \$1,550 / \$2,000)"
create_pledge "pledge-te-001" "nata@example.com" "tecolote" "thanks" "Thanks!" 50 5000 "active" "false" "2026-02-18T10:00:00Z"
create_pledge "pledge-te-002" "joe@example.com" "tecolote" "special-thanks" "Special Thanks" 10 10000 "active" "false" "2026-02-20T12:00:00Z"
create_pledge "pledge-te-003" "diego@example.com" "tecolote" "tshirt" "T-Shirt" 10 30000 "active" "false" "2026-02-24T09:00:00Z"
create_pledge "pledge-te-004" "maiz@example.com" "tecolote" "poster" "Poster" 10 25000 "active" "false" "2026-02-27T14:00:00Z"
create_pledge "pledge-te-005" "arcadio@example.com" "tecolote" "exclusive-tshirt" "Exclusive T-Shirt" 5 17500 "active" "false" "2026-03-01T11:00:00Z"
create_pledge "pledge-te-006" "ulises@example.com" "tecolote" "auteur" "Auteur" 3 30000 "active" "false" "2026-03-03T16:00:00Z"
create_pledge "pledge-te-007" "vidal@example.com" "tecolote" "executive-producer" "Executive Producer" 2 40000 "active" "false" "2026-03-05T13:00:00Z"
create_cancelled_pledge "pledge-te-008" "cancelled@tecolote.com" "tecolote" "poster" "Poster" 2 5000 "2026-03-06T10:00:00Z" "2026-03-10T12:00:00Z"
echo "  ✓ 8 pledges (1 cancelled)"

echo "📽️  worst-movie-ever (ended, partial: \$1,290 / \$2,500)"
create_pledge "pledge-wme-001" "alice@example.com" "worst-movie-ever" "frame" "One Frame" 50 5000 "active" "false" "2025-12-05T10:00:00Z"
create_pledge "pledge-wme-002" "brian@example.com" "worst-movie-ever" "writer-credit" "Writer Credit" 10 5000 "active" "false" "2025-12-10T14:00:00Z"
create_pledge "pledge-wme-003" "claire@example.com" "worst-movie-ever" "sound-effect" "Sound Effect" 5 10000 "active" "false" "2025-12-15T09:00:00Z"
create_pledge "pledge-wme-004" "derek@example.com" "worst-movie-ever" "dialogue" "Line of Dialogue" 2 10000 "active" "false" "2025-12-20T11:00:00Z"
create_pledge "pledge-wme-005" "elena@example.com" "worst-movie-ever" "prop" "Handheld Prop" 1 10000 "active" "false" "2025-12-25T16:00:00Z"
create_pledge "pledge-wme-006" "felix@example.com" "worst-movie-ever" "prop" "Handheld Prop" 3 30000 "active" "false" "2025-12-28T12:00:00Z"
create_pledge "pledge-wme-007" "gina@example.com" "worst-movie-ever" "dialogue" "Line of Dialogue" 5 25000 "active" "false" "2025-12-30T10:00:00Z"
create_pledge "pledge-wme-008" "hank@example.com" "worst-movie-ever" "sound-effect" "Sound Effect" 10 20000 "active" "false" "2026-01-02T14:00:00Z"
create_cancelled_pledge "pledge-wme-009" "ivy@cancelled.com" "worst-movie-ever" "prop" "Handheld Prop" 2 20000 "2026-01-02T09:00:00Z" "2026-01-05T14:00:00Z"
create_pledge "pledge-wme-010" "jake@example.com" "worst-movie-ever" "writer-credit" "Writer Credit" 10 5000 "active" "false" "2026-01-08T11:00:00Z"
create_modified_pledge "pledge-wme-011" "brian@example.com" "worst-movie-ever" \
  "writer-credit" 5 2500 "2025-12-08T10:00:00Z" \
  "dialogue" "Line of Dialogue" 1 5000 "2025-12-12T14:00:00Z"
create_modified_pledge "pledge-wme-012" "claire@example.com" "worst-movie-ever" \
  "prop" 1 10000 "2025-12-10T09:00:00Z" \
  "sound-effect" "Sound Effect" 2 4000 "2025-12-14T11:00:00Z"
echo "  ✓ 12 pledges (1 cancelled, 2 modified)"

echo ""
echo "✅ Seeded pledges for current campaigns"
echo ""
echo "📊 Summary (approximate - includes modified pledge values):"
echo "   hand-relations:    ~\$8,200 / \$25,000 (ended, partial)"
echo "   sunder:            ~\$650 / \$2,500 (live, early)"
echo "   tecolote:          ~\$1,550 / \$2,000 (ended, partial)"
echo "   worst-movie-ever:  ~\$1,290 / \$2,500 (ended, partial)"
echo ""
echo "🔄 Recalculating stats for each campaign..."

ADMIN_SECRET=$(grep "^ADMIN_SECRET=" .dev.vars 2>/dev/null | sed 's/^ADMIN_SECRET=//')

for slug in "${CAMPAIGNS[@]}"; do
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

for slug in "${CAMPAIGNS[@]}"; do
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
