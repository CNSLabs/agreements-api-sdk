# Partner API Playground

Small standalone frontend for exercising the hosted partner gateway at `/partner-api/v0/*`.

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
VITE_PARTNER_API_BASE_URL=
VITE_DEVELOPER_DOCS_BASE_PATH=/developers/
VITE_AGREEMENTS_CHAIN_ID=59141
VITE_AGREEMENTS_RPC_URL=
VITE_INFURA_PROJECT_ID=
```

Notes:

- The app stores the base URL, API key, draft id, and deploy workspace values in browser local storage.
- Leave `VITE_PARTNER_API_BASE_URL` empty for local development. Vite proxies `/partner-api`, `/auth-api`, `/agreements-api`, `/notifications-api`, and `/agreements` through `http://localhost:8080`.
- Leave `VITE_PARTNER_API_BASE_URL` empty for hosted deployments on the same domain so the app uses same-origin API calls.
- Set `VITE_PARTNER_API_BASE_URL` when you want to target a different hosted gateway or the local nginx proxy explicitly.
- `VITE_DEVELOPER_DOCS_BASE_PATH` controls the preferred hosted docs route opened by the hero link and defaults to `/developers/`.
- The hero includes `Open Developer Docs` and `Open Raw OpenAPI` links for the currently targeted host.
- Permit-based deployment also needs chain config and an injected wallet such as MetaMask.
- If `VITE_AGREEMENTS_RPC_URL` is empty, the app falls back to Infura if `VITE_INFURA_PROJECT_ID` is set, then to the default RPC configured in `viem` for the selected chain.
- Browser requests include `x-correlation-id`, `traceparent`, and `x-cns-client-app: partner-api-playground` so backend telemetry can isolate playground-originated traffic.
