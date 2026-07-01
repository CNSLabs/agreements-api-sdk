import { Controller, Get, Param } from '@nestjs/common';
import { TemplateCatalogService } from './template-catalog.service';

@Controller('agreements-api/templates')
export class TemplateCatalogController {
  constructor(private readonly catalog: TemplateCatalogService) {}

  @Get()
  list() {
    return this.catalog.listMetadata();
  }

  @Get(':templateId')
  get(@Param('templateId') templateId: string) {
    return this.catalog.getTemplate(templateId);
  }
}
