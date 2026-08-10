import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiClient } from '../dist/index.js';
import * as oauth from '../dist/oauth.js';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('OAuth module exports', () => {
  it('does not expose autonomous-agent client credentials helpers', () => {
    assert.equal('OauthClientCredentials' in oauth, false);
    assert.equal('createClientCredentialsTokenProvider' in oauth, false);
  });
});

describe('ApiClient bearer-token auth', () => {
  it('sends Authorization: Bearer from the token provider instead of X-API-Key', async () => {
    const seenHeaders = [];
    const client = new ApiClient({
      baseUrl: 'https://external-api.example.test',
      tokenProvider: async () => 'access-token-1',
      fetch: async (url, init) => {
        seenHeaders.push(init.headers);
        return jsonResponse(200, { status: 'ok' });
      },
    });

    await client.getHealth();
    assert.equal(seenHeaders[0].Authorization, 'Bearer access-token-1');
    assert.equal(seenHeaders[0]['X-API-Key'], undefined);
  });

  it('rejects configuring both apiKey and tokenProvider', () => {
    assert.throws(
      () =>
        new ApiClient({
          baseUrl: 'https://external-api.example.test',
          apiKey: 'key',
          tokenProvider: () => 'token',
        }),
      /either `apiKey` or `tokenProvider`/,
    );
  });
});
