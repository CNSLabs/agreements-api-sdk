import { Module } from '@nestjs/common';
import { TemplateCatalogController } from './template-catalog.controller';
import { TemplateCatalogService } from './template-catalog.service';

@Module({
  controllers: [TemplateCatalogController],
  providers: [TemplateCatalogService],
  exports: [TemplateCatalogService],
})
export class TemplateCatalogModule {}
