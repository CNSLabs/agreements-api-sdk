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
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null || true
  fi
  rm -f "$file"
}

kill_port() {
  local port="$1"
  local pid

  while read -r pid; do
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
    fi
  done < <(lsof -ti ":$port" 2>/dev/null || true)
}

kill_pid_file "$RUNTIME_DIR/backend.pid"
kill_pid_file "$RUNTIME_DIR/frontend.pid"
kill_port "$BACKEND_PORT"
kill_port "$FRONTEND_PORT"

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
