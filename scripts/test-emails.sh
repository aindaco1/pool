#!/bin/bash
# Test all email types against the local dev worker
#
# Usage:
#   ./scripts/test-emails.sh your-email@example.com
#
# Prerequisites:
#   - Worker running locally: cd worker && wrangler dev
#   - RESEND_API_KEY configured in worker

set -e

EMAIL="${1:-test@example.com}"
WORKER_URL="${2:-http://localhost:8787}"
CAMPAIGN_SLUG="${3:-hand-relations}"

echo "=== Email Test Suite ==="
echo "Email: $EMAIL"
echo "Worker: $WORKER_URL"
echo "Campaign: $CAMPAIGN_SLUG"
echo ""

# Color helpers
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

success() {
  echo -e "${GREEN}✓ $1${NC}"
}

fail() {
  echo -e "${RED}✗ $1${NC}"
  exit 1
}

info() {
  echo -e "${YELLOW}→ $1${NC}"
}

# Setup test pledges first
echo "--- Setting up test pledges ---"
SETUP_RESPONSE=$(curl -s -X POST "$WORKER_URL/test/setup" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"campaignSlug\": \"$CAMPAIGN_SLUG\"}")

if echo "$SETUP_RESPONSE" | grep -q '"success":true'; then
  success "Test pledges created"
  MANAGE_URL=$(echo "$SETUP_RESPONSE" | grep -o '"manageUrl":"[^"]*"' | cut -d'"' -f4)
  info "Manage URL: $MANAGE_URL"
else
  echo "Response: $SETUP_RESPONSE"
  fail "Failed to create test pledges"
fi

echo ""

test_email() {
  local TYPE=$1
  local LABEL=$2
  
  echo -n "Testing $LABEL... "
  
  # Rate limit: Resend free tier allows 2 requests/second
  sleep 1
  
  RESPONSE=$(curl -s -X POST "$WORKER_URL/test/email" \
    -H "Content-Type: application/json" \
    -d "{\"type\": \"$TYPE\", \"email\": \"$EMAIL\", \"campaignSlug\": \"$CAMPAIGN_SLUG\"}")
  
  if echo "$RESPONSE" | grep -q '"success":true'; then
    success "$LABEL"
  else
    echo ""
    echo "Response: $RESPONSE"
    fail "$LABEL"
  fi
}

# Test all email types
echo "--- Pledge Lifecycle Emails ---"
test_email "supporter" "Pledge Confirmation"
test_email "modified" "Pledge Modified"
test_email "payment-failed" "Payment Failed"

echo ""
echo "--- Update Emails ---"
test_email "diary" "Diary Update"

echo ""
echo "--- Milestone Emails ---"
test_email "milestone-one-third" "1/3 Goal Milestone"
test_email "milestone-two-thirds" "2/3 Goal Milestone"
test_email "milestone-goal" "Goal Reached Milestone"
test_email "milestone-stretch" "Stretch Goal Milestone"

echo ""
echo "=== All email tests passed! ==="
echo "Check $EMAIL for the test emails."
echo "Manage links in emails will work with the test pledge data."
echo ""
echo "To clean up test data later, run:"
echo "  curl -X POST $WORKER_URL/test/cleanup"
