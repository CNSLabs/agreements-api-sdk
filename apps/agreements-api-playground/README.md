# Agreements API Playground

Small standalone frontend for exercising the hosted Agreements API at `/v0/*`.

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
VITE_AGREEMENTS_API_TESTNET_DEFAULT_CHAIN_ID=59141
VITE_AGREEMENTS_API_TESTNET_SUPPORTED_CHAINS=59141,11155111,84532
VITE_AGREEMENTS_API_PRODUCTION_DEFAULT_CHAIN_ID=59144
VITE_AGREEMENTS_API_PRODUCTION_SUPPORTED_CHAINS=59144,8453
```

Notes:

- The app stores the selected environment, API key, draft id, and deploy workspace values in browser local storage.
- `VITE_AGREEMENTS_API_ENVIRONMENT` resolves the standard API host. The playground lets you choose a supported deployment chain for that environment before validating, signing, and deploying.
- Built-in mappings are:
  - `testnet` -> `https://test-api.shodai.network` with Linea Sepolia, Ethereum Sepolia, and Base Sepolia deployment options
  - `production` -> `https://api.shodai.network` with Linea Mainnet and Base Mainnet deployment options
- `VITE_AGREEMENTS_API_TESTNET_BASE_URL` and `VITE_AGREEMENTS_API_PRODUCTION_BASE_URL` optionally override the API host used by each environment selector option. This is useful for staging rehearsals such as mapping `testnet` to `https://dev.cnslabs.cloud` and `production` to `https://alpha.cnslabs.cloud`.
- `VITE_AGREEMENTS_API_TESTNET_SUPPORTED_CHAINS` and `VITE_AGREEMENTS_API_PRODUCTION_SUPPORTED_CHAINS` optionally override the deployment chain selector for each environment independently. The legacy `VITE_SUPPORTED_AGREEMENTS_CHAINS` remains a fallback when no per-environment chain list is supplied.
- The hero includes `Open Developer Docs`, which points to `https://docs.shodai.network`, and the environment selector includes an OpenAPI docs link for the current API host.
- Permit-based deployment also needs an injected wallet such as MetaMask; chain config is derived from the selected deployment chain.
- Browser requests include `x-correlation-id`, `traceparent`, and `x-cns-client-app: agreements-api-playground` so backend telemetry can isolate playground-originated traffic.

## Env Inventory

- `VITE_AGREEMENTS_API_ENVIRONMENT`: primary required selector for standard hosted deployments
- `VITE_AGREEMENTS_API_TESTNET_BASE_URL`: optional host override for the playground `testnet` option
- `VITE_AGREEMENTS_API_PRODUCTION_BASE_URL`: optional host override for the playground `production` option
- `VITE_AGREEMENTS_API_TESTNET_DEFAULT_CHAIN_ID`: optional default deployment chain for the playground `testnet` option
- `VITE_AGREEMENTS_API_TESTNET_SUPPORTED_CHAINS`: optional comma-separated deployment chains for the playground `testnet` option
- `VITE_AGREEMENTS_API_PRODUCTION_DEFAULT_CHAIN_ID`: optional default deployment chain for the playground `production` option
- `VITE_AGREEMENTS_API_PRODUCTION_SUPPORTED_CHAINS`: optional comma-separated deployment chains for the playground `production` option

When no host or chain override is supplied, the app uses the SDK's standard host mapping and built-in chain defaults for the selected environment.
