import { Router, Request, Response } from "express";
import {
  createNoteSchema,
  updateNoteSchema,
  listMyNotes,
  createMyNote,
  updateMyNote,
  deleteMyNote,
} from "../services/note.service";
import { UserDataError } from "../services/userDataError";
import { authenticate } from "../middleware/auth";

const router = Router();

function handleUserDataError(err: unknown, res: Response): void {
  if (err instanceof UserDataError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error("Notes error:", err);
  res.status(500).json({ error: "حدث خطأ في الخادم" });
}

// GET /api/notes — list the current user's notes
// Optional ?type=general|medical maps to the two existing local stores.
router.get(
  "/api/notes",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      const rawType =
        typeof req.query.type === "string" ? req.query.type.toLowerCase() : undefined;
      const type = rawType === "general" || rawType === "medical" ? rawType : undefined;
      if (rawType !== undefined && !type) {
        res.status(400).json({ error: "نوع الملاحظة غير صالح" });
        return;
      }
      const notes = await listMyNotes(req.user.sub, type);
      res.json({ notes });
    } catch (err) {
      handleUserDataError(err, res);
    }
  }
);

// POST /api/notes — create a note owned by the current user
router.post(
  "/api/notes",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }

      const parsed = createNoteSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
        return;
      }

      const note = await createMyNote(req.user.sub, parsed.data);
      res.status(201).json({ note });
    } catch (err) {
      handleUserDataError(err, res);
    }
  }
);

// PATCH /api/notes/:id — update one of the current user's notes
router.patch(
  "/api/notes/:id",
  authenticate,
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }

      const parsed = updateNoteSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
        return;
      }
      if (Object.keys(parsed.data).length === 0) {
        res.status(400).json({ error: "لم يتم تقديم أي بيانات للتحديث" });
        return;
      }

      const note = await updateMyNote(req.user.sub, req.params.id, parsed.data);
      res.json({ note });
    } catch (err) {
      handleUserDataError(err, res);
    }
  }
);

// DELETE /api/notes/:id — delete one of the current user's notes
router.delete(
  "/api/notes/:id",
  authenticate,
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      await deleteMyNote(req.user.sub, req.params.id);
      res.json({ message: "تم حذف الملاحظة بنجاح" });
    } catch (err) {
      handleUserDataError(err, res);
    }
  }
);

export default router;