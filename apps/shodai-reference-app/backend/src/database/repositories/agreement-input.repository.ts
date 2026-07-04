import { Injectable } from '@nestjs/common';
import type { Filter } from 'mongodb';
import { MongoCollectionsService } from '../mongo-collections.service';
import { StandaloneRepository } from '../standalone.repository';

@Injectable()
export class AgreementInputRepository extends StandaloneRepository<Record<string, any>> {
  constructor(mongo: MongoCollectionsService) {
    super(mongo, 'agreement_inputs');
  }

  async upsertInputMirror(
    filter: Filter<Record<string, any>>,
    document: Record<string, any>,
    legacyFilter?: Filter<Record<string, any>>,
  ): Promise<void> {
    const { _id, ...setDocument } = document;
    if (legacyFilter) {
      const updated = await this.updateOne(
        { ...legacyFilter, dedupeKey: { $exists: false } },
        { $set: setDocument },
      );
      if (updated > 0) return;
    }

    try {
      await this.upsertOne(filter, document);
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;

      await this.updateOne(filter, { $set: setDocument });
    }
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;
}
