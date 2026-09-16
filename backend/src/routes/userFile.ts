import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import {
  createUserFileSchema,
  listMyUserFiles,
  createMyUserFile,
  deleteMyUserFile,
  getMyUserFile,
  setMyUserFileStorage,
} from "../services/userFile.service";
import { UserDataError } from "../services/userDataError";
import { authenticate } from "../middleware/auth";
import { uploadUserFile, USER_FILES_DIR } from "../middleware/uploadUserFile";

const router = Router();

function handleUserDataError(err: unknown, res: Response): void {
  if (err instanceof UserDataError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error("User files error:", err);
  res.status(500).json({ error: "حدث خطأ في الخادم" });
}

// GET /api/user-files — list the current user's file records (metadata only)
router.get(
  "/api/user-files",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      const files = await listMyUserFiles(req.user.sub);
      res.json({ files });
    } catch (err) {
      handleUserDataError(err, res);
    }
  }
);

// POST /api/user-files — create a metadata record for one of the user's files.
// The storage key is allocated server-side; the blob is attached separately via
// POST /api/user-files/:id/upload.
router.post(
  "/api/user-files",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }

      const parsed = createUserFileSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
        return;
      }

      const file = await createMyUserFile(req.user.sub, parsed.data);
      res.status(201).json({ file });
    } catch (err) {
      handleUserDataError(err, res);
    }
  }
);

// POST /api/user-files/:id/upload — attach the actual file bytes to an existing
// metadata record (multipart field "file"). Ownership-scoped: the record must
// belong to the authenticated user. The blob is written under `<storageKey>`
// (a server-generated UUID) inside `uploads/user-files`, so re-uploading after
// a retry overwrites the exact same path — no duplicate blobs.
router.post(
  "/api/user-files/:id/upload",
  authenticate,
  uploadUserFile.single("file"),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "الملف مطلوب" });
        return;
      }

      const file = await getMyUserFile(req.user.sub, req.params.id);
      const ext = path.extname(req.file.originalname).toLowerCase().slice(0, 12);
      const finalName = `${file.storageKey}${ext}`;
      const finalPath = path.join(USER_FILES_DIR, finalName);

      try {
        fs.copyFileSync(req.file.path, finalPath);
      } finally {
        try { fs.unlinkSync(req.file.path); } catch { /* best-effort cleanup */ }
      }

      const updated = await setMyUserFileStorage(
        req.user.sub,
        req.params.id,
        finalName,
        req.file.size
      );
      res.json({ file: updated });
    } catch (err) {
      handleUserDataError(err, res);
    }
  }
);

// GET /api/user-files/:id/download — stream the current user's file blob as a
// forced download. Ownership-scoped; missing bytes (metadata-only records) are
// indistinguishable from missing files (404).
router.get(
  "/api/user-files/:id/download",
  authenticate,
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      const file = await getMyUserFile(req.user.sub, req.params.id);
      if (!file.storageKey) {
        res.status(404).json({ error: "الملف غير موجود" });
        return;
      }
      const filePath = path.join(USER_FILES_DIR, path.basename(file.storageKey));
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: "الملف غير موجود" });
        return;
      }
      res.setHeader("Content-Type", file.mimeType);
      res.download(filePath, file.name);
    } catch (err) {
      handleUserDataError(err, res);
    }
  }
);

// DELETE /api/user-files/:id — delete one of the current user's file records
router.delete(
  "/api/user-files/:id",
  authenticate,
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      await deleteMyUserFile(req.user.sub, req.params.id);
      res.json({ message: "تم حذف الملف بنجاح" });
    } catch (err) {
      handleUserDataError(err, res);
    }
  }
);

export default router;