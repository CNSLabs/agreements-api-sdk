import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { describe, it } from 'node:test';
import {
  computeWebhookSignature,
  constructWebhookEvent,
  verifyWebhookSignature,
  WebhookVerificationError,
  WEBHOOK_ID_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from '../dist/webhooks.js';

const secret = 'whsec_test';
const nowSeconds = 1_800_000_000;
const timestamp = String(nowSeconds);

const testPayload = {
  eventId: 'evt_test',
  eventType: 'webhook.test',
  timestamp: '2026-06-01T00:00:00.000Z',
};

const transitionPayload = {
  eventId: 'evt_transition',
  eventType: 'agreement.transitioned',
  agreementId: 'agreement-1',
  agreementName: 'Retainer',
  templateId: 'template-1',
  fromState: 'AWAITING_PAYMENT',
  toState: 'WORK_IN_PROGRESS',
  inputId: 'submitInitialPaymentProof',
  timestamp: '2026-06-01T00:00:00.000Z',
};

function body(payload) {
  return JSON.stringify(payload);
}

function headersFor(rawBody, eventId, overrides = {}) {
  return {
    [WEBHOOK_ID_HEADER]: eventId,
    [WEBHOOK_TIMESTAMP_HEADER]: timestamp,
    [WEBHOOK_SIGNATURE_HEADER]: computeWebhookSignature(rawBody, timestamp, secret),
    ...overrides,
  };
}

function assertWebhookError(fn, code, header) {
  assert.throws(fn, error => {
    assert(error instanceof WebhookVerificationError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, 400);
    if (header) assert.equal(error.header, header);
    return true;
  });
}

describe('webhook receiver helpers', () => {
  it('verifies a backend-shaped webhook.test delivery', () => {
    const rawBody = body(testPayload);
    const metadata = verifyWebhookSignature(rawBody, headersFor(rawBody, 'evt_test'), secret, {
      now: nowSeconds,
    });
    assert.equal(metadata.timestamp, timestamp);
    assert.match(metadata.signature, /^sha256=/);
    assert.equal('id' in metadata, false);

    const event = constructWebhookEvent(rawBody, headersFor(rawBody, 'evt_test'), secret, {
      now: nowSeconds,
    });
    assert.equal(event.eventType, 'webhook.test');
    assert.equal(event.eventId, 'evt_test');
  });

  it('verifies a backend-shaped agreement.transitioned delivery', () => {
    const rawBody = body(transitionPayload);
    const event = constructWebhookEvent(rawBody, headersFor(rawBody, 'evt_transition'), secret, {
      now: nowSeconds,
    });

    assert.equal(event.eventType, 'agreement.transitioned');
    assert.equal(event.eventId, 'evt_transition');
    assert.equal(event.agreementId, 'agreement-1');
    assert.equal(event.agreementName, 'Retainer');
    assert.equal(event.templateId, 'template-1');
    assert.equal(event.fromState, 'AWAITING_PAYMENT');
    assert.equal(event.toState, 'WORK_IN_PROGRESS');
    assert.equal(event.inputId, 'submitInitialPaymentProof');
  });

  it('rejects altered bodies and signatures', () => {
    const rawBody = body(testPayload);
    const headers = headersFor(rawBody, 'evt_test');
    const alteredBody = body({ ...testPayload, timestamp: '2026-06-01T00:00:01.000Z' });

    assertWebhookError(
      () => verifyWebhookSignature(alteredBody, headers, secret, { now: nowSeconds }),
      'signature_mismatch',
      WEBHOOK_SIGNATURE_HEADER,
    );
    assertWebhookError(
      () => verifyWebhookSignature(rawBody, headers, 'wrong-secret', { now: nowSeconds }),
      'signature_mismatch',
      WEBHOOK_SIGNATURE_HEADER,
    );
    assertWebhookError(
      () => verifyWebhookSignature(
        rawBody,
        headersFor(rawBody, 'evt_test', { [WEBHOOK_SIGNATURE_HEADER]: 'bad-format' }),
        secret,
        { now: nowSeconds },
      ),
      'invalid_signature_format',
      WEBHOOK_SIGNATURE_HEADER,
    );
  });

  it('rejects stale and invalid timestamps', () => {
    const rawBody = body(testPayload);

    assertWebhookError(
      () => verifyWebhookSignature(
        rawBody,
        headersFor(rawBody, 'evt_test', { [WEBHOOK_TIMESTAMP_HEADER]: String(nowSeconds - 1_000) }),
        secret,
        { now: nowSeconds },
      ),
      'timestamp_out_of_tolerance',
      WEBHOOK_TIMESTAMP_HEADER,
    );
    assertWebhookError(
      () => verifyWebhookSignature(
        rawBody,
        headersFor(rawBody, 'evt_test', { [WEBHOOK_TIMESTAMP_HEADER]: 'not-a-number' }),
        secret,
        { now: nowSeconds },
      ),
      'invalid_timestamp',
      WEBHOOK_TIMESTAMP_HEADER,
    );
  });

  it('rejects missing required headers', () => {
    const rawBody = body(testPayload);

    for (const missingHeader of [WEBHOOK_ID_HEADER, WEBHOOK_TIMESTAMP_HEADER, WEBHOOK_SIGNATURE_HEADER]) {
      const headers = headersFor(rawBody, 'evt_test');
      delete headers[missingHeader];
      assertWebhookError(
        () => verifyWebhookSignature(rawBody, headers, secret, { now: nowSeconds }),
        'missing_header',
        missingHeader,
      );
    }
  });

  it('rejects header/body event id mismatch', () => {
    const rawBody = body(testPayload);

    assertWebhookError(
      () => constructWebhookEvent(rawBody, headersFor(rawBody, 'tampered-id'), secret, {
        now: nowSeconds,
      }),
      'webhook_id_mismatch',
      WEBHOOK_ID_HEADER,
    );
  });

  it('rejects malformed payloads and unsupported event types', () => {
    const invalidJson = '{';
    assertWebhookError(
      () => constructWebhookEvent(invalidJson, headersFor(invalidJson, 'evt_test'), secret, {
        now: nowSeconds,
      }),
      'invalid_payload',
    );

    const missingEventType = '{}';
    assertWebhookError(
      () => constructWebhookEvent(missingEventType, headersFor(missingEventType, 'evt_test'), secret, {
        now: nowSeconds,
      }),
      'invalid_payload',
    );

    const malformedTransition = body({
      eventId: 'evt_bad',
      eventType: 'agreement.transitioned',
      timestamp: '2026-06-01T00:00:00.000Z',
    });
    assertWebhookError(
      () => constructWebhookEvent(malformedTransition, headersFor(malformedTransition, 'evt_bad'), secret, {
        now: nowSeconds,
      }),
      'invalid_payload',
    );

    const unknownEvent = body({ eventId: 'evt_future', eventType: 'future.event' });
    assertWebhookError(
      () => constructWebhookEvent(unknownEvent, headersFor(unknownEvent, 'evt_future'), secret, {
        now: nowSeconds,
      }),
      'invalid_payload',
    );
  });

  it('supports case-insensitive record headers and Headers objects', () => {
    const rawBody = body(testPayload);
    const caseHeaders = {
      'X-Shodai-Webhook-Id': 'evt_test',
      'X-Shodai-Webhook-Timestamp': timestamp,
      'X-Shodai-Webhook-Signature': computeWebhookSignature(rawBody, timestamp, secret),
    };
    assert.equal(verifyWebhookSignature(rawBody, caseHeaders, secret, { now: nowSeconds }).timestamp, timestamp);

    const fetchHeaders = new Headers(Object.entries(headersFor(rawBody, 'evt_test')));
    assert.equal(verifyWebhookSignature(rawBody, fetchHeaders, secret, { now: nowSeconds }).timestamp, timestamp);
  });

  it('supports string, Buffer, Uint8Array, and ArrayBuffer raw bodies', () => {
    const rawBody = body(testPayload);
    const bufferBody = Buffer.from(rawBody, 'utf8');
    const arrayBufferBody = bufferBody.buffer.slice(
      bufferBody.byteOffset,
      bufferBody.byteOffset + bufferBody.byteLength,
    );

    for (const candidate of [rawBody, bufferBody, new Uint8Array(bufferBody), arrayBufferBody]) {
      const event = constructWebhookEvent(candidate, headersFor(candidate, 'evt_test'), secret, {
        now: nowSeconds,
      });
      assert.equal(event.eventType, 'webhook.test');
    }
  });
});
