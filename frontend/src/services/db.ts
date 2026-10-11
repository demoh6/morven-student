import { getScopeKind, getScopeUserId } from '@/storage/scope';

const DB_NAME = 'morven-storage';
const DB_VERSION = 6;
const FILE_STORE = 'files';
/** Account-scoped offline read cache (server responses we can serve offline). */
const CACHE_STORE = 'cache';
/** Account-scoped durable queue of mutations awaiting sync to the server. */
const MUTATION_STORE = 'mutations';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(FILE_STORE)) {
          const fileStore = db.createObjectStore(FILE_STORE, { keyPath: 'id' });
          fileStore.createIndex('name', 'name', { unique: false });
          fileStore.createIndex('createdAt', 'createdAt', { unique: false });
          fileStore.createIndex('scope', 'scope', { unique: false });
          fileStore.createIndex('scopeCreatedAt', ['scope', 'createdAt'], {
            unique: false,
          });
        } else {
          // v4 → v5: add scope index to existing store (record-scoped file data).
          const store = request.transaction!.objectStore(FILE_STORE);
          if (!store.indexNames.contains('scope')) {
            store.createIndex('scope', 'scope', { unique: false });
          }
          if (!store.indexNames.contains('scopeCreatedAt')) {
            store.createIndex('scopeCreatedAt', ['scope', 'createdAt'], {
              unique: false,
            });
          }

          // Assign scope='guest' to all records that lack the field (v4 data).
          // Runs on any later upgrade too; the guard makes it a no-op once every
          // record has a scope.
          const cursor = store.openCursor();
          cursor.onsuccess = () => {
            const c = cursor.result;
            if (!c) return;
            const record = c.value as Record<string, unknown>;
            if (record.scope === undefined) {
              record.scope = 'guest';
              c.update(record as unknown as StoredFile);
            }
            c.continue();
          };
        }

        // v5 → v6: account-scoped read cache.
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          const cacheStore = db.createObjectStore(CACHE_STORE, { keyPath: 'id' });
          cacheStore.createIndex('scope', 'scope', { unique: false });
        }

        // v5 → v6: account-scoped durable mutation queue.
        if (!db.objectStoreNames.contains(MUTATION_STORE)) {
          const mutationStore = db.createObjectStore(MUTATION_STORE, {
            keyPath: 'id',
          });
          mutationStore.createIndex('scope', 'scope', { unique: false });
          mutationStore.createIndex('scopeType', ['scope', 'type'], {
            unique: false,
          });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Stored file shape (internal to the persistence layer)
//
// Extends the public PersistentFile shape with persistence metadata that is
// NOT exposed to UI components.
// ---------------------------------------------------------------------------

export interface StoredFile {
  id: string;
  name: string;
  type: string;
  size: number;
  data?: ArrayBuffer;
  createdAt: number;
  toolUsed?: string;
  scope: string;
  /** Server row id (set after metadata upload on migration). */
  serverId?: string;
  /** Metadata-only record (no local bytes) — created when the server has a
   *  file record whose bytes reside on a different device. */
  remoteOnly?: boolean;
}

/**
 * A cached server response, partitioned by account scope so one account's
 * cached data can never be read under another. `id` is `${scope}::${key}`.
 */
export interface CacheRecord {
  id: string;
  scope: string;
  key: string;
  value: unknown;
  updatedAt: number;
  expiresAt: number | null;
}

/**
 * A durable, account-scoped mutation waiting to be replayed to the server.
 * `scope` always takes the form `account:<userId>` — queued work is never
 * replayed under a different account.
 */
export interface MutationRecord {
  id: string;
  scope: string;
  type: string;
  payload: unknown;
  idempotencyKey: string;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
}

export { openDB, FILE_STORE, CACHE_STORE, MUTATION_STORE };
