import { Injectable } from '@nestjs/common';
import { MongoCollectionsService } from '../mongo-collections.service';
import { StandaloneRepository } from '../standalone.repository';

@Injectable()
export class MigrationMappingRepository extends StandaloneRepository<Record<string, any>> {
  constructor(mongo: MongoCollectionsService) {
    super(mongo, 'migration_mappings');
  }
}
