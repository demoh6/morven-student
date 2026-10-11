/**
 * Account-scoped offline read cache.
 *
 * Stores server responses in the shared `morven-storage` IndexedDB so that
 * previously-viewed data (notifications, profile, groups, resources, admin
 * lists, ...) remains available when the device is offline or the server is
 * unreachable. Every entry is partitioned by the active scope
 * (`guest` | `account:<userId>`) — a cached response written under one account
 * can NEVER be read under another, and guest data is kept separate from every
 * account.
 *
 * All operations are best-effort: a missing/again unavailable IndexedDB never
 * throws to callers, it degrades to "no cached value".
 */

import { openDB, CACHE_STORE } from '@/services/db';
import type { CacheRecord } from '@/services/db';
import { currentScopeString } from '@/storage/scope';

export interface CacheEntry<T> {
  value: T;
  /** Epoch ms when the value was written. */
  updatedAt: number;
  /** Epoch ms when the value expires, or null when it never expires. */
  expiresAt: number | null;
}

function recordId(scope: string, key: string): string {
  return `${scope}::${key}`;
}

function runRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Write a value to the cache under the current account scope. Best-effort. */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlMs?: number,
): Promise<void> {
  try {
    const db = await openDB();
    const scope = currentScopeString();
    const now = Date.now();
    const record: CacheRecord = {
      id: recordId(scope, key),
      scope,
      key,
      value,
      updatedAt: now,
      expiresAt: ttlMs && ttlMs > 0 ? now + ttlMs : null,
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      tx.objectStore(CACHE_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    /* IndexedDB unavailable — nothing to cache */
  }
}

/**
 * Read a cached value for the current account scope. Returns null when there
 * is no entry, or when the entry has expired (unless `allowStale` is set, which
 * is used to keep serving slightly-stale data while offline).
 */
export async function cacheGet<T>(
  key: string,
  options: { allowStale?: boolean } = {},
): Promise<CacheEntry<T> | null> {
  try {
    const db = await openDB();
    const scope = currentScopeString();
    const tx = db.transaction(CACHE_STORE, 'readonly');
    const record = await runRequest<CacheRecord | undefined>(
      tx.objectStore(CACHE_STORE).get(recordId(scope, key)),
    );
    if (!record) return null;
    const expired =
      record.expiresAt !== null && record.expiresAt <= Date.now();
    if (expired && !options.allowStale) return null;
    return {
      value: record.value as T,
      updatedAt: record.updatedAt,
      expiresAt: record.expiresAt,
    };
  } catch {
    return null;
  }
}

/** Delete a single cached key under the current account scope. Best-effort. */
export async function cacheDelete(key: string): Promise<void> {
  try {
    const db = await openDB();
    const scope = currentScopeString();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      tx.objectStore(CACHE_STORE).delete(recordId(scope, key));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

/**
 * Remove every cached entry belonging to a scope. Used to guarantee that an
 * account's cached data is never left behind after the account's local state is
 * cleared (privacy / logout isolation).
 */
export async function cacheClearScope(scope?: string): Promise<void> {
  try {
    const db = await openDB();
    const target = scope ?? currentScopeString();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      const store = tx.objectStore(CACHE_STORE);
      const index = store.index('scope');
      const cursor = index.openCursor(IDBKeyRange.only(target));
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return;
        store.delete(c.primaryKey);
        c.continue();
      };
      cursor.onerror = () => reject(cursor.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}
