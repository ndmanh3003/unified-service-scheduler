import { fromLocal, toLocal } from '@/common/time/zoned-time.js';

describe('zoned time', () => {
  it('converts an instant to wall-clock time in a timezone', () => {
    const local = toLocal(new Date('2030-01-07T02:30:00Z'), 'Asia/Ho_Chi_Minh');

    expect(local).toMatchObject({
      year: 2030,
      month: 1,
      day: 7,
      weekday: 1,
      minuteOfDay: 9 * 60 + 30,
      second: 0,
    });
  });

  it('reports the local calendar day, not the UTC day', () => {
    const local = toLocal(new Date('2030-01-06T20:00:00Z'), 'Asia/Ho_Chi_Minh');

    expect(local).toMatchObject({ day: 7, weekday: 1, minuteOfDay: 3 * 60 });
  });

  it('converts wall-clock time back to an instant', () => {
    const instant = fromLocal(
      { year: 2030, month: 1, day: 7 },
      9 * 60,
      'Asia/Ho_Chi_Minh',
    );

    expect(instant).toEqual(new Date('2030-01-07T02:00:00Z'));
  });

  it('applies daylight saving offsets', () => {
    const winter = fromLocal(
      { year: 2030, month: 1, day: 7 },
      9 * 60,
      'America/New_York',
    );
    const summer = fromLocal(
      { year: 2030, month: 7, day: 8 },
      9 * 60,
      'America/New_York',
    );

    expect(winter).toEqual(new Date('2030-01-07T14:00:00Z'));
    expect(summer).toEqual(new Date('2030-07-08T13:00:00Z'));
  });
});
