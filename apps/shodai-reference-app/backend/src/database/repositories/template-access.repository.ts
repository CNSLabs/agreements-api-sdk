import { Injectable } from '@nestjs/common';
import { MongoCollectionsService } from '../mongo-collections.service';
import { StandaloneRepository } from '../standalone.repository';

@Injectable()
export class TemplateAccessRepository extends StandaloneRepository<Record<string, any>> {
  constructor(mongo: MongoCollectionsService) {
    super(mongo, 'template_access');
  }
}
