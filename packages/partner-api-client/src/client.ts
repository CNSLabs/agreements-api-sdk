import { extractPartnerApiErrorMessage, PartnerApiError } from './errors.js';
import type {
  AgreementInputRecord,
  AgreementRecord,
  AgreementStateResponse,
  DirectDeployAgreementWithPermitRequest,
  HealthResponse,
  PartnerApiClientConfig,
  ProcessInputRequest,
  ValidateDirectAgreementRequest,
  ValidateDirectAgreementResponse,
  ValidateDirectAgreementTemplateResponse,
} from './types.js';
import { joinUrl, partnerApiPaths } from './utils.js';

type HttpMethod = 'GET' | 'POST';

export class PartnerApiClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly extraHeaders?: PartnerApiClientConfig['headers'];
  private readonly fetchImpl: typeof fetch;

  constructor(config: PartnerApiClientConfig) {
    this.baseUrl = config.baseUrl.trim();
    this.apiKey = config.apiKey?.trim() || undefined;
    this.extraHeaders = config.headers;
    // Default `fetch` must be bound; assigning `fetch` unbound breaks with "Illegal invocation" in browsers.
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async getOpenApiDocument(): Promise<unknown> {
    return this.request<unknown>('GET', partnerApiPaths.openapiJson());
  }

  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', partnerApiPaths.health());
  }

  async listAgreements(params?: { status?: 'Draft' | 'Deployed' }): Promise<AgreementRecord[]> {
    const q = params?.status ? `?status=${encodeURIComponent(params.status)}` : '';
    return this.request<AgreementRecord[]>('GET', `${partnerApiPaths.agreements()}${q}`);
  }

  async getAgreement(agreementId: string): Promise<AgreementRecord> {
    return this.request<AgreementRecord>('GET', partnerApiPaths.agreement(agreementId));
  }

  async validateTemplate(agreement: Record<string, unknown>): Promise<ValidateDirectAgreementTemplateResponse> {
    return this.request<ValidateDirectAgreementTemplateResponse>(
      'POST',
      partnerApiPaths.agreementsValidateTemplate(),
      agreement,
      201,
    );
  }

  async validateDeployment(body: ValidateDirectAgreementRequest): Promise<ValidateDirectAgreementResponse> {
    return this.request<ValidateDirectAgreementResponse>('POST', partnerApiPaths.agreementsValidate(), body, 201);
  }

  async deployWithPermit(body: DirectDeployAgreementWithPermitRequest): Promise<AgreementRecord> {
    return this.request<AgreementRecord>('POST', partnerApiPaths.agreementsDeployWithPermit(), body, 201);
  }

  async getAgreementState(agreementId: string): Promise<AgreementStateResponse> {
    return this.request<AgreementStateResponse>('GET', partnerApiPaths.agreementState(agreementId));
  }

  async listAgreementInputs(agreementId: string, params?: { userId?: string }): Promise<AgreementInputRecord[]> {
    const q = params?.userId ? `?userId=${encodeURIComponent(params.userId)}` : '';
    return this.request<AgreementInputRecord[]>('GET', `${partnerApiPaths.agreementInputs(agreementId)}${q}`);
  }

  async submitAgreementInput(agreementId: string, body: ProcessInputRequest): Promise<AgreementInputRecord> {
    return this.request<AgreementInputRecord>('POST', partnerApiPaths.agreementInput(agreementId), body, 201);
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
      const message = extractPartnerApiErrorMessage(parsedBody, bodyText, res.status);
      throw new PartnerApiError(message, res.status, bodyText, parsedBody);
    }

    return (parsedBody as T) ?? (bodyText as unknown as T);
  }
}
