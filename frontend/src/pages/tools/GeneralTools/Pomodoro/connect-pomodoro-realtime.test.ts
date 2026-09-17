// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { io as ioc } from 'socket.io-client';
import type { Socket as ClientSocket } from 'socket.io-client';
import type { PresenceUser } from '@/services/socketService';

const state = vi.hoisted(() => ({ base: '', token: 'user-A' }));

vi.mock('@/services/apiBase', () => ({
  get API_BASE() {
    return state.base;
  },
}));
vi.mock('@/pages/auth/authApi', () => ({
  getAccessToken: () => state.token,
  setTokenRotationHandler: () => {},
  refreshTokenIfNeeded: () => Promise.resolve(true),
}));
vi.mock('@/services/groupApi', () => ({
  listGroups: vi.fn().mockResolvedValue({ groups: [] }),
  submitPomodoroSession: vi.fn().mockResolvedValue({}),
}));

/**
 * Replica of backend presence + focusing protocol. Membership is DB-like and
 * decoupled from room joins, so user A (the focuser) never opens a group page
 * — matching the requirement that the Pomodoro starts from the GENERAL tool.
 */
async function startReplica(): Promise<string> {
  const fakeUsers = new Map<string, { socket: Socket; focusing: boolean; lastHeartbeat: number }>();
  const membership = new Map<string, Set<string>>();

  const httpServer: HttpServer = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });
  const ioServer = new Server(httpServer, { cors: { origin: '*' } });
  const nsp = ioServer.of('/connect');

  nsp.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) {
      next(new Error('missing token'));
      return;
    }
    socket.data.userId = token;
    next();
  });

  const memberGroupsOf = (userId: string): string[] => [...(membership.get(userId) ?? [])];

  const pushPresence = (groupId: string) => {
    const users: PresenceUser[] = [];
    for (const [userId, u] of fakeUsers) {
      if (!memberGroupsOf(userId).includes(groupId)) continue;
      users.push({
        userId,
        username: `user_${userId}`,
        displayName: `User ${userId}`,
        avatarUrl: null,
        focusing: u.focusing,
        lastHeartbeat: u.lastHeartbeat,
        socketCount: 1,
      });
    }
    nsp.to(`group:${groupId}`).emit('group-presence-update', { groupId, users });
  };

  nsp.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    let user = fakeUsers.get(userId);
    if (!user) {
      user = { socket, focusing: false, lastHeartbeat: Date.now() };
      fakeUsers.set(userId, user);
    }
    user.socket = socket;
    user.lastHeartbeat = Date.now();

    socket.on('join-group', ({ groupId }: { groupId: string }) => {
      if (!membership.has(userId)) membership.set(userId, new Set());
      membership.get(userId)!.add(groupId);
      socket.join(`group:${groupId}`);
      user!.lastHeartbeat = Date.now();
      pushPresence(groupId);
    });

    socket.on('heartbeat', () => {
      const u = fakeUsers.get(userId);
      if (u) u.lastHeartbeat = Date.now();
    });

    socket.on('focusing-state', ({ focusing }: { focusing: boolean }) => {
      user!.focusing = focusing === true;
      for (const gid of memberGroupsOf(userId)) {
        nsp
          .to(`group:${gid}`)
          .emit('user-focusing-update', { groupId: gid, userId, focusing: user!.focusing });
        pushPresence(gid);
      }
    });

    socket.on('disconnect', () => {
      fakeUsers.delete(userId);
    });
  });

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const port = (httpServer.address() as { port: number }).port;
  appRef.server = ioServer;
  appRef.httpServer = httpServer;
  appRef.addMember = (userId: string, groupId: string) => {
    if (!membership.has(userId)) membership.set(userId, new Set());
    membership.get(userId)!.add(groupId);
  };
  return `http://127.0.0.1:${port}`;
}

const appRef = {
  server: null as Server | null,
  httpServer: null as HttpServer | null,
  addMember: (userId: string, groupId: string) => {
    void userId;
    void groupId;
  },
};

async function waitUntil(cond: () => boolean, ms = 5000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) {
      throw new Error('waitUntil() timed out');
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

let connectPomodoro: typeof import('./connectPomodoro') | null = null;
let usePomodoroStore: typeof import('@/pages/tools/GeneralTools/Pomodoro/usePomodoroStore').usePomodoroStore | null = null;
const rawClients: ClientSocket[] = [];
let baseUrl = '';

beforeAll(async () => {
  baseUrl = await startReplica();
  state.base = baseUrl;
  connectPomodoro = await import('./connectPomodoro');
  usePomodoroStore = (await import('@/pages/tools/GeneralTools/Pomodoro/usePomodoroStore')).usePomodoroStore;
});

afterEach(() => {
  connectPomodoro?.stopCompletionPolling();
  for (const c of rawClients) c.disconnect();
  rawClients.length = 0;
});

afterAll(async () => {
  connectPomodoro?.stopCompletionPolling();
  for (const c of rawClients) c.disconnect();
  appRef.server?.close();
  appRef.httpServer?.close();
  await new Promise((r) => setTimeout(r, 100));
});

describe('general Pomodoro tool -> Connect focusing (real socket, shared store)', () => {
  it("user B sees user A as Focusing while A's general-tool Pomodoro runs, and clears on pause/finish", async () => {
    const cp = connectPomodoro!;
    const store = usePomodoroStore!;

    appRef.addMember('user-A', 'grp-e2e');
    appRef.addMember('user-B', 'grp-e2e');

    // B opens the group page: a raw socket in the group room.
    const clientB = ioc(`${baseUrl}/connect`, {
      transports: ['websocket', 'polling'],
      auth: { token: 'user-B' },
    });
    rawClients.push(clientB);
    await new Promise<void>((res, rej) => {
      clientB.on('connect', () => res());
      clientB.on('connect_error', (err) => rej(new Error(err.message)));
    });
    clientB.emit('join-group', { groupId: 'grp-e2e' });

    const focusingEvents: { userId: string; focusing: boolean }[] = [];
    const presenceEvents: PresenceUser[][] = [];
    clientB.on('user-focusing-update', (d: { userId: string; focusing: boolean }) =>
      focusingEvents.push({ userId: d.userId, focusing: d.focusing }),
    );
    clientB.on('group-presence-update', (d: { groupId: string; users: PresenceUser[] }) => {
      if (d.groupId === 'grp-e2e') presenceEvents.push(d.users);
    });

    // A is logged in elsewhere and the app-wide observer starts (MainLayout).
    state.token = 'user-A';
    cp.startCompletionPolling();

    // A's observer emits focusing=false on mount; server adds A to presence.
    await waitUntil(() =>
      presenceEvents.some((ev) => ev.some((u) => u.userId === 'user-A' && u.focusing === false)),
    );

    // A presses "ابدأ" on the GENERAL tool -> shared store -> observer -> socket.
    store.setState({ mode: 'focus', timeRemaining: 25 * 60, isRunning: false, isPaused: false });
    store.getState().start();
    await waitUntil(() =>
      focusingEvents.some((e) => e.userId === 'user-A' && e.focusing === true),
    );
    await waitUntil(() =>
      presenceEvents.some((ev) => ev.some((u) => u.userId === 'user-A' && u.focusing === true)),
    );

    // A pauses -> focusing clears.
    store.getState().pause();
    await waitUntil(() =>
      focusingEvents.some((e) => e.userId === 'user-A' && e.focusing === false),
    );

    // A starts again, then the session finishes (tick cycles focus->break,
    // isRunning false) -> focusing clears via the observer.
    store.getState().start();
    await waitUntil(() =>
      focusingEvents.some((e) => e.userId === 'user-A' && e.focusing === true),
    );
    store.setState({ isRunning: false, mode: 'break' });
    await waitUntil(() =>
      focusingEvents.filter((e) => e.userId === 'user-A' && e.focusing === false).length >= 2,
    );
  }, 20000);
});
