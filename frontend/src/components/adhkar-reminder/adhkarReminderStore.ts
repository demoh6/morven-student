/**
 * Persisted state behind the Adhkar Reminder feature.
 *
 * Only two per-slot facts survive page loads, keyed by the LOCAL calendar
 * date string:
 *   - shownDate: the day the card was first revealed (keeps "show at most
 *     once per day" true across re-renders, refreshes and Chrome/Safari tabs)
 *   - dismissedDate: the day the user skipped/completed it (never re-appears
 *     that day, and a new local day makes it eligible again naturally)
 *
 * The eligibility comparison happens in `adhkarReminder.ts` at evaluation
 * time, so no midnight reset job is needed — the state is always interpreted
 * against the current `todayKey()`.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AdhkarReminderSlot } from './adhkarReminder';
import { todayKey } from './adhkarReminder';

export type SlotDateRecord = Record<AdhkarReminderSlot, string | null>;

interface AdhkarReminderStore {
  shownDate: SlotDateRecord;
  dismissedDate: SlotDateRecord;

  /** Record that the card for a slot was shown for a given local day. */
  show: (slot: AdhkarReminderSlot, dateKey?: string) => void;

  /** Record that the card for a slot was dismissed/completed that day. */
  dismiss: (slot: AdhkarReminderSlot, dateKey?: string) => void;
}

export const useAdhkarReminderStore = create<AdhkarReminderStore>()(
  persist(
    (set) => ({
      shownDate: { morning: null, evening: null },
      dismissedDate: { morning: null, evening: null },

      show: (slot, dateKey) =>
        set((s) => ({
          shownDate: { ...s.shownDate, [slot]: dateKey ?? todayKey() },
        })),

      dismiss: (slot, dateKey) =>
        set((s) => ({
          dismissedDate: { ...s.dismissedDate, [slot]: dateKey ?? todayKey() },
        })),
    }),
    {
      name: 'morven-adhkar-reminder',
      partialize: (s) => ({ shownDate: s.shownDate, dismissedDate: s.dismissedDate }),
    },
  ),
);