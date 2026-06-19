import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  agreementsApiPaths,
  createAgreementDocumentId,
  computeDefaultDeadlineSeconds,
  deployAgreementWithPermit,
  joinUrl,
  submitAgreementInputWithPermit,
  type ApiClient,
  type AgreementsApiEnvironment,
  type DirectParticipantRecord,
  type PermitSignature,
} from '@shodai-network/agreements-api-client';
import type { Address } from 'viem';

import { getToolDefinition } from './manifest.js';
import {
  environmentInputSchema,
  errorResult,
  jsonResult,
  resolveToolEnvironment,
  run,
  type ClientResolver,
  type ToolRegistrationOptions,
} from './tools.js';
import {
  createChainPublicClient,
  createEnvSignerWalletClient,
  getEnvSignerAccount,
  prepareDeployTypedData,
  prepareInputTypedData,
} from './signing.js';

const PLAYGROUND_URL = 'https://developers.shodai.network/api-playground';
const PUBLIC_API_BASE_URL_ENV = 'AGREEMENTS_API_PUBLIC_BASE_URL';

export type WriteToolOptions = {
  /**
   * Permit signing with `AGREEMENTS_SIGNER_PRIVATE_KEY` from the environment.
   * Enabled only for local stdio use; hosted multi-tenant mode must keep this off.
   */
  allowEnvSigner: boolean;
} & ToolRegistrationOptions;

const agreementJsonSchema = z
  .record(z.unknown())
  .describe(
    'Complete authored agreement JSON document with metadata, variables, content, and execution sections.',
  );

const participantSchema = z.object({
  variableKey: z.string().describe('Key of the participant variable in the agreement JSON.'),
  walletAddress: z.string().describe('EVM wallet address (0x...) for this participant.'),
  email: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

const permitFields = {
  signer: z.string().optional().describe('Wallet address (0x...) that signed the permit.'),
  deadline: z
    .number()
    .int()
    .optional()
    .describe('Permit deadline in unix seconds. Must match the signed payload.'),
  signatureV: z.number().int().optional().describe('Permit signature v component (27 or 28).'),
  signatureR: z.string().optional().describe('Permit signature r component (0x... 32 bytes).'),
  signatureS: z.string().optional().describe('Permit signature s component (0x... 32 bytes).'),
};

type PermitArgs = {
  environment?: AgreementsApiEnvironment;
  signer?: string;
  deadline?: number;
  signatureV?: number;
  signatureR?: string;
  signatureS?: string;
};

type DeployPreflightArgs = {
  environment?: AgreementsApiEnvironment;
  agreement: Record<string, unknown>;
  chainId?: number;
  initValues?: Record<string, unknown>;
  participants?: DirectParticipantRecord[];
  observers?: string[];
};

type DeployDocumentArgs = {
  docUri?: string;
  documentId?: string;
};

async function preflightDeployPayload(client: ApiClient, args: DeployPreflightArgs) {
  const validation = await client.validateDeployment({
    agreement: args.agreement,
    chainId: args.chainId,
    initValues: args.initValues,
    participants: args.participants,
    observers: args.observers,
  });

  return {
    normalizedInitValues: validation.variables,
    normalizedParticipants: validation.participants,
    normalizedObservers: validation.observers,
    preflightWarnings: validation.warnings,
  };
}

function extractPermit(args: PermitArgs):
  | { signer: string; deadline: number; signature: PermitSignature }
  | undefined {
  if (
    args.signer &&
    args.deadline !== undefined &&
    args.signatureV !== undefined &&
    args.signatureR &&
    args.signatureS
  ) {
    return {
      signer: args.signer,
      deadline: args.deadline,
      signature: { v: args.signatureV, r: args.signatureR, s: args.signatureS },
    };
  }
  return undefined;
}

function missingPermitError(prepareTool: string): ReturnType<typeof errorResult> {
  return errorResult(
    new Error(
      `No permit provided and no local signer configured. Either (a) call ${prepareTool} to get the EIP-712 payload, sign it with the participant wallet (e.g. viem signTypedData or the playground at ${PLAYGROUND_URL}), then retry with signer/deadline/signatureV/signatureR/signatureS; or (b) in local stdio mode, set AGREEMENTS_SIGNER_PRIVATE_KEY in the server environment (dev/testnet only).`,
    ),
  );
}

function buildHostedDocumentUri(client: ApiClient, documentId: string): string {
  const publicBaseUrl = process.env[PUBLIC_API_BASE_URL_ENV]?.trim() || client.getBaseUrl();
  return joinUrl(publicBaseUrl, agreementsApiPaths.agreementDocument(documentId));
}

function resolveDeployDocumentLink(
  client: ApiClient,
  args: DeployDocumentArgs,
  options: { generateIfMissing: boolean },
): { docUri?: string; documentId?: string } {
  const docUri = args.docUri?.trim() || undefined;
  const documentId = args.documentId?.trim() || (options.generateIfMissing && !docUri ? createAgreementDocumentId() : undefined);
  if (docUri) {
    return { docUri, documentId };
  }
  if (documentId) {
    return { docUri: buildHostedDocumentUri(client, documentId), documentId };
  }
  return {};
}

function environmentNextStepPrefix(environment: AgreementsApiEnvironment | undefined): string {
  return environment ? `the same environment: "${environment}", ` : '';
}

export function deploymentPermitNextStep(environment?: AgreementsApiEnvironment): string {
  return `Sign typedData with the signer wallet (eth_signTypedData_v4), split the 65-byte signature into v/r/s, then call deploy_agreement with ${environmentNextStepPrefix(environment)}the same agreement, chainId, normalizedInitValues as initValues, normalizedParticipants as participants, normalizedObservers as observers, docUri, documentId, plus signer, deadline, signatureV, signatureR, signatureS.`;
}

export function inputPermitNextStep(environment?: AgreementsApiEnvironment): string {
  return `Sign typedData with the signer wallet (eth_signTypedData_v4), split the 65-byte signature into v/r/s, then call submit_input with ${environmentNextStepPrefix(environment)}the same agreementId, inputId, values, plus signer, deadline, signatureV, signatureR, signatureS.`;
}

export function registerWriteTools(
  server: McpServer,
  getClient: ClientResolver,
  options: WriteToolOptions,
): void {
  const deployDefinition = getToolDefinition('deploy_agreement');
  server.registerTool(
    deployDefinition.name,
    {
      title: deployDefinition.title,
      description: deployDefinition.description,
      annotations: deployDefinition.annotations,
      inputSchema: {
        ...environmentInputSchema(options),
        agreement: agreementJsonSchema,
        displayName: z.string().min(1).describe('Human-readable name for the deployed agreement record.'),
        chainId: z.number().int().optional().describe('Target EVM chain ID (e.g. 59141 for Linea Sepolia).'),
        initValues: z
          .record(z.unknown())
          .optional()
          .describe('Deployment-time values for variables referenced by execution.initialize.data.'),
        participants: z.array(participantSchema).optional().describe('Wallet mappings for participant variables.'),
        observers: z.array(z.string()).optional().describe('Observer email addresses.'),
        docUri: z.string().optional().describe('Optional document URI recorded on-chain with the agreement.'),
        documentId: z
          .string()
          .optional()
          .describe('Optional hosted document ID paired with docUri for GET /v0/agreements/documents/{documentId}.'),
        ...permitFields,
      },
    },
    async (args) => {
      let environment: AgreementsApiEnvironment | undefined;
      try {
        environment = resolveToolEnvironment(args, options);
      } catch (error) {
        return errorResult(error);
      }
      const permit = extractPermit(args);
      if (permit) {
        return run(async () => {
          const client = getClient(environment);
          const preflight = await preflightDeployPayload(client, args);
          const documentLink = resolveDeployDocumentLink(client, args, { generateIfMissing: false });
          return client.deployWithPermit({
            agreement: args.agreement,
            displayName: args.displayName,
            chainId: args.chainId,
            initValues: preflight.normalizedInitValues,
            participants: preflight.normalizedParticipants,
            observers: preflight.normalizedObservers,
            docUri: documentLink.docUri,
            documentId: documentLink.documentId,
            ...permit,
          });
        });
      }

      if (options.allowEnvSigner && getEnvSignerAccount()) {
        if (args.chainId === undefined) {
          return errorResult(new Error('chainId is required when signing with the local environment key.'));
        }
        const chainId = args.chainId;
        return run(async () => {
          const client = getClient(environment);
          const preflight = await preflightDeployPayload(client, args);
          const documentLink = resolveDeployDocumentLink(client, args, { generateIfMissing: true });
          const walletClient = createEnvSignerWalletClient(chainId)!;
          const publicClient = createChainPublicClient(chainId);
          return deployAgreementWithPermit({
            client,
            walletClient,
            publicClient,
            chainId,
            agreement: args.agreement as never,
            displayName: args.displayName,
            initValues: preflight.normalizedInitValues as never,
            participants: preflight.normalizedParticipants,
            observers: preflight.normalizedObservers,
            docUri: documentLink.docUri,
            documentId: documentLink.documentId,
          });
        });
      }

      return missingPermitError('prepare_deployment_typed_data');
    },
  );

  const submitDefinition = getToolDefinition('submit_input');
  server.registerTool(
    submitDefinition.name,
    {
      title: submitDefinition.title,
      description: submitDefinition.description,
      annotations: submitDefinition.annotations,
      inputSchema: {
        ...environmentInputSchema(options),
        agreementId: z.string().min(1).describe('Agreement record ID of a deployed agreement.'),
        inputId: z.string().min(1).describe('Input ID defined by the agreement JSON (execution.inputs).'),
        values: z.record(z.unknown()).describe('Values matching the input schema defined by the agreement JSON.'),
        ...permitFields,
      },
    },
    async (args) => {
      let environment: AgreementsApiEnvironment | undefined;
      try {
        environment = resolveToolEnvironment(args, options);
      } catch (error) {
        return errorResult(error);
      }
      const permit = extractPermit(args);
      if (permit) {
        return run(() =>
          getClient(environment).submitAgreementInput(args.agreementId, {
            inputId: args.inputId,
            values: args.values,
            ...permit,
          }),
        );
      }

      if (options.allowEnvSigner && getEnvSignerAccount()) {
        return run(async () => {
          const client = getClient(environment);
          const record = await client.getAgreement(args.agreementId);
          if (!record.address || !record.json) {
            throw new Error('Agreement is not deployed (missing on-chain address or agreement JSON).');
          }
          const walletClient = createEnvSignerWalletClient(record.chainId)!;
          const publicClient = createChainPublicClient(record.chainId);
          return submitAgreementInputWithPermit({
            client,
            agreementId: args.agreementId,
            walletClient,
            publicClient,
            chainId: record.chainId,
            agreementContractAddress: record.address as Address,
            agreement: record.json as never,
            inputId: args.inputId,
            values: args.values,
          });
        });
      }

      return missingPermitError('prepare_input_typed_data');
    },
  );

  server.registerTool(
    'prepare_deployment_typed_data',
    {
      title: 'Prepare deployment permit typed data',
      description:
        'Builds the exact EIP-712 payload that must be signed to authorize deployment of the given agreement JSON. Sign the returned typedData with the deploying wallet (eth_signTypedData_v4 / viem signTypedData), then call deploy_agreement with signer, deadline, and the signature components. No transaction is sent and nothing is stored. Reads the signer nonce from the target chain.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: {
        ...environmentInputSchema(options),
        agreement: agreementJsonSchema,
        chainId: z.number().int().describe('Target EVM chain ID (e.g. 59141 for Linea Sepolia).'),
        signerAddress: z.string().describe('Wallet address (0x...) that will sign and own the deployment.'),
        deadline: z
          .number()
          .int()
          .optional()
          .describe('Permit deadline in unix seconds; defaults to one hour from now.'),
        initValues: z.record(z.unknown()).optional().describe('Deployment-time init values (must match the later deploy_agreement call).'),
        participants: z.array(participantSchema).optional().describe('Wallet mappings for participant variables.'),
        observers: z.array(z.string()).optional().describe('Observer email addresses.'),
        docUri: z.string().optional().describe('Document URI (must match the later deploy_agreement call).'),
        documentId: z
          .string()
          .optional()
          .describe('Hosted document ID. If omitted with docUri, no hosted document ID is stored; if both are omitted, the server generates both values.'),
      },
    },
    async (args) =>
      run(async () => {
        const environment = resolveToolEnvironment(args, options);
        const client = getClient(environment);
        const preflight = await preflightDeployPayload(client, args);
        const documentLink = resolveDeployDocumentLink(client, args, { generateIfMissing: true });
        const deadline = args.deadline ?? computeDefaultDeadlineSeconds();
        const prepared = await prepareDeployTypedData({
          agreement: args.agreement,
          chainId: args.chainId,
          signerAddress: args.signerAddress as Address,
          deadline,
          initValues: preflight.normalizedInitValues,
          docUri: documentLink.docUri,
        });
        return {
          ...prepared,
          ...documentLink,
          ...preflight,
          nextStep: deploymentPermitNextStep(environment),
          playgroundUrl: PLAYGROUND_URL,
        };
      }),
  );

  server.registerTool(
    'prepare_input_typed_data',
    {
      title: 'Prepare input permit typed data',
      description:
        'Builds the exact EIP-712 payload that must be signed to authorize submitting an input to a deployed agreement. Sign the returned typedData with a wallet allowed by the input definition, then call submit_input with signer, deadline, and the signature components. No transaction is sent and nothing is stored. Reads the agreement record and signer nonce.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: {
        ...environmentInputSchema(options),
        agreementId: z.string().min(1).describe('Agreement record ID of a deployed agreement.'),
        inputId: z.string().min(1).describe('Input ID defined by the agreement JSON (execution.inputs).'),
        values: z.record(z.unknown()).describe('Values matching the input schema (must match the later submit_input call).'),
        signerAddress: z.string().describe('Wallet address (0x...) that will sign the input permit.'),
        deadline: z
          .number()
          .int()
          .optional()
          .describe('Permit deadline in unix seconds; defaults to one hour from now.'),
      },
    },
    async (args) =>
      run(async () => {
        const environment = resolveToolEnvironment(args, options);
        const record = await getClient(environment).getAgreement(args.agreementId);
        if (!record.address || !record.json) {
          throw new Error('Agreement is not deployed (missing on-chain address or agreement JSON).');
        }
        const deadline = args.deadline ?? computeDefaultDeadlineSeconds();
        const prepared = await prepareInputTypedData({
          agreement: record.json,
          agreementContractAddress: record.address as Address,
          chainId: record.chainId,
          inputId: args.inputId,
          values: args.values,
          signerAddress: args.signerAddress as Address,
          deadline,
        });
        return {
          ...prepared,
          nextStep: inputPermitNextStep(environment),
          playgroundUrl: PLAYGROUND_URL,
        };
      }),
  );
}

export { jsonResult };
