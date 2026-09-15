/**
 * React interface to the Adhkar Reminder engine.
 *
 * Evaluates on mount (so opening Morven after 10:00 / 17:00 shows the right
 * reminder immediately) and schedules a single timeout towards the next
 * interesting boundary (10:00 / 17:00 / local midnight), plus a resync on
 * visibility/focus so background tabs pick up the reminder as soon as they
 * are used again.
 *
 * Non-blocking by construction: this hook only flips persisted state flags
 * and returns booleans — it never locks scroll, intercepts keys, or moves
 * focus. Card visibility is derived from persisted date keys, so React
 * re-renders, route changes and the StrictMode dev double-mount can never
 * produce duplicate reminders.
 */

import { useEffect, useState } from 'react';

import {
  getNextReminderBoundary,
  isDisplayedForDay,
  isEligibleToShow,
  REMINDER_SLOTS,
} from './adhkarReminder';
import { useAdhkarReminderStore } from './adhkarReminderStore';

/** setTimeout cap (browsers clamp above ~24.8 days anyway). */
const MAX_TIMEOUT_MS = 2_147_483_647;

/** Wake up just past a boundary so timeouts never fire a millisecond early. */
const BOUNDARY_EPSILON_MS = 1000;

export interface UseAdhkarReminderResult {
  isMorningVisible: boolean;
  isEveningVisible: boolean;
}

export function useAdhkarReminder(): UseAdhkarReminderResult {
  const [now, setNow] = useState(() => Date.now());
  const shownDate = useAdhkarReminderStore((s) => s.shownDate);
  const dismissedDate = useAdhkarReminderStore((s) => s.dismissedDate);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const evaluate = () => {
      const date = new Date();
      setNow(date.getTime());
      const store = useAdhkarReminderStore.getState();

      // Show each due slot exactly once per local day. `show()` records
      // `shownDate = today` immediately, so subsequent evaluations skip it.
      for (const slot of REMINDER_SLOTS) {
        if (
          isEligibleToShow(
            slot,
            date,
            store.shownDate[slot],
            store.dismissedDate[slot],
          )
        ) {
          store.show(slot);
        }
      }
    };

    const schedule = () => {
      const nowMs = Date.now();
      const boundary = getNextReminderBoundary(new Date(nowMs));
      const delay = Math.min(
        Math.max(boundary.getTime() - nowMs + BOUNDARY_EPSILON_MS, BOUNDARY_EPSILON_MS),
        MAX_TIMEOUT_MS,
      );
      timer = setTimeout(() => {
        evaluate();
        schedule();
      }, delay);
    };

    evaluate();
    schedule();

    const resync = () => evaluate();
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('focus', resync);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('focus', resync);
    };
  }, []);

  return {
    isMorningVisible: isDisplayedForDay(
      'morning',
      new Date(now),
      shownDate.morning,
      dismissedDate.morning,
    ),
    isEveningVisible: isDisplayedForDay(
      'evening',
      new Date(now),
      shownDate.evening,
      dismissedDate.evening,
    ),
  };
}