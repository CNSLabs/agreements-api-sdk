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
 *
 * OAuth 2.1 discovery (optional; both required to enable):
 * - `MCP_OAUTH_RESOURCE_URL`: canonical resource identifier (RFC 8707), e.g.
 *   `https://test-api.shodai.network/mcp`.
 * - `MCP_OAUTH_AUTHORIZATION_SERVERS`: comma-separated authorization server issuer URLs.
 * - `MCP_OAUTH_SCOPES`: optional comma-separated scope override.
 * - `MCP_OAUTH_RESOURCE_DOCUMENTATION`: optional docs URL surfaced in the metadata.
 */
import type { AgreementsApiEnvironment } from '@cns-labs/agreements-api-client';

import { startAgreementsMcpHttpServer, type AgreementsMcpOauthOptions } from './http.js';

function resolveEnvironment(): AgreementsApiEnvironment {
  const raw = process.env.AGREEMENTS_API_ENVIRONMENT?.trim().toLowerCase();
  if (raw === 'production') return 'production';
  return 'testnet';
}

function splitCsv(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function resolveOauth(): AgreementsMcpOauthOptions | undefined {
  const resource = process.env.MCP_OAUTH_RESOURCE_URL?.trim();
  const authorizationServers = splitCsv(process.env.MCP_OAUTH_AUTHORIZATION_SERVERS);
  if (!resource || authorizationServers.length === 0) return undefined;
  const scopes = splitCsv(process.env.MCP_OAUTH_SCOPES);
  return {
    resource,
    authorizationServers,
    ...(scopes.length > 0 ? { scopesSupported: scopes } : {}),
    ...(process.env.MCP_OAUTH_RESOURCE_DOCUMENTATION?.trim()
      ? { resourceDocumentation: process.env.MCP_OAUTH_RESOURCE_DOCUMENTATION.trim() }
      : {}),
  };
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT) || 3905;
  const host = process.env.HOST?.trim() || '0.0.0.0';
  const mcpPath = process.env.MCP_PATH?.trim() || '/mcp';
  const baseUrl = process.env.AGREEMENTS_API_BASE_URL?.trim() || undefined;
  const environment = resolveEnvironment();
  const oauth = resolveOauth();

  await startAgreementsMcpHttpServer({ port, host, mcpPath, baseUrl, environment, oauth });

  const upstream = baseUrl ?? `environment=${environment}`;
  const authModes = oauth ? 'api-key + oauth2.1' : 'api-key';
  console.log(
    `agreements-mcp-server listening on http://${host}:${port}${mcpPath} (upstream: ${upstream}, auth: ${authModes})`,
  );
}

main().catch((error) => {
  console.error('agreements-mcp-server failed to start:', error);
  process.exit(1);
});
