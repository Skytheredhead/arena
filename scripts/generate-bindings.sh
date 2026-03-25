#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

db_name="${SPACETIMEDB_DB_NAME:-${VITE_SPACETIMEDB_DATABASE:-arena-fps-slice}}"
module_path="${SPACETIMEDB_MODULE_PATH:-apps/server}"

ensure_spacetime_cli() {
  if command -v spacetime >/dev/null 2>&1; then
    return
  fi

  echo "Installing SpacetimeDB CLI..."
  curl -sSf https://install.spacetimedb.com | sh -s -- -y

  export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$HOME/bin:$PATH"
  if command -v spacetime >/dev/null 2>&1; then
    return
  fi

  local found
  found="$(find "$HOME" -maxdepth 4 -type f -name spacetime 2>/dev/null | head -n 1 || true)"
  if [[ -z "$found" ]]; then
    echo "Unable to locate the SpacetimeDB CLI after installation." >&2
    exit 1
  fi
  export PATH="$(dirname "$found"):$PATH"
}

ensure_spacetime_cli

if ! command -v spacetime >/dev/null 2>&1; then
  echo "SpacetimeDB CLI is still unavailable after installation." >&2
  exit 1
fi

echo "Using spacetime binary at: $(command -v spacetime)"
spacetime --version || true

if [[ ! -d "$module_path" ]]; then
  echo "SpacetimeDB module path does not exist: $module_path" >&2
  exit 1
fi

echo "Generating SpacetimeDB bindings from module source at $module_path for $db_name..."
spacetime generate \
  --lang typescript \
  --module-path "$module_path" \
  --out-dir apps/client/src/generated/module_bindings \
  --include-private
