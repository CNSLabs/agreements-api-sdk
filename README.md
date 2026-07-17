# Shodai Agreements SDK + MCP

Shodai turns agreement definitions into machine-readable, verifiable coordination workflows for humans, products, and AI agents. Agreements carry readable terms plus participants, valid inputs, states, transitions, and history.

This repository supports builders using the TypeScript SDK, agents or tools using MCP, and the canonical Shodai Reference App built on top of the SDK.

## Start Here

| Need | Start |
| --- | --- |
| Understand Shodai | [Shodai Home](https://shodai.network) · [Developer Docs](https://docs.shodai.network/) · [Demo App](https://app.shodai.network/agreements) |
| Get access | [Dev Portal / API keys](https://developers.shodai.network/portal) |
| Build | [Choose SDK vs MCP](https://docs.shodai.network/integration-surfaces) · [MCP quickstart](https://docs.shodai.network/sdks/quickstart-with-mcp) · [TypeScript SDK quickstart](https://docs.shodai.network/sdks/quickstart-with-typescript-sdk) · [End-to-end workflow](https://docs.shodai.network/examples/end-to-end-workflow) |

**Hosted MCP:** `https://shodai.network/mcp` is the Shodai Agreements execution MCP endpoint. It uses Streamable HTTP, bearer API-key auth, an `environment` tool argument, environment-scoped keys, and no hosted private-key custody.

**Packages and apps:** [`@shodai-network/agreements-api-client`](./packages/agreements-api-client) · [`@shodai-network/agreements-mcp-server`](./packages/agreements-mcp-server) · [`agreements-api-playground`](./apps/agreements-api-playground) · [`shodai-reference-app`](./apps/shodai-reference-app) · [`oauth-connect-cli`](./apps/oauth-connect-cli) (`shodai-oauth`)

## Why Builders Use Shodai Agreements

- Shared agreement state that humans, applications, and agents can inspect.
- Deterministic next actions from authored states, inputs, issuers, and transitions.
- Validation and deployment preflight before signatures.
- EIP-712 signed authorization for deployment and participant inputs.
- State and input history for receipts and monitoring.
- Less repeated contract orchestration, indexing, and participant workflow plumbing.

## Choose Your Path

| Path | Use it when | First success |
| --- | --- | --- |
| MCP / agent tools | An agent or MCP-capable client will work with agreements through hosted Streamable HTTP or local stdio. | Authenticate, read or list where permitted, validate an example, preflight deployment, and prepare deploy typed data. |
| TypeScript SDK | You are building a TypeScript application or service. | Authenticate, read or list agreements, validate an example, preflight deployment, and prove local EIP-712 signing readiness. |

Both paths converge on the same agreement lifecycle. After one quickstart works, run the [end-to-end workflow](https://docs.shodai.network/examples/end-to-end-workflow).

## Hosted MCP Endpoint

Configure Shodai as a remote Streamable HTTP MCP server:

```text
URL:
https://shodai.network/mcp

Auth:
Authorization: Bearer $SHODAI_API_KEY

Key shape:
cns_pk_...

Required API-calling tool argument:
environment: "testnet" | "production"
```

API keys only work in the environment where they were created. Hosted MCP never receives private keys; write tools use externally signed EIP-712 permits or typed-data preparation.

An ordinary browser `GET` to `/mcp` may return `405` because the endpoint expects MCP protocol requests. MCP surfaces on `docs.shodai.network` are for docs and search only; `https://shodai.network/mcp` is the Agreements execution endpoint.

- MCP quickstart: [docs.shodai.network/sdks/quickstart-with-mcp](https://docs.shodai.network/sdks/quickstart-with-mcp)
- MCP package docs: [`packages/agreements-mcp-server/README.md`](./packages/agreements-mcp-server/README.md)
- Execution server card: [shodai.network/.well-known/mcp/server-card.json](https://shodai.network/.well-known/mcp/server-card.json)
- MCP catalog: [shodai.network/.well-known/mcp/catalog.json](https://shodai.network/.well-known/mcp/catalog.json)

## What This Repository Contains

| Package or app | Location | Purpose |
| --- | --- | --- |
| `@shodai-network/agreements-api-client` | [`packages/agreements-api-client`](./packages/agreements-api-client) | Typed REST client for the Agreements API with `viem` permit-signing helpers. |
| `@shodai-network/agreements-mcp-server` | [`packages/agreements-mcp-server`](./packages/agreements-mcp-server) | Local MCP server package aligned with the hosted Agreements execution MCP surface. |
| `agreements-api-playground` | [`apps/agreements-api-playground`](./apps/agreements-api-playground) | Reference Vite app for browser API experimentation and SDK workflow examples. |
| `shodai-reference-app` | [`apps/shodai-reference-app`](./apps/shodai-reference-app) | Full-stack React/Nest/Mongo reference implementation for developer platform auth, Agreements API usage, agreement lifecycle UX, signing, persistence, and webhook reconciliation. |
| `oauth-connect-cli` (`shodai-oauth`) | [`apps/oauth-connect-cli`](./apps/oauth-connect-cli) | CLI that connects a public OAuth app to a user via authorization_code + PKCE, stores a refreshable session, and calls the Agreements API as that user. |

## Install the TypeScript SDK

Most TypeScript consumers should install the published npm package rather than this monorepo:

```bash
npm install @shodai-network/agreements-api-client
```

Add `viem` if you want the built-in permit-signing helpers for deploy and input submission:

```bash
npm install @shodai-network/agreements-api-client viem
```

Create a client with a named Shodai environment:

```ts
const client = new ApiClient({
  environment: 'testnet',
  apiKey: process.env.AGREEMENTS_API_KEY,
});
```

SDK usage and API lifecycle docs live in [`packages/agreements-api-client/README.md`](./packages/agreements-api-client/README.md). For constructor options, methods, signing helpers, diagnostics, and exports, see the [TypeScript client reference](https://docs.shodai.network/sdks/typescript-client).

## Run MCP Locally

Use the published MCP package for local stdio clients:

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

Local stdio mode uses `AGREEMENTS_API_ENVIRONMENT`; hosted MCP uses the `environment` tool argument. See [`packages/agreements-mcp-server/README.md`](./packages/agreements-mcp-server/README.md) for self-hosting, environment variables, tools, resources, prompts, and Inspector usage.

## Agreement Lifecycle

| Phase | TypeScript SDK | MCP |
| --- | --- | --- |
| Author agreement JSON | Use complete agreement JSON artifacts and examples. | Read example resources or use the authoring prompt. |
| Validate structure | `client.validateTemplate(...)` | `validate_agreement` |
| Preflight deployment | `client.validateDeployment(...)` | `preflight_deployment` |
| Prepare or sign deployment permit | SDK signing helpers with `viem` | `prepare_deployment_typed_data` and external signing |
| Deploy | `deployAgreementWithPermit(...)` or `client.deployWithPermit(...)` | `deploy_agreement` with signed permit fields |
| Read state | `client.getAgreementState(...)` | `get_agreement_state` |
| Prepare or sign input permit | SDK input-signing helpers | `prepare_input_typed_data` and external signing |
| Submit input | `submitAgreementInputWithPermit(...)` or `client.submitAgreementInput(...)` | `submit_input` with signed permit fields |
| Inspect history | `client.listAgreementInputs(...)` | `get_input_history` |

For a guided run through validation, deployment, signed input submission, state reads, and input history, use the [end-to-end workflow](https://docs.shodai.network/examples/end-to-end-workflow).

## Agreements API Environments

The SDK prefers a named environment instead of a raw host:

```ts
const client = new ApiClient({
  environment: 'testnet',
  apiKey: process.env.AGREEMENTS_API_KEY,
});
```

Built-in mappings:

- `testnet` -> `https://test-api.shodai.network`
- `production` -> `https://api.shodai.network`

API keys are environment-scoped. Use a testnet key with `testnet` and a production key with `production`.

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

For local browser development, the playground is environment-first and defaults to `testnet`. Use the in-app environment selector to switch between hosted `testnet` and `production` API targets.

Optional package-specific validation commands:

```bash
pnpm --filter @shodai-network/agreements-api-client run lint
pnpm --filter @shodai-network/agreements-mcp-server test
```

See [`apps/agreements-api-playground/README.md`](./apps/agreements-api-playground/README.md) for the full environment configuration.

## Boundaries

Hosted MCP does not hold private keys. OAuth/session auth and x402 payments are not current setup paths. Shodai agreements do not claim legal finality or fully autonomous enforcement. Shodai does not move value without authorized signed inputs.

## Open Source Project Notes

- API client consumer docs: [`packages/agreements-api-client/README.md`](./packages/agreements-api-client/README.md)
- API client maintainer notes: [`packages/agreements-api-client/DEVELOPMENT.md`](./packages/agreements-api-client/DEVELOPMENT.md)
- MCP server docs: [`packages/agreements-mcp-server/README.md`](./packages/agreements-mcp-server/README.md)
- Playground docs: [`apps/agreements-api-playground/README.md`](./apps/agreements-api-playground/README.md)
- Root license: [Apache-2.0](./LICENSE)
- MCP package license: [MIT](./packages/agreements-mcp-server/LICENSE)
