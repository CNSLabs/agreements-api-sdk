import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { StandaloneConfigService } from '../config/standalone-config.service';
import { AgreementRepository } from '../database/repositories/agreement.repository';
import { WebhookEventRepository } from '../database/repositories/webhook-event.repository';
import { ExternalAgreementsService } from '../external/external-agreements.service';
import type {
  ShodaiWebhookEvent,
  WebhookHeaders,
  WebhookRawBody,
} from '@cns-labs/agreements-api-client/webhooks';

type WebhookModule = typeof import('@cns-labs/agreements-api-client/webhooks');

const importWebhookModule = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<WebhookModule>;

@Injectable()
export class WebhookReceiverService {
  constructor(
    private readonly config: StandaloneConfigService,
    private readonly agreements: AgreementRepository,
    private readonly webhookEvents: WebhookEventRepository,
    private readonly external: ExternalAgreementsService,
  ) {}

  async receive(rawBody: WebhookRawBody, headers: WebhookHeaders): Promise<void> {
    const event = await this.constructEvent(rawBody, headers);
    const now = new Date().toISOString();
    const inserted = await this.webhookEvents.insertReceivedEvent({
      eventId: event.id,
      type: event.type,
      apiVersion: event.apiVersion,
      payload: event,
      status: 'received',
      receivedAt: now,
      createdAt: event.createdAt,
      updatedAt: now,
    });

    if (!inserted) {
      await this.webhookEvents.recordDuplicateDelivery(event.id);
      return;
    }

    try {
      if (event.type === 'webhook.test') {
        await this.webhookEvents.markProcessed(event.id, { processedAction: 'verified_test_event' });
        return;
      }

      await this.handleAgreementTransition(event);
    } catch (error) {
      await this.webhookEvents.markFailed(event.id, error);
      throw error;
    }
  }

  private async constructEvent(rawBody: WebhookRawBody, headers: WebhookHeaders): Promise<ShodaiWebhookEvent> {
    if (!this.config.shodaiWebhookSecret) {
      throw new InternalServerErrorException('SHODAI_WEBHOOK_SECRET is required to receive Shodai webhooks');
    }

    const { constructWebhookEvent, WebhookVerificationError } = await importWebhookModule(
      '@cns-labs/agreements-api-client/webhooks',
    );

    try {
      return constructWebhookEvent(rawBody, headers, this.config.shodaiWebhookSecret, {
        toleranceSeconds: this.config.shodaiWebhookToleranceSeconds,
      });
    } catch (error) {
      if (error instanceof WebhookVerificationError) {
        throw new BadRequestException({
          error: 'webhook_verification_failed',
          code: error.code,
          header: error.header,
        });
      }
      throw error;
    }
  }

  private async handleAgreementTransition(event: Extract<ShodaiWebhookEvent, { type: 'agreement.transitioned' }>): Promise<void> {
    const externalAgreementId = event.data.agreementId;
    const agreement = (await this.agreements.findOne({ externalAgreementId })) ||
      (await this.agreements.findOne({ id: externalAgreementId })) ||
      (await this.agreements.findOne({ address: externalAgreementId }));

    if (!agreement) {
      await this.webhookEvents.markIgnored(event.id, 'agreement_not_found', { externalAgreementId });
      return;
    }

    if (isStaleEvent(event.createdAt, agreement.lastWebhookEventAt)) {
      await this.webhookEvents.markIgnored(event.id, 'stale_delivery', {
        agreementId: agreement.id,
        externalAgreementId,
        lastWebhookEventAt: agreement.lastWebhookEventAt,
      });
      return;
    }

    const reconciliation = await this.external.reconcileAgreementMirrorFromWebhook(agreement, event);
    await this.webhookEvents.markProcessed(event.id, {
      agreementId: agreement.id,
      externalAgreementId,
      processedAction: 'reconciled_agreement_mirror',
      reconciliation,
    });
  }
}

function isStaleEvent(createdAt: string, lastWebhookEventAt: unknown): boolean {
  if (typeof lastWebhookEventAt !== 'string' || !lastWebhookEventAt) return false;
  const eventTime = new Date(createdAt).getTime();
  const lastTime = new Date(lastWebhookEventAt).getTime();
  return Number.isFinite(eventTime) && Number.isFinite(lastTime) && eventTime < lastTime;
}
