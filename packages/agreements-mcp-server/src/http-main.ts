#!/usr/bin/env node
/**
 * Hosted Streamable HTTP entrypoint.
 *
 * Environment variables:
 * - `PORT`: listen port (default 3905).
 * - `HOST`: bind host (default 0.0.0.0).
 * - `MCP_PATH`: MCP endpoint path (default `/mcp`).
 * - `PUBLIC_MCP_URL`: canonical public MCP endpoint URL advertised in discovery metadata.
 * - `AGREEMENTS_API_TESTNET_BASE_URL`: upstream testnet gateway origin override.
 * - `AGREEMENTS_API_PRODUCTION_BASE_URL`: upstream production gateway origin override.
 * - `AGREEMENTS_API_BASE_URL`: local fixed-origin override used for both environments.
 * - `OAUTH_AUTHORIZATION_SERVERS`: comma-separated issuer URLs; when set, enables
 *   RFC 9728 protected-resource metadata, WWW-Authenticate challenges, and
 *   OAuth access-token forwarding alongside API keys.
 * - `OAUTH_RESOURCE`: optional RFC 9728 `resource` (defaults to PUBLIC_MCP_URL /
 *   request-derived MCP URL).
 */
import { startAgreementsMcpHttpServer } from './http.js';

async function main(): Promise<void> {
  const port = Number(process.env.PORT) || 3905;
  const host = process.env.HOST?.trim() || '0.0.0.0';
  const mcpPath = process.env.MCP_PATH?.trim() || '/mcp';
  const publicMcpUrl = process.env.PUBLIC_MCP_URL?.trim() || undefined;
  const baseUrl = process.env.AGREEMENTS_API_BASE_URL?.trim() || undefined;
  const baseUrls = {
    testnet: process.env.AGREEMENTS_API_TESTNET_BASE_URL?.trim() || undefined,
    production: process.env.AGREEMENTS_API_PRODUCTION_BASE_URL?.trim() || undefined,
  };
  const authorizationServers = (process.env.OAUTH_AUTHORIZATION_SERVERS ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const oauthResource = process.env.OAUTH_RESOURCE?.trim() || undefined;

  await startAgreementsMcpHttpServer({
    port,
    host,
    mcpPath,
    publicMcpUrl,
    baseUrl,
    baseUrls,
    authorizationServers,
    oauthResource,
  });

  const authModes = authorizationServers.length > 0 ? 'api-key+oauth' : 'api-key';
  console.log(
    `agreements-mcp-server listening on http://${host}:${port}${mcpPath} (upstream: selectable environments, auth: ${authModes})`,
  );
}

main().catch((error) => {
  console.error('agreements-mcp-server failed to start:', error);
  process.exit(1);
});
