import { Controller, Get, Headers, InternalServerErrorException, NotFoundException, Query } from '@nestjs/common';

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function assertTelemetrySmokeEnabled() {
  const override = parseBoolean(process.env.TELEMETRY_SMOKE_ENABLED);
  const enabled = override ?? !['prod', 'production'].includes(String(process.env.NODE_ENV || '').toLowerCase());
  if (!enabled) throw new NotFoundException();
}

@Controller('agreements-api/telemetry')
export class TelemetryController {
  @Get('ping')
  ping(@Headers('x-correlation-id') correlationId?: string) {
    assertTelemetrySmokeEnabled();
    return {
      ok: true as const,
      service: 'agreements-api' as const,
      correlationId: correlationId || null,
    };
  }

  @Get('smoke/full-stack')
  runFullStackSmoke(
    @Query('failAt') failAt?: 'agreements-api' | 'auth-api',
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    assertTelemetrySmokeEnabled();
    if (failAt) {
      throw new InternalServerErrorException(
        `${failAt} telemetry smoke failure ${new Date().toISOString()}${correlationId ? ` [correlationId=${correlationId}]` : ''}`,
      );
    }

    return {
      ok: true as const,
      service: 'agreements-api' as const,
      correlationId: correlationId || null,
      auth: { ok: true as const, service: 'auth-api' as const, correlationId: correlationId || null },
      failAt: null,
    };
  }
}
