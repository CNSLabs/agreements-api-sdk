import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { StandaloneConfigService } from '../config/standalone-config.service';
import { WebhookEventRepository } from '../database/repositories/webhook-event.repository';
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
    private readonly webhookEvents: WebhookEventRepository,
  ) {}

  async receive(rawBody: WebhookRawBody, headers: WebhookHeaders): Promise<void> {
    const event = await this.constructEvent(rawBody, headers);
    const now = new Date().toISOString();
    const inserted = await this.webhookEvents.insertWebhookEvent({
      eventId: event.id,
      type: event.type,
      apiVersion: event.apiVersion,
      payload: event,
      status: event.type === 'webhook.test' ? 'processed' : 'queued',
      receivedAt: now,
      createdAt: event.createdAt,
      updatedAt: now,
      ...(event.type === 'webhook.test'
        ? {
          processedAt: now,
          processedAction: 'verified_test_event',
        }
        : {
          attemptCount: 0,
          duplicateDeliveryCount: 0,
          nextAttemptAt: now,
        }),
    });

    if (!inserted) {
      await this.webhookEvents.recordDuplicateDelivery(event.id);
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
}
