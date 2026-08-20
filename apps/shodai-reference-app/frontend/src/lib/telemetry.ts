import * as Sentry from "@sentry/react";

const correlationHeaderName = "x-correlation-id";
const traceparentHeaderName = "traceparent";
const clientAppHeaderName = "x-client-app";
const clientAppName = "shodai-reference-frontend";
const traceIdPattern = /^[0-9a-f]{32}$/i;
const spanIdPattern = /^[0-9a-f]{16}$/i;

export function createBrowserTelemetryHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    [clientAppHeaderName]: clientAppName,
  };

  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    headers[correlationHeaderName] = crypto.randomUUID();
  }

  const traceData = Sentry.getTraceData();
  const sentryTrace = traceData["sentry-trace"];
  const baggage = traceData.baggage;
  const traceparent = buildTraceparentFromSentryTrace(sentryTrace) || buildRandomTraceparent();

  if (typeof sentryTrace === "string" && sentryTrace.length > 0) {
    headers["sentry-trace"] = sentryTrace;
  }

  if (typeof baggage === "string" && baggage.length > 0) {
    headers.baggage = baggage;
  }

  if (traceparent) {
    headers[traceparentHeaderName] = traceparent;
  }

  return headers;
}

function buildTraceparentFromSentryTrace(sentryTrace?: string): string | undefined {
  if (typeof sentryTrace !== "string" || sentryTrace.length === 0) {
    return undefined;
  }

  const [traceId, parentSpanId, sampled] = sentryTrace.split("-");

  if (!traceIdPattern.test(traceId) || !spanIdPattern.test(parentSpanId)) {
    return undefined;
  }

  return `00-${traceId.toLowerCase()}-${parentSpanId.toLowerCase()}-${sampled === "1" ? "01" : "00"}`;
}

function buildRandomTraceparent(): string | undefined {
  const traceId = randomHex(32);
  const spanId = randomHex(16);

  if (!traceId || !spanId) {
    return undefined;
  }

  return `00-${traceId}-${spanId}-01`;
}

function randomHex(length: number): string | undefined {
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    return undefined;
  }

  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);

  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const normalized = value.slice(0, length);

  if (!normalized || /^0+$/.test(normalized)) {
    return undefined;
  }

  return normalized;
}
