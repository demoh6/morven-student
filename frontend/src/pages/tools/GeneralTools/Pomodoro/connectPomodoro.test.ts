import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { usePomodoroStore } from '@/pages/tools/GeneralTools/Pomodoro/usePomodoroStore';
import { listGroups, submitPomodoroSession } from '@/services/groupApi';
import { emitFocusingState, onSocketReconnect } from '@/services/socketService';
import {
  startCompletionPolling,
  stopCompletionPolling,
} from './connectPomodoro';

// Holder so the mocked reconnect hook's registered listener can be triggered
// (and inspected) from tests, mirroring what socketService would invoke on a
// Socket.IO 'connect' event.
const socketServiceMock = vi.hoisted(() => ({
  reconnectListener: null as (() => void) | null,
}));

vi.mock('@/services/groupApi', () => ({
  listGroups: vi.fn(),
  submitPomodoroSession: vi.fn(),
}));

vi.mock('@/services/socketService', () => ({
  emitFocusingState: vi.fn(),
  onSocketReconnect: vi.fn((listener: () => void) => {
    socketServiceMock.reconnectListener = listener;
    return () => {
      if (socketServiceMock.reconnectListener === listener) {
        socketServiceMock.reconnectListener = null;
      }
    };
  }),
}));

const mockListGroups = vi.mocked(listGroups);
const mockSubmit = vi.mocked(submitPomodoroSession);
const mockEmit = vi.mocked(emitFocusingState);
const mockOnSocketReconnect = vi.mocked(onSocketReconnect);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  socketServiceMock.reconnectListener = null;
  mockSubmit.mockResolvedValue({ session: { id: 's', durationSeconds: 0, completedAt: '' }, userTotalSeconds: 0 });
  usePomodoroStore.setState({
    isRunning: false,
    mode: 'focus',
    completedSessions: 0,
    settings: { focusDuration: 25, breakDuration: 5, longBreakDuration: 15, sessionsBeforeLongBreak: 4, autoStart: false },
  } as never);
});

afterEach(() => {
  stopCompletionPolling();
});

describe('connectPomodoro focusing emission', () => {
  it('emits focusing=true when a focus session starts, and false when it stops', () => {
    mockListGroups.mockResolvedValue({ groups: [] });
    startCompletionPolling();

    // Started paused; initial emission should be false.
    expect(mockEmit).toHaveBeenLastCalledWith(false);

    usePomodoroStore.setState({ isRunning: true, mode: 'focus' });
    expect(mockEmit).toHaveBeenLastCalledWith(true);

    usePomodoroStore.setState({ isRunning: false, mode: 'focus' });
    expect(mockEmit).toHaveBeenLastCalledWith(false);
    expect(mockEmit).not.toHaveBeenLastCalledWith(true);
  });

  it('does not emit focusing for break sessions', () => {
    mockListGroups.mockResolvedValue({ groups: [] });
    startCompletionPolling();
    vi.clearAllMocks();

    usePomodoroStore.setState({ isRunning: true, mode: 'break' });
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

describe('connectPomodoro cross-group submission', () => {
  it('submits a completed session to EVERY group the user belongs to', async () => {
    mockListGroups.mockResolvedValue({
      groups: [
        { id: 'g1' } as never,
        { id: 'g2' } as never,
        { id: 'g3' } as never,
      ],
    });
    startCompletionPolling();

    // Let the async group-list refresh (kicked off at startup) settle so the
    // cached member group ids are available before we trigger a completion.
    await new Promise((r) => setTimeout(r, 50));

    // Trigger a completion so the observer credits every group.
    usePomodoroStore.setState({ completedSessions: 1, isRunning: false, mode: 'focus' });

    await vi.waitFor(() => expect(mockSubmit.mock.calls.length).toBeGreaterThanOrEqual(3));

    const groupIds = mockSubmit.mock.calls.map(([data]) => data.groupId);
    expect(groupIds).toContain('g1');
    expect(groupIds).toContain('g2');
    expect(groupIds).toContain('g3');
  });
});

describe('focusing resilience & self-repair', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-emits focusing=true on socket reconnect while a session is running, and stays silent after a stop', () => {
    mockListGroups.mockResolvedValue({ groups: [] });
    startCompletionPolling();
    usePomodoroStore.setState({ isRunning: true, mode: 'focus' });
    expect(mockEmit).toHaveBeenLastCalledWith(true);

    // Simulate a Socket.IO 'connect' after a drop while still focusing.
    vi.clearAllMocks();
    socketServiceMock.reconnectListener?.();
    expect(mockEmit).toHaveBeenLastCalledWith(true);

    // Manual stop emits false and a later reconnect must NOT re-assert focus.
    usePomodoroStore.setState({ isRunning: false, mode: 'focus' });
    expect(mockEmit).toHaveBeenLastCalledWith(false);
    vi.clearAllMocks();
    socketServiceMock.reconnectListener?.();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('periodically re-acks focusing while active, and stops re-acking once no longer focusing', () => {
    vi.useFakeTimers();
    mockListGroups.mockResolvedValue({ groups: [] });
    startCompletionPolling();
    usePomodoroStore.setState({ isRunning: true, mode: 'focus' });
    vi.clearAllMocks();

    // Past the 15s re-ack cadence: the focusing state is re-asserted at least once.
    vi.advanceTimersByTime(16_000);
    expect(mockEmit).toHaveBeenCalledWith(true);

    // Once stopped, no re-ack (nor transition) emission may happen.
    usePomodoroStore.setState({ isRunning: false, mode: 'focus' });
    vi.clearAllMocks();
    vi.advanceTimersByTime(31_000);
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('registers the reconnect hook exactly once even if startCompletionPolling runs twice', () => {
    mockListGroups.mockResolvedValue({ groups: [] });
    startCompletionPolling();
    startCompletionPolling();
    expect(mockOnSocketReconnect).toHaveBeenCalledTimes(1);
  });

  it('stopCompletionPolling unregisters the reconnect hook for clean teardown', () => {
    mockListGroups.mockResolvedValue({ groups: [] });
    startCompletionPolling();
    expect(socketServiceMock.reconnectListener).not.toBeNull();
    stopCompletionPolling();
    expect(socketServiceMock.reconnectListener).toBeNull();
  });

  it('count-up: a fresh start registers as focusing and a manual stop clears it', () => {
    mockListGroups.mockResolvedValue({ groups: [] });
    usePomodoroStore.setState({
      settings: { ...usePomodoroStore.getState().settings, timerMode: 'countup' },
      timeRemaining: 0,
      isRunning: false,
      endTimestamp: null,
    } as never);
    startCompletionPolling();

    usePomodoroStore.getState().start();
    expect(mockEmit).toHaveBeenLastCalledWith(true);

    usePomodoroStore.getState().pause();
    expect(mockEmit).toHaveBeenLastCalledWith(false);
  });

  it('count-up: a session restored as already-running registers as focusing on boot', () => {
    mockListGroups.mockResolvedValue({ groups: [] });
    usePomodoroStore.setState({
      settings: { ...usePomodoroStore.getState().settings, timerMode: 'countup' },
      isRunning: true,
      mode: 'focus',
      isPaused: false,
      timeRemaining: 5400,
      endTimestamp: Date.now() - 5400 * 1000,
    } as never);
    startCompletionPolling();
    expect(mockEmit).toHaveBeenLastCalledWith(true);
  });
});
