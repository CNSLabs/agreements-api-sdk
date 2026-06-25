import { Controller, Get } from '@nestjs/common';
import { StandaloneConfigService } from './standalone-config.service';

@Controller('agreements-api/config')
export class PublicConfigController {
  constructor(private readonly config: StandaloneConfigService) {}

  @Get()
  getPublicConfig() {
    return {
      agreementsApiEnvironment: this.config.externalApiEnvironment,
      defaultChainId: this.config.defaultAgreementChainId,
      supportedChains: this.config.getSupportedAgreementChains(),
    };
  }
}
