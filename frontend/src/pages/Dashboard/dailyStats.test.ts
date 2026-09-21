import { describe, it, expect, beforeEach } from 'vitest';
import { localDayKey, tasksCreatedOnDay, getDailyPomodoroSeconds } from './dailyStats';
import type { Task } from '@/types';

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 't1',
    title: 'مهمة',
    description: undefined,
    completed: false,
    priority: 'medium',
    dueDate: undefined,
    taskType: 'normal',
    dailyTime: undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('localDayKey', () => {
  it('uses the LOCAL calendar day (00:00 → 23:59 boundary)', () => {
    expect(localDayKey(new Date(2026, 5, 15, 23, 59, 59))).toBe('2026-06-15');
    expect(localDayKey(new Date(2026, 5, 16, 0, 0, 0))).toBe('2026-06-16');
  });

  it('zero-pads month and day', () => {
    expect(localDayKey(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05');
  });
});

describe('tasksCreatedOnDay', () => {
  const now = new Date(2026, 5, 15, 12, 0, 0);
  const today = new Date(2026, 5, 15, 8, 30, 0).getTime();
  const tomorrow = new Date(2026, 5, 16, 8, 30, 0).getTime();
  const yesterday = new Date(2026, 5, 14, 20, 0, 0).getTime();

  it('counts only tasks created on the current calendar day', () => {
    const tasks = [
      makeTask({ id: 'today', createdAt: today }),
      makeTask({ id: 'yesterday', createdAt: yesterday }),
      makeTask({ id: 'tomorrow', createdAt: tomorrow }),
    ];
    expect(tasksCreatedOnDay(tasks, now)).toBe(1);
  });

  it('counts a task created just before midnight of today', () => {
    const nearMidnight = new Date(2026, 5, 15, 23, 59, 0).getTime();
    expect(tasksCreatedOnDay([makeTask({ id: 'a', createdAt: nearMidnight })], now)).toBe(1);
  });

  it('excludes completed tasks', () => {
    const tasks = [
      makeTask({ id: 'open', createdAt: today }),
      makeTask({ id: 'done', createdAt: today, completed: true }),
    ];
    expect(tasksCreatedOnDay(tasks, now)).toBe(1);
  });

  it('returns 0 when there are no tasks', () => {
    expect(tasksCreatedOnDay([], now)).toBe(0);
  });

  it('does not mutate or remove any task', () => {
    const tasks = [
      makeTask({ id: 'old', createdAt: yesterday }),
      makeTask({ id: 'new', createdAt: today }),
    ];
    const snapshot = JSON.stringify(tasks);
    tasksCreatedOnDay(tasks, now);
    expect(JSON.stringify(tasks)).toBe(snapshot);
  });
});

describe('getDailyPomodoroSeconds', () => {
  const day1 = new Date(2026, 5, 15, 10, 0, 0);
  const day2 = new Date(2026, 5, 16, 0, 30, 0);

  it('starts a fresh day from 0', () => {
    expect(getDailyPomodoroSeconds(1200, day1)).toBe(0);
  });

  it('accumulates focus seconds recorded later the same day', () => {
    expect(getDailyPomodoroSeconds(1200, day1)).toBe(0);
    expect(getDailyPomodoroSeconds(1500, day1)).toBe(300);
    expect(getDailyPomodoroSeconds(3300, day1)).toBe(2100);
  });

  it('resets to 0 at the 12 AM day boundary', () => {
    getDailyPomodoroSeconds(3300, day1);
    expect(getDailyPomodoroSeconds(3300, day2)).toBe(0);
  });

  it('starts accumulating the new day from the reset baseline', () => {
    getDailyPomodoroSeconds(3300, day1);
    getDailyPomodoroSeconds(3300, day2);
    expect(getDailyPomodoroSeconds(3600, day2)).toBe(300);
  });

  it('provides valid counts for both countdown and count-up recordings', () => {
    // Both modes feed the same lifetime `totalFocusSeconds` accumulator.
    getDailyPomodoroSeconds(0, day1);
    expect(getDailyPomodoroSeconds(25 * 60, day1)).toBe(25 * 60);
    expect(getDailyPomodoroSeconds(25 * 60 + 37 * 60, day1)).toBe(62 * 60);
  });

  it('guards against a stored baseline above the current total', () => {
    expect(getDailyPomodoroSeconds(600, day1)).toBe(0);
    expect(getDailyPomodoroSeconds(600, day1)).toBe(0);
  });

  it('only writes the daily record, never the Pomodoro history', () => {
    getDailyPomodoroSeconds(3300, day1);
    getDailyPomodoroSeconds(3300, day2);
    const stored = JSON.parse(localStorage.getItem('morven:guest:pomodoroDaily') ?? '{}');
    expect(stored.day).toBe('2026-06-16');
    expect(stored.baseline).toBe(3300);
    // The lifetime accumulator / session history key is never touched.
    expect(localStorage.getItem('morven:guest:pomodoro')).toBeNull();
  });
});