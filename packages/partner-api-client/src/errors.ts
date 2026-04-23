import type { ErrorResponse } from './types.js';

export class PartnerApiError extends Error {
  readonly status: number;
  readonly bodyText: string;
  readonly parsedBody: unknown;

  constructor(message: string, status: number, bodyText: string, parsedBody: unknown) {
    super(message);
    this.name = 'PartnerApiError';
    this.status = status;
    this.bodyText = bodyText;
    this.parsedBody = parsedBody;
  }

  /** When the server returned a JSON body matching `ErrorResponse`. */
  get errorPayload(): ErrorResponse | undefined {
    const b = this.parsedBody;
    if (b && typeof b === 'object' && 'statusCode' in b && 'message' in b) {
      return b as ErrorResponse;
    }
    return undefined;
  }
}

export function extractPartnerApiErrorMessage(parsedBody: unknown, bodyText: string, status: number): string {
  if (parsedBody && typeof parsedBody === 'object' && 'message' in parsedBody) {
    const message = (parsedBody as { message?: string | string[] }).message;
    if (Array.isArray(message)) return message.join('\n');
    if (typeof message === 'string' && message.trim()) return message;
  }
  return bodyText.trim() || `Request failed with status ${status}`;
}
