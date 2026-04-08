#!/usr/bin/env bash
set -euo pipefail

cd /workspace

if [ ! -d node_modules ] || [ ! -x node_modules/.bin/playwright ]; then
  npm install
fi

exec "$@"
