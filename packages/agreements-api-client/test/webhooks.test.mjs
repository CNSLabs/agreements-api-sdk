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
  id: 'evt_test',
  type: 'webhook.test',
  apiVersion: '2026-06-01',
  createdAt: '2026-06-01T00:00:00.000Z',
  data: {},
};

const transitionPayload = {
  id: 'evt_transition',
  type: 'agreement.transitioned',
  apiVersion: '2026-06-01',
  createdAt: '2026-06-01T00:00:00.000Z',
  data: {
    agreementId: 'agreement-1',
    agreementName: 'Retainer',
    templateId: 'template-1',
    fromState: 'AWAITING_PAYMENT',
    toState: 'WORK_IN_PROGRESS',
    inputId: 'submitInitialPaymentProof',
  },
};

const notificationPayload = {
  id: 'evt_notification',
  type: 'agreement.notification.triggered',
  apiVersion: '2026-06-01',
  createdAt: '2026-06-01T00:00:00.000Z',
  data: {
    agreementId: 'agreement-1',
    agreementName: 'Retainer',
    templateId: 'template-1',
    notificationTemplateId: 'ntpl-1',
    ruleId: 'rule-1',
    triggerType: 'onTransition',
    recipient: 'client@example.com',
    notification: {
      subject: 'Action required',
      title: 'Please review',
      body: 'Open the agreement.',
      ctaLabel: 'Review now',
    },
  },
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
    assert.equal(event.type, 'webhook.test');
    assert.equal(event.id, 'evt_test');
    assert.equal(event.apiVersion, '2026-06-01');
    assert.equal(event.createdAt, '2026-06-01T00:00:00.000Z');
    assert.deepEqual(event.data, {});
  });

  it('verifies a backend-shaped agreement.transitioned delivery', () => {
    const rawBody = body(transitionPayload);
    const event = constructWebhookEvent(rawBody, headersFor(rawBody, 'evt_transition'), secret, {
      now: nowSeconds,
    });

    assert.equal(event.type, 'agreement.transitioned');
    assert.equal(event.id, 'evt_transition');
    assert.equal(event.apiVersion, '2026-06-01');
    assert.equal(event.createdAt, '2026-06-01T00:00:00.000Z');
    assert.equal(event.data.agreementId, 'agreement-1');
    assert.equal(event.data.agreementName, 'Retainer');
    assert.equal(event.data.templateId, 'template-1');
    assert.equal(event.data.fromState, 'AWAITING_PAYMENT');
    assert.equal(event.data.toState, 'WORK_IN_PROGRESS');
    assert.equal(event.data.inputId, 'submitInitialPaymentProof');
  });

  it('verifies a deploy transition with an empty fromState boundary', () => {
    const deployPayload = {
      ...transitionPayload,
      id: 'evt_deploy',
      data: {
        ...transitionPayload.data,
        fromState: '',
        toState: 'AWAITING_PAYMENT',
        inputId: '__deploy',
      },
    };
    const rawBody = body(deployPayload);
    const event = constructWebhookEvent(rawBody, headersFor(rawBody, 'evt_deploy'), secret, {
      now: nowSeconds,
    });

    assert.equal(event.type, 'agreement.transitioned');
    assert.equal(event.data.fromState, '');
    assert.equal(event.data.toState, 'AWAITING_PAYMENT');
    assert.equal(event.data.inputId, '__deploy');
  });

  it('preserves optional CTA labels on notification-triggered deliveries', () => {
    const rawBody = body(notificationPayload);
    const event = constructWebhookEvent(rawBody, headersFor(rawBody, 'evt_notification'), secret, {
      now: nowSeconds,
    });

    assert.equal(event.type, 'agreement.notification.triggered');
    assert.equal(event.data.notification.subject, 'Action required');
    assert.equal(event.data.notification.title, 'Please review');
    assert.equal(event.data.notification.body, 'Open the agreement.');
    assert.equal(event.data.notification.ctaLabel, 'Review now');
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
      id: 'evt_bad',
      type: 'agreement.transitioned',
      apiVersion: '2026-06-01',
      createdAt: '2026-06-01T00:00:00.000Z',
      data: {},
    });
    assertWebhookError(
      () => constructWebhookEvent(malformedTransition, headersFor(malformedTransition, 'evt_bad'), secret, {
        now: nowSeconds,
      }),
      'invalid_payload',
    );

    for (const requiredField of ['templateId', 'fromState', 'toState', 'inputId']) {
      const payload = {
        ...transitionPayload,
        id: `evt_missing_${requiredField}`,
        data: { ...transitionPayload.data },
      };
      delete payload.data[requiredField];
      const rawPayload = body(payload);
      assertWebhookError(
        () => constructWebhookEvent(rawPayload, headersFor(rawPayload, payload.id), secret, {
          now: nowSeconds,
        }),
        'invalid_payload',
      );
    }

    const invalidData = body({
      id: 'evt_bad_data',
      type: 'agreement.transitioned',
      apiVersion: '2026-06-01',
      createdAt: '2026-06-01T00:00:00.000Z',
      data: null,
    });
    assertWebhookError(
      () => constructWebhookEvent(invalidData, headersFor(invalidData, 'evt_bad_data'), secret, {
        now: nowSeconds,
      }),
      'invalid_payload',
    );

    const unsupportedVersion = body({
      id: 'evt_bad_version',
      type: 'webhook.test',
      apiVersion: '2026-05-01',
      createdAt: '2026-06-01T00:00:00.000Z',
      data: {},
    });
    assertWebhookError(
      () => constructWebhookEvent(unsupportedVersion, headersFor(unsupportedVersion, 'evt_bad_version'), secret, {
        now: nowSeconds,
      }),
      'invalid_payload',
    );

    const unknownEvent = body({
      id: 'evt_future',
      type: 'future.event',
      apiVersion: '2026-06-01',
      createdAt: '2026-06-01T00:00:00.000Z',
      data: {},
    });
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
      assert.equal(event.type, 'webhook.test');
    }
  });
});
