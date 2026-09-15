/**
 * Public surface of the Adhkar Reminder feature.
 * Everything outside this folder should import from here only.
 */

export { AdhkarReminderHost } from './AdhkarReminderHost';
export { AdhkarReminderCard } from './AdhkarReminderCard';
export { useAdhkarReminder, type UseAdhkarReminderResult } from './useAdhkarReminder';
export {
  useAdhkarReminderStore,
  type SlotDateRecord,
} from './adhkarReminderStore';
export {
  getTriggerHour,
  getTriggerTime,
  isTriggerPassed,
  todayKey,
  isEligibleToShow,
  isDisplayedForDay,
  getNextReminderBoundary,
  REMINDER_SLOTS,
  type AdhkarReminderSlot,
} from './adhkarReminder';
export { ADHKAR_REMINDER_Z_INDEX } from './config';