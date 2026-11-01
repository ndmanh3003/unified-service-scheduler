// Race-condition demo: 20 parallel bookings for the same slot at the seeded
// express dealership (one technician, one bay). Expected: one 201, nineteen
// 409, one row. Run inside the app container:
//   docker compose exec app node scripts/race-demo.mjs
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const BASE_URL =
  process.env.DEMO_BASE_URL ??
  `http://localhost:${process.env.APP_PORT ?? 3000}`;
const EXPRESS_DEALERSHIP = '10000000-0000-4000-8000-000000000002';
const OIL_CHANGE = '30000000-0000-4000-8000-000000000001';
const PARALLEL_REQUESTS = 20;
const fleetVehicle = (n) =>
  `71000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// A random Monday-to-Saturday slot between 08:00 and 15:00 local time
// (UTC+7) in the coming years, so every run competes for a fresh slot.
function randomSlot() {
  const day = new Date(
    Date.UTC(2031, 0, 1) + Math.floor(Math.random() * 1500) * 86_400_000,
  );
  if (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + 1);
  const hour = 8 + Math.floor(Math.random() * 8);
  const date = day.toISOString().slice(0, 10);
  return `${date}T${String(hour).padStart(2, '0')}:00:00+07:00`;
}

const startAt = process.argv[2] ?? randomSlot();
console.log(
  `Booking ${startAt} at the express dealership with ${PARALLEL_REQUESTS} parallel requests...\n`,
);

const responses = await Promise.all(
  Array.from({ length: PARALLEL_REQUESTS }, async (_, i) => {
    const response = await fetch(`${BASE_URL}/api/v1/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify({
        vehicleId: fleetVehicle(i + 1),
        serviceTypeId: OIL_CHANGE,
        dealershipId: EXPRESS_DEALERSHIP,
        startAt,
      }),
    });
    const body = await response.json();
    return {
      status: response.status,
      code: body.error?.code ?? 'CREATED',
      id: body.id,
    };
  }),
);

const tally = {};
for (const { status, code } of responses) {
  const label = `${status} ${code}`;
  tally[label] = (tally[label] ?? 0) + 1;
}
console.table(tally);

const client = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
await client.connect();
const { rows } = await client.query(
  `SELECT count(*)::int AS count FROM appointments
   WHERE dealership_id = $1 AND start_at = $2 AND status = 'CONFIRMED'`,
  [EXPRESS_DEALERSHIP, startAt],
);
await client.end();

const created = responses.filter((r) => r.status === 201).length;
console.log(`\nRows in the database for this slot: ${rows[0].count}`);
const ok = created === 1 && rows[0].count === 1;
console.log(
  ok
    ? 'PASS: exactly one booking, no double booking.'
    : 'FAIL: unexpected result.',
);
process.exitCode = ok ? 0 : 1;
