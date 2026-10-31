import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { GlobalExceptionFilter } from '@/common/global-exception.filter.js';
import { setupSwagger } from './swagger.js';

export const API_PREFIX = 'api/v1';

/** HTTP configuration shared by `main.ts` and the HTTP tests. */
export function configureApp(app: INestApplication): void {
  // Operational endpoints stay at the root (docs/SPEC.md, REST API).
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableShutdownHooks();
  setupSwagger(app);
}
