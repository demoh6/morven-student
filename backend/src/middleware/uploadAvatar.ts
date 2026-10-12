import multer from "multer";
import path from "path";
import { UPLOADS_DIR, ensureUploadsDir } from "../lib/uploads";

ensureUploadsDir();

const ALLOWED_MIMES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
]);

const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => { cb(null, UPLOADS_DIR); },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 8);
    cb(null, `${unique}${ext}`);
  },
});

function avatarFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback): void {
  if (ALLOWED_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("نوع الملف غير مدعوم. يرجى استخدام JPG أو PNG أو WebP"));
  }
}

export const uploadAvatar = multer({
  storage,
  limits: { fileSize: MAX_AVATAR_SIZE, files: 1 },
  fileFilter: avatarFilter,
});

export { UPLOADS_PUBLIC } from "../lib/uploads";
