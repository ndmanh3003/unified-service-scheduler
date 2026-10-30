import { DataSource } from 'typeorm';
import { seedDemoData, SEED_IDS } from '@/database/seed.js';
import {
  startTestDatabase,
  stopTestDatabase,
  TestDatabase,
} from './support/postgres.js';

describe('Demo seed data', () => {
  let db: TestDatabase;
  let sql: DataSource;

  beforeAll(async () => {
    db = await startTestDatabase();
    sql = db.dataSource;
  });

  afterAll(() => stopTestDatabase(db));

  const count = async (table: string) => {
    const [row] = await sql.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM ${table}`,
    );
    return row.count;
  };

  it('can run repeatedly without duplicating rows', async () => {
    await seedDemoData(sql);
    const before = await count('vehicles');
    await seedDemoData(sql);

    expect(await count('vehicles')).toBe(before);
  });

  it('seeds a single-technician, single-bay dealership for the race demo', async () => {
    await seedDemoData(sql);

    const [row] = await sql.query<{ technicians: number; bays: number }[]>(
      `SELECT (SELECT count(*)::int FROM technicians WHERE dealership_id = $1 AND is_active) AS technicians,
              (SELECT count(*)::int FROM service_bays WHERE dealership_id = $1 AND is_active) AS bays`,
      [SEED_IDS.dealerships.express],
    );
    expect(row).toEqual({ technicians: 1, bays: 1 });
  });

  it('seeds twenty fleet vehicles so demo requests do not collide on the vehicle', async () => {
    await seedDemoData(sql);

    const [row] = await sql.query<{ count: number }[]>(
      'SELECT count(*)::int AS count FROM vehicles WHERE customer_id = $1',
      [SEED_IDS.customers.fleet],
    );
    expect(row.count).toBe(20);
  });

  it('gives every service type at least one qualified active technician at the main dealership', async () => {
    await seedDemoData(sql);

    const rows = await sql.query<{ code: string; technicians: number }[]>(
      `SELECT st.code,
              count(t.id)::int AS technicians
       FROM service_types st
       LEFT JOIN technician_skills ts ON ts.skill_id = st.required_skill_id
       LEFT JOIN technicians t ON t.id = ts.technician_id
                              AND t.dealership_id = $1 AND t.is_active
       GROUP BY st.code`,
      [SEED_IDS.dealerships.main],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.technicians).toBeGreaterThan(0);
    }
  });
});
