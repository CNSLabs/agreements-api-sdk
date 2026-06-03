import { Filter, FindOptions, OptionalUnlessRequiredId, UpdateFilter, UpdateOptions } from 'mongodb';
import { MongoCollectionsService } from './mongo-collections.service';

export class StandaloneRepository<T extends Record<string, any>> {
  constructor(
    protected readonly mongo: MongoCollectionsService,
    private readonly collectionName: string,
  ) {}

  async find(filter: Filter<T> = {}, options: FindOptions<T> = {}): Promise<T[]> {
    return (await this.mongo.collection<T>(this.collectionName))
      .find(filter, { ...options, projection: { _id: 0, ...(options.projection || {}) } })
      .toArray() as Promise<T[]>;
  }

  async findOne(filter: Filter<T>): Promise<T | null> {
    return (await this.mongo.collection<T>(this.collectionName))
      .findOne(filter, { projection: { _id: 0 } }) as Promise<T | null>;
  }

  async insertOne(document: OptionalUnlessRequiredId<T>): Promise<void> {
    await (await this.mongo.collection<T>(this.collectionName)).insertOne(document);
  }

  async upsertOne(filter: Filter<T>, document: T, options: UpdateOptions = {}): Promise<void> {
    const { _id, ...setDocument } = document;
    const update = _id === undefined
      ? { $set: setDocument }
      : { $set: setDocument, $setOnInsert: { _id } };
    await (await this.mongo.collection<T>(this.collectionName)).updateOne(
      filter,
      update as UpdateFilter<T>,
      { ...options, upsert: true },
    );
  }

  async updateOne(filter: Filter<T>, update: UpdateFilter<T>, options: UpdateOptions = {}): Promise<number> {
    const result = await (await this.mongo.collection<T>(this.collectionName)).updateOne(filter, update, options);
    return result.modifiedCount + result.upsertedCount;
  }

  async deleteOne(filter: Filter<T>): Promise<number> {
    const result = await (await this.mongo.collection<T>(this.collectionName)).deleteOne(filter);
    return result.deletedCount ?? 0;
  }
}
