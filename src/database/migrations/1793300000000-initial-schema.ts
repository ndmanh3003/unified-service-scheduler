import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plain SQL: exclusion constraints, generated range columns and btree_gist
 * cannot be expressed through ORM decorators. See docs/SYSTEM_DESIGN.md
 * (Data Model).
 */
export class InitialSchema1793300000000 implements MigrationInterface {
  name = 'InitialSchema1793300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS btree_gist;

      CREATE TABLE dealerships (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name       text NOT NULL,
        timezone   text NOT NULL,
        open_time  time NOT NULL,
        close_time time NOT NULL,
        CONSTRAINT dealerships_hours_check CHECK (close_time > open_time)
      );

      CREATE TABLE customers (
        id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name  text NOT NULL,
        email text NOT NULL,
        phone text NOT NULL,
        CONSTRAINT customers_email_key UNIQUE (email)
      );

      CREATE TABLE vehicles (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id uuid NOT NULL REFERENCES customers (id),
        vin         text NOT NULL,
        make        text NOT NULL,
        model       text NOT NULL,
        year        integer NOT NULL,
        CONSTRAINT vehicles_vin_key UNIQUE (vin)
      );

      CREATE TABLE skills (
        id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text NOT NULL,
        name text NOT NULL,
        CONSTRAINT skills_code_key UNIQUE (code)
      );

      CREATE TABLE service_types (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code              text NOT NULL,
        name              text NOT NULL,
        duration_minutes  integer NOT NULL,
        required_skill_id uuid NOT NULL REFERENCES skills (id),
        CONSTRAINT service_types_code_key UNIQUE (code),
        CONSTRAINT service_types_duration_check CHECK (duration_minutes > 0)
      );

      CREATE TABLE technicians (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        dealership_id uuid NOT NULL REFERENCES dealerships (id),
        name          text NOT NULL,
        is_active     boolean NOT NULL DEFAULT true
      );

      CREATE TABLE technician_skills (
        technician_id uuid NOT NULL REFERENCES technicians (id) ON DELETE CASCADE,
        skill_id      uuid NOT NULL REFERENCES skills (id),
        PRIMARY KEY (technician_id, skill_id)
      );

      CREATE TABLE service_bays (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        dealership_id uuid NOT NULL REFERENCES dealerships (id),
        name          text NOT NULL,
        is_active     boolean NOT NULL DEFAULT true
      );

      CREATE TABLE appointments (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id     uuid NOT NULL REFERENCES customers (id),
        vehicle_id      uuid NOT NULL REFERENCES vehicles (id),
        dealership_id   uuid NOT NULL REFERENCES dealerships (id),
        service_type_id uuid NOT NULL REFERENCES service_types (id),
        technician_id   uuid NOT NULL REFERENCES technicians (id),
        service_bay_id  uuid NOT NULL REFERENCES service_bays (id),
        start_at        timestamptz NOT NULL,
        end_at          timestamptz NOT NULL,
        -- Half-open [start, end): back-to-back bookings do not overlap (A3).
        time_range      tstzrange GENERATED ALWAYS AS (tstzrange(start_at, end_at, '[)')) STORED,
        status          text NOT NULL DEFAULT 'CONFIRMED',
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT appointments_time_check CHECK (end_at > start_at),
        CONSTRAINT appointments_status_check CHECK (status IN ('CONFIRMED', 'CANCELLED')),
        -- The authoritative protection against double booking.
        CONSTRAINT appointments_technician_no_overlap
          EXCLUDE USING gist (technician_id WITH =, time_range WITH &&) WHERE (status = 'CONFIRMED'),
        CONSTRAINT appointments_service_bay_no_overlap
          EXCLUDE USING gist (service_bay_id WITH =, time_range WITH &&) WHERE (status = 'CONFIRMED'),
        CONSTRAINT appointments_vehicle_no_overlap
          EXCLUDE USING gist (vehicle_id WITH =, time_range WITH &&) WHERE (status = 'CONFIRMED')
      );

      CREATE INDEX appointments_dealership_start_idx ON appointments (dealership_id, start_at);

      CREATE TABLE idempotency_keys (
        key            uuid PRIMARY KEY,
        request_hash   text NOT NULL,
        appointment_id uuid REFERENCES appointments (id),
        created_at     timestamptz NOT NULL DEFAULT now(),
        expires_at     timestamptz NOT NULL,
        CONSTRAINT idempotency_keys_expiry_check CHECK (expires_at > created_at)
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE idempotency_keys;
      DROP TABLE appointments;
      DROP TABLE service_bays;
      DROP TABLE technician_skills;
      DROP TABLE technicians;
      DROP TABLE service_types;
      DROP TABLE skills;
      DROP TABLE vehicles;
      DROP TABLE customers;
      DROP TABLE dealerships;
    `);
  }
}
