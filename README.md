# Agreements API SDK

Open-source home for the CNS Labs TypeScript client for `/partner-api` and the reference playground app built on top of it.

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

- `packages/partner-api-client`: publishable npm package `@cns-labs/agreements-api-client`
- `apps/partner-api-playground`: reference Vite app for validating agreements, deploying with permits, inspecting state, and submitting inputs

## Start Here

- SDK usage and API lifecycle docs: [`packages/partner-api-client/README.md`](./packages/partner-api-client/README.md)
- Reference implementation and local browser workflow: [`apps/partner-api-playground/README.md`](./apps/partner-api-playground/README.md)
- Full end-to-end example UI: [`apps/partner-api-playground/src/App.tsx`](./apps/partner-api-playground/src/App.tsx)

## Partner API Environments

The SDK now prefers a named environment instead of a raw host:

```ts
const client = new PartnerApiClient({
  environment: 'testnet',
  apiKey: process.env.CNS_PARTNER_API_KEY,
});
```

Built-in mappings:

- `testnet` -> `https://testnet.shodai.network`
- `production` -> `https://app.shodai.network`

The client still supports `baseUrl` as an advanced override for local proxies, internal gateways, or non-standard deployments. It continues to add `/partner-api/v0/*` automatically.

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
pnpm --filter partner-api-playground exec vite --host 127.0.0.1 --port 4176
```

For local browser development, the playground expects a reachable backend target:

- The playground is environment-first and defaults to `testnet`.
- On localhost, the optional gateway override defaults to the Vite dev server origin so `/partner-api/*` requests can use the local proxy.
- The Vite proxy forwards `/partner-api` and related routes to `http://localhost:8080`.
- Set `VITE_PARTNER_API_BASE_URL` to target an explicit local proxy or internal gateway instead.

See [`apps/partner-api-playground/README.md`](./apps/partner-api-playground/README.md) for the full environment configuration.

## Open Source Project Notes

- Package metadata and consumer-facing README live under [`packages/partner-api-client`](./packages/partner-api-client).
- Maintainer workflows live in [`packages/partner-api-client/DEVELOPMENT.md`](./packages/partner-api-client/DEVELOPMENT.md).
- License: [Apache-2.0](./LICENSE)
