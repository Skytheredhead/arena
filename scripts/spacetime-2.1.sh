#!/usr/bin/env bash
set -euo pipefail

spacetime_bin="${SPACETIME_BIN:-}"
if [[ -z "$spacetime_bin" ]]; then
  versioned_bin="${HOME}/.local/share/spacetime/bin/2.1.0/spacetimedb-cli"
  if [[ -x "$versioned_bin" ]]; then
    spacetime_bin="$versioned_bin"
  else
    spacetime_bin="spacetime"
  fi
fi

version_output="$("$spacetime_bin" --version 2>&1)"
if [[ "$version_output" != *"tool version 2.1.0"* ]]; then
  echo "Arena requires the SpacetimeDB CLI tool version 2.1.0." >&2
  echo "$version_output" >&2
  exit 2
fi

if command -v rustup >/dev/null 2>&1; then
  rustup_cargo="$(rustup which cargo)"
  export PATH="$(dirname "$rustup_cargo"):$PATH"
fi

exec "$spacetime_bin" "$@"
