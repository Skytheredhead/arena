#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if command -v rustup >/dev/null 2>&1; then
  rustup_cargo="$(rustup which cargo)"
  export PATH="$(dirname "$rustup_cargo"):$PATH"
fi

if [[ "$(uname -s)" == "Darwin" ]]; then
  # Spacetime host imports are resolved by the database runtime in WASM.
  # Let the native macOS test dylib leave those symbols unresolved.
  export RUSTFLAGS="${RUSTFLAGS:-} -C link-arg=-undefined -C link-arg=dynamic_lookup"
fi

cargo test --manifest-path "$repo_root/apps/server/Cargo.toml"
