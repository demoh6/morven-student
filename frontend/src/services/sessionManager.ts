/**
 * Session manager — the single source of truth for scope transitions and
 * server ↔ local data flow. Runs once per SPA session, bootstrapped from
 * App.tsx.
 *
 * Responsibilities
 *   1. Detect auth transitions (login / logout / initialize).
 *   2. On login:  capture guest data → switch scope → migrate guest → server →
 *                  hydrate from server → rehydrate stores.
 *   3. On logout: switch to guest → clear account keys → rehydrate stores.
 *   4. On boot with existing account scope: hydrate from server (handles
 *                  stale localStorage gracefully).
 */

import { useAuthStore } from '@/pages/auth/useAuthStore';
import {
  isGuestScope,
  setScopeToAccount,
  setScopeToGuest,
  getScopeUserId,
  readScoped,
  writeScoped,
} from '@/storage/scope';
import * as api from '@/services/userDataApi';
import { useAppStore } from '@/store/useAppStore';
import { useStatsStore } from '@/store/useStatsStore';
import { useNotesStore } from '@/pages/tools/GeneralTools/Notes/useNotesStore';
import { usePomodoroStore, loadCurrentPomodoroSnapshot, DEFAULT_POMODORO_SETTINGS } from '@/pages/tools/GeneralTools/Pomodoro/usePomodoroStore';
import type { PomodoroSettings, PomodoroTheme, TimerMode } from '@/pages/tools/GeneralTools/Pomodoro/usePomodoroStore';
import { useAdhkarStore } from '@/pages/tools/GeneralTools/Adhkar/useAdhkarStore';
import { rekeyGuestFilesToAccount, getAllFiles } from '@/services/fileStorage';
import { syncFileToServer } from '@/services/fileSync';
import { pushLocalRecordsUp, syncPomodoroSettings } from '@/services/syncService';
import { isPending } from '@/services/pendingCreate';
import { openDB, FILE_STORE } from '@/services/db';
import type { StoredFile } from '@/services/db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LOGICALS = [
  'tasks', 'exams', 'flashcards', 'notes', 'stats',
  'pomodoro', 'adhkar', 'medical-flashcards', 'medical-notes',
] as const;

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function fetchOwnAchievements(): Promise<{
  cardsReviewed: number;
  quizzesCompleted: number;
}> {
  const user = useAuthStore.getState().user;
  if (!user) return { cardsReviewed: 0, quizzesCompleted: 0 };
  const { getPublicAchievements } = await import('@/services/profileApi');
  const { achievements } = await getPublicAchievements(user.username);
  return {
    cardsReviewed: achievements.cardsReviewed,
    quizzesCompleted: achievements.quizzesCompleted,
  };
}

// ---------------------------------------------------------------------------
// Guest snapshot
// ---------------------------------------------------------------------------

function captureGuestSnapshot(): Record<string, string | null> {
  const snap: Record<string, string | null> = {};
  for (const logical of LOGICALS) {
    snap[logical] = localStorage.getItem(`morven:guest:${logical}`);
  }
  return snap;
}

function hasGuestData(snap: Record<string, string | null>): boolean {
  return Object.values(snap).some((v) => v !== null && v !== undefined);
}

/** Zustand `persist` stores write `{state, version}`; hand-rolled stores write
 *  the plain value. Normalize so both shapes read uniformly. */
function unwrapPersist(raw: string | null): unknown {
  if (!raw) return undefined;
  try {
    const val = JSON.parse(raw) as { state?: unknown };
    return val && typeof val === 'object' && 'state' in val ? val.state : val;
  } catch {
    return undefined;
  }
}

function clearGuestScope(): void {
  for (const logical of LOGICALS) {
    localStorage.removeItem(`morven:guest:${logical}`);
  }
  localStorage.removeItem('morven:guest:recentTools');
  localStorage.removeItem('morven:guest:files');
}

// ---------------------------------------------------------------------------
// Persistent migration / retry state
//
// A small localStorage record that remembers what has NOT been migrated yet
// (per-logical guest keys + local file ids) after a partially successful
// guest→account migration. Guest data is never cleared until its upload
// succeeded; this state lets a later login (or the next migration sweep)
// resume exactly where it stopped. Everything is idempotent via clientId, so
// re-running a completed logical is harmless.
// ---------------------------------------------------------------------------

const MIGRATION_STATE_KEY = 'morven:migration';

interface MigrationState {
  userId: string;
  logicalPending: string[];
  filesPending: string[];
  attemptedAt: number;
}

export function readMigrationState(): MigrationState | null {
  try {
    const raw = localStorage.getItem(MIGRATION_STATE_KEY);
    return raw ? (JSON.parse(raw) as MigrationState) : null;
  } catch {
    return null;
  }
}

export function writeMigrationState(state: MigrationState | null): void {
  if (state) {
    try {
      localStorage.setItem(MIGRATION_STATE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable — best-effort */
    }
  } else {
    try {
      localStorage.removeItem(MIGRATION_STATE_KEY);
    } catch {
      /* noop */
    }
  }
}

// ---------------------------------------------------------------------------
// Account scope isolation
// ---------------------------------------------------------------------------

function clearAccountScope(userId: string | null): void {
  if (!userId) return;
  for (const logical of LOGICALS) {
    localStorage.removeItem(`morven:acct:${userId}:${logical}`);
  }
  localStorage.removeItem(`morven:acct:${userId}:recentTools`);
  localStorage.removeItem(`morven:acct:${userId}:files`);
}

// ---------------------------------------------------------------------------
// Server hydration — fetches the current user's data and writes it to the
// current (account) scope in localStorage/IDB. Safe to call on first login
// (server may return empty arrays) and on returning sessions (freshens stale
// localStorage with the latest cross-device state).
// ---------------------------------------------------------------------------

async function hydrateFromServer(): Promise<void> {
  const settled = await Promise.allSettled([
    api.fetchTasks(),
    api.fetchExams(),
    api.fetchFlashcards('general'),
    api.fetchFlashcards('medical'),
    api.fetchNotes('general'),
    api.fetchNotes('medical'),
    api.fetchPomodoroStats(),
    api.fetchAdhkarProgress(todayKey()),
    api.fetchUserFiles(),
    fetchOwnAchievements(),
    api.fetchPreferences(),
  ]);

  const pick = <T>(r: PromiseSettledResult<T>, fallback: T) =>
    r.status === 'fulfilled' ? r.value : fallback;

  // --- Tasks: merge server INTO local (local wins for same-id, server fills gaps) ---
  // A local-only record is kept ONLY when it is a genuinely pending local
  // creation (created here, never acknowledged by the server). A local record
  // that is missing from the server and IS NOT pending was deleted on another
  // device — drop it instead of resurrecting it. When the fetch failed we
  // cannot say anything authoritative, so we keep all local data (offline-safe).
  const tasksFetched = settled[0].status === 'fulfilled';
  const serverTasks = pick(settled[0], [] as api.ServerTask[]).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description || undefined,
    completed: t.completed,
    priority: t.priority.toLowerCase() as 'low' | 'medium' | 'high',
    dueDate: t.dueDate || undefined,
    taskType: t.taskType.toLowerCase() as 'normal' | 'daily',
    dailyTime: t.dailyTime || undefined,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));
  const localTasks = readScoped<Array<{ id: string; updatedAt: number }>>('tasks', []);
  const localTaskMap = new Map(localTasks.map((t) => [t.id, t]));
  const mergedTasks = serverTasks.map((st) => {
    const local = localTaskMap.get(st.id);
    if (local && local.updatedAt >= st.updatedAt) return local;
    return st;
  });
  const serverIds = new Set(serverTasks.map((t) => t.id));
  for (const lt of localTasks) {
    if (serverIds.has(lt.id)) continue;
    if (tasksFetched && !isPending('tasks', lt.id)) continue; // deleted elsewhere
    mergedTasks.push(lt);
  }
  writeScoped('tasks', mergedTasks);

  // --- Exams: server is source of truth; keep ONLY pending local-only exams ---
  const examsFetched = settled[1].status === 'fulfilled';
  const serverExams = pick(settled[1], [] as api.ServerExam[]).map((e) => ({
    id: e.id,
    name: e.name,
    date: e.date,
    color: e.color,
    createdAt: e.createdAt,
  }));
  const localExams = readScoped<Array<{ id: string; name: string; date: string; color: string; createdAt: number }>>('exams', []);
  const serverExamIds = new Set(serverExams.map((e) => e.id));
  const mergedExams = [...serverExams];
  for (const le of localExams) {
    if (serverExamIds.has(le.id)) continue;
    // Drop a local-only exam when the server fetch succeeded and it is NOT a
    // pending local creation — it was deleted on another device.
    if (examsFetched && !isPending('exams', le.id)) continue;
    mergedExams.push(le);
  }
  writeScoped('exams', mergedExams);

  // --- Flashcards (general + medical): merge server INTO local ---
  const flashcardsFetched = settled[2].status === 'fulfilled' && settled[3].status === 'fulfilled';
  const generalFC = pick(settled[2], [] as api.ServerFlashcard[]);
  const medicalFC = pick(settled[3], [] as api.ServerFlashcard[]);
  const serverFlashcards = [...generalFC, ...medicalFC].map((f) => ({
    id: f.id,
    front: f.front,
    back: f.back,
    deck: f.deck,
    type: f.type.toLowerCase() as 'general' | 'medical',
    difficulty: f.difficulty.toLowerCase() as 'easy' | 'medium' | 'hard',
    nextReview: f.nextReview || 0,
    reviewCount: f.reviewCount,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }));
  const localFlashcards = readScoped<Array<{ id: string; updatedAt: number }>>('flashcards', []);
  const localFCMap = new Map(localFlashcards.map((f) => [f.id, f]));
  const mergedFlashcards = serverFlashcards.map((sf) => {
    const local = localFCMap.get(sf.id);
    if (local && local.updatedAt >= sf.updatedAt) return local;
    return sf;
  });
  const serverFCIds = new Set(serverFlashcards.map((f) => f.id));
  for (const lf of localFlashcards) {
    if (serverFCIds.has(lf.id)) continue;
    // Drop a local-only flashcard when fetches succeeded and it is not a
    // pending local creation — it was deleted on another device.
    if (flashcardsFetched && !isPending('flashcards', lf.id)) continue;
    mergedFlashcards.push(lf);
  }
  writeScoped('flashcards', mergedFlashcards);

  // --- Notes: split into general (persisted 'notes' store) and medical (raw
  //  'medical-notes' array). Each merge keeps local-only records ONLY when they
  //  are pending local creations; everything else was deleted on another device.
  const notesFetched = settled[4].status === 'fulfilled';
  const generalN = pick(settled[4], [] as api.ServerNote[]).map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    pinned: n.pinned,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  }));
  const localNotesRaw = readScoped<{ state?: { notes: Array<{ id: string; updatedAt: number }> }; version?: number } | undefined>('notes', undefined);
  const localNotes = localNotesRaw?.state?.notes ?? [];
  const localNotesMap = new Map(localNotes.map((n) => [n.id, n]));
  const mergedNotes = generalN.map((sn) => {
    const local = localNotesMap.get(sn.id);
    if (local && local.updatedAt >= sn.updatedAt) return local;
    return sn;
  });
  const serverNoteIds = new Set(generalN.map((n) => n.id));
  for (const ln of localNotes) {
    if (serverNoteIds.has(ln.id)) continue;
    if (notesFetched && !isPending('notes', ln.id)) continue;
    mergedNotes.push(ln);
  }
  writeScoped('notes', { state: { notes: mergedNotes }, version: 0 });

  const medicalNotesFetched = settled[5].status === 'fulfilled';
  const medicalN = pick(settled[5], [] as api.ServerNote[]).map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    category: n.category ?? 'Other',
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  }));
  const localMedicalNotes = readScoped<Array<{ id: string; updatedAt: number }>>('medical-notes', []);
  const localMedicalNotesMap = new Map(localMedicalNotes.map((n) => [n.id, n]));
  const mergedMedicalNotes = medicalN.map((sn) => {
    const local = localMedicalNotesMap.get(sn.id);
    if (local && local.updatedAt >= sn.updatedAt) return local;
    return sn;
  });
  const serverMedicalNoteIds = new Set(medicalN.map((n) => n.id));
  for (const ln of localMedicalNotes) {
    if (serverMedicalNoteIds.has(ln.id)) continue;
    if (medicalNotesFetched && !isPending('notes', ln.id)) continue;
    mergedMedicalNotes.push(ln);
  }
  writeScoped('medical-notes', mergedMedicalNotes);

  // --- Pomodoro stats + settings: keep local if higher (Math.max), adopt
  //  server settings when they differ from defaults (cross-device preference),
  //  otherwise push THIS device's custom settings up so other devices learn
  //  them on their next login.
  const pomo = pick(settled[6], null as api.ServerPomodoroStats | null);
  const prefs = pick(settled[10], null as api.ServerPreferences | null);
  if (pomo || prefs) {
    const current = usePomodoroStore.getState();
    let settings = current.settings;
    if (prefs) {
      const serverSettings: PomodoroSettings = {
        focusDuration: prefs.pomodoroFocusMinutes,
        breakDuration: prefs.pomodoroBreakMinutes,
        longBreakDuration: prefs.pomodoroLongBreakMinutes,
        sessionsUntilLongBreak: prefs.pomodoroSessionsUntilLongBreak,
        theme: (prefs.pomodoroTheme.toLowerCase() as PomodoroTheme) || 'classic',
        timerMode: (prefs.pomodoroTimerMode.toLowerCase() as TimerMode) || 'countdown',
      };
      const serverIsDefault = JSON.stringify(serverSettings) === JSON.stringify(DEFAULT_POMODORO_SETTINGS);
      const localIsDefault = JSON.stringify(current.settings) === JSON.stringify(DEFAULT_POMODORO_SETTINGS);
      if (!serverIsDefault && JSON.stringify(current.settings) !== JSON.stringify(serverSettings)) {
        // Another device customized the pomodoro → adopt its settings here.
        settings = serverSettings;
      } else if (serverIsDefault && !localIsDefault) {
        // Server still on defaults but THIS device customized → teach it.
        syncPomodoroSettings(current.settings);
      }
    }
    const snapshot = {
      ...current,
      settings,
      completedSessions: pomo ? Math.max(current.completedSessions, pomo.completedSessions) : current.completedSessions,
      totalFocusSeconds: pomo ? Math.max(current.totalFocusSeconds, pomo.totalFocusSeconds) : current.totalFocusSeconds,
      lastFocusSeconds: pomo ? Math.max(current.lastFocusSeconds, pomo.lastFocusSeconds) : current.lastFocusSeconds,
    };
    writeScoped('pomodoro', snapshot);
    usePomodoroStore.setState(snapshot);
  }

  // --- Adhkar progress: merge by maxing counts ---
  const dhikr = pick(settled[7], null as api.ServerAdhkarProgress | null);
  if (dhikr && dhikr.day === todayKey()) {
    const localAdhkar = readScoped<{ state?: { counts?: Record<string, number>; day?: string } } | undefined>('adhkar', undefined);
    const localCounts = localAdhkar?.state?.counts ?? {};
    const mergedCounts: Record<string, number> = {};
    const allKeys = new Set([...Object.keys(dhikr.counts), ...Object.keys(localCounts)]);
    for (const k of allKeys) {
      mergedCounts[k] = Math.max(localCounts[k] ?? 0, dhikr.counts[k] ?? 0);
    }
    writeScoped('adhkar', { state: { counts: mergedCounts, day: dhikr.day }, version: 0 });
  }

  // Files — server metadata for remote-only record creation
  const serverFiles = pick(settled[8], [] as api.ServerUserFile[]);
  await hydrateServerFilesIntoIDB(serverFiles);

  // --- Stats (achievement counters): keep local if higher (Math.max) ---
  const ach = pick(settled[9], { cardsReviewed: 0, quizzesCompleted: 0 });
  const localStats = readScoped<{ state?: { cardsReviewed?: number; quizzesCompleted?: number } } | undefined>('stats', undefined);
  writeScoped('stats', {
    state: {
      cardsReviewed: Math.max(localStats?.state?.cardsReviewed ?? 0, ach.cardsReviewed),
      quizzesCompleted: Math.max(localStats?.state?.quizzesCompleted ?? 0, ach.quizzesCompleted),
    },
    version: 0,
  });
}

/**
 * For each server file that has no matching local IDB record (by record id OR
 * by serverId — a locally migrated file keeps its client-generated id but its
 * serverId equals a server record id), create a metadata-only (remoteOnly)
 * record in the current account scope. Bytes are NOT downloaded — the file
 * exists and is fetched on demand when the user opens/downloads it.
 */
async function hydrateServerFilesIntoIDB(
  serverFiles: api.ServerUserFile[],
): Promise<void> {
  if (serverFiles.length === 0) return;
  const db = await openDB();

  // Collect all local record ids AND serverIds for deduplication.
  const localRecords = await new Promise<StoredFile[]>((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readonly');
    const store = tx.objectStore(FILE_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as StoredFile[]);
    req.onerror = () => reject(req.error);
  });

  const localSet = new Set(localRecords.map((r) => r.id));
  const serverIdSet = new Set(
    localRecords.map((r) => r.serverId).filter((s): s is string => !!s),
  );

  const tx = db.transaction(FILE_STORE, 'readwrite');
  const store = tx.objectStore(FILE_STORE);
  for (const sf of serverFiles) {
    if (localSet.has(sf.id) || serverIdSet.has(sf.id)) continue; // already present
    const record: StoredFile = {
      id: sf.id,
      name: sf.name,
      type: sf.type,
      size: sf.size,
      createdAt: sf.createdAt,
      toolUsed: sf.toolUsed,
      scope: getScopeUserId() ? `account:${getScopeUserId()}` : 'guest',
      serverId: sf.id,
      remoteOnly: true,
    };
    store.put(record);
  }
}

// ---------------------------------------------------------------------------
// Guest → server migration
//
// Uploads every local guest record to the server using the local `id` as a
// `clientId` so retries are idempotent (duplicate creates return the same row).
// Each logical type is tracked independently: only fully-synced logicals have
// their guest key cleared; failures keep the guest data intact and are
// recorded in the persistent migration state for a later retry. Files get
// their actual bytes uploaded AFTER the metadata record exists, so a failed
// upload never loses the local file.
// ---------------------------------------------------------------------------

export type MigrationOutcome = {
  logicalOk: Record<string, boolean>;
  filesPending: string[];
};

/** Run a logical-type upload and record whether it fully completed. */
async function tryLogical(
  outcome: MigrationOutcome,
  key: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
    outcome.logicalOk[key] = true;
  } catch {
    outcome.logicalOk[key] = false;
  }
}

/**
 * Sweep every account-scoped local file that has not been synced yet (no
 * `serverId`) and upload its bytes. Guest files are re-keyed into the account
 * scope first so their bytes survive regardless of server reachability.
 * Returns the local ids that could NOT be synced (their local data is kept
 * untouched for a later retry).
 */
export async function syncAllLocalFiles(accountScope: string): Promise<string[]> {
  await rekeyGuestFilesToAccount(accountScope); // bytes preserved in account scope
  const files = await getAllFiles();            // account-scoped view
  const pending: string[] = [];
  for (const f of files) {
    if (f.serverId) continue; // already on the server
    if (!f.data) continue;    // nothing to upload
    try {
      await syncFileToServer(f);
    } catch {
      pending.push(f.id);
    }
  }
  return pending;
}

/** Remove guest scope keys for logicals that fully synced. Returns the
 *  still-pending logicals (their guest data is never deleted). */
export function pruneMigratedGuestKeys(
  snap: Record<string, string | null>,
  outcome: MigrationOutcome,
): string[] {
  const pending: string[] = [];
  for (const logical of LOGICALS) {
    const raw = snap[logical];
    if (raw === null || raw === undefined) continue;
    if (outcome.logicalOk[logical]) {
      localStorage.removeItem(`morven:guest:${logical}`);
    } else {
      pending.push(logical);
    }
  }
  return pending;
}

export async function migrateGuestToServer(
  snap: Record<string, string | null>,
): Promise<MigrationOutcome> {
  const outcome: MigrationOutcome = { logicalOk: {}, filesPending: [] };

  // Tasks
  if (snap.tasks) {
    await tryLogical(outcome, 'tasks', async () => {
      const tasks: Array<{ id: string; title: string; description?: string; completed: boolean; priority: string; dueDate?: string; taskType?: string; dailyTime?: string; createdAt: number }> = JSON.parse(snap.tasks as string);
      for (const t of tasks) {
        await api.createTask({
          title: t.title,
          description: t.description || null,
          completed: t.completed,
          priority: t.priority,
          dueDate: t.dueDate || null,
          taskType: t.taskType || 'normal',
          dailyTime: t.dailyTime || null,
          clientId: t.id,
        });
      }
    });
  }

  // Exams
  if (snap.exams) {
    await tryLogical(outcome, 'exams', async () => {
      const exams: Array<{ id: string; name: string; date: string; color: string }> = JSON.parse(snap.exams as string);
      for (const e of exams) {
        await api.createExam({
          name: e.name,
          date: e.date,
          color: e.color,
          clientId: e.id,
        });
      }
    });
  }

  // Flashcards
  if (snap.flashcards) {
    await tryLogical(outcome, 'flashcards', async () => {
      const cards: Array<{ id: string; front: string; back: string; deck: string; type?: string; difficulty?: string; nextReview?: number; reviewCount?: number }> = JSON.parse(snap.flashcards as string);
      for (const c of cards) {
        await api.createFlashcard({
          front: c.front,
          back: c.back,
          deck: c.deck,
          type: c.type || 'general',
          difficulty: c.difficulty || 'medium',
          nextReview: c.nextReview ?? 0,
          reviewCount: c.reviewCount ?? 0,
          clientId: c.id,
        });
      }
    });
  }

  // Notes
  if (snap.notes) {
    await tryLogical(outcome, 'notes', async () => {
      const data = unwrapPersist(snap.notes as string) as {
        notes?: Array<{ id: string; title: string; content: string; pinned?: boolean; createdAt: number; updatedAt: number }>;
      };
      for (const n of data.notes ?? []) {
        await api.createNote({
          title: n.title,
          content: n.content,
          pinned: n.pinned ?? false,
          clientId: n.id,
        });
      }
    });
  }

  // Medical notes (raw array under 'medical-notes') — same idempotent pattern
  if (snap['medical-notes']) {
    await tryLogical(outcome, 'medical-notes', async () => {
      const notes: Array<{ id: string; title: string; content: string; category?: string }> = JSON.parse(snap['medical-notes'] as string);
      for (const n of notes) {
        await api.createNote({
          title: n.title,
          content: n.content,
          pinned: false,
          type: 'medical',
          category: n.category ?? 'Other',
          clientId: n.id,
        });
      }
    });
  }

  // Medical flashcards (raw array under 'medical-flashcards')
  if (snap['medical-flashcards']) {
    await tryLogical(outcome, 'medical-flashcards', async () => {
      const cards: Array<{ id: string; front: string; back: string; deck: string; difficulty?: string; nextReview?: number; reviewCount?: number }> = JSON.parse(snap['medical-flashcards'] as string);
      for (const c of cards) {
        await api.createFlashcard({
          front: c.front,
          back: c.back,
          deck: c.deck,
          type: 'medical',
          difficulty: c.difficulty ?? 'medium',
          nextReview: c.nextReview ?? 0,
          reviewCount: c.reviewCount ?? 0,
          clientId: c.id,
        });
      }
    });
  }

  // Pomodoro stats (max-merge guest totals into account)
  if (snap.pomodoro) {
    await tryLogical(outcome, 'pomodoro', async () => {
      const pomo: { completedSessions: number; totalFocusSeconds: number; lastFocusSeconds: number } = JSON.parse(snap.pomodoro as string);
      if (pomo.completedSessions > 0 || pomo.totalFocusSeconds > 0) {
        await api.mergePomodoroStats({
          completedSessions: pomo.completedSessions,
          totalFocusSeconds: pomo.totalFocusSeconds,
          lastFocusSeconds: pomo.lastFocusSeconds,
        });
      }
    });
  }

  // Adhkar (max-merge counts into server for today)
  if (snap.adhkar) {
    await tryLogical(outcome, 'adhkar', async () => {
      const adhkar = unwrapPersist(snap.adhkar as string) as { counts?: Record<string, number>; day?: string };
      const counts = adhkar.counts ?? {};
      if (adhkar.day === todayKey() && Object.keys(counts).length > 0) {
        const serverProgress = await api.fetchAdhkarProgress(adhkar.day).catch(() => null);
        const merged: Record<string, number> = { ...counts };
        if (serverProgress?.counts) {
          for (const [k, v] of Object.entries(serverProgress.counts)) {
            merged[k] = Math.max(merged[k] ?? 0, v);
          }
        }
        await api.saveAdhkarProgress(adhkar.day, merged);
      }
    });
  }

  // Stat counters consumed elsewhere (stats are hydrated from the server sink,
  // not pushed during migration).
  outcome.logicalOk['stats'] = true;

  // Files — re-key guest bytes into the account scope, then upload every local
  // file (metadata + bytes) that lacks a serverId.
  const accountScope = getScopeUserId() ? `account:${getScopeUserId()}` : null;
  if (accountScope) {
    outcome.filesPending = await syncAllLocalFiles(accountScope);
  }
  return outcome;
}

// ---------------------------------------------------------------------------
// Store rehydration — forces every store to re-read from the current scope's
// localStorage/IDB after a scope switch.
// ---------------------------------------------------------------------------

function rehydrateAllStores(): void {
  // zustand persist stores — rehydrate reads the new scope via scopedStorage
  try { useStatsStore.persist.rehydrate(); } catch { /* noop */ }
  try { useNotesStore.persist.rehydrate(); } catch { /* noop */ }
  try { useAdhkarStore.persist.rehydrate(); } catch { /* noop */ }

  // Hand-rolled stores — load from scoped keys
  try {
    useAppStore.setState({
      tasks: readScoped('tasks', []),
      exams: readScoped('exams', []),
      flashcards: readScoped('flashcards', []),
      recentTools: readScoped('recentTools', []),
      recentFiles: readScoped('files', []),
    });
  } catch { /* noop */ }

  try {
    usePomodoroStore.setState(loadCurrentPomodoroSnapshot());
  } catch { /* noop */ }
}

// ---------------------------------------------------------------------------
// Scope transition handlers
// ---------------------------------------------------------------------------

/**
 * Runs (or resumes) the guest→account migration. Converges because every step
 * is idempotent (clientId): re-running a completed logical is a no-op, so a
 * partial migration retried later never duplicates data. Guest data is only
 * cleared after everything it covers has been persisted to the server.
 */
export async function applyMigrationForUser(userId: string): Promise<void> {
  const snap = captureGuestSnapshot();

  if (hasGuestData(snap)) {
    const outcome = await migrateGuestToServer(snap);
    const pending = pruneMigratedGuestKeys(snap, outcome);
    if (pending.length === 0 && outcome.filesPending.length === 0) {
      clearGuestScope();
      writeMigrationState(null);
      return;
    }
    writeMigrationState({
      userId,
      logicalPending: pending,
      filesPending: outcome.filesPending,
      attemptedAt: Date.now(),
    });
    return;
  }

  // No guest logical data left — but a previous partial run may still have
  // un-uploaded local files (or guest keys that reappeared later).
  const prev = readMigrationState();
  if (prev && prev.userId === userId) {
    const filesPending = await syncAllLocalFiles(`account:${userId}`).catch(
      () => prev.filesPending,
    );
    const logicalPending = prev.logicalPending.filter(
      (l) => localStorage.getItem(`morven:guest:${l}`) !== null,
    );
    if (logicalPending.length === 0 && filesPending.length === 0) {
      writeMigrationState(null);
    } else {
      writeMigrationState({ ...prev, logicalPending, filesPending, attemptedAt: Date.now() });
    }
  }
}

async function applyAccount(userId: string): Promise<void> {
  // Capture guest data before switching scope (if currently guest)
  const wasGuest = isGuestScope();
  const guestSnap = wasGuest ? captureGuestSnapshot() : null;

  // Switch scope — all scoped reads now target this account's namespace
  setScopeToAccount(userId);

  try {
    // 1. Migrate guest data → server (idempotent via clientId, data-safe)
    await applyMigrationForUser(userId);

    // 2. Hydrate from server (server is source of truth)
    await hydrateFromServer();

    // 3. Push local-only records up (offline-created, or create-sync that
    //    failed). Idempotent via clientId; replaces local id with server id.
    await pushLocalRecordsUp().catch(() => {});
  } finally {
    // 3. Rehydrate in-memory stores to the new scope — MUST run even if a
    //    server/IDB call threw, so the authenticated scope is always the
    //    mounted one and the user's local account data is never hidden behind
    //    a stale boot hydration.
    rehydrateAllStores();
  }

  // 4. Sync indicator — success only when nothing is still pending; otherwise
  //    inform the user that the remainder will finish automatically on retry.
  const pending = readMigrationState();
  if (
    pending &&
    pending.userId === userId &&
    (pending.logicalPending.length > 0 || pending.filesPending.length > 0)
  ) {
    useAppStore.getState().addNotification(
      'تم نقل معظم بياناتك إلى حسابك. ستُعاد مزامنة الباقي تلقائياً',
      'info',
      5000,
    );
  } else if (guestSnap && hasGuestData(guestSnap)) {
    useAppStore.getState().addNotification('تم مزامنة بياناتك مع حسابك بنجاح', 'success', 4000);
  }
}

function applyGuestScope(prevUserId: string | null, clearAccount = false): void {
  setScopeToGuest();
  // Wiping the account's local keys is ONLY performed on an explicit user
  // logout (logout isolation). When boot finds no session (expired/none) it
  // merely retargets the active scope to guest and LEAVES the account data in
  // place — a transient or unexpected boot-time auth failure must never destroy
  // the user's local account snapshot (the server remains the source of truth,
  // so re-login restores it; offline it must survive).
  if (prevUserId && clearAccount) clearAccountScope(prevUserId);
  rehydrateAllStores();
}

// ---------------------------------------------------------------------------
// Refocus refresh
//
// Hydration normally runs once per boot. An ALREADY-OPEN device therefore only
// sees cross-device changes after a reload. To keep a second device convergent
// in practice, re-run the (read-only, idempotent) hydration whenever the tab is
// brought back into focus. Guarded: throttled to once per minute and never
// concurrent with an in-flight refresh.
// ---------------------------------------------------------------------------

let refreshInFlight = false;
let lastRefreshAt = 0;
export const REFRESH_MIN_INTERVAL_MS = 60_000;

export async function refreshAccountData(): Promise<void> {
  const user = useAuthStore.getState().user;
  if (!user || user.id !== getScopeUserId()) return;
  const now = Date.now();
  if (refreshInFlight || now - lastRefreshAt < REFRESH_MIN_INTERVAL_MS) return;
  refreshInFlight = true;
  lastRefreshAt = now;
  try {
    await hydrateFromServer();
    await pushLocalRecordsUp().catch(() => {});
  } finally {
    rehydrateAllStores();
    refreshInFlight = false;
  }
}

function installRefocusListener(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const refreshIfVisible = () => {
    if (document.visibilityState === 'visible') void refreshAccountData();
  };
  window.addEventListener('focus', refreshIfVisible);
  document.addEventListener('visibilitychange', refreshIfVisible);
}

// ---------------------------------------------------------------------------
// Bootstrap — call once from App.tsx.
// ---------------------------------------------------------------------------

let bootstrapped = false;

export function bootstrapSession(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  installRefocusListener();

  // Handle the state AFTER initialize() resolves.
  useAuthStore.subscribe((state, prev) => {
    if (!prev.initialized && state.initialized) {
      // First initialize() resolution
      if (state.user) {
        void applyAccount(state.user.id);
      } else if (!isGuestScope()) {
        // Session expired or never logged in but scope was stale
        applyGuestScope(getScopeUserId());
      }
      return;
    }

    // Subsequent login (user becomes non-null)
    if (state.user && !prev.user) {
      void applyAccount(state.user.id);
      return;
    }

    // Logout (user becomes null)
    if (!state.user && prev.user) {
      applyGuestScope(prev.user.id, true);
    }
  });
}
