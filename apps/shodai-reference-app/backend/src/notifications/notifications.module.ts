import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StandaloneRepositoriesModule } from '../database/standalone-repositories.module';
import { NotificationCatalogController } from './notification-catalog.controller';
import { NotificationCatalogService } from './notification-catalog.service';
import { NotificationEmailService } from './notification-email.service';

@Module({
  imports: [AuthModule, StandaloneRepositoriesModule],
  controllers: [NotificationCatalogController],
  providers: [NotificationCatalogService, NotificationEmailService],
  exports: [NotificationCatalogService, NotificationEmailService],
})
export class NotificationsModule {}
