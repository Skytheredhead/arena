#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

raw_server="${SPACETIMEDB_GENERATE_SERVER:-${VITE_SPACETIMEDB_REMOTE_URI:-http://127.0.0.1:4789}}"
db_name="${SPACETIMEDB_DB_NAME:-${VITE_SPACETIMEDB_DATABASE:-arena-fps-slice}}"

normalize_server_url() {
  local value="$1"
  case "$value" in
    wss://*)
      printf 'https://%s\n' "${value#wss://}"
      ;;
    ws://*)
      printf 'http://%s\n' "${value#ws://}"
      ;;
    http://*|https://*)
      printf '%s\n' "$value"
      ;;
    *)
      printf 'https://%s\n' "$value"
      ;;
  esac
}

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

server_url="$(normalize_server_url "$raw_server")"
ensure_spacetime_cli

echo "Generating SpacetimeDB bindings from $server_url for $db_name..."
if ! command -v spacetime >/dev/null 2>&1; then
  echo "SpacetimeDB CLI is still unavailable after installation." >&2
  exit 1
fi

echo "Using spacetime binary at: $(command -v spacetime)"
spacetime --version || true

if spacetime server list 2>/dev/null | grep -q '^vercel-build-server'; then
  spacetime server edit vercel-build-server --url "$server_url" --no-fingerprint >/dev/null
else
  spacetime server add vercel-build-server --url "$server_url" --default --no-fingerprint >/dev/null
fi
spacetime server set-default vercel-build-server >/dev/null

spacetime generate \
  "$db_name" \
  --lang typescript \
  --out-dir apps/client/src/generated/module_bindings \
  --include-private
