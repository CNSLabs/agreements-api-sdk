# Agreements API Playground

Small standalone frontend for exercising the hosted Agreements API at `/partner-api/v0/*`.

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
/api-playground/
```

Environment:

```bash
VITE_AGREEMENTS_API_ENVIRONMENT=testnet
```

Notes:

- The app stores the selected environment, API key, draft id, and deploy workspace values in browser local storage.
- `VITE_AGREEMENTS_API_ENVIRONMENT` is the primary deployment choice. It resolves both the API host and the default agreement chain.
- Built-in mappings are:
  - `testnet` -> `https://testnet.shodai.network` + Linea Sepolia
  - `production` -> `https://app.shodai.network` + Linea Mainnet
- The hero includes `Open Developer Docs`, which points to `https://docs.shodai.network`, and the environment selector includes an OpenAPI docs link for the current API host.
- Permit-based deployment also needs an injected wallet such as MetaMask; chain config is derived from the selected environment.
- Browser requests include `x-correlation-id`, `traceparent`, and `x-cns-client-app: agreements-api-playground` so backend telemetry can isolate playground-originated traffic.

## Env Inventory

- `VITE_AGREEMENTS_API_ENVIRONMENT`: primary required selector for standard hosted deployments

Everything else is now derived from the selected environment.
