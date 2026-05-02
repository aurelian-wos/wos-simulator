#!/bin/sh
set -eu

ensure_node_owned_dir() {
  path="$1"
  mkdir -p "$path"
  if [ "$(stat -c '%u:%g' "$path")" != "1000:1000" ]; then
    chown -R node:node "$path"
  fi
}

ensure_node_owned_dir /app/node_modules
ensure_node_owned_dir /app/.next
ensure_node_owned_dir /data/simulations

exec gosu node "$@"
