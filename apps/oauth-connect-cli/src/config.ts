export type CliConfig = {
  clientId: string;
  issuer: string;
  authorizationPageUrl?: string;
  apiBaseUrl: string;
  scope?: string;
};

/**
 * Defaults target a typical local Agreements stack (auth-api on :4003,
 * external-api on :4005). Point at any other deployment with env vars —
 * see README.
 */
export function resolveConfig(overrides: Partial<CliConfig> = {}): CliConfig {
  const issuer = (
    overrides.issuer ||
    process.env.OAUTH_ISSUER_URL ||
    process.env.AUTH_API_BASE_URL ||
    'http://localhost:4003/auth-api'
  ).replace(/\/+$/, '');

  const apiBaseUrl = (
    overrides.apiBaseUrl ||
    process.env.EXTERNAL_API_BASE_URL ||
    process.env.AGREEMENTS_API_BASE_URL ||
    'http://localhost:4005/api'
  ).replace(/\/+$/, '');

  const clientId = (overrides.clientId || process.env.OAUTH_CLIENT_ID || '').trim();
  const authorizationPageUrl =
    overrides.authorizationPageUrl ||
    process.env.OAUTH_AUTHORIZATION_PAGE_URL ||
    undefined;
  const scope = overrides.scope || process.env.OAUTH_SCOPES || process.env.OAUTH_SCOPE || undefined;

  return {
    clientId,
    issuer,
    apiBaseUrl,
    ...(authorizationPageUrl ? { authorizationPageUrl } : {}),
    ...(scope ? { scope } : {}),
  };
}
