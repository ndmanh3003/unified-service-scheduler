import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';

export const DOCS_PATH = 'docs';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Unified Service Scheduler API')
    .setDescription('Service appointment scheduling API.')
    .setVersion('0.0.1')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  // The OpenAPI document is embedded in the Scalar page; no separate JSON route.
  app.use(`/${DOCS_PATH}`, apiReference({ content: document }));
}
