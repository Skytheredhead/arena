#!/usr/bin/env bash
set -euo pipefail

db_name="${SPACETIMEDB_DB_NAME:-arena-fps-slice}"
server_url="${SPACETIMEDB_SERVER_URL:-http://127.0.0.1:4789}"
listen_addr="${SPACETIMEDB_LISTEN_ADDR:-0.0.0.0:4789}"
log_file="${SPACETIMEDB_LOG_FILE:-/tmp/arena-spacetimedb.log}"

ensure_spacetime_cli() {
  if ! command -v spacetime >/dev/null 2>&1; then
    echo "spacetime CLI is not installed or not on PATH." >&2
    echo "Install it from https://spacetimedb.com/install or add it to PATH, then retry." >&2
    exit 1
  fi
}

server_host_port() {
  local without_scheme="${server_url#http://}"
  without_scheme="${without_scheme#https://}"
  without_scheme="${without_scheme%%/*}"
  printf '%s\n' "$without_scheme"
}

is_server_reachable() {
  local host_port host port
  host_port="$(server_host_port)"
  host="${host_port%%:*}"
  port="${host_port##*:}"

  bash -c "</dev/tcp/${host}/${port}" >/dev/null 2>&1
}

start_server_if_needed() {
  if is_server_reachable; then
    echo "SpacetimeDB is already running at ${server_url}."
    return
  fi

  echo "Starting SpacetimeDB at ${listen_addr}..."
  nohup spacetime start --listen-addr "$listen_addr" >"$log_file" 2>&1 &

  for _ in {1..40}; do
    if is_server_reachable; then
      echo "SpacetimeDB is ready at ${server_url}."
      echo "Logs: ${log_file}"
      return
    fi
    sleep 0.25
  done

  echo "SpacetimeDB did not become reachable at ${server_url}." >&2
  echo "Check logs: ${log_file}" >&2
  exit 1
}

ensure_spacetime_cli
start_server_if_needed

cd apps/server
spacetime publish --server "$server_url" "$db_name"
