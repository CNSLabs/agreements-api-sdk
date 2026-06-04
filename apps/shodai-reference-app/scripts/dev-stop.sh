#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT/.tmp/dev-stack"
BACKEND_ENV="$ROOT/backend/.env"
MONGO_STARTED_MARKER="$RUNTIME_DIR/mongo.started"

mkdir -p "$RUNTIME_DIR"

if [ -f "$BACKEND_ENV" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$BACKEND_ENV"
  set +a
fi

BACKEND_PORT="${AGREEMENTS_BACKEND_PORT:-4199}"
FRONTEND_PORT="${AGREEMENTS_FRONTEND_PORT:-5184}"

kill_pid_file() {
  local file="$1"
  local pid

  if [ ! -f "$file" ]; then
    return
  fi

  pid="$(cat "$file" 2>/dev/null || true)"
  if [[ "$pid" =~ ^[0-9]+$ ]]; then
    kill_pid_tree "$pid"
  fi
  rm -f "$file"
}

kill_pid_tree() {
  local pid="$1"
  local child

  while read -r child; do
    if [[ "$child" =~ ^[0-9]+$ ]]; then
      kill_pid_tree "$child"
    fi
  done < <(pgrep -P "$pid" 2>/dev/null || true)

  kill "$pid" 2>/dev/null || true
}

warn_port_listener() {
  local port="$1"
  local label="$2"
  local listeners

  if ! command -v lsof >/dev/null 2>&1; then
    return
  fi

  listeners="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$listeners" ]; then
    echo "Port $port still has a $label listener that was not started from this dev stack; leaving it running." >&2
    echo "$listeners" >&2
  fi
}

kill_pid_file "$RUNTIME_DIR/backend.pid"
kill_pid_file "$RUNTIME_DIR/frontend.pid"
sleep 1
warn_port_listener "$BACKEND_PORT" "backend"
warn_port_listener "$FRONTEND_PORT" "frontend"

if [ -f "$MONGO_STARTED_MARKER" ]; then
  if command -v docker >/dev/null 2>&1; then
    (
      cd "$ROOT"
      docker compose -f docker-compose-db.yml down
    )
  fi
  rm -f "$MONGO_STARTED_MARKER"
fi

echo "Stopped Shodai Reference App dev stack."
