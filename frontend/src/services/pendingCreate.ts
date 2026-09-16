/**
 * Pending-creation tracker. Records created locally that have NOT yet been
 * acknowledged by the server (create-sync still in flight, failed, or the user
 * is offline). Hydration uses this to distinguish:
 *   - a freshly created local record that simply hasn't reached the server yet
 *     (keep it, and push it up again later), from
 *   - a record that exists locally but is missing from the server because it
 *     was DELETED on another device (drop it — do NOT recreate the record).
 *
 * Storage is per account: morven:acct:<userId>:pendingCreated
 */

import { useAuthStore } from '@/pages/auth/useAuthStore';

interface PendingState {
  tasks: string[];
  exams: string[];
  flashcards: string[];
  notes: string[];
}

const EMPTY: PendingState = { tasks: [], exams: [], flashcards: [], notes: [] };

function pendingKey(): string | null {
  const userId = useAuthStore.getState().user?.id;
  return userId ? `morven:acct:${userId}:pendingCreated` : null;
}

function read(): PendingState {
  const key = pendingKey();
  if (!key) return EMPTY;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<PendingState>;
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      exams: Array.isArray(parsed.exams) ? parsed.exams : [],
      flashcards: Array.isArray(parsed.flashcards) ? parsed.flashcards : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    };
  } catch {
    return EMPTY;
  }
}

function write(state: PendingState): void {
  const key = pendingKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch { /* ignore */ }
}

export function addPendingId(scopeKey: 'tasks' | 'exams' | 'flashcards' | 'notes', id: string): void {
  const state = read();
  if (!state[scopeKey].includes(id)) {
    state[scopeKey] = [...state[scopeKey], id];
    write(state);
  }
}

export function removePendingId(scopeKey: 'tasks' | 'exams' | 'flashcards' | 'notes', id: string): void {
  const state = read();
  if (state[scopeKey].includes(id)) {
    state[scopeKey] = state[scopeKey].filter((x) => x !== id);
    write(state);
  }
}

export function pendingIds(scopeKey: 'tasks' | 'exams' | 'flashcards' | 'notes'): string[] {
  return read()[scopeKey];
}

export function isPending(scopeKey: 'tasks' | 'exams' | 'flashcards' | 'notes', id: string): boolean {
  return read()[scopeKey].includes(id);
}