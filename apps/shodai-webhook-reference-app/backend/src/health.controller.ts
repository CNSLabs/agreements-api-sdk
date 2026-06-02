import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return {
      ok: true as const,
      service: 'shodai-webhook-reference-backend' as const,
      timestamp: new Date().toISOString(),
    };
  }
}
