import { extractAgreementsApiErrorMessage, AgreementsApiError } from './errors.js';
import type {
  AgreementInputRecord,
  AgreementRecord,
  AgreementStateResponse,
  DirectDeployAgreementWithPermitRequest,
  HealthResponse,
  ApiClientConfig,
  ProcessInputRequest,
  ValidateDirectAgreementRequest,
  ValidateDirectAgreementResponse,
  ValidateDirectAgreementTemplateResponse,
} from './types.js';
import { resolveApiBaseUrl } from './constants.js';
import { agreementsApiPaths, joinUrl } from './utils.js';

type HttpMethod = 'GET' | 'POST';

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

  async getOpenApiDocument(): Promise<unknown> {
    return this.request<unknown>('GET', agreementsApiPaths.openapiJson());
  }

  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', agreementsApiPaths.health());
  }

  async listAgreements(params?: { status?: 'Draft' | 'Deployed' }): Promise<AgreementRecord[]> {
    const q = params?.status ? `?status=${encodeURIComponent(params.status)}` : '';
    return this.request<AgreementRecord[]>('GET', `${agreementsApiPaths.agreements()}${q}`);
  }

  async getAgreement(agreementId: string): Promise<AgreementRecord> {
    return this.request<AgreementRecord>('GET', agreementsApiPaths.agreement(agreementId));
  }

  async validateTemplate(agreement: Record<string, unknown>): Promise<ValidateDirectAgreementTemplateResponse> {
    return this.request<ValidateDirectAgreementTemplateResponse>(
      'POST',
      agreementsApiPaths.agreementsValidateTemplate(),
      agreement,
      201,
    );
  }

  async validateDeployment(body: ValidateDirectAgreementRequest): Promise<ValidateDirectAgreementResponse> {
    return this.request<ValidateDirectAgreementResponse>('POST', agreementsApiPaths.agreementsValidate(), body, 201);
  }

  async deployWithPermit(body: DirectDeployAgreementWithPermitRequest): Promise<AgreementRecord> {
    return this.request<AgreementRecord>('POST', agreementsApiPaths.agreementsDeployWithPermit(), body, 201);
  }

  async getAgreementState(agreementId: string): Promise<AgreementStateResponse> {
    return this.request<AgreementStateResponse>('GET', agreementsApiPaths.agreementState(agreementId));
  }

  async listAgreementInputs(agreementId: string, params?: { userId?: string }): Promise<AgreementInputRecord[]> {
    const q = params?.userId ? `?userId=${encodeURIComponent(params.userId)}` : '';
    return this.request<AgreementInputRecord[]>('GET', `${agreementsApiPaths.agreementInputs(agreementId)}${q}`);
  }

  async submitAgreementInput(agreementId: string, body: ProcessInputRequest): Promise<AgreementInputRecord> {
    return this.request<AgreementInputRecord>('POST', agreementsApiPaths.agreementInput(agreementId), body, 201);
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
   * Low-level JSON request. Path may be absolute (`/partner-api/v0/...`) or relative; it is resolved against `baseUrl`.
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
