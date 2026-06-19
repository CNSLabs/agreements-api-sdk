#!/usr/bin/env node
/**
 * Local stdio entrypoint. Builds a fixed Agreements API client from environment
 * variables, mirroring `@cns-labs/agreements-api-client` conventions:
 *
 * - `AGREEMENTS_API_KEY` (or `API_KEY`): API key sent as `X-API-Key`.
 * - `AGREEMENTS_API_ENVIRONMENT`: `testnet` (default) or `production`.
 * - `AGREEMENTS_API_BASE_URL`: explicit gateway origin override.
 * - `AGREEMENTS_SIGNER_PRIVATE_KEY`: optional local permit signer (dev/testnet pattern).
 * - `AGREEMENTS_RPC_URL` / `AGREEMENTS_RPC_URL_<chainId>`: optional RPC overrides for signing.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ApiClient, type AgreementsApiEnvironment } from '@cns-labs/agreements-api-client';

import { createAgreementsMcpServer } from './server.js';

function resolveEnvironment(): AgreementsApiEnvironment {
  const raw = process.env.AGREEMENTS_API_ENVIRONMENT?.trim().toLowerCase();
  if (raw === 'production') return 'production';
  return 'testnet';
}

async function main(): Promise<void> {
  const apiKey = process.env.AGREEMENTS_API_KEY?.trim() || process.env.API_KEY?.trim() || undefined;
  const baseUrl = process.env.AGREEMENTS_API_BASE_URL?.trim() || undefined;

  let client: ApiClient | undefined;
  const server = createAgreementsMcpServer({
    getClient: () => {
      if (!client) {
        if (!apiKey) {
          throw new Error(
            'Missing Agreements API key. Set AGREEMENTS_API_KEY (or API_KEY) in the environment of this MCP server process.',
          );
        }
        client = new ApiClient(
          baseUrl ? { baseUrl, apiKey } : { environment: resolveEnvironment(), apiKey },
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
