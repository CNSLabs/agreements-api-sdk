import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { StandaloneConfigService } from '../config/standalone-config.service';
import { AgreementRepository } from '../database/repositories/agreement.repository';
import { NotificationDeliveryRepository } from '../database/repositories/notification-delivery.repository';
import { wrapNotificationHtml } from './notification-email-html';
import type { AgreementNotificationTriggeredWebhookEvent } from '@cns-labs/agreements-api-client/webhooks';

@Injectable()
export class NotificationEmailService {
  private readonly logger = new Logger(NotificationEmailService.name);
  private readonly client: SESv2Client;

  constructor(
    private readonly config: StandaloneConfigService,
    private readonly deliveries: NotificationDeliveryRepository,
    private readonly agreements: AgreementRepository,
  ) {
    this.client = new SESv2Client({ region: this.config.awsRegion || undefined });
  }

  async deliverTriggeredNotification(event: AgreementNotificationTriggeredWebhookEvent): Promise<{ messageId: string; skipped?: boolean }> {
    const existing = await this.deliveries.findByWebhookEventId(event.id);
    if (existing?.status === 'sent' && existing.messageId) {
      return { messageId: existing.messageId, skipped: true };
    }

    const recipient = normalizeEmail(event.data.recipient);
    if (!recipient) {
      throw new BadRequestException('Notification webhook recipient must be an email address');
    }
    if (!this.config.sesFromAddress) {
      throw new BadRequestException('SES_FROM_ADDRESS is required to deliver notification emails');
    }

    const subject = String(event.data.notification.subject || '').trim();
    if (!subject) throw new BadRequestException('Notification webhook subject is required');
    const body = String(event.data.notification.body || '');
    const localAgreementId = await this.resolveLocalAgreementId(event.data.agreementId);
    const ctaUrl = this.buildAgreementUrl(localAgreementId, recipient);
    const html = wrapNotificationHtml({
      subject,
      title: event.data.notification.title,
      body,
      ctaUrl,
      ctaLabel: event.data.notification.ctaLabel || 'View Agreement',
      agreementName: event.data.agreementName,
    });

    await this.deliveries.markSending(event.id, {
      agreementId: event.data.agreementId,
      localAgreementId,
      agreementName: event.data.agreementName,
      templateId: event.data.templateId,
      notificationTemplateId: event.data.notificationTemplateId,
      ruleId: event.data.ruleId,
      triggerType: event.data.triggerType,
      recipient,
      subject,
      webhookCreatedAt: event.createdAt,
      transition: event.data.transition,
    });

    try {
      const result = await this.client.send(new SendEmailCommand({
        FromEmailAddress: this.config.sesFromAddress,
        Destination: { ToAddresses: [recipient] },
        ...(this.config.sesConfigurationSet ? { ConfigurationSetName: this.config.sesConfigurationSet } : {}),
        Content: {
          Simple: {
            Subject: { Data: subject },
            Body: {
              Text: { Data: body || subject },
              Html: { Data: html },
            },
          },
        },
        EmailTags: [
          { Name: 'source', Value: 'shodai-reference-app' },
          { Name: 'kind', Value: 'agreement-notification' },
          { Name: 'ruleId', Value: sanitizeSesTagValue(event.data.ruleId) },
        ],
      }));
      if (!result.MessageId) throw new Error('SES response missing MessageId');
      await this.deliveries.markSent(event.id, { messageId: result.MessageId });
      return { messageId: result.MessageId };
    } catch (error) {
      await this.deliveries.markFailed(event.id, error);
      this.logger.error(`Failed to deliver notification webhook ${event.id} via SES`, error instanceof Error ? error.stack : String(error));
      throw new InternalServerErrorException('Failed to send notification email');
    }
  }

  private buildAgreementUrl(agreementId: string, email: string): string | undefined {
    try {
      const base = this.config.frontendBaseUrl.endsWith('/') ? this.config.frontendBaseUrl : `${this.config.frontendBaseUrl}/`;
      const url = new URL(`agreement/${agreementId}/actions`, base);
      url.searchParams.set('email', email);
      return url.toString();
    } catch {
      return undefined;
    }
  }

  private async resolveLocalAgreementId(externalAgreementId: string): Promise<string> {
    const agreement = await this.agreements.findOne({ externalAgreementId });
    return String(agreement?.id || externalAgreementId);
  }
}

function normalizeEmail(value: unknown): string {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function sanitizeSesTagValue(value: string): string {
  return String(value || 'unknown').replace(/[^A-Za-z0-9_.@-]/g, '_').slice(0, 256) || 'unknown';
}
