import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ApiClient,
  resolveApiBaseUrl,
  type AgreementsApiEnvironment,
} from '@shodai-network/agreements-api-client';

import { createAgreementsMcpServer } from './server.js';
import {
  createAgreementsMcpCatalog,
  createAgreementsMcpServerCard,
  createProtectedResourceMetadata,
  DISCOVERY_CACHE_CONTROL,
  isOauthProtectedResourcePath,
  MCP_CATALOG_PATH,
  MCP_OAUTH_SCOPES_SUPPORTED,
  OAUTH_PROTECTED_RESOURCE_PATH,
  PUBLIC_MCP_URL,
  SERVER_CARD_MEDIA_TYPE,
  SERVER_CARD_PATH,
  SERVER_CARD_PATHS,
} from './discovery.js';

export type AgreementsMcpHttpOptions = {
  /** Port to listen on. Defaults to 3905. */
  port?: number;
  /** Host to bind. Defaults to 0.0.0.0. */
  host?: string;
  /** Path serving the MCP Streamable HTTP endpoint. Defaults to `/mcp`. */
  mcpPath?: string;
  /** Public canonical MCP endpoint URL advertised in discovery metadata. */
  publicMcpUrl?: string;
  /** @deprecated Hosted HTTP tool calls now select the API environment per call. */
  environment?: AgreementsApiEnvironment;
  /** Explicit upstream gateway origin override for fixed/single-environment local use. */
  baseUrl?: string;
  /** Explicit upstream gateway origins for selectable hosted environments. */
  baseUrls?: Partial<Record<AgreementsApiEnvironment, string>>;
  /**
   * Authorization server issuer URLs (RFC 8414 issuers). When non-empty, the
   * server advertises OAuth protected-resource metadata, challenges
   * unauthenticated MCP POSTs with WWW-Authenticate, and accepts OAuth
   * access tokens in addition to API keys.
   */
  authorizationServers?: string[];
  /**
   * RFC 9728 `resource` identifier. Defaults to `publicMcpUrl` or the
   * request-derived MCP URL.
   */
  oauthResource?: string;
};

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, X-API-Key, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, MCP-Protocol-Version',
};

function applyCors(res: ServerResponse): void {
  for (const [header, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(header, value);
  }
}

export type McpCallerCredentials =
  | { kind: 'api-key'; apiKey: string }
  | { kind: 'oauth'; accessToken: string };

const API_KEY_PREFIX = 'cns_pk_';
const API_KEY_CREDENTIALS_HINT =
  'Send `X-API-Key: cns_pk_...` (canonical) or `Authorization: Bearer cns_pk_...` for clients that only support bearer-style headers.';
const OAUTH_CREDENTIALS_HINT =
  'Or send `Authorization: Bearer <access_token>` from the authorization server advertised in OAuth protected-resource metadata.';

type CredentialExtractionResult =
  | { ok: true; credentials?: McpCallerCredentials }
  | { ok: false; message: string };

/**
 * Extracts the caller's credentials. API keys are always accepted. When OAuth
 * is enabled for the server (`authorizationServers` configured), JWT-shaped
 * Bearer tokens are accepted and forwarded upstream; otherwise they are rejected.
 */
export function extractCredentials(
  req: IncomingMessage,
  options: { oauthEnabled?: boolean } = {},
): McpCallerCredentials | undefined {
  const result = extractCredentialResult(req, options);
  return result.ok ? result.credentials : undefined;
}

/** Backwards-compatible helper: returns the API key string, if any. */
export function extractApiKey(req: IncomingMessage): string | undefined {
  const credentials = extractCredentials(req);
  return credentials?.kind === 'api-key' ? credentials.apiKey : undefined;
}

function credentialsHint(oauthEnabled: boolean): string {
  return oauthEnabled
    ? `${API_KEY_CREDENTIALS_HINT} ${OAUTH_CREDENTIALS_HINT}`
    : API_KEY_CREDENTIALS_HINT;
}

function extractCredentialResult(
  req: IncomingMessage,
  options: { oauthEnabled?: boolean } = {},
): CredentialExtractionResult {
  const oauthEnabled = options.oauthEnabled === true;
  const hint = credentialsHint(oauthEnabled);
  const headerApiKey = readHeaderValue(req.headers['x-api-key']);
  const authorization = readHeaderValue(req.headers.authorization);
  const bearer = authorization ? extractBearerCredential(authorization, oauthEnabled, hint) : undefined;

  if (bearer && !bearer.ok) {
    return bearer;
  }

  if (headerApiKey && bearer?.ok && bearer.credentials) {
    if (bearer.credentials.kind === 'oauth') {
      return {
        ok: false,
        message: `Conflicting Agreements API credentials were provided. ${hint}`,
      };
    }
    if (headerApiKey !== bearer.credentials.apiKey) {
      return {
        ok: false,
        message: `Conflicting Agreements API credentials were provided. ${hint}`,
      };
    }
  }

  if (headerApiKey) {
    return { ok: true, credentials: { kind: 'api-key', apiKey: headerApiKey } };
  }
  if (bearer?.ok && bearer.credentials) {
    return { ok: true, credentials: bearer.credentials };
  }
  return { ok: true };
}

function extractBearerCredential(
  authorization: string,
  oauthEnabled: boolean,
  hint: string,
):
  | { ok: true; credentials?: McpCallerCredentials }
  | { ok: false; message: string } {
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) {
    return {
      ok: false,
      message: `Unsupported Authorization header for Agreements API credentials. ${hint}`,
    };
  }

  const token = match[1]?.trim() ?? '';
  if (!token) {
    return { ok: false, message: `Missing bearer credential. ${hint}` };
  }

  if (token.startsWith(API_KEY_PREFIX)) {
    return { ok: true, credentials: { kind: 'api-key', apiKey: token } };
  }

  if (oauthEnabled && isJwtShaped(token)) {
    return { ok: true, credentials: { kind: 'oauth', accessToken: token } };
  }

  const bearerType = isJwtShaped(token)
    ? 'JWT bearer tokens'
    : 'Bearer values that are not Agreements API keys';
  return {
    ok: false,
    message: oauthEnabled
      ? `${bearerType} that are not JWT access tokens are not supported. ${hint}`
      : `${bearerType} are not supported by hosted MCP. ${hint}`,
  };
}

function readHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? '';
  return typeof value === 'string' ? value.trim() : '';
}

function readFirstHeaderValue(value: string | string[] | undefined): string {
  return readHeaderValue(value).split(',')[0]?.trim() ?? '';
}

function normalizeProtocol(value: string): 'http' | 'https' | undefined {
  const protocol = value.trim().toLowerCase();
  return protocol === 'http' || protocol === 'https' ? protocol : undefined;
}

function readForwardedProtocol(value: string | string[] | undefined): 'http' | 'https' | undefined {
  const forwarded = readFirstHeaderValue(value);
  const match = /(?:^|;)\s*proto=(https?)/i.exec(forwarded);
  return normalizeProtocol(match?.[1] ?? '');
}

function normalizeHost(host: string): string | undefined {
  try {
    return new URL(`http://${host}`).host;
  } catch {
    return undefined;
  }
}

function isLocalHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host.startsWith('localhost:') ||
    host.startsWith('127.') ||
    host === '[::1]' ||
    host.startsWith('[::1]:')
  );
}

function inferPublicProtocol(req: IncomingMessage, host: string): 'http' | 'https' {
  const cloudFrontProtocol = normalizeProtocol(readFirstHeaderValue(req.headers['cloudfront-forwarded-proto']));
  if (cloudFrontProtocol) return cloudFrontProtocol;

  const forwardedProtocol = readForwardedProtocol(req.headers.forwarded);
  if (forwardedProtocol) return forwardedProtocol;

  const xForwardedProtocol = normalizeProtocol(readFirstHeaderValue(req.headers['x-forwarded-proto']));
  if (xForwardedProtocol === 'https' || (xForwardedProtocol === 'http' && isLocalHost(host))) {
    return xForwardedProtocol;
  }

  return isLocalHost(host) ? 'http' : 'https';
}

function publicOriginForRequest(req: IncomingMessage): string {
  const fallbackOrigin = new URL(PUBLIC_MCP_URL).origin;
  const host = normalizeHost(readFirstHeaderValue(req.headers.host));
  if (!host) return fallbackOrigin;

  return `${inferPublicProtocol(req, host)}://${host}`;
}

function publicDiscoveryUrls(req: IncomingMessage, mcpPath: string): { publicMcpUrl: string; serverCardUrl: string } {
  const origin = publicOriginForRequest(req);
  return {
    publicMcpUrl: new URL(mcpPath, `${origin}/`).toString(),
    serverCardUrl: new URL(SERVER_CARD_PATH, `${origin}/`).toString(),
  };
}

function configuredPublicDiscoveryUrls(publicMcpUrl: string): { publicMcpUrl: string; serverCardUrl: string } {
  const url = new URL(publicMcpUrl);
  return {
    publicMcpUrl,
    serverCardUrl: new URL(SERVER_CARD_PATH, `${url.origin}/`).toString(),
  };
}

function isServerCardPath(pathname: string): boolean {
  return SERVER_CARD_PATHS.some((path) => path === pathname);
}

function isJwtShaped(token: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

function normalizeHttpPath(path: string): string {
  const trimmed = path.trim();
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '') || '/';
}

function resolvePublicMcpUrl(publicMcpUrl: string | undefined, mcpPath: string): string | undefined {
  const trimmed = publicMcpUrl?.trim();
  if (!trimmed) return undefined;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('PUBLIC_MCP_URL must be an absolute http or https URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('PUBLIC_MCP_URL must use http or https.');
  }
  if (url.username || url.password) {
    throw new Error('PUBLIC_MCP_URL must not include username or password.');
  }
  if (url.search || url.hash) {
    throw new Error('PUBLIC_MCP_URL must not include query or hash components.');
  }

  const normalizedPublicPath = normalizeHttpPath(url.pathname);
  if (normalizedPublicPath !== mcpPath) {
    throw new Error(`PUBLIC_MCP_URL path must match MCP_PATH (${mcpPath}).`);
  }

  url.pathname = normalizedPublicPath;
  return url.toString();
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

function resolveEnvironmentBaseUrl(
  options: AgreementsMcpHttpOptions,
  environment: AgreementsApiEnvironment,
): string {
  return options.baseUrls?.[environment]?.trim() || options.baseUrl?.trim() || resolveApiBaseUrl(environment);
}

/**
 * Stateless Streamable HTTP server: each POST gets a fresh MCP server bound to
 * an Agreements API client constructed from the caller's credentials. No
 * credential is ever stored server-side; auth, entitlements, metering, and 402
 * outcomes are enforced by the upstream gateway on every tool call.
 */
export function createAgreementsMcpHttpServer(options: AgreementsMcpHttpOptions = {}): Server {
  const mcpPath = normalizeHttpPath(options.mcpPath ?? '/mcp');
  const publicMcpUrl = resolvePublicMcpUrl(options.publicMcpUrl, mcpPath);
  const authorizationServers = (options.authorizationServers ?? [])
    .map(server => server.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const oauthEnabled = authorizationServers.length > 0;
  const configuredOauthResource = options.oauthResource?.trim().replace(/\/+$/, '') || undefined;

  return createServer(async (req, res) => {
    applyCors(res);

    const url = new URL(req.url ?? '/', 'http://localhost');
    const discoveryUrls = publicMcpUrl
      ? configuredPublicDiscoveryUrls(publicMcpUrl)
      : publicDiscoveryUrls(req, mcpPath);
    const oauthResource = configuredOauthResource || discoveryUrls.publicMcpUrl;
    const protectedResourceMetadataUrl = new URL(
      OAUTH_PROTECTED_RESOURCE_PATH,
      `${new URL(oauthResource).origin}/`,
    ).toString();

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && url.pathname === '/healthz') {
      sendJson(res, 200, { status: 'ok', service: 'agreements-mcp-server' });
      return;
    }

    if (req.method === 'GET' && isServerCardPath(url.pathname)) {
      sendJson(res, 200, createAgreementsMcpServerCard(discoveryUrls.publicMcpUrl), {
        'Content-Type': SERVER_CARD_MEDIA_TYPE,
        'Cache-Control': DISCOVERY_CACHE_CONTROL,
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === MCP_CATALOG_PATH) {
      sendJson(res, 200, createAgreementsMcpCatalog(discoveryUrls.serverCardUrl), {
        'Cache-Control': DISCOVERY_CACHE_CONTROL,
      });
      return;
    }

    if (req.method === 'GET' && isOauthProtectedResourcePath(url.pathname)) {
      if (!oauthEnabled) {
        sendJson(res, 404, { error: 'not_found', message: 'OAuth protected-resource metadata is not enabled.' });
        return;
      }
      sendJson(
        res,
        200,
        createProtectedResourceMetadata({
          resource: oauthResource,
          authorizationServers,
        }),
        { 'Cache-Control': DISCOVERY_CACHE_CONTROL },
      );
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

    const credentialResult = extractCredentialResult(req, { oauthEnabled });
    const credentials = credentialResult.ok ? credentialResult.credentials : undefined;

    if (oauthEnabled && credentialResult.ok && !credentials) {
      sendUnauthorizedChallenge(res, protectedResourceMetadataUrl);
      return;
    }

    const server = createAgreementsMcpServer({
      toolEnvironmentMode: 'required',
      getClient: (environment) => {
        if (!credentialResult.ok) {
          throw new Error(credentialResult.message);
        }
        if (!credentials) {
          throw new Error(`Missing Agreements API credentials. ${credentialsHint(oauthEnabled)}`);
        }
        if (environment !== 'testnet' && environment !== 'production') {
          throw new Error('Missing Agreements API environment. Set environment to "testnet" or "production" on this tool call.');
        }
        return createUpstreamClient(options, environment, credentials);
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

function createUpstreamClient(
  options: AgreementsMcpHttpOptions,
  environment: AgreementsApiEnvironment,
  credentials: McpCallerCredentials,
): ApiClient {
  const baseUrl = resolveEnvironmentBaseUrl(options, environment);
  if (credentials.kind === 'api-key') {
    return new ApiClient({ baseUrl, apiKey: credentials.apiKey });
  }
  const accessToken = credentials.accessToken;
  return new ApiClient({
    baseUrl,
    tokenProvider: async () => accessToken,
  });
}

function sendUnauthorizedChallenge(res: ServerResponse, resourceMetadataUrl: string): void {
  const scope = MCP_OAUTH_SCOPES_SUPPORTED.join(' ');
  res.writeHead(401, {
    'Content-Type': 'application/json',
    'WWW-Authenticate': `Bearer realm="mcp", resource_metadata="${resourceMetadataUrl}", scope="${scope}"`,
  });
  res.end(
    JSON.stringify({
      error: 'unauthorized',
      message: 'Authentication required. Provide an API key or complete OAuth against the authorization server.',
    }),
  );
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
