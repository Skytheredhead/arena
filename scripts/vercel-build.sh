#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Vercel deploys only the static frontend. SpacetimeDB bindings are checked in
# and backend/module publishing happens outside the Vercel build.
pnpm --filter @arena/shared build
pnpm --filter @arena/client build
