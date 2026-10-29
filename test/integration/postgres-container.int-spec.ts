import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import pg from 'pg';

describe('PostgreSQL test container', () => {
  let container: StartedPostgreSqlContainer;
  let client: pg.Client;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18-alpine').start();
    client = new pg.Client({ connectionString: container.getConnectionUri() });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
    await container?.stop();
  });

  it('runs PostgreSQL 18', async () => {
    const result = await client.query<{ server_version: string }>(
      'SHOW server_version',
    );
    expect(result.rows[0]?.server_version).toMatch(/^18\./);
  });

  it('supports the btree_gist extension required by exclusion constraints', async () => {
    await client.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
    const result = await client.query(
      "SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'",
    );
    expect(result.rowCount).toBe(1);
  });
});
