import { Injectable } from '@nestjs/common';
import { MongoCollectionsService } from '../mongo-collections.service';
import { StandaloneRepository } from '../standalone.repository';

@Injectable()
export class UserContactRepository extends StandaloneRepository<Record<string, any>> {
  constructor(mongo: MongoCollectionsService) {
    super(mongo, 'user_contacts');
  }
}
