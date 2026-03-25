#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

bash ./scripts/generate-bindings.sh
pnpm --filter @arena/shared build
pnpm --filter @arena/client build
