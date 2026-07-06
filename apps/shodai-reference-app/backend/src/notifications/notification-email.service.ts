import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { StandaloneConfigService } from '../config/standalone-config.service';
import { AgreementRepository } from '../database/repositories/agreement.repository';
import { NotificationDeliveryRepository } from '../database/repositories/notification-delivery.repository';
import { wrapNotificationHtml } from './notification-email-html';
import { resolveNotificationAttachments, type EmailAttachment } from './notification-attachments';
import type { AgreementNotificationTriggeredWebhookEvent } from '@shodai-network/agreements-api-client/webhooks';

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
    const attachments = await resolveNotificationAttachments({
      event,
      localAgreementId,
      logger: this.logger,
    });
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
        Content: attachments.length > 0
          ? {
              Raw: {
                Data: Buffer.from(buildRawMimeEmail({
                  from: this.config.sesFromAddress,
                  to: [recipient],
                  subject,
                  text: body || subject,
                  html,
                  attachments,
                }), 'utf8'),
              },
            }
          : {
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

function wrapBase64(value: string): string {
  return value.replace(/(.{76})/g, '$1\r\n');
}

function toBase64Utf8(value: string): string {
  return wrapBase64(Buffer.from(value, 'utf8').toString('base64'));
}

function escapeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function encodeMimeHeaderValue(value: string): string {
  const escaped = escapeHeaderValue(value);
  if (!escaped) return escaped;
  if (/^[\x20-\x7E]*$/.test(escaped)) return escaped;
  return `=?UTF-8?B?${Buffer.from(escaped, 'utf8').toString('base64')}?=`;
}

function buildRawMimeEmail(params: {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  attachments: EmailAttachment[];
}): string {
  const mixedBoundary = `mixed_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const altBoundary = `alt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const lines: string[] = [
    `From: ${params.from}`,
    `To: ${params.to.join(', ')}`,
    `Subject: ${encodeMimeHeaderValue(params.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    toBase64Utf8(params.text),
    '',
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    toBase64Utf8(params.html),
    '',
    `--${altBoundary}--`,
  ];

  for (const attachment of params.attachments) {
    lines.push(
      '',
      `--${mixedBoundary}`,
      `Content-Type: ${attachment.contentType}; name="${escapeHeaderValue(attachment.filename)}"`,
      `Content-Disposition: attachment; filename="${escapeHeaderValue(attachment.filename)}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64(attachment.contentBase64),
    );
  }

  lines.push('', `--${mixedBoundary}--`, '');
  return lines.join('\r\n');
}
