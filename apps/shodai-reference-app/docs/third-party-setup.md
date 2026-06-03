# Shodai Reference App Local Setup

This repo runs the Shodai Reference App as a full-stack agreements implementation. It does not require any separate `auth-api`, `agreements-api`, nginx, notifications services, or local external API.

## Prerequisites

- Node.js 20+
- pnpm 10.15.1+
- Docker, unless you already run MongoDB on `localhost:27017`
- A Dynamic environment for browser login and wallet auth
- A Shodai testnet external API key
- A Shodai webhook subscription secret
- A Linea Sepolia-capable wallet
- Either an Infura project ID or a direct Linea Sepolia RPC URL

## External Accounts

### Dynamic

Create or use a Dynamic environment that supports:

- Google login
- EVM wallets
- Local app URL: `http://localhost:5184/agreements/`
- Local backend/auth URL: `http://localhost:4199`

Record:

- `DYNAMIC_ENVIRONMENT_ID`
- `DYNAMIC_API_TOKEN`

The frontend also needs `VITE_DYNAMIC_ENVIRONMENT_ID`. It is usually the same value as `DYNAMIC_ENVIRONMENT_ID`.

### Shodai API

Open `https://developers.shodai.network/portal`, sign in, and create a testnet API key.

Record:

- `EXTERNAL_API_BASE_URL=https://test-api.shodai.network`
- `EXTERNAL_API_KEY`

Create a webhook subscription for agreement transition events and record:

- `SHODAI_WEBHOOK_SECRET`

For local delivery from hosted Shodai, expose backend port `4199` with an HTTPS
tunnel. Configure the subscription URL as:

```text
https://<your-tunnel-host>/shodai/webhooks
```

Keep the tunnel running while testing agreement lifecycle changes. If the tunnel
host changes, update the webhook subscription URL before expecting more
deliveries.

### Chain RPC

The frontend derives supported deploy chains from the backend public config,
which is filtered from the SDK deployment registry by the configured Shodai API
environment. For RPC access, set:

- either `VITE_INFURA_PROJECT_ID`
- or `VITE_AGREEMENTS_RPC_URL`
- or per-chain overrides such as `VITE_AGREEMENTS_RPC_URL_59141`

## Environment Files

The repo intentionally uses two env files:

- `backend/.env` contains server-only secrets and database config.
- `frontend/.env` contains Vite-exposed browser config. Any `VITE_` value may be bundled into client-side JavaScript.

Create both files:

```sh
cp backend/.env.sample backend/.env
cp frontend/.env.sample frontend/.env
```

Fill in real values. Do not put `EXTERNAL_API_KEY`, `DYNAMIC_API_TOKEN`, or `SERVICE_AUTH_TOKEN` in `frontend/.env`.
Do not put `SHODAI_WEBHOOK_SECRET` in `frontend/.env`; the browser must never
receive webhook or API secrets.

## Install And Start

```sh
pnpm install
pnpm dev
```

`pnpm dev` will:

- start Docker MongoDB if `MONGO_URI` points at local port `27017` and nothing is already listening there
- seed default template access from `data/agreement-templates`
- start the backend at `http://localhost:4199`
- start the frontend at `http://localhost:5184/agreements/`

Stop everything started by the dev command:

```sh
pnpm dev:stop
```

## Template Access

Fresh databases need template access rows before the Create Agreement page can show templates. The dev stack seeds all vendored templates as global defaults automatically.

You can run the seed manually:

```sh
pnpm templates:seed-defaults
```

Preview what it will write:

```sh
pnpm templates:seed-defaults -- --dry-run
```

Skip automatic seeding in `pnpm dev`:

```sh
SKIP_TEMPLATE_ACCESS_SEED=1 pnpm dev
```

## Expected Local URLs

- App: `http://localhost:5184/agreements/`
- Backend health: `http://localhost:4199/health`
- Agreements API: `http://localhost:4199/agreements-api`
- Auth API: `http://localhost:4199/auth-api`
- Webhook receiver: `http://localhost:4199/shodai/webhooks`

## Local Validation Checklist

After startup:

- backend health returns `ok: true`
- login works through Dynamic
- Create Agreement shows the five vendored non-grant templates
- a draft can be created, edited, refreshed, and deleted
- a draft can deploy through the real Shodai external API
- a deployed agreement can submit an available action
- the webhook subscription can deliver a signed test event to `/shodai/webhooks`
- agreement transition deliveries reconcile the local Mongo mirror without duplicating inputs
- notification routes remain absent

Useful commands:

```sh
pnpm --filter shodai-reference-app backend:test
pnpm --filter shodai-reference-app backend:type-check
pnpm --filter shodai-reference-app frontend:type-check
pnpm --filter shodai-reference-app frontend:lint
pnpm --filter shodai-reference-app frontend:build
```
