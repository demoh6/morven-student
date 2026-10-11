/**
 * Durable, account-scoped offline mutation queue.
 *
 * Mutations that are safe to replay (idempotent server operations) are
 * persisted in IndexedDB while the device is offline or the server is
 * unreachable, then flushed when connectivity returns. Guarantees:
 *
 *  - Partitioned by scope: every record carries `scope = account:<userId>`,
 *    and a flush only ever runs while the active storage scope AND the
 *    authenticated user id still match that account. One account's queued work
 *    can never be replayed under another account.
 *  - Idempotent: records are deduplicated by (scope, type, idempotencyKey) so
 *    a repeated enqueue does not create duplicate work.
 *  - Bounded backoff: transient failures reschedule with exponential backoff up
 *    to a ceiling instead of tight-looping.
 *  - Confirmed rejections (4xx) are dropped, never retried. Auth failures (401)
 *    pause the flush and leave the queue intact for after re-authentication.
 *  - Entries are removed only after the server confirms success.
 *
 * No tokens, passwords, or secrets are ever persisted here — only the minimal
 * payload needed to replay the operation.
 */

import { v4 as uuid } from 'uuid';
import { openDB, MUTATION_STORE } from '@/services/db';
import type { MutationRecord } from '@/services/db';
import { currentScopeString, scopeStringForUser } from '@/storage/scope';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import { markAsRead, markAllAsRead, unmarkAsRead } from '@/components/Layout/Header/Notification/notificationApi';
import { updateOwnProfile } from '@/services/profileApi';

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

interface MaybeStatusError {
  status?: unknown;
}

/**
 * True when a failure is worth retrying later: connectivity/timeout failures
 * (no HTTP status) and transient server errors (5xx). Confirmed rejections
 * (4xx) are NOT retryable.
 */
export function isRetryableError(err: unknown): boolean {
  const status = (err as MaybeStatusError | null)?.status;
  if (typeof status === 'number') return status >= 500;
  return true;
}

/** True when the server authoritatively rejected the operation (4xx). */
export function isConfirmedRejection(err: unknown): boolean {
  const status = (err as MaybeStatusError | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

/** True when the failure indicates the session is no longer valid (401). */
export function isAuthFailure(err: unknown): boolean {
  return (err as MaybeStatusError | null)?.status === 401;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'تعذر مزامنة التغيير';
}

// ---------------------------------------------------------------------------
// Queue-change notifications (for pending-count UI)
// ---------------------------------------------------------------------------

type QueueListener = () => void;
const queueListeners = new Set<QueueListener>();

export function subscribeQueue(listener: QueueListener): () => void {
  queueListeners.add(listener);
  return () => queueListeners.delete(listener);
}

function emitQueueChange(): void {
  for (const listener of queueListeners) listener();
}

// ---------------------------------------------------------------------------
// Backoff
// ---------------------------------------------------------------------------

export const BASE_BACKOFF_MS = 2_000;
export const MAX_BACKOFF_MS = 5 * 60_000;

/** Exponential backoff, capped. `attempts` is the number of failures so far. */
export function backoffDelay(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** exponent);
}

// ---------------------------------------------------------------------------
// IDB helpers
// ---------------------------------------------------------------------------

function runRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function writeTx<T>(
  db: IDBDatabase,
  fn: (store: IDBObjectStore) => IDBRequest | void,
): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(MUTATION_STORE, 'readwrite');
    let result: T | undefined;
    const maybeReq = fn(tx.objectStore(MUTATION_STORE));
    if (maybeReq) {
      maybeReq.onsuccess = () => {
        result = maybeReq.result as T;
      };
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** The active account scope, or null when the current scope is guest. */
function accountScope(): string | null {
  const scope = currentScopeString();
  return scope === 'guest' ? null : scope;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface EnqueueInput {
  type: string;
  payload: unknown;
  /** Stable per logical operation so repeats dedupe (e.g. `read:<id>`). */
  idempotencyKey: string;
  /**
   * Replace the payload of an already-pending record instead of returning it.
   * Used for last-write-wins operations (e.g. profile edits) where only the
   * newest value should ever reach the server.
   */
  replace?: boolean;
}

/**
 * Enqueue a mutation for the current account. Returns the persisted record, or
 * null when there is no account scope (guest work is never queued). A record
 * with the same (scope, type, idempotencyKey) already pending is returned as-is
 * so a repeated call never duplicates work.
 */
export async function enqueueMutation(
  input: EnqueueInput,
): Promise<MutationRecord | null> {
  const scope = accountScope();
  if (!scope) return null;
  const db = await openDB();

  const existing = (await listMutations(scope)).find(
    (m) => m.type === input.type && m.idempotencyKey === input.idempotencyKey,
  );
  if (existing) {
    if (!input.replace) return existing;
    const updated: MutationRecord = {
      ...existing,
      payload: input.payload,
      nextAttemptAt: 0,
      lastError: null,
    };
    await writeTx(db, (store) => store.put(updated));
    emitQueueChange();
    return updated;
  }

  const record: MutationRecord = {
    id: uuid(),
    scope,
    type: input.type,
    payload: input.payload,
    idempotencyKey: input.idempotencyKey,
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: 0,
    lastError: null,
  };
  await writeTx(db, (store) => store.put(record));
  emitQueueChange();
  return record;
}

/** All queued mutations for a scope (optionally a specific account scope). */
export async function listMutations(
  scope: string = accountScope() ?? 'guest',
): Promise<MutationRecord[]> {
  if (scope === 'guest') return [];
  try {
    const db = await openDB();
    const tx = db.transaction(MUTATION_STORE, 'readonly');
    const index = tx.objectStore(MUTATION_STORE).index('scope');
    const rows = await runRequest<MutationRecord[]>(
      index.getAll(IDBKeyRange.only(scope)),
    );
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

/** Number of mutations still awaiting sync for the current account. */
export async function pendingMutationCount(): Promise<number> {
  const user = useAuthStore.getState().user;
  if (!user) return 0;
  return (await listMutations(scopeStringForUser(user.id))).length;
}

export async function removeMutation(id: string): Promise<void> {
  try {
    const db = await openDB();
    await writeTx(db, (store) => store.delete(id));
    emitQueueChange();
  } catch {
    /* ignore */
  }
}

/** Record a failed attempt and schedule the next retry with bounded backoff. */
export async function markMutationAttempt(
  id: string,
  err: unknown,
): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MUTATION_STORE, 'readwrite');
      const store = tx.objectStore(MUTATION_STORE);
      const get = store.get(id);
      get.onsuccess = () => {
        const record = get.result as MutationRecord | undefined;
        if (!record) return;
        const attempts = record.attempts + 1;
        const updated: MutationRecord = {
          ...record,
          attempts,
          nextAttemptAt: Date.now() + backoffDelay(attempts),
          lastError: errorMessage(err),
        };
        store.put(updated);
      };
      get.onerror = () => reject(get.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    emitQueueChange();
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Handler registry + built-in replay handlers
// ---------------------------------------------------------------------------

type MutationHandler = (payload: unknown) => Promise<unknown>;

const handlers = new Map<string, MutationHandler>([
  ['notification.read', (p) => markAsRead((p as { id: string }).id)],
  ['notification.read-all', () => markAllAsRead()],
  ['notification.unread', (p) => unmarkAsRead((p as { id: string }).id)],
  [
    'profile.update',
    (p) => updateOwnProfile(p as Parameters<typeof updateOwnProfile>[0]),
  ],
]);

/** Register (or replace) a replay handler for a mutation type. */
export function registerMutationHandler(
  type: string,
  handler: MutationHandler,
): void {
  handlers.set(type, handler);
}

/** Test helper: restore the built-in handler set. */
export function resetMutationHandlers(): void {
  handlers.clear();
  handlers.set('notification.read', (p) =>
    markAsRead((p as { id: string }).id),
  );
  handlers.set('notification.read-all', () => markAllAsRead());
  handlers.set('notification.unread', (p) =>
    unmarkAsRead((p as { id: string }).id),
  );
  handlers.set('profile.update', (p) =>
    updateOwnProfile(p as Parameters<typeof updateOwnProfile>[0]),
  );
}

export interface FlushResult {
  processed: number;
  failed: number;
  /** True when the flush stopped because the session is no longer valid. */
  halted: boolean;
}

/**
 * Replay queued mutations for the CURRENT authenticated account.
 *
 * Safety gate: the storage scope and the authenticated user id must both equal
 * the account that owns the queue. If either differs (e.g. after a logout or a
 * different user logging in), the flush is a no-op so no cross-account replay
 * can ever occur.
 */
export async function flushMutations(): Promise<FlushResult> {
  const result: FlushResult = { processed: 0, failed: 0, halted: false };
  const user = useAuthStore.getState().user;
  const scope = accountScope();
  if (!user || !scope || scope !== scopeStringForUser(user.id)) return result;

  const pending = await listMutations(scope);
  const now = Date.now();

  for (const record of pending) {
    if (record.nextAttemptAt > now) continue;
    const handler = handlers.get(record.type);
    if (!handler) continue; // unknown type — leave it for a future version

    try {
      await handler(record.payload);
      await removeMutation(record.id);
      result.processed += 1;
    } catch (err) {
      if (isAuthFailure(err)) {
        // Session no longer valid — stop and keep the queue for after re-auth.
        result.halted = true;
        break;
      }
      if (isConfirmedRejection(err)) {
        // Authoritatively rejected (403/404/422): never retry.
        await removeMutation(record.id);
        result.failed += 1;
      } else {
        await markMutationAttempt(record.id, err);
        result.failed += 1;
      }
    }
  }
  return result;
}

/** Test helper: wipe every queued mutation across all scopes. */
export async function clearAllMutations(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MUTATION_STORE, 'readwrite');
      tx.objectStore(MUTATION_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    emitQueueChange();
  } catch {
    /* ignore */
  }
}
