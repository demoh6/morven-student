import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from '@/services/fileStorage';
import * as api from '@/services/userDataApi';
import type { StoredFile } from '@/services/db';
import { FILE_STORE } from '@/services/db';
import { setScopeToAccount, setScopeToGuest } from '@/storage/scope';

/* ---------------------------------------------------------------------------
 * Minimal in-memory fake backing the `openDB` mock. fileStorage connects via
 * `db.transaction(FILE_STORE, mode)` → `store.get/put/delete` with
 * request-style handlers (`req.onsuccess`). microtask + timer scheduling keeps
 * the same ordering the real code relies on (get < update < oncomplete).
 * --------------------------------------------------------------------------- */

const store = new Map<string, unknown>();

function fakeRequest(result?: unknown) {
  const req: { result?: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null } = {
    result,
    onsuccess: null,
    onerror: null,
  };
  queueMicrotask(() => req.onsuccess?.());
  return req;
}

function fakeStore() {
  return {
    get: (id: string) => fakeRequest(store.get(id)),
    put: (value: { id: string }) => {
      store.set(value.id, { ...value });
      return fakeRequest();
    },
    delete: (id: string) => {
      store.delete(id);
      return fakeRequest();
    },
  };
}

function makeTx() {
  const tx: { oncomplete: (() => void) | null; onerror: (() => void) | null; objectStore: () => ReturnType<typeof fakeStore> } = {
    oncomplete: null,
    onerror: null,
  } as never;
  tx.objectStore = () => fakeStore();
  queueMicrotask(() => setTimeout(() => tx.oncomplete?.(), 0));
  return tx;
}

vi.mock('@/services/db', () => ({
  openDB: vi.fn(),
  FILE_STORE: 'files',
}));

vi.mock('@/services/userDataApi', () => ({
  downloadUserFile: vi.fn(),
  deleteUserFile: vi.fn(),
}));

import { openDB } from '@/services/db';
const mockOpenDB = vi.mocked(openDB);

function seed(record: StoredFile): void {
  store.set(record.id, { ...record });
}

beforeEach(() => {
  store.clear();
  localStorage.clear();
  setScopeToGuest();
  vi.clearAllMocks();
  mockOpenDB.mockImplementation(async () => ({ transaction: () => makeTx() }) as never);
  vi.mocked(api.deleteUserFile).mockResolvedValue(undefined);
  void FILE_STORE;
});

describe('fileStorage IDB helpers (Phase 3.1)', () => {
  it('updateFileRecord patches fields on an existing record (e.g. stamps serverId)', async () => {
    setScopeToAccount('user-1');
    seed({ id: 'f1', name: 'a.pdf', type: 'application/pdf', size: 3, createdAt: 0, scope: 'account:user-1' });

    await fs.updateFileRecord('f1', { serverId: 'srv-1' });

    const rec = store.get('f1') as StoredFile;
    expect(rec.serverId).toBe('srv-1');
    expect(rec.name).toBe('a.pdf');
  });

  it('updateFileRecord is a safe no-op when the record no longer exists', async () => {
    setScopeToAccount('user-1');
    await expect(fs.updateFileRecord('missing', { serverId: 'srv-1' })).resolves.toBeUndefined();
    expect(store.size).toBe(0);
  });

  it('fetchAndCacheRemoteBytes downloads server bytes and caches them locally', async () => {
    setScopeToAccount('user-1');
    const remoteFile: StoredFile = {
      id: 'f1',
      name: 'a.pdf',
      type: 'application/pdf',
      size: 3,
      createdAt: 0,
      scope: 'account:user-1',
      serverId: 'srv-1',
      remoteOnly: true,
    };
    seed(remoteFile);
    const bytes = new Uint8Array([7, 8, 9]).buffer as ArrayBuffer;
    vi.mocked(api.downloadUserFile).mockResolvedValue(bytes);

    const updated = await fs.fetchAndCacheRemoteBytes(remoteFile);

    expect(api.downloadUserFile).toHaveBeenCalledWith('srv-1');
    expect(updated.data).toBeDefined();
    expect([...new Uint8Array(updated.data!)]).toEqual([7, 8, 9]);
    const cached = store.get('f1') as StoredFile;
    expect([...new Uint8Array(cached.data!)]).toEqual([7, 8, 9]);
  });

  it('fetchAndCacheRemoteBytes no-ops for files without a serverId', async () => {
    setScopeToAccount('user-1');
    const localFile: StoredFile = { id: 'f1', name: 'a.pdf', type: 'application/pdf', size: 3, data: new Uint8Array([1]).buffer as ArrayBuffer, createdAt: 0, scope: 'account:user-1' };
    const updated = await fs.fetchAndCacheRemoteBytes(localFile);
    expect(updated).toBe(localFile);
    expect(api.downloadUserFile).not.toHaveBeenCalled();
  });

  it('deleteFile removes the server record first, then the local bytes', async () => {
    setScopeToAccount('user-1');
    seed({ id: 'f1', name: 'a.pdf', type: 'application/pdf', size: 3, createdAt: 0, scope: 'account:user-1', serverId: 'srv-1' });

    await fs.deleteFile('f1');

    expect(api.deleteUserFile).toHaveBeenCalledWith('srv-1');
    expect(store.has('f1')).toBe(false);
  });

  it('deleteFile never touches the server for guest-scoped files', async () => {
    setScopeToGuest();
    seed({ id: 'f1', name: 'a.pdf', type: 'application/pdf', size: 3, createdAt: 0, scope: 'guest' });

    await fs.deleteFile('f1');

    expect(api.deleteUserFile).not.toHaveBeenCalled();
    expect(store.has('f1')).toBe(false);
  });

  it('deleteFile skips the server call for local files with no serverId', async () => {
    setScopeToAccount('user-1');
    seed({ id: 'f1', name: 'a.pdf', type: 'application/pdf', size: 3, data: new Uint8Array([1]).buffer as ArrayBuffer, createdAt: 0, scope: 'account:user-1' });

    await fs.deleteFile('f1');

    expect(api.deleteUserFile).not.toHaveBeenCalled();
    expect(store.has('f1')).toBe(false);
  });
});