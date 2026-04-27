const CORRELATION_HEADER_NAME = 'x-correlation-id';
const TRACEPARENT_HEADER_NAME = 'traceparent';
const CLIENT_APP_HEADER_NAME = 'x-cns-client-app';
const CLIENT_APP_NAME = 'agreements-api-playground';

export function createBrowserTelemetryHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    [CLIENT_APP_HEADER_NAME]: CLIENT_APP_NAME,
  };

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    headers[CORRELATION_HEADER_NAME] = crypto.randomUUID();
  }

  const traceId = randomHex(32);
  const spanId = randomHex(16);

  if (traceId && spanId) {
    headers[TRACEPARENT_HEADER_NAME] = `00-${traceId}-${spanId}-01`;
  }

  return headers;
}

function randomHex(length: number): string | undefined {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    return undefined;
  }

  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);

  const value = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  const normalized = value.slice(0, length);

  if (!normalized || /^0+$/.test(normalized)) {
    return undefined;
  }

  return normalized;
}
