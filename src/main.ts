import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { EnvironmentVariables } from '@/config/env.validation.js';
import { setupSwagger } from './swagger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  setupSwagger(app);

  const config = app.get(ConfigService<EnvironmentVariables, true>);
  await app.listen(config.get('APP_PORT', { infer: true }));
}
await bootstrap();
