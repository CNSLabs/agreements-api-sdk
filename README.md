# Agreements API SDK

Open-source home for the TypeScript client for the Agreements API, the reference playground app, and the webhook-aware Shodai agreements reference app built on top of the SDK.

## Install the SDK

Most consumers should install the published npm package rather than this monorepo:

```bash
npm install @cns-labs/agreements-api-client
```

Add `viem` if you want to use the built-in permit-signing helpers for deploy and input submission:

```bash
npm install @cns-labs/agreements-api-client viem
```

## What This Repository Contains

- `packages/agreements-api-client`: publishable npm package `@cns-labs/agreements-api-client`
- `apps/agreements-api-playground`: reference Vite app for validating agreements, deploying with permits, inspecting state, and submitting inputs
- `apps/shodai-webhook-reference-app`: full React/Nest/Mongo reference app with server-side Shodai API calls and signed webhook receipt

## Start Here

- SDK usage and API lifecycle docs: [`packages/agreements-api-client/README.md`](./packages/agreements-api-client/README.md)
- Reference implementation and local browser workflow: [`apps/agreements-api-playground/README.md`](./apps/agreements-api-playground/README.md)
- Webhook reference app setup and lifecycle docs: [`apps/shodai-webhook-reference-app/README.md`](./apps/shodai-webhook-reference-app/README.md)
- Full end-to-end example UI: [`apps/agreements-api-playground/src/App.tsx`](./apps/agreements-api-playground/src/App.tsx)

## Agreements API Environments

The SDK now prefers a named environment instead of a raw host:

```ts
const client = new ApiClient({
  environment: 'testnet',
  apiKey: process.env.AGREEMENTS_API_KEY,
});
```

Built-in mappings:

- `testnet` -> `https://test-api.shodai.network`
- `production` -> `https://api.shodai.network`

The client still supports `baseUrl` as an advanced override for local proxies, internal gateways, or non-standard deployments. It continues to add `/v0/*` automatically.

## Local Development

```bash
# from the repository root
pnpm install
pnpm build
pnpm dev:playground
```

The playground defaults to `http://localhost:5176`.

If that port is already in use, start the playground on another port:

```bash
pnpm --filter agreements-api-playground exec vite --host 127.0.0.1 --port 4176
```

For local browser development, the playground is environment-first and defaults to `testnet`.
Use the in-app environment selector to switch between hosted `testnet` and `production` API targets.

See [`apps/agreements-api-playground/README.md`](./apps/agreements-api-playground/README.md) for the full environment configuration.

Run the webhook reference app from the repository root with:

```bash
pnpm dev:webhook-reference
```

Stop it with:

```bash
pnpm dev:webhook-reference:stop
```

## Open Source Project Notes

- Package metadata and consumer-facing README live under [`packages/agreements-api-client`](./packages/agreements-api-client).
- Maintainer workflows live in [`packages/agreements-api-client/DEVELOPMENT.md`](./packages/agreements-api-client/DEVELOPMENT.md).
- License: [Apache-2.0](./LICENSE)
