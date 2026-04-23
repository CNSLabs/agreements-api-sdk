# @cns-labs/agreements-api-client

TypeScript client for the CNS Partner API, including built-in permit-signing helpers for agreement deployment and input submission.

The package bundles:

- `PartnerApiClient` for the HTTP API
- typed request and response models
- helper utilities for partner API paths and execution input IDs
- `viem` helpers that compose with `@cns-labs/agreements-protocol-evm`

Maintainer workflows such as local builds and publishing live in `DEVELOPMENT.md`.

## Install

```bash
pnpm add @cns-labs/agreements-api-client viem
```

## Create a Client

```typescript
import { PartnerApiClient } from '@cns-labs/agreements-api-client';

const client = new PartnerApiClient({
  baseUrl: 'https://api.example.com',
  apiKey: process.env.CNS_PARTNER_API_KEY,
});

const health = await client.getHealth();
```

## Validate and Deploy

```typescript
const validation = await client.validateDeployment({
  agreement,
  initValues,
  participants,
  observers,
});

const deployed = await client.deployWithPermit({
  agreement,
  displayName: 'Consulting Agreement',
  signer,
  deadline,
  signature,
  initValues,
  participants,
});
```

## Sign With viem Helpers

```typescript
import {
  computeDefaultDeadlineSeconds,
  deployAgreementWithPermit,
  submitAgreementInputWithPermit,
} from '@cns-labs/agreements-api-client';

const agreementRecord = await deployAgreementWithPermit({
  client,
  walletClient,
  publicClient,
  agreement,
  displayName: 'Consulting Agreement',
  initValues,
});

await submitAgreementInputWithPermit({
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

## Main Methods

- `getOpenApiDocument()`
- `getHealth()`
- `listAgreements()`
- `getAgreement()`
- `validateTemplate()`
- `validateDeployment()`
- `deployWithPermit()`
- `getAgreementState()`
- `listAgreementInputs()`
- `submitAgreementInput()`
- `exchangeJson()` for raw response inspection

## Runtime Notes

- Node `>=18`
- Uses global `fetch` by default; pass `fetch` in the constructor if your runtime needs a custom implementation
- The package publishes a single root entrypoint for both API methods and signing helpers
