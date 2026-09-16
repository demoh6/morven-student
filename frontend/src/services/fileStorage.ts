import { v4 as uuid } from 'uuid';
import type { PersistentFile } from '@/types';
import { openDB, FILE_STORE, type StoredFile } from './db';
import { getScopeKind, getScopeUserId } from '@/storage/scope';
import * as api from '@/services/userDataApi';

function currentScope(): string {
  const kind = getScopeKind();
  return kind === 'guest' ? 'guest' : `account:${getScopeUserId()}`;
}

async function getAllFiles(): Promise<StoredFile[]> {
  const db = await openDB();
  const scope = currentScope();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readonly');
    const store = tx.objectStore(FILE_STORE);
    const idx = store.index('scope');
    const request = idx.getAll(IDBKeyRange.only(scope));
    request.onsuccess = () => {
      // Sort newest first (index order is not guaranteed)
      resolve(
        (request.result as StoredFile[]).sort((a, b) => b.createdAt - a.createdAt),
      );
    };
    request.onerror = () => reject(request.error);
  });
}

async function getFile(id: string): Promise<StoredFile | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readonly');
    const store = tx.objectStore(FILE_STORE);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result as StoredFile | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function saveFile(name: string, type: string, data: ArrayBuffer): Promise<PersistentFile> {
  const file: StoredFile = {
    id: uuid(),
    name,
    type,
    size: data.byteLength,
    data,
    createdAt: Date.now(),
    scope: currentScope(),
  };
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readwrite');
    const store = tx.objectStore(FILE_STORE);
    store.put(file);
    tx.oncomplete = () => resolve(file as PersistentFile);
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteFile(id: string): Promise<void> {
  // Best-effort server-side cleanup for account-scoped files so the record
  // does not reappear as a remote-only file on other devices.
  const existing = await getFile(id);
  if (
    existing?.serverId &&
    getScopeKind() === 'account' &&
    getScopeUserId()
  ) {
    api.deleteUserFile(existing.serverId).catch(() => {});
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readwrite');
    const store = tx.objectStore(FILE_STORE);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearAllFiles(): Promise<void> {
  const db = await openDB();
  const scope = currentScope();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readwrite');
    const store = tx.objectStore(FILE_STORE);
    const idx = store.index('scope');
    const request = idx.openCursor(IDBKeyRange.only(scope));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Patch fields on an existing IDB record (e.g. stamp `serverId` after a
 * successful upload, or cache remote bytes after a download). No-op when the
 * record no longer exists.
 */
export async function updateFileRecord(
  id: string,
  patch: Partial<Omit<StoredFile, 'id'>>,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readwrite');
    const store = tx.objectStore(FILE_STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const existing = req.result as StoredFile | undefined;
      if (existing) store.put({ ...existing, ...patch });
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Fetch a remote-only file's bytes from the server and cache them locally so
 * the file opens offline afterwards. Returns the updated record (with `data`).
 */
export async function fetchAndCacheRemoteBytes(file: StoredFile): Promise<StoredFile> {
  if (!file.serverId) return file;
  const bytes = await api.downloadUserFile(file.serverId);
  const updated: StoredFile = { ...file, data: bytes };
  await updateFileRecord(file.id, { data: bytes });
  return updated;
}

/**
 * Re-key all existing guest-scoped IDB files into the given account scope.
 * Returns the files that were moved (bytes preserved, serverId unset).
 * The caller is responsible for uploading metadata and assigning serverId.
 */
export async function rekeyGuestFilesToAccount(accountScope: string): Promise<StoredFile[]> {
  const db = await openDB();
  const guestFiles: StoredFile[] = [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readwrite');
    const store = tx.objectStore(FILE_STORE);
    const idx = store.index('scope');
    const request = idx.openCursor(IDBKeyRange.only('guest'));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(guestFiles);
        return;
      }
      const record = { ...cursor.value, scope: accountScope } as StoredFile;
      guestFiles.push(record);
      cursor.update(record);
      cursor.continue();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export { getAllFiles, getFile, saveFile, deleteFile, clearAllFiles };
