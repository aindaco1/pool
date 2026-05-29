#!/usr/bin/env bash
set -euo pipefail

WORKER_URL="${WORKER_URL:-http://127.0.0.1:8787}"
EMAIL="${1:-admin-smoke@example.com}"
CAMPAIGNS="${ADMIN_TEST_CAMPAIGNS:-hand-relations,smoke-editable}"

json_campaigns="$(node -e "console.log(JSON.stringify(process.argv[1].split(',').map((s) => s.trim()).filter(Boolean)))" "$CAMPAIGNS")"

curl -fsS -X POST "$WORKER_URL/test/setup" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"campaignSlugs\":${json_campaigns},\"tierQty\":1}" |
  node -e '
    let raw = "";
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      const body = JSON.parse(raw);
      if (!body.success) {
        console.error(JSON.stringify(body, null, 2));
        process.exit(1);
      }
      console.log(`Seeded ${body.pledges.length} admin test pledge(s) for ${process.argv[1]}`);
      for (const pledge of body.pledges) {
        console.log(`- ${pledge.campaignSlug}: ${pledge.orderId}`);
      }
      if (Array.isArray(body.manageLinks) && body.manageLinks.length) {
        console.log("Manage links:");
        for (const link of body.manageLinks) {
          console.log(`- ${link.campaignSlug}: ${link.manageUrl}`);
        }
      }
    });
  ' "$EMAIL"
