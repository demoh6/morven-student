// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;
  let listeners = new Map<string, Listener[]>();
  const emit = vi.fn();
  const fake = {
    connected: false,
    on: (event: string, cb: Listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), cb]);
    },
    emit,
    disconnect: () => {
      fake.connected = false;
    },
  };
  return {
    fake,
    fire: (event: string, ...args: unknown[]) => {
      for (const cb of listeners.get(event) ?? []) cb(...args);
    },
    reset: () => {
      listeners = new Map();
      emit.mockClear();
      fake.connected = false;
    },
  };
});

vi.mock('socket.io-client', () => ({ io: () => h.fake as never }));

const state = vi.hoisted(() => ({ base: '', token: 'user-A' }));
vi.mock('./apiBase', () => ({
  get API_BASE() {
    return state.base;
  },
}));
vi.mock('@/pages/auth/authApi', () => ({
  getAccessToken: () => state.token,
  setTokenRotationHandler: () => {},
  refreshTokenIfNeeded: () => Promise.resolve(true),
}));

describe('app-wide heartbeat lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.base = 'http://socket-test.local';
    state.token = 'user-A';
    h.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('heartbeats from socket connect (even with no group), survives leaving a group room, and stops on disconnect', async () => {
    const svc = await import('./socketService');

    svc.connectSocket();
    h.fake.connected = true;
    h.fire('connect');

    // Heartbeat runs while the user is connected but not viewing any group
    // (i.e. focusing from the tools page) so they stay in the online presence.
    vi.advanceTimersByTime(16_000);
    expect(h.fake.emit).toHaveBeenCalledWith('heartbeat', { groupId: undefined });

    svc.joinGroup('grp-1');
    vi.advanceTimersByTime(16_000);
    expect(h.fake.emit).toHaveBeenCalledWith('heartbeat', { groupId: 'grp-1' });

    // Leaving the group page must NOT stop the heartbeat: presence is app-wide.
    svc.leaveGroup('grp-1');
    vi.advanceTimersByTime(16_000);
    expect(h.fake.emit).toHaveBeenCalledWith('heartbeat', { groupId: undefined });

    // A full disconnect does stop it.
    svc.disconnectSocket();
    const afterDisconnect = h.fake.emit.mock.calls.length;
    vi.advanceTimersByTime(60_000);
    expect(h.fake.emit.mock.calls.length).toBe(afterDisconnect);
  });
});