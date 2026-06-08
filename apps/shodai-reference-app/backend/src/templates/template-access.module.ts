import { Module } from '@nestjs/common';
import { StandaloneRepositoriesModule } from '../database/standalone-repositories.module';
import { TemplateCatalogModule } from './template-catalog.module';
import { TemplateAccessService } from './template-access.service';

@Module({
  imports: [StandaloneRepositoriesModule, TemplateCatalogModule],
  providers: [TemplateAccessService],
  exports: [TemplateAccessService],
})
export class TemplateAccessModule {}
