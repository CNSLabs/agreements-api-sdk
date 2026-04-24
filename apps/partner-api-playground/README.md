# Partner API Playground

Small standalone frontend for exercising the hosted partner gateway at `/partner-api/v0/*`.

This app is the canonical reference implementation for the SDK in this repository. If you want a full browser example for validate, deploy, inspect, and input submission flows, start with [`src/App.tsx`](./src/App.tsx).

## Local use

```bash
# from the repository root
pnpm --filter partner-api-playground dev
```

The dev server defaults to `http://localhost:5176`.

If `5176` is already in use, run Vite on another port:

```bash
pnpm --filter partner-api-playground exec vite --host 127.0.0.1 --port 4176
```

Hosted path:

```text
/partner-api-playground/
```

Environment:

```bash
VITE_PARTNER_API_ENVIRONMENT=testnet
VITE_PARTNER_API_BASE_URL=
VITE_DEVELOPER_DOCS_BASE_PATH=/developers/
VITE_AGREEMENTS_RPC_URL=
VITE_AGREEMENTS_RPC_URL_TEMPLATE=
```

Notes:

- The app stores the selected environment, gateway override, API key, draft id, and deploy workspace values in browser local storage.
- `VITE_PARTNER_API_ENVIRONMENT` is the primary deployment choice. It resolves both the API host and the default agreement chain.
- Built-in mappings are:
  - `testnet` -> `https://testnet.shodai.network` + Linea Sepolia
  - `production` -> `https://app.shodai.network` + Linea Mainnet
- `VITE_PARTNER_API_BASE_URL` is optional and overrides the environment host mapping.
- On localhost, leaving `VITE_PARTNER_API_BASE_URL` empty defaults the playground to the Vite dev server origin so `/partner-api`, `/auth-api`, `/agreements-api`, `/notifications-api`, and `/agreements` can be proxied through `http://localhost:8080`.
- `VITE_PARTNER_API_BASE_URL` should be the gateway origin only. Do not append `/partner-api` or `/partner-api/v0`.
- `VITE_DEVELOPER_DOCS_BASE_PATH` controls the preferred hosted docs route opened by the hero link and defaults to `/developers/`.
- The hero includes `Open Developer Docs` and `Open Raw OpenAPI` links for the currently targeted host.
- Permit-based deployment also needs chain config and an injected wallet such as MetaMask.
- `VITE_AGREEMENTS_RPC_URL` is the simplest explicit override when you want to use one RPC endpoint directly.
- `VITE_AGREEMENTS_RPC_URL_TEMPLATE` lets you use a provider-specific template with placeholders: `{networkSlug}`, `{chainId}`, and `{chainName}`.
- Example template: `https://rpc.example.com/{networkSlug}?key=your-key`
- If both RPC env vars are empty, the app falls back to the default RPC configured in `viem` for the selected chain.
- Browser requests include `x-correlation-id`, `traceparent`, and `x-cns-client-app: partner-api-playground` so backend telemetry can isolate playground-originated traffic.

## Env Inventory

- `VITE_PARTNER_API_ENVIRONMENT`: primary required selector for standard hosted deployments
- `VITE_PARTNER_API_BASE_URL`: optional advanced override for local proxies or custom gateways
- `VITE_AGREEMENTS_RPC_URL`: optional direct RPC override
- `VITE_AGREEMENTS_RPC_URL_TEMPLATE`: optional provider-specific RPC template override
- `VITE_DEVELOPER_DOCS_BASE_PATH`: optional UI/docs path override

Everything else is now derived from the selected environment.
