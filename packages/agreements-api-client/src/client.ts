import { extractAgreementsApiErrorMessage, AgreementsApiError } from './errors.js';
import type {
  AgreementInputListParams,
  AgreementInputRecord,
  AgreementDocumentResponse,
  AgreementListParams,
  AgreementRecord,
  AgreementSummary,
  AgreementStateResponse,
  DirectDeployAgreementWithPermitRequest,
  HealthResponse,
  ApiClientConfig,
  ApiResponse,
  CreateWebhookRequest,
  CreateWebhookResponse,
  ListResponse,
  ProcessInputRequest,
  UpdateWebhookRequest,
  ValidateDirectAgreementRequest,
  ValidateDirectAgreementResponse,
  ValidateDirectAgreementTemplateResponse,
  ValidateAgreementPackageRequest,
  ValidateAgreementPackageResponse,
  WebhookSubscription,
  WebhookTestResponse,
} from './types.js';
import { resolveApiBaseUrl } from './constants.js';
import { agreementsApiPaths, joinUrl } from './utils.js';

type HttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST';

export class ApiClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly extraHeaders?: ApiClientConfig['headers'];
  private readonly fetchImpl: typeof fetch;

  constructor(config: ApiClientConfig) {
    this.baseUrl = resolveConfiguredBaseUrl(config);
    this.apiKey = config.apiKey?.trim() || undefined;
    this.extraHeaders = config.headers;
    // Default `fetch` must be bound; assigning `fetch` unbound breaks with "Illegal invocation" in browsers.
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async getOpenApiDocument(): Promise<unknown> {
    return this.request<unknown>('GET', agreementsApiPaths.openapiJson());
  }

  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', agreementsApiPaths.health());
  }

  async listAgreements(params?: AgreementListParams): Promise<ListResponse<AgreementSummary>> {
    return this.requestList<AgreementSummary>('GET', withQuery(agreementsApiPaths.agreements(), params));
  }

  async getAgreement(agreementId: string): Promise<AgreementRecord> {
    return this.requestData<AgreementRecord>('GET', agreementsApiPaths.agreement(agreementId));
  }

  async validateTemplate(agreement: Record<string, unknown>): Promise<ValidateDirectAgreementTemplateResponse> {
    return this.requestData<ValidateDirectAgreementTemplateResponse>(
      'POST',
      agreementsApiPaths.agreementsValidateTemplate(),
      agreement,
      201,
    );
  }

  async validateDeployment(body: ValidateDirectAgreementRequest): Promise<ValidateDirectAgreementResponse> {
    return this.requestData<ValidateDirectAgreementResponse>('POST', agreementsApiPaths.agreementsValidate(), body, 201);
  }

  async validatePackage(body: ValidateAgreementPackageRequest): Promise<ValidateAgreementPackageResponse> {
    return this.requestData<ValidateAgreementPackageResponse>(
      'POST',
      agreementsApiPaths.agreementsValidatePackage(),
      body,
      201,
    );
  }

  async deployWithPermit(body: DirectDeployAgreementWithPermitRequest): Promise<AgreementRecord> {
    return this.requestData<AgreementRecord>('POST', agreementsApiPaths.agreementsDeployWithPermit(), body, 201);
  }

  async getAgreementState(agreementId: string): Promise<AgreementStateResponse> {
    return this.requestData<AgreementStateResponse>('GET', agreementsApiPaths.agreementState(agreementId));
  }

  async getAgreementDocument(documentId: string): Promise<AgreementDocumentResponse> {
    return this.requestData<AgreementDocumentResponse>('GET', agreementsApiPaths.agreementDocument(documentId));
  }

  async listAgreementInputs(agreementId: string, params?: AgreementInputListParams): Promise<ListResponse<AgreementInputRecord>> {
    return this.requestList<AgreementInputRecord>('GET', withQuery(agreementsApiPaths.agreementInputs(agreementId), params));
  }

  async submitAgreementInput(agreementId: string, body: ProcessInputRequest): Promise<AgreementInputRecord> {
    return this.requestData<AgreementInputRecord>('POST', agreementsApiPaths.agreementInput(agreementId), body, 201);
  }

  async createWebhook(body: CreateWebhookRequest): Promise<CreateWebhookResponse> {
    return this.requestData<CreateWebhookResponse>('POST', agreementsApiPaths.webhooks(), body, 201);
  }

  async listWebhooks(): Promise<ListResponse<WebhookSubscription>> {
    return this.requestList<WebhookSubscription>('GET', agreementsApiPaths.webhooks());
  }

  async getWebhook(webhookId: string): Promise<WebhookSubscription> {
    return this.requestData<WebhookSubscription>('GET', agreementsApiPaths.webhook(webhookId));
  }

  async updateWebhook(webhookId: string, body: UpdateWebhookRequest): Promise<WebhookSubscription> {
    return this.requestData<WebhookSubscription>('PATCH', agreementsApiPaths.webhook(webhookId), body);
  }

  async deleteWebhook(webhookId: string): Promise<WebhookSubscription> {
    return this.requestData<WebhookSubscription>('DELETE', agreementsApiPaths.webhook(webhookId));
  }

  async testWebhook(webhookId: string): Promise<WebhookTestResponse> {
    return this.requestData<WebhookTestResponse>('POST', agreementsApiPaths.webhookTest(webhookId), undefined, 201);
  }

  /**
   * JSON request with full response metadata (status, headers, raw body). Does not throw on HTTP error status;
   * use for debug/raw composers.
   */
  async exchangeJson(
    method: HttpMethod,
    path: string,
    body?: unknown,
  ): Promise<{
    status: number;
    ok: boolean;
    headers: Record<string, string>;
    bodyText: string;
    parsedBody: unknown;
  }> {
    const url = joinUrl(this.baseUrl, path);
    const requestHeaders: Record<string, string> = { Accept: 'application/json' };
    if (this.apiKey) requestHeaders['X-API-Key'] = this.apiKey;
    const extra = typeof this.extraHeaders === 'function' ? this.extraHeaders() : this.extraHeaders;
    if (extra) Object.assign(requestHeaders, extra);
    if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';

    const res = await this.fetchImpl(url, {
      method,
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const bodyText = await res.text();
    let parsedBody: unknown;
    try {
      parsedBody = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      parsedBody = undefined;
    }

    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      status: res.status,
      ok: res.ok,
      headers: responseHeaders,
      bodyText,
      parsedBody,
    };
  }

  /**
   * Low-level JSON request. Path may be absolute (`/v0/...`) or relative; it is resolved against `baseUrl`.
   */
  async request<T>(method: HttpMethod, path: string, body?: unknown, okStatus: number = 200): Promise<T> {
    const url = joinUrl(this.baseUrl, path);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.apiKey) headers['X-API-Key'] = this.apiKey;
    const extra = typeof this.extraHeaders === 'function' ? this.extraHeaders() : this.extraHeaders;
    if (extra) Object.assign(headers, extra);
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await this.fetchImpl(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const bodyText = await res.text();
    let parsedBody: unknown;
    try {
      parsedBody = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      parsedBody = undefined;
    }

    const success = res.status === okStatus || (okStatus === 200 && res.status >= 200 && res.status < 300);
    if (!success) {
      const message = extractAgreementsApiErrorMessage(parsedBody, bodyText, res.status);
      throw new AgreementsApiError(message, res.status, bodyText, parsedBody);
    }

    return (parsedBody as T) ?? (bodyText as unknown as T);
  }

  async requestData<T>(method: HttpMethod, path: string, body?: unknown, okStatus: number = 200): Promise<T> {
    const envelope = await this.request<ApiResponse<T>>(method, path, body, okStatus);
    return envelope.data;
  }

  async requestList<T>(method: HttpMethod, path: string, body?: unknown, okStatus: number = 200): Promise<ListResponse<T>> {
    return this.request<ListResponse<T>>(method, path, body, okStatus);
  }
}

function withQuery(path: string, params?: Record<string, string | number | Record<string, string | undefined> | undefined>): string {
  if (!params) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (key === 'sort') {
        const selectedSortFields = Object.entries(value).filter(([, nestedValue]) => nestedValue !== undefined && nestedValue !== null);
        if (selectedSortFields.length > 1) {
          throw new Error('Multiple sort fields are not supported; pass a single sort field.');
        }
      }
      for (const [modifier, nestedValue] of Object.entries(value)) {
        if (nestedValue !== undefined && nestedValue !== null) {
          search.set(`${key}[${modifier}]`, String(nestedValue));
        }
      }
    } else if (value !== undefined && value !== null) {
      search.set(key, String(value));
    }
  }
  const suffix = search.toString();
  return suffix ? `${path}?${suffix}` : path;
}

function resolveConfiguredBaseUrl(config: ApiClientConfig): string {
  const explicitBaseUrl = config.baseUrl?.trim();
  if (explicitBaseUrl) {
    return explicitBaseUrl;
  }

  if (config.environment) {
    return resolveApiBaseUrl(config.environment);
  }

  throw new Error('ApiClient requires either `environment` or `baseUrl`.');
}
