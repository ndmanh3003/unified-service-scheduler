import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { configureApp } from '@/app.setup.js';

export interface TestApp {
  app: INestApplication<App>;
  sql: DataSource;
  close(): Promise<void>;
}

/**
 * Boots the full application against a throwaway PostgreSQL container.
 */
export async function startTestApp(
  env: Record<string, string> = {},
): Promise<TestApp> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:18-alpine',
  ).start();

  Object.assign(process.env, {
    DB_HOST: container.getHost(),
    DB_PORT: String(container.getPort()),
    DB_USER: container.getUsername(),
    DB_PASSWORD: container.getPassword(),
    DB_NAME: container.getDatabase(),
    DB_SEED: 'false',
    ...env,
  });
  // Imported after the environment is set: ConfigModule reads it when the
  // module is first evaluated, and Vitest isolates modules per test file.
  const { AppModule } = await import('@/app.module.js');

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();

  return {
    app,
    sql: app.get(DataSource),
    async close() {
      await app.close();
      await container.stop();
    },
  };
}
