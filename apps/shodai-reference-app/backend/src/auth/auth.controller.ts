import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PlatformUserService } from './platform-user.service';
import { ServiceAuthGuard } from './service-auth.guard';

@Controller('auth-api/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly platformUsers: PlatformUserService,
  ) {}

  @Post('signup')
  @HttpCode(HttpStatus.OK)
  async signup(@Body() body: { token?: string; freshAuth?: boolean }) {
    return this.authenticate(body?.token || '', body?.freshAuth === true, 'User created successfully');
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  async signin(@Body() body: { token?: string; freshAuth?: boolean }) {
    return this.authenticate(body?.token || '', body?.freshAuth === true, 'Authentication successful');
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validate(@Headers('authorization') authorization: string) {
    const user = await this.requireUser(authorization);
    return { success: true, user };
  }

  @Get('me')
  me(@Headers('authorization') authorization: string) {
    return this.requireUser(authorization);
  }

  @Get('profile/me')
  profileMe(@Headers('authorization') authorization: string) {
    return this.requireUser(authorization);
  }

  @Get('profile')
  async profile(@Headers('authorization') authorization: string) {
    return { user: await this.requireUser(authorization) };
  }

  @Get('users/by-user-id')
  @UseGuards(ServiceAuthGuard)
  getUserByUserId(@Query('userId') userId: string) {
    return this.platformUsers.resolveByDid(userId);
  }

  @Get('users/by-platform-user-id')
  @UseGuards(ServiceAuthGuard)
  getUserByPlatformUserId(@Query('userId') userId: string) {
    return this.platformUsers.resolveByPlatformUserId(userId);
  }

  @Get('users/by-email')
  @UseGuards(ServiceAuthGuard)
  getUserByEmail(@Query('email') email: string) {
    return this.platformUsers.resolveByEmail(email);
  }

  @Post('users/get-or-create-with-wallet')
  @UseGuards(ServiceAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getOrCreateUserWithWallet(@Body() body: { email?: string }) {
    return { ok: true, ...(await this.platformUsers.getOrCreateUserWithWallet(body.email || '')) };
  }

  private async authenticate(token: string, recordSignIn: boolean, message: string) {
    try {
      const dynamicUser = await this.auth.validateDynamicToken(token);
      const linked = await this.platformUsers.getOrCreateFromDynamic(dynamicUser, recordSignIn);
      return {
        success: true,
        message,
        user: { ...dynamicUser, id: linked.did, platformUserId: linked.platformUserId },
        platformUserId: linked.platformUserId,
      };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Authentication failed' };
    }
  }

  private async requireUser(authorization: string) {
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Missing or invalid authorization header');
    const dynamicUser = await this.auth.validateDynamicToken(authorization.slice(7));
    const linked = await this.platformUsers.getOrCreateFromDynamic(dynamicUser, false);
    return { ...dynamicUser, id: linked.did, platformUserId: linked.platformUserId };
  }
}
