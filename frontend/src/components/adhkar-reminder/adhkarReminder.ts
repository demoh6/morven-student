/**
 * Pure, offline day-reminder logic for the Adhkar Reminder feature.
 *
 * Two daily, non-blocking reminders derived exclusively from the USER'S LOCAL
 * clock:
 *   - morning: first shown on or after 10:00 AM
 *   - evening: first shown on or after 5:00 PM
 *
 * Every decision is keyed by the local calendar date (YYYY-MM-DD) so a new
 * local day naturally resets eligibility and an old day's reminder can never
 * leak onto a later day. Nothing in this module talks to the server or to UTC.
 */

import { MORNING_TRIGGER_HOUR, EVENING_TRIGGER_HOUR } from './config';

export type AdhkarReminderSlot = 'morning' | 'evening';

export const REMINDER_SLOTS: AdhkarReminderSlot[] = ['morning', 'evening'];

/** Local hour at which the given daily reminder becomes eligible. */
export function getTriggerHour(slot: AdhkarReminderSlot): number {
  return slot === 'morning' ? MORNING_TRIGGER_HOUR : EVENING_TRIGGER_HOUR;
}

/** Today's trigger instant for the given slot, in the device's local timezone. */
export function getTriggerTime(slot: AdhkarReminderSlot, date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    getTriggerHour(slot),
    0,
    0,
    0,
  );
}

/** Whether the local clock is already at or past today's trigger time. */
export function isTriggerPassed(slot: AdhkarReminderSlot, date: Date): boolean {
  return date.getTime() >= getTriggerTime(slot, date).getTime();
}

/** Local calendar date key `YYYY-MM-DD` (never UTC). */
export function todayKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Whether the reminder for a slot may be SHOWN for the first time today:
 * the trigger has already passed AND the slot was neither shown nor dismissed
 * on the given local day. Once `show()` records `shownDate`, this turns false
 * so a re-render, refresh, or scheduler tick can never show it a second time.
 */
export function isEligibleToShow(
  slot: AdhkarReminderSlot,
  now: Date,
  shownDate: string | null,
  dismissedDate: string | null,
): boolean {
  const today = todayKey(now);
  return (
    isTriggerPassed(slot, now) && shownDate !== today && dismissedDate !== today
  );
}

/**
 * Whether the card for a slot should currently be rendered. Mirrors the
 * persisted `shownDate`/`dismissedDate` (never the ticking clock), so the
 * card stays up all day once shown — and immediately hides on skip, on the
 * start of a new local day, and after a refresh that already dismissed it.
 */
export function isDisplayedForDay(
  slot: AdhkarReminderSlot,
  now: Date,
  shownDate: string | null,
  dismissedDate: string | null,
): boolean {
  const today = todayKey(now);
  return shownDate === today && dismissedDate !== today;
}

/**
 * Next interesting instant strictly after `from`: today's 10:00 / 17:00
 * triggers (whichever is still upcoming) or the next local midnight. The
 * midnight boundary exists so a card that lingered from yesterday is cleared
 * the moment the date changes, and so a brand-new day re-evaluates cleanly.
 * Always returns a valid future date (tomorrow midnight is the floor).
 */
export function getNextReminderBoundary(from: Date): Date {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);

  const candidates = [
    new Date(start.getFullYear(), start.getMonth(), start.getDate(), MORNING_TRIGGER_HOUR, 0, 0, 0),
    new Date(start.getFullYear(), start.getMonth(), start.getDate(), EVENING_TRIGGER_HOUR, 0, 0, 0),
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 0, 0, 0, 0),
  ];

  const future = candidates
    .filter((c) => c.getTime() > from.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  return future[0];
}