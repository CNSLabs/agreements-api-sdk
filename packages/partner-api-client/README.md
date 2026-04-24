# @cns-labs/agreements-api-client

TypeScript client for the CNS Partner API, including built-in helpers for agreement validation, deployment, inspection, and permit-based input submission.

The package bundles:

- `PartnerApiClient` for the HTTP API
- typed request and response models
- helper utilities for partner API paths and execution input IDs
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
import { PartnerApiClient } from '@cns-labs/agreements-api-client';

const client = new PartnerApiClient({
  environment: 'testnet',
  apiKey: process.env.CNS_PARTNER_API_KEY,
});

const health = await client.getHealth();
```

### Environment resolution

- `testnet` resolves to `https://testnet.shodai.network`
- `production` resolves to `https://app.shodai.network`
- The client automatically prefixes requests with `/partner-api/v0/*`

### Optional `baseUrl` override

Use `baseUrl` only when you need to bypass the standard Shodai environment mapping, for example:

- local proxies
- internal gateways
- custom preview or staging deployments

```ts
const client = new PartnerApiClient({
  environment: 'testnet',
  baseUrl: 'http://localhost:8080',
  apiKey: process.env.CNS_PARTNER_API_KEY,
});
```

When `baseUrl` is provided, it wins over the environment host mapping.

### Authentication and custom headers

- `apiKey` is sent as `X-API-Key`
- use the partner API key issued for your partner principal by CNS Labs or your deployment operator
- `headers` lets you attach correlation IDs, telemetry headers, or other partner-specific request metadata
- `fetch` can be overridden if your runtime does not provide a compatible global `fetch`

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
const agreements = await client.listAgreements({ status: 'Deployed' });
const agreementRecord = await client.getAgreement(agreements[0].id);
const state = await client.getAgreementState(agreementRecord.id);
const inputs = await client.listAgreementInputs(agreementRecord.id);

console.log(state.state);
console.log(inputs.length);
```

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
- `listAgreements()` and `getAgreement()` to browse or load agreement records
- `validateTemplate()` and `validateDeployment()` before deploy
- `deployWithPermit()` and `submitAgreementInput()` for HTTP-only signed calls
- `exchangeJson()` for low-level debugging with full status, headers, and raw body access

## Reference Implementation

For a complete browser workflow, see the playground:

- [`../../apps/partner-api-playground/README.md`](../../apps/partner-api-playground/README.md)
- [`../../apps/partner-api-playground/src/App.tsx`](../../apps/partner-api-playground/src/App.tsx)

The playground demonstrates:

- validating inline agreement JSON
- signing and posting `deploy-with-permit`
- loading agreement state and cached inputs
- signing and posting `/agreements/:id/input`

## Runtime Notes

- Node `>=18`
- Uses global `fetch` by default; pass `fetch` in the constructor if your runtime needs a custom implementation
- The package publishes a single root entrypoint for both API methods and signing helpers
