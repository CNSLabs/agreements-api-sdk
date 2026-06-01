import { createHmac, timingSafeEqual } from 'node:crypto';

export const WEBHOOK_ID_HEADER = 'x-shodai-webhook-id';
export const WEBHOOK_TIMESTAMP_HEADER = 'x-shodai-webhook-timestamp';
export const WEBHOOK_SIGNATURE_HEADER = 'x-shodai-webhook-signature';
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

export type WebhookRawBody = string | ArrayBuffer | Uint8Array;

export type WebhookHeaders =
  | Headers
  | { get(name: string): string | null | undefined }
  | Record<string, string | string[] | undefined>;

export type WebhookVerificationErrorCode =
  | 'missing_header'
  | 'invalid_signature_format'
  | 'invalid_timestamp'
  | 'timestamp_out_of_tolerance'
  | 'webhook_id_mismatch'
  | 'signature_mismatch'
  | 'invalid_payload';

export class WebhookVerificationError extends Error {
  readonly code: WebhookVerificationErrorCode;
  readonly header?: string;
  readonly statusCode = 400;

  constructor(
    code: WebhookVerificationErrorCode,
    message: string,
    options: { header?: string; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'WebhookVerificationError';
    this.code = code;
    this.header = options.header;
  }
}

export type WebhookTestEvent = {
  eventId: string;
  eventType: 'webhook.test';
  timestamp: string;
};

export type AgreementTransitionedWebhookEvent = {
  eventId: string;
  eventType: 'agreement.transitioned';
  agreementId: string;
  agreementName?: string;
  templateId?: string;
  fromState?: string;
  toState?: string;
  inputId?: string;
  timestamp: string;
};

export type UnknownWebhookEvent<TEventType extends string = string> = {
  eventId?: string;
  eventType: TEventType;
  timestamp?: string;
  [key: string]: unknown;
};

export type ShodaiWebhookEvent =
  | WebhookTestEvent
  | AgreementTransitionedWebhookEvent;

export type VerifiedWebhookMetadata = {
  timestamp: string;
  signature: string;
};

export type ConstructWebhookEventOptions = {
  /** Maximum age difference allowed for webhook timestamps. Defaults to 300 seconds. */
  toleranceSeconds?: number;
  /** Override the verification clock, primarily for deterministic tests. */
  now?: Date | number;
};

export function constructWebhookEvent(
  rawBody: WebhookRawBody,
  headers: WebhookHeaders,
  secret: string,
  options: ConstructWebhookEventOptions = {},
): ShodaiWebhookEvent {
  const headerId = requireHeader(headers, WEBHOOK_ID_HEADER);
  verifyWebhookSignature(rawBody, headers, secret, options);

  try {
    const parsed = JSON.parse(rawBodyToString(rawBody));
    const event = parseWebhookEvent(parsed);
    if (event.eventId !== headerId) {
      throw new WebhookVerificationError(
        'webhook_id_mismatch',
        'Webhook id header must match the signed payload eventId.',
        { header: WEBHOOK_ID_HEADER },
      );
    }
    return event;
  } catch (error) {
    if (error instanceof WebhookVerificationError) throw error;
    throw new WebhookVerificationError('invalid_payload', 'Webhook payload is not valid JSON.', {
      cause: error,
    });
  }
}

export function verifyWebhookSignature(
  rawBody: WebhookRawBody,
  headers: WebhookHeaders,
  secret: string,
  options: ConstructWebhookEventOptions = {},
): VerifiedWebhookMetadata {
  requireHeader(headers, WEBHOOK_ID_HEADER);
  const timestamp = requireHeader(headers, WEBHOOK_TIMESTAMP_HEADER);
  const signature = requireHeader(headers, WEBHOOK_SIGNATURE_HEADER);
  const expectedSignature = computeWebhookSignature(rawBody, timestamp, secret);

  assertTimestampWithinTolerance(timestamp, options);

  if (!signature.startsWith('sha256=')) {
    throw new WebhookVerificationError(
      'invalid_signature_format',
      'Webhook signature must use the sha256= format.',
      { header: WEBHOOK_SIGNATURE_HEADER },
    );
  }

  if (!safeEqual(signature, expectedSignature)) {
    throw new WebhookVerificationError('signature_mismatch', 'Webhook signature verification failed.', {
      header: WEBHOOK_SIGNATURE_HEADER,
    });
  }

  return { timestamp, signature };
}

export function computeWebhookSignature(
  rawBody: WebhookRawBody,
  timestamp: string,
  secret: string,
): string {
  const hmac = createHmac('sha256', requireNonEmpty(secret, 'secret'));
  hmac.update(timestamp);
  hmac.update('.');
  hmac.update(rawBodyToBuffer(rawBody));
  return `sha256=${hmac.digest('hex')}`;
}

function assertTimestampWithinTolerance(
  timestamp: string,
  options: ConstructWebhookEventOptions,
): void {
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    throw new WebhookVerificationError('invalid_timestamp', 'Webhook timestamp must be a Unix timestamp.', {
      header: WEBHOOK_TIMESTAMP_HEADER,
    });
  }

  const toleranceSeconds = options.toleranceSeconds ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
  if (!Number.isFinite(toleranceSeconds) || toleranceSeconds < 0) {
    throw new WebhookVerificationError(
      'invalid_timestamp',
      'Webhook timestamp tolerance must be a non-negative number.',
    );
  }

  const nowMs = options.now instanceof Date ? options.now.getTime() : options.now ?? Date.now();
  const nowSeconds = nowMs > 10_000_000_000 ? nowMs / 1000 : nowMs;
  if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) {
    throw new WebhookVerificationError(
      'timestamp_out_of_tolerance',
      'Webhook timestamp is outside the allowed tolerance.',
      { header: WEBHOOK_TIMESTAMP_HEADER },
    );
  }
}

function requireHeader(headers: WebhookHeaders, name: string): string {
  const value = getHeader(headers, name);
  if (!value) {
    throw new WebhookVerificationError('missing_header', `Missing required webhook header: ${name}.`, {
      header: name,
    });
  }
  return value;
}

function parseWebhookEvent(value: unknown): ShodaiWebhookEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WebhookVerificationError(
      'invalid_payload',
      'Webhook payload must be a JSON object with an eventType.',
    );
  }

  const payload = value as Record<string, unknown>;
  if (payload.eventType === 'webhook.test') {
    return {
      eventId: requirePayloadString(payload, 'eventId'),
      eventType: 'webhook.test',
      timestamp: requirePayloadString(payload, 'timestamp'),
    };
  }

  if (payload.eventType === 'agreement.transitioned') {
    return {
      eventId: requirePayloadString(payload, 'eventId'),
      eventType: 'agreement.transitioned',
      agreementId: requirePayloadString(payload, 'agreementId'),
      agreementName: optionalPayloadString(payload, 'agreementName'),
      templateId: optionalPayloadString(payload, 'templateId'),
      fromState: optionalPayloadString(payload, 'fromState'),
      toState: optionalPayloadString(payload, 'toState'),
      inputId: optionalPayloadString(payload, 'inputId'),
      timestamp: requirePayloadString(payload, 'timestamp'),
    };
  }

  if (typeof payload.eventType !== 'string') {
    throw new WebhookVerificationError(
      'invalid_payload',
      'Webhook payload must be a JSON object with an eventType.',
    );
  }

  throw new WebhookVerificationError(
    'invalid_payload',
    `Unsupported webhook event type: ${payload.eventType}.`,
  );
}

function requirePayloadString(payload: Record<string, unknown>, field: string): string {
  const value = payload[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new WebhookVerificationError('invalid_payload', `Webhook payload ${field} must be a string.`);
  }
  return value;
}

function optionalPayloadString(payload: Record<string, unknown>, field: string): string | undefined {
  const value = payload[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new WebhookVerificationError('invalid_payload', `Webhook payload ${field} must be a string.`);
  }
  return value;
}

function getHeader(headers: WebhookHeaders, name: string): string | undefined {
  if ('get' in headers && typeof headers.get === 'function') {
    return normalizeHeaderValue(headers.get(name));
  }

  const record = headers as Record<string, string | string[] | undefined>;
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase() === lowerName) {
      return normalizeHeaderValue(value);
    }
  }
  return undefined;
}

function normalizeHeaderValue(value: string | string[] | null | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value.length > 0 ? String(value[0]).trim() || undefined : undefined;
  }
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

function rawBodyToString(rawBody: WebhookRawBody): string {
  if (typeof rawBody === 'string') return rawBody;
  return rawBodyToBuffer(rawBody).toString('utf8');
}

function rawBodyToBuffer(rawBody: WebhookRawBody): Buffer {
  if (typeof rawBody === 'string') return Buffer.from(rawBody, 'utf8');
  if (rawBody instanceof ArrayBuffer) return Buffer.from(rawBody);
  return Buffer.from(rawBody.buffer, rawBody.byteOffset, rawBody.byteLength);
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    throw new WebhookVerificationError('invalid_signature_format', `${field} is required.`);
  }
  return trimmed;
}
