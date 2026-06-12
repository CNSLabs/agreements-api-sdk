import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import {
  AGREEMENTS_MCP_TOOLS,
  AGREEMENTS_MCP_RESOURCES,
  createAgreementsMcpHttpServer,
  startAgreementsMcpHttpServer,
} from '../dist/index.js';

const TEST_API_KEY = 'cns_pk_test_key';
// Structurally valid compact JWS (header.payload.signature) accepted by the stub gateway.
const TEST_JWT = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJjbGllbnQtYWJjIn0.c2lnbmF0dXJl';

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

      const hasValidApiKey = req.headers['x-api-key'] === TEST_API_KEY;
      const hasValidBearer = req.headers.authorization === `Bearer ${TEST_JWT}`;
      if (!hasValidApiKey && !hasValidBearer) {
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

async function startServers({ oauth, mcpPath = '/mcp' } = {}) {
  const gateway = await startStubGateway();
  const mcpServer = await startAgreementsMcpHttpServer({
    port: 0,
    host: '127.0.0.1',
    baseUrl: gateway.baseUrl,
    mcpPath,
    oauth,
  });
  const mcpUrl = new URL(`http://127.0.0.1:${mcpServer.address().port}${mcpPath}`);
  return {
    gateway,
    mcpServer,
    mcpUrl,
    async close() {
      mcpServer.close();
      gateway.server.close();
    },
  };
}

async function connectClient(mcpUrl, { apiKey } = {}) {
  const transport = new StreamableHTTPClientTransport(mcpUrl, {
    requestInit: apiKey ? { headers: { 'X-API-Key': apiKey } } : undefined,
  });
  const client = new Client({ name: 'agreements-mcp-test-client', version: '0.0.1' });
  await client.connect(transport);
  return client;
}

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

    const deployAgreement = tools.find((tool) => tool.name === 'deploy_agreement');
    assert.equal(deployAgreement.annotations.readOnlyHint, false);
    assert.equal(deployAgreement.annotations.destructiveHint, true);

    const prepareDeployment = tools.find((tool) => tool.name === 'prepare_deployment_typed_data');
    assert.ok(prepareDeployment.inputSchema.properties.participants);
    assert.ok(prepareDeployment.inputSchema.properties.observers);
    await client.close();
  } finally {
    await env.close();
  }
});

test('deploy_agreement forwards a pre-signed permit to the gateway', async () => {
  const env = await startServers();
  try {
    const client = await connectClient(env.mcpUrl, { apiKey: TEST_API_KEY });
    const result = await client.callTool({
      name: 'deploy_agreement',
      arguments: {
        agreement: { metadata: { templateId: 'did:template:mou-v1' } },
        displayName: 'Deployed via MCP',
        chainId: 59141,
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
      arguments: { limit: 25, sortBy: 'updatedAt', sortDirection: 'desc' },
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

test('calls validate_agreement and returns validation payload', async () => {
  const env = await startServers();
  try {
    const client = await connectClient(env.mcpUrl, { apiKey: TEST_API_KEY });
    const result = await client.callTool({
      name: 'validate_agreement',
      arguments: { agreement: { metadata: { templateId: 'did:template:mou-v1' } } },
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
    const result = await client.callTool({ name: 'get_agreement_state', arguments: { agreementId: 'agr_1' } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /X-API-Key/);
    await client.close();
  } finally {
    await env.close();
  }
});

test('surfaces upstream auth failures with actionable hints', async () => {
  const env = await startServers();
  try {
    const client = await connectClient(env.mcpUrl, { apiKey: 'wrong-key' });
    const result = await client.callTool({ name: 'list_agreements', arguments: {} });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /HTTP 401/);
    await client.close();
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

    const get = await fetch(env.mcpUrl, { method: 'GET' });
    assert.equal(get.status, 405);
  } finally {
    await env.close();
  }
});

const TEST_OAUTH = {
  resource: 'https://test-api.example.com/mcp',
  authorizationServers: ['https://idp.example.com/'],
  resourceDocumentation: 'https://docs.example.com/mcp',
};

test('serves RFC 9728 protected-resource metadata when OAuth is configured', async () => {
  const env = await startServers({ oauth: TEST_OAUTH });
  try {
    for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
      const response = await fetch(new URL(path, env.mcpUrl));
      assert.equal(response.status, 200);
      const metadata = await response.json();
      assert.equal(metadata.resource, TEST_OAUTH.resource);
      assert.deepEqual(metadata.authorization_servers, TEST_OAUTH.authorizationServers);
      assert.deepEqual(metadata.bearer_methods_supported, ['header']);
      assert.ok(metadata.scopes_supported.includes('agreements.read'));
      assert.equal(metadata.resource_documentation, TEST_OAUTH.resourceDocumentation);
    }
  } finally {
    await env.close();
  }
});

test('derives path-suffixed OAuth metadata from the configured resource', async () => {
  const oauth = {
    resource: 'https://test-api.example.com/custom/mcp',
    authorizationServers: ['https://idp.example.com/'],
    scopesSupported: ['agreements.read'],
  };
  const env = await startServers({ oauth, mcpPath: '/custom/mcp' });
  try {
    for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/custom/mcp']) {
      const response = await fetch(new URL(path, env.mcpUrl));
      assert.equal(response.status, 200);
      const metadata = await response.json();
      assert.equal(metadata.resource, oauth.resource);
      assert.deepEqual(metadata.scopes_supported, ['agreements.read']);
    }

    const oldMcpPathResponse = await fetch(new URL('/.well-known/oauth-protected-resource/mcp', env.mcpUrl));
    assert.equal(oldMcpPathResponse.status, 404);

    const challenge = await fetch(env.mcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', params: {}, id: 1 }),
    });
    assert.equal(
      challenge.headers.get('www-authenticate'),
      'Bearer resource_metadata="https://test-api.example.com/.well-known/oauth-protected-resource/custom/mcp", scope="agreements.read"',
    );
  } finally {
    await env.close();
  }
});

test('rejects OAuth resources that cannot describe the configured MCP endpoint', () => {
  assert.throws(
    () =>
      createAgreementsMcpHttpServer({
        mcpPath: '/mcp',
        oauth: { ...TEST_OAUTH, resource: 'https://test-api.example.com/v0' },
      }),
    /OAuth resource path \(\/v0\) must match MCP path \(\/mcp\)/,
  );
  assert.throws(
    () =>
      createAgreementsMcpHttpServer({
        mcpPath: '/mcp',
        oauth: { ...TEST_OAUTH, resource: 'https://test-api.example.com/mcp?tenant=abc' },
      }),
    /OAuth resource must not include a query string/,
  );
  assert.throws(
    () =>
      createAgreementsMcpHttpServer({
        mcpPath: '/mcp',
        oauth: { ...TEST_OAUTH, resource: 'urn:example:mcp' },
      }),
    /OAuth resource must use http or https/,
  );
});

test('does not serve protected-resource metadata when OAuth is not configured', async () => {
  const env = await startServers();
  try {
    const response = await fetch(new URL('/.well-known/oauth-protected-resource', env.mcpUrl));
    assert.equal(response.status, 404);
  } finally {
    await env.close();
  }
});

test('challenges unauthenticated MCP requests with 401 + WWW-Authenticate when OAuth is configured', async () => {
  const env = await startServers({ oauth: TEST_OAUTH });
  try {
    const response = await fetch(env.mcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', params: {}, id: 1 }),
    });
    assert.equal(response.status, 401);
    assert.equal(
      response.headers.get('www-authenticate'),
      'Bearer resource_metadata="https://test-api.example.com/.well-known/oauth-protected-resource/mcp", scope="agreements.read agreements.write"',
    );
  } finally {
    await env.close();
  }
});

test('forwards OAuth JWTs to the gateway as Authorization bearer, not X-API-Key', async () => {
  const env = await startServers({ oauth: TEST_OAUTH });
  try {
    const transport = new StreamableHTTPClientTransport(env.mcpUrl, {
      requestInit: { headers: { Authorization: `Bearer ${TEST_JWT}` } },
    });
    const client = new Client({ name: 'agreements-mcp-test-client', version: '0.0.1' });
    await client.connect(transport);

    const result = await client.callTool({ name: 'list_agreements', arguments: {} });
    assert.equal(result.isError ?? false, false);

    const gatewayRequest = env.gateway.requests.find((request) => request.url.startsWith('/v0/agreements'));
    assert.ok(gatewayRequest, 'expected a gateway request');
    assert.equal(gatewayRequest.authorization, `Bearer ${TEST_JWT}`);
    assert.equal(gatewayRequest.apiKey, undefined);

    await client.close();
  } finally {
    await env.close();
  }
});

test('opaque keys sent via Authorization: Bearer still map to X-API-Key upstream', async () => {
  const env = await startServers({ oauth: TEST_OAUTH });
  try {
    const transport = new StreamableHTTPClientTransport(env.mcpUrl, {
      requestInit: { headers: { Authorization: `Bearer ${TEST_API_KEY}` } },
    });
    const client = new Client({ name: 'agreements-mcp-test-client', version: '0.0.1' });
    await client.connect(transport);

    const result = await client.callTool({ name: 'list_agreements', arguments: {} });
    assert.equal(result.isError ?? false, false);

    const gatewayRequest = env.gateway.requests.find((request) => request.url.startsWith('/v0/agreements'));
    assert.ok(gatewayRequest, 'expected a gateway request');
    assert.equal(gatewayRequest.apiKey, TEST_API_KEY);

    await client.close();
  } finally {
    await env.close();
  }
});
