import { create } from 'zustand';
import { scopedKey } from '@/storage/scope';
import { syncPomodoroSession, syncPomodoroSettings } from '@/services/syncService';

export type PomodoroMode = 'focus' | 'break' | 'longBreak';

export type PomodoroTheme = 'classic' | 'digital' | 'nature';

export type TimerMode = 'countdown' | 'countup';

export interface PomodoroSettings {
  focusDuration: number;
  breakDuration: number;
  longBreakDuration: number;
  sessionsUntilLongBreak: number;
  theme: PomodoroTheme;
  timerMode: TimerMode;
}

interface PomodoroSnapshot {
  mode: PomodoroMode;
  timeRemaining: number;
  isRunning: boolean;
  isPaused: boolean;
  currentSession: number;
  completedSessions: number;
  totalFocusSeconds: number;
  lastFocusSeconds: number;
  settings: PomodoroSettings;
  endTimestamp: number | null;
}

interface PomodoroStore extends PomodoroSnapshot {
  completedMessage: 'break' | 'focus' | null;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  skip: () => void;
  finishFocus: () => void;
  tick: () => void;
  setMode: (mode: PomodoroMode) => void;
  setSettings: (settings: PomodoroSettings) => void;
  setTheme: (theme: PomodoroTheme) => void;
}

const STORAGE_KEY = 'pomodoro';
export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusDuration: 25,
  breakDuration: 5,
  longBreakDuration: 15,
  sessionsUntilLongBreak: 4,
  theme: 'classic',
  timerMode: 'countdown',
};

const durationFor = (mode: PomodoroMode, settings: PomodoroSettings) => {
  switch (mode) {
    case 'focus': return settings.focusDuration * 60;
    case 'break': return settings.breakDuration * 60;
    case 'longBreak': return settings.longBreakDuration * 60;
  }
};

const isCountUp = (state: PomodoroSnapshot) => state.settings.timerMode === 'countup';

/**
 * Elapsed seconds for the current position (used by Count Up). When the timer
 * is running it derives from `endTimestamp`; while paused/fresh it reads the
 * already-frozen `timeRemaining`.
 */
const elapsedSeconds = (state: PomodoroSnapshot, now = Date.now()): number => {
  if (state.endTimestamp === null) return state.timeRemaining;
  return Math.max(0, Math.floor((now - state.endTimestamp) / 1000));
};

/**
 * Remaining seconds for the current position (used by Countdown). When the
 * timer is running it derives from `endTimestamp`; while paused/fresh it
 * reads the already-frozen `timeRemaining`.
 */
const remainingSeconds = (state: PomodoroSnapshot, now = Date.now()): number => {
  if (state.endTimestamp === null) return state.timeRemaining;
  return Math.max(0, Math.ceil((state.endTimestamp - now) / 1000));
};

const loadSnapshot = (): PomodoroSnapshot => {
  const fallback: PomodoroSnapshot = {
    mode: 'focus', timeRemaining: DEFAULT_POMODORO_SETTINGS.focusDuration * 60,
    isRunning: false, isPaused: false, currentSession: 0, completedSessions: 0,
    totalFocusSeconds: 0, lastFocusSeconds: 0, settings: DEFAULT_POMODORO_SETTINGS, endTimestamp: null,
  };
  try {
    const saved = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!saved) return fallback;
    const parsed = JSON.parse(saved) as Partial<PomodoroSnapshot>;
    const settings = { ...DEFAULT_POMODORO_SETTINGS, ...parsed.settings };
    const mode = parsed.mode === 'break' || parsed.mode === 'longBreak' ? parsed.mode : 'focus';
    const endTimestamp = typeof parsed.endTimestamp === 'number' ? parsed.endTimestamp : null;
    const isRunning = Boolean(parsed.isRunning) && endTimestamp !== null;
    const now = Date.now();
    let timeRemaining: number;
    if (isRunning) {
      timeRemaining = settings.timerMode === 'countup'
        ? Math.max(0, Math.floor((now - endTimestamp) / 1000))
        : Math.max(0, Math.ceil((endTimestamp - now) / 1000));
    } else if (settings.timerMode === 'countup') {
      timeRemaining = Math.max(0, Number(parsed.timeRemaining) || 0);
    } else {
      timeRemaining = Math.max(0, Number(parsed.timeRemaining) || durationFor(mode, settings));
    }
    return {
      ...fallback,
      ...parsed,
      mode,
      settings,
      timeRemaining,
      isRunning,
      isPaused: Boolean(parsed.isPaused),
      lastFocusSeconds: Math.max(0, Number(parsed.lastFocusSeconds) || 0),
      endTimestamp,
    };
  } catch {
    return fallback;
  }
};

const saveSnapshot = (state: PomodoroSnapshot) => {
  try { localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(state)); } catch { /* storage unavailable */ }
};

/**
 * Read the snapshot for the CURRENT scope. Exposed so the session manager can
 * rehydrate the in-memory store after a guest ↔ account scope switch.
 */
export const loadCurrentPomodoroSnapshot = (): PomodoroSnapshot => loadSnapshot();

const requestNotificationPermission = () => {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission();
};

const playNotificationSound = () => {
  try {
    const context = new AudioContext();

    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gain.gain.setValueAtTime(0.3, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.01,
      context.currentTime + 0.5
    );

    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + 0.5);

    oscillator.onended = () => {
      void context.close();
    };
  } catch {
    // Audio is optional
  }
};

const notifyCompletion = (next: 'break' | 'focus') => {
  playNotificationSound();
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification('انتهى الوقت!', { body: next === 'break' ? 'وقت الاستراحة' : 'وقت التركيز', icon: '🍅' });
  }
};

const initialSnapshot = loadSnapshot();

export const usePomodoroStore = create<PomodoroStore>((set, get) => {
  const persist = (next: PomodoroSnapshot) => saveSnapshot(next);
  const update = (
  next: PomodoroSnapshot,
  completedMessage: 'break' | 'focus' | null = null
) => {
  persist(next);

  set({
    ...next,
    completedMessage,
  });
};
  // End the current phase. `credit` controls whether a *focus* session is
  // recorded: it is true only for genuine completions (countdown reaching zero,
  // or pausing exactly at zero). Skipping a focus session calls this with
  // `credit = false`, which still advances to the break phase but records NO
  // focus time, session count, statistics change, or server sync. Breaks always
  // advance normally regardless of `credit`.
  const finish = (credit = true) => {
    const state = get();
    const isFocus = state.mode === 'focus';
    const reachedLongBreak = isFocus && state.currentSession + 1 >= state.settings.sessionsUntilLongBreak;
    const nextMode: PomodoroMode = isFocus ? (reachedLongBreak ? 'longBreak' : 'break') : 'focus';
    // Count Up has no fixed duration: a finished focus session is credited with
    // the actual time counted up. Countdown keeps its configured duration.
    const focusedSeconds = isCountUp(state) ? elapsedSeconds(state) : state.settings.focusDuration * 60;
    // Only a legitimately completed focus session may contribute to focus
    // hours, session counts, statistics, or rankings.
    const recordFocus = isFocus && credit;
    const next: PomodoroSnapshot = {
      ...state,
      mode: nextMode,
      timeRemaining: isCountUp(state) ? 0 : durationFor(nextMode, state.settings),
      isRunning: false,
      isPaused: false,
      endTimestamp: null,
      currentSession: recordFocus ? (reachedLongBreak ? 0 : state.currentSession + 1) : state.currentSession,
      completedSessions: recordFocus ? state.completedSessions + 1 : state.completedSessions,
      totalFocusSeconds: recordFocus ? state.totalFocusSeconds + focusedSeconds : state.totalFocusSeconds,
      lastFocusSeconds: recordFocus ? focusedSeconds : state.lastFocusSeconds,
    };
    // A break completion still announces the next focus phase; a skipped focus
    // session is not a completion and stays silent.
    update(next, isFocus ? (recordFocus ? 'break' : null) : 'focus');
    if (!isFocus || recordFocus) {
      notifyCompletion(isFocus ? 'break' : 'focus');
    }
    // Fire-and-forget: record completed focus session on server for cross-device sync
    if (recordFocus) syncPomodoroSession(focusedSeconds).catch(() => {});
  };

  return {
    ...initialSnapshot,
    completedMessage: null,
    start: () => {
      const state = get();
      if (state.isRunning) return;
      requestNotificationPermission();
      const endTimestamp = isCountUp(state)
        ? Date.now() - state.timeRemaining * 1000
        : Date.now() + state.timeRemaining * 1000;
      const next: PomodoroSnapshot = { ...state, isRunning: true, isPaused: false, endTimestamp };
      update(next);
    },
    pause: () => {
      const state = get();
      if (!state.isRunning) return;
      if (isCountUp(state)) {
        // Count Up has no maximum: freezing just captures the elapsed seconds.
        const next: PomodoroSnapshot = { ...state, timeRemaining: elapsedSeconds(state), isRunning: false, isPaused: true, endTimestamp: null };
        update(next);
        return;
      }
      const remaining = remainingSeconds(state);
      if (remaining === 0) { finish(); return; }
      const next: PomodoroSnapshot = { ...state, timeRemaining: remaining, isRunning: false, isPaused: true, endTimestamp: null };
      update(next);
    },
    resume: () => get().start(),
    reset: () => {
      const state = get();
      // Reset discards the current session WITHOUT recording any focus time.
      // An incomplete focus session is never a completion, so it must not
      // change focus hours, session counts, statistics, rankings, or the
      // server. The timer simply returns to its fresh state in the same mode.
      const next: PomodoroSnapshot = {
        ...state,
        timeRemaining: isCountUp(state) ? 0 : durationFor(state.mode, state.settings),
        isRunning: false,
        isPaused: false,
        endTimestamp: null,
      };
      update(next);
    },
    // Skip a focus session without crediting it (discard); breaks advance as
    // they always have.
    skip: () => finish(false),
    // Manually complete the current Count Up focus session, crediting exactly
    // the time counted up via the same completion flow (stats + server sync).
    // Only an in-progress Count Up focus session can be finished: Countdown has
    // its own automatic completion, breaks are never credited, and a session
    // with nothing counted up yet must not create a phantom session. After
    // `finish(true)` the mode has advanced, so repeated clicks / double-fires /
    // any later call are no-ops — never a duplicate credit or synchronization.
    finishFocus: () => {
      const state = get();
      if (!isCountUp(state) || state.mode !== 'focus') return;
      if (elapsedSeconds(state) <= 0) return;
      finish(true);
    },
    tick: () => {
      const state = get();
      if (!state.isRunning || !state.endTimestamp) return;
      if (isCountUp(state)) {
        // Count Up never finishes automatically — it keeps counting until the
        // user manually finishes, pauses, resets, or skips.
        const elapsed = elapsedSeconds(state);
        if (elapsed !== state.timeRemaining) {
          set({ ...state, timeRemaining: elapsed });
        }
        return;
      }
      const remaining = remainingSeconds(state);
      if (remaining === 0) { finish(); return; }
      if (remaining !== state.timeRemaining) {
        set({ ...state, timeRemaining: remaining });
      }
    },
    setMode: (mode) => {
      const state = get();
      if (state.isRunning) return;
      const next: PomodoroSnapshot = { ...state, mode, timeRemaining: isCountUp(state) ? 0 : durationFor(mode, state.settings), isPaused: false, endTimestamp: null };
      update(next);
    },
    setSettings: (settings) => {
      const state = get();
      if (state.isRunning) {
        const next: PomodoroSnapshot = { ...state, settings };
        update(next);
        syncPomodoroSettings(next.settings);
        return;
      }
      if (settings.timerMode === 'countup') {
        // Count Up has no target duration: keep the current position. Switching
        // into Count Up re-baselines the timer to 00:00.
        const next: PomodoroSnapshot = state.settings.timerMode !== 'countup'
          ? { ...state, settings, timeRemaining: 0, isPaused: false, endTimestamp: null }
          : { ...state, settings };
        update(next);
        syncPomodoroSettings(next.settings);
        return;
      }
      const next: PomodoroSnapshot = { ...state, settings, timeRemaining: durationFor(state.mode, settings), isPaused: false, endTimestamp: null };
      update(next);
      syncPomodoroSettings(next.settings);
    },
    setTheme: (theme) => {
      const state = get();
      // Theme is presentation-only: persist it but never alter any timer state
      // (running/paused, timeRemaining, endTimestamp, mode, sessions).
      const next: PomodoroSnapshot = { ...state, settings: { ...state.settings, theme } };
      update(next);
      syncPomodoroSettings(next.settings);
    },
  };
});