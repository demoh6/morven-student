import { Server as SocketIOServer, Socket, Namespace } from "socket.io";
import jwt from "jsonwebtoken";
import { EventEmitter } from "events";
import type { Server as HTTPServer } from "http";
import prisma from "../lib/prisma";
import { createSocketIoCorsOptions } from "../cors";

const JWT_SECRET = process.env.JWT_SECRET;

interface OnlineEntry {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  socketCount: number;
  lastHeartbeat: number;
}

// user-level online presence (NOT room-local). A user is online while they have
// >= 1 authenticated socket. Their online/focusing state is reflected in every
// group they are a member of, independent of which group they currently view.
const onlineUsers = new Map<string, OnlineEntry>();

// user-level transient focusing state (in-memory only, never persisted).
const focusingStore = new Map<string, { focusing: boolean; updatedAt: number }>();

// socketId -> SET<groupId> so we know which group rooms a given socket joined.
const socketGroups = new Map<string, Set<string>>();

// Reference to the /connect namespace (set at setup time) so other services can
// push targeted events to a specific user's personal room (e.g. notifications).
let connectNsRef: Namespace | null = null;

const HEARTBEAT_INTERVAL = 15_000;
// A user stays Online in group presence as long as a heartbeat has been
// received within this window. It is intentionally very generous (5 hours):
// browsers throttle/suspend timers in backgrounded tabs (e.g. Chrome's
// intensive throttling after ~5 min hidden can limit a 15s interval to once
// per minute, and mobile OSes may suspend them entirely), so a tight timeout
// would drop a user who is genuinely connected and mid-Pomodoro purely
// because their tab is hidden. The Pomodoro is independent of this timeout.
const STALE_TIMEOUT = 18_000_000; // 5 hours

function toPresencePayload(entry: OnlineEntry, focusing: boolean) {
  return {
    userId: entry.userId,
    username: entry.username,
    displayName: entry.displayName,
    avatarUrl: entry.avatarUrl,
    focusing,
    lastHeartbeat: entry.lastHeartbeat,
    socketCount: entry.socketCount,
  };
}

function isFocusing(userId: string): boolean {
  return focusingStore.get(userId)?.focusing === true;
}

async function groupMemberProfiles(groupId: string): Promise<{ userId: string; username: string; displayName: string; avatarUrl: string | null }[]> {
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    select: {
      user: {
        select: { id: true, username: true, displayName: true, profile: { select: { avatarUrl: true } } },
      },
    },
  });
  return members.map((m) => ({
    userId: m.user.id,
    username: m.user.username,
    displayName: m.user.displayName,
    avatarUrl: m.user.profile?.avatarUrl ?? null,
  }));
}

async function userGroupIds(userId: string): Promise<string[]> {
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  return memberships.map((m) => m.groupId);
}

// Recompute the online + focusing members for a group from headers of each
// online user whom that group knows about, and push to the room.
async function pushGroupPresence(groupId: string, connectNs: Namespace) {
  const members = await groupMemberProfiles(groupId);
  const profileById = new Map(members.map((m) => [m.userId, m]));
  const present: ReturnType<typeof toPresencePayload>[] = [];

  for (const [userId, entry] of onlineUsers) {
    const profile = profileById.get(userId);
    if (!profile) continue; // not a member of this group
    present.push(
      toPresencePayload(
        { ...entry, username: profile.username, displayName: profile.displayName, avatarUrl: profile.avatarUrl },
        isFocusing(userId),
      ),
    );
  }

  connectNs.to(`group:${groupId}`).emit("group-presence-update", { groupId, users: present });
}

function removeSocketFromOnline(socket: Socket, connectNs: Namespace) {
  const userId = socket.data.userId as string;
  const entry = onlineUsers.get(userId);
  if (!entry) return;

  entry.socketCount -= 1;
  const wentOffline = entry.socketCount <= 0;
  if (wentOffline) {
    onlineUsers.delete(userId);
  }

  // Recompute presence for every group room this socket had joined so viewers
  // see the user leave (or, if still online via another tab, stay with updated count).
  // If the user is fully offline, also emit an explicit user-left event.
  const groups = socketGroups.get(socket.id);
  if (groups) {
    for (const groupId of groups) {
      if (wentOffline) {
        connectNs.to(`group:${groupId}`).emit("group-user-left", {
          groupId,
          user: { userId, username: entry.username, displayName: entry.displayName },
        });
      }
      void pushGroupPresence(groupId, connectNs);
    }
    socketGroups.delete(socket.id);
  }
}

export function setupSocketIO(httpServer: HTTPServer) {
  const io = new SocketIOServer(httpServer, {
    path: "/socket.io",
    cors: createSocketIoCorsOptions(),
  });

  const connectNs = io.of("/connect");
  connectNsRef = connectNs;

  // Authentication middleware
  connectNs.use((socket: Socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token;

    if (!token || typeof token !== "string") {
      next(new Error("Authentication required"));
      return;
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET!) as {
        sub: string;
        username: string;
        displayName: string;
      };
      socket.data.userId = payload.sub;
      socket.data.username = payload.username;
      socket.data.displayName = payload.displayName;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  connectNs.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string;
    const username = socket.data.username as string;
    const displayName = socket.data.displayName as string;

    // Upsert into user-level online registry.
    const existing = onlineUsers.get(userId);
    if (existing) {
      existing.socketCount += 1;
      existing.lastHeartbeat = Date.now();
    } else {
      // Fetch avatar from Profile.
      void prisma.profile
        .findUnique({ where: { userId }, select: { avatarUrl: true } })
        .then((profile) => {
          const cur = onlineUsers.get(userId);
          if (cur) cur.avatarUrl = profile?.avatarUrl ?? null;
        })
        .catch(() => {});
      onlineUsers.set(userId, {
        userId,
        username,
        displayName,
        avatarUrl: null,
        socketCount: 1,
        lastHeartbeat: Date.now(),
      });
    }

    // Join the user's personal room so server-side services can push targeted
    // events (e.g. a new targeted notification) straight to this user's sockets.
    socket.join(`user:${userId}`);

    // Join a group — updates this group's presence list to reflect ALL online
    // members (membership-based, cross-group). Only actual members may join a
    // group's presence room (M1): joining leaks that group's who-is-online /
    // focusing / leaderboard broadcasts to anyone.
    socket.on("join-group", async ({ groupId }: { groupId: string }) => {
      if (!groupId || typeof groupId !== "string") return;

      const membership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
        select: { id: true },
      });
      if (!membership) {
        socket.emit("join-group-error", {
          groupId,
          error: "ليس لديك صلاحية للانضمام لهذه المجموعة",
        });
        return;
      }

      socket.join(`group:${groupId}`);

      if (!socketGroups.has(socket.id)) socketGroups.set(socket.id, new Set());
      socketGroups.get(socket.id)!.add(groupId);

      // Notify others in the group that this user is now online/present.
      socket.to(`group:${groupId}`).emit("group-user-joined", {
        groupId,
        user: { userId, username, displayName },
      });

      // Membership-based presence snapshot including focusing state.
      await pushGroupPresence(groupId, connectNs);
    });

    // Leave a group — stop receiving that group's broadcasts.
    socket.on("leave-group", ({ groupId }: { groupId: string }) => {
      if (!groupId || typeof groupId !== "string") return;
      socket.leave(`group:${groupId}`);
      socketGroups.get(socket.id)?.delete(groupId);
      void pushGroupPresence(groupId, connectNs);
    });

    // Heartbeat keeps the user marked online.
    socket.on("heartbeat", ({ groupId }: { groupId: string }) => {
      const entry = onlineUsers.get(userId);
      if (entry) {
        entry.lastHeartbeat = Date.now();
        return;
      }
      // Self-healing: a socket that is STILL CONNECTED but whose online entry
      // was purged by the stale-cleanup (e.g. the tab was backgrounded and the
      // browser throttled/suspended timers past the stale window) regains its
      // online presence on the next heartbeat — no reload/reconnect required.
      onlineUsers.set(userId, {
        userId,
        username,
        displayName,
        avatarUrl: null,
        socketCount: 1,
        lastHeartbeat: Date.now(),
      });
      void prisma.profile
        .findUnique({ where: { userId }, select: { avatarUrl: true } })
        .then((profile) => {
          const cur = onlineUsers.get(userId);
          if (cur) cur.avatarUrl = profile?.avatarUrl ?? null;
        })
        .catch(() => {});
      // Recompute presence for the groups this user belongs to so viewers see
      // them online (and concentrating, if a Pomodoro is still running) again.
      void userGroupIds(userId).then((groups) => {
        for (const gid of groups) {
          void pushGroupPresence(gid, connectNs);
        }
      });
    });

    // FOCUSING state is a user-level, transient signal. Broadcast it to every
    // group the user belongs to so Focusing reflects across ALL groups.
    socket.on("focusing-state", ({ focusing }: { focusing: boolean }) => {
      const focused = focusing === true;
      focusingStore.set(userId, { focusing: focused, updatedAt: Date.now() });

      void userGroupIds(userId).then((groups) => {
        for (const gid of groups) {
          connectNs.to(`group:${gid}`).emit("user-focusing-update", {
            groupId: gid,
            userId,
            focusing: focused,
          });
          // Refresh the room's presence snapshot too, so viewers who don't
          // already have this user in their presence list see them online AND
          // focusing (the Focusing indicator only renders for members present
          // in the online presence snapshot).
          void pushGroupPresence(gid, connectNs);
        }
      });
    });

    socket.on("disconnect", () => {
      removeSocketFromOnline(socket, connectNs);
    });
  });

  // Stale presence cleanup based on heartbeat.
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [userId, entry] of onlineUsers) {
      if (now - entry.lastHeartbeat > STALE_TIMEOUT) {
        onlineUsers.delete(userId);
        changed = true;
      }
    }
    if (changed) {
      // Recompute presence for all groups (cheap enough at this cadence).
      const seen = new Set<string>();
      for (const groups of socketGroups.values()) {
        for (const gid of groups) {
          if (!seen.has(gid)) {
            seen.add(gid);
            void pushGroupPresence(gid, connectNs);
          }
        }
      }
    }
  }, HEARTBEAT_INTERVAL);

  io.on("close", () => {
    clearInterval(cleanupInterval);
    leaderboardEvents.removeAllListeners();
    connectNsRef = null;
  });

  // Broadcast leaderboard updates to group rooms.
  leaderboardEvents.on("update", ({ groupId, leaderboard }) => {
    connectNs.to(`group:${groupId}`).emit("group-leaderboard-update", { groupId, leaderboard });
  });

  return io;
}

// For testing: expose internal state helpers.
export function getOnlineUsers() {
  return onlineUsers;
}
export function getFocusingStore() {
  return focusingStore;
}

// ---------------------------------------------------------------------------
// Leaderboard broadcast via event emitter
// ---------------------------------------------------------------------------

export const leaderboardEvents = new EventEmitter();
leaderboardEvents.setMaxListeners(50);

// Call this after a pomodoro session is submitted to broadcast to group members
export function broadcastLeaderboard(groupId: string, leaderboard: unknown[]) {
  leaderboardEvents.emit("update", { groupId, leaderboard });
}

// Push a targeted real-time event to all of a specific user's connected sockets
// (joined to their personal "user:<id>" room at connection). No-op when the
// socket layer is not set up or the user is offline — callers must treat this
// as best-effort delivery and keep their persisted state authoritative.
export function emitToUser(userId: string, event: string, payload: unknown) {
  connectNsRef?.to(`user:${userId}`).emit(event, payload);
}
