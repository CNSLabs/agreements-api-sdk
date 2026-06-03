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
