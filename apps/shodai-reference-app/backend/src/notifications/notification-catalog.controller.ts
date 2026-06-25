import { Controller, Get, Headers, Param, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { PlatformUserService } from '../auth/platform-user.service';
import { NotificationCatalogService } from './notification-catalog.service';

@Controller('agreements-api/notifications/templates')
export class NotificationCatalogController {
  constructor(
    private readonly auth: AuthService,
    private readonly platformUsers: PlatformUserService,
    private readonly catalog: NotificationCatalogService,
  ) {}

  @Get('by-agreement-template/:agreementTemplateId')
  async getByAgreementTemplateId(
    @Headers('authorization') authorization: string,
    @Param('agreementTemplateId') agreementTemplateId: string,
  ) {
    await this.requireUser(authorization);
    return this.catalog.requireTemplateByAgreementTemplateId(decodeURIComponent(agreementTemplateId));
  }

  private async requireUser(authorization: string) {
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Missing or invalid authorization header');
    const dynamicUser = await this.auth.validateDynamicToken(authorization.slice(7));
    const linked = await this.platformUsers.getOrCreateFromDynamic(dynamicUser, false);
    return { ...dynamicUser, id: linked.did, platformUserId: linked.platformUserId };
  }
}
