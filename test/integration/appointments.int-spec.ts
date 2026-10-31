import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { startTestApp, TestApp } from './support/app.js';
import { createScenario, Scenario } from './support/scenario.js';

// Monday 2030-01-07 in Ho Chi Minh City (UTC+7): 09:00 local is 02:00 UTC.
const MONDAY_0900 = '2030-01-07T02:00:00Z';
const MONDAY_0930 = '2030-01-07T02:30:00Z';
const MONDAY_1000 = '2030-01-07T03:00:00Z';

describe('Appointments API', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(() => t.close());

  const book = (
    scenario: Scenario,
    startAt: string,
    overrides: Record<string, unknown> = {},
    idempotencyKey: string | null = randomUUID(),
  ) => {
    const req = request(t.app.getHttpServer()).post('/api/v1/appointments');
    if (idempotencyKey !== null) {
      void req.set('Idempotency-Key', idempotencyKey);
    }
    return req.send({
      vehicleId: scenario.vehicleIds[0],
      serviceTypeId: scenario.serviceTypeId,
      dealershipId: scenario.dealershipId,
      startAt,
      ...overrides,
    });
  };

  describe('POST /api/v1/appointments', () => {
    it('confirms an appointment for the whole service duration', async () => {
      const scenario = await createScenario(t.sql);

      const response = await book(scenario, MONDAY_0900).expect(201);

      expect(response.body).toMatchObject({
        status: 'CONFIRMED',
        startAt: '2030-01-07T02:00:00.000Z',
        endAt: '2030-01-07T03:00:00.000Z',
        customer: { id: scenario.customerId },
        vehicle: { id: scenario.vehicleIds[0] },
        dealership: { id: scenario.dealershipId },
        serviceType: { id: scenario.serviceTypeId, durationMinutes: 60 },
        technician: { id: scenario.technicianIds[0] },
        serviceBay: { id: scenario.serviceBayIds[0] },
      });
    });

    it('rejects a partial overlap when no other resource is free', async () => {
      const scenario = await createScenario(t.sql);
      await book(scenario, MONDAY_0900).expect(201);

      const response = await book(scenario, MONDAY_0930, {
        vehicleId: scenario.vehicleIds[1],
      }).expect(409);

      expect(response.body.error.code).toBe('SLOT_UNAVAILABLE');
    });

    it('accepts back-to-back appointments on the same resources (A3)', async () => {
      const scenario = await createScenario(t.sql);

      await book(scenario, MONDAY_0900).expect(201);
      await book(scenario, MONDAY_1000, {
        vehicleId: scenario.vehicleIds[1],
      }).expect(201);
    });

    it('rejects when a bay is free but no technician is', async () => {
      const scenario = await createScenario(t.sql, { serviceBays: 2 });
      await book(scenario, MONDAY_0900).expect(201);

      const response = await book(scenario, MONDAY_0900, {
        vehicleId: scenario.vehicleIds[1],
      }).expect(409);

      expect(response.body.error.code).toBe('SLOT_UNAVAILABLE');
    });

    it('rejects when a technician is free but no bay is', async () => {
      const scenario = await createScenario(t.sql, {
        technicians: [{}, {}],
        serviceBays: 1,
      });
      await book(scenario, MONDAY_0900).expect(201);

      const response = await book(scenario, MONDAY_0900, {
        vehicleId: scenario.vehicleIds[1],
      }).expect(409);

      expect(response.body.error.code).toBe('SLOT_UNAVAILABLE');
    });

    it('assigns a second free pair to an overlapping request', async () => {
      const scenario = await createScenario(t.sql, {
        technicians: [{}, {}],
        serviceBays: 2,
      });
      const first = await book(scenario, MONDAY_0900).expect(201);

      const second = await book(scenario, MONDAY_0930, {
        vehicleId: scenario.vehicleIds[1],
      }).expect(201);

      expect(second.body.technician.id).not.toBe(first.body.technician.id);
      expect(second.body.serviceBay.id).not.toBe(first.body.serviceBay.id);
    });

    it('never assigns a technician without the required skill', async () => {
      const scenario = await createScenario(t.sql, {
        technicians: [{ skills: ['brakes'] }, { skills: ['engine'] }],
        serviceBays: 2,
      });

      const first = await book(scenario, MONDAY_0900).expect(201);
      expect(first.body.technician.id).toBe(scenario.technicianIds[1]);

      const second = await book(scenario, MONDAY_0900, {
        vehicleId: scenario.vehicleIds[1],
      }).expect(409);
      expect(second.body.error.code).toBe('SLOT_UNAVAILABLE');
    });

    it('returns 422 when no active technician holds the required skill', async () => {
      const scenario = await createScenario(t.sql, {
        technicians: [
          { skills: ['brakes'] },
          { skills: ['engine'], isActive: false },
        ],
      });

      const response = await book(scenario, MONDAY_0900).expect(422);

      expect(response.body.error.code).toBe('NO_QUALIFIED_TECHNICIAN');
    });

    it('rejects a vehicle that already has an overlapping appointment (A7)', async () => {
      const scenario = await createScenario(t.sql, {
        technicians: [{}, {}],
        serviceBays: 2,
      });
      await book(scenario, MONDAY_0900).expect(201);

      const response = await book(scenario, MONDAY_0930).expect(409);

      expect(response.body.error.code).toBe('VEHICLE_ALREADY_BOOKED');
    });

    it.each([
      ['before opening', '2030-01-07T00:30:00Z', 'OUTSIDE_BUSINESS_HOURS'],
      [
        'ending after closing',
        '2030-01-07T09:30:00Z',
        'OUTSIDE_BUSINESS_HOURS',
      ],
      ['on a Sunday', '2030-01-13T02:00:00Z', 'OUTSIDE_BUSINESS_HOURS'],
      ['in the past', '2020-01-06T02:00:00Z', 'START_IN_PAST'],
      [
        'not aligned to a slot',
        '2030-01-07T02:10:00Z',
        'INVALID_SLOT_ALIGNMENT',
      ],
    ])('returns 422 for a start %s', async (_case, startAt, code) => {
      const scenario = await createScenario(t.sql);

      const response = await book(scenario, startAt).expect(422);

      expect(response.body.error.code).toBe(code);
    });

    it.each([['vehicleId'], ['dealershipId'], ['serviceTypeId']])(
      'returns 404 for an unknown %s',
      async (field) => {
        const scenario = await createScenario(t.sql);

        const response = await book(scenario, MONDAY_0900, {
          [field]: randomUUID(),
        }).expect(404);

        expect(response.body.error.code).toBe('NOT_FOUND');
      },
    );

    it('requires an Idempotency-Key header that is a UUID', async () => {
      const scenario = await createScenario(t.sql);

      const missing = await book(scenario, MONDAY_0900, {}, null).expect(400);
      const malformed = await book(scenario, MONDAY_0900, {}, 'abc').expect(
        400,
      );

      expect(missing.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect(malformed.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it.each([
      ['a missing field', { startAt: undefined }],
      ['a start without a timezone offset', { startAt: '2030-01-07T09:00:00' }],
      ['a malformed id', { vehicleId: 'not-a-uuid' }],
      ['an unknown field', { customerId: randomUUID() }],
    ])('returns 400 for %s', async (_case, overrides) => {
      const scenario = await createScenario(t.sql);

      const response = await book(scenario, MONDAY_0900, overrides).expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 400 for a malformed JSON body', async () => {
      const response = await request(t.app.getHttpServer())
        .post('/api/v1/appointments')
        .set('Idempotency-Key', randomUUID())
        .set('Content-Type', 'application/json')
        .send('{"vehicleId":')
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns the correlation id in the error body', async () => {
      const scenario = await createScenario(t.sql);

      const response = await book(scenario, '2020-01-06T02:00:00Z')
        .set('X-Correlation-Id', 'trace-422')
        .expect(422);

      expect(response.body.error.correlationId).toBe('trace-422');
    });
  });

  describe('GET /api/v1/appointments/:id', () => {
    it('returns the appointment with its related records', async () => {
      const scenario = await createScenario(t.sql);
      const created = await book(scenario, MONDAY_0900).expect(201);

      const response = await request(t.app.getHttpServer())
        .get(`/api/v1/appointments/${created.body.id}`)
        .expect(200);

      expect(response.body).toEqual(created.body);
      expect(response.body.vehicle).toHaveProperty('vin');
      expect(response.body.technician).toHaveProperty('name');
    });

    it('returns 404 for an unknown appointment', async () => {
      const response = await request(t.app.getHttpServer())
        .get(`/api/v1/appointments/${randomUUID()}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for an id that is not a UUID', async () => {
      const response = await request(t.app.getHttpServer())
        .get('/api/v1/appointments/123')
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });
  });
});
