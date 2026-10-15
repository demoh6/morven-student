// ---------------------------------------------------------------------------
// Daily focus period
// ---------------------------------------------------------------------------
// Daily focus statistics reset at 00:00:00 local civil time. This deliberately
// reuses the SAME timezone strategy as the weekly competition period
// (Asia/Hebron by default) so a member's "today" and "this week" are computed
// against one consistent civil calendar. No different week/day definition and
// no separate timezone is introduced.
//
// Like the weekly period, boundaries are derived from the current date/time at
// query time (Intl-based, DST aware). No cron job and no "reset" writes are
// required: totals are queried over the half-open interval [dayStart,
// nextDayStart), so the daily total naturally drops to zero at midnight while
// the weekly total is untouched, and historical sessions are never mutated.
// ---------------------------------------------------------------------------

import { getZonedParts, zonedTimeToUtc, weeklyTimezone } from "./week.service";

export interface DayBounds {
  /** 00:00:00 local civil time (inclusive) of the current day. */
  dayStart: Date;
  /** 00:00:00 local civil time of the following day — exclusive upper bound. */
  nextDayStart: Date;
}

/**
 * Compute the current civil day boundaries in the configured timezone.
 *
 * @param now       the instant to compute the day for (defaults to now)
 * @param timeZone  IANA timezone (defaults to the configured weekly timezone)
 */
export function getDayBounds(now: Date = new Date(), timeZone?: string): DayBounds {
  const tz = timeZone ?? weeklyTimezone();

  const parts = getZonedParts(now, tz);
  const dayStart = zonedTimeToUtc(
    { year: parts.year, month: parts.month, day: parts.day, hour: 0, minute: 0, second: 0 },
    tz,
  );

  // Next civil day (walking the civil calendar, not a fixed 24h offset, so DST
  // days are handled correctly).
  const nextCivil = getZonedParts(
    new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1, 12, 0, 0)),
    tz,
  );
  const nextDayStart = zonedTimeToUtc(
    { year: nextCivil.year, month: nextCivil.month, day: nextCivil.day, hour: 0, minute: 0, second: 0 },
    tz,
  );

  return { dayStart, nextDayStart };
}
