import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StandaloneRepositoriesModule } from '../database/standalone-repositories.module';
import { TemplateCatalogModule } from '../templates/template-catalog.module';
import { ExternalAgreementsModule } from '../external/external-agreements.module';
import { DraftAgreementsController } from './draft-agreements.controller';
import { DraftAgreementsService } from './draft-agreements.service';

@Module({
  imports: [AuthModule, StandaloneRepositoriesModule, TemplateCatalogModule, ExternalAgreementsModule],
  controllers: [DraftAgreementsController],
  providers: [DraftAgreementsService],
  exports: [DraftAgreementsService],
})
export class DraftAgreementsModule {}
