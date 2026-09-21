/**
 * Connect Pomodoro Integration Layer
 *
 * This module connects the EXISTING Morven Pomodoro to Connect groups.
 * It does NOT modify the Pomodoro state machine. It only OBSERVES the existing
 * store and:
 *   1. Broadcasts the user's LIVE focusing state to every group they belong to
 *      (cross-group, via Socket.IO).
 *   2. Submits each valid completed session to every group they belong to so
 *      accumulated Pomodoro hours stay consistent across ALL groups.
 * The existing Morven Pomodoro keeps working normally and offline.
 */

import { usePomodoroStore, type PomodoroSettings } from '@/pages/tools/GeneralTools/Pomodoro/usePomodoroStore';
import { submitPomodoroSession, listGroups } from '@/services/groupApi';
import { emitFocusingState, onSocketReconnect } from '@/services/socketService';

// ---------------------------------------------------------------------------
// Group association state (kept for backward-compat with GroupDetailPage).
// Completion is now credited to ALL the user's groups (cross-group consistent).
// ---------------------------------------------------------------------------

let activeGroupId: string | null = null;
let myGroupIds: string[] = [];

export function setActiveGroupId(groupId: string | null) {
  activeGroupId = groupId;
}

export function getActiveGroupId(): string | null {
  return activeGroupId;
}

async function refreshMyGroupIds() {
  try {
    const { groups } = await listGroups();
    // A system ADMIN's group list contains every group in the system. Pomodoro
    // credit is membership-based, so only target groups the user actually
    // belongs to.
    myGroupIds = groups.filter((g) => g.isMember !== false).map((g) => g.id);
  } catch {
    myGroupIds = [];
  }
}

// ---------------------------------------------------------------------------
// Offline queue for completed sessions
// ---------------------------------------------------------------------------

interface PendingSession {
  groupId: string;
  durationSeconds: number;
  sessionId: string;
  settings: PomodoroSettings;
}

const PENDING_STORAGE_KEY = 'morven-pomodoro-pending';

function loadPendingSessions(): PendingSession[] {
  try {
    const raw = localStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingSession[];
  } catch {
    return [];
  }
}

function savePendingSessions(sessions: PendingSession[]) {
  try {
    localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(sessions));
  } catch { /* storage unavailable */ }
}

function addToPending(session: PendingSession) {
  const pending = loadPendingSessions();
  if (pending.some((p) => p.sessionId === session.sessionId)) return;
  pending.push(session);
  savePendingSessions(pending);
}

export async function syncPendingSessions() {
  const pending = loadPendingSessions();
  if (pending.length === 0) return false;

  const remaining: PendingSession[] = [];
  for (const session of pending) {
    try {
      await submitPomodoroSession({
        groupId: session.groupId,
        durationSeconds: session.durationSeconds,
        sessionId: session.sessionId,
      });
    } catch {
      remaining.push(session);
    }
  }
  savePendingSessions(remaining);

  // Refresh group ids after catching up so subsequent completions target the
  // latest membership set.
  await refreshMyGroupIds();
  return true;
}

// ---------------------------------------------------------------------------
// Completion hook — observes the store for new completions and credits ALL
// of the user's groups (so hours are consistent across every group).
// ---------------------------------------------------------------------------

function generateSessionId(settings: PomodoroSettings): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `pom-${timestamp}-${settings.focusDuration}-${random}`;
}

let lastCompletedSessions = 0;
let lastFocusing = false;

// Reconnect + periodic re-ack machinery so an active focusing state is never
// left invisible to Connect (e.g. when the initial emit was dropped, the token
// was briefly unavailable, or the socket reconnected mid-session).
const FOCUSING_REACK_INTERVAL_MS = 15_000;
let reconnectUnsub: (() => void) | null = null;
let focusingReackInterval: ReturnType<typeof setInterval> | null = null;

export async function submitSessionToAllGroups(state: ReturnType<typeof usePomodoroStore.getState>) {
  const settings = state.settings;
  // Count Up has no fixed duration: credit what was actually counted up (the
  // most recently completed focus session). Countdown keeps its full duration.
  const durationSeconds = state.lastFocusSeconds > 0 ? state.lastFocusSeconds : settings.focusDuration * 60;
  const sessionId = generateSessionId(settings);

  const targets = myGroupIds.length > 0 ? myGroupIds : [activeGroupId].filter((g): g is string => !!g);
  if (targets.length === 0) return;

  for (const groupId of targets) {
    void submitPomodoroSession({ groupId, durationSeconds, sessionId }).catch(() => {
      // Offline or error — queue for later sync.
      addToPending({ groupId, durationSeconds, sessionId, settings });
    });
  }
}

function observeFocusing(state: ReturnType<typeof usePomodoroStore.getState>) {
  const focusing = state.isRunning && state.mode === 'focus';
  if (focusing !== lastFocusing) {
    lastFocusing = focusing;
    emitFocusingState(focusing);
  }
}

let pollInterval: ReturnType<typeof setInterval> | null = null;
let unsubFocusing: (() => void) | null = null;

export function startCompletionPolling() {
  if (pollInterval) return;

  // Cache the user's group membership so completions credit all groups.
  void refreshMyGroupIds();
  // Sync any pending offline sessions on start.
  void syncPendingSessions();

  lastCompletedSessions = usePomodoroStore.getState().completedSessions;
  lastFocusing = usePomodoroStore.getState().isRunning && usePomodoroStore.getState().mode === 'focus';

  // Emit the current focusing state once on mount so other group viewers see it.
  emitFocusingState(lastFocusing);

  // Observe the store: react to focusing transitions AND completion events.
  unsubFocusing = usePomodoroStore.subscribe((state) => {
    observeFocusing(state);
    if (state.completedSessions > lastCompletedSessions) {
      lastCompletedSessions = state.completedSessions;
      void submitSessionToAllGroups(state);
    }
  });

  pollInterval = setInterval(() => {
    const state = usePomodoroStore.getState();
    observeFocusing(state);
    if (state.completedSessions > lastCompletedSessions) {
      lastCompletedSessions = state.completedSessions;
      void submitSessionToAllGroups(state);
    }
  }, 2000);

  // Re-assert the current focusing state every time the socket (re)connects so
  // a running Pomodoro restored from localStorage registers itself with Connect
  // even if the initial focusing event was missed.
  reconnectUnsub = onSocketReconnect(() => {
    if (lastFocusing) emitFocusingState(true);
  });

  // Lightweight periodic re-ack alongside the 15s presence heartbeat: repairs
  // a lost focusing event within seconds. No-op (no emission) whenever the user
  // is not actively focusing, so it never spams the server.
  focusingReackInterval = setInterval(() => {
    if (lastFocusing) emitFocusingState(true);
  }, FOCUSING_REACK_INTERVAL_MS);
}

export function stopCompletionPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  if (unsubFocusing) {
    unsubFocusing();
    unsubFocusing = null;
  }
  if (focusingReackInterval) {
    clearInterval(focusingReackInterval);
    focusingReackInterval = null;
  }
  if (reconnectUnsub) {
    reconnectUnsub();
    reconnectUnsub = null;
  }
}
