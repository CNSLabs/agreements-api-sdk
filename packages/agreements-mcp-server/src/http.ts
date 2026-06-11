import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ApiClient, type AgreementsApiEnvironment } from '@cns-labs/agreements-api-client';

import { createAgreementsMcpServer } from './server.js';

/**
 * OAuth 2.1 protected-resource configuration (RFC 9728). When set, the server
 * advertises authorization-server discovery metadata at
 * `/.well-known/oauth-protected-resource` and challenges unauthenticated MCP
 * requests with `401` + `WWW-Authenticate` so spec-conformant clients can run
 * the authorization code + PKCE flow. Token validation itself happens at the
 * upstream gateway, which verifies issuer, signature, and RFC 8707 audience.
 */
export type AgreementsMcpOauthOptions = {
  /** Canonical resource identifier (RFC 8707), e.g. `https://test-api.shodai.network/mcp`. */
  resource: string;
  /** Issuer URLs of the authorization servers that mint tokens for this resource. */
  authorizationServers: string[];
  /** Scopes supported by the resource. Defaults to the Agreements API scopes. */
  scopesSupported?: string[];
  /** Optional human-readable docs URL surfaced in the metadata. */
  resourceDocumentation?: string;
};

export type AgreementsMcpHttpOptions = {
  /** Port to listen on. Defaults to 3905. */
  port?: number;
  /** Host to bind. Defaults to 0.0.0.0. */
  host?: string;
  /** Path serving the MCP Streamable HTTP endpoint. Defaults to `/mcp`. */
  mcpPath?: string;
  /** Named Agreements API environment used to resolve the upstream gateway. */
  environment?: AgreementsApiEnvironment;
  /** Explicit upstream gateway origin override (wins over `environment`). */
  baseUrl?: string;
  /** Enables OAuth 2.1 discovery + challenges. API-key auth keeps working alongside. */
  oauth?: AgreementsMcpOauthOptions;
};

const DEFAULT_SCOPES = ['agreements.read', 'agreements.write'];

const PROTECTED_RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-API-Key, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, MCP-Protocol-Version, WWW-Authenticate',
};

function applyCors(res: ServerResponse): void {
  for (const [header, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(header, value);
  }
}

export type McpCallerCredentials =
  | { kind: 'api-key'; apiKey: string }
  | { kind: 'bearer-jwt'; token: string };

/** Compact JWS shape: three dot-separated base64url segments. */
const JWT_PATTERN = /^[\w-]+\.[\w-]+\.[\w-]+$/;

/**
 * Extracts the caller's credentials. Opaque Agreements API keys arrive via
 * `X-API-Key` (or `Authorization: Bearer` for convenience); IdP-issued JWTs
 * arrive via `Authorization: Bearer` and are forwarded to the gateway as-is
 * so it can enforce issuer/audience/scope checks.
 */
export function extractCredentials(req: IncomingMessage): McpCallerCredentials | undefined {
  const headerKey = req.headers['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return { kind: 'api-key', apiKey: headerKey.trim() };
  }
  const authorization = req.headers.authorization;
  if (typeof authorization === 'string') {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match) {
      const value = match[1].trim();
      return JWT_PATTERN.test(value)
        ? { kind: 'bearer-jwt', token: value }
        : { kind: 'api-key', apiKey: value };
    }
  }
  return undefined;
}

/** Backwards-compatible helper: returns the raw credential string, if any. */
export function extractApiKey(req: IncomingMessage): string | undefined {
  const credentials = extractCredentials(req);
  if (!credentials) return undefined;
  return credentials.kind === 'api-key' ? credentials.apiKey : credentials.token;
}

export function buildProtectedResourceMetadata(oauth: AgreementsMcpOauthOptions): Record<string, unknown> {
  return {
    resource: oauth.resource,
    authorization_servers: oauth.authorizationServers,
    bearer_methods_supported: ['header'],
    scopes_supported: oauth.scopesSupported ?? DEFAULT_SCOPES,
    ...(oauth.resourceDocumentation
      ? { resource_documentation: oauth.resourceDocumentation }
      : {}),
  };
}

function resourceMetadataUrl(oauth: AgreementsMcpOauthOptions): string {
  const resource = new URL(oauth.resource);
  const resourcePath = resource.pathname === '/' ? '' : resource.pathname;
  return `${resource.origin}${PROTECTED_RESOURCE_METADATA_PATH}${resourcePath}`;
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

/**
 * Stateless Streamable HTTP server: each POST gets a fresh MCP server bound to
 * an Agreements API client constructed from the caller's credentials. No
 * credential is ever stored server-side; auth, scopes, metering, and 402
 * outcomes are enforced by the upstream gateway on every tool call.
 */
export function createAgreementsMcpHttpServer(options: AgreementsMcpHttpOptions = {}): Server {
  const mcpPath = options.mcpPath ?? '/mcp';
  const oauth = options.oauth;

  return createServer(async (req, res) => {
    applyCors(res);

    const url = new URL(req.url ?? '/', 'http://localhost');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && url.pathname === '/healthz') {
      sendJson(res, 200, { status: 'ok', service: 'agreements-mcp-server' });
      return;
    }

    // RFC 9728: serve metadata at both the root well-known path and the
    // path-suffixed variant (`.../oauth-protected-resource/mcp`).
    if (
      oauth &&
      req.method === 'GET' &&
      (url.pathname === PROTECTED_RESOURCE_METADATA_PATH ||
        url.pathname === `${PROTECTED_RESOURCE_METADATA_PATH}${mcpPath}`)
    ) {
      sendJson(res, 200, buildProtectedResourceMetadata(oauth));
      return;
    }

    if (url.pathname !== mcpPath) {
      sendJson(res, 404, { error: 'not_found', message: `Use POST ${mcpPath} for MCP requests.` });
      return;
    }

    if (req.method !== 'POST') {
      // Stateless mode: no SSE streams or sessions to resume/delete.
      res.writeHead(405, { Allow: 'POST', 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'method_not_allowed', message: 'This MCP server is stateless; use POST.' }));
      return;
    }

    const credentials = extractCredentials(req);

    // With OAuth configured, challenge unauthenticated requests so MCP
    // clients can discover the authorization server and run the OAuth flow.
    if (oauth && !credentials) {
      sendJson(
        res,
        401,
        {
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message:
              'Authentication required. Complete the OAuth flow advertised in WWW-Authenticate, or send an X-API-Key header.',
          },
          id: null,
        },
        {
          'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadataUrl(oauth)}"`,
        },
      );
      return;
    }

    const server = createAgreementsMcpServer({
      getClient: () => {
        if (!credentials) {
          throw new Error(
            'Missing Agreements API credentials. Send an `X-API-Key` header (or `Authorization: Bearer <token>`) on requests to this MCP server.',
          );
        }
        const base = options.baseUrl
          ? { baseUrl: options.baseUrl }
          : { environment: options.environment ?? ('testnet' as const) };
        return credentials.kind === 'bearer-jwt'
          ? new ApiClient({ ...base, headers: { Authorization: `Bearer ${credentials.token}` } })
          : new ApiClient({ ...base, apiKey: credentials.apiKey });
      },
    });

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      if (!res.headersSent) {
        sendJson(res, 500, {
          jsonrpc: '2.0',
          error: { code: -32603, message: error instanceof Error ? error.message : 'Internal error' },
          id: null,
        });
      }
    }
  });
}

export function startAgreementsMcpHttpServer(options: AgreementsMcpHttpOptions = {}): Promise<Server> {
  const port = options.port ?? 3905;
  const host = options.host ?? '0.0.0.0';
  const server = createAgreementsMcpHttpServer(options);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}
