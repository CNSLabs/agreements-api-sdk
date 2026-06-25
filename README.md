# Agreements API SDK

Open-source home for the TypeScript client for the Agreements API, the API playground, and the canonical Shodai Reference App built on top of the SDK.

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
- `apps/shodai-reference-app`: full-stack React/Nest/Mongo reference implementation for developer platform auth, Agreements API usage, agreement lifecycle UX, signing, persistence, and webhook reconciliation

## Start Here

- SDK usage and API lifecycle docs: [`packages/agreements-api-client/README.md`](./packages/agreements-api-client/README.md)
- Shodai Reference App setup and lifecycle docs: [`apps/shodai-reference-app/README.md`](./apps/shodai-reference-app/README.md)
- Full-stack reference UI entrypoint: [`apps/shodai-reference-app/frontend/src/Router.tsx`](./apps/shodai-reference-app/frontend/src/Router.tsx)
- API playground local browser workflow: [`apps/agreements-api-playground/README.md`](./apps/agreements-api-playground/README.md)
- API playground example UI: [`apps/agreements-api-playground/src/App.tsx`](./apps/agreements-api-playground/src/App.tsx)

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
pnpm dev
```

The default dev command starts the Shodai Reference App. Its backend defaults to `http://localhost:4199` and its frontend defaults to `http://localhost:5184/agreements/`.

Stop the reference app dev stack with:

```bash
pnpm dev:stop
```

See [`apps/shodai-reference-app/README.md`](./apps/shodai-reference-app/README.md) for the required local environment files.

Run the API playground explicitly with:

```bash
pnpm dev:playground
```

The playground defaults to `http://localhost:5176`. If that port is already in use, start the playground on another port:

```bash
pnpm --filter agreements-api-playground exec vite --host 127.0.0.1 --port 4176
```

For local browser development, the playground is environment-first and defaults to `testnet`.
Use the in-app environment selector to switch between hosted `testnet` and `production` API targets.

See [`apps/agreements-api-playground/README.md`](./apps/agreements-api-playground/README.md) for the full environment configuration.

## Open Source Project Notes

- Package metadata and consumer-facing README live under [`packages/agreements-api-client`](./packages/agreements-api-client).
- Maintainer workflows live in [`packages/agreements-api-client/DEVELOPMENT.md`](./packages/agreements-api-client/DEVELOPMENT.md).
- License: [Apache-2.0](./LICENSE)
