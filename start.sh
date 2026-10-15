#!/usr/bin/env bash
# PERFECTARENA - run the game.
#
#   ./start.sh                 the game, on the first free port from 8080
#   ./start.sh --port 9000     a specific port
#   ./start.sh --arena /path/to/ARENA   skip the folder picker (dev door)
#
# All the logic is in tools/launch.mjs; this script only has to find a Node binary,
# exactly like start.cmd does on Windows.

set -euo pipefail
cd "$(dirname "$0")"

find_node() {
  if [ -n "${PERFECTARENA_NODE:-}" ] && [ -x "$PERFECTARENA_NODE" ]; then
    printf '%s\n' "$PERFECTARENA_NODE"; return 0
  fi
  # The project's own copy, which is what the test suite uses.
  for candidate in .devtools/node-*/bin/node .devtools/node-*/node.exe; do
    if [ -x "$candidate" ]; then printf '%s\n' "$candidate"; return 0; fi
  done
  for name in node nodejs; do
    if command -v "$name" >/dev/null 2>&1; then command -v "$name"; return 0; fi
  done
  return 1
}

NODE="$(find_node || true)"
if [ -z "$NODE" ]; then
  cat >&2 <<'EOF'
PERFECTARENA needs Node 22 or newer to serve the game.
Install it from https://nodejs.org/ (or your package manager) and run this again,
or set PERFECTARENA_NODE to a full path to the node binary.
EOF
  exit 1
fi

exec "$NODE" tools/launch.mjs "$@"
