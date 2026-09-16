/**
 * Fire-and-forget sync helpers. Every local mutation in the app should call
 * the corresponding sync function AFTER writing to localStorage/in-memory
 * store. If the user is offline or the API fails, the local data is preserved
 * and will be pushed on the next successful sync (or merged on boot via
 * hydrateFromServer).
 *
 * All functions are safe to call without await — errors are caught internally.
 */

import { useAuthStore } from '@/pages/auth/useAuthStore';
import * as api from '@/services/userDataApi';
import { writeScoped } from '@/storage/scope';

function isLoggedIn(): boolean {
  return !!useAuthStore.getState().user;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface SyncTaskData {
  title: string;
  description?: string | null;
  completed: boolean;
  priority: string;
  dueDate?: string | null;
  taskType?: string;
  dailyTime?: string | null;
}

/** Create a task on the server. Returns the server-assigned id. */
export async function syncCreateTask(
  localId: string,
  data: SyncTaskData,
): Promise<string | null> {
  if (!isLoggedIn()) return null;
  try {
    const serverTask = await api.createTask({
      title: data.title,
      description: data.description ?? null,
      completed: data.completed,
      priority: data.priority,
      dueDate: data.dueDate ?? null,
      taskType: data.taskType ?? 'normal',
      dailyTime: data.dailyTime ?? null,
      clientId: localId,
    });
    return serverTask.id;
  } catch {
    return null;
  }
}

export async function syncUpdateTask(
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!isLoggedIn()) return;
  try {
    await api.updateTask(id, data);
  } catch { /* offline — local data preserved */ }
}

export async function syncDeleteTask(id: string): Promise<void> {
  if (!isLoggedIn()) return;
  try {
    await api.deleteTask(id);
  } catch { /* offline */ }
}

// ---------------------------------------------------------------------------
// Exams
// ---------------------------------------------------------------------------

export async function syncCreateExam(
  localId: string,
  data: { name: string; date: string; color: string },
): Promise<string | null> {
  if (!isLoggedIn()) return null;
  try {
    const serverExam = await api.createExam({ ...data, clientId: localId });
    return serverExam.id;
  } catch {
    return null;
  }
}

export async function syncUpdateExam(
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!isLoggedIn()) return;
  try {
    await api.updateExam(id, data);
  } catch { /* offline */ }
}

export async function syncDeleteExam(id: string): Promise<void> {
  if (!isLoggedIn()) return;
  try {
    await api.deleteExam(id);
  } catch { /* offline */ }
}

// ---------------------------------------------------------------------------
// Flashcards
// ---------------------------------------------------------------------------

export async function syncCreateFlashcard(
  localId: string,
  data: { front: string; back: string; deck: string; type?: string; difficulty?: string },
): Promise<string | null> {
  if (!isLoggedIn()) return null;
  try {
    const serverFC = await api.createFlashcard({
      front: data.front,
      back: data.back,
      deck: data.deck,
      type: data.type ?? 'general',
      difficulty: data.difficulty ?? 'medium',
      clientId: localId,
    });
    return serverFC.id;
  } catch {
    return null;
  }
}

export async function syncUpdateFlashcard(
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!isLoggedIn()) return;
  try {
    await api.updateFlashcard(id, data);
  } catch { /* offline */ }
}

export async function syncDeleteFlashcard(id: string): Promise<void> {
  if (!isLoggedIn()) return;
  try {
    await api.deleteFlashcard(id);
  } catch { /* offline */ }
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function syncCreateNote(
  localId: string,
  data: { title: string; content: string; pinned?: boolean },
): Promise<string | null> {
  if (!isLoggedIn()) return null;
  try {
    const serverNote = await api.createNote({
      title: data.title,
      content: data.content,
      pinned: data.pinned ?? false,
      clientId: localId,
    });
    return serverNote.id;
  } catch {
    return null;
  }
}

export async function syncUpdateNote(
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!isLoggedIn()) return;
  try {
    await api.updateNote(id, data);
  } catch { /* offline */ }
}

export async function syncDeleteNote(id: string): Promise<void> {
  if (!isLoggedIn()) return;
  try {
    await api.deleteNote(id);
  } catch { /* offline */ }
}

// ---------------------------------------------------------------------------
// Pomodoro
// ---------------------------------------------------------------------------

export async function syncPomodoroSession(
  focusedSeconds: number,
): Promise<void> {
  if (!isLoggedIn()) return;
  try {
    await api.recordPomodoroSession(focusedSeconds);
  } catch { /* offline */ }
}

// ---------------------------------------------------------------------------
// Adhkar
// ---------------------------------------------------------------------------

let adhkarTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced adhkar sync — batches rapid increments into a single PUT. */
export function syncAdhkarProgress(
  day: string,
  counts: Record<string, number>,
): void {
  if (!isLoggedIn()) return;
  if (adhkarTimer) clearTimeout(adhkarTimer);
  adhkarTimer = setTimeout(() => {
    api.saveAdhkarProgress(day, counts).catch(() => {});
  }, 800);
}

// ---------------------------------------------------------------------------
// ID replacement + boot-time push-up
// ---------------------------------------------------------------------------

/** Replace a local record's id inside the account-scoped localStorage key. */
function replaceAccountRecordId(
  userId: string,
  scopeKey: string,
  oldId: string,
  newId: string,
): void {
  const key = `morven:acct:${userId}:${scopeKey}`;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch { /* ignore */ }
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    const wrapped = parsed && typeof parsed === 'object' && 'state' in parsed;
    const data = wrapped ? parsed.state : parsed;
    if (!Array.isArray(data)) return;
    const updated = data.map((r: { id: string }) =>
      r.id === oldId ? { ...r, id: newId } : r,
    );
    localStorage.setItem(key, JSON.stringify(wrapped ? { ...parsed, state: updated } : updated));
  } catch { /* ignore malformed data */ }
}

/** Current-account alias for replaceAccountRecordId (used by stores). */
export function replaceRecordId(
  scopeKey: string,
  oldId: string,
  newId: string,
): void {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return;
  replaceAccountRecordId(userId, scopeKey, oldId, newId);
}

/** Current account-scoped local record ids for a logical key. */
function localRecordIds(userId: string, scopeKey: string): Record<string, object> {
  const key = `morven:acct:${userId}:${scopeKey}`;
  const map: Record<string, object> = {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return map;
    const parsed = JSON.parse(raw);
    const data = parsed && typeof parsed === 'object' && 'state' in parsed ? parsed.state : parsed;
    if (!Array.isArray(data)) return map;
    for (const r of data as Array<Record<string, unknown>>) {
      const id = r.id as string;
      if (id) map[id] = r;
    }
  } catch { /* ignore */ }
  return map;
}

/**
 * Boot-time push-up: any local account record the server does not have yet
 * (created offline, or a create-sync that failed transiently) is created with
 * the local id as the idempotent `clientId`; the local id is then replaced by
 * the server id in localStorage. Idempotent — createWithClientId returns the
 * existing row for a repeated (userId, clientId).
 */
export async function pushLocalRecordsUp(): Promise<void> {
  const user = useAuthStore.getState().user;
  if (!user || !isLoggedIn()) return;
  const userId = user.id;

  const taskById = localRecordIds(userId, 'tasks');
  if (Object.keys(taskById).length > 0) {
    const server = await api.fetchTasks().catch(() => null);
    if (server) {
      const have = new Set(server.map((t) => t.id));
      for (const [id, rec] of Object.entries(taskById)) {
        if (have.has(id)) continue;
        const t = rec as TaskShape;
        const serverId = await api
          .createTask({ ...t, clientId: id })
          .then((r) => r.id)
          .catch(() => null);
        if (serverId && serverId !== id) replaceAccountRecordId(userId, 'tasks', id, serverId);
      }
    }
  }

  const examById = localRecordIds(userId, 'exams');
  if (Object.keys(examById).length > 0) {
    const server = await api.fetchExams().catch(() => null);
    if (server) {
      const have = new Set(server.map((e) => e.id));
      for (const [id, rec] of Object.entries(examById)) {
        if (have.has(id)) continue;
        const e = rec as ExamShape;
        const serverId = await api
          .createExam({ ...e, clientId: id })
          .then((r) => r.id)
          .catch(() => null);
        if (serverId && serverId !== id) replaceAccountRecordId(userId, 'exams', id, serverId);
      }
    }
  }

  const fcById = localRecordIds(userId, 'flashcards');
  if (Object.keys(fcById).length > 0) {
    const server = await api.fetchFlashcards().catch(() => null);
    if (server) {
      const have = new Set(server.map((f) => f.id));
      for (const [id, rec] of Object.entries(fcById)) {
        if (have.has(id)) continue;
        const f = rec as FlashcardShape;
        const serverId = await api
          .createFlashcard({
            front: f.front,
            back: f.back,
            deck: f.deck,
            type: f.type ?? 'general',
            difficulty: f.difficulty ?? 'medium',
            clientId: id,
          })
          .then((r) => r.id)
          .catch(() => null);
        if (serverId && serverId !== id) replaceAccountRecordId(userId, 'flashcards', id, serverId);
      }
    }
  }

  const noteById = localRecordIds(userId, 'notes');
  if (Object.keys(noteById).length > 0) {
    const server = await api.fetchNotes().catch(() => null);
    if (server) {
      const have = new Set(server.map((n) => n.id));
      for (const [id, rec] of Object.entries(noteById)) {
        if (have.has(id)) continue;
        const n = rec as NoteShape;
        const serverId = await api
          .createNote({ title: n.title, content: n.content, pinned: n.pinned ?? false, clientId: id })
          .then((r) => r.id)
          .catch(() => null);
        if (serverId && serverId !== id) replaceAccountRecordId(userId, 'notes', id, serverId);
      }
    }
  }
}

interface TaskShape {
  id: string;
  title: string;
  description?: string | null;
  completed: boolean;
  priority: string;
  dueDate?: string | null;
  taskType?: string;
  dailyTime?: string | null;
}
interface ExamShape { id: string; name: string; date: string; color: string }
interface FlashcardShape {
  id: string;
  front: string;
  back: string;
  deck: string;
  type?: string;
  difficulty?: string;
}
interface NoteShape { id: string; title: string; content: string; pinned?: boolean }
