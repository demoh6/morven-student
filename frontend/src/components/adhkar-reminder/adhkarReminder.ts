/**
 * Pure, offline day-reminder logic for the Adhkar Reminder feature.
 *
 * Two daily, non-blocking reminders derived exclusively from the USER'S LOCAL
 * clock, visible only inside their strict daily window:
 *   - morning: 10:00 AM → before 12:00 PM (noon)
 *   - evening: 5:00 PM → before 7:00 PM
 *
 * Every decision is keyed by the local calendar date (YYYY-MM-DD) so a new
 * local day naturally resets eligibility and an old day's reminder can never
 * leak onto a later day. Nothing in this module talks to the server or to UTC.
 */

import {
  MORNING_TRIGGER_HOUR,
  EVENING_TRIGGER_HOUR,
  MORNING_END_HOUR,
  EVENING_END_HOUR,
} from './config';

export type AdhkarReminderSlot = 'morning' | 'evening';

export const REMINDER_SLOTS: AdhkarReminderSlot[] = ['morning', 'evening'];

/** Local hour at which the given daily reminder becomes eligible. */
export function getTriggerHour(slot: AdhkarReminderSlot): number {
  return slot === 'morning' ? MORNING_TRIGGER_HOUR : EVENING_TRIGGER_HOUR;
}

/** Local hour at which the given daily reminder's window closes. */
export function getEndHour(slot: AdhkarReminderSlot): number {
  return slot === 'morning' ? MORNING_END_HOUR : EVENING_END_HOUR;
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

/** Today's window-end instant for the given slot, in the device's local timezone. */
export function getEndTime(slot: AdhkarReminderSlot, date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    getEndHour(slot),
    0,
    0,
    0,
  );
}

/** Whether the local clock is already at or past today's trigger time. */
export function isTriggerPassed(slot: AdhkarReminderSlot, date: Date): boolean {
  return date.getTime() >= getTriggerTime(slot, date).getTime();
}

/** Whether the local clock is strictly before today's window end time. */
export function isWithinWindow(slot: AdhkarReminderSlot, date: Date): boolean {
  return date.getTime() < getEndTime(slot, date).getTime();
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
 * the trigger has already passed, the moment is still inside the slot's
 * visibility window, AND the slot was neither shown nor dismissed on the
 * given local day. Once `show()` records `shownDate`, this turns false so a
 * re-render, refresh, or scheduler tick can never show it a second time.
 */
export function isEligibleToShow(
  slot: AdhkarReminderSlot,
  now: Date,
  shownDate: string | null,
  dismissedDate: string | null,
): boolean {
  const today = todayKey(now);
  return (
    isTriggerPassed(slot, now) &&
    isWithinWindow(slot, now) &&
    shownDate !== today &&
    dismissedDate !== today
  );
}

/**
 * Whether the card for a slot should currently be rendered. Mirrors the
 * persisted `shownDate`/`dismissedDate` (never the ticking clock) restricted
 * to the slot's daily visibility window, so the card appears from the trigger
 * hour, auto-hides the moment the window ends, hides on skip, and never
 * lingers past the end of its window or onto a new local day.
 */
export function isDisplayedForDay(
  slot: AdhkarReminderSlot,
  now: Date,
  shownDate: string | null,
  dismissedDate: string | null,
): boolean {
  const today = todayKey(now);
  return (
    shownDate === today &&
    dismissedDate !== today &&
    isWithinWindow(slot, now)
  );
}

/**
 * Next interesting instant strictly after `from`: today's 10:00 / 12:00 /
 * 17:00 / 19:00 window boundaries (whichever is still upcoming) or the next
 * local midnight. The 12:00 / 19:00 boundaries exist so an already-shown card
 * auto-hides the moment its window ends without a refresh; the midnight
 * boundary clears a card that lingered from yesterday and lets a brand-new
 * day re-evaluate cleanly. Always returns a valid future date (tomorrow
 * midnight is the floor).
 */
export function getNextReminderBoundary(from: Date): Date {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);

  const candidates = [
    new Date(start.getFullYear(), start.getMonth(), start.getDate(), MORNING_TRIGGER_HOUR, 0, 0, 0),
    new Date(start.getFullYear(), start.getMonth(), start.getDate(), MORNING_END_HOUR, 0, 0, 0),
    new Date(start.getFullYear(), start.getMonth(), start.getDate(), EVENING_TRIGGER_HOUR, 0, 0, 0),
    new Date(start.getFullYear(), start.getMonth(), start.getDate(), EVENING_END_HOUR, 0, 0, 0),
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 0, 0, 0, 0),
  ];

  const future = candidates
    .filter((c) => c.getTime() > from.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  return future[0];
}