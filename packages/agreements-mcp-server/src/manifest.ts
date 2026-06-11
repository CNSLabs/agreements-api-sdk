/**
 * Static manifest of the MCP tool surface.
 *
 * Each tool wraps exactly one public Agreements API route. This manifest is the
 * single source of truth consumed by tool registration and by the gateway-side
 * CI sync test that asserts the MCP surface stays aligned with `/v0/*` routes.
 */

export type AgreementsMcpToolScope =
  | 'agreements.read'
  | 'agreements.write'
  | null;

export type AgreementsMcpToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export type AgreementsMcpToolDefinition = {
  /** MCP tool name (verb-noun). */
  name: string;
  /** Human-readable title shown by MCP clients. */
  title: string;
  /** Tool description shown to agents. Seeded from the OpenAPI operation description. */
  description: string;
  /** HTTP method of the wrapped route. */
  method: 'GET' | 'POST';
  /** Public route template under the gateway, e.g. `/v0/agreements/{id}/state`. */
  path: string;
  /** OpenAPI operationId of the wrapped route. */
  operationId: string;
  /** Gateway scope enforced for the wrapped route (null for unauthenticated routes). */
  scope: AgreementsMcpToolScope;
  annotations: AgreementsMcpToolAnnotations;
};

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} satisfies AgreementsMcpToolAnnotations;

export const AGREEMENTS_MCP_TOOLS: readonly AgreementsMcpToolDefinition[] = [
  {
    name: 'list_agreements',
    title: 'List agreements',
    description:
      'Lists agreement summaries visible to the current API key. Supports pagination (cursor + limit), filtering by chain and state, and sorting. Returns summaries only; use get_agreement for the full record.',
    method: 'GET',
    path: '/v0/agreements',
    operationId: 'listAgreements',
    scope: 'agreements.read',
    annotations: READ_ONLY,
  },
  {
    name: 'get_agreement',
    title: 'Get agreement',
    description:
      'Returns a single agreement record, including the full authored agreement JSON and hosted record context (participants, observers, owner, deployment address).',
    method: 'GET',
    path: '/v0/agreements/{id}',
    operationId: 'getAgreement',
    scope: 'agreements.read',
    annotations: READ_ONLY,
  },
  {
    name: 'get_agreement_state',
    title: 'Get agreement state',
    description:
      'Returns the current state of an agreement. For deployed agreements, interpret the state against the states defined in the authored agreement lifecycle (execution.states). Use this to poll for transitions after submitting an input.',
    method: 'GET',
    path: '/v0/agreements/{id}/state',
    operationId: 'getAgreementState',
    scope: 'agreements.read',
    annotations: READ_ONLY,
  },
  {
    name: 'get_input_history',
    title: 'Get input history',
    description:
      'Returns recorded input submissions for an agreement, with pagination and filtering. Use this to inspect which events have been submitted and whether each is PENDING, MINED, or FAILED.',
    method: 'GET',
    path: '/v0/agreements/{id}/inputs',
    operationId: 'listAgreementInputs',
    scope: 'agreements.read',
    annotations: READ_ONLY,
  },
  {
    name: 'validate_agreement',
    title: 'Validate agreement structure',
    description:
      'Checks only the authored agreement JSON document and returns participant variable keys, input IDs, state IDs, and warnings. This does not validate deployment values, participant wallet addresses, signer, or permit data — use preflight_deployment for that. Iterate on the agreement JSON until this returns no blocking warnings. Requires the agreements.write scope.',
    method: 'POST',
    path: '/v0/agreements/validate-template',
    operationId: 'validateAgreementTemplate',
    scope: 'agreements.write',
    annotations: READ_ONLY,
  },
  {
    name: 'deploy_agreement',
    title: 'Deploy agreement',
    description:
      'Deploys authored agreement JSON using an EIP-712 permit; the API submits the on-chain transaction and returns the deployed agreement record. Provide a pre-signed permit (signer, deadline, signature), or call prepare_deployment_typed_data first to obtain the payload to sign. Always run preflight_deployment before deploying. Requires the agreements.write scope.',
    method: 'POST',
    path: '/v0/agreements/deploy-with-permit',
    operationId: 'deployAgreementWithPermit',
    scope: 'agreements.write',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'submit_input',
    title: 'Submit input with permit',
    description:
      'Submits a signed input to a deployed agreement, advancing its on-chain lifecycle. The input ID and values must match an input defined by the agreement JSON, and the signer must be allowed by that input. Provide a pre-signed permit (signer, deadline, signature), or call prepare_input_typed_data first. Requires the agreements.write scope.',
    method: 'POST',
    path: '/v0/agreements/{id}/input',
    operationId: 'submitAgreementInputWithPermit',
    scope: 'agreements.write',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'preflight_deployment',
    title: 'Preflight deployment request',
    description:
      'Checks whether authored agreement JSON plus target chain, deployment values, participant wallet mappings, and observer context are ready for deployment. This does not deploy the agreement and does not require a signature. Always run this before signing a deploy permit. Requires the agreements.write scope.',
    method: 'POST',
    path: '/v0/agreements/validate',
    operationId: 'validateAgreementDeployment',
    scope: 'agreements.write',
    annotations: READ_ONLY,
  },
] as const;

export function getToolDefinition(name: string): AgreementsMcpToolDefinition {
  const definition = AGREEMENTS_MCP_TOOLS.find((tool) => tool.name === name);
  if (!definition) {
    throw new Error(`Unknown Agreements MCP tool: ${name}`);
  }
  return definition;
}
