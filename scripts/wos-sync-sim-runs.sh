#!/usr/bin/env bash
set -euo pipefail

LOCAL_DIR="${LOCAL_SIM_RUNS_DIR:-$PWD/tmp/simulate-runs}"
REMOTE="${WOS_SIM_REMOTE:-ubuntu@oracle-cloud}"
REMOTE_DIR="${WOS_SIM_REMOTE_RUNS_DIR:-/srv/wos-sim/runtime/simulate-runs}"
LOCAL_UNISON_CMD="${WOS_SIM_UNISON_CMD:-}"
REMOTE_UNISON_CMD="${WOS_SIM_REMOTE_UNISON_CMD:-unison-2.51+4.13.1}"

if [[ -z "$LOCAL_UNISON_CMD" ]]; then
  if command -v unison-2.51+4.13.1 >/dev/null 2>&1; then
    LOCAL_UNISON_CMD="unison-2.51+4.13.1"
  else
    LOCAL_UNISON_CMD="unison"
  fi
fi

if ! command -v "$LOCAL_UNISON_CMD" >/dev/null 2>&1; then
  cat >&2 <<'EOF'
unison is required for bidirectional saved-run sync.
Install the same major Unison version locally and on the VPS, then rerun.
EOF
  exit 127
fi

mkdir -p "$LOCAL_DIR"

exec "$LOCAL_UNISON_CMD" "$LOCAL_DIR" "ssh://$REMOTE/$REMOTE_DIR" \
  -servercmd "$REMOTE_UNISON_CMD" \
  -batch \
  -auto \
  -prefer newer \
  -ignore 'Name *.tmp' \
  -ignore 'Name *.json.*.tmp' \
  -ignore 'Name player-stat-presets.json'
