import { Module } from '@nestjs/common';
import { PlatformUserRepository } from './repositories/platform-user.repository';
import { UserIdentityRepository } from './repositories/user-identity.repository';
import { UserContactRepository } from './repositories/user-contact.repository';
import { UserWalletRepository } from './repositories/user-wallet.repository';
import { TemplateAccessRepository } from './repositories/template-access.repository';
import { AgreementRepository } from './repositories/agreement.repository';
import { AgreementInputRepository } from './repositories/agreement-input.repository';
import { ExternalApiEventRepository } from './repositories/external-api-event.repository';
import { MigrationMappingRepository } from './repositories/migration-mapping.repository';
import { WebhookEventRepository } from './repositories/webhook-event.repository';
import { NotificationDeliveryRepository } from './repositories/notification-delivery.repository';

const repositories = [
  PlatformUserRepository,
  UserIdentityRepository,
  UserContactRepository,
  UserWalletRepository,
  TemplateAccessRepository,
  AgreementRepository,
  AgreementInputRepository,
  ExternalApiEventRepository,
  MigrationMappingRepository,
  WebhookEventRepository,
  NotificationDeliveryRepository,
];

@Module({
  providers: repositories,
  exports: repositories,
})
export class StandaloneRepositoriesModule {}
