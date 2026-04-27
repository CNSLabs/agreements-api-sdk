import type { AgreementsApiEnvironment } from './types.js';

/** API major version segment (e.g. `v0`). */
export const AGREEMENTS_API_MAJOR_VERSION = 'v0';

/** Path prefix for all Agreements API routes, e.g. `/partner-api/v0`. */
export const AGREEMENTS_API_BASE_PATH = `/partner-api/${AGREEMENTS_API_MAJOR_VERSION}`;

/** Named Agreements API environments exposed to external consumers. */
export const AGREEMENTS_API_ENVIRONMENT_BASE_URLS: Record<AgreementsApiEnvironment, string> = {
  testnet: 'https://testnet.shodai.network',
  production: 'https://app.shodai.network',
};

/** Default environment for SDK examples and browser tooling. */
export const DEFAULT_AGREEMENTS_API_ENVIRONMENT: AgreementsApiEnvironment = 'testnet';

/** Resolve the public gateway origin for a named Agreements API environment. */
export function resolveAgreementsApiBaseUrl(environment: AgreementsApiEnvironment): string {
  return AGREEMENTS_API_ENVIRONMENT_BASE_URLS[environment];
}
