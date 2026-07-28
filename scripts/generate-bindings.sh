#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bindings_dir="$repo_root/apps/client/src/generated/module_bindings"

mkdir -p "$bindings_dir"
"$repo_root/scripts/spacetime-2.1.sh" generate \
  --lang typescript \
  --out-dir "$bindings_dir" \
  --module-path "$repo_root/apps/server" \
  --yes
