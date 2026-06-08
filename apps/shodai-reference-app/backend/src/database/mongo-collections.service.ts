import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Collection, Db, Document, MongoClient } from 'mongodb';
import { StandaloneConfigService } from '../config/standalone-config.service';

@Injectable()
export class MongoCollectionsService implements OnModuleDestroy, OnModuleInit {
  private client: MongoClient | null = null;
  private db: Db | null = null;

  constructor(private readonly config: StandaloneConfigService) {}

  async onModuleInit() {
    if (this.config.nodeEnv === 'test' && (!this.config.mongoUri || !this.config.mongoDbName)) return;
    await this.ensureIndexes();
  }

  async getDb(): Promise<Db> {
    if (!this.db) {
      this.client = new MongoClient(this.config.mongoUri, {
        maxPoolSize: 10,
        minPoolSize: 1,
        serverSelectionTimeoutMS: 5000,
      });
      await this.client.connect();
      this.db = this.client.db(this.config.mongoDbName);
    }

    return this.db;
  }

  async collection<T extends Document>(name: string): Promise<Collection<T>> {
    return (await this.getDb()).collection<T>(name);
  }

  async ensureIndexes(): Promise<void> {
    const db = await this.getDb();
    await Promise.all([
      db.collection('platform_users').createIndex({ id: 1 }, { unique: true }),
      db.collection('user_identities').createIndex({ provider: 1, subject: 1 }, { unique: true, sparse: true }),
      db.collection('user_identities').createIndex({ userId: 1 }),
      db.collection('user_contacts').createIndex({ type: 1, valueNormalized: 1 }, { unique: true, sparse: true }),
      db.collection('user_contacts').createIndex({ userId: 1 }),
      db.collection('user_wallets').createIndex({ address: 1 }, { unique: true, sparse: true }),
      db.collection('user_wallets').createIndex({ did: 1 }, { unique: true, sparse: true }),
      db.collection('user_wallets').createIndex({ userId: 1 }),
      db.collection('template_access').createIndex({ kind: 1, platformUserId: 1 }),
      db.collection('agreements').createIndex({ id: 1 }, { unique: true }),
      db.collection('agreements').createIndex({ address: 1 }, { sparse: true }),
      db.collection('agreements').createIndex({ chainId: 1, address: 1 }),
      db.collection('agreements').createIndex({ owner: 1 }),
      db.collection('agreements').createIndex({ contributors: 1 }),
      db.collection('agreements').createIndex({ observers: 1 }),
      db.collection('agreement_inputs').createIndex({ agreementAddress: 1, createdAt: -1 }),
      db.collection('agreement_inputs').createIndex({ agreementId: 1, chainId: 1, txHash: 1 }),
      db.collection('agreement_inputs').createIndex({ chainId: 1, agreementAddress: 1, txHash: 1 }),
      db.collection('agreement_inputs').createIndex(
        { agreementId: 1, chainId: 1, dedupeKey: 1 },
        { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } },
      ),
      db.collection('external_api_events').createIndex({ createdAt: -1 }),
      db.collection('webhook_events').createIndex({ eventId: 1 }, { unique: true }),
      db.collection('webhook_events').createIndex({ agreementId: 1, createdAt: -1 }),
      db.collection('webhook_events').createIndex({ status: 1, receivedAt: -1 }),
      db.collection('webhook_events').createIndex({ status: 1, nextAttemptAt: 1, receivedAt: 1 }),
      db.collection('webhook_events').createIndex({ status: 1, lockedAt: 1 }),
      db.collection('migration_mappings').createIndex({ id: 1 }, { unique: true }),
    ]);
  }

  async onModuleDestroy() {
    await this.client?.close();
  }
}
