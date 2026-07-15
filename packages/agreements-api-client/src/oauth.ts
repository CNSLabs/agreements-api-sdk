/**
 * OAuth 2.1 client-credentials support for agent clients.
 *
 * This module signs `private_key_jwt` client assertions (RFC 7523) with
 * `node:crypto` and is therefore **Node-only**. It is intentionally not
 * re-exported from the package root so browser bundles stay free of Node
 * built-ins; import it via `@shodai-network/agreements-api-client/oauth`.
 *
 * Browser or custom setups should instead pass a `tokenProvider` to
 * `ApiClient` that obtains tokens from a backend holding the private key.
 */

import { createPrivateKey, randomUUID, sign, type JsonWebKey as NodeJsonWebKey } from 'node:crypto';

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
   * Authorization server issuer URL, e.g. `https://dev.example.com/auth-api`.
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
