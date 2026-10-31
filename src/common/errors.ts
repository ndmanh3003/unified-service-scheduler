/**
 * Business rule violations. Each code maps to one entry of the error catalog
 * in docs/SPEC.md; the HTTP status is assigned by the global exception filter.
 */
export abstract class AppError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export type ResourceName =
  'Appointment' | 'Vehicle' | 'Dealership' | 'ServiceType';

export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND';

  constructor(
    readonly resource: ResourceName,
    readonly id: string,
  ) {
    super(`${resource} ${id} does not exist.`);
  }
}

export class SlotUnavailableError extends AppError {
  readonly code = 'SLOT_UNAVAILABLE';

  constructor() {
    super('No technician and service bay pair is free for the requested time.');
  }
}

export class VehicleAlreadyBookedError extends AppError {
  readonly code = 'VEHICLE_ALREADY_BOOKED';

  constructor() {
    super('The vehicle already has an overlapping confirmed appointment.');
  }
}

export class NoQualifiedTechnicianError extends AppError {
  readonly code = 'NO_QUALIFIED_TECHNICIAN';

  constructor() {
    super('No active technician at the dealership holds the required skill.');
  }
}

export class OutsideBusinessHoursError extends AppError {
  readonly code = 'OUTSIDE_BUSINESS_HOURS';

  constructor() {
    super('The service does not fit within the dealership opening hours.');
  }
}

export class StartInPastError extends AppError {
  readonly code = 'START_IN_PAST';

  constructor() {
    super('The start time must be in the future.');
  }
}

export class InvalidSlotAlignmentError extends AppError {
  readonly code = 'INVALID_SLOT_ALIGNMENT';

  constructor(granularityMinutes: number) {
    super(
      `The start time must be aligned to ${granularityMinutes}-minute slots.`,
    );
  }
}

export class IdempotencyKeyRequiredError extends AppError {
  readonly code = 'IDEMPOTENCY_KEY_REQUIRED';

  constructor() {
    super('The Idempotency-Key header is required and must be a UUID.');
  }
}

export class IdempotencyKeyReusedError extends AppError {
  readonly code = 'IDEMPOTENCY_KEY_REUSED';

  constructor() {
    super('The idempotency key was already used with a different payload.');
  }
}
