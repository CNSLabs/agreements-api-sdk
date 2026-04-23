/**
 * Types aligned with the public partner API OpenAPI contract.
 * Agreement JSON follows `@cns-labs/agreements-protocol-evm` `AgreementJson` at runtime.
 */

export type PermitSignature = {
  v: number;
  r: string;
  s: string;
};

export type PartnerDirectParticipantRecord = {
  variableKey: string;
  walletAddress: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  walletBinding?: 'verified_via_auth' | 'partner_asserted';
};

export type AgreementRecord = {
  id: string;
  address?: string;
  chainId: number;
  status: 'Draft' | 'Deployed';
  lastInputId?: string;
  lastInputAt?: string;
  json?: Record<string, unknown>;
  state?: string;
  variables?: Record<string, unknown>;
  updatedAt: string;
  createdAt: string;
  displayName: string;
  owner?: string;
  docUri?: string;
  contributors?: string[];
  participants?: ParticipantRecord[];
  observers?: string[];
  onChain?: Record<string, unknown>;
};

export type ParticipantRecord = {
  variableKey: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  walletAddress?: string;
  walletBinding?: 'verified_via_auth' | 'partner_asserted';
  status?: 'pending' | 'invited' | 'accepted';
};

export type HealthResponse = {
  status: string;
  service: string;
  timestamp: string;
};

export type ErrorResponse = {
  statusCode: number;
  message: string | string[];
  error?: string;
};

export type ValidateDirectAgreementRequest = {
  agreement: Record<string, unknown>;
  initValues?: Record<string, unknown>;
  participants?: PartnerDirectParticipantRecord[];
  observers?: string[];
};

export type ValidateDirectAgreementResponse = {
  templateId: string | null;
  participantVariableKeys: string[];
  participants: PartnerDirectParticipantRecord[];
  observers: string[];
  variables: Record<string, unknown>;
  contributors: string[];
  warnings: string[];
};

export type ValidateDirectAgreementTemplateResponse = {
  templateId: string | null;
  participantVariableKeys: string[];
  inputIds: string[];
  stateIds: string[];
  warnings: string[];
};

export type DirectDeployAgreementWithPermitRequest = {
  agreement: Record<string, unknown>;
  displayName: string;
  docUri?: string;
  initValues?: Record<string, unknown>;
  participants?: PartnerDirectParticipantRecord[];
  observers?: string[];
  signer: string;
  deadline: number;
  signature: PermitSignature;
};

export type AgreementStateResponse = {
  status: 'Draft' | 'Deployed';
  state: string | null;
};

export type AgreementInputRecord = {
  agreementAddress: string;
  chainId: number;
  inputId: string;
  userId?: string;
  blockNumber?: number;
  payload: string;
  values: Record<string, unknown>;
  txHash: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  status: 'PENDING' | 'MINED' | 'FAILED';
};

export type ProcessInputRequest = {
  inputId: string;
  values: Record<string, unknown>;
  signer: string;
  deadline: number;
  signature: PermitSignature;
};

export type PartnerApiClientConfig = {
  /** Base URL of the auth-api host (no trailing slash), e.g. `https://api.example.com`. */
  baseUrl: string;
  /** `X-API-Key` value for the partner principal. */
  apiKey?: string;
  /** Optional header factory (e.g. telemetry). Merged after defaults. */
  headers?: Record<string, string> | (() => Record<string, string> | undefined);
  /** Override `fetch` (defaults to global `fetch`). */
  fetch?: typeof fetch;
};
