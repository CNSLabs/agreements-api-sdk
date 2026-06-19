import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  AgreementsApiError,
  type AgreementListParams,
  type AgreementInputListParams,
  type ApiClient,
  type AgreementsApiEnvironment,
  type SortFilter,
  type AgreementListSortField,
} from '@shodai-network/agreements-api-client';

import { getToolDefinition } from './manifest.js';

/** Resolves the API client for the selected environment (per-request in HTTP mode, fixed in stdio mode). */
export type ClientResolver = (environment?: AgreementsApiEnvironment) => ApiClient;

export type ToolEnvironmentMode = 'required' | 'fixed';

export type ToolRegistrationOptions = {
  environmentMode: ToolEnvironmentMode;
};

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function jsonResult(value: unknown): ToolResult {
  // BigInt-safe: EIP-712 typed-data payloads contain bigint nonces/deadlines.
  const text = JSON.stringify(
    value,
    (_key, candidate) => (typeof candidate === 'bigint' ? candidate.toString() : candidate),
    2,
  );
  return {
    content: [{ type: 'text', text }],
  };
}

function errorResult(error: unknown): ToolResult {
  let message: string;
  if (error instanceof AgreementsApiError) {
    const hint = apiErrorHint(error.status);
    message = `Agreements API error (HTTP ${error.status}): ${error.message}${hint ? `\n${hint}` : ''}`;
  } else {
    message = error instanceof Error ? error.message : String(error);
  }
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}

function apiErrorHint(status: number): string | undefined {
  switch (status) {
    case 401:
      return 'The API key is missing, invalid, or belongs to a different environment than the selected tool environment. Use a testnet key with environment: "testnet" and a production key with environment: "production".';
    case 402:
      return 'This scope requires a paid entitlement for the current API principal.';
    case 403:
      return 'The API principal lacks the entitlement for this scope. Read tools need agreements.read; validation and write tools need agreements.write.';
    case 429:
      return 'Rate limited. Back off and retry.';
    default:
      return undefined;
  }
}

async function run(handler: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return jsonResult(await handler());
  } catch (error) {
    return errorResult(error);
  }
}

const agreementIdSchema = z
  .string()
  .min(1)
  .describe('Agreement record ID, as returned by list_agreements (not the on-chain address).');

const documentIdSchema = z
  .string()
  .min(1)
  .describe('Hosted agreement document ID, as returned by list_agreements/get_agreement or prepare_deployment_typed_data.');

const agreementJsonSchema = z
  .record(z.unknown())
  .describe(
    'Complete authored agreement JSON document with metadata, variables, content, and execution sections. See the simple/complex example resources for the authoritative shape.',
  );

const participantSchema = z
  .object({
    variableKey: z
      .string()
      .describe('Key of the participant variable in the agreement JSON (a variable with subtype "participant").'),
    walletAddress: z.string().describe('EVM wallet address (0x...) for this participant.'),
    email: z.string().optional().describe('Optional contact email for this participant.'),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  })
  .describe('Mapping of one participant variable to a wallet.');

const environmentSchema = z
  .enum(['testnet', 'production'])
  .describe('Agreements API environment for this tool call. API keys only work in the environment where they were created.');

export function environmentInputSchema(options: ToolRegistrationOptions): Record<string, z.ZodTypeAny> {
  return options.environmentMode === 'required' ? { environment: environmentSchema } : {};
}

export function resolveToolEnvironment(
  args: unknown,
  options: ToolRegistrationOptions,
): AgreementsApiEnvironment | undefined {
  if (options.environmentMode === 'fixed') {
    return undefined;
  }
  const environment =
    typeof args === 'object' && args !== null
      ? (args as { environment?: unknown }).environment
      : undefined;
  if (environment !== 'testnet' && environment !== 'production') {
    throw new Error('environment is required and must be either "testnet" or "production".');
  }
  return environment;
}

function buildSort(
  sortBy: AgreementListSortField | undefined,
  sortDirection: 'asc' | 'desc' | undefined,
): SortFilter<AgreementListSortField> | undefined {
  if (!sortBy) return undefined;
  return { [sortBy]: sortDirection ?? 'desc' } as unknown as SortFilter<AgreementListSortField>;
}

function buildDateFilter(after: string | undefined, before: string | undefined) {
  if (!after && !before) return undefined;
  return {
    ...(after ? { gte: after } : {}),
    ...(before ? { lte: before } : {}),
  };
}

/** Registers the read + validation tool surface defined in `AGREEMENTS_MCP_TOOLS`. */
export function registerReadTools(
  server: McpServer,
  getClient: ClientResolver,
  options: ToolRegistrationOptions,
): void {
  const listAgreements = getToolDefinition('list_agreements');
  server.registerTool(
    listAgreements.name,
    {
      title: listAgreements.title,
      description: listAgreements.description,
      annotations: listAgreements.annotations,
      inputSchema: {
        ...environmentInputSchema(options),
        chainId: z.number().int().optional().describe('Filter by EVM chain ID (e.g. 59141 for Linea Sepolia).'),
        state: z.string().optional().describe('Filter by current lifecycle state ID.'),
        createdAfter: z.string().optional().describe('ISO 8601 timestamp; only agreements created at or after this time.'),
        createdBefore: z.string().optional().describe('ISO 8601 timestamp; only agreements created at or before this time.'),
        updatedAfter: z.string().optional().describe('ISO 8601 timestamp; only agreements updated at or after this time.'),
        updatedBefore: z.string().optional().describe('ISO 8601 timestamp; only agreements updated at or before this time.'),
        sortBy: z.enum(['createdAt', 'updatedAt', 'displayName']).optional().describe('Sort field (single field only).'),
        sortDirection: z.enum(['asc', 'desc']).optional().describe('Sort direction; defaults to desc.'),
        limit: z.number().int().min(1).max(100).optional().describe('Page size (max 100).'),
        cursor: z.string().optional().describe('Opaque pagination cursor from a previous response (pageInfo.nextCursor).'),
      },
    },
    async (args) =>
      run(() => {
        const environment = resolveToolEnvironment(args, options);
        const params: AgreementListParams = {
          chainId: args.chainId,
          state: args.state,
          createdAt: buildDateFilter(args.createdAfter, args.createdBefore),
          updatedAt: buildDateFilter(args.updatedAfter, args.updatedBefore),
          sort: buildSort(args.sortBy, args.sortDirection),
          limit: args.limit,
          cursor: args.cursor,
        };
        return getClient(environment).listAgreements(params);
      }),
  );

  const getAgreement = getToolDefinition('get_agreement');
  server.registerTool(
    getAgreement.name,
    {
      title: getAgreement.title,
      description: getAgreement.description,
      annotations: getAgreement.annotations,
      inputSchema: {
        ...environmentInputSchema(options),
        agreementId: agreementIdSchema,
      },
    },
    async (args) => run(() => getClient(resolveToolEnvironment(args, options)).getAgreement(args.agreementId)),
  );

  const getAgreementDocument = getToolDefinition('get_agreement_document');
  server.registerTool(
    getAgreementDocument.name,
    {
      title: getAgreementDocument.title,
      description: getAgreementDocument.description,
      annotations: getAgreementDocument.annotations,
      inputSchema: {
        ...environmentInputSchema(options),
        documentId: documentIdSchema,
      },
    },
    async (args) => run(() => getClient(resolveToolEnvironment(args, options)).getAgreementDocument(args.documentId)),
  );

  const getAgreementState = getToolDefinition('get_agreement_state');
  server.registerTool(
    getAgreementState.name,
    {
      title: getAgreementState.title,
      description: getAgreementState.description,
      annotations: getAgreementState.annotations,
      inputSchema: {
        ...environmentInputSchema(options),
        agreementId: agreementIdSchema,
      },
    },
    async (args) => run(() => getClient(resolveToolEnvironment(args, options)).getAgreementState(args.agreementId)),
  );

  const getInputHistory = getToolDefinition('get_input_history');
  server.registerTool(
    getInputHistory.name,
    {
      title: getInputHistory.title,
      description: getInputHistory.description,
      annotations: getInputHistory.annotations,
      inputSchema: {
        ...environmentInputSchema(options),
        agreementId: agreementIdSchema,
        inputId: z.string().optional().describe('Filter by input ID as defined in the agreement JSON (execution.inputs).'),
        status: z.enum(['PENDING', 'MINED', 'FAILED']).optional().describe('Filter by submission status.'),
        limit: z.number().int().min(1).max(100).optional().describe('Page size (max 100).'),
        cursor: z.string().optional().describe('Opaque pagination cursor from a previous response (pageInfo.nextCursor).'),
      },
    },
    async (args) =>
      run(() => {
        const environment = resolveToolEnvironment(args, options);
        const params: AgreementInputListParams = {
          inputId: args.inputId,
          status: args.status,
          limit: args.limit,
          cursor: args.cursor,
        };
        return getClient(environment).listAgreementInputs(args.agreementId, params);
      }),
  );

  const validateAgreement = getToolDefinition('validate_agreement');
  server.registerTool(
    validateAgreement.name,
    {
      title: validateAgreement.title,
      description: validateAgreement.description,
      annotations: validateAgreement.annotations,
      inputSchema: {
        ...environmentInputSchema(options),
        agreement: agreementJsonSchema,
      },
    },
    async (args) => run(() => getClient(resolveToolEnvironment(args, options)).validateTemplate(args.agreement)),
  );

  const preflightDeployment = getToolDefinition('preflight_deployment');
  server.registerTool(
    preflightDeployment.name,
    {
      title: preflightDeployment.title,
      description: preflightDeployment.description,
      annotations: preflightDeployment.annotations,
      inputSchema: {
        ...environmentInputSchema(options),
        agreement: agreementJsonSchema,
        chainId: z.number().int().optional().describe('Target EVM chain ID for deployment.'),
        initValues: z
          .record(z.unknown())
          .optional()
          .describe('Deployment-time values for variables referenced by execution.initialize.data.'),
        participants: z.array(participantSchema).optional().describe('Wallet mappings for participant variables.'),
        observers: z.array(z.string()).optional().describe('Observer email addresses for the deployed agreement.'),
      },
    },
    async (args) =>
      run(() =>
        getClient(resolveToolEnvironment(args, options)).validateDeployment({
          agreement: args.agreement,
          chainId: args.chainId,
          initValues: args.initValues,
          participants: args.participants,
          observers: args.observers,
        }),
      ),
  );
}

export { jsonResult, errorResult, run };
