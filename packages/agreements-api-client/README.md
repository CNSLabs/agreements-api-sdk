# @shodai-network/agreements-api-client

TypeScript client for the Agreements API, including built-in helpers for agreement validation, deployment, inspection, webhook subscriptions, and permit-based input submission.

The package bundles:

- `ApiClient` for the HTTP API
- typed request and response models
- helper utilities for Agreements API paths and execution input IDs
- `viem` helpers that compose with agreement deployment and input-signing flows

Maintainer workflows such as local builds and publishing live in [`DEVELOPMENT.md`](./DEVELOPMENT.md).

## Install

Install the client for HTTP-only usage:

```bash
npm install @shodai-network/agreements-api-client
```

Add `viem` if you want the built-in wallet signing helpers:

```bash
npm install @shodai-network/agreements-api-client viem
```

## Create a Client

```ts
import { ApiClient } from '@shodai-network/agreements-api-client';

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

Hosted environments can support multiple agreement deployment chains at once. The `testnet` environment supports Linea Sepolia (`59141`), Ethereum Sepolia (`11155111`), and Base Sepolia (`84532`); the `production` environment supports Linea Mainnet (`59144`) and Base Mainnet (`8453`). Include a supported `chainId` when validating and deploying agreements, and use the deployed agreement record's `chainId` when signing inputs.

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
- `tokenProvider` sends `Authorization: Bearer <token>` instead of an API key (see [OAuth client credentials](#oauth-client-credentials-agents) below); `apiKey` and `tokenProvider` are mutually exclusive
- `headers` lets you attach correlation IDs, telemetry headers, or other request metadata
- `fetch` can be overridden if your runtime does not provide a compatible global `fetch`

### OAuth client credentials (agents)

Agent identities provisioned with an OAuth client (`cns_oa_...`) can authenticate with short-lived bearer tokens instead of an API key. The Node-only `/oauth` subpath export signs `private_key_jwt` client assertions with your private ES256 JWK, mints tokens via the `client_credentials` grant, caches them, and refreshes them shortly before expiry:

```ts
import { ApiClient } from '@shodai-network/agreements-api-client';
import { createClientCredentialsTokenProvider } from '@shodai-network/agreements-api-client/oauth';

const client = new ApiClient({
  baseUrl: process.env.EXTERNAL_API_BASE_URL,
  tokenProvider: createClientCredentialsTokenProvider({
    clientId: process.env.OAUTH_CLIENT_ID,
    privateJwk: process.env.OAUTH_CLIENT_PRIVATE_JWK, // JSON string or object
    issuer: process.env.OAUTH_ISSUER_URL, // token endpoint discovered via .well-known
    scope: 'agreements.read agreements.write', // optional; defaults to the client's allowed scopes
  }),
});
```

Pass `tokenUrl` instead of `issuer` to skip metadata discovery. The private JWK must never ship to a browser; browser apps should pass a custom `tokenProvider` that fetches tokens from a backend holding the key. The `/oauth` module uses `node:crypto`, so importing it requires Node 18+.

### OAuth delegated access (on behalf of a user)

Public clients (CLIs, desktop tools) can use `authorization_code` + PKCE so a human consents in the browser and the app receives tokens whose `sub` is that user. `OauthDelegatedSession` handles loopback callback (RFC 8252), code exchange, access-token caching, refresh-token rotation, and revoke:

```ts
import { ApiClient } from '@shodai-network/agreements-api-client';
import { OauthDelegatedSession } from '@shodai-network/agreements-api-client/oauth';

const session = new OauthDelegatedSession({
  clientId: process.env.OAUTH_CLIENT_ID!,
  issuer: process.env.OAUTH_ISSUER_URL, // discovers authorize/token/revoke via .well-known
  scope: 'agreements.read agreements.write',
  onTokensUpdated: async (tokens) => {
    // persist tokens.refreshToken securely
  },
});

await session.loginWithLoopback(); // opens browser; register redirect http://127.0.0.1/callback

const client = new ApiClient({
  baseUrl: process.env.EXTERNAL_API_BASE_URL,
  tokenProvider: session.tokenProvider(),
});
```

Register the OAuth app in the developer portal (**Profile → OAuth apps**) with redirect URI `http://127.0.0.1/callback`. For a ready-made CLI that stores the session under `~/.config/shodai/`, see [`apps/oauth-connect-cli`](../../apps/oauth-connect-cli).

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
- manage webhook subscriptions
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
  chainId: 59141,
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
  chainId: 59141,
  signer,
  deadline,
  signature,
  initValues,
  participants,
  observers,
  notificationTemplate: {
    rules: [
      {
        id: 'deployment-follow-up',
        name: 'Deployment follow-up',
        trigger: { type: 'onTransition', inputs: ['__deploy'] },
        recipients: ['@observers'],
        notification: {
          channel: 'external_webhook',
          subject: 'Agreement deployed',
          body: 'Agreement ${agreementId} is ready for review.',
        },
      },
    ],
  },
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
} from '@shodai-network/agreements-api-client';

const agreementRecord = await deployAgreementWithPermit({
  client,
  walletClient,
  publicClient,
  chainId: 59141,
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
- a selected `chainId` supported by the target API environment
- chain configuration compatible with that selected deployment chain
- `viem` `walletClient` and `publicClient`

### 5. Inspect agreements after deployment

```ts
const agreementsPage = await client.listAgreements({
  chainId: 59141,
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
- `chainId`: agreement deployment chain
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
import { getExecutionInputIds } from '@shodai-network/agreements-api-client';

const inputIds = getExecutionInputIds(agreement);
console.log(inputIds);
```

This reads `execution.inputs` keys from the parsed agreement document.

### 7. Subscribe to webhooks

Create a webhook when your integration should receive signed push notifications for agreement activity or triggered notification rules instead of polling state.

```ts
const webhook = await client.createWebhook({
  url: 'https://example.com/shodai/webhooks',
  eventTypes: ['agreement.transitioned', 'agreement.notification.triggered'],
  filters: {
    templateIds: ['did:template:service-retainer-v0-1'],
    ruleIds: ['deployment-follow-up'],
  },
});

console.log(webhook.id);
console.log(webhook.secret);
```

Store `webhook.secret` immediately. It is returned only in the create response and is used to verify delivery signatures.

```ts
const webhooks = await client.listWebhooks();
await client.testWebhook(webhooks.data[0].id);
```

Use `deleteWebhook(webhookId)` to disable a subscription. The API returns the disabled subscription; it does not hard-delete the record.

Webhook deliveries are JSON `POST` requests signed with the subscription secret. In your backend webhook route, pass the exact raw body and request headers to the server-side receiver helper before trusting or parsing the event:

```json
{
  "id": "evt_123",
  "type": "agreement.transitioned",
  "apiVersion": "2026-06-01",
  "createdAt": "2026-06-02T18:00:00.000Z",
  "data": {
    "agreementId": "agr_123",
    "templateId": "did:template:service-retainer-v0-1",
    "fromState": "AWAITING_PAYMENT",
    "toState": "WORK_IN_PROGRESS",
    "inputId": "submitInitialPaymentProof"
  }
}
```

```ts
import { createServer } from 'node:http';
import { constructWebhookEvent, WebhookVerificationError } from '@shodai-network/agreements-api-client/webhooks';

const webhookSecret = process.env.SHODAI_WEBHOOK_SECRET!;

createServer((request, response) => {
  if (request.method !== 'POST' || request.url !== '/shodai/webhooks') {
    response.writeHead(404);
    response.end();
    return;
  }

  const chunks: Buffer[] = [];
  request.on('data', chunk => chunks.push(Buffer.from(chunk)));
  request.on('end', () => {
    const rawBody = Buffer.concat(chunks);

    try {
      const event = constructWebhookEvent(rawBody, request.headers, webhookSecret);

      if (event.type === 'agreement.transitioned') {
        console.log(event.data.agreementId, event.data.fromState, event.data.toState);
      }

      response.writeHead(204);
      response.end();
    } catch (error) {
      if (error instanceof WebhookVerificationError) {
        response.writeHead(error.statusCode);
        response.end(error.code);
        return;
      }
      response.writeHead(500);
      response.end('webhook_error');
    }
  });
}).listen(3000);
```

Do not verify against an already parsed JSON object; signature verification depends on the original raw bytes. The SDK verifies Shodai's signature, timestamp tolerance, required headers, header/body event id consistency, and JSON event envelope shape. Your application still owns durable deduplication by the signed event `id`, queues, logging, persistence, and business side effects.

### 8. Submit a signed execution input

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
} from '@shodai-network/agreements-api-client';

const inputRecord = await submitAgreementInputWithPermit({
  client,
  agreementId: agreementRecord.id,
  walletClient,
  publicClient,
  chainId: agreementRecord.chainId,
  agreementContractAddress,
  agreement,
  inputId: 'partyASignature',
  values,
  deadline: computeDefaultDeadlineSeconds(),
});
```

## Agreement JSON and Types

The client accepts agreement JSON as `Record<string, unknown>` for HTTP transport. This keeps the API client usable even if your app manages agreement JSON outside this package.

If your application already uses typed agreement objects, the `viem` helper layer is designed to work with agreement data compatible with `AgreementJson` from `@shodai-network/agreements-protocol-evm`.

In practice:

- use plain JSON objects for validation and transport-centric API calls
- use typed agreement objects when you want stronger guarantees around signing and execution flows

## Useful Methods

- `getOpenApiDocument()` to inspect the raw OpenAPI document exposed by the gateway
- `getHealth()` to check gateway reachability
- `createWebhook()`, `listWebhooks()`, `getWebhook()`, `updateWebhook()`, `deleteWebhook()`, and `testWebhook()` to manage signed webhook subscriptions. `deleteWebhook()` disables the subscription.
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
