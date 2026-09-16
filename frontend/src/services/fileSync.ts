import type { StoredFile } from '@/services/db';
import { getScopeKind, getScopeUserId } from '@/storage/scope';
import * as api from '@/services/userDataApi';
import { updateFileRecord } from '@/services/fileStorage';

/**
 * Upload a local file's bytes to the current account so it can be downloaded
 * from another device (cross-device). Idempotent by design:
 *   - the local file id is used as the server `clientId`, so retries return
 *     the same UserFile record instead of duplicating it;
 *   - the blob is stored on the server under that record's deterministic
 *     storageKey path, so a re-upload overwrites the same blob.
 *
 * Only the record's `serverId` is mutated locally (written AFTER both the
 * metadata create and the byte upload succeed). If the upload fails
 * (offline / size limit / auth), the local file is left untouched and can be
 * retried on the next login / migration sweep.
 *
 * Guest scope (no account) is a no-op: guest files stay purely local.
 */
export async function syncFileToServer(file: StoredFile): Promise<StoredFile> {
  if (getScopeKind() !== 'account' || !getScopeUserId()) return file;
  if (file.serverId) return file; // already on the server
  if (!file.data) return file;    // nothing to upload

  const record = await api.createUserFile({
    name: file.name,
    type: file.type,
    size: file.size,
    toolUsed: file.toolUsed || null,
    clientId: file.id,
  });

  const blob = new Blob([file.data], { type: file.type });
  await api.uploadUserFile(record.id, blob, file.name);

  const updated: StoredFile = { ...file, serverId: record.id };
  await updateFileRecord(file.id, { serverId: record.id });
  return updated;
}