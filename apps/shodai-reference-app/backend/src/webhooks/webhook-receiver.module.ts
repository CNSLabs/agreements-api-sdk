import { Module } from '@nestjs/common';
import { ExternalAgreementsModule } from '../external/external-agreements.module';
import { StandaloneRepositoriesModule } from '../database/standalone-repositories.module';
import { WebhookReceiverController } from './webhook-receiver.controller';
import { WebhookProcessorService } from './webhook-processor.service';
import { WebhookReceiverService } from './webhook-receiver.service';

@Module({
  imports: [ExternalAgreementsModule, StandaloneRepositoriesModule],
  controllers: [WebhookReceiverController],
  providers: [WebhookProcessorService, WebhookReceiverService],
})
export class WebhookReceiverModule {}
