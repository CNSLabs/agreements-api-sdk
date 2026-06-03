import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StandaloneRepositoriesModule } from '../database/standalone-repositories.module';
import { ExternalAgreementsController } from './external-agreements.controller';
import { ExternalAgreementsService } from './external-agreements.service';

@Module({
  imports: [AuthModule, StandaloneRepositoriesModule],
  controllers: [ExternalAgreementsController],
  providers: [ExternalAgreementsService],
  exports: [ExternalAgreementsService],
})
export class ExternalAgreementsModule {}
