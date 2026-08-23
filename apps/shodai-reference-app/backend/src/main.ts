import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { StandaloneConfigService } from './config/standalone-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(StandaloneConfigService);

  if (config.apiBasePath) {
    app.setGlobalPrefix(config.apiBasePath, { exclude: ['health'] });
  }

  app.enableCors({
    origin: true,
    allowedHeaders: [
      'authorization',
      'content-type',
      'x-api-key',
      'x-service-token',
      'x-correlation-id',
      'x-client-app',
      'x-trace-id',
      'x-session-id',
      'x-shodai-webhook-id',
      'x-shodai-webhook-timestamp',
      'x-shodai-webhook-signature',
      'traceparent',
      'sentry-trace',
      'baggage',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.listen(config.port);
  // eslint-disable-next-line no-console
  console.log(`Shodai reference backend listening on http://localhost:${config.port}`);
}

void bootstrap();
