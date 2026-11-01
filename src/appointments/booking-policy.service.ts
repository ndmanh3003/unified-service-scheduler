import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '@/config/env.validation.js';
import { Dealership } from '@/database/entities/dealership.entity.js';
import {
  InvalidSlotAlignmentError,
  OutsideBusinessHoursError,
  StartInPastError,
} from '@/common/errors.js';
import { TimeRange } from '@/common/time/time-range.js';
import {
  fromLocal,
  LocalDate,
  toLocal,
  weekdayOf,
} from '@/common/time/zoned-time.js';

const SUNDAY = 0;

export type DealershipHours = Pick<
  Dealership,
  'timezone' | 'openTime' | 'closeTime'
>;

/**
 * When an appointment may start and end. Every rule is evaluated in the
 * dealership timezone. Shared with availability, which offers only the
 * starts these rules accept.
 */
@Injectable()
export class BookingPolicyService {
  readonly slotMinutes: number;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.slotMinutes = config.get('SLOT_GRANULARITY_MINUTES', { infer: true });
  }

  /** A5: in the future and on a slot boundary of local wall-clock time. */
  assertValidStart(start: Date, now: Date, timezone: string): void {
    if (start.getTime() <= now.getTime()) {
      throw new StartInPastError();
    }

    // Local time keeps slots in line with opening hours in timezones whose
    // offset is not a whole hour.
    const local = toLocal(start, timezone);
    if (
      local.minuteOfDay % this.slotMinutes !== 0 ||
      local.second !== 0 ||
      start.getUTCMilliseconds() !== 0
    ) {
      throw new InvalidSlotAlignmentError(this.slotMinutes);
    }
  }

  /** A4: Monday to Saturday, within opening hours, on a single local day. */
  assertWithinOpeningHours(
    range: TimeRange,
    dealership: DealershipHours,
  ): void {
    const start = toLocal(range.start, dealership.timezone);
    // The last minute the service occupies; `end` itself is exclusive.
    const last = toLocal(
      new Date(range.end.getTime() - 1),
      dealership.timezone,
    );

    const sameDay =
      start.year === last.year &&
      start.month === last.month &&
      start.day === last.day;

    if (
      start.weekday === SUNDAY ||
      !sameDay ||
      start.minuteOfDay < minuteOfDay(dealership.openTime) ||
      last.minuteOfDay >= minuteOfDay(dealership.closeTime)
    ) {
      throw new OutsideBusinessHoursError();
    }
  }

  /**
   * Every start on a local day that satisfies A4 and A5 apart from being in
   * the future: on a slot boundary, with the whole service before closing.
   */
  slotStarts(
    day: LocalDate,
    dealership: DealershipHours,
    durationMinutes: number,
  ): Date[] {
    if (weekdayOf(day) === SUNDAY) {
      return [];
    }
    const open = minuteOfDay(dealership.openTime);
    const close = minuteOfDay(dealership.closeTime);
    const firstSlot = Math.ceil(open / this.slotMinutes) * this.slotMinutes;
    const starts: Date[] = [];
    for (
      let minute = firstSlot;
      minute + durationMinutes <= close;
      minute += this.slotMinutes
    ) {
      starts.push(fromLocal(day, minute, dealership.timezone));
    }
    return starts;
  }
}

/** Converts a PostgreSQL `time` value (`HH:MM` or `HH:MM:SS`) to minutes since midnight. */
export function minuteOfDay(time: string): number {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match) {
    throw new RangeError(`Invalid time of day: ${time}`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}
