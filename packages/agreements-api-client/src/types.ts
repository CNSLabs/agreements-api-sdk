/**
 * Types aligned with the public Agreements API OpenAPI contract.
 * Agreement JSON follows `@cns-labs/agreements-protocol-evm` `AgreementJson` at runtime.
 */

export type PermitSignature = {
  v: number;
  r: string;
  s: string;
};

export type DirectParticipantRecord = {
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

export type AgreementSummary = {
  id: string;
  address?: string;
  chainId: number;
  status: 'Draft' | 'Deployed';
  lastInputId?: string;
  lastInputAt?: string;
  state?: string;
  templateId?: string;
  updatedAt: string;
  createdAt: string;
  displayName: string;
  owner?: string;
  docUri?: string;
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

export type ApiResponse<T> = {
  data: T;
  meta: {
    apiVersion: string;
    requestId: string;
  };
};

export type PageInfo = {
  limit: number;
  nextCursor: string | null;
  totalCount?: number;
};

export type ListResponse<T> = ApiResponse<T[]> & {
  pageInfo: PageInfo;
};

export type ErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
};

export type DateFilter = {
  gt?: string;
  gte?: string;
  lt?: string;
  lte?: string;
};

export type SortDirection = 'asc' | 'desc';
export type AgreementListSortField = 'createdAt' | 'updatedAt' | 'displayName';
export type AgreementInputListSortField = 'createdAt' | 'updatedAt';
export type SortFilter<TField extends string> = {
  [Field in TField]: { [Key in Field]: SortDirection } & Partial<Record<Exclude<TField, Field>, never>>;
}[TField];

export type AgreementListParams = {
  chainId?: number;
  state?: string;
  createdAt?: DateFilter;
  updatedAt?: DateFilter;
  sort?: SortFilter<AgreementListSortField>;
  limit?: number;
  cursor?: string;
};

export type AgreementInputListParams = {
  userId?: string;
  inputId?: string;
  status?: 'PENDING' | 'MINED' | 'FAILED';
  createdAt?: DateFilter;
  updatedAt?: DateFilter;
  sort?: SortFilter<AgreementInputListSortField>;
  limit?: number;
  cursor?: string;
};

export type ValidateDirectAgreementRequest = {
  agreement: Record<string, unknown>;
  chainId?: number;
  initValues?: Record<string, unknown>;
  participants?: DirectParticipantRecord[];
  observers?: string[];
};

export type ValidateDirectAgreementResponse = {
  templateId: string | null;
  participantVariableKeys: string[];
  participants: DirectParticipantRecord[];
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
  chainId?: number;
  docUri?: string;
  initValues?: Record<string, unknown>;
  participants?: DirectParticipantRecord[];
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
  agreementId: string;
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

export type WebhookEventType = 'agreement.transitioned' | 'webhook.test';

export type WebhookSubscriptionEventType = Extract<WebhookEventType, 'agreement.transitioned'>;

export type WebhookSubscriptionStatus = 'active' | 'disabled';

export type WebhookFilters = {
  agreementIds?: string[];
  templateIds?: string[];
  inputIds?: string[];
  fromStates?: string[];
  toStates?: string[];
};

export type WebhookSubscription = {
  id: string;
  principalId: string;
  createdByApiKeyId?: string;
  url: string;
  status: WebhookSubscriptionStatus;
  eventTypes: WebhookSubscriptionEventType[];
  filters?: WebhookFilters;
  createdAt: string;
  updatedAt: string;
};

export type CreateWebhookRequest = {
  url: string;
  eventTypes?: WebhookSubscriptionEventType[];
  filters?: WebhookFilters;
};

export type CreateWebhookResponse = WebhookSubscription & {
  secret: string;
};

export type UpdateWebhookRequest = {
  url?: string;
  eventTypes?: WebhookSubscriptionEventType[];
  filters?: WebhookFilters;
  status?: WebhookSubscriptionStatus;
};

export type WebhookTestResponse = {
  ok: true;
  deliveryId: string;
};

export type AgreementsApiEnvironment = 'testnet' | 'production';

type ApiClientSharedConfig = {
  /** `X-API-Key` value for the API principal. */
  apiKey?: string;
  /** Optional header factory (e.g. telemetry). Merged after defaults. */
  headers?: Record<string, string> | (() => Record<string, string> | undefined);
  /** Override `fetch` (defaults to global `fetch`). */
  fetch?: typeof fetch;
};

export type ApiClientConfig =
  | (ApiClientSharedConfig & {
      /** Named Shodai environment used to resolve the gateway host automatically. */
      environment: AgreementsApiEnvironment;
      /**
       * Optional gateway origin override (no trailing slash), e.g. `https://internal-gateway.example.com`.
       * When provided, this wins over the environment host mapping.
       */
      baseUrl?: string;
    })
  | (ApiClientSharedConfig & {
      /**
       * Explicit gateway origin override (no trailing slash), e.g. `https://api.example.com`.
       * Prefer `environment` for standard Shodai hosts.
       */
      baseUrl: string;
      environment?: AgreementsApiEnvironment;
    });
