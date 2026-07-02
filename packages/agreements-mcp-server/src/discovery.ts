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
            description: 'Bearer API key for the Shodai MCP endpoint.',
            isRequired: true,
            isSecret: true,
            value: 'Bearer {token}',
            variables: {
              token: {
                description: 'Shodai API key beginning with cns_pk_',
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
