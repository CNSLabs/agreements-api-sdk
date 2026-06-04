import { Body, Controller, Get, Headers, Param, Post, Query, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { PlatformUserService } from '../auth/platform-user.service';
import { ExternalAgreementsService } from './external-agreements.service';

@Controller('agreements-api/agreements')
export class ExternalAgreementsController {
  constructor(
    private readonly auth: AuthService,
    private readonly platformUsers: PlatformUserService,
    private readonly external: ExternalAgreementsService,
  ) {}

  @Post(':id/deploy-with-permit')
  async deploy(@Headers('authorization') authorization: string, @Param('id') id: string, @Body() body: unknown) {
    return this.external.deployWithPermit(id, body, await this.requireUser(authorization));
  }

  @Post(':id/input')
  async input(@Headers('authorization') authorization: string, @Param('id') id: string, @Body() body: unknown, @Query('chainId') chainId?: string) {
    return this.external.submitInput(id, body, await this.requireUser(authorization), { chainId });
  }

  @Get(':id/state')
  async state(@Headers('authorization') authorization: string, @Param('id') id: string, @Query('chainId') chainId?: string) {
    return this.external.readState(id, await this.requireUser(authorization), { chainId });
  }

  @Get(':id/inputs')
  async inputs(@Headers('authorization') authorization: string, @Param('id') id: string, @Query('userId') userId?: string, @Query('chainId') chainId?: string) {
    return this.external.listInputs(id, await this.requireUser(authorization), userId, { chainId });
  }

  private async requireUser(authorization: string) {
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Missing or invalid authorization header');
    const dynamicUser = await this.auth.validateDynamicToken(authorization.slice(7));
    const linked = await this.platformUsers.getOrCreateFromDynamic(dynamicUser, false);
    return { ...dynamicUser, id: linked.did, platformUserId: linked.platformUserId };
  }
}
