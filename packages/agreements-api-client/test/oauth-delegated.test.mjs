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

  it('clears memory and surfaces a local-clear failure without a refresh token', async () => {
    const clearError = new Error('disk unavailable');
    let clearCalls = 0;
    let fetchCalls = 0;
    const session = new OauthDelegatedSession({
      clientId: 'cns_oa_test',
      tokenUrl: 'https://auth.example/oauth/token',
      fetch: async () => {
        fetchCalls += 1;
        throw new Error('unexpected fetch');
      },
      onTokensCleared: async () => {
        clearCalls += 1;
        throw clearError;
      },
    });
    session.restoreTokens({
      accessToken: 'access-only',
      expiresAt: Date.now() + 60_000,
      tokenType: 'Bearer',
    });

    await assert.rejects(() => session.revoke(), (error) => error === clearError);
    assert.equal(session.getTokens(), undefined);
    assert.equal(clearCalls, 1);
    assert.equal(fetchCalls, 0);
  });

  it('clears memory and durable state and revokes the refresh token', async () => {
    const calls = [];
    let durableTokens = 'persisted';
    let clearCalls = 0;
    const session = new OauthDelegatedSession({
      clientId: 'cns_oa_test',
      tokenUrl: 'https://auth.example/oauth/token',
      revokeUrl: 'https://auth.example/oauth/revoke',
      fetch: async (url, init = {}) => {
        calls.push({ url: String(url), method: init.method, headers: init.headers, body: init.body });
        return jsonResponse({});
      },
      onTokensCleared: () => {
        clearCalls += 1;
        durableTokens = undefined;
      },
    });
    session.restoreTokens({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() + 60_000,
      tokenType: 'Bearer',
    });

    await session.revoke();

    assert.equal(session.getTokens(), undefined);
    assert.equal(durableTokens, undefined);
    assert.equal(clearCalls, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://auth.example/oauth/revoke');
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(calls[0].headers.Accept, 'application/json');
    assert.deepEqual(Object.fromEntries(new URLSearchParams(calls[0].body)), {
      token: 'refresh-1',
      client_id: 'cns_oa_test',
    });
  });

  it('clears local state and reports a missing revocation endpoint', async () => {
    let durableTokens = 'persisted';
    let fetchCalls = 0;
    const session = new OauthDelegatedSession({
      clientId: 'cns_oa_test',
      tokenUrl: 'https://auth.example/oauth/token',
      fetch: async () => {
        fetchCalls += 1;
        throw new Error('unexpected fetch');
      },
      onTokensCleared: () => {
        durableTokens = undefined;
      },
    });
    session.restoreTokens({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() + 60_000,
      tokenType: 'Bearer',
    });

    await assert.rejects(() => session.revoke(), /no revocation endpoint.*supply `revokeUrl`/i);
    assert.equal(session.getTokens(), undefined);
    assert.equal(durableTokens, undefined);
    assert.equal(fetchCalls, 0);
  });

  it('clears local state and preserves non-success revocation details', async () => {
    let durableTokens = 'persisted';
    const session = new OauthDelegatedSession({
      clientId: 'cns_oa_test',
      tokenUrl: 'https://auth.example/oauth/token',
      revokeUrl: 'https://auth.example/oauth/revoke',
      fetch: async () =>
        jsonResponse({ error: 'invalid_token', error_description: 'refresh token expired' }, 400),
      onTokensCleared: () => {
        durableTokens = undefined;
      },
    });
    session.restoreTokens({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() + 60_000,
      tokenType: 'Bearer',
    });

    await assert.rejects(
      () => session.revoke(),
      (error) =>
        error instanceof OauthTokenRequestError &&
        error.message === 'Refresh-token revocation failed: refresh token expired' &&
        error.status === 400 &&
        error.errorCode === 'invalid_token' &&
        error.body?.error_description === 'refresh token expired',
    );
    assert.equal(session.getTokens(), undefined);
    assert.equal(durableTokens, undefined);
  });

  it('aggregates local-clear and remote-revocation failures', async () => {
    const clearError = new Error('disk unavailable');
    let clearCalls = 0;
    const session = new OauthDelegatedSession({
      clientId: 'cns_oa_test',
      tokenUrl: 'https://auth.example/oauth/token',
      revokeUrl: 'https://auth.example/oauth/revoke',
      fetch: async () => jsonResponse({ error: 'server_error' }, 503),
      onTokensCleared: async () => {
        clearCalls += 1;
        throw clearError;
      },
    });
    session.restoreTokens({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() + 60_000,
      tokenType: 'Bearer',
    });

    await assert.rejects(
      () => session.revoke(),
      (error) =>
        error instanceof AggregateError &&
        error.message.includes('Local token clearing failed') &&
        error.errors[0] === clearError &&
        error.errors[1] instanceof OauthTokenRequestError &&
        error.errors[1].status === 503,
    );
    assert.equal(session.getTokens(), undefined);
    assert.equal(clearCalls, 1);
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
