import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { PlatformUserService } from '../auth/platform-user.service';
import { ExternalAgreementsService } from '../external/external-agreements.service';
import { DraftAgreementsService } from './draft-agreements.service';

@Controller('agreements-api/agreements')
export class DraftAgreementsController {
  constructor(
    private readonly auth: AuthService,
    private readonly platformUsers: PlatformUserService,
    private readonly drafts: DraftAgreementsService,
    private readonly external: ExternalAgreementsService,
  ) {}

  @Get('templates/available')
  async availableTemplates(@Headers('authorization') authorization: string) {
    const user = await this.requireUser(authorization);
    return this.drafts.getAvailableTemplateAccess(user.platformUserId);
  }

  @Post('direct/validate-template')
  @HttpCode(HttpStatus.CREATED)
  async validateTemplate(@Headers('authorization') authorization: string, @Body() body: unknown) {
    await this.requireUser(authorization);
    return this.external.validateAgreementTemplate(body);
  }

  @Post('direct/validate')
  @HttpCode(HttpStatus.CREATED)
  async validateDirect(@Headers('authorization') authorization: string, @Body() body: unknown) {
    await this.requireUser(authorization);
    return this.external.validateDirectAgreement(body);
  }

  @Post()
  async create(@Headers('authorization') authorization: string, @Body() body: unknown) {
    return this.drafts.createDraft(body, await this.requireUser(authorization));
  }

  @Get()
  async list(@Headers('authorization') authorization: string, @Query('status') status?: string) {
    return this.drafts.list(await this.requireUser(authorization), status);
  }

  @Get(':id/participants')
  async getParticipants(@Headers('authorization') authorization: string, @Param('id') id: string) {
    return this.drafts.getParticipants(id, await this.requireUser(authorization));
  }

  @Put(':id/participants')
  async setParticipants(@Headers('authorization') authorization: string, @Param('id') id: string, @Body() body: unknown) {
    return this.drafts.setParticipants(id, body, await this.requireUser(authorization));
  }

  @Get(':id/observers')
  async getObservers(@Headers('authorization') authorization: string, @Param('id') id: string) {
    return this.drafts.getObservers(id, await this.requireUser(authorization));
  }

  @Put(':id/observers')
  async setObservers(@Headers('authorization') authorization: string, @Param('id') id: string, @Body() body: { observers?: unknown }) {
    return this.drafts.setObservers(id, body?.observers || [], await this.requireUser(authorization));
  }

  @Patch(':id/values')
  async updateValues(@Headers('authorization') authorization: string, @Param('id') id: string, @Body() body: { values?: Record<string, unknown> }) {
    return this.drafts.updateValues(id, body?.values || {}, await this.requireUser(authorization));
  }

  @Patch(':id/display-name')
  async updateDisplayName(@Headers('authorization') authorization: string, @Param('id') id: string, @Body() body: { displayName?: string }) {
    return this.drafts.updateDisplayName(id, body?.displayName || '', await this.requireUser(authorization));
  }

  @Patch(':id/chain')
  async updateChainId(@Headers('authorization') authorization: string, @Param('id') id: string, @Body() body: { chainId?: unknown }) {
    return this.drafts.updateChainId(id, body?.chainId, await this.requireUser(authorization));
  }

  @Delete(':id')
  async delete(@Headers('authorization') authorization: string, @Param('id') id: string) {
    return this.drafts.deleteDraft(id, await this.requireUser(authorization));
  }

  @Get(':id')
  async get(@Headers('authorization') authorization: string, @Param('id') id: string) {
    return this.drafts.get(id, await this.requireUser(authorization));
  }

  private async requireUser(authorization: string) {
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Missing or invalid authorization header');
    const dynamicUser = await this.auth.validateDynamicToken(authorization.slice(7));
    const linked = await this.platformUsers.getOrCreateFromDynamic(dynamicUser, false);
    return { ...dynamicUser, id: linked.did, platformUserId: linked.platformUserId };
  }
}
