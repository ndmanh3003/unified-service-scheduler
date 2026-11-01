import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { IdempotencyKeyReusedError } from '@/common/errors.js';

/** A12: a key is kept for 24 hours, then treated as new. */
export const IDEMPOTENCY_KEY_TTL_HOURS = 24;

export type IdempotencyClaim =
  { status: 'new' } | { status: 'replay'; appointmentId: string };

/**
 * Idempotency keys live in PostgreSQL and are written in the booking
 * transaction, so a key and its appointment commit or roll back together:
 * only successful bookings are kept for replay (A11).
 */
@Injectable()
export class IdempotencyService {
  /**
   * Claims `key` for a request. A concurrent claim of the same key waits on
   * the primary key until the first transaction ends, then sees its result.
   */
  async claim(
    manager: EntityManager,
    key: string,
    requestHash: string,
  ): Promise<IdempotencyClaim> {
    const inserted = await manager.query<unknown[]>(
      `INSERT INTO idempotency_keys (key, request_hash, expires_at)
       VALUES ($1, $2, now() + make_interval(hours => $3))
       ON CONFLICT (key) DO NOTHING
       RETURNING key`,
      [key, requestHash, IDEMPOTENCY_KEY_TTL_HOURS],
    );
    if (inserted.length > 0) {
      return { status: 'new' };
    }

    const [existing] = await manager.query<
      {
        request_hash: string;
        appointment_id: string | null;
        expired: boolean;
      }[]
    >(
      `SELECT request_hash, appointment_id, expires_at <= now() AS expired
       FROM idempotency_keys WHERE key = $1
       FOR UPDATE`,
      [key],
    );

    if (existing.expired) {
      await manager.query(
        `UPDATE idempotency_keys
         SET request_hash = $2, appointment_id = NULL,
             created_at = now(), expires_at = now() + make_interval(hours => $3)
         WHERE key = $1`,
        [key, requestHash, IDEMPOTENCY_KEY_TTL_HOURS],
      );
      return { status: 'new' };
    }
    if (existing.request_hash !== requestHash) {
      throw new IdempotencyKeyReusedError();
    }
    if (!existing.appointment_id) {
      // Unreachable: rows are committed only together with their appointment.
      throw new Error(`Idempotency key ${key} has no appointment.`);
    }
    return { status: 'replay', appointmentId: existing.appointment_id };
  }

  /** Records the appointment created under a claimed key. */
  async complete(
    manager: EntityManager,
    key: string,
    appointmentId: string,
  ): Promise<void> {
    await manager.query(
      'UPDATE idempotency_keys SET appointment_id = $2 WHERE key = $1',
      [key, appointmentId],
    );
  }

  /** SHA-256 of the booking request; the start is normalized to UTC. */
  hashRequest(request: {
    vehicleId: string;
    serviceTypeId: string;
    dealershipId: string;
    startAt: Date;
  }): string {
    return createHash('sha256')
      .update(
        JSON.stringify([
          request.vehicleId,
          request.serviceTypeId,
          request.dealershipId,
          request.startAt.toISOString(),
        ]),
      )
      .digest('hex');
  }
}
