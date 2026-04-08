#!/usr/bin/env bash
set -euo pipefail

cd /workspace/worker

if [ ! -d node_modules ] || [ ! -x node_modules/.bin/wrangler ]; then
  npm install
fi

exec npx wrangler dev \
  --env dev \
  --port 8787 \
  --ip 0.0.0.0
