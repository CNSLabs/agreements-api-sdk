import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OauthDelegatedSession, OauthTokenRequestError } from '../dist/oauth.js';

describe('OauthDelegatedSession', () => {
  it('exchanges an authorization code and serves a cached access token', async () => {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method || 'GET', body: init.body });
      if (String(url).includes('oauth/token')) {
        return jsonResponse({
          access_token: 'access-1',
          token_type: 'Bearer',
          expires_in: 600,
          refresh_token: 'refresh-1',
          scope: 'agreements.read',
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    };

    const updates = [];
    const session = new OauthDelegatedSession({
      clientId: 'cns_oa_test',
      tokenUrl: 'https://auth.example/oauth/token',
      fetch: fetchImpl,
      onTokensUpdated: (tokens) => {
        updates.push(tokens);
      },
    });

    const tokens = await session.exchangeAuthorizationCode({
      code: 'code-1',
      redirectUri: 'http://127.0.0.1:1234/callback',
      codeVerifier: 'verifier',
    });

    assert.equal(tokens.accessToken, 'access-1');
    assert.equal(tokens.refreshToken, 'refresh-1');
    assert.equal(updates.length, 1);
    assert.equal(await session.getAccessToken(), 'access-1');
    assert.equal(calls.length, 1);
    assert.match(calls[0].body, /grant_type=authorization_code/);
    assert.match(calls[0].body, /code_verifier=verifier/);
  });

  it('refreshes when the access token is expired', async () => {
    let tokenCalls = 0;
    const fetchImpl = async (url, init = {}) => {
      if (String(url).includes('oauth/token')) {
        tokenCalls += 1;
        const body = Object.fromEntries(new URLSearchParams(init.body));
        if (body.grant_type === 'refresh_token') {
          return jsonResponse({
            access_token: 'access-2',
            token_type: 'Bearer',
            expires_in: 600,
            refresh_token: 'refresh-2',
          });
        }
      }
      throw new Error(`unexpected fetch ${url}`);
    };

    const session = new OauthDelegatedSession({
      clientId: 'cns_oa_test',
      tokenUrl: 'https://auth.example/oauth/token',
      fetch: fetchImpl,
    });
    session.restoreTokens({
      accessToken: 'stale',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() - 1_000,
      tokenType: 'Bearer',
    });

    assert.equal(await session.getAccessToken(), 'access-2');
    assert.equal(session.getTokens()?.refreshToken, 'refresh-2');
    assert.equal(tokenCalls, 1);
  });

  it('surfaces token endpoint errors', async () => {
    const session = new OauthDelegatedSession({
      clientId: 'cns_oa_test',
      tokenUrl: 'https://auth.example/oauth/token',
      fetch: async () =>
        jsonResponse({ error: 'invalid_grant', error_description: 'code expired' }, 400),
    });

    await assert.rejects(
      () =>
        session.exchangeAuthorizationCode({
          code: 'x',
          redirectUri: 'http://127.0.0.1/callback',
          codeVerifier: 'v',
        }),
      (error) => error instanceof OauthTokenRequestError && error.errorCode === 'invalid_grant',
    );
  });
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}
