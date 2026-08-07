import fixture from './fixtures/agreement-transitioned-sequence.json' with {
  type: 'json',
};
import type { AgreementTransitionedWebhookEvent } from '../src/webhooks.js';

const typedFixture = {
  ...fixture.webhookPayload,
  type: fixture.webhookPayload.type as 'agreement.transitioned',
  apiVersion: fixture.webhookPayload.apiVersion as '2026-06-01',
} satisfies AgreementTransitionedWebhookEvent;

const sequence: number | undefined = typedFixture.data.sequence;
void sequence;
