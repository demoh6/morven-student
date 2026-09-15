import { io, Socket } from 'socket.io-client';
import { getAccessToken, refreshTokenIfNeeded, setTokenRotationHandler } from '@/pages/auth/authApi';
import { isPreviewMode } from '@/dev/previewMode';
import { API_BASE } from './apiBase';

export interface PresenceUser {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  focusing: boolean;
  lastHeartbeat: number;
  socketCount: number;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  totalSeconds: number;
}

export interface ServerNotificationPayload {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'announcement' | 'update';
  createdAt: string;
  read: boolean;
}

let socket: Socket | null = null;
let currentGroupId: string | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

type PresenceCallback = (users: PresenceUser[]) => void;
type UserEventCallback = (data: { groupId: string; user: { userId: string; username: string; displayName: string } }) => void;
type LeaderboardCallback = (data: { groupId: string; leaderboard: LeaderboardEntry[] }) => void;
type FocusingCallback = (data: { groupId: string; userId: string; focusing: boolean }) => void;
type NotificationCallback = (data: { notification: ServerNotificationPayload }) => void;

let onPresenceUpdate: PresenceCallback | null = null;
let onUserJoined: UserEventCallback | null = null;
let onUserLeft: UserEventCallback | null = null;
let onLeaderboardUpdate: LeaderboardCallback | null = null;
let onFocusingUpdate: FocusingCallback | null = null;
let onNotificationEvent: NotificationCallback | null = null;

// DEV-ONLY: Mock presence simulation for preview mode
let previewPresenceInterval: ReturnType<typeof setInterval> | null = null;

// Preview users demonstrate the feature:
// - preview-user-001 : online + focusing (covers "online + pomodoro running")
// - user-002 (أحمد محمد): online + NOT focusing
// - user-004 (سارة خالد): online + NOT focusing (non-zero hours elsewhere)
// (offline users simply are absent from this list — no standalone indicator)
const MOCK_PRESENCE_USERS: PresenceUser[] = [
  { userId: 'preview-user-001', username: 'preview_user', displayName: 'معاينة المستخدم', avatarUrl: null, focusing: true, lastHeartbeat: Date.now(), socketCount: 1 },
  { userId: 'user-002', username: 'ahmed_m', displayName: 'أحمد محمد', avatarUrl: null, focusing: false, lastHeartbeat: Date.now(), socketCount: 1 },
  { userId: 'user-004', username: 'sara_k', displayName: 'سارة خالد', avatarUrl: null, focusing: false, lastHeartbeat: Date.now(), socketCount: 2 },
];

function simulatePreviewPresence() {
  setTimeout(() => {
    onPresenceUpdate?.([...MOCK_PRESENCE_USERS]);
  }, 300);

  previewPresenceInterval = setInterval(() => {
    const updated = MOCK_PRESENCE_USERS.map((u) => ({
      ...u,
      lastHeartbeat: Date.now(),
    }));
    onPresenceUpdate?.([...updated]);
  }, 15_000);
}

export function connectSocket(): Socket {
  if (isPreviewMode()) {
    return { connected: true, id: 'preview-socket' } as Socket;
  }

  if (socket?.connected) return socket;

  const token = getAccessToken();
  if (!token) throw new Error('No access token');

  socket = io(`${API_BASE}/connect`, {
    auth: { token },
    transports: ['websocket', 'polling'],
    tryAllTransports: true,
  });

  // M2: keep the socket handshake token in sync with the (rotating) access
  // token so automatic reconnections after a refresh never send a stale token.
  setTokenRotationHandler(() => {
    if (socket) {
      socket.auth = { ...socket.auth, token: getAccessToken() };
    }
  });

  socket.on('connect', () => {
    // Presence is app-wide ("online while the socket is connected"), not tied
    // to a specific group room: keep heartbeating for the whole session so the
    // user stays in the online presence snapshot of every group they belong to
    // (the Focusing indicator only renders for online presence members).
    startHeartbeat();
    if (currentGroupId) {
      socket?.emit('join-group', { groupId: currentGroupId });
    }
  });

  socket.on('group-presence-update', (data: { groupId: string; users: PresenceUser[] }) => {
    if (data.groupId === currentGroupId) {
      onPresenceUpdate?.(data.users);
    }
  });

  socket.on('group-user-joined', (data: { groupId: string; user: { userId: string; username: string; displayName: string } }) => {
    if (data.groupId === currentGroupId) {
      onUserJoined?.(data);
    }
  });

  socket.on('group-user-left', (data: { groupId: string; user: { userId: string; username: string; displayName: string } }) => {
    if (data.groupId === currentGroupId) {
      onUserLeft?.(data);
    }
  });

  socket.on('group-leaderboard-update', (data: { groupId: string; leaderboard: LeaderboardEntry[] }) => {
    if (data.groupId === currentGroupId) {
      onLeaderboardUpdate?.(data);
    }
  });

  socket.on('user-focusing-update', (data: { groupId: string; userId: string; focusing: boolean }) => {
    if (data.groupId === currentGroupId) {
      onFocusingUpdate?.(data);
    }
  });

  socket.on('notification:new', (data: { notification: ServerNotificationPayload }) => {
    onNotificationEvent?.(data);
  });

  socket.on('disconnect', () => {
    stopHeartbeat();
  });

  // M2: if the handshake was rejected because the access token expired while
  // the socket was disconnected, refresh it (single-flight) and update the
  // socket's auth so the next automatic reconnect uses a valid token.
  socket.on('connect_error', (err) => {
    if (socket && /invalid token|authentication required/i.test(err.message)) {
      void refreshTokenIfNeeded().then((ok) => {
        if (ok && socket) {
          socket.auth = { ...socket.auth, token: getAccessToken() };
        }
      });
    }
  });

  return socket;
}

/** Emit the current user's live focusing (Pomodoro running) state to the server,
 *  which broadcasts it to every group the user belongs to (cross-group). */
export function emitFocusingState(focusing: boolean) {
  if (isPreviewMode()) return;
  if (!socket) {
    try { connectSocket(); } catch { return; }
  }
  // socket.io buffers events emitted while the socket is still connecting and
  // flushes them on 'connect', so emit regardless of connect state. This avoids
  // dropping the first focusing signal (e.g. when a focus session starts while
  // the socket is mid-connection).
  socket?.emit('focusing-state', { focusing });
}

export function joinGroup(groupId: string) {
  if (isPreviewMode()) {
    if (currentGroupId && currentGroupId !== groupId) {
      leaveGroup(currentGroupId);
    }
    currentGroupId = groupId;
    simulatePreviewPresence();
    return;
  }

  if (!socket?.connected) {
    connectSocket();
  }

  if (currentGroupId && currentGroupId !== groupId) {
    leaveGroup(currentGroupId);
  }

  currentGroupId = groupId;
  socket?.emit('join-group', { groupId });
}

export function leaveGroup(groupId: string) {
  if (isPreviewMode()) {
    if (previewPresenceInterval) {
      clearInterval(previewPresenceInterval);
      previewPresenceInterval = null;
    }
    if (currentGroupId === groupId) {
      currentGroupId = null;
    }
    return;
  }

  socket?.emit('leave-group', { groupId });
  if (currentGroupId === groupId) {
    currentGroupId = null;
  }
}

export function disconnectSocket() {
  if (isPreviewMode()) {
    if (previewPresenceInterval) {
      clearInterval(previewPresenceInterval);
      previewPresenceInterval = null;
    }
    currentGroupId = null;
    return;
  }

  stopHeartbeat();
  currentGroupId = null;
  socket?.disconnect();
  socket = null;
}

export function onPresence(callback: PresenceCallback) {
  onPresenceUpdate = callback;
}

export function onJoined(callback: UserEventCallback) {
  onUserJoined = callback;
}

export function onLeft(callback: UserEventCallback) {
  onUserLeft = callback;
}

export function onLeaderboard(callback: LeaderboardCallback) {
  onLeaderboardUpdate = callback;
}

export function onFocusing(callback: FocusingCallback) {
  onFocusingUpdate = callback;
}

export function onNotification(callback: NotificationCallback | null) {
  onNotificationEvent = callback;
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    socket?.emit('heartbeat', { groupId: currentGroupId ?? undefined });
  }, 15_000);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}
