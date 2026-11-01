import { ConfigService } from '@nestjs/config';
import {
  InvalidSlotAlignmentError,
  OutsideBusinessHoursError,
  StartInPastError,
} from '@/common/errors.js';
import { TimeRange } from '@/common/time/time-range.js';
import { BookingPolicyService, minuteOfDay } from './booking-policy.service.js';

const policyWithSlots = (slotMinutes: number) =>
  new BookingPolicyService({
    get: () => slotMinutes,
  } as unknown as ConfigService);

// 08:00 to 17:00 in Ho Chi Minh City (UTC+7, no daylight saving).
const dealership = {
  timezone: 'Asia/Ho_Chi_Minh',
  openTime: '08:00:00',
  closeTime: '17:00:00',
};
const timezone = dealership.timezone;
const now = new Date('2030-01-07T00:00:00Z');

// Monday 2030-01-07; local time = UTC + 7 hours.
const range = (startUtc: string, minutes: number) =>
  TimeRange.ofDuration(new Date(startUtc), minutes);

describe('BookingPolicyService', () => {
  const policy = policyWithSlots(15);

  describe('assertValidStart (A5)', () => {
    it('accepts a future start aligned to the slot granularity', () => {
      expect(() =>
        policy.assertValidStart(
          new Date('2030-01-07T02:15:00Z'),
          now,
          timezone,
        ),
      ).not.toThrow();
    });

    it('rejects a start in the past or exactly now', () => {
      expect(() =>
        policy.assertValidStart(
          new Date('2030-01-06T23:45:00Z'),
          now,
          timezone,
        ),
      ).toThrow(StartInPastError);
      expect(() => policy.assertValidStart(now, now, timezone)).toThrow(
        StartInPastError,
      );
    });

    it('rejects a start not aligned to the granularity', () => {
      expect(() =>
        policy.assertValidStart(
          new Date('2030-01-07T02:10:00Z'),
          now,
          timezone,
        ),
      ).toThrow(InvalidSlotAlignmentError);
    });

    it('rejects a start with seconds or milliseconds', () => {
      expect(() =>
        policy.assertValidStart(
          new Date('2030-01-07T02:15:30Z'),
          now,
          timezone,
        ),
      ).toThrow(InvalidSlotAlignmentError);
      expect(() =>
        policy.assertValidStart(
          new Date('2030-01-07T02:15:00.500Z'),
          now,
          timezone,
        ),
      ).toThrow(InvalidSlotAlignmentError);
    });

    it('checks alignment against local wall-clock time', () => {
      // Kathmandu is UTC+5:45, so 10:00 local is 04:15 UTC.
      const hourly = policyWithSlots(60);

      expect(() =>
        hourly.assertValidStart(
          new Date('2030-01-07T04:15:00Z'),
          now,
          'Asia/Kathmandu',
        ),
      ).not.toThrow();
      expect(() =>
        hourly.assertValidStart(
          new Date('2030-01-07T04:00:00Z'),
          now,
          'Asia/Kathmandu',
        ),
      ).toThrow(InvalidSlotAlignmentError);
    });
  });

  describe('assertWithinOpeningHours (A4)', () => {
    it('accepts a service inside opening hours', () => {
      expect(() =>
        policy.assertWithinOpeningHours(
          range('2030-01-07T02:00:00Z', 60),
          dealership,
        ),
      ).not.toThrow();
    });

    it('accepts a service that starts at opening and one that ends exactly at closing', () => {
      expect(() =>
        policy.assertWithinOpeningHours(
          range('2030-01-07T01:00:00Z', 60),
          dealership,
        ),
      ).not.toThrow();
      expect(() =>
        policy.assertWithinOpeningHours(
          range('2030-01-07T09:00:00Z', 60),
          dealership,
        ),
      ).not.toThrow();
    });

    it('rejects a service that starts before opening', () => {
      expect(() =>
        policy.assertWithinOpeningHours(
          range('2030-01-07T00:45:00Z', 60),
          dealership,
        ),
      ).toThrow(OutsideBusinessHoursError);
    });

    it('rejects a service that ends after closing', () => {
      expect(() =>
        policy.assertWithinOpeningHours(
          range('2030-01-07T09:30:00Z', 60),
          dealership,
        ),
      ).toThrow(OutsideBusinessHoursError);
    });

    it('accepts Saturday and rejects Sunday', () => {
      expect(() =>
        policy.assertWithinOpeningHours(
          range('2030-01-12T02:00:00Z', 60),
          dealership,
        ),
      ).not.toThrow();
      expect(() =>
        policy.assertWithinOpeningHours(
          range('2030-01-13T02:00:00Z', 60),
          dealership,
        ),
      ).toThrow(OutsideBusinessHoursError);
    });

    it('rejects a service that spans midnight', () => {
      const allDay = {
        ...dealership,
        openTime: '00:00:00',
        closeTime: '23:59:00',
      };

      expect(() =>
        policy.assertWithinOpeningHours(
          range('2030-01-07T16:30:00Z', 60),
          allDay,
        ),
      ).toThrow(OutsideBusinessHoursError);
    });

    it('evaluates hours in the dealership timezone, not in UTC', () => {
      // 08:00 UTC is 15:00 local; three hours end at 18:00 local, after closing.
      expect(() =>
        policy.assertWithinOpeningHours(
          range('2030-01-07T08:00:00Z', 180),
          dealership,
        ),
      ).toThrow(OutsideBusinessHoursError);
    });
  });
});

describe('minuteOfDay', () => {
  it('converts a PostgreSQL time value to minutes since midnight', () => {
    expect(minuteOfDay('08:00:00')).toBe(480);
    expect(minuteOfDay('17:30:00')).toBe(1050);
    expect(minuteOfDay('09:15')).toBe(555);
  });

  it('rejects a malformed time', () => {
    expect(() => minuteOfDay('8 am')).toThrow();
  });
});

describe('BookingPolicyService.slotStarts', () => {
  const policy = policyWithSlots(15);
  const monday = { year: 2030, month: 1, day: 7 };

  it('lists every aligned start whose service ends by closing time', () => {
    const starts = policy.slotStarts(monday, dealership, 60);

    expect(starts[0]).toEqual(new Date('2030-01-07T01:00:00Z'));
    expect(starts.at(-1)).toEqual(new Date('2030-01-07T09:00:00Z'));
    expect(starts).toHaveLength(33);
  });

  it('returns nothing on a Sunday', () => {
    expect(
      policy.slotStarts({ year: 2030, month: 1, day: 13 }, dealership, 60),
    ).toEqual([]);
  });

  it('returns nothing when the service is longer than the opening hours', () => {
    expect(policy.slotStarts(monday, dealership, 10 * 60)).toEqual([]);
  });
});
