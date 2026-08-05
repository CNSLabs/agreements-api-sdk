import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { ApiClient } from '../dist/index.js';
import { OauthClientCredentials, OauthTokenRequestError, createClientCredentialsTokenProvider } from '../dist/oauth.js';

function generateClientJwk() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { ...privateKey.export({ format: 'jwk' }), kid: 'test-kid', alg: 'ES256', use: 'sig' };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function decodeJwtSegment(segment) {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

const TOKEN_URL = 'https://auth.example.test/auth-api/oauth/token';

describe('OauthClientCredentials', () => {
  it('mints a token with a valid signed client assertion', async () => {
    const jwk = generateClientJwk();
    const requests = [];
    const oauth = new OauthClientCredentials({
      clientId: 'cns_oa_test',
      privateJwk: jwk,
      tokenUrl: TOKEN_URL,
      scope: 'agreements.read',
      fetch: async (url, init) => {
        requests.push({ url: String(url), body: String(init.body) });
        return jsonResponse(200, { access_token: 'token-1', token_type: 'Bearer', expires_in: 600 });
      },
    });

    const token = await oauth.getAccessToken();
    assert.equal(token, 'token-1');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, TOKEN_URL);

    const form = new URLSearchParams(requests[0].body);
    assert.equal(form.get('grant_type'), 'client_credentials');
    assert.equal(form.get('client_assertion_type'), 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
    assert.equal(form.get('scope'), 'agreements.read');

    const assertion = form.get('client_assertion');
    const [headerB64, payloadB64, signatureB64] = assertion.split('.');
    const header = decodeJwtSegment(headerB64);
    const payload = decodeJwtSegment(payloadB64);
    assert.equal(header.alg, 'ES256');
    assert.equal(header.kid, 'test-kid');
    assert.equal(payload.iss, 'cns_oa_test');
    assert.equal(payload.sub, 'cns_oa_test');
    assert.equal(payload.aud, TOKEN_URL);
    assert.ok(payload.jti);
    assert.ok(payload.exp - payload.iat <= 300);

    const publicKey = createPublicKey({ key: { ...jwk, d: undefined }, format: 'jwk' });
    const valid = verify(
      'sha256',
      Buffer.from(`${headerB64}.${payloadB64}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signatureB64, 'base64url'),
    );
    assert.equal(valid, true);
  });

  it('caches tokens until expiry and deduplicates concurrent refreshes', async () => {
    let tokenCalls = 0;
    const oauth = new OauthClientCredentials({
      clientId: 'cns_oa_test',
      privateJwk: generateClientJwk(),
      tokenUrl: TOKEN_URL,
      fetch: async () => {
        tokenCalls += 1;
        return jsonResponse(200, { access_token: `token-${tokenCalls}`, token_type: 'Bearer', expires_in: 600 });
      },
    });

    const [first, second] = await Promise.all([oauth.getAccessToken(), oauth.getAccessToken()]);
    const third = await oauth.getAccessToken();
    assert.equal(first, 'token-1');
    assert.equal(second, 'token-1');
    assert.equal(third, 'token-1');
    assert.equal(tokenCalls, 1);
  });

  it('refreshes when the cached token is within the refresh leeway', async () => {
    let tokenCalls = 0;
    const oauth = new OauthClientCredentials({
      clientId: 'cns_oa_test',
      privateJwk: generateClientJwk(),
      tokenUrl: TOKEN_URL,
      // expires_in below leeway => refreshAt is "now", so every call refetches.
      refreshLeewaySeconds: 30,
      fetch: async () => {
        tokenCalls += 1;
        return jsonResponse(200, { access_token: `token-${tokenCalls}`, token_type: 'Bearer', expires_in: 5 });
      },
    });

    assert.equal(await oauth.getAccessToken(), 'token-1');
    assert.equal(await oauth.getAccessToken(), 'token-2');
    assert.equal(tokenCalls, 2);
  });

  it('discovers the token endpoint from issuer metadata', async () => {
    const urls = [];
    const oauth = new OauthClientCredentials({
      clientId: 'cns_oa_test',
      privateJwk: generateClientJwk(),
      issuer: 'https://auth.example.test/auth-api/',
      fetch: async (url) => {
        urls.push(String(url));
        if (String(url).includes('.well-known')) {
          return jsonResponse(200, { issuer: 'https://auth.example.test/auth-api', token_endpoint: TOKEN_URL });
        }
        return jsonResponse(200, { access_token: 'token-1', token_type: 'Bearer', expires_in: 600 });
      },
    });

    assert.equal(await oauth.getAccessToken(), 'token-1');
    assert.deepEqual(urls, [
      'https://auth.example.test/auth-api/.well-known/oauth-authorization-server',
      TOKEN_URL,
    ]);
  });

  it('throws OauthTokenRequestError with the server error code on failure', async () => {
    const oauth = new OauthClientCredentials({
      clientId: 'cns_oa_test',
      privateJwk: generateClientJwk(),
      tokenUrl: TOKEN_URL,
      fetch: async () => jsonResponse(400, { error: 'invalid_client', error_description: 'unknown client' }),
    });

    await assert.rejects(
      () => oauth.getAccessToken(),
      (error) => {
        assert.ok(error instanceof OauthTokenRequestError);
        assert.equal(error.status, 400);
        assert.equal(error.errorCode, 'invalid_client');
        assert.match(error.message, /unknown client/);
        return true;
      },
    );
  });

  it('rejects configs without key material or endpoint', () => {
    const jwk = generateClientJwk();
    assert.throws(() => new OauthClientCredentials({ clientId: 'x', privateJwk: { ...jwk, d: undefined }, tokenUrl: TOKEN_URL }), /private JWK/);
    assert.throws(() => new OauthClientCredentials({ clientId: 'x', privateJwk: { ...jwk, kid: undefined }, tokenUrl: TOKEN_URL }), /kid/);
    assert.throws(() => new OauthClientCredentials({ clientId: 'x', privateJwk: jwk }), /issuer.*tokenUrl|tokenUrl.*issuer/);
    assert.throws(() => new OauthClientCredentials({ clientId: '', privateJwk: jwk, tokenUrl: TOKEN_URL }), /clientId/);
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

  it('integrates with createClientCredentialsTokenProvider end to end', async () => {
    const jwk = generateClientJwk();
    let tokenCalls = 0;
    const apiCalls = [];

    const tokenProvider = createClientCredentialsTokenProvider({
      clientId: 'cns_oa_test',
      privateJwk: JSON.stringify(jwk),
      tokenUrl: TOKEN_URL,
      fetch: async () => {
        tokenCalls += 1;
        return jsonResponse(200, { access_token: 'minted-token', token_type: 'Bearer', expires_in: 600 });
      },
    });

    const client = new ApiClient({
      baseUrl: 'https://external-api.example.test',
      tokenProvider,
      fetch: async (url, init) => {
        apiCalls.push({ url: String(url), headers: init.headers });
        return jsonResponse(200, { status: 'ok' });
      },
    });

    await client.getHealth();
    await client.getHealth();

    assert.equal(tokenCalls, 1);
    assert.equal(apiCalls.length, 2);
    assert.equal(apiCalls[0].headers.Authorization, 'Bearer minted-token');
    assert.equal(apiCalls[1].headers.Authorization, 'Bearer minted-token');
  });
});
