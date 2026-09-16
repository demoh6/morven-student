import { useState, useEffect, useCallback } from 'react';
import type { PersistentFile } from '@/types';
import * as fileStorage from '@/services/fileStorage';
import { syncFileToServer } from '@/services/fileSync';
import type { StoredFile } from '@/services/db';

export function useFileStorage() {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const all = await fileStorage.getAllFiles();
      setFiles(all.sort((a, b) => b.createdAt - a.createdAt));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load files');
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const upload = useCallback(
    async (name: string, type: string, data: ArrayBuffer) => {
      const saved = await fileStorage.saveFile(name, type, data);
      // Opportunistic server upload for authenticated users (best-effort:
      // offline/guest saves stay local and are swept up on next login).
      syncFileToServer(saved as StoredFile).catch(() => {});
      await refresh();
      return saved;
    },
    [refresh],
  );

  const remove = useCallback(async (id: string) => {
    await fileStorage.deleteFile(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clear = useCallback(async () => {
    await fileStorage.clearAllFiles();
    setFiles([]);
  }, []);

  const getFileData = useCallback(async (id: string) => {
    return fileStorage.getFile(id);
  }, []);

  /**
   * Return the file bytes, fetching + caching them from the server when the
   * record is remote-only (bytes live on another device). Resolves to
   * undefined when the bytes are unreachable anywhere.
   */
  const downloadFileData = useCallback(async (id: string) => {
    const stored = await fileStorage.getFile(id);
    if (!stored) return undefined;
    if (stored.data) return stored.data;
    if (!stored.serverId) return undefined;
    try {
      const updated = await fileStorage.fetchAndCacheRemoteBytes(stored);
      return updated.data;
    } catch {
      return undefined;
    }
  }, []);

  return { files, loading, error, upload, remove, clear, refresh, getFileData, downloadFileData };
}
