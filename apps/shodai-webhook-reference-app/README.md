# Shodai Webhook Reference App

Standalone React/Nest/Mongo reference app for Shodai agreements. It runs independently of internal services, keeps Shodai API keys server-side in the Nest backend, uses the workspace `@cns-labs/agreements-api-client`, and receives signed Shodai agreement transition webhooks at `/shodai/webhooks`.

## Requirements

- Node.js 20+ (Node 23 works locally but some tooling warns)
- pnpm 10.15.1+
- Docker, or MongoDB already running on `localhost:27017`
- Dynamic environment configured for `http://localhost:5184/agreements/`
- Real Shodai external API base URL and API key
- Shodai webhook subscription secret

This repository is intentionally self-contained: do not start any separate
`auth-api`, `agreements-api`, nginx, or local `external-api` stack for normal
standalone operation.

## Setup

```sh
pnpm install
cp backend/.env.sample backend/.env
cp frontend/.env.sample frontend/.env
```

Fill both env files with real values before starting the app. Backend secrets
belong in `backend/.env`; only browser-safe `VITE_` values belong in
`frontend/.env`. Do not invent placeholder secrets for validation: runtime
startup fails closed when required Dynamic, external API, service auth,
frontend URL, webhook, or Mongo config is missing.

`EXTERNAL_API_BASE_URL` can use `https://test-api.shodai.network` for testnet
validation. `EXTERNAL_API_KEY` is required and is never defaulted; provide it
via your shell environment or `backend/.env`. To obtain a key, open
`https://developers.shodai.network/portal`, sign in with Google, generate a
testnet API key, and store it locally in `backend/.env`.

Create a webhook subscription in the Shodai developer portal or API with the
delivery URL `https://<your-tunnel-host>/shodai/webhooks` and event type
`agreement.transitioned`. Store the returned subscription secret in
`SHODAI_WEBHOOK_SECRET`. The backend verifies every delivery with the SDK
webhook helper before it reads the event payload.

The template catalog is vendored under `data/agreement-templates`. The frontend preview PDFs/images are under `frontend/public/template-assets`.

Required backend environment keys are listed in `backend/.env.sample`. At a
minimum, local validation needs Mongo, `FRONTEND_BASE_URL`, Dynamic config,
`EXTERNAL_API_BASE_URL`, `EXTERNAL_API_KEY`, `SHODAI_WEBHOOK_SECRET`, and
`SERVICE_AUTH_TOKEN`.
Required frontend environment keys are listed in
`frontend/.env.sample`, including the Dynamic environment and chain/RPC values
used by wallet signing.

## MongoDB

The app expects a Mongo server on `mongodb://localhost:27017` and writes to
`MONGO_DB_NAME` (default local sample: `standalone_agreements`). You can use any
local Mongo installation or container as long as it listens on that host/port.
The standalone app owns its Mongo collections; it does not read runtime state
from any other app database.

For a zero-context walkthrough, see `docs/third-party-setup.md`.

## Run Locally

Use `localhost`, not `127.0.0.1`, so Dynamic auth works.

```sh
pnpm dev:start
```

Open `http://localhost:5184/agreements/`. Backend health is available at `http://localhost:4199/health`.
The dev start command also seeds global template access from `data/agreement-templates` so a fresh database can immediately create agreements.

Stop the local dev stack with:

```sh
pnpm dev:stop
```

You can still run the services separately when debugging:

```sh
pnpm backend:start
pnpm frontend:dev:no-prepare
```

## Validation Commands

```sh
pnpm backend:test
pnpm backend:type-check
pnpm frontend:type-check
pnpm frontend:lint
pnpm frontend:build
```

## External API

Deployment, state reads, input listing, and input submission use `@cns-labs/agreements-api-client` against `EXTERNAL_API_BASE_URL`. Runtime mock external API mode is test-only and must not be used for local or production-like validation.

## Webhooks

The backend exposes:

```text
POST /shodai/webhooks
```

The receiver requires the exact raw request body plus the Shodai signature
headers. After verification, `agreement.transitioned` deliveries are stored in
Mongo, duplicates are ignored idempotently, stale out-of-order deliveries are
recorded without changing the agreement, and current agreement state plus input
history are reconciled from the Shodai external API into the local Mongo mirror.

For local testing against hosted Shodai, expose backend port `4199` through an
HTTPS tunnel and configure the webhook subscription to point at:

```text
https://<your-tunnel-host>/shodai/webhooks
```

Keep the tunnel URL stable while testing. If the URL changes, update the webhook
subscription before expecting new deliveries.

## Deployment

See `docs/deployment.md` for production-style serving, proxy, and environment notes.

## Migration

Import supported legacy export JSON with:

```sh
MONGO_URI=mongodb://localhost:27017 \
MONGO_DB_NAME=standalone_agreements \
LEGACY_EXPORT_DIR=/path/to/export \
node scripts/migrate-from-legacy-export.mjs --dry-run
```

Remove `--dry-run` to write after validation. The migration validates references before writes, preserves domain IDs, and records rollback-safe mapping summaries.

## Localhost Validation

Browser or agent validation should target `http://localhost:5184/agreements/`. Full local validation should cover login, template access, draft creation/reload, deploy through the real Shodai external API, and action submission.

## License

The source code in this repository is licensed under the Apache License 2.0. See `LICENSE` for details.

The Apache License does not grant rights to use any CNS Labs or Shodai names, logos, service marks, or trademarks except as required to describe the origin of this repository.
