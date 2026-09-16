import { v4 as uuid } from 'uuid';
import type { PersistentFile } from '@/types';
import { openDB, FILE_STORE, type StoredFile } from './db';
import { getScopeKind, getScopeUserId } from '@/storage/scope';
import { syncFileToServer } from '@/services/fileSync';

/**
 * Save a Blob to the persistent file library (IndexedDB).
 * Tools call this alongside their normal download to make the file
 * permanently available in the Dashboard "Saved Files" section.
 *
 * @param blob     The file content as a Blob
 * @param filename The display filename (e.g. "merged-pdfs.pdf")
 * @param toolUsed Which tool created this file (e.g. "pdf-tools")
 * @param mimeType MIME type (e.g. "application/pdf"). Falls back to blob.type.
 */
export async function saveToLibrary(
  blob: Blob,
  filename: string,
  toolUsed: string,
  mimeType?: string,
): Promise<PersistentFile> {
  const arrayBuffer = await blob.arrayBuffer();
  const scope = getScopeKind() === 'guest'
    ? 'guest'
    : `account:${getScopeUserId()}`;
  const file: StoredFile = {
    id: uuid(),
    name: filename,
    type: mimeType || blob.type || 'application/octet-stream',
    size: arrayBuffer.byteLength,
    data: arrayBuffer,
    createdAt: Date.now(),
    toolUsed,
    scope,
  };
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readwrite');
    const store = tx.objectStore(FILE_STORE);
    store.put(file);
    tx.oncomplete = () => {
      // Opportunistic server upload for authenticated users (best-effort:
      // offline saves stay local and are swept up on next login/migration).
      syncFileToServer(file).catch(() => {});
      resolve(file as unknown as PersistentFile);
    };
    tx.onerror = () => reject(tx.error);
  });
}
