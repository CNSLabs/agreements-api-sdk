# Agreements API Playground

Small standalone frontend for exercising the hosted Agreements API at `/api/v0/*`.

This app is the canonical reference implementation for the SDK in this repository. If you want a full browser example for validate, deploy, inspect, and input submission flows, start with [`src/App.tsx`](./src/App.tsx).

## Local use

```bash
# from the repository root
pnpm --filter agreements-api-playground dev
```

The dev server defaults to `http://localhost:5176`.

If `5176` is already in use, run Vite on another port:

```bash
pnpm --filter agreements-api-playground exec vite --host 127.0.0.1 --port 4176
```

Hosted path:

```text
https://developers.shodai.network/api-playground
```

Environment:

```bash
VITE_AGREEMENTS_API_ENVIRONMENT=testnet
VITE_AGREEMENTS_API_TESTNET_BASE_URL=
VITE_AGREEMENTS_API_PRODUCTION_BASE_URL=
```

Notes:

- The app stores the selected environment, API key, draft id, and deploy workspace values in browser local storage.
- `VITE_AGREEMENTS_API_ENVIRONMENT` is the primary deployment choice. It resolves both the API host and the default agreement chain.
- Built-in mappings are:
  - `testnet` -> `https://test-api.shodai.network` + Linea Sepolia
  - `production` -> `https://api.shodai.network` + Linea Mainnet
- `VITE_AGREEMENTS_API_TESTNET_BASE_URL` and `VITE_AGREEMENTS_API_PRODUCTION_BASE_URL` optionally override the API host used by each environment selector option. This is useful for staging rehearsals such as mapping `testnet` to `https://dev.cnslabs.cloud` and `production` to `https://alpha.cnslabs.cloud`.
- The hero includes `Open Developer Docs`, which points to `https://docs.shodai.network`, and the environment selector includes an OpenAPI docs link for the current API host.
- Permit-based deployment also needs an injected wallet such as MetaMask; chain config is derived from the selected environment.
- Browser requests include `x-correlation-id`, `traceparent`, and `x-cns-client-app: agreements-api-playground` so backend telemetry can isolate playground-originated traffic.

## Env Inventory

- `VITE_AGREEMENTS_API_ENVIRONMENT`: primary required selector for standard hosted deployments
- `VITE_AGREEMENTS_API_TESTNET_BASE_URL`: optional host override for the playground `testnet` option
- `VITE_AGREEMENTS_API_PRODUCTION_BASE_URL`: optional host override for the playground `production` option

When no host override is supplied, the app uses the SDK's standard host mapping for the selected environment.
