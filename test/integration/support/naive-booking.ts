import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';

/**
 * Regression evidence only; never used by the application. Books with the
 * check-then-insert pattern on a table without exclusion constraints, the way
 * a naive implementation would. See docs/SYSTEM_DESIGN.md (Testing Strategy).
 */
export async function createNaiveAppointmentsTable(sql: DataSource) {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS naive_appointments (
      id            uuid PRIMARY KEY,
      technician_id uuid NOT NULL,
      service_bay_id uuid NOT NULL,
      start_at      timestamptz NOT NULL,
      end_at        timestamptz NOT NULL
    )`);
}

export async function naiveBook(
  sql: DataSource,
  booking: {
    technicianId: string;
    serviceBayId: string;
    startAt: Date;
    endAt: Date;
  },
): Promise<boolean> {
  return sql.transaction(async (manager) => {
    const busy = await manager.query<unknown[]>(
      `SELECT 1 FROM naive_appointments
       WHERE (technician_id = $1 OR service_bay_id = $2)
         AND start_at < $4 AND $3 < end_at`,
      [
        booking.technicianId,
        booking.serviceBayId,
        booking.startAt,
        booking.endAt,
      ],
    );
    if (busy.length > 0) {
      return false;
    }
    // Stands in for the work a real request does between check and insert.
    await manager.query('SELECT pg_sleep(0.05)');
    await manager.query(
      `INSERT INTO naive_appointments (id, technician_id, service_bay_id, start_at, end_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        randomUUID(),
        booking.technicianId,
        booking.serviceBayId,
        booking.startAt,
        booking.endAt,
      ],
    );
    return true;
  });
}
