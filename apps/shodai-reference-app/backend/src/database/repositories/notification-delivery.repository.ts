import { Injectable } from '@nestjs/common';
import { MongoCollectionsService } from '../mongo-collections.service';
import { StandaloneRepository } from '../standalone.repository';

type NotificationDeliveryDocument = Record<string, any>;

@Injectable()
export class NotificationDeliveryRepository extends StandaloneRepository<NotificationDeliveryDocument> {
  constructor(mongo: MongoCollectionsService) {
    super(mongo, 'notification_deliveries');
  }

  async findByWebhookEventId(webhookEventId: string): Promise<NotificationDeliveryDocument | null> {
    return this.findOne({ webhookEventId });
  }

  async markSending(webhookEventId: string, document: NotificationDeliveryDocument): Promise<void> {
    const now = new Date().toISOString();
    await this.updateOne(
      { webhookEventId },
      {
        $setOnInsert: {
          ...document,
          webhookEventId,
          createdAt: now,
        },
        $set: {
          status: 'sending',
          lastAttemptAt: now,
          updatedAt: now,
        },
        $inc: { attemptCount: 1 },
        $unset: { error: '' },
      },
      { upsert: true },
    );
  }

  async markSent(webhookEventId: string, patch: NotificationDeliveryDocument): Promise<void> {
    await this.updateOne(
      { webhookEventId },
      {
        $set: {
          ...patch,
          status: 'sent',
          sentAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        $unset: { error: '' },
      },
    );
  }

  async markFailed(webhookEventId: string, error: unknown): Promise<void> {
    await this.updateOne(
      { webhookEventId },
      {
        $set: {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          failedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    );
  }
}
