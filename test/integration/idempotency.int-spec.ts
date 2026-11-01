import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { startTestApp, TestApp } from './support/app.js';
import { createScenario, Scenario } from './support/scenario.js';

// Monday 2030-01-07 in Ho Chi Minh City (UTC+7).
const MONDAY_0900 = '2030-01-07T02:00:00Z';
const MONDAY_1100 = '2030-01-07T04:00:00Z';

describe('Idempotent booking', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(() => t.close());

  const book = (
    scenario: Scenario,
    key: string,
    overrides: Record<string, unknown> = {},
  ) =>
    request(t.app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Idempotency-Key', key)
      .send({
        vehicleId: scenario.vehicleIds[0],
        serviceTypeId: scenario.serviceTypeId,
        dealershipId: scenario.dealershipId,
        startAt: MONDAY_0900,
        ...overrides,
      });

  const appointmentCount = async (scenario: Scenario) => {
    const [row] = await t.sql.query<{ count: number }[]>(
      'SELECT count(*)::int AS count FROM appointments WHERE dealership_id = $1',
      [scenario.dealershipId],
    );
    return row.count;
  };

  it('replays the stored appointment for the same key and payload', async () => {
    const scenario = await createScenario(t.sql);
    const key = randomUUID();

    const first = await book(scenario, key).expect(201);
    const replay = await book(scenario, key).expect(200);

    expect(first.headers['idempotent-replayed']).toBeUndefined();
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body).toEqual(first.body);
    expect(await appointmentCount(scenario)).toBe(1);
  });

  it('treats the same instant written with another offset as the same payload', async () => {
    const scenario = await createScenario(t.sql);
    const key = randomUUID();

    await book(scenario, key).expect(201);

    await book(scenario, key, { startAt: '2030-01-07T09:00:00+07:00' }).expect(
      200,
    );
  });

  it('rejects the same key with a different payload', async () => {
    const scenario = await createScenario(t.sql);
    const key = randomUUID();
    await book(scenario, key).expect(201);

    const response = await book(scenario, key, {
      startAt: MONDAY_1100,
    }).expect(422);

    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await appointmentCount(scenario)).toBe(1);
  });

  it('does not store a failed attempt, so a corrected retry succeeds (A11)', async () => {
    const scenario = await createScenario(t.sql);
    const key = randomUUID();

    await book(scenario, key, { startAt: '2030-01-07T02:10:00Z' }).expect(422);
    await book(scenario, key).expect(201);
  });

  it('re-evaluates a retry after a conflict instead of replaying it (A11)', async () => {
    const scenario = await createScenario(t.sql);
    await book(scenario, randomUUID()).expect(201);
    const key = randomUUID();

    const conflict = await book(scenario, key, {
      vehicleId: scenario.vehicleIds[1],
    }).expect(409);
    const retry = await book(scenario, key, {
      vehicleId: scenario.vehicleIds[1],
    }).expect(409);

    expect(conflict.body.error.code).toBe('SLOT_UNAVAILABLE');
    expect(retry.headers['idempotent-replayed']).toBeUndefined();
  });

  it('treats an expired key as new (A12)', async () => {
    const scenario = await createScenario(t.sql);
    const key = randomUUID();
    await book(scenario, key).expect(201);
    await t.sql.query(
      `UPDATE idempotency_keys
       SET created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour'
       WHERE key = $1`,
      [key],
    );

    const response = await book(scenario, key, {
      startAt: MONDAY_1100,
    }).expect(201);

    expect(response.headers['idempotent-replayed']).toBeUndefined();
    expect(await appointmentCount(scenario)).toBe(2);
  });

  it('keeps a key for 24 hours', async () => {
    const scenario = await createScenario(t.sql);
    const key = randomUUID();
    await book(scenario, key).expect(201);

    const [row] = await t.sql.query<{ hours: number }[]>(
      `SELECT extract(epoch FROM expires_at - created_at)::int / 3600 AS hours
       FROM idempotency_keys WHERE key = $1`,
      [key],
    );
    expect(row.hours).toBe(24);
  });
});
