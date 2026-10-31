/**
 * Wall-clock conversions for IANA timezones, built on the standard Intl API so
 * the domain needs no date library.
 */

export interface LocalDate {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
}

export interface LocalDateTime extends LocalDate {
  /** 0 is Sunday, 6 is Saturday. */
  weekday: number;
  /** Minutes since local midnight, 0 to 1439. */
  minuteOfDay: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function toLocal(instant: Date, timeZone: string): LocalDateTime {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') {
      parts[part.type] = Number(part.value);
    }
  }
  const date = { year: parts.year, month: parts.month, day: parts.day };
  return {
    ...date,
    weekday: weekdayOf(date),
    minuteOfDay: parts.hour * 60 + parts.minute,
    second: parts.second,
  };
}

/** The instant at which the given local date and time occur in `timeZone`. */
export function fromLocal(
  date: LocalDate,
  minuteOfDay: number,
  timeZone: string,
): Date {
  const wallClock = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    0,
    minuteOfDay,
  );
  // The offset at the wall-clock guess can differ from the offset at the
  // result when a daylight saving transition lies between them; a second pass
  // settles on the offset in effect at the result.
  let instant = wallClock - offsetAt(new Date(wallClock), timeZone);
  instant = wallClock - offsetAt(new Date(instant), timeZone);
  return new Date(instant);
}

export function weekdayOf(date: LocalDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

function offsetAt(instant: Date, timeZone: string): number {
  const local = toLocal(instant, timeZone);
  const asUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    0,
    local.minuteOfDay,
    local.second,
  );
  return asUtc - (instant.getTime() - instant.getUTCMilliseconds());
}
