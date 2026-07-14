import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiClient } from '../dist/index.js';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function successEnvelope(data, requestId = 'req_test') {
  return {
    data,
    meta: { apiVersion: 'v0', requestId },
  };
}

describe('ApiClient agreement requests', () => {
  it('validates a canonical agreement package through the dedicated strict path', async () => {
    const calls = [];
    const expected = {
      manifest: {
        schemaVersion: '0.1',
        profile: {
          id: 'shodai.evm.agreement-engine',
          version: '0.1',
          compiler: '@shodai-network/agreements-protocol-evm/package-compiler-0.1',
        },
        packageDigest: `0x${'1'.repeat(64)}`,
        targetChainId: '59141',
        docUri: 'ipfs://package/client-test',
        canonicalUtf8Length: 123,
        compiled: { inputDefs: 0, transitions: 0, initVars: 0, verifiers: 0, actions: 0 },
      },
      lossReport: [],
      deployment: {
        docHash: `0x${'1'.repeat(64)}`,
        initialState: `0x${'2'.repeat(64)}`,
      },
    };
    const client = new ApiClient({
      baseUrl: 'https://external-api.example.test',
      apiKey: 'external-key',
      fetch: async (url, init = {}) => {
        calls.push({
          url: String(url),
          method: init.method,
          body: init.body ? JSON.parse(String(init.body)) : undefined,
        });
        return jsonResponse(201, successEnvelope(expected));
      },
    });

    const body = {
      agreementPackage: { schemaVersion: '0.1' },
      docUri: 'ipfs://package/client-test',
    };
    const result = await client.validatePackage(body);

    assert.deepEqual(result, expected);
    assert.deepEqual(calls, [{
      url: 'https://external-api.example.test/v0/agreements/validate-package',
      method: 'POST',
      body,
    }]);
  });

  it('preserves chainId in deployment validation and deploy-with-permit bodies', async () => {
    const calls = [];
    const client = new ApiClient({
      baseUrl: 'https://external-api.example.test',
      apiKey: 'external-key',
      fetch: async (url, init = {}) => {
        calls.push({
          url: String(url),
          method: init.method,
          body: init.body ? JSON.parse(String(init.body)) : undefined,
        });

        if (String(url).endsWith('/validate')) {
          return jsonResponse(201, successEnvelope({
            templateId: 'template-1',
            participantVariableKeys: [],
            participants: [],
            observers: [],
            variables: {},
            contributors: [],
            warnings: [],
          }));
        }

        return jsonResponse(201, successEnvelope({
          id: 'agreement-1',
          address: '0x1111111111111111111111111111111111111111',
          chainId: 59141,
          status: 'Deployed',
          state: 'Active',
          displayName: 'SDK contract test',
          createdAt: '2026-06-03T00:00:00.000Z',
          updatedAt: '2026-06-03T00:00:00.000Z',
        }));
      },
    });

    await client.validateDeployment({
      agreement: { metadata: { id: 'template-1' } },
      chainId: 59141,
      initValues: {},
      participants: [],
      observers: [],
    });
    await client.deployWithPermit({
      agreement: { metadata: { id: 'template-1' } },
      displayName: 'SDK contract test',
      chainId: 59141,
      signer: '0x1111111111111111111111111111111111111111',
      deadline: 1,
      signature: { v: 27, r: `0x${'1'.repeat(64)}`, s: `0x${'2'.repeat(64)}` },
    });

    assert.deepEqual(calls.map((call) => [call.method, call.url]), [
      ['POST', 'https://external-api.example.test/v0/agreements/validate'],
      ['POST', 'https://external-api.example.test/v0/agreements/deploy-with-permit'],
    ]);
    assert.equal(calls[0].body.chainId, 59141);
    assert.equal(calls[1].body.chainId, 59141);
  });
});

describe('ApiClient webhook requests', () => {
  it('manages webhook subscriptions through typed helpers', async () => {
    const calls = [];
    const activeWebhook = {
      id: 'wh_123',
      principalId: 'principal-1',
      createdByApiKeyId: 'key-1',
      url: 'https://example.com/shodai/webhooks',
      status: 'active',
      eventTypes: ['agreement.transitioned', 'agreement.notification.triggered'],
      filters: {
        templateIds: ['did:template:service-retainer-v0-1'],
        ruleIds: ['deployment-follow-up'],
      },
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z',
    };
    const disabledWebhook = {
      ...activeWebhook,
      status: 'disabled',
      updatedAt: '2026-06-03T00:05:00.000Z',
    };
    const client = new ApiClient({
      baseUrl: 'https://external-api.example.test',
      apiKey: 'external-key',
      fetch: async (url, init = {}) => {
        const path = new URL(String(url)).pathname;
        const method = init.method;
        const body = init.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ url: String(url), method, body });

        if (method === 'POST' && path === '/v0/webhooks') {
          return jsonResponse(201, successEnvelope({
            ...activeWebhook,
            secret: 'whsec_test_secret',
          }));
        }
        if (method === 'GET' && path === '/v0/webhooks') {
          return jsonResponse(200, {
            data: [activeWebhook],
            pageInfo: {
              hasNextPage: false,
              hasPreviousPage: false,
            },
          });
        }
        if (method === 'GET' && path === '/v0/webhooks/wh_123') {
          return jsonResponse(200, successEnvelope(activeWebhook));
        }
        if (method === 'PATCH' && path === '/v0/webhooks/wh_123') {
          return jsonResponse(200, successEnvelope({
            ...activeWebhook,
            filters: body.filters,
          }));
        }
        if (method === 'DELETE' && path === '/v0/webhooks/wh_123') {
          return jsonResponse(200, successEnvelope(disabledWebhook));
        }
        if (method === 'POST' && path === '/v0/webhooks/wh_123/test') {
          return jsonResponse(201, successEnvelope({
            ok: true,
            deliveryId: 'wd_123',
            status: 'succeeded',
            responseStatus: 204,
          }));
        }

        return jsonResponse(404, { error: { message: `Unexpected ${method} ${path}` } });
      },
    });

    const created = await client.createWebhook({
      url: 'https://example.com/shodai/webhooks',
      eventTypes: ['agreement.transitioned', 'agreement.notification.triggered'],
      filters: {
        templateIds: ['did:template:service-retainer-v0-1'],
        ruleIds: ['deployment-follow-up'],
      },
    });
    const listed = await client.listWebhooks();
    const fetched = await client.getWebhook('wh_123');
    const updated = await client.updateWebhook('wh_123', {
      filters: { ruleIds: ['payment-reminder'] },
    });
    const deleted = await client.deleteWebhook('wh_123');
    const testResult = await client.testWebhook('wh_123');

    assert.equal(created.secret, 'whsec_test_secret');
    assert.equal(listed.data[0].id, 'wh_123');
    assert.equal(fetched.id, 'wh_123');
    assert.deepEqual(updated.filters, { ruleIds: ['payment-reminder'] });
    assert.equal(deleted.status, 'disabled');
    assert.equal(testResult.ok, true);

    assert.deepEqual(calls.map((call) => [call.method, call.url]), [
      ['POST', 'https://external-api.example.test/v0/webhooks'],
      ['GET', 'https://external-api.example.test/v0/webhooks'],
      ['GET', 'https://external-api.example.test/v0/webhooks/wh_123'],
      ['PATCH', 'https://external-api.example.test/v0/webhooks/wh_123'],
      ['DELETE', 'https://external-api.example.test/v0/webhooks/wh_123'],
      ['POST', 'https://external-api.example.test/v0/webhooks/wh_123/test'],
    ]);
    assert.deepEqual(calls[0].body.eventTypes, [
      'agreement.transitioned',
      'agreement.notification.triggered',
    ]);
    assert.deepEqual(calls[3].body, { filters: { ruleIds: ['payment-reminder'] } });
    assert.equal(calls[5].body, undefined);
  });
});
