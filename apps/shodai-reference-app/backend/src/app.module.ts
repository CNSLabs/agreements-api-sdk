import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { TemplateCatalogModule } from './templates/template-catalog.module';
import { TemplateAccessModule } from './templates/template-access.module';
import { DraftAgreementsModule } from './agreements/draft-agreements.module';
import { ExternalAgreementsModule } from './external/external-agreements.module';
import { AdminModule } from './admin/admin.module';
import { MigrationModule } from './migration/migration.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { StandaloneConfigModule } from './config/standalone-config.module';
import { StandaloneRepositoriesModule } from './database/standalone-repositories.module';
import { WebhookReceiverModule } from './webhooks/webhook-receiver.module';
import { NotificationsModule } from './notifications/notifications.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    StandaloneConfigModule,
    StandaloneRepositoriesModule,
    AuthModule,
    TemplateCatalogModule,
    TemplateAccessModule,
    DraftAgreementsModule,
    ExternalAgreementsModule,
    AdminModule,
    MigrationModule,
    TelemetryModule,
    NotificationsModule,
    WebhookReceiverModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
