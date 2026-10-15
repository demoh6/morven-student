// ---------------------------------------------------------------------------
// Weekly competition period
// ---------------------------------------------------------------------------
// The Morven competition week runs Saturday 00:00:00 through Friday 23:59:59
// in the application's civil timezone (Asia/Hebron by default — the explicit
// timezone strategy already used elsewhere in the app). A new period begins
// every Saturday at 00:00.
//
// Boundaries are derived from the current date/time at query time (Intl-based,
// DST aware). No cron job and no "reset" writes are required: ranking queries
// simply scope Pomodoro sessions by the half-open interval [weekStart,
// nextWeekStart). Historical weeks remain queryable forever because the
// underlying Pomodoro sessions are never deleted or mutated.
// ---------------------------------------------------------------------------

export const DEFAULT_WEEKLY_TIMEZONE = "Asia/Hebron";
export const WEEKLY_TIMEZONE_ENV = "WEEKLY_RANKING_TIMEZONE";

/** The timezone used to compute weekly boundaries. */
export function weeklyTimezone(): string {
  return process.env[WEEKLY_TIMEZONE_ENV] || DEFAULT_WEEKLY_TIMEZONE;
}

export interface WeekBounds {
  /** Saturday 00:00:00 (inclusive) of the current competition week. */
  weekStart: Date;
  /** Friday 23:59:59 of the current competition week (display convenience). */
  weekEnd: Date;
  /** Saturday 00:00:00 of the following week — the exclusive query upper bound. */
  nextWeekStart: Date;
}

export interface CivilDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

interface ZonedParts extends CivilDateTime {
  weekday: string;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Wall-clock components of `date` in `timeZone`. */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const map: Record<string, string> = {};
  for (const part of getFormatter(timeZone).formatToParts(date)) {
    map[part.type] = part.value;
  }
  // Some runtimes report midnight as hour "24"; normalize to 0.
  const hour = Number(map.hour) === 24 ? 0 : Number(map.hour);
  return {
    weekday: map.weekday,
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function toUtcCivil(year: number, month: number, day: number, hour: number, minute: number, second: number): number {
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

/**
 * Convert a civil wall-clock time (in `timeZone`) to the absolute UTC instant.
 * Iteratively corrects for the zone's UTC offset so DST transitions are
 * handled deterministically.
 */
export function zonedTimeToUtc(civil: CivilDateTime, timeZone: string): Date {
  let guess = toUtcCivil(civil.year, civil.month, civil.day, civil.hour, civil.minute, civil.second);
  // Two or three iterations always converge for normal zone offsets.
  for (let i = 0; i < 4; i++) {
    const parts = getZonedParts(new Date(guess), timeZone);
    const target = toUtcCivil(civil.year, civil.month, civil.day, civil.hour, civil.minute, civil.second);
    const current = toUtcCivil(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second);
    const diff = target - current;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SATURDAY = WEEKDAYS.indexOf("Sat");

/** Find the civil date of the Saturday that `date` falls within. */
function saturdayCivilDate(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = getZonedParts(date, timeZone);
  let { year, month, day } = parts;
  let weekday = WEEKDAYS.indexOf(parts.weekday);

  // Walk back one civil day at a time until we hit Saturday.
  for (let i = 0; weekday !== SATURDAY && i < 7; i++) {
    const probe = getZonedParts(new Date(Date.UTC(year, month - 1, day - 1, 12, 0, 0)), timeZone);
    year = probe.year;
    month = probe.month;
    day = probe.day;
    weekday = WEEKDAYS.indexOf(probe.weekday);
  }
  return { year, month, day };
}

/**
 * Compute the current competition week boundaries.
 *
 * @param now        the instant to compute the week for (defaults to now)
 * @param timeZone   IANA timezone (defaults to the configured weekly timezone)
 */
export function getWeekBounds(now: Date = new Date(), timeZone?: string): WeekBounds {
  const tz = timeZone ?? weeklyTimezone();

  const saturday = saturdayCivilDate(now, tz);
  const nextSaturday = getZonedParts(new Date(Date.UTC(saturday.year, saturday.month - 1, saturday.day + 7, 12, 0, 0)), tz);

  const weekStart = zonedTimeToUtc({ ...saturday, hour: 0, minute: 0, second: 0 }, tz);
  const nextWeekStart = zonedTimeToUtc(
    { year: nextSaturday.year, month: nextSaturday.month, day: nextSaturday.day, hour: 0, minute: 0, second: 0 },
    tz,
  );

  return {
    weekStart,
    nextWeekStart,
    weekEnd: new Date(nextWeekStart.getTime() - 1000),
  };
}