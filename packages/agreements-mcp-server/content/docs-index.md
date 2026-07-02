# Shodai Developer Documentation

> Agreements API documentation for first-run TypeScript SDK and MCP integrations, agreement JSON authoring, deployment preflight, EIP-712 signing, deployment, and signed input submission.

## Docs

- [Authentication](https://docs.shodai.network/authentication.md): Authenticate API requests with an API key and understand access scopes, entitlements, and auth failures.
- [Author Agreement JSON](https://docs.shodai.network/workflow/author-agreement-json.md): Learn how to make good authoring decisions when turning a real business workflow into agreement JSON.
- [Validate Agreement Structure](https://docs.shodai.network/workflow/validate-agreement-structure.md): Check authored agreement JSON, read validation feedback, and distinguish template validation from deployment preflight.
- [Complex Agreement](https://docs.shodai.network/examples/complex.md): Use a richer complete agreement JSON example to inspect a realistic lifecycle with more states, event types, metadata, and branching behavior.
- [Run an end-to-end agreement workflow](https://docs.shodai.network/examples/end-to-end-workflow.md): Use the service retainer example to validate agreement JSON, preflight deployment, sign and deploy, submit lifecycle inputs, read state, and inspect input history.
- [Simple Agreement](https://docs.shodai.network/examples/simple.md): Use the smallest complete agreement JSON example to inspect the full document shape without much branching complexity.
- [Choose an integration surface](https://docs.shodai.network/integration-surfaces.md): Choose between the TypeScript SDK and MCP for your first Shodai agreement integration.
- [Overview](https://docs.shodai.network/index.md): Understand how Agreements Protocol gives agreements shared meaning, explicit execution paths, and verifiable history.
- [Quickstart with TypeScript SDK](https://docs.shodai.network/sdks/quickstart-with-typescript-sdk.md): Install the TypeScript client, authenticate with an API key, validate an example agreement, and prove EIP-712 signing readiness without deploying.
- [Quickstart with MCP](https://docs.shodai.network/sdks/quickstart-with-mcp.md): Configure hosted MCP, call authenticated tools, validate an example agreement, and prepare EIP-712 typed data without giving the server a private key.
- [Get agreement](https://docs.shodai.network/reference/api/agreement-records/get-agreement.md): Returns a single agreement record, including agreement JSON and hosted record context.
- [List agreements](https://docs.shodai.network/reference/api/agreement-records/list-agreements.md): Lists agreement summaries visible to the current API key. Supports pagination, filtering, and sorting.
- [Validate agreement structure](https://docs.shodai.network/reference/api/authoring/validate-agreement-structure.md): Checks only the authored agreement JSON and returns participant variable keys, input IDs, state IDs, and warnings. This does not validate deployment values, participant wallet addresses, signer, or permit data.
- [Deploy agreement](https://docs.shodai.network/reference/api/deployment/deploy-agreement.md): Deploys authored agreement JSON using an EIP-712 permit. The API submits the on-chain transaction with the signed authorization and returns the deployed agreement record.
- [Preflight deployment request](https://docs.shodai.network/reference/api/deployment/preflight-deployment-request.md): Checks whether authored agreement JSON plus target chain, deployment values, participant wallet mappings, and observer context are ready for deployment. This does not deploy the agreement.
- [Get the OpenAPI document for the Agreements API](https://docs.shodai.network/reference/api/system/get-the-openapi-document-for-the-agreements-api.md): Returns the OpenAPI 3.1 specification describing the Agreements API surface.
- [Health check](https://docs.shodai.network/reference/api/system/health-check.md): Public health endpoint for the API gateway.
- [Get agreement state](https://docs.shodai.network/reference/api/using-agreements/get-agreement-state.md): Returns the current state of an agreement. For deployed agreements, interpret the state against the authored agreement lifecycle.
- [Get input history](https://docs.shodai.network/reference/api/using-agreements/get-input-history.md): Returns recorded input submissions for the agreement. Use this to inspect what events have been submitted.
- [Submit input with permit](https://docs.shodai.network/reference/api/using-agreements/submit-input-with-permit.md): Submits a signed input to a deployed agreement. The input ID and values must match an input defined by the agreement JSON, and the signer must be allowed by that input.
- [EIP-712 Signing Reference](https://docs.shodai.network/reference/eip-712-signing.md): Construct low-level EIP-712 typed data when you are not using SDK signing helpers or need to debug permit signatures.
- [Errors and troubleshooting](https://docs.shodai.network/reference/errors-and-troubleshooting.md): Resolve common API authentication, entitlement, validation, signing, deployment, and input-submission failures.
- [May 2026 API/SDK Response Migration](https://docs.shodai.network/reference/migrations/may-2026-api-sdk-response-migration.md): Update Agreements API integrations for response envelopes, paged list results, filtering, sorting, and normalized error payloads.
- [May 2026 Multi-Chain Migration](https://docs.shodai.network/reference/migrations/may-2026-multi-chain-migration.md): Update Agreements API integrations for explicit deployment chain selection, multi-chain signing, and the 0.3.0 TypeScript client changes.
- [TypeScript client reference](https://docs.shodai.network/sdks/typescript-client.md): Reference the `@cns-labs/agreements-api-client` constructor, methods, signing helpers, diagnostics, path helpers, and exports.
- [Contracts](https://docs.shodai.network/system-architecture/contracts.md): Find current Agreements Protocol EVM contract addresses and verified source links.
- [Agreement data standard](https://docs.shodai.network/system-architecture/data-standard.md): Understand how the data standard defines agreement definitions: human-readable content, variables, participants, inputs, states, transitions, and execution history.
- [Onchain execution engine](https://docs.shodai.network/system-architecture/on-chain.md): Understand how the EVM execution engine deploys agreement definitions and enforces valid inputs, issuers, states, transitions, and history.
- [Architecture overview](https://docs.shodai.network/system-architecture/overview.md): Orient around agreement definitions, deployed agreement instances, onchain execution, SDKs, and supporting API layers.
- [Agreements API](https://docs.shodai.network/system-architecture/putting-it-together.md): Understand why the Agreements API is the product integration layer for agreement creation, deployment, monitoring, and participant workflows.
- [Repositories](https://docs.shodai.network/system-architecture/repositories.md): Understand which repositories own the agreement data standard, EVM execution engine, and TypeScript API client.
- [Deploy an Agreement](https://docs.shodai.network/workflow/deploy-an-agreement.md): Turn structurally valid agreement JSON into a live agreement with deployment values, participant mappings, preflight checks, and EIP-712 authorization.
- [Operate a Deployed Agreement](https://docs.shodai.network/workflow/operate-a-deployed-agreement.md): Read a deployed agreement, submit signed inputs, and confirm state and input-history changes.

## OpenAPI Specs

- [openapi](https://docs.shodai.network/openapi.json)
