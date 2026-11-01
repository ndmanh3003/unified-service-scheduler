import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BookingPolicyService } from '@/appointments/booking-policy.service.js';
import { NotFoundError } from '@/common/errors.js';
import { Dealership } from '@/database/entities/dealership.entity.js';
import { ServiceType } from '@/database/entities/service-type.entity.js';
import { AvailabilityQueryDto } from './dto/availability-query.dto.js';
import { AvailabilityResponseDto } from './dto/availability-response.dto.js';

/**
 * Advisory view of bookable starts. `POST /appointments` re-verifies
 * everything inside its transaction, so this result is never a reservation.
 */
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly bookingPolicy: BookingPolicyService,
  ) {}

  async find(query: AvailabilityQueryDto): Promise<AvailabilityResponseDto> {
    const dealership = await this.dataSource.manager.findOneBy(Dealership, {
      id: query.dealershipId,
    });
    if (!dealership) {
      throw new NotFoundError('Dealership', query.dealershipId);
    }
    const serviceType = await this.dataSource.manager.findOneBy(ServiceType, {
      id: query.serviceTypeId,
    });
    if (!serviceType) {
      throw new NotFoundError('ServiceType', query.serviceTypeId);
    }

    const [year, month, day] = query.date.split('-').map(Number);
    const now = Date.now();
    const starts = this.bookingPolicy
      .slotStarts({ year, month, day }, dealership, serviceType.durationMinutes)
      .filter((start) => start.getTime() > now);
    const durationMs = serviceType.durationMinutes * 60_000;
    const ends = starts.map((start) => new Date(start.getTime() + durationMs));

    const counts =
      starts.length === 0
        ? []
        : await this.countFreeResources(
            dealership.id,
            serviceType.requiredSkillId,
            starts,
            ends,
          );

    return {
      dealershipId: dealership.id,
      serviceTypeId: serviceType.id,
      date: query.date,
      timezone: dealership.timezone,
      slots: counts
        .filter((c) => c.technicians > 0 && c.service_bays > 0)
        .map((c) => ({
          startAt: starts[c.idx - 1].toISOString(),
          endAt: ends[c.idx - 1].toISOString(),
          availableTechnicians: c.technicians,
          availableServiceBays: c.service_bays,
        })),
    };
  }

  /**
   * One query for the whole day. Technicians and bays are counted
   * independently: any free qualified technician can pair with any free bay.
   */
  private countFreeResources(
    dealershipId: string,
    skillId: string,
    starts: Date[],
    ends: Date[],
  ) {
    return this.dataSource.query<
      { idx: number; technicians: number; service_bays: number }[]
    >(
      `SELECT s.idx::int AS idx,
         (SELECT count(*)::int
          FROM technicians t
          JOIN technician_skills ts ON ts.technician_id = t.id AND ts.skill_id = $2
          WHERE t.dealership_id = $1 AND t.is_active
            AND NOT EXISTS (
              SELECT 1 FROM appointments a
              WHERE a.technician_id = t.id AND a.status = 'CONFIRMED'
                AND a.time_range && tstzrange(s.start_at, s.end_at, '[)'))
         ) AS technicians,
         (SELECT count(*)::int
          FROM service_bays b
          WHERE b.dealership_id = $1 AND b.is_active
            AND NOT EXISTS (
              SELECT 1 FROM appointments a
              WHERE a.service_bay_id = b.id AND a.status = 'CONFIRMED'
                AND a.time_range && tstzrange(s.start_at, s.end_at, '[)'))
         ) AS service_bays
       FROM unnest($3::timestamptz[], $4::timestamptz[])
            WITH ORDINALITY AS s(start_at, end_at, idx)
       ORDER BY s.idx`,
      [
        dealershipId,
        skillId,
        starts.map((d) => d.toISOString()),
        ends.map((d) => d.toISOString()),
      ],
    );
  }
}
