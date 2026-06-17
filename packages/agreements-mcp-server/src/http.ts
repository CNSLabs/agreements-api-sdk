import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ApiClient, type AgreementsApiEnvironment } from '@cns-labs/agreements-api-client';

import { createAgreementsMcpServer } from './server.js';
import {
  createAgreementsMcpCatalog,
  createAgreementsMcpServerCard,
  DISCOVERY_CACHE_CONTROL,
  MCP_CATALOG_PATH,
  PUBLIC_MCP_URL,
  SERVER_CARD_MEDIA_TYPE,
  SERVER_CARD_PATH,
} from './discovery.js';

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

export type McpCallerCredentials = { kind: 'api-key'; apiKey: string };

const API_KEY_PREFIX = 'cns_pk_';
const SUPPORTED_CREDENTIALS_HINT =
  'Send `X-API-Key: cns_pk_...` (canonical) or `Authorization: Bearer cns_pk_...` for clients that only support bearer-style headers.';

type CredentialExtractionResult =
  | { ok: true; credentials?: McpCallerCredentials }
  | { ok: false; message: string };

/**
 * Extracts the caller's Agreements API key. Hosted MCP authentication remains
 * API-key-only; bearer auth is accepted only as an API-key compatibility alias.
 */
export function extractCredentials(req: IncomingMessage): McpCallerCredentials | undefined {
  const result = extractCredentialResult(req);
  return result.ok ? result.credentials : undefined;
}

/** Backwards-compatible helper: returns the raw credential string, if any. */
export function extractApiKey(req: IncomingMessage): string | undefined {
  const credentials = extractCredentials(req);
  return credentials?.apiKey;
}

function extractCredentialResult(req: IncomingMessage): CredentialExtractionResult {
  const headerApiKey = readHeaderValue(req.headers['x-api-key']);
  const authorization = readHeaderValue(req.headers.authorization);
  const bearerApiKey = authorization ? extractBearerApiKey(authorization) : undefined;

  if (bearerApiKey && !bearerApiKey.ok) {
    return bearerApiKey;
  }

  if (headerApiKey && bearerApiKey?.apiKey && headerApiKey !== bearerApiKey.apiKey) {
    return {
      ok: false,
      message: `Conflicting Agreements API credentials were provided. ${SUPPORTED_CREDENTIALS_HINT}`,
    };
  }

  const apiKey = headerApiKey || bearerApiKey?.apiKey;
  return apiKey ? { ok: true, credentials: { kind: 'api-key', apiKey } } : { ok: true };
}

function extractBearerApiKey(authorization: string): { ok: true; apiKey?: string } | { ok: false; message: string } {
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) {
    return {
      ok: false,
      message: `Unsupported Authorization header for Agreements API credentials. ${SUPPORTED_CREDENTIALS_HINT}`,
    };
  }

  const token = match[1]?.trim() ?? '';
  if (!token) {
    return { ok: false, message: `Missing bearer API key. ${SUPPORTED_CREDENTIALS_HINT}` };
  }

  if (!token.startsWith(API_KEY_PREFIX)) {
    const bearerType = isJwtShaped(token) ? 'JWT bearer tokens' : 'Bearer values that are not Agreements API keys';
    return {
      ok: false,
      message: `${bearerType} are not supported by hosted MCP. ${SUPPORTED_CREDENTIALS_HINT}`,
    };
  }

  return { ok: true, apiKey: token };
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

function isJwtShaped(token: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

function normalizeHttpPath(path: string): string {
  const trimmed = path.trim();
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '') || '/';
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

/**
 * Stateless Streamable HTTP server: each POST gets a fresh MCP server bound to
 * an Agreements API client constructed from the caller's credentials. No
 * credential is ever stored server-side; auth, entitlements, metering, and 402
 * outcomes are enforced by the upstream gateway on every tool call.
 */
export function createAgreementsMcpHttpServer(options: AgreementsMcpHttpOptions = {}): Server {
  const mcpPath = normalizeHttpPath(options.mcpPath ?? '/mcp');

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

    if (req.method === 'GET' && url.pathname === SERVER_CARD_PATH) {
      const { publicMcpUrl } = publicDiscoveryUrls(req, mcpPath);
      sendJson(res, 200, createAgreementsMcpServerCard(publicMcpUrl), {
        'Content-Type': SERVER_CARD_MEDIA_TYPE,
        'Cache-Control': DISCOVERY_CACHE_CONTROL,
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === MCP_CATALOG_PATH) {
      const { serverCardUrl } = publicDiscoveryUrls(req, mcpPath);
      sendJson(res, 200, createAgreementsMcpCatalog(serverCardUrl), {
        'Cache-Control': DISCOVERY_CACHE_CONTROL,
      });
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

    const credentialResult = extractCredentialResult(req);
    const credentials = credentialResult.ok ? credentialResult.credentials : undefined;

    const server = createAgreementsMcpServer({
      getClient: () => {
        if (!credentialResult.ok) {
          throw new Error(credentialResult.message);
        }
        if (!credentials) {
          throw new Error(
            `Missing Agreements API credentials. ${SUPPORTED_CREDENTIALS_HINT}`,
          );
        }
        const base = options.baseUrl
          ? { baseUrl: options.baseUrl }
          : { environment: options.environment ?? ('testnet' as const) };
        return new ApiClient({ ...base, apiKey: credentials.apiKey });
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
