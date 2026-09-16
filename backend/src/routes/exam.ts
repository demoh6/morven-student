import { Router, Request, Response } from "express";
import {
  createExamSchema,
  updateExamSchema,
  listMyExams,
  createMyExam,
  updateMyExam,
  deleteMyExam,
} from "../services/exam.service";
import { UserDataError } from "../services/userDataError";
import { authenticate } from "../middleware/auth";

const router = Router();

function handleUserDataError(err: unknown, res: Response): void {
  if (err instanceof UserDataError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error("Exams error:", err);
  res.status(500).json({ error: "حدث خطأ في الخادم" });
}

// GET /api/exams — list the current user's exams
router.get("/api/exams", authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }
    const exams = await listMyExams(req.user.sub);
    res.json({ exams });
  } catch (err) {
    handleUserDataError(err, res);
  }
});

// POST /api/exams — create an exam owned by the current user
router.post("/api/exams", authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }

    const parsed = createExamSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
      return;
    }

    const exam = await createMyExam(req.user.sub, parsed.data);
    res.status(201).json({ exam });
  } catch (err) {
    handleUserDataError(err, res);
  }
});

// PATCH /api/exams/:id — update one of the current user's exams
router.patch(
  "/api/exams/:id",
  authenticate,
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }

      const parsed = updateExamSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
        return;
      }
      if (Object.keys(parsed.data).length === 0) {
        res.status(400).json({ error: "لم يتم تقديم أي بيانات للتحديث" });
        return;
      }

      const exam = await updateMyExam(req.user.sub, req.params.id, parsed.data);
      res.json({ exam });
    } catch (err) {
      handleUserDataError(err, res);
    }
  }
);

// DELETE /api/exams/:id — delete one of the current user's exams
router.delete(
  "/api/exams/:id",
  authenticate,
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      await deleteMyExam(req.user.sub, req.params.id);
      res.json({ message: "تم حذف الامتحان بنجاح" });
    } catch (err) {
      handleUserDataError(err, res);
    }
  }
);

export default router;