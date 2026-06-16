#!/usr/bin/env node
/**
 * Hosted Streamable HTTP entrypoint.
 *
 * Environment variables:
 * - `PORT`: listen port (default 3905).
 * - `HOST`: bind host (default 0.0.0.0).
 * - `MCP_PATH`: MCP endpoint path (default `/mcp`).
 * - `AGREEMENTS_API_ENVIRONMENT`: `testnet` (default) or `production`.
 * - `AGREEMENTS_API_BASE_URL`: explicit upstream gateway origin override.
 */
import type { AgreementsApiEnvironment } from '@cns-labs/agreements-api-client';

import { startAgreementsMcpHttpServer } from './http.js';

function resolveEnvironment(): AgreementsApiEnvironment {
  const raw = process.env.AGREEMENTS_API_ENVIRONMENT?.trim().toLowerCase();
  if (raw === 'production') return 'production';
  return 'testnet';
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT) || 3905;
  const host = process.env.HOST?.trim() || '0.0.0.0';
  const mcpPath = process.env.MCP_PATH?.trim() || '/mcp';
  const baseUrl = process.env.AGREEMENTS_API_BASE_URL?.trim() || undefined;
  const environment = resolveEnvironment();

  await startAgreementsMcpHttpServer({ port, host, mcpPath, baseUrl, environment });

  const upstream = baseUrl ?? `environment=${environment}`;
  console.log(
    `agreements-mcp-server listening on http://${host}:${port}${mcpPath} (upstream: ${upstream}, auth: api-key)`,
  );
}

main().catch((error) => {
  console.error('agreements-mcp-server failed to start:', error);
  process.exit(1);
});
