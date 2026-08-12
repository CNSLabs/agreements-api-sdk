import { Module } from '@nestjs/common';
import { ExternalAgreementsModule } from '../external/external-agreements.module';
import { StandaloneRepositoriesModule } from '../database/standalone-repositories.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AgreementEventStreamController } from './agreement-event-stream.controller';
import { AgreementEventStreamService } from './agreement-event-stream.service';
import { WebhookReceiverController } from './webhook-receiver.controller';
import { WebhookProcessorService } from './webhook-processor.service';
import { WebhookReceiverService } from './webhook-receiver.service';

@Module({
  imports: [ExternalAgreementsModule, StandaloneRepositoriesModule, NotificationsModule],
  controllers: [WebhookReceiverController, AgreementEventStreamController],
  providers: [WebhookProcessorService, WebhookReceiverService, AgreementEventStreamService],
})
export class WebhookReceiverModule {}
