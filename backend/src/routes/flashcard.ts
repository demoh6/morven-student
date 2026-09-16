import { Router, Request, Response } from "express";
import {
  createFlashcardSchema,
  updateFlashcardSchema,
  listMyFlashcards,
  createMyFlashcard,
  updateMyFlashcard,
  deleteMyFlashcard,
} from "../services/flashcard.service";
import { UserDataError } from "../services/userDataError";
import { authenticate } from "../middleware/auth";

const router = Router();

function handleUserDataError(err: unknown, res: Response): void {
  if (err instanceof UserDataError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error("Flashcards error:", err);
  res.status(500).json({ error: "حدث خطأ في الخادم" });
}

// GET /api/flashcards — list the current user's flashcards
// Optional ?type=general|medical keeps the two Phase-1 buckets separate.
router.get(
  "/api/flashcards",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      const rawType =
        typeof req.query.type === "string" ? req.query.type.toLowerCase() : undefined;
      const type =
        rawType === "general" || rawType === "medical" ? rawType : undefined;
      if (rawType !== undefined && !type) {
        res.status(400).json({ error: "نوع البطاقة غير صالح" });
        return;
      }
      const flashcards = await listMyFlashcards(req.user.sub, type);
      res.json({ flashcards });
    } catch (err) {
      handleUserDataError(err, res);
    }
  }
);

// POST /api/flashcards — create a flashcard owned by the current user
router.post(
  "/api/flashcards",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }

      const parsed = createFlashcardSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
        return;
      }

      const flashcard = await createMyFlashcard(req.user.sub, parsed.data);
      res.status(201).json({ flashcard });
    } catch (err) {
      handleUserDataError(err, res);
    }
  }
);

// PATCH /api/flashcards/:id — update one of the current user's flashcards
router.patch(
  "/api/flashcards/:id",
  authenticate,
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }

      const parsed = updateFlashcardSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
        return;
      }
      if (Object.keys(parsed.data).length === 0) {
        res.status(400).json({ error: "لم يتم تقديم أي بيانات للتحديث" });
        return;
      }

      const flashcard = await updateMyFlashcard(req.user.sub, req.params.id, parsed.data);
      res.json({ flashcard });
    } catch (err) {
      handleUserDataError(err, res);
    }
  }
);

// DELETE /api/flashcards/:id — delete one of the current user's flashcards
router.delete(
  "/api/flashcards/:id",
  authenticate,
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      await deleteMyFlashcard(req.user.sub, req.params.id);
      res.json({ message: "تم حذف البطاقة بنجاح" });
    } catch (err) {
      handleUserDataError(err, res);
    }
  }
);

export default router;