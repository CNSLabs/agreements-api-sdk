import { Global, Module } from '@nestjs/common';
import { StandaloneConfigService } from './standalone-config.service';
import { MongoCollectionsService } from '../database/mongo-collections.service';
import { PublicConfigController } from './public-config.controller';

@Global()
@Module({
  controllers: [PublicConfigController],
  providers: [StandaloneConfigService, MongoCollectionsService],
  exports: [StandaloneConfigService, MongoCollectionsService],
})
export class StandaloneConfigModule {}
