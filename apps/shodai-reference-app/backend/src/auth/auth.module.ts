import { Module } from '@nestjs/common';
import { StandaloneRepositoriesModule } from '../database/standalone-repositories.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PlatformUserService } from './platform-user.service';
import { ServiceAuthGuard } from './service-auth.guard';

@Module({
  imports: [StandaloneRepositoriesModule],
  controllers: [AuthController],
  providers: [AuthService, PlatformUserService, ServiceAuthGuard],
  exports: [AuthService, PlatformUserService, ServiceAuthGuard],
})
export class AuthModule {}
