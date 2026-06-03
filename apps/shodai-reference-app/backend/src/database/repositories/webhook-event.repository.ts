import { Injectable } from '@nestjs/common';
import { MongoCollectionsService } from '../mongo-collections.service';
import { StandaloneRepository } from '../standalone.repository';

type WebhookEventDocument = Record<string, any>;

@Injectable()
export class WebhookEventRepository extends StandaloneRepository<WebhookEventDocument> {
  constructor(mongo: MongoCollectionsService) {
    super(mongo, 'webhook_events');
  }

  async insertWebhookEvent(document: WebhookEventDocument): Promise<boolean> {
    const result = await (await this.mongo.collection<WebhookEventDocument>('webhook_events')).updateOne(
      { eventId: document.eventId },
      { $setOnInsert: document },
      { upsert: true },
    );
    return result.upsertedCount === 1;
  }

  async findByEventId(eventId: string): Promise<WebhookEventDocument | null> {
    return this.findOne({ eventId });
  }

  async claimNextDueEvent(params: {
    now: string;
    leaseCutoff: string;
    lockToken: string;
  }): Promise<WebhookEventDocument | null> {
    const collection = await this.mongo.collection<WebhookEventDocument>('webhook_events');
    return collection.findOneAndUpdate(
      {
        $or: [
          {
            status: { $in: ['queued', 'retry_scheduled'] },
            $or: [
              { nextAttemptAt: { $exists: false } },
              { nextAttemptAt: { $lte: params.now } },
            ],
          },
          {
            status: 'processing',
            lockedAt: { $lte: params.leaseCutoff },
          },
        ],
      },
      {
        $set: {
          status: 'processing',
          lockedAt: params.now,
          lockToken: params.lockToken,
          lastAttemptAt: params.now,
          updatedAt: params.now,
        },
        $inc: { attemptCount: 1 },
        $unset: {
          error: '',
          ignoredReason: '',
          retryReason: '',
          retryScheduledAt: '',
          nextAttemptAt: '',
          processedAt: '',
          deadLetteredAt: '',
        },
      },
      {
        sort: { nextAttemptAt: 1, receivedAt: 1 },
        returnDocument: 'after',
        projection: { _id: 0 },
      },
    );
  }

  async markProcessed(eventId: string, patch: Record<string, unknown> = {}): Promise<void> {
    await this.updateOne(
      { eventId },
      {
        $set: {
          ...patch,
          status: 'processed',
          processedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        $unset: {
          error: '',
          ignoredReason: '',
          retryReason: '',
          retryStartedAt: '',
          retryScheduledAt: '',
          nextAttemptAt: '',
          lockedAt: '',
          lockToken: '',
          deadLetteredAt: '',
        },
      },
    );
  }

  async recordDuplicateDelivery(eventId: string): Promise<void> {
    await this.updateOne(
      { eventId },
      {
        $inc: { duplicateDeliveryCount: 1 },
        $set: {
          lastDuplicateAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    );
  }

  async markRetryScheduled(eventId: string, nextAttemptAt: string, reason: string, error: unknown, patch: Record<string, unknown> = {}): Promise<void> {
    await this.updateOne(
      { eventId },
      {
        $set: {
          ...patch,
          status: 'retry_scheduled',
          retryReason: reason,
          error: error instanceof Error ? error.message : String(error),
          retryScheduledAt: new Date().toISOString(),
          nextAttemptAt,
          updatedAt: new Date().toISOString(),
        },
        $unset: {
          ignoredReason: '',
          processedAt: '',
          lockedAt: '',
          lockToken: '',
          deadLetteredAt: '',
        },
      },
    );
  }

  async markIgnored(eventId: string, reason: string, patch: Record<string, unknown> = {}): Promise<void> {
    await this.updateOne(
      { eventId },
      {
        $set: {
          ...patch,
          status: 'ignored',
          ignoredReason: reason,
          processedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        $unset: {
          error: '',
          retryReason: '',
          retryStartedAt: '',
          retryScheduledAt: '',
          nextAttemptAt: '',
          lockedAt: '',
          lockToken: '',
          deadLetteredAt: '',
        },
      },
    );
  }

  async markDeadLetter(eventId: string, reason: string, error: unknown, patch: Record<string, unknown> = {}): Promise<void> {
    await this.updateOne(
      { eventId },
      {
        $set: {
          ...patch,
          status: 'dead_letter',
          deadLetterReason: reason,
          error: error instanceof Error ? error.message : String(error),
          deadLetteredAt: new Date().toISOString(),
          processedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        $unset: {
          ignoredReason: '',
          retryReason: '',
          retryStartedAt: '',
          retryScheduledAt: '',
          nextAttemptAt: '',
          lockedAt: '',
          lockToken: '',
        },
      },
    );
  }
}
