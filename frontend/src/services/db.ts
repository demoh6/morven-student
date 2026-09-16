import { getScopeKind, getScopeUserId } from '@/storage/scope';

const DB_NAME = 'morven-storage';
const DB_VERSION = 5;
const FILE_STORE = 'files';

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
          // v4 → v5: add scope index to existing store
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

export { openDB, FILE_STORE };
