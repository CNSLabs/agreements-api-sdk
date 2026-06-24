import { BadRequestException, HttpException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { StandaloneConfigService } from '../config/standalone-config.service';
import { AgreementRepository } from '../database/repositories/agreement.repository';
import { WebhookEventRepository } from '../database/repositories/webhook-event.repository';
import { ExternalAgreementsService } from '../external/external-agreements.service';
import { NotificationEmailService } from '../notifications/notification-email.service';
import type {
  AgreementNotificationTriggeredWebhookEvent,
  AgreementTransitionedWebhookEvent,
  ShodaiWebhookEvent,
} from '@cns-labs/agreements-api-client/webhooks';

@Injectable()
export class WebhookProcessorService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(WebhookProcessorService.name);
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: StandaloneConfigService,
    private readonly agreements: AgreementRepository,
    private readonly webhookEvents: WebhookEventRepository,
    private readonly external: ExternalAgreementsService,
    private readonly notificationEmail: NotificationEmailService,
  ) {}

  onModuleInit() {
    this.interval = setInterval(
      () => this.processDueEventsSafely(),
      this.config.webhookProcessorIntervalMs,
    );
    this.interval.unref?.();
    this.processDueEventsSafely();
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async processDueEvents(limit = 25): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      for (let processed = 0; processed < limit; processed += 1) {
        const now = new Date();
        const event = await this.webhookEvents.claimNextDueEvent({
          now: now.toISOString(),
          leaseCutoff: new Date(now.getTime() - this.config.webhookProcessorLeaseMs).toISOString(),
          lockToken: randomUUID(),
        });
        if (!event) return;

        await this.processClaimedEvent(event);
      }
    } finally {
      this.running = false;
    }
  }

  private processDueEventsSafely(): void {
    void this.processDueEvents().catch((error) => {
      this.logger.warn(`Webhook processor skipped a cycle: ${errorMessage(error)}`);
    });
  }

  private async processClaimedEvent(document: Record<string, any>): Promise<void> {
    const event = document.payload as ShodaiWebhookEvent | undefined;
    if (event?.type === 'agreement.notification.triggered') {
      await this.processNotificationTriggeredEvent(document, event);
      return;
    }

    if (!event || event.type !== 'agreement.transitioned') {
      const updated = await this.webhookEvents.markIgnored(document.eventId, document.lockToken, 'unsupported_event_type', {
        processedAction: 'ignored_unsupported_webhook_event',
      });
      this.logLostLease(document, updated, 'ignore unsupported event');
      return;
    }

    const transitionEvent = event as AgreementTransitionedWebhookEvent;
    const externalAgreementId = transitionEvent.data.agreementId;
    const externalIdAgreement = await this.agreements.findOne({ externalAgreementId });
    const scopedLookup = externalIdAgreement
      ? { agreement: externalIdAgreement, ambiguous: false }
      : await this.agreements.findByIdentifier(externalAgreementId);
    if (scopedLookup.ambiguous) {
      await this.retryOrDeadLetter(
        document,
        'ambiguous_agreement_lookup',
        new BadRequestException('Webhook agreement identifier matches multiple local chains'),
        { externalAgreementId },
      );
      return;
    }
    const agreement = scopedLookup.agreement;

    if (!agreement) {
      await this.retryOrDeadLetter(document, 'agreement_not_found', new Error('Local agreement mirror not found for webhook event'), {
        externalAgreementId,
      });
      return;
    }

    if (isStaleEvent(transitionEvent.createdAt, agreement.lastWebhookEventAt)) {
      const updated = await this.webhookEvents.markIgnored(document.eventId, document.lockToken, 'stale_delivery', {
        agreementId: agreement.id,
        externalAgreementId,
        lastWebhookEventAt: agreement.lastWebhookEventAt,
        processedAction: 'ignored_stale_delivery',
      });
      this.logLostLease(document, updated, 'ignore stale event');
      return;
    }

    try {
      const reconciliation = await this.external.reconcileAgreementMirrorFromWebhook(agreement, transitionEvent, {
        isLeaseCurrent: () => this.webhookEvents.isProcessingLeaseCurrent(document.eventId, document.lockToken),
      });
      if (reconciliation.skippedReason === 'lease_lost') {
        this.logLostLease(document, false, 'reconcile agreement mirror');
        return;
      }
      if (reconciliation.skippedReason === 'stale_delivery') {
        const updated = await this.webhookEvents.markIgnored(document.eventId, document.lockToken, 'stale_delivery', {
          agreementId: agreement.id,
          externalAgreementId,
          lastWebhookEventAt: agreement.lastWebhookEventAt,
          processedAction: 'ignored_stale_delivery',
        });
        this.logLostLease(document, updated, 'ignore stale event after reconciliation race');
        return;
      }
      const updated = await this.webhookEvents.markProcessed(document.eventId, document.lockToken, {
        agreementId: agreement.id,
        externalAgreementId,
        processedAction: 'reconciled_agreement_mirror',
        reconciliation,
      });
      this.logLostLease(document, updated, 'mark processed');
    } catch (error) {
      await this.retryOrDeadLetter(document, 'reconciliation_failed', error, {
        agreementId: agreement.id,
        externalAgreementId,
      });
    }
  }

  private async processNotificationTriggeredEvent(
    document: Record<string, any>,
    event: AgreementNotificationTriggeredWebhookEvent,
  ): Promise<void> {
    try {
      const delivery = await this.notificationEmail.deliverTriggeredNotification(event);
      const updated = await this.webhookEvents.markProcessed(document.eventId, document.lockToken, {
        externalAgreementId: event.data.agreementId,
        processedAction: delivery.skipped ? 'skipped_duplicate_notification_email' : 'sent_notification_email',
        notificationRuleId: event.data.ruleId,
        notificationRecipient: event.data.recipient,
        notificationTriggerType: event.data.triggerType,
        notificationMessageId: delivery.messageId,
      });
      this.logLostLease(document, updated, 'send notification email');
    } catch (error) {
      await this.retryOrDeadLetter(document, 'notification_email_failed', error, {
        externalAgreementId: event.data.agreementId,
        notificationRuleId: event.data.ruleId,
        notificationRecipient: event.data.recipient,
        notificationTriggerType: event.data.triggerType,
      });
    }
  }

  private async retryOrDeadLetter(
    document: Record<string, any>,
    reason: string,
    error: unknown,
    patch: Record<string, unknown> = {},
  ): Promise<void> {
    const attemptCount = Number(document.attemptCount || 0);
    const status = httpStatus(error);
    const shouldRetry = reason === 'agreement_not_found' || !status || status >= 500 || status === 408 || status === 409 || status === 429;

    if (!shouldRetry || attemptCount >= this.config.webhookProcessorMaxAttempts) {
      const updated = await this.webhookEvents.markDeadLetter(document.eventId, document.lockToken, reason, error, {
        ...patch,
        attemptCount,
        maxAttempts: this.config.webhookProcessorMaxAttempts,
      });
      this.logLostLease(document, updated, 'mark dead letter');
      if (reason !== 'agreement_not_found') {
        this.logger.warn(`Webhook event ${document.eventId} moved to dead_letter after ${attemptCount} attempt(s): ${errorMessage(error)}`);
      }
      return;
    }

    const updated = await this.webhookEvents.markRetryScheduled(
      document.eventId,
      document.lockToken,
      this.nextAttemptAt(attemptCount),
      reason,
      error,
      {
        ...patch,
        attemptCount,
        maxAttempts: this.config.webhookProcessorMaxAttempts,
      },
    );
    this.logLostLease(document, updated, 'schedule retry');
  }

  private nextAttemptAt(attemptCount: number): string {
    const delayMs = Math.min(
      this.config.webhookProcessorRetryMaxMs,
      this.config.webhookProcessorRetryBaseMs * (2 ** Math.max(0, attemptCount - 1)),
    );
    return new Date(Date.now() + delayMs).toISOString();
  }

  private logLostLease(document: Record<string, any>, updated: boolean, action: string): void {
    if (updated) return;
    this.logger.warn(`Webhook event ${document.eventId} lost processing lease before ${action}; another worker may own it.`);
  }
}

function isStaleEvent(createdAt: string, lastWebhookEventAt: unknown): boolean {
  if (typeof lastWebhookEventAt !== 'string' || !lastWebhookEventAt) return false;
  const eventTime = new Date(createdAt).getTime();
  const lastTime = new Date(lastWebhookEventAt).getTime();
  return Number.isFinite(eventTime) && Number.isFinite(lastTime) && eventTime < lastTime;
}

function httpStatus(error: unknown): number | null {
  if (error instanceof HttpException) return error.getStatus();
  const candidate = error as { status?: unknown; response?: { status?: unknown } } | null;
  const status = candidate?.status ?? candidate?.response?.status;
  return typeof status === 'number' ? status : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
