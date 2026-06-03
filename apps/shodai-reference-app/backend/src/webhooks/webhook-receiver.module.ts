import { Module } from '@nestjs/common';
import { ExternalAgreementsModule } from '../external/external-agreements.module';
import { StandaloneRepositoriesModule } from '../database/standalone-repositories.module';
import { WebhookReceiverController } from './webhook-receiver.controller';
import { WebhookReceiverService } from './webhook-receiver.service';

@Module({
  imports: [ExternalAgreementsModule, StandaloneRepositoriesModule],
  controllers: [WebhookReceiverController],
  providers: [WebhookReceiverService],
})
export class WebhookReceiverModule {}
