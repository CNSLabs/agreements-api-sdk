import { Injectable } from '@nestjs/common';
import { MongoCollectionsService } from '../mongo-collections.service';
import { StandaloneRepository } from '../standalone.repository';

type WebhookEventDocument = Record<string, any>;

@Injectable()
export class WebhookEventRepository extends StandaloneRepository<WebhookEventDocument> {
  constructor(mongo: MongoCollectionsService) {
    super(mongo, 'webhook_events');
  }

  async insertReceivedEvent(document: WebhookEventDocument): Promise<boolean> {
    const result = await (await this.mongo.collection<WebhookEventDocument>('webhook_events')).updateOne(
      { eventId: document.eventId },
      { $setOnInsert: document },
      { upsert: true },
    );
    return result.upsertedCount === 1;
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
      },
    );
  }

  async markFailed(eventId: string, error: unknown): Promise<void> {
    await this.updateOne(
      { eventId },
      {
        $set: {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          processedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    );
  }
}
