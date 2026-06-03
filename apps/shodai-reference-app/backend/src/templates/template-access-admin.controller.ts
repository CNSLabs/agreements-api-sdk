import { Body, Controller, Delete, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ServiceAuthGuard } from '../auth/service-auth.guard';
import { TemplateAccessService } from './template-access.service';

@Controller('agreements-api/agreements/admin/template-access')
@UseGuards(ServiceAuthGuard)
export class TemplateAccessAdminController {
  constructor(private readonly service: TemplateAccessService) {}

  @Get('defaults')
  getDefaults() {
    return this.service.getDefaults();
  }

  @Put('defaults')
  setDefaults(@Body() body: { templateIds?: string[] }) {
    return this.service.setDefaults(body.templateIds || []);
  }

  @Get()
  list() {
    return this.service.list();
  }

  @Get('by-email')
  getByEmail(@Query('email') email: string) {
    return this.service.getByEmail(email);
  }

  @Put('by-email')
  setByEmail(@Body() body: { email?: string; templateIds?: string[] }) {
    return this.service.setByEmail(String(body.email || ''), body.templateIds || []);
  }

  @Delete('by-email')
  deleteByEmail(@Query('email') email: string) {
    return this.service.deleteByEmail(email);
  }

  @Get(':platformUserId')
  get(@Param('platformUserId') platformUserId: string) {
    return this.service.get(platformUserId);
  }

  @Put(':platformUserId')
  set(@Param('platformUserId') platformUserId: string, @Body() body: { templateIds?: string[] }) {
    return this.service.set(platformUserId, body.templateIds || []);
  }

  @Delete(':platformUserId')
  delete(@Param('platformUserId') platformUserId: string) {
    return this.service.delete(platformUserId);
  }
}
