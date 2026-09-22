/**
 * Prayer Time Engine — Jerusalem, Palestine.
 *
 * Pure TypeScript utility layer. No React, no Zustand, no DOM, no network.
 * `adhan` is imported ONLY here; the rest of Morven consumes this module's
 * own types and functions exclusively.
 *
 * Verified adhan@4.4.4 semantics:
 *  - Input: adhan reads only the civil Y/M/D via the Date's DEVICE-LOCAL
 *    getFullYear/getMonth/getDate. We therefore construct an input whose
 *    device-local components equal the JERUSALEM civil date (derived via
 *    Intl with timeZone 'Asia/Hebron'), so the calculation is anchored to
 *    the correct calendar day on any device in any timezone.
 *  - Output: true absolute UTC instants, directly comparable with Date.now().
 *    They must be formatted through Intl with timeZone 'Asia/Hebron';
 *    never with device-local getters or formatters.
 */

import {
  CalculationMethod,
  Coordinates,
  HighLatitudeRule,
  Madhab,
  PrayerTimes,
  type CalculationParameters,
} from 'adhan';

import {
  DISPLAY_LOCALE,
  JERUSALEM_COORDS,
  PRAYER_CALCULATION,
  PRAYER_TIMEZONE,
  WINDOW_MINUTES,
} from './config';

/* ── Public model ──────────────────────────────────────────────────────── */

export type PrayerId = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

/** Canonical chronological order of the five prayers. */
export const PRAYER_IDS = [
  'fajr',
  'dhuhr',
  'asr',
  'maghrib',
  'isha',
] as const satisfies readonly PrayerId[];

/** Calendar date according to Asia/Hebron, not the device timezone. */
export interface JerusalemDate {
  year: number;
  month: number;
  day: number;
  /** Stable `YYYY-MM-DD` identifier of the Jerusalem civil day. */
  key: string;
}

export interface PrayerTiming {
  id: PrayerId;
  /** Absolute instant; compare directly against Date.now(). */
  at: Date;
}

export interface PrayerSchedule {
  date: JerusalemDate;
  /** Exactly five entries, strictly ascending by time. */
  prayers: PrayerTiming[];
}

/**
 * Half-open window [start, end): start <= now < end.
 */
export interface PrayerWindow {
  id: PrayerId;
  start: Date;
  end: Date;
}

export type PrayerEngineErrorCode =
  | 'unsupported-timezone'
  | 'calculation-failed'
  | 'invalid-schedule'
  | 'unknown-failure';

/** Engine-level error. Future layers must treat this as "no pause", never a crash. */
export class PrayerEngineError extends Error {
  readonly code: PrayerEngineErrorCode;

  constructor(code: PrayerEngineErrorCode, message: string) {
    super(message);
    this.name = 'PrayerEngineError';
    this.code = code;
  }
}

export type PrayerEngineResult =
  | { ok: true; schedule: PrayerSchedule }
  | { ok: false; error: PrayerEngineError };

/* ── Internal timezone helpers (Intl-based, zero dependencies) ─────────── */

const zoneFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getZoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = zoneFormatterCache.get(timeZone);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      throw new PrayerEngineError(
        'unsupported-timezone',
        `Timezone "${timeZone}" is not supported by this runtime's ICU data.`,
      );
    }
    zoneFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

interface ZoneParts {
  year: number;
  month: number;
  day: number;
}

function getZoneParts(instant: Date, timeZone: string): ZoneParts {
  const parts = getZoneFormatter(timeZone).formatToParts(instant);
  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return { year: values.year, month: values.month, day: values.day };
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/* ── Internal adhan bridge ─────────────────────────────────────────────── */

/** Structural view of adhan's result — keeps the library behind this boundary. */
interface RawPrayerTimes {
  fajr: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
}

function createCalculationParameters(): CalculationParameters {
  const parameters = CalculationMethod.Egyptian();
  parameters.fajrAngle = PRAYER_CALCULATION.fajrAngle;
  parameters.ishaAngle = PRAYER_CALCULATION.ishaAngle;
  parameters.madhab =
    PRAYER_CALCULATION.asrShadowFactor === 2 ? Madhab.Hanafi : Madhab.Shafi;
  parameters.highLatitudeRule = HighLatitudeRule.TwilightAngle;
  return parameters;
}

function computeRawSchedule(date: JerusalemDate): RawPrayerTimes {
  // Device-local midnight of the JERUSALEM civil day: adhan reads only this
  // Date's local Y/M/D to select the calendar day for its solar math.
  const civilMidnight = new Date(date.year, date.month - 1, date.day);

  let raw: RawPrayerTimes;
  try {
    const coordinates = new Coordinates(
      JERUSALEM_COORDS.latitude,
      JERUSALEM_COORDS.longitude,
    );
    const times = new PrayerTimes(coordinates, civilMidnight, createCalculationParameters());
    raw = {
      fajr: times.fajr,
      dhuhr: times.dhuhr,
      asr: times.asr,
      maghrib: times.maghrib,
      isha: times.isha,
    };
  } catch (error) {
    if (error instanceof PrayerEngineError) throw error;
    throw new PrayerEngineError(
      'calculation-failed',
      error instanceof Error ? error.message : 'Unknown prayer calculation failure.',
    );
  }

  for (const id of PRAYER_IDS) {
    const at = raw[id];
    if (!(at instanceof Date) || Number.isNaN(at.getTime())) {
      throw new PrayerEngineError(
        'invalid-schedule',
        `Prayer "${id}" is missing or invalid for ${date.key}.`,
      );
    }
  }

  return raw;
}

function validateSchedule(schedule: PrayerSchedule): void {
  for (let i = 0; i < schedule.prayers.length - 1; i++) {
    const current = schedule.prayers[i].at.getTime();
    const next = schedule.prayers[i + 1].at.getTime();
    if (!(current < next)) {
      throw new PrayerEngineError(
        'invalid-schedule',
        `Invalid prayer order for ${schedule.date.key}: "${schedule.prayers[i].id}" is not before "${schedule.prayers[i + 1].id}".`,
      );
    }
  }
}

/* ── Cache (in-memory only; keyed by Jerusalem civil day) ──────────────── */
/*
 * Schedules are deterministic pure functions of their Jerusalem date, so a
 * small LRU memo can never go stale. Deliberately NOT localStorage:
 * correctness beats caching, nothing about pause state is persisted, and the
 * computation costs well under a millisecond.
 */

const scheduleCache = new Map<string, PrayerSchedule>();
const SCHEDULE_CACHE_LIMIT = 8;

function cacheGet(key: string): PrayerSchedule | undefined {
  const hit = scheduleCache.get(key);
  if (hit) {
    scheduleCache.delete(key);
    scheduleCache.set(key, hit);
  }
  return hit;
}

function cacheSet(schedule: PrayerSchedule): void {
  if (!scheduleCache.has(schedule.date.key) && scheduleCache.size >= SCHEDULE_CACHE_LIMIT) {
    const oldest = scheduleCache.keys().next();
    if (!oldest.done) scheduleCache.delete(oldest.value);
  }
  scheduleCache.set(schedule.date.key, schedule);
}

/* ── Public API ────────────────────────────────────────────────────────── */

/** Current calendar date in Jerusalem (Asia/Hebron), regardless of device timezone. */
export function getJerusalemDate(instant: Date = new Date()): JerusalemDate {
  const parts = getZoneParts(instant, PRAYER_TIMEZONE);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    key: `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`,
  };
}

/**
 * The five prayer times as absolute instants for a given Jerusalem civil date.
 * Throws {@link PrayerEngineError} on failure — use the safe variants when a
 * thrown error would cross into UI code.
 */
export function getPrayerTimesForDate(date: JerusalemDate): PrayerSchedule {
  const cached = cacheGet(date.key);
  if (cached && cached.date.year === date.year && cached.date.month === date.month && cached.date.day === date.day) {
    return cached;
  }

  const raw = computeRawSchedule(date);
  const schedule: PrayerSchedule = {
    date,
    prayers: PRAYER_IDS.map((id) => ({ id, at: raw[id] })),
  };

  validateSchedule(schedule);
  cacheSet(schedule);
  return schedule;
}

/** Schedule for the Jerusalem day containing `instant` (defaults to now). */
export function getPrayerTimesForInstant(instant: Date = new Date()): PrayerSchedule {
  return getPrayerTimesForDate(getJerusalemDate(instant));
}

/** "Today" meaning today in Asia/Hebron — not today on the user's computer. */
export function getTodayPrayerTimes(now: Date = new Date()): PrayerSchedule {
  return getPrayerTimesForInstant(now);
}

/**
 * Formats an absolute instant as the Jerusalem wall-clock prayer time.
 * Always formats through Asia/Hebron so users abroad see Jerusalem time.
 */
export function formatPrayerTime(instant: Date, locale: string = DISPLAY_LOCALE): string {
  return getDisplayFormatter(locale).format(instant);
}

/** 5-minute half-open pause window for one prayer timing. */
export function getWindowForPrayer(timing: PrayerTiming): PrayerWindow {
  return {
    id: timing.id,
    start: timing.at,
    end: new Date(timing.at.getTime() + WINDOW_MINUTES * 60_000),
  };
}

/** Non-throwing variant for future layers that prefer result objects. */
export function safeGetPrayerTimesForInstant(instant: Date = new Date()): PrayerEngineResult {
  try {
    return { ok: true, schedule: getPrayerTimesForInstant(instant) };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof PrayerEngineError
          ? error
          : new PrayerEngineError(
              'unknown-failure',
              error instanceof Error ? error.message : 'Unknown prayer engine failure.',
            ),
    };
  }
}

/** Non-throwing variant of {@link getPrayerTimesForDate}. */
export function safeGetPrayerTimesForDate(date: JerusalemDate): PrayerEngineResult {
  try {
    return { ok: true, schedule: getPrayerTimesForDate(date) };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof PrayerEngineError
          ? error
          : new PrayerEngineError(
              'unknown-failure',
              error instanceof Error ? error.message : 'Unknown prayer engine failure.',
            ),
    };
  }
}

/* ── Display formatter cache ───────────────────────────────────────────── */

const displayFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getDisplayFormatter(locale: string): Intl.DateTimeFormat {
  let formatter = displayFormatterCache.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      timeZone: PRAYER_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
    });
    displayFormatterCache.set(locale, formatter);
  }
  return formatter;
}
