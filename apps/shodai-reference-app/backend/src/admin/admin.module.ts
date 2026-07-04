import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TemplateAccessAdminController } from '../templates/template-access-admin.controller';
import { TemplateAccessModule } from '../templates/template-access.module';

@Module({
  imports: [AuthModule, TemplateAccessModule],
  controllers: [TemplateAccessAdminController],
})
export class AdminModule {}
