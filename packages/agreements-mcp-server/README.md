# @shodai-network/agreements-mcp-server

[Model Context Protocol](https://modelcontextprotocol.io) server for the Agreements API. Configure Shodai as a remote Streamable HTTP MCP server and the full agreement lifecycle — author, validate, preflight, deploy, submit inputs — becomes callable as MCP tools.

The server is a pure consumer of the public `/v0` API via [`@shodai-network/agreements-api-client`](../agreements-api-client). It holds no business logic and stores no credentials: every tool call forwards the caller's API key to the Agreements API gateway, which enforces auth, entitlements, and metering.

## Hosted endpoint

Stateless Streamable HTTP: `POST` only, JSON responses, no sessions. Use this hosted setup contract:

```text
Configure Shodai as a remote Streamable HTTP MCP server.

URL:
https://shodai.network/mcp

Auth:
Authorization: Bearer $SHODAI_API_KEY

Key shape:
cns_pk_...

Tool environment:
testnet

Use this value as the environment argument on API-calling tools. API keys only work in the environment where they were created.
```

Hosted API-calling tools require an `environment` argument: `testnet` or `production`. API keys only work in the environment where they were created, so a testnet key must be used with `environment: "testnet"` and a production key must be used with `environment: "production"`. OAuth and JWT bearer tokens are not supported.

Get an API key from the [Developer Portal](https://developers.shodai.network). First-flight setup, tool access, and typed-data preparation: [Quickstart with MCP](https://docs.shodai.network/sdks/quickstart-with-mcp).

## Run locally (stdio)

```json
{
  "mcpServers": {
    "shodai-agreements": {
      "command": "npx",
      "args": ["-y", "@shodai-network/agreements-mcp-server"],
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
| `AGREEMENTS_API_KEY` (or `API_KEY`) | API key used for tool calls. Required unless OAuth client credentials are configured. |
| `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_PRIVATE_JWK` | OAuth client-credentials auth for agent identities; the server mints and refreshes bearer tokens itself. Alternative to `AGREEMENTS_API_KEY` (which wins if both are set). |
| `OAUTH_ISSUER_URL` (or `OAUTH_TOKEN_URL`) | Authorization server issuer for token-endpoint discovery, or the explicit token endpoint. Required with OAuth client credentials. |
| `OAUTH_SCOPE` | Optional space-separated scopes to request on minted tokens. |
| `AGREEMENTS_API_ENVIRONMENT` | `testnet` (default) or `production`. |
| `AGREEMENTS_API_BASE_URL` | Explicit gateway origin override. Wins over the environment. |
| `AGREEMENTS_SIGNER_PRIVATE_KEY` | Optional local permit signer for write tools (dev/testnet only). |
| `INFURA_PROJECT_ID` | Infura project ID used to derive RPC URLs for the built-in Linea, Sepolia, and Base agreement chains. |
| `AGREEMENTS_RPC_URL`, `AGREEMENTS_RPC_URL_<chainId>` | Optional RPC overrides used when preparing or signing permits. |

## Tools

Most tools call the public `/v0` API through the TypeScript client and carry MCP behavior annotations (`readOnlyHint`, `destructiveHint`). A few tools perform more than one operation to keep signing and deployment safe.

On the hosted endpoint, every API-calling tool below requires `environment: "testnet" | "production"`. Local stdio mode uses the fixed environment from `AGREEMENTS_API_ENVIRONMENT` instead.

| Tool | Wraps | Scope |
| --- | --- | --- |
| `list_agreements` | `GET /v0/agreements` | `agreements.read` |
| `get_agreement` | `GET /v0/agreements/{id}` | `agreements.read` |
| `get_agreement_document` | `GET /v0/agreements/documents/{documentId}` | `agreements.read` |
| `get_agreement_state` | `GET /v0/agreements/{id}/state` | `agreements.read` |
| `get_input_history` | `GET /v0/agreements/{id}/inputs` | `agreements.read` |
| `validate_agreement` | `POST /v0/agreements/validate-template` | `agreements.write` |
| `preflight_deployment` | `POST /v0/agreements/validate` | `agreements.write` |
| `deploy_agreement` | `POST /v0/agreements/validate`, then `POST /v0/agreements/deploy-with-permit` | `agreements.write` |
| `submit_input` | `POST /v0/agreements/{id}/input` | `agreements.write` |
| `prepare_deployment_typed_data` | `POST /v0/agreements/validate`, then local EIP-712 payload construction with a chain nonce read | `agreements.write` |
| `prepare_input_typed_data` | `GET /v0/agreements/{id}`, then local EIP-712 payload construction with a chain nonce read | `agreements.write` |

Resources are discoverable with `resources/list`:

| Resource | URI |
| --- | --- |
| `simple-example-agreement` | `agreements://examples/simple-agreement.json` |
| `complex-example-agreement` | `agreements://examples/complex-agreement.json` |
| `authoring-guide` | `agreements://docs/author-agreement-json.md` |
| `docs-index` | `agreements://docs/index.md` |

Prompt: `author_agreement` (business description → agreement JSON).

## Signing custody modes

Deploys and input submissions require EIP-712 permits. Three supported modes:

1. **Pre-signed permit** — the agent or host app holds a wallet, signs externally, and passes `signer`/`deadline`/`signature` to `deploy_agreement` or `submit_input`.
2. **Prepare typed data, sign externally** — call `prepare_deployment_typed_data` / `prepare_input_typed_data` to get the exact EIP-712 payload, sign it with any EIP-712-capable signer, then call the write tool. For deployments, pass the returned `normalizedInitValues`, `normalizedParticipants`, and `normalizedObservers` back to `deploy_agreement` with the signature.
3. **Local environment signer (stdio only)** — set `AGREEMENTS_SIGNER_PRIVATE_KEY` and write tools sign locally. Dev/testnet pattern; the hosted endpoint never signs with server-side keys.

Minimal hosted flow: read `simple-example-agreement`, call `validate_agreement`, `preflight_deployment`, `prepare_deployment_typed_data` with `environment`/`agreement`/`chainId`/`signerAddress` and intended deployment context, sign externally, then call `deploy_agreement` with the same `environment`, `displayName`, matching `docUri`, normalized deployment fields, and permit fields. For inputs, call `prepare_input_typed_data` with `environment`/`agreementId`/`inputId`/`values`/`signerAddress`, sign externally, call `submit_input` with the same `environment`, then reread state and input history.

Hosted MCP receives signed permit fields only, never private keys. Private-key environment signing is for local stdio development and testnet automation only.

## Self-hosting

```bash
npm install @shodai-network/agreements-mcp-server
agreements-mcp-server-http   # Streamable HTTP on PORT (default 3905), endpoint /mcp
```

HTTP environment variables: `PORT`, `HOST`, `MCP_PATH`, `PUBLIC_MCP_URL`, `AGREEMENTS_API_TESTNET_BASE_URL`, `AGREEMENTS_API_PRODUCTION_BASE_URL`, and optional local `AGREEMENTS_API_BASE_URL` for single-origin testing. Set `PUBLIC_MCP_URL` when discovery metadata should advertise a canonical public endpoint that differs from the request host.

A `Dockerfile` is included for container deployments. `GET /healthz` serves as the health endpoint.

## Development

```bash
pnpm install
pnpm --filter @shodai-network/agreements-mcp-server build
pnpm --filter @shodai-network/agreements-mcp-server test
```

Verify interactively with the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector):

```bash
npx -y @modelcontextprotocol/inspector@latest --cli http://localhost:3905/mcp \
  --transport http --method tools/list --header "Authorization: Bearer $SHODAI_API_KEY"
```

Pin `@latest`: older Inspector versions do not support `--transport`/`--header` for URL targets.

## License

MIT — see [LICENSE](./LICENSE). Note this package is MIT-licensed individually; other packages in this repository are licensed under Apache-2.0.
