import { Injectable } from '@nestjs/common';
import { MongoCollectionsService } from '../mongo-collections.service';
import { StandaloneRepository } from '../standalone.repository';

@Injectable()
export class PlatformUserRepository extends StandaloneRepository<Record<string, any>> {
  constructor(mongo: MongoCollectionsService) {
    super(mongo, 'platform_users');
  }
}
