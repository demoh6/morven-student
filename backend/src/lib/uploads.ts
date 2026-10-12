import path from "path";
import fs from "fs";

// Single source of truth for the public uploads directory. Files here are
// served at "/uploads/<filename>" (see app.ts). The directory itself is
// ephemeral on the production container, so avatar/group image bytes are also
// mirrored durably in PostgreSQL (StoredImage) and served back on disk misses.
export const UPLOADS_DIR = path.resolve(__dirname, "..", "..", "uploads");

export const UPLOADS_PUBLIC = "/uploads";

export function ensureUploadsDir(): void {
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

/** Resolve the on-disk path for a public "/uploads/<filename>" URL (or null). */
export function diskPathFromPublicUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl || !imageUrl.startsWith(UPLOADS_PUBLIC + "/")) return null;
  return path.join(UPLOADS_DIR, path.basename(imageUrl));
}