import { describe, expect, it, beforeEach, vi } from 'vitest';
import { usePomodoroStore, type PomodoroTheme, type TimerMode } from './usePomodoroStore';
import { scopedKey } from '@/storage/scope';

const STORAGE_KEY = scopedKey('pomodoro');

beforeEach(() => {
  localStorage.clear();
  // Reset the shared store singleton back to a clean baseline so tests are
  // order-independent.
  usePomodoroStore.setState({
    mode: 'focus',
    timeRemaining: 25 * 60,
    isRunning: false,
    isPaused: false,
    currentSession: 0,
    completedSessions: 0,
    totalFocusSeconds: 0,
    lastFocusSeconds: 0,
    endTimestamp: null,
    settings: {
      focusDuration: 25,
      breakDuration: 5,
      longBreakDuration: 15,
      sessionsUntilLongBreak: 4,
      theme: 'classic' as PomodoroTheme,
      timerMode: 'countdown' as TimerMode,
    },
    completedMessage: null,
  });
});

describe('Pomodoro theme selection', () => {
  it('defaults to the "classic" theme when nothing is saved', () => {
    expect(usePomodoroStore.getState().settings.theme).toBe('classic');
  });

  it('persists each selectable theme to localStorage via setTheme', () => {
    for (const theme of ['digital', 'nature', 'classic'] as PomodoroTheme[]) {
      usePomodoroStore.getState().setTheme(theme);

      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
      expect(saved.settings.theme).toBe(theme);
      expect(usePomodoroStore.getState().settings.theme).toBe(theme);
    }
  });
});

describe('Pomodoro theme is presentation-only', () => {
  it('switching themes while RUNNING preserves all timer state', () => {
    const endTimestamp = 9999999999000;
    usePomodoroStore.setState({
      isRunning: true,
      isPaused: false,
      mode: 'focus',
      currentSession: 3,
      completedSessions: 2,
      totalFocusSeconds: 6000,
      timeRemaining: 5 * 60 + 30,
      endTimestamp,
    });

    const before = usePomodoroStore.getState();

    // Switch through every theme; none may disturb the running timer.
    for (const theme of ['digital', 'nature', 'classic'] as PomodoroTheme[]) {
      usePomodoroStore.getState().setTheme(theme);
      const s = usePomodoroStore.getState();
      expect(s.isRunning).toBe(true);
      expect(s.isPaused).toBe(false);
      expect(s.mode).toBe('focus');
      expect(s.currentSession).toBe(3);
      expect(s.completedSessions).toBe(2);
      expect(s.totalFocusSeconds).toBe(6000);
      expect(s.timeRemaining).toBe(before.timeRemaining);
      expect(s.endTimestamp).toBe(endTimestamp);
      expect(s.settings.theme).toBe(theme);
    }
  });

  it('switching themes while PAUSED preserves paused state and exact remaining time', () => {
    usePomodoroStore.setState({
      isRunning: false,
      isPaused: true,
      mode: 'break',
      currentSession: 1,
      timeRemaining: 3 * 60 + 7,
      endTimestamp: null,
    });

    const before = usePomodoroStore.getState();

    usePomodoroStore.getState().setTheme('nature');
    const s = usePomodoroStore.getState();
    expect(s.isRunning).toBe(false);
    expect(s.isPaused).toBe(true);
    expect(s.mode).toBe('break');
    expect(s.timeRemaining).toBe(before.timeRemaining);
    expect(s.endTimestamp).toBeNull();
    expect(s.settings.theme).toBe('nature');
  });

  it('switching themes while paused does not reset the remaining time to full duration', () => {
    usePomodoroStore.setState({
      isRunning: false,
      isPaused: true,
      mode: 'focus',
      timeRemaining: 1 * 60 + 12, // deliberately not the full 25m
      endTimestamp: null,
    });

    usePomodoroStore.getState().setTheme('digital');
    const s = usePomodoroStore.getState();
    expect(s.timeRemaining).toBe(1 * 60 + 12);
    expect(s.isPaused).toBe(true);
  });
});

describe('Timer mode selection', () => {
  it('defaults to "countdown" mode when nothing is saved', () => {
    expect(usePomodoroStore.getState().settings.timerMode).toBe('countdown');
  });

  it('persists the selected timer mode to localStorage via setSettings', () => {
    usePomodoroStore.getState().setSettings({
      ...usePomodoroStore.getState().settings,
      timerMode: 'countup',
    });

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(saved.settings.timerMode).toBe('countup');
    expect(usePomodoroStore.getState().settings.timerMode).toBe('countup');
  });

  it('switching into Count Up while paused re-baselines the timer to 00:00', () => {
    usePomodoroStore.setState({ isPaused: true, timeRemaining: 12 * 60 + 30, endTimestamp: null });
    usePomodoroStore.getState().setSettings({ ...usePomodoroStore.getState().settings, timerMode: 'countup' });

    const s = usePomodoroStore.getState();
    expect(s.settings.timerMode).toBe('countup');
    expect(s.timeRemaining).toBe(0);
    expect(s.isPaused).toBe(false);
    expect(s.isRunning).toBe(false);
  });

  it('switching back to Countdown restores a full-duration position', () => {
    usePomodoroStore.setState({
      settings: { ...usePomodoroStore.getState().settings, timerMode: 'countup' },
      timeRemaining: 45 * 60,
      isPaused: true,
      isRunning: false,
      endTimestamp: null,
    });
    usePomodoroStore.getState().setSettings({ ...usePomodoroStore.getState().settings, timerMode: 'countdown' });

    expect(usePomodoroStore.getState().timeRemaining).toBe(25 * 60);
    expect(usePomodoroStore.getState().isPaused).toBe(false);
  });
});

describe('Count Up timer behavior', () => {
  beforeEach(() => {
    usePomodoroStore.setState({
      settings: { ...usePomodoroStore.getState().settings, timerMode: 'countup' },
      timeRemaining: 0,
      isRunning: false,
      isPaused: false,
      endTimestamp: null,
    });
  });

  it('starts from 00:00 and keeps counting upward without any built-in limit', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const store = usePomodoroStore;

    store.getState().start();
    expect(store.getState().isRunning).toBe(true);
    expect(store.getState().timeRemaining).toBe(0);

    vi.setSystemTime(1_700_000_000_000 + 5_000);
    store.getState().tick();
    expect(store.getState().timeRemaining).toBe(5);

    // Past a full hour and far beyond any configured duration — still counting.
    vi.setSystemTime(1_700_000_000_000 + 2 * 3600 * 1000);
    store.getState().tick();
    expect(store.getState().timeRemaining).toBe(2 * 3600);
    expect(store.getState().isRunning).toBe(true);
    expect(store.getState().completedSessions).toBe(0);

    vi.useRealTimers();
  });

  it('pause freezes the elapsed time and resume continues from it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const store = usePomodoroStore;

    store.getState().start();
    vi.setSystemTime(1_700_000_000_000 + 30_000);
    store.getState().pause();
    expect(store.getState().isPaused).toBe(true);
    expect(store.getState().timeRemaining).toBe(30);
    expect(store.getState().endTimestamp).toBeNull();

    // Time keeps passing while paused — the frozen value must not advance.
    vi.setSystemTime(1_700_000_000_000 + 120_000);
    store.getState().tick();
    expect(store.getState().timeRemaining).toBe(30);

    store.getState().resume();
    expect(store.getState().isRunning).toBe(true);
    expect(store.getState().endTimestamp).not.toBeNull();

    vi.setSystemTime(1_700_000_000_000 + 120_000 + 10_000);
    store.getState().tick();
    expect(store.getState().timeRemaining).toBe(40);

    vi.useRealTimers();
  });

  it('reset returns the Count Up timer to 00:00 and clears running/paused state', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const store = usePomodoroStore;

    store.getState().start();
    vi.setSystemTime(1_700_000_000_000 + 10 * 60 * 1000);
    store.getState().tick();
    expect(store.getState().timeRemaining).toBe(600);

    store.getState().reset();
    const s = store.getState();
    expect(s.timeRemaining).toBe(0);
    expect(s.isRunning).toBe(false);
    expect(s.isPaused).toBe(false);
    expect(s.endTimestamp).toBeNull();
    expect(s.completedSessions).toBe(0);
    expect(s.totalFocusSeconds).toBe(0);

    vi.useRealTimers();
  });

  it('skipping a Count Up focus session credits the actual counted time to stats', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const store = usePomodoroStore;

    store.getState().start();
    vi.setSystemTime(1_700_000_000_000 + 45 * 60 * 1000);
    store.getState().tick();
    expect(store.getState().timeRemaining).toBe(45 * 60);

    store.getState().skip();
    const s = store.getState();
    expect(s.completedSessions).toBe(1);
    expect(s.totalFocusSeconds).toBe(45 * 60);
    expect(s.lastFocusSeconds).toBe(45 * 60);
    expect(s.mode).toBe('break');
    expect(s.isRunning).toBe(false);
    expect(s.timeRemaining).toBe(0);

    vi.useRealTimers();
  });

  it('never completes on its own — the session ends only by user action', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const store = usePomodoroStore;

    store.getState().start();
    vi.setSystemTime(1_700_000_000_000 + 99 * 3600 * 1000);
    store.getState().tick();

    const s = store.getState();
    expect(s.completedMessage).toBeNull();
    expect(s.isRunning).toBe(true);
    expect(s.timeRemaining).toBe(99 * 3600);

    vi.useRealTimers();
  });
});

describe('Countdown timer behavior (unchanged)', () => {
  it('counts down to zero then completes the session automatically', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const store = usePomodoroStore;

    store.getState().start();
    vi.setSystemTime(1_700_000_000_000 + 60_000);
    store.getState().tick();
    expect(store.getState().timeRemaining).toBe(24 * 60);

    vi.setSystemTime(1_700_000_000_000 + 25 * 60 * 1000);
    store.getState().tick();

    const s = store.getState();
    expect(s.isRunning).toBe(false);
    expect(s.completedSessions).toBe(1);
    expect(s.totalFocusSeconds).toBe(25 * 60);
    expect(s.lastFocusSeconds).toBe(25 * 60);
    expect(s.mode).toBe('break');
    expect(s.timeRemaining).toBe(5 * 60);

    vi.useRealTimers();
  });

  it('pause mid-way freezes the remaining time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const store = usePomodoroStore;

    store.getState().start();
    vi.setSystemTime(1_700_000_000_000 + 2 * 60_000);
    store.getState().pause();

    const s = store.getState();
    expect(s.isPaused).toBe(true);
    expect(s.isRunning).toBe(false);
    expect(s.timeRemaining).toBe(23 * 60);
    expect(s.endTimestamp).toBeNull();

    vi.useRealTimers();
  });
});
