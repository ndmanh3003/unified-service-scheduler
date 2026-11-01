import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  createNaiveAppointmentsTable,
  naiveBook,
} from './support/naive-booking.js';
import { startTestApp, TestApp } from './support/app.js';
import { createScenario, Scenario } from './support/scenario.js';

// Monday 2030-01-07 in Ho Chi Minh City (UTC+7): 10:00 local is 03:00 UTC.
const MONDAY_1000 = '2030-01-07T03:00:00Z';

describe('Concurrent booking', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(() => t.close());

  const book = (scenario: Scenario, vehicleId: string, key = randomUUID()) =>
    request(t.app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Idempotency-Key', key)
      .send({
        vehicleId,
        serviceTypeId: scenario.serviceTypeId,
        dealershipId: scenario.dealershipId,
        startAt: MONDAY_1000,
      });

  const rows = async (scenario: Scenario) =>
    t.sql.query<{ technician_id: string; service_bay_id: string }[]>(
      `SELECT technician_id, service_bay_id FROM appointments
       WHERE dealership_id = $1 AND status = 'CONFIRMED'`,
      [scenario.dealershipId],
    );

  const statuses = (responses: { status: number }[]) =>
    responses.map((r) => r.status).sort((a, b) => a - b);

  it('books exactly one of 20 parallel requests for one technician and one bay', async () => {
    const scenario = await createScenario(t.sql, { vehicles: 20 });

    const responses = await Promise.all(
      scenario.vehicleIds.map((vehicleId) => book(scenario, vehicleId)),
    );

    expect(statuses(responses)).toEqual([201, ...Array(19).fill(409)]);
    for (const response of responses.filter((r) => r.status === 409)) {
      expect(response.body.error.code).toBe('SLOT_UNAVAILABLE');
    }
    expect(await rows(scenario)).toHaveLength(1);
  });

  it('books exactly three of 10 parallel requests for three technicians and three bays', async () => {
    const scenario = await createScenario(t.sql, {
      technicians: [{}, {}, {}],
      serviceBays: 3,
      vehicles: 10,
    });

    const responses = await Promise.all(
      scenario.vehicleIds.map((vehicleId) => book(scenario, vehicleId)),
    );

    expect(statuses(responses)).toEqual([201, 201, 201, ...Array(7).fill(409)]);
    const booked = await rows(scenario);
    expect(booked).toHaveLength(3);
    // No technician or bay is used twice in the slot.
    expect(new Set(booked.map((r) => r.technician_id)).size).toBe(3);
    expect(new Set(booked.map((r) => r.service_bay_id)).size).toBe(3);
  });

  it('creates one appointment for two parallel requests with the same key', async () => {
    const scenario = await createScenario(t.sql, {
      technicians: [{}, {}],
      serviceBays: 2,
    });
    const key = randomUUID();

    const responses = await Promise.all([
      book(scenario, scenario.vehicleIds[0], key),
      book(scenario, scenario.vehicleIds[0], key),
    ]);

    expect(statuses(responses)).toEqual([200, 201]);
    expect(responses[0].body.id).toBe(responses[1].body.id);
    expect(await rows(scenario)).toHaveLength(1);
  });

  it('rejects one vehicle booked by parallel requests with different keys (A7)', async () => {
    const scenario = await createScenario(t.sql, {
      technicians: [{}, {}, {}],
      serviceBays: 3,
    });

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => book(scenario, scenario.vehicleIds[0])),
    );

    expect(statuses(responses)).toEqual([201, 409, 409, 409, 409]);
    for (const response of responses.filter((r) => r.status === 409)) {
      expect(response.body.error.code).toBe('VEHICLE_ALREADY_BOOKED');
    }
    expect(await rows(scenario)).toHaveLength(1);
  });

  it('rejects one vehicle booked at two dealerships at the same time (A7)', async () => {
    const first = await createScenario(t.sql);
    const second = await createScenario(t.sql);
    const vehicleId = first.vehicleIds[0];

    const responses = await Promise.all([
      book(first, vehicleId),
      request(t.app.getHttpServer())
        .post('/api/v1/appointments')
        .set('Idempotency-Key', randomUUID())
        .send({
          vehicleId,
          serviceTypeId: second.serviceTypeId,
          dealershipId: second.dealershipId,
          startAt: MONDAY_1000,
        }),
    ]);

    expect(statuses(responses)).toEqual([201, 409]);
    const conflict = responses.find((r) => r.status === 409);
    expect(conflict?.body.error.code).toBe('VEHICLE_ALREADY_BOOKED');
  });

  it('shows that a naive check-then-insert double books under the same load', async () => {
    await createNaiveAppointmentsTable(t.sql);
    const booking = {
      technicianId: randomUUID(),
      serviceBayId: randomUUID(),
      startAt: new Date(MONDAY_1000),
      endAt: new Date('2030-01-07T04:00:00Z'),
    };

    const results = await Promise.all(
      Array.from({ length: 20 }, () => naiveBook(t.sql, booking)),
    );

    const [row] = await t.sql.query<{ count: number }[]>(
      'SELECT count(*)::int AS count FROM naive_appointments WHERE technician_id = $1',
      [booking.technicianId],
    );
    expect(results.filter(Boolean).length).toBeGreaterThan(1);
    expect(row.count).toBeGreaterThan(1);
  });
});
