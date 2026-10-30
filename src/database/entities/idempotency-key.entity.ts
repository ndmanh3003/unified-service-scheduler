import { Column, Entity, PrimaryColumn } from 'typeorm';

/** A successful booking kept for idempotent replay for 24 hours (A11, A12). */
@Entity('idempotency_keys')
export class IdempotencyKey {
  @PrimaryColumn({ type: 'uuid' })
  key: string;

  /** SHA-256 of the request payload; a different payload under the same key is rejected. */
  @Column({ name: 'request_hash', type: 'text' })
  requestHash: string;

  @Column({ name: 'appointment_id', type: 'uuid', nullable: true })
  appointmentId: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}
