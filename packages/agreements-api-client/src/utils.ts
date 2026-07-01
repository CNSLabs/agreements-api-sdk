import { API_BASE_PATH } from './constants.js';

/** Join base URL and path into a single URL string. */
export function joinUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.trim().replace(/\/+$/, '');
  const normalizedPath = path.trim().startsWith('/') ? path.trim() : `/${path.trim()}`;
  return `${normalizedBase}${normalizedPath}`;
}

/** Well-known Agreements API paths under {@link API_BASE_PATH}. */
export const agreementsApiPaths = {
  openapiJson: () => `${API_BASE_PATH}/openapi.json`,
  health: () => `${API_BASE_PATH}/health`,
  webhooks: () => `${API_BASE_PATH}/webhooks`,
  webhook: (id: string) => `${API_BASE_PATH}/webhooks/${encodeURIComponent(id)}`,
  webhookTest: (id: string) => `${API_BASE_PATH}/webhooks/${encodeURIComponent(id)}/test`,
  agreements: () => `${API_BASE_PATH}/agreements`,
  agreementsValidate: () => `${API_BASE_PATH}/agreements/validate`,
  agreementsValidateTemplate: () => `${API_BASE_PATH}/agreements/validate-template`,
  agreementsDeployWithPermit: () => `${API_BASE_PATH}/agreements/deploy-with-permit`,
  agreementDocument: (documentId: string) => `${API_BASE_PATH}/agreements/documents/${encodeURIComponent(documentId)}`,
  agreement: (id: string) => `${API_BASE_PATH}/agreements/${encodeURIComponent(id)}`,
  agreementState: (id: string) => `${API_BASE_PATH}/agreements/${encodeURIComponent(id)}/state`,
  agreementInputs: (id: string) => `${API_BASE_PATH}/agreements/${encodeURIComponent(id)}/inputs`,
  agreementInput: (id: string) => `${API_BASE_PATH}/agreements/${encodeURIComponent(id)}/input`,
} as const;

/** Read `execution.inputs` keys from a parsed agreement object (BYOT shape). */
export function getExecutionInputIds(agreementJson: Record<string, unknown> | null | undefined): string[] {
  if (!agreementJson || typeof agreementJson !== 'object') return [];
  const execution = agreementJson.execution;
  if (!execution || typeof execution !== 'object' || Array.isArray(execution)) return [];
  const inputs = (execution as Record<string, unknown>).inputs;
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) return [];
  return Object.keys(inputs);
}
