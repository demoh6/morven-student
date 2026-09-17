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

const pushPayload = {
  notification: {
    id: 'n1',
    title: 'تهانينا',
    body: 'تم تعيينك كمشرف في مورفن',
    type: 'info',
    createdAt: '2026-01-01T00:00:00.000Z',
    read: false,
  },
};

describe('notification:new realtime callback', () => {
  beforeEach(() => {
    h.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('invokes the onNotification callback when a targeted notification is pushed', async () => {
    const svc = await import('./socketService');
    const received: unknown[] = [];
    svc.onNotification((d) => received.push(d));

    svc.connectSocket();
    h.fake.connected = true;
    h.fire('connect');
    h.fire('notification:new', pushPayload);

    expect(received).toEqual([pushPayload]);
  });

  it('can be unregistered with onNotification(null)', async () => {
    const svc = await import('./socketService');
    const received: unknown[] = [];
    svc.onNotification((d) => received.push(d));
    svc.onNotification(null);

    svc.connectSocket();
    h.fire('notification:new', pushPayload);

    expect(received).toHaveLength(0);
  });
});