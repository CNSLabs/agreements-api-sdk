#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT/.tmp/dev-stack"
BACKEND_ENV="$ROOT/backend/.env"
FRONTEND_ENV="$ROOT/frontend/.env"
MONGO_STARTED_MARKER="$RUNTIME_DIR/mongo.started"

mkdir -p "$RUNTIME_DIR"

if [ ! -f "$BACKEND_ENV" ] || [ ! -f "$FRONTEND_ENV" ]; then
  echo "Missing backend/.env or frontend/.env." >&2
  echo "Copy backend/.env.sample and frontend/.env.sample, then fill in real values." >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$BACKEND_ENV"
set +a

BACKEND_PORT="${AGREEMENTS_BACKEND_PORT:-4199}"
FRONTEND_PORT="${AGREEMENTS_FRONTEND_PORT:-5184}"
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing command: $1" >&2
    exit 1
  fi
}

port_has_listener() {
  lsof -ti ":$1" >/dev/null 2>&1
}

wait_for_mongo() {
  local attempt

  for attempt in $(seq 1 30); do
    if node - "$ROOT" <<'NODE' >/dev/null 2>&1
const path = require('node:path');
const { createRequire } = require('node:module');
const root = process.argv[2];
const { MongoClient } = createRequire(path.join(root, 'backend', 'package.json'))('mongodb');

(async () => {
  const client = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017', {
    serverSelectionTimeoutMS: 1000,
  });
  try {
    await client.connect();
    await client.db(process.env.MONGO_DB_NAME || process.env.MONGO_DB || 'admin').command({ ping: 1 });
    process.exit(0);
  } catch {
    process.exit(1);
  } finally {
    await client.close().catch(() => {});
  }
})();
NODE
    then
      return 0
    fi
    echo "Waiting for MongoDB to accept connections ($attempt/30)..."
    sleep 1
  done

  echo "MongoDB did not become ready in time." >&2
  exit 1
}

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

cleanup() {
  kill_pid_file "$RUNTIME_DIR/backend.pid"
  kill_pid_file "$RUNTIME_DIR/frontend.pid"
}

require_command pnpm
require_command lsof

if [[ "$MONGO_URI" == mongodb://localhost:27017* || "$MONGO_URI" == mongodb://127.0.0.1:27017* ]]; then
  if port_has_listener 27017; then
    rm -f "$MONGO_STARTED_MARKER"
    echo "MongoDB already available on port 27017."
  else
    require_command docker
    echo "Starting local MongoDB with Docker Compose..."
    (
      cd "$ROOT"
      docker compose -f docker-compose-db.yml up -d
    )
    touch "$MONGO_STARTED_MARKER"
  fi
else
  echo "Using MongoDB from MONGO_URI; skipping local Docker MongoDB startup."
fi

wait_for_mongo

if [ "${SKIP_TEMPLATE_ACCESS_SEED:-0}" != "1" ]; then
  echo "Seeding default template access from data/agreement-templates..."
  (
    cd "$ROOT"
    pnpm templates:seed-defaults
  )
else
  echo "Skipping template access seed because SKIP_TEMPLATE_ACCESS_SEED=1."
fi

if port_has_listener "$BACKEND_PORT"; then
  echo "Port $BACKEND_PORT is already in use. Run pnpm dev:stop or choose a different AGREEMENTS_BACKEND_PORT." >&2
  exit 1
fi

if port_has_listener "$FRONTEND_PORT"; then
  echo "Port $FRONTEND_PORT is already in use. Run pnpm dev:stop or choose a different AGREEMENTS_FRONTEND_PORT." >&2
  exit 1
fi

trap cleanup EXIT INT TERM

echo "Starting backend on http://localhost:$BACKEND_PORT"
(
  cd "$ROOT"
  pnpm backend:start
) &
backend_pid="$!"
echo "$backend_pid" > "$RUNTIME_DIR/backend.pid"

echo "Starting frontend on http://localhost:$FRONTEND_PORT/agreements/"
(
  cd "$ROOT"
  pnpm frontend:dev:no-prepare
) &
frontend_pid="$!"
echo "$frontend_pid" > "$RUNTIME_DIR/frontend.pid"

echo "Standalone agreements app is starting. Open http://localhost:$FRONTEND_PORT/agreements/"
wait "$backend_pid" "$frontend_pid"
