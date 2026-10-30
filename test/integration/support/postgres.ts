import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { createDataSourceOptions } from '@/database/data-source.js';

export interface TestDatabase {
  container: StartedPostgreSqlContainer;
  dataSource: DataSource;
}

/** Starts a throwaway PostgreSQL 18 container and applies every migration. */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('postgres:18-alpine').start();
  const dataSource = new DataSource(
    createDataSourceOptions({
      host: container.getHost(),
      port: container.getPort(),
      username: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
    }),
  );
  await dataSource.initialize();
  await dataSource.runMigrations();
  return { container, dataSource };
}

export async function stopTestDatabase(db: TestDatabase | undefined) {
  await db?.dataSource.destroy();
  await db?.container.stop();
}
