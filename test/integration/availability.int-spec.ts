import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { startTestApp, TestApp } from './support/app.js';
import { createScenario, Scenario } from './support/scenario.js';

// Monday 2030-01-07 in Ho Chi Minh City (UTC+7), open 08:00 to 17:00.
const MONDAY = '2030-01-07';

interface Slot {
  startAt: string;
  endAt: string;
  availableTechnicians: number;
  availableServiceBays: number;
}

describe('Availability API', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(() => t.close());

  const availability = (scenario: Scenario, date = MONDAY) =>
    request(t.app.getHttpServer()).get('/api/v1/availability').query({
      dealershipId: scenario.dealershipId,
      serviceTypeId: scenario.serviceTypeId,
      date,
    });

  const book = (scenario: Scenario, startAt: string, vehicleIndex = 0) =>
    request(t.app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Idempotency-Key', randomUUID())
      .send({
        vehicleId: scenario.vehicleIds[vehicleIndex],
        serviceTypeId: scenario.serviceTypeId,
        dealershipId: scenario.dealershipId,
        startAt,
      })
      .expect(201);

  const startsOf = (slots: Slot[]) => slots.map((slot) => slot.startAt);

  it('lists every bookable start of the day with free resource counts', async () => {
    const scenario = await createScenario(t.sql, {
      technicians: [{}, {}],
      serviceBays: 3,
    });

    const response = await availability(scenario).expect(200);

    expect(response.body).toMatchObject({
      dealershipId: scenario.dealershipId,
      serviceTypeId: scenario.serviceTypeId,
      date: MONDAY,
      timezone: 'Asia/Ho_Chi_Minh',
    });
    const slots: Slot[] = response.body.slots;
    expect(slots).toHaveLength(33);
    expect(slots[0]).toEqual({
      startAt: '2030-01-07T01:00:00.000Z',
      endAt: '2030-01-07T02:00:00.000Z',
      availableTechnicians: 2,
      availableServiceBays: 3,
    });
  });

  it('removes every start that would overlap a booking when resources run out', async () => {
    const scenario = await createScenario(t.sql);
    // 09:00 to 10:00 local.
    await book(scenario, '2030-01-07T02:00:00Z');

    const { body } = await availability(scenario).expect(200);
    const starts = startsOf(body.slots);

    // 08:00 ends exactly when the booking starts (A3); 08:15 to 09:45 overlap it.
    expect(starts).toContain('2030-01-07T01:00:00.000Z');
    expect(starts).not.toContain('2030-01-07T01:15:00.000Z');
    expect(starts).not.toContain('2030-01-07T02:45:00.000Z');
    expect(starts).toContain('2030-01-07T03:00:00.000Z');
  });

  it('lowers the counts while other resources stay free', async () => {
    const scenario = await createScenario(t.sql, {
      technicians: [{}, {}],
      serviceBays: 2,
    });
    await book(scenario, '2030-01-07T02:00:00Z');

    const { body } = await availability(scenario).expect(200);
    const slot = (body.slots as Slot[]).find(
      (s) => s.startAt === '2030-01-07T02:00:00.000Z',
    );

    expect(slot).toMatchObject({
      availableTechnicians: 1,
      availableServiceBays: 1,
    });
  });

  it('ignores technicians without the required skill', async () => {
    const scenario = await createScenario(t.sql, {
      technicians: [{ skills: ['engine'] }, { skills: ['brakes'] }],
      serviceBays: 2,
    });

    const { body } = await availability(scenario).expect(200);

    expect(body.slots[0].availableTechnicians).toBe(1);
  });

  it('returns no slots on a Sunday or a past day', async () => {
    const scenario = await createScenario(t.sql);

    const sunday = await availability(scenario, '2030-01-13').expect(200);
    const past = await availability(scenario, '2020-01-06').expect(200);

    expect(sunday.body.slots).toEqual([]);
    expect(past.body.slots).toEqual([]);
  });

  it('returns 404 for an unknown dealership or service type', async () => {
    const scenario = await createScenario(t.sql);

    const unknown = await request(t.app.getHttpServer())
      .get('/api/v1/availability')
      .query({
        dealershipId: randomUUID(),
        serviceTypeId: scenario.serviceTypeId,
        date: MONDAY,
      })
      .expect(404);

    expect(unknown.body.error.code).toBe('NOT_FOUND');
  });

  it.each([['2030-1-7'], ['2030-02-30'], ['tomorrow']])(
    'returns 400 for the date %s',
    async (date) => {
      const scenario = await createScenario(t.sql);

      const response = await availability(scenario, date).expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    },
  );

  it('reflects a booking made since the previous query', async () => {
    const scenario = await createScenario(t.sql, {
      technicians: [{}, {}],
      serviceBays: 2,
    });
    const before = await availability(scenario).expect(200);

    await book(scenario, '2030-01-07T01:00:00Z');
    const after = await availability(scenario).expect(200);

    expect(before.body.slots[0].availableTechnicians).toBe(2);
    expect(after.body.slots[0].availableTechnicians).toBe(1);
  });
});
