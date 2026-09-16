import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import { z } from "zod";
import prisma from "../lib/prisma";
import { UserDataError } from "./userDataError";
import { createWithClientId } from "./createWithClientId";
import { USER_FILES_DIR } from "../middleware/uploadUserFile";

// ---------------------------------------------------------------------------
// Validation schemas
//
// User files are metadata records PLUS an optional on-disk blob (Phase 3.1).
// The blob is uploaded separately via POST /api/user-files/:id/upload and
// stored under the server-allocated `storageKey` in the non-public
// `uploads/user-files` directory; it is only reachable through the
// authenticated download endpoint. Mirrors the frontend FileItem/PersistentFile
// shape (id, name, type, size, createdAt, toolUsed?).
// ---------------------------------------------------------------------------

export const createUserFileSchema = z.object({
  name: z.string().trim().min(1, "اسم الملف مطلوب").max(255, "اسم الملف طويل جداً"),
  type: z.string().trim().min(1, "نوع الملف مطلوب").max(255, "نوع الملف طويل جداً"),
  size: z.number().int().min(0, "حجم الملف غير صالح").max(10 * 1024 ** 3, "حجم الملف كبير جداً"),
  toolUsed: z.string().trim().max(100, "اسم الأداة طويل جداً").nullable().optional(),
  // Stable client-generated id used for idempotent guest→account migration.
  clientId: z.string().trim().min(1, "معرّف العميل مطلوب").max(64, "معرّف العميل طويل جداً").optional(),
});

export type CreateUserFileInput = z.infer<typeof createUserFileSchema>;

type PrismaUserFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  toolUsed: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Serialise a DB file record into the frontend FileItem shape. */
export function serializeUserFile(file: PrismaUserFile) {
  return {
    id: file.id,
    name: file.name,
    type: file.mimeType,
    size: file.size,
    toolUsed: file.toolUsed ?? undefined,
    createdAt: file.createdAt.getTime(),
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/** List the current user's file records, newest first. */
export async function listMyUserFiles(userId: string) {
  const files = await prisma.userFile.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return files.map(serializeUserFile);
}

/**
 * Create a metadata record for one of the authenticated user's files.
 * The storage key is generated server-side (never client-supplied).
 */
export async function createMyUserFile(
  userId: string,
  input: CreateUserFileInput
) {
  return createWithClientId(
    (clientId) =>
      prisma.userFile
        .findFirst({ where: { userId, clientId } })
        .then((f) => (f ? serializeUserFile(f) : null)),
    async () => {
      const file = await prisma.userFile.create({
        data: {
          userId,
          name: input.name,
          mimeType: input.type,
          size: input.size,
          storageKey: randomUUID(),
          toolUsed: input.toolUsed ?? null,
          clientId: input.clientId ?? null,
        },
      });
      return serializeUserFile(file);
    },
    input.clientId
  );
}

/** Delete one of the current user's file records (ownership-scoped). The
 *  stored blob (if any) is removed from disk as well so no orphaned bytes
 *  linger after the metadata row is gone. */
export async function deleteMyUserFile(userId: string, fileId: string) {
  const file = await prisma.userFile.findFirst({
    where: { id: fileId, userId },
  });
  if (!file) {
    throw new UserDataError("الملف غير موجود", 404);
  }
  const deleted = await prisma.userFile.deleteMany({
    where: { id: fileId, userId },
  });
  if (deleted.count === 0) {
    throw new UserDataError("الملف غير موجود", 404);
  }
  if (file.storageKey) {
    const blobPath = path.join(USER_FILES_DIR, path.basename(file.storageKey));
    try { fs.unlinkSync(blobPath); } catch { /* already gone */ }
  }
}

/** Fetch one of the current user's file records (ownership-scoped). Throws
 *  404 when missing or owned by another user. Returns the raw record so the
 *  caller can resolve the on-disk blob via `storageKey`. */
export async function getMyUserFile(userId: string, fileId: string) {
  const file = await prisma.userFile.findFirst({
    where: { id: fileId, userId },
  });
  if (!file) {
    throw new UserDataError("الملف غير موجود", 404);
  }
  return file;
}

/** Persist the on-disk file name (and the real uploaded byte count) after a
 *  blob upload. Ownership-scoped — a foreign user can never attach bytes to
 *  another user's record. */
export async function setMyUserFileStorage(
  userId: string,
  fileId: string,
  storageKey: string,
  size: number,
) {
  const updated = await prisma.userFile.updateMany({
    where: { id: fileId, userId },
    data: { storageKey, size },
  });
  if (updated.count === 0) {
    throw new UserDataError("الملف غير موجود", 404);
  }
  const file = await prisma.userFile.findUnique({ where: { id: fileId } });
  return serializeUserFile(file!);
}