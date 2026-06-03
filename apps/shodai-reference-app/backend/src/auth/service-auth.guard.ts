import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { StandaloneConfigService } from '../config/standalone-config.service';

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(private readonly config: StandaloneConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const configured = this.config.serviceAuthToken || (this.config.nodeEnv === 'test' ? 'test-service-token' : '');
    const token = req.headers['x-service-token'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');

    if (!configured || token !== configured) {
      throw new UnauthorizedException('Invalid service token');
    }

    return true;
  }
}
