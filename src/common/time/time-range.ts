const MS_PER_MINUTE = 60_000;

/** A half-open interval `[start, end)` (A3). */
export class TimeRange {
  constructor(
    readonly start: Date,
    readonly end: Date,
  ) {
    if (!(end.getTime() > start.getTime())) {
      throw new RangeError('A time range must end after it starts.');
    }
  }

  static ofDuration(start: Date, minutes: number): TimeRange {
    return new TimeRange(
      start,
      new Date(start.getTime() + minutes * MS_PER_MINUTE),
    );
  }

  overlaps(other: TimeRange): boolean {
    return (
      this.start.getTime() < other.end.getTime() &&
      other.start.getTime() < this.end.getTime()
    );
  }
}
