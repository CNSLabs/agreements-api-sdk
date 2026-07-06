import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiClient, type ApiClientConfig } from '@shodai-network/agreements-api-client';

import { registerReadTools, type ClientResolver, type ToolEnvironmentMode } from './tools.js';
import { registerWriteTools } from './write-tools.js';
import { registerResources } from './resources.js';
import { registerPrompts } from './prompts.js';

export const SERVER_NAME = 'agreements-mcp-server';
export const SERVER_VERSION = '0.1.0';

export type AgreementsMcpServerOptions = {
  /**
   * Resolves the Agreements API client used by tool calls.
   * HTTP mode passes a per-request resolver bound to the caller's API key;
   * stdio mode passes a fixed client built from environment variables.
   */
  getClient: ClientResolver;
  /**
   * Hosted remote mode requires agents to choose the Agreements API environment
   * per API-calling tool. Local stdio mode keeps a fixed environment selected
   * by process configuration.
   */
  toolEnvironmentMode?: ToolEnvironmentMode;
  /**
   * Allow permit signing with `AGREEMENTS_SIGNER_PRIVATE_KEY` from the
   * environment. Only safe for local single-user (stdio) deployments;
   * hosted multi-tenant mode must keep this off. Defaults to false.
   */
  allowEnvSigner?: boolean;
};

/** Builds a fully configured MCP server (tools + resources + prompts). */
export function createAgreementsMcpServer(options: AgreementsMcpServerOptions): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions: [
        'This server exposes the Shodai Agreements API: author, validate, deploy, and operate verifiable on-chain agreements.',
        'Authoring loop: read the simple/complex example resources to learn the agreement JSON shape, draft the document, then iterate with validate_agreement until it has no blocking warnings, and run preflight_deployment before any signing.',
        'Reads (list_agreements, get_agreement, get_agreement_state, get_input_history) require the agreements.read scope; validation tools require agreements.write.',
        options.toolEnvironmentMode === 'required'
          ? 'Hosted tool calls must include environment: "testnet" or "production"; API keys only work in the environment where they were created.'
          : 'This server uses the fixed Agreements API environment configured for the local process.',
        'For deployment, signing, and troubleshooting workflows beyond these tools, fetch the docs pages listed in the docs-index resource.',
      ].join(' '),
    },
  );

  const environmentMode = options.toolEnvironmentMode ?? 'fixed';
  registerReadTools(server, options.getClient, { environmentMode });
  registerWriteTools(server, options.getClient, {
    allowEnvSigner: options.allowEnvSigner ?? false,
    environmentMode,
  });
  registerResources(server);
  registerPrompts(server);

  return server;
}

/** Builds an Agreements API client from explicit config (helper for entrypoints). */
export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}
