import type { PartnerApiEnvironment } from './types.js';

/** Partner API major version segment (e.g. `v0`). */
export const PARTNER_API_MAJOR_VERSION = 'v0';

/** Path prefix for all partner routes, e.g. `/partner-api/v0`. */
export const PARTNER_API_BASE_PATH = `/partner-api/${PARTNER_API_MAJOR_VERSION}`;

/** Named partner API environments exposed to external consumers. */
export const PARTNER_API_ENVIRONMENT_BASE_URLS: Record<PartnerApiEnvironment, string> = {
  testnet: 'https://testnet.shodai.network',
  production: 'https://app.shodai.network',
};

/** Default environment for SDK examples and browser tooling. */
export const DEFAULT_PARTNER_API_ENVIRONMENT: PartnerApiEnvironment = 'testnet';

/** Resolve the public gateway origin for a named partner API environment. */
export function resolvePartnerApiBaseUrl(environment: PartnerApiEnvironment): string {
  return PARTNER_API_ENVIRONMENT_BASE_URLS[environment];
}
