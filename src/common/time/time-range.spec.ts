import { TimeRange } from '@/common/time/time-range.js';

const at = (iso: string) => new Date(iso);

describe('TimeRange', () => {
  it('computes the end from a duration in minutes', () => {
    const range = TimeRange.ofDuration(at('2030-01-07T10:00:00Z'), 90);

    expect(range.end).toEqual(at('2030-01-07T11:30:00Z'));
  });

  it('rejects a range whose end is not after its start', () => {
    expect(
      () =>
        new TimeRange(at('2030-01-07T10:00:00Z'), at('2030-01-07T10:00:00Z')),
    ).toThrow();
    expect(() => TimeRange.ofDuration(at('2030-01-07T10:00:00Z'), 0)).toThrow();
  });

  it('detects a partial overlap', () => {
    const a = new TimeRange(
      at('2030-01-07T10:00:00Z'),
      at('2030-01-07T11:00:00Z'),
    );
    const b = new TimeRange(
      at('2030-01-07T10:30:00Z'),
      at('2030-01-07T11:30:00Z'),
    );

    expect(a.overlaps(b)).toBe(true);
    expect(b.overlaps(a)).toBe(true);
  });

  it('detects containment as an overlap', () => {
    const outer = new TimeRange(
      at('2030-01-07T09:00:00Z'),
      at('2030-01-07T12:00:00Z'),
    );
    const inner = new TimeRange(
      at('2030-01-07T10:00:00Z'),
      at('2030-01-07T11:00:00Z'),
    );

    expect(outer.overlaps(inner)).toBe(true);
    expect(inner.overlaps(outer)).toBe(true);
  });

  it('treats adjacent half-open ranges as non-overlapping (A3)', () => {
    const a = new TimeRange(
      at('2030-01-07T10:00:00Z'),
      at('2030-01-07T11:00:00Z'),
    );
    const b = new TimeRange(
      at('2030-01-07T11:00:00Z'),
      at('2030-01-07T12:00:00Z'),
    );

    expect(a.overlaps(b)).toBe(false);
    expect(b.overlaps(a)).toBe(false);
  });
});
