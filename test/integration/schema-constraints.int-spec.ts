import { randomUUID } from 'node:crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import {
  startTestDatabase,
  stopTestDatabase,
  TestDatabase,
} from './support/postgres.js';

/**
 * The exclusion constraints are the authoritative protection against double
 * booking, so they are tested directly at the SQL level.
 */
describe('Appointment constraints', () => {
  let db: TestDatabase;
  let sql: DataSource;
  const ids = {
    dealership: randomUUID(),
    customer: randomUUID(),
    vehicleA: randomUUID(),
    vehicleB: randomUUID(),
    skill: randomUUID(),
    serviceType: randomUUID(),
    technicianA: randomUUID(),
    technicianB: randomUUID(),
    bayA: randomUUID(),
    bayB: randomUUID(),
  };

  beforeAll(async () => {
    db = await startTestDatabase();
    sql = db.dataSource;
    await sql.query(
      `INSERT INTO dealerships (id, name, timezone, open_time, close_time)
       VALUES ($1, 'Test', 'Asia/Ho_Chi_Minh', '08:00', '17:00')`,
      [ids.dealership],
    );
    await sql.query(
      `INSERT INTO customers (id, name, email, phone)
       VALUES ($1, 'An Nguyen', 'an@example.com', '+84900000001')`,
      [ids.customer],
    );
    await sql.query(
      `INSERT INTO vehicles (id, customer_id, vin, make, model, year)
       VALUES ($1, $3, 'VINTESTA000000001', 'Toyota', 'Vios', 2022),
              ($2, $3, 'VINTESTB000000002', 'Honda', 'City', 2023)`,
      [ids.vehicleA, ids.vehicleB, ids.customer],
    );
    await sql.query(
      `INSERT INTO skills (id, code, name) VALUES ($1, 'ENGINE', 'Engine')`,
      [ids.skill],
    );
    await sql.query(
      `INSERT INTO service_types (id, code, name, duration_minutes, required_skill_id)
       VALUES ($1, 'OIL_CHANGE', 'Oil change', 60, $2)`,
      [ids.serviceType, ids.skill],
    );
    await sql.query(
      `INSERT INTO technicians (id, dealership_id, name)
       VALUES ($1, $3, 'Tech A'), ($2, $3, 'Tech B')`,
      [ids.technicianA, ids.technicianB, ids.dealership],
    );
    await sql.query(
      `INSERT INTO service_bays (id, dealership_id, name)
       VALUES ($1, $3, 'Bay A'), ($2, $3, 'Bay B')`,
      [ids.bayA, ids.bayB, ids.dealership],
    );
  });

  afterAll(() => stopTestDatabase(db));

  beforeEach(() => sql.query('DELETE FROM appointments'));

  const insert = (
    start: string,
    end: string,
    overrides: Partial<{
      technicianId: string;
      serviceBayId: string;
      vehicleId: string;
      status: string;
    }> = {},
  ) =>
    sql.query(
      `INSERT INTO appointments (customer_id, vehicle_id, dealership_id, service_type_id,
                                 technician_id, service_bay_id, start_at, end_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        ids.customer,
        overrides.vehicleId ?? ids.vehicleA,
        ids.dealership,
        ids.serviceType,
        overrides.technicianId ?? ids.technicianA,
        overrides.serviceBayId ?? ids.bayA,
        start,
        end,
        overrides.status ?? 'CONFIRMED',
      ],
    );

  const violation = async (promise: Promise<unknown>) => {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(QueryFailedError);
    const driverError = (
      error as QueryFailedError & {
        driverError: { code: string; constraint: string };
      }
    ).driverError;
    return { code: driverError.code, constraint: driverError.constraint };
  };

  it('rejects a partial overlap on the same technician', async () => {
    await insert('2030-01-07T03:00:00Z', '2030-01-07T04:00:00Z');

    await expect(
      violation(
        insert('2030-01-07T03:30:00Z', '2030-01-07T04:30:00Z', {
          serviceBayId: ids.bayB,
          vehicleId: ids.vehicleB,
        }),
      ),
    ).resolves.toEqual({
      code: '23P01',
      constraint: 'appointments_technician_no_overlap',
    });
  });

  it('rejects an overlap on the same service bay', async () => {
    await insert('2030-01-07T03:00:00Z', '2030-01-07T04:00:00Z');

    await expect(
      violation(
        insert('2030-01-07T03:30:00Z', '2030-01-07T04:30:00Z', {
          technicianId: ids.technicianB,
          vehicleId: ids.vehicleB,
        }),
      ),
    ).resolves.toEqual({
      code: '23P01',
      constraint: 'appointments_service_bay_no_overlap',
    });
  });

  it('rejects an overlap on the same vehicle (A7)', async () => {
    await insert('2030-01-07T03:00:00Z', '2030-01-07T04:00:00Z');

    await expect(
      violation(
        insert('2030-01-07T03:00:00Z', '2030-01-07T04:00:00Z', {
          technicianId: ids.technicianB,
          serviceBayId: ids.bayB,
        }),
      ),
    ).resolves.toEqual({
      code: '23P01',
      constraint: 'appointments_vehicle_no_overlap',
    });
  });

  it('accepts adjacent half-open ranges on the same resources (A3)', async () => {
    await insert('2030-01-07T03:00:00Z', '2030-01-07T04:00:00Z');

    await expect(
      insert('2030-01-07T04:00:00Z', '2030-01-07T05:00:00Z'),
    ).resolves.toBeDefined();
  });

  it('accepts the same time on different resources', async () => {
    await insert('2030-01-07T03:00:00Z', '2030-01-07T04:00:00Z');

    await expect(
      insert('2030-01-07T03:00:00Z', '2030-01-07T04:00:00Z', {
        technicianId: ids.technicianB,
        serviceBayId: ids.bayB,
        vehicleId: ids.vehicleB,
      }),
    ).resolves.toBeDefined();
  });

  it('ignores cancelled appointments (A9)', async () => {
    await insert('2030-01-07T03:00:00Z', '2030-01-07T04:00:00Z', {
      status: 'CANCELLED',
    });

    await expect(
      insert('2030-01-07T03:00:00Z', '2030-01-07T04:00:00Z'),
    ).resolves.toBeDefined();
  });

  it('rejects a range that does not end after it starts', async () => {
    await expect(
      violation(insert('2030-01-07T04:00:00Z', '2030-01-07T04:00:00Z')),
    ).resolves.toEqual({
      code: '23514',
      constraint: 'appointments_time_check',
    });
  });

  it('rejects an unknown status', async () => {
    await expect(
      violation(
        insert('2030-01-07T03:00:00Z', '2030-01-07T04:00:00Z', {
          status: 'PENDING',
        }),
      ),
    ).resolves.toEqual({
      code: '23514',
      constraint: 'appointments_status_check',
    });
  });

  it('stores time_range as a generated half-open range', async () => {
    await insert('2030-01-07T03:00:00Z', '2030-01-07T04:00:00Z');

    const [row] = await sql.query<{ bounds: string }[]>(
      `SELECT (lower_inc(time_range) AND NOT upper_inc(time_range))::text AS bounds
       FROM appointments`,
    );
    expect(row.bounds).toBe('true');
  });

  it('allows an idempotency key only once', async () => {
    const key = randomUUID();
    const insertKey = () =>
      sql.query(
        `INSERT INTO idempotency_keys (key, request_hash, expires_at)
         VALUES ($1, 'hash', now() + interval '24 hours')`,
        [key],
      );
    await insertKey();

    await expect(violation(insertKey())).resolves.toEqual({
      code: '23505',
      constraint: 'idempotency_keys_pkey',
    });
  });
});
