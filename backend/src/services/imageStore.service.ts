import fs from "fs";
import path from "path";
import mime from "mime-types";
import prisma from "../lib/prisma";
import { UPLOADS_DIR } from "../lib/uploads";

// Durable storage of public avatar/group images. The production deployment has
// an ephemeral container filesystem, so the bytes of every public upload are
// mirrored into PostgreSQL (see StoredImage). This keeps the "/uploads/<file>"
// URL contract while guaranteeing the image survives restarts & redeploys.
// The plain-text disk copy remains only a fast path; app.ts falls back to the
// database row whenever the file is missing from disk.

/** Extract the stored filename from a public "/uploads/<file>" URL, else null. */
function basenameFromPublicUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl || !imageUrl.startsWith("/uploads/")) return null;
  const filename = path.basename(imageUrl);
  return filename || null;
}

/**
 * Persist the bytes of a freshly-written upload file into the durable store.
 * Safe to call for any public upload (group images & avatars). Throws if the
 * file is not present on disk so callers never reference a bytes-less row.
 */
export async function persistStoredImage(
  filename: string,
  mimeType: string
): Promise<void> {
  const fullPath = path.join(UPLOADS_DIR, path.basename(filename));
  const bytes = fs.readFileSync(fullPath);
  await prisma.storedImage.upsert({
    where: { filename },
    update: { mimeType, bytes, size: bytes.byteLength },
    create: { filename, mimeType, bytes, size: bytes.byteLength },
  });
}

/** Delete the durable row referenced by a public imageUrl (no-op when absent). */
export async function deleteStoredImageByUrl(
  imageUrl: string | null | undefined
): Promise<void> {
  const filename = basenameFromPublicUrl(imageUrl);
  if (!filename) return;
  try {
    await prisma.storedImage.delete({ where: { filename } });
  } catch {
    /* row may not exist yet; ignore */
  }
}

/** Fetch durable bytes for a stored filename, or null when no row exists. */
export async function getStoredImage(
  filename: string
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  if (!filename) return null;
  const rec = await prisma.storedImage.findUnique({
    where: { filename },
    select: { bytes: true, mimeType: true },
  });
  if (!rec) return null;
  return { bytes: Buffer.from(rec.bytes), mimeType: rec.mimeType };
}

/**
 * Best-effort boot backfill: persist every public top-level upload already on
 * disk so historical avatars survive a container wipe. Non-destructive —
 * never moves, deletes or rewrites files; skips ones already stored.
 */
export async function backfillStoredImages(): Promise<void> {
  let files: string[] = [];
  try {
    files = fs.readdirSync(UPLOADS_DIR);
  } catch {
    return;
  }

  for (const filename of files) {
    if (filename.includes("/") || filename.includes("\\")) continue;
    const fullPath = path.join(UPLOADS_DIR, filename);
    let isFile = false;
    try {
      isFile = fs.statSync(fullPath).isFile();
    } catch {
      continue;
    }
    if (!isFile) continue;

    try {
      const existing = await prisma.storedImage.findUnique({
        where: { filename },
        select: { id: true },
      });
      if (existing) continue;
      const bytes = fs.readFileSync(fullPath);
      const mimeType = mime.lookup(filename) || "application/octet-stream";
      await prisma.storedImage.upsert({
        where: { filename },
        update: { mimeType, bytes, size: bytes.byteLength },
        create: { filename, mimeType, bytes, size: bytes.byteLength },
      });
    } catch {
      /* best-effort: keep going for the remaining files */
    }
  }
}