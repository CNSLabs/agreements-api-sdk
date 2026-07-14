/**
 * Types aligned with the public Agreements API OpenAPI contract.
 * Agreement JSON follows `@shodai-network/agreements-protocol-evm` `AgreementJson` at runtime.
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
  documentId?: string;
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
  documentId?: string;
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

export type ValidateAgreementPackageRequest = {
  agreementPackage: Record<string, unknown>;
  docUri?: string;
};

export type AgreementPackageCompilationIssue = {
  code: string;
  path: string;
  message: string;
};

export type ValidateAgreementPackageResponse = {
  manifest: {
    schemaVersion: string;
    profile: {
      id: string;
      version: string;
      compiler: string;
    };
    packageDigest: string;
    targetChainId: string;
    docUri: string;
    canonicalUtf8Length: number;
    compiled: {
      inputDefs: number;
      transitions: number;
      initVars: number;
      verifiers: number;
      actions: number;
    };
  };
  lossReport: AgreementPackageCompilationIssue[];
  deployment: {
    docHash: string;
    initialState: string;
  };
};

export type DirectDeployAgreementWithPermitRequest = {
  agreement: Record<string, unknown>;
  displayName: string;
  notificationTemplate?: NotificationTemplate;
  chainId?: number;
  docUri?: string;
  documentId?: string;
  initValues?: Record<string, unknown>;
  participants?: DirectParticipantRecord[];
  observers?: string[];
  signer: string;
  deadline: number;
  signature: PermitSignature;
};

export type NotificationTemplate = {
  metadata?: {
    id?: string;
    agreementTemplateId?: string;
    version?: string;
    name?: string;
    description?: string;
  };
  rules: NotificationRule[];
};

export type NotificationRule = {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
  trigger:
    | {
        type: 'onTransition';
        from?: string[];
        to?: string[];
        inputs?: string[];
      }
    | {
        type: 'temporal';
        states: string[];
        condition: Record<string, unknown>;
        checkInterval?: Record<string, unknown>;
        fireOnce?: boolean;
      };
  recipients: string[];
  notification: {
    channel?: 'email' | 'external_webhook';
    subject: string;
    title?: string;
    body: string;
    ctaLabel?: string;
    attachmentStrategy?: NotificationAttachmentStrategy;
  };
  constraints?: Record<string, unknown>;
};

export type NotificationAttachmentStrategy = {
  type: 'customerInvoicePdf';
  variant: string;
};

export type AgreementStateResponse = {
  status: 'Draft' | 'Deployed';
  state: string | null;
};

export type AgreementDocumentResponse = {
  documentId: string;
  docUri?: string;
  agreementId: string;
  agreementAddress?: string;
  chainId: number;
  displayName: string;
  contentType: string;
  content: string;
  docHash?: string;
  updatedAt?: string;
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

export type WebhookEventType =
  | 'agreement.transitioned'
  | 'agreement.notification.triggered'
  | 'webhook.test';

export type WebhookSubscriptionEventType = Extract<
  WebhookEventType,
  'agreement.transitioned' | 'agreement.notification.triggered'
>;

export type WebhookSubscriptionStatus = 'active' | 'disabled';

export type WebhookFilters = {
  agreementIds?: string[];
  templateIds?: string[];
  inputIds?: string[];
  fromStates?: string[];
  toStates?: string[];
  ruleIds?: string[];
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
  ok: boolean;
  deliveryId: string;
  status: 'pending' | 'succeeded' | 'failed' | 'retry_pending';
  responseStatus?: number;
  error?: string;
};

export type AgreementsApiEnvironment = 'testnet' | 'production';

type ApiClientSharedConfig = {
  /** API key for the API principal; sent as the canonical `X-API-Key` header. */
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
