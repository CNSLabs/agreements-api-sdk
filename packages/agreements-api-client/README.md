# @cns-labs/agreements-api-client

TypeScript client for the Agreements API, including built-in helpers for agreement validation, deployment, inspection, and permit-based input submission.

The package bundles:

- `ApiClient` for the HTTP API
- typed request and response models
- helper utilities for Agreements API paths and execution input IDs
- `viem` helpers that compose with agreement deployment and input-signing flows

Maintainer workflows such as local builds and publishing live in [`DEVELOPMENT.md`](./DEVELOPMENT.md).

## Install

Install the client for HTTP-only usage:

```bash
npm install @cns-labs/agreements-api-client
```

Add `viem` if you want the built-in wallet signing helpers:

```bash
npm install @cns-labs/agreements-api-client viem
```

## Create a Client

```ts
import { ApiClient } from '@cns-labs/agreements-api-client';

const client = new ApiClient({
  environment: 'testnet',
  apiKey: process.env.API_KEY,
});

const health = await client.getHealth();
```

### Environment resolution

- `testnet` resolves to `https://test-api.shodai.network`
- `production` resolves to `https://api.shodai.network`
- The client automatically prefixes requests with `/v0/*`

### Optional `baseUrl` override

Use `baseUrl` only when you need to bypass the standard Shodai environment mapping, for example:

- local proxies
- internal gateways
- custom preview or staging deployments

```ts
const client = new ApiClient({
  environment: 'testnet',
  baseUrl: 'http://localhost:8080',
  apiKey: process.env.API_KEY,
});
```

When `baseUrl` is provided, it wins over the environment host mapping.

### Authentication and custom headers

- `apiKey` is sent as `X-API-Key`
- use the API key issued for your API principal by your deployment operator
- `headers` lets you attach correlation IDs, telemetry headers, or other request metadata
- `fetch` can be overridden if your runtime does not provide a compatible global `fetch`

## Response Envelopes and Query Results

The Agreements API wraps successful JSON responses in an envelope so every response can carry request metadata:

```json
{
  "data": {},
  "meta": {
    "apiVersion": "v0",
    "requestId": "req_123"
  }
}
```

The SDK unwraps single-resource responses for convenience. For example, `getAgreement()`, `getAgreementState()`, `validateTemplate()`, `validateDeployment()`, `deployWithPermit()`, and `submitAgreementInput()` return the `data` value directly.

List methods return the full list envelope because paging information is part of the result:

```ts
const agreementsPage = await client.listAgreements({ limit: 25 });

console.log(agreementsPage.data);
console.log(agreementsPage.pageInfo.nextCursor);
console.log(agreementsPage.meta.requestId);
```

List responses use:

- `data`: the current page of records
- `meta.apiVersion`: the API version that produced the response
- `meta.requestId`: the request ID to include in support or debugging reports
- `pageInfo.limit`: the page size applied by the API
- `pageInfo.nextCursor`: the cursor for the next page, or `null` when there is no next page
- `pageInfo.totalCount`: the total matching record count, when the API includes it

Error responses use an error envelope:

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Missing API key",
    "requestId": "req_123"
  }
}
```

When an SDK request fails, `AgreementsApiError#errorPayload` exposes this structured error body when the server returns it.

## Choose a Usage Path

Use the HTTP client only when you want to:

- validate templates
- validate deploy payloads
- list or fetch agreements
- inspect state and input history
- submit already-signed permit payloads

Use the `viem` helpers when you also want the SDK to:

- create the deploy permit signature
- create the execution-input permit signature
- submit the signed payload immediately after signing

## Agreement Lifecycle

### 1. Validate template JSON

Use this when you want to validate only the agreement definition:

```ts
const templateResult = await client.validateTemplate(agreement);
console.log(templateResult.inputIds);
console.log(templateResult.stateIds);
```

### 2. Validate a full deployment payload

Use this before deployment when you already know the initial values and participants:

```ts
const validation = await client.validateDeployment({
  agreement,
  initValues,
  participants,
  observers,
});

console.log(validation.participantVariableKeys);
console.log(validation.warnings);
```

### 3. Deploy with a pre-signed permit

Use this if your app signs permits itself and only needs the HTTP client to send the request:

```ts
const deployed = await client.deployWithPermit({
  agreement,
  displayName: 'Consulting Agreement',
  signer,
  deadline,
  signature,
  initValues,
  participants,
  observers,
});

console.log(deployed.id);
console.log(deployed.address);
```

### 4. Sign and deploy with `viem`

Use the helper flow when you have a `walletClient` and `publicClient` available:

```ts
import {
  computeDefaultDeadlineSeconds,
  deployAgreementWithPermit,
} from '@cns-labs/agreements-api-client';

const agreementRecord = await deployAgreementWithPermit({
  client,
  walletClient,
  publicClient,
  agreement,
  displayName: 'Consulting Agreement',
  initValues,
  participants,
  observers,
  deadline: computeDefaultDeadlineSeconds(),
});
```

This flow requires:

- a connected wallet
- chain configuration compatible with your agreement deployment
- `viem` `walletClient` and `publicClient`

### 5. Inspect agreements after deployment

```ts
const agreementsPage = await client.listAgreements({
  state: 'AWAITING_PAYMENT',
  createdAt: { gte: '2026-05-01T00:00:00.000Z' },
  sort: { createdAt: 'desc' },
  limit: 25,
});
const agreementRecord = await client.getAgreement(agreementsPage.data[0].id);
const state = await client.getAgreementState(agreementRecord.id);
const inputsPage = await client.listAgreementInputs(agreementRecord.id, {
  sort: { updatedAt: 'desc' },
  limit: 25,
});

console.log(state.state);
console.log(inputsPage.data.length);
```

`listAgreements()` returns agreement summaries. Use `getAgreement(agreementsPage.data[index].id)` when you need the full agreement JSON, participants, observers, variables, or on-chain context.

Agreement list filters:

- `state`: current agreement state, such as `AWAITING_PAYMENT`
- `createdAt` and `updatedAt`: date filters with `gt`, `gte`, `lt`, and `lte`
- `sort`: one sort field: `createdAt`, `updatedAt`, or `displayName`
- `limit`: page size
- `cursor`: cursor returned by `pageInfo.nextCursor`

Input history filters:

- `userId`: platform user ID associated with the submission
- `inputId`: input ID defined in the agreement JSON
- `status`: input submission status: `PENDING`, `MINED`, or `FAILED`
- `createdAt` and `updatedAt`: date filters with `gt`, `gte`, `lt`, and `lte`
- `sort`: one sort field: `createdAt` or `updatedAt`
- `limit`: page size
- `cursor`: cursor returned by `pageInfo.nextCursor`

Nested filters and sorts are encoded as query parameters such as `createdAt[gte]=2026-05-01T00%3A00%3A00.000Z` and `sort[createdAt]=desc`.

### 6. Discover execution input IDs

If you are rendering an input-submission UI from agreement JSON, use `getExecutionInputIds()`:

```ts
import { getExecutionInputIds } from '@cns-labs/agreements-api-client';

const inputIds = getExecutionInputIds(agreement);
console.log(inputIds);
```

This reads `execution.inputs` keys from the parsed agreement document.

### 7. Submit a signed execution input

If your app already has a permit signature:

```ts
const inputRecord = await client.submitAgreementInput(agreementId, {
  inputId: 'partyASignature',
  values,
  signer,
  deadline,
  signature,
});

console.log(inputRecord.status);
```

Or sign and submit in one step with `viem`:

```ts
import {
  computeDefaultDeadlineSeconds,
  submitAgreementInputWithPermit,
} from '@cns-labs/agreements-api-client';

const inputRecord = await submitAgreementInputWithPermit({
  client,
  agreementId: agreementRecord.id,
  walletClient,
  publicClient,
  agreementContractAddress,
  agreement,
  inputId: 'partyASignature',
  values,
  deadline: computeDefaultDeadlineSeconds(),
});
```

## Agreement JSON and Types

The client accepts agreement JSON as `Record<string, unknown>` for HTTP transport. This keeps the API client usable even if your app manages agreement JSON outside this package.

If your application already uses typed agreement objects, the `viem` helper layer is designed to work with agreement data compatible with `AgreementJson` from `@cns-labs/agreements-protocol-evm`.

In practice:

- use plain JSON objects for validation and transport-centric API calls
- use typed agreement objects when you want stronger guarantees around signing and execution flows

## Useful Methods

- `getOpenApiDocument()` to inspect the raw OpenAPI document exposed by the gateway
- `getHealth()` to check gateway reachability
- `listAgreements()` and `getAgreement()` to browse agreement summaries or load full agreement records
- `listAgreementInputs()` to inspect paged input history for an agreement
- `validateTemplate()` and `validateDeployment()` before deploy
- `deployWithPermit()` and `submitAgreementInput()` for HTTP-only signed calls
- `exchangeJson()` for low-level debugging with full status, headers, and raw body access

## Reference Implementation

For a complete browser workflow, see the playground:

- [`../../apps/agreements-api-playground/README.md`](../../apps/agreements-api-playground/README.md)
- [`../../apps/agreements-api-playground/src/App.tsx`](../../apps/agreements-api-playground/src/App.tsx)

The hosted playground is available at `https://developers.shodai.network/api-playground`.

The playground demonstrates:

- validating inline agreement JSON
- signing and posting `deploy-with-permit`
- loading agreement state and cached inputs
- signing and posting `/agreements/:id/input`

## Runtime Notes

- Node `>=18`
- Uses global `fetch` by default; pass `fetch` in the constructor if your runtime needs a custom implementation
- The package publishes a single root entrypoint for both API methods and signing helpers
