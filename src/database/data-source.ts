import { DataSourceOptions } from 'typeorm';
import { Appointment } from './entities/appointment.entity.js';
import { Customer } from './entities/customer.entity.js';
import { Dealership } from './entities/dealership.entity.js';
import { IdempotencyKey } from './entities/idempotency-key.entity.js';
import { ServiceBay } from './entities/service-bay.entity.js';
import { ServiceType } from './entities/service-type.entity.js';
import { Skill } from './entities/skill.entity.js';
import { Technician } from './entities/technician.entity.js';
import { Vehicle } from './entities/vehicle.entity.js';
import { InitialSchema1793300000000 } from './migrations/1793300000000-initial-schema.js';

export const ENTITIES = [
  Appointment,
  Customer,
  Dealership,
  IdempotencyKey,
  ServiceBay,
  ServiceType,
  Skill,
  Technician,
  Vehicle,
];

// Listed explicitly rather than by glob, so the same list works from `src`
// under Vitest and from `dist` at runtime.
export const MIGRATIONS = [InitialSchema1793300000000];

export interface ConnectionSettings {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

/** Shared by the application and the integration tests. */
export function createDataSourceOptions(
  connection: ConnectionSettings,
): DataSourceOptions {
  return {
    type: 'postgres',
    ...connection,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsTransactionMode: 'each',
    synchronize: false,
  };
}
