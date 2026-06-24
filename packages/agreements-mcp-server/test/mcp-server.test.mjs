import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import test from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js';

import {
  AGREEMENTS_MCP_CATALOG,
  AGREEMENTS_MCP_SERVER_CARD,
  AGREEMENTS_MCP_TOOLS,
  AGREEMENTS_MCP_RESOURCES,
  createAgreementsMcpHttpServer,
  createAgreementsMcpCatalog,
  createAgreementsMcpServerCard,
  DISCOVERY_CACHE_CONTROL,
  LEGACY_SERVER_CARD_PATH,
  MCP_JSON_SERVER_CARD_PATH,
  MCP_CATALOG_PATH,
  PUBLIC_MCP_URL,
  SERVER_CARD_MEDIA_TYPE,
  SERVER_CARD_PATH,
  SERVER_CARD_PATHS,
  SERVER_CARD_URL,
  SERVER_VERSION,
  startAgreementsMcpHttpServer,
} from '../dist/index.js';
import { resolveRpcUrl } from '../dist/signing.js';
import { deploymentPermitNextStep, inputPermitNextStep } from '../dist/write-tools.js';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const registryServerJson = JSON.parse(readFileSync(new URL('../server.json', import.meta.url), 'utf8'));

const DEVELOPERS_DISCOVERY_HEADERS = {
  Host: 'developers.shodai.network',
  'CloudFront-Forwarded-Proto': 'https',
};
const CANONICAL_MCP_URL = 'https://shodai.network/mcp';
const CANONICAL_SERVER_CARD_URL = 'https://shodai.network/.well-known/mcp/server-card.json';
const DEVELOPERS_MCP_URL = 'https://developers.shodai.network/mcp';
const DEVELOPERS_SERVER_CARD_URL = 'https://developers.shodai.network/.well-known/mcp/server-card.json';
const TEST_API_KEY = 'cns_pk_test_key';
// Structurally valid compact JWS (header.payload.signature).
const TEST_JWT = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJjbGllbnQtYWJjIn0.c2lnbmF0dXJl';
const SYNTHETIC_UPSTREAM_FAILURES = {
  cns_pk_payment_required: {
    status: 402,
    payload: {
      error: {
        code: 'payment_required',
        message:
          'The authenticated API principal has paid_required entitlement mode for scope agreements.read. Per-call x402 settlement is not implemented. Treat this as an entitlement/operator issue.',
        requestId: 'req_test',
      },
    },
  },
  cns_pk_forbidden: {
    status: 403,
    payload: {
      error: {
        code: 'forbidden',
        message: 'Missing entitlement for scope agreements.read',
        requestId: 'req_test',
      },
    },
  },
  cns_pk_rate_limited: {
    status: 429,
    payload: {
      error: {
        code: 'rate_limited',
        message: 'Rate limit exceeded',
        requestId: 'req_test',
      },
    },
  },
};

function withEnv(overrides, callback) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function getJsonResponse(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: {
              get(name) {
                const value = res.headers[name.toLowerCase()];
                if (Array.isArray(value)) return value.join(', ');
                return value ?? null;
              },
            },
            async json() {
              return JSON.parse(body);
            },
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

test('registry server.json describes the hosted remote MCP server only', () => {
  assert.equal(
    registryServerJson.$schema,
    'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
  );
  assert.equal(registryServerJson.name, 'network.shodai/agreements');
  assert.equal(registryServerJson.title, 'Shodai Agreements');
  assert.equal(registryServerJson.version, packageJson.version);
  assert.equal(registryServerJson.version, SERVER_VERSION);
  assert.ok(registryServerJson.description.length <= 100);
  assert.deepEqual(registryServerJson.repository, {
    url: 'https://github.com/CNSLabs/agreements-api-sdk',
    source: 'github',
    subfolder: 'packages/agreements-mcp-server',
  });
  assert.equal('packages' in registryServerJson, false);

  assert.equal(registryServerJson.remotes.length, 1);
  const [remote] = registryServerJson.remotes;
  assert.equal(remote.type, 'streamable-http');
  assert.equal(remote.url, CANONICAL_MCP_URL);

  assert.equal(remote.headers.length, 1);
  const [authorizationHeader] = remote.headers;
  assert.equal(authorizationHeader.name, 'Authorization');
  assert.equal(authorizationHeader.isRequired, true);
  assert.equal(authorizationHeader.isSecret, true);
  assert.match(authorizationHeader.description, /Bearer cns_pk_/);
  assert.match(authorizationHeader.placeholder, /Bearer cns_pk_/);
});

test('server card discovery metadata stays aligned with the registry metadata', () => {
  assert.equal(AGREEMENTS_MCP_SERVER_CARD.$schema, 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json');
  assert.equal(AGREEMENTS_MCP_SERVER_CARD.name, registryServerJson.name);
  assert.equal(AGREEMENTS_MCP_SERVER_CARD.title, registryServerJson.title);
  assert.equal(AGREEMENTS_MCP_SERVER_CARD.description, registryServerJson.description);
  assert.equal(AGREEMENTS_MCP_SERVER_CARD.version, registryServerJson.version);
  assert.equal(AGREEMENTS_MCP_SERVER_CARD.version, SERVER_VERSION);
  assert.equal(AGREEMENTS_MCP_SERVER_CARD.websiteUrl, 'https://docs.shodai.network/sdks/quickstart-with-mcp');
  assert.deepEqual(AGREEMENTS_MCP_SERVER_CARD.repository, registryServerJson.repository);

  assert.equal(AGREEMENTS_MCP_SERVER_CARD.remotes.length, 1);
  const [serverCardRemote] = AGREEMENTS_MCP_SERVER_CARD.remotes;
  const [registryRemote] = registryServerJson.remotes;
  assert.equal(serverCardRemote.type, registryRemote.type);
  assert.equal(serverCardRemote.url, registryRemote.url);
  assert.equal(serverCardRemote.url, PUBLIC_MCP_URL);
  assert.deepEqual(serverCardRemote.supportedProtocolVersions, SUPPORTED_PROTOCOL_VERSIONS);

  assert.equal(serverCardRemote.headers.length, 1);
  const [serverCardAuthorizationHeader] = serverCardRemote.headers;
  const [registryAuthorizationHeader] = registryRemote.headers;
  assert.equal(serverCardAuthorizationHeader.name, registryAuthorizationHeader.name);
  assert.equal(serverCardAuthorizationHeader.isRequired, registryAuthorizationHeader.isRequired);
  assert.equal(serverCardAuthorizationHeader.isSecret, registryAuthorizationHeader.isSecret);
  assert.equal(serverCardAuthorizationHeader.value, 'Bearer {token}');
  assert.match(serverCardAuthorizationHeader.variables.token.description, /cns_pk_/);
  assert.equal(serverCardAuthorizationHeader.variables.token.isRequired, true);
  assert.equal(serverCardAuthorizationHeader.variables.token.isSecret, true);
});

test('catalog discovery metadata points to the hosted server card', () => {
  assert.deepEqual(AGREEMENTS_MCP_CATALOG, {
    specVersion: 'draft',
    entries: [
      {
        identifier: 'urn:mcp:server:network.shodai/agreements',
        displayName: 'Shodai Agreements',
        mediaType: SERVER_CARD_MEDIA_TYPE,
        url: CANONICAL_SERVER_CARD_URL,
      },
    ],
  });
  assert.equal(PUBLIC_MCP_URL, CANONICAL_MCP_URL);
  assert.equal(SERVER_CARD_URL, CANONICAL_SERVER_CARD_URL);
});

test('server card discovery paths cover current conventions and legacy route', () => {
  assert.equal(SERVER_CARD_PATH, '/.well-known/mcp/server-card.json');
  assert.equal(MCP_JSON_SERVER_CARD_PATH, '/.well-known/mcp.json');
  assert.equal(LEGACY_SERVER_CARD_PATH, '/mcp/server-card');
  assert.deepEqual(SERVER_CARD_PATHS, [
    '/.well-known/mcp/server-card.json',
    '/.well-known/mcp.json',
    '/mcp/server-card',
  ]);
});

/** Minimal stub of the Agreements API gateway. Records requests for assertions. */
function startStubGateway() {
  const requests = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const parsedBody = body ? JSON.parse(body) : undefined;
      requests.push({
        method: req.method,
        url: req.url,
        apiKey: req.headers['x-api-key'],
        authorization: req.headers.authorization,
        body: parsedBody,
      });

      const respond = (status, payload) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      };

      const syntheticFailure = SYNTHETIC_UPSTREAM_FAILURES[req.headers['x-api-key']];
      if (syntheticFailure) {
        respond(syntheticFailure.status, syntheticFailure.payload);
        return;
      }

      const hasValidApiKey = req.headers['x-api-key'] === TEST_API_KEY;
      if (!hasValidApiKey) {
        respond(401, {
          error: { code: 'unauthorized', message: 'Invalid API key', requestId: 'req_test' },
        });
        return;
      }

      const meta = { apiVersion: '0.4.0', requestId: 'req_test' };
      const url = new URL(req.url, 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/v0/agreements') {
        respond(200, {
          data: [
            {
              id: 'agr_1',
              chainId: 59141,
              status: 'Deployed',
              state: 'PENDING_PARTY_A_SIGNATURE',
              displayName: 'Stub agreement',
              createdAt: '2026-06-01T00:00:00.000Z',
              updatedAt: '2026-06-01T00:00:00.000Z',
            },
          ],
          pageInfo: { limit: 25, nextCursor: null },
          meta,
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/v0/agreements/agr_1/state') {
        respond(200, { data: { status: 'Deployed', state: 'PENDING_PARTY_A_SIGNATURE' }, meta });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/v0/agreements/documents/document-123') {
        respond(200, {
          data: {
            documentId: 'document-123',
            docUri: `${gatewayBaseUrl(req)}/v0/agreements/documents/document-123`,
            agreementId: 'agr_1',
            agreementAddress: '0x3333333333333333333333333333333333333333',
            chainId: 59141,
            displayName: 'Stub agreement',
            contentType: 'text/markdown',
            content: '# Stub agreement\n\nRendered prose.',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
          meta,
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v0/agreements/deploy-with-permit') {
        respond(201, {
          data: {
            id: 'agr_new',
            address: '0x3333333333333333333333333333333333333333',
            chainId: 59141,
            status: 'Deployed',
            displayName: 'Deployed via MCP',
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
          meta,
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v0/agreements/agr_1/input') {
        respond(201, {
          data: {
            agreementId: 'agr_1',
            agreementAddress: '0x3333333333333333333333333333333333333333',
            chainId: 59141,
            inputId: 'partyAData',
            payload: '0x',
            values: {},
            txHash: '0xabc',
            status: 'PENDING',
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
          meta,
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v0/agreements/validate') {
        const participants = parsedBody.participants ?? [];
        respond(201, {
          data: {
            templateId: 'did:template:mou-v1',
            participantVariableKeys: ['partyAEthAddress', 'partyBEthAddress'],
            participants,
            observers: parsedBody.observers ?? [],
            variables: {
              ...(parsedBody.initValues ?? {}),
              ...Object.fromEntries(
                participants.map((participant) => [
                  participant.variableKey,
                  participant.walletAddress.toLowerCase(),
                ]),
              ),
            },
            contributors: [],
            warnings: ['stub preflight warning'],
          },
          meta,
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v0/agreements/validate-template') {
        respond(201, {
          data: {
            templateId: 'did:template:mou-v1',
            participantVariableKeys: ['partyAEthAddress', 'partyBEthAddress'],
            inputIds: ['partyAData', 'partyBData', 'accepted', 'rejected'],
            stateIds: ['PENDING_PARTY_A_SIGNATURE', 'ACCEPTED'],
            warnings: [],
          },
          meta,
        });
        return;
      }

      respond(404, { error: { code: 'not_found', message: `No stub for ${req.method} ${url.pathname}`, requestId: 'req_test' } });
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, requests, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function gatewayBaseUrl(req) {
  return `http://${req.headers.host}`;
}

async function startServers({ mcpPath = '/mcp', dualGateways = false, publicMcpUrl } = {}) {
  const testnetGateway = await startStubGateway();
  const productionGateway = dualGateways ? await startStubGateway() : testnetGateway;
  const mcpServer = await startAgreementsMcpHttpServer({
    port: 0,
    host: '127.0.0.1',
    baseUrls: {
      testnet: testnetGateway.baseUrl,
      production: productionGateway.baseUrl,
    },
    mcpPath,
    publicMcpUrl,
  });
  const mcpUrl = new URL(`http://127.0.0.1:${mcpServer.address().port}${mcpPath}`);
  return {
    gateway: testnetGateway,
    testnetGateway,
    productionGateway,
    mcpServer,
    mcpUrl,
    async close() {
      mcpServer.close();
      testnetGateway.server.close();
      if (productionGateway !== testnetGateway) {
        productionGateway.server.close();
      }
    },
  };
}

async function connectClient(mcpUrl, { apiKey, headers } = {}) {
  const transport = new StreamableHTTPClientTransport(mcpUrl, {
    requestInit:
      apiKey || headers
        ? { headers: { ...(apiKey ? { 'X-API-Key': apiKey } : {}), ...headers } }
        : undefined,
  });
  const client = new Client({ name: 'agreements-mcp-test-client', version: '0.0.1' });
  await client.connect(transport);
  return client;
}

test('serves MCP server card discovery endpoints from request origin without auth', async () => {
  const env = await startServers();
  try {
    for (const path of SERVER_CARD_PATHS) {
      const response = await getJsonResponse(new URL(path, env.mcpUrl), DEVELOPERS_DISCOVERY_HEADERS);
      assert.equal(response.status, 200);
      assert.ok(response.headers.get('content-type')?.startsWith(SERVER_CARD_MEDIA_TYPE));
      assert.equal(response.headers.get('cache-control'), DISCOVERY_CACHE_CONTROL);
      assert.equal(response.headers.get('access-control-allow-origin'), '*');
      assert.deepEqual(await response.json(), createAgreementsMcpServerCard(DEVELOPERS_MCP_URL));
    }
    assert.equal(env.gateway.requests.length, 0);
  } finally {
    await env.close();
  }
});

test('serves the MCP catalog discovery endpoint from request origin without auth', async () => {
  const env = await startServers();
  try {
    const response = await getJsonResponse(new URL(MCP_CATALOG_PATH, env.mcpUrl), DEVELOPERS_DISCOVERY_HEADERS);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^application\/json/);
    assert.equal(response.headers.get('cache-control'), DISCOVERY_CACHE_CONTROL);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    const catalog = await response.json();
    assert.deepEqual(catalog, createAgreementsMcpCatalog(DEVELOPERS_SERVER_CARD_URL));
    assert.equal(catalog.entries[0].url, DEVELOPERS_SERVER_CARD_URL);
    assert.equal(env.gateway.requests.length, 0);
  } finally {
    await env.close();
  }
});

test('serves configured public MCP URL in discovery metadata without auth', async () => {
  const env = await startServers({ publicMcpUrl: 'https://shodai.network/mcp/' });
  try {
    const serverCard = await getJsonResponse(new URL(SERVER_CARD_PATH, env.mcpUrl), DEVELOPERS_DISCOVERY_HEADERS);
    assert.equal(serverCard.status, 200);
    assert.deepEqual(await serverCard.json(), createAgreementsMcpServerCard(CANONICAL_MCP_URL));

    const catalogResponse = await getJsonResponse(new URL(MCP_CATALOG_PATH, env.mcpUrl), DEVELOPERS_DISCOVERY_HEADERS);
    assert.equal(catalogResponse.status, 200);
    const catalog = await catalogResponse.json();
    assert.deepEqual(catalog, createAgreementsMcpCatalog(CANONICAL_SERVER_CARD_URL));
    assert.equal(catalog.entries[0].url, CANONICAL_SERVER_CARD_URL);
  } finally {
    await env.close();
  }
});

test('rejects invalid public MCP URL configuration', () => {
  for (const publicMcpUrl of [
    'ftp://shodai.network/mcp',
    'https://user:password@shodai.network/mcp',
    'https://shodai.network/mcp?debug=1',
    'https://shodai.network/mcp#card',
    'https://shodai.network/other',
  ]) {
    assert.throws(
      () => createAgreementsMcpHttpServer({ publicMcpUrl, mcpPath: '/mcp' }),
      /PUBLIC_MCP_URL/,
    );
  }
});

test('lists the manifest tool surface plus permit-preparation tools', async () => {
  const env = await startServers();
  try {
    const client = await connectClient(env.mcpUrl, { apiKey: TEST_API_KEY });
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    const expected = [
      ...AGREEMENTS_MCP_TOOLS.map((tool) => tool.name),
      'prepare_deployment_typed_data',
      'prepare_input_typed_data',
    ].sort();
    assert.deepEqual(names, expected);

    const listAgreements = tools.find((tool) => tool.name === 'list_agreements');
    assert.equal(listAgreements.annotations.readOnlyHint, true);
    assert.equal(listAgreements.annotations.destructiveHint, false);
    assert.deepEqual(listAgreements.inputSchema.properties.environment.enum, ['testnet', 'production']);
    assert.equal(listAgreements.inputSchema.required.includes('environment'), true);

    const deployAgreement = tools.find((tool) => tool.name === 'deploy_agreement');
    assert.equal(deployAgreement.annotations.readOnlyHint, false);
    assert.equal(deployAgreement.annotations.destructiveHint, true);
    assert.deepEqual(deployAgreement.inputSchema.properties.environment.enum, ['testnet', 'production']);
    assert.equal(deployAgreement.inputSchema.required.includes('environment'), true);

    const prepareDeployment = tools.find((tool) => tool.name === 'prepare_deployment_typed_data');
    assert.deepEqual(prepareDeployment.inputSchema.properties.environment.enum, ['testnet', 'production']);
    assert.equal(prepareDeployment.inputSchema.required.includes('environment'), true);
    assert.ok(prepareDeployment.inputSchema.properties.participants);
    assert.ok(prepareDeployment.inputSchema.properties.observers);
    assert.ok(prepareDeployment.inputSchema.properties.documentId);
    assert.ok(deployAgreement.inputSchema.properties.documentId);
    await client.close();
  } finally {
    await env.close();
  }
});

test('resolves prepare-tool RPC URLs from explicit overrides or INFURA_PROJECT_ID', () => {
  withEnv(
    {
      AGREEMENTS_RPC_URL_59141: undefined,
      AGREEMENTS_RPC_URL: undefined,
      INFURA_PROJECT_ID: 'infura-test',
    },
    () => {
      assert.equal(
        resolveRpcUrl(59141),
        'https://linea-sepolia.infura.io/v3/infura-test',
      );
      assert.equal(
        resolveRpcUrl(84532),
        'https://base-sepolia.infura.io/v3/infura-test',
      );
    },
  );

  withEnv(
    {
      AGREEMENTS_RPC_URL_59141: 'https://chain-specific.example',
      AGREEMENTS_RPC_URL: 'https://generic.example',
      INFURA_PROJECT_ID: 'infura-test',
    },
    () => {
      assert.equal(resolveRpcUrl(59141), 'https://chain-specific.example');
    },
  );
});

test('prepare typed-data next-step guidance preserves the selected environment', () => {
  assert.match(deploymentPermitNextStep('testnet'), /environment: "testnet"/);
  assert.match(deploymentPermitNextStep('testnet'), /deploy_agreement/);
  assert.match(deploymentPermitNextStep('testnet'), /documentId/);
  assert.match(inputPermitNextStep('production'), /environment: "production"/);
  assert.match(inputPermitNextStep('production'), /submit_input/);
});

test('deploy_agreement forwards a pre-signed permit to the gateway', async () => {
  const env = await startServers();
  try {
    const client = await connectClient(env.mcpUrl, { apiKey: TEST_API_KEY });
    const result = await client.callTool({
      name: 'deploy_agreement',
      arguments: {
        environment: 'testnet',
        agreement: { metadata: { templateId: 'did:template:mou-v1' } },
        displayName: 'Deployed via MCP',
        chainId: 59141,
        documentId: 'document-123',
        signer: '0x1111111111111111111111111111111111111111',
        deadline: 1900000000,
        signatureV: 27,
        signatureR: `0x${'aa'.repeat(32)}`,
        signatureS: `0x${'bb'.repeat(32)}`,
      },
    });

    assert.notEqual(result.isError, true, result.content?.[0]?.text);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.id, 'agr_new');

    const gatewayRequest = env.gateway.requests.find(
      (request) => request.url === '/v0/agreements/deploy-with-permit',
    );
    assert.equal(gatewayRequest.apiKey, TEST_API_KEY);
    assert.equal(gatewayRequest.body.signer, '0x1111111111111111111111111111111111111111');
    assert.equal(gatewayRequest.body.documentId, 'document-123');
    assert.equal(
      gatewayRequest.body.docUri,
      `${env.gateway.baseUrl}/v0/agreements/documents/document-123`,
    );
    assert.deepEqual(gatewayRequest.body.signature, {
      v: 27,
      r: `0x${'aa'.repeat(32)}`,
      s: `0x${'bb'.repeat(32)}`,
    });
    await client.close();
  } finally {
    await env.close();
  }
});

test('get_agreement_document fetches rendered hosted prose through the gateway', async () => {
  const env = await startServers();
  try {
    const client = await connectClient(env.mcpUrl, { apiKey: TEST_API_KEY });
    const result = await client.callTool({
      name: 'get_agreement_document',
      arguments: { environment: 'testnet', documentId: 'document-123' },
    });

    assert.notEqual(result.isError, true, result.content?.[0]?.text);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.documentId, 'document-123');
    assert.equal(payload.content, '# Stub agreement\n\nRendered prose.');

    const gatewayRequest = env.gateway.requests.find(
      (request) => request.url === '/v0/agreements/documents/document-123',
    );
    assert.equal(gatewayRequest.apiKey, TEST_API_KEY);
    await client.close();
  } finally {
    await env.close();
  }
});

test('deploy_agreement preflights participant mappings before forwarding a permit', async () => {
  const env = await startServers();
  try {
    const client = await connectClient(env.mcpUrl, { apiKey: TEST_API_KEY });
    const participants = [
      {
        variableKey: 'partyAEthAddress',
        walletAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
    ];

    const result = await client.callTool({
      name: 'deploy_agreement',
      arguments: {
        environment: 'testnet',
        agreement: { metadata: { templateId: 'did:template:mou-v1' } },
        displayName: 'Deployed via MCP',
        chainId: 59141,
        initValues: { amount: 100 },
        participants,
        observers: ['observer@example.com'],
        signer: '0x1111111111111111111111111111111111111111',
        deadline: 1900000000,
        signatureV: 27,
        signatureR: `0x${'aa'.repeat(32)}`,
        signatureS: `0x${'bb'.repeat(32)}`,
      },
    });

    assert.notEqual(result.isError, true, result.content?.[0]?.text);

    const preflightRequest = env.gateway.requests.find(
      (request) => request.url === '/v0/agreements/validate',
    );
    assert.ok(preflightRequest, 'expected a deployment preflight request');
    assert.deepEqual(
      preflightRequest.body.participants,
      participants,
      JSON.stringify(env.gateway.requests, null, 2),
    );

    const deployRequest = env.gateway.requests.find(
      (request) => request.url === '/v0/agreements/deploy-with-permit',
    );
    assert.equal(
      deployRequest.body.initValues.partyAEthAddress,
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      JSON.stringify(env.gateway.requests, null, 2),
    );
    assert.equal(deployRequest.body.initValues.amount, 100);
    assert.deepEqual(deployRequest.body.participants, participants);
    assert.deepEqual(deployRequest.body.observers, ['observer@example.com']);
    await client.close();
  } finally {
    await env.close();
  }
});

test('submit_input forwards a pre-signed permit to the gateway', async () => {
  const env = await startServers();
  try {
    const client = await connectClient(env.mcpUrl, { apiKey: TEST_API_KEY });
    const result = await client.callTool({
      name: 'submit_input',
      arguments: {
        environment: 'testnet',
        agreementId: 'agr_1',
        inputId: 'partyAData',
        values: { partyAName: 'Acme' },
        signer: '0x1111111111111111111111111111111111111111',
        deadline: 1900000000,
        signatureV: 28,
        signatureR: `0x${'cc'.repeat(32)}`,
        signatureS: `0x${'dd'.repeat(32)}`,
      },
    });

    assert.notEqual(result.isError, true, result.content?.[0]?.text);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.status, 'PENDING');

    const gatewayRequest = env.gateway.requests.find(
      (request) => request.url === '/v0/agreements/agr_1/input',
    );
    assert.equal(gatewayRequest.body.inputId, 'partyAData');
    assert.equal(gatewayRequest.body.signature.v, 28);
    await client.close();
  } finally {
    await env.close();
  }
});

test('write tools without a permit return signing guidance (hosted mode has no env signer)', async () => {
  const env = await startServers();
  try {
    const client = await connectClient(env.mcpUrl, { apiKey: TEST_API_KEY });
    const result = await client.callTool({
      name: 'deploy_agreement',
      arguments: {
        environment: 'testnet',
        agreement: { metadata: {} },
        displayName: 'No permit',
      },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /prepare_deployment_typed_data/);
    assert.match(result.content[0].text, /https:\/\/developers\.shodai\.network\/api-playground/);
    await client.close();
  } finally {
    await env.close();
  }
});

test('calls list_agreements through the gateway with the caller API key', async () => {
  const env = await startServers();
  try {
    const client = await connectClient(env.mcpUrl, { apiKey: TEST_API_KEY });
    const result = await client.callTool({
      name: 'list_agreements',
      arguments: { environment: 'testnet', limit: 25, sortBy: 'updatedAt', sortDirection: 'desc' },
    });

    assert.notEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.data[0].id, 'agr_1');

    const gatewayRequest = env.gateway.requests.find((request) => request.url.startsWith('/v0/agreements'));
    assert.equal(gatewayRequest.apiKey, TEST_API_KEY);
    assert.match(gatewayRequest.url, /limit=25/);
    assert.match(gatewayRequest.url, /sort%5BupdatedAt%5D=desc/);
    await client.close();
  } finally {
    await env.close();
  }
});

test('requires hosted tool calls to select an API environment', async () => {
  const env = await startServers();
  try {
    const client = await connectClient(env.mcpUrl, { apiKey: TEST_API_KEY });
    const result = await client.callTool({
      name: 'list_agreements',
      arguments: { limit: 25 },
    });

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /environment/);
    assert.equal(env.gateway.requests.length, 0);
    await client.close();
  } finally {
    await env.close();
  }
});

test('routes hosted tool calls to the selected API environment base URL', async () => {
  const env = await startServers({ dualGateways: true });
  try {
    const client = await connectClient(env.mcpUrl, { apiKey: TEST_API_KEY });
    const result = await client.callTool({
      name: 'list_agreements',
      arguments: { environment: 'production' },
    });

    assert.notEqual(result.isError, true, result.content?.[0]?.text);
    assert.equal(env.testnetGateway.requests.length, 0);
    assert.equal(env.productionGateway.requests.length, 1);
    assert.equal(env.productionGateway.requests[0].apiKey, TEST_API_KEY);
    assert.equal(env.productionGateway.requests[0].url, '/v0/agreements');
    await client.close();
  } finally {
    await env.close();
  }
});

test('accepts bearer API-key alias and forwards only X-API-Key upstream', async () => {
  const env = await startServers();
  try {
    const client = await connectClient(env.mcpUrl, {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    });
    const result = await client.callTool({ name: 'list_agreements', arguments: { environment: 'testnet' } });

    assert.notEqual(result.isError, true, result.content?.[0]?.text);
    const gatewayRequest = env.gateway.requests.find((request) => request.url.startsWith('/v0/agreements'));
    assert.equal(gatewayRequest.apiKey, TEST_API_KEY);
    assert.equal(gatewayRequest.authorization, undefined);
    await client.close();
  } finally {
    await env.close();
  }
});

test('accepts matching X-API-Key and bearer API-key credentials', async () => {
  const env = await startServers();
  try {
    const client = await connectClient(env.mcpUrl, {
      apiKey: TEST_API_KEY,
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    });
    const result = await client.callTool({ name: 'list_agreements', arguments: { environment: 'testnet' } });

    assert.notEqual(result.isError, true, result.content?.[0]?.text);
    const gatewayRequest = env.gateway.requests.find((request) => request.url.startsWith('/v0/agreements'));
    assert.equal(gatewayRequest.apiKey, TEST_API_KEY);
    assert.equal(gatewayRequest.authorization, undefined);
    await client.close();
  } finally {
    await env.close();
  }
});

test('calls validate_agreement and returns validation payload', async () => {
  const env = await startServers();
  try {
    const client = await connectClient(env.mcpUrl, { apiKey: TEST_API_KEY });
    const result = await client.callTool({
      name: 'validate_agreement',
      arguments: { environment: 'testnet', agreement: { metadata: { templateId: 'did:template:mou-v1' } } },
    });

    assert.notEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.deepEqual(payload.inputIds, ['partyAData', 'partyBData', 'accepted', 'rejected']);
    await client.close();
  } finally {
    await env.close();
  }
});

test('returns a guidance error when the API key is missing', async () => {
  const env = await startServers();
  try {
    const client = await connectClient(env.mcpUrl);
    const result = await client.callTool({ name: 'get_agreement_state', arguments: { environment: 'testnet', agreementId: 'agr_1' } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /X-API-Key/);
    assert.match(result.content[0].text, /Authorization: Bearer cns_pk_/);
    assert.equal(env.gateway.requests.length, 0);
    await client.close();
  } finally {
    await env.close();
  }
});

test('surfaces upstream 401, 402, 403, and 429 failures with actionable hints', async () => {
  const env = await startServers();
  try {
    const cases = [
      {
        apiKey: 'wrong-key',
        status: 401,
        upstreamMessage: /Invalid API key/,
        hint: /different environment than the selected tool environment/,
      },
      {
        apiKey: 'cns_pk_payment_required',
        status: 402,
        upstreamMessage: /paid_required entitlement mode for scope agreements\.read/,
        hint: /Per-call x402 settlement is not implemented/,
      },
      {
        apiKey: 'cns_pk_forbidden',
        status: 403,
        upstreamMessage: /Missing entitlement for scope agreements\.read/,
        hint: /agreements\.read/,
      },
      {
        apiKey: 'cns_pk_rate_limited',
        status: 429,
        upstreamMessage: /Rate limit exceeded/,
        hint: /Back off and retry/,
      },
    ];

    for (const expectation of cases) {
      const client = await connectClient(env.mcpUrl, { apiKey: expectation.apiKey });
      const result = await client.callTool({ name: 'list_agreements', arguments: { environment: 'testnet' } });
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, new RegExp(`HTTP ${expectation.status}`));
      assert.match(result.content[0].text, expectation.upstreamMessage);
      assert.match(result.content[0].text, expectation.hint);
      await client.close();
    }
  } finally {
    await env.close();
  }
});

test('exposes example and docs resources with real content', async () => {
  const env = await startServers();
  try {
    const client = await connectClient(env.mcpUrl, { apiKey: TEST_API_KEY });
    const { resources } = await client.listResources();
    const uris = resources.map((resource) => resource.uri).sort();
    assert.deepEqual(uris, AGREEMENTS_MCP_RESOURCES.map((resource) => resource.uri).sort());

    const simple = await client.readResource({ uri: 'agreements://examples/simple-agreement.json' });
    const agreement = JSON.parse(simple.contents[0].text);
    assert.equal(agreement.metadata.templateId, 'did:template:mou-v1');
    assert.ok(agreement.execution.states.PENDING_PARTY_A_SIGNATURE);
    await client.close();
  } finally {
    await env.close();
  }
});

test('serves the author_agreement prompt with injected business context', async () => {
  const env = await startServers();
  try {
    const client = await connectClient(env.mcpUrl, { apiKey: TEST_API_KEY });
    const prompt = await client.getPrompt({
      name: 'author_agreement',
      arguments: { businessDescription: 'Monthly retainer between a design studio and a client.' },
    });
    const text = prompt.messages[0].content.text;
    assert.match(text, /validate_agreement/);
    assert.match(text, /Monthly retainer between a design studio/);
    await client.close();
  } finally {
    await env.close();
  }
});

test('healthz responds without auth and non-POST MCP requests are rejected', async () => {
  const env = await startServers();
  try {
    const health = await fetch(new URL('/healthz', env.mcpUrl));
    assert.equal(health.status, 200);

    const options = await fetch(env.mcpUrl, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.com',
        'Access-Control-Request-Headers': 'Authorization, X-API-Key',
      },
    });
    assert.equal(options.status, 204);
    assert.match(options.headers.get('access-control-allow-headers') ?? '', /Authorization/);

    const get = await fetch(env.mcpUrl, { method: 'GET' });
    assert.equal(get.status, 405);
  } finally {
    await env.close();
  }
});

test('does not serve OAuth protected-resource metadata', async () => {
  const env = await startServers();
  try {
    for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
      const response = await fetch(new URL(path, env.mcpUrl));
      assert.equal(response.status, 404);
    }
  } finally {
    await env.close();
  }
});

test('does not challenge unauthenticated MCP requests with OAuth metadata', async () => {
  const env = await startServers();
  try {
    const response = await fetch(env.mcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', params: {}, id: 1 }),
    });
    assert.notEqual(response.status, 401);
    assert.equal(response.headers.get('www-authenticate'), null);
  } finally {
    await env.close();
  }
});

test('does not accept or forward JWT-shaped bearer values', async () => {
  const env = await startServers();
  try {
    const client = await connectClient(env.mcpUrl, {
      headers: { Authorization: `Bearer ${TEST_JWT}` },
    });

    const result = await client.callTool({ name: 'list_agreements', arguments: { environment: 'testnet' } });
    assert.equal(result.isError ?? false, true);
    assert.match(result.content[0].text, /JWT bearer tokens are not supported/);
    assert.match(result.content[0].text, /X-API-Key/);
    assert.match(result.content[0].text, /Authorization: Bearer cns_pk_/);

    const gatewayRequest = env.gateway.requests.find((request) => request.url.startsWith('/v0/agreements'));
    assert.equal(gatewayRequest, undefined);

    await client.close();
  } finally {
    await env.close();
  }
});

test('does not accept or forward opaque bearer values', async () => {
  const env = await startServers();
  try {
    const client = await connectClient(env.mcpUrl, {
      headers: { Authorization: 'Bearer opaque-token' },
    });

    const result = await client.callTool({ name: 'list_agreements', arguments: { environment: 'testnet' } });
    assert.equal(result.isError ?? false, true);
    assert.match(result.content[0].text, /Bearer values that are not Agreements API keys are not supported/);
    assert.match(result.content[0].text, /X-API-Key/);
    assert.match(result.content[0].text, /Authorization: Bearer cns_pk_/);

    const gatewayRequest = env.gateway.requests.find((request) => request.url.startsWith('/v0/agreements'));
    assert.equal(gatewayRequest, undefined);

    await client.close();
  } finally {
    await env.close();
  }
});

test('rejects conflicting X-API-Key and bearer API-key credentials', async () => {
  const env = await startServers();
  try {
    const client = await connectClient(env.mcpUrl, {
      apiKey: TEST_API_KEY,
      headers: { Authorization: 'Bearer cns_pk_other_key' },
    });

    const result = await client.callTool({ name: 'list_agreements', arguments: { environment: 'testnet' } });
    assert.equal(result.isError ?? false, true);
    assert.match(result.content[0].text, /Conflicting Agreements API credentials/);
    assert.match(result.content[0].text, /X-API-Key/);
    assert.match(result.content[0].text, /Authorization: Bearer cns_pk_/);

    const gatewayRequest = env.gateway.requests.find((request) => request.url.startsWith('/v0/agreements'));
    assert.equal(gatewayRequest, undefined);

    await client.close();
  } finally {
    await env.close();
  }
});
