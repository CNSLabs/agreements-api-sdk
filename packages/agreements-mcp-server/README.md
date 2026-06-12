# @cns-labs/agreements-mcp-server

[Model Context Protocol](https://modelcontextprotocol.io) server for the Agreements API. Connect Claude, Cursor, or any MCP client and the full agreement lifecycle — author, validate, preflight, deploy, submit inputs — becomes callable as MCP tools.

The server is a pure consumer of the public `/v0` API via [`@cns-labs/agreements-api-client`](../agreements-api-client). It holds no business logic and stores no credentials: every tool call forwards the caller's API key (or OAuth bearer token) to the Agreements API gateway, which enforces auth, entitlements, and metering.

## Hosted endpoints

| Environment | MCP endpoint |
| --- | --- |
| Testnet | `https://test-api.shodai.network/mcp` |
| Production | `https://api.shodai.network/mcp` |

Stateless Streamable HTTP: `POST` only, JSON responses, no sessions. Add it to an MCP client with:

```json
{
  "mcpServers": {
    "shodai-agreements": {
      "url": "https://test-api.shodai.network/mcp",
      "headers": { "X-API-Key": "YOUR_API_KEY" }
    }
  }
}
```

Get an API key from the [Developer Portal](https://developers.shodai.network). Full client setup, tool reference, and signing guidance: [Connect via MCP](https://docs.shodai.network/sdks/connect-via-mcp).

## Run locally (stdio)

```json
{
  "mcpServers": {
    "shodai-agreements": {
      "command": "npx",
      "args": ["-y", "@cns-labs/agreements-mcp-server"],
      "env": {
        "AGREEMENTS_API_KEY": "YOUR_API_KEY",
        "AGREEMENTS_API_ENVIRONMENT": "testnet"
      }
    }
  }
}
```

Stdio environment variables:

| Variable | Use |
| --- | --- |
| `AGREEMENTS_API_KEY` (or `API_KEY`) | API key sent as `X-API-Key`. Required for tool calls. |
| `AGREEMENTS_API_ENVIRONMENT` | `testnet` (default) or `production`. |
| `AGREEMENTS_API_BASE_URL` | Explicit gateway origin override. Wins over the environment. |
| `AGREEMENTS_SIGNER_PRIVATE_KEY` | Optional local permit signer for write tools (dev/testnet only). |
| `AGREEMENTS_RPC_URL`, `AGREEMENTS_RPC_URL_<chainId>` | Optional RPC overrides used when preparing or signing permits. |

## Tools

Most tools call the public `/v0` API through the TypeScript client and carry MCP behavior annotations (`readOnlyHint`, `destructiveHint`). A few tools perform more than one operation to keep signing and deployment safe.

| Tool | Wraps | Scope |
| --- | --- | --- |
| `list_agreements` | `GET /v0/agreements` | `agreements.read` |
| `get_agreement` | `GET /v0/agreements/{id}` | `agreements.read` |
| `get_agreement_state` | `GET /v0/agreements/{id}/state` | `agreements.read` |
| `get_input_history` | `GET /v0/agreements/{id}/inputs` | `agreements.read` |
| `validate_agreement` | `POST /v0/agreements/validate-template` | `agreements.write` |
| `preflight_deployment` | `POST /v0/agreements/validate` | `agreements.write` |
| `deploy_agreement` | `POST /v0/agreements/validate`, then `POST /v0/agreements/deploy-with-permit` | `agreements.write` |
| `submit_input` | `POST /v0/agreements/{id}/input` | `agreements.write` |
| `prepare_deployment_typed_data` | `POST /v0/agreements/validate`, then local EIP-712 payload construction with a chain nonce read | `agreements.write` |
| `prepare_input_typed_data` | `GET /v0/agreements/{id}`, then local EIP-712 payload construction with a chain nonce read | `agreements.write` |

Resources: the simple and complex example agreements, the Author Agreement JSON guide, and the documentation index. Prompt: `author_agreement` (business description → agreement JSON).

## Signing custody modes

Deploys and input submissions require EIP-712 permits. Three supported modes:

1. **Pre-signed permit** — the agent or host app holds a wallet, signs externally, and passes `signer`/`deadline`/`signature` to `deploy_agreement` or `submit_input`.
2. **Prepare typed data, sign externally** — call `prepare_deployment_typed_data` / `prepare_input_typed_data` to get the exact EIP-712 payload, sign it with any EIP-712-capable signer, then call the write tool. For deployments, pass the returned `normalizedInitValues`, `normalizedParticipants`, and `normalizedObservers` back to `deploy_agreement` with the signature.
3. **Local environment signer (stdio only)** — set `AGREEMENTS_SIGNER_PRIVATE_KEY` and write tools sign locally. Dev/testnet pattern; the hosted endpoint never signs with server-side keys.

## Self-hosting

```bash
npm install @cns-labs/agreements-mcp-server
agreements-mcp-server-http   # Streamable HTTP on PORT (default 3905), endpoint /mcp
```

HTTP environment variables: `PORT`, `HOST`, `MCP_PATH`, `AGREEMENTS_API_ENVIRONMENT`, `AGREEMENTS_API_BASE_URL`. Optional OAuth 2.1 discovery (RFC 9728): `MCP_OAUTH_RESOURCE_URL`, `MCP_OAUTH_AUTHORIZATION_SERVERS`, `MCP_OAUTH_SCOPES`, `MCP_OAUTH_RESOURCE_DOCUMENTATION`. When OAuth is enabled, `MCP_OAUTH_RESOURCE_URL` must be the public MCP endpoint URL, with a path matching `MCP_PATH`, for example `https://test-api.shodai.network/mcp`.

A `Dockerfile` is included for container deployments. `GET /healthz` serves as the health endpoint.

## Development

```bash
pnpm install
pnpm --filter @cns-labs/agreements-mcp-server build
pnpm --filter @cns-labs/agreements-mcp-server test
```

Verify interactively with the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector):

```bash
npx -y @modelcontextprotocol/inspector@latest --cli http://localhost:3905/mcp \
  --transport http --method tools/list --header "X-API-Key: YOUR_API_KEY"
```

Pin `@latest`: older Inspector versions do not support `--transport`/`--header` for URL targets.

## License

MIT — see [LICENSE](./LICENSE). Note this package is MIT-licensed individually; other packages in this repository are licensed under Apache-2.0.
