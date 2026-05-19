import type { ErrorResponse } from './types.js';

export class AgreementsApiError extends Error {
  readonly status: number;
  readonly bodyText: string;
  readonly parsedBody: unknown;

  constructor(message: string, status: number, bodyText: string, parsedBody: unknown) {
    super(message);
    this.name = 'AgreementsApiError';
    this.status = status;
    this.bodyText = bodyText;
    this.parsedBody = parsedBody;
  }

  /** When the server returned a JSON body matching `ErrorResponse`. */
  get errorPayload(): ErrorResponse | undefined {
    const b = this.parsedBody;
    if (b && typeof b === 'object' && 'error' in b) {
      return b as ErrorResponse;
    }
    return undefined;
  }
}

export function extractAgreementsApiErrorMessage(parsedBody: unknown, bodyText: string, status: number): string {
  if (parsedBody && typeof parsedBody === 'object' && 'error' in parsedBody) {
    const error = (parsedBody as { error?: { message?: unknown } }).error;
    if (typeof error?.message === 'string' && error.message.trim()) return error.message;
  }
  if (parsedBody && typeof parsedBody === 'object' && 'message' in parsedBody) {
    const message = (parsedBody as { message?: string | string[] }).message;
    if (Array.isArray(message)) return message.join('\n');
    if (typeof message === 'string' && message.trim()) return message;
  }
  return bodyText.trim() || `Request failed with status ${status}`;
}
