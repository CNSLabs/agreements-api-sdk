#!/usr/bin/env node
/**
 * Hosted Streamable HTTP entrypoint.
 *
 * Environment variables:
 * - `PORT`: listen port (default 3905).
 * - `HOST`: bind host (default 0.0.0.0).
 * - `MCP_PATH`: MCP endpoint path (default `/mcp`).
 * - `AGREEMENTS_API_TESTNET_BASE_URL`: upstream testnet gateway origin override.
 * - `AGREEMENTS_API_PRODUCTION_BASE_URL`: upstream production gateway origin override.
 * - `AGREEMENTS_API_BASE_URL`: local fixed-origin override used for both environments.
 */
import { startAgreementsMcpHttpServer } from './http.js';

async function main(): Promise<void> {
  const port = Number(process.env.PORT) || 3905;
  const host = process.env.HOST?.trim() || '0.0.0.0';
  const mcpPath = process.env.MCP_PATH?.trim() || '/mcp';
  const baseUrl = process.env.AGREEMENTS_API_BASE_URL?.trim() || undefined;
  const baseUrls = {
    testnet: process.env.AGREEMENTS_API_TESTNET_BASE_URL?.trim() || undefined,
    production: process.env.AGREEMENTS_API_PRODUCTION_BASE_URL?.trim() || undefined,
  };

  await startAgreementsMcpHttpServer({ port, host, mcpPath, baseUrl, baseUrls });

  console.log(
    `agreements-mcp-server listening on http://${host}:${port}${mcpPath} (upstream: selectable environments, auth: api-key)`,
  );
}

main().catch((error) => {
  console.error('agreements-mcp-server failed to start:', error);
  process.exit(1);
});
