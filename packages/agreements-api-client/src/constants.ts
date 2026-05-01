import type { AgreementsApiEnvironment } from './types.js';

/** API major version segment (e.g. `v0`). */
export const API_MAJOR_VERSION = 'v0';

/** Path prefix for all Agreements API routes, e.g. `/api/v0`. */
export const API_BASE_PATH = `/api/${API_MAJOR_VERSION}`;

/** Named Agreements API environments exposed to external consumers. */
export const API_ENVIRONMENT_BASE_URLS: Record<AgreementsApiEnvironment, string> = {
  testnet: 'https://test-api.shodai.network',
  production: 'https://api.shodai.network',
};

/** Default environment for SDK examples and browser tooling. */
export const DEFAULT_API_ENVIRONMENT: AgreementsApiEnvironment = 'testnet';

/** Resolve the public gateway origin for a named Agreements API environment. */
export function resolveApiBaseUrl(environment: AgreementsApiEnvironment): string {
  return API_ENVIRONMENT_BASE_URLS[environment];
}
