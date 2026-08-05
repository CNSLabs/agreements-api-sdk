#!/usr/bin/env node
/**
 * Local stdio entrypoint. Builds a fixed Agreements API client from environment
 * variables, mirroring `@shodai-network/agreements-api-client` conventions:
 *
 * - `AGREEMENTS_API_KEY` (or `API_KEY`): API key sent as `X-API-Key`.
 * - `OAUTH_CLIENT_ID` + `OAUTH_CLIENT_PRIVATE_JWK` + (`OAUTH_ISSUER_URL` or
 *   `OAUTH_TOKEN_URL`): OAuth client-credentials auth (bearer tokens) as an
 *   alternative to an API key; `OAUTH_SCOPE` optionally narrows token scopes.
 * - `AGREEMENTS_API_ENVIRONMENT`: `testnet` (default) or `production`.
 * - `AGREEMENTS_API_BASE_URL`: explicit gateway origin override.
 * - `AGREEMENTS_SIGNER_PRIVATE_KEY`: optional local permit signer (dev/testnet pattern).
 * - `AGREEMENTS_RPC_URL` / `AGREEMENTS_RPC_URL_<chainId>`: optional RPC overrides for signing.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ApiClient, type AgreementsApiEnvironment, type BearerTokenProvider } from '@shodai-network/agreements-api-client';
import { createClientCredentialsTokenProvider } from '@shodai-network/agreements-api-client/oauth';

import { createAgreementsMcpServer } from './server.js';

function resolveEnvironment(): AgreementsApiEnvironment {
  const raw = process.env.AGREEMENTS_API_ENVIRONMENT?.trim().toLowerCase();
  if (raw === 'production') return 'production';
  return 'testnet';
}

function resolveOauthTokenProvider(): BearerTokenProvider | undefined {
  const clientId = process.env.OAUTH_CLIENT_ID?.trim();
  const privateJwk = process.env.OAUTH_CLIENT_PRIVATE_JWK?.trim();
  if (!clientId || !privateJwk) return undefined;
  return createClientCredentialsTokenProvider({
    clientId,
    privateJwk,
    issuer: process.env.OAUTH_ISSUER_URL?.trim() || undefined,
    tokenUrl: process.env.OAUTH_TOKEN_URL?.trim() || undefined,
    scope: process.env.OAUTH_SCOPE?.trim() || undefined,
  });
}

async function main(): Promise<void> {
  const apiKey = process.env.AGREEMENTS_API_KEY?.trim() || process.env.API_KEY?.trim() || undefined;
  const baseUrl = process.env.AGREEMENTS_API_BASE_URL?.trim() || undefined;

  let client: ApiClient | undefined;
  const server = createAgreementsMcpServer({
    getClient: () => {
      if (!client) {
        const tokenProvider = apiKey ? undefined : resolveOauthTokenProvider();
        if (!apiKey && !tokenProvider) {
          throw new Error(
            'Missing Agreements API credentials. Set AGREEMENTS_API_KEY (or API_KEY), or OAUTH_CLIENT_ID + OAUTH_CLIENT_PRIVATE_JWK + OAUTH_ISSUER_URL for OAuth client-credentials auth.',
          );
        }
        const auth = apiKey ? { apiKey } : { tokenProvider };
        client = new ApiClient(
          baseUrl ? { baseUrl, ...auth } : { environment: resolveEnvironment(), ...auth },
        );
      }
      return client;
    },
    allowEnvSigner: true,
  });

  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error('agreements-mcp-server failed to start:', error);
  process.exit(1);
});
