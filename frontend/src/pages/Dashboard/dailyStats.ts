import { readScoped, writeScoped } from '@/storage/scope';
import type { Task } from '@/types';

const DAILY_POMODORO_KEY = 'pomodoroDaily';

/**
 * Calendar-day key (YYYY-MM-DD) in the user's LOCAL timezone. A day runs from
 * 12:00 AM to 11:59 PM local time, so this respects the 00:00 boundary instead
 * of the UTC-based date that `toISOString()` would produce.
 */
export function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Number of tasks created on the CURRENT local calendar day (per `createdAt`).
 * Completed tasks are excluded to preserve the card's outstanding-task meaning.
 * This is a pure filtering/view calculation — it never deletes or alters tasks,
 * so previous days' tasks remain fully available in the Task Manager.
 */
export function tasksCreatedOnDay(tasks: Task[], now: Date): number {
  const day = localDayKey(now);
  return tasks.filter((t) => !t.completed && localDayKey(new Date(t.createdAt)) === day).length;
}

interface DailyPomodoroRecord {
  day: string;
  baseline: number;
}

/**
 * Focus seconds recorded since the start of the CURRENT local calendar day.
 *
 * The existing Pomodoro architecture only stores a lifetime `totalFocusSeconds`
 * accumulator (no per-session timestamps), so the day's total is derived by
 * snapshotting that accumulator once per day and taking the delta:
 *
 *   today = max(0, totalFocusSeconds − baseline)
 *
 * `baseline` is persisted (scoped to guest/account, like the rest of the user
 * data) and reset to the current total whenever the day rolls over at 12:00 AM,
 * which starts the new day from zero. Because we only READ `totalFocusSeconds`
 * and never modify Pomodoro state, all historical totals/history remain intact,
 * and both countdown and count-up recordings feed the same accumulator.
 *
 * Note: the baseline is captured at the first computation of each day, so focus
 * time credited before the Dashboard is first shown that day is not attributed
 * to it — an inherent limit of the existing timestamp-less data model.
 */
export function getDailyPomodoroSeconds(totalFocusSeconds: number, now: Date): number {
  const day = localDayKey(now);
  let record = readScoped<DailyPomodoroRecord | null>(DAILY_POMODORO_KEY, null);
  if (!record || record.day !== day) {
    record = { day, baseline: totalFocusSeconds };
    writeScoped(DAILY_POMODORO_KEY, record);
    return 0;
  }
  return Math.max(0, totalFocusSeconds - record.baseline);
}