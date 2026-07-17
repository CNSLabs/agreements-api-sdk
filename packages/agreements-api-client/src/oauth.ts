/**
 * OAuth 2.1 helpers for Node clients.
 *
 * - **Agent identity:** `OauthClientCredentials` — `client_credentials` +
 *   `private_key_jwt` (RFC 7523).
 * - **Delegated access:** `OauthDelegatedSession` — `authorization_code` +
 *   PKCE, refresh-token rotation, RFC 7009 revoke (public clients).
 *
 * This module uses `node:crypto` / `node:http` and is therefore **Node-only**.
 * It is intentionally not re-exported from the package root so browser
 * bundles stay free of Node built-ins; import via
 * `@shodai-network/agreements-api-client/oauth`.
 */

import { createHash, createPrivateKey, randomBytes, randomUUID, sign, type JsonWebKey as NodeJsonWebKey } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';

import type { BearerTokenProvider } from './types.js';

/** Private ES256 JWK as issued by the OAuth client provisioning flow. */
export type OauthPrivateJwk = {
  kty: string;
  crv?: string;
  x?: string;
  y?: string;
  /** Private scalar; required for signing. */
  d?: string;
  /** Key id; must match a key registered for the client. */
  kid?: string;
  alg?: string;
  use?: string;
};

export type OauthClientCredentialsConfig = {
  /** OAuth client id (`cns_oa_...`). */
  clientId: string;
  /** Private ES256 JWK (object or JSON string) used to sign client assertions. */
  privateJwk: OauthPrivateJwk | string;
  /**
   * Authorization server issuer URL, e.g. `https://app.shodai.network/auth-api`.
   * The token endpoint is discovered from
   * `<issuer>/.well-known/oauth-authorization-server` unless `tokenUrl` is set.
   */
  issuer?: string;
  /** Explicit token endpoint URL; wins over `issuer` discovery. */
  tokenUrl?: string;
  /** Space-separated scopes to request (defaults to the client's allowed scopes). */
  scope?: string;
  /** Override `fetch` (defaults to global `fetch`). */
  fetch?: typeof fetch;
  /** Seconds before token expiry at which a fresh token is fetched. Default 30. */
  refreshLeewaySeconds?: number;
};

export type OauthTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
  refresh_token?: string;
};

export class OauthTokenRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errorCode?: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'OauthTokenRequestError';
  }
}

const CLIENT_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
const ASSERTION_TTL_SECONDS = 120;
const DEFAULT_REFRESH_LEEWAY_SECONDS = 30;

/**
 * Manages access tokens for the `client_credentials` grant with
 * `private_key_jwt` client authentication: signs assertions, caches the
 * current token, refreshes it shortly before expiry, and deduplicates
 * concurrent refreshes.
 */
export class OauthClientCredentials {
  private readonly clientId: string;
  private readonly privateJwk: OauthPrivateJwk;
  private readonly issuer?: string;
  private readonly explicitTokenUrl?: string;
  private readonly scope?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly refreshLeewayMs: number;

  private cached?: { token: string; refreshAt: number };
  private inflight?: Promise<string>;
  private tokenUrlPromise?: Promise<string>;

  constructor(config: OauthClientCredentialsConfig) {
    this.clientId = config.clientId?.trim();
    if (!this.clientId) {
      throw new Error('OauthClientCredentials requires `clientId`.');
    }

    const jwk = typeof config.privateJwk === 'string' ? (JSON.parse(config.privateJwk) as OauthPrivateJwk) : config.privateJwk;
    if (!jwk || typeof jwk !== 'object' || !jwk.d) {
      throw new Error('OauthClientCredentials requires a private JWK (with `d`).');
    }
    if (!jwk.kid) {
      throw new Error('OauthClientCredentials requires the private JWK to carry a `kid`.');
    }
    this.privateJwk = jwk;

    this.issuer = config.issuer?.trim().replace(/\/+$/, '') || undefined;
    this.explicitTokenUrl = config.tokenUrl?.trim() || undefined;
    if (!this.issuer && !this.explicitTokenUrl) {
      throw new Error('OauthClientCredentials requires either `issuer` or `tokenUrl`.');
    }

    this.scope = config.scope?.trim() || undefined;
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
    this.refreshLeewayMs = (config.refreshLeewaySeconds ?? DEFAULT_REFRESH_LEEWAY_SECONDS) * 1000;
  }

  /** Returns a currently valid access token, minting a new one when needed. */
  async getAccessToken(): Promise<string> {
    if (this.cached && this.cached.refreshAt > Date.now()) {
      return this.cached.token;
    }
    if (!this.inflight) {
      this.inflight = this.fetchToken().finally(() => {
        this.inflight = undefined;
      });
    }
    return this.inflight;
  }

  /** `ApiClient`-compatible token provider bound to this instance. */
  tokenProvider(): BearerTokenProvider {
    return () => this.getAccessToken();
  }

  private resolveTokenUrl(): Promise<string> {
    if (this.explicitTokenUrl) {
      return Promise.resolve(this.explicitTokenUrl);
    }
    if (!this.tokenUrlPromise) {
      this.tokenUrlPromise = this.discoverTokenUrl().catch((error) => {
        // Do not cache a failed discovery; the server may simply be starting up.
        this.tokenUrlPromise = undefined;
        throw error;
      });
    }
    return this.tokenUrlPromise;
  }

  private async discoverTokenUrl(): Promise<string> {
    const metadataUrl = `${this.issuer}/.well-known/oauth-authorization-server`;
    const res = await this.fetchImpl(metadataUrl, { headers: { Accept: 'application/json' } });
    const body = (await res.json().catch(() => undefined)) as { token_endpoint?: string } | undefined;
    if (!res.ok || !body?.token_endpoint) {
      throw new OauthTokenRequestError(
        `Failed to discover token endpoint from ${metadataUrl} (HTTP ${res.status}).`,
        res.status,
        undefined,
        body,
      );
    }
    return body.token_endpoint;
  }

  private async fetchToken(): Promise<string> {
    const tokenUrl = await this.resolveTokenUrl();
    const form = new URLSearchParams({
      grant_type: 'client_credentials',
      client_assertion_type: CLIENT_ASSERTION_TYPE,
      client_assertion: this.signClientAssertion(tokenUrl),
    });
    if (this.scope) {
      form.set('scope', this.scope);
    }

    const res = await this.fetchImpl(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: form.toString(),
    });
    const body = (await res.json().catch(() => undefined)) as
      | (Partial<OauthTokenResponse> & { error?: string; error_description?: string })
      | undefined;

    if (!res.ok || !body?.access_token) {
      const description = body?.error_description ?? body?.error ?? `HTTP ${res.status}`;
      throw new OauthTokenRequestError(`Token request failed: ${description}`, res.status, body?.error, body);
    }

    const expiresInMs = (body.expires_in ?? 0) * 1000;
    this.cached = {
      token: body.access_token,
      refreshAt: Date.now() + Math.max(expiresInMs - this.refreshLeewayMs, 0),
    };
    return body.access_token;
  }

  private signClientAssertion(tokenUrl: string): string {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'ES256', typ: 'JWT', kid: this.privateJwk.kid };
    const payload = {
      iss: this.clientId,
      sub: this.clientId,
      aud: tokenUrl,
      iat: now,
      exp: now + ASSERTION_TTL_SECONDS,
      jti: randomUUID(),
    };

    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const signingInput = `${encode(header)}.${encode(payload)}`;
    const key = createPrivateKey({ key: this.privateJwk as NodeJsonWebKey, format: 'jwk' });
    const signature = sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });
    return `${signingInput}.${signature.toString('base64url')}`;
  }
}

/**
 * Convenience factory: returns a `tokenProvider` for `ApiClient` that mints
 * and refreshes tokens via the client-credentials grant.
 */
export function createClientCredentialsTokenProvider(config: OauthClientCredentialsConfig): BearerTokenProvider {
  return new OauthClientCredentials(config).tokenProvider();
}

// ---------------------------------------------------------------------------
// Delegated access (authorization_code + PKCE)
// ---------------------------------------------------------------------------

export type OauthDelegatedConfig = {
  /** Public OAuth client id (`cns_oa_...`) registered for authorization_code. */
  clientId: string;
  /**
   * Authorization server issuer URL, e.g. `https://app.shodai.network/auth-api`.
   * Used to discover `token_endpoint`, `authorization_endpoint`, and
   * `revocation_endpoint` unless those URLs are set explicitly.
   */
  issuer?: string;
  tokenUrl?: string;
  /** Browser consent page; defaults to the RFC 8414 `authorization_endpoint`. */
  authorizationPageUrl?: string;
  revokeUrl?: string;
  /** Space-separated scopes to request at authorize time. */
  scope?: string;
  fetch?: typeof fetch;
  refreshLeewaySeconds?: number;
  /** Persist rotated tokens (login + refresh). */
  onTokensUpdated?: (tokens: OauthDelegatedTokenSet) => void | Promise<void>;
};

export type OauthDelegatedTokenSet = {
  accessToken: string;
  refreshToken?: string;
  /** Wall-clock ms when the access token should be treated as expired. */
  expiresAt: number;
  scope?: string;
  tokenType: string;
};

type AuthorizationServerMetadata = {
  token_endpoint?: string;
  authorization_endpoint?: string;
  revocation_endpoint?: string;
};

/**
 * Public-client delegated OAuth session: loopback authorize (RFC 8252),
 * PKCE code exchange, access-token caching, refresh-token rotation, and
 * revoke. Pair with a file/keychain store via `onTokensUpdated` /
 * `restoreTokens`.
 */
export class OauthDelegatedSession {
  private readonly clientId: string;
  private readonly issuer?: string;
  private readonly explicitTokenUrl?: string;
  private readonly explicitAuthorizePageUrl?: string;
  private readonly explicitRevokeUrl?: string;
  private readonly scope?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly refreshLeewayMs: number;
  private readonly onTokensUpdated?: OauthDelegatedConfig['onTokensUpdated'];

  private tokens?: OauthDelegatedTokenSet;
  private inflight?: Promise<string>;
  private metadataPromise?: Promise<AuthorizationServerMetadata>;

  constructor(config: OauthDelegatedConfig) {
    this.clientId = config.clientId?.trim();
    if (!this.clientId) {
      throw new Error('OauthDelegatedSession requires `clientId`.');
    }
    this.issuer = config.issuer?.trim().replace(/\/+$/, '') || undefined;
    this.explicitTokenUrl = config.tokenUrl?.trim() || undefined;
    this.explicitAuthorizePageUrl = config.authorizationPageUrl?.trim() || undefined;
    this.explicitRevokeUrl = config.revokeUrl?.trim() || undefined;
    if (!this.issuer && !this.explicitTokenUrl) {
      throw new Error('OauthDelegatedSession requires either `issuer` or `tokenUrl`.');
    }
    this.scope = config.scope?.trim() || undefined;
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
    this.refreshLeewayMs = (config.refreshLeewaySeconds ?? DEFAULT_REFRESH_LEEWAY_SECONDS) * 1000;
    this.onTokensUpdated = config.onTokensUpdated;
  }

  /** Restore a previously persisted token set (e.g. from disk). */
  restoreTokens(tokens: OauthDelegatedTokenSet): void {
    this.tokens = tokens;
  }

  getTokens(): OauthDelegatedTokenSet | undefined {
    return this.tokens;
  }

  /**
   * Opens a loopback listener, builds the consent URL (PKCE + state),
   * optionally launches a browser, waits for the redirect, and exchanges
   * the code. Register `http://127.0.0.1/callback` (any port) on the OAuth app.
   */
  async loginWithLoopback(options: {
    openBrowser?: boolean;
    scope?: string;
    /** Override the path portion of the loopback redirect (default `/callback`). */
    redirectPath?: string;
  } = {}): Promise<OauthDelegatedTokenSet> {
    const codeVerifier = base64Url(randomBytes(48));
    const state = base64Url(randomBytes(16));
    const codeChallenge = sha256Base64Url(codeVerifier);
    const scope = options.scope?.trim() || this.scope;
    const redirectPath = options.redirectPath || '/callback';

    const { redirectUri, code } = await listenForLoopbackCode({
      redirectPath,
      state,
      onReady: async (redirectUri) => {
        const authorizePageUrl = await this.resolveAuthorizePageUrl();
        const authorizeUrl = new URL(authorizePageUrl);
        authorizeUrl.searchParams.set('client_id', this.clientId);
        authorizeUrl.searchParams.set('redirect_uri', redirectUri);
        authorizeUrl.searchParams.set('response_type', 'code');
        authorizeUrl.searchParams.set('state', state);
        authorizeUrl.searchParams.set('code_challenge', codeChallenge);
        authorizeUrl.searchParams.set('code_challenge_method', 'S256');
        if (scope) {
          authorizeUrl.searchParams.set('scope', scope);
        }
        return authorizeUrl.toString();
      },
      openBrowser: options.openBrowser !== false,
    });

    return this.exchangeAuthorizationCode({
      code,
      redirectUri,
      codeVerifier,
    });
  }

  async exchangeAuthorizationCode(params: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<OauthDelegatedTokenSet> {
    const tokenUrl = await this.resolveTokenUrl();
    const body = await this.postToken(tokenUrl, {
      grant_type: 'authorization_code',
      client_id: this.clientId,
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier,
    });
    const tokens = toTokenSet(body);
    await this.commitTokens(tokens);
    return tokens;
  }

  /** Returns a valid access token, refreshing via the refresh_token grant when needed. */
  async getAccessToken(): Promise<string> {
    if (this.tokens && this.tokens.expiresAt - this.refreshLeewayMs > Date.now()) {
      return this.tokens.accessToken;
    }
    if (!this.tokens?.refreshToken) {
      throw new Error('OauthDelegatedSession has no usable tokens; call loginWithLoopback() first.');
    }
    if (!this.inflight) {
      this.inflight = this.refreshAccessToken().finally(() => {
        this.inflight = undefined;
      });
    }
    return this.inflight;
  }

  tokenProvider(): BearerTokenProvider {
    return () => this.getAccessToken();
  }

  /** Revokes the refresh-token family (RFC 7009) and clears local tokens. */
  async revoke(): Promise<void> {
    const refreshToken = this.tokens?.refreshToken;
    this.tokens = undefined;
    if (!refreshToken) {
      return;
    }
    const revokeUrl = await this.resolveRevokeUrl();
    if (!revokeUrl) {
      return;
    }
    await this.fetchImpl(revokeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ token: refreshToken, client_id: this.clientId }).toString(),
    });
  }

  private async refreshAccessToken(): Promise<string> {
    const refreshToken = this.tokens?.refreshToken;
    if (!refreshToken) {
      throw new Error('OauthDelegatedSession has no refresh token.');
    }
    const tokenUrl = await this.resolveTokenUrl();
    const body = await this.postToken(tokenUrl, {
      grant_type: 'refresh_token',
      client_id: this.clientId,
      refresh_token: refreshToken,
    });
    const tokens = toTokenSet(body, this.tokens);
    await this.commitTokens(tokens);
    return tokens.accessToken;
  }

  private async commitTokens(tokens: OauthDelegatedTokenSet): Promise<void> {
    this.tokens = tokens;
    await this.onTokensUpdated?.(tokens);
  }

  private async postToken(
    tokenUrl: string,
    params: Record<string, string>,
  ): Promise<OauthTokenResponse & { error?: string; error_description?: string }> {
    const res = await this.fetchImpl(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(params).toString(),
    });
    const body = (await res.json().catch(() => undefined)) as
      | (Partial<OauthTokenResponse> & { error?: string; error_description?: string })
      | undefined;
    if (!res.ok || !body?.access_token) {
      const description = body?.error_description ?? body?.error ?? `HTTP ${res.status}`;
      throw new OauthTokenRequestError(`Token request failed: ${description}`, res.status, body?.error, body);
    }
    return body as OauthTokenResponse & { error?: string; error_description?: string };
  }

  private async resolveTokenUrl(): Promise<string> {
    if (this.explicitTokenUrl) {
      return this.explicitTokenUrl;
    }
    const metadata = await this.discoverMetadata();
    if (!metadata.token_endpoint) {
      throw new Error('Authorization server metadata is missing token_endpoint.');
    }
    return metadata.token_endpoint;
  }

  private async resolveAuthorizePageUrl(): Promise<string> {
    if (this.explicitAuthorizePageUrl) {
      return this.explicitAuthorizePageUrl;
    }
    const metadata = await this.discoverMetadata();
    if (!metadata.authorization_endpoint) {
      throw new Error(
        'Authorization server metadata is missing authorization_endpoint; pass authorizationPageUrl.',
      );
    }
    return metadata.authorization_endpoint;
  }

  private async resolveRevokeUrl(): Promise<string | undefined> {
    if (this.explicitRevokeUrl) {
      return this.explicitRevokeUrl;
    }
    if (!this.issuer) {
      return undefined;
    }
    const metadata = await this.discoverMetadata();
    return metadata.revocation_endpoint;
  }

  private discoverMetadata(): Promise<AuthorizationServerMetadata> {
    if (!this.issuer) {
      return Promise.resolve({});
    }
    if (!this.metadataPromise) {
      this.metadataPromise = this.fetchMetadata().catch((error) => {
        this.metadataPromise = undefined;
        throw error;
      });
    }
    return this.metadataPromise;
  }

  private async fetchMetadata(): Promise<AuthorizationServerMetadata> {
    const metadataUrl = `${this.issuer}/.well-known/oauth-authorization-server`;
    const res = await this.fetchImpl(metadataUrl, { headers: { Accept: 'application/json' } });
    const body = (await res.json().catch(() => undefined)) as AuthorizationServerMetadata | undefined;
    if (!res.ok || !body) {
      throw new OauthTokenRequestError(
        `Failed to discover authorization server metadata from ${metadataUrl} (HTTP ${res.status}).`,
        res.status,
        undefined,
        body,
      );
    }
    return body;
  }
}

/**
 * Convenience factory: returns a `tokenProvider` backed by an
 * `OauthDelegatedSession` that you have already logged in / restored.
 */
export function createDelegatedTokenProvider(session: OauthDelegatedSession): BearerTokenProvider {
  return session.tokenProvider();
}

function toTokenSet(
  body: OauthTokenResponse,
  previous?: OauthDelegatedTokenSet,
): OauthDelegatedTokenSet {
  const expiresInMs = (body.expires_in ?? 600) * 1000;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? previous?.refreshToken,
    expiresAt: Date.now() + expiresInMs,
    scope: body.scope ?? previous?.scope,
    tokenType: body.token_type || 'Bearer',
  };
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

function sha256Base64Url(value: string): string {
  return createHash('sha256').update(value, 'ascii').digest('base64url');
}

async function listenForLoopbackCode(options: {
  redirectPath: string;
  state: string;
  onReady: (redirectUri: string) => Promise<string>;
  openBrowser: boolean;
}): Promise<{ redirectUri: string; code: string }> {
  return new Promise((resolve, reject) => {
    let redirectUri = '';
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        if (url.pathname !== options.redirectPath) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(
          '<!doctype html><html><body><h3>You can close this tab and return to the terminal.</h3></body></html>',
        );
        server.close();
        if (url.searchParams.get('state') !== options.state) {
          reject(new Error('OAuth state mismatch in the callback.'));
          return;
        }
        if (url.searchParams.get('error')) {
          reject(
            new Error(
              `Authorization error: ${url.searchParams.get('error')}${
                url.searchParams.get('error_description')
                  ? ` (${url.searchParams.get('error_description')})`
                  : ''
              }`,
            ),
          );
          return;
        }
        const code = url.searchParams.get('code');
        if (!code) {
          reject(new Error('Authorization callback did not include a code.'));
          return;
        }
        resolve({ redirectUri, code });
      } catch (error) {
        reject(error);
      }
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to bind loopback listener.'));
        return;
      }
      redirectUri = `http://127.0.0.1:${address.port}${options.redirectPath}`;
      void options
        .onReady(redirectUri)
        .then((authorizeUrl) => {
          console.error('\nOpen this URL in a browser, sign in, and approve:\n');
          console.error(`  ${authorizeUrl}\n`);
          if (options.openBrowser && process.platform === 'darwin') {
            spawn('open', [authorizeUrl], { stdio: 'ignore', detached: true }).unref();
          } else if (options.openBrowser && process.platform === 'win32') {
            spawn('cmd', ['/c', 'start', '', authorizeUrl], { stdio: 'ignore', detached: true }).unref();
          } else if (options.openBrowser && process.platform === 'linux') {
            spawn('xdg-open', [authorizeUrl], { stdio: 'ignore', detached: true }).unref();
          }
          console.error(`Waiting for the callback on ${redirectUri} ...`);
        })
        .catch(reject);
    });
  });
}
