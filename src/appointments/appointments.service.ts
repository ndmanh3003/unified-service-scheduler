import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { Appointment } from '@/database/entities/appointment.entity.js';
import { Dealership } from '@/database/entities/dealership.entity.js';
import { ServiceType } from '@/database/entities/service-type.entity.js';
import { Vehicle } from '@/database/entities/vehicle.entity.js';
import {
  CandidateAllocator,
  CandidatePair,
  ContestedResource,
} from './candidate-allocator.js';
import {
  NoQualifiedTechnicianError,
  NotFoundError,
  SlotUnavailableError,
  VehicleAlreadyBookedError,
} from '@/common/errors.js';
import { TimeRange } from '@/common/time/time-range.js';
import { toLocal } from '@/common/time/zoned-time.js';
import { BookingPolicyService } from './booking-policy.service.js';
import { IdempotencyService } from './idempotency.service.js';

export interface CreateAppointmentInput {
  idempotencyKey: string;
  vehicleId: string;
  serviceTypeId: string;
  dealershipId: string;
  startAt: Date;
}

export type AppointmentDetails = Required<Appointment>;

export interface CreateAppointmentResult {
  appointment: AppointmentDetails;
  /** True when an earlier booking under the same key is returned. */
  replayed: boolean;
}

const EXCLUSION_VIOLATION = '23P01';
const DEADLOCK_DETECTED = '40P01';

/**
 * Two transactions inserting overlapping rows can each wait for the other's
 * uncommitted row; PostgreSQL then aborts one of them. The day lock prevents
 * this within a dealership; a vehicle booked at two dealerships at once can
 * still deadlock, and the victim retries the same pair.
 */
const MAX_DEADLOCK_RETRIES = 3;

/** Which resource an exclusion constraint protects; see the migration. */
const RESOURCE_BY_CONSTRAINT: Record<string, ContestedResource | 'vehicle'> = {
  appointments_technician_no_overlap: 'technician',
  appointments_service_bay_no_overlap: 'serviceBay',
  appointments_vehicle_no_overlap: 'vehicle',
};

const DETAIL_RELATIONS = {
  customer: true,
  vehicle: true,
  dealership: true,
  serviceType: true,
  technician: true,
  serviceBay: true,
} as const;

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly bookingPolicy: BookingPolicyService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /**
   * Books the first free technician and bay pair. The exclusion constraints
   * decide every race; the queries before the insert only narrow the
   * candidates. See docs/SYSTEM_DESIGN.md (Booking Flow).
   */
  create(input: CreateAppointmentInput): Promise<CreateAppointmentResult> {
    // Any failure rolls back the idempotency claim with the booking (A11).
    return this.dataSource.transaction(async (manager) => {
      const claim = await this.idempotency.claim(
        manager,
        input.idempotencyKey,
        this.idempotency.hashRequest(input),
      );
      if (claim.status === 'replay') {
        this.logger.log({
          msg: 'idempotent_replay',
          appointmentId: claim.appointmentId,
        });
        return {
          appointment: await this.loadDetails(manager, claim.appointmentId),
          replayed: true,
        };
      }

      const dealership = await manager.findOneBy(Dealership, {
        id: input.dealershipId,
      });
      if (!dealership) {
        throw new NotFoundError('Dealership', input.dealershipId);
      }
      const serviceType = await manager.findOneBy(ServiceType, {
        id: input.serviceTypeId,
      });
      if (!serviceType) {
        throw new NotFoundError('ServiceType', input.serviceTypeId);
      }
      const vehicle = await manager.findOneBy(Vehicle, { id: input.vehicleId });
      if (!vehicle) {
        throw new NotFoundError('Vehicle', input.vehicleId);
      }

      this.bookingPolicy.assertValidStart(
        input.startAt,
        new Date(),
        dealership.timezone,
      );
      const range = TimeRange.ofDuration(
        input.startAt,
        serviceType.durationMinutes,
      );
      this.bookingPolicy.assertWithinOpeningHours(range, dealership);

      if (
        (await this.countQualifiedTechnicians(
          manager,
          dealership.id,
          serviceType.requiredSkillId,
        )) === 0
      ) {
        throw new NoQualifiedTechnicianError();
      }
      await this.lockDealershipDay(manager, dealership, range);

      if (await this.vehicleIsBusy(manager, vehicle.id, range)) {
        this.logger.log({
          msg: 'booking_conflict',
          reason: 'vehicle',
          vehicleId: vehicle.id,
        });
        throw new VehicleAlreadyBookedError();
      }

      const free = await this.findFreeResources(
        manager,
        dealership.id,
        serviceType.requiredSkillId,
        range,
      );
      const allocator = new CandidateAllocator(
        free.technicianIds,
        free.serviceBayIds,
      );

      let attempts = 0;
      let deadlocks = 0;
      let pair = allocator.next();
      while (pair) {
        attempts++;
        const outcome = await this.tryInsert(manager, pair, range, {
          customerId: vehicle.customerId,
          vehicleId: vehicle.id,
          dealershipId: dealership.id,
          serviceTypeId: serviceType.id,
        });

        if (outcome.status === 'inserted') {
          this.logger.log({
            msg: 'booking_created',
            appointmentId: outcome.id,
            ...pair,
            attempts,
          });
          await this.idempotency.complete(
            manager,
            input.idempotencyKey,
            outcome.id,
          );
          return {
            appointment: await this.loadDetails(manager, outcome.id),
            replayed: false,
          };
        }

        if (outcome.status === 'deadlock') {
          this.logger.log({ msg: 'booking_deadlock_retry', ...pair });
          if (++deadlocks > MAX_DEADLOCK_RETRIES) {
            throw new Error('Booking insert deadlocked repeatedly.');
          }
          continue;
        }

        // A concurrent booking committed first; the savepoint undid the attempt.
        this.logger.log({
          msg: 'booking_conflict',
          reason: outcome.resource,
          ...pair,
        });
        if (outcome.resource === 'vehicle') {
          throw new VehicleAlreadyBookedError();
        }
        allocator.markTaken(pair, outcome.resource);
        pair = allocator.next();
      }

      this.logger.log({
        msg: 'booking_conflict',
        reason: 'no_free_pair',
        attempts,
      });
      throw new SlotUnavailableError();
    });
  }

  async findOne(id: string): Promise<AppointmentDetails> {
    return this.loadDetails(this.dataSource.manager, id);
  }

  private async loadDetails(
    manager: EntityManager,
    id: string,
  ): Promise<AppointmentDetails> {
    const appointment = await manager.findOne(Appointment, {
      where: { id },
      relations: DETAIL_RELATIONS,
    });
    if (!appointment) {
      throw new NotFoundError('Appointment', id);
    }
    return appointment as AppointmentDetails;
  }

  /**
   * Inserts inside a savepoint: a failed statement otherwise aborts the whole
   * PostgreSQL transaction, and the next candidate could not be tried.
   */
  private async tryInsert(
    manager: EntityManager,
    pair: CandidatePair,
    range: TimeRange,
    refs: {
      customerId: string;
      vehicleId: string;
      dealershipId: string;
      serviceTypeId: string;
    },
  ): Promise<
    | { status: 'inserted'; id: string }
    | { status: 'conflict'; resource: ContestedResource | 'vehicle' }
    | { status: 'deadlock' }
  > {
    await manager.query('SAVEPOINT allocation_attempt');
    try {
      const [row] = await manager.query<{ id: string }[]>(
        `INSERT INTO appointments (customer_id, vehicle_id, dealership_id, service_type_id,
                                   technician_id, service_bay_id, start_at, end_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          refs.customerId,
          refs.vehicleId,
          refs.dealershipId,
          refs.serviceTypeId,
          pair.technicianId,
          pair.serviceBayId,
          range.start,
          range.end,
        ],
      );
      await manager.query('RELEASE SAVEPOINT allocation_attempt');
      return { status: 'inserted', id: row.id };
    } catch (error) {
      const code = pgErrorCode(error);
      const resource = contestedResourceOf(error);
      if (code !== DEADLOCK_DETECTED && !resource) {
        throw error;
      }
      // Any error leaves the transaction aborted; the savepoint recovers it.
      await manager.query('ROLLBACK TO SAVEPOINT allocation_attempt');
      return resource
        ? { status: 'conflict', resource }
        : { status: 'deadlock' };
    }
  }

  /**
   * Serializes bookings for one dealership and local day until the
   * transaction ends. Overlapping bookings always share that key (A4), so
   * they queue instead of deadlocking on each other's uncommitted rows, and
   * each one sees the bookings committed before it. The exclusion constraints
   * remain the guarantee; this lock only orders the contenders.
   */
  private async lockDealershipDay(
    manager: EntityManager,
    dealership: Dealership,
    range: TimeRange,
  ): Promise<void> {
    const day = toLocal(range.start, dealership.timezone);
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`booking:${dealership.id}:${day.year}-${day.month}-${day.day}`],
    );
  }

  private async countQualifiedTechnicians(
    manager: EntityManager,
    dealershipId: string,
    skillId: string,
  ): Promise<number> {
    const [row] = await manager.query<{ count: number }[]>(
      `SELECT count(*)::int AS count
       FROM technicians t
       JOIN technician_skills ts ON ts.technician_id = t.id AND ts.skill_id = $2
       WHERE t.dealership_id = $1 AND t.is_active`,
      [dealershipId, skillId],
    );
    return row.count;
  }

  private async vehicleIsBusy(
    manager: EntityManager,
    vehicleId: string,
    range: TimeRange,
  ): Promise<boolean> {
    const rows = await manager.query<unknown[]>(
      `SELECT 1 FROM appointments
       WHERE vehicle_id = $1 AND status = 'CONFIRMED'
         AND time_range && tstzrange($2, $3, '[)')
       LIMIT 1`,
      [vehicleId, range.start, range.end],
    );
    return rows.length > 0;
  }

  /** Active qualified technicians and active bays with no confirmed appointment overlapping `range`. */
  private async findFreeResources(
    manager: EntityManager,
    dealershipId: string,
    skillId: string,
    range: TimeRange,
  ): Promise<{ technicianIds: string[]; serviceBayIds: string[] }> {
    const technicians = await manager.query<{ id: string }[]>(
      `SELECT t.id
       FROM technicians t
       JOIN technician_skills ts ON ts.technician_id = t.id AND ts.skill_id = $2
       WHERE t.dealership_id = $1 AND t.is_active
         AND NOT EXISTS (
           SELECT 1 FROM appointments a
           WHERE a.technician_id = t.id AND a.status = 'CONFIRMED'
             AND a.time_range && tstzrange($3, $4, '[)'))`,
      [dealershipId, skillId, range.start, range.end],
    );
    const serviceBays = await manager.query<{ id: string }[]>(
      `SELECT b.id
       FROM service_bays b
       WHERE b.dealership_id = $1 AND b.is_active
         AND NOT EXISTS (
           SELECT 1 FROM appointments a
           WHERE a.service_bay_id = b.id AND a.status = 'CONFIRMED'
             AND a.time_range && tstzrange($2, $3, '[)'))`,
      [dealershipId, range.start, range.end],
    );
    return {
      technicianIds: technicians.map((row) => row.id),
      serviceBayIds: serviceBays.map((row) => row.id),
    };
  }
}

function pgErrorCode(error: unknown): string | undefined {
  return error instanceof QueryFailedError
    ? (error.driverError as { code?: string }).code
    : undefined;
}

function contestedResourceOf(
  error: unknown,
): ContestedResource | 'vehicle' | undefined {
  if (!(error instanceof QueryFailedError)) {
    return undefined;
  }
  const { code, constraint } = error.driverError as {
    code?: string;
    constraint?: string;
  };
  return code === EXCLUSION_VIOLATION && constraint
    ? RESOURCE_BY_CONSTRAINT[constraint]
    : undefined;
}
