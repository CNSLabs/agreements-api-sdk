import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js';

import { SERVER_VERSION } from './server.js';

export const PUBLIC_MCP_URL = 'https://shodai.network/mcp';
export const SERVER_CARD_PATH = '/.well-known/mcp/server-card.json';
export const MCP_JSON_SERVER_CARD_PATH = '/.well-known/mcp.json';
export const LEGACY_SERVER_CARD_PATH = '/mcp/server-card';
export const SERVER_CARD_PATHS = [
  SERVER_CARD_PATH,
  MCP_JSON_SERVER_CARD_PATH,
  LEGACY_SERVER_CARD_PATH,
] as const;
export const MCP_CATALOG_PATH = '/.well-known/mcp/catalog.json';
export const SERVER_CARD_URL = 'https://shodai.network/.well-known/mcp/server-card.json';
export const SERVER_CARD_MEDIA_TYPE = 'application/mcp-server-card+json';
export const DISCOVERY_CACHE_CONTROL = 'public, max-age=3600';

/** RFC 9728 OAuth Protected Resource Metadata (MCP authorization discovery). */
export const OAUTH_PROTECTED_RESOURCE_PATH = '/.well-known/oauth-protected-resource';
export const OAUTH_PROTECTED_RESOURCE_MCP_PATH = '/.well-known/oauth-protected-resource/mcp';
export const OAUTH_PROTECTED_RESOURCE_PATHS = [
  OAUTH_PROTECTED_RESOURCE_PATH,
  OAUTH_PROTECTED_RESOURCE_MCP_PATH,
] as const;

export const MCP_OAUTH_SCOPES_SUPPORTED = [
  'agreements.read',
  'agreements.write',
  'webhooks.read',
  'webhooks.write',
] as const;

export type ProtectedResourceMetadata = {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
};

/**
 * Build RFC 9728 protected-resource metadata for the hosted MCP endpoint.
 * `authorizationServers` are issuer base URLs (e.g. `https://host/auth-api`).
 */
export function createProtectedResourceMetadata(options: {
  resource: string;
  authorizationServers: string[];
  scopesSupported?: readonly string[];
}): ProtectedResourceMetadata {
  const servers = options.authorizationServers
    .map(server => server.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (servers.length === 0) {
    throw new Error('authorizationServers must include at least one issuer URL');
  }
  return {
    resource: options.resource.replace(/\/+$/, ''),
    authorization_servers: [...new Set(servers)],
    scopes_supported: [...(options.scopesSupported ?? MCP_OAUTH_SCOPES_SUPPORTED)],
    bearer_methods_supported: ['header'],
  };
}

export function isOauthProtectedResourcePath(pathname: string): boolean {
  return (OAUTH_PROTECTED_RESOURCE_PATHS as readonly string[]).includes(pathname);
}

export function createAgreementsMcpServerCard(publicMcpUrl: string = PUBLIC_MCP_URL) {
  return {
    $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
    name: 'network.shodai/agreements',
    title: 'Shodai Agreements',
    description: 'Author, validate, deploy, and operate Shodai on-chain agreements.',
    version: SERVER_VERSION,
    websiteUrl: 'https://docs.shodai.network/sdks/quickstart-with-mcp',
    repository: {
      url: 'https://github.com/CNSLabs/agreements-api-sdk',
      source: 'github',
      subfolder: 'packages/agreements-mcp-server',
    },
    remotes: [
      {
        type: 'streamable-http',
        url: publicMcpUrl,
        supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
        headers: [
          {
            name: 'Authorization',
            description:
              'Bearer credentials for the Shodai MCP endpoint: an API key (`cns_pk_…`) or an OAuth access token from the authorization server advertised in protected-resource metadata.',
            isRequired: true,
            isSecret: true,
            value: 'Bearer {token}',
            variables: {
              token: {
                description:
                  'Shodai API key (`cns_pk_…`) or OAuth access token from the Agreements authorization server',
                isRequired: true,
                isSecret: true,
              },
            },
          },
        ],
      },
    ],
  } as const;
}

export const AGREEMENTS_MCP_SERVER_CARD = createAgreementsMcpServerCard();

export function createAgreementsMcpCatalog(serverCardUrl: string = SERVER_CARD_URL) {
  return {
    specVersion: 'draft',
    entries: [
      {
        identifier: 'urn:mcp:server:network.shodai/agreements',
        displayName: 'Shodai Agreements',
        mediaType: SERVER_CARD_MEDIA_TYPE,
        url: serverCardUrl,
      },
    ],
  } as const;
}

export const AGREEMENTS_MCP_CATALOG = createAgreementsMcpCatalog();
