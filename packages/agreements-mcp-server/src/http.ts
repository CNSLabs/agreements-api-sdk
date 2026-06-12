import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ApiClient, type AgreementsApiEnvironment } from '@cns-labs/agreements-api-client';

import { createAgreementsMcpServer } from './server.js';

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
    'Content-Type, X-API-Key, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, MCP-Protocol-Version',
};

function applyCors(res: ServerResponse): void {
  for (const [header, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(header, value);
  }
}

export type McpCallerCredentials = { kind: 'api-key'; apiKey: string };

/**
 * Extracts the caller's Agreements API key. Hosted MCP authentication is
 * API-key-only; bearer/JWT authorization is not accepted or forwarded.
 */
export function extractCredentials(req: IncomingMessage): McpCallerCredentials | undefined {
  const headerKey = req.headers['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return { kind: 'api-key', apiKey: headerKey.trim() };
  }
  return undefined;
}

/** Backwards-compatible helper: returns the raw credential string, if any. */
export function extractApiKey(req: IncomingMessage): string | undefined {
  const credentials = extractCredentials(req);
  return credentials?.apiKey;
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

    const server = createAgreementsMcpServer({
      getClient: () => {
        if (!credentials) {
          throw new Error(
            'Missing Agreements API credentials. Send an `X-API-Key` header on requests to this MCP server.',
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
