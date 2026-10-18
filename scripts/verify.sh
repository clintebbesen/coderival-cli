#!/usr/bin/env bash
# Full checks: type check (tsc --checkJs) and tests. Same command locally and in CI.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v node >/dev/null || { echo "node is required" >&2; exit 1; }
[[ -d node_modules ]] || npm ci --no-audit --no-fund
npm run check
